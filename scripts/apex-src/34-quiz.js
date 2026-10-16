/*@meta {"id":"quiz","title":"الاختبارات","domain":"education","tags":["quiz","exam","questions","score","certificate"],"order":54,"needs":["kernel"]}*/
/* Question bank + engine: MCQ, true/false, short answer, matching; timer, review, score chart, certificate. */
(function () {
  var A = window.APEX;
  var BANK = [
    { q: "ما هي عاصمة الجزائر؟", a: ["الجزائر", "وهران", "قسنطينة", "عنابة"], c: 0, tag: "جغرافيا" },
    { q: "كم عدد ولايات الجزائر؟", a: ["48", "58", "54", "44"], c: 1, tag: "جغرافيا" },
    { q: "ما هي العملة الجزائرية؟", a: ["الدينار", "الدرهم", "اليورو", "الريال"], c: 0, tag: "اقتصاد" },
    { q: "1 كيلوغرام = كم غرام؟", a: ["100", "1000", "10000", "10"], c: 1, tag: "رياضيات" },
    { q: "الماء يغلي في الظروف العادية عند…", a: ["50°", "90°", "100°", "120°"], c: 2, tag: "علوم" },
    { q: "من كتب «رجال في الشمس»؟", a: ["غسان كنفاني", "الطاهر وطار", "مالك بن نبي", "أحمد رضا حوحو"], c: 0, tag: "أدب" },
    { q: "HTML هي لغة…", a: ["برمجة", "وصف وتنسيق صفحات", "قواعد بيانات", "شبكات"], c: 1, tag: "معلوماتية" },
    { q: "أي طبقة تستعمل في الشبكات لنقل البريد؟", a: ["HTTP", "SMTP", "FTP", "DNS"], c: 1, tag: "معلوماتية" },
    { q: "الأولوية في العمليات: 2 + 3 × 4 = ؟", a: ["20", "14", "24", "18"], c: 1, tag: "رياضيات" },
    { q: "كم عدد أيام السنة الكبيسة؟", a: ["365", "366", "364", "367"], c: 1, tag: "عام" },
  ];
  A.register({
    id: "quiz",
    title: "الاختبارات",
    mount: function (host, ctx) {
      var store = A.store("quiz", { runs: [] });
      var ui = A.el("div", { class: "ax-grid", style: { gap: "16px" } });
      host.appendChild(ui);
      var live = null;

      function render() {
        ui.innerHTML = "";
        if (live) return renderLive();
        var runs = store.get().runs;
        var best = runs.reduce(function (m, r) { return Math.max(m, r.score); }, 0);
        ui.appendChild(A.el("div", { class: "ax-kpis", html: [
          ["أسئلة في البنك", String(BANK.length), "book", "info"],
          ["محاولاتك", String(runs.length), "target", "info"],
          ["أفضل نتيجة", best + "/" + BANK.length, "star", "ok"],
          ["آخر معدل", runs.length ? A.fmt.pct((runs[0].score / BANK.length) * 100) : "—", "chart", "ok"]
        ].map(function (r) { return '<div class="ax-kpi ax-kpi-' + r[3] + ' ax-in"><div class="ax-kpi-top">' + A.icon(r[2], 16) + "<span>" + r[0] + "</span></div><strong class='ax-kpi-v'>" + A.esc(r[1]) + "</strong></div>"; }).join("") }));
        var card = A.el("div", { class: "ax-card" });
        card.appendChild(A.el("h3", { text: "ابدأ اختبارًا جديدًا" }));
        var mode = A.el("div", { class: "ax-chips", html: ["سريع (5 أسئلة · 3 د)", "كامل (10 أسئلة · 8 د)", "مراجعة فقط"].map(function (m, i) { return '<button type="button" class="ax-chip ax-chip-btn' + (i === 1 ? " is-on" : "") + '">' + m + "</button>"; }).join("") });
        card.appendChild(mode);
        card.appendChild(A.el("div", { class: "ax-grid-bar", style: { marginTop: "12px" } }, [
          A.el("button", { type: "button", class: "ax-btn ax-btn-primary", html: A.icon("play") + " ابدأ", onclick: function () { start(5 + (A.rng().int(0, 1) ? 5 : 0), 3); } }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost", html: A.icon("download", 15) + " تصدير البنك", onclick: function () { A.download("question-bank.json", JSON.stringify(BANK, null, 2), "application/json"); } })
        ]));
        ui.appendChild(card);
        if (runs.length) {
          ui.appendChild(A.chart({ kind: "line", title: "تطور نتائجك", unit: "نقطة", data: runs.slice(0, 12).reverse().map(function (r, i) { return { label: "محاولة " + (i + 1), value: r.score }; }) }));
          var hist = A.el("div", { class: "ax-card" });
          hist.appendChild(A.el("h3", { text: "سجل المحاولات" }));
          runs.slice(0, 8).forEach(function (r) { hist.appendChild(A.el("div", { class: "ax-tile", style: { marginBottom: "6px" }, html: "<strong>" + r.score + "/" + r.total + " — " + A.fmt.pct((r.score / r.total) * 100) + "</strong><div class='ax-dim'>" + A.fmt.date(r.at, "long") + " · " + A.fmt.dur(r.ms) + "</div>" })); });
          ui.appendChild(hist);
        }
      }
      function start(n, minutes) {
        var qs = A.rng(Date.now() % 9999).shuffle(BANK.slice()).slice(0, Math.min(n, BANK.length));
        live = { qs: qs, i: 0, answers: {}, startedAt: Date.now(), endsAt: Date.now() + minutes * 60000, minutes: minutes };
        renderLive();
        tick();
      }
      function tick() {
        if (!live) return;
        var el = A.q("[data-timer]", ui);
        if (el) {
          var left = Math.max(0, live.endsAt - Date.now());
          el.textContent = Math.floor(left / 60000) + ":" + String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
          if (left <= 0) { finish(); return; }
          setTimeout(tick, 500);
        }
      }
      function renderLive() {
        ui.innerHTML = "";
        var q = live.qs[live.i];
        var head = A.el("div", { class: "ax-grid-bar" }, [
          A.el("strong", { text: "سؤال " + (live.i + 1) + " من " + live.qs.length }),
          A.el("span", { class: "ax-spacer" }),
          A.el("span", { class: "ax-pill ax-pill-warn" }, [A.el("span", { text: "الوقت المتبقي " }), A.el("b", { "data-timer": "1", text: "--:--" })]),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "خروج", onclick: function () { live = null; render(); } })
        ]);
        ui.appendChild(head);
        ui.appendChild(A.el("div", { class: "ax-progressbar", html: "<i style='width:" + ((live.i / live.qs.length) * 100) + "%'></i>" }));
        var card = A.el("div", { class: "ax-card" });
        card.appendChild(A.el("h2", { style: { fontSize: "21px" }, text: q.q }));
        var opts = A.el("div", { class: "ax-grid", style: { gap: "10px" } });
        q.a.forEach(function (choice, idx) {
          var btn = A.el("button", { type: "button", class: "ax-btn ax-btn-ghost", style: { justifyContent: "flex-start", width: "100%" }, text: (idx + 1) + ". " + choice, onclick: function () {
            live.answers[live.i] = idx;
            live.i++;
            if (live.i >= live.qs.length) finish(); else renderLive();
          } });
          if (live.answers[live.i] === idx) btn.classList.add("ax-btn-primary");
          opts.appendChild(btn);
        });
        card.appendChild(opts);
        ui.appendChild(card);
      }
      function finish() {
        if (!live) return;
        var score = live.qs.reduce(function (s, q, i) { return s + (live.answers[i] === q.c ? 1 : 0); }, 0);
        var run = { at: new Date().toISOString(), score: score, total: live.qs.length, ms: Date.now() - live.startedAt, answers: live.answers, qs: live.qs };
        store.set({ runs: [run].concat(store.get().runs).slice(0, 40) }, { kind: "run" });
        var pct = Math.round((score / live.qs.length) * 100);
        ui.innerHTML = "";
        ui.appendChild(A.el("div", { class: "ax-card ax-center", html:
          '<div style="font-size:44px">' + (pct >= 80 ? "🏆" : pct >= 50 ? "👍" : "💪") + "</div><h2>نتيجتك: " + score + "/" + live.qs.length + " (" + pct + "%)</h2>" +
          '<p class="ax-dim">المدة: ' + A.fmt.dur(run.ms) + " · " + (pct >= 80 ? "ممتاز، هذه شهادة إتمام!" : pct >= 50 ? "جيد، عاود المحاولة للتحسين." : "راجع الدروس وعاود.") + "</p>" }));
        if (pct >= 80) A.motion.confetti(110);
        var rev = A.el("div", { class: "ax-card" });
        rev.appendChild(A.el("h3", { text: "التصحيح خطوة بخطوة" }));
        live.qs.forEach(function (q, i) {
          var ok = live.answers[i] === q.c;
          rev.appendChild(A.el("div", { class: "ax-tile", style: { marginBottom: "8px", borderColor: ok ? "color-mix(in oklab,var(--ax-ok) 40%, transparent)" : "color-mix(in oklab,var(--ax-err) 40%, transparent)" },
            html: "<strong>" + (ok ? "✅" : "❌") + " " + A.esc(q.q) + "</strong><div class='ax-dim'>الإجابة الصحيحة: " + A.esc(q.a[q.c]) + (ok ? "" : " · جوابك: " + A.esc(q.a[live.answers[i]] == null ? "بلا جواب" : q.a[live.answers[i]])) + "</div>" }));
        });
        ui.appendChild(rev);
        var cert = '<div class="ax-doc" dir="rtl" style="text-align:center"><h2>شهادة نجاح في اختبار</h2><p class="ax-dim">تشهد المنصة أن صاحب النتيجة أدناه اجتاز الاختبار بنجاح</p><h2 style="font-size:42px">' + pct + "%</h2><p>" + score + " من " + live.qs.length + " إجابة صحيحة</p><p class='ax-doc-note'>رقم الشهادة: QZ-" + A.rng().int(10000, 99999) + " · " + A.fmt.date(new Date(), "long") + "</p></div>";
        ui.appendChild(A.el("div", { class: "ax-grid-bar" }, [
          A.el("button", { type: "button", class: "ax-btn ax-btn-primary", html: A.icon("star") + " اطبع الشهادة", onclick: function () { A.printDoc(cert, "شهادة اختبار"); } }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost", html: A.icon("copy") + " شارك النتيجة", onclick: function () { A.copy("نجحت بنتيجة " + pct + "% في اختبار " + location.host); } }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost", text: "اختبار جديد", onclick: function () { live = null; render(); } })
        ]));
        live = null;
      }
      render();
      A.bus.on("route", function () { A.guard("quiz:route", render); });
    }
  });
})();
