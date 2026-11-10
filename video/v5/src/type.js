// type.js — kinetic Arabic typography: per-word RTL, masked reveals, glow, tracked lines
import { W, H, clamp, lerp, inv, smooth, easeOut, easeIn, backOut, expo } from './core.js';

export const safe = { top: 210, bottom: 300, side: 82 };

export function measure(ctx, str, font) { ctx.font = font; return ctx.measureText(str).width; }

export function setFont(ctx, family, weight, size, track = 0) {
  ctx.font = `${weight} ${size}px ${family}`;
  if (track) ctx.letterSpacing = track + 'px';
}
export function clearFont(ctx) { ctx.letterSpacing = '0px'; }

/** words split keeping arabic order left->right visually */
export function splitWords(str) {
  return str.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}

/**
 * Draw one visual line of aligned text.
 * o: {x, y, align:'right'|'center', font, fill, track, glow, glowColor, alpha, blur, shadow}
 */
export function line(ctx, str, o) {
  setFont(ctx, o.family || 'Alex', o.weight || 900, o.size || 100, o.track || 0);
  ctx.direction = 'rtl';
  ctx.textAlign = o.align || 'right';
  ctx.textBaseline = 'alphabetic';
  const a = o.alpha === undefined ? 1 : o.alpha;
  if (a <= 0.001) { clearFont(ctx); return 0; }
  const w = ctx.measureText(str).width;
  ctx.save();
  if (o.stroke) { ctx.lineWidth = o.strokeW || 6; ctx.strokeStyle = o.stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, o.x, o.y); }
  if (o.glow) {
    ctx.shadowColor = o.glowColor || o.fill || '#fff';
    ctx.shadowBlur = o.glow;
  } else if (o.shadow !== false) {
    ctx.shadowColor = o.shadowColor || 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = o.shadowBlur === undefined ? Math.min(60, (o.size || 100) * 0.45) : o.shadowBlur;
    ctx.shadowOffsetY = o.shadowY === undefined ? (o.size || 100) * 0.05 : o.shadowY;
  }
  ctx.globalAlpha = a;
  ctx.fillStyle = o.fill || '#fff';
  ctx.fillText(str, o.x, o.y);
  ctx.restore();
  ctx.globalAlpha = 1;
  clearFont(ctx);
  return w;
}

/** word-by-word reveal: each word rises + fades in. dir=-1 means the line is centered */
export function wordReveal(ctx, str, o, p, stagger = 0.10) {
  const words = o.words || splitWords(str);
  const fam = o.family || 'Alex', wt = o.weight || 900, size = o.size || 100, track = o.track || 0;
  setFont(ctx, fam, wt, size, track);
  ctx.direction = 'rtl';
  const gap = o.gap === undefined ? size * 0.28 : o.gap;
  const ws = words.map(w => ctx.measureText(w).width);
  const total = ws.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
  let x0;
  if (o.align === 'center') x0 = o.x + total / 2;
  else if (o.align === 'left') x0 = o.x + total;
  else x0 = o.x; // right edge
  let cursor = x0;
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const wi = ws[i];
    const right = cursor;          // rtl: place by right edge
    const cx = right - wi / 2;
    cursor -= wi + gap;
    // reveal timing: word i starts at i*stagger
    const pi = clamp((p - i * stagger) / (1 - (words.length - 1) * stagger * 0.9));
    if (pi <= 0) { out.push(0); continue; }
    const e = easeOut(pi, 3);
    const dy = (1 - backOut(pi, 1.3)) * size * 0.42;
    const a = smooth(pi * 2.2);
    ctx.save();
    ctx.globalAlpha = a * (o.alpha === undefined ? 1 : o.alpha);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (o.glow) { ctx.shadowColor = o.glowColor || o.fill; ctx.shadowBlur = o.glow * (0.4 + 0.6 * e); }
    else { ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = Math.min(56, size * 0.4); ctx.shadowOffsetY = size * 0.045; }
    ctx.fillStyle = o.fill || '#fff';
    if (o.blurIn && pi < 1) ctx.filter = `blur(${(1 - pi) * 8 * (o.blurIn)}px)`;
    ctx.fillText(words[i], cx, o.y + dy);
    ctx.filter = 'none';
    ctx.restore();
    out.push(pi);
  }
  ctx.globalAlpha = 1; clearFont(ctx);
  return { total, cursor, x0 };
}

/** horizontal wipe reveal (clip-rect growth), rtl so it grows from the right */
export function wipeLine(ctx, str, o, p, dirRTL = true) {
  if (p <= 0) return;
  setFont(ctx, o.family || 'Alex', o.weight || 900, o.size || 100, o.track || 0);
  ctx.direction = 'rtl'; ctx.textAlign = o.align || 'right'; ctx.textBaseline = 'alphabetic';
  const w = ctx.measureText(str).width;
  const x0 = o.align === 'center' ? o.x - w / 2 : o.align === 'left' ? o.x : o.x - w;
  const e = easeOut(p, 2.4);
  ctx.save();
  ctx.beginPath();
  if (dirRTL) ctx.rect(x0 + w * (1 - e) - 4, o.y - (o.size || 100) * 1.6, w * e + 8, (o.size || 100) * 2.0);
  else ctx.rect(x0 - 4, o.y - (o.size || 100) * 1.6, w * e + 8, (o.size || 100) * 2.0);
  ctx.clip();
  if (o.glow) { ctx.shadowColor = o.glowColor || o.fill; ctx.shadowBlur = o.glow; }
  else { ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = Math.min(56, (o.size || 100) * 0.4); }
  ctx.fillStyle = o.fill || '#fff';
  ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
  ctx.fillText(str, o.align === 'center' ? o.x : o.align === 'left' ? o.x : o.x, o.y);
  ctx.restore(); ctx.globalAlpha = 1; clearFont(ctx);
  return w;
}

