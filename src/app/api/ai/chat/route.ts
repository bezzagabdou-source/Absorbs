import { after } from "next/server";
import { json, safeDetail } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { takeCredit, refundCredit, FREE_DAILY } from "@/lib/usage";
import {
  streamGemini,
  ensembleStream,
  isBuildRequest,
  isHardRequest,
  streamToResponse,
  withAutoContinue,
  GeminiError,
  type Attachment,
  type ChatTurn,
} from "@/lib/gemini";
import { classifyTask } from "@/lib/task-router";
import { MAX_ENGINE_CONFIG } from "@/lib/max-engine";
import { VOICE_SYSTEM, personaById } from "@/lib/voice-call";
import {
  CHAT_SYSTEM,
  CHAT_SYSTEM_PRO,
  CHAT_SYSTEM_V6,
  CHAT_SYSTEM_V8,
  HARD_SYSTEM_V8,
  V8_PERSONAS,
  BUILD_SYSTEM_PRO,
  QUALITY_CONTRACT,
} from "@/lib/prompts";
import { db } from "@/db";
import { aiMemories, conversations, messages } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { getProfile } from "@/lib/usage";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_MSGS = 24;
const MAX_LEN = 6000;
/** Pro: room for pasted code / text files and a longer memory of the chat. */
const MAX_MSGS_PRO = 60;
const MAX_LEN_PRO = 60000;
/** the most recent code answer is kept (almost) whole so edits start from the real latest version */
const MAX_LEN_LATEST_CODE = 170000;
const MAX_LEN_PRO_HISTORY = 10000;
/** total characters of conversation memory sent to the model (Pro) */
const HISTORY_BUDGET = 260_000;
/** assistant turns are stored whole in the browser: allow big builds to come back */
const MAX_LEN_MODEL_IN = 160_000;

/** Keeps the newest turns that fit the budget; the latest code answer stays complete. */
function fitHistory(turns: ChatTurn[]): ChatTurn[] {
  let budget = HISTORY_BUDGET;
  let latestCodeKept = false;
  const out: ChatTurn[] = [];
  for (let i = turns.length - 1; i >= 0 && out.length < MAX_MSGS_PRO; i--) {
    const t = turns[i];
    const isLast = i === turns.length - 1;
    const hasCode = t.role === "model" && t.text.includes("```");
    let cap = isLast ? MAX_LEN_PRO : MAX_LEN_PRO_HISTORY;
    if (hasCode && !latestCodeKept) {
      cap = MAX_LEN_LATEST_CODE;
      latestCodeKept = true;
    }
    const text = t.text.length > cap ? t.text.slice(0, cap) : t.text;
    if (out.length > 0 && budget - text.length < 0) break;
    budget -= text.length;
    out.unshift({ ...t, text });
  }
  while (out.length > 0 && out[0].role === "model") out.shift();
  return out;
}

/** "Remember that …" / "تذكر أن …" → saved to long-term memory. */
const REMEMBER_RE = /(?:^|[\s.!؟?،,])(?:تذكّر|تذكر|خليك تتذكر|remember(?: that)?|souviens[- ]toi)(?:\s+|:)(.{6,300})/i;

async function loadMemoryBlock(uid: string): Promise<string> {
  try {
    const rows = await db
      .select({ content: aiMemories.content })
      .from(aiMemories)
      .where(eq(aiMemories.userId, uid))
      .orderBy(desc(aiMemories.createdAt))
      .limit(40);
    if (rows.length === 0) return "";
    return (
      "\n\nUSER LONG-TERM MEMORY (facts the user wants you to keep in mind in every chat — use them silently, never recite the list):\n" +
      rows.map((r) => `- ${r.content}`).join("\n")
    );
  } catch {
    return "";
  }
}

async function rememberFrom(uid: string, text: string): Promise<void> {
  const m = REMEMBER_RE.exec(text);
  if (!m) return;
  const fact = m[1].replace(/\s+/g, " ").trim().slice(0, 300);
  if (fact.length < 6) return;
  try {
    const n = await db.select({ n: sql<number>`count(*)::int` }).from(aiMemories).where(eq(aiMemories.userId, uid));
    if ((n[0]?.n ?? 0) >= 60) return;
    await db.insert(aiMemories).values({ userId: uid, content: fact, source: "auto" });
  } catch {
    /* memory is best-effort */
  }
}

const emptyStream = () =>
  new ReadableStream<string>({
    start(c) {
      c.close();
    },
  });

/** Pro attachments: images + PDF, validated here (never trust the client). */
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const MAX_FILES = 4;
const MAX_B64_TOTAL = 4_000_000; // ≈3 MB of binary — fits Vercel's 4.5 MB body limit
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

