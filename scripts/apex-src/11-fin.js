/*@meta {"id":"fin","title":"المالية والمحاسبة","domain":"finance","tags":["finance","accounting","budget","invoice","report"],"order":31,"needs":["kernel"]}*/
/* Income/expense ledger, category budgets, cash-flow chart, invoice builder with TVA + NIF/NIS, monthly report, forecast. */
(function () {
  var A = window.APEX;
  var CATS = {
    income: ["مبيعات", "خدمات", "استشارات", "إيجار محصّل", "أخرى"],
    expense: ["شراء بضاعة", "كراء", "أجور", "كهرباء وماء", "نقل", "إعلانات", "ضرائب", "صيانة", "أخرى"]
  };
  A.register({
    id: "fin",
    title: "المالية",
    mount: function (host, ctx) {
      var rng = A.rng((ctx.plan && ctx.plan.seed) || 7);
      var seedRows = ctx.data.transactions || [];
      var ledger = A.store("ledger", { rows: seedRows, budgets: { "كراء": 45000, "أجور": 120000, "نقل": 20000 } });
      var ui = A.el("div", { class: "ax-fin" });
      host.appendChild(ui);
      function rows() { return ledger.get().rows; }
      function monthRows(month) { return rows().filter(function (r) { return String(r.date).slice(0, 7) === month; }); }
      function sum(list, kind) { return list.filter(function (r) { return r.kind === kind; }).reduce(function (s, r) { return s + Number(r.amount); }, 0); }
      function render() {
        ui.innerHTML = "";
        var months = {};
        rows().forEach(function (r) { var m = String(r.date).slice(0, 7); months[m] = (months[m] || 0) + 1; });
        var mKeys = Object.keys(months).sort();
        var current = String(new Date().toISOString().slice(0, 7));
        if (!months[current]) current = mKeys[mKeys.length - 1];
        var mr = monthRows(current);
        var income = sum(mr, "income"), expense = sum(mr, "expense");
        var cards = A.el("div", { class: "ax-kpis" });
        [
          { k: "مدخول الشهر", v: A.fmt.dzd(income), i: "money", tone: "ok", spark: mr.filter(function (r) { return r.kind === "income"; }).map(function (r) { return Number(r.amount); }) },
          { k: "مصاريف الشهر", v: A.fmt.dzd(expense), i: "truck", tone: "warn", spark: mr.filter(function (r) { return r.kind === "expense"; }).map(function (r) { return Number(r.amount); }) },
          { k: "الرصيد الصافي", v: A.fmt.dzd(income - expense), i: "chart", tone: income >= expense ? "ok" : "err", spark: mKeys.map(function (m) { return sum(monthRows(m), "income") - sum(monthRows(m), "expense"); }) },
          { k: "نسبة الادخار", v: A.fmt.pct(income ? ((income - expense) / income) * 100 : 0), i: "spark", tone: "info", spark: mKeys.map(function (m) { var i2 = sum(monthRows(m), "income"); return i2 ? ((i2 - sum(monthRows(m), "expense")) / i2) * 100 : 0; }) }
        ].forEach(function (c) {
          var k = A.el("div", { class: "ax-kpi ax-kpi-" + c.tone + " ax-in" });
          k.appendChild(A.el("div", { class: "ax-kpi-top", html: A.icon(c.i, 16) + "<span>" + c.k + "</span>" }));
          k.appendChild(A.el("strong", { class: "ax-kpi-v", text: c.v }));
          if (c.spark && c.spark.length > 1) k.appendChild(A.chart({ kind: "spark", data: c.spark, width: 130, height: 34 }));
          cards.appendChild(k);
        });
        ui.appendChild(cards);

        var grid2 = A.el("div", { class: "ax-two" });
        grid2.appendChild(A.chart({
          kind: "line", title: "المدخول والمصاريف شهريًا", zero: true,
          data: mKeys.map(function (m) { return { label: m, value: sum(monthRows(m), "income") }; }),
          compare: mKeys.map(function (m) { return { label: m, value: sum(monthRows(m), "expense") }; }),
          unit: "دج"
        }));
        var byCat = {};
        mr.forEach(function (r) { byCat[r.cat] = (byCat[r.cat] || 0) + Number(r.amount); });
        grid2.appendChild(A.chart({ kind: "donut", title: "توزيع المصاريف", centerLabel: "دج", data: Object.keys(byCat).map(function (k) { return { label: k, value: byCat[k] }; }), unit: "دج" }));
        ui.appendChild(grid2);

        /* budgets */
        var bud = A.el("div", { class: "ax-card" });
        bud.appendChild(A.el("h3", { text: "ميزانيات الشهر" }));
        var budgets = ledger.get().budgets;
        Object.keys(budgets).forEach(function (c) {
          var spent = mr.filter(function (r) { return r.kind === "expense" && r.cat === c; }).reduce(function (s, r) { return s + Number(r.amount); }, 0);
          var pct = A.clamp((spent / budgets[c]) * 100, 0, 130);
          bud.appendChild(A.el("div", { class: "ax-budget" + (pct > 100 ? " is-over" : pct > 80 ? " is-tight" : "") , html:
            '<span class="ax-budget-lab">' + A.esc(c) + "</span>" +
            '<span class="ax-budget-bar"><i style="width:' + Math.min(100, pct) + '%"></i></span>' +
            '<b>' + A.fmt.dzd(spent) + " / " + A.fmt.dzd(budgets[c]) + "</b>" }));
        });
        ui.appendChild(bud);

        var grid = A.grid(ui, {
          name: "transactions",
          rows: rows().slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }),
          columns: [
            { key: "date", label: "التاريخ", editable: true },
            { key: "label", label: "البيان", editable: true },
            { key: "kind", label: "النوع", editable: true, render: function (v) { return v === "income" ? '<span class="ax-pill ax-pill-ok">مدخول</span>' : '<span class="ax-pill ax-pill-warn">مصروف</span>'; } },
            { key: "cat", label: "التصنيف", editable: true },
            { key: "amount", label: "المبلغ", numeric: true, editable: true, render: function (v) { return "<b>" + A.fmt.dzd(v) + "</b>"; } },
            { key: "method", label: "الوسيلة", editable: true },
            { key: "ref", label: "المرجع", editable: true }
          ],
          filterCols: ["kind", "cat", "method"],
          pageSize: 10,
          onEdit: function () { ledger.set({ rows: rows() }, { kind: "edit" }); },
          onDelete: function (ids) { ledger.set({ rows: rows().filter(function (r) { return ids.indexOf(r.id) < 0; }) }, { kind: "del" }); },
          onAdd: function (row) {
            row.kind = row.kind || "expense"; row.cat = row.cat || "أخرى"; row.amount = Number(row.amount) || 0;
            row.date = row.date || new Date().toISOString().slice(0, 10); row.id = row.id || A.rng().id("tx");
            ledger.set({ rows: [row].concat(rows()) }, { kind: "add" });
            render();
          }
        });
        void grid;

        /* invoice builder */
        var invBtn = A.el("button", { type: "button", class: "ax-btn ax-btn-primary", html: A.icon("money") + " إنشاء فاتورة", onclick: function () {
          var form = A.form({
            fields: [
              { name: "client", label: "العميل", validate: "required|len:3", half: true },
              { name: "nif", label: "رقم التعريف الجبائي NIF", half: true, mask: "rc" },
              { name: "address", label: "العنوان", half: true },
              { name: "phone", label: "الهاتف", mask: "phone", half: true, validate: "phone" },
              { name: "item1", label: "البند ١", validate: "required", half: true },
              { name: "qty1", label: "الكمية", type: "number", value: 1, half: true },
              { name: "price1", label: "سعر الوحدة (دج)", type: "number", value: 5000, half: true },
              { name: "tva", label: "نسبة TVA %", type: "select", options: ["0", "9", "19"], value: "19", half: true },
              { name: "note", label: "ملاحظة", type: "textarea", rows: 2 }
            ],
            submit: "أصدر الفاتورة",
            onSubmit: function (v) {
              var qty = Number(v.qty1) || 1, price = Number(v.price1) || 0;
              var ht = qty * price, tva = Math.round(ht * (Number(v.tva) / 100));
              var number = "FA-" + new Date().getFullYear() + "-" + rng.int(100, 999);
              var html = A.invoice({ number: number, date: new Date(), client: v, lines: [{ label: v.item1, qty: qty, price: price }], tva: Number(v.tva), note: v.note });
              var m = A.modal({ title: "الفاتورة " + number, wide: true, html: '<div class="ax-invoice-preview">' + html + "</div>", actions: [
                { label: "طباعة / PDF", kind: "primary", icon: "download", onClick: function () { A.printDoc(html, "فاتورة " + number); } },
                { label: "تنزيل HTML", kind: "ghost", icon: "download", onClick: function () { A.download(number + ".html", html, "text/html;charset=utf-8"); } },
                { label: "إغلاق", kind: "ghost" }
              ] });
              void m;
              A.bus.emit("fin:invoice", { number: number, total: ht + tva });
            }
          });
          A.modal({ title: "فاتورة جديدة", wide: true, html: form.el, actions: [{ label: "إغلاق", kind: "ghost" }] });
        } });
        ui.appendChild(invBtn);
      }
      render();
      ledger.sub(A.debounce(render, 60));
    }
  });
  })();