/** odometer-style number counter (latin digits, mono-ish) */
export function counter(ctx, o, p) {
  const v = o.from + (o.to - o.from) * easeOut(p, o.power || 4);
  const str = o.fmt ? o.fmt(v) : Math.round(v).toLocaleString('en-US');
  setFont(ctx, o.family || 'Anton', '400', o.size || 170, o.track || 0);
  ctx.direction = 'ltr'; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'alphabetic';
  ctx.save();
  if (o.glow) { ctx.shadowColor = o.glowColor || o.fill; ctx.shadowBlur = o.glow; }
  else { ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 40; }
  ctx.fillStyle = o.fill || '#fff';
  ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
  ctx.fillText(str, o.x, o.y);
  ctx.restore(); ctx.globalAlpha = 1; clearFont(ctx);
  return str;
}

/** letterspaced latin kicker + rule line */
export function kicker(ctx, txt, o, p = 1) {
  const e = easeOut(p, 3);
  setFont(ctx, o.family || 'Anton', '400', o.size || 30, o.track === undefined ? 9 : o.track);
  ctx.direction = 'ltr'; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
  ctx.save();
  ctx.globalAlpha = (o.alpha === undefined ? 1 : o.alpha) * e;
  ctx.fillStyle = o.fill || 'rgba(150,190,230,.85)';
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 18;
  ctx.fillText(txt, o.x, o.y);
  ctx.restore(); clearFont(ctx);
  if (o.rule) {
    const w = (o.ruleW || 90) * e;
    ctx.save(); ctx.globalAlpha = (o.alpha === undefined ? 1 : o.alpha) * 0.9;
    ctx.fillStyle = o.ruleColor || o.fill || '#7fb6e8';
    if (o.rule === 'left') ctx.fillRect(o.x - (o.ruleAlign === 'right' ? w : 0), o.y + (o.size || 30) * 0.5, w, 2);
    else ctx.fillRect(o.x - w / 2, o.y + (o.size || 30) * 0.55, w, 2);
    ctx.restore();
  }
  return e;
}

/** lower-third glass card; anchors bottom-right, RTL */
export function lowerThird(ctx, o, p) {
  const e = easeOut(clamp(p * 1.25), 4);
  const e2 = easeOut(clamp((p - 0.08) * 1.25), 4);
  if (p <= 0) return;
  const w = o.w || 620, h = o.h || 128;
  const x = o.x === undefined ? W - safe.side - w : o.x;
  const y = o.y === undefined ? H - safe.bottom - h : o.y;
  ctx.save();
  ctx.globalAlpha = e2;
  // glass
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(10,22,40,0.82)'); g.addColorStop(1, 'rgba(6,12,24,0.62)');
  roundRect(ctx, x + (1 - e) * w * 0.5, y, w, h, 10);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(120,190,255,0.45)'; ctx.lineWidth = 1.6; ctx.stroke();
  // accent bar
  ctx.fillStyle = o.accent || '#59c8ff';
  ctx.fillRect(x + w - 6 - (1 - e) * w * 0.4, y + 16, 5, h - 32);
  // texts
  if (o.title) line(ctx, o.title, { x: x + w - 30, y: y + 58, family: 'Kuf', weight: 800, size: 44, fill: o.titleColor || '#fff', align: 'right', shadowBlur: 12 });
  if (o.sub) kicker(ctx, o.sub, { x: x + w - 30, y: y + 98, align: 'right', family: 'Anton', size: 24, track: 6, fill: o.subColor || 'rgba(150,205,255,.9)' }, e2);
  ctx.restore();
  ctx.globalAlpha = 1;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

/** progress pips (7 scenes) */
export function pips(ctx, n, idx, p, o = {}) {
  const w = o.w || 44, gap = 10, y = o.y || H - 120;
  const total = n * w + (n - 1) * gap;
  let x = (W - total) / 2;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i === idx ? (o.active || '#ffffff') : (o.idle || 'rgba(255,255,255,0.22)');
    const pw = i === idx ? w * 1.7 : w;
    ctx.globalAlpha = 0.9;
    roundRect(ctx, x, y, pw, 4.5, 2.5); ctx.fill();
    x += pw + gap;
  }
  ctx.globalAlpha = 1;
}


/** two-tone gradient text with optional outline */
export function gradLine(ctx, str, o, p = 1) {
  if (p <= 0) return 0;
  setFont(ctx, o.family || 'Alex', o.weight || 900, o.size || 100, o.track || 0);
  ctx.direction = 'rtl'; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'alphabetic';
  const w = ctx.measureText(str).width;
  const x0 = o.align === 'center' ? o.x - w / 2 : o.align === 'right' ? o.x - w : o.x;
  const grad = ctx.createLinearGradient(x0, o.y - (o.size || 100) * 0.9, x0, o.y + (o.size || 100) * 0.12);
  grad.addColorStop(0, o.c0 || '#ffffff');
  grad.addColorStop(0.62, o.c1 || '#dff1ff');
  grad.addColorStop(1, o.c2 || '#8fdcff');
  ctx.save();
  ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
  if (o.outline) { ctx.lineWidth = o.outlineW || 3; ctx.strokeStyle = o.outline; ctx.lineJoin = 'round'; ctx.strokeText(str, o.x, o.y); }
  if (o.glow) { ctx.shadowColor = o.glowColor || '#9fdcff'; ctx.shadowBlur = o.glow; }
  ctx.fillStyle = grad; ctx.fillText(str, o.x, o.y);
  ctx.restore(); clearFont(ctx);
  return w;
}
