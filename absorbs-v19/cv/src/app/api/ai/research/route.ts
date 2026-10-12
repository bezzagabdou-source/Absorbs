/**
 * Nexus AI v13 — DEEP RESEARCH.
 *
 * POST /api/ai/research  { text, depth?: "quick" | "deep" }
 *
 * plan queries → search the live web → read the pages → write a cited report.
 * Streams NDJSON so the browser shows every step as it happens.
 */
import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { takeCredit } from "@/lib/usage";
import { streamGemini } from "@/lib/gemini";
import {
  multiSearch,
  readPages,
  sourcesBlock,
  planQueries,
  searchProviderName,
  type SearchHit,
} from "@/lib/websearch";

export const runtime = "nodejs";
export const maxDuration = 300;

export type ResearchEvent =
  | { t: "plan"; queries: string[]; provider: string }
  | { t: "step"; id: string; label: string; state: "run" | "ok" | "fail" }
  | { t: "sources"; sources: { n: number; title: string; url: string; host: string; snippet: string }[] }
  | { t: "report"; d: string }
  | { t: "done"; ms: number; read: number }
  | { t: "error"; message: string };

const enc = (e: ResearchEvent) => JSON.stringify(e) + "\n";

const REPORT_SYSTEM = `أنت باحث محترف. عندك مصادر حيّة من الإنترنت، واجب عليك تكتب تقرير دقيق بالاعتماد عليها فقط.

القواعد الصارمة:
1. كل جملة فيها معلومة لازم يكون معاها رقم المصدر بين قوسين مربّعين: [1] ولا [2][3].
2. ممنوع تخترع أي رقم، تاريخ، اسم ولا رابط ما كانش فالمصادر.
3. إيلا المصادر ما فيهمش الجواب، قولها بصراحة فسطر واحد.
4. إيلا المصادر تناقضو، بيّن التناقض ومنين جا.
5. نفس لغة السؤال (دارجة ⟵ دارجة).

البنية:
- جملة واحدة فالبداية تجاوب على السؤال مباشرة.
- بعدها التفاصيل مرتّبة بعناوين قصيرة ونقاط.
- آخر سطر: "درجة الثقة: عالية/متوسطة/منخفضة" مع سبب قصير.
- ما تكتبش قائمة المصادر فالآخر — الواجهة كتعرضها وحدها.`;

export async function POST(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHORIZED" });

  const rl = rateLimit(`research:${user.uid}`, 8, 60_000);
  if (!rl.ok) return json(429, { code: "RATE" }, { "Retry-After": String(rl.retryAfter) });

  let body: { text?: unknown; depth?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { code: "BAD_JSON" });
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 4000) : "";
  if (!text) return json(400, { code: "EMPTY" });
  const deep = body.depth === "deep";

  const taken = await takeCredit(user);
  if (taken && !taken.ok) return json(429, { code: "QUOTA" });

  const started = Date.now();

  const stream = new ReadableStream<string>({
    async start(controller) {
      let closed = false;
      const send = (e: ResearchEvent) => {
        if (closed) return;
        try {
          controller.enqueue(enc(e));
        } catch {
          closed = true;
        }
      };
      const end = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      try {
        /* ---- 1. plan ---- */
        const queries = planQueries(text).slice(0, deep ? 3 : 2);
        send({ t: "plan", queries, provider: searchProviderName() });
        send({ t: "step", id: "plan", label: `خطّطت ${queries.length} استعلامات بحث`, state: "ok" });

        /* ---- 2. search ---- */
        send({ t: "step", id: "search", label: "كيفتّش فالإنترنت…", state: "run" });
        let hits: SearchHit[] = await multiSearch(queries, deep ? 6 : 5);
        if (hits.length === 0) {
          send({ t: "step", id: "search", label: "ما لقيتش حتى نتيجة", state: "fail" });
          send({ t: "error", message: "محرّك البحث ما رجّعش نتائج. جرّب صيغة أخرى للسؤال." });
          end();
          return;
        }
        hits = hits.slice(0, deep ? 8 : 6);
        send({ t: "step", id: "search", label: `لقيت ${hits.length} مصادر`, state: "ok" });

        /* ---- 3. read ---- */
        const toRead = deep ? 5 : 3;
        send({ t: "step", id: "read", label: `كيقرا ${toRead} صفحات كاملة…`, state: "run" });
        await readPages(hits, toRead, deep ? 10_000 : 7000);
        const read = hits.filter((h) => (h.text?.length ?? 0) > 400).length;
        send({ t: "step", id: "read", label: `قرا ${read} صفحات بالكامل`, state: "ok" });

        send({
          t: "sources",
          sources: hits.map((h, i) => ({
            n: i + 1,
            title: h.title || h.host,
            url: h.url,
            host: h.host,
            snippet: h.snippet.slice(0, 180),
          })),
        });

        /* ---- 4. write ---- */
        send({ t: "step", id: "write", label: "كيكتب التقرير بالمصادر…", state: "run" });
        const prompt = `السؤال: ${text}${sourcesBlock(hits)}`;
        const rs = await streamGemini({
          system: REPORT_SYSTEM,
          messages: [{ role: "user", text: prompt }],
          tier: "pro",
          task: "reasoning",
          mode: "quality",
          maxTokens: deep ? 8000 : 4500,
          temperature: 0.35,
        });
        const reader = rs.getReader();
        const stop = started + 240_000;
        for (;;) {
          if (Date.now() > stop) break;
          const { value, done } = await reader.read();
          if (done) break;
          if (value) send({ t: "report", d: value });
        }
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        send({ t: "step", id: "write", label: "التقرير جاهز", state: "ok" });
        send({ t: "done", ms: Date.now() - started, read });
      } catch (e) {
        send({
          t: "error",
          message: e instanceof Error ? e.message.slice(0, 180) : "فشل البحث",
        });
      }
      end();
    },
  });

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "x-nexus": "v13-research",
      "x-search-provider": searchProviderName(),
    },
  });
}
