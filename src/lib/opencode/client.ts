import type {
  Message,
  ModelInfo,
  ModelsResponse,
  PermissionsResponse,
  ServerStatus,
  Session,
} from "./types";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const record = (data ?? {}) as Record<string, unknown>;
    const message =
      typeof record.error === "string"
        ? record.error
        : `فشل الطلب (${response.status})`;
    throw new ApiError(message, response.status, typeof record.code === "string" ? record.code : undefined);
  }

  return data as T;
}

export interface SendMessageBody {
  text: string;
  model?: { providerID: string; modelID: string };
}

export const opencodeApi = {
  status: () => request<ServerStatus>("/api/opencode/status"),

  restart: () =>
    request<{ ok: boolean; status: ServerStatus; message?: string; detail?: string }>(
      "/api/opencode/restart",
      { method: "POST" },
    ),

  sessions: () => request<{ sessions: Session[] }>("/api/opencode/sessions"),

  createSession: (body: { title?: string; model?: { providerID: string; modelID: string } } = {}) =>
    request<{ session: Session }>("/api/opencode/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  session: (id: string) =>
    request<{ session: Session }>(`/api/opencode/sessions/${encodeURIComponent(id)}`),

  deleteSession: (id: string) =>
    request<{ ok: boolean }>(`/api/opencode/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  messages: (id: string) =>
    request<{ messages: Message[] }>(
      `/api/opencode/sessions/${encodeURIComponent(id)}/messages`,
    ),

  send: (id: string, body: SendMessageBody) =>
    request<{ ok: boolean }>(
      `/api/opencode/sessions/${encodeURIComponent(id)}/messages`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  abort: (id: string) =>
    request<{ ok: boolean }>(
      `/api/opencode/sessions/${encodeURIComponent(id)}/abort`,
      { method: "POST" },
    ),

  models: (refresh = false) =>
    request<ModelsResponse>(`/api/opencode/models${refresh ? "?refresh=1" : ""}`),

  permissions: () => request<PermissionsResponse>("/api/opencode/permissions"),

  replyPermission: (id: string, reply: "once" | "always" | "reject") =>
    request<{ ok: boolean }>(`/api/opencode/permissions/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({ reply }),
    }),

  replyQuestion: (id: string, answers: string[][]) =>
    request<{ ok: boolean }>(`/api/opencode/questions/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),
};

export type { Message, ModelInfo, ModelsResponse, PermissionsResponse, ServerStatus, Session };
