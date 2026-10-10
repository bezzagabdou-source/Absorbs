
  /* ══ BLUEPRINT 4 — SHOOTER: waves, 4 enemy behaviours, boss every 5 ═══ */
  function bpShooter() {
    var ship, shots, foes, foeShots, stars, wave, waveT, spawnLeft, boss, weapon, weaponT, iFrames;
    function reset() {
      maxHealth = 100; health = 100; lives = 3;
      ship = { x: W / 2, y: H * 0.84, r: 16, cool: 0 };
      shots = []; foes = []; foeShots = []; boss = null;
      weapon = 1; weaponT = 0; iFrames = 1.2;
      wave = 0; waveT = 0.8; spawnLeft = 0;
      stars = [];
      for (var i = 0; i < 70; i++) stars.push({ x: rnd(0, W), y: rnd(0, H), s: rnd(40, 220), r: rnd(0.6, 2) });
      nextWave();
    }
    function nextWave() {
      wave++;
      level = wave;
      var hl = document.getElementById("nx-level"); if (hl) hl.textContent = String(level);
      if (CFG.boss !== false && wave % 5 === 0) { spawnBoss(); return; }
      spawnLeft = 5 + wave * 2;
      waveT = 0.5;
      SFX.level();
      floatText(W / 2, H * 0.3, STR.wave + " " + wave, THEME.gold);
    }
    function spawnBoss() {
      SFX.level(); flash = 0.8; shake = 0.8;
      boss = { x: W / 2, y: -90, ty: H * 0.2, hp: 120 + wave * 40, max: 120 + wave * 40, r: 54, t: 0, phase: 1, cool: 1.4 };
      floatText(W / 2, H * 0.34, STR.boss, THEME.rose);
      spawnLeft = 0;
    }
    function spawnFoe() {
      var kinds = ["drone", "zig", "shooter"];
      if (wave >= 3) kinds.push("tank");
      if (wave >= 6) kinds.push("kamikaze");
      var k = pick(kinds);
      var f = { k: k, x: rnd(30, W - 30), y: -30, r: k === "tank" ? 22 : 15, t: rnd(0, TAU), hp: k === "tank" ? 5 : k === "shooter" ? 2 : 1, cool: rnd(1, 2.4) };
      f.vy = (k === "tank" ? 46 : k === "kamikaze" ? 150 : 74) * CFG.speedMul * (1 + wave * 0.05);
      foes.push(f);
    }
    function update(dt) {
      runTime += dt;
      if (iFrames > 0) iFrames -= dt;
      if (weaponT > 0) { weaponT -= dt; if (weaponT <= 0) weapon = 1; }
      /* ship */
      var sp = 340 * CFG.speedMul;
      if (left()) ship.x -= sp * dt;
      if (right()) ship.x += sp * dt;
      if (keys.arrowup || keys.w || pad("up")) ship.y -= sp * dt;
      if (downHeld()) ship.y += sp * dt;
      if (touch.active && touch.hold) {
        ship.x = lerp(ship.x, touch.x, 0.3);
        ship.y = lerp(ship.y, Math.min(touch.y + 40, H * 0.92), 0.22);
      }
      ship.x = clamp(ship.x, 20, W - 20);
      ship.y = clamp(ship.y, H * 0.35, H - 26);
      ship.cool -= dt;
      if ((keys[" "] || pad("act") || touch.hold || CFG.autofire) && ship.cool <= 0) {
        ship.cool = weapon >= 3 ? 0.11 : weapon === 2 ? 0.15 : 0.19;
        SFX.shoot();
        shots.push({ x: ship.x, y: ship.y - 18, vx: 0, vy: -640, r: 4 });
        if (weapon >= 2) { shots.push({ x: ship.x - 12, y: ship.y - 10, vx: -70, vy: -600, r: 3.5 }); shots.push({ x: ship.x + 12, y: ship.y - 10, vx: 70, vy: -600, r: 3.5 }); }
        if (weapon >= 3) { shots.push({ x: ship.x - 20, y: ship.y - 4, vx: -160, vy: -540, r: 3 }); shots.push({ x: ship.x + 20, y: ship.y - 4, vx: 160, vy: -540, r: 3 }); }
      }
      /* waves */
      if (!boss && spawnLeft > 0) {
        waveT -= dt;
        if (waveT <= 0) { spawnFoe(); spawnLeft--; waveT = clamp(0.9 - wave * 0.045, 0.22, 0.9); }
      }
      if (!boss && spawnLeft <= 0 && foes.length === 0) nextWave();
      /* shots */
      for (var i = shots.length - 1; i >= 0; i--) {
        var s = shots[i];
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.y < -20 || s.x < -20 || s.x > W + 20) { shots.splice(i, 1); continue; }
        var hitSomething = false;
        for (var f = foes.length - 1; f >= 0; f--) {
          var fo = foes[f];
          if (Math.hypot(s.x - fo.x, s.y - fo.y) < fo.r + s.r) {
            fo.hp--; shots.splice(i, 1); hitSomething = true;
            burst(s.x, s.y, 6, THEME.gold, 150, 0.35);
            if (fo.hp <= 0) {
              killFoe(fo, f);
            } else SFX.tick();
            break;
          }
        }
        if (hitSomething) continue;
        if (boss && Math.hypot(s.x - boss.x, s.y - boss.y) < boss.r + s.r) {
          boss.hp--; shots.splice(i, 1);
          burst(s.x, s.y, 7, THEME.rose, 170, 0.4); SFX.tick();
          if (boss.hp <= boss.max * 0.5 && boss.phase === 1) { boss.phase = 2; SFX.boom(); shake = 0.9; floatText(boss.x, boss.y, STR.phase2, THEME.rose); }
          if (boss.hp <= 0) {
            addScore(600 + wave * 60, boss.x, boss.y, "");
            burst(boss.x, boss.y, 90, THEME.gold, 420, 1.4);
            SFX.boom(); shake = 1.4; flash = 1;
            boss = null;
            weapon = 3; weaponT = 14;
            nextWave();
          }
        }
      }
      /* foes */
      for (var g = foes.length - 1; g >= 0; g--) {
        var e = foes[g];
        e.t += dt;
        if (e.k === "zig") e.x += Math.sin(e.t * 3.2) * 120 * dt;
        if (e.k === "kamikaze") {
          e.x = lerp(e.x, ship.x, 0.9 * dt);
          e.vy = Math.min(e.vy + 120 * dt, 420 * CFG.speedMul);
        }
        e.y += e.vy * dt;
        if (e.k === "shooter") {
          e.cool -= dt;
          if (e.cool <= 0 && e.y > 0 && e.y < H * 0.7) {
            e.cool = clamp(2.2 - wave * 0.08, 0.9, 2.2);
            var a = Math.atan2(ship.y - e.y, ship.x - e.x);
            foeShots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, r: 5 });
          }
        }
        if (e.y > H + 40) { foes.splice(g, 1); resetCombo(); continue; }
        if (iFrames <= 0 && Math.hypot(e.x - ship.x, e.y - ship.y) < e.r + ship.r - 4) {
          foes.splice(g, 1);
          burst(ship.x, ship.y, 30, THEME.rose, 260, 0.8);
          resetCombo(); iFrames = 1.2; hurt(34);
        }
      }
      /* boss */
      if (boss) {
        boss.t += dt;
        boss.y = lerp(boss.y, boss.ty, 0.04);
        boss.x = W / 2 + Math.sin(boss.t * (boss.phase === 2 ? 1.5 : 0.8)) * (W * 0.28);
        boss.cool -= dt;
        if (boss.cool <= 0) {
          boss.cool = boss.phase === 2 ? 0.55 : 0.95;
          var n = boss.phase === 2 ? 7 : 5;
          for (var q = 0; q < n; q++) {
            var ang = Math.PI * 0.25 + (Math.PI * 0.5) * (q / (n - 1));
            foeShots.push({ x: boss.x, y: boss.y + boss.r * 0.6, vx: Math.cos(ang) * 210, vy: Math.sin(ang) * 210, r: 6 });
          }
          SFX.shoot();
        }
        if (iFrames <= 0 && Math.hypot(boss.x - ship.x, boss.y - ship.y) < boss.r + ship.r) {
          iFrames = 1.2; hurt(45); burst(ship.x, ship.y, 26, THEME.rose, 240, 0.8);
        }
      }
      /* enemy shots */
      for (var h = foeShots.length - 1; h >= 0; h--) {
        var es = foeShots[h];
        es.x += es.vx * dt; es.y += es.vy * dt;
        if (es.y > H + 20 || es.y < -20 || es.x < -20 || es.x > W + 20) { foeShots.splice(h, 1); continue; }
        if (iFrames <= 0 && Math.hypot(es.x - ship.x, es.y - ship.y) < es.r + ship.r - 5) {
          foeShots.splice(h, 1); iFrames = 1.2; resetCombo(); hurt(22);
          burst(ship.x, ship.y, 18, THEME.rose, 200, 0.6);
        }
      }
      /* stars */
      for (var z = 0; z < stars.length; z++) {
        stars[z].y += stars[z].s * dt;
        if (stars[z].y > H) { stars[z].y = -4; stars[z].x = rnd(0, W); }
      }
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
      addScore(dt * 6);
      paintHud();
    }
    function killFoe(fo, idx) {
      foes.splice(idx, 1);
      addCombo();
      addScore(fo.k === "tank" ? 90 : fo.k === "shooter" ? 60 : 40, fo.x, fo.y, "");
      burst(fo.x, fo.y, 22, THEME.accent, 240, 0.7);
      SFX.boom(); shake = Math.max(shake, 0.25);
      if (CFG.powerups && R() < 0.14) {
        var k = pick(["weapon", "heal", "shield", "coin"]);
        foes.push({ k: "drop", drop: k, x: fo.x, y: fo.y, r: 13, t: 0, hp: 1, vy: 90 });
      }
    }
    function draw(t) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      for (var i = 0; i < stars.length; i++) {
        ctx.globalAlpha = clamp(stars[i].s / 240, 0.2, 0.9);
        ctx.fillRect(stars[i].x, stars[i].y, stars[i].r, stars[i].r * 2.4);
      }
      ctx.globalAlpha = 1;
      /* shots */
      for (var s = 0; s < shots.length; s++) {
        var sh = shots[s];
        ctx.save();
        ctx.shadowColor = THEME.gold; ctx.shadowBlur = 14;
        ctx.fillStyle = THEME.gold;
        roundRect(sh.x - sh.r / 2, sh.y - sh.r * 2.4, sh.r, sh.r * 4.4, sh.r / 2); ctx.fill();
        ctx.restore();
      }
      for (var fs = 0; fs < foeShots.length; fs++) {
        var es = foeShots[fs];
        ctx.save();
        ctx.shadowColor = THEME.rose; ctx.shadowBlur = 16;
        ctx.fillStyle = THEME.rose;
        ctx.beginPath(); ctx.arc(es.x, es.y, es.r, 0, TAU); ctx.fill();
        ctx.restore();
      }
      /* foes */
      for (var f = 0; f < foes.length; f++) {
        var e = foes[f];
        ctx.save();
        ctx.translate(e.x, e.y);
        if (e.k === "drop") {
          ctx.rotate(t * 3);
          ctx.fillStyle = e.drop === "heal" ? THEME.aqua : e.drop === "weapon" ? THEME.gold : THEME.accent;
          ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18;
          roundRect(-e.r, -e.r, e.r * 2, e.r * 2, 6); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.font = "900 13px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(e.drop === "heal" ? "+" : e.drop === "weapon" ? "W" : e.drop === "shield" ? "S" : "$", 0, 1);
          ctx.restore();
          /* collect */
          if (Math.hypot(e.x - ship.x, e.y - ship.y) < e.r + ship.r + 6) {
            foes.splice(f, 1); f--;
            SFX.power(); flash = 0.3;
            if (e.drop === "heal") { health = clamp(health + 30, 0, maxHealth); floatText(ship.x, ship.y - 40, STR.powers.heal, THEME.aqua); }
            else if (e.drop === "weapon") { weapon = Math.min(3, weapon + 1); weaponT = 16; floatText(ship.x, ship.y - 40, STR.powers.weapon + " " + weapon, THEME.gold); }
            else if (e.drop === "shield") { power = "shield"; powerTimer = 10; floatText(ship.x, ship.y - 40, STR.powers.shield, THEME.aqua); }
            else { coins += 3; addScore(50, ship.x, ship.y - 40, ""); }
            paintHud();
          }
          continue;
        }
        var col = e.k === "tank" ? THEME.brick1 : e.k === "shooter" ? THEME.accent : e.k === "kamikaze" ? THEME.rose : THEME.hero1;
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 16;
        ctx.beginPath();
        if (e.k === "tank") { ctx.moveTo(-e.r, -e.r * 0.5); ctx.lineTo(e.r, -e.r * 0.5); ctx.lineTo(e.r * 0.6, e.r); ctx.lineTo(-e.r * 0.6, e.r); }
        else if (e.k === "zig") { ctx.moveTo(0, e.r); ctx.lineTo(e.r, -e.r * 0.7); ctx.lineTo(0, -e.r * 0.2); ctx.lineTo(-e.r, -e.r * 0.7); }
        else { ctx.moveTo(0, e.r); ctx.lineTo(e.r * 0.9, -e.r * 0.8); ctx.lineTo(-e.r * 0.9, -e.r * 0.8); }
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath(); ctx.arc(0, -e.r * 0.15, e.r * 0.2, 0, TAU); ctx.fill();
        ctx.restore();
      }
      /* boss */
      if (boss) {
        ctx.save();
        ctx.translate(boss.x, boss.y);
        var bg = ctx.createRadialGradient(0, 0, 6, 0, 0, boss.r * 1.3);
        bg.addColorStop(0, THEME.rose); bg.addColorStop(1, THEME.brick1);
        ctx.fillStyle = bg; ctx.shadowColor = THEME.rose; ctx.shadowBlur = 34;
        ctx.beginPath();
        for (var p = 0; p < 8; p++) {
          var a = (p / 8) * TAU + t * 0.6;
          var rr = boss.r * (p % 2 === 0 ? 1 : 0.72);
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath(); ctx.arc(0, 0, boss.r * 0.34, 0, TAU); ctx.fill();
        ctx.fillStyle = THEME.gold;
        ctx.beginPath(); ctx.arc(0, 0, boss.r * 0.18 * (1 + Math.sin(t * 6) * 0.12), 0, TAU); ctx.fill();
        ctx.restore();
        /* boss bar */
        var bw = W * 0.7, bx = (W - bw) / 2, by = H * 0.06;
        roundRect(bx, by, bw, 9, 5); ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fill();
        roundRect(bx, by, bw * clamp(boss.hp / boss.max, 0, 1), 9, 5); ctx.fillStyle = THEME.rose; ctx.fill();
        ctx.fillStyle = THEME.dim; ctx.font = "700 11px " + FONT; ctx.textAlign = "center";
        ctx.fillText(STR.boss, W / 2, by - 8);
      }
      /* ship */
      ctx.save();
      ctx.translate(ship.x, ship.y);
      if (iFrames > 0) ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(t * 22));
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 22;
      var sg = ctx.createLinearGradient(0, -20, 0, 18);
      sg.addColorStop(0, THEME.hero0); sg.addColorStop(1, THEME.hero1);
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(14, 12); ctx.lineTo(0, 5); ctx.lineTo(-14, 12); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      /* engine flame */
      ctx.fillStyle = THEME.gold;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 30);
      ctx.beginPath(); ctx.moveTo(-5, 12); ctx.lineTo(0, 22 + Math.sin(t * 26) * 5); ctx.lineTo(5, 12); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      if (power === "shield") {
        ctx.strokeStyle = THEME.aqua; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 7);
        ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    function drawIdle(t) {
      ctx.save();
      ctx.translate(W / 2, H * 0.4 + Math.sin(t * 1.8) * 8);
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 26;
      var sg = ctx.createLinearGradient(0, -34, 0, 30);
      sg.addColorStop(0, THEME.hero0); sg.addColorStop(1, THEME.hero1);
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(24, 20); ctx.lineTo(0, 9); ctx.lineTo(-24, 20); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    function help() { return STR.help.shooter; }
    function starScore() { return 1500; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore };
  }
