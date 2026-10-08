/**
 * Nexus AI v13 — LIVE WEB.
 *
 * The one capability every serious assistant has and this project did not: the model
 * can actually read the internet, and every claim comes back with a numbered source.
 *
 * Provider chain, first one that works wins:
 *   1. Tavily     (TAVILY_API_KEY)    — best quality, returns page text already
 *   2. Brave      (BRAVE_API_KEY)
 *   3. Serper     (SERPER_API_KEY)
 *   4. DuckDuckGo (no key at all)     — always available, so the feature never dies
 *   5. Wikipedia  (no key)            — last-resort factual net
 *
 * SERVER ONLY.
 */

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  /** full page text, filled in by readPages() */
  text?: string;
  /** display host, e.g. "fr.wikipedia.org" */
  host: string;
  /** provider that produced this hit */
  via: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const env = (k: string): string => (process.env[k] ?? "").trim();

function host(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function dedupe(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of hits) {
    if (!h.url || !/^https?:\/\//i.test(h.url)) continue;
    const key = h.url.replace(/[#?].*$/, "").replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

async function timed<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let to: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<null>((r) => {
        to = setTimeout(() => r(null), ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (to) clearTimeout(to);
  }
}

/* ------------------------------------------------------------------ *
 * providers
 * ------------------------------------------------------------------ */

async function tavily(q: string, n: number): Promise<SearchHit[]> {
  const key = env("TAVILY_API_KEY");
  if (!key) return [];
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query: q,
      max_results: n,
      search_depth: "advanced",
      include_raw_content: true,
    }),
  });
  if (!res.ok) return [];
  const j = (await res.json()) as { results?: { title?: string; url?: string; content?: string; raw_content?: string }[] };
  return (j.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: (r.content ?? "").slice(0, 400),
    text: (r.raw_content ?? r.content ?? "").slice(0, 12_000),
    host: host(r.url ?? ""),
    via: "tavily",
  }));
}

async function brave(q: string, n: number): Promise<SearchHit[]> {
  const key = env("BRAVE_API_KEY");
  if (!key) return [];
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${n}`,
    { headers: { Accept: "application/json", "X-Subscription-Token": key } }
  );
  if (!res.ok) return [];
  const j = (await res.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
  return (j.web?.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: (r.description ?? "").replace(/<[^>]+>/g, "").slice(0, 400),
    host: host(r.url ?? ""),
    via: "brave",
  }));
}

async function serper(q: string, n: number): Promise<SearchHit[]> {
  const key = env("SERPER_API_KEY");
  if (!key) return [];
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q, num: n }),
  });
  if (!res.ok) return [];
  const j = (await res.json()) as { organic?: { title?: string; link?: string; snippet?: string }[] };
  return (j.organic ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.link ?? "",
    snippet: (r.snippet ?? "").slice(0, 400),
    host: host(r.link ?? ""),
    via: "serper",
  }));
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&nbsp;": " ",
};
function unent(s: string): string {
  return s
    .replace(/&[a-z#0-9x]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------- keyless tier ----------
 * Measured from a datacenter IP, 2026-10:
 *   DuckDuckGo HTML   -> HTTP 202 challenge, 0 results   (kept only as a long shot)
 *   Mojeek / Ecosia   -> 403
 *   Qwant / SearXNG   -> 403 or JSON disabled
 *   Bing RSS          -> 10 relevant results for Latin queries, GARBAGE for Arabic
 *   Google News RSS   -> 100 fresh, relevant results INCLUDING Arabic
 * So the keyless tier runs Google News and Bing together and merges them, with the
 * order decided by the script of the query.
 */

function rssItems(xml: string): { title: string; link: string; desc: string; src: string }[] {
  const out: { title: string; link: string; desc: string; src: string }[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const pick = (tag: string): string => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(b);
      if (!r) return "";
      return unent(r[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " "));
    };
    const srcUrl = /<source[^>]+url="([^"]+)"/.exec(b)?.[1] ?? "";
    out.push({ title: pick("title"), link: pick("link"), desc: pick("description"), src: srcUrl });
  }
  return out;
}

/** Google News RSS — the only keyless engine that actually understands Arabic. */
async function gnews(q: string, n: number): Promise<SearchHit[]> {
  const ar = /[\u0600-\u06FF]/.test(q);
  const loc = ar ? "hl=ar&gl=DZ&ceid=DZ:ar" : "hl=en-US&gl=US&ceid=US:en";
  const res = await fetch(
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${loc}`,
    { headers: { "User-Agent": UA, Accept: "application/rss+xml,*/*" } }
  );
  if (!res.ok) return [];
  return rssItems(await res.text())
    .slice(0, n)
    .map((it) => ({
      // strip the " - Publisher" suffix Google appends
      title: it.title.replace(/\s+-\s+[^-]{2,40}$/, "").trim() || it.title,
      url: it.link,
      snippet: it.desc.slice(0, 300),
      host: host(it.src) || host(it.link),
      via: "google-news",
    }))
    .filter((h) => h.title && h.url);
}