const MAX_TEXT_FILES = 4;
const MAX_TEXT_FILE = 150_000;
const MAX_TEXT_TOTAL = 320_000;
type TextFile = { name: string; text: string };

function parseTextFiles(raw: unknown): TextFile[] | "BAD" {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_TEXT_FILES) return "BAD";
  const out: TextFile[] = [];
  let total = 0;
  for (const f of raw as { name?: unknown; text?: unknown }[]) {
    if (!f || typeof f.text !== "string" || !f.text.trim()) return "BAD";
    const text = f.text.slice(0, MAX_TEXT_FILE);
    total += text.length;
    if (total > MAX_TEXT_TOTAL) return "BAD";
    out.push({
      name:
        typeof f.name === "string" ? f.name.replace(/[\r\n`]/g, " ").slice(0, 60) : "file",
      text,
    });
  }
  return out;
}

type RawAttachment = { name?: unknown; mime?: unknown; data?: unknown };

function parseAttachments(
  raw: unknown
): { files: Attachment[]; names: string[] } | "BAD" {
  if (raw === undefined || raw === null) return { files: [], names: [] };
  if (!Array.isArray(raw) || raw.length > MAX_FILES) return "BAD";
  const files: Attachment[] = [];
  const names: string[] = [];
  let total = 0;
  for (const a of raw as RawAttachment[]) {
    if (!a || typeof a.mime !== "string" || typeof a.data !== "string") return "BAD";
    if (!ALLOWED_MIME.has(a.mime)) return "BAD";
    total += a.data.length;
    if (total > MAX_B64_TOTAL || !a.data || !B64_RE.test(a.data)) return "BAD";
    files.push({ mime: a.mime, data: a.data });
    names.push(
      typeof a.name === "string" ? a.name.replace(/[\r\n`]/g, " ").slice(0, 60) : "file"
    );
  }
  return { files, names };
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  let body: {
    conversationId?: string | null;
    messages?: { role?: string; content?: string }[];
    attachments?: unknown;
    textFiles?: unknown;
    deep?: boolean;
    v6?: boolean;
    /** Barq 8 Pro: genius brain + AI team on every hard task */
    v8?: boolean;
    /** Live voice call turn (Pro only): short spoken answers, fast engine */
    voice?: boolean;
    /** voice persona id (friend | coach | teacher | storyteller | interpreter | interviewer) */
    voicePersona?: string;
    /** MAX engine: giant games / websites (implies v8, Pro only) */
    max?: boolean;
    /** v8 persona key: genius | coder | writer | teacher | analyst */
    persona?: string;
    /** Pro: the answer stopped inside a code block — finish it (no credit used) */
    continueFrom?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }

  // the plan is only known after the credit is taken, so cap lengths afterwards
  const raw = Array.isArray(body.messages)
    ? body.messages.slice(-MAX_MSGS_PRO)
    : [];
  const turns: ChatTurn[] = [];
  for (const m of raw) {
    if (!m || typeof m.content !== "string" || !m.content.trim()) continue;
    turns.push({
      role: m.role === "assistant" || m.role === "model" ? "model" : "user",
      text: m.content.slice(0, m.role === "assistant" || m.role === "model" ? MAX_LEN_MODEL_IN : MAX_LEN_PRO),
    });
  }
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return json(400, { code: "BAD_MESSAGES" });
  }

  /* ---------- continuation of a cut-off answer: free of charge, Pro only ---------- */
  if (typeof body.continueFrom === "string" && body.continueFrom.length > 200) {
    if (!rateLimit(`aic:${user.uid}`, 12, 60_000).ok) return json(429, { code: "RATE" });
    let proNow = false;
    try {
      proNow = (await getProfile(user.uid))?.plan === "pro";
    } catch {
      proNow = false;
    }
    if (!proNow) return json(403, { code: "PRO_ONLY" });
    const seed = body.continueFrom.slice(0, 320_000);
    const convId = typeof body.conversationId === "string" ? body.conversationId : null;
    const system =
      (body.v8 === true || body.max === true ? CHAT_SYSTEM_V8 : body.v6 === true ? CHAT_SYSTEM_V6 : CHAT_SYSTEM_PRO) +
      QUALITY_CONTRACT.split("\n6.")[0] +
      (body.max === true ? MAX_ENGINE_CONFIG.systemPromptAddon : "");
    const lastTurn = turns[turns.length - 1];
    const stream = withAutoContinue(emptyStream(), {
      system,
      messages: [lastTurn],
      seed,
      rounds: 6,
      keepAlive: true,
      onDone: async (full) => {
        const tail = full.slice(seed.length);
        if (!convId || !tail.trim()) return;
        await db
          .execute(
            sql`update barq.messages set content = content || ${tail}
                where id = (
                  select m.id from barq.messages m
                  join barq.conversations c on c.id = m.conversation_id
                  where m.conversation_id = ${convId} and m.role = 'assistant' and c.user_id = ${user.uid}
                  order by m.created_at desc limit 1)`
          )
          .catch(() => undefined);
      },
    });
    return streamToResponse(stream, { "x-conversation-id": convId ?? "" });
  }

  const parsed = parseAttachments(body.attachments);
  if (parsed === "BAD") return json(400, { code: "BAD_ATTACHMENT" });
  const textFiles = parseTextFiles(body.textFiles);
  if (textFiles === "BAD") return json(400, { code: "BAD_ATTACHMENT" });

  const rl = rateLimit(`ai:${user.uid}`, 30, 60_000);
  if (!rl.ok) {
    return json(
      429,
      { code: "RATE" },
      { "Retry-After": String(rl.retryAfter) }
    );
  }

  const taken = await takeCredit(user);
  if (taken && !taken.ok) return json(429, { code: "QUOTA" });
  const credit = taken ?? {
    ok: true as const,
    remaining: FREE_DAILY,
    plan: "free" as const,
    tracked: false,
  };

  const isPro = credit.plan === "pro";

  // attachments and deep mode are Pro features — the server is the real gate
  if (
    !isPro &&
    (parsed.files.length > 0 || textFiles.length > 0 || body.deep === true || body.voice === true)
  ) {
    if (credit.tracked) await refundCredit(user.uid);
    return json(403, { code: "PRO_ONLY" });
  }
  // free accounts keep the original 15 requests / minute
  if (!isPro && !rateLimit(`aif:${user.uid}`, 15, 60_000).ok) {
    if (credit.tracked) await refundCredit(user.uid);
    return json(429, { code: "RATE" }, { "Retry-After": "30" });
  }

  // apply the plan's limits (free: the original 24 messages × 6000 chars)
  const capped = isPro
    ? fitHistory(turns)
    : turns.slice(-MAX_MSGS).map((t) => ({ ...t, text: t.text.slice(0, MAX_LEN) }));
  if (capped.length === 0 || capped[capped.length - 1].role !== "user") {
    if (credit.tracked) await refundCredit(user.uid);
    return json(400, { code: "BAD_MESSAGES" });
  }

  const lastUser = capped[capped.length - 1].text;
  const memBlock = isPro && credit.tracked ? await loadMemoryBlock(user.uid) : "";
  if (isPro && credit.tracked) void rememberFrom(user.uid, lastUser);
  const fileNames = [...parsed.names, ...textFiles.map((f) => f.name)];
  const savedUser =
    fileNames.length > 0 ? `${lastUser}\n\n📎 ${fileNames.join(" · ")}` : lastUser;
  // text / code files travel inside the prompt (not in the saved history)
  if (textFiles.length > 0) {
    capped[capped.length - 1] = {
      ...capped[capped.length - 1],
      text:
        lastUser +
        textFiles
          .map((f) => `\n\n---\nAttached file: ${f.name}\n\`\`\`\`\n${f.text}\n\`\`\`\``)
          .join(""),
    };
  }

  // History is best-effort and runs in PARALLEL with opening the AI stream,
  // so the first words arrive a few database round-trips sooner.
  const persistP: Promise<string | null> = (async () => {
    try {
      let convId: string | null = body.conversationId ?? null;
      if (convId) {
        const owned = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.id, convId),
              eq(conversations.userId, user.uid)
            )
          )
          .limit(1);
        if (!owned[0]) convId = null;
      }
      if (!convId) {
        const title = lastUser.replace(/\s+/g, " ").trim().slice(0, 60);
        const created = await db
          .insert(conversations)
          .values({ userId: user.uid, title })
          .returning({ id: conversations.id });
        convId = created[0]?.id ?? null;
      }
      if (convId) {
        await db.insert(messages).values({
          conversationId: convId,
          role: "user",
          content: savedUser,
        });
      }
      return convId;
    } catch {
      return null; // the AI answer still streams
    }
  })();

  let usedModel = "";

  // The host may freeze the function once the browser disconnects: `after()` keeps
  // it alive until the answer is generated AND saved, so leaving the page never cuts it.
  let release: () => void = () => undefined;
  const finished = new Promise<void>((r) => {
    release = r;
  });
  if (isPro) {
    const guard = setTimeout(() => release(), 290_000);
    void finished.then(() => clearTimeout(guard));
    try {
      after(() => finished);
    } catch {
      /* not available outside a request scope */
    }
  }

  const saveAnswer = async (full: string) => {
    try {
      const text = full.trim();
      const id = await persistP;
      if (!text || !id) return;
      await db
        .insert(messages)
        .values({ conversationId: id, role: "assistant", content: text })
        .catch(() => undefined);
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, id))
        .catch(() => undefined);
    } finally {
      release();
    }
  };

  const max = isPro && body.max === true;
  const maxAddon = max ? MAX_ENGINE_CONFIG.systemPromptAddon : "";
  const v8 = isPro && (body.v8 === true || max);
  const persona = v8 && typeof body.persona === "string" ? (V8_PERSONAS[body.persona] ?? "") : "";
  const hasFiles = parsed.files.length > 0 || textFiles.length > 0;
  try {
    // Pro + "build me a game / site / app": the whole AI team works together
    const task = classifyTask(lastUser, parsed.files.length > 0);
    const voice = isPro && body.voice === true;
    const build = !voice && isPro && isBuildRequest(lastUser);
    // v8: EVERY hard request (code edit, debugging, architecture, long docs…) gets the AI team
    // MAX: every non-build message also gets the full team treatment
    const hard = !voice && v8 && !build && (max || isHardRequest(lastUser, hasFiles));
    const onFail = async () => {
      if (credit.tracked) await refundCredit(user.uid);
      release();
    };
    const stream = voice
      ? await streamGemini({
          system: VOICE_SYSTEM + personaById(body.voicePersona).system + memBlock,
          messages: capped,
          tier: "pro",
          // fastest strong engine first: the first sentence must start fast
          task: "quick",
          primaryFirst: true,
          mode: "speed",
          lowThink: true,
          temperature: 0.8,
          maxTokens: 1800,
          onModel: (m) => {
            usedModel = m;
          },
          onDone: saveAnswer,
        })
      : build
      ? ensembleStream({
          system:
            (v8 ? BUILD_SYSTEM_PRO.replace(CHAT_SYSTEM_PRO, CHAT_SYSTEM_V8) : BUILD_SYSTEM_PRO) +
            QUALITY_CONTRACT.split("\n6.")[0] +
            maxAddon +
            persona +
            memBlock,
          kind: "build",
          task: "code",
          epic: true,
          maxTokens: 64000,
          messages: capped,
          attachments: parsed.files,
          temperature: 0.7,
          keepAlive: true,
          onModel: (m) => {
            usedModel = m;
          },
          onDone: saveAnswer,
          onFail,
        })
      : hard
        ? ensembleStream({
            system: HARD_SYSTEM_V8 + QUALITY_CONTRACT + maxAddon + persona + memBlock,
            kind: "hard",
            task,
            maxTokens: max ? 64000 : 32000,
            messages: capped,
            attachments: parsed.files,
            temperature: 0.6,
            keepAlive: true,
            onModel: (m) => {
              usedModel = m;
            },
            onDone: saveAnswer,
            onFail,
          })
      : await (async () => {
          const system = isPro
            ? (v8 ? CHAT_SYSTEM_V8 : body.v6 === true ? CHAT_SYSTEM_V6 : CHAT_SYSTEM_PRO) +
              QUALITY_CONTRACT +
              persona +
              memBlock
            : CHAT_SYSTEM;
          const base = await streamGemini({
            system,
            messages: capped,
            tier: isPro ? "pro" : "free",
            task,
            // Pro: the strongest engine (Claude by default) leads; free stays on Gemini's free tier
            primaryFirst: isPro,
            mode: isPro && body.deep === true ? "quality" : "speed",
            maxTokens: isPro ? (v8 ? 24000 : body.v6 === true ? 32000 : 20000) : undefined,
            lowThink: v8 && body.deep !== true,
            attachments: parsed.files,
            onModel: (m) => {
              usedModel = m;
            },
            // Pro answers go through the never-stop guard, which saves the final text itself
            onDone: isPro ? undefined : saveAnswer,
          });
          return isPro
            ? withAutoContinue(base, { system, messages: capped, rounds: 14, keepAlive: true, onDone: saveAnswer })
            : base;
        })();
    const fixedConvId = await persistP;

    return streamToResponse(stream, {
      "x-conversation-id": fixedConvId ?? "",
      "x-credits-remaining": String(credit.remaining),
      "x-plan": credit.plan,
      ...(isPro ? { "x-model": usedModel, "x-engine": build || hard ? "team" : voice ? "voice" : "fast", "x-task": task } : {}),
    });
  } catch (e) {
    release();
    if (credit.tracked) await refundCredit(user.uid);
    console.error("[chat] gemini failed:", e);
    if (e instanceof GeminiError) {
      return json(e.code === "NO_KEY" ? 503 : e.code === "BUSY" ? 503 : 500, {
        code: e.code,
        detail: safeDetail(e.detail),
      });
    }
    return json(500, { code: "ERROR", detail: safeDetail(e) });
  }
}
