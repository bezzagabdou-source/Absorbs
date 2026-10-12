
  /* ══ BLUEPRINT 12 — QUIZ: fast general knowledge, 4 answers, combo ═══ */
  function bpQuiz() {
    /* self-contained question bank (no network, no external data) */
    var BANK = {
      ar: [
        ["ما هي عاصمة الجزائر؟", ["وهران", "الجزائر العاصمة", "قسنطينة", "عنابة"], 1],
        ["كم عدد أيام السنة الكبيسة؟", ["365", "366", "364", "367"], 1],
        ["ما هو أكبر كوكب في المجموعة الشمسية؟", ["الأرض", "المشتري", "زحل", "المريخ"], 1],
        ["من اخترع المصباح الكهربائي؟", ["نيوتن", "أديسون", "غاليليو", "تسلا"], 1],
        ["ما هي العملة الرسمية للجزائر؟", ["الدينار", "الدرهم", "اليورو", "الريال"], 0],
        ["كم عدد قارات العالم؟", ["5", "6", "7", "8"], 2],
        ["ما هو أطول نهر في العالم؟", ["النيل", "الأمازون", "السين", "دانوب"], 1],
        ["في أي سنة استقلت الجزائر؟", ["1954", "1962", "1958", "1972"], 1],
        ["ما هو الحيوان الأسرع على الأرض؟", ["الحصان", "الفهد", "الغزال", "الكلب"], 1],
        ["كم عدد ألوان قوس قزح؟", ["5", "6", "7", "8"], 2],
        ["ما هو أكبر محيط في العالم؟", ["الأطلسي", "الهادئ", "الهندي", "المتجمد"], 1],
        ["ما هي اللغة الأكثر تحدثاً في العالم؟", ["الإنجليزية", "الصينية", "الإسبانية", "العربية"], 1],
        ["كم درجة هي الزاوية القائمة؟", ["45", "60", "90", "180"], 2],
        ["ما هو العنصر الكيميائي للرمز O؟", ["الأكسجين", "الذهب", "الأوزون", "الحديد"], 0],
        ["كم عدد لاعبي فريق كرة القدم؟", ["9", "10", "11", "12"], 2],
        ["ما هي أصغر دولة في العالم؟", ["موناكو", "الفاتيكان", "سان مارينو", "ليختنشتاين"], 1],
        ["من كتب رواية البؤساء؟", ["دوستويفسكي", "فيكتور هوغو", "بلزاك", "موباسان"], 1],
        ["كم عدد أسنان الإنسان البالغ؟", ["28", "30", "32", "34"], 2]
      ],
      fr: [
        ["Quelle est la capitale de l'Algérie ?", ["Oran", "Alger", "Constantine", "Annaba"], 1],
        ["Combien de jours compte une année bissextile ?", ["365", "366", "364", "367"], 1],
        ["Quelle est la plus grande planète du système solaire ?", ["Terre", "Jupiter", "Saturne", "Mars"], 1],
        ["Qui a inventé l'ampoule électrique ?", ["Newton", "Edison", "Galilée", "Tesla"], 1],
        ["Combien de continents compte la Terre ?", ["5", "6", "7", "8"], 2],
        ["Quel est le plus long fleuve du monde ?", ["Nil", "Amazone", "Seine", "Danube"], 1],
        ["Combien de couleurs compte l'arc-en-ciel ?", ["5", "6", "7", "8"], 2],
        ["Quel est le plus grand océan ?", ["Atlantique", "Pacifique", "Indien", "Arctique"], 1],
        ["Combien mesure un angle droit ?", ["45", "60", "90", "180"], 2],
        ["Quel animal est le plus rapide ?", ["Cheval", "Guépard", "Gazelle", "Chien"], 1],
        ["Combien de joueurs dans une équipe de foot ?", ["9", "10", "11", "12"], 2],
        ["Quel est le plus petit pays du monde ?", ["Monaco", "Vatican", "Saint-Marin", "Liechtenstein"], 1],
        ["Qui a écrit Les Misérables ?", ["Dostoïevski", "Victor Hugo", "Balzac", "Maupassant"], 1],
        ["Combien de dents a un adulte ?", ["28", "30", "32", "34"], 2],
        ["Quelle est la monnaie de l'Algérie ?", ["Dinar", "Dirham", "Euro", "Riyal"], 0],
        ["En quelle année l'Algérie a-t-elle été indépendante ?", ["1954", "1962", "1958", "1972"], 1],
        ["Que représente le symbole chimique O ?", ["Oxygène", "Or", "Ozone", "Osmium"], 0],
        ["Combien de pays compte le Maghreb ?", ["3", "4", "5", "6"], 2]
      ],
      en: [
        ["What is the capital of Algeria?", ["Oran", "Algiers", "Constantine", "Annaba"], 1],
        ["How many days in a leap year?", ["365", "366", "364", "367"], 1],
        ["What is the largest planet?", ["Earth", "Jupiter", "Saturn", "Mars"], 1],
        ["Who invented the light bulb?", ["Newton", "Edison", "Galileo", "Tesla"], 1],
        ["How many continents are there?", ["5", "6", "7", "8"], 2],
        ["What is the longest river?", ["Nile", "Amazon", "Seine", "Danube"], 1],
        ["How many colours in a rainbow?", ["5", "6", "7", "8"], 2],
        ["Which is the largest ocean?", ["Atlantic", "Pacific", "Indian", "Arctic"], 1],
        ["How many degrees in a right angle?", ["45", "60", "90", "180"], 2],
        ["What is the fastest land animal?", ["Horse", "Cheetah", "Gazelle", "Dog"], 1],
        ["How many players in a football team?", ["9", "10", "11", "12"], 2],
        ["What is the smallest country?", ["Monaco", "Vatican", "San Marino", "Liechtenstein"], 1],
        ["Who wrote Les Misérables?", ["Dostoevsky", "Victor Hugo", "Balzac", "Maupassant"], 1],
        ["How many teeth does an adult have?", ["28", "30", "32", "34"], 2],
        ["What is the currency of Algeria?", ["Dinar", "Dirham", "Euro", "Riyal"], 0],
        ["In which year did Algeria gain independence?", ["1954", "1962", "1958", "1972"], 1],
        ["What does the chemical symbol O stand for?", ["Oxygen", "Gold", "Ozone", "Iron"], 0],
        ["How many planets are in the solar system?", ["7", "8", "9", "10"], 1]
      ]
    };
    var QZ = {
      ar: { right: "صحيح!", wrong: "خطأ", of: "من", time: "الوقت", tap: "اضغط على الجواب" },
      fr: { right: "Correct !", wrong: "Faux", of: "sur", time: "Temps", tap: "Touchez la réponse" },
      en: { right: "Correct!", wrong: "Wrong", of: "of", time: "Time", tap: "Tap the answer" }
    };

    var q, order, picked, asked, total, right, timeLeft, locked, flashOk, flashBad, boxes, qText;
    function L() { return QZ[CFG.lang] || QZ.ar; }

    function reset() {
      maxHealth = 100; health = 100; lives = 3;
      total = clamp(CFG.levels || 10, 3, 30);
      asked = 0; right = 0; picked = -1; locked = false;
      flashOk = 0; flashBad = 0;
      timeLeft = CFG.timed ? (CFG.difficulty === "easy" ? 22 : CFG.difficulty === "hard" ? 11 : CFG.difficulty === "insane" ? 8 : 15) : 0;
      boxes = [];
      nextQuestion();
    }
    function nextQuestion() {
      var bank = BANK[CFG.lang] || BANK.ar;
      q = bank[rint(0, bank.length - 1)];
      order = [0, 1, 2, 3];
      for (var i = order.length - 1; i > 0; i--) {
        var j = rint(0, i);
        var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
      }
      picked = -1; locked = false;
      qText = q[0];
      if (CFG.timed) timeLeft = CFG.difficulty === "easy" ? 22 : CFG.difficulty === "hard" ? 11 : CFG.difficulty === "insane" ? 8 : 15;
    }
    function answer(i) {
      if (locked || i < 0 || i > 3) return;
      locked = true;
      picked = i;
      var correct = order[i] === q[2];
      if (correct) {
        right++;
        addCombo();
        var bonus = Math.round(60 + Math.max(0, timeLeft) * 6);
        addScore(bonus, W / 2, H * 0.42, "");
        coins++;
        flashOk = 0.5;
        SFX.coin();
        burst(W / 2, H * 0.5, 18, THEME.gold, 200, 0.6);
        floatText(W / 2, H * 0.4, L().right, THEME.gold);
      } else {
        flashBad = 0.5;
        resetCombo();
        hurt(26);
        SFX.hit();
        shake = 0.5;
        floatText(W / 2, H * 0.4, L().wrong, THEME.rose);
      }
      asked++;
      paintHud();
      setTimeout(function () {
        if (asked >= total || health <= 0) { setState("GAMEOVER"); return; }
        nextQuestion();
      }, correct ? 520 : 900);
    }
    function update(dt) {
      runTime += dt;
      flashOk = Math.max(0, flashOk - dt);
      flashBad = Math.max(0, flashBad - dt);
      if (CFG.timed && !locked) {
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; answer(-1); }
      }
      if (touch.tap) {
        var p = { x: touch.x, y: touch.y };
        for (var i = 0; i < boxes.length; i++) {
          var b = boxes[i];
          if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { answer(i); break; }
        }
      }
      for (var k = 1; k <= 4; k++) if (pressed[k.toString()]) answer(k - 1);
      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) resetCombo(); }
      paintHud();
    }
    function draw(t) {
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      /* progress */
      var pw = W * 0.84, px = W * 0.08, py = H * 0.13;
      roundRect(px, py, pw, 8, 4);
      ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fill();
      roundRect(px, py, pw * clamp(asked / total, 0, 1), 8, 4);
      ctx.fillStyle = THEME.accent; ctx.fill();
      ctx.font = "800 " + Math.round(clamp(W * 0.03, 11, 15)) + "px " + FONT;
      ctx.fillStyle = THEME.dim;
      ctx.fillText(asked + " " + L().of + " " + total + "  ·  " + right + " ✓", W / 2, py + 22);
      if (CFG.timed) {
        var tw = pw * clamp(timeLeft / 20, 0, 1);
        roundRect(px, py + 14, tw, 4, 2);
        ctx.fillStyle = timeLeft < 5 ? THEME.rose : THEME.gold;
        ctx.fill();
      }
      /* question */
      ctx.font = "900 " + Math.round(clamp(W * 0.055, 17, 27)) + "px " + FONT;
      ctx.fillStyle = THEME.text;
      wrapText(qText, W / 2, H * 0.3, W * 0.86, clamp(H * 0.038, 24, 34));
      /* answers */
      boxes = [];
      var bw = W * 0.84, bh = clamp(H * 0.085, 50, 74);
      var bx = W * 0.08, by = H * 0.44;
      for (var i = 0; i < 4; i++) {
        var y = by + i * (bh + 10);
        var isPicked = picked === i;
        var isRight = locked && order[i] === q[2];
        var col = isRight ? THEME.aqua : isPicked ? THEME.rose : THEME.brick0;
        ctx.save();
        if (isPicked || isRight) { ctx.shadowColor = col; ctx.shadowBlur = 20; }
        var g = ctx.createLinearGradient(bx, y, bx + bw, y + bh);
        g.addColorStop(0, col);
        g.addColorStop(1, THEME.brick1);
        ctx.fillStyle = g;
        roundRect(bx, y, bw, bh, 14); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = isPicked || isRight ? THEME.text : THEME.edge;
        ctx.lineWidth = 1.4;
        roundRect(bx, y, bw, bh, 14); ctx.stroke();
        ctx.restore();
        ctx.font = "800 " + Math.round(clamp(W * 0.036, 13, 19)) + "px " + FONT;
        ctx.fillStyle = THEME.text;
        ctx.fillText(q[1][order[i]], bx + bw / 2, y + bh / 2);
        ctx.font = "900 " + Math.round(clamp(W * 0.03, 11, 15)) + "px " + FONT;
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.textAlign = CFG.lang === "ar" ? "right" : "left";
        ctx.fillText(String(i + 1), CFG.lang === "ar" ? bx + bw - 14 : bx + 14, y + bh / 2);
        ctx.textAlign = "center";
        boxes.push({ x: bx, y: y, w: bw, h: bh });
      }
      if (flashOk > 0) {
        ctx.globalAlpha = flashOk * 0.35; ctx.fillStyle = THEME.gold; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      }
      if (flashBad > 0) {
        ctx.globalAlpha = flashBad * 0.35; ctx.fillStyle = THEME.rose; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      }
      void t;
    }
    function wrapText(txt, cx, cy, maxW, lh) {
      var words = String(txt).split(" ");
      var lines = [], line = "";
      for (var i = 0; i < words.length; i++) {
        var test = line ? line + " " + words[i] : words[i];
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = words[i]; }
        else line = test;
      }
      if (line) lines.push(line);
      var start = cy - ((lines.length - 1) * lh) / 2;
      for (var j = 0; j < lines.length; j++) ctx.fillText(lines[j], cx, start + j * lh);
    }
    function drawIdle(t) {
      for (var i = 0; i < 4; i++) {
        var y = H * 0.44 + i * (clamp(H * 0.085, 50, 74) + 10);
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = i === Math.floor((t * 0.8) % 4) ? THEME.accent : THEME.brick0;
        roundRect(W * 0.08, y, W * 0.84, clamp(H * 0.085, 50, 74), 14);
        ctx.fill();
        ctx.restore();
      }
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "900 " + Math.round(clamp(W * 0.05, 16, 24)) + "px " + FONT;
      ctx.fillStyle = THEME.gold;
      ctx.fillText("?", W / 2, H * 0.26);
    }
    function help() { return STR.help.quiz; }
    function starScore() { return Math.max(120, total * 40); }
    return { reset: reset, update: update, draw: draw, drawIdle: drawIdle, help: help, starScore: starScore };
  }
