#!/usr/bin/env node
/**
 * 🎭 scripts/gen-stickers.mjs — سكريبت واحد يولّد ملصقات متحركة حقيقية للبوت:
 *    • .TGS  = Lottie JSON مضغوط gzip (512×512، 3 ثواني، ≤64KB) — الملصق المتحرك ديال تيليجرام
 *    • .png  = بوستر ثابت (ImageMagick) للمعرض وللاحتياط إلا رفضت تيليجرام TGS
 *    • manifest.json = لائحة النشرات (kind/title/emoji/files) اللي كيقراها البوت/اللوحة
 *    • index.html    = معرض HTML (كيتعرض على /stickers/ فالبوت واللوحة)
 *
 * التشغيل:  node scripts/gen-stickers.mjs        (من مجلد ft-contest-bot)
 * المصدر: shapes رياضية صرفة (قلب، نجمة، شرارة، برق، قصاصات، كاس…) — بلا حقوق، بلا مكتبات.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { renderFrames, encodeWebm, mkTmp, rmTmp, ffmpegPath } from "./render-lottie.mjs";

const OUT = path.resolve("public/stickers");
const SIZE = 512;
const C = SIZE / 2;
const FPS = 30;
const FRAMES = 90; // 3s

/* ────────────────────────── هندسة الأشكال ────────────────────────── */

/** قلب بارامتري: x=16sin³t , y=13cos t−5cos2t−2cos3t−cos4t */
function heartPts(scale = 12, n = 44, yShift = 8) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([+(x * scale).toFixed(2), +(-(y * scale) + yShift).toFixed(2)]);
  }
  return pts;
}
/** نجمة b رؤوس */
function starPts(outer, inner, points = 5, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    pts.push([+(Math.cos(a) * r).toFixed(2), +(Math.sin(a) * r).toFixed(2)]);
  }
  return pts;
}
/** شرارة 4 رؤوس (diamond sparkle) */
function sparklePts(len, waist) {
  return [
    [0, -len], [waist, -waist], [len, 0], [waist, waist],
    [0, len], [-waist, waist], [-len, 0], [-waist, -waist],
  ];
}
/** برق */
function boltPts(s = 1) {
  const p = [[26, -150], [-72, 20], [-8, 20], [-38, 150], [82, -34], [12, -34]];
  return p.map(([x, y]) => [+(x * s).toFixed(2), +(y * s).toFixed(2)]);
}
/** كاس الجائزة: حافة عريضة + جسم متقلّص (بلا تقاطع = كيبان مزيان فكل إطار) */
function cupPts(s = 1) {
  const raw = [
    [-124, -96], [124, -96], [112, -46], [92, 8], [62, 44], [-62, 44], [-92, 8], [-112, -46],
  ];
  return raw.map(([x, y]) => [+(x * s).toFixed(2), +(y * s).toFixed(2)]);
}

/* ────────────────────────── Lottie builders ────────────────────────── */

const rgb = (hex) => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, 1];
};
const easeIn = (n = 1) => ({ x: Array(n).fill(0.42), y: Array(n).fill(1) });
const easeOut = (n = 1) => ({ x: Array(n).fill(0.58), y: Array(n).fill(0) });

