import { q } from "../db.js";
import { CATEGORIES, categoryLabel } from "../data/questions.js";
import { logEvent } from "../db.js";

/**
 * أسئلة مخصّصة يضيفها المالك (أو الذكاء الاصطناعي) وتُدمج مع بنك الأسئلة.
 */

const VALID_CATS = new Set(CATEGORIES.map((c) => c.id).concat(["mix"]));

export function addQuestion({ question, options, correct, category = "general", createdBy = "dashboard" }) {
  const text = String(question ?? "").trim();
  const opts = Array.isArray(options) ? options.map((o) => String(o ?? "").trim()).filter(Boolean) : [];
  const idx = Number(correct);
  if (text.length < 4) throw new Error("نص السؤال قصير");
  if (opts.length < 2) throw new Error("لازم خيارين على الأقل");
  if (opts.length > 6) throw new Error("الحد 6 خيارات");
  if (!Number.isInteger(idx) || idx < 0 || idx >= opts.length) throw new Error("فهرس الجواب الصحيح غير صالح");
  const cat = VALID_CATS.has(String(category)) ? String(category) : "general";

  const r = q.run(
    "INSERT INTO custom_questions(category, question, options, correct_idx, active, created_by, created_at) VALUES(?,?,?,?,1,?,?)",
    cat,
    text.slice(0, 400),
    JSON.stringify(opts.map((o) => o.slice(0, 160))),
    idx,
    createdBy,
    Date.now()
  );
  logEvent("question_added", { detail: `#${r.lastInsertRowid} ${cat}` });
  return { id: Number(r.lastInsertRowid), category: cat, categoryLabel: categoryLabel(cat), question: text, options: opts, correct: idx };
}

export function removeQuestion(id) {
  const row = q.get("SELECT id FROM custom_questions WHERE id = ?", Number(id));
  if (!row) throw new Error("السؤال غير موجود");
  q.run("DELETE FROM custom_questions WHERE id = ?", Number(id));
  return true;
}

export function customQuestions(limit = 50) {
  return q
    .all("SELECT id, category, question, options, correct_idx, active, created_by, created_at FROM custom_questions ORDER BY id DESC LIMIT ?", limit)
    .map((r) => ({
      id: r.id,
      category: r.category,
      categoryLabel: categoryLabel(r.category),
      question: r.question,
      options: JSON.parse(r.options),
      correct: r.correct_idx,
      active: !!r.active,
      createdBy: r.created_by,
      at: r.created_at,
    }));
}

export function customStats() {
  const total = q.get("SELECT COUNT(*) AS n FROM custom_questions").n;
  const active = q.get("SELECT COUNT(*) AS n FROM custom_questions WHERE active = 1").n;
  const byCat = q.all("SELECT category, COUNT(*) AS n FROM custom_questions GROUP BY category");
  return { total, active, byCat };
}

/** يُرجع سؤالاً مخصّصاً عشوائياً (يُستعمل في quiz.js) */
export function randomCustomQuestion(category) {
  const row =
    category && category !== "mix"
      ? q.get("SELECT * FROM custom_questions WHERE active = 1 AND category = ? ORDER BY RANDOM() LIMIT 1", category)
      : q.get("SELECT * FROM custom_questions WHERE active = 1 ORDER BY RANDOM() LIMIT 1");
  if (!row) return null;
  return {
    id: `c${row.id}`,
    cat: row.category,
    text: row.question,
    options: JSON.parse(row.options),
    correct: row.correct_idx,
  };
}
