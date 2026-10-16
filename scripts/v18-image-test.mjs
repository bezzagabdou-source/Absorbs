#!/usr/bin/env node
/**
 * NEXUS ATLAS v18 — اختبار محرّك التصميم
 * Compiles src/lib/atlas-image.ts standalone and checks that the art director
 * recognises real Algerian / multilingual requests.
 *
 * Usage: node scripts/v18-image-test.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-img-"));

fs.writeFileSync(
  path.join(OUT, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      esModuleInterop: true,
      skipLibCheck: true,
      strict: false,
      rootDir: path.join(ROOT, "src").replace(/\\/g, "/"),
      outDir: ".",
    },
    files: [path.join(ROOT, "src/lib/atlas-image.ts").replace(/\\/g, "/")],
  })
);
execFileSync(process.execPath, [path.join(ROOT, "node_modules/typescript/bin/tsc"), "-p", path.join(OUT, "tsconfig.json")], {
  cwd: ROOT,
  stdio: "inherit",
});

const { planScene, suggestFraming } = await import(pathToFileURL(path.join(OUT, "lib/atlas-image.js")).href);

const CASES = [
  { q: "صمملي شعار لشركة قهوة جزائرية", want: "logo" },
  { q: "ديرلي ملصق إشهاري لبيتزا مع عنوان كبير", want: "poster" },
  { q: "photo d'un plat de couscous algérien", want: "food" },
  { q: "صورة قصبة الجزائر وقت الغروب", want: "architecture" },
  { q: "بورتريه راجل جزائري كبير في السن", want: "portrait" },
  { q: "خلفية مجردة بألوان بنفسجية للهاتف", want: "abstract" },
  { q: "logo for a tech startup", want: "logo" },
  { q: "صورة كاراكو جزائري بالذهب", want: "fashion" },
  { q: "مسجد الكتشاوة من الداخل", want: "religious" },
  { q: "منظر الصحراء في تمنراست بالنجوم", want: "landscape" },
  { q: "character design anime girl", want: "comic" },
  { q: "صورة سيارة 4x4 في الواد", want: "vehicle" },
  { q: "مباراة كرة القدم في ملعب 5 جويلية", want: "sport" },
  { q: "واجهة تطبيق dashboard بالذكاء الاصطناعي", want: "tech" },
  { q: "غرفة جلوس عصرية ديكور", want: "interior" },
];

let fails = 0;
console.log("\n══ NEXUS ATLAS v18 — محرك التصميم ══");
for (const c of CASES) {
  const p = planScene(c.q);
  const f = suggestFraming(p, null);
  const ok = p.scene === c.want;
  if (!ok) fails++;
  console.log(
    `${ok ? "✅" : "⚠️ "} "${c.q}"\n     → ${p.scene} (${p.label}) · aspect ${f.aspect ?? "—"} · text=${p.wantsText} dz=${p.algerian} · matched: ${p.matched.slice(0, 4).join(", ") || "—"}`
  );
  if (!ok) console.log(`     المتوقع: ${c.want}`);
}
console.log(`\n${fails === 0 ? "✅" : "⚠️ "} ${CASES.length - fails}/${CASES.length} مشهد مضبوط`);
const sample = planScene("صمملي ملصق إشهاري لمطعم كسكسي في الجزائر");
console.log(`\n── نموذج توجيه كامل ──\n${sample.direction}\n\nAVOID: ${sample.avoid}`);

fs.rmSync(OUT, { recursive: true, force: true });
