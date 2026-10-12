
  /* ══ BLUEPRINT 9 — FLAPPY: one-button flight through shifting gates ═══ */
  function bpFlappy() {
    var birdY, birdV, gapY, gateW, gateGap, pipes, spawnT, passed, groundY, flapT, dead, bob;
    function reset() {
      groundY = H * 0.86;
      birdY = H * 0.42; birdV = 0; flapT = 0; bob = 0;
      maxHealth = 100; health = 100; lives = 1;
      gateW = clamp(W * 0.17, 52, 86);
      gateGap = clamp(H * 0.30 - (CFG.difficulty === "insane" ? 26 : CFG.difficulty === "hard" ? 14 : 0), 96, 260);
      pipes = []; spawnT = 0.9; passed = 0; dead = false;
      for (var i = 0; i < 3; i++) spawnPipe(W + 120 + i * gateW * 3.1);
    }
    function spawnPipe(x) {
      var margin = H * 0.12;
      var top = rnd(margin + 30, H - margin - gateGap - 30);
      pipes.push({ x: x, top: top, scored: false, coin: CFG.powerups && R() < 0.5 ? { got: false, t: 0 } : null });
    }
    function flap() {
      birdV = -clamp(360 + (CFG.difficulty === "easy" ? 40 : 0), 300, 520) * 1;
      flapT = 0.22;
      SFX.jump();
      burst(W * 0.28, birdY + 8, 6, THEME.aqua, 90, 0.3);
    }
    function update(dt) {
      runTime += dt;
      if (jumpPressed()) flap();
      birdV += 1180 * dt * (power === "slow" ? 0.62 : 1);
      birdY += birdV * dt;
      flapT = Math.max(0, flapT - dt);
      bob += dt;
      var speed = (168 + level * 9) * CFG.speedMul * (power === "slow" ? 0.66 : 1);

      for (var i = pipes.length - 1; i >= 0; i--) {
        var p = pipes[i];
        p.x -= speed * dt;
        if (p.coin) p.coin.t += dt;
        var bx = W * 0.28, by = birdY, r = clamp(W * 0.026, 11, 16);
        if (!p.scored && p.x + gateW < bx) {
          p.scored = true; passed++;
          addCombo();
          addScore(10, bx, by - 40);
          if (passed % 8 === 0) { bumpLevel(1); }
        }
        /* circle vs two rects */
        var hitTop = bx + r > p.x && bx - r < p.x + gateW && by - r < p.top;
        var hitBot = bx + r > p.x && bx - r < p.x + gateW && by + r > p.top + gateGap;
        if (hitTop || hitBot) { die(); return; }
        if (p.coin && !p.coin.got) {
          var ccx = p.x + gateW / 2, ccy = p.top + gateGap / 2;
          var dx = ccx - bx, dy = ccy - by;
          if (dx * dx + dy * dy < (r + 16) * (r + 16)) {
            p.coin.got = true;
            coins++; addScore(25, ccx, ccy, "");
            SFX.coin(); burst(ccx, ccy, 12, THEME.gold, 170, 0.5);
            if (R() < 0.22) { power = "shield"; powerTimer = 8; SFX.power(); floatText(ccx, ccy, STR.powers.shield, THEME.aqua); }
            paintHud();
          }
        }
        if (p.x + gateW < -30) pipes.splice(i, 1);
      }
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnPipe(W + 40);
        spawnT = clamp((gateW * 3.0) / speed, 0.55, 2.2) * (CFG.difficulty === "insane" ? 0.78 : 1);
      }
      if (birdY > groundY) { birdY = groundY; die(); return; }
      if (birdY < 0) { birdY = 0; birdV = 60; }
      if (powerTimer > 0) { powerTimer -= dt; if (powerTimer <= 0) { power = null; paintHud(); } }
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
      addScore(dt * 4);
      paintHud();
    }
    function die() {
      if (dead) return;
      if (power === "shield") {
        power = null; powerTimer = 0; birdV = -300; birdY -= 30;
        SFX.power(); floatText(W * 0.28, birdY, STR.powers.shield, THEME.aqua);
        paintHud(); return;
      }
      dead = true;
      shake = 1; flash = 0.8; SFX.boom();
      burst(W * 0.28, birdY, 34, THEME.rose, 250, 0.8);
      health = 0; lives = 0; paintHud();
      setState("GAMEOVER");
    }
    function drawBird(x, y, t) {
      var r = clamp(W * 0.026, 11, 16);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(clamp(birdV / 900, -0.5, 1.1));
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 18;
      var g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, THEME.hero0); g.addColorStop(1, THEME.hero1);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      /* wing */
      var wing = Math.sin((t + flapT) * 26) * (flapT > 0 ? 1 : 0.35);
      ctx.fillStyle = THEME.aqua;
      ctx.save();
      ctx.translate(-r * 0.2, r * 0.1);
      ctx.rotate(wing * 0.7);
      roundRect(-r * 0.7, -r * 0.28, r * 1.2, r * 0.55, r * 0.3);
      ctx.fill();
      ctx.restore();
      /* eye + beak */
      ctx.fillStyle = THEME.text;
      ctx.beginPath(); ctx.arc(r * 0.32, -r * 0.28, r * 0.16, 0, TAU); ctx.fill();
      ctx.fillStyle = THEME.gold;
      ctx.beginPath();
      ctx.moveTo(r * 0.85, 0); ctx.lineTo(r * 1.55, r * 0.22); ctx.lineTo(r * 0.85, r * 0.45);
      ctx.closePath(); ctx.fill();
      if (power === "shield") {
        ctx.strokeStyle = THEME.aqua; ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 8);
        ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    function draw(t) {
      groundY = H * 0.86;
      /* pipes */
      for (var i = 0; i < pipes.length; i++) {
        var p = pipes[i];
        var grd = ctx.createLinearGradient(p.x, 0, p.x + gateW, 0);
        grd.addColorStop(0, THEME.brick0); grd.addColorStop(0.5, THEME.brick1); grd.addColorStop(1, THEME.brick0);
        ctx.fillStyle = grd;
        roundRect(p.x, -10, gateW, p.top + 10, 8); ctx.fill();
        roundRect(p.x, p.top + gateGap, gateW, H - (p.top + gateGap) + 10, 8); ctx.fill();
        ctx.strokeStyle = THEME.edge; ctx.lineWidth = 1.5;
        roundRect(p.x, -10, gateW, p.top + 10, 8); ctx.stroke();
        roundRect(p.x, p.top + gateGap, gateW, H - (p.top + gateGap) + 10, 8); ctx.stroke();
        /* gate glow */
        ctx.save();
        ctx.globalAlpha = 0.22 + 0.1 * Math.sin(t * 3 + i);
        ctx.fillStyle = THEME.accent;
        ctx.fillRect(p.x + gateW * 0.42, p.top, gateW * 0.16, gateGap);
        ctx.restore();
        if (p.coin && !p.coin.got) {
          ctx.save();
          ctx.translate(p.x + gateW / 2, p.top + gateGap / 2 + Math.sin(t * 4 + p.coin.t) * 5);
          ctx.fillStyle = THEME.gold; ctx.shadowColor = THEME.gold; ctx.shadowBlur = 14;
          ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
          ctx.restore();
        }
      }
      /* ground */
      var gg = ctx.createLinearGradient(0, groundY, 0, H);
      gg.addColorStop(0, THEME.hill2); gg.addColorStop(1, THEME.sky2);
      ctx.fillStyle = gg; ctx.fillRect(0, groundY, W, H - groundY);
      ctx.strokeStyle = THEME.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();
      ctx.globalAlpha = 1;
      drawBird(W * 0.28, birdY, t);
    }
    function drawIdle(t) {
      for (var i = 0; i < 3; i++) {
        var px = W * (0.28 + i * 0.26) + Math.sin(t * 2 - i) * 8;
        var py = H * 0.42 + Math.sin(t * 3 - i * 0.8) * 26;
        var grd = ctx.createLinearGradient(px, py - 90, px + 40, py + 90);
        grd.addColorStop(0, THEME.brick0); grd.addColorStop(1, THEME.brick1);
        ctx.fillStyle = grd;
        roundRect(px, py - 110, 34, 96, 8); ctx.fill();
        roundRect(px, py + 22, 34, 96, 8); ctx.fill();
      }
      drawBird(W * 0.28, H * 0.42 + Math.sin(t * 3) * 16, t);
    }
    function help() { return STR.help.flappy; }
    function starScore() { return 40; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore };
  }
