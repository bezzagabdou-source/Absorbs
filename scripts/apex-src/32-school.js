/*@meta {"id":"school","title":"إدارة المدرسة","domain":"education","tags":["school","students","marks","attendance","bulletin"],"order":52,"needs":["kernel"]}*/
/* Students, marks with the real Algerian average rules, attendance, rankings, bulletins. */
(function () {
  var A = window.APEX;
  function mention(avg) {
    if (avg >= 18) return { ar: "ممتاز جدًا", tone: "ok" };
    if (avg >= 16) return { ar: "ممتاز", tone: "ok" };
    if (avg >= 14) return { ar: "جيد جدًا", tone: "ok" };
    if (avg >= 12) return { ar: "جيد", tone: "info" };
    if (avg >= 10) return { ar: "مقبول", tone: "warn" };
    return { ar: "ضعيف — يحتاج دعم", tone: "err" };
  }
  A.register({
    id: "school",
    title: "المدرسة",
    mount: function (host, ctx) {
      var students = (ctx.data.students || []).slice();
      var SUBJECTS = ["رياضيات", "فيزياء", "علوم طبيعية", "لغة عربية", "لغة فرنسية", "لغة إنجليزية", "تاريخ وجغرافيا", "تربية إسلامية", "معلوماتية", "تربية بدنية"];
      var store = A.store("school", { absences: {}, remarks: {} });
      var ui = A.el("div", { class: "ax-grid", style: { gap: "16px" } });
      host.appendChild(ui);

      function avg(s) { return s.average; }
      function render() {
        ui.innerHTML = "";
        var ranked = students.slice().sort(function (a, b) { return avg(b) - avg(a); });
        var passed = students.filter(function (s) { return avg(s) >= 10; }).length;
        var att = students.length ? students.reduce(function (x, s) { return x + s.attendance; }, 0) / students.length : 0;
        var kpis = A.el("div", { class: "ax-kpis" });
        [
          { k: "تلاميذ مسجّلون", v: A.fmt.int(students.length), i: "users", tone: "info" },
          { k: "نسبة النجاح", v: A.fmt.pct((passed / Math.max(1, students.length)) * 100), i: "target", tone: "ok" },
          { k: "متوسط الحضور", v: A.fmt.pct(att), i: "check", tone: att > 90 ? "ok" : "warn" },
          { k: "الأول في القسم", v: (ranked[0] && ranked[0].name) || "—", i: "star", tone: "ok" }
        ].forEach(function (c) { kpis.appendChild(A.el("div", { class: "ax-kpi ax-kpi-" + c.tone + " ax-in", html: '<div class="ax-kpi-top">' + A.icon(c.i, 16) + "<span>" + c.k + "</span></div><strong class='ax-kpi-v' style='font-size:19px'>" + A.esc(c.v) + "</strong>" })); });
        ui.appendChild(kpis);

        var two = A.el("div", { class: "ax-two" });
        var dist = {};
        students.forEach(function (s) { var m = mention(avg(s)).ar; dist[m] = (dist[m] || 0) + 1; });
        two.appendChild(A.chart({ kind: "donut", title: "توزيع التقديرات", centerLabel: "تلميذ", data: Object.keys(dist).map(function (k) { return { label: k, value: dist[k] }; }) }));
        two.appendChild(A.chart({ kind: "bar", title: "معدل كل مادة", unit: "/20", data: SUBJECTS.map(function (sub, i) {
          var vals = students.map(function (s) { return s.marks[i % s.marks.length]; }).filter(function (v) { return typeof v === "number"; });
          return { label: sub, value: Math.round((vals.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, vals.length)) * 100) / 100 };
        }) }));
        ui.appendChild(two);

        var card = A.el("div", { class: "ax-card" });
        card.appendChild(A.el("div", { class: "ax-grid-bar" }, [
          A.el("h3", { style: { margin: "0" }, text: "قائمة التلاميذ" }),
          A.el("span", { class: "ax-spacer" }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", html: A.icon("plus", 15) + " تلميذ جديد", onclick: addStudent }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("download", 15) + " Excel/CSV", onclick: function () {
            A.download("students.csv", A.csv(students.map(function (s) { return { الاسم: s.name, القسم: s.class, الحضور: s.attendance, المعدل: s.average, الحالة: mention(s.average).ar }; })), "text/csv;charset=utf-8");
          } })
        ]));
        var grid = A.el("div", { class: "ax-grid-scroll", style: { marginTop: "12px" } });
        var t = A.el("table", { class: "ax-table" });
        t.innerHTML = "<thead><tr><th>#</th><th>الاسم</th><th>القسم</th><th class='ax-num'>المعدل</th><th>التقدير</th><th class='ax-num'>الحضور</th><th>الولي</th><th>إجراءات</th></tr></thead>";
        var tb = A.el("tbody");
        ranked.slice(0, 60).forEach(function (s, i) {
          var m = mention(avg(s));
          var tr = A.el("tr", { class: "ax-row" });
          tr.innerHTML = "<td>" + (i + 1) + "</td><td><strong>" + A.esc(s.name) + "</strong><div class='ax-dim' style='font-size:11.5px'>" + A.esc(s.birth || "") + "</div></td><td>" + A.esc(s.class || s.level) + "</td><td class='ax-num'><b>" + A.fmt.num(avg(s), 2) + "</b></td><td><span class='ax-pill ax-pill-" + (m.tone === "err" ? "err" : m.tone === "warn" ? "warn" : "ok") + "'>" + m.ar + "</span></td><td class='ax-num'>" + A.fmt.pct(s.attendance) + "</td><td>" + A.esc(s.guardian || "—") + "</td>";
          var acts = A.el("td", { class: "ax-acts" });
          acts.appendChild(A.el("button", { type: "button", class: "ax-icon-btn", title: "الكشف", "aria-label": "كشف", html: A.icon("book", 15), onclick: function () { bulletin(s); } }));
          acts.appendChild(A.el("button", { type: "button", class: "ax-icon-btn", title: "غياب", "aria-label": "غياب", html: A.icon("calendar", 15), onclick: function () {
            var ab = store.get().absences; ab[s.id] = (ab[s.id] || 0) + 1;
            s.attendance = Math.max(0, s.attendance - 1);
            store.set({ absences: ab }, { kind: "abs" });
            render(); A.toast("سُجّل غياب لـ " + s.name, "warn", 1600);
          } }));
          tr.appendChild(acts);
          tb.appendChild(tr);
        });
        t.appendChild(tb);
        grid.appendChild(t);
        card.appendChild(grid);
        ui.appendChild(card);
      }
      function bulletin(s) {
        var marks = SUBJECTS.map(function (sub, i) {
          var v = s.marks[i % s.marks.length];
          return "<tr><td>" + sub + "</td><td class='n'>" + A.fmt.num(v, 2) + "</td><td class='n'>" + (v * 1).toFixed(2) + "</td><td class='n'>" + A.fmt.num(v * 3, 2) + "</td></tr>";
        }).join("");
        var m = mention(avg(s));
        var html = '<div class="ax-doc" dir="rtl"><header class="ax-doc-head"><div><h2>كشف النقاط الفصلي</h2><p class="ax-dim">' + A.esc(s.class || "القسم") + " · السنة الدراسية 2025/2026</p></div><div class='ax-doc-meta'><b>" + A.esc(s.name) + "</b><span>رقم: " + A.esc(s.id) + "</span><span>المعدل: " + A.fmt.num(avg(s), 2) + "/20</span></div></header>" +
          "<table class='ax-doc-table'><thead><tr><th>المادة</th><th class='n'>الفرض</th><th class='n'>الاختبار</th><th class='n'>المعدل ×3</th></tr></thead><tbody>" + marks + "</tbody></table>" +
          "<div class='ax-doc-totals'><div><span>المعدل الفصلي</span><b>" + A.fmt.num(avg(s), 2) + "</b></div><div class='ax-doc-grand'><span>التقدير</span><b>" + m.ar + "</b></div><div><span>الحضور</span><b>" + A.fmt.pct(s.attendance) + "</b></div></div>" +
          "<p class='ax-doc-note'>ملاحظة الأستاذ: " + A.esc((store.get().remarks[s.id]) || "تلميذ منتظم — واصل هكذا.") + "</p><footer class='ax-doc-foot'>توقيع الولي: ______________ &nbsp; ختم المؤسسة: ______________</footer></div>";
        A.modal({ title: "كشف " + s.name, wide: true, html: '<div class="ax-invoice-preview">' + html + "</div>", actions: [
          { label: "طباعة", kind: "primary", icon: "download", onClick: function () { A.printDoc(html, "كشف " + s.name); } },
          { label: "إغلاق", kind: "ghost" }
        ] });
      }
      function addStudent() {
        var f = A.form({
          fields: [
            { name: "name", label: "الاسم الكامل", validate: "required|len:4" },
            { name: "class", label: "القسم", type: "select", options: ["1 ع ت 1", "2 ع ت 2", "3 ت ر 1", "4 ع ت 3"], value: "1 ع ت 1" },
            { name: "birth", label: "تاريخ الميلاد", type: "date" },
            { name: "guardian", label: "الولي", validate: "required" },
            { name: "phone", label: "هاتف الولي", mask: "phone", validate: "phone" },
            { name: "average", label: "المعدل الأولي", type: "number", value: 12, validate: "min:0|max:20" }
          ],
          submit: "أضف",
          onSubmit: function (v) {
            students.unshift(Object.assign({ id: A.uid("S"), attendance: 100, marks: [Number(v.average) || 10], subject: "عام", status: "منتظم" }, v, { average: Number(v.average) || 10 }));
            modal.close(); render(); A.toast("أُضيف التلميذ", "ok");
          }
        });
        var modal = A.modal({ title: "تلميذ جديد", html: f.el, actions: [{ label: "إغلاق", kind: "ghost" }] });
      }
      render();
      A.bus.on("route", function () { A.guard("school:route", render); });
    }
  });
})();
