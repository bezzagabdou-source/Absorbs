/* ══════════════════════════════════════════════════════════════════════════
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
