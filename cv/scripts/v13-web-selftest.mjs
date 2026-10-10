/**
 * Nexus AI v13 — LIVE WEB self test.  يحتاج إنترنت، ما يحتاجش أي مفتاح API.
 *   npm run test:web
 */
import { webSearch, readPages, searchProviderName } from "./.v13-build/websearch.js";
let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log("  \x1b[32m✓\x1b[0m",m)):(fail++,console.log("  \x1b[31m✗\x1b[0m",m))};
console.log("المزوّد:", searchProviderName(), "\n");
for (const [label,q] of [
  ["عربي · أخبار","أخبار الجزائر اليوم"],
  ["دارجة · سعر","شحال سعر الدولار في الجزائر"],
  ["عربي · معرفة","عاصمة الجزائر"],
  ["إنجليزي","latest AI model releases 2026"],
]) {
  const t0=Date.now();
  const h = await webSearch(q, 6);
  ok(h.length>=3, `${label}: ${h.length} نتائج · ${Date.now()-t0}ms · via ${[...new Set(h.map(x=>x.via))].join("+")}`);
  h.slice(0,2).forEach(x=>console.log("      ⟶",(x.host||"?").padEnd(22),x.title.slice(0,58)));
}
console.log("\nقراءة الصفحات:");
const hits = await webSearch("عاصمة الجزائر", 4);
const t1=Date.now(); await readPages(hits,3,5000);
const read = hits.filter(h=>(h.text?.length??0)>400);
ok(read.length>0, `قرا ${read.length}/${Math.min(3,hits.length)} صفحات · ${Date.now()-t1}ms`);
if(read[0]) console.log("      عيّنة:", read[0].text.slice(0,110).replace(/\n/g," "));
console.log(`\n${fail===0?"\x1b[1m\x1b[32mنجح":"\x1b[1m\x1b[31mفشل"}\x1b[0m — ${pass} نجاح · ${fail} فشل\n`);
