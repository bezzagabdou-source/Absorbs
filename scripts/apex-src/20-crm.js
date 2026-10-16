/*@meta {"id":"crm","title":"إدارة العملاء","domain":"business","tags":["crm","clients","pipeline","sales"],"order":40,"needs":["kernel"]}*/
/* Leads → customers: scoring, pipeline stats, activity timeline, quick actions, CSV export. */
(function () {
  var A = window.APEX;
  var STAGES = ["عميل محتمل", "تواصل أولي", "عرض سعر", "تفاوض", "رابح", "خسارة"];
  A.register({
    id: "crm",
    title: "إدارة العملاء",
    mount: function (host, ctx) {
      var rows = (ctx.data.contacts || []).slice();
      var store = A.store("crm", { notes: {}, owners: {} });
      var ui = A.el("div", { class: "ax-crm" });
      host.appendChild(ui);

      function stats() {
        var byStage = {}, total = 0, won = 0, wonValue = 0;
        rows.forEach(function (r) {
          byStage[r.stage] = (byStage[r.stage] || 0) + 1;
          total += Number(r.value) || 0;
          if (r.stage === "رابح") { won++; wonValue += Number(r.value) || 0; }
        });
        return { byStage: byStage, total: total, won: won, wonValue: wonValue, conv: rows.length ? (won / rows.length) * 100 : 0 };
      }

      function render() {
        ui.innerHTML = "";
        var s = stats();
        var kpis = A.el("div", { class: "ax-kpis" });
        [
          { k: "إجمالي العملاء", v: A.fmt.int(rows.length), i: "users", tone: "info" },
          { k: "قيمة المسار", v: A.fmt.dzd(s.total), i: "money", tone: "ok" },
          { k: "صفقات رابحة", v: A.fmt.int(s.won) + " · " + A.fmt.dzd(s.wonValue), i: "target", tone: "ok" },
          { k: "نسبة التحويل", v: A.fmt.pct(s.conv), i: "chart", tone: s.conv > 30 ? "ok" : "warn" }
        ].forEach(function (c) {
          kpis.appendChild(A.el("div", { class: "ax-kpi ax-kpi-" + c.tone + " ax-in", html: '<div class="ax-kpi-top">' + A.icon(c.i, 16) + "<span>" + c.k + '</span></div><strong class="ax-kpi-v">' + A.esc(c.v) + "</strong>" }));
        });
        ui.appendChild(kpis);
        ui.appendChild(A.chart({
          kind: "funnel", title: "مسار البيع خطوة بخطوة", unit: "عميل",
          data: STAGES.map(function (st) { return { label: st, value: s.byStage[st] || 0 }; })
        }));

        var grid = A.el("div", { class: "ax-card" });
        var head = A.el("div", { class: "ax-shop-head", html: '<div class="ax-shop-search">' + A.icon("search") + '<input class="ax-input" type="search" placeholder="ابحث بالاسم أو المؤسسة…" aria-label="بحث العملاء"></div>' });
        var addBtn = A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", html: A.icon("plus", 15) + " عميل جديد", onclick: function () {
          var f = A.form({
            fields: [
              { name: "name", label: "الاسم", validate: "required|len:3" },
              { name: "company", label: "المؤسسة" },
              { name: "phone", label: "الهاتف", mask: "phone", validate: "phone" },
              { name: "wilaya", label: "الولاية", type: "select", options: A.WILAYAS, value: "الجزائر" },
              { name: "stage", label: "المرحلة", type: "select", options: STAGES, value: STAGES[0] },
              { name: "value", label: "القيمة المتوقعة (دج)", type: "number", value: 50000 }
            ],
            submit: "أضف",
            onSubmit: function (v) {
              rows.unshift(Object.assign({ id: A.uid("C"), score: 50, source: "إدخال يدوي", at: new Date().toISOString().slice(0, 10), notes: "" }, v));
              modal.close(); render(); A.toast("أُضيف العميل", "ok");
            }
          });
          var modal = A.modal({ title: "عميل جديد", html: f.el, actions: [{ label: "إغلاق", kind: "ghost" }] });
        } });
        head.appendChild(addBtn);
        grid.appendChild(head);

        var table = A.el("div", { class: "ax-grid-scroll", style: { marginTop: "12px" } });
        var t = A.el("table", { class: "ax-table" });
        t.innerHTML = "<thead><tr><th>العميل</th><th>المؤسسة</th><th>الهاتف</th><th>الولاية</th><th>المرحلة</th><th class='ax-num'>القيمة</th><th class='ax-num'>الاحتمال</th><th>آخر تواصل</th><th>إجراءات</th></tr></thead>";
        var tb = A.el("tbody");
        function paint(list) {
          tb.innerHTML = "";
          if (!list.length) tb.appendChild(A.el("tr", {}, [A.el("td", { class: "ax-empty", colspan: 9, text: "ما كانش نتائج" })]));
          list.slice(0, 80).forEach(function (r, i) {
            var tr = A.el("tr", { class: "ax-row", style: { animationDelay: (i * 16) + "ms" } });
            tr.innerHTML =
              "<td><strong>" + A.esc(r.name) + "</strong></td><td>" + A.esc(r.company || "—") + "</td><td dir='ltr'>" + A.esc(r.phone || "—") + "</td><td>" + A.esc(r.wilaya || "—") + "</td>" +
              "<td><span class='ax-pill " + (r.stage === "رابح" ? "ax-pill-ok" : r.stage === "خسارة" ? "ax-pill-err" : "ax-pill-warn") + "'>" + A.esc(r.stage) + "</span></td>" +
              "<td class='ax-num'>" + A.fmt.dzd(r.value) + "</td><td class='ax-num'><b>" + r.score + "%</b></td><td>" + A.fmt.ago(r.lastAt || r.at) + "</td>";
            var acts = A.el("td", { class: "ax-acts" });
            acts.appendChild(A.el("button", { type: "button", class: "ax-icon-btn", title: "بطاقة العميل", "aria-label": "بطاقة", html: A.icon("users", 15), onclick: function () { openCard(r); } }));
            acts.appendChild(A.el("button", { type: "button", class: "ax-icon-btn ax-danger", title: "حذف", "aria-label": "حذف", html: A.icon("trash", 15), onclick: function () {
              rows = rows.filter(function (x) { return x !== r; }); render(); A.toast("حُذف", "ok");
            } }));
            tr.appendChild(acts);
            tb.appendChild(tr);
          });
        }
        paint(rows);
        t.appendChild(tb);
        table.appendChild(t);
        grid.appendChild(table);
        A.on(A.q("input", head), "input", A.debounce(function (e) {
          var q = e.target.value.toLowerCase();
          paint(rows.filter(function (r) { return (r.name + " " + (r.company || "") + " " + (r.phone || "") + " " + (r.wilaya || "")).toLowerCase().indexOf(q) >= 0; }));
        }, 140));
        grid.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", style: { marginTop: "12px" }, html: A.icon("download", 15) + " تصدير CSV", onclick: function () {
          A.download("clients.csv", A.csv(rows.map(function (r) { return { الاسم: r.name, المؤسسة: r.company, الهاتف: r.phone, الولاية: r.wilaya, المرحلة: r.stage, القيمة: r.value }; })), "text/csv;charset=utf-8");
        } }));
        ui.appendChild(grid);
      }

      function openCard(r) {
        var history = [
          { at: r.lastAt || new Date().toISOString(), what: "مكالمة هاتفية — " + A.rng(r.score).int(2, 18) + " دقيقة" },
          { at: r.at, what: "بريد إلكتروني: عرض سعر " + A.fmt.dzd(r.value) },
          { at: r.at, what: "زيارة ميدانية إلى " + (r.city || r.wilaya) },
          { at: r.at, what: "تسجيل العميل من " + r.source }
        ];
        var html = A.el("div", { class: "ax-grid", style: { gap: "14px" } });
        html.appendChild(A.el("div", { class: "ax-tile", html: "<strong>" + A.esc(r.name) + "</strong><div class='ax-dim'>" + A.esc(r.company || "") + " · " + A.esc(r.wilaya || "") + "</div><div style='margin-top:8px'>" + A.esc(r.phone || "") + " · " + A.esc(r.email || "—") + "</div>" }));
        html.appendChild(A.el("div", { class: "ax-chips", html: STAGES.map(function (st) { return '<span class="ax-chip' + (st === r.stage ? " ax-chip-btn is-on" : "") + '">' + st + "</span>"; }).join("") }));
        var tl = A.el("div", { class: "ax-timeline" });
        history.forEach(function (h) { tl.appendChild(A.el("div", { class: "ax-timeline-item", html: "<strong>" + A.esc(h.what) + "</strong><div class='ax-dim'>" + A.fmt.date(h.at, "long") + " · " + A.fmt.ago(h.at) + "</div>" })); });
        html.appendChild(tl);
        var note = A.el("textarea", { class: "ax-input", rows: 3, placeholder: "ملاحظة جديدة…" });
        html.appendChild(note);
        A.modal({
          title: "بطاقة العميل", wide: true, html: html, actions: [
            { label: "أضف ملاحظة", kind: "ghost", onClick: function () {
              var v = note.value.trim();
              if (!v) return;
              var notes = store.get().notes; notes[r.id] = (notes[r.id] || []).concat([{ at: new Date().toISOString(), text: v }]);
              store.set({ notes: notes }, { kind: "note" });
              A.toast("حُفظت الملاحظة", "ok", 1600);
            } },
            { label: "رابح ✓", kind: "primary", onClick: function () { r.stage = "رابح"; render(); A.toast("مبروك! صفقة رابحة", "ok"); A.motion.confetti(60); } },
            { label: "إغلاق", kind: "ghost" }
          ]
        });
      }
      render();
    }
  });
})();
