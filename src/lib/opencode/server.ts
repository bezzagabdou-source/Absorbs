import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type {
  Message,
  ModelInfo,
  ModelsResponse,
  PermissionRequest,
  QuestionRequest,
  ServerStatus,
  Session,
} from "./types";

const DEFAULT_PORT = 4000;

export interface OpenCodeConfig {
  baseUrl: string;
  username: string;
  password: string | null;
  hasAuth: boolean;
  authSource: "env" | "file" | "none";
}

/**
 * Resolves the OpenCode server base URL + basic-auth credentials.
 *
 * The password can come from:
 *   1. OPENCODE_SERVER_PASSWORD (Codespaces secret / .env)
 *   2. .opencode/server-auth.json (written by scripts/opencode/start-opencode.sh)
 *
 * The dashboard is a server-side proxy, so the password never reaches the
 * browser. Only the fact that auth is configured is exposed.
 */
export function getOpenCodeConfig(): OpenCodeConfig {
  const port = process.env.OPENCODE_PORT?.trim() || String(DEFAULT_PORT);
  const rawUrl = process.env.OPENCODE_SERVER_URL?.trim() || `http://127.0.0.1:${port}`;
  const baseUrl = rawUrl.replace(/\/+$/, "");
  const username = process.env.OPENCODE_SERVER_USERNAME?.trim() || "opencode";
  const envPassword = process.env.OPENCODE_SERVER_PASSWORD?.trim();

  if (envPassword) {
    return { baseUrl, username, password: envPassword, hasAuth: true, authSource: "env" };
  }

  const authFile = path.join(process.cwd(), ".opencode", "server-auth.json");
  try {
    if (existsSync(authFile)) {
      const parsed = JSON.parse(readFileSync(authFile, "utf8")) as {
        username?: string;
        password?: string;
      };
      if (parsed.password) {
        return {
          baseUrl,
          username: parsed.username || username,
          password: parsed.password,
          hasAuth: true,
          authSource: "file",
        };
      }
    }
  } catch {
    /* corrupted auth file — fall through to unauthenticated */
  }

  return { baseUrl, username, password: null, hasAuth: false, authSource: "none" };
}

export function authHeaders(config: OpenCodeConfig = getOpenCodeConfig()): Record<string, string> {
  if (!config.password) return {};
  const token = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

export type OpenCodeErrorCode =
  | "OK"
  | "UNAUTHORIZED"
  | "UNREACHABLE"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "BAD_RESPONSE";

export interface OpenCodeResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  code: OpenCodeErrorCode;
}

function extractError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const direct = record.error;
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object") {
    const message = (direct as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  if (typeof record.message === "string") return record.message;
  if (typeof record.detail === "string") return record.detail;
  return null;
}

