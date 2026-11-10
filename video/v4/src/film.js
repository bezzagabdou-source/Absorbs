// film.js — V4 «أنت تسافر الآن» · 35.000s · 30fps · hyper-kinetic Arabic space film
import { W, H, clamp, lerp, inv, smooth, easeOut, easeIn, easeInOut, expo, backOut, mulberry, hash, boot, starField } from './core.js';
import * as TY from './type.js';
import { earth as mkEarth, sun as mkSun, galaxy as mkGalaxy, cosmicWeb as mkWeb, softCloudTexture, warpTunnel, speedLines, highway, hyperTunnel } from './scenes3d.js';

const TL = await (await fetch('/src/timeline.json')).json();
const A = await boot({ bloom: { strength: 0.5, radius: 0.42, threshold: 0.92 }, exposure: 1.0 });
const T = A.THREE;
const tex = new T.TextureLoader();
const load = (u, srgb = true) => {
  const t = tex.load(u);
  t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
  t.generateMipmaps = false; t.minFilter = T.LinearFilter; t.magFilter = T.LinearFilter;
  t.wrapS = T.RepeatWrapping; t.wrapT = T.ClampToEdgeWrapping;
  return t;
};
const TEX = {
  day: load('/assets/tex/earth_atmos_2048.jpg'),
  night: load('/assets/tex/earth_lights_2048.png'),
  clouds: load('/assets/tex/earth_clouds_1024.png'),
};
async function allLoaded(list, timeout = 25000) {
  const t0 = performance.now();
  while (!list.every(t => t.image && t.image.width)) {
    if (performance.now() - t0 > timeout) throw new Error('texture timeout');
    await new Promise(r => requestAnimationFrame(r));
  }
}
await allLoaded(Object.values(TEX));
TEX.cloudsSoft = softCloudTexture(T, TEX.clouds.image);

const C = { ice: '#f4fbff', warm: '#fff6e6', accent: '#8fe3ff', gold: '#ffd08a', dim: 'rgba(198,222,250,0.7)', hot: '#ffb347' };
const beats = TL.beats;
const BI = Object.fromEntries(beats.map((b, i) => [b.id, i]));

// ---------------------------------------------------------------- rig
const stars = starField(T, 6000, 130, 1600); A.scene.add(stars);
const E = mkEarth(A, TEX, { r: 2.2, sunPos: [6.5, 2.2, 4.2], lights: 0.9, clouds: 0.5, atmo: 1.2 });
A.scene.add(E.group);
const SUN = mkSun(A, { r: 1 }); SUN.group.visible = false; A.scene.add(SUN.group);
const GAL = mkGalaxy(A, { n: 80000, r: 1, arms: 4, px: 300, bright: 0.22 }); GAL.group.visible = false; A.scene.add(GAL.group);
const WEB = mkWeb(A, { nodes: 240, span: 44, links: 3 }); WEB.group.visible = false; A.scene.add(WEB.group);
const TUN = warpTunnel(A, { n: 2400, len: 95, speed: 46, gain: 1.0, radius: 15 }); TUN.group.visible = false; A.scene.add(TUN.group);
const LINES = speedLines(A, { n: 420, len: 130 }); LINES.group.visible = false; A.scene.add(LINES.group);
const HWY = highway(A, { n: 1500, r: 15 }); HWY.group.visible = false; A.scene.add(HWY.group);
const HYP = hyperTunnel(A, { r: 9.5, len: 130 }); HYP.group.visible = false; A.scene.add(HYP.group);

function cam(fov, pos, look) {
  A.camera.fov = fov; A.camera.position.set(pos[0], pos[1], pos[2]);
  A.camera.lookAt(look[0], look[1], look[2]); A.camera.updateProjectionMatrix();
}
const beatOf = (t) => { for (let i = beats.length - 1; i >= 0; i--) if (t >= beats[i].start) return i; return 0; };
const bp = (t, i) => clamp((t - beats[i].start) / (beats[i].end - beats[i].start));
const vp = (t, i) => clamp((t - beats[i].vo) / beats[i].vodur);

