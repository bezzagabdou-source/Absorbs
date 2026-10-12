/**
 * ═══════════════════════════════════════════════════════════════════════
 *  AUTONOMOUS AI AGENT ENGINE  ·  multi-step plan → tool → observe (SERVER)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  One autonomous loop that thinks with the unified router
 *  (@/lib/model-router) and acts through the function-calling tool
 *  registry (@/lib/tools AGENT_TOOL_SCHEMAS):
 *
 *      plan ─▶ tool call ─▶ observation ─▶ plan ─▶ … ─▶ final answer
 *
 *  Guarantees, by construction:
 *    • step budget (AGENT_MAX_STEPS) + wall-clock budget (AGENT_BUDGET_MS)
 *    • every tool is arg-sanitised and output-capped — a broken tool can
 *      never kill the loop; its error becomes the next observation
 *    • full structured TRACE (status / tool_start / tool_end / final) so
 *      the UI can render the agent "thinking out loud" in real time
 *    • abort-aware: the owner's AbortSignal is checked at every boundary
 */

import { completeUnified } from "@/lib/model-router";
import { agentFunctionSchemas } from "@/lib/tools";
import { AGENT_BUDGET_MS, AGENT_MAX_STEPS } from "@/lib/task-router";
import { webSearch, readPages, type SearchHit } from "@/lib/websearch";
import { rememberFact, semanticRecall } from "@/lib/memory";
import type { ChatTurn } from "@/lib/gemini";

/* ──────────────────────────── trace events ──────────────────────────── */

export type AgentEvent =
  | { type: "status"; stage: "plan" | "observe" | "final"; ar: string }
  | { type: "step"; n: number; of: number }
  | { type: "tool_start"; n: number; tool: string; args: Record<string, unknown> }
  | { type: "tool_end"; n: number; tool: string; ok: boolean; ms: number; preview: string }
  | { type: "model"; model: string }
  | { type: "final"; answer: string; steps: number; ms: number }
  | { type: "error"; message: string };

export type AgentEmit = (e: AgentEvent) => void;

export interface AgentContext {
  /** authenticated user id — enables memory tools; empty = memory disabled */
  userId: string;
  signal?: AbortSignal;
}

/* ──────────────────────── safe calculator ─────────────────────── */

/** Recursive-descent arithmetic evaluator — never uses eval/Function. */
function safeCalculate(expr: string): number {
  const s = expr.replace(/\s+/g, "").replace(/,/g, ".");
  let i = 0;
  const peek = () => s[i];
  const eat = (c?: string) => (c === undefined || s[i] === c ? s[i++] : "");
  function parseExpr(): number {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") v = s[i++] === "+" ? v + parseTerm() : v - parseTerm();
    return v;
  }
  function parseTerm(): number {
    let v = parsePow();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = s[i++];
      const r = parsePow();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }
  function parsePow(): number {
    const b = parseUnary();
    if (peek() === "^") {
      i++;
      return Math.pow(b, parsePow());
    }
    return b;
  }
  function parseUnary(): number {
    if (eat("-")) return -parseUnary();
    if (eat("+")) return parseUnary();
    return parseAtom();
  }
  function parseAtom(): number {
    if (eat("(")) {
      const v = parseExpr();
      eat(")");
      return v;
    }
    const fnRE = /^(sqrt|abs|sin|cos|tan|log|ln|exp|round|floor|ceil)/;
    const f = fnRE.exec(s.slice(i));
    if (f) {
      i += f[1].length;
      eat("(");
      const v = parseExpr();
      eat(")");
      switch (f[1]) {
        case "sqrt": return Math.sqrt(v);
        case "abs": return Math.abs(v);
        case "sin": return Math.sin(v);
        case "cos": return Math.cos(v);
        case "tan": return Math.tan(v);
        case "log": return Math.log10(v);
        case "ln": return Math.log(v);
        case "exp": return Math.exp(v);
        case "round": return Math.round(v);
        case "floor": return Math.floor(v);
        case "ceil": return Math.ceil(v);
      }
    }
    const numRE = /^\d*\.?\d+(e[+-]?\d+)?/i;
    const m = numRE.exec(s.slice(i));
    if (!m) throw new Error(`unexpected token at ${i}`);
    i += m[0].length;
    return parseFloat(m[0]);
  }
  const v = parseExpr();
  if (i < s.length) throw new Error("trailing characters");
  if (!Number.isFinite(v)) throw new Error("non-finite result");
  return Math.round(v * 1e10) / 1e10;
}

/* ──────────────────────────── tool executors ──────────────────────────── */

const OBS_CAP = 2_400;

type ToolExecutor = (ctx: AgentContext, args: Record<string, unknown>) => Promise<string>;