/** Raw fetch against the OpenCode server with auth + timeout, never throws. */
export async function ocFetch<T>(
  pathname: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
): Promise<OpenCodeResult<T>> {
  const config = getOpenCodeConfig();
  const url = `${config.baseUrl}${pathname}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
    ...authHeaders(config),
  };

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let data: T | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const message =
        extractError(data) ||
        (response.status === 401
          ? "السيرفر محمي بكلمة مرور — تحقق من OPENCODE_SERVER_PASSWORD"
          : `فشل الطلب (${response.status})`);
      return {
        ok: false,
        status: response.status,
        data,
        error: message,
        code: response.status === 401 ? "UNAUTHORIZED" : "HTTP_ERROR",
      };
    }

    return { ok: true, status: response.status, data, error: null, code: "OK" };
  } catch (error) {
    const err = error as Error;
    const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
    return {
      ok: false,
      status: 0,
      data: null,
      error: timedOut
        ? "انتهت مهلة الاتصال بسيرفر OpenCode"
        : "تعذر الوصول إلى سيرفر OpenCode — هل يعمل السيرفر؟",
      code: timedOut ? "TIMEOUT" : "UNREACHABLE",
    };
  }
}

export class OpenCodeActionError extends Error {
  status: number;
  code: OpenCodeErrorCode;

  constructor(message: string, status: number, code: OpenCodeErrorCode) {
    super(message);
    this.name = "OpenCodeActionError";
    this.status = status;
    this.code = code;
  }
}

/** Like ocFetch but throws a typed error the API routes can translate. */
export async function ocAction<T>(
  pathname: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<T> {
  const result = await ocFetch<T>(pathname, init, timeoutMs);
  if (!result.ok) {
    throw new OpenCodeActionError(
      result.error || "فشل الطلب",
      result.status,
      result.code,
    );
  }
  return result.data as T;
}

/** Raw streaming fetch (used by the SSE proxy). Throws on connection failure. */
export async function ocStream(pathname: string, signal?: AbortSignal): Promise<Response> {
  const config = getOpenCodeConfig();
  const response = await fetch(`${config.baseUrl}${pathname}`, {
    headers: {
      Accept: "text/event-stream",
      ...authHeaders(config),
    },
    cache: "no-store",
    signal,
  });
  if (!response.ok || !response.body) {
    throw new OpenCodeActionError(
      response.status === 401
        ? "السيرفر محمي بكلمة مرور — تحقق من OPENCODE_SERVER_PASSWORD"
        : `تعذر فتح قناة الأحداث (${response.status})`,
      response.status,
      response.status === 401 ? "UNAUTHORIZED" : "HTTP_ERROR",
    );
  }
  return response;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export async function getServerStatus(): Promise<ServerStatus> {
  const config = getOpenCodeConfig();
  const [health, pathInfo, project, sessions] = await Promise.all([
    ocFetch<{ healthy?: boolean; version?: string }>("/global/health", {}, 5_000),
    ocFetch<{ directory?: string; worktree?: string }>("/path", {}, 5_000),
    ocFetch<{ worktree?: string; vcs?: string }>("/project/current", {}, 5_000),
    ocFetch<Session[]>("/session", {}, 8_000),
  ]);

  const base: ServerStatus = {
    connected: false,
    version: null,
    project: null,
    worktree: null,
    vcs: null,
    sessions: 0,
    authRequired: false,
    hasAuth: config.hasAuth,
    baseUrl: config.baseUrl,
    checkedAt: new Date().toISOString(),
  };

  if (health.code === "UNAUTHORIZED") {
    return {
      ...base,
      authRequired: true,
      error: "السيرفر يعمل لكنه محمي بكلمة مرور لا يملكها proxy الواجهة. شغّل سكربت التشغيل.",
    };
  }

  if (!health.ok) {
    return {
      ...base,
      error:
        health.code === "UNREACHABLE"
          ? "السيرفر غير متصل. شغّل: bash scripts/opencode/start-opencode.sh"
          : health.error || "تعذر فحص حالة السيرفر",
    };
  }

  return {
    ...base,
    connected: health.data?.healthy === true,
    version: health.data?.version ?? null,
    project: pathInfo.data?.directory ?? project.data?.worktree ?? null,
    worktree: pathInfo.data?.worktree ?? project.data?.worktree ?? null,
    vcs: project.data?.vcs ?? null,
    sessions: Array.isArray(sessions.data) ? sessions.data.length : 0,
    error: health.data?.healthy === true ? undefined : "السيرفر لا يستجيب بالشكل المتوقع",
  };
}

// ---------------------------------------------------------------------------
// Sessions + messages
// ---------------------------------------------------------------------------

export function assertSessionId(sessionID: string): string {
  if (!/^ses[A-Za-z0-9_-]+$/.test(sessionID)) {
    throw new OpenCodeActionError("معرّف الجلسة غير صالح", 400, "HTTP_ERROR");
  }
  return sessionID;
}

export async function listSessions(): Promise<Session[]> {
  const data = await ocAction<Session[]>("/session", {}, 10_000);
  return Array.isArray(data) ? data : [];
}

export interface CreateSessionInput {
  title?: string;
  model?: { providerID: string; modelID: string };
}

export async function createSession(input: CreateSessionInput = {}): Promise<Session> {
  const body: Record<string, unknown> = {};
  if (input.title) body.title = input.title;
  if (input.model) {
    // session.create expects { providerID, id } (not modelID)
    body.model = { providerID: input.model.providerID, id: input.model.modelID };
  }
  return ocAction<Session>("/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getSession(sessionID: string): Promise<Session> {
  return ocAction<Session>(`/session/${encodeURIComponent(assertSessionId(sessionID))}`, {}, 10_000);
}

export async function deleteSession(sessionID: string): Promise<void> {
  await ocAction<boolean>(
    `/session/${encodeURIComponent(assertSessionId(sessionID))}`,
    { method: "DELETE" },
    10_000,
  );
}

export async function getMessages(sessionID: string): Promise<Message[]> {
  const data = await ocAction<Message[]>(
    `/session/${encodeURIComponent(assertSessionId(sessionID))}/message`,
    {},
    20_000,
  );
  return Array.isArray(data) ? data : [];
}

export interface SendPromptInput {
  text: string;
  model?: { providerID: string; modelID: string };
}

/**
 * Enqueues a prompt without waiting for the model. The dashboard then consumes
 * the live /event SSE stream (message.part.updated) to render the reply.
 */
export async function sendPrompt(sessionID: string, input: SendPromptInput): Promise<void> {
  const body: Record<string, unknown> = {
    parts: [{ type: "text", text: input.text }],
  };
  if (input.model) body.model = input.model;
  await ocAction<null>(
    `/session/${encodeURIComponent(assertSessionId(sessionID))}/prompt_async`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
    20_000,
  );
}

export async function abortSession(sessionID: string): Promise<void> {
  await ocAction<boolean>(
    `/session/${encodeURIComponent(assertSessionId(sessionID))}/abort`,
    { method: "POST" },
    10_000,
  );
}

// ---------------------------------------------------------------------------
// Permissions + questions
// ---------------------------------------------------------------------------

export async function listPermissions(): Promise<{
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
}> {
  const [permissions, questions] = await Promise.all([
    ocAction<PermissionRequest[]>("/permission", {}, 8_000).catch(() => []),
    ocAction<QuestionRequest[]>("/question", {}, 8_000).catch(() => []),
  ]);
  return {
    permissions: Array.isArray(permissions) ? permissions : [],
    questions: Array.isArray(questions) ? questions : [],
  };
}

export async function replyPermission(
  requestID: string,
  reply: "once" | "always" | "reject",
): Promise<void> {
  if (!/^per[A-Za-z0-9_-]+$/.test(requestID)) {
    throw new OpenCodeActionError("معرّف الإذن غير صالح", 400, "HTTP_ERROR");
  }
  await ocAction<boolean>(
    `/permission/${encodeURIComponent(requestID)}/reply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply }),
    },
    10_000,
  );
}

