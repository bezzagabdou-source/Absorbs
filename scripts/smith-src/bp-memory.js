
  /* ══ BLUEPRINT 8 — MEMORY: timed match pairs with combos and levels ═══ */
  function bpMemory() {
    var cols, rows, cards, first, second, lockT, matched, attempts, timeLeft, glyphs;
    var SETS = ["★", "☾", "✦", "⚡", "❖", "✿", "☀", "♛", "⬢", "✺", "❂", "⬟", "♜", "⚘", "☘", "✧", "◈", "❉"];
    function build() {
      var pairs = clamp(4 + level * 2, 4, CFG.difficulty === "easy" ? 10 : 12);
      cols = pairs <= 6 ? 4 : pairs <= 8 ? 4 : pairs <= 10 ? 5 : 6;
      rows = Math.ceil((pairs * 2) / cols);
      var chosen = [];
      for (var i = 0; i < SETS.length; i++) chosen.push(SETS[i]);
      /* deterministic shuffle */
      for (var s = chosen.length - 1; s > 0; s--) {
        var j = Math.floor(R() * (s + 1));
        var tmp = chosen[s]; chosen[s] = chosen[j]; chosen[j] = tmp;
      }
      chosen = chosen.slice(0, pairs);
      var deck = [];
      for (var k = 0; k < chosen.length; k++) { deck.push(chosen[k]); deck.push(chosen[k]); }
      for (var d = deck.length - 1; d > 0; d--) {
        var q = Math.floor(R() * (d + 1));
        var t2 = deck[d]; deck[d] = deck[q]; deck[q] = t2;
      }
      cards = [];
      for (var c = 0; c < deck.length; c++) cards.push({ g: deck[c], up: false, done: false, pop: 0 });
      first = -1; second = -1; lockT = 0; matched = 0; attempts = 0;
      timeLeft = CFG.timed === false ? 0 : clamp(28 + pairs * 6 - level * 2, 20, 120);
      glyphs = pairs;
      /* reveal all for 1.6s at the start of a board */
      peek = 1.6;
    }
    var peek = 0;
    function reset() {
      maxHealth = 100; health = 100; lives = 1;
      build();
    }
    function geom() {
      var cw = Math.min((W * 0.88) / cols, (H * 0.56) / rows);
      return { cw: cw, x: (W - cw * cols) / 2, y: H * 0.24 };
    }
    function flip(i) {
      if (lockT > 0 || peek > 0) return;
      var c = cards[i];
      if (!c || c.up || c.done) return;
      c.up = true; c.pop = 1; SFX.swap();
      if (first < 0) { first = i; return; }
      second = i; attempts++;
      lockT = 0.52;
      if (cards[first].g === cards[second].g) {
        cards[first].done = true; cards[second].done = true;
        matched++; addCombo();
        var g = geom();
        var p1 = { x: g.x + (first % cols) * g.cw + g.cw / 2, y: g.y + Math.floor(first / cols) * g.cw + g.cw / 2 };
        burst(p1.x, p1.y, 18, THEME.gold, 200, 0.6);
        addScore(50 + combo * 8, p1.x, p1.y, "");
        SFX.coin();
        first = -1; second = -1; lockT = 0.12;
        if (matched >= glyphs) {
          addScore(150 + level * 40 + (timeLeft > 0 ? Math.round(timeLeft) * 3 : 0), W / 2, H * 0.4, "");
          bumpLevel(1);
          if (CFG.endless === false && level > CFG.levels) { setState("GAMEOVER"); return; }
          build();
        }
      } else {
        resetCombo();
        addScore(2);
      }
    }
    function update(dt) {
      runTime += dt;
      if (peek > 0) peek -= dt;
      if (lockT > 0) {
        lockT -= dt;
        if (lockT <= 0 && first >= 0 && second >= 0) {
          cards[first].up = false; cards[second].up = false;
          first = -1; second = -1;
        }
      }
      for (var i = 0; i < cards.length; i++) if (cards[i].pop > 0) cards[i].pop = Math.max(0, cards[i].pop - dt * 4);
      if (CFG.timed !== false && state === "PLAYING") {
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; health = 0; lives = 0; paintHud(); setState("GAMEOVER"); }
      }
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
      paintHud();
    }
    function draw(t) {
      var g = geom();
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        var x = g.x + (i % cols) * g.cw, y = g.y + Math.floor(i / cols) * g.cw;
        var show = c.up || c.done || peek > 0;
        ctx.save();
        var scale = 1 + c.pop * 0.08;
        ctx.translate(x + g.cw / 2, y + g.cw / 2);
        ctx.scale(scale, scale);
        roundRect(-g.cw * 0.44, -g.cw * 0.44, g.cw * 0.88, g.cw * 0.88, g.cw * 0.14);
        if (show) {
          ctx.fillStyle = c.done ? THEME.hero1 : THEME.accent;
          ctx.shadowColor = c.done ? THEME.glow : THEME.accent; ctx.shadowBlur = c.done ? 20 : 10;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.fillStyle = c.done ? THEME.text : "rgba(10,12,20,0.85)";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.font = "800 " + Math.round(g.cw * 0.4) + "px " + FONT;
          ctx.globalAlpha = peek > 0 && !c.up && !c.done ? clamp(peek / 1.6, 0, 1) : 1;
          ctx.fillText(c.g, 0, 2);
        } else {
          var bg = ctx.createLinearGradient(-g.cw / 2, -g.cw / 2, g.cw / 2, g.cw / 2);
          bg.addColorStop(0, THEME.brick0); bg.addColorStop(1, THEME.brick1);
          ctx.fillStyle = bg; ctx.fill();
          ctx.strokeStyle = THEME.edge; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 2 + i);
          ctx.fillStyle = THEME.gold;
          ctx.font = "900 " + Math.round(g.cw * 0.34) + "px " + FONT;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText("?", 0, 2);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = THEME.dim; ctx.font = "700 " + Math.round(clamp(W * 0.032, 12, 17)) + "px " + FONT;
      var line = STR.pairs + " " + matched + "/" + glyphs;
      if (CFG.timed !== false) line += "   ·   " + STR.time + " " + Math.ceil(timeLeft) + "s";
      ctx.fillText(line, W / 2, H * 0.16);
      ctx.restore();
    }
    function pointer(kind, x, y) {
      if (kind !== "tap" || state !== "PLAYING") return;
      var g = geom();
      var cx = Math.floor((x - g.x) / g.cw), cy = Math.floor((y - g.y) / g.cw);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
      flip(cy * cols + cx);
    }
    function drawIdle(t) {
      var s = W * 0.15;
      for (var i = 0; i < 6; i++) {
        var x = W * 0.2 + (i % 3) * s * 1.2, y = H * 0.34 + Math.floor(i / 3) * s * 1.2;
        ctx.save();
        roundRect(x, y + Math.sin(t * 2 + i) * 5, s, s, s * 0.16);
        var up = (Math.floor(t * 1.4) + i) % 3 === 0;
        ctx.fillStyle = up ? THEME.accent : THEME.brick1;
        ctx.shadowColor = up ? THEME.accent : "rgba(0,0,0,0.4)"; ctx.shadowBlur = up ? 20 : 8;
        ctx.fill();
        ctx.shadowBlur = 0;
        if (up) {
          ctx.fillStyle = "rgba(10,12,20,0.8)";
          ctx.font = "800 " + Math.round(s * 0.5) + "px " + FONT;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(SETS[i % SETS.length], x + s / 2, y + s / 2 + Math.sin(t * 2 + i) * 5);
        }
        ctx.restore();
      }
    }
    function help() { return STR.help.memory; }
    function starScore() { return 900; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore, pointer: pointer };
  }
