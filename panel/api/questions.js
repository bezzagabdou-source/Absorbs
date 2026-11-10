/* FT AI — الأسئلة */
import { methods, authed, body } from "./_lib.js";
import { json, updateState, uid, now } from "../lib/core.js";

export default methods({
  GET: authed(async (req, res, state) => json(res, 200, { ok: true, count: state.questions.length, questions: state.questions.slice().reverse() })),

  POST: authed(async (req, res) => {
    const b = await body(req);
    const opts = (b?.options ?? []).map((o) => String(o).trim()).filter(Boolean).slice(0, 4);
    if (String(b?.text ?? "").trim().length < 3) return json(res, 400, { ok: false, error: "نص السؤال قصير" });
    if (opts.length < 2) return json(res, 400, { ok: false, error: "لازم اختيارين على الأقل" });
    const q = {
      id: uid(4),
      text: String(b.text).slice(0, 400),
      options: opts,
      correct: Math.max(0, Math.min(opts.length - 1, Number(b.correct) || 0)),
      category: String(b.category ?? "عام").slice(0, 40),
      at: now(),
    };
    await updateState((s) => { s.questions.push(q); return s; });
    return json(res, 200, { ok: true, question: q });
  }),

  DELETE: authed(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const id = url.searchParams.get("id") ?? "";
    const out = await updateState((s) => {
      const before = s.questions.length;
      s.questions = id === "all" ? [] : s.questions.filter((q) => q.id !== id);
      return { removed: before - s.questions.length };
    });
    return json(res, 200, { ok: true, ...out });
  }),
});
