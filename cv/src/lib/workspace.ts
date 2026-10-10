/**
 * Workspace retrieval — SERVER SIDE ONLY.
 * Small corpora go to the model whole (it has a very long context); big ones are split into
 * overlapping chunks and ranked with BM25 so only the relevant parts are sent, each with a citation tag.
 */
import { lookup } from "dns/promises";
import net from "net";

export type WsDoc = { name: string; text: string };
export type WsChunk = { doc: number; part: number; text: string };

export const WHOLE_LIMIT = 140_000; // chars sent as-is
export const RETRIEVE_LIMIT = 100_000; // chars sent after retrieval

export function chunkText(text: string, size = 2000, overlap = 250): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(clean.length, i + size);
    if (end < clean.length) {
      const nl = clean.lastIndexOf("\n", end);
      if (nl > i + size * 0.6) end = nl;
    }
    out.push(clean.slice(i, end));
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return out;
}

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).filter((w) => w.length > 1);
}

export function rankChunks(question: string, chunks: WsChunk[], budget: number): WsChunk[] {
  const q = Array.from(new Set(tokens(question)));
  if (q.length === 0) return chunks.slice(0, Math.ceil(budget / 2000));
  const docsTokens = chunks.map((c) => tokens(c.text));
  const N = chunks.length;
  const avg = docsTokens.reduce((n, t) => n + t.length, 0) / Math.max(N, 1) || 1;
  const df = new Map<string, number>();
  for (const t of docsTokens) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  const k1 = 1.4;
  const b = 0.75;
  const scored = chunks.map((c, i) => {
    const t = docsTokens[i];
    const tf = new Map<string, number>();
    for (const w of t) tf.set(w, (tf.get(w) ?? 0) + 1);
    let s = 0;
    for (const w of q) {
      const f = tf.get(w);
      if (!f) continue;
      const n = df.get(w) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * t.length) / avg));
    }
    return { c, s, i };
  });
  scored.sort((x, y) => y.s - x.s || x.i - y.i);
  const picked: WsChunk[] = [];
  let used = 0;
  for (const { c, s } of scored) {
    if (s <= 0 && picked.length >= 3) break;
    if (used + c.text.length > budget) continue;
    picked.push(c);
    used += c.text.length;
  }
  // present in reading order
  return picked.sort((x, y) => x.doc - y.doc || x.part - y.part);
}

/** Builds the text context with [D1·3] tags. */
export function buildContext(docs: WsDoc[], question: string): { context: string; mode: "whole" | "retrieved"; sources: string[] } {
  const total = docs.reduce((n, d) => n + d.text.length, 0);
  const all: WsChunk[] = [];
  docs.forEach((d, di) => chunkText(d.text).forEach((t, pi) => all.push({ doc: di, part: pi + 1, text: t })));
  const mode = total <= WHOLE_LIMIT ? "whole" : "retrieved";
  const use = mode === "whole" ? all : rankChunks(question, all, RETRIEVE_LIMIT);
  const context = use.map((c) => `[D${c.doc + 1}·${c.part}] (${docs[c.doc].name})\n${c.text}`).join("\n\n---\n\n");
  return { context, mode, sources: docs.map((d, i) => `D${i + 1} = ${d.name}`) };
}

/* ---------- web references (SSRF-safe) ---------- */

function privateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return privateIp(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

async function assertPublic(u: URL): Promise<void> {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
  if (u.username || u.password) throw new Error("credentials");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("private");
  if (net.isIP(host)) {
    if (privateIp(host)) throw new Error("private");
    return;
  }
  const addrs = await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => privateIp(a.address))) throw new Error("private");
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export async function fetchReference(raw: string): Promise<WsDoc> {
  let url = new URL(raw);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(9_000),
      headers: { "User-Agent": "NexusAI-Reader/1.0", Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.1" },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("redirect");
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`status ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/|json|xml/i.test(type)) throw new Error("type");
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    while (size < 1_500_000) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      parts.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => undefined);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(parts));
    const body = /html/i.test(type) ? htmlToText(text) : text;
    return { name: url.hostname + url.pathname.slice(0, 40), text: body.slice(0, 300_000) };
  }
  throw new Error("redirects");
}

export const WORKSPACE_SYSTEM = `You are the analysis engine of a file workspace. The user's material is split into tagged parts like [D2·5] (document 2, part 5). 
RULES
- Answer ONLY from the supplied material plus attached images/PDFs; when something is not there, say so plainly instead of guessing.
- Cite the parts you rely on at the end of the sentence, e.g. [D1·3]. Never invent a tag.
- For code: explain structure, flag real bugs with file and line when visible, and give corrected code in full fenced blocks.
- For long material: start with a 3-6 line structured summary when the user asks for a summary, then the details they asked for.
- Reply in the user's language. Be direct; no filler.`;
