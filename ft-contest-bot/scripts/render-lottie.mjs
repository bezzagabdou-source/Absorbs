#!/usr/bin/env node
/**
 * 🖼 scripts/render-lottie.mjs — مصغّر Lottie → إطارات PNG (ImageMagick) → WEBM VP9 (ffmpeg)
 *
 * كيقرأ نفس البنية اللي كيتولّد فـ `gen-stickers.mjs` (طبقات + مجموعات + polys/ellipse/rect)
 * ويرسم كل إطار بتحويلات حقيقية (translate/rotate/scale) — بلا مكتبات خارجية.
 * الهدف: .webm متحرك (VP9 + قناة الشفافية) وهو الوحيد اللي كيقبلو تيليجرام دابا للملصق المتحرك.
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/* ─────────────── أدواتffmpeg ─────────────── */
let FF = null;
export function ffmpegPath() {
  if (FF !== null) return FF;
  const env = String(process.env.FFMPEG_PATH || "").trim();
  if (env && fs.existsSync(env)) return (FF = env);
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "pipe" });
    return (FF = "ffmpeg");
  } catch {
    /* كمّل */
  }
  try {
    const out = execSync('python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"', { encoding: "utf8", timeout: 60000 });
    const p = out.trim().split("\n").pop();
    if (p && fs.existsSync(p)) return (FF = p);
  } catch {
    /* ما كاينش */
  }
  return (FF = "");
}

/* ─────────────── رياضيات المصفوفات ─────────────── */
const T = (x, y) => [1, 0, 0, 1, x, y];
const R = (deg) => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, s, -s, c, 0, 0];
};
const S = (x, y) => [x, 0, 0, y, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const pt = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** قيمةخاصية Lottie فالإطار f (a=0 → ثابت، وإلا keyframes مع تنعيم) */
function val(prop, f, dflt) {
  if (prop === null || prop === undefined) return dflt;
  // القيم المختصرة (رقم/مصفوفة) بحال `group(items, "g", { p: [0, 40] })`
  if (Array.isArray(prop)) return prop;
  if (typeof prop === "number") return prop;
  if (prop.a === 0) return prop.k === undefined ? dflt : prop.k;
  const k = prop.k || [];
  if (!k.length) return dflt;
  if (f <= k[0].t) return k[0].s;
  const last = k[k.length - 1];
  if (f >= last.t) return last.s;
  for (let i = 0; i < k.length - 1; i++) {
    const A = k[i];
    const B = k[i + 1];
    if (f >= A.t && f <= B.t) {
      const u = smooth((f - A.t) / Math.max(1e-6, B.t - A.t));
      const a = A.s || [];
      const b = B.s || [];
      return a.map((v, j) => v + ((b[j] === undefined ? v : b[j]) - v) * u);
    }
  }
  return last.s;
}

const num = (v, d = 100) => (Array.isArray(v) ? Number(v[0]) : Number(v === undefined ? d : v));
const rgba = (c, a) => {
  const r = Math.round(Math.max(0, Math.min(1, Number(c?.[0] ?? 0))) * 255);
  const g = Math.round(Math.max(0, Math.min(1, Number(c?.[1] ?? 0))) * 255);
  const b = Math.round(Math.max(0, Math.min(1, Number(c?.[2] ?? 0))) * 255);
  const al = Math.round(Math.max(0, Math.min(1, a)) * 1000) / 1000;
  return `rgba(${r},${g},${b},${al})`;
};
const poly = (pts) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

/**
 * رسم إطار واحد → سلسلة أوامر ImageMagick.
 * @param doc   مستند Lottie (من doc(...))
 * @param f     رقم الإطار (0..op)
 */
export function drawsForFrame(doc, f) {
  const size = doc.w || 512;
  const cx = size / 2;
  const out = [];
  const layers = [...(doc.layers || [])].reverse(); // معيار Lottie: الطبقة الأولى فوق → ترتسم بالاخير
  for (const L of layers) {
    const ks = L.ks || {};
    const op = Math.max(0, Math.min(1, num(val(ks.o, f, 100), 100) / 100));
    if (op <= 0.02) continue;
    const sc = val(ks.s, f, [100, 100]);
    const pos = val(ks.p, f, [cx, cx]);
    const rot = num(val(ks.r, f, 0), 0);
    const anch = val(ks.a, f, [0, 0]);
    let m = T(pos[0], pos[1]);
    m = mul(m, R(rot));
    m = mul(m, S((sc[0] || 100) / 100, (sc[1] || 100) / 100));
    if (anch && (anch[0] || anch[1])) m = mul(m, T(-anch[0], -anch[1]));
    const sx = Math.abs((sc[0] || 100) / 100);
    for (const g of L.shapes || []) {
      if (g.ty !== "gr") continue;
      const items = g.it || [];
      const lastIt = items[items.length - 1];
      const tr =
        items.find((x) => x.ty === "tr") ||
        (lastIt && !lastIt.ty && (lastIt.p || lastIt.s || lastIt.o) ? lastIt : {});
      const go = val(tr.p, f, [0, 0]);
      const gsc = val(tr.s, f, [100, 100]);
      const grot = num(val(tr.r, f, 0), 0);
      const gop = Math.max(0, Math.min(1, num(val(tr.o, f, 100), 100) / 100));
      let gm = mul(m, T(go[0] || 0, go[1] || 0));
      gm = mul(gm, R(grot));
      gm = mul(gm, S((gsc[0] || 100) / 100, (gsc[1] || 100) / 100));
      const alpha = op * gop;
      if (alpha <= 0.02) continue;
      const shape = items.find((x) => x.ty === "sh" || x.ty === "el" || x.ty === "rc");
      const fl = items.find((x) => x.ty === "fl");
      const st = items.find((x) => x.ty === "st");
      if (!shape) continue;
      const paint = fl || st;
      if (!paint) continue;
      const col = paint.c?.k || [1, 1, 1, 1];
      const pOp = Math.max(0, Math.min(1, num(paint.o?.k === undefined ? 100 : (paint.o.a === 0 ? paint.o.k : val(paint.o, f, 100)), 100) / 100));
      const a = alpha * pOp;
      if (a <= 0.02) continue;
      const strokeW = st ? num(val(st.w, f, st.w?.k ?? 4) , 4) * Math.max(0.15, sx) : 0;
      if (shape.ty === "sh") {
        const v = ((shape.ks?.a === 0 ? shape.ks.k : val(shape.ks, f, null)) || {}).v || shape.ks?.k?.v || [];
        if (!v.length) continue;
        const P = v.map((p) => pt(gm, p));
        if (fl) out.push(`-fill ${JSON.stringify(rgba(col, a))} -stroke none -draw "polygon ${poly(P)}"`);
        if (st) out.push(`-fill none -stroke ${JSON.stringify(rgba(st.c?.k || col, a))} -strokewidth ${strokeW.toFixed(1)} -draw "${fl ? "polyline" : "polygon"} ${poly(P)}"`);
      } else if (shape.ty === "el") {
        const s = val(shape.s, f, shape.s?.k || [1, 1]);
        const rx = Math.abs((s[0] || 1) / 2) * Math.abs((gsc[0] || 100) / 100) * sx;
        const ry = Math.abs((s[1] || 1) / 2) * Math.abs((gsc[1] || 100) / 100) * Math.abs((sc[1] || 100) / 100);
        const c0 = pt(gm, [0, 0]);
        const cmd = `ellipse ${c0[0].toFixed(1)},${c0[1].toFixed(1)} ${Math.max(0.5, rx).toFixed(1)},${Math.max(0.5, ry).toFixed(1)} 0,360`;
        if (fl) out.push(`-fill ${JSON.stringify(rgba(col, a))} -stroke none -draw "${cmd}"`);
        if (st) out.push(`-fill none -stroke ${JSON.stringify(rgba(st.c?.k || col, a))} -strokewidth ${strokeW.toFixed(1)} -draw "${cmd}"`);
      } else if (shape.ty === "rc") {
        const s = val(shape.s, f, shape.s?.k || [1, 1]);
        const w = (s[0] || 1) / 2;
        const h = (s[1] || 1) / 2;
        const corners = [
          [-w, -h],
          [w, -h],
          [w, h],
          [-w, h],
        ].map((p) => pt(gm, p));
        if (fl) out.push(`-fill ${JSON.stringify(rgba(col, a))} -stroke none -draw "polygon ${poly(corners)}"`);
        if (st) out.push(`-fill none -stroke ${JSON.stringify(rgba(st.c?.k || col, a))} -strokewidth ${strokeW.toFixed(1)} -draw "polygon ${poly(corners)}"`);
      }
    }
  }
  return out;
}

/** تولّد إطارات PNG (شفّافة) فمجلد مؤقت */
export function renderFrames(doc, { frames = 45, size = 512, tmpDir }) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const src = doc.op || frames;
  const files = [];
  for (let i = 0; i < frames; i++) {
    const f = (i / frames) * src;
    const d = drawsForFrame(doc, f);
    const file = path.join(tmpDir, `f${String(i).padStart(3, "0")}.png`);
    const cmd = `convert -size ${size}x${size} xc:none ${d.join(" ")} ${JSON.stringify(file)}`;
    execFileSync("bash", ["-c", cmd], { stdio: "pipe" });
    files.push(file);
  }
  return files;
}

