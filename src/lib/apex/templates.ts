/**
 * قوالب جاهزة عالية الجودة — تُستخدم كمخرَج الوضع التجريبي وكقوالب في المحرّر.
 * كل قالب كود حقيقي يعمل فوراً بلا أي تبعية خارجية.
 */

export const NOVA_DASH = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>NOVA DASH — لعبة نيون سريعة</title>
<style>
  :root { --bg:#05070f; --ink:#e8eefc; --acc:#59a4ff; --acc2:#a855f7; --ok:#2dd4bf; }
  * { box-sizing: border-box; }
  html, body { margin:0; height:100%; background:var(--bg); color:var(--ink);
    font-family: Tajawal, Cairo, system-ui, sans-serif; overflow:hidden; touch-action:none; }
  #wrap { position:fixed; inset:0; display:grid; place-items:center; }
  canvas { display:block; width:100%; height:100%; }
  .hud { position:fixed; inset:auto 0 0 0; display:flex; gap:10px; justify-content:center;
    padding:14px; pointer-events:none; }
  .chip { background:rgba(10,16,32,.72); border:1px solid rgba(148,163,184,.22); border-radius:14px;
    padding:8px 14px; font-weight:700; backdrop-filter: blur(8px); }
  .chip b { color:var(--acc); }
  #overlay { position:fixed; inset:0; display:grid; place-items:center; background:rgba(3,6,14,.82);
    backdrop-filter: blur(6px); text-align:center; padding:24px; }
  #overlay.hide { display:none; }
  .card { max-width:560px; background:linear-gradient(180deg, rgba(22,32,58,.9), rgba(10,14,28,.92));
    border:1px solid rgba(148,163,184,.18); border-radius:24px; padding:28px; box-shadow:0 30px 80px -30px rgba(50,125,255,.55); }
  h1 { margin:0 0 6px; font-size:clamp(26px,6vw,44px); letter-spacing:-.5px; }
  p { margin:0 0 18px; color:#a9b8d4; line-height:1.8; }
  button { cursor:pointer; border:0; border-radius:16px; padding:14px 30px; font:inherit; font-weight:800;
    color:#04121f; background:linear-gradient(120deg,var(--acc),var(--ok)); transition:transform .15s ease; }
  button:hover { transform: translateY(-2px); }
  .keys { margin-top:16px; font-size:13px; color:#7b8bab; }
  @media (prefers-reduced-motion: reduce) { * { animation:none !important; transition:none !important; } }
</style>
</head>
<body>
<div id="wrap"><canvas id="cv" aria-label="ملعب اللعبة"></canvas></div>
<div class="hud">
  <div class="chip">النقاط <b id="score">0</b></div>
  <div class="chip">الأفضل <b id="best">0</b></div>
  <div class="chip">السرعة <b id="spd">1.0</b>x</div>
</div>
<div id="overlay">
  <div class="card">
    <h1>NOVA DASH</h1>
    <p>انطلق في ممر النيون، اجمع البلورات، تجنّب الحواجز. كل ثانية تزيد السرعة وتضيق المساحة.</p>
    <button id="start">ابدأ اللعب</button>
    <div class="keys">تحكم: الأسهم أو WASD · على الهاتف: اسحب يميناً/يساراً · مسافة للقفز</div>
  </div>
</div>
<script>
(function () {
  'use strict';
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');
  const elScore = document.getElementById('score');
  const elBest = document.getElementById('best');
  const elSpd = document.getElementById('spd');
  const overlay = document.getElementById('overlay');
  if (!cv || !ctx || !elScore || !elBest || !elSpd || !overlay) return;

  const CFG = { laneW: 150, playerZ: 0, baseSpeed: 520, speedPerScore: 0.028, maxSpeed: 1500, laneLimit: 3 };

  const state = {
    running: false, last: 0, acc: 0, dt: 1 / 60,
    speed: 120, score: 0, best: 0, dist: 0, lane: 0, targetLane: 0,
    playerY: 0, vy: 0, jumping: false, spawnAt: 0, shake: 0,
    obstacles: [], coins: [], particles: [], keys: {}
  };

  /* التخزين المؤمّن */
  function readBest() {
    try { const raw = localStorage.getItem('nova-dash-best'); return raw ? parseInt(raw, 10) || 0 : 0; } catch (e) { return 0; }
  }
  function writeBest(v) { try { localStorage.setItem('nova-dash-best', String(v)); } catch (e) { /* تجاهل */ } }
  state.best = readBest();
  elBest.textContent = String(state.best);

  /* ضبط المقاس مع نسبة كثافة البكسل */
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.floor(window.innerWidth * dpr);
    cv.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  /* إسقاط منظوري مبسّط: z يتحول إلى مقياس وحافة أفق */
  function project(z) {
    const fov = 420;
    const s = fov / (fov + z + 1);
    return { s: s, y: window.innerHeight * 0.62 * s + 40 * (1 - s) };
  }

  function spawn() {
    const lanes = [-1, 0, 1];
    if (Math.random() < 0.34) {
      const blocked = lanes[(Math.random() * lanes.length) | 0];
      for (const l of lanes) if (l !== blocked) state.obstacles.push({ lane: l, z: 900, hit: false });
    } else {
      state.obstacles.push({ lane: lanes[(Math.random() * lanes.length) | 0], z: 900, hit: false });
    }
    if (Math.random() < 0.75) state.coins.push({ lane: lanes[(Math.random() * lanes.length) | 0], z: 900, y: 0, got: false });
    state.spawnAt = Math.max(0.42, 1.15 - state.score * 0.0022);
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      if (state.particles.length > 220) break;
      state.particles.push({ x: x, y: y, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.9) * 240, life: 0.55, color: color });
    }
  }

  function reset() {
    state.obstacles.length = 0; state.coins.length = 0; state.particles.length = 0;
    state.speed = CFG.baseSpeed * 0.35; state.score = 0; state.dist = 0; state.lane = 0; state.targetLane = 0;
    state.playerY = 0; state.vy = 0; state.jumping = false; state.spawnAt = 0.6; state.shake = 0;
  }

  function start() {
    reset();
    state.running = true;
    state.last = performance.now();
    overlay.classList.add('hide');
  }

  function gameOver() {
    state.running = false;
    if (state.score > state.best) { state.best = state.score; writeBest(state.best); elBest.textContent = String(state.best); }
    overlay.classList.remove('hide');
    const card = overlay.querySelector('.card');
    if (card) {
      card.innerHTML = '<h1>انتهت الجولة</h1><p>نقاطك: <b>' + state.score + '</b> · أفضل نتيجة: <b>' + state.best + '</b></p>' +
        '<button id="start">إعادة المحاولة</button><div class="keys">نصيحة: القفز يمرّ فوق الحواجز المنخفضة</div>';
      const btn = card.querySelector('#start');
      if (btn) btn.addEventListener('click', start);
    }
  }

  function update(dt) {
    const targetSpeed = Math.min(CFG.maxSpeed, CFG.baseSpeed + state.score * CFG.speedPerScore * 12);
    state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 1.6);
    state.dist += state.speed * dt;
    elSpd.textContent = (state.speed / CFG.baseSpeed).toFixed(1);

    state.lane += (state.targetLane - state.lane) * Math.min(1, dt * 12);

    if (state.jumping) {
      state.vy -= 2100 * dt;
      state.playerY += state.vy * dt;
      if (state.playerY <= 0) { state.playerY = 0; state.vy = 0; state.jumping = false; }
    }

    state.spawnAt -= dt;
    if (state.spawnAt <= 0) spawn();

    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const o = state.obstacles[i];
      o.z -= state.speed * dt;
      if (o.z < -60) { state.obstacles.splice(i, 1); continue; }
      if (!o.hit && o.z < 40 && o.z > -20 && Math.abs(o.lane - state.lane) < 0.55 && state.playerY < 66) {
        o.hit = true; state.shake = 1;
        burst(window.innerWidth / 2 + o.lane * CFG.laneW * 0.5, window.innerHeight * 0.66, '#f43f5e', 26);
        gameOver();
        return;
      }
    }

    for (let i = state.coins.length - 1; i >= 0; i--) {
      const c = state.coins[i];
      c.z -= state.speed * dt;
      if (c.z < -40) { state.coins.splice(i, 1); continue; }
      if (!c.got && c.z < 40 && c.z > -20 && Math.abs(c.lane - state.lane) < 0.6) {
        c.got = true;
        state.score += 10;
        elScore.textContent = String(state.score);
        burst(window.innerWidth / 2 + c.lane * CFG.laneW * 0.5, window.innerHeight * 0.62, '#2dd4bf', 14);
        state.coins.splice(i, 1);
      }
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      p.vy += 700 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }

    state.score += Math.max(0, Math.round(state.speed * dt * 0.09));
    elScore.textContent = String(state.score);
    state.shake = Math.max(0, state.shake - dt * 2.4);
  }

  function drawRoad() {
    const w = window.innerWidth, h = window.innerHeight;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#070b18'); g.addColorStop(0.5, '#0a1230'); g.addColorStop(1, '#05070f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(50,125,255,.35)';
    ctx.lineWidth = 2;
    const horizon = h * 0.30;
    const vanishX = w / 2 - state.lane * 16;
    for (const l of [-CFG.laneLimit, CFG.laneLimit + 1]) {
      ctx.beginPath();
      ctx.moveTo(vanishX, horizon);
      const off = (l - state.lane) * CFG.laneW;
      ctx.lineTo(w / 2 + off * 3.2, h);
      ctx.stroke();
    }
    const off = ((-state.dist * 0.6) % 120 + 120) % 120;
    ctx.strokeStyle = 'rgba(94,234,212,.22)';
    for (let i = 0; i < 14; i++) {
      const z = i * 120 + off;
      const p = project(z);
      ctx.beginPath();
      ctx.moveTo(vanishX, horizon + (h - horizon) * p.s * 0.02);
      ctx.lineTo(w / 2 + (0 - state.lane) * CFG.laneW * p.s * 2, p.y);
      ctx.stroke();
    }
  }

  function draw() {
    const w = window.innerWidth, h = window.innerHeight;
    ctx.save();
    if (state.shake > 0) ctx.translate((Math.random() - 0.5) * 9 * state.shake, (Math.random() - 0.5) * 9 * state.shake);
    drawRoad();

    const items = [];
    for (const o of state.obstacles) items.push({ z: o.z, kind: 'o', lane: o.lane });
    for (const c of state.coins) items.push({ z: c.z, kind: 'c', lane: c.lane });
    items.sort(function (a, b) { return b.z - a.z; });

    for (const it of items) {
      const p = project(it.z);
      const x = w / 2 + (it.lane - state.lane) * CFG.laneW * p.s * 2;
      const scale = p.s * 1.4;
      if (it.kind === 'o') {
        const bw = 74 * scale * 2, bh = 90 * scale * 2;
        ctx.fillStyle = 'rgba(244,63,94,.92)';
        ctx.strokeStyle = 'rgba(255,180,190,.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(x - bw / 2, p.y - bh, bw, bh, 12 * scale);
        else ctx.rect(x - bw / 2, p.y - bh, bw, bh);
        ctx.fill(); ctx.stroke();
      } else {
        const r = 15 * scale * 2;
        ctx.fillStyle = 'rgba(45,212,191,.95)';
        ctx.beginPath(); ctx.arc(x, p.y - 34 * scale, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(230,255,250,.45)'; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    const px = w / 2, py = h * 0.68 - state.playerY;
    ctx.fillStyle = '#59a4ff';
    ctx.beginPath();
    ctx.moveTo(px, py - 26);
    ctx.lineTo(px + 20, py + 16);
    ctx.lineTo(px - 20, py + 16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(px, py - 6, 5, 0, Math.PI * 2); ctx.fill();

    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.55);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function frame(t) {
    if (!state.running) return;
    let delta = (t - state.last) / 1000;
    state.last = t;
    if (!isFinite(delta)) delta = 0;
    delta = Math.min(0.033, Math.max(0, delta));
    state.acc += delta;
    while (state.acc >= state.dt) {
      update(state.dt);
      state.acc -= state.dt;
      if (!state.running) break;
    }
    draw();
    if (state.running) requestAnimationFrame(frame);
  }

  /* المدخلات */
  function move(dir) {
    if (!state.running) return;
    state.targetLane = Math.max(-1, Math.min(1, state.targetLane + dir));
  }
  function jump() {
    if (!state.running || state.jumping) return;
    state.jumping = true; state.vy = 780;
  }
  window.addEventListener('keydown', function (e) {
    state.keys[e.key] = true;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') move(1);
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') move(-1);
    else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { jump(); e.preventDefault(); }
    else if (e.key === 'Enter' && !state.running) start();
  });
  window.addEventListener('keyup', function (e) { delete state.keys[e.key]; });
  window.addEventListener('blur', function () { state.keys = {}; });

  let touchStartX = null, touchStartY = null;
  cv.addEventListener('pointerdown', function (e) {
    touchStartX = e.clientX; touchStartY = e.clientY;
  }, { passive: true });
  cv.addEventListener('pointerup', function (e) {
    if (touchStartX === null || touchStartY === null) return;
    const dx = e.clientX - touchStartX, dy = e.clientY - touchStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 28) move(dx < 0 ? 1 : -1);
    else if (dy < -34) jump();
    touchStartX = null; touchStartY = null;
  }, { passive: true });

  /* الإيقاف عند إخفاء التبويب */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state.running) {
      state.running = false;
      overlay.classList.remove('hide');
      const card = overlay.querySelector('.card');
      if (card) {
        card.innerHTML = '<h1>إيقاف مؤقت</h1><p>عدنا؟ أكمل من حيث توقفت.</p><button id="resume">متابعة</button>';
        const btn = card.querySelector('#resume');
        if (btn) btn.addEventListener('click', function () { state.running = true; state.last = performance.now(); overlay.classList.add('hide'); requestAnimationFrame(frame); });
      }
    }
  });

  const startBtn = document.getElementById('start');
  if (startBtn) startBtn.addEventListener('click', function () { requestAnimationFrame(function (t) { start(); state.last = t; requestAnimationFrame(frame); }); });
  draw();
})();
</script>
</body>
</html>`;

export const AURORA_LANDING = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>أورورا — منصة تحليلات للمتاجر العربية</title>
<meta name="description" content="أورورا تجمع بيانات متجرك في لوحة واحدة وتخبرك بما يجب فعله اليوم لزيادة المبيعات." />
<style>
  :root{
    --bg:#070a14; --panel:#0d1424; --ink:#e9eefb; --muted:#9fb0cf;
    --brand:#327dff; --brand2:#a855f7; --ok:#14b8a6;
    --r:18px; --s1:8px; --s2:16px; --s3:24px; --s4:40px; --s5:64px;
  }
  @media (prefers-color-scheme: light){ :root{ --bg:#f6f8fd; --panel:#fff; --ink:#0c1424; --muted:#54637f; } }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:var(--ink); font-family:Tajawal,Cairo,system-ui,sans-serif; line-height:1.8; }
  .wrap{ max-width:1140px; margin-inline:auto; padding-inline:var(--s3); }
  header{ position:sticky; top:0; z-index:9; backdrop-filter:blur(14px); background:color-mix(in oklab, var(--bg) 78%, transparent); border-bottom:1px solid color-mix(in oklab, var(--ink) 10%, transparent); }
  .nav{ display:flex; align-items:center; justify-content:space-between; gap:var(--s2); padding-block:var(--s2); }
  .logo{ display:flex; align-items:center; gap:10px; font-weight:800; font-size:20px; }
  nav a{ color:var(--muted); text-decoration:none; margin-inline-start:var(--s3); font-weight:600; }
  nav a:hover, nav a:focus-visible{ color:var(--ink); }
  .btn{ display:inline-flex; align-items:center; gap:8px; border:0; cursor:pointer; font:inherit; font-weight:800;
    padding:13px 24px; border-radius:14px; background:linear-gradient(120deg,var(--brand),var(--brand2)); color:#fff;
    transition:transform .18s ease, box-shadow .18s ease; box-shadow:0 14px 40px -18px var(--brand); }
  .btn:hover{ transform:translateY(-2px); }
  .btn.ghost{ background:transparent; color:var(--ink); border:1px solid color-mix(in oklab, var(--ink) 18%, transparent); box-shadow:none; }
  .hero{ padding-block:var(--s5) var(--s4); display:grid; gap:var(--s3); grid-template-columns:1.1fr .9fr; align-items:center; }
  .hero h1{ font-size:clamp(30px,5vw,58px); line-height:1.25; margin:0 0 var(--s2); letter-spacing:-.5px; }
  .hero p{ color:var(--muted); font-size:clamp(15px,2vw,19px); margin:0 0 var(--s3); }
  .pill{ display:inline-flex; gap:8px; align-items:center; padding:6px 14px; border-radius:999px; font-size:13px; font-weight:700;
    background:color-mix(in oklab, var(--brand) 16%, transparent); color:var(--brand); margin-bottom:var(--s2); }
  .cards{ display:grid; gap:var(--s2); grid-template-columns:repeat(3,1fr); }
  .card{ background:var(--panel); border:1px solid color-mix(in oklab, var(--ink) 8%, transparent); border-radius:var(--r); padding:var(--s3); }
  .kpi{ font-size:34px; font-weight:800; }
  section{ padding-block:var(--s5); }
  h2{ font-size:clamp(24px,3.4vw,38px); margin:0 0 var(--s2); }
  .muted{ color:var(--muted); }
  .feat{ display:grid; gap:var(--s2); grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); }
  .price{ display:grid; gap:var(--s2); grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); align-items:stretch; }
  .price .card.reco{ border-color:var(--brand); box-shadow:0 24px 70px -30px var(--brand); }
  .badge{ font-size:12px; font-weight:800; padding:4px 10px; border-radius:999px; background:color-mix(in oklab, var(--ok) 18%, transparent); color:var(--ok); }
  details{ background:var(--panel); border-radius:var(--r); padding:var(--s2) var(--s3); margin-bottom:var(--s1); border:1px solid color-mix(in oklab, var(--ink) 8%, transparent); }
  summary{ cursor:pointer; font-weight:700; }
  footer{ border-top:1px solid color-mix(in oklab, var(--ink) 10%, transparent); padding-block:var(--s3); color:var(--muted); }
  .reveal{ opacity:0; transform:translateY(14px); transition:opacity .5s ease, transform .5s ease; }
  .reveal.in{ opacity:1; transform:none; }
  :focus-visible{ outline:2px solid var(--brand); outline-offset:3px; border-radius:8px; }
  @media (prefers-reduced-motion: reduce){ *{ animation:none !important; transition:none !important; } .reveal{ opacity:1; transform:none; } }
  @media (max-width:860px){ .hero{ grid-template-columns:1fr; } .cards{ grid-template-columns:1fr; } nav{ display:none; } }
  @media print{ body{ background:#fff; color:#000 } header, .btn, footer nav{ display:none } }
</style>
</head>
<body>
<header>
  <div class="wrap nav">
    <div class="logo">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#327dff"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs><path d="M8 24V8l16 16V8" fill="none" stroke="url(#lg)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      أورورا
    </div>
    <nav aria-label="التنقل الرئيسي">
      <a href="#features">الميزات</a>
      <a href="#how">كيف يعمل</a>
      <a href="#pricing">الأسعار</a>
      <a href="#faq">الأسئلة</a>
    </nav>
    <button class="btn" type="button" aria-label="ابدأ تجربة مجانية">ابدأ مجاناً</button>
  </div>
</header>

<main>
  <div class="wrap hero">
    <div>
      <span class="pill">✦ جديد: تقارير يومية بالعربية</span>
      <h1>اعرف اليوم ما يجب فعله غداً في متجرك</h1>
      <p>أورورا تجمع بيانات المبيعات والزيارات والسلة المتروكة في لوحة واحدة، وتحوّلها إلى ثلاث خطوات تنفيذية واضحة كل صباح.</p>
      <div style="display:flex; gap:12px; flex-wrap:wrap">
        <button class="btn" type="button">جرّب 14 يوماً مجاناً</button>
        <button class="btn ghost" type="button">شاهد عرضاً 2 دقيقة</button>
      </div>
    </div>
    <div class="cards">
      <div class="card"><div class="muted">المبيعات اليوم</div><div class="kpi" data-count="48250">0</div></div>
      <div class="card"><div class="muted">السلة المتروكة</div><div class="kpi" data-count="312">0</div></div>
      <div class="card"><div class="muted">تحسّن الأسبوع</div><div class="kpi" data-count="27">0</div></div>
    </div>
  </div>

  <section id="features" class="wrap">
    <h2>كل ما تحتاجه، بلا تعقيد</h2>
    <p class="muted">بلا إعداد معقّد، وبلا مصمّم، وبلا انتظار.</p>
    <div class="feat">
      <article class="card reveal"><h3>لوحة واحدة</h3><p class="muted">مبيعات، زيارات، مخزون، وسلة متروكة في شاشة واحدة.</p></article>
      <article class="card reveal"><h3>تقارير عربية</h3><p class="muted">أرقام مفهومة، وترقيم عربي سليم، وتنسيق بالدينار.</p></article>
      <article class="card reveal"><h3>تنبيهات ذكية</h3><p class="muted">نخبرك حين ينخفض المخزون أو يتغير سلوك الشراء.</p></article>
      <article class="card reveal"><h3>تصدير فوري</h3><p class="muted">CSV وPDF بضغطة، جاهز للمحاسب.</p></article>
      <article class="card reveal"><h3>سرعة حقيقية</h3><p class="muted">الصفحة تُحمّل في أقل من ثانية على شبكة 3G.</p></article>
      <article class="card reveal"><h3>خصوصية أولاً</h3><p class="muted">بياناتك لك، وبلا تتبّع خارجي.</p></article>
    </div>
  </section>

  <section id="how" class="wrap">
    <h2>كيف يعمل؟</h2>
    <div class="cards">
      <div class="card"><span class="badge">1</span><h3>اربط متجرك</h3><p class="muted">اضغط زر الربط واختر منصتك.</p></div>
      <div class="card"><span class="badge">2</span><h3>نرتّب البيانات</h3><p class="muted">ننظّف ونوحّد الأرقام تلقائياً.</p></div>
      <div class="card"><span class="badge">3</span><h3>اقرأ خطتك</h3><p class="muted">ثلاث خطوات يومية قابلة للتنفيذ.</p></div>
    </div>
  </section>

  <section id="pricing" class="wrap">
    <h2>أسعار واضحة</h2>
    <div class="price">
      <div class="card"><h3>مبتدئ</h3><div class="kpi">0 دج</div><p class="muted">للتجربة والاستكشاف</p><button class="btn ghost" type="button">ابدأ</button></div>
      <div class="card reco"><span class="badge">الأكثر اختياراً</span><h3>احترافي</h3><div class="kpi">2900 دج</div><p class="muted">شهرياً · بلا حدود على الطلبات</p><button class="btn" type="button">اختر الاحترافي</button></div>
      <div class="card"><h3>مؤسسات</h3><div class="kpi">تواصل</div><p class="muted">حسب حجم متجرك</p><button class="btn ghost" type="button">اتصل بنا</button></div>
    </div>
  </section>

  <section id="faq" class="wrap">
    <h2>الأسئلة الشائعة</h2>
    <details><summary>هل أحتاج مبرمجاً؟</summary><p class="muted">لا. الربط يتم بضغطتين، واللوحة جاهزة من اللحظة الأولى.</p></details>
    <details><summary>هل تدعم المتاجر المحلية؟</summary><p class="muted">نعم، مع تنسيق بالدينار الجزائري ودعم كامل للعربية.</p></details>
    <details><summary>هل بياناتي آمنة؟</summary><p class="muted">بياناتك مشفّرة، ولا تُشارك مع أي طرف ثالث.</p></details>
  </section>
</main>

<footer class="wrap">
  <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:16px">
    <div>© 2026 أورورا — كل الحقوق محفوظة.</div>
    <nav aria-label="روابط التذييل"><a href="#features">الميزات</a> · <a href="#pricing">الأسعار</a> · <a href="#faq">الأسئلة</a></nav>
  </div>
</footer>

<script>
(function () {
  'use strict';
  /* عدّادات الأرقام */
  var kpis = document.querySelectorAll('[data-count]');
  kpis.forEach(function (el) {
    var target = parseInt(el.getAttribute('data-count') || '0', 10) || 0;
    var started = false;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting || started) return;
        started = true;
        var start = performance.now();
        var dur = 1100;
        function tick(t) {
          var p = Math.min(1, (t - start) / dur);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased).toLocaleString('ar-DZ');
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        io.disconnect();
      });
    }, { threshold: 0.35 });
    io.observe(el);
  });

  /* كشف عند التمرير */
  var reveals = document.querySelectorAll('.reveal');
  var ro = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) { entry.target.classList.add('in'); ro.unobserve(entry.target); }
    });
  }, { threshold: 0.15 });
  reveals.forEach(function (el) { ro.observe(el); });
})();
</script>
</body>
</html>`;

