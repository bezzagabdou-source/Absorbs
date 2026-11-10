// film.js — V5 «هل وصل الإنسان للقمر؟» · 120.000 s · 30 fps · documentary-space film
// 8 chapters · evidence-driven · real NASA archive footage in cinematic plates
import { W, H, K, clamp, lerp, inv, smooth, easeOut, easeIn, easeInOut, expo, backOut, mulberry, hash, boot, starField } from './core.js';
import * as TY from './type.js';
import { earth as mkEarth, softCloudTexture, moon as mkMoon, hyperTunnel, speedLines, galaxy as mkGalaxy } from './scenes3d.js';

const TL = await (await fetch('/src/timeline.json')).json();
const A = await boot({ bloom: { strength: 0.45, radius: 0.5, threshold: 0.9 }, exposure: 1.0 });
const T = A.THREE;
const tex = new T.TextureLoader();
const load = (u, srgb = true) => {
  const t = tex.load(u);
  t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
  t.generateMipmaps = false; t.minFilter = T.LinearFilter; t.magFilter = T.LinearFilter;
  return t;
};
const TEX = {
  day: load('/assets/tex/earth_atmos_2048.jpg'),
  night: load('/assets/tex/earth_lights_2048.png'),
  clouds: load('/assets/tex/earth_clouds_1024.png'),
  moon: load('/assets/tex/moon_1024.jpg'),
  mw: load('/assets/tex/milkyway.jpg'),
};
// ---- archive stills (NASA public domain) used inside the plates
const IMG = {};
for (const k of ['launch', 'launch_bw', 'aldrin', 'aldrin2', 'footprint', 'mocr', 'mocr2', 'lro_site', 'lro_annot',
  'reflector', 'laser_lab', 'schmitt', 'earthrise', 'pano', 'moonfull', 'lro1']) {
  IMG[k] = new Image(); IMG[k].src = `/assets/img/g/${k}.jpg`;
}
async function loaded(list, timeout = 30000) {
  const t0 = performance.now();
  while (!list.every(t => (t instanceof HTMLImageElement ? t.complete && t.naturalWidth : t.image && t.image.width))) {
    if (performance.now() - t0 > timeout) throw new Error('asset timeout');
    await new Promise(r => requestAnimationFrame(r));
  }
}
await loaded([...Object.values(TEX), ...Object.values(IMG)]);
TEX.cloudsSoft = softCloudTexture(T, TEX.clouds.image);

const C = { ice: '#f6fbff', dk: '#0b1018', dim: 'rgba(196,215,240,0.72)', gold: '#ffcf8f', accent: '#9fd8ff', red: '#ff7a5c' };
const beats = TL.beats;
const BI = Object.fromEntries(beats.map((b, i) => [b.id, i]));
const beatOf = (t) => { for (let i = beats.length - 1; i >= 0; i--) if (t >= beats[i].start) return i; return 0; };
const bp = (t, i) => clamp((t - beats[i].start) / (beats[i].end - beats[i].start));
const vp = (t, i) => clamp((t - beats[i].vo) / beats[i].vodur);

// ---------------------------------------------------------------- rig
const stars = starField(T, 14000, 200, 3400); A.scene.add(stars);
const E = mkEarth(A, TEX, { r: 2.0, sunPos: [6.5, 2.0, 4.0], lights: 0.9, clouds: 0.55, atmo: 1.1 });
E.group.visible = false; A.scene.add(E.group);
const M = mkMoon(A, TEX.moon, { r: 1, bump: 0.05, key: 3.4, sunPos: [-1, 0.5, 0.45] });
M.group.visible = false; A.scene.add(M.group);
const HYP = hyperTunnel(A, { r: 8.5, len: 60 }); HYP.group.visible = false; A.scene.add(HYP.group);
const LINES = speedLines(A, { n: 380, len: 120 }); LINES.group.visible = false; A.scene.add(LINES.group);
const GAL = mkGalaxy(A, { n: 40000, r: 1, arms: 4, px: 300, bright: 0.2 }); GAL.group.visible = false; A.scene.add(GAL.group);

// milky way backdrop (transparent overlay drawn in fg by hand -> keeps it flicker-free)
function cam(fov, pos, look) {
  A.camera.fov = fov; A.camera.position.set(pos[0], pos[1], pos[2]);
  A.camera.lookAt(look[0], look[1], look[2]); A.camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- photographic plate engine
const rand = mulberry(1234);

const _cache = new Map();
function cv(key, w, h, draw) {
  let c = _cache.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d')); _cache.set(key, c);
    if (_cache.size > 40) _cache.delete(_cache.keys().next().value);
  }
  return c;
}


/** draws an archive still covering the frame with a slow push-in / pan (Ken Burns) */
function plate(x, img, o = {}) {
  if (!img || !img.naturalWidth) return;
  const t = o.t || 0, p = clamp(o.p ?? 0.5);
  const zoom = lerp(o.z0 ?? 1.06, o.z1 ?? 1.22, easeInOut(p));
  const ar = img.naturalWidth / img.naturalHeight;
  const fw = W, fh = H;               // cover
  let dw = fw * zoom, dh = dw / ar;
  if (dh < fh * zoom) { dh = fh * zoom; dw = dh * ar; }
  const px = (o.px ?? 0.5), py = (o.py ?? 0.5);
  const drift = Math.sin(t * 0.13 + (o.seed || 0)) * (o.drift ?? 18);
  const dx = (W - dw) * px + drift + (o.dx || 0);
  const dy = (H - dh) * py + Math.cos(t * 0.11 + (o.seed || 3)) * (o.driftY ?? 10) + (o.dy || 0);
  x.save();
  x.globalAlpha = o.alpha ?? 1;
  x.drawImage(img, dx, dy, dw, dh);
  x.restore();
}

