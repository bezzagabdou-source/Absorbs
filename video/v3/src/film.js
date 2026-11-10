// film.js — V3 «ضخم» : 8 beats · 35.000s · 30fps · Arabic VO locked timeline
import { W, H, clamp, lerp, inv, smooth, easeOut, easeIn, easeInOut, expo, backOut, mulberry, hash, boot, starField } from './core.js';
import * as TY from './type.js';
import { earth as mkEarth, sun as mkSun, galaxy as mkGalaxy, cosmicWeb as mkWeb, softCloudTexture } from './scenes3d.js';

const TL = await (await fetch('/src/timeline.json')).json();
const A = await boot({ bloom: { strength: 0.42, radius: 0.42, threshold: 0.93 }, exposure: 1.0 });
const T = A.THREE;
const tex = new T.TextureLoader();
const load = (u, srgb = true) => {
  const t = tex.load(u);
  t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
  t.anisotropy = 1; t.generateMipmaps = false;
  t.minFilter = T.LinearFilter; t.magFilter = T.LinearFilter;
  t.wrapS = T.RepeatWrapping; t.wrapT = T.ClampToEdgeWrapping;
  return t;
};
const TEX = {
  day: load('/assets/tex/earth_atmos_2048.jpg'),
  night: load('/assets/tex/earth_lights_2048.png'),
  clouds: load('/assets/tex/earth_clouds_1024.png'),
  norm: load('/assets/tex/earth_normal_2048.jpg', false),
  spec: load('/assets/tex/earth_specular_2048.jpg', false),
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

const C = { ice: '#f2f9ff', warm: '#fff4e0', accent: '#8fe3ff', gold: '#ffcf80', dim: 'rgba(196,220,248,0.66)' };
const beats = TL.beats;
const BI = Object.fromEntries(beats.map((b, i) => [b.id, i]));

// ---------------------------------------------------------------- rig
const stars = window.__stars = starField(T, 6000, 130, 1600); A.scene.add(stars);
const nearStars = window.__near = starField(T, 900, 8, 60, { bias: 1.6 }); nearStars.material.uniforms.uScale.value = 0.45; A.scene.add(nearStars);

const E = window.__E = mkEarth(A, TEX, { r: 2.2, sunPos: [6.5, 2.2, 4.2], lights: 0.9, clouds: 0.5, atmo: 1.15 });
A.scene.add(E.group);
const SUN = window.__SUN = mkSun(A, { r: 1 }); SUN.group.visible = false; A.scene.add(SUN.group);
const GAL = window.__GAL = mkGalaxy(A, { n: 92000, r: 1, arms: 4, px: 300, bright: 0.22 }); GAL.group.visible = false; A.scene.add(GAL.group);
const WEB = window.__WEB = mkWeb(A, { nodes: 240, span: 44, links: 3 }); WEB.group.visible = false; A.scene.add(WEB.group);

function cam(fov, pos, look) {
  A.camera.fov = fov; A.camera.position.set(pos[0], pos[1], pos[2]);
  A.camera.lookAt(look[0], look[1], look[2]); A.camera.updateProjectionMatrix();
}
const beatOf = (t) => { for (let i = beats.length - 1; i >= 0; i--) if (t >= beats[i].start) return i; return 0; };
const bp = (t, i) => clamp((t - beats[i].start) / (beats[i].end - beats[i].start));
const vp = (t, i) => clamp((t - beats[i].vo) / beats[i].vodur);
const _v = []; // scratch
function globeScreen() {
  if (!_v.length) { for (let i = 0; i < 3; i++) _v.push(new A.THREE.Vector3()); }
  const v = E.globe.getWorldPosition(_v[0]).clone().project(A.camera);
  const edge = E.globe.localToWorld(_v[1].set(E.R, 0, 0)).project(A.camera);
  const rpx = Math.abs(edge.x - v.x) * W / 2;
  return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, r: Math.max(8, rpx) };
}