export async function replyQuestion(requestID: string, answers: string[][]): Promise<void> {
  if (!/^que[A-Za-z0-9_-]+$/.test(requestID)) {
    throw new OpenCodeActionError("معرّف السؤال غير صالح", 400, "HTTP_ERROR");
  }
  await ocAction<boolean>(
    `/question/${encodeURIComponent(requestID)}/reply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answers }),
    },
    10_000,
  );
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

interface ProviderModel {
  id: string;
  name?: string;
  cost?: { input?: number; output?: number };
  limit?: { context?: number; output?: number };
  capabilities?: {
    reasoning?: boolean;
    toolcall?: boolean;
    attachment?: boolean;
    output?: { text?: boolean };
  };
  status?: string;
}

interface ProviderInfo {
  id: string;
  name?: string;
  models?: Record<string, ProviderModel>;
}

interface ProviderResponse {
  all?: ProviderInfo[];
  connected?: string[];
  default?: Record<string, string>;
}

let modelsCache: { at: number; data: ModelsResponse } | null = null;

/**
 * The full /provider payload is huge (200+ providers). We only keep:
 *   - every text model from connected providers
 *   - free text models from any provider
 * That keeps the selector fast and useful without leaking thousands of rows.
 */
export async function getModels(force = false): Promise<ModelsResponse> {
  if (!force && modelsCache && Date.now() - modelsCache.at < 60_000) {
    return modelsCache.data;
  }

  const result = await ocFetch<ProviderResponse>("/provider", {}, 30_000);
  if (!result.ok || !result.data) {
    return {
      models: [],
      connected: [],
      total: 0,
      error: result.error || "تعذر تحميل النماذج",
    };
  }

  const data = result.data;
  const connected = Array.isArray(data.connected) ? data.connected : [];
  const connectedSet = new Set(connected);
  const defaults = data.default ?? {};
  const providers = Array.isArray(data.all) ? data.all : [];
  const models: ModelInfo[] = [];
  const seen = new Set<string>();
  const defaultModelIDs = new Set(Object.values(defaults));

  const push = (provider: ProviderInfo, model: ProviderModel) => {
    const key = `${provider.id}/${model.id}`;
    if (seen.has(key)) return;
    if (model.status && model.status !== "active") return;
    if (model.capabilities?.output?.text === false) return;
    seen.add(key);
    const cost = model.cost ?? {};
    const free = (cost.input ?? 0) === 0 && (cost.output ?? 0) === 0;
    models.push({
      providerID: provider.id,
      modelID: model.id,
      name: model.name || model.id,
      providerName: provider.name || provider.id,
      free,
      reasoning: model.capabilities?.reasoning,
      toolcall: model.capabilities?.toolcall,
      attachment: model.capabilities?.attachment,
      contextLimit: model.limit?.context,
      outputLimit: model.limit?.output,
      isDefault: defaultModelIDs.has(model.id),
    });
  };

  // 1) connected providers first
  for (const provider of providers) {
    if (!connectedSet.has(provider.id)) continue;
    for (const model of Object.values(provider.models ?? {})) push(provider, model);
  }

  // 2) free models from every other provider (capped)
  let freeCount = 0;
  for (const provider of providers) {
    if (connectedSet.has(provider.id)) continue;
    for (const model of Object.values(provider.models ?? {})) {
      const cost = model.cost ?? {};
      const free = (cost.input ?? 0) === 0 && (cost.output ?? 0) === 0;
      if (!free) continue;
      if (freeCount >= 200) break;
      const before = models.length;
      push(provider, model);
      if (models.length > before) freeCount += 1;
    }
  }

  const response: ModelsResponse = {
    models,
    connected,
    total: providers.length,
  };
  modelsCache = { at: Date.now(), data: response };
  return response;
}

/** Small helper used by API routes to produce consistent error bodies. */
export function actionErrorResponse(error: unknown): Response {
  if (error instanceof OpenCodeActionError) {
    const status =
      error.code === "UNAUTHORIZED"
        ? 401
        : error.code === "UNREACHABLE"
          ? 503
          : error.status >= 400 && error.status < 600
            ? error.status
            : 502;
    return Response.json(
      { ok: false, error: error.message, code: error.code },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
  const message = error instanceof Error ? error.message : "خطأ غير متوقع";
  return Response.json(
    { ok: false, error: message, code: "ERROR" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}
