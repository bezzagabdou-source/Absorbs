/*@meta {"id":"lms","title":"منصة التكوين","domain":"education","tags":["lms","courses","lessons","progress","certificate"],"order":53,"needs":["kernel"]}*/
/* Course catalogue, lesson player, progress tracking, notes/bookmarks, streaks, certificate trigger. */
(function () {
  var A = window.APEX;
  A.register({
    id: "lms",
    title: "منصة التكوين",
    mount: function (host, ctx) {
      var courses = (ctx.data.courses || []).slice();
      var store = A.store("lms", { done: {}, notes: {}, bookmark: {}, streak: 1, last: null });
      var ui = A.el("div", { class: "ax-grid", style: { gap: "16px" } });
      host.appendChild(ui);
      var current = null;

      function progress(c) {
        var done = store.get().done;
        var map = done[c.id] || {};
        var n = Object.keys(map).filter(function (k) { return map[k]; }).length;
        return Math.round((n / Math.max(1, c.lessons)) * 100);
      }
      function lessonsOf(c) {
        var titles = ["مقدمة ومفاهيم", "الإعداد والتنصيب", "أول تطبيق عملي", "التعمق في التفاصيل", "حالات دراسية جزائرية", "الأخطاء الشائعة", "تحسين الأداء", "النشر والمتابعة", "مشروع نهائي", "المراجعة والتقييم"];
        return Array.from({ length: Math.min(c.lessons, 12) }, function (_, i) {
          return { n: i + 1, title: titles[i % titles.length], minutes: 6 + ((i * 7 + c.hours) % 24) };
        });
      }
      function render() {
        ui.innerHTML = "";
        if (current) return renderCourse(current);
        var s = store.get();
        var totalDone = Object.keys(s.done).reduce(function (acc, k) { return acc + Object.keys(s.done[k]).filter(function (x) { return s.done[k][x]; }).length; }, 0);
        var rowsK = [
          ["دورات متوفرة", String(courses.length), "book", "info"],
          ["دروس مكتملة", String(totalDone), "check", "ok"],
          ["سلسلة الأيام", s.streak + " يوم 🔥", "bolt", "ok"],
          ["ساعات التكوين", String(courses.reduce(function (a, c) { return a + c.hours; }, 0)) + " س", "clock", "info"]
        ];
        var kpis = A.el("div", { class: "ax-kpis", html: rowsK.map(function (r) { return '<div class="ax-kpi ax-kpi-' + r[3] + ' ax-in"><div class="ax-kpi-top">' + A.icon(r[2], 16) + "<span>" + r[0] + "</span></div><strong class='ax-kpi-v'>" + A.esc(r[1]) + "</strong></div>"; }).join("") });
        ui.appendChild(kpis);
        var cards = A.el("div", { class: "ax-products", style: { gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))" } });
        courses.forEach(function (c, i) {
          var p = progress(c);
          var card = A.el("article", { class: "ax-product ax-in", style: { padding: "16px", animationDelay: (i * 20) + "ms" } });
          card.appendChild(A.el("div", { class: "ax-chips", html: '<span class="ax-chip">' + A.esc(c.category) + '</span><span class="ax-chip">' + A.esc(c.level || "") + "</span>" }));
          card.appendChild(A.el("h3", { style: { marginTop: "8px" }, text: c.title }));
          card.appendChild(A.el("p", { class: "ax-dim", style: { fontSize: "13.5px" }, text: "👨‍🏫 " + A.esc(c.teacher) + " · " + c.lessons + " درس · " + c.hours + " ساعة" }));
          card.appendChild(A.el("div", { class: "ax-progressbar", html: "<i style='width:" + p + "%'></i>" }));
          card.appendChild(A.el("div", { class: "ax-dim", style: { fontSize: "12.5px", display: "flex", justifyContent: "space-between" }, html: "<span>" + (c.price ? A.fmt.dzd(c.price) : "مجاني") + "</span><span>" + p + "% مكتمل</span>" }));
          card.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", style: { marginTop: "10px" }, html: A.icon("play", 15) + (p ? " واصل" : " ابدأ"), onclick: function () { current = c; render(); } }));
          cards.appendChild(card);
        });
        ui.appendChild(cards);
      }
      function renderCourse(c) {
        var head = A.el("div", { class: "ax-grid-bar" }, [
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "→ كل الدورات", onclick: function () { current = null; render(); } }),
          A.el("span", { class: "ax-spacer" }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("star", 15) + " أضف للمفضلة", onclick: function () { var bm = store.get().bookmark; bm[c.id] = !bm[c.id]; store.set({ bookmark: bm }); A.toast("حدّثنا المفضلة", "ok"); } }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", html: A.icon("download", 15) + " شهادة", onclick: function () { A.bus.emit("lms:certificate", c); A.toast("افتح «الشهادة» في القائمة", "info", 2600); } })
        ]);
        ui.appendChild(head);
        var two = A.el("div", { class: "ax-two", style: { alignItems: "start" } });
        var list = A.el("div", { class: "ax-card" });
        list.appendChild(A.el("h3", { text: c.title }));
        list.appendChild(A.el("p", { class: "ax-dim", text: "المدرّب: " + c.teacher + " · " + c.hours + " ساعة · التقييم " + c.rating + "/5" }));
        var done = store.get().done[c.id] || {};
        lessonsOf(c).forEach(function (l) {
          var row = A.el("div", { class: "ax-tile", style: { marginBottom: "8px", display: "flex", gap: "10px", alignItems: "center" } });
          row.appendChild(A.el("input", { type: "checkbox", class: "ax-check", "aria-label": "إكمال الدرس " + l.n, checked: done[l.n] ? "checked" : null, onclick: function () {
            var all = store.get().done;
            all[c.id] = Object.assign({}, all[c.id] || {});
            all[c.id][l.n] = !all[c.id][l.n];
            store.set({ done: all, streak: (store.get().streak || 0) + (all[c.id][l.n] ? 1 : 0), last: new Date().toISOString() }, { kind: "lesson" });
            render();
          } }));
          row.appendChild(A.el("div", { style: { flex: "1" }, html: "<strong>" + l.n + ". " + A.esc(l.title) + "</strong><div class='ax-dim' style='font-size:12.5px'>⏱ " + l.minutes + " دقيقة</div>" }));
          row.appendChild(A.el("button", { type: "button", class: "ax-icon-btn", title: "ملاحظة", "aria-label": "ملاحظة", html: A.icon("edit", 15), onclick: function () {
            var box = A.el("textarea", { class: "ax-input", rows: 4, placeholder: "اكتب ملاحظتك على هذا الدرس…" });
            box.value = (store.get().notes[c.id + ":" + l.n]) || "";
            A.modal({ title: "ملاحظة الدرس " + l.n, html: box, actions: [
              { label: "حفظ", kind: "primary", onClick: function () {
                var notes = store.get().notes; notes[c.id + ":" + l.n] = box.value; store.set({ notes: notes }); A.toast("حُفظت الملاحظة", "ok");
              } },
              { label: "إلغاء", kind: "ghost" }
            ] });
          } }));
          list.appendChild(row);
        });
        two.appendChild(list);

        var side = A.el("div", { class: "ax-grid", style: { gap: "14px" } });
        side.appendChild(A.chart({ kind: "gauge", title: "تقدّمك في الدورة", value: progress(c), max: 100, suffix: "%", centerLabel: "مكتمل" }));
        var notes = A.el("div", { class: "ax-card" });
        notes.appendChild(A.el("h3", { text: "ملاحظاتك" }));
        var mine = Object.keys(store.get().notes).filter(function (k) { return k.indexOf(c.id + ":") === 0; });
        if (!mine.length) notes.appendChild(A.el("p", { class: "ax-dim", text: "بلا ملاحظات بعد" }));
        mine.forEach(function (k) { notes.appendChild(A.el("div", { class: "ax-tile", style: { marginBottom: "6px" }, html: "<strong>درس " + k.split(":")[1] + "</strong><p style='margin:4px 0 0'>" + A.esc(store.get().notes[k]) + "</p>" })); });
        side.appendChild(notes);
        side.appendChild(A.chart({ kind: "radar", title: "مهاراتك في هذه الدورة", axes: [{ label: "الأساسيات" }, { label: "التطبيق" }, { label: "الجودة" }, { label: "السرعة" }, { label: "الاستقلالية" }], series: [{ label: "أنت", values: [minMax(progress(c)), minMax(progress(c) - 8), minMax(progress(c) + 4), minMax(progress(c) - 3), minMax(progress(c) + 9)] }] }));
        two.appendChild(side);
        ui.appendChild(two);
      }
      function minMax(v) { return Math.max(8, Math.min(99, v)); }
      render();
      A.bus.on("route", function () { A.guard("lms:route", render); });
    }
  });
})();
