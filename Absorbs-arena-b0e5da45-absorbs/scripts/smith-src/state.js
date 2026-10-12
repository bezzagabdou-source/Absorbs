
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
