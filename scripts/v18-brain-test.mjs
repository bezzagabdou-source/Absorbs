import { searchBrain, brainBrief, brainStats, norm } from "../src/lib/brain/index.ts";

const st = brainStats();
console.log("corpus:", st.rows, "rows |", (st.bytes / 1024).toFixed(0), "KB |", JSON.stringify(st.byKind));
console.log("built:", st.builtAt, "| sources:", st.sources.map(s => `${s.key}:${s.rows}`).join(" "));

const queries = [
  "قداش الرمز البريدي تاع بلدية باب الزوار؟",
  "واش هي نسبة TVA في الجزائر؟",
  "بغيت نعرف ولاية ادرار شحال فيها بلدية",
  "أفضل شركة توصيل في الجزائر للدفع عند التسليم",
  "شحال يخلص المقاول الذاتي؟",
  "كيفاش ننشر مشروع على فيرسل",
  "جامعة وهران 1",
  "lms platform",
  "لعبة canvas requestAnimationFrame",
];
for (const q of queries) {
  const hits = searchBrain(q, 3);
  console.log("\n▸", q);
  for (const h of hits) console.log("   ", h.score.toFixed(2).padStart(6), h.row.kind.padEnd(10), h.row.title.slice(0, 58), "|", h.row.source.slice(0, 28));
  if (!hits.length) console.log("    (لا نتائج)");
}

console.log("\n--- brief sample ---");
console.log(brainBrief("واش نسبة TVA و الرمز البريدي تاع بجاية؟", { limit: 4, maxChars: 900 }));
console.log("\nnorm:", norm("أدرارّ BÉJAÏA  béjaia"));
