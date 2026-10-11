/**
 * NEXUS SMITH — the game runtime, verbatim.
 *
 * AUTO-GENERATED from scripts/smith-src/*.js; DO NOT EDIT BY HAND.
 * Regenerate with: node scripts/build-smith-runtime.mjs
 *
 * The whole engine (core loop, input, procedural audio, particles, HUD, screens
 * and the 8 blueprints) is one plain-JS IIFE with no imports and no network. It
 * is embedded as a string so a generated game is a single downloadable file and
 * the serverless bundle never needs `fs` at runtime.
 *
 * Safety rules for anyone editing the engine sources:
 *   - no backticks and no ${ inside the JS (it lives in a template literal)
 *   - no "</script" sequence (compose.ts also escapes it defensively)
 *   - every frame is wrapped in try/catch by the loop, and every DOM / storage /
 *     audio call is guarded, so one bad frame never kills the game
 */

export const SMITH_RUNTIME = String.raw`/* ══════════════════════════════════════════════════════════════════════════
   NEXUS SMITH RUNTIME v17 — core engine
   One deterministic, dependency-free engine shared by every blueprint.
   No network, no assets, no template literals (this file is embedded verbatim
   inside a generated HTML file). Everything is guarded: a thrown frame only
   skips that frame, never kills the game.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var CFG = window.__SMITH_CFG__ || {};
  var THEMES = window.__SMITH_THEMES__ || {};
  var STRINGS = window.__SMITH_STR__ || {};
  /* a usable default so a generated file can never render with undefined colours */
  var FALLBACK_THEME = {
    sky0: "#0b1020", sky1: "#141a33", sky2: "#1b1140", glow: "rgba(99,102,241,0.35)",
    star: "#ffffff", starAlpha: 0.7, hill0: "#1a2140", hill1: "#151b34", hill2: "#101528",
    mote: "#8ab4ff", accent: "#6d8bff", aqua: "#37e0d0", gold: "#ffc857", rose: "#ff5f7a",
    hero0: "#8ab4ff", hero1: "#5b6cff", brick0: "#3a2f6b", brick1: "#5b3f8f",
    btn0: "#7c5cff", btn1: "#3f7bff", btnText: "#ffffff", text: "#f4f6ff", dim: "#9aa3c7",
    edge: "rgba(255,255,255,0.18)"
  };
  var THEME = THEMES[CFG.theme] || THEMES.neon || FALLBACK_THEME;
  var STR = STRINGS[CFG.lang] || STRINGS.ar || {
    game: "Nexus Game", play: "PLAY", pause: "PAUSE", resume: "RESUME", menu: "MENU",
    how: "?", sound: "SOUND", muted: "MUTED", best: "BEST", score: "SCORE", level: "LEVEL",
    coins: "COINS", lives: "LIVES", time: "TIME", gameover: "GAME OVER", retry: "RETRY",
    newBest: "NEW RECORD", loading: "LOADING", hint: "", howTitle: "HOW TO PLAY",
    tapToClose: "tap anywhere to close", shareHint: "", paused: "PAUSED", boss: "BOSS",
    phase2: "PHASE 2", wave: "WAVE", key: "KEY", keys: "KEYS", steps: "STEPS",
    needKeys: "keys left:", height: "HEIGHT", bestTile: "BEST", target: "TARGET",
    pairs: "PAIRS", tapLaunch: "tap to launch", by: "by",
    subtitle: function () { return ""; }, states: {}, powers: {}, help: {}, helpDefault: []
  };
  if (typeof STR.subtitle !== "function") {
    var subTpl = STR.subtitle || "%1 · %2";
    STR.subtitle = function (a, b) { return subTpl.replace("%1", a || "").replace("%2", b || ""); };
  }

  /* ── math & rng ─────────────────────────────────────────────────────── */
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function now() { return performance && performance.now ? performance.now() : Date.now(); }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var R = mulberry32(CFG.seed || 1337);
  function rnd(a, b) { if (b === undefined) { b = a; a = 0; } return a + (b - a) * R(); }
  function rint(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(R() * arr.length) % arr.length]; }

  /* ── canvas ─────────────────────────────────────────────────────────── */
  var cv = document.getElementById("nx-canvas");
  var ctx = cv && cv.getContext ? cv.getContext("2d") : null;
  var W = 480, H = 720, DPR = 1;
  function fit() {
    if (!cv) return;
    var r = cv.getBoundingClientRect();
    DPR = clamp(window.devicePixelRatio || 1, 1, 2.5);
    W = Math.max(240, Math.round(r.width));
    H = Math.max(320, Math.round(r.height));
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    if (ctx) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.imageSmoothingEnabled = true; }
  }
  window.addEventListener("resize", function () { fit(); if (G && G.onResize) G.onResize(); });
  window.addEventListener("orientationchange", function () { setTimeout(fit, 220); });

  /* ── storage (local + optional cloud bridge) ────────────────────────── */
  var store = {
    get: function (k, d) {
      try { var v = window.localStorage.getItem("smith:" + (CFG.slug || "g") + ":" + k); return v === null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set: function (k, v) {
      try { window.localStorage.setItem("smith:" + (CFG.slug || "g") + ":" + k, JSON.stringify(v)); } catch (e) { /* private mode */ }
      try {
        if (window.NexusDB && window.NexusDB.save) window.NexusDB.save(k, v);
      } catch (e) { /* sandbox */ }
    }
  };

  /* ── audio: 100% procedural, unlocked on first gesture ──────────────── */
  var AC = null, master = null, musicGain = null, musicTimer = null, muted = !CFG.sound;
  function audioOn() {
    if (AC || muted) return;
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      AC = new C();
      master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
      musicGain = AC.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
    } catch (e) { AC = null; }
  }
  function beep(freq, dur, type, vol, slide) {
    if (!AC || muted) return;
    try {
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(clamp(freq, 30, 8000), AC.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(clamp(slide, 30, 8000), AC.currentTime + dur);
      g.gain.setValueAtTime(0.0001, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, (vol === undefined ? 0.25 : vol)), AC.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
      o.connect(g); g.connect(master); o.start(); o.stop(AC.currentTime + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  function noise(dur, vol, hp) {
    if (!AC || muted) return;
    try {
      var n = Math.floor(AC.sampleRate * dur);
      var buf = AC.createBuffer(1, n, AC.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = AC.createBufferSource(); s.buffer = buf;
      var f = AC.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp || 400;
      var g = AC.createGain(); g.gain.value = vol === undefined ? 0.2 : vol;
      s.connect(f); f.connect(g); g.connect(master); s.start();
    } catch (e) { /* ignore */ }
  }
  var SFX = {
    jump: function () { beep(420, 0.14, "square", 0.22, 780); },
    coin: function () { beep(980, 0.07, "triangle", 0.22); setTimeout(function () { beep(1420, 0.09, "triangle", 0.2); }, 55); },
    hit: function () { noise(0.18, 0.3, 260); beep(120, 0.2, "sawtooth", 0.2, 60); },
    boom: function () { noise(0.4, 0.34, 90); beep(80, 0.4, "sawtooth", 0.22, 40); },
    power: function () { beep(520, 0.1, "sine", 0.24, 1040); setTimeout(function () { beep(780, 0.14, "sine", 0.2, 1320); }, 90); },
    click: function () { beep(660, 0.05, "square", 0.14); },
    level: function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { beep(f, 0.14, "triangle", 0.2); }, i * 90); }); },
    over: function () { [440, 349, 262, 196].forEach(function (f, i) { setTimeout(function () { beep(f, 0.24, "sawtooth", 0.2); }, i * 150); }); },
    shoot: function () { beep(880, 0.06, "square", 0.12, 320); },
    swap: function () { beep(300, 0.05, "sine", 0.16, 460); },
    tick: function () { beep(1200, 0.03, "square", 0.08); }
  };
  /* tiny generative music loop — 8 steps, changes with the level */
  var MUSIC = { step: 0, next: 0, on: true };
  var SCALE = [0, 3, 5, 7, 10, 12, 15];
  function musicTick(t) {
    if (!AC || muted || !MUSIC.on || state !== "PLAYING") return;
    if (t < MUSIC.next) return;
    MUSIC.next = t + 0.24;
    try {
      var root = 110 * (1 + (level % 4) * 0.06);
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = MUSIC.step % 4 === 0 ? "triangle" : "sine";
      var note = SCALE[(MUSIC.step * 2 + level) % SCALE.length];
      o.frequency.value = root * Math.pow(2, note / 12);
      g.gain.setValueAtTime(0.0001, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(0.5, AC.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 0.26);
      o.connect(g); g.connect(musicGain); o.start(); o.stop(AC.currentTime + 0.3);
      if (MUSIC.step % 4 === 0) noise(0.06, 0.09, 900);
      MUSIC.step = (MUSIC.step + 1) % 32;
    } catch (e) { /* ignore */ }
  }
  function toggleMute() {
    muted = !muted;
    store.set("muted", muted);
    if (!muted) audioOn();
    if (muted && AC) { try { AC.suspend(); } catch (e) {} }
    else if (AC) { try { AC.resume(); } catch (e) {} }
    paintButtons();
  }

  /* ── input ──────────────────────────────────────────────────────────── */
  var keys = {}, pressed = {};
  var touch = { active: false, x: 0, y: 0, sx: 0, sy: 0, dx: 0, dy: 0, tap: false, hold: false };
  function onKeyDown(e) {
    var k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d"].indexOf(k) >= 0) e.preventDefault();
    if (!keys[k]) pressed[k] = true;
    keys[k] = true;
    if (k === "p" || k === "escape") togglePause();
    if (k === "m") toggleMute();
    if (k === "enter" || k === " ") {
      if (state === "MENU" || state === "GAMEOVER") startRun();
      else if (state === "PAUSED") togglePause();
    }
    audioOn();
  }
  function onKeyUp(e) { keys[e.key.toLowerCase()] = false; }
  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);

  function localPos(ev) {
    var r = cv.getBoundingClientRect();
    var p = ev.touches && ev.touches[0] ? ev.touches[0] : ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0] : ev;
    return { x: (p.clientX - r.left), y: (p.clientY - r.top) };
  }
  function onDown(ev) {
    audioOn();
    var p = localPos(ev);
    touch.active = true; touch.sx = p.x; touch.sy = p.y; touch.x = p.x; touch.y = p.y;
    touch.dx = 0; touch.dy = 0; touch.tap = true; touch.hold = true;
    handlePointer("down", p);
    if (ev.cancelable) ev.preventDefault();
  }
  function onMove(ev) {
    if (!touch.active) return;
    var p = localPos(ev);
    touch.x = p.x; touch.y = p.y;
    touch.dx = p.x - touch.sx; touch.dy = p.y - touch.sy;
    if (Math.abs(touch.dx) > 12 || Math.abs(touch.dy) > 12) touch.tap = false;
    handlePointer("move", p);
    if (ev.cancelable) ev.preventDefault();
  }
  function onUp(ev) {
    var p = localPos(ev);
    handlePointer("up", p);
    if (touch.tap) handlePointer("tap", p);
    touch.active = false; touch.hold = false; touch.dx = 0; touch.dy = 0;
    if (ev.cancelable) ev.preventDefault();
  }
  if (cv) {
    cv.addEventListener("mousedown", onDown);
    cv.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    cv.addEventListener("touchstart", onDown, { passive: false });
    cv.addEventListener("touchmove", onMove, { passive: false });
    cv.addEventListener("touchend", onUp, { passive: false });
    cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && state === "PLAYING") setState("PAUSED");
  });

  /* on-screen buttons (always present on touch, optional on desktop) */
  var btns = {};
  function bindButtons() {
    ["left", "right", "up", "down", "act"].forEach(function (id) {
      var el = document.getElementById("nx-b-" + id);
      if (!el) return;
      btns[id] = el;
      var on = function (e) { e.preventDefault(); audioOn(); pressed["pad:" + id] = true; keys["pad:" + id] = true; el.classList.add("on"); };
      var off = function (e) { e.preventDefault(); keys["pad:" + id] = false; el.classList.remove("on"); };
      el.addEventListener("touchstart", on, { passive: false });
      el.addEventListener("touchend", off, { passive: false });
      el.addEventListener("touchcancel", off, { passive: false });
      el.addEventListener("mousedown", on);
      el.addEventListener("mouseup", off);
      el.addEventListener("mouseleave", off);
    });
    var pm = document.getElementById("nx-b-pause"); if (pm) pm.addEventListener("click", function () { audioOn(); togglePause(); });
    var mm = document.getElementById("nx-b-mute"); if (mm) mm.addEventListener("click", function () { toggleMute(); });
    var fs = document.getElementById("nx-b-full");
    if (fs) fs.addEventListener("click", function () {
      var box = document.getElementById("nx-stage");
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (box && box.requestFullscreen) box.requestFullscreen();
      } catch (e) { /* not allowed */ }
    });
    paintButtons();
  }
  function paintButtons() {
    var mm = document.getElementById("nx-b-mute");
    if (mm) mm.textContent = muted ? STR.muted : STR.sound;
    if (CFG.mobile === false && btns.act) {
      ["left", "right", "up", "down", "act"].forEach(function (id) { if (btns[id]) btns[id].style.display = "none"; });
    }
  }
  function pad(id) { return !!keys["pad:" + id]; }
  function tapPad(id) { var v = !!pressed["pad:" + id]; pressed["pad:" + id] = false; return v; }
  function left() { return keys.arrowleft || keys.a || pad("left"); }
  function right() { return keys.arrowright || keys.d || pad("right"); }
  function upHeld() { return keys.arrowup || keys.w || pad("up") || pad("act"); }
  function downHeld() { return keys.arrowdown || keys.s || pad("down"); }
  function jumpPressed() {
    var v = pressed[" "] || pressed.arrowup || pressed.w || tapPad("up") || tapPad("act") || touch.tap;
    pressed[" "] = false; pressed.arrowup = false; pressed.w = false;
    return !!v;
  }

  /* ── particles / juice ─────────────────────────────────────────────── */
  var parts = [], floats = [], shake = 0, hitStop = 0, flash = 0;
  function burst(x, y, n, color, spd, life) {
    if (parts.length > 420) return;
    for (var i = 0; i < n; i++) {
      var a = rnd(0, TAU), s = rnd(0.35, 1) * (spd || 190);
      parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rnd(1.6, 4.2), l: (life || 0.6) * rnd(0.6, 1.3), t: 0, c: color || THEME.accent });
    }
  }
  function floatText(x, y, txt, color) {
    if (floats.length > 30) floats.shift();
    floats.push({ x: x, y: y, txt: String(txt), c: color || THEME.gold, t: 0, l: 0.95 });
  }
  function updateJuice(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 460 * dt; p.vx *= 0.99;
      if (p.t >= p.l) parts.splice(i, 1);
    }
    for (var j = floats.length - 1; j >= 0; j--) {
      var f = floats[j]; f.t += dt; f.y -= 42 * dt;
      if (f.t >= f.l) floats.splice(j, 1);
    }
    shake = Math.max(0, shake - dt * 3.4);
    flash = Math.max(0, flash - dt * 3.2);
  }
  function drawJuice() {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], a = 1 - p.t / p.l;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + a * 0.9), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (var j = 0; j < floats.length; j++) {
      var f = floats[j], k = 1 - f.t / f.l;
      ctx.globalAlpha = clamp(k, 0, 1);
      ctx.fillStyle = f.c;
      ctx.font = "800 " + Math.round(clamp(W * 0.045, 14, 26)) + "px " + FONT;
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    if (flash > 0) {
      ctx.fillStyle = "rgba(255,255,255," + (flash * 0.35).toFixed(3) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }


  /* ── state machine ─────────────────────────────────────────────────── */
  var state = "LOADING", prevState = "MENU";
  var score = 0, best = store.get("best", 0), level = 1, lives = 3, combo = 0, comboTimer = 0;
  var runTime = 0, levelTime = 0, frames = 0, fps = 60;
  var health = 100, maxHealth = 100, coins = 0, power = null, powerTimer = 0;
  var G = null;                       /* the active blueprint */
  var FONT = "system-ui, 'Segoe UI', Tahoma, sans-serif";
  var transition = 0, transTo = null;
  var loadProgress = 0;

  function setState(s) {
    if (state === s) return;
    prevState = state;
    state = s;
    var bar = document.getElementById("nx-state");
    if (bar) bar.textContent = STR.states[s] || s;
    if (s === "PLAYING") { report("state", s); }
    if (s === "GAMEOVER") { SFX.over(); saveBest(); }
    if (s === "MENU") { MUSIC.step = 0; }
  }
  function togglePause() {
    if (state === "PLAYING") { setState("PAUSED"); SFX.click(); }
    else if (state === "PAUSED") { setState("PLAYING"); SFX.click(); }
  }
  function addScore(n, x, y, label) {
    var mult = 1 + Math.min(combo, 20) * 0.05;
    var v = Math.round(n * mult);
    score = Math.max(0, score + v);
    if (x !== undefined && y !== undefined) floatText(x, y, (label || "") + "+" + v);
    var hs = document.getElementById("nx-score"); if (hs) hs.textContent = String(score);
    return v;
  }
  function addCombo() { combo++; comboTimer = 2.4; }
  function resetCombo() { combo = 0; comboTimer = 0; }
  function bumpLevel(n) {
    level += (n || 1);
    SFX.level(); flash = 0.9;
    floatText(W / 2, H * 0.4, STR.level + " " + level, THEME.gold);
    var hl = document.getElementById("nx-level"); if (hl) hl.textContent = String(level);
    report("level", level);
  }
  function hurt(n) {
    if (power === "shield") { power = null; powerTimer = 0; SFX.power(); floatText(W / 2, H * 0.5, STR.shield, THEME.aqua); return false; }
    health = clamp(health - n, 0, maxHealth);
    lives = health > 0 ? lives : lives - 1;
    shake = Math.max(shake, 0.85); hitStop = 0.06; flash = 0.7;
    SFX.hit();
    if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) {} }
    paintHud();
    if (health <= 0) {
      if (lives > 0) { health = maxHealth; G.revive && G.revive(); }
      else { setState("GAMEOVER"); }
    }
    return true;
  }
  function paintHud() {
    var h = document.getElementById("nx-hp");
    if (h) h.style.width = clamp((health / maxHealth) * 100, 0, 100) + "%";
    var c = document.getElementById("nx-coins"); if (c) c.textContent = String(coins);
    var l = document.getElementById("nx-lives"); if (l) l.textContent = String(Math.max(0, lives));
    var cb = document.getElementById("nx-combo");
    if (cb) { cb.textContent = combo > 1 ? "x" + combo : ""; cb.style.opacity = combo > 1 ? "1" : "0"; }
    var pw = document.getElementById("nx-power");
    if (pw) { pw.textContent = power ? STR.powers[power] || power : ""; pw.style.opacity = power ? "1" : "0"; }
  }
  function saveBest() {
    if (score > best) { best = score; store.set("best", best); }
    var b = document.getElementById("nx-best"); if (b) b.textContent = String(best);
    report("score", { score: score, level: level, best: best, coins: coins, time: Math.round(runTime) });
  }
  /* talk to the host page when embedded in the Nexus app (downloaded copies
     simply have no parent listener, which is fine — never throws) */
  function report(kind, value) {
    try {
      if (window.parent && window.parent !== window)
        window.parent.postMessage({ source: "nexus-smith", slug: CFG.slug || "", kind: kind, value: value }, "*");
    } catch (e) { /* sandboxed */ }
  }

  function startRun() {
    R = mulberry32((CFG.seed || 1337) + Math.floor(Math.random() * 100000));
    score = 0; level = 1; combo = 0; comboTimer = 0; coins = 0;
    lives = CFG.blueprint === "breaker" || CFG.blueprint === "shooter" || CFG.blueprint === "runner" ? 3 : 1;
    maxHealth = 100; health = maxHealth;
    power = null; powerTimer = 0; runTime = 0; levelTime = 0;
    parts.length = 0; floats.length = 0; shake = 0; flash = 0;
    G.reset();
    paintHud();
    var hs = document.getElementById("nx-score"); if (hs) hs.textContent = "0";
    var hl = document.getElementById("nx-level"); if (hl) hl.textContent = "1";
    setState("PLAYING");
    audioOn();
    report("start", { blueprint: CFG.blueprint, difficulty: CFG.difficulty });
  }


  /* ── art: living backgrounds, never a black void ────────────────────── */
  var stars = [], hills = [], motes = [];
  function initScenery() {
    stars.length = 0; hills.length = 0; motes.length = 0;
    for (var i = 0; i < 90; i++) stars.push({ x: R(), y: R(), r: rnd(0.5, 1.9), tw: rnd(0, TAU), s: rnd(0.2, 1) });
    for (var h = 0; h < 3; h++) {
      var pts = [];
      for (var p = 0; p <= 12; p++) pts.push(rnd(0.12, 0.42) + h * 0.09);
      hills.push({ pts: pts, hue: h, spd: 8 + h * 12, off: rnd(0, 400) });
    }
    for (var m = 0; m < 34; m++) motes.push({ x: R(), y: R(), r: rnd(1, 3.4), v: rnd(6, 30), a: rnd(0.15, 0.5) });
  }
  function drawSky(t) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, THEME.sky0); g.addColorStop(0.55, THEME.sky1); g.addColorStop(1, THEME.sky2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    /* sun / moon glow */
    var gx = W * 0.74, gy = H * 0.18;
    var rg = ctx.createRadialGradient(gx, gy, 2, gx, gy, Math.max(W, H) * 0.42);
    rg.addColorStop(0, THEME.glow); rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    /* stars */
    ctx.save();
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var a = 0.35 + 0.65 * Math.abs(Math.sin(t * s.s + s.tw));
      ctx.globalAlpha = a * THEME.starAlpha;
      ctx.fillStyle = THEME.star;
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H * 0.75, s.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
    /* parallax hills / skyline */
    for (var h = 0; h < hills.length; h++) {
      var hl = hills[h];
      var base = H * (0.62 + h * 0.11);
      ctx.beginPath();
      ctx.moveTo(0, H);
      var shift = ((t * hl.spd) % W);
      for (var p = 0; p <= 12; p++) {
        var x = (p / 12) * (W + 200) - 100;
        var y = base - hl.pts[p] * H * (0.5 - h * 0.1);
        ctx.lineTo(x - shift * 0.02 * (h + 1), y);
      }
      ctx.lineTo(W, H); ctx.closePath();
      ctx.fillStyle = h === 2 ? THEME.hill2 : h === 1 ? THEME.hill1 : THEME.hill0;
      ctx.fill();
    }
    /* drifting motes */
    for (var m = 0; m < motes.length; m++) {
      var mo = motes[m];
      mo.y -= (mo.v * 0.016) / H;
      if (mo.y < -0.05) { mo.y = 1.05; mo.x = R(); }
      ctx.globalAlpha = mo.a;
      ctx.fillStyle = THEME.mote;
      ctx.beginPath(); ctx.arc(mo.x * W, mo.y * H, mo.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function vignette() {
    var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.78);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function roundRect(x, y, w, h, r) {
    var rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  function chip(x, y, w, h, label, value, color) {
    ctx.save();
    roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = "rgba(10,12,20,0.55)"; ctx.fill();
    ctx.strokeStyle = color || THEME.edge; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = THEME.dim;
    ctx.font = "600 " + Math.round(h * 0.34) + "px " + FONT;
    ctx.fillText(label, x + h * 0.42, y + h / 2 + 0.5);
    ctx.fillStyle = color || THEME.gold;
    ctx.font = "800 " + Math.round(h * 0.44) + "px " + FONT;
    ctx.textAlign = "right";
    ctx.fillText(String(value), x + w - h * 0.42, y + h / 2 + 0.5);
    ctx.restore();
  }

  /* ── menu buttons drawn on canvas (hit-tested on tap) ──────────────── */
  var uiButtons = [];
  function uiButton(id, x, y, w, h, label, kind) {
    uiButtons.push({ id: id, x: x, y: y, w: w, h: h, label: label, kind: kind || "primary" });
  }
  function drawUiButtons() {
    for (var i = 0; i < uiButtons.length; i++) {
      var b = uiButtons[i];
      ctx.save();
      var hot = touch.active && touch.x > b.x && touch.x < b.x + b.w && touch.y > b.y && touch.y < b.y + b.h;
      roundRect(b.x, b.y + (hot ? 2 : 0), b.w, b.h, b.h * 0.32);
      if (b.kind === "primary") {
        var g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
        g.addColorStop(0, THEME.btn0); g.addColorStop(1, THEME.btn1);
        ctx.fillStyle = g; ctx.fill();
        ctx.shadowColor = THEME.glow; ctx.shadowBlur = hot ? 26 : 14;
        ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = THEME.btnText;
      } else {
        ctx.fillStyle = "rgba(12,14,22,0.6)"; ctx.fill();
        ctx.strokeStyle = THEME.edge; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = THEME.text;
      }
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "800 " + Math.round(clamp(b.h * 0.36, 13, 22)) + "px " + FONT;
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + (hot ? 2 : 0) + 1);
      ctx.restore();
    }
  }
  function handlePointer(kind, p) {
    if (kind !== "tap") {
      if (G && G.pointer) G.pointer(kind, p.x, p.y);
      return;
    }
    for (var i = 0; i < uiButtons.length; i++) {
      var b = uiButtons[i];
      if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) {
        SFX.click();
        if (b.id === "play" || b.id === "retry") startRun();
        else if (b.id === "resume") setState("PLAYING");
        else if (b.id === "menu") setState("MENU");
        else if (b.id === "mute") toggleMute();
        else if (b.id === "how") { showHow = !showHow; }
        else if (G && G.button) G.button(b.id);
        return;
      }
    }
    if (G && G.pointer) G.pointer("tap", p.x, p.y);
  }
  var showHow = false;

  /* ── screens ───────────────────────────────────────────────────────── */
  function centerText(txt, y, size, color, weight, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = color || THEME.text;
    ctx.font = (weight || 800) + " " + Math.round(size) + "px " + FONT;
    ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 12;
    ctx.fillText(txt, W / 2, y);
    ctx.restore();
  }
  function drawTitle(t) {
    var title = CFG.title || STR.game;
    var size = clamp(W * 0.088, 26, 58);
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "900 " + Math.round(size) + "px " + FONT;
    var g = ctx.createLinearGradient(0, H * 0.2 - size, 0, H * 0.2 + size);
    g.addColorStop(0, THEME.gold); g.addColorStop(0.5, THEME.text); g.addColorStop(1, THEME.accent);
    ctx.fillStyle = g;
    ctx.shadowColor = THEME.glow; ctx.shadowBlur = 26;
    var bob = Math.sin(t * 1.6) * 4;
    ctx.fillText(title, W / 2, H * 0.2 + bob);
    ctx.restore();
    centerText(STR.subtitle(CFG.blueprintLabel || "", CFG.difficultyLabel || ""), H * 0.2 + size * 0.95, clamp(W * 0.032, 12, 17), THEME.dim, 600);
    centerText(STR.by + " " + (CFG.heroName || "Nexus"), H * 0.2 + size * 1.55, clamp(W * 0.028, 11, 15), THEME.dim, 500);
  }
  function drawMenu(t) {
    drawSky(t);
    if (G && G.drawIdle) G.drawIdle(t);
    vignette();
    drawTitle(t);
    var bw = Math.min(W * 0.62, 320), bh = Math.max(48, H * 0.075), bx = (W - bw) / 2;
    var by = H * 0.52;
    uiButton("play", bx, by, bw, bh, STR.play, "primary");
    uiButton("how", bx, by + bh * 1.35, bw * 0.48, bh * 0.82, STR.how, "ghost");
    uiButton("mute", bx + bw * 0.52, by + bh * 1.35, bw * 0.48, bh * 0.82, muted ? STR.muted : STR.sound, "ghost");
    centerText(STR.best + ": " + best, H * 0.45, clamp(W * 0.036, 13, 19), THEME.gold, 800);
    drawUiButtons();
    if (showHow) drawHow();
    centerText(STR.hint, H * 0.94, clamp(W * 0.026, 10, 14), THEME.dim, 500, 0.8);
  }
  function drawHow() {
    ctx.save();
    roundRect(W * 0.08, H * 0.24, W * 0.84, H * 0.5, 20);
    ctx.fillStyle = "rgba(8,10,18,0.93)"; ctx.fill();
    ctx.strokeStyle = THEME.edge; ctx.lineWidth = 1.6; ctx.stroke();
    var lines = (G && G.help ? G.help() : STR.helpDefault).concat([STR.tapToClose]);
    var lh = clamp(H * 0.045, 18, 30);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "800 " + Math.round(lh * 0.78) + "px " + FONT;
    ctx.fillStyle = THEME.gold;
    ctx.fillText(STR.howTitle, W / 2, H * 0.24 + lh * 0.9);
    ctx.font = "500 " + Math.round(lh * 0.62) + "px " + FONT;
    for (var i = 0; i < lines.length; i++) {
      ctx.fillStyle = i === lines.length - 1 ? THEME.dim : THEME.text;
      ctx.fillText(lines[i], W / 2, H * 0.24 + lh * (1.9 + i));
    }
    ctx.restore();
  }
  function drawPause(t) {
    drawSky(t);
    if (G && G.draw) G.draw(t);
    ctx.fillStyle = "rgba(6,8,16,0.68)"; ctx.fillRect(0, 0, W, H);
    centerText(STR.paused, H * 0.3, clamp(W * 0.08, 24, 44), THEME.text, 900);
    var bw = Math.min(W * 0.6, 300), bh = Math.max(46, H * 0.07), bx = (W - bw) / 2;
    uiButton("resume", bx, H * 0.44, bw, bh, STR.resume, "primary");
    uiButton("menu", bx, H * 0.44 + bh * 1.3, bw, bh * 0.85, STR.menu, "ghost");
    uiButton("mute", bx, H * 0.44 + bh * 2.5, bw, bh * 0.85, muted ? STR.muted : STR.sound, "ghost");
    drawUiButtons();
  }
  function drawGameOver(t) {
    drawSky(t);
    if (G && G.draw) G.draw(t);
    ctx.fillStyle = "rgba(6,8,16,0.75)"; ctx.fillRect(0, 0, W, H);
    var isNew = score >= best && score > 0;
    centerText(STR.gameover, H * 0.24, clamp(W * 0.085, 26, 46), THEME.rose, 900);
    if (isNew) centerText(STR.newBest, H * 0.31, clamp(W * 0.04, 14, 22), THEME.gold, 800);
    var pw = Math.min(W * 0.82, 420), ph = H * 0.22, px = (W - pw) / 2, py = H * 0.37;
    ctx.save();
    roundRect(px, py, pw, ph, 18);
    ctx.fillStyle = "rgba(10,12,20,0.72)"; ctx.fill();
    ctx.strokeStyle = THEME.edge; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    var rows = [
      [STR.score, score], [STR.level, level], [STR.coins, coins],
      [STR.time, Math.round(runTime) + "s"], [STR.best, best]
    ];
    var rh = ph / rows.length;
    ctx.textBaseline = "middle";
    for (var i = 0; i < rows.length; i++) {
      var y = py + rh * (i + 0.5);
      ctx.textAlign = "left"; ctx.fillStyle = THEME.dim;
      ctx.font = "600 " + Math.round(clamp(rh * 0.42, 11, 16)) + "px " + FONT;
      ctx.fillText(rows[i][0], px + 18, y);
      ctx.textAlign = "right"; ctx.fillStyle = THEME.gold;
      ctx.font = "800 " + Math.round(clamp(rh * 0.46, 12, 18)) + "px " + FONT;
      ctx.fillText(String(rows[i][1]), px + pw - 18, y);
    }
    var starCount = scoreStars();
    ctx.textAlign = "center";
    ctx.font = "800 " + Math.round(clamp(W * 0.07, 22, 40)) + "px " + FONT;
    ctx.fillStyle = THEME.gold;
    ctx.fillText("★".repeat(starCount) + "☆".repeat(3 - starCount), W / 2, py + ph + clamp(H * 0.045, 20, 34));
    var bw = Math.min(W * 0.62, 320), bh = Math.max(48, H * 0.075), bx = (W - bw) / 2;
    uiButton("retry", bx, H * 0.74, bw, bh, STR.retry, "primary");
    uiButton("menu", bx, H * 0.74 + bh * 1.3, bw, bh * 0.85, STR.menu, "ghost");
    drawUiButtons();
    centerText(STR.shareHint, H * 0.95, clamp(W * 0.026, 10, 14), THEME.dim, 500, 0.85);
  }
  function scoreStars() {
    var target = (G && G.starScore ? G.starScore() : 1000) * (1 + (level - 1) * 0.35);
    if (score >= target * 1.6) return 3;
    if (score >= target) return 2;
    if (score >= target * 0.45) return 1;
    return 0;
  }
  function drawLoading(t) {
    drawSky(t);
    centerText(CFG.title || STR.game, H * 0.42, clamp(W * 0.07, 22, 40), THEME.text, 900);
    var bw = Math.min(W * 0.6, 300), bh = 10, bx = (W - bw) / 2, by = H * 0.52;
    roundRect(bx, by, bw, bh, bh / 2); ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fill();
    roundRect(bx, by, bw * clamp(loadProgress, 0, 1), bh, bh / 2); ctx.fillStyle = THEME.accent; ctx.fill();
    centerText(STR.loading, H * 0.58, clamp(W * 0.03, 12, 16), THEME.dim, 600);
    void t;
  }


  /* ══ BLUEPRINT 1 — RUNNER: endless 3-lane dash, jump + double jump ═══ */
  function bpRunner() {
    var groundY, px, py, vy, onGround, jumps, duck, speed, dist, spawnT, obs, pickups, decor, trail;
    var laneAnim = 0;
    function reset() {
      groundY = H * 0.78; px = W * 0.24; py = groundY; vy = 0; onGround = true; jumps = 0;
      duck = 0; dist = 0; spawnT = 0.6; obs = []; pickups = []; decor = []; trail = [];
      speed = 240 * CFG.speedMul; laneAnim = 0;
      for (var i = 0; i < 14; i++) decor.push({ x: rnd(0, W), y: rnd(H * 0.35, groundY - 10), s: rnd(0.4, 1.4), t: rint(0, 2) });
      maxHealth = 100; health = 100; lives = 3;
    }
    function jumpPower() { return CFG.difficulty === "easy" ? 620 : CFG.difficulty === "hard" ? 540 : 575; }
    function spawn() {
      var kinds = ["crate", "spike", "bird", "double"];
      if (level >= 3) kinds.push("wall");
      var k = pick(kinds);
      var gap = clamp(340 - level * 12, 190, 340);
      if (k === "bird") obs.push({ k: k, x: W + 60, y: groundY - rnd(70, 110), w: 42, h: 30, ph: rnd(0, TAU) });
      else if (k === "wall") obs.push({ k: k, x: W + 60, y: groundY, w: 26, h: rnd(90, 130) });
      else if (k === "double") {
        obs.push({ k: "crate", x: W + 60, y: groundY, w: 34, h: 34 });
        obs.push({ k: "spike", x: W + 60 + gap * 0.45, y: groundY, w: 34, h: 30 });
      } else obs.push({ k: k, x: W + 60, y: groundY, w: k === "spike" ? 40 : 34, h: k === "spike" ? 30 : 34 });
      if (CFG.powerups && R() < 0.42) {
        var pk = pick(["coin", "coin", "coin", "shield", "magnet", "slow", "boost"]);
        pickups.push({ k: pk, x: W + rnd(140, 320), y: groundY - rnd(40, 150), r: pk === "coin" ? 11 : 15, t: 0, got: false });
      }
    }
    function update(dt) {
      var mul = power === "slow" ? 0.62 : power === "boost" ? 1.45 : 1;
      speed = (240 + level * 16) * CFG.speedMul * mul;
      dist += speed * dt;
      if (dist > 900) { dist -= 900; bumpLevel(1); }
      runTime += dt; levelTime += dt;

      if (jumpPressed()) {
        var maxJ = CFG.difficulty === "easy" ? 3 : 2;
        if (jumps < maxJ) {
          vy = -jumpPower() * (jumps === 0 ? 1 : 0.88);
          jumps++; onGround = false; SFX.jump();
          burst(px, py, 10, THEME.aqua, 130, 0.4);
        }
      }
      duck = downHeld() ? Math.min(1, duck + dt * 7) : Math.max(0, duck - dt * 7);
      vy += 1750 * dt;
      py += vy * dt;
      if (py >= groundY) { py = groundY; vy = 0; if (!onGround) burst(px, groundY, 8, THEME.dim, 90, 0.3); onGround = true; jumps = 0; }

      spawnT -= dt * (0.7 + level * 0.05);
      if (spawnT <= 0) { spawn(); spawnT = rnd(0.62, 1.15) * (CFG.difficulty === "insane" ? 0.7 : 1); }

      for (var i = obs.length - 1; i >= 0; i--) {
        var o = obs[i];
        o.x -= speed * dt;
        if (o.k === "bird") o.y = groundY - 84 + Math.sin(now() * 0.004 + o.ph) * 22;
        if (o.x < -80) { obs.splice(i, 1); addCombo(); addScore(6, px, py - 60); continue; }
        var ph = duck > 0.5 ? 22 : 46;
        if (o.x < px + 18 && o.x + o.w > px - 18) {
          var top = o.k === "bird" ? o.y - o.h : o.y - o.h;
          if (py - ph < o.y && py > top - 4) {
            if (hurt(34)) { obs.splice(i, 1); burst(px, py - 20, 26, THEME.rose, 240, 0.7); resetCombo(); }
          }
        }
      }
      for (var j = pickups.length - 1; j >= 0; j--) {
        var p = pickups[j];
        p.x -= speed * dt; p.t += dt;
        if (power === "magnet" && Math.abs(p.x - px) < 190 && !p.got) {
          p.x = lerp(p.x, px, 0.14); p.y = lerp(p.y, py - 24, 0.14);
        }
        if (p.x < -40) { pickups.splice(j, 1); continue; }
        var dx = p.x - px, dy = p.y - (py - 24);
        if (dx * dx + dy * dy < (p.r + 20) * (p.r + 20)) {
          pickups.splice(j, 1);
          if (p.k === "coin") { coins++; addScore(14, p.x, p.y, ""); SFX.coin(); burst(p.x, p.y, 10, THEME.gold, 150, 0.5); }
          else { power = p.k; powerTimer = p.k === "shield" ? 9 : 6.5; SFX.power(); flash = 0.5; floatText(p.x, p.y, STR.powers[p.k] || p.k, THEME.aqua); }
          paintHud();
        }
      }
      for (var d = 0; d < decor.length; d++) {
        decor[d].x -= speed * dt * (0.22 + decor[d].s * 0.2);
        if (decor[d].x < -30) { decor[d].x = W + rnd(10, 120); decor[d].y = rnd(H * 0.3, groundY - 20); }
      }
      if (powerTimer > 0) { powerTimer -= dt; if (powerTimer <= 0) { power = null; paintHud(); } }
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
      trail.push({ x: px, y: py - 22, t: 0 });
      if (trail.length > 16) trail.shift();
      for (var q = 0; q < trail.length; q++) trail[q].t += dt;
      addScore(dt * 12);
      paintHud();
    }
    function draw(t) {
      groundY = H * 0.78;
      /* ground */
      var gg = ctx.createLinearGradient(0, groundY, 0, H);
      gg.addColorStop(0, THEME.hill2); gg.addColorStop(1, THEME.sky2);
      ctx.fillStyle = gg; ctx.fillRect(0, groundY, W, H - groundY);
      ctx.strokeStyle = THEME.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();
      ctx.globalAlpha = 0.22; ctx.lineWidth = 1;
      for (var s = 0; s < 12; s++) {
        var sx = ((s * 70 - (t * speed * 0.9) % 70) + 70) % (W + 70) - 35;
        ctx.beginPath(); ctx.moveTo(sx, groundY); ctx.lineTo(sx - 26, H); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      /* decor */
      for (var d = 0; d < decor.length; d++) {
        var o = decor[d];
        ctx.globalAlpha = 0.25 + o.s * 0.2;
        ctx.fillStyle = o.t === 0 ? THEME.accent : o.t === 1 ? THEME.gold : THEME.aqua;
        if (o.t === 2) { ctx.fillRect(o.x, o.y, 3 * o.s, 16 * o.s); }
        else { ctx.beginPath(); ctx.arc(o.x, o.y, 3 * o.s, 0, TAU); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      /* trail */
      for (var q = 0; q < trail.length; q++) {
        var tr = trail[q], a = 1 - q / trail.length;
        ctx.globalAlpha = a * 0.28;
        ctx.fillStyle = THEME.aqua;
        ctx.beginPath(); ctx.arc(tr.x, tr.y, 12 * a, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      /* obstacles */
      for (var i = 0; i < obs.length; i++) {
        var ob = obs[i];
        ctx.save();
        if (ob.k === "bird") {
          ctx.fillStyle = THEME.rose;
          ctx.beginPath();
          ctx.moveTo(ob.x - ob.w / 2, ob.y);
          ctx.lineTo(ob.x, ob.y - 12 - Math.sin(t * 14 + ob.ph) * 7);
          ctx.lineTo(ob.x + ob.w / 2, ob.y);
          ctx.lineTo(ob.x, ob.y + 10);
          ctx.closePath(); ctx.fill();
          ctx.shadowColor = THEME.rose; ctx.shadowBlur = 14; ctx.fill();
        } else if (ob.k === "spike") {
          ctx.fillStyle = THEME.rose;
          for (var k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.moveTo(ob.x - ob.w / 2 + k * (ob.w / 3), ob.y);
            ctx.lineTo(ob.x - ob.w / 2 + k * (ob.w / 3) + ob.w / 6, ob.y - ob.h);
            ctx.lineTo(ob.x - ob.w / 2 + (k + 1) * (ob.w / 3), ob.y);
            ctx.closePath(); ctx.fill();
          }
        } else {
          ctx.fillStyle = ob.k === "wall" ? THEME.accent : THEME.rose;
          roundRect(ob.x - ob.w / 2, ob.y - ob.h, ob.w, ob.h, 5);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.restore();
      }
      /* pickups */
      for (var j = 0; j < pickups.length; j++) {
        var p = pickups[j];
        ctx.save();
        ctx.translate(p.x, p.y + Math.sin(t * 4 + p.t) * 4);
        if (p.k === "coin") {
          ctx.fillStyle = THEME.gold; ctx.shadowColor = THEME.gold; ctx.shadowBlur = 16;
          ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,0.28)";
          ctx.font = "900 12px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("$", 0, 1);
        } else {
          ctx.fillStyle = p.k === "shield" ? THEME.aqua : p.k === "magnet" ? THEME.rose : THEME.gold;
          ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18;
          roundRect(-p.r, -p.r, p.r * 2, p.r * 2, 7); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.font = "900 14px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(p.k === "shield" ? "◈" : p.k === "magnet" ? "U" : p.k === "slow" ? "◷" : "»", 0, 1);
        }
        ctx.restore();
      }
      /* hero */
      var hh = duck > 0.5 ? 26 : 46, hw = 26;
      ctx.save();
      ctx.translate(px, py - hh / 2);
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 20;
      var bg = ctx.createLinearGradient(0, -hh / 2, 0, hh / 2);
      bg.addColorStop(0, THEME.hero0); bg.addColorStop(1, THEME.hero1);
      ctx.fillStyle = bg;
      roundRect(-hw / 2, -hh / 2, hw, hh, 8); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = THEME.text;
      ctx.fillRect(-hw / 2 + 5, -hh / 2 + 8, 6, 6);
      ctx.fillRect(hw / 2 - 11, -hh / 2 + 8, 6, 6);
      if (power === "shield") {
        ctx.strokeStyle = THEME.aqua; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 8);
        ctx.beginPath(); ctx.arc(0, 0, hw * 0.95, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      /* legs run cycle */
      ctx.strokeStyle = THEME.hero1; ctx.lineWidth = 5; ctx.lineCap = "round";
      var swing = onGround ? Math.sin(t * 18) * 9 : 6;
      ctx.beginPath(); ctx.moveTo(-4, hh / 2 - 2); ctx.lineTo(-4 + swing, hh / 2 + 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5, hh / 2 - 2); ctx.lineTo(5 - swing, hh / 2 + 12); ctx.stroke();
      ctx.restore();
      void laneAnim;
    }
    function drawIdle(t) {
      groundY = H * 0.78;
      py = groundY; px = W * 0.5;
      var bounce = Math.abs(Math.sin(t * 2.4)) * 26;
      ctx.save();
      ctx.translate(px, groundY - 24 - bounce);
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 24;
      var bg = ctx.createLinearGradient(0, -24, 0, 24);
      bg.addColorStop(0, THEME.hero0); bg.addColorStop(1, THEME.hero1);
      ctx.fillStyle = bg; roundRect(-14, -24, 28, 48, 9); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = THEME.text;
      ctx.fillRect(-9, -16, 6, 6); ctx.fillRect(3, -16, 6, 6);
      ctx.restore();
    }
    function help() { return STR.help.runner; }
    function starScore() { return 900; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore };
  }


  /* ══ BLUEPRINT 2 — BREAKER: bricks, multiball, lasers, boss row ══════ */
  function bpBreaker() {
    var paddle, balls, bricks, drops, cols, rows, brickW, brickH, top, launched, lasers, laserT;
    function buildLevel() {
      cols = clamp(6 + Math.floor(level / 3), 6, 10);
      rows = clamp(3 + Math.floor(level / 2), 3, 8);
      brickW = (W - 40) / cols; brickH = clamp(H * 0.028, 14, 22);
      top = H * 0.16;
      bricks = [];
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var hp = 1 + ((r + c + level) % 3 === 0 ? 1 : 0) + (level >= 6 && r === 0 ? 1 : 0);
          if (CFG.difficulty === "hard" || CFG.difficulty === "insane") hp += r === 0 ? 1 : 0;
          var hole = (level > 2) && ((r * 7 + c * 5 + level * 3) % 11 === 0);
          bricks.push({ x: 20 + c * brickW, y: top + r * (brickH + 5), w: brickW - 5, h: brickH, hp: hole ? 0 : hp, max: hp, c: c, r: r });
        }
      }
      balls = [{ x: paddle.x, y: paddle.y - 14, vx: 0, vy: 0, r: 8, stuck: true }];
      drops = []; lasers = []; launched = false;
    }
    function reset() {
      paddle = { x: W / 2, w: Math.min(W * 0.24, 120), h: 14, y: H * 0.88, laser: 0 };
      maxHealth = 100; health = 100; lives = 3;
      buildLevel();
    }
    function revive() { buildLevel(); }
    function launch() {
      for (var i = 0; i < balls.length; i++) {
        if (balls[i].stuck) {
          balls[i].stuck = false;
          var a = rnd(-0.9, -2.24);
          var sp = (330 + level * 12) * CFG.speedMul;
          balls[i].vx = Math.cos(a) * sp; balls[i].vy = Math.sin(a) * sp;
          launched = true; SFX.jump();
        }
      }
    }
    function update(dt) {
      runTime += dt;
      var pw = paddle.w * (power === "wide" ? 1.6 : 1);
      var spd = (520 + level * 14) * CFG.speedMul;
      if (left()) paddle.x -= spd * dt;
      if (right()) paddle.x += spd * dt;
      if (touch.active && touch.hold) paddle.x = lerp(paddle.x, touch.x, 0.42);
      paddle.x = clamp(paddle.x, pw / 2, W - pw / 2);
      if (jumpPressed() || tapPad("up")) launch();
      if (powerTimer > 0) { powerTimer -= dt; if (powerTimer <= 0) { power = null; paintHud(); } }
      if (power === "laser") {
        laserT -= dt;
        if (laserT <= 0) { laserT = 0.34; lasers.push({ x: paddle.x - pw / 2 + 6, y: paddle.y - 6 }, { x: paddle.x + pw / 2 - 6, y: paddle.y - 6 }); SFX.shoot(); }
      }
      for (var L = lasers.length - 1; L >= 0; L--) {
        lasers[L].y -= 620 * dt;
        if (lasers[L].y < -10) { lasers.splice(L, 1); continue; }
        for (var b = 0; b < bricks.length; b++) {
          var br = bricks[b];
          if (br.hp <= 0) continue;
          if (lasers[L] && lasers[L].x > br.x && lasers[L].x < br.x + br.w && lasers[L].y > br.y && lasers[L].y < br.y + br.h) {
            hitBrick(br); lasers.splice(L, 1); break;
          }
        }
      }
      for (var i = balls.length - 1; i >= 0; i--) {
        var ball = balls[i];
        if (ball.stuck) { ball.x = paddle.x; ball.y = paddle.y - 14; continue; }
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); SFX.tick(); }
        if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); SFX.tick(); }
        if (ball.y < ball.r + H * 0.08) { ball.y = ball.r + H * 0.08; ball.vy = Math.abs(ball.vy); SFX.tick(); }
        /* paddle */
        if (ball.vy > 0 && ball.y + ball.r > paddle.y && ball.y - ball.r < paddle.y + paddle.h &&
            ball.x > paddle.x - pw / 2 - ball.r && ball.x < paddle.x + pw / 2 + ball.r) {
          var rel = clamp((ball.x - paddle.x) / (pw / 2), -1, 1);
          var sp2 = Math.hypot(ball.vx, ball.vy);
          var ang = -Math.PI / 2 + rel * 1.05;
          ball.vx = Math.cos(ang) * sp2; ball.vy = Math.sin(ang) * sp2;
          ball.y = paddle.y - ball.r - 0.5;
          addCombo(); SFX.swap(); burst(ball.x, ball.y, 6, THEME.aqua, 120, 0.35);
        }
        /* bricks */
        for (var k = 0; k < bricks.length; k++) {
          var bk = bricks[k];
          if (bk.hp <= 0) continue;
          if (ball.x + ball.r > bk.x && ball.x - ball.r < bk.x + bk.w &&
              ball.y + ball.r > bk.y && ball.y - ball.r < bk.y + bk.h) {
            var ox = Math.min(ball.x + ball.r - bk.x, bk.x + bk.w - (ball.x - ball.r));
            var oy = Math.min(ball.y + ball.r - bk.y, bk.y + bk.h - (ball.y - ball.r));
            if (ox < oy) ball.vx = -ball.vx; else ball.vy = -ball.vy;
            hitBrick(bk);
            break;
          }
        }
        if (ball.y - ball.r > H) {
          balls.splice(i, 1);
          if (!balls.length) { resetCombo(); hurt(34); }
        }
      }
      /* drops */
      for (var d = drops.length - 1; d >= 0; d--) {
        var dr = drops[d];
        dr.y += 190 * dt; dr.t += dt;
        if (dr.y > H) { drops.splice(d, 1); continue; }
        if (dr.y + 12 > paddle.y && dr.y - 12 < paddle.y + paddle.h && Math.abs(dr.x - paddle.x) < pw / 2 + 12) {
          drops.splice(d, 1);
          applyDrop(dr.k);
        }
      }
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
      /* level cleared */
      var remaining = 0;
      for (var z = 0; z < bricks.length; z++) if (bricks[z].hp > 0) remaining++;
      if (remaining === 0) {
        addScore(120 + level * 30, W / 2, H * 0.4);
        bumpLevel(1);
        if (CFG.endless === false && level > CFG.levels) { setState("GAMEOVER"); return; }
        buildLevel();
      }
      paintHud();
      void launched;
    }
    function hitBrick(bk) {
      bk.hp--;
      SFX.coin();
      burst(bk.x + bk.w / 2, bk.y + bk.h / 2, 8, THEME.gold, 170, 0.45);
      if (bk.hp <= 0) {
        addScore(18 + bk.max * 8, bk.x + bk.w / 2, bk.y, "");
        shake = Math.max(shake, 0.16);
        if (CFG.powerups && R() < 0.16) {
          var k = pick(["wide", "multi", "laser", "slow", "shield", "coin"]);
          drops.push({ x: bk.x + bk.w / 2, y: bk.y, k: k, t: 0 });
        }
      } else addScore(6, bk.x + bk.w / 2, bk.y, "");
    }
    function applyDrop(k) {
      SFX.power(); flash = 0.35;
      if (k === "multi") {
        var src = balls[0] || { x: paddle.x, y: paddle.y - 20, vx: 200, vy: -300, r: 8 };
        for (var i = 0; i < 2; i++) {
          balls.push({ x: src.x, y: src.y, r: 8, stuck: false,
            vx: src.vx * Math.cos(0.5 * (i ? 1 : -1)) - src.vy * Math.sin(0.5 * (i ? 1 : -1)),
            vy: src.vx * Math.sin(0.5 * (i ? 1 : -1)) + src.vy * Math.cos(0.5 * (i ? 1 : -1)) });
        }
        floatText(paddle.x, paddle.y - 40, STR.powers.multi, THEME.aqua);
        return;
      }
      if (k === "coin") { coins += 3; addScore(40, paddle.x, paddle.y - 40, ""); paintHud(); return; }
      power = k; powerTimer = k === "wide" ? 12 : 9;
      if (k === "laser") laserT = 0;
      floatText(paddle.x, paddle.y - 40, STR.powers[k] || k, THEME.gold);
      paintHud();
    }
    function draw(t) {
      /* bricks */
      for (var i = 0; i < bricks.length; i++) {
        var b = bricks[i];
        if (b.hp <= 0) continue;
        var f = b.hp / Math.max(1, b.max);
        ctx.save();
        ctx.shadowColor = THEME.glow; ctx.shadowBlur = 10;
        var g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
        g.addColorStop(0, THEME.brick0); g.addColorStop(1, THEME.brick1);
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.45 + f * 0.55;
        roundRect(b.x, b.y, b.w, b.h, 4); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 1; ctx.stroke();
        if (b.hp > 1) {
          ctx.fillStyle = THEME.text; ctx.font = "800 10px " + FONT;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(String(b.hp), b.x + b.w / 2, b.y + b.h / 2 + 1);
        }
        ctx.restore();
      }
      /* drops */
      for (var d = 0; d < drops.length; d++) {
        var dr = drops[d];
        ctx.save();
        ctx.translate(dr.x, dr.y);
        ctx.rotate(Math.sin(dr.t * 3) * 0.2);
        ctx.fillStyle = dr.k === "multi" ? THEME.aqua : dr.k === "coin" ? THEME.gold : THEME.accent;
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14;
        roundRect(-13, -9, 26, 18, 6); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.font = "900 11px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(dr.k === "multi" ? "3" : dr.k === "wide" ? "W" : dr.k === "laser" ? "L" : dr.k === "coin" ? "$" : dr.k === "shield" ? "S" : "T", 0, 1);
        ctx.restore();
      }
      /* lasers */
      ctx.fillStyle = THEME.rose;
      for (var L = 0; L < lasers.length; L++) { ctx.fillRect(lasers[L].x - 2, lasers[L].y - 12, 4, 14); }
      /* paddle */
      var pw = paddle.w * (power === "wide" ? 1.6 : 1);
      ctx.save();
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 18;
      var pg = ctx.createLinearGradient(paddle.x - pw / 2, 0, paddle.x + pw / 2, 0);
      pg.addColorStop(0, THEME.hero0); pg.addColorStop(1, THEME.hero1);
      ctx.fillStyle = pg;
      roundRect(paddle.x - pw / 2, paddle.y, pw, paddle.h, paddle.h / 2); ctx.fill();
      ctx.restore();
      if (power === "laser") {
        ctx.fillStyle = THEME.rose;
        ctx.fillRect(paddle.x - pw / 2 + 2, paddle.y - 6, 5, 6);
        ctx.fillRect(paddle.x + pw / 2 - 7, paddle.y - 6, 5, 6);
      }
      /* balls */
      for (var bi = 0; bi < balls.length; bi++) {
        var ball = balls[bi];
        ctx.save();
        ctx.shadowColor = THEME.gold; ctx.shadowBlur = 20;
        var bgd = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, ball.r + 2);
        bgd.addColorStop(0, "#ffffff"); bgd.addColorStop(1, THEME.gold);
        ctx.fillStyle = bgd;
        ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, TAU); ctx.fill();
        ctx.restore();
      }
      if (!launched || (balls.length && balls[0].stuck))
        centerText(STR.tapLaunch, H * 0.6, clamp(W * 0.036, 13, 19), THEME.dim, 600, 0.85);
      void t;
    }
    function drawIdle(t) {
      var y = H * 0.36;
      for (var r = 0; r < 3; r++) {
        for (var c = 0; c < 5; c++) {
          ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 2 + r + c);
          ctx.fillStyle = r === 0 ? THEME.brick0 : r === 1 ? THEME.accent : THEME.brick1;
          roundRect(W * 0.16 + c * (W * 0.14), y + r * 22, W * 0.12, 16, 4); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    function help() { return STR.help.breaker; }
    function starScore() { return 1200; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore, revive: revive };
  }


  /* ══ BLUEPRINT 3 — SNAKE: grid classic / walls / portals ═════════════ */
  function bpSnake() {
    var cell, cols, rows, snake, dir, nextDir, food, portals, walls, grow, stepT, stepEvery, eaten;
    function build() {
      cols = CFG.size || 18; rows = Math.round(cols * (H / W));
      rows = clamp(rows, 12, 30);
      cell = Math.min(W / cols, (H * 0.78) / rows);
      walls = [];
      portals = [];
      if (CFG.walls && level >= 2) {
        var n = clamp(4 + level * 2, 4, 26);
        for (var i = 0; i < n; i++) {
          var wx = rint(2, cols - 3), wy = rint(2, rows - 3);
          walls.push({ x: wx, y: wy });
          if (R() < 0.5) walls.push({ x: wx + 1, y: wy });
        }
      }
      if (CFG.portals && level >= 3) {
        portals.push({ x: rint(1, cols - 2), y: rint(1, rows - 2) });
        portals.push({ x: rint(1, cols - 2), y: rint(1, rows - 2) });
      }
    }
    function reset() {
      maxHealth = 100; health = 100; lives = 1;
      build();
      snake = [{ x: Math.floor(cols / 2), y: Math.floor(rows / 2) }];
      for (var i = 1; i < 4; i++) snake.push({ x: snake[0].x - i, y: snake[0].y });
      dir = { x: 1, y: 0 }; nextDir = { x: 1, y: 0 };
      grow = 3; eaten = 0; stepEvery = clamp(0.16 / CFG.speedMul, 0.06, 0.3); stepT = stepEvery;
      placeFood();
    }
    function placeFood() {
      var tries = 0;
      while (tries++ < 400) {
        var x = rint(0, cols - 1), y = rint(0, rows - 1);
        var bad = false;
        for (var i = 0; i < snake.length; i++) if (snake[i].x === x && snake[i].y === y) bad = true;
        for (var w = 0; w < walls.length; w++) if (walls[w].x === x && walls[w].y === y) bad = true;
        if (!bad) { food = { x: x, y: y, k: R() < 0.18 ? "gold" : "normal", t: 0 }; return; }
      }
      food = { x: 0, y: 0, k: "normal", t: 0 };
    }
    function blocked(x, y) {
      for (var i = 0; i < walls.length; i++) if (walls[i].x === x && walls[i].y === y) return true;
      return false;
    }
    function update(dt) {
      runTime += dt;
      food.t += dt;
      if (left() && dir.x !== 1) nextDir = { x: -1, y: 0 };
      else if (right() && dir.x !== -1) nextDir = { x: 1, y: 0 };
      else if (upHeld() && dir.y !== 1) nextDir = { x: 0, y: -1 };
      else if (downHeld() && dir.y !== -1) nextDir = { x: 0, y: 1 };
      if (touch.active && (Math.abs(touch.dx) > 24 || Math.abs(touch.dy) > 24)) {
        if (Math.abs(touch.dx) > Math.abs(touch.dy)) { if (!(touch.dx > 0 && dir.x === -1) && !(touch.dx < 0 && dir.x === 1)) nextDir = { x: touch.dx > 0 ? 1 : -1, y: 0 }; }
        else { if (!(touch.dy > 0 && dir.y === -1) && !(touch.dy < 0 && dir.y === 1)) nextDir = { x: 0, y: touch.dy > 0 ? 1 : -1 }; }
      }
      stepT -= dt;
      if (stepT > 0) return;
      stepT = stepEvery;
      dir = nextDir;
      var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      /* portals */
      for (var p = 0; p < portals.length; p++) {
        if (portals[p].x === head.x && portals[p].y === head.y) {
          var other = portals[(p + 1) % portals.length];
          head = { x: other.x, y: other.y };
          SFX.power(); burst(cx(other.x), cy(other.y), 14, THEME.aqua, 160, 0.5);
        }
      }
      if (CFG.wrap) {
        head.x = (head.x + cols) % cols;
        head.y = (head.y + rows) % rows;
      } else if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows) { die(); return; }
      if (blocked(head.x, head.y)) { die(); return; }
      for (var i = 0; i < snake.length - 1; i++) if (snake[i].x === head.x && snake[i].y === head.y) { die(); return; }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        eaten++;
        addCombo();
        var pts = food.k === "gold" ? 60 : 20;
        addScore(pts, cx(head.x), cy(head.y), "");
        coins += food.k === "gold" ? 3 : 1;
        SFX.coin(); burst(cx(head.x), cy(head.y), 16, food.k === "gold" ? THEME.gold : THEME.accent, 190, 0.55);
        grow += food.k === "gold" ? 3 : 1;
        stepEvery = clamp(stepEvery * 0.985, 0.055, 0.3);
        if (eaten % 6 === 0) { bumpLevel(1); build(); }
        placeFood();
        paintHud();
      } else if (grow > 0) grow--;
      else snake.pop();
    }
    function die() {
      shake = 1; flash = 0.8; SFX.boom();
      burst(cx(snake[0].x), cy(snake[0].y), 40, THEME.rose, 260, 0.9);
      health = 0; lives = 0; paintHud();
      setState("GAMEOVER");
    }
    function cx(gx) { return (W - cols * cell) / 2 + gx * cell + cell / 2; }
    function cy(gy) { return H * 0.12 + gy * cell + cell / 2; }
    function draw(t) {
      var ox = (W - cols * cell) / 2, oy = H * 0.12;
      ctx.save();
      roundRect(ox - 4, oy - 4, cols * cell + 8, rows * cell + 8, 10);
      ctx.fillStyle = "rgba(8,10,18,0.45)"; ctx.fill();
      ctx.strokeStyle = THEME.edge; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 0.14; ctx.strokeStyle = THEME.text; ctx.lineWidth = 1;
      for (var i = 1; i < cols; i++) { ctx.beginPath(); ctx.moveTo(ox + i * cell, oy); ctx.lineTo(ox + i * cell, oy + rows * cell); ctx.stroke(); }
      for (var j = 1; j < rows; j++) { ctx.beginPath(); ctx.moveTo(ox, oy + j * cell); ctx.lineTo(ox + cols * cell, oy + j * cell); ctx.stroke(); }
      ctx.globalAlpha = 1;
      /* walls */
      ctx.fillStyle = THEME.brick1;
      for (var w = 0; w < walls.length; w++) {
        roundRect(ox + walls[w].x * cell + 1, oy + walls[w].y * cell + 1, cell - 2, cell - 2, 3);
        ctx.fill();
      }
      /* portals */
      for (var p = 0; p < portals.length; p++) {
        ctx.save();
        ctx.translate(cx(portals[p].x), cy(portals[p].y));
        ctx.rotate(t * 2);
        ctx.strokeStyle = THEME.aqua; ctx.lineWidth = 3; ctx.shadowColor = THEME.aqua; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(0, 0, cell * 0.34, 0.4, 4.2); ctx.stroke();
        ctx.restore();
      }
      /* food */
      ctx.save();
      ctx.translate(cx(food.x), cy(food.y));
      var pulse = 1 + Math.sin(t * 6) * 0.12;
      ctx.fillStyle = food.k === "gold" ? THEME.gold : THEME.rose;
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(0, 0, cell * 0.36 * pulse, 0, TAU); ctx.fill();
      ctx.restore();
      /* snake */
      for (var s = snake.length - 1; s >= 0; s--) {
        var seg = snake[s], f = 1 - s / (snake.length + 6);
        ctx.save();
        var g = ctx.createLinearGradient(cx(seg.x) - cell / 2, cy(seg.y) - cell / 2, cx(seg.x) + cell / 2, cy(seg.y) + cell / 2);
        g.addColorStop(0, THEME.hero0); g.addColorStop(1, THEME.hero1);
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.45 + f * 0.55;
        if (s === 0) { ctx.shadowColor = THEME.glow; ctx.shadowBlur = 18; }
        roundRect(cx(seg.x) - cell * 0.44, cy(seg.y) - cell * 0.44, cell * 0.88, cell * 0.88, cell * 0.3);
        ctx.fill();
        if (s === 0) {
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          ctx.fillStyle = THEME.text;
          var ex = dir.x * cell * 0.14, ey = dir.y * cell * 0.14;
          ctx.beginPath(); ctx.arc(cx(seg.x) - cell * 0.15 + ex, cy(seg.y) - cell * 0.06 + ey, cell * 0.08, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(cx(seg.x) + cell * 0.15 + ex, cy(seg.y) - cell * 0.06 + ey, cell * 0.08, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    function drawIdle(t) {
      for (var i = 0; i < 7; i++) {
        var x = W * 0.24 + i * W * 0.085, y = H * 0.38 + Math.sin(t * 3 - i * 0.6) * 12;
        ctx.globalAlpha = 1 - i * 0.1;
        ctx.fillStyle = i === 0 ? THEME.hero0 : THEME.hero1;
        roundRect(x, y, W * 0.07, W * 0.07, 6); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    function help() { return STR.help.snake; }
    function starScore() { return 400; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore };
  }


  /* ══ BLUEPRINT 4 — SHOOTER: waves, 4 enemy behaviours, boss every 5 ═══ */
  function bpShooter() {
    var ship, shots, foes, foeShots, stars, wave, waveT, spawnLeft, boss, weapon, weaponT, iFrames;
    function reset() {
      maxHealth = 100; health = 100; lives = 3;
      ship = { x: W / 2, y: H * 0.84, r: 16, cool: 0 };
      shots = []; foes = []; foeShots = []; boss = null;
      weapon = 1; weaponT = 0; iFrames = 1.2;
      wave = 0; waveT = 0.8; spawnLeft = 0;
      stars = [];
      for (var i = 0; i < 70; i++) stars.push({ x: rnd(0, W), y: rnd(0, H), s: rnd(40, 220), r: rnd(0.6, 2) });
      nextWave();
    }
    function nextWave() {
      wave++;
      level = wave;
      var hl = document.getElementById("nx-level"); if (hl) hl.textContent = String(level);
      if (CFG.boss !== false && wave % 5 === 0) { spawnBoss(); return; }
      spawnLeft = 5 + wave * 2;
      waveT = 0.5;
      SFX.level();
      floatText(W / 2, H * 0.3, STR.wave + " " + wave, THEME.gold);
    }
    function spawnBoss() {
      SFX.level(); flash = 0.8; shake = 0.8;
      boss = { x: W / 2, y: -90, ty: H * 0.2, hp: 120 + wave * 40, max: 120 + wave * 40, r: 54, t: 0, phase: 1, cool: 1.4 };
      floatText(W / 2, H * 0.34, STR.boss, THEME.rose);
      spawnLeft = 0;
    }
    function spawnFoe() {
      var kinds = ["drone", "zig", "shooter"];
      if (wave >= 3) kinds.push("tank");
      if (wave >= 6) kinds.push("kamikaze");
      var k = pick(kinds);
      var f = { k: k, x: rnd(30, W - 30), y: -30, r: k === "tank" ? 22 : 15, t: rnd(0, TAU), hp: k === "tank" ? 5 : k === "shooter" ? 2 : 1, cool: rnd(1, 2.4) };
      f.vy = (k === "tank" ? 46 : k === "kamikaze" ? 150 : 74) * CFG.speedMul * (1 + wave * 0.05);
      foes.push(f);
    }
    function update(dt) {
      runTime += dt;
      if (iFrames > 0) iFrames -= dt;
      if (weaponT > 0) { weaponT -= dt; if (weaponT <= 0) weapon = 1; }
      /* ship */
      var sp = 340 * CFG.speedMul;
      if (left()) ship.x -= sp * dt;
      if (right()) ship.x += sp * dt;
      if (keys.arrowup || keys.w || pad("up")) ship.y -= sp * dt;
      if (downHeld()) ship.y += sp * dt;
      if (touch.active && touch.hold) {
        ship.x = lerp(ship.x, touch.x, 0.3);
        ship.y = lerp(ship.y, Math.min(touch.y + 40, H * 0.92), 0.22);
      }
      ship.x = clamp(ship.x, 20, W - 20);
      ship.y = clamp(ship.y, H * 0.35, H - 26);
      ship.cool -= dt;
      if ((keys[" "] || pad("act") || touch.hold || CFG.autofire) && ship.cool <= 0) {
        ship.cool = weapon >= 3 ? 0.11 : weapon === 2 ? 0.15 : 0.19;
        SFX.shoot();
        shots.push({ x: ship.x, y: ship.y - 18, vx: 0, vy: -640, r: 4 });
        if (weapon >= 2) { shots.push({ x: ship.x - 12, y: ship.y - 10, vx: -70, vy: -600, r: 3.5 }); shots.push({ x: ship.x + 12, y: ship.y - 10, vx: 70, vy: -600, r: 3.5 }); }
        if (weapon >= 3) { shots.push({ x: ship.x - 20, y: ship.y - 4, vx: -160, vy: -540, r: 3 }); shots.push({ x: ship.x + 20, y: ship.y - 4, vx: 160, vy: -540, r: 3 }); }
      }
      /* waves */
      if (!boss && spawnLeft > 0) {
        waveT -= dt;
        if (waveT <= 0) { spawnFoe(); spawnLeft--; waveT = clamp(0.9 - wave * 0.045, 0.22, 0.9); }
      }
      if (!boss && spawnLeft <= 0 && foes.length === 0) nextWave();
      /* shots */
      for (var i = shots.length - 1; i >= 0; i--) {
        var s = shots[i];
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.y < -20 || s.x < -20 || s.x > W + 20) { shots.splice(i, 1); continue; }
        var hitSomething = false;
        for (var f = foes.length - 1; f >= 0; f--) {
          var fo = foes[f];
          if (Math.hypot(s.x - fo.x, s.y - fo.y) < fo.r + s.r) {
            fo.hp--; shots.splice(i, 1); hitSomething = true;
            burst(s.x, s.y, 6, THEME.gold, 150, 0.35);
            if (fo.hp <= 0) {
              killFoe(fo, f);
            } else SFX.tick();
            break;
          }
        }
        if (hitSomething) continue;
        if (boss && Math.hypot(s.x - boss.x, s.y - boss.y) < boss.r + s.r) {
          boss.hp--; shots.splice(i, 1);
          burst(s.x, s.y, 7, THEME.rose, 170, 0.4); SFX.tick();
          if (boss.hp <= boss.max * 0.5 && boss.phase === 1) { boss.phase = 2; SFX.boom(); shake = 0.9; floatText(boss.x, boss.y, STR.phase2, THEME.rose); }
          if (boss.hp <= 0) {
            addScore(600 + wave * 60, boss.x, boss.y, "");
            burst(boss.x, boss.y, 90, THEME.gold, 420, 1.4);
            SFX.boom(); shake = 1.4; flash = 1;
            boss = null;
            weapon = 3; weaponT = 14;
            nextWave();
          }
        }
      }
      /* foes */
      for (var g = foes.length - 1; g >= 0; g--) {
        var e = foes[g];
        e.t += dt;
        if (e.k === "zig") e.x += Math.sin(e.t * 3.2) * 120 * dt;
        if (e.k === "kamikaze") {
          e.x = lerp(e.x, ship.x, 0.9 * dt);
          e.vy = Math.min(e.vy + 120 * dt, 420 * CFG.speedMul);
        }
        e.y += e.vy * dt;
        if (e.k === "shooter") {
          e.cool -= dt;
          if (e.cool <= 0 && e.y > 0 && e.y < H * 0.7) {
            e.cool = clamp(2.2 - wave * 0.08, 0.9, 2.2);
            var a = Math.atan2(ship.y - e.y, ship.x - e.x);
            foeShots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, r: 5 });
          }
        }
        if (e.y > H + 40) { foes.splice(g, 1); resetCombo(); continue; }
        if (iFrames <= 0 && Math.hypot(e.x - ship.x, e.y - ship.y) < e.r + ship.r - 4) {
          foes.splice(g, 1);
          burst(ship.x, ship.y, 30, THEME.rose, 260, 0.8);
          resetCombo(); iFrames = 1.2; hurt(34);
        }
      }
      /* boss */
      if (boss) {
        boss.t += dt;
        boss.y = lerp(boss.y, boss.ty, 0.04);
        boss.x = W / 2 + Math.sin(boss.t * (boss.phase === 2 ? 1.5 : 0.8)) * (W * 0.28);
        boss.cool -= dt;
        if (boss.cool <= 0) {
          boss.cool = boss.phase === 2 ? 0.55 : 0.95;
          var n = boss.phase === 2 ? 7 : 5;
          for (var q = 0; q < n; q++) {
            var ang = Math.PI * 0.25 + (Math.PI * 0.5) * (q / (n - 1));
            foeShots.push({ x: boss.x, y: boss.y + boss.r * 0.6, vx: Math.cos(ang) * 210, vy: Math.sin(ang) * 210, r: 6 });
          }
          SFX.shoot();
        }
        if (iFrames <= 0 && Math.hypot(boss.x - ship.x, boss.y - ship.y) < boss.r + ship.r) {
          iFrames = 1.2; hurt(45); burst(ship.x, ship.y, 26, THEME.rose, 240, 0.8);
        }
      }
      /* enemy shots */
      for (var h = foeShots.length - 1; h >= 0; h--) {
        var es = foeShots[h];
        es.x += es.vx * dt; es.y += es.vy * dt;
        if (es.y > H + 20 || es.y < -20 || es.x < -20 || es.x > W + 20) { foeShots.splice(h, 1); continue; }
        if (iFrames <= 0 && Math.hypot(es.x - ship.x, es.y - ship.y) < es.r + ship.r - 5) {
          foeShots.splice(h, 1); iFrames = 1.2; resetCombo(); hurt(22);
          burst(ship.x, ship.y, 18, THEME.rose, 200, 0.6);
        }
      }
      /* stars */
      for (var z = 0; z < stars.length; z++) {
        stars[z].y += stars[z].s * dt;
        if (stars[z].y > H) { stars[z].y = -4; stars[z].x = rnd(0, W); }
      }
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
      addScore(dt * 6);
      paintHud();
    }
    function killFoe(fo, idx) {
      foes.splice(idx, 1);
      addCombo();
      addScore(fo.k === "tank" ? 90 : fo.k === "shooter" ? 60 : 40, fo.x, fo.y, "");
      burst(fo.x, fo.y, 22, THEME.accent, 240, 0.7);
      SFX.boom(); shake = Math.max(shake, 0.25);
      if (CFG.powerups && R() < 0.14) {
        var k = pick(["weapon", "heal", "shield", "coin"]);
        foes.push({ k: "drop", drop: k, x: fo.x, y: fo.y, r: 13, t: 0, hp: 1, vy: 90 });
      }
    }
    function draw(t) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      for (var i = 0; i < stars.length; i++) {
        ctx.globalAlpha = clamp(stars[i].s / 240, 0.2, 0.9);
        ctx.fillRect(stars[i].x, stars[i].y, stars[i].r, stars[i].r * 2.4);
      }
      ctx.globalAlpha = 1;
      /* shots */
      for (var s = 0; s < shots.length; s++) {
        var sh = shots[s];
        ctx.save();
        ctx.shadowColor = THEME.gold; ctx.shadowBlur = 14;
        ctx.fillStyle = THEME.gold;
        roundRect(sh.x - sh.r / 2, sh.y - sh.r * 2.4, sh.r, sh.r * 4.4, sh.r / 2); ctx.fill();
        ctx.restore();
      }
      for (var fs = 0; fs < foeShots.length; fs++) {
        var es = foeShots[fs];
        ctx.save();
        ctx.shadowColor = THEME.rose; ctx.shadowBlur = 16;
        ctx.fillStyle = THEME.rose;
        ctx.beginPath(); ctx.arc(es.x, es.y, es.r, 0, TAU); ctx.fill();
        ctx.restore();
      }
      /* foes */
      for (var f = 0; f < foes.length; f++) {
        var e = foes[f];
        ctx.save();
        ctx.translate(e.x, e.y);
        if (e.k === "drop") {
          ctx.rotate(t * 3);
          ctx.fillStyle = e.drop === "heal" ? THEME.aqua : e.drop === "weapon" ? THEME.gold : THEME.accent;
          ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18;
          roundRect(-e.r, -e.r, e.r * 2, e.r * 2, 6); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.font = "900 13px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(e.drop === "heal" ? "+" : e.drop === "weapon" ? "W" : e.drop === "shield" ? "S" : "$", 0, 1);
          ctx.restore();
          /* collect */
          if (Math.hypot(e.x - ship.x, e.y - ship.y) < e.r + ship.r + 6) {
            foes.splice(f, 1); f--;
            SFX.power(); flash = 0.3;
            if (e.drop === "heal") { health = clamp(health + 30, 0, maxHealth); floatText(ship.x, ship.y - 40, STR.powers.heal, THEME.aqua); }
            else if (e.drop === "weapon") { weapon = Math.min(3, weapon + 1); weaponT = 16; floatText(ship.x, ship.y - 40, STR.powers.weapon + " " + weapon, THEME.gold); }
            else if (e.drop === "shield") { power = "shield"; powerTimer = 10; floatText(ship.x, ship.y - 40, STR.powers.shield, THEME.aqua); }
            else { coins += 3; addScore(50, ship.x, ship.y - 40, ""); }
            paintHud();
          }
          continue;
        }
        var col = e.k === "tank" ? THEME.brick1 : e.k === "shooter" ? THEME.accent : e.k === "kamikaze" ? THEME.rose : THEME.hero1;
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 16;
        ctx.beginPath();
        if (e.k === "tank") { ctx.moveTo(-e.r, -e.r * 0.5); ctx.lineTo(e.r, -e.r * 0.5); ctx.lineTo(e.r * 0.6, e.r); ctx.lineTo(-e.r * 0.6, e.r); }
        else if (e.k === "zig") { ctx.moveTo(0, e.r); ctx.lineTo(e.r, -e.r * 0.7); ctx.lineTo(0, -e.r * 0.2); ctx.lineTo(-e.r, -e.r * 0.7); }
        else { ctx.moveTo(0, e.r); ctx.lineTo(e.r * 0.9, -e.r * 0.8); ctx.lineTo(-e.r * 0.9, -e.r * 0.8); }
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath(); ctx.arc(0, -e.r * 0.15, e.r * 0.2, 0, TAU); ctx.fill();
        ctx.restore();
      }
      /* boss */
      if (boss) {
        ctx.save();
        ctx.translate(boss.x, boss.y);
        var bg = ctx.createRadialGradient(0, 0, 6, 0, 0, boss.r * 1.3);
        bg.addColorStop(0, THEME.rose); bg.addColorStop(1, THEME.brick1);
        ctx.fillStyle = bg; ctx.shadowColor = THEME.rose; ctx.shadowBlur = 34;
        ctx.beginPath();
        for (var p = 0; p < 8; p++) {
          var a = (p / 8) * TAU + t * 0.6;
          var rr = boss.r * (p % 2 === 0 ? 1 : 0.72);
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath(); ctx.arc(0, 0, boss.r * 0.34, 0, TAU); ctx.fill();
        ctx.fillStyle = THEME.gold;
        ctx.beginPath(); ctx.arc(0, 0, boss.r * 0.18 * (1 + Math.sin(t * 6) * 0.12), 0, TAU); ctx.fill();
        ctx.restore();
        /* boss bar */
        var bw = W * 0.7, bx = (W - bw) / 2, by = H * 0.06;
        roundRect(bx, by, bw, 9, 5); ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fill();
        roundRect(bx, by, bw * clamp(boss.hp / boss.max, 0, 1), 9, 5); ctx.fillStyle = THEME.rose; ctx.fill();
        ctx.fillStyle = THEME.dim; ctx.font = "700 11px " + FONT; ctx.textAlign = "center";
        ctx.fillText(STR.boss, W / 2, by - 8);
      }
      /* ship */
      ctx.save();
      ctx.translate(ship.x, ship.y);
      if (iFrames > 0) ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(t * 22));
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 22;
      var sg = ctx.createLinearGradient(0, -20, 0, 18);
      sg.addColorStop(0, THEME.hero0); sg.addColorStop(1, THEME.hero1);
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(14, 12); ctx.lineTo(0, 5); ctx.lineTo(-14, 12); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      /* engine flame */
      ctx.fillStyle = THEME.gold;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 30);
      ctx.beginPath(); ctx.moveTo(-5, 12); ctx.lineTo(0, 22 + Math.sin(t * 26) * 5); ctx.lineTo(5, 12); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      if (power === "shield") {
        ctx.strokeStyle = THEME.aqua; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 7);
        ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    function drawIdle(t) {
      ctx.save();
      ctx.translate(W / 2, H * 0.4 + Math.sin(t * 1.8) * 8);
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 26;
      var sg = ctx.createLinearGradient(0, -34, 0, 30);
      sg.addColorStop(0, THEME.hero0); sg.addColorStop(1, THEME.hero1);
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(24, 20); ctx.lineTo(0, 9); ctx.lineTo(-24, 20); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    function help() { return STR.help.shooter; }
    function starScore() { return 1500; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore };
  }


  /* ══ BLUEPRINT 5 — CLIMBER: vertical jump, springs, moving platforms ══ */
  function bpClimber() {
    var px, py, vx, vy, plats, height, bestHeight, camY, springs, monsters, jetpack;
    function reset() {
      maxHealth = 100; health = 100; lives = 1;
      px = W / 2; py = H * 0.7; vx = 0; vy = 0; camY = 0;
      height = 0; bestHeight = 0; springs = 0; monsters = 0; jetpack = 0;
      plats = [];
      for (var i = 0; i < 26; i++) {
        plats.push(makePlat(H * 0.78 - i * (H * 0.085), i));
      }
      plats.push({ x: W / 2, y: H * 0.86, w: W * 0.6, k: "static", ph: 0, used: true });
    }
    function makePlat(y, idx) {
      var r = R();
      var k = "static";
      if (idx > 3) {
        if (r < 0.16) k = "moving";
        else if (r < 0.26) k = "break";
        else if (r < 0.34) k = "spring";
        else if (r < 0.4 && level >= 3) k = "monster";
        else if (r < 0.44 && CFG.powerups) k = "jet";
      }
      return { x: rnd(W * 0.12, W * 0.88), y: y, w: rnd(W * 0.14, W * 0.24), k: k, ph: rnd(0, TAU), used: false, dead: 0 };
    }
    function update(dt) {
      runTime += dt;
      var sp = 300 * CFG.speedMul;
      if (left()) vx = lerp(vx, -sp, 0.25);
      else if (right()) vx = lerp(vx, sp, 0.25);
      else vx = lerp(vx, 0, 0.12);
      if (touch.active && touch.hold) {
        var d = touch.x - px;
        vx = clamp(d * 6, -sp, sp);
      }
      px += vx * dt;
      if (px < 10) { px = 10; vx = Math.abs(vx) * 0.4; }
      if (px > W - 10) { px = W - 10; vx = -Math.abs(vx) * 0.4; }
      var grav = jetpack > 0 ? 420 : 1500;
      vy += grav * dt;
      if (jetpack > 0) { vy = Math.min(vy, -260); jetpack -= dt; burst(px, py + 14, 2, THEME.gold, 90, 0.4); }
      py += vy * dt;
      /* platform collisions (only when falling) */
      if (vy > 0) {
        for (var i = 0; i < plats.length; i++) {
          var p = plats[i];
          if (p.dead > 0) continue;
          if (px > p.x - p.w / 2 - 12 && px < p.x + p.w / 2 + 12 && py > p.y - 12 && py < p.y + 16) {
            py = p.y - 8;
            if (p.k === "spring") { vy = -1180 * CFG.speedMul; SFX.jump(); springs++; addScore(30, px, py - 30, ""); burst(px, py, 14, THEME.aqua, 200, 0.5); }
            else if (p.k === "jet") { jetpack = 2.4; vy = -520; SFX.power(); floatText(px, py - 30, STR.powers.jet, THEME.gold); p.dead = 1; }
            else if (p.k === "monster") { vy = -720 * CFG.speedMul; monsters++; hurt(12); p.dead = 1; burst(px, py, 18, THEME.rose, 200, 0.6); }
            else { vy = -700 * CFG.speedMul; SFX.jump(); if (p.k === "break") { p.dead = 1; burst(p.x, p.y, 12, THEME.brick1, 160, 0.5); } }
            p.used = true;
            if (p.k === "moving") p.ph += 0;
          }
        }
      }
      /* moving platforms */
      for (var m = 0; m < plats.length; m++) {
        var q = plats[m];
        if (q.k === "moving") q.x += Math.sin(now() * 0.0012 + q.ph) * 70 * dt;
        if (q.dead > 0) q.dead += dt;
      }
      /* camera & height */
      if (py < H * 0.42) {
        var delta = H * 0.42 - py;
        py += delta; camY += delta;
        height += delta;
        addScore(delta * 0.35);
        for (var s = 0; s < plats.length; s++) plats[s].y += delta;
      }
      bestHeight = Math.max(bestHeight, height);
      /* recycle platforms above */
      for (var r = plats.length - 1; r >= 0; r--) {
        if (plats[r].y > H + 40) {
          plats.splice(r, 1);
          plats.unshift(makePlat(-rnd(20, 90), level + plats.length));
        }
      }
      if (height > level * 1400) bumpLevel(1);
      if (py > H + 60) { health = 0; lives = 0; paintHud(); setState("GAMEOVER"); }
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
      paintHud();
    }
    function draw(t) {
      for (var i = 0; i < plats.length; i++) {
        var p = plats[i];
        if (p.dead > 0 && p.k !== "monster") continue;
        ctx.save();
        var col = p.k === "spring" ? THEME.aqua : p.k === "break" ? THEME.brick1 : p.k === "monster" ? THEME.rose : p.k === "jet" ? THEME.gold : THEME.hero1;
        ctx.fillStyle = col;
        ctx.shadowColor = col; ctx.shadowBlur = p.k === "static" ? 6 : 16;
        roundRect(p.x - p.w / 2, p.y, p.w, 11, 6); ctx.fill();
        ctx.shadowBlur = 0;
        if (p.k === "spring") {
          ctx.strokeStyle = THEME.text; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y - 3, 6, Math.PI, TAU); ctx.stroke();
        }
        if (p.k === "monster") {
          ctx.fillStyle = THEME.text;
          ctx.beginPath(); ctx.arc(p.x - 8, p.y - 6, 3, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(p.x + 8, p.y - 6, 3, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      /* hero */
      ctx.save();
      ctx.translate(px, py - 16);
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 20;
      var g = ctx.createLinearGradient(0, -18, 0, 18);
      g.addColorStop(0, THEME.hero0); g.addColorStop(1, THEME.hero1);
      ctx.fillStyle = g;
      roundRect(-13, -18, 26, 34, 9); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = THEME.text;
      ctx.fillRect(-8, -11, 5, 5); ctx.fillRect(3, -11, 5, 5);
      if (jetpack > 0) {
        ctx.fillStyle = THEME.gold; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(-8, 16); ctx.lineTo(0, 34 + Math.sin(t * 30) * 6); ctx.lineTo(8, 16); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      /* height meter */
      ctx.save();
      ctx.textAlign = "right"; ctx.textBaseline = "top";
      ctx.fillStyle = THEME.dim; ctx.font = "700 12px " + FONT;
      ctx.fillText(STR.height + ": " + Math.round(bestHeight / 10) + " m", W - 14, H * 0.13);
      ctx.restore();
    }
    function drawIdle(t) {
      for (var i = 0; i < 4; i++) {
        var y = H * 0.62 - i * H * 0.07 + Math.sin(t * 2 + i) * 6;
        ctx.fillStyle = i % 2 ? THEME.hero1 : THEME.aqua;
        roundRect(W * 0.3 + i * W * 0.11, y, W * 0.16, 10, 5); ctx.fill();
      }
      ctx.save();
      ctx.translate(W * 0.5, H * 0.42 + Math.sin(t * 2.6) * 16);
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 24;
      var g = ctx.createLinearGradient(0, -20, 0, 20);
      g.addColorStop(0, THEME.hero0); g.addColorStop(1, THEME.hero1);
      ctx.fillStyle = g; roundRect(-14, -20, 28, 38, 10); ctx.fill();
      ctx.restore();
    }
    function help() { return STR.help.climber; }
    function starScore() { return 800; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore };
  }


  /* ══ BLUEPRINT 6 — MAZE: generated maze, fog of war, keys and a door ══ */
  function bpMaze() {
    var cols, rows, grid, cell, px, py, keys0, door, torch, steps, exitFound;
    function generate() {
      cols = clamp(9 + level * 2, 9, 21) | 1;
      rows = clamp(9 + level * 2, 9, 21) | 1;
      grid = [];
      for (var y = 0; y < rows; y++) {
        var row = [];
        for (var x = 0; x < cols; x++) row.push({ w: true, v: false });
        grid.push(row);
      }
      /* recursive backtracker on odd cells */
      var stack = [{ x: 1, y: 1 }];
      grid[1][1].w = false; grid[1][1].v = true;
      while (stack.length) {
        var cur = stack[stack.length - 1];
        var opts = [];
        var dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
        for (var i = 0; i < dirs.length; i++) {
          var nx = cur.x + dirs[i][0], ny = cur.y + dirs[i][1];
          if (nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1 && !grid[ny][nx].v) opts.push({ x: nx, y: ny, mx: cur.x + dirs[i][0] / 2, my: cur.y + dirs[i][1] / 2 });
        }
        if (!opts.length) { stack.pop(); continue; }
        var nxt = opts[Math.floor(R() * opts.length)];
        grid[nxt.my][nxt.mx].w = false; grid[nxt.my][nxt.mx].v = true;
        grid[nxt.y][nxt.x].w = false; grid[nxt.y][nxt.x].v = true;
        stack.push({ x: nxt.x, y: nxt.y });
      }
      /* sprinkle extra openings so it is solvable and less linear */
      var extra = Math.floor(cols * rows * 0.05);
      for (var e = 0; e < extra; e++) {
        var ex = rint(1, cols - 2), ey = rint(1, rows - 2);
        grid[ey][ex].w = false;
      }
      cell = Math.min((W * 0.92) / cols, (H * 0.66) / rows);
      px = 1; py = 1; steps = 0; exitFound = false;
      door = { x: cols - 2, y: rows - 2 };
      grid[door.y][door.x].w = false;
      keys0 = [];
      var need = clamp(1 + Math.floor(level / 2), 1, 4);
      var guard = 0;
      while (keys0.length < need && guard++ < 600) {
        var kx = rint(1, cols - 2), ky = rint(1, rows - 2);
        if (grid[ky][kx].w) continue;
        if (kx === 1 && ky === 1) continue;
        if (kx === door.x && ky === door.y) continue;
        keys0.push({ x: kx, y: ky, got: false });
      }
      torch = clamp(2.6 + (CFG.difficulty === "easy" ? 1.6 : CFG.difficulty === "hard" ? -0.7 : 0), 1.5, 5);
    }
    function reset() {
      maxHealth = 100; health = 100; lives = 1;
      generate();
    }
    var moveT = 0;
    function tryMove(dx, dy) {
      var nx = px + dx, ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return;
      if (grid[ny][nx].w) { SFX.tick(); shake = Math.max(shake, 0.1); return; }
      px = nx; py = ny; steps++;
      addScore(1);
      for (var i = 0; i < keys0.length; i++) {
        if (!keys0[i].got && keys0[i].x === px && keys0[i].y === py) {
          keys0[i].got = true; SFX.power(); addScore(60, ox() + px * cell + cell / 2, oy() + py * cell, "");
          floatText(ox() + px * cell + cell / 2, oy() + py * cell - 10, STR.key, THEME.gold);
          flash = 0.3;
        }
      }
      if (px === door.x && py === door.y) {
        var got = 0;
        for (var k = 0; k < keys0.length; k++) if (keys0[k].got) got++;
        if (got >= keys0.length) {
          addScore(200 + level * 60, ox() + px * cell, oy() + py * cell, "");
          bumpLevel(1);
          if (CFG.endless === false && level > CFG.levels) { setState("GAMEOVER"); return; }
          generate();
        } else {
          SFX.tick();
          floatText(ox() + px * cell + cell / 2, oy() + py * cell - 10, STR.needKeys + " " + (keys0.length - got), THEME.rose);
        }
      }
    }
    function ox() { return (W - cols * cell) / 2; }
    function oy() { return H * 0.17; }
    function update(dt) {
      runTime += dt;
      moveT -= dt;
      if (moveT <= 0) {
        if (left()) { tryMove(-1, 0); moveT = 0.12; }
        else if (right()) { tryMove(1, 0); moveT = 0.12; }
        else if (upHeld()) { tryMove(0, -1); moveT = 0.12; }
        else if (downHeld()) { tryMove(0, 1); moveT = 0.12; }
      }
      if (touch.tap) {
        var tx = Math.floor((touch.x - ox()) / cell), ty = Math.floor((touch.y - oy()) / cell);
        if (tx >= 0 && ty >= 0 && tx < cols && ty < rows) {
          var ddx = tx - px, ddy = ty - py;
          if (Math.abs(ddx) > Math.abs(ddy)) tryMove(ddx > 0 ? 1 : -1, 0);
          else if (ddy !== 0) tryMove(0, ddy > 0 ? 1 : -1);
          moveT = 0.16;
        }
      }
      if (CFG.timed) {
        var limit = 60 + level * 10;
        if (runTime > limit) { health = Math.max(0, 100 - (runTime - limit) * 6); paintHud(); if (health <= 0) { lives = 0; setState("GAMEOVER"); } }
      }
      paintHud();
    }
    function draw(t) {
      var X = ox(), Y = oy();
      /* fog: reveal around the player */
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var d = Math.hypot(x - px, y - py);
          var vis = clamp(1 - (d - torch) / 2.2, 0.06, 1);
          ctx.globalAlpha = vis;
          if (grid[y][x].w) {
            ctx.fillStyle = d < torch ? THEME.brick0 : THEME.hill0;
            roundRect(X + x * cell + 1, Y + y * cell + 1, cell - 2, cell - 2, Math.min(4, cell * 0.2));
            ctx.fill();
          } else {
            ctx.fillStyle = THEME.sky2;
            ctx.fillRect(X + x * cell, Y + y * cell, cell, cell);
          }
        }
      }
      ctx.globalAlpha = 1;
      /* door */
      var ddx = door.x, ddy = door.y;
      ctx.save();
      ctx.shadowColor = THEME.gold; ctx.shadowBlur = 20;
      ctx.fillStyle = THEME.gold;
      roundRect(X + ddx * cell + cell * 0.18, Y + ddy * cell + cell * 0.1, cell * 0.64, cell * 0.8, cell * 0.2);
      ctx.fill();
      ctx.restore();
      /* keys */
      for (var i = 0; i < keys0.length; i++) {
        if (keys0[i].got) continue;
        var kx = X + keys0[i].x * cell + cell / 2, ky = Y + keys0[i].y * cell + cell / 2;
        ctx.save();
        ctx.translate(kx, ky + Math.sin(t * 4 + i) * 2);
        ctx.fillStyle = THEME.aqua; ctx.shadowColor = THEME.aqua; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(0, -cell * 0.12, cell * 0.16, 0, TAU); ctx.fill();
        ctx.fillRect(-cell * 0.05, -cell * 0.02, cell * 0.1, cell * 0.3);
        ctx.restore();
      }
      /* player */
      ctx.save();
      ctx.translate(X + px * cell + cell / 2, Y + py * cell + cell / 2);
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 22;
      var g = ctx.createRadialGradient(0, 0, 2, 0, 0, cell * 0.42);
      g.addColorStop(0, THEME.hero0); g.addColorStop(1, THEME.hero1);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, cell * 0.34, 0, TAU); ctx.fill();
      ctx.restore();
      /* torch light */
      var lg = ctx.createRadialGradient(X + px * cell + cell / 2, Y + py * cell + cell / 2, cell * 0.4, X + px * cell + cell / 2, Y + py * cell + cell / 2, cell * (torch + 1.4));
      lg.addColorStop(0, "rgba(255,220,150,0.20)");
      lg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
      /* key counter */
      var got = 0;
      for (var q = 0; q < keys0.length; q++) if (keys0[q].got) got++;
      ctx.save();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = THEME.dim; ctx.font = "700 " + Math.round(clamp(W * 0.032, 12, 17)) + "px " + FONT;
      ctx.fillText(STR.keys + " " + got + "/" + keys0.length + "   ·   " + STR.steps + " " + steps, W / 2, H * 0.13);
      ctx.restore();
      void exitFound;
    }
    function drawIdle(t) {
      var s = W * 0.09;
      for (var y = 0; y < 3; y++) {
        for (var x = 0; x < 4; x++) {
          var on = (x + y * 2 + Math.floor(t)) % 5 !== 0;
          ctx.globalAlpha = on ? 0.85 : 0.25;
          ctx.fillStyle = on ? THEME.brick0 : THEME.sky2;
          roundRect(W * 0.22 + x * s * 1.1, H * 0.34 + y * s * 1.1, s, s, 5); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    function help() { return STR.help.maze; }
    function starScore() { return 700; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore };
  }


  /* ══ BLUEPRINT 7 — MERGE: 2048-style, size and target configurable ════ */
  function bpMerge() {
    var n, board, moved, bestTile, moves;
    function size() { return clamp(CFG.size || 4, 3, 6); }
    function reset() {
      maxHealth = 100; health = 100; lives = 1;
      n = size();
      board = [];
      for (var y = 0; y < n; y++) { var r = []; for (var x = 0; x < n; x++) r.push(0); board.push(r); }
      addTile(); addTile();
      bestTile = 2; moves = 0; moved = false;
    }
    function empties() {
      var out = [];
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (!board[y][x]) out.push({ x: x, y: y });
      return out;
    }
    function addTile() {
      var e = empties();
      if (!e.length) return;
      var c = e[Math.floor(R() * e.length)];
      board[c.y][c.x] = R() < 0.86 ? 2 : 4;
      var p = cellPos(c.x, c.y);
      burst(p.x, p.y, 8, THEME.aqua, 110, 0.4);
    }
    function cellPos(x, y) {
      var cs = cellSize();
      return { x: boardX() + x * cs + cs / 2, y: boardY() + y * cs + cs / 2, s: cs };
    }
    function cellSize() { return Math.min((W * 0.9) / n, (H * 0.6) / n); }
    function boardX() { return (W - cellSize() * n) / 2; }
    function boardY() { return H * 0.2; }
    function slide(line) {
      var arr = line.filter(function (v) { return v; });
      var out = [], gained = 0;
      for (var i = 0; i < arr.length; i++) {
        if (i + 1 < arr.length && arr[i] === arr[i + 1]) {
          var v = arr[i] * 2; out.push(v); gained += v;
          if (v > bestTile) { bestTile = v; SFX.level(); flash = 0.5; }
          i++;
        } else out.push(arr[i]);
      }
      while (out.length < line.length) out.push(0);
      return { line: out, gained: gained };
    }
    function move(dx, dy) {
      var before = JSON.stringify(board);
      var gained = 0;
      if (dx === -1) for (var y = 0; y < n; y++) { var r = slide(board[y]); board[y] = r.line; gained += r.gained; }
      if (dx === 1) for (var y2 = 0; y2 < n; y2++) { var r2 = slide(board[y2].slice().reverse()); board[y2] = r2.line.reverse(); gained += r2.gained; }
      if (dy === -1) for (var x = 0; x < n; x++) {
        var col = []; for (var yy = 0; yy < n; yy++) col.push(board[yy][x]);
        var r3 = slide(col); for (var y3 = 0; y3 < n; y3++) board[y3][x] = r3.line[y3]; gained += r3.gained;
      }
      if (dy === 1) for (var x2 = 0; x2 < n; x2++) {
        var col2 = []; for (var y4 = 0; y4 < n; y4++) col2.push(board[y4][x2]);
        col2.reverse();
        var r4 = slide(col2); r4.line.reverse();
        for (var y5 = 0; y5 < n; y5++) board[y5][x2] = r4.line[y5];
        gained += r4.gained;
      }
      moved = JSON.stringify(board) !== before;
      if (!moved) { SFX.tick(); return; }
      moves++;
      SFX.swap();
      if (gained) { addCombo(); addScore(gained, W / 2, boardY() - 14, ""); }
      else addScore(2, W / 2, boardY() - 14, "");
      addTile();
      if (moves % 12 === 0) bumpLevel(1);
      if (bestTile >= (CFG.target || 2048)) { setState("GAMEOVER"); return; }
      if (!canMove()) { setState("GAMEOVER"); }
      paintHud();
    }
    function canMove() {
      if (empties().length) return true;
      for (var y = 0; y < n; y++) {
        for (var x = 0; x < n; x++) {
          var v = board[y][x];
          if (x + 1 < n && board[y][x + 1] === v) return true;
          if (y + 1 < n && board[y + 1][x] === v) return true;
        }
      }
      return false;
    }
    var swipeLock = 0;
    function update(dt) {
      runTime += dt;
      swipeLock = Math.max(0, swipeLock - dt);
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
      if (swipeLock > 0) return;
      if (left()) { move(-1, 0); swipeLock = 0.19; }
      else if (right()) { move(1, 0); swipeLock = 0.19; }
      else if (upHeld()) { move(0, -1); swipeLock = 0.19; }
      else if (downHeld()) { move(0, 1); swipeLock = 0.19; }
      else if (touch.active && (Math.abs(touch.dx) > 28 || Math.abs(touch.dy) > 28)) {
        if (Math.abs(touch.dx) > Math.abs(touch.dy)) move(touch.dx > 0 ? 1 : -1, 0);
        else move(0, touch.dy > 0 ? 1 : -1);
        touch.sx = touch.x; touch.sy = touch.y; touch.dx = 0; touch.dy = 0;
        swipeLock = 0.22;
      } else if (tapPad("left")) { move(-1, 0); swipeLock = 0.19; }
      else if (tapPad("right")) { move(1, 0); swipeLock = 0.19; }
    }
    function tileColor(v) {
      var idx = Math.max(0, Math.round(Math.log(v / 2) / Math.LN2));
      var ramp = [THEME.sky2, THEME.brick1, THEME.accent, THEME.hero1, THEME.hero0, THEME.aqua, THEME.gold, THEME.rose];
      return ramp[idx % ramp.length];
    }
    function draw(t) {
      var cs = cellSize(), bx = boardX(), by = boardY();
      ctx.save();
      roundRect(bx - 8, by - 8, cs * n + 16, cs * n + 16, 16);
      ctx.fillStyle = "rgba(8,10,18,0.5)"; ctx.fill();
      ctx.strokeStyle = THEME.edge; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
      for (var y = 0; y < n; y++) {
        for (var x = 0; x < n; x++) {
          var v = board[y][x];
          var cxp = bx + x * cs, cyp = by + y * cs;
          ctx.save();
          roundRect(cxp + 4, cyp + 4, cs - 8, cs - 8, cs * 0.16);
          if (!v) { ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fill(); }
          else {
            var pulse = 1 + Math.sin(t * 3 + x + y) * 0.012;
            ctx.translate(cxp + cs / 2, cyp + cs / 2);
            ctx.scale(pulse, pulse);
            ctx.translate(-(cxp + cs / 2), -(cyp + cs / 2));
            ctx.fillStyle = tileColor(v);
            ctx.shadowColor = tileColor(v); ctx.shadowBlur = v >= 64 ? 22 : 10;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 1.2; ctx.stroke();
            ctx.fillStyle = v >= 8 ? "rgba(10,12,20,0.9)" : THEME.text;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            var len = String(v).length;
            ctx.font = "900 " + Math.round(cs * (len > 3 ? 0.28 : len > 2 ? 0.34 : 0.42)) + "px " + FONT;
            ctx.fillText(String(v), cxp + cs / 2, cyp + cs / 2 + 1);
          }
          ctx.restore();
        }
      }
      ctx.save();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = THEME.dim; ctx.font = "700 " + Math.round(clamp(W * 0.032, 12, 17)) + "px " + FONT;
      ctx.fillText(STR.bestTile + ": " + bestTile + "   ·   " + STR.target + ": " + (CFG.target || 2048), W / 2, by - 26);
      ctx.restore();
      void moved;
    }
    function drawIdle(t) {
      var vals = [2, 4, 8, 16];
      for (var i = 0; i < 4; i++) {
        var s = W * 0.13;
        var x = W * 0.24 + (i % 2) * s * 1.25, y = H * 0.34 + Math.floor(i / 2) * s * 1.25;
        ctx.save();
        roundRect(x, y + Math.sin(t * 2 + i) * 4, s, s, s * 0.18);
        ctx.fillStyle = tileColor(vals[i]); ctx.shadowColor = tileColor(vals[i]); ctx.shadowBlur = 18; ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(10,12,20,0.85)";
        ctx.font = "900 " + Math.round(s * 0.36) + "px " + FONT;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(vals[i]), x + s / 2, y + s / 2 + Math.sin(t * 2 + i) * 4);
        ctx.restore();
      }
    }
    function help() { return STR.help.merge; }
    function starScore() { return 1000; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore };
  }


  /* ══ BLUEPRINT 8 — MEMORY: timed match pairs with combos and levels ═══ */
  function bpMemory() {
    var cols, rows, cards, first, second, lockT, matched, attempts, timeLeft, glyphs;
    var SETS = ["★", "☾", "✦", "⚡", "❖", "✿", "☀", "♛", "⬢", "✺", "❂", "⬟", "♜", "⚘", "☘", "✧", "◈", "❉"];
    function build() {
      var pairs = clamp(4 + level * 2, 4, CFG.difficulty === "easy" ? 10 : 12);
      cols = pairs <= 6 ? 4 : pairs <= 8 ? 4 : pairs <= 10 ? 5 : 6;
      rows = Math.ceil((pairs * 2) / cols);
      var chosen = [];
      for (var i = 0; i < SETS.length; i++) chosen.push(SETS[i]);
      /* deterministic shuffle */
      for (var s = chosen.length - 1; s > 0; s--) {
        var j = Math.floor(R() * (s + 1));
        var tmp = chosen[s]; chosen[s] = chosen[j]; chosen[j] = tmp;
      }
      chosen = chosen.slice(0, pairs);
      var deck = [];
      for (var k = 0; k < chosen.length; k++) { deck.push(chosen[k]); deck.push(chosen[k]); }
      for (var d = deck.length - 1; d > 0; d--) {
        var q = Math.floor(R() * (d + 1));
        var t2 = deck[d]; deck[d] = deck[q]; deck[q] = t2;
      }
      cards = [];
      for (var c = 0; c < deck.length; c++) cards.push({ g: deck[c], up: false, done: false, pop: 0 });
      first = -1; second = -1; lockT = 0; matched = 0; attempts = 0;
      timeLeft = CFG.timed === false ? 0 : clamp(28 + pairs * 6 - level * 2, 20, 120);
      glyphs = pairs;
      /* reveal all for 1.6s at the start of a board */
      peek = 1.6;
    }
    var peek = 0;
    function reset() {
      maxHealth = 100; health = 100; lives = 1;
      build();
    }
    function geom() {
      var cw = Math.min((W * 0.88) / cols, (H * 0.56) / rows);
      return { cw: cw, x: (W - cw * cols) / 2, y: H * 0.24 };
    }
    function flip(i) {
      if (lockT > 0 || peek > 0) return;
      var c = cards[i];
      if (!c || c.up || c.done) return;
      c.up = true; c.pop = 1; SFX.swap();
      if (first < 0) { first = i; return; }
      second = i; attempts++;
      lockT = 0.52;
      if (cards[first].g === cards[second].g) {
        cards[first].done = true; cards[second].done = true;
        matched++; addCombo();
        var g = geom();
        var p1 = { x: g.x + (first % cols) * g.cw + g.cw / 2, y: g.y + Math.floor(first / cols) * g.cw + g.cw / 2 };
        burst(p1.x, p1.y, 18, THEME.gold, 200, 0.6);
        addScore(50 + combo * 8, p1.x, p1.y, "");
        SFX.coin();
        first = -1; second = -1; lockT = 0.12;
        if (matched >= glyphs) {
          addScore(150 + level * 40 + (timeLeft > 0 ? Math.round(timeLeft) * 3 : 0), W / 2, H * 0.4, "");
          bumpLevel(1);
          if (CFG.endless === false && level > CFG.levels) { setState("GAMEOVER"); return; }
          build();
        }
      } else {
        resetCombo();
        addScore(2);
      }
    }
    function update(dt) {
      runTime += dt;
      if (peek > 0) peek -= dt;
      if (lockT > 0) {
        lockT -= dt;
        if (lockT <= 0 && first >= 0 && second >= 0) {
          cards[first].up = false; cards[second].up = false;
          first = -1; second = -1;
        }
      }
      for (var i = 0; i < cards.length; i++) if (cards[i].pop > 0) cards[i].pop = Math.max(0, cards[i].pop - dt * 4);
      if (CFG.timed !== false && state === "PLAYING") {
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; health = 0; lives = 0; paintHud(); setState("GAMEOVER"); }
      }
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
      paintHud();
    }
    function draw(t) {
      var g = geom();
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        var x = g.x + (i % cols) * g.cw, y = g.y + Math.floor(i / cols) * g.cw;
        var show = c.up || c.done || peek > 0;
        ctx.save();
        var scale = 1 + c.pop * 0.08;
        ctx.translate(x + g.cw / 2, y + g.cw / 2);
        ctx.scale(scale, scale);
        roundRect(-g.cw * 0.44, -g.cw * 0.44, g.cw * 0.88, g.cw * 0.88, g.cw * 0.14);
        if (show) {
          ctx.fillStyle = c.done ? THEME.hero1 : THEME.accent;
          ctx.shadowColor = c.done ? THEME.glow : THEME.accent; ctx.shadowBlur = c.done ? 20 : 10;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.fillStyle = c.done ? THEME.text : "rgba(10,12,20,0.85)";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.font = "800 " + Math.round(g.cw * 0.4) + "px " + FONT;
          ctx.globalAlpha = peek > 0 && !c.up && !c.done ? clamp(peek / 1.6, 0, 1) : 1;
          ctx.fillText(c.g, 0, 2);
        } else {
          var bg = ctx.createLinearGradient(-g.cw / 2, -g.cw / 2, g.cw / 2, g.cw / 2);
          bg.addColorStop(0, THEME.brick0); bg.addColorStop(1, THEME.brick1);
          ctx.fillStyle = bg; ctx.fill();
          ctx.strokeStyle = THEME.edge; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 2 + i);
          ctx.fillStyle = THEME.gold;
          ctx.font = "900 " + Math.round(g.cw * 0.34) + "px " + FONT;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("?", 0, 2);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = THEME.dim; ctx.font = "700 " + Math.round(clamp(W * 0.032, 12, 17)) + "px " + FONT;
      var line = STR.pairs + " " + matched + "/" + glyphs;
      if (CFG.timed !== false) line += "   ·   " + STR.time + " " + Math.ceil(timeLeft) + "s";
      ctx.fillText(line, W / 2, H * 0.16);
      ctx.restore();
    }
    function pointer(kind, x, y) {
      if (kind !== "tap" || state !== "PLAYING") return;
      var g = geom();
      var cx = Math.floor((x - g.x) / g.cw), cy = Math.floor((y - g.y) / g.cw);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
      flip(cy * cols + cx);
    }
    function drawIdle(t) {
      var s = W * 0.15;
      for (var i = 0; i < 6; i++) {
        var x = W * 0.2 + (i % 3) * s * 1.2, y = H * 0.34 + Math.floor(i / 3) * s * 1.2;
        ctx.save();
        roundRect(x, y + Math.sin(t * 2 + i) * 5, s, s, s * 0.16);
        var up = (Math.floor(t * 1.4) + i) % 3 === 0;
        ctx.fillStyle = up ? THEME.accent : THEME.brick1;
        ctx.shadowColor = up ? THEME.accent : "rgba(0,0,0,0.4)"; ctx.shadowBlur = up ? 20 : 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        if (up) {
          ctx.fillStyle = "rgba(10,12,20,0.8)";
          ctx.font = "800 " + Math.round(s * 0.5) + "px " + FONT;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(SETS[i % SETS.length], x + s / 2, y + s / 2 + Math.sin(t * 2 + i) * 5);
        }
        ctx.restore();
      }
    }
    function help() { return STR.help.memory; }
    function starScore() { return 900; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore, pointer: pointer };
  }


  /* ══ boot & main loop ══════════════════════════════════════════════════ */
  var BLUEPRINTS = {
    runner: bpRunner,
    breaker: bpBreaker,
    snake: bpSnake,
    shooter: bpShooter,
    climber: bpClimber,
    maze: bpMaze,
    merge: bpMerge,
    memory: bpMemory
  };

  function boot() {
    fit();
    initScenery();
    bindButtons();
    muted = store.get("muted", !CFG.sound);
    paintButtons();
    var make = BLUEPRINTS[CFG.blueprint] || bpRunner;
    G = make();
    G.reset();
    paintHud();
    var hb = document.getElementById("nx-best"); if (hb) hb.textContent = String(best);
    var tt = document.getElementById("nx-title"); if (tt) tt.textContent = CFG.title || STR.game;
    var bt = document.getElementById("nx-blueprint"); if (bt) bt.textContent = CFG.blueprintLabel || CFG.blueprint;
    setState("MENU");
    /* short designed loading screen, then the menu */
    var t0 = now();
    var li = setInterval(function () {
      loadProgress = clamp((now() - t0) / 700, 0, 1);
      if (loadProgress >= 1) { clearInterval(li); }
    }, 40);
    state = "LOADING";
    setTimeout(function () { if (state === "LOADING") setState("MENU"); }, 760);
    var el = document.getElementById("nx-boot");
    if (el) el.classList.add("on");
    requestAnimationFrame(frame);
  }

  var last = 0, hudT = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!ctx) return;
    var t = now();
    if (!last) last = t;
    var dt = clamp((t - last) / 1000, 0, 0.033);
    last = t;
    try {
      fps = lerp(fps, dt > 0 ? 1 / dt : 60, 0.06);
      if (hitStop > 0) { hitStop -= dt; dt *= 0.12; }
      var time = t / 1000;
      /* every screen rebuilds its own buttons; a stale button from the menu
         must never swallow a tap during play */
      uiButtons.length = 0;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      if (shake > 0) ctx.translate(rnd(-1, 1) * shake * 9, rnd(-1, 1) * shake * 9);
      if (state === "LOADING") drawLoading(time);
      else if (state === "MENU") { drawMenu(time); updateJuice(dt); }
      else if (state === "PLAYING") {
        drawSky(time);
        frames++;
        if (G.update) G.update(dt);
        if (G.draw) G.draw(time);
        drawJuice();
        vignette();
        updateJuice(dt);
        musicTick(time);
        hudT += dt;
        if (hudT > 0.25) { hudT = 0; paintHud(); }
      } else if (state === "PAUSED") { drawPause(time); }
      else if (state === "GAMEOVER") { drawGameOver(time); updateJuice(dt); }
      ctx.restore();
      void ts;
    } catch (err) {
      /* one broken frame must never kill the loop */
      if (window.console && console.warn) console.warn("[smith] frame skipped:", err && err.message ? err.message : err);
    }
    for (var k in pressed) if (Object.prototype.hasOwnProperty.call(pressed, k)) pressed[k] = false;
    touch.tap = false;
  }

  /* expose a tiny debug handle (never used by the game itself) */
  window.NexusSmith = {
    version: 17,
    config: CFG,
    start: startRun,
    pause: togglePause,
    mute: toggleMute,
    state: function () { return state; },
    score: function () { return score; }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
`;
