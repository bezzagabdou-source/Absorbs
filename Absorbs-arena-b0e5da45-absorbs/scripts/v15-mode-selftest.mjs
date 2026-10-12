import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const { resolveChatMode } = await import(join(here, ".v15-build", "chat-modes.js"));
const cases = [
  ["music", "أغنية ديدين كلاش saiga", true],
  ["music", "اعمل لي بيت راب سريع حزين", true],
  ["music", "make a lofi beat", true],
  ["music", "كلمات اغنية saiga", false],
  ["music", "من هو ديدين كلاش", false],
  ["music", "ابنِ لي لعبة سباق", false],
  ["music", "كيف أطبخ الكسكسي", false],
  ["music", "مرحبا", false],
  ["video", "اعمل فيديو عن الفضاء", true],
  ["video", "ترجم هذا الفيديو", false],
  ["canvas", "اكتب مقال", true],
  ["agent_coder", "أي شيء", true],
  ["dzstudy", "تمرين رياضيات", true],
];
let bad = 0;
for (const [m, t, exp] of cases) {
  const got = !!resolveChatMode(m, t);
  if (got !== exp) bad++;
  console.log(got === exp ? "PASS" : "FAIL", m, "|", t, "->", got);
}
if (bad) { console.error(`${bad} FAILED`); process.exit(1); }
console.log("ALL PASS");