/** dark cinematic grade over a photo plate: teal shadows, warm highlights, vignette */
function photoGrade(x, o = {}) {
  const a = o.amount ?? 1;
  const gk = `g${a.toFixed(2)}`;
  const g = cv(gk, W, H, c => {
    const gg = c.createLinearGradient(0, 0, W, H);
    gg.addColorStop(0, `rgba(122,158,205,${0.30 * a})`);
    gg.addColorStop(0.5, `rgba(150,150,160,${0.16 * a})`);
    gg.addColorStop(1, `rgba(255,196,140,${0.22 * a})`);
    c.fillStyle = gg; c.fillRect(0, 0, W, H);
    const v = c.createRadialGradient(W / 2, H * 0.46, W * 0.22, W / 2, H * 0.46, W * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.62, `rgba(0,0,0,${0.34 * a})`);
    v.addColorStop(1, `rgba(0,0,0,${0.86 * a})`);
    c.globalAlpha = 1;
  });
  x.save(); x.globalCompositeOperation = 'multiply'; x.drawImage(g, 0, 0);
  const v = cv(`v${a.toFixed(2)}`, W, H, c => {
    const vv = c.createRadialGradient(W / 2, H * 0.46, W * 0.22, W / 2, H * 0.46, W * 0.95);
    vv.addColorStop(0, 'rgba(0,0,0,0)');
    vv.addColorStop(0.62, `rgba(0,0,0,${0.34 * a})`);
    vv.addColorStop(1, `rgba(0,0,0,${0.86 * a})`);
    c.fillStyle = vv; c.fillRect(0, 0, W, H);
  });
  x.globalCompositeOperation = 'source-over'; x.drawImage(v, 0, 0); x.restore();
}


