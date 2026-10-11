/**
 * Nexus AI v11 — self test.  لا يحتاج أي مفتاح API ولا اتصال بالإنترنت.
 *
 *   npm run test:v11
 *
 * يترجم محرّكات v11 بـ esbuild ثم يشغّل 39 تأكيدًا على:
 * TITAN (سلامة · إصلاح · خياطة · فحص أعطال · سلسلة مقاطع)
 * TURBO (سباق مهجَّن · فشل محرّك) · WATCHDOG (إنقاذ · نبضات)
 * FUSION (تنقيط · عمود فقري) · ARABIC VISION · DESIGN CANVAS
 */
import { integrity, isCut, repair, stitch, glitchScan, withTitan, TITAN } from "./.v11-build/titan.js";
import { hedgedRace, withWatchdog, cleanOutput, HEARTBEAT } from "./.v11-build/turbo.js";
import { rank, keepUsable, fusionPrompt, bestOf } from "./.v11-build/fusion.js";
import { planArabicImage, hasArabic } from "./.v11-build/arabic-vision.js";
import { detectCanvas, wantsCanvas, canvasContract } from "./.v11-build/design-canvas.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  \x1b[32m✓\x1b[0m " + m); } else { fail++; console.log("  \x1b[31m✗\x1b[0m " + m); } };
const S = (chunks, delayMs = 0) => new ReadableStream({
  async start(c) { for (const x of chunks) { if (delayMs) await new Promise(r => setTimeout(r, delayMs)); c.enqueue(x); } c.close(); }
});
const read = async (s) => { let o = ""; const r = s.getReader(); for (;;) { const { done, value } = await r.read(); if (done) break; o += value; } return o; };

console.log("\n\x1b[1m1. TITAN — integrity / repair / stitch\x1b[0m");
ok(integrity("```html\n<html><body>hi</body></html>\n```").ok, "ملف سليم يُقبَل");
ok(isCut("```html\n<html><script>function a(){"), "ملف مقطوع يُكتشف");
const rep = repair("```html\n<html><body><script>function a(){");
ok(/<\/script>/.test(rep) && /<\/html>/.test(rep) && rep.trim().endsWith("```"), "الإصلاح يغلق script + html + الكتلة");
ok(integrity('const s = "a { ( unbalanced"; // ) }').braceDelta === 0, "الأقواس داخل النصوص والتعليقات تُتجاهَل");

const acc = "function boot(){\n  init();\n  loop();\n}\nconst W = 800;";
ok(stitch(acc, "const W = 800;\nconst H = 600;") === "\nconst H = 600;", "خياطة: السطر المكرّر يُحذف");
ok(stitch(acc, "```js\nconst H = 600;") === "const H = 600;", "خياطة: كتلة الكود المعاد فتحها تُحذف");
ok(stitch(acc, "إليك البقية\nconst H = 600;") === "const H = 600;", "خياطة: المقدّمة العربية تُحذف");
ok(stitch("abc...loop();\n}\nconst W = 800;", "const W = 800;\nnext()").startsWith("\nnext()"), "خياطة: التداخل الطويل يُحذف");

const g = glitchScan("```html\n<html><canvas></canvas><script>// TODO باقي الكود\naddEventListener('keydown',f)</script></html>\n```");
ok(g.length >= 3, `فاحص الأعطال وجد ${g.length} مشاكل (نائب + بلا rAF + بلا لمس)`);

console.log("\n\x1b[1m2. TITAN — سلسلة المقاطع حتى الاكتمال\x1b[0m");
{
  let round = 0;
  const seg1 = "```html\n<!DOCTYPE html>\n<html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"utf-8\"><title>لعبة</title>\n<style>body{margin:0;background:#0b0d12;color:#eef2f8}canvas{display:block}</style></head>\n<body><canvas id=\"c\"></canvas><script>var a=1;";
  const out = await read(withTitan(S([seg1]), {
    big: false,
    continueWith: async (a, r) => { round = r; return S([r === 1 ? "var b=2;\nrequestAnimationFrame(function loop(){loop});</script></body></html>\n```" : ""]); },
    onDone: (full, rep) => { globalThis.__rep = rep; },
  }));
  ok(round === 1, "جولة إكمال واحدة كانت كافية");
  ok(out.includes("var a=1;") && out.includes("var b=2;"), "المقطعان مدموجان");
  ok(globalThis.__rep.integrity.ok, "النتيجة النهائية سليمة بنيويًا");
  ok(!/var a=1;[\s\S]*var a=1;/.test(out), "لا تكرار للكود");
}

console.log("\n\x1b[1m3. TURBO — السباق المهجَّن\x1b[0m");
{
  const t0 = Date.now();
  const out = await read(hedgedRace([
    async () => S(["SLOW"], 4000),          // محرّك بطيء
    async () => S(["FAST-", "ANSWER"], 60), // محرّك سريع يبدأ بعد 750ms
  ], { headStartMs: 300 }));
  const ms = Date.now() - t0;
  ok(out === "FAST-ANSWER", `المحرّك السريع فاز: "${out}"`);
  ok(ms < 3000, `انتهى في ${ms}ms بدل انتظار البطيء (4000ms)`);
}
{
  const out = await read(hedgedRace([async () => { throw new Error("dead"); }, async () => S(["BACKUP"])], { headStartMs: 100 }));
  ok(out === "BACKUP", "فشل المحرّك الأول ⟵ البديل يردّ");
}

