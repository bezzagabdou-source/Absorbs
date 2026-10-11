
  /* ══ BLUEPRINT 7 — MERGE: 2048-style, size and target configurable ════ */
  function bpMerge() {
    var n, board, moved, bestTile, moves;
    function size() { return clamp(CFG.size || 4, 3, 6); }
    function reset() {
      maxHealth = 100; health = 100; lives = 1;
      n = size();
      board = [];
      for (var y = 0; y < n; y++) { var r = []; for (var x = 0; x < n; x++) r.push(0); board.push(r); }
      addTile(); addTile();
      bestTile = 2; moves = 0; moved = false;
    }
    function empties() {
      var out = [];
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (!board[y][x]) out.push({ x: x, y: y });
      return out;
    }
    function addTile() {
      var e = empties();
      if (!e.length) return;
      var c = e[Math.floor(R() * e.length)];
      board[c.y][c.x] = R() < 0.86 ? 2 : 4;
      var p = cellPos(c.x, c.y);
      burst(p.x, p.y, 8, THEME.aqua, 110, 0.4);
    }
    function cellPos(x, y) {
      var cs = cellSize();
      return { x: boardX() + x * cs + cs / 2, y: boardY() + y * cs + cs / 2, s: cs };
    }
    function cellSize() { return Math.min((W * 0.9) / n, (H * 0.6) / n); }
    function boardX() { return (W - cellSize() * n) / 2; }
    function boardY() { return H * 0.2; }
    function slide(line) {
      var arr = line.filter(function (v) { return v; });
      var out = [], gained = 0;
      for (var i = 0; i < arr.length; i++) {
        if (i + 1 < arr.length && arr[i] === arr[i + 1]) {
          var v = arr[i] * 2; out.push(v); gained += v;
          if (v > bestTile) { bestTile = v; SFX.level(); flash = 0.5; }
          i++;
        } else out.push(arr[i]);
      }
      while (out.length < line.length) out.push(0);
      return { line: out, gained: gained };
    }
    function move(dx, dy) {
      var before = JSON.stringify(board);
      var gained = 0;
      if (dx === -1) for (var y = 0; y < n; y++) { var r = slide(board[y]); board[y] = r.line; gained += r.gained; }
      if (dx === 1) for (var y2 = 0; y2 < n; y2++) { var r2 = slide(board[y2].slice().reverse()); board[y2] = r2.line.reverse(); gained += r2.gained; }
      if (dy === -1) for (var x = 0; x < n; x++) {
        var col = []; for (var yy = 0; yy < n; yy++) col.push(board[yy][x]);
        var r3 = slide(col); for (var y3 = 0; y3 < n; y3++) board[y3][x] = r3.line[y3]; gained += r3.gained;
      }
      if (dy === 1) for (var x2 = 0; x2 < n; x2++) {
        var col2 = []; for (var y4 = 0; y4 < n; y4++) col2.push(board[y4][x2]);
        col2.reverse();
        var r4 = slide(col2); r4.line.reverse();
        for (var y5 = 0; y5 < n; y5++) board[y5][x2] = r4.line[y5];
        gained += r4.gained;
      }
      moved = JSON.stringify(board) !== before;
      if (!moved) { SFX.tick(); return; }
      moves++;
      SFX.swap();
      if (gained) { addCombo(); addScore(gained, W / 2, boardY() - 14, ""); }
      else addScore(2, W / 2, boardY() - 14, "");
      addTile();
      if (moves % 12 === 0) bumpLevel(1);
      if (bestTile >= (CFG.target || 2048)) { setState("GAMEOVER"); return; }
      if (!canMove()) { setState("GAMEOVER"); }
      paintHud();
    }
    function canMove() {
      if (empties().length) return true;
      for (var y = 0; y < n; y++) {
        for (var x = 0; x < n; x++) {
          var v = board[y][x];
          if (x + 1 < n && board[y][x + 1] === v) return true;
          if (y + 1 < n && board[y + 1][x] === v) return true;
        }
      }
      return false;
    }
    var swipeLock = 0;
    function update(dt) {
      runTime += dt;
      swipeLock = Math.max(0, swipeLock - dt);
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
      if (swipeLock > 0) return;
      if (left()) { move(-1, 0); swipeLock = 0.19; }
      else if (right()) { move(1, 0); swipeLock = 0.19; }
      else if (upHeld()) { move(0, -1); swipeLock = 0.19; }
      else if (downHeld()) { move(0, 1); swipeLock = 0.19; }
      else if (touch.active && (Math.abs(touch.dx) > 28 || Math.abs(touch.dy) > 28)) {
        if (Math.abs(touch.dx) > Math.abs(touch.dy)) move(touch.dx > 0 ? 1 : -1, 0);
        else move(0, touch.dy > 0 ? 1 : -1);
        touch.sx = touch.x; touch.sy = touch.y; touch.dx = 0; touch.dy = 0;
        swipeLock = 0.22;
      } else if (tapPad("left")) { move(-1, 0); swipeLock = 0.19; }
      else if (tapPad("right")) { move(1, 0); swipeLock = 0.19; }
    }
    function tileColor(v) {
      var idx = Math.max(0, Math.round(Math.log(v / 2) / Math.LN2));
      var ramp = [THEME.sky2, THEME.brick1, THEME.accent, THEME.hero1, THEME.hero0, THEME.aqua, THEME.gold, THEME.rose];
      return ramp[idx % ramp.length];
    }
    function draw(t) {
      var cs = cellSize(), bx = boardX(), by = boardY();
      ctx.save();
      roundRect(bx - 8, by - 8, cs * n + 16, cs * n + 16, 16);
      ctx.fillStyle = "rgba(8,10,18,0.5)"; ctx.fill();
      ctx.strokeStyle = THEME.edge; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
      for (var y = 0; y < n; y++) {
        for (var x = 0; x < n; x++) {
          var v = board[y][x];
          var cxp = bx + x * cs, cyp = by + y * cs;
          ctx.save();
          roundRect(cxp + 4, cyp + 4, cs - 8, cs - 8, cs * 0.16);
          if (!v) { ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fill(); }
          else {
            var pulse = 1 + Math.sin(t * 3 + x + y) * 0.012;
            ctx.translate(cxp + cs / 2, cyp + cs / 2);
            ctx.scale(pulse, pulse);
            ctx.translate(-(cxp + cs / 2), -(cyp + cs / 2));
            ctx.fillStyle = tileColor(v);
            ctx.shadowColor = tileColor(v); ctx.shadowBlur = v >= 64 ? 22 : 10;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.lineWidth = 1.2; ctx.stroke();
            ctx.fillStyle = v >= 8 ? "rgba(10,12,20,0.9)" : THEME.text;
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            var len = String(v).length;
            ctx.font = "900 " + Math.round(cs * (len > 3 ? 0.28 : len > 2 ? 0.34 : 0.42)) + "px " + FONT;
            ctx.fillText(String(v), cxp + cs / 2, cyp + cs / 2 + 1);
          }
          ctx.restore();
        }
      }
      ctx.save();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = THEME.dim; ctx.font = "700 " + Math.round(clamp(W * 0.032, 12, 17)) + "px " + FONT;
      ctx.fillText(STR.bestTile + ": " + bestTile + "   ·   " + STR.target + ": " + (CFG.target || 2048), W / 2, by - 26);
      ctx.restore();
      void moved;
    }
    function drawIdle(t) {
      var vals = [2, 4, 8, 16];
      for (var i = 0; i < 4; i++) {
        var s = W * 0.13;
        var x = W * 0.24 + (i % 2) * s * 1.25, y = H * 0.34 + Math.floor(i / 2) * s * 1.25;
        ctx.save();
        roundRect(x, y + Math.sin(t * 2 + i) * 4, s, s, s * 0.18);
        ctx.fillStyle = tileColor(vals[i]); ctx.shadowColor = tileColor(vals[i]); ctx.shadowBlur = 18; ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(10,12,20,0.85)";
        ctx.font = "900 " + Math.round(s * 0.36) + "px " + FONT;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(vals[i]), x + s / 2, y + s / 2 + Math.sin(t * 2 + i) * 4);
        ctx.restore();
      }
    }
    function help() { return STR.help.merge; }
    function starScore() { return 1000; }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore };
  }
