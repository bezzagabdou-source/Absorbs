/**
 * SMOKE RUN — actually executes a generated game (server side, inside a locked-down node:vm) against a
 * fake browser, so the bugs that kill a game at runtime are found BEFORE the user sees them:
 *   - ReferenceError (a variable / function that does not exist)
 *   - "Cannot access X before initialization" (let/const used before its line)
 *   - a dead start button (its click handler throws)
 *   - a crash in the first frames of the game loop
 *
 * How: every browser object (document, canvas, audio, THREE ...) is a universal Proxy that accepts any
 * property / call. Only the game's OWN code can therefore throw. The driver then fires DOMContentLoaded / load,
 * runs 15 animation frames, fires EVERY registered event handler once (click, touch, key ...), and runs 30 more frames.
 * One hard time limit protects the server from `while(true)` loops. No network, no fs, no process: only the fake env exists.
 */
import vm from "node:vm";

export type SmokeIssue = { level: "error" | "warn"; message: string; line?: number };

const PRELUDE = String.raw`
var __errs = [], __handlers = [], __raf = [], __timers = [], __intervals = [], __phase = "boot";
function __mk(noThen) {
  var vals = {}, cache = {};
  var W = /(^|[a-z])(width|left|right)$/i, H = /(^|[a-z])(height|top|bottom)$/i;
  var p = new Proxy(function () {}, {
    get: function (t, k) {
      if (k === Symbol.toPrimitive) return function () { return 0; };
      if (k === Symbol.iterator) return function* () {};
      if (typeof k === "symbol") return undefined;
      if (k in vals) return vals[k];
      if (k === "then") { return noThen ? undefined : function (cb) { if (typeof cb === "function") { try { cb(__mk(true)); } catch (e) {} } return __mk(); }; }
      if (k === "toJSON") return undefined;
      if (k === "length") return 0;
      if (k === "getItem") return function () { return null; };
      if (k === "addEventListener") return function (type, fn) { if (typeof fn === "function") __handlers.push({ type: String(type), fn: fn }); };
      if (k === "removeEventListener") return function () {};
      if (k === "readyState") return "complete";
      if (k === "hidden") return false;
      if (k === "devicePixelRatio") return 1;
      if (W.test(k)) return 400;
      if (H.test(k)) return 800;
      if (k === "x" || k === "y" || k === "scrollX" || k === "scrollY") return 0;
      if (!cache[k]) cache[k] = __mk();
      return cache[k];
    },
    set: function (t, k, v) {
      vals[k] = v;
      if (typeof v === "function" && typeof k === "string" && k.slice(0, 2) === "on") __handlers.push({ type: k.slice(2), fn: v });
      return true;
    },
    apply: function () { return __mk(); },
    construct: function () { return __mk(); },
    has: function () { return true; }
  });
  return p;
}
var __t = 0;
var __ctor = function () { return __mk(); };
var __G = {
  window: globalThis, self: globalThis, top: globalThis, parent: globalThis, frames: globalThis,
  document: __mk(), navigator: __mk(), location: __mk(), screen: __mk(), history: __mk(),
  localStorage: __mk(), sessionStorage: __mk(), visualViewport: __mk(),
  innerWidth: 400, innerHeight: 800, outerWidth: 400, outerHeight: 800, devicePixelRatio: 1,
  performance: { now: function () { return (__t += 16); }, mark: function () {}, measure: function () {} },
  requestAnimationFrame: function (f) { if (typeof f === "function") __raf.push(f); return __raf.length; },
  cancelAnimationFrame: function () {},
  setTimeout: function (f) { if (typeof f === "function") __timers.push(f); return __timers.length; },
  setInterval: function (f) { if (typeof f === "function") __intervals.push(f); return __intervals.length; },
  clearTimeout: function () {}, clearInterval: function () {},
  queueMicrotask: function (f) { __timers.push(f); },
  alert: function () {}, confirm: function () { return true; }, prompt: function () { return ""; },
  matchMedia: function () { var m = __mk(); m.matches = false; return m; },
  getComputedStyle: function () { return __mk(); },
  postMessage: function () {}, scrollTo: function () {}, open: function () { return __mk(); }, focus: function () {}, blur: function () {},
  addEventListener: function (type, fn) { if (typeof fn === "function") __handlers.push({ type: String(type), fn: fn }); },
  removeEventListener: function () {},
  fetch: function () { return Promise.resolve(__mk(true)); },
  URL: __mk(), speechSynthesis: __mk(), indexedDB: __mk(), crypto: __mk(), caches: __mk(),
  THREE: __mk(), Phaser: __mk(), Howler: __mk(), gsap: __mk(), anime: __mk(), PIXI: __mk(), Matter: __mk(),
  CANNON: __mk(), $: __mk(), jQuery: __mk(), tailwind: __mk(), Tone: __mk(), lil: __mk(),
  NexusDB: new Proxy({}, { get: function (t, k) { return typeof k === "string" ? function () { return Promise.resolve(null); } : undefined; } })
};
("Image Audio AudioContext webkitAudioContext OfflineAudioContext OffscreenCanvas Path2D XMLHttpRequest WebSocket Worker Blob FileReader " +
 "ResizeObserver IntersectionObserver MutationObserver Event CustomEvent MouseEvent TouchEvent KeyboardEvent PointerEvent " +
 "SpeechSynthesisUtterance ImageData DOMParser Notification HTMLElement HTMLCanvasElement SpeechRecognition webkitSpeechRecognition Howl p5 Chart").split(" ")
  .forEach(function (n) { __G[n] = __ctor; });
var __NN = { online: true };
["image", "sound", "json", "text", "font", "script"].forEach(function (k) { __NN[k] = function () { return Promise.resolve(k === "font" || k === "script" ? false : null); }; });
__G.NexusNet = __NN;
__G.navigator.userAgent = "Mozilla/5.0 (iPhone) Mobile Safari"; __G.navigator.language = "en"; __G.navigator.maxTouchPoints = 5;
Object.keys(__G).forEach(function (k) { Object.defineProperty(globalThis, k, { value: __G[k], writable: true, configurable: true, enumerable: true }); });
function __note(label, e) {
  var s = String((e && e.stack) || "");
  __errs.push({ n: String((e && e.name) || "Error"), m: String((e && e.message) || e), s: s, l: label, phase: __phase });
}
function __call(fn, label, arg) { try { fn.call(globalThis, arg); } catch (e) { __note(label, e); } }
function __frames(n) {
  for (var i = 0; i < n; i++) {
    var q = __raf.splice(0), ts = 1000 + i * 16;
    for (var a = 0; a < q.length && a < 40; a++) __call(q[a], "frame", ts);
    var tm = __timers.splice(0);
    for (var b = 0; b < tm.length && b < 60; b++) __call(tm[b], "timer");
    for (var c = 0; c < __intervals.length && c < 20; c++) __call(__intervals[c], "interval");
  }
}
function __drive() {
  __phase = "life";
  var ev = __mk(true);
  ev.key = "ArrowRight"; ev.code = "ArrowRight"; ev.touches = [{ clientX: 200, clientY: 400 }]; ev.target = __mk(); ev.clientX = 200; ev.clientY = 400;
  var life = /^(DOMContentLoaded|load|readystatechange|pageshow)$/;
  for (var i = 0; i < __handlers.length && i < 60; i++) if (life.test(__handlers[i].type)) __call(__handlers[i].fn, __handlers[i].type, ev);
  if (typeof globalThis.onload === "function") __call(globalThis.onload, "onload", ev);
  __frames(15);
  __phase = "play";
  var skip = /^(DOMContentLoaded|load|readystatechange|pageshow|resize|beforeunload|unload|visibilitychange|contextmenu|orientationchange|error|unhandledrejection)$/;
  var done = 0;
  for (var j = 0; j < __handlers.length && done < 160; j++) {
    if (skip.test(__handlers[j].type)) continue;
    done++; __call(__handlers[j].fn, __handlers[j].type, ev);
  }
  __frames(30);
}
`;