/** مسار مضلع مغلق */
const pathShape = (pts) => ({
  ty: "sh",
  ks: { a: 0, k: { i: pts.map(() => [0, 0]), o: pts.map(() => [0, 0]), v: pts, c: true } },
  nm: "p",
});
const fill = (hex, o = 100) => ({ ty: "fl", c: { a: 0, k: rgb(hex) }, o: { a: 0, k: o }, r: 1, nm: "f" });
const stroke = (hex, w, o = 100) => ({ ty: "st", c: { a: 0, k: rgb(hex) }, o: { a: 0, k: o }, w: { a: 0, k: w }, lc: 2, lj: 2, ml: 4, nm: "s" });
const ellipse = (sx, sy) => ({ ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [sx, sy] }, nm: "e" });
const rect = (w, h, r = 0) => ({ ty: "rc", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [w, h] }, r: { a: 0, k: r }, nm: "r" });
/** تحويلات المجموعة — كيطبّع القيم المختصرة ({p:[0,40]}) لقاعدة Lottie {a:0,k:[…]} */
const normTr = (v, dflt) => (v === undefined ? dflt : Array.isArray(v) || typeof v === "number" ? { a: 0, k: v } : v);
const transform = (extra = {}) => ({
  ty: "tr",
  p: normTr(extra.p, { a: 0, k: [0, 0] }),
  a: normTr(extra.a, { a: 0, k: [0, 0] }),
  s: normTr(extra.s, { a: 0, k: [100, 100] }),
  r: normTr(extra.r, { a: 0, k: 0 }),
  o: normTr(extra.o, { a: 0, k: 100 }),
  sk: normTr(extra.sk, { a: 0, k: 0 }),
  sa: normTr(extra.sa, { a: 0, k: 0 }),
});
const group = (items, nm = "g", tr = {}) => ({ ty: "gr", it: [...items, transform(tr)], nm });

/** تايم-لين: keyframes من قيم [t0,v0].. → multi prop */
function anim(values, dim = 2) {
  const k = values.map(([t, v], i) => {
    const s = Array.isArray(v) ? v : [v];
    const node = { t, s: dim === 3 ? [s[0], s[1], s[2] ?? 100] : s };
    if (i < values.length - 1) { node.i = easeIn(s.length); node.o = easeOut(s.length); }
    return node;
  });
  return { a: 1, k };
}
const stat = (v) => ({ a: 0, k: v });

/** طبقة شكل كاملة */
function shapeLayer({ ind, name, groups, pos = [C, C], opacity = 100, scale, rotation, position, out = FRAMES, start = 0 }) {
  return {
    ddd: 0, ind, ty: 4, nm: name, sr: 1,
    ks: {
      o: stat(opacity),
      r: rotation || stat(0),
      p: position || stat(pos),
      a: stat([0, 0, 0]),
      s: scale || stat([100, 100, 100]),
    },
    ao: 0, shapes: groups, ip: start, op: out, st: start, bm: 0,
  };
}
/** 📄 مستند Lottie — الهالة «glow» دايماً فالاخير فاللائحة = فالخلفية (معيار Lottie: اللي أولاً فوق) */
const doc = (nm, layers) => {
  const back = layers.filter((l) => l && l.nm === "glow");
  const rest = layers.filter((l) => !(l && l.nm === "glow"));
  return { v: "5.7.4", fr: FPS, ip: 0, op: FRAMES, w: SIZE, h: SIZE, nm, ddd: 0, assets: [], layers: [...rest, ...back], markers: [] };
};

/* ────────────────────────── تصاميم الملصقات ────────────────────────── */

/** هالة (glow) : دواير شفافة كتنبض */
const glow = (hex, ind, size = 420) => shapeLayer({
  ind, name: "glow",
  groups: [group([ellipse(size, size), fill(hex, 26)])],
  scale: anim([[0, [92, 92]], [45, [112, 112]], [FRAMES, [92, 92]]]),
});

const HEART = (hex, { beat = false } = {}) => {
  const heart = shapeLayer({
    ind: 10, name: "heart",
    groups: [group([pathShape(heartPts(12.4)), fill(hex)])],
    scale: beat
      ? anim([[0, [100, 100]], [12, [118, 118]], [24, [100, 100]], [36, [114, 114]], [50, [98, 98]], [FRAMES, [100, 100]]])
      : anim([[0, [96, 96]], [45, [116, 116]], [FRAMES, [96, 96]]]),
  });
  return heart;
};

