import { apexMark, stripApexMark, encodeApexMark } from "../src/lib/apex/mark.ts";
import { apexBuildIntent } from "../src/lib/apex/intent.ts";

const line = encodeApexMark({ slug: "shop-ab12", title: "متجر", blueprint: "ecommerce", kind: "shop", lines: 31035, files: 30, modules: 13, bytes: 930000, dataRows: 830, score: 100, pages: 8, buildMs: 42, url: "/p/shop-ab12" });
const full = line + "\n\nبُنيت المتجر كامل: 8 صفحات، سلة، فواتير…";
console.log("mark parsed:", apexMark(full)?.slug, "| body starts:", JSON.stringify(stripApexMark(full).slice(0, 30)));
const partial = line.slice(0, 40);
console.log("partial body:", JSON.stringify(stripApexMark(partial)), "| mark:", apexMark(partial) === null);
console.log("tail mark:", apexMark("شرح عادي\n\n" + line)?.title);

for (const t of [
  "اصنع لي متجر إلكتروني كامل مع سلة وفواتير",
  "سوّي لي لعبة ضخمة بالعربية",
  "شنو الفرق بين الذكاء الاصطناعي والتعلم العميق؟",
  "عطيني كود",
  "بني لي لوحة تحكم لبيانات مدرستي، ديرها احترافية كاملة",
  "اكتب صفحة هبوط لمقهى",
  "site web complet pour ma boutique de cosmétiques",
]) {
  const r = apexBuildIntent(t);
  console.log(String(r.build).padEnd(5), String(r.confidence).padStart(3), "|", r.reason.padEnd(28), "|", t.slice(0, 40));
}

console.log("\n--- FR / EN / Darija ---");
for (const t of [
  "site web complet pour ma boutique de cosmétiques à Alger",
  "je veux une application de gestion pour mon école, très complète",
  "I want a complete e-commerce website with cart and invoices",
  "بغيت موقع كامل لمحل ملابس في باب الزوار",
  "راني حاب نعمل système de gestion des rendez-vous pour ma clinique",
  "واش هي أفضل لغة برمجة للتعلم؟",
]) {
  const r = apexBuildIntent(t);
  console.log(String(r.build).padEnd(5), String(r.confidence).padStart(3), "|", t.slice(0, 52));
}
