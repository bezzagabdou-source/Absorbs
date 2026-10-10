import { buildSmithGame, verifySmithHtml } from "@/lib/smith/compose";
import { BLUEPRINTS } from "@/lib/smith/blueprints";
import { makeEnv, runScripts } from "./dom.mjs";

function playGame(cfg, opts = {}) {
  const build = buildSmithGame(cfg);
  const qa = verifySmithHtml(build.html);
  const env = makeEnv();
  runScripts(env, build.html);
  const F = env.win.NexusSmith;
  if (!F) return { ok: false, why: "NexusSmith handle missing", env, qa, build };
  env.tick(70);                                   // loading → menu
  const menuState = F.state();
  env.fire("keydown", { key: "Enter" });          // start
  env.tick(2);
  const playState = F.state();

  const frames = opts.frames || 420;
  let taps = 0;
  for (let i = 0; i < frames; i++) {
    // random but seeded-ish input
    const r = (i * 2654435761) % 1000 / 1000;
    if (i % 7 === 0) env.fire("keydown", { key: r < 0.3 ? "ArrowLeft" : r < 0.6 ? "ArrowRight" : r < 0.8 ? "ArrowUp" : "ArrowDown" });
    if (i % 11 === 0) env.fire("keyup", { key: "ArrowLeft" });
    if (i % 13 === 0) env.fire("keyup", { key: "ArrowRight" });
    if (i % 17 === 0) env.fire("keyup", { key: "ArrowUp" });
    if (i % 19 === 0) env.fire("keydown", { key: " " });
    if (i % 23 === 0) env.fire("keyup", { key: " " });
    if (opts.tap && i % 5 === 0) {
      const x = 40 + ((i * 37) % 340), y = 200 + ((i * 53) % 420);
      env.fireEl("nx-canvas", "mousedown", { clientX: x, clientY: y, touches: null });
      env.fire("mouseup", { clientX: x, clientY: y });
      taps++;
    }
    if (opts.swipe && i % 9 === 0) {
      const x0 = 200, y0 = 400;
      const x1 = x0 + ((i % 4) - 2) * 60, y1 = y0 + ((i % 3) - 1) * 60;
      env.fireEl("nx-canvas", "touchstart", { touches: [{ clientX: x0, clientY: y0 }] });
      env.fireEl("nx-canvas", "touchmove", { touches: [{ clientX: x1, clientY: y1 }] });
      env.fireEl("nx-canvas", "touchend", { changedTouches: [{ clientX: x1, clientY: y1 }] });
    }
    if (i % 90 === 0 && F.state() === "GAMEOVER") { env.fire("keydown", { key: "Enter" }); env.tick(2); }
    if (i % 60 === 0 && F.state() === "PAUSED") { env.fire("keydown", { key: "p" }); }
    env.tick(1);
  }
  return {
    ok: env.errors.length === 0 && env.warns.length === 0 && qa.ok && menuState === "MENU" &&
        (playState === "PLAYING" || playState === "GAMEOVER"),
    menuState, playState, endState: F.state(), score: F.score(),
    errors: env.errors, warns: env.warns, qaIssues: qa.issues,
    bytes: build.bytes, taps, posted: env.posted.length,
  };
}

let fail = 0;
const cases = [];
for (const bp of BLUEPRINTS) {
  cases.push({ label: bp.id + "/neon/ar", cfg: { blueprint: bp.id, theme: "neon", lang: "ar", difficulty: "normal", seed: 42, title: "اختبار " + bp.id },
    opts: { tap: true, swipe: true } });
  cases.push({ label: bp.id + "/candy/fr/hard", cfg: { blueprint: bp.id, theme: "candy", lang: "fr", difficulty: "hard", seed: 7, speed: 1.4, levels: 6, size: 5 },
    opts: { tap: true, swipe: true, frames: 300 } });
  cases.push({ label: bp.id + "/cyber/en/insane", cfg: { blueprint: bp.id, theme: "cyber", lang: "en", difficulty: "insane", seed: 999, endless: true, boss: true, powerups: true, walls: true, portals: true, wrap: true, timed: true },
    opts: { tap: true, swipe: true, frames: 260 } });
}
for (const c of cases) {
  const r = playGame(c.cfg, c.opts);
  const tag = r.ok ? "PASS" : "FAIL";
  if (!r.ok) fail++;
  console.log(`${tag}  ${c.label.padEnd(30)} menu=${r.menuState} play=${r.playState} end=${r.endState} score=${String(r.score).padEnd(7)} ${(r.bytes / 1024).toFixed(0)}KB posts=${r.posted}`);
  if (!r.ok) {
    if (r.errors && r.errors.length) console.log("   errors:", r.errors.slice(0, 3).join("\n            "));
    if (r.warns && r.warns.length) console.log("   warns :", r.warns.slice(0, 3).join("\n            "));
    if (r.qaIssues && r.qaIssues.length) console.log("   qa    :", r.qaIssues.join(", "));
  }
}
console.log(fail === 0 ? `\nALL ${cases.length} SMITH BUILDS CLEAN` : `\n${fail}/${cases.length} FAILED`);
process.exit(fail === 0 ? 0 : 1);
