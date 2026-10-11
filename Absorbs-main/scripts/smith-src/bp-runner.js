
  /* ══ BLUEPRINT 1 — RUNNER: endless 3-lane dash, jump + double jump ═══ */
  function bpRunner() {
    var groundY, px, py, vy, onGround, jumps, duck, speed, dist, spawnT, obs, pickups, decor, trail;
    var laneAnim = 0;
    function reset() {
      groundY = H * 0.78; px = W * 0.24; py = groundY; vy = 0; onGround = true; jumps = 0;
      duck = 0; dist = 0; spawnT = 0.6; obs = []; pickups = []; decor = []; trail = [];
      speed = 240 * CFG.speedMul; laneAnim = 0;
      for (var i = 0; i < 14; i++) decor.push({ x: rnd(0, W), y: rnd(H * 0.35, groundY - 10), s: rnd(0.4, 1.4), t: rint(0, 2) });
      maxHealth = 100; health = 100; lives = 3;
    }
    function jumpPower() { return CFG.difficulty === "easy" ? 620 : CFG.difficulty === "hard" ? 540 : 575; }
    function spawn() {
      var kinds = ["crate", "spike", "bird", "double"];
      if (level >= 3) kinds.push("wall");
      var k = pick(kinds);
      var gap = clamp(340 - level * 12, 190, 340);
      if (k === "bird") obs.push({ k: k, x: W + 60, y: groundY - rnd(70, 110), w: 42, h: 30, ph: rnd(0, TAU) });
      else if (k === "wall") obs.push({ k: k, x: W + 60, y: groundY, w: 26, h: rnd(90, 130) });
      else if (k === "double") {
        obs.push({ k: "crate", x: W + 60, y: groundY, w: 34, h: 34 });
        obs.push({ k: "spike", x: W + 60 + gap * 0.45, y: groundY, w: 34, h: 30 });
      } else obs.push({ k: k, x: W + 60, y: groundY, w: k === "spike" ? 40 : 34, h: k === "spike" ? 30 : 34 });
      if (CFG.powerups && R() < 0.42) {
        var pk = pick(["coin", "coin", "coin", "shield", "magnet", "slow", "boost"]);
        pickups.push({ k: pk, x: W + rnd(140, 320), y: groundY - rnd(40, 150), r: pk === "coin" ? 11 : 15, t: 0, got: false });
      }
    }
    function update(dt) {
      var mul = power === "slow" ? 0.62 : power === "boost" ? 1.45 : 1;
      speed = (240 + level * 16) * CFG.speedMul * mul;
      dist += speed * dt;
      if (dist > 900) { dist -= 900; bumpLevel(1); }
      runTime += dt; levelTime += dt;

      if (jumpPressed()) {
        var maxJ = CFG.difficulty === "easy" ? 3 : 2;
        if (jumps < maxJ) {
          vy = -jumpPower() * (jumps === 0 ? 1 : 0.88);
          jumps++; onGround = false; SFX.jump();
          burst(px, py, 10, THEME.aqua, 130, 0.4);
        }
      }
      duck = downHeld() ? Math.min(1, duck + dt * 7) : Math.max(0, duck - dt * 7);
      vy += 1750 * dt;
      py += vy * dt;
      if (py >= groundY) { py = groundY; vy = 0; if (!onGround) burst(px, groundY, 8, THEME.dim, 90, 0.3); onGround = true; jumps = 0; }

      spawnT -= dt * (0.7 + level * 0.05);
      if (spawnT <= 0) { spawn(); spawnT = rnd(0.62, 1.15) * (CFG.difficulty === "insane" ? 0.7 : 1); }

      for (var i = obs.length - 1; i >= 0; i--) {
        var o = obs[i];
        o.x -= speed * dt;
        if (o.k === "bird") o.y = groundY - 84 + Math.sin(now() * 0.004 + o.ph) * 22;
        if (o.x < -80) { obs.splice(i, 1); addCombo(); addScore(6, px, py - 60); continue; }
        var ph = duck > 0.5 ? 22 : 46;
        if (o.x < px + 18 && o.x + o.w > px - 18) {
          var top = o.k === "bird" ? o.y - o.h : o.y - o.h;
          if (py - ph < o.y && py > top - 4) {
            if (hurt(34)) { obs.splice(i, 1); burst(px, py - 20, 26, THEME.rose, 240, 0.7); resetCombo(); }
          }
        }
      }
      for (var j = pickups.length - 1; j >= 0; j--) {
        var p = pickups[j];
        p.x -= speed * dt; p.t += dt;
        if (power === "magnet" && Math.abs(p.x - px) < 190 && !p.got) {
          p.x = lerp(p.x, px, 0.14); p.y = lerp(p.y, py - 24, 0.14);
        }
        if (p.x < -40) { pickups.splice(j, 1); continue; }
        var dx = p.x - px, dy = p.y - (py - 24);
        if (dx * dx + dy * dy < (p.r + 20) * (p.r + 20)) {
          pickups.splice(j, 1);
          if (p.k === "coin") { coins++; addScore(14, p.x, p.y, ""); SFX.coin(); burst(p.x, p.y, 10, THEME.gold, 150, 0.5); }
          else { power = p.k; powerTimer = p.k === "shield" ? 9 : 6.5; SFX.power(); flash = 0.5; floatText(p.x, p.y, STR.powers[p.k] || p.k, THEME.aqua); }
          paintHud();
        }
      }
      for (var d = 0; d < decor.length; d++) {
        decor[d].x -= speed * dt * (0.22 + decor[d].s * 0.2);
        if (decor[d].x < -30) { decor[d].x = W + rnd(10, 120); decor[d].y = rnd(H * 0.3, groundY - 20); }
      }
      if (powerTimer > 0) { powerTimer -= dt; if (powerTimer <= 0) { power = null; paintHud(); } }
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
      trail.push({ x: px, y: py - 22, t: 0 });
      if (trail.length > 16) trail.shift();
      for (var q = 0; q < trail.length; q++) trail[q].t += dt;
      addScore(dt * 12);
      paintHud();
    }
    function draw(t) {
      groundY = H * 0.78;
      /* ground */
      var gg = ctx.createLinearGradient(0, groundY, 0, H);
      gg.addColorStop(0, THEME.hill2); gg.addColorStop(1, THEME.sky2);
      ctx.fillStyle = gg; ctx.fillRect(0, groundY, W, H - groundY);
      ctx.strokeStyle = THEME.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();
      ctx.globalAlpha = 0.22; ctx.lineWidth = 1;
      for (var s = 0; s < 12; s++) {
        var sx = ((s * 70 - (t * speed * 0.9) % 70) + 70) % (W + 70) - 35;
        ctx.beginPath(); ctx.moveTo(sx, groundY); ctx.lineTo(sx - 26, H); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      /* decor */
      for (var d = 0; d < decor.length; d++) {
        var o = decor[d];
        ctx.globalAlpha = 0.25 + o.s * 0.2;
        ctx.fillStyle = o.t === 0 ? THEME.accent : o.t === 1 ? THEME.gold : THEME.aqua;
        if (o.t === 2) { ctx.fillRect(o.x, o.y, 3 * o.s, 16 * o.s); }
        else { ctx.beginPath(); ctx.arc(o.x, o.y, 3 * o.s, 0, TAU); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      /* trail */
      for (var q = 0; q < trail.length; q++) {
        var tr = trail[q], a = 1 - q / trail.length;
        ctx.globalAlpha = a * 0.28;
        ctx.fillStyle = THEME.aqua;
        ctx.beginPath(); ctx.arc(tr.x, tr.y, 12 * a, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      /* obstacles */
      for (var i = 0; i < obs.length; i++) {
        var ob = obs[i];
        ctx.save();
        if (ob.k === "bird") {
          ctx.fillStyle = THEME.rose;
          ctx.beginPath();
          ctx.moveTo(ob.x - ob.w / 2, ob.y);
          ctx.lineTo(ob.x, ob.y - 12 - Math.sin(t * 14 + ob.ph) * 7);
          ctx.lineTo(ob.x + ob.w / 2, ob.y);
          ctx.lineTo(ob.x, ob.y + 10);
          ctx.closePath(); ctx.fill();
          ctx.shadowColor = THEME.rose; ctx.shadowBlur = 14; ctx.fill();
        } else if (ob.k === "spike") {
          ctx.fillStyle = THEME.rose;
          for (var k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.moveTo(ob.x - ob.w / 2 + k * (ob.w / 3), ob.y);
            ctx.lineTo(ob.x - ob.w / 2 + k * (ob.w / 3) + ob.w / 6, ob.y - ob.h);
            ctx.lineTo(ob.x - ob.w / 2 + (k + 1) * (ob.w / 3), ob.y);
            ctx.closePath(); ctx.fill();
          }
        } else {
          ctx.fillStyle = ob.k === "wall" ? THEME.accent : THEME.rose;
          roundRect(ob.x - ob.w / 2, ob.y - ob.h, ob.w, ob.h, 5);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.restore();
      }
      /* pickups */
      for (var j = 0; j < pickups.length; j++) {
        var p = pickups[j];
        ctx.save();
        ctx.translate(p.x, p.y + Math.sin(t * 4 + p.t) * 4);
        if (p.k === "coin") {
          ctx.fillStyle = THEME.gold; ctx.shadowColor = THEME.gold; ctx.shadowBlur = 16;
          ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,0.28)";
          ctx.font = "900 12px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("$", 0, 1);
        } else {
          ctx.fillStyle = p.k === "shield" ? THEME.aqua : p.k === "magnet" ? THEME.rose : THEME.gold;
          ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18;
          roundRect(-p.r, -p.r, p.r * 2, p.r * 2, 7); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.font = "900 14px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(p.k === "shield" ? "◈" : p.k === "magnet" ? "U" : p.k === "slow" ? "◷" : "»", 0, 1);
        }
        ctx.restore();
      }
      /* hero */
      var hh = duck > 0.5 ? 26 : 46, hw = 26;
      ctx.save();
      ctx.translate(px, py - hh / 2);
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 20;
      var bg = ctx.createLinearGradient(0, -hh / 2, 0, hh / 2);
      bg.addColorStop(0, THEME.hero0); bg.addColorStop(1, THEME.hero1);
      ctx.fillStyle = bg;
      roundRect(-hw / 2, -hh / 2, hw, hh, 8); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = THEME.text;
      ctx.fillRect(-hw / 2 + 5, -hh / 2 + 8, 6, 6);
      ctx.fillRect(hw / 2 - 11, -hh / 2 + 8, 6, 6);
      if (power === "shield") {
        ctx.strokeStyle = THEME.aqua; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 8);
        ctx.beginPath(); ctx.arc(0, 0, hw * 0.95, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      /* legs run cycle */
      ctx.strokeStyle = THEME.hero1; ctx.lineWidth = 5; ctx.lineCap = "round";
      var swing = onGround ? Math.sin(t * 18) * 9 : 6;
      ctx.beginPath(); ctx.moveTo(-4, hh / 2 - 2); ctx.lineTo(-4 + swing, hh / 2 + 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(5, hh / 2 - 2); ctx.lineTo(5 - swing, hh / 2 + 12); ctx.stroke();
      ctx.restore();
      void laneAnim;
    }
    function drawIdle(t) {
      groundY = H * 0.78;
      py = groundY; px = W * 0.5;
      var bounce = Math.abs(Math.sin(t * 2.4)) * 26;
      ctx.save();
      ctx.translate(px, groundY - 24 - bounce);
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 24;
      var bg = ctx.createLinearGradient(0, -24, 0, 24);
      bg.addColorStop(0, THEME.hero0); bg.addColorStop(1, THEME.hero1);
      ctx.fillStyle = bg; roundRect(-14, -24, 28, 48, 9); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = THEME.text;
      ctx.fillRect(-9, -16, 6, 6); ctx.fillRect(3, -16, 6, 6);
      ctx.restore();
    }
    function help() { return STR.help.runner; }
    function starScore() { return 900; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore };
  }
