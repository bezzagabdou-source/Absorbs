
  /* ══ BLUEPRINT 11 — STACK: drop, align, build the tower to the sky ════ */
  function bpStack() {
    var bw, bh, blocks, cur, dir, speed, camY, perfect, dropT, started, bestH;
    function reset() {
      maxHealth = 100; health = 100; lives = 3;
      bw = clamp(W * 0.42, 96, 190);
      bh = clamp(H * 0.045, 22, 40);
      camY = 0;
      perfect = 0; dropT = 0; started = false; bestH = 0;
      blocks = [{ x: W / 2 - bw / 2, w: bw, y: H * 0.78 }];
      spawnBlock();
    }
    function top() { return blocks[blocks.length - 1]; }
    function spawnBlock() {
      var t = top();
      var fromLeft = blocks.length % 2 === 0;
      cur = {
        x: fromLeft ? -bw - 20 : W + 20,
        y: t.y - bh,
        w: t.w,
        dir: fromLeft ? 1 : -1,
      };
      speed = (150 + blocks.length * 7) * CFG.speedMul;
      speed = Math.min(speed, 460);
    }
    function place() {
      var t = top();
      var over = Math.min(cur.x + cur.w, t.x + t.w) - Math.max(cur.x, t.x);
      if (over <= 0) {
        /* missed completely: lose a life */
        if (hurt(34)) {
          blocks.push({ x: cur.x, w: cur.w, y: cur.y });
          shake = 0.6; SFX.boom();
          burst(cur.x + cur.w / 2, cur.y, 18, THEME.rose, 180, 0.5);
          resetCombo();
          if (lives <= 0 && health <= 0) { setState("GAMEOVER"); return; }
          /* the block is lost: shrink the tower width slightly so the run is recoverable */
          cur.w = Math.max(bw * 0.45, cur.w * 0.92);
        }
      } else {
        var dx = cur.x - t.x;
        var absDx = Math.abs(dx);
        blocks.push({ x: cur.x, w: over, y: cur.y });
        if (absDx < 5) {
          perfect++;
          addCombo();
          addScore(60 + perfect * 12, cur.x + cur.w / 2, cur.y - 20, STR.powers.coin ? "" : "");
          floatText(W / 2, cur.y - 46, "PERFECT x" + perfect, THEME.gold);
          SFX.power();
          flash = 0.35;
        } else {
          perfect = 0;
          addScore(20 + Math.round(over / 8), cur.x + cur.w / 2, cur.y - 18);
          SFX.coin();
        }
        bestH = Math.max(bestH, blocks.length);
        if (blocks.length % 10 === 0) { bumpLevel(1); speed = Math.min(speed * 1.06, 520); }
        if (CFG.powerups && perfect >= 3) {
          power = "shield"; powerTimer = 10;
          SFX.power();
          floatText(W / 2, cur.y - 70, STR.powers.shield, THEME.aqua);
        }
      }
      spawnBlock();
      paintHud();
    }
    function update(dt) {
      runTime += dt;
      if (!started) {
        if (jumpPressed() || touch.tap) { started = true; SFX.click(); }
        paintHud();
        return;
      }
      cur.x += cur.dir * speed * dt;
      var limit = W + bw + 40;
      if (cur.x > limit || cur.x + cur.w < -40) {
        /* bounced off the edge: for endless towers it wraps, otherwise it hurts */
        if (CFG.endless) {
          cur.dir *= -1;
          SFX.swap();
        } else {
          if (hurt(20)) {
            resetCombo();
            spawnBlock();
            if (lives <= 0 && health <= 0) { setState("GAMEOVER"); return; }
          }
        }
      }
      if (jumpPressed() || touch.tap || tapPad("act")) place();
      /* camera follows the tower */
      var targetCam = Math.max(0, top().y - H * 0.62);
      camY = lerp(camY, targetCam, clamp(dt * 6, 0, 1));
      if (powerTimer > 0) { powerTimer -= dt; if (powerTimer <= 0) { power = null; paintHud(); } }
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
      addScore(dt * 3);
      paintHud();
    }
    function drawBlock(b, i, t) {
      var y = b.y - camY;
      if (y < -80 || y > H + 80) return;
      var hue = (i * 7) % 360;
      ctx.save();
      var g = ctx.createLinearGradient(b.x, y, b.x + b.w, y + bh);
      g.addColorStop(0, i % 2 === 0 ? THEME.hero0 : THEME.accent);
      g.addColorStop(1, i % 2 === 0 ? THEME.hero1 : THEME.brick1);
      ctx.fillStyle = g;
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = i === blocks.length - 1 ? 16 : 6;
      roundRect(b.x, y, b.w, bh, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 1.2;
      roundRect(b.x, y, b.w, bh, 6); ctx.stroke();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = THEME.text;
      ctx.fillRect(b.x + 4, y + 3, b.w - 8, 2);
      ctx.globalAlpha = 1;
      ctx.restore();
      void hue; void t;
    }
    function draw(t) {
      var baseY = H * 0.78 - camY;
      /* base pillar */
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = THEME.brick0;
      ctx.fillRect(blocks[0].x + blocks[0].w / 2 - 6, baseY, 12, H);
      ctx.restore();
      for (var i = 0; i < blocks.length; i++) drawBlock(blocks[i], i, t);
      /* moving block */
      if (cur) {
        var cy = cur.y - camY;
        ctx.save();
        ctx.shadowColor = THEME.gold; ctx.shadowBlur = 18;
        var g2 = ctx.createLinearGradient(cur.x, cy, cur.x + cur.w, cy + bh);
        g2.addColorStop(0, THEME.gold); g2.addColorStop(1, THEME.aqua);
        ctx.fillStyle = g2;
        roundRect(cur.x, cy, cur.w, bh, 6);
        ctx.fill();
        ctx.restore();
        /* drop guide */
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = THEME.accent;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.moveTo(cur.x + cur.w / 2, cy + bh);
        ctx.lineTo(cur.x + cur.w / 2, H);
        ctx.stroke();
        ctx.restore();
      }
      /* height meter */
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "900 " + Math.round(clamp(W * 0.09, 26, 48)) + "px " + FONT;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = THEME.text;
      ctx.fillText(String(blocks.length - 1), W / 2, H * 0.3);
      ctx.globalAlpha = 1;
      if (!started) {
        ctx.font = "800 " + Math.round(clamp(W * 0.04, 14, 22)) + "px " + FONT;
        ctx.fillStyle = THEME.gold;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6);
        ctx.fillText(STR.tapLaunch, W / 2, H * 0.42);
        ctx.globalAlpha = 1;
      }
      if (perfect > 1) {
        ctx.font = "900 " + Math.round(clamp(W * 0.05, 15, 24)) + "px " + FONT;
        ctx.fillStyle = THEME.gold;
        ctx.fillText("PERFECT x" + perfect, W / 2, H * 0.2);
      }
    }
    function drawIdle(t) {
      for (var i = 0; i < 5; i++) {
        var y = H * 0.78 - i * (bh + 2);
        var w = bw * (1 - i * 0.06);
        var x = W / 2 - w / 2 + Math.sin(t * 2 + i * 0.7) * 8;
        ctx.fillStyle = i % 2 === 0 ? THEME.hero0 : THEME.accent;
        roundRect(x, y, w, bh, 6); ctx.fill();
      }
    }
    function revive() { spawnBlock(); }
    function help() { return STR.help.stack; }
    function starScore() { return 30; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore, revive: revive };
  }
