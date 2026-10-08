/**
 * Nexus AI v14 — Arabic image-prompt translator self test.
 * بلا إنترنت وبلا أي مفتاح API.   npm run test:ar
 */
import { translateArabicPrompt, ensureEnglishPrompt, hasArabicChars } from "./.v14-build/arabic-image-lexicon.js";
let p=0,f=0; const ok=(c,m)=>{c?(p++,console.log("  \x1b[32m✓\x1b[0m",m)):(f++,console.log("  \x1b[31m✗\x1b[0m",m))};
const cases=[
 "صورلي رجل عجوز جزائري لابس قشابية فالقصبة وقت غروب الشمس",
 "بغيت صورة حصان عربي أبيض يجري في الصحراء",
 "دير لي شعار شركة عصري بسيط أزرق",
 "ارسم لي قط صغير لطيف فوق كرسي",
 "صورة واقعية جدا لمدينة الجزائر في الليل",
 "تصميم ملصق إعلاني فخم ذهبي لمطعم كسكس",
 "جامع الجزائر وقت الشروق دقة عالية",
 "فنك الصحراء تحت النجوم رسم رقمي",
];
console.log("ترجمة بلا أي مفتاح API:\n");
for(const c of cases){
  const r=translateArabicPrompt(c);
  const clean=!hasArabicChars(r.en);
  ok(clean && r.en.length>12, `${Math.round(r.coverage*100)}% · ${c.slice(0,42)}…`);
  console.log("        ⟶", r.en);
  if(r.unknown.length) console.log("        ✗ ما تترجمش:", r.unknown.join(" "));
}
console.log("\nالضمانة النهائية:");
ok(!hasArabicChars(ensureEnglishPrompt("صورلي أسد في الغابة","")), "بلا مترجم LLM ⟵ إنجليزية نقية");
ok(ensureEnglishPrompt("صورلي أسد","a majestic lion in a forest")==="a majestic lion in a forest","ترجمة LLM سليمة ⟵ تُعتمد");
ok(!hasArabicChars(ensureEnglishPrompt("صورلي أسد","أسد lion")),"ترجمة LLM ناقصة ⟵ تُنظَّف");
console.log(`\n${f===0?"\x1b[1m\x1b[32mنجح":"\x1b[1m\x1b[31mفشل"}\x1b[0m — ${p} نجاح · ${f} فشل\n`);