/** Bing RSS — strong on Latin-script queries, useless on Arabic, so it is script-gated. */
async function bing(q: string, n: number): Promise<SearchHit[]> {
  if (/[\u0600-\u06FF]/.test(q)) return [];
  const res = await fetch(
    `https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&count=${n}`,
    { headers: { "User-Agent": UA, Accept: "application/rss+xml,*/*" } }
  );
  if (!res.ok) return [];
  return rssItems(await res.text())
    .slice(0, n)
    .map((it) => ({
      title: it.title,
      url: it.link,
      snippet: it.desc.slice(0, 300),
      host: host(it.link),
      via: "bing",
    }))
    .filter((h) => h.title && h.url);
}

/** Long shot: works from residential IPs, returns an HTTP 202 challenge from servers. */
async function duck(q: string, n: number): Promise<SearchHit[]> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
      "Accept-Language": "ar,fr;q=0.8,en;q=0.6",
    },
    body: new URLSearchParams({ q }).toString(),
  });
  if (res.status !== 200) return [];
  const html = await res.text();
  const out: SearchHit[] = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < n) {
    let url = m[1];
    const wrapped = /[?&]uddg=([^&]+)/.exec(url);
    if (wrapped) url = decodeURIComponent(wrapped[1]);
    if (url.startsWith("//")) url = "https:" + url;
    const title = unent(m[2].replace(/<[^>]+>/g, ""));
    if (title && /^https?:/i.test(url)) out.push({ title, url, snippet: "", host: host(url), via: "duckduckgo" });
  }
  return out;
}

async function wiki(q: string, n: number): Promise<SearchHit[]> {
  const lang = /[\u0600-\u06FF]/.test(q) ? "ar" : "en";
  const res = await fetch(
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      q
    )}&format=json&srlimit=${n}&origin=*`,
    { headers: { "User-Agent": "NexusAI/13 (contact: nexus)" } }
  );
  if (!res.ok) return [];
  const j = (await res.json()) as { query?: { search?: { title?: string; snippet?: string }[] } };
  return (j.query?.search ?? []).map((r) => {
    const t = r.title ?? "";
    const url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, "_"))}`;
    return {
      title: t,
      url,
      snippet: unent((r.snippet ?? "").replace(/<[^>]+>/g, "")),
      host: `${lang}.wikipedia.org`,
      via: "wikipedia",
    };
  });
}

/* ------------------------------------------------------------------ *
 * public API
 * ------------------------------------------------------------------ */

/** Does the query ask about *now* (news) or about *what something is* (reference)? */
function isTimely(q: string): boolean {
  return /(اليوم|البارح|غدوة|دابا|الآن|حاليا|آخر|أحدث|أخبار|عاجل|سعر|أسعار|مباراة|نتيجة|الطقس|latest|today|news|price|score|weather|breaking)/i.test(
    q
  );
}

export function searchProviderName(): string {
  if (env("TAVILY_API_KEY")) return "Tavily";
  if (env("BRAVE_API_KEY")) return "Brave";
  if (env("SERPER_API_KEY")) return "Serper";
  return "Google News + Bing";
}

/** Run the provider chain until something returns results. Never throws. */
export async function webSearch(query: string, n = 6): Promise<SearchHit[]> {
  const q = query.trim().slice(0, 400);
  if (!q) return [];

  // paid tiers first — if a key exists it is strictly better
  for (const paid of [tavily, brave, serper]) {
    const hits = await timed(paid(q, n).catch(() => [] as SearchHit[]), 9000);
    if (hits && hits.length) return dedupe(hits).slice(0, n);
  }

  // keyless tier: fire everything at once, merge, keep the order that suits the script
  const ar = /[\u0600-\u06FF]/.test(q);
  const [g, b, d, w] = await Promise.all([
    timed(gnews(q, n).catch(() => [] as SearchHit[]), 9000),
    timed(bing(q, n).catch(() => [] as SearchHit[]), 9000),
    timed(duck(q, n).catch(() => [] as SearchHit[]), 7000),
    // Wikipedia is part of the merge, not a last resort: Google News is news-only,
    // so "عاصمة الجزائر" used to come back as football headlines.
    timed(wiki(q, 3).catch(() => [] as SearchHit[]), 8000),
  ]);
  const news = g ?? [];
  const webb = b ?? [];
  const ddg = d ?? [];
  const facts = w ?? [];

  // a question about *now* leads with news; anything else leads with reference pages
  const ordered = isTimely(q)
    ? ar
      ? [...news, ...facts, ...ddg, ...webb]
      : [...webb, ...news, ...facts, ...ddg]
    : ar
    ? [...facts, ...news, ...ddg, ...webb]
    : [...webb, ...facts, ...ddg, ...news];

  const clean = dedupe(ordered);
  return clean.slice(0, n);
}

/** Several queries at once, merged and de-duplicated. */
export async function multiSearch(queries: string[], perQuery = 5): Promise<SearchHit[]> {
  const all = await Promise.all(queries.slice(0, 5).map((q) => webSearch(q, perQuery)));
  return dedupe(all.flat());
}

const STRIP =
  /<(script|style|noscript|svg|nav|footer|header|aside|form|iframe)[\s\S]*?<\/\1>/gi;