// ---------------------------------------------------------------- overlays
function hud(step, total = 8) {
  const x = A.fgx, m = 44, L = 30;
  x.save(); x.globalAlpha = 0.22; x.strokeStyle = C.accent; x.lineWidth = 1.6;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const px = sx > 0 ? m : W - m, py = sy > 0 ? m : H - m;
    x.beginPath(); x.moveTo(px, py + sy * L); x.lineTo(px, py); x.lineTo(px + sx * L, py); x.stroke();
  }
  x.restore();
  TY.kicker(x, 'N E X U S', { x: m + 16, y: m + 42, align: 'left', size: 20, track: 6, alpha: 0.5, fill: '#cfe6ff' });
  TY.kicker(x, `${String(step).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, { x: W - m - 16, y: m + 42, align: 'right', size: 20, track: 6, alpha: 0.5, fill: '#cfe6ff' });
  x.save(); x.globalAlpha = 0.18; x.fillStyle = '#bcd9ff';
  x.fillRect(m + 16, m + 56, W - 2 * (m + 16), 1); x.restore();
  TY.pips(x, total, step - 1, 0, { y: H - 88 });
}

function vignetteText(x, y0 = 980, h = 620, a = 0.55) {
  const g = x.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.45, `rgba(0,0,0,${a * 0.6})`);
  g.addColorStop(1, `rgba(0,0,0,${a})`);
  x.fillStyle = g; x.fillRect(0, y0, W, h);
}

function bokeh(x, t, n = 20, alpha = 0.26) {
  const r = mulberry(31);
  x.save(); x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const sx = r(), ph = r() * 6.28, sp = 0.25 + r() * 0.6, sz = 4 + Math.pow(r(), 2) * 22;
    const px = sx * W + Math.sin(t * 0.22 * sp + ph) * 22;
    const band = sx < 0.5 ? 0.42 : 0.58;
    const py = (band + ((r() + t * 0.0035 * sp) % 1) * 0.22) * H;
    const a = alpha * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.7 + ph)));
    const g = x.createRadialGradient(px, py, 0, px, py, sz);
    g.addColorStop(0, `rgba(190,225,255,${a * 0.8})`);
    g.addColorStop(0.6, `rgba(130,190,255,${a * 0.22})`);
    g.addColorStop(1, 'rgba(90,150,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, sz, 0, 6.283); x.fill();
  }
  x.restore();
}

function streak(x, amt, t) {
  if (amt <= 0.01) return;
  const r = mulberry(7);
  x.save(); x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 30; i++) {
    const xx = r() * W, hgt = (0.12 + r() * 0.8) * H * amt, yy = r() * H - hgt / 2;
    const g = x.createLinearGradient(0, yy, 0, yy + hgt);
    g.addColorStop(0, 'rgba(190,225,255,0)');
    g.addColorStop(0.5, `rgba(200,232,255,${(0.08 + 0.28 * r()) * amt})`);
    g.addColorStop(1, 'rgba(190,225,255,0)');
    x.fillStyle = g; x.fillRect(xx, yy, 1 + r() * 2 * amt, hgt);
  }
  x.restore();
}

// ================================================================ BEATS
function sEarth(t, p, v) {
  E.group.visible = true;
  const push = easeOut(p, 2.0);
  cam(40 - 1.5 * push, [0.1, 0.05, lerp(10.0, 8.4, push)], [0.0, 0.32, 0]);
  E.spin(t + 12, 0.05, 0.062);
  A.bloom.strength = 0.42; A.bloom.threshold = 0.93;
  A.grade({ vig: 0.7, grain: 0.028, expo: 0.90 + 0.20 * easeOut(p, 1.6), time: t, chroma: 0 });
  const x = A.fgx;
  vignetteText(x, 940, 980, 0.62);
  const vp1 = vp(t, 0);
  TY.lowerThird(x, { title: 'الأرض', sub: 'OUR PALE BLUE DOT', w: 430, h: 100, y: 330, accent: '#59c8ff' }, inv(0.10, 0.42, p));
  TY.wordReveal(x, 'كل شيء تعرفه…', { x: W - 92, y: 1298, size: 116, weight: 900, family: 'Alex', fill: C.ice, align: 'right' }, clamp(vp1 * 1.12), 0.22);
  TY.wordReveal(x, 'موجود هنا.', { x: W - 92, y: 1448, size: 134, weight: 900, family: 'Kuf', fill: C.accent, align: 'right', glow: 24, glowColor: 'rgba(120,215,255,.8)' }, clamp((vp1 - 0.42) / 0.58), 0.22);
  const sp = easeInOut(inv(0.45, 0.95, vp1));
  const g = x.createLinearGradient(W - 92 - 540, 0, W - 92, 0);
  g.addColorStop(0, 'rgba(143,227,255,0)'); g.addColorStop(1, 'rgba(143,227,255,.9)');
  x.fillStyle = g; x.fillRect(W - 92 - 540 * sp, 1488, 540 * sp, 3);
  hud(1);
  return {};
}

function sPullback(t, p, v) {
  E.group.visible = true;
  const d = lerp(8.3, 44, easeInOut(clamp(p * 1.02)));
  cam(lerp(40, 50, p), [0.1, lerp(0.05, -0.3, p), d], [0, 0, 0]);
  E.spin(t + 12, 0.05, 0.06);
  A.bloom.strength = 0.42; A.bloom.threshold = 0.93;
  A.grade({ vig: 0.76, grain: 0.03, expo: 1.0, time: t, chroma: 0.1 * p });
  const x = A.fgx;
  // expanding scan rings locked to the globe
  const gsc = globeScreen();
  x.save(); x.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) {
    const ph = ((p * 0.9 + k / 3) % 1);
    const rad = gsc.r * (1.05 + ph * 3.2);
    x.strokeStyle = `rgba(140,200,255,${0.13 * (1 - ph)})`; x.lineWidth = 1.4;
    x.beginPath(); x.arc(gsc.x, gsc.y, rad, 0, 6.283); x.stroke();
  }
  x.restore();
  vignetteText(x, 980, 940, 0.7);
  const vp1 = vp(t, 1);
  TY.kicker(x, 'ZOOM OUT  ·  ×46,000,000', { x: W / 2, y: 520, align: 'center', size: 21, track: 8, fill: 'rgba(190,225,255,.75)' }, inv(0, .35, vp1));
  TY.wordReveal(x, 'كرة صغيرة…', { x: W / 2, y: 1300, size: 112, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, vp1, 0.17);
  TY.wordReveal(x, 'معلّقة في الفراغ.', { x: W / 2, y: 1452, size: 104, weight: 800, family: 'Kuf', fill: C.warm, align: 'center', glow: 16, glowColor: 'rgba(255,220,160,.45)' }, clamp((vp1 - 0.4) / 0.6), 0.18);
  hud(2);
  return {};
}

function sSun(t, p, v) {
  E.group.visible = true; SUN.group.visible = true;
  // stage: Earth drifts low-centre, the sun rises behind it → silhouette + fire
  const q = easeInOut(clamp(p * 1.05));
  const d = lerp(18, 11.5, q);
  cam(lerp(44, 38, p), [lerp(1.6, 0.2, q), lerp(1.2, 0.5, q), d], [0, lerp(0.9, 0.35, q), 0]);
  E.group.position.set(lerp(2.6, 0.15, q), lerp(-1.1, -0.55, q), 0);
  E.spin(t + 12, 0.04, 0.05);
  E.mat.uniforms.uExpo.value = lerp(1.0, 0.16, easeIn(clamp(p * 1.6), 2));  // backlit silhouette
  const gs = lerp(0.9, 3.1, easeIn(clamp(p * 1.15), 2.0));
  SUN.group.position.set(lerp(2.9, 0.25, q), lerp(1.7, 1.15, q), -5.5);
  SUN.group.scale.setScalar(gs);
  SUN.update(t);
  SUN.corona.material.opacity = 0.6 + 0.4 * Math.min(1, p * 1.3);
  A.bloom.strength = lerp(0.5, 0.72, p); A.bloom.threshold = 0.9; A.bloom.radius = 0.5;
  A.grade({ vig: 0.72, grain: 0.03, expo: 1.0, time: t, chroma: 0.10 + 0.12 * p });
  const x = A.fgx;
  bokeh(x, t * 1.3, 10, 0.10);
  vignetteText(x, 1060, 860, 0.74);
  const vp1 = vp(t, 2);
  TY.kicker(x, 'THE SUN  ·  1,392,700 KM', { x: W - 92, y: 396, align: 'right', size: 21, track: 8, fill: 'rgba(255,228,190,.9)' }, inv(0, .3, vp1));
  TY.wordReveal(x, 'حولها نجم…', { x: W - 92, y: 1330, size: 100, weight: 900, family: 'Alex', fill: C.warm, align: 'right', glow: 18, glowColor: 'rgba(255,175,85,.55)' }, vp1, 0.18);
  TY.wordReveal(x, 'أكبر منها', { x: W - 92, y: 1462, size: 92, weight: 800, family: 'Kuf', fill: C.ice, align: 'right' }, clamp((vp1 - 0.42) / 0.58), 0.14);
  const np = clamp((vp1 - 0.58) / 0.42);
  if (np > 0) {
    const sc = lerp(1.45, 1, backOut(clamp(np * 3), 2.0));
    x.save(); x.translate(W - 330, 1588); x.scale(sc, sc); x.globalAlpha = clamp(np * 4);
    TY.counter(x, { from: 0, to: 1300000, x: 0, y: 0, size: 74, family: 'Anton', fill: C.gold, align: 'center', glow: 18, glowColor: 'rgba(255,190,90,.6)' }, clamp(np * 1.15));
    x.restore();
    TY.kicker(x, '× TIMES EARTH', { x: W - 92, y: 1640, align: 'right', size: 20, track: 7, fill: 'rgba(255,220,170,.7)', alpha: clamp(np * 3) }, 1);
  }
  hud(3);
  return { flash: Math.max(0, 0.4 - p) * 0.45 };
}

function sLight(t, p, v) {
  // a photon travels across a star field toward the Earth (needle of light)
  E.group.visible = true;
  const d = lerp(17, 30, easeOut(p, 1.6));
  cam(lerp(44, 52, p), [lerp(1.2, -1.0, p), 0.35, d], [0, 0, 0]);
  E.spin(t + 12, 0.05, 0.06);
  A.bloom.strength = 0.5; A.bloom.threshold = 0.9;
  const whip = clamp((p - 0.66) / 0.08) * (1 - clamp((p - 0.74) / 0.22));
  A.grade({ vig: 0.72, grain: 0.032, expo: 1.0, time: t, chroma: 0.18 + 0.4 * whip });
  const x = A.fgx;
  // radial star streaks (speed)
  const sAmt = clamp(p * 1.6) * (1 - clamp((p - 0.78) / 0.22) * 0.5);
  const r = mulberry(99);
  x.save(); x.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 240; k++) {
    const ang = r() * 6.283, rad0 = 40 + r() * 1000;
    const cx = W * 0.42 + Math.cos(ang) * rad0, cy = 760 + Math.sin(ang) * rad0 * 0.95;
    const len = 8 + Math.pow(r(), 2.2) * 480 * sAmt;
    x.strokeStyle = `rgba(200,228,255,${0.08 + r() * 0.35})`;
    x.lineWidth = 0.6 + r() * 1.9;
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len); x.stroke();
  }
  x.restore();
  // photon beam
  const trav = easeInOut(clamp((p - 0.12) / 0.78));
  const by = lerp(360, 1010, trav), bx = lerp(W * 0.14, W * 0.78, trav);
  x.save(); x.globalCompositeOperation = 'lighter';
  const bg = x.createRadialGradient(bx, by, 0, bx, by, 160);
  bg.addColorStop(0, 'rgba(230,245,255,0.95)'); bg.addColorStop(0.15, 'rgba(150,215,255,0.55)');
  bg.addColorStop(0.5, 'rgba(90,170,255,0.16)'); bg.addColorStop(1, 'rgba(60,140,255,0)');
  x.fillStyle = bg; x.beginPath(); x.arc(bx, by, 160, 0, 6.283); x.fill();
  x.strokeStyle = 'rgba(210,240,255,0.85)'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(bx - 260, by - 340); x.lineTo(bx, by); x.stroke();
  x.restore();
  streak(x, whip, t);
  vignetteText(x, 1020, 900, 0.7);
  const vp1 = vp(t, 3);
  TY.kicker(x, 'LIGHT SPEED  ·  299,792 KM/S', { x: 92, y: 400, align: 'left', size: 21, track: 8, fill: 'rgba(190,228,255,.85)' }, inv(0, .3, vp1));
  TY.wordReveal(x, 'أقرب نجم', { x: 92, y: 1300, size: 108, weight: 900, family: 'Alex', fill: C.ice, align: 'left' }, vp1, 0.16);
  TY.wordReveal(x, 'بعد شمسنا…', { x: 92, y: 1432, size: 92, weight: 800, family: 'Kuf', fill: C.dim, align: 'left' }, clamp((vp1 - 0.26) / 0.74), 0.14);
  TY.wordReveal(x, 'أربع سنوات ضوئية.', { x: 92, y: 1610, size: 100, weight: 900, family: 'Kuf', fill: C.accent, align: 'left', glow: 22, glowColor: 'rgba(130,220,255,.75)' }, clamp((vp1 - 0.5) / 0.5), 0.16);
  hud(4);
  return { flash: Math.max(0, 0.3 - p) * 0.4 };
}

function sGalaxy(t, p, v) {
  GAL.group.visible = true;
  const e = easeIn(clamp(p * 1.05), 2.0);
  const d = lerp(11.5, 8.2, e);
  cam(lerp(42, 34, p), [0, lerp(8.6, 5.2, easeInOut(p)), d], [0, 0, 0]);
  GAL.group.scale.setScalar(lerp(1.7, 2.3, easeOut(p, 2)));
  GAL.group.rotation.set(0.95 - 0.30 * easeInOut(p), t * 0.016, 0.30);
  GAL.update(t);
  A.bloom.strength = lerp(0.38, 0.6, p); A.bloom.threshold = 0.94;
  A.grade({ vig: 0.78, grain: 0.03, expo: 1.0, time: t, chroma: 0.12 });
  const x = A.fgx;
  bokeh(x, t, 12, 0.12);
  vignetteText(x, 1180, 740, 0.66);
  const vp1 = vp(t, 4);
  TY.kicker(x, 'THE MILKY WAY  ·  100,000 LY', { x: W / 2, y: 470, align: 'center', size: 21, track: 8, fill: 'rgba(215,235,255,.8)' }, inv(0, .3, vp1));
  TY.wordReveal(x, 'وفي مجرّتنا…', { x: W / 2, y: 1390, size: 98, weight: 800, family: 'Alex', fill: C.ice, align: 'center' }, vp1, 0.18);
  const np = clamp((vp1 - 0.28) / 0.72);
  if (np > 0) {
    const s = lerp(0.75, 1, backOut(clamp(np * 2.2), 1.8));
    x.save(); x.translate(W / 2, 1560); x.scale(s, s); x.globalAlpha = clamp(np * 4);
    TY.counter(x, { from: 0, to: 200, x: 0, y: 0, size: 168, family: 'Anton', fill: C.gold, align: 'center', glow: 26, glowColor: 'rgba(255,200,110,.7)', fmt: v => Math.round(v) + 'B' }, clamp(np * 1.1));
    x.restore();
    TY.kicker(x, 'BILLION STARS', { x: W / 2, y: 1630, align: 'center', size: 22, track: 10, fill: 'rgba(255,225,175,.75)', alpha: clamp(np * 3) }, 1);
  }
  hud(5);
  return {};
}

function sWeb(t, p, v) {
  WEB.group.visible = true;
  GAL.group.visible = p < 0.24;
  // galaxy shrinks into a dot; the cosmic web grows around it
  GAL.group.scale.setScalar(lerp(2.3, lerp(0.22, 0.07, clamp(p * 2)), easeIn(clamp(p * 1.4), 2.0)));
  GAL.group.rotation.set(0.85, t * 0.02, 0.26);
  GAL.update(t);
  const wp = clamp((p - 0.08) / 0.55);
  WEB.group.scale.setScalar(lerp(0.10, 1, easeOut(wp, 2.6)));
  WEB.group.rotation.y = t * 0.045; WEB.group.rotation.x = -0.12 + 0.06 * Math.sin(t * 0.4);
  const d = p < 0.35 ? lerp(9.0, 18, easeOut(p / 0.35, 2)) : lerp(18, 46, easeOut((p - 0.35) / 0.65, 2));
  cam(lerp(36, 58, p), [0, lerp(4.0, 0.5, clamp(p * 2)), d], [0, 0, 0]);
  A.bloom.strength = lerp(0.5, 0.38, p); A.bloom.threshold = 0.95;
  A.grade({ vig: 0.82, grain: 0.032, expo: 1.02, time: t, chroma: 0.1 });
  const x = A.fgx;
  // the galaxy, now a single point of light
  if (p >= 0.20) {
    const dp = clamp((p - 0.20) / 0.22);
    const rad = lerp(30, 7, clamp((p - 0.20) / 0.6));
    x.save(); x.globalCompositeOperation = 'lighter';
    const gg = x.createRadialGradient(W / 2, 690, 0, W / 2, 690, rad * 3.6);
    gg.addColorStop(0, `rgba(255,248,236,${0.85 * dp})`);
    gg.addColorStop(0.12, `rgba(255,224,178,${0.5 * dp})`);
    gg.addColorStop(0.45, `rgba(160,195,255,${0.13 * dp})`);
    gg.addColorStop(1, 'rgba(90,140,255,0)');
    x.fillStyle = gg; x.beginPath(); x.arc(W / 2, 690, rad * 3.6, 0, 6.283); x.fill();
    x.restore();
  }
  vignetteText(x, 1010, 910, 0.70);
  const vp1 = vp(t, 5);
  TY.kicker(x, 'OBSERVABLE UNIVERSE  ·  93 BILLION LY', { x: W / 2, y: 400, align: 'center', size: 19, track: 7, fill: 'rgba(200,225,255,.75)' }, inv(0, .3, vp1));
  TY.wordReveal(x, 'والمجرة كلها…', { x: W / 2, y: 1300, size: 100, weight: 900, family: 'Alex', fill: C.ice, align: 'center' }, vp1, 0.17);
  TY.wordReveal(x, 'مجرد نقطة', { x: W / 2, y: 1428, size: 106, weight: 900, family: 'Kuf', fill: C.accent, align: 'center', glow: 20, glowColor: 'rgba(130,215,255,.7)' }, clamp((vp1 - 0.3) / 0.7), 0.16);
  TY.wordReveal(x, 'في كونٍ أوسع', { x: W / 2, y: 1580, size: 84, weight: 800, family: 'Kuf', fill: C.dim, align: 'center' }, clamp((vp1 - 0.56) / 0.44), 0.14);
  TY.wordReveal(x, 'مما تتخيّل.', { x: W / 2, y: 1688, size: 84, weight: 800, family: 'Kuf', fill: C.dim, align: 'center' }, clamp((vp1 - 0.72) / 0.28), 0.14);
  hud(6);
  return {};
}

function sYou(t, p, v) {
  E.group.visible = true;
  const d = lerp(13.5, 9.0, easeInOut(clamp(p * 1.05)));
  cam(lerp(38, 36, p), [lerp(-0.8, 0.3, p), lerp(2.4, 1.5, p), d], [0, -0.55, 0]);
  E.spin(t + 12, 0.045, 0.055);
  A.bloom.strength = lerp(0.40, 0.52, p); A.bloom.threshold = 0.93;
  A.grade({ vig: 0.88, grain: 0.03, expo: 1.02, time: t, chroma: 0.05 });
  const x = A.fgx;
  const gsc = globeScreen();
  const vp1 = vp(t, 6);

  // ---- targeting reticle locked on the viewer's position
  const rp = easeOut(inv(0.02, 0.30, p), 3);
  const rr = gsc.r * 1.30;
  x.save();
  x.translate(gsc.x, gsc.y);
  x.globalAlpha = 0.55 * rp;
  x.strokeStyle = 'rgba(150,215,255,1)'; x.lineWidth = 2;
  // rotating dashed ring
  x.save(); x.rotate(t * 0.55);
  x.setLineDash([26, 34]);
  x.beginPath(); x.arc(0, 0, rr, 0, 6.283); x.stroke();
  x.restore();
  // solid thin ring + corner brackets
  x.globalAlpha = 0.32 * rp; x.setLineDash([]);
  x.beginPath(); x.arc(0, 0, rr * 1.11, 0, 6.283); x.stroke();
  x.globalAlpha = 0.85 * rp; x.lineWidth = 3;
  const L = 46;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const px = sx * rr * 1.16, py = sy * rr * 1.16;
    x.beginPath(); x.moveTo(px, py - sy * L); x.lineTo(px, py); x.lineTo(px - sx * L, py); x.stroke();
  }
  // crosshair
  x.globalAlpha = 0.5 * rp; x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(-rr * 1.24, 0); x.lineTo(-rr * 1.14, 0); x.moveTo(rr * 1.14, 0); x.lineTo(rr * 1.24, 0); x.stroke();
  x.restore();

  // ---- the dot: you
  const dotP = clamp((vp1 - 0.18) / 0.22);
  if (dotP > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.2);
    const dy = gsc.y + gsc.r * 0.28;
    x.save(); x.globalCompositeOperation = 'lighter';
    const g2 = x.createRadialGradient(gsc.x, dy, 0, gsc.x, dy, 60 + 26 * pulse);
    g2.addColorStop(0, `rgba(255,255,255,${0.95 * dotP})`);
    g2.addColorStop(0.2, `rgba(150,220,255,${0.55 * dotP})`);
    g2.addColorStop(1, 'rgba(90,180,255,0)');
    x.fillStyle = g2; x.beginPath(); x.arc(gsc.x, dy, 60 + 26 * pulse, 0, 6.283); x.fill();
    x.restore();
    x.save(); x.globalAlpha = dotP; x.strokeStyle = 'rgba(190,235,255,.85)'; x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(gsc.x, dy); x.lineTo(gsc.x + 150, dy + 120); x.lineTo(gsc.x + 330, dy + 120); x.stroke();
    x.restore();
    TY.kicker(x, 'YOU ARE HERE', { x: gsc.x + 340, y: dy + 130, align: 'left', size: 20, track: 9, fill: 'rgba(200,235,255,.9)', alpha: dotP }, 1);
  }

  // scrim behind the headline (top half)
  let g3 = x.createLinearGradient(0, 380, 0, 1180);
  g3.addColorStop(0, 'rgba(0,0,0,0.72)'); g3.addColorStop(0.6, 'rgba(0,0,0,0.42)'); g3.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g3; x.fillRect(0, 380, W, 800);
  vignetteText(x, 1180, 740, 0.35);
  TY.wordReveal(x, 'ومع كل هذا…', { x: W - 92, y: 640, size: 94, weight: 900, family: 'Alex', fill: C.ice, align: 'right' }, vp1, 0.2);
  TY.wordReveal(x, 'أنت هنا.', { x: W - 92, y: 806, size: 152, weight: 900, family: 'Kuf', fill: C.accent, align: 'right', glow: 26, glowColor: 'rgba(140,220,255,.8)' }, clamp((vp1 - 0.26) / 0.74), 0.16);
  TY.wordReveal(x, 'وتنظر.', { x: W - 92, y: 952, size: 98, weight: 800, family: 'Kuf', fill: C.warm, align: 'right', glow: 10, glowColor: 'rgba(255,220,170,.4)' }, clamp((vp1 - 0.58) / 0.42), 0.2);
  hud(7);
  return {};
}

function sEnd(t, p, v) {
  E.group.visible = true;
  const d = lerp(9.2, 26, easeOut(p, 2));
  cam(40 + 5 * p, [0, lerp(0, 2.6, p), d], [0, 0.62, 0]);
  E.spin(t + 12, 0.05, 0.06);
  A.bloom.strength = lerp(0.72, 0.42, easeOut(p, 2)); A.bloom.threshold = 0.9;
  A.grade({ vig: 0.92, grain: 0.026, expo: lerp(1.05, 0.92, p), time: t, chroma: 0 });
  const x = A.fgx;
  const burst = clamp((p - 0.02) / 0.45);
  x.save(); x.globalCompositeOperation = 'lighter';
  // soft core bloom behind the wordmark
  const cg = x.createRadialGradient(W / 2, 660, 0, W / 2, 660, 620 * (0.5 + 0.5 * burst));
  cg.addColorStop(0, `rgba(90,150,255,${0.20 * burst})`); cg.addColorStop(0.5, `rgba(60,110,220,${0.07 * burst})`); cg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = cg; x.fillRect(0, 60, W, 1200);
  const nRay = 96;
  for (let k = 0; k < nRay; k++) {
    const a = (k / nRay) * 6.283 + t * 0.03;
    const L = (150 + 900 * easeOut(burst, 2.2) * Math.pow(hash(k * 3.1), 1.7)) * burst;
    if (L < 4) continue;
    const gg = x.createLinearGradient(W / 2, 660, W / 2 + Math.cos(a) * L, 660 + Math.sin(a) * L);
    gg.addColorStop(0, `rgba(190,228,255,${0.55 * burst})`); gg.addColorStop(1, 'rgba(120,180,255,0)');
    x.strokeStyle = gg; x.lineWidth = 0.8 + 1.4 * hash(k * 7.7);
    x.beginPath(); x.moveTo(W / 2, 660); x.lineTo(W / 2 + Math.cos(a) * L, 660 + Math.sin(a) * L); x.stroke();
  }
  x.restore();
  const tpe = easeOut(clamp(p * 1.7), 3);
  x.save(); x.globalAlpha = tpe;
  const sc = lerp(1.14, 1, easeOut(clamp(p * 1.5), 3));
  x.translate(W / 2, 660); x.scale(sc, sc);
  TY.gradLine(x, 'الفضاء بالعربي', { x: 0, y: 0, size: 104, weight: 900, family: 'Alex', align: 'center', c0: '#ffffff', c1: '#eaf7ff', c2: '#9fe1ff', glow: 16, glowColor: 'rgba(150,205,255,.55)' });
  x.restore();
  TY.kicker(x, 'N E X U S', { x: W / 2, y: 790, align: 'center', size: 30, track: 16, fill: C.accent, alpha: tpe }, 1);
  const cp = clamp((p - 0.4) / 0.32);
  if (cp > 0) {
    const al = easeOut(cp, 3);
    x.save(); x.globalAlpha = al;
    TY.roundRect(x, W / 2 - 290, 1150, 580, 104, 52);
    const g = x.createLinearGradient(W / 2 - 290, 0, W / 2 + 290, 0);
    g.addColorStop(0, 'rgba(84,190,255,0.10)'); g.addColorStop(0.5, 'rgba(140,225,255,0.26)'); g.addColorStop(1, 'rgba(84,190,255,0.10)');
    x.fillStyle = g; x.fill(); x.strokeStyle = 'rgba(160,225,255,0.8)'; x.lineWidth = 2.2; x.stroke();
    x.restore();
    TY.line(x, 'تابِع NEXUS', { x: W / 2, y: 1220, size: 44, weight: 800, family: 'Kuf', fill: '#fff', align: 'center', glow: 12, glowColor: 'rgba(160,225,255,.6)', alpha: al });
  }
  const dp = clamp((p - 0.6) / 0.32);
  TY.kicker(x, 'حلقة جديدة كل يوم', { x: W / 2, y: 1330, align: 'center', size: 28, track: 1, fill: 'rgba(200,225,255,.72)', alpha: easeOut(dp, 3) }, 1);
  return { fadeTo: clamp((p - 0.88) / 0.12) * 0.92, flash: Math.max(0, 0.3 - p) * 0.5 };
}

const BEAT_FN = [sEarth, sPullback, sSun, sLight, sGalaxy, sWeb, sYou, sEnd];

// ================================================================ frame
window.renderFrame = (t) => {
  t = clamp(t, 0, TL.total - 1e-4);
  const i = beatOf(t); const b = beats[i];
  const p = bp(t, i), v = vp(t, i);
  E.group.visible = false; SUN.group.visible = false; GAL.group.visible = false;
  WEB.group.visible = false;
  E.group.position.set(0, 0, 0); E.mat.uniforms.uExpo.value = 1.0;
  A.bloom.radius = 0.45;
  const f = A.fgx;
  f.setTransform(1, 0, 0, 1, 0, 0); f.globalAlpha = 1; f.filter = 'none';
  f.globalCompositeOperation = 'source-over';
  f.clearRect(0, 0, W, H);

  stars.material.uniforms.uTime.value = t; stars.rotation.y = t * 0.01;
  nearStars.material.uniforms.uTime.value = t; nearStars.rotation.y = -t * 0.02;

  const extra = BEAT_FN[i](t, p, v) || {};
  A.composer.render();

  const cutT = t - b.start;
  const shakeAmt = cutT < 0.20 ? (0.20 - cutT) * 0.05 : 0;
  const shake = { x: Math.sin(t * 91.3) * shakeAmt, y: Math.cos(t * 77.7) * shakeAmt };
  const zoom = 1.0 + (cutT < 0.28 ? (0.28 - cutT) * 0.05 : 0);
  const o = {
    zoom, shake,
    flash: (extra.flash || 0) + (cutT < 0.10 ? (0.10 - cutT) * 0.30 : 0) + (t < 0.12 ? (0.12 - t) * 3 : 0),
    grain: 0.55, fadeTo: extra.fadeTo || 0, q: 0.94,
  };
  return A.compose(t, o);
};
window.__ready = true;
window.__TL = TL;