const HARD = /^(ReferenceError|SyntaxError)$|before initialization|Assignment to constant|is not a constructor/;

/**
 * Runs the classic inline scripts of a page. `scripts[i].startLine` is the document line where the script body starts,
 * so reported lines match the numbered source the repair engine sees.
 */
export function smokeRun(scripts: { body: string; startLine: number }[]): SmokeIssue[] {
  if (scripts.length === 0) return [];
  // null-prototype sandbox (no host Object leaks into the game), eval/Function disabled, microtasks drained INSIDE the time limit
  const ctx = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false }, microtaskMode: "afterEvaluate" });
  try {
    new vm.Script(PRELUDE, { filename: "prelude.js" }).runInContext(ctx, { timeout: 1000 });
  } catch {
    return []; // the harness itself failed: never block a build because of it
  }
  const issues: SmokeIssue[] = [];
  const seen = new Set<string>();
  const add = (level: SmokeIssue["level"], message: string, line?: number) => {
    const key = message + "|" + (line ?? "");
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ level, message, line });
  };
  const lineOf = (stack: string): number | undefined => {
    const m = /game-(\d+)\.js:(\d+)/.exec(stack);
    if (!m) return undefined;
    const sc = scripts[Number(m[1])];
    return sc ? sc.startLine + Number(m[2]) - 1 : undefined;
  };

  // 1. boot: every script in order; a throw stops THAT script exactly like a browser does
  scripts.forEach((s, i) => {
    try {
      new vm.Script(s.body, { filename: `game-${i}.js` }).runInContext(ctx, { timeout: 1500 });
    } catch (e) {
      const err = e as Error;
      const name = String(err?.name ?? "Error");
      const msg = String(err?.message ?? e);
      if (/Script execution timed out/i.test(msg)) {
        add("error", "The script never finishes loading (an endless loop at start-up: while(true) / a loop whose exit is never reached).", s.startLine);
      } else {
        add("error", `Runtime error while the page boots (everything after it never runs, so the buttons are dead): ${name}: ${msg}`, lineOf(String(err?.stack ?? "")));
      }
    }
  });

  // 2. drive: lifecycle events, frames, every registered handler once, more frames
  try {
    new vm.Script("__drive()", { filename: "driver.js" }).runInContext(ctx, { timeout: 2500 });
    const errs = (vm.runInContext("__errs", ctx) as { n: string; m: string; s: string; l: string; phase: string }[]) ?? [];
    for (const e of errs.slice(0, 30)) {
      if (!/game-\d+\.js/.test(e.s)) continue; // thrown by the fake env, not by the game
      const line = lineOf(e.s);
      const hard = HARD.test(e.n) || HARD.test(e.m);
      const what = e.l === "frame" ? "in the game loop" : e.l === "timer" || e.l === "interval" ? "in a timer" : `in the "${e.l}" handler`;
      add(hard ? "error" : "warn", `Runtime ${hard ? "error" : "warning"} ${what}: ${e.n}: ${e.m}`, line);
    }
  } catch (e) {
    if (/Script execution timed out/i.test(String((e as Error)?.message))) {
      add("warn", "The game seems to hang (an endless loop inside a handler or the first frames). Make sure every while-loop has a guaranteed exit.");
    }
  }
  return issues;
}