/** قلب كيولّع: قلب + توهج وردي + شين (高光 بلا تعبيرات) */
function fireHeart(hex, glowHex) {
  return doc("fire_heart", [
    glow(glowHex, 3, 470),
    shapeLayer({ ind: 5, name: "aura", groups: [group([pathShape(heartPts(13.6)), fill(glowHex, 34)])], scale: anim([[0, [104, 104]], [45, [122, 122]], [FRAMES, [104, 104]]]) }),
    HEART(hex, { beat: true }),
    shapeLayer({ ind: 12, name: "spark", groups: [group([pathShape(sparklePts(34, 9)), fill("#ffffff", 88)])], position: anim([[0, [C + 104, C - 104]], [45, [C + 128, C - 128]], [FRAMES, [C + 104, C - 104]]]), opacity: 90, scale: anim([[0, [70, 70]], [45, [120, 120]], [FRAMES, [70, 70]]]) }),
  ]);
}

function spinStar(hex, accent) {
  return doc("spin_star", [
    glow(accent, 2, 430),
    shapeLayer({ ind: 6, name: "ring", groups: [group([ellipse(330, 330), stroke(accent, 12, 55)])], rotation: anim([[0, -40], [FRAMES, 40]]) }),
    shapeLayer({ ind: 8, name: "star", groups: [group([pathShape(starPts(158, 66, 5)), fill(hex)])], rotation: anim([[0, 0], [FRAMES, 360]]) }),
    shapeLayer({ ind: 9, name: "star2", groups: [group([pathShape(starPts(96, 40, 5)), fill("#ffffff", 70)])], rotation: anim([[0, 360], [FRAMES, 0]]) }),
  ]);
}

function twinkle(hex, accent) {
  return doc("twinkle", [
    glow(accent, 2, 400),
    shapeLayer({ ind: 7, name: "big", groups: [group([pathShape(sparklePts(150, 34)), fill(hex)])], scale: anim([[0, [60, 60]], [30, [120, 120]], [60, [80, 80]], [FRAMES, [60, 60]]]), rotation: anim([[0, 0], [FRAMES, 90]]) }),
    shapeLayer({ ind: 8, name: "s1", groups: [group([pathShape(sparklePts(56, 13)), fill("#ffffff", 92)])], position: stat([C - 130, C + 110]), scale: anim([[0, [120, 120]], [45, [40, 40]], [FRAMES, [120, 120]]]) }),
    shapeLayer({ ind: 9, name: "s2", groups: [group([pathShape(sparklePts(44, 11)), fill(accent, 92)])], position: stat([C + 140, C - 120]), scale: anim([[0, [40, 40]], [45, [125, 125]], [FRAMES, [40, 40]]]) }),
  ]);
}

function boltFlash(hex, accent) {
  return doc("bolt", [
    glow(accent, 2, 440),
    shapeLayer({ ind: 6, name: "halo", groups: [group([pathShape(boltPts(1.22)), fill(accent, 40)])], opacity: anim([[0, [30]], [10, [100]], [20, [40]], [30, [95]], [FRAMES, [30]]]) }),
    shapeLayer({ ind: 7, name: "bolt", groups: [group([pathShape(boltPts(1)), fill(hex)])], scale: anim([[0, [94, 94]], [12, [112, 112]], [26, [98, 98]], [FRAMES, [94, 94]]]), opacity: anim([[0, [70]], [10, [100]], [22, [72]], [34, [100]], [FRAMES, [70]]]) }),
  ]);
}

function confetti(colors) {
  const pieces = colors.slice(0, 7).map((c, i) => {
    const a = (i / 7) * Math.PI * 2;
    const x = C + Math.cos(a) * 158;
    const y = C + Math.sin(a) * 158;
    return shapeLayer({
      ind: 20 + i, name: `c${i}`,
      groups: [group([rect(46, 26, 8), fill(c)])],
      position: anim([[0, [C, C + 40]], [24, [x, y]], [FRAMES, [C, C + 40]]]),
      rotation: anim([[0, [i * 40]], [FRAMES, [i * 40 + 300]]]),
      scale: anim([[0, [30, 30]], [24, [115, 115]], [60, [70, 70]], [FRAMES, [30, 30]]]),
    });
  });
  return doc("confetti", [
    glow("#ffd166", 2, 380),
    shapeLayer({ ind: 6, name: "core", groups: [group([pathShape(starPts(96, 40, 6)), fill("#ffffff", 85)])], scale: anim([[0, [60, 60]], [24, [130, 130]], [FRAMES, [60, 60]]]) }),
    ...pieces,
  ]);
}

