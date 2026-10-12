/**
 * اختبار دخان لمحرّك فحص v19 APEX — يتحقق أن البوابة تمنع الكود المعطوب
 * وأن القوالب المدمجة تجتازها، وأن الإصلاح الآلي لا يكسر ملفاً سليماً.
 *
 * التشغيل:  npm run smoke:apex
 */
import { analyze, applyAutoFixes, RULES } from '../src/lib/apex/qa.ts';
import { buildRepairPrompt } from '../src/lib/apex/api.ts';
import { AURORA_LANDING, NOVA_DASH, STARTER_FORM, STARTER_HTML } from '../src/lib/apex/templates.ts';

const healthy = [
  { name: 'NOVA_DASH — لعبة كانفاس', code: NOVA_DASH, kind: 'game' },
  { name: 'AURORA_LANDING — صفحة هبوط', code: AURORA_LANDING, kind: 'website' },
  { name: 'STARTER_HTML — بداية', code: STARTER_HTML, kind: 'website' },
  { name: 'STARTER_FORM — نموذج بتحقق', code: STARTER_FORM, kind: 'app' },
];

const broken = {
  name: 'كود معطوب عمداً (يجب أن يُرفض)',
  kind: 'game',
  code: `<!doctype html><html><head><title>t</title></head><body>
<canvas id="c"></canvas>
<a target="_blank" href="http://x.com">x</a>
<div id="hud"></div>
<script>
var el = document.getElementById('missing'); el.textContent = 'x';
eval('2+2');
while(true) { break; }
setInterval(function(){}, 100);
var a = '1' == 1;
localStorage.setItem('k','v');
document.body.innerHTML = userInput;
</script></body></html>`,
};

let failed = 0;
const line = (ok, text) => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${text}`);
};

console.log(`محرّك الفحص v19 APEX — ${RULES.length} قاعدة\n`);

for (const c of healthy) {
  const report = analyze(c.code, c.kind);
  line(
    report.passed && report.counts.critical === 0 && report.counts.high === 0,
    `${c.name} — ${report.score}/100 (${report.grade}) · حرج:${report.counts.critical} عالٍ:${report.counts.high} متوسط:${report.counts.medium}`,
  );
}

const bad = analyze(broken.code, broken.kind);
line(
  !bad.passed && bad.counts.critical >= 2 && bad.counts.high >= 3,
  `${broken.name} — ${bad.score}/100 (${bad.grade}) · حرج:${bad.counts.critical} عالٍ:${bad.counts.high} متوسط:${bad.counts.medium}`,
);

const fixed = applyAutoFixes(broken.code, broken.kind);
line(fixed.applied.length >= 3, `الإصلاح الآلي طبّق ${fixed.applied.length} إصلاحاً: ${fixed.applied.join(', ')}`);

const healthyFix = applyAutoFixes(NOVA_DASH, 'game');
const afterFix = analyze(healthyFix.code, 'game');
line(afterFix.counts.critical === 0 && afterFix.counts.high === 0, `الإصلاح الآلي آمن على ملف سليم — النتيجة ${afterFix.score}/100`);

const detected = new Set(bad.issues.map((i) => i.rule));
line(
  detected.has('JS-001') && detected.has('JS-002') && detected.has('JS-003') && detected.has('JS-004'),
  `كشفت البوابة القواعد الحرجة الأساسية (${['JS-001', 'JS-002', 'JS-003', 'JS-004'].filter((r) => detected.has(r)).join(' · ')})`,
);

/* ===== الإصلاح الذكي: برومبت الإصلاح يجب أن يحمل معرّفات القواعد والأدلة ===== */
const repairPrompt = buildRepairPrompt(
  broken.code,
  bad.issues.slice(0, 6).map((i) => ({
    rule: i.rule,
    severity: i.severity,
    line: i.line,
    title: i.title.ar,
    detail: i.detail.ar,
    fix: i.fix.ar,
    evidence: i.evidence,
  })),
  'ar',
);
const promptOk =
  repairPrompt.length > 600 &&
  repairPrompt.includes('JS-002') &&
  repairPrompt.includes('```') &&
  repairPrompt.includes('المُصلَح');
line(promptOk, `برومبت الإصلاح الذكي يُبنى صحيحاً (${repairPrompt.length} حرفاً · يحمل معرّفات القواعد والدليل)`);

const enPrompt = buildRepairPrompt(broken.code, [], 'en');
line(enPrompt.includes('Code to repair'), 'نسخة الإصلاح الإنجليزية تُبنى كذلك (دعم اللغتين)');

console.log(failed === 0 ? '\nكل اختبارات بوابة الفحص نجحت ✓' : `\nفشل ${failed} اختبار ✗`);
process.exit(failed === 0 ? 0 : 1);
