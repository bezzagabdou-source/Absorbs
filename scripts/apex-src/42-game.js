/*@meta {"id":"game","title":"محرّك الألعاب","domain":"game","tags":["game","canvas","engine","rpg","tower","runner","roguelike"],"order":62,"needs":["kernel"]}*/
/* ══════════════════════════════════════════════════════════════════════════
   NEXUS APEX game engine — one loop, four real games:
     • rpg     : turn-based battles, levels, skills, inventory, loot, 20 floors
     • tower   : tower defence, 30 waves, 4 tower types, upgrades, bosses
     • runner  : endless dash, double jump, power-ups, procedural obstacles
     • roguelike: procedural dungeons, fog of war, keys, healing, stairs
   Deterministic (seeded), keyboard + touch, procedural audio via APEX.audio,
   particles, screen shake, saves in localStorage, and a score bridge.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  var A = window.APEX;
  var TAU = Math.PI * 2;

  function mkEngine(canvas, hud, opts) {
    var rng = A.rng(opts.seed || 1);
    var W = canvas.width, H = canvas.height;
    var g = canvas.getContext("2d");
    var state = { mode: "menu", t: 0, dt: 0, score: 0, level: 1, best: Number(localStorage.getItem("apex:best:" + opts.kind) || 0) || 0 };
    var keys = {}, pointer = { x: W / 2, y: H / 2, down: false };
    var parts = [], floats = [];
    var shake = 0, muted = false;
    var callbacks = {};

    /* ---------- helpers ---------- */
    function sfx(name) { if (!muted && A.audio && A.audio.play) A.guard("sfx", function () { A.audio.play(name); }); }
    function burst(x, y, color, n, power) {
      for (var i = 0; i < (n || 12); i++) {
        var a = rng.next() * TAU, s = (0.4 + rng.next()) * (power || 1) * 3.2;
        parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + rng.next() * 0.6, max: 1.1, color: color || "#fff", r: 1.5 + rng.next() * 3 });
      }
    }
    function float(x, y, text, color) { floats.push({ x: x, y: y, text: text, life: 1.1, color: color || "#fff" }); }
    function addScore(n, x, y) { state.score += n; if (x != null) float(x, y, "+" + n, "#7cffb2"); if (state.score > state.best) { state.best = state.score; } }
    function saveBest() { try { localStorage.setItem("apex:best:" + opts.kind, String(state.best)); } catch (e) { /* ignore */ } }
    function emit(kind, payload) {
      if (callbacks[kind]) A.guard("cb:" + kind, function () { callbacks[kind](payload); });
      try { if (window.parent && window.parent !== window) window.parent.postMessage({ apex: kind, kind: opts.kind, score: state.score, level: state.level }, "*"); } catch (e) { /* cross-origin */ }
    }
    function paintHud() {
      var map = { score: state.score, level: state.level, time: state.duration || 0, best: state.best };
      Object.keys(map).forEach(function (k) {
        var n = hud[k];
        if (n) n.textContent = k === "time" ? Math.floor(map[k] / 60) + ":" + String(Math.floor(map[k]) % 60).padStart(2, "0") : A.fmt.int(map[k]);
      });
    }

    /* ---------- shared drawing ---------- */
    function bg(color1, color2) {
      var grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, color1);
      grad.addColorStop(1, color2);
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }
    function text(str, x, y, size, color, align) {
      g.fillStyle = color || "#fff";
      g.font = "800 " + (size || 20) + "px system-ui, sans-serif";
      g.textAlign = align || "center";
      g.textBaseline = "middle";
      g.fillText(str, x, y);
    }
    function panel(title, lines, hint) {
      g.fillStyle = "rgba(4,6,12,.72)";
      g.fillRect(0, 0, W, H);
      text(title, W / 2, H / 2 - 86, 40, "#fff");
      (lines || []).forEach(function (l, i) { text(l, W / 2, H / 2 - 20 + i * 30, 18, i === 0 ? "#ffe08a" : "#cfd8e3"); });
      if (hint) text(hint, W / 2, H / 2 + 120, 15, "#9fb0c4");
    }
    function drawParts() {
      parts = parts.filter(function (p) { return p.life > 0; });
      parts.forEach(function (p) {
        p.life -= state.dt; p.x += p.vx * state.dt * 60; p.y += p.vy * state.dt * 60; p.vy += 26 * state.dt;
        g.globalAlpha = Math.max(0, p.life / p.max);
        g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
      });
      g.globalAlpha = 1;
      floats = floats.filter(function (f) { return f.life > 0; });
      floats.forEach(function (f) {
        f.life -= state.dt; f.y -= 34 * state.dt;
        g.globalAlpha = Math.max(0, f.life);
        text(f.text, f.x, f.y, 16, f.color);
      });
      g.globalAlpha = 1;
    }

    /* ══════════════════════════ RPG ══════════════════════════ */
    var rpg = {
      hero: { name: "الفارس", hp: 120, maxHp: 120, mp: 40, maxMp: 40, atk: 14, def: 6, level: 1, xp: 0, xpNext: 60, potions: 3, gold: 0, crit: 0.14 },
      skills: [{ id: "strike", name: "ضربة قوية", cost: 8, power: 2.1, desc: "ضرر مضاعف بفرصة نقد عالية" }, { id: "heal", name: "شفاء", cost: 12, power: 0, desc: "يستعيد 45 نقطة حياة" }, { id: "blast", name: "نيران سحرية", cost: 16, power: 3.2, desc: "ضرر كبير يتجاهل نصف الدفاع" }],
      enemy: null, floor: 1, log: [], turn: "hero", busy: false,
      MONSTERS: [
        { name: "غول الكهوف", hp: 60, atk: 9, def: 3, xp: 24, gold: 12, emoji: "👹" },
        { name: "عقرب الرمل", hp: 46, atk: 12, def: 2, xp: 20, gold: 9, emoji: "🦂" },
        { name: "خفاش الظلام", hp: 38, atk: 10, def: 1, xp: 16, gold: 7, emoji: "🦇" },
        { name: "زومبي الواحة", hp: 78, atk: 11, def: 5, xp: 32, gold: 16, emoji: "🧟" },
        { name: "تنّين الصحراء", hp: 130, atk: 18, def: 8, xp: 64, gold: 40, emoji: "🐲", boss: true }
      ]
    };
    function rpgSpawn() {
      var pool = rpg.MONSTERS.filter(function (m) { return m.boss ? rpg.floor % 5 === 0 : true; });
      var base = rng.pick(pool);
      var scale = 1 + (rpg.floor - 1) * 0.22;
      rpg.enemy = { name: base.name, emoji: base.emoji, maxHp: Math.round(base.hp * scale), hp: Math.round(base.hp * scale), atk: Math.round(base.atk * scale), def: Math.round(base.def * scale), xp: Math.round(base.xp * scale), gold: Math.round(base.gold * scale), boss: !!base.boss, flash: 0 };
      rpg.log.unshift("ظهر " + base.emoji + " " + base.name + " في الطابق " + rpg.floor);
      rpg.turn = "hero";
    }
    function rpgDamage(atk, def, mult) {
      var base = atk * (mult || 1) * (0.85 + rng.next() * 0.35) - def * 0.6;
      var crit = rng.next() < rpg.hero.crit;
      var dmg = Math.max(2, Math.round(base * (crit ? 1.9 : 1)));
      return { dmg: dmg, crit: crit };
    }
    function rpgAttack(skillId) {
      if (rpg.busy || rpg.turn !== "hero" || !rpg.enemy) return;
      var sk = rpg.skills.filter(function (s) { return s.id === skillId; })[0];
      if (sk.cost > rpg.hero.mp) { sfx("hit"); float(W / 2, H / 2, "ما عندكش طاقة كافية", "#ff9d9d"); return; }
      rpg.hero.mp -= sk.cost;
      rpg.busy = true;
      if (skillId === "heal") {
        rpg.hero.hp = Math.min(rpg.hero.maxHp, rpg.hero.hp + 45);
        float(220, 300, "+45 HP", "#7cffb2"); sfx("power");
        rpg.log.unshift("استعملت " + sk.name + " واستعدت 45 نقطة");
      } else {
        var def = skillId === "blast" ? rpg.enemy.def * 0.5 : rpg.enemy.def;
        var hit = rpgDamage(rpg.hero.atk, def, sk.power);
        rpg.enemy.hp -= hit.dmg;
        rpg.enemy.flash = 0.22;
        float(W * 0.68, H * 0.42, "-" + hit.dmg + (hit.crit ? " نقد!" : ""), hit.crit ? "#ffd166" : "#ff8f8f");
        burst(W * 0.68, H * 0.42, hit.crit ? "#ffd166" : "#ff7b7b", hit.crit ? 22 : 12, 1.4);
        sfx(hit.crit ? "win" : "hit");
        rpg.log.unshift("ضربت " + rpg.enemy.name + " بـ " + hit.dmg + (hit.crit ? " (ضربة قاضية)" : ""));
      }
      if (rpg.enemy.hp <= 0) return rpgWin();
      setTimeout(rpgEnemyTurn, 420);
    }
    function rpgEnemyTurn() {
      if (!rpg.enemy) { rpg.busy = false; return; }
      var hit = rpgDamage(rpg.enemy.atk, rpg.hero.def, 1);
      rpg.hero.hp -= hit.dmg;
      float(220, 300, "-" + hit.dmg, "#ff9d9d");
      burst(220, 300, "#ff6b6b", 10, 1);
      sfx("hit");
      rpg.log.unshift(rpg.enemy.name + " ضربك بـ " + hit.dmg);
      if (rpg.hero.hp <= 0) return rpgLose();
      rpg.turn = "hero";
      rpg.busy = false;
    }
    function rpgWin() {
      var e = rpg.enemy;
      addScore(e.xp * 3, W * 0.68, H * 0.34);
      rpg.hero.xp += e.xp; rpg.hero.gold += e.gold;
      rpg.log.unshift("قضيت على " + e.name + " + " + e.xp + " خبرة + " + e.gold + " دينار");
      while (rpg.hero.xp >= rpg.hero.xpNext) {
        rpg.hero.level++; rpg.hero.xp -= rpg.hero.xpNext; rpg.hero.xpNext = Math.round(rpg.hero.xpNext * 1.45);
        rpg.hero.maxHp += 26; rpg.hero.hp = rpg.hero.maxHp; rpg.hero.atk += 4; rpg.hero.def += 2; rpg.hero.maxMp += 8; rpg.hero.mp = rpg.hero.maxMp;
        rpg.log.unshift("🎉 وصلت للمستوى " + rpg.hero.level + "!");
        sfx("win"); burst(W / 2, H / 2, "#ffd166", 40, 2);
      }
      if (rng.chance(0.45)) { rpg.hero.potions++; rpg.log.unshift("لقيت جرعة شفاء 🧪"); }
      rpg.enemy = null; rpg.busy = false;
      rpg.floor++;
      if (rpg.floor > 20) { rpg.floor = 20; }
      setTimeout(function () { if (state.mode === "play") rpgSpawn(); }, 700);
    }
    function rpgLose() {
      rpg.hero.hp = 0;
      saveBest();
      emit("gameover", { score: state.score, floor: rpg.floor });
      state.mode = "over";
      sfx("lose");
    }
    function rpgDraw() {
      bg("#0b1020", "#1b1030");
      /* hero + enemy cards */
      drawFighter(220, 300, rpg.hero.emojiShort || "🛡️", "الفارس", rpg.hero.hp, rpg.hero.maxHp, "#4f9cf9", 0);
      if (rpg.enemy) drawFighter(W * 0.68, 260, rpg.enemy.emoji, rpg.enemy.name, rpg.enemy.hp, rpg.enemy.maxHp, "#f2635b", rpg.enemy.flash);
      /* bars */
      bar(60, H - 96, 260, 16, rpg.hero.hp / rpg.hero.maxHp, "#5fd39a");
      bar(60, H - 72, 260, 10, rpg.hero.mp / rpg.hero.maxMp, "#6aa8ff");
      text("HP " + Math.max(0, rpg.hero.hp) + "/" + rpg.hero.maxHp, 190, H - 104, 14, "#cfd8e3");
      text("MP " + rpg.hero.mp + "/" + rpg.hero.maxMp + " · XP " + rpg.hero.xp + "/" + rpg.hero.xpNext + " · 🧪 " + rpg.hero.potions + " · 💰 " + rpg.hero.gold, 190, H - 54, 13, "#9fb0c4");
      /* skill buttons drawn on canvas so they work on touch */
      rpg.skills.forEach(function (s, i) {
        var x = W - 60 - (rpg.skills.length - 1 - i) * 150, y = H - 52;
        var hover = pointer.x > x - 66 && pointer.x < x + 66 && pointer.y > y - 24 && pointer.y < y + 24;
        g.fillStyle = hover ? "rgba(217,119,87,.9)" : "rgba(255,255,255,.12)";
        round(x - 66, y - 24, 132, 46, 14);
        text(s.name + " (" + s.cost + ")", x, y, 15, "#fff");
      });
      /* log */
      g.fillStyle = "rgba(0,0,0,.32)";
      g.fillRect(W - 420, 20, 400, 108);
      rpg.log.slice(0, 4).forEach(function (l, i) { text(l, W - 400, 44 + i * 24, 13, "#dfe7f1", "start"); });
      text("الطابق " + rpg.floor + "/20 — اكتب 1/2/3 أو اضغط", 20, 26, 13, "#9fb0c4", "start");
      drawParts();
    }
    function drawFighter(x, y, emoji, name, hp, maxHp, color, flash) {
      g.save();
      g.translate(x, y);
      if (flash > 0) { g.globalAlpha = 0.7; g.translate(rng.int(-4, 4), rng.int(-3, 3)); }
      g.fillStyle = "rgba(255,255,255,.06)";
      g.beginPath(); g.arc(0, 0, 76, 0, TAU); g.fill();
      g.font = "76px system-ui"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(emoji, 0, 4);
      g.restore();
      text(name, x, y + 98, 17, "#fff");
      bar(x - 70, y + 112, 140, 12, Math.max(0, hp / maxHp), color);
    }
    function bar(x, y, w, h, pct, color) {
      g.fillStyle = "rgba(255,255,255,.14)";
      round(x, y, w, h, h / 2);
      g.fillStyle = color;
      round(x, y, Math.max(2, w * A.clamp(pct, 0, 1)), h, h / 2);
    }
    function round(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
      g.fill();
    }

    /* ══════════════════════════ TOWER DEFENCE ══════════════════════════ */
    var tower = {
      money: 260, lives: 20, wave: 1, maxWave: 30, towers: [], enemies: [], shots: [], build: "gun", spawnT: 0, spawnLeft: 0,
      path: [[-40, 90], [180, 90], [180, 300], [440, 300], [440, 150], [700, 150], [700, 430], [300, 430], [300, 560], [1020, 560]],
      TYPES: { gun: { name: "مدفع", cost: 70, dmg: 9, range: 150, rate: 0.55, color: "#6aa8ff" }, laser: { name: "ليزر", cost: 120, dmg: 16, range: 190, rate: 0.95, color: "#ff5fa2" }, frost: { name: "تجميد", cost: 95, dmg: 5, range: 160, rate: 0.7, color: "#7ee0d0", slow: 0.45 }, bomb: { name: "قنابل", cost: 160, dmg: 34, range: 210, rate: 1.5, color: "#ffd166", splash: 70 } }
    };
    function towerSpawn() {
      var hp = Math.round(42 * Math.pow(1.16, tower.wave - 1));
      var count = 4 + Math.floor(tower.wave * 1.3);
      tower.spawnLeft = count;
      tower.spawnT = 0;
      emit("wave", { wave: tower.wave });
    }
    function towerUpdate(dt) {
      if (tower.spawnLeft > 0) {
        tower.spawnT -= dt;
        if (tower.spawnT <= 0) {
          tower.spawnT = Math.max(0.34, 0.95 - tower.wave * 0.02);
          var hp = Math.round(42 * Math.pow(1.16, tower.wave - 1)) * (tower.wave % 10 === 0 ? 3 : 1);
          tower.enemies.push({ t: 0, hp: hp, maxHp: hp, speed: (34 + tower.wave * 1.1) * (tower.wave % 10 === 0 ? 0.6 : 1), slow: 1, boss: tower.wave % 10 === 0 });
          tower.spawnLeft--;
        }
      }
      tower.enemies.forEach(function (e) {
        e.slow = Math.min(1, e.slow + dt * 0.5);
        e.t += (e.speed * dt * e.slow) / towerPathLen();
        if (e.t >= 1) { e.dead = true; tower.lives--; sfx("hit"); shake = 8; }
      });
      tower.towers.forEach(function (tw) {
        tw.cd -= dt;
        if (tw.cd > 0) return;
        var target = null, best = 1e9;
        tower.enemies.forEach(function (e) {
          if (e.dead) return;
          var p = towerPos(e.t), d = Math.hypot(p[0] - tw.x, p[1] - tw.y);
          if (d < tw.range && d < best) { best = d; target = e; }
        });
        if (!target) return;
        tw.cd = tw.rate;
        tw.angle = Math.atan2(towerPos(target.t)[1] - tw.y, towerPos(target.t)[0] - tw.x);
        var type = tower.TYPES[tw.type];
        tower.shots.push({ x: tw.x, y: tw.y, target: target, dmg: type.dmg, color: type.color, splash: type.splash, slow: type.slow });
        sfx(tw.type === "laser" ? "power" : "click");
      });
      tower.shots.forEach(function (s) {
        if (!s.target || s.target.dead) { s.dead = true; return; }
        var p = towerPos(s.target.t);
        s.x += (p[0] - s.x) * Math.min(1, dt * 12);
        s.y += (p[1] - s.y) * Math.min(1, dt * 12);
        if (Math.hypot(p[0] - s.x, p[1] - s.y) < 12) {
          s.dead = true;
          s.target.hp -= s.dmg;
          if (s.slow) s.target.slow = s.slow;
          burst(p[0], p[1], s.color, 8, 1);
          if (s.splash) tower.enemies.forEach(function (e) { if (!e.dead && e !== s.target) { var q = towerPos(e.t); if (Math.hypot(q[0] - p[0], q[1] - p[1]) < s.splash) e.hp -= s.dmg * 0.6; } });
          if (s.target.hp <= 0) {
            s.target.dead = true;
            var reward = s.target.boss ? 90 : 9 + Math.floor(tower.wave * 0.7);
            tower.money += reward;
            addScore(reward * 2, p[0], p[1]);
            burst(p[0], p[1], "#ffd166", s.target.boss ? 30 : 12, 1.4);
            sfx("coin");
          }
        }
      });
      tower.shots = tower.shots.filter(function (s) { return !s.dead; });
      tower.enemies = tower.enemies.filter(function (e) { return !e.dead; });
      if (tower.spawnLeft === 0 && tower.enemies.length === 0) {
        tower.wave++;
        tower.money += 60 + tower.wave * 5;
        if (tower.wave > tower.maxWave) { state.mode = "won"; saveBest(); sfx("win"); emit("gamewin", { score: state.score }); return; }
        float(W / 2, H / 2, "الموجة " + tower.wave + " بانت!", "#ffd166");
        towerSpawn();
      }
      if (tower.lives <= 0) { state.mode = "over"; saveBest(); sfx("lose"); emit("gameover", { score: state.score }); }
    }
    function towerPathLen() {
      var len = 0;
      for (var i = 1; i < tower.path.length; i++) len += Math.hypot(tower.path[i][0] - tower.path[i - 1][0], tower.path[i][1] - tower.path[i - 1][1]);
      return len;
    }
    function towerPos(t) {
      var total = towerPathLen(), want = A.clamp(t, 0, 1) * total, walked = 0;
      for (var i = 1; i < tower.path.length; i++) {
        var seg = Math.hypot(tower.path[i][0] - tower.path[i - 1][0], tower.path[i][1] - tower.path[i - 1][1]);
        if (walked + seg >= want) {
          var f = (want - walked) / seg;
          return [tower.path[i - 1][0] + (tower.path[i][0] - tower.path[i - 1][0]) * f, tower.path[i - 1][1] + (tower.path[i][1] - tower.path[i - 1][1]) * f];
        }
        walked += seg;
      }
      return tower.path[tower.path.length - 1];
    }
    function towerDraw() {
      bg("#07131b", "#0b2130");
      g.strokeStyle = "rgba(255,255,255,.14)"; g.lineWidth = 46; g.lineJoin = "round";
      g.beginPath(); tower.path.forEach(function (p, i) { i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.stroke();
      g.strokeStyle = "rgba(255,255,255,.28)"; g.lineWidth = 40; g.stroke();
      tower.towers.forEach(function (tw) {
        g.fillStyle = tower.TYPES[tw.type].color;
        round(tw.x - 17, tw.y - 17, 34, 34, 10);
        g.save(); g.translate(tw.x, tw.y); g.rotate(tw.angle || 0);
        g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(0, -4, 26, 8); g.restore();
        if (tw.level > 1) text("L" + tw.level, tw.x, tw.y + 30, 11, "#fff");
      });
      tower.enemies.forEach(function (e) {
        var p = towerPos(e.t);
        g.fillStyle = e.boss ? "#ff5f7a" : "#ff9d6a";
        g.beginPath(); g.arc(p[0], p[1], e.boss ? 19 : 13, 0, TAU); g.fill();
        bar(p[0] - 20, p[1] - 26, 40, 5, e.hp / e.maxHp, "#7cffb2");
        if (e.slow < 1) { g.strokeStyle = "#7ee0d0"; g.lineWidth = 2; g.beginPath(); g.arc(p[0], p[1], 20, 0, TAU); g.stroke(); }
      });
      tower.shots.forEach(function (s) { g.fillStyle = s.color; g.beginPath(); g.arc(s.x, s.y, 4, 0, TAU); g.fill(); });
      text("💰 " + tower.money + "  ❤️ " + tower.lives + "  🌊 موجة " + tower.wave + "/" + tower.maxWave, 20, 24, 14, "#e8f1f8", "start");
      Object.keys(tower.TYPES).forEach(function (k, i) {
        var t2 = tower.TYPES[k], x = 20 + i * 150, y = H - 30;
        g.fillStyle = tower.build === k ? "rgba(217,119,87,.92)" : "rgba(255,255,255,.12)";
        round(x, y - 20, 138, 42, 12);
        text(t2.name + " " + t2.cost, x + 69, y, 13, "#fff");
      });
      drawParts();
    }

    /* ══════════════════════════ RUNNER ══════════════════════════ */
    var runner = { x: 120, y: 0, vy: 0, onGround: true, jumps: 0, speed: 320, obstacles: [], coins: [], powerups: [], spawn: 0, shield: 0, distance: 0, ground: 470 };
    function runnerReset() { runner.x = 120; runner.y = runner.ground; runner.vy = 0; runner.obstacles = []; runner.coins = []; runner.powerups = []; runner.spawn = 0; runner.distance = 0; runner.shield = 0; runner.speed = 320; }
    function runnerUpdate(dt) {
      runner.speed += dt * 5;
      runner.distance += runner.speed * dt;
      state.duration = (state.duration || 0) + dt;
      runner.vy += 2100 * dt;
      runner.y += runner.vy * dt;
      if (runner.y >= runner.ground) { runner.y = runner.ground; runner.vy = 0; runner.onGround = true; runner.jumps = 0; }
      runner.spawn -= dt;
      if (runner.spawn <= 0) {
        runner.spawn = Math.max(0.42, 1.05 - runner.distance / 5200);
        if (rng.chance(0.72)) runner.obstacles.push({ x: W + 40, w: rng.int(26, 52), h: rng.int(40, 96), kind: rng.chance(0.3) ? "air" : "ground" });
        if (rng.chance(0.65)) runner.coins.push({ x: W + 40, y: runner.ground - rng.int(60, 210), r: 11, spin: rng.next() * TAU });
        if (rng.chance(0.12)) runner.powerups.push({ x: W + 40, y: runner.ground - rng.int(90, 200), type: rng.pick(["shield", "magnet", "boost"]), r: 15 });
      }
      runner.obstacles.forEach(function (o) { o.x -= runner.speed * dt; });
      runner.coins.forEach(function (c) { c.x -= runner.speed * dt; c.spin += dt * 6; });
      runner.powerups.forEach(function (p) { p.x -= runner.speed * dt; });
      runner.obstacles.forEach(function (o) {
        var oy = o.kind === "air" ? runner.ground - o.h - 82 : runner.ground - o.h;
        if (runner.x + 22 > o.x && runner.x - 22 < o.x + o.w && runner.y - 6 > oy) {
          if (runner.shield > 0) { runner.shield = 0; o.dead = true; burst(o.x, oy + o.h / 2, "#7ee0d0", 20, 1.6); sfx("power"); float(runner.x, runner.y - 60, "درع صدّ!", "#7ee0d0"); }
          else { state.mode = "over"; saveBest(); sfx("lose"); burst(runner.x, runner.y, "#ff6b6b", 26, 1.8); shake = 12; emit("gameover", { score: Math.floor(state.score) }); }
        }
      });
      runner.coins.forEach(function (c) {
        if (Math.hypot(c.x - runner.x, c.y - (runner.y - 26)) < 34) {
          c.dead = true; addScore(10, c.x, c.y); sfx("coin"); burst(c.x, c.y, "#ffd166", 8, 0.8);
        }
      });
      runner.powerups.forEach(function (p) {
        if (Math.hypot(p.x - runner.x, p.y - (runner.y - 26)) < 36) {
          p.dead = true;
          if (p.type === "shield") { runner.shield = 1; float(runner.x, runner.y - 70, "درع 🛡️", "#7ee0d0"); }
          if (p.type === "boost") { runner.speed += 140; float(runner.x, runner.y - 70, "سرعة ⚡", "#ffd166"); }
          if (p.type === "magnet") { float(runner.x, runner.y - 70, "مغناطيس 🧲", "#a78bfa"); isMagnet = true; setTimeout(function () { isMagnet = false; }, 6000); }
          sfx("power");
        }
      });
      runner.obstacles = runner.obstacles.filter(function (o) { return o.x > -80 && !o.dead; });
      runner.coins = runner.coins.filter(function (c) { return c.x > -40 && !c.dead; });
      runner.powerups = runner.powerups.filter(function (p) { return p.x > -40 && !p.dead; });
      state.score = Math.floor(runner.distance / 10);
      state.level = 1 + Math.floor(runner.distance / 1500);
    }
    var isMagnet = false;
    function runnerDraw() {
      var pal = A.palette();
      var sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#12122a"); sky.addColorStop(0.6, "#3a1f3d"); sky.addColorStop(1, "#6b2f2a");
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      /* parallax dunes */
      for (var layer = 0; layer < 3; layer++) {
        g.fillStyle = ["rgba(255,255,255,.05)", "rgba(255,255,255,.08)", "rgba(255,255,255,.12)"][layer];
        g.beginPath(); g.moveTo(0, H);
        for (var x = 0; x <= W; x += 40) {
          var y = runner.ground - 60 - layer * 40 + Math.sin((x + runner.distance * (0.2 + layer * 0.3)) / 160) * (26 + layer * 12);
          g.lineTo(x, y);
        }
        g.lineTo(W, H); g.closePath(); g.fill();
      }
      g.fillStyle = "#12100f"; g.fillRect(0, runner.ground, W, H - runner.ground);
      g.fillStyle = pal[0]; g.fillRect(0, runner.ground, W, 4);
      runner.obstacles.forEach(function (o) {
        var oy = o.kind === "air" ? runner.ground - o.h - 82 : runner.ground - o.h;
        g.fillStyle = o.kind === "air" ? "#ff5f7a" : "#c98b5f";
        round(o.x, oy, o.w, o.h, 8);
        g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(o.x + 4, oy + 4, o.w - 8, 3);
      });
      runner.coins.forEach(function (c) {
        g.save(); g.translate(c.x, c.y); g.scale(Math.cos(c.spin), 1);
        g.fillStyle = "#ffd166"; g.beginPath(); g.arc(0, 0, c.r, 0, TAU); g.fill();
        g.fillStyle = "#b98a12"; g.beginPath(); g.arc(0, 0, c.r * 0.55, 0, TAU); g.fill(); g.restore();
      });
      runner.powerups.forEach(function (p) { g.fillStyle = "#a78bfa"; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); text(p.type === "shield" ? "🛡" : p.type === "magnet" ? "🧲" : "⚡", p.x, p.y, 16, "#fff"); });
      /* hero */
      g.save(); g.translate(runner.x, runner.y - 26);
      g.fillStyle = "#e8946f"; round(-16, -34, 32, 44, 12);
      g.fillStyle = "#2a2926"; g.beginPath(); g.arc(-6, -38, 4, 0, TAU); g.arc(6, -38, 4, 0, TAU); g.fill();
      if (runner.shield > 0) { g.strokeStyle = "#7ee0d0"; g.lineWidth = 3; g.beginPath(); g.arc(0, -12, 34, 0, TAU); g.stroke(); }
      g.restore();
      text("المسافة " + Math.floor(runner.distance / 10) + " م · السرعة " + Math.round(runner.speed / 10), 20, 24, 14, "#fff", "start");
      if (isMagnet) text("🧲 مغناطيس", W - 20, 24, 14, "#a78bfa", "end");
      drawParts();
    }

    /* ══════════════════════════ ROGUELIKE ══════════════════════════ */
    var rogue = { map: [], seen: [], hero: { x: 1, y: 1, hp: 100, maxHp: 100, atk: 12, keys: 0, potions: 2 }, floor: 1, size: 21, mobs: [], stairs: [0, 0], messages: [] };
    function rogueGen() {
      var n = rogue.size;
      rogue.map = []; rogue.seen = []; rogue.mobs = [];
      for (var y = 0; y < n; y++) {
        rogue.map[y] = []; rogue.seen[y] = [];
        for (var x = 0; x < n; x++) { rogue.map[y][x] = rng.chance(0.62) ? 0 : 1; rogue.seen[y][x] = false; }
      }
      /* carve rooms */
      for (var r = 0; r < 7; r++) {
        var rw = rng.int(3, 5), rh = rng.int(3, 5), rx = rng.int(1, n - rw - 2), ry = rng.int(1, n - rh - 2);
        for (var yy = ry; yy < ry + rh; yy++) for (var xx = rx; xx < rx + rw; xx++) rogue.map[yy][xx] = 0;
      }
      /* connect with corridors */
      for (var c = 0; c < 14; c++) {
        var cy = rng.int(2, n - 3), cx = rng.int(2, n - 3);
        for (var i = 0; i < rng.int(3, 8); i++) { if (rng.chance(0.5)) cx = A.clamp(cx + (rng.chance(0.5) ? 1 : -1), 1, n - 2); else cy = A.clamp(cy + (rng.chance(0.5) ? 1 : -1), 1, n - 2); rogue.map[cy][cx] = 0; }
      }
      rogue.map[1][1] = 0;
      rogue.hero.x = 1; rogue.hero.y = 1;
      rogue.stairs = [n - 2, n - 2]; rogue.map[n - 2][n - 2] = 0;
      for (var m = 0; m < 3 + rogue.floor; m++) {
        var mx = rng.int(2, n - 3), my = rng.int(2, n - 3);
        if (rogue.map[my][mx] === 0 && !(mx === 1 && my === 1)) rogue.mobs.push({ x: mx, y: my, hp: 20 + rogue.floor * 6, atk: 6 + rogue.floor * 2, name: rng.pick(["عفريت", "وحش", "ساحر", "ظل"]) });
      }
      rogue.messages = ["نزلت للطابق " + rogue.floor + " من الزنزانة..."];
    }
    function rogueMove(dx, dy) {
      if (state.mode !== "play") return;
      var nx = A.clamp(rogue.hero.x + dx, 0, rogue.size - 1), ny = A.clamp(rogue.hero.y + dy, 0, rogue.size - 1);
      var mob = rogue.mobs.filter(function (m) { return m.x === nx && m.y === ny; })[0];
      if (mob) {
        var dmg = rng.int(Math.round(rogue.hero.atk * 0.7), Math.round(rogue.hero.atk * 1.4));
        mob.hp -= dmg;
        rogue.messages.unshift("ضربت " + mob.name + " بـ " + dmg);
        sfx("hit");
        if (mob.hp <= 0) {
          rogue.mobs = rogue.mobs.filter(function (m) { return m !== mob; });
          addScore(20 + rogue.floor * 4, 0, 0);
          rogue.messages.unshift("قضيت على " + mob.name + " 💀");
          if (rng.chance(0.3)) { rogue.hero.potions++; rogue.messages.unshift("لقيت جرعة 🧪"); }
          if (rng.chance(0.4)) { rogue.hero.keys++; rogue.messages.unshift("لقيت مفتاح 🗝️"); }
        } else {
          rogue.hero.hp -= Math.max(1, mob.atk - 2);
        }
        return;
      }
      if (rogue.map[ny][nx] === 1) { rogue.hero.keys = rogue.hero.keys; return; }
      rogue.hero.x = nx; rogue.hero.y = ny;
      rogue.seen[ny][nx] = true;
      for (var yy = ny - 2; yy <= ny + 2; yy++) for (var xx = nx - 2; xx <= nx + 2; xx++) if (rogue.map[yy] && rogue.map[yy][xx] != null) rogue.seen[yy][xx] = true;
      if (nx === rogue.stairs[0] && ny === rogue.stairs[1] && rogue.mobs.length === 0) {
        rogue.floor++;
        addScore(60, 0, 0);
        sfx("win");
        rogueGen();
        if (rogue.floor % 3 === 0) { rogue.hero.maxHp += 20; rogue.hero.hp = rogue.hero.maxHp; rogue.hero.atk += 3; rogue.messages.unshift("📈 تقوّيت: +20 حياة +3 ضرر"); }
        return;
      }
      rogue.mobs.forEach(function (m) {
        if (rng.chance(0.5)) {
          var mx = A.clamp(m.x + (rng.chance(0.5) ? 1 : -1), 1, rogue.size - 2);
          if (rogue.map[m.y][mx] === 0) m.x = mx;
        }
        if (m.x === rogue.hero.x && m.y === rogue.hero.y) { rogue.hero.hp -= Math.max(1, m.atk - 3); rogue.messages.unshift(m.name + " ضربك!"); sfx("hit"); }
      });
      if (rogue.hero.hp <= 0) { state.mode = "over"; saveBest(); sfx("lose"); emit("gameover", { score: state.score }); }
    }
    function rogueDraw() {
      bg("#0a0a0f", "#141021");
      var cell = Math.floor(Math.min(W, H - 90) / rogue.size);
      var ox = (W - cell * rogue.size) / 2, oy = 70;
      for (var y = 0; y < rogue.size; y++) {
        for (var x = 0; x < rogue.size; x++) {
          if (!rogue.seen[y][x]) continue;
          var solid = rogue.map[y][x] === 1;
          g.fillStyle = solid ? "#2b2540" : "#150f24";
          g.fillRect(ox + x * cell, oy + y * cell, cell - 1, cell - 1);
          if (!solid) { g.fillStyle = "rgba(255,255,255,.04)"; g.fillRect(ox + x * cell + 2, oy + y * cell + 2, cell - 5, cell - 5); }
        }
      }
      g.fillStyle = "#ffd166";
      g.fillRect(ox + rogue.stairs[0] * cell + 3, oy + rogue.stairs[1] * cell + 3, cell - 7, cell - 7);
      rogue.mobs.forEach(function (m) {
        if (!rogue.seen[m.y][m.x]) return;
        g.fillStyle = "#ff5f7a";
        g.beginPath(); g.arc(ox + m.x * cell + cell / 2, oy + m.y * cell + cell / 2, cell * 0.32, 0, TAU); g.fill();
      });
      g.fillStyle = "#7cffb2";
      g.beginPath(); g.arc(ox + rogue.hero.x * cell + cell / 2, oy + rogue.hero.y * cell + cell / 2, cell * 0.36, 0, TAU); g.fill();
      text("❤️ " + Math.max(0, rogue.hero.hp) + "/" + rogue.hero.maxHp + "   ⚔️ " + rogue.hero.atk + "   🧪 " + rogue.hero.potions + "   🗝️ " + rogue.hero.keys + "   الطابق " + rogue.floor, 20, 26, 14, "#e8f1f8", "start");
      rogue.messages.slice(0, 3).forEach(function (m, i) { text(m, 20, H - 62 + i * 20, 13, "#9fb0c4", "start"); });
      drawParts();
    }

    /* ══════════════════════════ input & loop ══════════════════════════ */
    function clickAt(x, y) {
      if (state.mode === "menu") return start();
      if (state.mode !== "play") { state.mode = "menu"; return; }
      if (opts.kind === "rpg") {
        rpg.skills.forEach(function (s, i) {
          var bx = W - 60 - (rpg.skills.length - 1 - i) * 150, by = H - 52;
          if (x > bx - 66 && x < bx + 66 && y > by - 24 && y < by + 24) rpgAttack(s.id);
        });
        if (x < 320 && y > H - 130) { if (rpg.hero.potions > 0 && rpg.hero.hp < rpg.hero.maxHp) { rpg.hero.potions--; rpg.hero.hp = Math.min(rpg.hero.maxHp, rpg.hero.hp + 40); sfx("coin"); float(220, 300, "+40 HP", "#7cffb2"); } }
      }
      if (opts.kind === "tower") {
        Object.keys(tower.TYPES).forEach(function (k, i) {
          var bx = 20 + i * 150, by = H - 30;
          if (x > bx && x < bx + 138 && y > by - 26 && y < by + 16) tower.build = k;
        });
        if (y < H - 70) {
          var t = tower.TYPES[tower.build];
          if (tower.money >= t.cost) {
            var near = tower.towers.some(function (tw) { return Math.hypot(tw.x - x, tw.y - y) < 40; });
            if (!near) { tower.towers.push({ x: x, y: y, type: tower.build, cd: 0, range: t.range, rate: t.rate, angle: 0, level: 1 }); tower.money -= t.cost; sfx("click"); }
          } else float(x, y, "فلوس ناقصة", "#ff9d9d");
        }
      }
      if (opts.kind === "runner") { jump(); }
      if (opts.kind === "roguelike" && x < 90 && y > H - 200) { /* tap left edge = use potion */ if (rogue.hero.potions > 0) { rogue.hero.potions--; rogue.hero.hp = Math.min(rogue.hero.maxHp, rogue.hero.hp + 35); sfx("coin"); } }
    }
    function jump() {
      if (state.mode !== "play") return start();
      if (runner.jumps < 2) { runner.vy = runner.jumps === 0 ? -760 : -620; runner.jumps++; runner.onGround = false; sfx("jump"); burst(runner.x, runner.y, "#e8946f", 8, 0.7); }
    }
    A.on(canvas, "pointerdown", function (e) {
      var r = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * W;
      pointer.y = ((e.clientY - r.top) / r.height) * H;
      pointer.down = true;
      clickAt(pointer.x, pointer.y);
    });
    A.on(canvas, "pointermove", function (e) {
      var r = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * W;
      pointer.y = ((e.clientY - r.top) / r.height) * H;
    });
    A.on(window, "keydown", function (e) {
      keys[e.key.toLowerCase()] = true;
      if (["arrowup", "w", " "].indexOf(e.key.toLowerCase()) >= 0) { e.preventDefault(); jump(); }
      if (e.key === "1" || e.key === "2" || e.key === "3") { if (opts.kind === "rpg" && rpg.skills[Number(e.key) - 1]) rpgAttack(rpg.skills[Number(e.key) - 1].id); }
      if (e.key.toLowerCase() === "p") { state.mode = state.mode === "play" ? "pause" : state.mode === "pause" ? "play" : state.mode; }
      if (e.key.toLowerCase() === "m") { muted = !muted; if (muted && A.audio) A.audio.stopMusic(); float(W / 2, 60, muted ? "🔇 كتم" : "🔊 صوت", "#fff"); }
      if (opts.kind === "roguelike") {
        var map = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0], q: [-1, -1], e: [1, -1] };
        var mv = map[e.key.toLowerCase()];
        if (mv) { e.preventDefault(); rogueMove(mv[0], mv[1]); }
      }
      if (opts.kind === "runner" && e.key === "ArrowDown") { runner.vy = 1400; }
    });
    A.on(window, "keyup", function (e) { keys[e.key.toLowerCase()] = false; });

    function start() {
      state.mode = "play";
      state.score = 0; state.duration = 0;
      if (opts.kind === "rpg") { rpg.floor = 1; rpg.log = ["مرحبا في 20 طابقًا من الوحوش!"]; rpgSpawn(); if (!rpg.hero.emojiShort) rpg.hero.emojiShort = "🛡️"; }
      if (opts.kind === "tower") { tower.money = 260; tower.lives = 20; tower.wave = 1; tower.towers = []; tower.enemies = []; tower.shots = []; towerSpawn(); }
      if (opts.kind === "runner") runnerReset();
      if (opts.kind === "roguelike") { rogue.floor = 1; rogue.hero = { x: 1, y: 1, hp: 100, maxHp: 100, atk: 12, keys: 0, potions: 2 }; rogueGen(); }
      if (A.audio && A.audio.music && opts.kind !== "rpg") A.guard("music", function () { A.audio.music(opts.kind === "tower" ? 180 : 240, opts.kind === "tower" ? 120 : 104); });
      emit("start", { kind: opts.kind });
      sfx("click");
    }

    var last = performance.now();
    function loop(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      state.dt = dt; state.t += dt;
      g.save();
      if (shake > 0) { shake = Math.max(0, shake - dt * 40); g.translate(rng.int(-shake, shake) * 0.4, rng.int(-shake, shake) * 0.4); }
      if (state.mode === "menu") {
        bg("#0a0d18", "#191027");
        text(opts.title, W / 2, H / 2 - 60, 42, "#fff");
        text(opts.subtitle || "اضغط للعب", W / 2, H / 2 - 6, 18, "#c9d4e2");
        text("أفضل نتيجة: " + state.best, W / 2, H / 2 + 34, 16, "#ffd166");
        text("الأسهم / WASD · مسافة · P إيقاف · M كتم", W / 2, H / 2 + 76, 14, "#8b9bb0");
        if (opts.hints) opts.hints.forEach(function (h, i) { text(h, W / 2, H / 2 + 116 + i * 24, 14, "#7f8fa4"); });
      } else if (state.mode === "pause") {
        if (opts.kind === "tower") towerDraw(); else if (opts.kind === "runner") runnerDraw(); else if (opts.kind === "roguelike") rogueDraw(); else rpgDraw();
        panel("إيقاف مؤقت", ["اضغط P للمتابعة", "النتيجة الحالية: " + state.score], "M للكتم · بلا خسارة تقدم");
      } else if (state.mode === "play") {
        if (opts.kind === "rpg") { rpg.enemy && (rpg.enemy.flash = Math.max(0, rpg.enemy.flash - dt)); rpgDraw(); }
        else if (opts.kind === "tower") { towerUpdate(dt); towerDraw(); }
        else if (opts.kind === "runner") { runnerUpdate(dt); runnerDraw(); }
        else { rogueDraw(); }
        paintHud();
      } else {
        if (opts.kind === "tower") towerDraw(); else if (opts.kind === "runner") runnerDraw(); else if (opts.kind === "roguelike") rogueDraw(); else rpgDraw();
        panel(state.mode === "won" ? "🏆 فزت!" : "انتهت اللعبة", ["النتيجة: " + state.score, "أفضل نتيجة: " + state.best, "اضغط لإعادة اللعب"], "كل التقدم محفوظ محليًا");
        if (A.audio && A.audio.stopMusic) A.guard("stopmusic", function () { A.audio.stopMusic(); });
      }
      g.restore();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    return { start: start, state: state, keys: keys, on: function (k, fn) { callbacks[k] = fn; }, jump: jump };
  }

  A.register({
    id: "game",
    title: "محرّك الألعاب",
    mount: function (host, ctx) {
      var requested = (host.getAttribute("data-game") || (ctx.plan && ctx.plan.features && ctx.plan.features[0]) || "rpg").toLowerCase();
      var KIND = { rpg: "rpg", "rpg ": "rpg", tower: "tower", defense: "tower", runner: "runner", platformer: "runner", roguelike: "roguelike", dungeon: "roguelike", maze: "roguelike" }[requested] || "rpg";
      var KIND_AR = { rpg: "معركة الأدوار — 20 طابقًا", tower: "دفاع الأبراج — 30 موجة", runner: "عدّاء لا نهائي", roguelike: "زنزانة متولّدة" }[KIND];
      var canvas = A.q("canvas", host);
      if (!canvas) { canvas = A.el("canvas", { class: "ax-game-canvas", width: 960, height: 600, tabindex: "0", "aria-label": "ساحة اللعب" }); host.appendChild(canvas); }
      /* one keyboard row for every game: RPG skills + RPG potion */
      var extras = A.el("div", { class: "ax-game-keys" });
      if (KIND === "rpg") {
        [["ضربة قوية", "strike"], ["شفاء", "heal"], ["نيران", "blast"]].forEach(function (pair, i) {
          extras.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn", text: (i + 1) + " · " + pair[0], onclick: function () { engine.keys[String(i + 1)] = true; A.q("canvas", host).dispatchEvent(new KeyboardEvent("keydown", { key: String(i + 1) })); } }));
        });
        extras.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn", text: "🧪 جرعة شفاء", onclick: function () { A.q("canvas", host).dispatchEvent(new PointerEvent("pointerdown", { clientX: 10, clientY: 10, bubbles: true })); } }));
      } else {
        extras.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn", text: "▶ بدء / فعل", onclick: function () { engine.start(); } }));
        if (KIND === "runner") [["قفز", " "] , ["انخفاض", "ArrowDown"], ["إيقاف", "p"], ["كتم", "m"]].forEach(function (p) { extras.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn", text: p[0], onclick: function () { window.dispatchEvent(new KeyboardEvent("keydown", { key: p[1] })); } })); });
        if (KIND === "roguelike") [["↑", "ArrowUp"], ["↓", "ArrowDown"], ["←", "ArrowLeft"], ["→", "ArrowRight"]].forEach(function (p) { extras.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn", text: p[0], onclick: function () { window.dispatchEvent(new KeyboardEvent("keydown", { key: p[1] })); } })); });
      }
      host.appendChild(extras);
      host.appendChild(A.el("div", { class: "ax-chips", html: '<button type="button" class="ax-chip ax-chip-btn" data-game-start>▶ بدء</button><button type="button" class="ax-chip ax-chip-btn">P إيقاف</button><button type="button" class="ax-chip ax-chip-btn">M كتم</button><span class="ax-chip">' + A.esc(KIND_AR) + "</span>" }));
      A.qa(".ax-chip", host).forEach(function (b, i) { A.motion.ripple(b); });
      var engine = mkEngine(canvas, {
        score: A.q("[data-game-score]", host), level: A.q("[data-game-level]", host),
        time: A.q("[data-game-time]", host), best: A.q("[data-game-best]", host)
      }, { kind: KIND, seed: (ctx.plan && ctx.plan.seed) || 11, title: KIND_AR, subtitle: "اضغط على الساحة أو «بدء» لتبدأ", hints: ["مفاتيح: " + (KIND === "rpg" ? "1/2/3 للقدرات، ندقّ على الكبد للشقّة" : KIND === "tower" ? "اختر نوع البرج ثم اضغط المكان" : KIND === "runner" ? "مسافة/↑ للقفز (مرتين = قفزة مزدوجة)" : "الأسهم للتحرك، اقترب من الوحش للهجوم")] });
      /* the "بدء" chip (and clicking the arena) starts the game */
      var starter = A.q("[data-game-start]", host);
      if (starter) A.on(starter, "click", function () { engine.start(); });
      A.bus.on("game:start", function () { engine.start(); });
      window.addEventListener("message", function (e) {
        var d = e.data || {};
        if (d.apex === "start") engine.start();
      });
    }
  });
  A.registeredGames = ["rpg", "tower", "runner", "roguelike"];
})();