function giftBox(hex, lid) {
  return doc("gift", [
    glow(lid, 2, 400),
    shapeLayer({
      ind: 8, name: "gift",
      groups: [
        group([rect(230, 190, 22), fill(hex)], { p: [0, 40] }),
        group([rect(270, 62, 16), fill(lid)], { p: [0, -58] }),
        group([rect(46, 236, 10), fill("#ffffff", 92)], { p: [0, 20] }),
        group([ellipse(74, 74), fill(lid)], { p: [-46, -104] }),
        group([ellipse(74, 74), fill(lid)], { p: [46, -104] }),
      ],
      position: anim([[0, [C, C + 8]], [18, [C, C - 32]], [36, [C, C + 8]], [54, [C, C - 18]], [70, [C, C + 8]], [FRAMES, [C, C + 8]]]),
      rotation: anim([[0, [-5]], [36, [5]], [FRAMES, [-5]]]),
    }),
  ]);
}

function trophy(hex, accent) {
  return doc("trophy", [
    glow(accent, 2, 450),
    shapeLayer({
      ind: 9, name: "cup",
      groups: [
        group([pathShape(cupPts(1)), fill(hex)]),
        group([rect(276, 34, 12), fill(accent)], { p: [0, -104] }),
        group([rect(56, 52, 8), fill(hex)], { p: [0, 70] }),
        group([rect(196, 32, 10), fill(hex)], { p: [0, 106] }),
        group([rect(268, 40, 14), fill(accent)], { p: [0, 146] }),
        group([ellipse(102, 102), stroke("#ffffff", 13, 76)], { p: [-156, -46] }),
        group([ellipse(102, 102), stroke("#ffffff", 13, 76)], { p: [156, -46] }),
      ],
      scale: anim([[0, [98, 98]], [45, [108, 108]], [FRAMES, [98, 98]]]),
    }),
    shapeLayer({ ind: 11, name: "shine", groups: [group([pathShape(sparklePts(60, 15)), fill("#ffffff", 95)])], position: anim([[0, [C - 90, C - 90]], [45, [C + 90, C - 130]], [FRAMES, [C - 90, C - 90]]]), scale: anim([[0, [50, 50]], [22, [120, 120]], [45, [60, 60]], [FRAMES, [50, 50]]]) }),
  ]);
}

function coinSpin(hex, edge) {
  return doc("coin", [
    glow(edge, 2, 420),
    shapeLayer({ ind: 7, name: "coin", groups: [group([ellipse(300, 300), fill(hex)]), group([ellipse(214, 214), stroke(edge, 16, 90)])], scale: anim([[0, [100, 100]], [22, [24, 100]], [45, [100, 100]], [67, [24, 100]], [FRAMES, [100, 100]]]) }),
    shapeLayer({ ind: 8, name: "star", groups: [group([pathShape(starPts(84, 36, 5, -Math.PI / 2)), fill("#fff8e1")])], scale: anim([[0, [100, 100]], [22, [18, 100]], [45, [100, 100]], [67, [18, 100]], [FRAMES, [100, 100]]]) }),
  ]);
}