const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const AGENT_TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  async web_search(_ctx, args) {
    const query = str(args.query, 300);
    if (!query) return "missing query";
    const hits = await webSearch(query, 5);
    if (!hits.length) return "no results";
    return hits
      .map((h, i) => `${i + 1}. ${h.title}\n${h.url}\n${(h.snippet ?? "").slice(0, 300)}`)
      .join("\n\n");
  },

  async read_page(_ctx, args) {
    const url = str(args.url, 800);
    if (!/^https?:\/\//i.test(url)) return "invalid url";
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      return "invalid url";
    }
    const seed: SearchHit = { title: url, url, snippet: "", host, via: "agent" };
    const hits = await readPages([seed], 1, 7000);
    const text = hits[0]?.text?.trim() ?? "";
    return text ? text.slice(0, OBS_CAP) : "page unreadable or empty";
  },

  async memory_recall(ctx, args) {
    if (!ctx.userId) return "memory unavailable (no user)";
    const query = str(args.query, 300);
    if (!query) return "missing query";
    const topK = typeof args.topK === "number" ? Math.min(8, Math.max(1, args.topK)) : 5;
    const hits = await semanticRecall(ctx.userId, query, topK);
    if (!hits.length) return "nothing relevant in long-term memory";
    return hits.map((h) => `- ${h.text} (relevance ${(h.score * 100).toFixed(0)}%)`).join("\n");
  },

  async memory_save(ctx, args) {
    if (!ctx.userId) return "memory unavailable (no user)";
    const fact = str(args.fact, 200).replace(/^the user\s*/i, "");
    if (fact.length < 6) return "fact too short";
    const r = await rememberFact(ctx.userId, fact, "auto");
    return r.ok ? `saved (${r.backend})` : "not saved";
  },

  async calculate(_ctx, args) {
    const expr = str(args.expression, 200);
    if (!expr) return "missing expression";
    if (!/^[\d\s+\-*/%^().,a-z]*$/i.test(expr)) return "unsafe expression";
    return String(safeCalculate(expr));
  },

  async current_datetime(_ctx, args) {
    const tzRaw = str(args.timezone, 60) || "Africa/Algiers";
    let tz = "Africa/Algiers";
    try {
      new Intl.DateTimeFormat("en", { timeZone: tzRaw });
      tz = tzRaw;
    } catch {
      /* keep default */
    }
    const now = new Date();
    return `${now.toISOString()} · ${new Intl.DateTimeFormat("ar-DZ", {
      dateStyle: "full",
      timeStyle: "medium",
      timeZone: tz,
    }).format(now)}`;
  },
};

/* ─────────────────────────── action parsing ─────────────────────────── */

export interface AgentAction {
  action: "tool" | "final";
  tool?: string;
  args?: Record<string, unknown>;
  answer?: string;
}

/**
 * Extracts the model's next action: the FIRST complete JSON object found in
 * a fenced block or inline. Robust to chit-chat around the JSON.
 */
export function parseAgentAction(text: string): AgentAction | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf("{");
    if (start < 0) continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < c.length; i++) {
      const ch = c[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\" && inStr) {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = !inStr;
      else if (!inStr && ch === "{") depth++;
      else if (!inStr && ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            const j = JSON.parse(c.slice(start, i + 1)) as Record<string, unknown>;
            if (j.action === "final" && typeof j.answer === "string") return { action: "final", answer: j.answer };
            if (j.action === "tool" && typeof j.tool === "string") {
              return {
                action: "tool",
                tool: j.tool,
                args: j.args && typeof j.args === "object" ? (j.args as Record<string, unknown>) : {},
              };
            }
          } catch {
            /* partial json — keep scanning */
          }
          break;
        }
      }
    }
  }
  return null;
}

/* ─────────────────────────── the agent loop ─────────────────────────── */

const AGENT_SYSTEM = `You are NEXUS AGENT — an autonomous multi-step AI working for a real user.

You think in strict JSON actions, ONE per reply, nothing else:
  {"action":"tool","tool":"<name>","args":{…}}   ← to use a tool
  {"action":"final","answer":"<the complete final answer in the user's language>"}   ← when done

RULES
- Never invent tool results. When you need facts, call a tool and wait for its OBSERVATION.
- Be frugal: at most one web_search + one read_page for a simple question; research goals may use up to 3 searches.
- memory_recall / memory_save give you a durable, per-user long-term memory — use it for preferences, names, projects and goals. Save only DURABLE facts, never one-off requests.
- Chain sensibly: search → read the 1-2 most promising pages → synthesise.
- The final answer must directly serve the ORIGINAL goal, written naturally in the user's language and dialect, with sources cited as (1) (2) … when you used web tools.

AVAILABLE TOOLS
%TOOLS%`;

export interface RunAgentOptions {
  goal: string;
  history?: ChatTurn[];
  userId?: string;
  maxSteps?: number;
  budgetMs?: number;
  signal?: AbortSignal;
  emit: AgentEmit;
}

export interface AgentResult {
  ok: boolean;
  answer: string;
  steps: number;
  ms: number;
  tools: string[];
  model: string;
}

