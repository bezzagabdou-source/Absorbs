
  /* ══ BLUEPRINT 3 — SNAKE: grid classic / walls / portals ═════════════ */
  function bpSnake() {
    var cell, cols, rows, snake, dir, nextDir, food, portals, walls, grow, stepT, stepEvery, eaten;
    function build() {
      cols = CFG.size || 18; rows = Math.round(cols * (H / W));
      rows = clamp(rows, 12, 30);
      cell = Math.min(W / cols, (H * 0.78) / rows);
      walls = [];
      portals = [];
      if (CFG.walls && level >= 2) {
        var n = clamp(4 + level * 2, 4, 26);
        for (var i = 0; i < n; i++) {
          var wx = rint(2, cols - 3), wy = rint(2, rows - 3);
          walls.push({ x: wx, y: wy });
          if (R() < 0.5) walls.push({ x: wx + 1, y: wy });
        }
      }
      if (CFG.portals && level >= 3) {
        portals.push({ x: rint(1, cols - 2), y: rint(1, rows - 2) });
        portals.push({ x: rint(1, cols - 2), y: rint(1, rows - 2) });
      }
    }
    function reset() {
      maxHealth = 100; health = 100; lives = 1;
      build();
      snake = [{ x: Math.floor(cols / 2), y: Math.floor(rows / 2) }];
      for (var i = 1; i < 4; i++) snake.push({ x: snake[0].x - i, y: snake[0].y });
      dir = { x: 1, y: 0 }; nextDir = { x: 1, y: 0 };
      grow = 3; eaten = 0; stepEvery = clamp(0.16 / CFG.speedMul, 0.06, 0.3); stepT = stepEvery;
      placeFood();
    }
    function placeFood() {
      var tries = 0;
      while (tries++ < 400) {
        var x = rint(0, cols - 1), y = rint(0, rows - 1);
        var bad = false;
        for (var i = 0; i < snake.length; i++) if (snake[i].x === x && snake[i].y === y) bad = true;
        for (var w = 0; w < walls.length; w++) if (walls[w].x === x && walls[w].y === y) bad = true;
        if (!bad) { food = { x: x, y: y, k: R() < 0.18 ? "gold" : "normal", t: 0 }; return; }
      }
      food = { x: 0, y: 0, k: "normal", t: 0 };
    }
    function blocked(x, y) {
      for (var i = 0; i < walls.length; i++) if (walls[i].x === x && walls[i].y === y) return true;
      return false;
    }
    function update(dt) {
      runTime += dt;
      food.t += dt;
      if (left() && dir.x !== 1) nextDir = { x: -1, y: 0 };
      else if (right() && dir.x !== -1) nextDir = { x: 1, y: 0 };
      else if (upHeld() && dir.y !== 1) nextDir = { x: 0, y: -1 };
      else if (downHeld() && dir.y !== -1) nextDir = { x: 0, y: 1 };
      if (touch.active && (Math.abs(touch.dx) > 24 || Math.abs(touch.dy) > 24)) {
        if (Math.abs(touch.dx) > Math.abs(touch.dy)) { if (!(touch.dx > 0 && dir.x === -1) && !(touch.dx < 0 && dir.x === 1)) nextDir = { x: touch.dx > 0 ? 1 : -1, y: 0 }; }
        else { if (!(touch.dy > 0 && dir.y === -1) && !(touch.dy < 0 && dir.y === 1)) nextDir = { x: 0, y: touch.dy > 0 ? 1 : -1 }; }
      }
      stepT -= dt;
      if (stepT > 0) return;
      stepT = stepEvery;
      dir = nextDir;
      var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      /* portals */
      for (var p = 0; p < portals.length; p++) {
        if (portals[p].x === head.x && portals[p].y === head.y) {
          var other = portals[(p + 1) % portals.length];
          head = { x: other.x, y: other.y };
          SFX.power(); burst(cx(other.x), cy(other.y), 14, THEME.aqua, 160, 0.5);
        }
      }
      if (CFG.wrap) {
        head.x = (head.x + cols) % cols;
        head.y = (head.y + rows) % rows;
      } else if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows) { die(); return; }
      if (blocked(head.x, head.y)) { die(); return; }
      for (var i = 0; i < snake.length - 1; i++) if (snake[i].x === head.x && snake[i].y === head.y) { die(); return; }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        eaten++;
        addCombo();
        var pts = food.k === "gold" ? 60 : 20;
        addScore(pts, cx(head.x), cy(head.y), "");
        coins += food.k === "gold" ? 3 : 1;
        SFX.coin(); burst(cx(head.x), cy(head.y), 16, food.k === "gold" ? THEME.gold : THEME.accent, 190, 0.55);
        grow += food.k === "gold" ? 3 : 1;
        stepEvery = clamp(stepEvery * 0.985, 0.055, 0.3);
        if (eaten % 6 === 0) { bumpLevel(1); build(); }
        placeFood();
        paintHud();
      } else if (grow > 0) grow--;
      else snake.pop();
    }
    function die() {
      shake = 1; flash = 0.8; SFX.boom();
      burst(cx(snake[0].x), cy(snake[0].y), 40, THEME.rose, 260, 0.9);
      health = 0; lives = 0; paintHud();
      setState("GAMEOVER");
    }
    function cx(gx) { return (W - cols * cell) / 2 + gx * cell + cell / 2; }
    function cy(gy) { return H * 0.12 + gy * cell + cell / 2; }
    function draw(t) {
      var ox = (W - cols * cell) / 2, oy = H * 0.12;
      ctx.save();
      roundRect(ox - 4, oy - 4, cols * cell + 8, rows * cell + 8, 10);
      ctx.fillStyle = "rgba(8,10,18,0.45)"; ctx.fill();
      ctx.strokeStyle = THEME.edge; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 0.14; ctx.strokeStyle = THEME.text; ctx.lineWidth = 1;
      for (var i = 1; i < cols; i++) { ctx.beginPath(); ctx.moveTo(ox + i * cell, oy); ctx.lineTo(ox + i * cell, oy + rows * cell); ctx.stroke(); }
      for (var j = 1; j < rows; j++) { ctx.beginPath(); ctx.moveTo(ox, oy + j * cell); ctx.lineTo(ox + cols * cell, oy + j * cell); ctx.stroke(); }
      ctx.globalAlpha = 1;
      /* walls */
      ctx.fillStyle = THEME.brick1;
      for (var w = 0; w < walls.length; w++) {
        roundRect(ox + walls[w].x * cell + 1, oy + walls[w].y * cell + 1, cell - 2, cell - 2, 3);
        ctx.fill();
      }
      /* portals */
      for (var p = 0; p < portals.length; p++) {
        ctx.save();
        ctx.translate(cx(portals[p].x), cy(portals[p].y));
        ctx.rotate(t * 2);
        ctx.strokeStyle = THEME.aqua; ctx.lineWidth = 3; ctx.shadowColor = THEME.aqua; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(0, 0, cell * 0.34, 0.4, 4.2); ctx.stroke();
        ctx.restore();
      }
      /* food */
      ctx.save();
      ctx.translate(cx(food.x), cy(food.y));
      var pulse = 1 + Math.sin(t * 6) * 0.12;
      ctx.fillStyle = food.k === "gold" ? THEME.gold : THEME.rose;
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(0, 0, cell * 0.36 * pulse, 0, TAU); ctx.fill();
      ctx.restore();
      /* snake */
      for (var s = snake.length - 1; s >= 0; s--) {
        var seg = snake[s], f = 1 - s / (snake.length + 6);
        ctx.save();
        var g = ctx.createLinearGradient(cx(seg.x) - cell / 2, cy(seg.y) - cell / 2, cx(seg.x) + cell / 2, cy(seg.y) + cell / 2);
        g.addColorStop(0, THEME.hero0); g.addColorStop(1, THEME.hero1);
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.45 + f * 0.55;
        if (s === 0) { ctx.shadowColor = THEME.glow; ctx.shadowBlur = 18; }
        roundRect(cx(seg.x) - cell * 0.44, cy(seg.y) - cell * 0.44, cell * 0.88, cell * 0.88, cell * 0.3);
        ctx.fill();
        if (s === 0) {
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
          ctx.fillStyle = THEME.text;
          var ex = dir.x * cell * 0.14, ey = dir.y * cell * 0.14;
          ctx.beginPath(); ctx.arc(cx(seg.x) - cell * 0.15 + ex, cy(seg.y) - cell * 0.06 + ey, cell * 0.08, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(cx(seg.x) + cell * 0.15 + ex, cy(seg.y) - cell * 0.06 + ey, cell * 0.08, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    function drawIdle(t) {
      for (var i = 0; i < 7; i++) {
        var x = W * 0.24 + i * W * 0.085, y = H * 0.38 + Math.sin(t * 3 - i * 0.6) * 12;
        ctx.globalAlpha = 1 - i * 0.1;
        ctx.fillStyle = i === 0 ? THEME.hero0 : THEME.hero1;
        roundRect(x, y, W * 0.07, W * 0.07, 6); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    function help() { return STR.help.snake; }
    function starScore() { return 400; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore };
  }
