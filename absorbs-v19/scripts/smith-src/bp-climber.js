
  /* ══ BLUEPRINT 5 — CLIMBER: vertical jump, springs, moving platforms ══ */
  function bpClimber() {
    var px, py, vx, vy, plats, height, bestHeight, camY, springs, monsters, jetpack;
    function reset() {
      maxHealth = 100; health = 100; lives = 1;
      px = W / 2; py = H * 0.7; vx = 0; vy = 0; camY = 0;
      height = 0; bestHeight = 0; springs = 0; monsters = 0; jetpack = 0;
      plats = [];
      for (var i = 0; i < 26; i++) {
        plats.push(makePlat(H * 0.78 - i * (H * 0.085), i));
      }
      plats.push({ x: W / 2, y: H * 0.86, w: W * 0.6, k: "static", ph: 0, used: true });
    }
    function makePlat(y, idx) {
      var r = R();
      var k = "static";
      if (idx > 3) {
        if (r < 0.16) k = "moving";
        else if (r < 0.26) k = "break";
        else if (r < 0.34) k = "spring";
        else if (r < 0.4 && level >= 3) k = "monster";
        else if (r < 0.44 && CFG.powerups) k = "jet";
      }
      return { x: rnd(W * 0.12, W * 0.88), y: y, w: rnd(W * 0.14, W * 0.24), k: k, ph: rnd(0, TAU), used: false, dead: 0 };
    }
    function update(dt) {
      runTime += dt;
      var sp = 300 * CFG.speedMul;
      if (left()) vx = lerp(vx, -sp, 0.25);
      else if (right()) vx = lerp(vx, sp, 0.25);
      else vx = lerp(vx, 0, 0.12);
      if (touch.active && touch.hold) {
        var d = touch.x - px;
        vx = clamp(d * 6, -sp, sp);
      }
      px += vx * dt;
      if (px < 10) { px = 10; vx = Math.abs(vx) * 0.4; }
      if (px > W - 10) { px = W - 10; vx = -Math.abs(vx) * 0.4; }
      var grav = jetpack > 0 ? 420 : 1500;
      vy += grav * dt;
      if (jetpack > 0) { vy = Math.min(vy, -260); jetpack -= dt; burst(px, py + 14, 2, THEME.gold, 90, 0.4); }
      py += vy * dt;
      /* platform collisions (only when falling) */
      if (vy > 0) {
        for (var i = 0; i < plats.length; i++) {
          var p = plats[i];
          if (p.dead > 0) continue;
          if (px > p.x - p.w / 2 - 12 && px < p.x + p.w / 2 + 12 && py > p.y - 12 && py < p.y + 16) {
            py = p.y - 8;
            if (p.k === "spring") { vy = -1180 * CFG.speedMul; SFX.jump(); springs++; addScore(30, px, py - 30, ""); burst(px, py, 14, THEME.aqua, 200, 0.5); }
            else if (p.k === "jet") { jetpack = 2.4; vy = -520; SFX.power(); floatText(px, py - 30, STR.powers.jet, THEME.gold); p.dead = 1; }
            else if (p.k === "monster") { vy = -720 * CFG.speedMul; monsters++; hurt(12); p.dead = 1; burst(px, py, 18, THEME.rose, 200, 0.6); }
            else { vy = -700 * CFG.speedMul; SFX.jump(); if (p.k === "break") { p.dead = 1; burst(p.x, p.y, 12, THEME.brick1, 160, 0.5); } }
            p.used = true;
            if (p.k === "moving") p.ph += 0;
          }
        }
      }
      /* moving platforms */
      for (var m = 0; m < plats.length; m++) {
        var q = plats[m];
        if (q.k === "moving") q.x += Math.sin(now() * 0.0012 + q.ph) * 70 * dt;
        if (q.dead > 0) q.dead += dt;
      }
      /* camera & height */
      if (py < H * 0.42) {
        var delta = H * 0.42 - py;
        py += delta; camY += delta;
        height += delta;
        addScore(delta * 0.35);
        for (var s = 0; s < plats.length; s++) plats[s].y += delta;
      }
      bestHeight = Math.max(bestHeight, height);
      /* recycle platforms above */
      for (var r = plats.length - 1; r >= 0; r--) {
        if (plats[r].y > H + 40) {
          plats.splice(r, 1);
          plats.unshift(makePlat(-rnd(20, 90), level + plats.length));
        }
      }
      if (height > level * 1400) bumpLevel(1);
      if (py > H + 60) { health = 0; lives = 0; paintHud(); setState("GAMEOVER"); }
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
      paintHud();
    }
    function draw(t) {
      for (var i = 0; i < plats.length; i++) {
        var p = plats[i];
        if (p.dead > 0 && p.k !== "monster") continue;
        ctx.save();
        var col = p.k === "spring" ? THEME.aqua : p.k === "break" ? THEME.brick1 : p.k === "monster" ? THEME.rose : p.k === "jet" ? THEME.gold : THEME.hero1;
        ctx.fillStyle = col;
        ctx.shadowColor = col; ctx.shadowBlur = p.k === "static" ? 6 : 16;
        roundRect(p.x - p.w / 2, p.y, p.w, 11, 6); ctx.fill();
        ctx.shadowBlur = 0;
        if (p.k === "spring") {
          ctx.strokeStyle = THEME.text; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y - 3, 6, Math.PI, TAU); ctx.stroke();
        }
        if (p.k === "monster") {
          ctx.fillStyle = THEME.text;
          ctx.beginPath(); ctx.arc(p.x - 8, p.y - 6, 3, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(p.x + 8, p.y - 6, 3, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      /* hero */
      ctx.save();
      ctx.translate(px, py - 16);
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 20;
      var g = ctx.createLinearGradient(0, -18, 0, 18);
      g.addColorStop(0, THEME.hero0); g.addColorStop(1, THEME.hero1);
      ctx.fillStyle = g;
      roundRect(-13, -18, 26, 34, 9); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = THEME.text;
      ctx.fillRect(-8, -11, 5, 5); ctx.fillRect(3, -11, 5, 5);
      if (jetpack > 0) {
        ctx.fillStyle = THEME.gold; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(-8, 16); ctx.lineTo(0, 34 + Math.sin(t * 30) * 6); ctx.lineTo(8, 16); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      /* height meter */
      ctx.save();
      ctx.textAlign = "right"; ctx.textBaseline = "top";
      ctx.fillStyle = THEME.dim; ctx.font = "700 12px " + FONT;
      ctx.fillText(STR.height + ": " + Math.round(bestHeight / 10) + " m", W - 14, H * 0.13);
      ctx.restore();
    }
    function drawIdle(t) {
      for (var i = 0; i < 4; i++) {
        var y = H * 0.62 - i * H * 0.07 + Math.sin(t * 2 + i) * 6;
        ctx.fillStyle = i % 2 ? THEME.hero1 : THEME.aqua;
        roundRect(W * 0.3 + i * W * 0.11, y, W * 0.16, 10, 5); ctx.fill();
      }
      ctx.save();
      ctx.translate(W * 0.5, H * 0.42 + Math.sin(t * 2.6) * 16);
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 24;
      var g = ctx.createLinearGradient(0, -20, 0, 20);
      g.addColorStop(0, THEME.hero0); g.addColorStop(1, THEME.hero1);
      ctx.fillStyle = g; roundRect(-14, -20, 28, 38, 10); ctx.fill();
      ctx.restore();
    }
    function help() { return STR.help.climber; }
    function starScore() { return 800; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore };
  }