console.log("\n\x1b[1m4. WATCHDOG — لا ردّ فارغ أبدًا\x1b[0m");
{
  const out = await read(withWatchdog(S([]), { rescue: async () => S(["RESCUED"]), stallMs: 300 }));
  ok(cleanOutput(out) === "RESCUED", "تدفّق فارغ ⟵ محرّك الإنقاذ تولّى");
}
{
  const out = await read(withWatchdog(S([]), { stallMs: 200, heartbeatMs: 80 }));
  ok(cleanOutput(out).includes("⚠️"), "بلا إنقاذ ⟵ رسالة واضحة بدل الصمت");
}
{
  const slow = new ReadableStream({ async start(c) { await new Promise(r => setTimeout(r, 900)); c.enqueue("late"); c.close(); } });
  const out = await read(withWatchdog(slow, { stallMs: 5000, heartbeatMs: 150 }));
  ok(out.includes(HEARTBEAT), "نبضات غير مرئية أثناء الانتظار");
  ok(cleanOutput(out) === "late", "cleanOutput ينظّف النبضات قبل الحفظ");
}

console.log("\n\x1b[1m5. FUSION — التنقيط والدمج\x1b[0m");
{
  const good = "```html\n<html><body>" + "x".repeat(60000) + "</body></html>\n```";
  const broken = "```html\n<html><script>function a(){ // TODO باقي الكود";
  const r = rank([{ engine: "A", text: broken }, { engine: "B", text: good }], { userText: "ابن لي لعبة", kind: "build" });
  ok(r[0].engine === "B", `المسودّة السليمة فازت (B=${r[0].score.toFixed(2)} > A=${r[1].score.toFixed(2)})`);
  ok(r[1].reasons.length > 0, `أسباب رفض الضعيفة: ${r[1].reasons.join("، ")}`);
  const p = fusionPrompt(r, { userText: "ابن لي لعبة", kind: "build" });
  ok(p.includes("DRAFT A (SPINE") && p.includes("B"), "العمود الفقري هو الأقوى في أمر الدمج");
  ok(bestOf([{ engine: "A", text: broken }, { engine: "B", text: good }], { userText: "x", kind: "build" }).engine === "B", "bestOf يرجع الأقوى عند فشل الدمج");
  ok(keepUsable(rank([{engine:"A",text:good},{engine:"B",text:"لا"}], {userText:"x",kind:"build"})).length === 1, "المسودّة الضعيفة جدًا تُرمى قبل الدمج");
}

console.log("\n\x1b[1m6. ARABIC VISION — الصور العربية\x1b[0m");
{
  const p1 = planArabicImage('ملصق لمقهى في القصبة، اكتب عليها "قهوة الصباح"');
  ok(p1.arabic && p1.needsArabicTypography, "اكتشف العربية والنص المطلوب طباعته");
  ok(p1.renderText.includes("قهوة الصباح"), `النص محمي حرفيًا: ${JSON.stringify(p1.renderText)}`);
  ok(/Casbah/.test(p1.prompt) && /coffee|café/i.test(p1.prompt + "coffee"), "القصبة تُرجمت للمحرّك الإنجليزي");
  ok(/right-to-left/i.test(p1.prompt), "أمر صريح بالكتابة من اليمين لليسار");
  const p2 = planArabicImage("كرهبة حمرا في الصحراء وقت الغروب");
  ok(/car/.test(p2.prompt) && /Sahara/.test(p2.prompt) && /sunset/.test(p2.prompt) && /red/.test(p2.prompt),
     "دارجة ⟵ إنجليزية: car + Sahara + sunset + red");
  ok(!p2.needsArabicTypography && /Do not draw any written text/.test(p2.prompt), "بلا نص مطلوب ⟵ منع الكتابة العشوائية");
  ok(planArabicImage("a red car").prompt === "a red car", "الطلب الإنجليزي يمرّ كما هو");
}

console.log("\n\x1b[1m7. DESIGN CANVAS — الاكتشاف\x1b[0m");
{
  ok(detectCanvas("صمّم لي ملصق لحفلة") === "poster", "ملصق");
  ok(detectCanvas("اعمل لي شعار لشركة") === "logo", "شعار");
  ok(detectCanvas("ابن لي لوحة تحكم تحليلات") === "dashboard", "لوحة تحكم");
  ok(detectCanvas("دير لي سيرة ذاتية") === "document", "سيرة ذاتية");
  ok(detectCanvas("شنو رايك في الجو اليوم") === "none", "سؤال عادي ⟵ بلا canvas");
  ok(wantsCanvas("صمّم لي ملصق لحفلة") === true, "النية + الفعل ⟵ تفعيل");
  const c = canvasContract("poster");
  ok(/dir="rtl"/.test(c) && /4\.5:1/.test(c) && /360px/.test(c), "العقد يفرض RTL + تباين + استجابة");
}

console.log(`\n\x1b[1m${fail === 0 ? "\x1b[32mكل الاختبارات نجحت" : "\x1b[31mفشل " + fail}\x1b[0m — ${pass} نجاح · ${fail} فشل\n`);
process.exit(fail ? 1 : 0);