function checkPop(hex, accent) {
  return doc("check", [
    shapeLayer({ ind: 6, name: "ring", groups: [group([ellipse(330, 330), stroke(accent, 26, 95)])], scale: anim([[0, [70, 70]], [30, [104, 104]], [FRAMES, [70, 70]]]) }),
    shapeLayer({ ind: 8, name: "check", groups: [group([pathShape([[-92, 6], [-26, 78], [108, -78], [70, -104], [-24, 12], [-62, -26]]), fill(hex)])], scale: anim([[0, [40, 40]], [26, [112, 112]], [44, [96, 96]], [FRAMES, [40, 40]]]) }),
  ]);
}

/* ────────────────────────── النشرات ────────────────────────── */

const PACKS = [
  { id: "ftfire", kind: "welcome", title: "FT 🔥 قلوب منّينة", builder: (h, g) => fireHeart(h, g), set: [
    ["❤️", "#ff2d55", "#ff9f0a"], ["🧡", "#ff7a18", "#ffd166"], ["💜", "#bf5af2", "#ff8fb8"],
    ["💙", "#0a84ff", "#64d2ff"], ["💛", "#ffd60a", "#fff3b0"], ["🤍", "#f5f5f7", "#c7c7cc"],
  ] },
  { id: "ftstars", kind: "more", title: "FT ⭐️ نجوم وشرارات", set: [
    ["⭐️", "#ffd60a", "#ff9f0a", spinStar], ["🌟", "#ffe58a", "#ffffff", spinStar],
    ["✨", "#64d2ff", "#0a84ff", twinkle], ["💫", "#bf5af2", "#ff8fb8", twinkle],
    ["🌠", "#30d158", "#a8f0c0", spinStar],
  ] },
  { id: "ftpower", kind: "react", title: "FT ⚡️ طاقة وتفاعلات", set: [
    ["⚡️", "#ffd60a", "#ff9f0a", boltFlash], ["🔥", "#ff453a", "#ff9f0a", boltFlash],
    ["💪", "#0a84ff", "#64d2ff", checkPop], ["🚀", "#ff2d55", "#ff9f0a", boltFlash],
    ["👍", "#30d158", "#a8f0c0", checkPop],
  ] },
  { id: "ftparty", kind: "shop", title: "FT 🎉 احتفال وهدايا", set: [
    ["🎉", "#ffd166", "#ff2d55", () => confetti(["#ff2d55", "#ffd166", "#0a84ff", "#30d158", "#bf5af2", "#ff9f0a", "#64d2ff"])],
    ["🎁", "#ff375f", "#ffd166", (h, g) => giftBox(h, g)],
    ["🥳", "#bf5af2", "#ffd60a", () => confetti(["#bf5af2", "#ffd60a", "#64d2ff", "#ff2d55", "#30d158", "#ffffff", "#ff9f0a"])],
    ["🪅", "#0a84ff", "#ff2d55", (h, g) => giftBox(h, g)],
    ["✨", "#64d2ff", "#0a84ff", twinkle],
  ] },
  { id: "ftwin", kind: "win", title: "FT 🏆 فوز وكؤوس", set: [
    ["🏆", "#ffd60a", "#ff9f0a", (h, g) => trophy(h, g)], ["🥇", "#ffb020", "#fff3b0", coinSpin],
    ["💰", "#30d158", "#a8f0c0", coinSpin], ["💯", "#ff453a", "#ffd60a", checkPop],
    ["👑", "#ffd60a", "#bf5af2", (h, g) => trophy(h, g)], ["✅", "#30d158", "#64d2ff", checkPop],
  ] },
];

/* ────────────────────────── بوسترات PNG ────────────────────────── */

const rgba = (hex, a = 1) => {
  const h = hex.replace("#", "");
  const [r, g, bl] = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return `rgba(${r},${g},${bl},${a})`;
};
const polyStr = (pts) => pts.map(([x, y]) => `${(C + x).toFixed(1)},${(C + y).toFixed(1)}`).join(" ");

