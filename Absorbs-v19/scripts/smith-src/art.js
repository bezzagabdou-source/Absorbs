
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
