
  /* ══ BLUEPRINT 10 — PONG: first to N, curved returns, power-ups ═══════ */
  function bpPong() {
    var padH, padW, myY, aiY, ball, ballV, serveT, myScore, aiScore, target, trail, flashT;
    function reset() {
      maxHealth = 100; health = 100; lives = 1;
      padW = clamp(W * 0.028, 9, 14);
      padH = clamp(H * 0.13, 60, 110);
      myY = H * 0.5; aiY = H * 0.5;
      myScore = 0; aiScore = 0;
      target = clamp(CFG.levels || 7, 3, 21);
      ball = { x: W * 0.5, y: H * 0.5, r: clamp(W * 0.016, 6, 10), spin: 0 };
      ballV = { x: 0, y: 0 };
      serveT = 0.9;
      trail = [];
      flashT = 0;
    }
    function serve(dir) {
      ball.x = W * 0.5; ball.y = H * 0.5;
      var sp = (300 + level * 18) * CFG.speedMul;
      var ang = rnd(-0.42, 0.42);
      ballV.x = Math.cos(ang) * sp * dir;
      ballV.y = Math.sin(ang) * sp;
      ball.spin = 0;
      SFX.click();
    }
    function update(dt) {
      runTime += dt;
      flashT = Math.max(0, flashT - dt);
      var sp = (300 + level * 18) * CFG.speedMul * (power === "slow" ? 0.62 : 1);
      /* paddles */
      var mySpeed = H * 1.25;
      if (upHeld()) myY -= mySpeed * dt;
      if (downHeld()) myY += mySpeed * dt;
      if (touch.active) myY = lerp(myY, clamp(touch.y, padH / 2, H - padH / 2), clamp(dt * 16, 0, 1));
      myY = clamp(myY, padH / 2, H - padH / 2);

      var aiErr = CFG.difficulty === "easy" ? 150 : CFG.difficulty === "normal" ? 78 : CFG.difficulty === "hard" ? 40 : 18;
      var aiTarget = clamp(ball.y + rnd(-aiErr, aiErr), padH / 2, H - padH / 2);
      var aiSpeed = H * (CFG.difficulty === "insane" ? 1.5 : 1.05);
      aiY += clamp(aiTarget - aiY, -aiSpeed * dt, aiSpeed * dt);
      aiY = clamp(aiY, padH / 2, H - padH / 2);

      /* serve pause */
      if (serveT > 0) {
        serveT -= dt;
        if (serveT <= 0) serve(ballV.x >= 0 ? 1 : -1);
        paintHud();
        return;
      }

      var steps = 3, sdt = dt / steps;
      for (var s = 0; s < steps; s++) {
        ball.x += ballV.x * sdt;
        ball.y += ballV.y * sdt + ball.spin * sdt;
        ball.spin *= 0.985;
        if (ball.y - ball.r < 0) { ball.y = ball.r; ballV.y = Math.abs(ballV.y); SFX.tick(); burst(ball.x, ball.y, 5, THEME.dim, 90, 0.25); }
        if (ball.y + ball.r > H) { ball.y = H - ball.r; ballV.y = -Math.abs(ballV.y); SFX.tick(); burst(ball.x, ball.y, 5, THEME.dim, 90, 0.25); }

        /* my paddle (left) */
        if (ballV.x < 0 && ball.x - ball.r < W * 0.06 + padW && ball.x + ball.r > W * 0.06) {
          if (Math.abs(ball.y - myY) < padH / 2 + ball.r) {
            var rel = clamp((ball.y - myY) / (padH / 2), -1, 1);
            var mag = Math.max(Math.abs(ballV.x), Math.abs(ballV.y)) * 1.045;
            var ang2 = rel * 0.9;
            ballV.x = Math.cos(ang2) * mag;
            ballV.y = Math.sin(ang2) * mag;
            ball.spin = rel * 130;
            ball.x = W * 0.06 + padW + ball.r + 1;
            addCombo();
            SFX.jump();
            burst(ball.x, ball.y, 8, THEME.aqua, 140, 0.35);
            if (power === "boost") { ballV.x *= 1.35; ballV.y *= 1.2; }
          }
        }
        /* ai paddle (right) */
        if (ballV.x > 0 && ball.x + ball.r > W * 0.94 - padW && ball.x - ball.r < W * 0.94) {
          if (Math.abs(ball.y - aiY) < padH / 2 + ball.r) {
            var rel2 = clamp((ball.y - aiY) / (padH / 2), -1, 1);
            var mag2 = Math.max(Math.abs(ballV.x), Math.abs(ballV.y)) * 1.03;
            var ang3 = rel2 * 0.85;
            ballV.x = -Math.cos(ang3) * mag2;
            ballV.y = Math.sin(ang3) * mag2;
            ball.spin = rel2 * 110;
            ball.x = W * 0.94 - padW - ball.r - 1;
            SFX.tick();
            burst(ball.x, ball.y, 6, THEME.rose, 120, 0.3);
          }
        }
        /* clamp speed */
        var vmax = 1500;
        var vm = Math.sqrt(ballV.x * ballV.x + ballV.y * ballV.y) || 1;
        if (vm > vmax) { ballV.x = ballV.x / vm * vmax; ballV.y = ballV.y / vm * vmax; }
        if (Math.abs(ballV.x) < sp * 0.55) ballV.x = (ballV.x < 0 ? -1 : 1) * sp * 0.55;
      }

      /* scoring */
      if (ball.x < -20) {
        aiScore++;
        flashT = 0.4; SFX.boom(); shake = 0.6;
        if (aiScore >= target) { lose(); return; }
        ballV.x = 1; serveT = 0.7; resetCombo();
        burst(0, ball.y, 20, THEME.rose, 200, 0.6);
      } else if (ball.x > W + 20) {
        myScore++;
        addScore(120, W * 0.5, H * 0.3, "");
        coins++;
        flashT = 0.4; SFX.level();
        if (myScore >= target) { win(); return; }
        if (myScore % 3 === 0) bumpLevel(1);
        ballV.x = -1; serveT = 0.7;
        burst(W, ball.y, 20, THEME.gold, 200, 0.6);
      }
      /* power-ups on the centre line */
      if (CFG.powerups && R() < dt * 0.16) {
        power = R() < 0.5 ? "slow" : "boost";
        powerTimer = 4.5;
        SFX.power();
        floatText(W * 0.5, H * 0.42, STR.powers[power] || power, THEME.aqua);
      }
      if (powerTimer > 0) { powerTimer -= dt; if (powerTimer <= 0) { power = null; } }
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
      trail.push({ x: ball.x, y: ball.y });
      if (trail.length > 14) trail.shift();
      paintHud();
    }
    function lose() {
      health = 0; lives = 0; paintHud();
      shake = 0.9; flash = 0.7; SFX.over();
      setState("GAMEOVER");
    }
    function win() {
      addScore(600, W * 0.5, H * 0.4, "");
      SFX.level();
      flash = 0.9;
      if (CFG.endless) { myScore = 0; aiScore = 0; level++; serveT = 0.8; return; }
      setState("GAMEOVER");
    }
    function drawPaddle(x, y, color) {
      ctx.save();
      ctx.shadowColor = color; ctx.shadowBlur = 16;
      var g = ctx.createLinearGradient(x - padW / 2, y - padH / 2, x + padW / 2, y + padH / 2);
      g.addColorStop(0, color); g.addColorStop(1, THEME.hero1);
      ctx.fillStyle = g;
      roundRect(x - padW / 2, y - padH / 2, padW, padH, padW / 2);
      ctx.fill();
      ctx.restore();
    }
    function draw(t) {
      /* net */
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = THEME.dim;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 14]);
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
      ctx.restore();
      /* trail */
      for (var i = 0; i < trail.length; i++) {
        ctx.globalAlpha = (i / trail.length) * 0.3;
        ctx.fillStyle = THEME.accent;
        ctx.beginPath(); ctx.arc(trail[i].x, trail[i].y, ball.r * (i / trail.length), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      drawPaddle(W * 0.06, myY, THEME.aqua);
      drawPaddle(W * 0.94, aiY, THEME.rose);
      /* ball */
      ctx.save();
      ctx.shadowColor = THEME.gold; ctx.shadowBlur = 22;
      ctx.fillStyle = THEME.gold;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, TAU); ctx.fill();
      ctx.restore();
      /* scoreboard */
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "900 " + Math.round(clamp(W * 0.11, 34, 62)) + "px " + FONT;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = THEME.aqua;
      ctx.fillText(String(myScore), W * 0.34, H * 0.14);
      ctx.fillStyle = THEME.rose;
      ctx.fillText(String(aiScore), W * 0.66, H * 0.14);
      ctx.globalAlpha = 1;
      ctx.font = "700 " + Math.round(clamp(W * 0.028, 11, 16)) + "px " + FONT;
      ctx.fillStyle = THEME.dim;
      ctx.fillText("— " + target + " —", W / 2, H * 0.14);
      if (serveT > 0) {
        ctx.fillStyle = THEME.text;
        ctx.font = "800 " + Math.round(clamp(W * 0.04, 14, 22)) + "px " + FONT;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 10);
        ctx.fillText(Math.ceil(serveT * 10) / 10 > 0 ? "●" : "", W / 2, H * 0.62);
        ctx.globalAlpha = 1;
      }
      if (flashT > 0) {
        ctx.globalAlpha = flashT * 0.5;
        ctx.fillStyle = THEME.rose;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }
    function drawIdle(t) {
      drawPaddle(W * 0.06, H * 0.5 + Math.sin(t * 2) * H * 0.1, THEME.aqua);
      drawPaddle(W * 0.94, H * 0.5 + Math.sin(t * 2 + 1.6) * H * 0.1, THEME.rose);
      ctx.save();
      ctx.shadowColor = THEME.gold; ctx.shadowBlur = 20;
      ctx.fillStyle = THEME.gold;
      ctx.beginPath();
      ctx.arc(W * 0.5 + Math.sin(t * 2.4) * W * 0.24, H * 0.5 + Math.cos(t * 3.1) * H * 0.08, ballR(), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    function ballR() { return clamp(W * 0.016, 6, 10); }
    function help() { return STR.help.pong; }
    function starScore() { return 700; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore };
  }
