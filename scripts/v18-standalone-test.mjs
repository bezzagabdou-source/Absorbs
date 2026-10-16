import { completeStandalone, looksLikeDeliverable, extractCode } from "../src/lib/apex/standalone.ts";

/* the kind of answer a weak model gives: prose + unterminated fence + Tailwind CDN + missing tags */
const raw = `تفضل، هذا موقع لمطعم جزائري:

\`\`\`html
<!DOCTYPE html>
<html>
<head>
  <title>مطعم الأصالة</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Cairo" rel="stylesheet">
  <style> body { background:#0b0b0b; color:#fff; font-family:Cairo } .hero{ padding:80px 20px } </style>
</head>
<body>
  <div class="hero text-center">
    <h1 class="text-4xl font-black">مطعم الأصالة</h1>
    <p class="text-gray-400">أشهى الأطباق الجزائرية التقليدية بالعاصمة</p>
    <button class="bg-amber-500 rounded-full px-4 py-2">احجز طاولة</button>
  </div>
  <div data-apex="menu"></div>
  <div>
    <div class="grid grid-cols-3 gap-4">
      <div class="rounded-lg p-4">الشخشوخة
`;

const t0 = Date.now();
const r = completeStandalone(raw, { text: "موقع لمطعم جزائري فيه منيو وحجز طاولات" });
console.log("looksLikeDeliverable:", looksLikeDeliverable(raw));
console.log("kind:", r.kind, "| palette:", r.palette.id, "| lang:", r.lang, r.dir, "| ms:", Date.now() - t0);
console.log("lines:", r.lines, "| bytes:", r.bytes, "| modules:", r.modules.map(m => m.id).join(","), "| score:", r.score, "| ok:", r.report.ok);
console.log("fixed:"); r.fixed.forEach(f => console.log("  ·", f));
console.log("warnings:", r.warnings);
console.log("checks:", r.report.checks.map(c => `${c.ok ? "✓" : "✗"} ${c.id}`).join(" "));
console.log("has tailwind cdn:", /cdn\.tailwindcss\.com/.test(r.html), "| has tailwind-lite:", /Tailwind-lite/.test(r.html));
console.log("has safe boot:", /NEXUS_SAFE/.test(r.html), "| ends with </html>:", /<\/html>\s*$/.test(r.html.trim()));

/* and a game answer, to see the game kit land */
const game = "```html\n<!doctype html><html><head><title>لعبة</title></head><body><canvas id=c width=400 height=400></canvas>\n<script>const c=document.getElementById('c');let x=10;requestAnimationFrame(function loop(){x+=1;c.getContext('2d').fillRect(x,10,20,20);requestAnimationFrame(loop)})</script>\n```";
const g = completeStandalone(game, { text: "لعبة سيارات بسيطة" });
console.log("\ngame →", g.kind, "| score:", g.score, "| game kit:", /NX_GAME/.test(g.html), "| bar:", /data-nx-game-ui/.test(g.html), "| lines:", g.lines);
console.log("game failing checks:", g.report.checks.filter(c=>!c.ok).map(c=>`${c.id}(${c.detail})`).join(" | ") || "none");
console.log("site failing checks:", r.report.checks.filter(c=>!c.ok).map(c=>c.id).join(",") || "none");
console.log("site data kinds injected:", (r.html.match(/window\.APEX_DATA=(\{[\s\S]{0,80})/)||[])[1]);
