/*@meta {"id":"orders","title":"الطلبات والفواتير","domain":"commerce","tags":["orders","invoice","tracking","print"],"order":44,"needs":["kernel","print"]}*/
/* Order desk: stage pipeline, filters by wilaya/status/carrier, per-order detail
   with items, shipping, TVA, printable invoice and CSV export of the selection. */
(function () {
  var A = window.APEX;
  var STAGES = ["جديد", "قيد التحضير", "جاهز", "مرسل", "مُسلَّم", "ملغى", "مرتجع"];
  function cfgOf(host) {
    try { return JSON.parse(host.getAttribute("data-cfg") || "{}") || {}; }
    catch (e) { return {}; }
  }
  function badgeTone(status) {
    if (/مُسلَّم|مكتمل|مؤكد/.test(status)) return "ok";
    if (/ملغى|مرتجع/.test(status)) return "err";
    return "warn";
  }
  A.register({
    id: "orders",
    title: "الطلبات",
    mount: function (host, ctx) {
      var cfg = cfgOf(host);
      var all = (ctx.data.orders || []).slice();
      if (!all.length) { host.appendChild(A.el("div", { class: "ax-empty", text: "لا طلبات في هذه النسخة — زيد مصفوفة orders." })); return; }
      var wilayas = Array.from(new Set(all.map(function (o) { return o.wilaya; }))).slice(0, 12);
      var carriers = Array.from(new Set(all.map(function (o) { return o.carrier; }).filter(Boolean)));
      var state = { q: "", stage: "", wilaya: "", carrier: "", page: 1, size: cfg.size || 10, open: null };
      var ui = A.el("div", { class: "ax-orders" });
      host.appendChild(ui);

      function filtered() {
        var out = all.slice();
        if (state.q) {
          var n = state.q.toLowerCase();
          out = out.filter(function (o) { return (String(o.ref) + " " + String(o.customer) + " " + String(o.phone)).toLowerCase().indexOf(n) >= 0; });
        }
        if (state.stage) out = out.filter(function (o) { return o.stage === state.stage; });
        if (state.wilaya) out = out.filter(function (o) { return o.wilaya === state.wilaya; });
        if (state.carrier) out = out.filter(function (o) { return o.carrier === state.carrier; });
        return out.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      }
      function invoiceOf(o) {
        var rng = A.rng(Number(String(o.id).replace(/\D/g, "")) || 17);
        var items = Array.from({ length: Math.max(1, Number(o.items) || 1) }, function (_, i) {
          return { label: rng.pick(["منتج إلكتروني", "قطعة منزلية", "ملابس", "مواد غذائية", "كتاب", "عطر"]) + " " + (i + 1), qty: rng.int(1, 3), price: Math.round((Number(o.subtotal) / Math.max(1, Number(o.items) || 1)) / 100) * 100 };
        });
        return A.invoice({
          number: o.ref,
          date: o.createdAt,
          company: (ctx.data.brand && ctx.data.brand.name) || "متجر نكسس",
          customer: { name: o.customer, phone: o.phone, address: o.commune + "، " + o.wilaya },
          lines: items,
          shipping: Number(o.shipping) || 0,
          tva: 19,
          payment: o.payment,
          note: "شكرًا لثقتك — التوصيل عبر " + (o.carrier || "الناقل المحلي") + "."
        });
      }
      function detail(o) {
        var body = A.el("div", { class: "ax-order-detail" });
        body.appendChild(A.el("div", { class: "ax-grid ax-grid-2" }, [
          A.el("div", { class: "ax-card" }, [
            A.el("b", { text: "العميل" }),
            A.el("div", { class: "ax-kv" }, [A.el("span", { class: "ax-dim", text: "الاسم" }), A.el("b", { text: o.customer })]),
            A.el("div", { class: "ax-kv" }, [A.el("span", { class: "ax-dim", text: "الهاتف" }), A.el("b", { text: o.phone })]),
            A.el("div", { class: "ax-kv" }, [A.el("span", { class: "ax-dim", text: "العنوان" }), A.el("b", { text: o.commune + "، " + o.wilaya })])
          ]),
          A.el("div", { class: "ax-card" }, [
            A.el("b", { text: "الطلب" }),
            A.el("div", { class: "ax-kv" }, [A.el("span", { class: "ax-dim", text: "الحالة" }), A.el("b", { text: o.status })]),
            A.el("div", { class: "ax-kv" }, [A.el("span", { class: "ax-dim", text: "المرحلة" }), A.el("b", { text: o.stage })]),
            A.el("div", { class: "ax-kv" }, [A.el("span", { class: "ax-dim", text: "الدفع" }), A.el("b", { text: o.payment })]),
            A.el("div", { class: "ax-kv" }, [A.el("span", { class: "ax-dim", text: "الناقل" }), A.el("b", { text: o.carrier || "—" })])
          ])
        ]));
        var steps = A.el("div", { class: "ax-flow" });
        STAGES.slice(0, 5).forEach(function (s) {
          var idx = STAGES.indexOf(o.stage), cur = STAGES.indexOf(s);
          steps.appendChild(A.el("span", { class: "ax-flow-step" + (cur <= idx ? " is-done" : ""), text: s }));
        });
        body.appendChild(steps);
        body.appendChild(A.el("div", { class: "ax-card" }, [
          A.el("div", { class: "ax-row-between" }, [
            A.el("span", { class: "ax-dim", text: "المجموع الفرعي" }), A.el("b", { text: A.fmt.dzd(o.subtotal) })
          ]),
          A.el("div", { class: "ax-row-between" }, [A.el("span", { class: "ax-dim", text: "التوصيل" }), A.el("b", { text: Number(o.shipping) ? A.fmt.dzd(o.shipping) : "مجاني" })]),
          A.el("div", { class: "ax-row-between" }, [A.el("span", { class: "ax-dim", text: "TVA 19%" }), A.el("b", { text: A.fmt.dzd(o.tva) })]),
          A.el("div", { class: "ax-row-between" }, [A.el("b", { text: "الإجمالي للدفع" }), A.el("b", { class: "ax-price-tag", text: A.fmt.dzd(o.total) })])
        ]));
        A.modal({
          title: "الطلب " + o.ref,
          body: body,
          wide: true,
          actions: [
            { label: "إغلاق", kind: "ghost" },
            { label: "فاتورة A4", kind: "primary", html: A.icon("print", 16) + " طباعة الفاتورة", onClick: function () { A.printDoc(invoiceOf(o), "فاتورة " + o.ref); } }
          ]
        });
      }

      function render() {
        ui.innerHTML = "";
        var kpis = A.el("div", { class: "ax-kpis" });
        [["طلبات", all.length, "box"], ["مبيعات", all.reduce(function (s, o) { return s + Number(o.total); }, 0), "money"], ["قيد التحضير", all.filter(function (o) { return /جديد|تحضير/.test(o.stage); }).length, "clock"], ["مُسلَّم", all.filter(function (o) { return o.stage === "مُسلَّم"; }).length, "check"]]
          .forEach(function (k, i) {
            kpis.appendChild(A.el("div", { class: "ax-kpi" + (i === 1 ? " ax-kpi-ok" : "") }, [
              A.el("div", { class: "ax-kpi-top", html: A.icon(k[2], 16) + "<span>" + k[0] + "</span>" }),
              A.el("strong", { class: "ax-kpi-v", text: i === 1 ? A.fmt.dzd(k[1]) : A.fmt.int(k[1]) })
            ]));
          });
        ui.appendChild(kpis);

        var bar = A.el("div", { class: "ax-shop-bar" });
        var search = A.el("input", { class: "ax-input", type: "search", placeholder: "ابحث برقم الطلب أو العميل أو الهاتف…", "aria-label": "بحث" });
        A.on(search, "input", A.debounce(function () { state.q = search.value; state.page = 1; paint(); }, 160));
        bar.appendChild(search);
        var stageSel = A.el("select", { class: "ax-select", "aria-label": "المرحلة" });
        stageSel.appendChild(A.el("option", { value: "", text: "كل المراحل" }));
        STAGES.forEach(function (s) { stageSel.appendChild(A.el("option", { value: s, text: s })); });
        A.on(stageSel, "change", function () { state.stage = stageSel.value; state.page = 1; paint(); });
        bar.appendChild(stageSel);
        var wilSel = A.el("select", { class: "ax-select", "aria-label": "الولاية" });
        wilSel.appendChild(A.el("option", { value: "", text: "كل الولايات" }));
        wilayas.forEach(function (w) { wilSel.appendChild(A.el("option", { value: w, text: w })); });
        A.on(wilSel, "change", function () { state.wilaya = wilSel.value; paint(); });
        bar.appendChild(wilSel);
        var carSel = A.el("select", { class: "ax-select", "aria-label": "الناقل" });
        carSel.appendChild(A.el("option", { value: "", text: "كل الناقلين" }));
        carriers.forEach(function (c) { carSel.appendChild(A.el("option", { value: c, text: c })); });
        A.on(carSel, "change", function () { state.carrier = carSel.value; paint(); });
        bar.appendChild(carSel);
        bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("download", 15) + " تصدير", onclick: function () {
          A.download("orders.csv", A.csv(filtered(), ["ref", "customer", "phone", "wilaya", "total", "stage", "payment", "carrier"]), "text/csv;charset=utf-8");
        } }));
        ui.appendChild(bar);
        paint();
      }

      function paint() {
        var old = A.q(".ax-orders-body", ui);
        if (old) old.remove();
        var list = filtered();
        var body = A.el("div", { class: "ax-orders-body" });
        var wrap = A.el("div", { class: "ax-table-wrap" });
        var t = A.el("table", { class: "ax-table" });
        t.appendChild(A.el("thead", { html: "<tr><th>المرجع</th><th>العميل</th><th>الولاية</th><th class='ax-num'>المجموع</th><th>الحالة</th><th>المرحلة</th><th>التاريخ</th><th></th></tr>" }));
        var tb = A.el("tbody", {});
        var start = (state.page - 1) * state.size;
        list.slice(start, start + state.size).forEach(function (o) {
          var tr = A.el("tr", {});
          tr.appendChild(A.el("td", { html: "<b>" + A.esc(o.ref) + "</b>" }));
          tr.appendChild(A.el("td", { html: A.esc(o.customer) + "<br><small class='ax-dim'>" + A.esc(o.phone) + "</small>" }));
          tr.appendChild(A.el("td", { text: o.wilaya }));
          tr.appendChild(A.el("td", { class: "ax-num", text: A.fmt.dzd(o.total) }));
          tr.appendChild(A.el("td", { html: "<span class='ax-badge ax-badge-" + badgeTone(o.status) + "'>" + A.esc(o.status) + "</span>" }));
          tr.appendChild(A.el("td", { text: o.stage }));
          tr.appendChild(A.el("td", { html: "<small>" + A.fmt.date(o.createdAt, "short") + "</small>" }));
          var act = A.el("td", {});
          act.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "تفاصيل", onclick: function () { detail(o); } }));
          tr.appendChild(act);
          tb.appendChild(tr);
        });
        t.appendChild(tb);
        wrap.appendChild(t);
        body.appendChild(wrap);
        var pages = Math.max(1, Math.ceil(list.length / state.size));
        var pager = A.el("div", { class: "ax-pager" });
        pager.appendChild(A.el("span", { class: "ax-dim", text: A.fmt.int(list.length) + " طلب · صفحة " + state.page + "/" + pages }));
        pager.appendChild(A.el("button", { type: "button", text: "‹", disabled: state.page === 1, onclick: function () { state.page--; paint(); } }));
        pager.appendChild(A.el("button", { type: "button", text: "›", disabled: state.page === pages, onclick: function () { state.page++; paint(); } }));
        body.appendChild(pager);
        ui.appendChild(body);
      }

      render();
    }
  });
})();