function scrim(x, y0 = 900, h = 1020, a = 0.66) {
  const c = cv(`s${y0}|${h}|${a.toFixed(3)}`, W, H, g => {
    const gg = g.createLinearGradient(0, y0, 0, y0 + h);
    gg.addColorStop(0, 'rgba(0,0,0,0)');
    gg.addColorStop(0.45, `rgba(0,0,0,${a * 0.6})`);
    gg.addColorStop(1, `rgba(0,0,0,${a})`);
    g.fillStyle = gg; g.fillRect(0, y0, W, h);
  });
  x.drawImage(c, 0, 0);
}
function scrimTop(x, h = 520, a = 0.5) {
  const c = cv(`t${h}|${a.toFixed(3)}`, W, H, g => {
    const gg = g.createLinearGradient(0, 0, 0, h);
    gg.addColorStop(0, `rgba(0,0,0,${a})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gg; g.fillRect(0, 0, W, h);
  });
  x.drawImage(c, 0, 0);
}

// ---------------------------------------------------------------- HUD (documentary / evidence style)
function hud(step, total = 8, label = 'NEXUS · EVIDENCE') {
  const x = A.fgx, m = 44, L = 28;
  x.save(); x.globalAlpha = 0.22; x.strokeStyle = C.accent; x.lineWidth = 1.6;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const px = sx > 0 ? m : W - m, py = sy > 0 ? m : H - m;
    x.beginPath(); x.moveTo(px, py + sy * L); x.lineTo(px, py); x.lineTo(px + sx * L, py); x.stroke();
  }
  x.restore();
  TY.kicker(x, label, { x: m + 16, y: m + 42, align: 'left', size: 17, track: 7, alpha: 0.5, fill: '#d5e8ff' });
  TY.kicker(x, `${String(step).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, { x: W - m - 16, y: m + 42, align: 'right', size: 17, track: 7, alpha: 0.5, fill: '#d5e8ff' });
  TY.pips(x, total, step - 1, 0, { y: H - 84 });
}

/** evidence chapter card: big number + Arabic title, slides in from the right (RTL) */
function chapterCard(x, p, o) {
  if (p <= 0.001) return;
  const e = easeOut(clamp(p * 1.6), 3);
  const e2 = easeOut(clamp((p - 0.10) * 1.7), 3);
  const y = o.y ?? 560;
  x.save();
  x.globalAlpha = e;
  // rule
  x.fillStyle = 'rgba(159,216,255,0.55)';
  x.fillRect(W - 88 - 220 * e, y + 190, 220 * e, 2);
  x.restore();
  TY.line(x, o.num, { x: W - 88 + (1 - e) * 90, y: y + 40, align: 'right', family: 'Anton', weight: '400', size: 34, track: 8, fill: C.accent, alpha: e, shadow: false });
  TY.line(x, o.title, { x: W - 88 + (1 - e2) * 120, y: y + 150, align: 'right', family: 'Kuf', weight: 900, size: 96, fill: C.ice, alpha: e2, shadowBlur: 34 });
}

/** rounded image inset (archive photo) with subtle scale-in */
function inset(x, img, o) {
  if (!img || !img.naturalWidth) return;
  const p = clamp(o.p ?? 1), e = easeOut(p, 3);
  const w = o.w, h = o.h, r = o.r ?? 14;
  const ar = img.naturalWidth / img.naturalHeight;
  let dw = w, dh = h;
  const s = Math.max(w / (img.naturalWidth), h / (img.naturalHeight));
  dw = img.naturalWidth * s * lerp(1.06, 1, e); dh = img.naturalHeight * s * lerp(1.06, 1, e);
  x.save();
  x.globalAlpha = (o.alpha ?? 1) * e;
  if (o.shadow !== false) { x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 40; x.shadowOffsetY = 12; }
  x.beginPath();
  x.moveTo(o.x + r, o.y); x.arcTo(o.x + w, o.y, o.x + w, o.y + h, r); x.arcTo(o.x + w, o.y + h, o.x, o.y + h, r);
  x.arcTo(o.x, o.y + h, o.x, o.y, r); x.arcTo(o.x, o.y, o.x + w, o.y, r); x.closePath();
  x.clip();
  x.drawImage(img, o.x + (w - dw) / 2, o.y + (h - dh) / 2, dw, dh);
  // inner hairline
  x.strokeStyle = 'rgba(190,220,255,0.20)'; x.lineWidth = 1.4; x.stroke();
  x.restore();
  if (o.cap) TY.kicker(x, o.cap, { x: o.x, y: o.y + h + 26, align: 'left', size: 16, track: 5, fill: 'rgba(175,205,235,.75)', alpha: e }, 1);
}

function lightSweep(x, p, y0 = 0, h = H) {
  const e = clamp(p);
  const g = x.createLinearGradient(0, y0, 0, y0 + h);
  const c = 0.06 + 0.1 * Math.sin(e * 3.14);
  g.addColorStop(0, 'rgba(180,225,255,0)');
  g.addColorStop(0.5, `rgba(180,225,255,${c})`);
  g.addColorStop(1, 'rgba(180,225,255,0)');
  x.save(); x.globalCompositeOperation = 'lighter'; x.fillStyle = g; x.fillRect(0, y0, W, h); x.restore();
}

function timecode(x, t, o = {}) {
  const s = Math.floor(t), f = Math.floor((t % 1) * 30);
  const str = `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  TY.kicker(x, str, { x: W - 46, y: H - 46, align: 'right', size: 16, track: 4, fill: 'rgba(170,205,235,.55)', alpha: o.alpha ?? 1 });
}

// ================================================================ BEATS
// 01 — HOOK · the question
function sHook(t, p, v) {
  M.group.visible = true;
  const rise = easeOut(clamp(p * 1.25), 2.2);
  const q = easeIn(clamp((p - 0.45) / 0.55), 2);
  cam(lerp(30, 26, p), [0.15 * Math.sin(t * 0.2), lerp(-0.55, -0.05, rise) + 0.03 * Math.sin(t * 0.7), lerp(11.5, 8.4, q)], [0, lerp(0.15, 0.30, rise), 0]);
  M.spin(t, 0.012, 0.008);
  M.mat.color.setScalar(1.18);
  A.bloom.strength = lerp(0.30, 0.42, rise); A.bloom.threshold = 0.94;
  A.grade({ vig: 0.92, grain: 0.05, expo: 1.02, time: t, chroma: 0.06 + 0.25 * rise });
  const x = A.fgx;
  // faint photographic moon detail on top of the 3D sphere (screen-blended craters)
  x.save(); x.globalCompositeOperation = 'screen'; x.globalAlpha = 0.22 * rise;
  const g = x.createRadialGradient(W / 2, 840, 60, W / 2, 840, 620);
  g.addColorStop(0, 'rgba(160,175,200,.5)'); g.addColorStop(1, 'rgba(120,140,170,0)');
  x.fillStyle = g; x.beginPath(); x.arc(W / 2, 840, 620, 0, 6.283); x.fill(); x.restore();
  scrim(x, 1050, 880, 0.82);
  scrimTop(x, 420, 0.44);
  const vp1 = vp(t, 0);
  TY.kicker(x, 'APOLLO · 1969 — 1972', { x: W / 2, y: 300, align: 'center', size: 20, track: 11, fill: 'rgba(190,220,250,.8)' }, inv(0, 0.10, vp1));
  TY.wordReveal(x, 'هل صعد الإنسان', { x: W / 2, y: 1240, size: 96, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, vp1, 0.12);
  TY.wordReveal(x, 'إلى القمر حقاً؟', { x: W / 2, y: 1372, size: 96, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, clamp((vp1 - 0.24) / 0.76), 0.12);
  const p2 = clamp((vp1 - 0.52) / 0.48);
  if (p2 > 0) {
    x.save(); x.globalAlpha = clamp(p2 * 3); x.translate(W / 2, 1560); const sc = lerp(1.3, 1, backOut(p2, 2)); x.scale(sc, sc);
    TY.gradLine(x, 'أم أكبر كذبة في التاريخ؟', { x: 0, y: 0, size: 68, weight: 900, family: 'Kuf', align: 'center', c0: '#ffe3d0', c1: '#ffb08a', c2: '#ff7a5c', glow: 26, glowColor: 'rgba(255,120,80,.55)' });
    x.restore();
  }
  // mid-hook: ignition flash-cut of the launch, then back to the moon
  const fx = clamp((t - 3.9) / 3.4);
  if (fx > 0 && fx < 1) {
    const a = Math.sin(clamp(fx) * Math.PI) ** 0.6;
    x.save(); x.globalAlpha = 0.9 * a;
    plate(x, IMG.launch, { t, p: fx, z0: 1.0, z1: 1.22, px: 0.5, py: 0.62, sat: 0.5, con: 1.2, bri: 0.8, seed: 11, drift: 10 });
    x.restore();
    photoGrade(x, { amount: 0.9 * a });
    x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha = a;
    const gg = x.createLinearGradient(0, 1200, 0, 1780);
    gg.addColorStop(0, 'rgba(255,170,90,0)'); gg.addColorStop(0.55, 'rgba(255,180,100,0.35)'); gg.addColorStop(1, 'rgba(255,120,60,0)');
    x.fillStyle = gg; x.fillRect(0, 1200, W, 580); x.restore();
    TY.kicker(x, 'SATURN V · 111 M · 2,950 TONNES', { x: W / 2, y: 1720, align: 'center', size: 20, track: 8, fill: 'rgba(255,225,190,.95)', alpha: a }, 1);
    scrim(x, 1000, 920, 0.7);
  }
  hud(1, 8, 'NEXUS · ORIGINS');
  timecode(x, t);
  return { chroma: 0.05 + 0.2 * rise };
}

// 02 — EVIDENCE 01 · the rocks
function sRocks(t, p, v) {
  const x = A.fgx;
  const q = easeInOut(p);
  // plate A: launch → plate B: aldrin
  const mixB = smooth(clamp((p - 0.34) / 0.30));
  x.save(); x.globalAlpha = 1 - mixB;
  plate(x, IMG.launch_bw, { t, p, z0: 1.02, z1: 1.17, px: 0.35, py: 0.30, sat: 0.10, con: 1.18, bri: 0.86, seed: 1 });
  x.restore();
  x.save(); x.globalAlpha = mixB;
  plate(x, IMG.aldrin, { t, p, z0: 1.10, z1: 1.26, px: 0.5, py: 0.30, sat: 0.42, con: 1.24, bri: 0.66, seed: 2 });
  x.restore();
  photoGrade(x, { amount: 1.1 });
  lightSweep(x, p);
  scrim(x, 900, 1020, 0.94);
  const vp1 = vp(t, 1);
  chapterCard(x, inv(0, 0.10, vp1), { num: 'EVIDENCE 01', title: 'الصخور', y: 470 });
  TY.wordReveal(x, 'جاؤوا بصخور من القمر.', { x: W / 2, y: 1240, size: 82, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, clamp((vp1 - 0.10) / 0.5), 0.12);
  const np = clamp((vp1 - 0.34) / 0.66);
  if (np > 0) {
    x.save(); x.translate(W - 110, 1560); const sc = lerp(1.4, 1, backOut(clamp(np * 2.4), 2.2)); x.scale(sc, sc); x.globalAlpha = clamp(np * 3);
    TY.counter(x, { from: 0, to: 382, x: 0, y: 0, size: 210, family: 'Anton', fill: C.gold, align: 'right', glow: 34, glowColor: 'rgba(255,200,120,.7)' }, clamp(np * 1.15));
    x.restore();
    TY.kicker(x, 'KG OF MOON ROCK', { x: W - 110, y: 1606, align: 'right', size: 24, track: 10, fill: 'rgba(255,225,180,.9)', alpha: clamp(np * 3) }, 1);
    TY.line(x, 'في مئات المختبرات حول العالم', { x: W - 110, y: 1690, align: 'right', size: 44, weight: 700, family: 'Alex', fill: C.dim, alpha: clamp(np * 2) });
  }
  hud(2, 8, 'NEXUS · EVIDENCE');
  timecode(x, t);
  return { chroma: 0.12, noBloom: true };
}

// 03 — EVIDENCE 02 · the retroreflectors (laser) + a light-speed tunnel insert
function sLaser(t, p, v) {
  const x = A.fgx;
  const w0 = beats[2].start + 7.0, wlen = 3.4;
  const warp = clamp((t - w0) / wlen);
  const inWarp = warp > 0 && warp < 1;
  const vp1 = vp(t, 2);

  if (inWarp) {
    // ---- pure light-speed tunnel: earth -> moon beam
    HYP.group.visible = true; LINES.group.visible = true;
    HYP.group.position.set(0, 0, -26);
    HYP.mat.uniforms.uGain.value = 1.3 + 2.6 * warp;
    HYP.update(t * 3.0, 0.7 + 1.7 * warp);
    HYP.group.rotation.z = t * 0.5;
    LINES.update(t, 150 + 360 * warp, 10 + 24 * warp);
    cam(72, [0, 0, 6.5], [0, 0, -30]);
    A.bloom.strength = 0.95; A.bloom.threshold = 0.78; A.bloom.radius = 0.55;
    A.grade({ vig: 0.9, grain: 0.05, expo: 1.06, time: t, chroma: 0.55 });
    const a = Math.sin(warp * Math.PI) ** 0.4;
    x.save(); x.globalCompositeOperation = 'lighter';
    const cg = x.createRadialGradient(W / 2, 900, 0, W / 2, 900, 700);
    cg.addColorStop(0, `rgba(255,244,225,${0.34 * a})`);
    cg.addColorStop(0.35, `rgba(255,170,110,${0.16 * a})`);
    cg.addColorStop(1, 'rgba(255,120,60,0)');
    x.fillStyle = cg; x.beginPath(); x.arc(W / 2, 900, 700, 0, 6.283); x.fill(); x.restore();
    scrim(x, 1080, 840, 0.55);
    TY.gradLine(x, 'سرعة الضوء', { x: W / 2, y: 1400, size: 116, weight: 900, family: 'Kuf', align: 'center', c0: '#fff8ef', c1: '#ffd9b0', c2: '#ff9a5c', glow: 34, glowColor: 'rgba(255,150,90,.6)', alpha: a });
    TY.line(x, '300,000 كم / ثانية', { x: W / 2, y: 1490, align: 'center', family: 'Anton', weight: '400', size: 54, track: 4, fill: C.gold, alpha: a, glow: 22, glowColor: 'rgba(255,200,120,.6)' });
    TY.line(x, 'رحلة الذهاب والعودة: 2.6 ثانية', { x: W / 2, y: 1580, align: 'center', family: 'Alex', weight: 700, size: 46, fill: C.ice, alpha: a * 0.9 });
    hud(3, 8);
    timecode(x, t);
    return { chroma: 0.55, flash: warp < 0.12 ? 0.35 : 0 };
  }

  // ---- normal evidence plate
  plate(x, IMG.laser_lab, { t, p, z0: 1.04, z1: 1.16, px: 0.4, py: 0.45, sat: 0.35, con: 1.2, bri: 0.72, seed: 4 });
  photoGrade(x, { amount: 0.95 });
  const cx1 = 180, cy1 = 900, cx2 = 880, cy2 = 470;
  const lp = clamp((p - 0.06) / 0.34);
  if (lp > 0) {
    const e = easeOut(lp, 2);
    x.save(); x.globalCompositeOperation = 'lighter';
    const g = x.createLinearGradient(cx1, cy1, cx2, cy2);
    g.addColorStop(0, 'rgba(255,90,60,0)');
    g.addColorStop(0.25, `rgba(255,110,70,${0.5 * e})`);
    g.addColorStop(0.75, `rgba(255,170,110,${0.7 * e})`);
    g.addColorStop(1, 'rgba(255,235,190,0)');
    x.strokeStyle = g; x.lineWidth = 2.4;
    x.beginPath(); x.moveTo(cx1, cy1); x.lineTo(lerp(cx1, cx2, e), lerp(cy1, cy2, e)); x.stroke();
    if (e > 0.96) {
      const g2 = x.createLinearGradient(cx2, cy2, cx1, cy1);
      g2.addColorStop(0, 'rgba(255,220,180,0)'); g2.addColorStop(0.5, `rgba(255,235,210,${0.30 + 0.25 * Math.sin(t * 6)})`); g2.addColorStop(1, 'rgba(255,120,80,0)');
      x.strokeStyle = g2; x.lineWidth = 1.4; x.setLineDash([14, 16]);
      x.beginPath(); x.moveTo(cx2, cy2); x.lineTo(cx1, cy1); x.stroke(); x.setLineDash([]);
    }
    for (const [nx, ny, r] of [[cx1, cy1, 9], [cx2, cy2, 7]]) {
      const gg = x.createRadialGradient(nx, ny, 0, nx, ny, r * 5);
      gg.addColorStop(0, `rgba(255,230,200,${0.85 * e})`); gg.addColorStop(1, 'rgba(255,140,90,0)');
      x.fillStyle = gg; x.beginPath(); x.arc(nx, ny, r * 5, 0, 6.283); x.fill();
    }
    x.restore();
    TY.kicker(x, 'EARTH', { x: cx1, y: cy1 + 58, align: 'center', size: 16, track: 6, fill: 'rgba(255,200,170,.85)' });
    TY.kicker(x, 'MOON · REFLECTOR', { x: cx2, y: cy2 - 32, align: 'center', size: 16, track: 6, fill: 'rgba(255,225,200,.85)' });
  }
  inset(x, IMG.reflector, { x: 92, y: 244, w: 272, h: 204, p: clamp((p - 0.3) / 0.16), cap: 'APOLLO 11 · LR-3', sat: 0.85, bri: 1.0 });
  scrim(x, 900, 1020, 0.92);
  x.save();
  const pg2 = x.createLinearGradient(0, 1010, 0, 1260);
  pg2.addColorStop(0, 'rgba(0,0,0,0)'); pg2.addColorStop(0.35, 'rgba(0,0,0,0.72)'); pg2.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = pg2; x.fillRect(0, 1010, W, 250); x.restore();
  chapterCard(x, inv(0, 0.08, vp1), { num: 'EVIDENCE 02', title: 'العواكس', y: 470 });
  TY.wordReveal(x, 'تركوا مرايا على القمر.', { x: W / 2, y: 1080, size: 78, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, clamp((vp1 - 0.06) / 0.40), 0.12);
  TY.wordReveal(x, 'والليزر يرتدّ إليها حتى اليوم.', { x: W / 2, y: 1180, size: 58, weight: 700, family: 'Kuf', fill: C.accent, align: 'center' }, clamp((vp1 - 0.36) / 0.40), 0.10);
  const np = clamp((vp1 - 0.62) / 0.38);
  if (np > 0) {
    TY.line(x, '384,400', { x: W / 2, y: 1500, align: 'center', family: 'Anton', weight: '400', size: 148, fill: C.gold, alpha: clamp(np * 2), glow: 30, glowColor: 'rgba(255,200,120,.6)' });
    TY.kicker(x, 'KM · EARTH — MOON', { x: W / 2, y: 1552, align: 'center', size: 24, track: 11, fill: 'rgba(255,225,180,.9)', alpha: clamp(np * 2) }, 1);
    TY.line(x, 'مسافة مقيسة بالليزر، كل يوم', { x: W / 2, y: 1636, align: 'center', family: 'Alex', weight: 700, size: 40, fill: C.dim, alpha: clamp(np * 1.6) });
  }
  hud(3, 8);
  timecode(x, t);
  return { chroma: 0.18 };
}

// 04 — EVIDENCE 03 · the tracks are still there (orbiter)
function sLro(t, p, v) {
  const x = A.fgx;
  plate(x, IMG.lro1, { t, p, z0: 1.02, z1: 1.2, px: 0.5, py: 0.44, sat: 0.10, con: 1.26, bri: 0.78, drift: 5, seed: 5 });
  photoGrade(x, { amount: 1.15 });
  inset(x, IMG.lro_site, { x: W - 396, y: 244, w: 300, h: 236, p: clamp((p - 0.12) / 0.18), cap: 'EAGLE · FROM THE WINDOW', sat: 0.3, bri: 0.92 });
  inset(x, IMG.lro_annot, { x: 92, y: 700, w: 380, h: 300, p: clamp((p - 0.48) / 0.2), cap: 'ANNOTATED · LRO MOSAIC', sat: 0.2, bri: 1.05 });
  // scanning HUD reticle zooming into the landing site
  const sc = clamp((p - 0.18) / 0.55);
  if (sc > 0) {
    const e = easeOut(sc, 3);
    const rw = lerp(560, 300, e), rh = rw * 0.82;
    const rx = W / 2 - rw / 2 + lerp(0, -90, e), ry = 900 - rh / 2 + lerp(0, -40, e);
    x.save(); x.globalCompositeOperation = 'lighter'; x.strokeStyle = `rgba(160,220,255,${0.5 * e})`; x.lineWidth = 1.6;
    const L2 = 34;
    for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const px = rx + sx * rw, py = ry + sy * rh;
      x.beginPath(); x.moveTo(px, py + (sy ? -L2 : L2)); x.lineTo(px, py); x.lineTo(px + (sx ? -L2 : L2), py); x.stroke();
    }
    x.restore();
    TY.kicker(x, `ZOOM ${Math.round(lerp(1, 8.4, e) * 10) / 10}x  ·  LRO`, { x: rx, y: ry - 16, align: 'left', size: 16, track: 5, fill: 'rgba(190,225,255,.9)', alpha: e });
    // annotation dots
    if (e > 0.7) {
      const a2 = clamp((e - 0.7) / 0.3);
      x.save(); x.globalAlpha = a2; x.fillStyle = 'rgba(255,225,170,.95)';
      const pts = [[rx + rw * 0.32, ry + rh * 0.40], [rx + rw * 0.52, ry + rh * 0.55], [rx + rw * 0.40, ry + rh * 0.72]];
      for (const [px, py] of pts) { x.beginPath(); x.arc(px, py, 4, 0, 6.283); x.fill(); }
      x.restore();
    }
  }
  scrim(x, 1020, 900, 0.82);
  const vp1 = vp(t, 3);
  chapterCard(x, inv(0, 0.10, vp1), { num: 'EVIDENCE 03', title: 'الأثر', y: 1160 });
  TY.wordReveal(x, 'المنصة ما زالت هناك.', { x: W / 2, y: 1480, size: 74, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, clamp((vp1 - 0.12) / 0.5), 0.12);
  TY.wordReveal(x, 'ومسار الأقدام… وظلال المعدات.', { x: W / 2, y: 1570, size: 54, weight: 700, family: 'Kuf', fill: C.accent, align: 'center' }, clamp((vp1 - 0.45) / 0.55), 0.10);
  TY.kicker(x, 'APOLLO 11 · TRANQUILLITY BASE · 50+ YRS', { x: W / 2, y: 1660, align: 'center', size: 18, track: 8, fill: 'rgba(190,220,250,.7)', alpha: clamp((vp1 - 0.6) * 3) }, 1);
  hud(4, 8);
  timecode(x, t);
  return { chroma: 0.10, noBloom: true };
}

// 05 — MYTHS · rapid-fire debunk cards
const MYTHS = [
  { m: '«النجوم لا تظهر»', a: 'تعريض الكاميرا للضوء الساطع يخفي النجوم' },
  { m: '«العلم يرفرف»', a: 'كان فيه سلك تثبيت… ورفرفة عادية' },
  { m: '«الظلال ليست متوازية»', a: 'تضاريس متعرجة تُطيل الظل، لا مصدر ضوء' },
];
function sMyths(t, p, v) {
  const x = A.fgx;
  const idx = Math.min(2, Math.floor(p * 3.0));
  const lp = clamp((p * 3.0) % 1);
  // dark photographic backdrop
  x.save(); x.globalAlpha = 0.55;
  plate(x, IMG.lro1, { t, p: 0.5, z0: 1.06, z1: 1.16, px: 0.5, py: 0.4, sat: 0.05, con: 1.35, bri: 0.5, drift: 4, seed: 6 });
  x.restore();
  photoGrade(x, { amount: 1.05 });
  scrim(x, 700, 1220, 0.9);
  const e = easeOut(clamp(lp * 2.6), 3);
  const vp1 = vp(t, 4);
  TY.kicker(x, 'MYTHS · 03', { x: W / 2, y: 620, align: 'center', size: 20, track: 10, fill: 'rgba(255,170,140,.9)', alpha: clamp(lp * 4) }, 1);
  x.save(); x.globalAlpha = clamp(lp * 6);
  TY.line(x, MYTHS[idx].m, { x: W / 2, y: 900, align: 'center', family: 'Kuf', weight: 900, size: 92, fill: 'rgba(255,225,215,0.96)' });
  // strike-through
  const sw = 620 * e;
  x.save(); x.globalCompositeOperation = 'lighter';
  x.strokeStyle = 'rgba(255,90,60,0.95)'; x.lineWidth = 9; x.lineCap = 'round';
  x.beginPath(); x.moveTo(W / 2 + sw / 2, 862); x.lineTo(W / 2 - sw / 2, 890); x.stroke();
  x.strokeStyle = 'rgba(255,140,110,0.5)'; x.lineWidth = 22;
  x.beginPath(); x.moveTo(W / 2 + sw / 2, 862); x.lineTo(W / 2 - sw / 2, 890); x.stroke();
  x.restore();
  if (e > 0.92) {
    TY.line(x, 'الفيزياء تقول: ' + MYTHS[idx].a, { x: W / 2, y: 1050, align: 'center', family: 'Alex', weight: 700, size: 50, fill: C.ice, alpha: clamp((lp - 0.62) * 4) });
  }
  // stack of counters "3 myths"
  TY.pips(x, 3, idx, 1, { y: 1180, on: C.red });
  TY.line(x, 'ثلاث خرافات… ولا دليل واحد.', { x: W / 2, y: 1420, align: 'center', family: 'Alex', weight: 900, size: 62, fill: C.dim, alpha: clamp((vp1 - 0.05) * 3) });
  hud(5, 8, 'NEXUS · DEBUNK');
  timecode(x, t);
  return { chroma: 0.22, flash: lp < 0.06 ? 0.18 : 0, noBloom: true };
}

// 06 — EVIDENCE 04/05 · the signal & the witnesses
function sSignal(t, p, v) {
  const x = A.fgx;
  const mixB = smooth(clamp((p - 0.55) / 0.25));
  x.save(); x.globalAlpha = 1 - 0.6 * mixB;
  plate(x, IMG.mocr, { t, p, z0: 1.04, z1: 1.20, px: 0.5, py: 0.42, sat: 0.28, con: 1.2, bri: 0.8, seed: 7 });
  x.restore();
  photoGrade(x, { amount: 0.95 });
  // RF waveform + spectrum
  x.save(); x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(150,225,255,0.55)'; x.lineWidth = 1.4;
  const y0 = 700;
  x.beginPath();
  for (let i = 0; i <= 260; i++) {
    const px = (i / 260) * W;
    const env = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.05 + t * 2));
    const py = y0 + Math.sin(i * 0.55 + t * 12) * 26 * env * clamp((p - 0.1) * 4);
    i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
  }
  x.stroke();
  // spectrum bars
  const rb = mulberry(41);
  for (let k = 0; k < 42; k++) {
    const h = (0.15 + 0.85 * Math.abs(Math.sin(t * (2 + k * 0.13) + k))) * 70 * clamp((p - 0.15) * 3);
    x.fillStyle = `rgba(120,200,255,${0.10 + 0.25 * rb()})`;
    x.fillRect(60 + k * 23, 820 - h, 13, h);
  }
  x.restore();
  // "LIVE 1969" bug
  const blink = 0.55 + 0.45 * Math.sin(t * 3.4);
  x.save(); x.globalAlpha = 0.9;
  x.fillStyle = 'rgba(210,40,30,0.92)'; x.beginPath(); x.arc(W - 120, 300, 9 * blink + 3, 0, 6.283); x.fill();
  x.restore();
  TY.kicker(x, 'LIVE', { x: W - 140, y: 306, align: 'right', size: 22, track: 9, fill: 'rgba(255,190,180,.95)' });
  TY.line(x, '1969', { x: 90, y: 306, align: 'left', family: 'Anton', weight: '400', size: 30, track: 10, fill: 'rgba(220,235,255,.8)' });
  scrim(x, 980, 940, 0.86);
  const vp1 = vp(t, 5);
  chapterCard(x, inv(0, 0.10, vp1), { num: 'EVIDENCE 04 · 05', title: 'الإشارة والشهود', y: 430 });
  const mid = clamp((vp1 - 0.34) / 0.66);
  if (mid < 0.55) {
    TY.wordReveal(x, 'بثّوا الإشارة مباشرة.', { x: W / 2, y: 1180, size: 72, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, clamp((vp1 - 0.08) / 0.42), 0.12);
    TY.line(x, 'محطات في أستراليا وإسبانيا استقبلتها.', { x: W / 2, y: 1270, align: 'center', family: 'Kuf', weight: 700, size: 46, fill: C.accent, alpha: clamp((vp1 - 0.45) * 3) });
  } else {
    TY.wordReveal(x, 'والسوفييت كانوا يراقبون.', { x: W / 2, y: 1180, size: 68, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, clamp((mid - 0.55) / 0.45), 0.12);
    TY.wordReveal(x, 'ولم ينفوا… أبداً.', { x: W / 2, y: 1280, size: 76, weight: 900, family: 'Kuf', fill: C.gold, align: 'center' }, clamp((mid - 0.78) / 0.22), 0.10);
  }
  const np = clamp((vp1 - 0.72) / 0.28);
  if (np > 0) {
    inset(x, IMG.mocr2, { x: 88, y: 1380, w: 400, h: 210, p: clamp((p - 0.5) / 0.25), cap: 'MISSION CONTROL · HOUSTON', sat: 0.3 });
    TY.counter(x, { from: 0, to: 400, x: W - 96, y: 1520, size: 128, family: 'Anton', fill: C.gold, align: 'right', glow: 26, glowColor: 'rgba(255,200,120,.6)', alpha: clamp((np - 0.2) * 4) }, 1);
    TY.kicker(x, 'THOUSAND PEOPLE', { x: W - 96, y: 1580, align: 'right', size: 20, track: 8, fill: 'rgba(255,225,180,.85)', alpha: clamp((np - 0.4) * 4) }, 1);
    TY.kicker(x, '12 WALKED · 6 MISSIONS', { x: W - 96, y: 1622, align: 'right', size: 18, track: 6, fill: 'rgba(200,225,250,.7)', alpha: clamp((np - 0.55) * 4) }, 1);
  }
  hud(6, 8);
  timecode(x, t);
  return { chroma: 0.16, noBloom: true };
}

// 07 — THE CONCESSION & the phone + moon return
function sWitness(t, p, v) {
  const x = A.fgx;
  // 3D moon return, low on the frame, with a photographic inset
  M.group.visible = true;
  const rise = easeOut(clamp(p * 1.4), 2);
  cam(lerp(26, 22, p), [0, lerp(-1.9, -1.1, rise), lerp(8.4, 6.6, p)], [0, lerp(-0.15, -0.35, rise), 0]);
  M.spin(t + 40, 0.03, 0.02);
  A.bloom.strength = 0.42; A.bloom.threshold = 0.88;
  A.grade({ vig: 0.9, grain: 0.05, expo: 1.0, time: t, chroma: 0.08 });
  scrim(x, 820, 1100, 0.88);
  scrimTop(x, 560, 0.6);
  inset(x, IMG.schmitt, { x: W - 420, y: 230, w: 324, h: 340, p: clamp(p / 0.18), cap: 'APOLLO 17 · 1972', sat: 0.5, bri: 0.9 });
  inset(x, IMG.footprint, { x: 96, y: 262, w: 268, h: 214, p: clamp((p - 0.12) / 0.2), cap: 'TRANQUILLITY BASE', sat: 0.3, bri: 0.85 });
  const vp1 = vp(t, 6);
  TY.kicker(x, 'THE LAST MAN · 1972', { x: W / 2, y: 760, align: 'center', size: 19, track: 9, fill: 'rgba(190,220,250,.8)' }, clamp(p * 4));
  TY.wordReveal(x, 'لم يعد أحد… بعد 1972.', { x: W / 2, y: 1370, size: 78, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, clamp((vp1 - 0.05) / 0.55), 0.12);
  TY.wordReveal(x, 'لكن الأدلة بقيت.', { x: W / 2, y: 1470, size: 68, weight: 900, family: 'Kuf', fill: C.gold, align: 'center' }, clamp((vp1 - 0.45) / 0.55), 0.12);
  const np = clamp((vp1 - 0.62) / 0.38);
  if (np > 0) TY.line(x, 'أنت فقط لم تنظر بعد.', { x: W / 2, y: 1600, align: 'center', family: 'Alex', weight: 700, size: 48, fill: C.dim, alpha: clamp(np * 2.5) });
  hud(7, 8, 'NEXUS · LEGACY');
  timecode(x, t);
  return { chroma: 0.10, noBloom: true };
}

// 08 — CTA · the moon is still there
function sCta(t, p, v) {
  const x = A.fgx;
  M.group.visible = true;
  const q = easeOut(clamp(p * 1.1), 2);
  const away = smooth(clamp((p - 0.72) / 0.28));
  if (away > 0.02) { GAL.group.visible = true; GAL.group.scale.setScalar(lerp(26, 60, away)); GAL.update(t, 0.05); }
  cam(lerp(30, 34 + 26 * away, p), [Math.sin(t * 0.25) * 0.18, lerp(-0.7, 0.05, q) + 1.6 * away, lerp(6.0, 8.6 + 22 * away, q)], [0, lerp(0.1, -0.15, q), 0]);
  M.spin(t + 60, 0.02, 0.018);
  M.mat.color.setScalar(1 - 0.85 * away);
  A.bloom.strength = lerp(0.5, 0.34, p); A.bloom.threshold = 0.86;
  A.grade({ vig: 0.94, grain: 0.045, expo: 1.0, time: t, chroma: 0.05 });
  // earthrise plate in the upper third, softly
  x.save(); x.globalAlpha = 0.34 * (1 - q * 0.6);
  plate(x, IMG.earthrise, { t, p: 0.5, z0: 1.08, z1: 1.2, px: 0.5, py: 0.40, sat: 0.6, con: 1.05, bri: 0.66, drift: 8, seed: 8 });
  x.restore();
  photoGrade(x, { amount: 0.95 });
  scrim(x, 980, 940, 0.94);
  const vp1 = vp(t, 7);
  TY.kicker(x, 'NEXUS · SPACE IN ARABIC', { x: W / 2, y: 360, align: 'center', size: 19, track: 10, fill: 'rgba(190,220,250,.75)' }, clamp(p * 4));
  TY.gradLine(x, 'القمر… ما زال هناك', { x: W / 2, y: 1260, size: 96, weight: 900, family: 'Alex', align: 'center', c0: '#ffffff', c1: '#e8f4ff', c2: '#9fd8ff', glow: 30, glowColor: 'rgba(150,220,255,.55)' });
  TY.line(x, 'والدليل ينتظر من ينظر إليه.', { x: W / 2, y: 1352, align: 'center', family: 'Kuf', weight: 700, size: 54, fill: C.dim, alpha: clamp((vp1 - 0.1) * 3) });
  const np = clamp((vp1 - 0.35) / 0.65);
  if (np > 0) {
    x.save(); x.globalAlpha = clamp(np * 3);
    const bx = W / 2 - 300, by = 1428, bw = 600, bh = 104, r = 52;
    x.beginPath(); x.moveTo(bx + r, by); x.arcTo(bx + bw, by, bx + bw, by + bh, r); x.arcTo(bx + bw, by + bh, bx, by + bh, r);
    x.arcTo(bx, by + bh, bx, by, r); x.arcTo(bx, by, bx + bw, by, r); x.closePath();
    const g = x.createLinearGradient(bx, by, bx + bw, by + bh);
    x.fillStyle = 'rgba(6,11,18,0.72)'; x.fill();
    g.addColorStop(0, 'rgba(159,216,255,0.22)'); g.addColorStop(1, 'rgba(255,208,143,0.12)');
    x.fillStyle = g; x.fill();
    x.strokeStyle = 'rgba(190,230,255,0.75)'; x.lineWidth = 2.2; x.stroke();
    x.restore();
    TY.line(x, 'اكتب: القمر', { x: W / 2, y: 1496, align: 'center', family: 'Kuf', weight: 900, size: 52, fill: C.ice, alpha: clamp(np * 3) });
    TY.kicker(x, 'COMMENT  ·  SHARE  ·  FOLLOW', { x: W / 2, y: 1630, align: 'center', size: 20, track: 9, fill: 'rgba(190,220,250,.75)', alpha: clamp((np - 0.4) * 4) }, 1);
  }
  TY.kicker(x, 'NEXUS', { x: W / 2, y: H - 130, align: 'center', size: 26, track: 16, fill: 'rgba(255,255,255,.55)', alpha: clamp((p - 0.6) * 3) }, 1);
  hud(8, 8);
  return { chroma: 0.04, fadeTo: p > 0.94 ? (p - 0.94) / 0.06 * 0.85 : 0 };
}

const BEAT_FN = [sHook, sRocks, sLaser, sLro, sMyths, sSignal, sWitness, sCta];

// ================================================================ frame
window.renderFrame = (t) => {
  t = clamp(t, 0, TL.total - 1e-4);
  const i = beatOf(t); const b = beats[i];
  const p = bp(t, i), v = vp(t, i);
  M.group.visible = false; E.group.visible = false; HYP.group.visible = false;
  LINES.group.visible = false; GAL.group.visible = false;
  A.bloom.radius = 0.5;
  const f = A.fgx;
  f.setTransform(K, 0, 0, K, 0, 0); f.globalAlpha = 1; f.filter = 'none';
  f.globalCompositeOperation = 'source-over';
  f.clearRect(0, 0, W, H);
  stars.material.uniforms.uTime.value = t; stars.rotation.y = t * 0.006;

  const extra = BEAT_FN[i](t, p, v) || {};
  A.bloom.enabled = !extra.noBloom;
  A.composer.render();

  const cutT = t - b.start;
  const shakeAmt = cutT < 0.22 ? (0.22 - cutT) * 0.012 : 0;
  const shake = { x: Math.sin(t * 61.3) * shakeAmt, y: Math.cos(t * 57.7) * shakeAmt };
  const zoom = 1.0 + (cutT < 0.30 ? (0.30 - cutT) * 0.03 : 0) + 0.008 * Math.sin(t * 0.7);
  const o = {
    zoom, shake,
    flash: (extra.flash || 0) + (cutT < 0.10 ? (0.10 - cutT) * 0.22 : 0) + (t < 0.12 ? 0.55 : 0),
    grain: 0.6, fadeTo: extra.fadeTo || 0, q: 0.94, sat: 1.02,
  };
  A.grade({ chroma: extra.chroma || 0 });
  A.compose(t, o);
  return A.outC.toDataURL('image/jpeg', 0.94);
};
window.__ready = true;
window.__TL = TL;