export const STARTER_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>بداية جديدة</title>
  <style>
    body { margin:0; min-height:100vh; display:grid; place-items:center;
      background:radial-gradient(1200px 600px at 50% -10%, #12224a, #05070f); color:#e8eefc;
      font-family:Tajawal, system-ui, sans-serif; text-align:center; }
    h1 { font-size:clamp(28px,6vw,52px); margin:0 0 8px; }
    p { color:#9fb0cf; }
  </style>
</head>
<body>
  <main>
    <h1>مرحباً بك في نوفا فورج</h1>
    <p>ابدأ التعديل من هنا — كل شيء يعمل فوراً بلا مكتبات.</p>
  </main>
</body>
</html>`;

export const STARTER_FORM = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>نموذج بتحقق</title>
<style>
  body{ margin:0; min-height:100vh; display:grid; place-items:center; background:#0a1020; color:#e8eefc; font-family:Tajawal,system-ui,sans-serif }
  form{ width:min(420px,92vw); background:#111a30; padding:28px; border-radius:20px; border:1px solid #223; }
  label{ display:block; font-weight:700; margin:14px 0 6px }
  input{ width:100%; padding:12px; border-radius:12px; border:1px solid #2a3a5c; background:#0b1226; color:inherit }
  .err{ color:#ff8fa3; font-size:13px; min-height:18px }
  button{ width:100%; margin-top:16px; padding:14px; border:0; border-radius:14px; font:inherit; font-weight:800;
    background:linear-gradient(120deg,#327dff,#14b8a6); color:#04121f; cursor:pointer }
</style>
</head>
<body>
<form id="f" novalidate>
  <h2 style="margin:0">تواصل معنا</h2>
  <label for="name">الاسم</label>
  <input id="name" name="name" autocomplete="name" required />
  <div class="err" id="e-name" aria-live="polite"></div>
  <label for="phone">الهاتف</label>
  <input id="phone" name="phone" inputmode="tel" autocomplete="tel" placeholder="0XXXXXXXXX" required />
  <div class="err" id="e-phone" aria-live="polite"></div>
  <button type="submit">إرسال</button>
</form>
<script>
(function(){
  'use strict';
  var f = document.getElementById('f');
  if (!f) return;
  var name = document.getElementById('name');
  var phone = document.getElementById('phone');
  var eName = document.getElementById('e-name');
  var ePhone = document.getElementById('e-phone');
  if (!name || !phone || !eName || !ePhone) return;
  f.addEventListener('submit', function(e){
    e.preventDefault();
    var ok = true;
    eName.textContent = ''; ePhone.textContent = '';
    if (name.value.trim().length < 3) { eName.textContent = 'الاسم يجب أن يكون 3 أحرف على الأقل'; ok = false; }
    if (!/^0\\d{9}$/.test(phone.value.trim())) { ePhone.textContent = 'رقم الهاتف يجب أن يبدأ بـ0 ويتكون من 10 أرقام'; ok = false; }
    if (!ok) return;
    f.innerHTML = '<h2>تم الإرسال</h2><p style="color:#9fb0cf">سنعود إليك قريباً.</p>';
  });
})();
</script>
</body>
</html>`;

export const EDITOR_TEMPLATES: { id: string; label: { ar: string; en: string }; code: string }[] = [
  { id: 'game', label: { ar: 'لعبة كانفاس', en: 'Canvas game' }, code: NOVA_DASH },
  { id: 'landing', label: { ar: 'صفحة هبوط', en: 'Landing page' }, code: AURORA_LANDING },
  { id: 'blank', label: { ar: 'بداية فارغة', en: 'Blank' }, code: STARTER_HTML },
  { id: 'form', label: { ar: 'نموذج بتحقق', en: 'Validated form' }, code: STARTER_FORM },
];
