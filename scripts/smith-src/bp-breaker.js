
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
