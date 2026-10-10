
  /* ══ BLUEPRINT 6 — MAZE: generated maze, fog of war, keys and a door ══ */
  function bpMaze() {
    var cols, rows, grid, cell, px, py, keys0, door, torch, steps, exitFound;
    function generate() {
      cols = clamp(9 + level * 2, 9, 21) | 1;
      rows = clamp(9 + level * 2, 9, 21) | 1;
      grid = [];
      for (var y = 0; y < rows; y++) {
        var row = [];
        for (var x = 0; x < cols; x++) row.push({ w: true, v: false });
        grid.push(row);
      }
      /* recursive backtracker on odd cells */
      var stack = [{ x: 1, y: 1 }];
      grid[1][1].w = false; grid[1][1].v = true;
      while (stack.length) {
        var cur = stack[stack.length - 1];
        var opts = [];
        var dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
        for (var i = 0; i < dirs.length; i++) {
          var nx = cur.x + dirs[i][0], ny = cur.y + dirs[i][1];
          if (nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1 && !grid[ny][nx].v) opts.push({ x: nx, y: ny, mx: cur.x + dirs[i][0] / 2, my: cur.y + dirs[i][1] / 2 });
        }
        if (!opts.length) { stack.pop(); continue; }
        var nxt = opts[Math.floor(R() * opts.length)];
        grid[nxt.my][nxt.mx].w = false; grid[nxt.my][nxt.mx].v = true;
        grid[nxt.y][nxt.x].w = false; grid[nxt.y][nxt.x].v = true;
        stack.push({ x: nxt.x, y: nxt.y });
      }
      /* sprinkle extra openings so it is solvable and less linear */
      var extra = Math.floor(cols * rows * 0.05);
      for (var e = 0; e < extra; e++) {
        var ex = rint(1, cols - 2), ey = rint(1, rows - 2);
        grid[ey][ex].w = false;
      }
      cell = Math.min((W * 0.92) / cols, (H * 0.66) / rows);
      px = 1; py = 1; steps = 0; exitFound = false;
      door = { x: cols - 2, y: rows - 2 };
      grid[door.y][door.x].w = false;
      keys0 = [];
      var need = clamp(1 + Math.floor(level / 2), 1, 4);
      var guard = 0;
      while (keys0.length < need && guard++ < 600) {
        var kx = rint(1, cols - 2), ky = rint(1, rows - 2);
        if (grid[ky][kx].w) continue;
        if (kx === 1 && ky === 1) continue;
        if (kx === door.x && ky === door.y) continue;
        keys0.push({ x: kx, y: ky, got: false });
      }
      torch = clamp(2.6 + (CFG.difficulty === "easy" ? 1.6 : CFG.difficulty === "hard" ? -0.7 : 0), 1.5, 5);
    }
    function reset() {
      maxHealth = 100; health = 100; lives = 1;
      generate();
    }
    var moveT = 0;
    function tryMove(dx, dy) {
      var nx = px + dx, ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return;
      if (grid[ny][nx].w) { SFX.tick(); shake = Math.max(shake, 0.1); return; }
      px = nx; py = ny; steps++;
      addScore(1);
      for (var i = 0; i < keys0.length; i++) {
        if (!keys0[i].got && keys0[i].x === px && keys0[i].y === py) {
          keys0[i].got = true; SFX.power(); addScore(60, ox() + px * cell + cell / 2, oy() + py * cell, "");
          floatText(ox() + px * cell + cell / 2, oy() + py * cell - 10, STR.key, THEME.gold);
          flash = 0.3;
        }
      }
      if (px === door.x && py === door.y) {
        var got = 0;
        for (var k = 0; k < keys0.length; k++) if (keys0[k].got) got++;
        if (got >= keys0.length) {
          addScore(200 + level * 60, ox() + px * cell, oy() + py * cell, "");
          bumpLevel(1);
          if (CFG.endless === false && level > CFG.levels) { setState("GAMEOVER"); return; }
          generate();
        } else {
          SFX.tick();
          floatText(ox() + px * cell + cell / 2, oy() + py * cell - 10, STR.needKeys + " " + (keys0.length - got), THEME.rose);
        }
      }
    }
    function ox() { return (W - cols * cell) / 2; }
    function oy() { return H * 0.17; }
    function update(dt) {
      runTime += dt;
      moveT -= dt;
      if (moveT <= 0) {
        if (left()) { tryMove(-1, 0); moveT = 0.12; }
        else if (right()) { tryMove(1, 0); moveT = 0.12; }
        else if (upHeld()) { tryMove(0, -1); moveT = 0.12; }
        else if (downHeld()) { tryMove(0, 1); moveT = 0.12; }
      }
      if (touch.tap) {
        var tx = Math.floor((touch.x - ox()) / cell), ty = Math.floor((touch.y - oy()) / cell);
        if (tx >= 0 && ty >= 0 && tx < cols && ty < rows) {
          var ddx = tx - px, ddy = ty - py;
          if (Math.abs(ddx) > Math.abs(ddy)) tryMove(ddx > 0 ? 1 : -1, 0);
          else if (ddy !== 0) tryMove(0, ddy > 0 ? 1 : -1);
          moveT = 0.16;
        }
      }
      if (CFG.timed) {
        var limit = 60 + level * 10;
        if (runTime > limit) { health = Math.max(0, 100 - (runTime - limit) * 6); paintHud(); if (health <= 0) { lives = 0; setState("GAMEOVER"); } }
      }
      paintHud();
    }
    function draw(t) {
      var X = ox(), Y = oy();
      /* fog: reveal around the player */
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var d = Math.hypot(x - px, y - py);
          var vis = clamp(1 - (d - torch) / 2.2, 0.06, 1);
          ctx.globalAlpha = vis;
          if (grid[y][x].w) {
            ctx.fillStyle = d < torch ? THEME.brick0 : THEME.hill0;
            roundRect(X + x * cell + 1, Y + y * cell + 1, cell - 2, cell - 2, Math.min(4, cell * 0.2));
            ctx.fill();
          } else {
            ctx.fillStyle = THEME.sky2;
            ctx.fillRect(X + x * cell, Y + y * cell, cell, cell);
          }
        }
      }
      ctx.globalAlpha = 1;
      /* door */
      var ddx = door.x, ddy = door.y;
      ctx.save();
      ctx.shadowColor = THEME.gold; ctx.shadowBlur = 20;
      ctx.fillStyle = THEME.gold;
      roundRect(X + ddx * cell + cell * 0.18, Y + ddy * cell + cell * 0.1, cell * 0.64, cell * 0.8, cell * 0.2);
      ctx.fill();
      ctx.restore();
      /* keys */
      for (var i = 0; i < keys0.length; i++) {
        if (keys0[i].got) continue;
        var kx = X + keys0[i].x * cell + cell / 2, ky = Y + keys0[i].y * cell + cell / 2;
        ctx.save();
        ctx.translate(kx, ky + Math.sin(t * 4 + i) * 2);
        ctx.fillStyle = THEME.aqua; ctx.shadowColor = THEME.aqua; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(0, -cell * 0.12, cell * 0.16, 0, TAU); ctx.fill();
        ctx.fillRect(-cell * 0.05, -cell * 0.02, cell * 0.1, cell * 0.3);
        ctx.restore();
      }
      /* player */
      ctx.save();
      ctx.translate(X + px * cell + cell / 2, Y + py * cell + cell / 2);
      ctx.shadowColor = THEME.glow; ctx.shadowBlur = 22;
      var g = ctx.createRadialGradient(0, 0, 2, 0, 0, cell * 0.42);
      g.addColorStop(0, THEME.hero0); g.addColorStop(1, THEME.hero1);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, cell * 0.34, 0, TAU); ctx.fill();
      ctx.restore();
      /* torch light */
      var lg = ctx.createRadialGradient(X + px * cell + cell / 2, Y + py * cell + cell / 2, cell * 0.4, X + px * cell + cell / 2, Y + py * cell + cell / 2, cell * (torch + 1.4));
      lg.addColorStop(0, "rgba(255,220,150,0.20)");
      lg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
      /* key counter */
      var got = 0;
      for (var q = 0; q < keys0.length; q++) if (keys0[q].got) got++;
      ctx.save();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = THEME.dim; ctx.font = "700 " + Math.round(clamp(W * 0.032, 12, 17)) + "px " + FONT;
      ctx.fillText(STR.keys + " " + got + "/" + keys0.length + "   ·   " + STR.steps + " " + steps, W / 2, H * 0.13);
      ctx.restore();
      void exitFound;
    }
    function drawIdle(t) {
      var s = W * 0.09;
      for (var y = 0; y < 3; y++) {
        for (var x = 0; x < 4; x++) {
          var on = (x + y * 2 + Math.floor(t)) % 5 !== 0;
          ctx.globalAlpha = on ? 0.85 : 0.25;
          ctx.fillStyle = on ? THEME.brick0 : THEME.sky2;
          roundRect(W * 0.22 + x * s * 1.1, H * 0.34 + y * s * 1.1, s, s, 5); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    function help() { return STR.help.maze; }
    function starScore() { return 700; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore };
  }