/**
 * ترميز WEBM/VP9 مع قناة الشفافية (yuva420p) — الملصق المتحرك ديال تيليجرام.
 * @returns { bytes, ok, note }
 */
export function encodeWebm({ tmpDir, frames = 30, fps = 10, out, size = 512, maxBytes = 60 * 1024 }) {
  const ff = ffmpegPath();
  if (!ff) return { ok: false, bytes: 0, note: "ما كاينش ffmpeg فالمحيط (تثبت: pip install imageio-ffmpeg)" };
  let best = null;
  for (const crf of [30, 36, 42, 48, 54, 60]) {
    const tmp = out + ".tmp.webm";
    const cmd =
      `${JSON.stringify(ff)} -y -loglevel error -framerate ${fps} -i ${JSON.stringify(path.join(tmpDir, "f%03d.png"))} ` +
      `-frames:v ${frames} -vf "scale=${size}:${size}:flags=lanczos,format=yuva420p" ` +
      `-c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -b:v 0 -crf ${crf} -an -metadata title="ft-sticker" ${JSON.stringify(tmp)}`;
    try {
      execFileSync("bash", ["-c", cmd], { stdio: "pipe" });
    } catch (e) {
      return { ok: false, bytes: 0, note: `ffmpeg فشل: ${String(e.stderr || e.message || e).slice(0, 140)}` };
    }
    const bytes = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
    if (bytes > 0) best = { crf, bytes, tmp };
    if (bytes && bytes <= maxBytes) break;
  }
  if (!best) return { ok: false, bytes: 0, note: "ترميز فاشل" };
  fs.renameSync(best.tmp, out);
  return { ok: true, bytes: best.bytes, crf: best.crf, over: best.bytes > maxBytes };
}

export function mkTmp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ftstk-${name}-`));
}
export function rmTmp(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* لا شيء */
  }
}