function pngFor(packId, item, idx) {
  const [, c1, c2] = item;
  const d = [];
  const fillPoly = (pts, color, alpha = 1) => d.push(`-fill ${JSON.stringify(rgba(color, alpha))} -stroke none -draw "polygon ${polyStr(pts)}"`);
  if (packId === "ftfire") {
    d.push(`-fill none -stroke ${JSON.stringify(rgba(c2, 0.28))} -strokewidth 34 -draw "ellipse ${C},${C} 196,186 0,360"`);
    fillPoly(heartPts(14.2), c2, 0.45);
    fillPoly(heartPts(12.4), c1);
  } else if (packId === "ftstars") {
    d.push(`-fill none -stroke ${JSON.stringify(rgba(c2, 0.6))} -strokewidth 12 -draw "ellipse ${C},${C} 165,165 0,360"`);
    fillPoly(starPts(150, 62), c1);
    fillPoly(starPts(92, 38), "#ffffff", 0.7);
  } else if (packId === "ftpower") {
    fillPoly(boltPts(1.22), c2, 0.4);
    fillPoly(boltPts(1), c1);
  } else if (packId === "ftparty") {
    d.push(
      `-fill ${JSON.stringify(rgba(c1, 1))} -stroke none -draw "roundrectangle ${C - 115},${C - 55} ${C + 115},${C + 135} 22,22"`,
      `-fill ${JSON.stringify(rgba(c2, 1))} -stroke none -draw "roundrectangle ${C - 135},${C - 90} ${C + 135},${C - 28} 16,16"`,
      `-fill ${JSON.stringify(rgba("#ffffff", 0.95))} -stroke none -draw "rectangle ${C - 23},${C - 90} ${C + 23},${C + 135}"`,
      `-fill ${JSON.stringify(rgba(c2, 1))} -stroke none -draw "ellipse ${C - 46},${C - 104} 37,37 0,360"`,
      `-fill ${JSON.stringify(rgba(c2, 1))} -stroke none -draw "ellipse ${C + 46},${C - 104} 37,37 0,360"`,
    );
  } else {
    d.push(`-fill ${JSON.stringify(rgba(c2, 1))} -stroke none -draw "roundrectangle ${C - 138},${C - 121} ${C + 138},${C - 87} 12,12"`);
    fillPoly(cupPts(1), c1);
    d.push(
      `-fill ${JSON.stringify(rgba(c1, 1))} -stroke none -draw "roundrectangle ${C - 28},${C + 44} ${C + 28},${C + 96} 8,8"`,
      `-fill ${JSON.stringify(rgba(c1, 1))} -stroke none -draw "roundrectangle ${C - 98},${C + 90} ${C + 98},${C + 122} 10,10"`,
      `-fill ${JSON.stringify(rgba(c2, 1))} -stroke none -draw "roundrectangle ${C - 134},${C + 126} ${C + 134},${C + 166} 14,14"`,
      `-fill none -stroke ${JSON.stringify(rgba("#ffffff", 0.75))} -strokewidth 13 -draw "ellipse ${C - 156},${C - 46} 51,51 0,360"`,
      `-fill none -stroke ${JSON.stringify(rgba("#ffffff", 0.75))} -strokewidth 13 -draw "ellipse ${C + 156},${C - 46} 51,51 0,360"`,
      `-fill ${JSON.stringify(rgba("#ffffff", 0.95))} -stroke none -draw "polygon ${polyStr(sparklePts(52, 13).map(([x, y]) => [x - 88, y - 86]))}"`,
    );
  }
  const out = path.join(OUT, packId, `${idx}.png`);
  execFileSync("bash", ["-c", `convert -size ${SIZE}x${SIZE} xc:none ${d.join(" ")} -quality 92 ${JSON.stringify(out)}`], { stdio: "pipe" });
  // نسخة WEBP — هي الصيغة الثابتة اللي كيقبلها تيليجرام (static fallback)
  const webp = out.replace(/\.png$/, ".webp");
  try {
    execFileSync("bash", ["-c", `convert ${JSON.stringify(out)} -quality 84 ${JSON.stringify(webp)}`], { stdio: "pipe" });
  } catch (e) {
    console.warn("⚠ WEBP ما تولّاش:", String((e && e.message) || e).slice(0, 90));
  }
}