// ---------------------------------------------------------------- overlays
function hud(step, total = 8) {
  const x = A.fgx, m = 40, L = 26;
  x.save(); x.globalAlpha = 0.20; x.strokeStyle = C.accent; x.lineWidth = 1.5;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const px = sx > 0 ? m : W - m, py = sy > 0 ? m : H - m;
    x.beginPath(); x.moveTo(px, py + sy * L); x.lineTo(px, py); x.lineTo(px + sx * L, py); x.stroke();
  }
  x.restore();
  TY.kicker(x, 'N E X U S', { x: m + 14, y: m + 38, align: 'left', size: 18, track: 6, alpha: 0.45, fill: '#cfe6ff' });
  TY.kicker(x, `${String(step).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, { x: W - m - 14, y: m + 38, align: 'right', size: 18, track: 6, alpha: 0.45, fill: '#cfe6ff' });
  TY.pips(x, total, step - 1, 0, { y: H - 78 });
}

function scrim(x, y0 = 900, h = 1020, a = 0.66) {
  const g = x.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.4, `rgba(0,0,0,${a * 0.62})`);
  g.addColorStop(1, `rgba(0,0,0,${a})`);
  x.fillStyle = g; x.fillRect(0, y0, W, h);
}

function bokeh(x, t, n = 16, alpha = 0.16) {
  const r = mulberry(31);
  x.save(); x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const sx = r(), ph = r() * 6.28, sp = 0.25 + r() * 0.6, sz = 4 + Math.pow(r(), 2) * 24;
    const px = sx * W + Math.sin(t * 0.3 * sp + ph) * 24;
    const py = ((r() + t * 0.004 * sp) % 1) * H;
    const a = alpha * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.8 + ph)));
    const g = x.createRadialGradient(px, py, 0, px, py, sz);
    g.addColorStop(0, `rgba(200,230,255,${a * 0.75})`);
    g.addColorStop(0.6, `rgba(130,190,255,${a * 0.2})`);
    g.addColorStop(1, 'rgba(90,150,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, sz, 0, 6.283); x.fill();
  }
  x.restore();
}

// kinetic card: black panel with a big number / word that punches in
function punchWord(x, str, o, p) {
  if (p <= 0) return;
  const e = backOut(clamp(p * 2.6), 2.6);
  const sc = lerp(1.55, 1, e);
  x.save();
  x.translate(o.x, o.y); x.scale(sc, sc);
  x.globalAlpha = clamp(p * 5);
  TY.gradLine(x, str, { x: 0, y: 0, size: o.size || 130, weight: 900, family: o.family || 'Kuf', align: 'center',
    c0: o.c0 || '#ffffff', c1: o.c1 || '#eaf7ff', c2: o.c2 || '#8fe3ff', glow: o.glow ?? 24, glowColor: o.glowColor || 'rgba(150,220,255,.7)' });
  x.restore();
}

// radial speed burst (anime-style impact frames)
function impactBurst(x, t, p, cx = W / 2, cy = 820, n = 120, color = 'rgba(210,240,255,') {
  if (p <= 0) return;
  const e = easeOut(clamp(p), 2);
  const r = mulberry(9);
  x.save(); x.globalCompositeOperation = 'lighter';
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 6.283 + t * 0.4;
    const L = (250 + 1500 * e * Math.pow(r(), 1.4)) * (0.3 + 0.7 * e);
    x.strokeStyle = color + (0.05 + 0.5 * e * r()) + ')';
    x.lineWidth = 0.7 + 2.2 * r();
    x.beginPath(); x.moveTo(cx + Math.cos(a) * (60 + 120 * e), cy + Math.sin(a) * (60 + 120 * e));
    x.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); x.stroke();
  }
  x.restore();
}

// ================================================================ BEATS
// 01 — HOOK: 0.2s of black, then "أنت لا تجلس… أنت تسافر الآن."
function sHook(t, p, v) {
  E.group.visible = true;
  // slow push, then a violent dolly-in on the last third
  const q = easeIn(clamp((p - 0.35) / 0.65), 2.2);
  cam(lerp(34, 44, p) + 6 * q, [0, lerp(0.5, -0.2, p), lerp(9.2, 4.4, q)], [0, 0.2, 0]);
  E.spin(t + 20, 0.06, 0.075);
  A.bloom.strength = lerp(0.42, 0.65, p); A.bloom.threshold = 0.92;
  A.grade({ vig: 0.86, grain: 0.035, expo: 1.0, time: t, chroma: 0.05 + 0.25 * p });
  const x = A.fgx;
  scrim(x, 820, 1100, 0.72);
  const vp1 = vp(t, 0);
  TY.kicker(x, 'SOMETHING IS MOVING', { x: W / 2, y: 560, align: 'center', size: 20, track: 12, fill: 'rgba(180,225,255,.85)' }, inv(0, .4, vp1));
  TY.wordReveal(x, 'أنت لا تجلس…', { x: W / 2, y: 1180, size: 104, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, vp1, 0.2);
  TY.wordReveal(x, 'أنت تسافر الآن.', { x: W / 2, y: 1352, size: 128, weight: 900, family: 'Kuf', fill: C.accent, align: 'center', glow: 30, glowColor: 'rgba(140,220,255,.85)' }, clamp((vp1 - 0.42) / 0.58), 0.2);
  hud(1);
  return {};
}

// 02 — 107,000 KM/H : earth + orbit stream
function sOrbit(t, p, v) {
  E.group.visible = true;
  const d = lerp(9.4, 7.4, easeOut(p, 2));
  cam(lerp(36, 40, p), [0, 0.2, d], [0, 0.1, 0]);
  E.spin(t + 20, 0.10, 0.12);
  A.bloom.strength = 0.48; A.bloom.threshold = 0.92;
  A.grade({ vig: 0.82, grain: 0.035, expo: 1.0, time: t, chroma: 0.2 + 0.2 * Math.sin(p * 9) });
  const x = A.fgx;
  // orbit streaks around the globe
  const cx = W / 2, cy = 800;
  x.save(); x.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * 6.283 + t * 2.4;
    const r0 = 470 + (k % 4) * 46;
    const len = 90 + 60 * hash(k * 3.3);
    const a2 = a + len / r0;
    x.strokeStyle = `rgba(180,225,255,${0.10 + 0.24 * hash(k * 7.1)})`;
    x.lineWidth = 1.2 + 2.4 * hash(k * 5.5);
    x.beginPath();
    x.arc(cx, cy, r0, a, a2);
    x.stroke();
  }
  x.restore();
  scrim(x, 980, 940, 0.72);
  const vp1 = vp(t, 1);
  TY.kicker(x, 'EARTH ORBIT · 107,000 KM/H', { x: W / 2, y: 500, align: 'center', size: 21, track: 9, fill: 'rgba(190,228,255,.9)' }, inv(0, .25, vp1));
  TY.wordReveal(x, 'الأرض تدور', { x: W / 2, y: 1200, size: 96, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, vp1, 0.18);
  TY.wordReveal(x, 'حول الشمس.', { x: W / 2, y: 1330, size: 96, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, clamp((vp1 - .22) / .78), 0.18);
  const np = clamp((vp1 - 0.42) / 0.58);
  if (np > 0) {
    const sc = lerp(1.5, 1, backOut(clamp(np * 2.6), 2.2));
    x.save(); x.translate(W / 2, 1540); x.scale(sc, sc); x.globalAlpha = clamp(np * 4);
    TY.counter(x, { from: 0, to: 107000, x: 0, y: 0, size: 132, family: 'Anton', fill: C.gold, align: 'center', glow: 26, glowColor: 'rgba(255,200,110,.75)' }, clamp(np * 1.2));
    x.restore();
    TY.kicker(x, 'KM / HOUR', { x: W / 2, y: 1610, align: 'center', size: 24, track: 12, fill: 'rgba(255,225,180,.85)', alpha: clamp(np * 3) }, 1);
  }
  hud(2);
  return {};
}

// 03 — 800,000 KM/H : sun + milky way highway
function sSunRun(t, p, v) {
  SUN.group.visible = true; HWY.group.visible = true;
  const q = easeInOut(clamp(p * 1.05));
  cam(lerp(46, 38, p), [lerp(-7, -1.5, q), lerp(3.4, 1.2, q), lerp(13, 7.6, q)], [0, 0, 0]);
  SUN.group.position.set(0, 0, 0);
  SUN.group.scale.setScalar(lerp(1.6, 2.1, q));
  SUN.update(t);
  HWY.group.rotation.set(0.42, t * 0.05, 0.18);
  HWY.group.scale.setScalar(lerp(1.5, 2.4, q));
  HWY.update(t, 0.9, 0.2);
  A.bloom.strength = lerp(0.55, 0.8, p); A.bloom.threshold = 0.9; A.bloom.radius = 0.5;
  A.grade({ vig: 0.8, grain: 0.035, expo: 1.0, time: t, chroma: 0.25, warm: 'rgba(255,150,60,0.10)' });
  const x = A.fgx;
  // heat haze bands
  x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.07;
  for (let k = 0; k < 8; k++) { x.fillStyle = 'rgba(255,190,110,1)'; x.fillRect(0, 160 + k * 220 + Math.sin(t * 3 + k) * 14, W, 2); }
  x.restore();
  scrim(x, 1000, 920, 0.74);
  const vp1 = vp(t, 2);
  TY.kicker(x, 'THE SUN · 800,000 KM/H', { x: W - 84, y: 470, align: 'right', size: 20, track: 8, fill: 'rgba(255,232,200,.9)' }, inv(0, .25, vp1));
  TY.wordReveal(x, 'والشمس نفسها', { x: W - 84, y: 1230, size: 92, weight: 900, family: 'Alex', fill: C.warm, align: 'right', glow: 16, glowColor: 'rgba(255,180,90,.5)' }, vp1, 0.18);
  TY.wordReveal(x, 'تجري في المجرة.', { x: W - 84, y: 1360, size: 92, weight: 900, family: 'Alex', fill: C.ice, align: 'right' }, clamp((vp1 - .3) / .7), 0.18);
  const np = clamp((vp1 - 0.55) / 0.45);
  if (np > 0) {
    const sc = lerp(1.45, 1, backOut(clamp(np * 2.6), 2.2));
    x.save(); x.translate(W - 330, 1580); x.scale(sc, sc); x.globalAlpha = clamp(np * 4);
    TY.counter(x, { from: 0, to: 800000, x: 0, y: 0, size: 118, family: 'Anton', fill: C.gold, align: 'center', glow: 24, glowColor: 'rgba(255,200,110,.75)' }, clamp(np * 1.2));
    x.restore();
    TY.kicker(x, 'KM / HOUR', { x: W - 84, y: 1644, align: 'right', size: 22, track: 10, fill: 'rgba(255,225,180,.85)', alpha: clamp(np * 3) }, 1);
  }
  hud(3);
  return { flash: Math.max(0, 0.25 - p) * 0.55 };
}

// 04 — the great attractor: warp tunnel + unknown direction
function sAttractor(t, p, v) {
  HYP.group.visible = true; LINES.group.visible = true;
  const acc = easeIn(clamp(p * 1.15), 1.7);
  cam(lerp(58, 74, p), [Math.sin(t * 0.7) * 0.8, Math.cos(t * 0.55) * 0.6, 7.0], [0, 0, -40]);
  HYP.group.position.set(0, 0, -20);
  HYP.mat.uniforms.uGain.value = lerp(1.6, 3.4, acc);
  HYP.update(t, lerp(0.5, 2.4, acc));
  HYP.group.rotation.z = t * 0.6;
  LINES.update(t, lerp(120, 420, acc), lerp(8, 30, acc));
  A.bloom.strength = lerp(0.65, 1.0, p); A.bloom.threshold = 0.82; A.bloom.radius = 0.62;
  A.grade({ vig: 0.9, grain: 0.045, expo: 1.05, time: t });
  const x = A.fgx;
  // radial speed streaks (2D, cinematic, no colour fringing)
  const rr = mulberry(17);
  x.save(); x.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 150; k++) {
    const a = rr() * 6.283, r0 = 90 + rr() * 520 * (1 - acc * 0.35);
    const L = (140 + 700 * acc * Math.pow(rr(), 0.7));
    const cx = W / 2, cy = 900;
    const g = x.createLinearGradient(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0,
      cx + Math.cos(a) * (r0 + L), cy + Math.sin(a) * (r0 + L));
    g.addColorStop(0, `rgba(190,230,255,0)`);
    g.addColorStop(0.45, `rgba(200,235,255,${0.10 + 0.34 * rr()})`);
    g.addColorStop(1, `rgba(150,200,255,0)`);
    x.strokeStyle = g; x.lineWidth = 0.8 + 2.6 * rr();
    x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    x.lineTo(cx + Math.cos(a) * (r0 + L), cy + Math.sin(a) * (r0 + L)); x.stroke();
  }
  x.restore();
  // energy core at the vanishing point
  x.save(); x.globalCompositeOperation = 'lighter';
  const cg = x.createRadialGradient(W / 2, 900, 0, W / 2, 900, 520 * (0.7 + 0.5 * acc));
  cg.addColorStop(0, `rgba(190,230,255,${0.30 + 0.35 * acc})`);
  cg.addColorStop(0.18, `rgba(110,180,255,${0.16 + 0.20 * acc})`);
  cg.addColorStop(0.55, 'rgba(70,120,255,0.05)');
  cg.addColorStop(1, 'rgba(40,80,200,0)');
  x.fillStyle = cg; x.beginPath(); x.arc(W / 2, 900, 520 * (0.7 + 0.5 * acc), 0, 6.283); x.fill();
  x.restore();
  // heavy speed vignette
  const vg = x.createRadialGradient(W / 2, 900, 200, W / 2, 900, 1080);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.7, `rgba(0,0,0,${0.25 + 0.3 * acc})`); vg.addColorStop(1, `rgba(0,0,0,${0.8 + 0.15 * acc})`);
  x.fillStyle = vg; x.fillRect(0, 0, W, H);
  scrim(x, 1120, 800, 0.62);
  const vp1 = vp(t, 3);
  TY.kicker(x, 'UNKNOWN DIRECTION', { x: W / 2, y: 470, align: 'center', size: 21, track: 11, fill: 'rgba(200,230,255,.9)' }, inv(0, .25, vp1));
  TY.wordReveal(x, 'والمجرة كلها', { x: W / 2, y: 1290, size: 94, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, vp1, 0.16);
  TY.wordReveal(x, 'تندفع نحو شيء', { x: W / 2, y: 1420, size: 94, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, clamp((vp1 - .26) / .74), 0.16);
  const np = clamp((vp1 - 0.5) / 0.5);
  if (np > 0) punchWord(x, 'مجهول.', { x: W / 2, y: 1580, size: 142, c2: '#ff9f6a', glow: 30, glowColor: 'rgba(255,160,90,.8)' }, np);
  TY.wordReveal(x, 'لا أحد يعرف ما هو.', { x: W / 2, y: 1710, size: 66, weight: 700, family: 'Kuf', fill: C.dim, align: 'center' }, clamp((vp1 - 0.72) / 0.28), 0.14);
  hud(4);
  return { chroma: 0.35 + 0.5 * acc, shakeX: Math.sin(t * 60) * 0.005 * acc, shakeY: Math.cos(t * 51) * 0.005 * acc };
}

// 05 — but you are sitting
function sSitting(t, p, v) {
  E.group.visible = true;
  cam(lerp(30, 26, p), [0, 1.2, lerp(8.4, 7.4, p)], [0, 0.9, 0]);
  E.spin(t + 20, 0.03, 0.04);
  A.bloom.strength = 0.45; A.bloom.threshold = 0.92;
  A.grade({ vig: 0.95, grain: 0.04, expo: 0.94, time: t, chroma: 0 });
  const x = A.fgx;
  const vp1 = vp(t, 4);
  // big dead-simple type, brutal contrast
  x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, 0, W, H);
  TY.wordReveal(x, 'وأنت…', { x: W / 2, y: 780, size: 118, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, vp1, 0.24);
  const np = clamp((vp1 - 0.3) / 0.7);
  if (np > 0) punchWord(x, 'جالس', { x: W / 2, y: 980, size: 190, c2: '#ffd08a' }, np);
  TY.wordReveal(x, 'تشاهد هذا.', { x: W / 2, y: 1180, size: 104, weight: 800, family: 'Kuf', fill: C.dim, align: 'center' }, clamp((vp1 - 0.55) / 0.45), 0.2);
  hud(5);
  return {};
}

// 06 — 600 km every second
function sEverySecond(t, p, v) {
  E.group.visible = true; LINES.group.visible = true;
  const d = lerp(6.2, 4.2, easeInOut(p));
  cam(lerp(42, 50, p), [0, 0.4, d], [0, 0.2, 0]);
  E.spin(t + 20, 0.14, 0.17);
  LINES.update(t, 160, 10);
  A.bloom.strength = lerp(0.5, 0.75, p); A.bloom.threshold = 0.9;
  A.grade({ vig: 0.9, grain: 0.04, expo: 1.0, time: t, chroma: 0.35 });
  const x = A.fgx;
  scrim(x, 900, 1020, 0.72);
  const vp1 = vp(t, 5);
  TY.kicker(x, 'EVERY SECOND', { x: W / 2, y: 520, align: 'center', size: 22, track: 12, fill: 'rgba(200,232,255,.9)' }, inv(0, .25, vp1));
  TY.wordReveal(x, 'في كل ثانية…', { x: W / 2, y: 1120, size: 96, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, vp1, 0.2);
  const np = clamp((vp1 - 0.3) / 0.7);
  if (np > 0) {
    const sc = lerp(1.35, 1, backOut(clamp(np * 2.4), 2.0));
    x.save(); x.translate(W / 2, 1320); x.scale(sc, sc); x.globalAlpha = clamp(np * 4);
    TY.counter(x, { from: 0, to: 600, x: 0, y: 0, size: 230, family: 'Anton', fill: '#ffffff', align: 'center', glow: 34, glowColor: 'rgba(160,220,255,.8)' }, clamp(np * 1.3));
    x.restore();
  }
  TY.wordReveal(x, 'تقطع ستمئة كيلومتر.', { x: W / 2, y: 1480, size: 82, weight: 800, family: 'Kuf', fill: C.accent, align: 'center', glow: 18, glowColor: 'rgba(140,215,255,.6)' }, clamp((vp1 - 0.55) / 0.45), 0.16);
  hud(6);
  return { shakeX: Math.sin(t * 70) * 0.002, shakeY: Math.cos(t * 63) * 0.002 };
}

// 07 — and you feel nothing
function sNothing(t, p, v) {
  E.group.visible = true;
  cam(lerp(34, 30, p), [0, 0.6, lerp(9.6, 8.6, p)], [0, 0.4, 0]);
  E.spin(t + 20, 0.02, 0.03);
  A.bloom.strength = 0.4; A.bloom.threshold = 0.93;
  A.grade({ vig: 0.98, grain: 0.035, expo: 0.9, time: t, chroma: 0 });
  const x = A.fgx;
  x.fillStyle = 'rgba(0,0,0,0.62)'; x.fillRect(0, 0, W, H);
  const vp1 = vp(t, 6);
  TY.wordReveal(x, 'ولا تشعر', { x: W / 2, y: 860, size: 118, weight: 900, family: 'Kuf', fill: C.ice, align: 'center' }, vp1, 0.22);
  punchWord(x, 'بشيء.', { x: W / 2, y: 1100, size: 190, c2: '#9db4cc', glow: 8 }, clamp((vp1 - .5) / .5));
  hud(7);
  return {};
}

// 08 — end card, loop-friendly
function sEnd(t, p, v) {
  E.group.visible = true;
  const d = lerp(8.6, 24, easeOut(p, 2));
  cam(38 + 5 * p, [0, lerp(0.4, 2.4, p), d], [0, 0.5, 0]);
  E.spin(t + 20, 0.05, 0.06);
  A.bloom.strength = lerp(0.9, 0.5, easeOut(p, 2)); A.bloom.threshold = 0.88;
  A.grade({ vig: 0.94, grain: 0.03, expo: lerp(1.05, 0.95, p), time: t, chroma: 0 });
  const x = A.fgx;
  impactBurst(x, t, clamp((p - 0.02) / 0.4), W / 2, 640, 130);
  const tpe = easeOut(clamp(p * 1.9), 3);
  x.save(); x.globalAlpha = tpe;
  const sc = lerp(1.16, 1, easeOut(clamp(p * 1.6), 3));
  x.translate(W / 2, 610); x.scale(sc, sc);
  TY.gradLine(x, 'الفضاء بالعربي', { x: 0, y: 0, size: 100, weight: 900, family: 'Alex', align: 'center', c0: '#fff', c1: '#eaf7ff', c2: '#9fe1ff', glow: 16, glowColor: 'rgba(150,205,255,.55)' });
  x.restore();
  TY.kicker(x, 'N E X U S', { x: W / 2, y: 736, align: 'center', size: 28, track: 16, fill: C.accent, alpha: tpe }, 1);
  const cp = clamp((p - 0.38) / 0.34);
  if (cp > 0) {
    const al = easeOut(cp, 3);
    x.save(); x.globalAlpha = al;
    TY.roundRect(x, W / 2 - 280, 1090, 560, 100, 50);
    const g = x.createLinearGradient(W / 2 - 280, 0, W / 2 + 280, 0);
    g.addColorStop(0, 'rgba(84,190,255,0.10)'); g.addColorStop(0.5, 'rgba(140,225,255,0.28)'); g.addColorStop(1, 'rgba(84,190,255,0.10)');
    x.fillStyle = g; x.fill(); x.strokeStyle = 'rgba(160,225,255,0.85)'; x.lineWidth = 2.2; x.stroke();
    x.restore();
    TY.line(x, 'تابِع NEXUS', { x: W / 2, y: 1158, size: 42, weight: 800, family: 'Kuf', fill: '#fff', align: 'center', glow: 12, glowColor: 'rgba(160,225,255,.6)', alpha: al });
  }
  TY.kicker(x, 'حلقة جديدة كل يوم', { x: W / 2, y: 1262, align: 'center', size: 28, track: 1, fill: 'rgba(200,225,255,.75)', alpha: easeOut(clamp((p - 0.6) / 0.3), 3) }, 1);
  return { fadeTo: clamp((p - 0.9) / 0.1) * 0.9, flash: Math.max(0, 0.28 - p) * 0.55 };
}

const BEAT_FN = [sHook, sOrbit, sSunRun, sAttractor, sSitting, sEverySecond, sNothing, sEnd];

// ================================================================ frame
window.renderFrame = (t) => {
  t = clamp(t, 0, TL.total - 1e-4);
  const i = beatOf(t); const b = beats[i];
  const p = bp(t, i), v = vp(t, i);
  for (const o of [E.group, SUN.group, GAL.group, WEB.group, TUN.group, LINES.group, HWY.group, HYP.group]) o.visible = false;
  E.group.position.set(0, 0, 0); E.mat.uniforms.uExpo.value = 1.0;
  A.bloom.radius = 0.45;
  const f = A.fgx;
  f.setTransform(1, 0, 0, 1, 0, 0); f.globalAlpha = 1; f.filter = 'none';
  f.globalCompositeOperation = 'source-over';
  f.clearRect(0, 0, W, H);

  stars.material.uniforms.uTime.value = t; stars.rotation.y = t * 0.02;

  const extra = BEAT_FN[i](t, p, v) || {};
  A.composer.render();

  const cutT = t - b.start;
  const shakeAmt = cutT < 0.18 ? (0.18 - cutT) * 0.06 : 0;
  const shake = {
    x: Math.sin(t * 91.3) * shakeAmt + (extra.shakeX || 0),
    y: Math.cos(t * 77.7) * shakeAmt + (extra.shakeY || 0),
  };
  const zoom = 1.0 + (cutT < 0.26 ? (0.26 - cutT) * 0.06 : 0);
  const o = {
    zoom, shake,
    flash: (extra.flash || 0) + (cutT < 0.09 ? (0.09 - cutT) * 0.40 : 0) + (t < 0.10 ? 1.0 : 0),
    grain: 0.55, fadeTo: extra.fadeTo || 0, q: 0.94,
  };
  A.grade({ chroma: extra.chroma || 0 });
  A.compose(t, o);
  return A.outC.toDataURL('image/jpeg', 0.94);
};
window.__ready = true;
window.__TL = TL;