/** Runs the autonomous loop and streams its trace through `emit`. */
export async function runAgent(o: RunAgentOptions): Promise<AgentResult> {
  const started = Date.now();
  const maxSteps = Math.min(o.maxSteps ?? AGENT_MAX_STEPS, AGENT_MAX_STEPS);
  const deadline = started + Math.min(o.budgetMs ?? AGENT_BUDGET_MS, AGENT_BUDGET_MS);
  const ctx: AgentContext = { userId: o.userId ?? "", signal: o.signal };
  const scratchpad: string[] = [];
  const usedTools = new Set<string>();
  let lastModel = "";

  const toolDocs = agentFunctionSchemas()
    .map((s) => `- ${String((s as { name?: string }).name)}: ${String((s as { description?: string }).description).slice(0, 160)}`)
    .join("\n");

  o.emit({ type: "status", stage: "plan", ar: "الوكيل يخطّط الخطوات…" });

  for (let step = 1; step <= maxSteps; step++) {
    if (o.signal?.aborted) break;
    if (Date.now() > deadline) {
      scratchpad.push("SYSTEM: time budget exhausted — answer NOW with what you have.");
    }
    o.emit({ type: "step", n: step, of: maxSteps });

    const system =
      AGENT_SYSTEM.replace("%TOOLS%", toolDocs) +
      (scratchpad.length
        ? `\n\nSCRATCHPAD (everything you gathered so far):\n${scratchpad.join("\n\n")}`
        : "");

    const messages: ChatTurn[] = [
      ...(o.history ?? []).slice(-6),
      { role: "user", text: `GOAL: ${o.goal.slice(0, 4000)}\n\nYour next action (strict JSON only):` },
    ];

    let brain: { text: string; model: string };
    try {
      brain = await completeUnified({
        system,
        messages,
        userText: o.goal,
        maxTokens: 1_500,
        prefer: "auto",
        signal: o.signal,
      });
      if (brain.model) {
        lastModel = brain.model;
        o.emit({ type: "model", model: brain.model });
      }
    } catch (e) {
      if (o.signal?.aborted) break;
      scratchpad.push(`SYSTEM: planner engine error (${e instanceof Error ? e.message.slice(0, 120) : "unknown"}) — try answering from what you have.`);
      continue;
    }

    const action = parseAgentAction(brain.text) ?? fallbackAction(brain.text, scratchpad.length > 0);

    if (!action || action.action === "final") {
      const answer = (action?.answer ?? brain.text.replace(/```[\s\S]*?```/g, "").trim()) || "تعذّر إنجاز المهمة.";
      o.emit({ type: "final", answer, steps: step, ms: Date.now() - started });
      return { ok: true, answer, steps: step, ms: Date.now() - started, tools: [...usedTools], model: lastModel };
    }

    /* ─── tool step ─── */
    const toolName = action.tool ?? "";
    const exec = AGENT_TOOL_EXECUTORS[toolName];
    o.emit({ type: "tool_start", n: step, tool: toolName, args: sanitizeArgs(action.args ?? {}) });
    const t0 = Date.now();

    if (!exec) {
      scratchpad.push(`OBSERVATION (${toolName}): unknown tool — pick from the listed tools only.`);
      o.emit({ type: "tool_end", n: step, tool: toolName, ok: false, ms: 0, preview: "unknown tool" });
      continue;
    }

    try {
      const observation = (await withTimeout(exec(ctx, action.args ?? {}), 25_000)).slice(0, OBS_CAP);
      usedTools.add(toolName);
      scratchpad.push(`OBSERVATION (${toolName}):\n${observation}`);
      o.emit({
        type: "tool_end",
        n: step,
        tool: toolName,
        ok: true,
        ms: Date.now() - t0,
        preview: observation.replace(/\s+/g, " ").slice(0, 180),
      });
      o.emit({ type: "status", stage: "observe", ar: "الوكيل يقرأ النتيجة…" });
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 160) : "tool crashed";
      scratchpad.push(`OBSERVATION (${toolName}) FAILED: ${msg}`);
      o.emit({ type: "tool_end", n: step, tool: toolName, ok: false, ms: Date.now() - t0, preview: msg });
    }
  }

  /* out of budget/steps — synthesise the best answer from the scratchpad */
  const tail = scratchpad.slice(-6).join("\n\n");
  const answer = tail
    ? `توصّل الوكيل لأقصى خطواته المسموحة. خلاصة ما جمعه:\n\n${tail.slice(0, 3000)}`
    : "تعذّر على الوكيل إكمال المهمة في الوقت المتاح.";
  o.emit({ type: "final", answer, steps: maxSteps, ms: Date.now() - started });
  return { ok: false, answer, steps: maxSteps, ms: Date.now() - started, tools: [...usedTools], model: lastModel };
}

/** When the model forgets the JSON contract: prose ⟶ final, empty-with-tools ⟶ one more chance. */
function fallbackAction(text: string, hasScratch: boolean): AgentAction | null {
  const prose = text.replace(/```[\s\S]*?```/g, "").trim();
  if (prose.length > 40) return { action: "final", answer: prose };
  return hasScratch ? { action: "final", answer: prose } : null;
}

function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args).slice(0, 8)) {
    out[k.slice(0, 40)] = typeof v === "string" ? v.slice(0, 300) : typeof v === "number" || typeof v === "boolean" ? v : String(v).slice(0, 120);
  }
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("tool timeout")), ms))]);
}