/* ────────────────────────── Build ────────────────────────── */

fs.mkdirSync(OUT, { recursive: true });
const manifest = { generatedAt: new Date().toISOString(), size: SIZE, fps: FPS, frames: FRAMES, packs: [] };
let count = 0;
for (const pack of PACKS) {
  const dir = path.join(OUT, pack.id);
  fs.mkdirSync(dir, { recursive: true });
  const items = [];
  pack.set.forEach((item, i) => {
    const [emoji, c1, c2, custom] = item;
    const lottie =
      pack.id === "ftfire" ? fireHeart(c1, c2)
      : custom ? (typeof custom === "function" ? custom(c1, c2) : twinkle(c1, c2))
      : spinStar(c1, c2);
    const json = JSON.stringify(lottie);
    const tgs = zlib.gzipSync(Buffer.from(json, "utf8"), { level: 9 });
    const tgsName = `${String(i + 1).padStart(2, "0")}.tgs`;
    const pngName = `${String(i + 1).padStart(2, "0")}.png`;
    fs.writeFileSync(path.join(dir, tgsName), tgs);
    fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(2, "0")}.json`), json);
    try { pngFor(pack.id, item, String(i + 1).padStart(2, "0")); } catch (e) { console.warn("✗ بوستر PNG فشل:", String(e.stderr || e).slice(0, 260)); }
    const webpName = pngName.replace(/\.png$/, ".webp");
    // 🎬 WEBM متحرك (VP9 + شفافية) — الصيغة الوحيدة اللي كيقبلها تيليجرام للمتحرك دابا
    let webmName = null;
    let webmBytes = 0;
    if (ffmpegPath()) {
      const stem = String(i + 1).padStart(2, "0");
      const tmp = mkTmp(stem);
      try {
        const VFPS = 10, VFRAMES = 30; // 3 ثواني (تيليجرام: ≤30fps)
        renderFrames(lottie, { frames: VFRAMES, size: SIZE, tmpDir: tmp });
        const enc = encodeWebm({ tmpDir: tmp, frames: VFRAMES, fps: VFPS, out: path.join(dir, `${stem}.webm`), size: SIZE });
        if (enc.ok && !enc.over) {
          webmName = `${pack.id}/${stem}.webm`;
          webmBytes = enc.bytes;
        } else console.warn(`⚠ ${stem}.webm: ${enc.over ? `كبير (${Math.round(enc.bytes / 1024)}KB)` : enc.note}`);
      } catch (e) {
        console.warn("⚠ WEBM فشل:", String(e.stderr || e.message || e).slice(0, 200));
      } finally {
        rmTmp(tmp);
      }
    }
    items.push({
      emoji,
      tgs: `${pack.id}/${tgsName}`,
      webm: webmName && fs.existsSync(path.join(OUT, webmName)) ? webmName : null,
      webmBytes: webmName ? webmBytes : 0,
      png: fs.existsSync(path.join(dir, pngName)) ? `${pack.id}/${pngName}` : null,
      webp: fs.existsSync(path.join(dir, webpName)) ? `${pack.id}/${webpName}` : null,
      json: `${pack.id}/${String(i + 1).padStart(2, "0")}.json`,
      bytes: tgs.length,
    });
    count++;
  });
  // ⚖️ النشرة إما كلها متحركة ولا كلها ثابتة — تيليجرام ما كيخلطش الصيغ فـ نشرة وحدة
  const LIM = 60 * 1024;
  if (!items.every((x) => x.webm && x.webmBytes > 0 && x.webmBytes <= LIM)) {
    items.forEach((x) => {
      x.webm = null;
      x.webmBytes = 0;
    });
  }
  manifest.packs.push({ id: pack.id, kind: pack.kind, title: pack.title, setName: `${pack.id}_by_bot`, format: items.every((x) => x.webm) ? "webm" : "tgs", items });
}
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

/* 📦 src/lib/stickerAssets.ts — الـ TGS مضمّن base64:
      البوت كيرفعهم لتيليجرام بلا ما يقرأ ملفات ولا يدي request لراسو (Vercel FS read-only). */
const baked = manifest.packs.map((p) => ({
  id: p.id,
  kind: p.kind,
  title: p.title,
  items: p.items.map((it) => ({
    emoji: it.emoji,
    tgsB64: fs.existsSync(path.join(OUT, it.tgs)) ? fs.readFileSync(path.join(OUT, it.tgs)).toString("base64") : "",
    webp: it.webp || null,
    png: it.png || null,
    webm: it.webm || null,
    webmBytes: it.webmBytes || 0,
  })),
}));
const TS_OUT = path.resolve("src/lib/stickerAssets.ts");
fs.writeFileSync(
  TS_OUT,
  [
    "/* ⚠️ مولّد بـ scripts/gen-stickers.mjs — ما تعدّلو بيدك. */",
    "/* 🎭 ملصقات البوت المتحركة (Lottie TGS · 512×512 · 3s) مضمّنة base64. */",
    "",
    `export type BakedItem = { emoji: string; tgsB64: string; webp: string | null; png: string | null; webm: string | null; webmBytes: number };`,
    `export type BakedPack = { id: string; kind: "welcome" | "react" | "more" | "win" | "shop"; title: string; items: BakedItem[] };`,
    "",
    `export const STICKER_ASSETS: BakedPack[] = ${JSON.stringify(baked)};`,
    "",
    `export const STICKER_ASSET_META = { size: ${SIZE}, fps: ${FPS}, frames: ${FRAMES}, packs: ${baked.length}, stickers: ${baked.reduce((n, p) => n + p.items.length, 0)} };`,
    "",
  ].join("\n"),
);

/* معرض HTML: كيستعمل lottie-player (LottieFiles CDN) على JSON اللي فالبوت */
const cards = manifest.packs
  .map(
    (p) => `<section><h3>${p.title} <small>${p.items.length} ملصق · TGS متحرك</small></h3><div class="g">${p.items
      .map(
        (it) =>
          `<figure><lottie-player src="/stickers/${it.json}" autoplay loop mode="normal"></lottie-player><figcaption>${it.emoji} <b>${Math.round(it.bytes / 1024)}KB</b></figcaption></figure>`,
      )
      .join("")}</div></section>`,
  )
  .join("");
fs.writeFileSync(
  path.join(OUT, "index.html"),
  `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>🎭 ملصقات البوت المتحركة</title><script src="https://cdn.jsdelivr.net/npm/@lottiefiles/lottie-player@2.0.12/dist/lottie-player.js"></script><style>body{margin:0;background:#0b0d12;color:#e8ecf4;font:15px/1.6 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;padding:20px}h1{font-size:22px;margin:0 0 4px}.sub{color:#8b93a7;margin:0 0 20px}section{background:#121620;border:1px solid #1e2431;border-radius:18px;padding:16px;margin:0 0 16px}h3{margin:0 0 12px}small{color:#8b93a7;font-weight:400}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px}figure{margin:0;background:#0f131b;border:1px solid #1e2431;border-radius:14px;padding:8px;text-align:center}lottie-player{width:100%;aspect-ratio:1}figcaption{font-size:12px;color:#8b93a7}</style></head><body><h1>🎭 ملصقات البوت المتحركة</h1><p class="sub">ملفات TGS حقيقية (Lottie 512×512 · 3s) — مولّدة بـ <code>scripts/gen-stickers.mjs</code>، بلا حقوق.</p>${cards}</body></html>`,
);
console.log(`✓ ${count} ملصق متحرك فـ ${manifest.packs.length} نشرة → ${OUT}`);
