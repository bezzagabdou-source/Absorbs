
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
