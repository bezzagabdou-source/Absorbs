/*@meta {"id":"travel","title":"السياحة والرحلات","domain":"travel","tags":["travel","tours","budget","itinerary"],"order":59,"needs":["kernel"]}*/
/* Tours catalogue, itinerary planner, budget calculator in DZD, booking request, printable programme. */
(function () {
  var A = window.APEX;
  A.register({
    id: "travel",
    title: "الرحلات",
    mount: function (host, ctx) {
      var tours = (ctx.data.trips || []).slice();
      var store = A.store("travel", { booked: [], plan: {} });
      var ui = A.el("div", { class: "ax-grid", style: { gap: "16px" } });
      host.appendChild(ui);
      var f = { type: "الكل", season: "الكل", maxDays: 14, pax: 2 };
      function render() {
        ui.innerHTML = "";
        var list = tours.filter(function (t) {
          return (f.type === "الكل" || t.type === f.type) && (f.season === "الكل" || t.season === f.season || t.season === "كل الفصول") && t.days <= f.maxDays;
        });
        var bar = A.el("div", { class: "ax-card" });
        var row = A.el("div", { class: "ax-grid ax-four" });
        var types = []; tours.forEach(function (t) { if (types.indexOf(t.type) < 0) types.push(t.type); });
        var tsel = A.el("select", { class: "ax-input", "aria-label": "نوع الرحلة" });
        ["الكل"].concat(types).forEach(function (v) { tsel.appendChild(A.el("option", { value: v, text: v, selected: f.type === v ? "selected" : null })); });
        A.on(tsel, "change", function () { f.type = tsel.value; render(); });
        row.appendChild(A.el("div", { class: "ax-field" }, [A.el("label", { class: "ax-label", text: "نوع الرحلة" }), tsel]));
        var ssel = A.el("select", { class: "ax-input", "aria-label": "الفصل" });
        ["الكل", "الربيع", "الصيف", "الخريف", "الشتاء"].forEach(function (v) { ssel.appendChild(A.el("option", { value: v, text: v, selected: f.season === v ? "selected" : null })); });
        A.on(ssel, "change", function () { f.season = ssel.value; render(); });
        row.appendChild(A.el("div", { class: "ax-field" }, [A.el("label", { class: "ax-label", text: "الفصل" }), ssel]));
        var drange = A.el("div", { class: "ax-field" });
        drange.appendChild(A.el("label", { class: "ax-label", text: "أقصى مدة: " + f.maxDays + " يوم" }));
        var dr = A.el("input", { type: "range", min: 2, max: 14, value: f.maxDays, class: "ax-range", "aria-label": "المدة" });
        A.on(dr, "input", function () { f.maxDays = Number(dr.value); A.q(".ax-label", drange).textContent = "أقصى مدة: " + f.maxDays + " يوم"; });
        A.on(dr, "change", function () { render(); });
        drange.appendChild(dr);
        row.appendChild(drange);
        var pax = A.el("div", { class: "ax-field" });
        pax.appendChild(A.el("label", { class: "ax-label", text: "عدد المسافرين" }));
        var pi = A.el("input", { type: "number", class: "ax-input", value: f.pax, min: 1, max: 40, "aria-label": "المسافرون" });
        A.on(pi, "input", function () { f.pax = Math.max(1, Number(pi.value) || 1); });
        A.on(pi, "change", function () { render(); });
        pax.appendChild(pi);
        row.appendChild(pax);
        bar.appendChild(row);
        ui.appendChild(bar);

        ui.appendChild(A.el("div", { class: "ax-kpis", html: [
          ["رحلات متوفرة", String(list.length), "compass", "info"],
          ["أرخص رحلة", list.length ? A.fmt.dzd(Math.min.apply(null, list.map(function (t) { return t.price * f.pax; }))) : "—", "money", "ok"],
          ["متوسط التقييم", list.length ? A.fmt.num(list.reduce(function (s, t) { return s + t.rating; }, 0) / list.length, 1) + "/5" : "—", "star", "ok"],
          ["ميزانية مقترحة", list.length ? A.fmt.dzd(list.reduce(function (s, t) { return s + t.price; }, 0) / list.length * f.pax) : "—", "chart", "info"]
        ].map(function (r) { return '<div class="ax-kpi ax-kpi-' + r[3] + ' ax-in"><div class="ax-kpi-top">' + A.icon(r[2], 16) + "<span>" + r[0] + "</span></div><strong class='ax-kpi-v' style='font-size:18px'>" + A.esc(r[1]) + "</strong></div>"; }).join("") }));

        var grid = A.el("div", { class: "ax-products", style: { gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" } });
        list.forEach(function (t, i) {
          var card = A.el("article", { class: "ax-product ax-in", style: { animationDelay: (i * 18) + "ms" } });
          card.appendChild(A.el("div", { class: "ax-product-media", style: { fontSize: "50px" }, html: '<span aria-hidden="true">' + t.emoji + "</span>" + '<span class="ax-tag">' + A.esc(t.type) + '</span><span class="ax-tag ax-tag-warn">' + t.days + " أيام</span>" }));
          var body = A.el("div", { class: "ax-product-body" });
          body.appendChild(A.el("h3", { text: t.name }));
          body.appendChild(A.el("p", { class: "ax-dim", style: { fontSize: "13px" }, text: "📍 " + t.wilaya + " · " + t.season + " · ⭐ " + t.rating }));
          body.appendChild(A.el("div", { class: "ax-chips", html: t.includes.map(function (x) { return '<span class="ax-chip">' + A.esc(x) + "</span>"; }).join("") }));
          var foot = A.el("div", { class: "ax-product-foot" });
          foot.appendChild(A.el("strong", { class: "ax-price", text: A.fmt.dzd(t.price * f.pax) }));
          foot.appendChild(A.el("span", { class: "ax-dim", style: { fontSize: "12px" }, text: "لـ " + f.pax + " مسافر" }));
          foot.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", text: "احجز / برنامج", onclick: function () { open(t); } }));
          body.appendChild(foot);
          card.appendChild(body);
          grid.appendChild(card);
        });
        ui.appendChild(grid);
      }
      function open(t) {
        var days = Array.from({ length: t.days }, function (_, i) {
          return { n: i + 1, items: [["08:00", "فطور وتجمّع"], ["09:30", i % 2 === 0 ? "زيارة موقع أثري" : "رحلة طبيعية / مشي"], ["13:00", "غداء محلي تقليدي"], ["16:00", i % 3 === 0 ? "وقت حر في السوق" : "نشاط ترفيهي"], ["20:00", "عشاء ونوم"]] };
        });
        var box = A.el("div", { class: "ax-grid", style: { gap: "12px" } });
        box.appendChild(A.el("div", { class: "ax-tile", html: "<strong>" + A.esc(t.name) + "</strong><p class='ax-dim' style='margin:6px 0 0'>" + t.days + " أيام · " + A.esc(t.wilaya) + " · " + A.fmt.dzd(t.price) + " للشخص</p>" }));
        var tl = A.el("div", { class: "ax-timeline" });
        days.forEach(function (d) {
          tl.appendChild(A.el("div", { class: "ax-timeline-item", html: "<strong>اليوم " + d.n + "</strong><ul>" + d.items.map(function (it) { return "<li>" + it[0] + " — " + it[1] + "</li>"; }).join("") + "</ul>" }));
        });
        box.appendChild(tl);
        var extras = t.days * 2500 * f.pax;
        box.appendChild(A.el("div", { class: "ax-totals", html:
          "<div><span>الرحلة × " + f.pax + "</span><b>" + A.fmt.dzd(t.price * f.pax) + "</b></div>" +
          "<div><span>مصاريف شخصية تقديرية</span><b>" + A.fmt.dzd(extras) + "</b></div>" +
          '<div class="ax-total-line"><span>الميزانية الإجمالية</span><b>' + A.fmt.dzd(t.price * f.pax + extras) + "</b></div>" }));
        var frm = A.form({
          fields: [
            { name: "name", label: "الاسم", validate: "required|len:3" },
            { name: "phone", label: "الهاتف", mask: "phone", validate: "required|phone" },
            { name: "date", label: "تاريخ الانطلاق المفضل", type: "date", validate: "required" },
            { name: "people", label: "عدد المسافرين", type: "number", value: f.pax }
          ],
          submit: "أرسل طلب الحجز",
          onSubmit: function (v) {
            store.set({ booked: [{ id: "TR-" + A.rng().int(1000, 9999), tour: t.name, at: new Date().toISOString(), total: t.price * f.pax }].concat(store.get().booked) }, { kind: "book" });
            modal.close(); A.toast("وصل طلبك — نتصلو بيك خلال 24 ساعة", "ok", 3000); A.motion.confetti(50);
          }
        });
        box.appendChild(frm.el);
        var modal = A.modal({ title: "برنامج الرحلة", wide: true, html: box, actions: [
          { label: "اطبع البرنامج", kind: "ghost", icon: "download", onClick: function () {
            var docHtml = '<div class="ax-doc" dir="rtl"><h2>' + A.esc(t.name) + "</h2><p>" + t.days + " أيام في " + A.esc(t.wilaya) + " — " + A.fmt.dzd(t.price * f.pax) + " لـ " + f.pax + " مسافر</p><ul>" + days.map(function (d) { return "<li>اليوم " + d.n + ": " + d.items.map(function (x) { return x[1]; }).join(" · ") + "</li>"; }).join("") + "</ul></div>";
            A.printDoc(docHtml, "برنامج " + t.name);
          } },
          { label: "إغلاق", kind: "ghost" }
        ] });
      }
      render();
    }
  });
})();