/** Very small HTML → text extractor. Good enough to feed a model, cheap enough to run on 5 pages. */
export function htmlToText(html: string): string {
  return unent(
    html
      .replace(STRIP, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Minified JS / JSON blobs slip past a tag stripper — this catches them. */
export function looksLikeCode(t: string): boolean {
  if (t.length < 120) return true;
  const head = t.slice(0, 1200);
  if (/^[\s"']*(use strict|function\s*\(|var\s+\w+\s*=|\{"|\[\{)/.test(head)) return true;
  const symbols = (t.match(/[{};=<>()[\]|&]/g) ?? []).length;
  const letters = (t.match(/[A-Za-z\u0600-\u06FF]/g) ?? []).length;
  return letters < 200 || symbols / Math.max(1, letters) > 0.28;
}

/** Download the top pages in parallel and attach their text. Failures are silent. */
export async function readPages(hits: SearchHit[], limit = 4, perPage = 9000): Promise<SearchHit[]> {
  // news.google.com article ids are encrypted and resolve to a JavaScript splash
  // screen, which used to be scraped as literal minified JS. Skip them on purpose.
  const targets = hits.filter((h) => !/(^|\.)news\.google\.com$/.test(h.host)).slice(0, limit);
  await Promise.all(
    targets.map(async (h) => {
      if (h.text && h.text.length > 500) return;
      const got = await timed(
        (async () => {
          const res = await fetch(h.url, {
            headers: { "User-Agent": UA, Accept: "text/html,*/*" },
            redirect: "follow",
          });
          if (!res.ok) return "";
          const ct = res.headers.get("content-type") ?? "";
          if (!/text\/html|text\/plain|application\/xhtml/i.test(ct)) return "";
          const raw = (await res.text()).slice(0, 400_000);
          const txt = htmlToText(raw).slice(0, perPage);
          return looksLikeCode(txt) ? "" : txt;
        })().catch(() => ""),
        10_000
      );
      if (got) h.text = got;
    })
  );
  return hits;
}

/** The grounded-context block injected into a model prompt. */
export function sourcesBlock(hits: SearchHit[]): string {
  if (hits.length === 0) return "";
  const body = hits
    .map((h, i) => {
      const content = (h.text && h.text.length > 200 ? h.text : h.snippet).slice(0, 4500);
      return `[${i + 1}] ${h.title}\nURL: ${h.url}\n${content}`;
    })
    .join("\n\n---\n\n");

  return `\n\n=== WEB CONTEXT (مصادر حيّة، اليوم) ===
هذي نتائج بحث حقيقية من الإنترنت. استعملها كمصدر الحقيقة.

القواعد:
- كل معلومة جايّة من مصدر، حطّ رقمو بين قوسين مربّعين فنفس السطر: [1] [2].
- إيلا المصادر ما فيهمش الجواب، قول "ما لقيتش هادشي فالمصادر" — ما تخترعش.
- إيلا المصادر تناقضو، قول واش قال كل واحد.
- ما تنسخش فقرات كاملة — لخّص بكلماتك.

${body}
=== END WEB CONTEXT ===\n`;
}

/* ------------------------------------------------------------------ *
 * when should the assistant go online by itself?
 * ------------------------------------------------------------------ */
const L = "A-Za-z0-9\\u0620-\\u065F\\u0660-\\u0669\\u066E-\\u06D3\\u06D5\\u06E5-\\u06EF";
const w = (p: string) => new RegExp(`(?<![${L}])(?:${p})(?![${L}])`, "i");

const LIVE_PATTERNS: RegExp[] = [
  w("اليوم|البارح|غدوة|دابا|دروك|الآن|حاليا|حالياً"),
  w("آخر|أحدث|جديد|جداد|الجديدة|مؤخرا|مؤخراً"),
  w("أخبار|اخبار|خبر|عاجل"),
  w("سعر|أسعار|اسعار|ثمن|صرف|دولار|يورو|بيتكوين"),
  w("الطقس|الجو|درجة الحرارة"),
  w("نتيجة|نتائج|مباراة|ماتش|الدوري|كأس"),
  w("شكون ربح|من فاز|من ربح"),
  w("latest|today|current|news|price|weather|score|release"),
  /\b20(2[5-9]|3\d)\b/,
];

/** Cheap heuristic: does this question need the live internet? */
export function needsWeb(text: string): boolean {
  const t = (text ?? "").slice(0, 1200);
  if (!t) return false;
  return LIVE_PATTERNS.some((re) => re.test(t));
}

/** Turn one question into a few good search queries. */
export function planQueries(question: string): string[] {
  const q = question.replace(/\s+/g, " ").trim().slice(0, 240);
  const year = new Date().getFullYear();
  const out = [q];
  if (!/\b20\d{2}\b/.test(q)) out.push(`${q} ${year}`);
  if (/[\u0600-\u06FF]/.test(q)) out.push(q.replace(/[\u061B\u061F،؟]/g, " ").trim());
  return Array.from(new Set(out.filter(Boolean))).slice(0, 3);
}
