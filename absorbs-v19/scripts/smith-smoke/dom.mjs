/* Deterministic virtual-DOM/canvas/audio stub — actually executes a generated game. */
export function makeEnv() {
  const errors = [];
  const warns = [];
  const logs = [];
  const noop = () => {};
  const grad = () => ({ addColorStop: noop });

  const ctxState = {
    canvas: { width: 420, height: 760 },
    globalAlpha: 1, fillStyle: "#000", strokeStyle: "#000", lineWidth: 1,
    font: "10px sans", textAlign: "start", textBaseline: "alphabetic",
    shadowColor: "", shadowBlur: 0, imageSmoothingEnabled: true, lineCap: "butt", lineJoin: "miter",
  };
  const CTX_METHODS = ["save", "restore", "scale", "rotate", "translate", "transform", "setTransform",
    "clearRect", "fillRect", "strokeRect", "beginPath", "closePath", "moveTo", "lineTo", "arc", "arcTo",
    "ellipse", "rect", "fill", "stroke", "clip", "drawImage", "fillText", "strokeText", "setLineDash",
    "quadraticCurveTo", "bezierCurveTo", "resetTransform"];
  const ctx = new Proxy(ctxState, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === "createLinearGradient" || p === "createRadialGradient" || p === "createPattern") return grad;
      if (p === "measureText") return () => ({ width: 42 });
      if (CTX_METHODS.includes(String(p))) return noop;
      return undefined;
    },
    set(t, p, v) { t[p] = v; return true; },
  });

  function makeEl(id) {
    const L = new Map();
    return {
      id, textContent: "", style: {}, dataset: {}, _l: L,
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 420, height: 760, right: 420, bottom: 760 }),
      getContext: () => ctx,
      addEventListener: (t, fn) => { if (!L.has(t)) L.set(t, []); L.get(t).push(fn); },
      removeEventListener: noop, setAttribute: noop, appendChild: noop,
      requestFullscreen: () => Promise.resolve(),
      width: 420, height: 760,
    };
  }
  const els = new Map();
  const doc = {
    readyState: "complete", hidden: false, fullscreenElement: null,
    getElementById: (id) => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
    querySelector: () => null, querySelectorAll: () => [],
    createElement: (t) => makeEl("created:" + t),
    addEventListener: noop, removeEventListener: noop,
    documentElement: makeEl("html"), body: makeEl("body"), exitFullscreen: noop,
  };

  /* ── virtual clock ─────────────────────────────────────────────── */
  let vt = 0;
  let timerId = 1;
  const timers = new Map();   // id -> {at, every, fn}
  function schedule(fn, ms, every) {
    const id = timerId++;
    timers.set(id, { at: vt + Math.max(0, ms || 0), every: every ? Math.max(1, ms || 1) : 0, fn });
    return id;
  }
  function runTimers() {
    let guard = 0;
    for (const [id, t] of [...timers.entries()]) {
      if (guard++ > 5000) break;
      if (t.at <= vt) {
        try { t.fn(); } catch (e) { errors.push("timer: " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e)); }
        if (t.every) t.at = vt + t.every; else timers.delete(id);
      }
    }
  }

  /* ── fake Web Audio ────────────────────────────────────────────── */
  function param(v) {
    return {
      value: v,
      setValueAtTime(x) { this.value = x; return this; },
      exponentialRampToValueAtTime(x) { if (!(x > 0)) errors.push("audio: exponentialRamp to " + x); this.value = x; return this; },
      linearRampToValueAtTime(x) { this.value = x; return this; },
      cancelScheduledValues() { return this; },
    };
  }
  function node(extra) {
    return Object.assign({ connect: noop, disconnect: noop, start: noop, stop: noop }, extra || {});
  }
  class FakeAudioContext {
    constructor() { this.currentTime = 0; this.sampleRate = 44100; this.destination = node(); this.state = "running"; }
    createGain() { return node({ gain: param(1) }); }
    createOscillator() { return node({ type: "sine", frequency: param(440), detune: param(0) }); }
    createBiquadFilter() { return node({ type: "lowpass", frequency: param(350), Q: param(1) }); }
    createBuffer(ch, len, rate) {
      const data = new Float32Array(len);
      return { getChannelData: () => data, length: len, sampleRate: rate, numberOfChannels: ch };
    }
    createBufferSource() { return node({ buffer: null, loop: false }); }
    createConvolver() { return node({ buffer: null }); }
    createAnalyser() { return node({ fftSize: 2048, frequencyBinCount: 1024, getByteFrequencyData: noop }); }
    resume() { this.state = "running"; return Promise.resolve(); }
    suspend() { this.state = "suspended"; return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }

  const listeners = new Map();
  const rafQueue = [];
  const win = {
    devicePixelRatio: 2, innerWidth: 420, innerHeight: 760,
    addEventListener: (type, fn) => { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener: noop,
    localStorage: {
      _d: new Map(),
      getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
      setItem(k, v) { this._d.set(k, String(v)); },
      removeItem(k) { this._d.delete(k); },
    },
    console: {
      warn: (...a) => warns.push(a.map(String).join(" ")),
      error: (...a) => errors.push("console.error: " + a.map(String).join(" ")),
      log: (...a) => logs.push(a.map(String).join(" ")),
    },
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    cancelAnimationFrame: noop,
    setTimeout: (fn, ms) => schedule(fn, ms, 0),
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, ms) => schedule(fn, ms, 1),
    clearInterval: (id) => timers.delete(id),
    performance: { now: () => vt },
    AudioContext: FakeAudioContext,
    navigator: { vibrate: () => true, userAgent: "node", maxTouchPoints: 5 },
    parent: null,
    postMessage: (m) => { posted.push(m); },
  };
  const posted = [];
  win.window = win; win.document = doc; win.self = win; win.globalThis = win;

  const env = {
    win, doc, errors, warns, logs, posted, listeners, ctx,
    fire(type, ev) { for (const fn of listeners.get(type) || []) fn(Object.assign({ preventDefault: noop, cancelable: true }, ev)); },
    fireEl(id, type, ev) {
      const el = els.get(id);
      if (!el || !el._l) return 0;
      const fns = el._l.get(type) || [];
      for (const fn of fns) fn(Object.assign({ preventDefault: noop, cancelable: true, changedTouches: undefined }, ev));
      return fns.length;
    },
    /** advance the virtual clock and run exactly `n` animation frames */
    tick(n = 1, stepMs = 16.7) {
      for (let i = 0; i < n; i++) {
        vt += stepMs;
        runTimers();
        const q = rafQueue.splice(0, rafQueue.length);
        for (const fn of q) {
          try { fn(vt); } catch (e) { errors.push("frame: " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e)); }
        }
      }
    },
    now: () => vt,
  };
  return env;
}

export function runScripts(env, html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!scripts.length) throw new Error("no scripts found in generated html");
  const fn = new Function(
    "window", "document", "navigator", "performance", "localStorage", "console",
    "requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout",
    "setInterval", "clearInterval", "AudioContext", "self", "globalThis",
    scripts.join("\n;\n")
  );
  fn(env.win, env.doc, env.win.navigator, env.win.performance, env.win.localStorage, env.win.console,
     env.win.requestAnimationFrame, env.win.cancelAnimationFrame, env.win.setTimeout, env.win.clearTimeout,
     env.win.setInterval, env.win.clearInterval, env.win.AudioContext, env.win, env.win);
  return scripts.length;
}
