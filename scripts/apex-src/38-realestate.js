/*@meta {"id":"realestate","title":"العقارات","domain":"business","tags":["realestate","listings","mortgage","compare"],"order":58,"needs":["kernel"]}*/
/* Property portal: filters, cards, detail sheet, mortgage calculator with Algerian rates, comparison, contact. */
(function () {
  var A = window.APEX;
  A.register({
    id: "realestate",
    title: "العقارات",
    mount: function (host, ctx) {
      var all = (ctx.data.listings || []).slice();
      var store = A.store("re", { favs: {}, saved: [] });
      var ui = A.el("div", { class: "ax-grid", style: { gap: "16px" } });
      host.appendChild(ui);
      var f = { deal: "الكل", wilaya: "الكل", type: "الكل", max: 60000, minRooms: 0, q: "" };
      var compareIds = [];
      function render() {
        ui.innerHTML = "";
        var list = all.filter(function (p) {
          if (f.deal !== "الكل" && p.deal !== f.deal) return false;
          if (f.wilaya !== "الكل" && p.wilaya !== f.wilaya) return false;
          if (f.type !== "الكل" && p.type !== f.type) return false;
          if (f.minRooms && p.rooms < f.minRooms) return false;
          if (f.deal === "بيع" ? p.price > f.max * 100 : false) return false;
          if (f.q && (p.title + " " + p.city).toLowerCase().indexOf(f.q.toLowerCase()) < 0) return false;
          return true;
        });
        /* filter bar */
        var bar = A.el("div", { class: "ax-card" });
        var row = A.el("div", { class: "ax-grid ax-four" });
        var mkSel = function (label, key, values) {
          var wrap = A.el("div", { class: "ax-field" });
          wrap.appendChild(A.el("label", { class: "ax-label", text: label }));
          var sel = A.el("select", { class: "ax-input", "aria-label": label });
          ["الكل"].concat(values).forEach(function (v) { sel.appendChild(A.el("option", { value: v, text: v, selected: f[key] === v ? "selected" : null })); });
          A.on(sel, "change", function () { f[key] = sel.value; render(); });
          wrap.appendChild(sel);
          return wrap;
        };
        var wilayas = []; all.forEach(function (p) { if (wilayas.indexOf(p.wilaya) < 0 && p.wilaya) wilayas.push(p.wilaya); });
        var types = []; all.forEach(function (p) { if (types.indexOf(p.type) < 0) types.push(p.type); });
        row.appendChild(mkSel("نوع المعاملة", "deal", ["بيع", "كراء"]));
        row.appendChild(mkSel("الولاية", "wilaya", wilayas.slice(0, 58)));
        row.appendChild(mkSel("نوع العقار", "type", types));
        var range = A.el("div", { class: "ax-field" });
        range.appendChild(A.el("label", { class: "ax-label", text: "السقف السعري (مليون سنتيم): " + f.max }));
        var r = A.el("input", { type: "range", min: 1000, max: 60000, step: 500, value: f.max, class: "ax-range", "aria-label": "السقف السعري" });
        A.on(r, "input", function () { f.max = Number(r.value); A.q(".ax-label", range).textContent = "السقف السعري (مليون سنتيم): " + f.max; });
        A.on(r, "change", function () { render(); });
        range.appendChild(r);
        row.appendChild(range);
        bar.appendChild(row);
        var row2 = A.el("div", { class: "ax-grid-bar", style: { marginTop: "10px" } });
        row2.appendChild(A.el("div", { class: "ax-shop-search", html: A.icon("search") + '<input class="ax-input" type="search" placeholder="ابحث بالحي أو البلدية…" value="' + A.esc(f.q) + '" aria-label="بحث">' }));
        [["+4 غرف", 4], ["+3 غرف", 3], ["+2 غرف", 2]].forEach(function (b) { row2.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn" + (f.minRooms === b[1] ? " is-on" : ""), text: b[0], onclick: function () { f.minRooms = f.minRooms === b[1] ? 0 : b[1]; render(); } })); });
        row2.appendChild(A.el("span", { class: "ax-spacer" }));
        row2.appendChild(A.el("span", { class: "ax-dim", text: list.length + " عرض" }));
        if (compareIds.length) row2.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", text: "قارن (" + compareIds.length + ")", onclick: showCompare }));
        bar.appendChild(row2);
        A.on(A.q("input", row2), "input", A.debounce(function (e) { f.q = e.target.value; render(); }, 160));
        ui.appendChild(bar);

        var grid = A.el("div", { class: "ax-products", style: { gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" } });
        list.slice(0, 30).forEach(function (p, i) {
          var card = A.el("article", { class: "ax-product ax-in", style: { animationDelay: (i * 18) + "ms" } });
          card.appendChild(A.el("div", { class: "ax-product-media", style: { fontSize: "46px" }, html: '<span aria-hidden="true">' + p.emoji + "</span>" + (p.featured ? '<span class="ax-tag">مميّز</span>' : "") + '<span class="ax-tag ax-tag-warn">' + A.esc(p.deal) + "</span>" }));
          var body = A.el("div", { class: "ax-product-body" });
          body.appendChild(A.el("h3", { text: p.title }));
          body.appendChild(A.el("p", { class: "ax-dim", style: { fontSize: "13px" }, text: p.rooms + " غرف · " + p.baths + " حمّام · " + p.area + " م² · طابق " + p.floor }));
          body.appendChild(A.el("div", { class: "ax-chips", html: (p.amenities || []).slice(0, 3).map(function (a) { return '<span class="ax-chip">' + A.esc(a) + "</span>"; }).join("") }));
          var foot = A.el("div", { class: "ax-product-foot" });
          foot.appendChild(A.el("strong", { class: "ax-price", text: A.fmt.dzd(p.price) }));
          foot.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", text: "تفاصيل", onclick: function () { detail(p); } }));
          foot.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn" + (compareIds.indexOf(p.id) >= 0 ? " is-on" : ""), text: "قارن", onclick: function () {
            if (compareIds.indexOf(p.id) >= 0) compareIds = compareIds.filter(function (x) { return x !== p.id; }); else compareIds.push(p.id);
            render();
          } }));
          body.appendChild(foot);
          card.appendChild(body);
          grid.appendChild(card);
        });
        if (!list.length) grid.appendChild(A.el("p", { class: "ax-empty", text: "ما كانش عروض بالمواصفات — وسّع البحث" }));
        ui.appendChild(grid);
      }
      function detail(p) {
        var monthly = p.deal === "كراء" ? p.price : 0;
        var rate = 4.5 / 100 / 12, n = 20 * 12;
        var loan = p.deal === "بيع" ? Math.round(p.price * 0.8) : 0;
        var pay = loan ? Math.round((loan * rate) / (1 - Math.pow(1 + rate, -n))) : 0;
        var box = A.el("div", { class: "ax-grid", style: { gap: "12px" } });
        box.appendChild(A.el("div", { class: "ax-tile", html: "<strong>" + A.esc(p.title) + "</strong><p class='ax-dim' style='margin:6px 0 0'>" + A.esc(p.city) + " · " + A.esc(p.wilaya) + " · " + p.area + " م² · " + p.rooms + " غرف</p>" }));
        box.appendChild(A.el("div", { class: "ax-chips", html: (p.amenities || []).map(function (a) { return '<span class="ax-chip">' + A.esc(a) + "</span>"; }).join("") }));
        if (p.deal === "بيع") {
          box.appendChild(A.el("div", { class: "ax-totals", html:
            "<div><span>السعر</span><b>" + A.fmt.dzd(p.price) + "</b></div>" +
            "<div><span>مساهمة شخصية 20%</span><b>" + A.fmt.dzd(p.price * 0.2) + "</b></div>" +
            "<div><span>قرض بنكي 80% · 20 سنة · 4.5%</span><b>" + A.fmt.dzd(loan) + "</b></div>" +
            '<div class="ax-total-line"><span>القسط الشهري ≈</span><b>' + A.fmt.dzd(pay) + "</b></div>" }));
        } else {
          box.appendChild(A.el("div", { class: "ax-totals", html: '<div class="ax-total-line"><span>الإيجار الشهري</span><b>' + A.fmt.dzd(monthly) + "</b></div><div><span>ضمان + شهر مقدّم</span><b>" + A.fmt.dzd(monthly * 2) + "</b></div>" }));
        }
        var msg = A.el("textarea", { class: "ax-input", rows: 3, placeholder: "رسالة للمالك…", "aria-label": "رسالة" });
        box.appendChild(msg);
        A.modal({ title: "تفاصيل العقار", wide: true, html: box, actions: [
          { label: "أنا مهتم — أرسل الرسالة", kind: "primary", icon: "mail", onClick: function () {
            A.bus.emit("re:inquiry", { id: p.id, message: msg.value });
            A.toast("وصلت الرسالة للمكتب العقاري", "ok");
          } },
          { label: "اتصل بالمالك", kind: "ghost", icon: "phone", onClick: function () { A.copy("رقم المالك: " + p.phone); } },
          { label: "إغلاق", kind: "ghost" }
        ] });
      }
      function showCompare() {
        var chosen = all.filter(function (p) { return compareIds.indexOf(p.id) >= 0; });
        var rows = ["العنوان", "المعاملة", "السعر", "المساحة", "الغرف", "الحمّامات", "الطابق", "البلدية", "الولاية"];
        var body = rows.map(function (r) {
          return "<tr><td>" + r + "</td>" + chosen.map(function (p) {
            var v = r === "العنوان" ? p.title : r === "المعاملة" ? p.deal : r === "السعر" ? A.fmt.dzd(p.price) : r === "المساحة" ? p.area + " م²" : r === "الغرف" ? p.rooms : r === "الحمّامات" ? p.baths : r === "الطابق" ? p.floor : r === "البلدية" ? p.city : p.wilaya;
            return "<td>" + A.esc(String(v)) + "</td>";
          }).join("") + "</tr>";
        }).join("");
        A.modal({ title: "مقارنة العروض", wide: true, html: "<table class='ax-table'><thead><tr><th></th>" + chosen.map(function (p) { return "<th>" + p.emoji + " " + A.esc(String(p.type)) + "</th>"; }).join("") + "</tr></thead><tbody>" + body + "</tbody></table>" });
      }
      render();
      A.bus.on("route", function () { A.guard("re:route", render); });
    }
  });
})();
