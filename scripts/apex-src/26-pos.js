/*@meta {"id":"pos","title":"نقطة البيع والمخزون","domain":"commerce","tags":["pos","inventory","stock","receipt","barcode"],"order":46,"needs":["kernel"]}*/
/* Cashier screen: search/barcode-style lookup, cart, change due, receipt, stock moves, low-stock alerts, Z report. */
(function () {
  var A = window.APEX;
  A.register({
    id: "pos",
    title: "نقطة البيع",
    mount: function (host, ctx) {
      var items = (ctx.data.inventory || []).slice();
      var store = A.store("pos", { sales: [], moves: { in: 0, out: 0 } });
      var cart = [];
      var ui = A.el("div", { class: "ax-grid", style: { gap: "14px" } });
      host.appendChild(ui);

      function total() { return cart.reduce(function (s, l) { return s + l.price * l.qty; }, 0); }
      function render() {
        ui.innerHTML = "";
        var kpis = A.el("div", { class: "ax-kpis" });
        var low = items.filter(function (i) { return i.stock <= i.min; });
        var value = items.reduce(function (s, i) { return s + i.cost * i.stock; }, 0);
        var soldToday = store.get().sales.filter(function (s) { return String(s.at).slice(0, 10) === new Date().toISOString().slice(0, 10); }).reduce(function (s, x) { return s + x.total; }, 0);
        [
          { k: "أصناف في المخزن", v: A.fmt.int(items.length), i: "box", tone: "info" },
          { k: "قيمة المخزون", v: A.fmt.dzd(value), i: "money", tone: "ok" },
          { k: "تنبيهات نقص", v: A.fmt.int(low.length), i: "bell", tone: low.length ? "warn" : "ok" },
          { k: "مبيعات اليوم", v: A.fmt.dzd(soldToday), i: "chart", tone: "ok" }
        ].forEach(function (c) { kpis.appendChild(A.el("div", { class: "ax-kpi ax-kpi-" + c.tone + " ax-in", html: '<div class="ax-kpi-top">' + A.icon(c.i, 16) + "<span>" + c.k + "</span></div><strong class='ax-kpi-v'>" + A.esc(c.v) + "</strong>" })); });
        ui.appendChild(kpis);
        if (low.length) ui.appendChild(A.el("div", { class: "ax-card", style: { borderColor: "color-mix(in oklab,var(--ax-warn) 45%, transparent)" }, html: "<strong>⚠️ أصناف تحت الحد الأدنى</strong><div class='ax-chips' style='margin-top:8px'>" + low.slice(0, 12).map(function (i) { return '<span class="ax-chip">' + i.emoji + " " + A.esc(i.name) + " (" + i.stock + "/" + i.min + ")</span>"; }).join("") + "</div>" }));

        var two = A.el("div", { class: "ax-two", style: { alignItems: "start" } });
        /* catalog */
        var left = A.el("div", { class: "ax-card" });
        left.appendChild(A.el("div", { class: "ax-shop-search", html: A.icon("search") + '<input class="ax-input" type="search" placeholder="اسم الصنف أو SKU…" autofocus aria-label="بحث">' }));
        var grid = A.el("div", { class: "ax-products", style: { marginTop: "12px", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" } });
        function paintItems(list) {
          grid.innerHTML = "";
          list.slice(0, 48).forEach(function (it) {
            var card = A.el("button", { type: "button", class: "ax-product", style: { padding: "10px", textAlign: "start", cursor: "pointer", border: "1px solid var(--ax-line)" },
              html: '<span style="font-size:26px">' + it.emoji + '</span><strong style="display:block;font-size:13.5px">' + A.esc(it.name) + '</strong><span class="ax-dim" style="font-size:12px">' + A.esc(it.sku) + " · " + A.fmt.dzd(it.price) + '</span><span class="ax-pill ' + (it.stock <= it.min ? "ax-pill-warn" : "ax-pill-ok") + '" style="margin-top:6px">متوفر ' + it.stock + "</span>",
              onclick: function () { add(it); } });
            grid.appendChild(card);
          });
        }
        paintItems(items);
        A.on(A.q("input", left), "input", A.debounce(function (e) {
          var q = e.target.value.toLowerCase();
          paintItems(items.filter(function (i) { return (i.name + " " + i.sku + " " + i.cat).toLowerCase().indexOf(q) >= 0; }));
        }, 120));
        left.appendChild(grid);
        two.appendChild(left);

        /* ticket */
        var right = A.el("div", { class: "ax-card", style: { position: "sticky", top: "80px" } });
        right.appendChild(A.el("h3", { text: "التذكرة" }));
        var list = A.el("div", { class: "ax-cart-list" });
        if (!cart.length) list.appendChild(A.el("p", { class: "ax-empty", text: "امسح/اختر صنفًا لتضيفه" }));
        cart.forEach(function (l, i) {
          list.appendChild(A.el("div", { class: "ax-cart-row", html:
            "<span style='flex:1'>" + A.esc(l.name) + "<div class='ax-dim' style='font-size:12px'>" + A.fmt.dzd(l.price) + " × " + l.qty + "</div></span>" +
            "<strong>" + A.fmt.dzd(l.price * l.qty) + "</strong>" }));
          var minus = A.el("button", { type: "button", class: "ax-icon-btn", "aria-label": "أنقص", html: A.icon("minus", 14), onclick: function () { l.qty--; if (l.qty <= 0) cart.splice(i, 1); render(); } });
          A.q(".ax-cart-row", list).appendChild(minus);
        });
        right.appendChild(list);
        var tva = Math.round(total() * 0.19);
        right.appendChild(A.el("div", { class: "ax-totals", html:
          "<div><span>المجموع (HT)</span><b>" + A.fmt.dzd(total()) + "</b></div>" +
          "<div><span>TVA 19%</span><b>" + A.fmt.dzd(tva) + "</b></div>" +
          '<div class="ax-total-line"><span>للدفع</span><b>' + A.fmt.dzd(total() + tva) + "</b></div>" }));
        var paid = A.el("input", { class: "ax-input", type: "number", placeholder: "المبلغ المدفوع", "aria-label": "المدفوع", style: { marginTop: "10px" } });
        right.appendChild(paid);
        var change = A.el("div", { class: "ax-dim", style: { margin: "6px 0" }, text: "الباقي: 0 دج" });
        A.on(paid, "input", function () { change.textContent = "الباقي: " + A.fmt.dzd(Math.max(0, (Number(paid.value) || 0) - (total() + tva))); });
        right.appendChild(change);
        right.appendChild(A.el("div", { class: "ax-grid-bar" }, [
          A.el("button", { type: "button", class: "ax-btn ax-btn-primary", style: { flex: "1" }, html: A.icon("check") + " خلّص الآن", onclick: function () { checkout(total() + tva); } }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost", text: "فرّغ", onclick: function () { cart = []; render(); } })
        ]));
        two.appendChild(right);
        ui.appendChild(two);

        /* sales + stock table */
        var arc = A.el("div", { class: "ax-grid", style: { gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" } });
        arc.appendChild(A.chart({ kind: "bar", title: "مبيعات آخر 7 أيام", unit: "دج", data: lastDays(7) }));
        arc.appendChild(A.chart({ kind: "donut", title: "القيمة حسب الفئة", unit: "دج", data: byCat() }));
        ui.appendChild(arc);
        A.grid(ui, {
          name: "stock", rows: items, pageSize: 10,
          columns: [
            { key: "sku", label: "SKU" }, { key: "name", label: "الصنف" },
            { key: "cat", label: "الفئة" },
            { key: "stock", label: "المخزون", numeric: true, editable: true, render: function (v, r) { return (v <= r.min ? '<span class="ax-pill ax-pill-warn">' + v + "</span>" : v) ; } },
            { key: "min", label: "الحد الأدنى", numeric: true, editable: true },
            { key: "cost", label: "الكلفة", numeric: true, editable: true, render: function (v) { return A.fmt.dzd(v); } },
            { key: "price", label: "سعر البيع", numeric: true, editable: true, render: function (v) { return "<b>" + A.fmt.dzd(v) + "</b>"; } },
            { key: "warehouse", label: "المخزن" }
          ],
          filterCols: ["cat", "warehouse"]
        });
      }
      function lastDays(n) {
        var out = [];
        for (var i = n - 1; i >= 0; i--) {
          var d = new Date(); d.setDate(d.getDate() - i);
          var k = d.toISOString().slice(0, 10);
          var v = store.get().sales.filter(function (s) { return String(s.at).slice(0, 10) === k; }).reduce(function (s, x) { return s + x.total; }, 0);
          out.push({ label: k.slice(5), value: v || A.rng(i + 3).int(12000, 90000) });
        }
        return out;
      }
      function byCat() {
        var map = {};
        items.forEach(function (i) { map[i.cat] = (map[i.cat] || 0) + i.cost * i.stock; });
        return Object.keys(map).map(function (k) { return { label: k, value: map[k] }; });
      }
      function add(it) {
        var line = cart.filter(function (l) { return l.id === it.id; })[0];
        if (line) line.qty++;
        else cart.push({ id: it.id, name: it.name, price: it.price, qty: 1, cost: it.cost });
        it.stock = Math.max(0, it.stock - 1);
        A.toast("أُضيف: " + it.name, "ok", 1100);
        render();
      }
      function checkout(sum) {
        if (!cart.length) { A.toast("التذكرة فارغة", "warn"); return; }
        var sale = { id: "V-" + A.rng().int(1000, 9999), at: new Date().toISOString(), lines: cart, total: sum, cashier: (ctx.data.staff && ctx.data.staff[0] && ctx.data.staff[0].name) || "الكاشير" };
        store.set(function (s) { var n = A.deep(s); n.sales = [sale].concat(n.sales); return n; }, { kind: "sale" });
        var receipt = A.invoice({ number: sale.id, date: new Date(), client: { name: "عميل نقدي" }, lines: cart.map(function (l) { return { label: l.name, qty: l.qty, price: l.price }; }), tva: 19, company: (window.APEX_DATA && window.APEX_DATA.brand) || "نقطة البيع" });
        A.modal({ title: "وصل البيع " + sale.id, wide: true, html: '<div class="ax-invoice-preview">' + receipt + "</div>", actions: [
          { label: "طباعة", kind: "primary", icon: "download", onClick: function () { A.printDoc(receipt, "وصل " + sale.id); } },
          { label: "إغلاق", kind: "ghost" }
        ] });
        cart = [];
        A.motion.confetti(40);
        render();
      }
      render();
      A.bus.on("route", function () { A.guard("pos:route", render); });
    }
  });
})();
