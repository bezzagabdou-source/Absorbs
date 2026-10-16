/*@meta {"id":"booking","title":"الحجز والمواعيد","domain":"business","tags":["booking","appointments","slots","agenda"],"order":56,"needs":["kernel"]}*/
/* Availability calendar with real slot logic: services, staff, hours, holidays, confirmations, .ics. */
(function () {
  var A = window.APEX;
  A.register({
    id: "booking",
    title: "الحجز",
    mount: function (host, ctx) {
      var services = (ctx.data.services || []).length ? ctx.data.services : [
        { id: "S1", name: "استشارة عامة", price: 2000, minutes: 30, doctor: "د. الفريق" },
        { id: "S2", name: "متابعة", price: 1500, minutes: 20, doctor: "د. الفريق" },
        { id: "S3", name: "تحليل", price: 3500, minutes: 45, doctor: "المخبر" }
      ];
      var staff = ((ctx.data.staff || []).length ? ctx.data.staff : [{ id: "U1", name: "الفريق", role: "مختص" }]).slice(0, 6);
      var store = A.store("booking", { bookings: [], holidays: [] });
      var ui = A.el("div", { class: "ax-grid", style: { gap: "16px" } });
      host.appendChild(ui);
      var picked = { day: null, slot: null, service: services[0].id, staff: staff[0].id };

      function slotsFor(day, serviceId) {
        var svc = services.filter(function (s) { return s.id === serviceId; })[0] || services[0];
        var out = [];
        for (var h = 8; h < 17; h++) {
          for (var m = 0; m < 60; m += svc.minutes) {
            var d = new Date(day); d.setHours(h, m, 0, 0);
            if (d.getHours() === 12) continue; /* استراحة الغداء */
            out.push(d);
          }
        }
        var taken = store.get().bookings.filter(function (b) { return String(b.at).slice(0, 10) === day.toISOString().slice(0, 10) && b.staff === picked.staff; }).map(function (b) { return b.slot; });
        var isHoliday = store.get().holidays.indexOf(day.toISOString().slice(0, 10)) >= 0;
        return out.map(function (d) {
          var key = d.toTimeString().slice(0, 5);
          var past = d.getTime() < Date.now();
          return { at: d.toISOString(), label: key, free: !past && !isHoliday && taken.indexOf(key) < 0 };
        });
      }
      function render() {
        ui.innerHTML = "";
        var bookings = store.get().bookings;
        ui.appendChild(A.el("div", { class: "ax-kpis", html: [
          ["خدمات", String(services.length), "shield", "info"],
          ["مختصون", String(staff.length), "users", "info"],
          ["حجوزات مؤكدة", String(bookings.length), "check", "ok"],
          ["القادم", bookings.length ? A.fmt.date(bookings[0].at, "long") + " " + A.fmt.time(bookings[0].at) : "—", "calendar", "ok"]
        ].map(function (r) { return '<div class="ax-kpi ax-kpi-' + r[3] + ' ax-in"><div class="ax-kpi-head" style="display:flex;gap:8px;align-items:center;font-size:12.5px;font-weight:800;color:var(--ax-dim);margin-bottom:8px">' + A.icon(r[2], 16) + "<span>" + r[0] + "</span></div><strong class='ax-kpi-v' style='font-size:18px'>" + A.esc(r[1]) + "</strong></div>"; }).join("") }));

        var two = A.el("div", { class: "ax-two", style: { alignItems: "start" } });
        var asst = A.el("div", { class: "ax-card" });
        asst.appendChild(A.el("h3", { text: "1) اختر الخدمة والمختص" }));
        var sSel = A.el("select", { class: "ax-input", "aria-label": "الخدمة" });
        services.forEach(function (s) { sSel.appendChild(A.el("option", { value: s.id, text: s.name + " — " + A.fmt.dzd(s.price) + " · " + s.minutes + " د", selected: picked.service === s.id ? "selected" : null })); });
        A.on(sSel, "change", function () { picked.service = sSel.value; render(); });
        asst.appendChild(sSel);
        var uSel = A.el("select", { class: "ax-input", style: { marginTop: "8px" }, "aria-label": "المختص" });
        staff.forEach(function (s) { uSel.appendChild(A.el("option", { value: s.id, text: s.name + " · " + (s.role || ""), selected: picked.staff === s.id ? "selected" : null })); });
        A.on(uSel, "change", function () { picked.staff = uSel.value; render(); });
        asst.appendChild(uSel);
        asst.appendChild(A.el("h3", { style: { marginTop: "16px" }, text: "2) اختر اليوم" }));
        var strip = A.el("div", { class: "ax-grid-bar" });
        for (var i = 1; i <= 10; i++) {
          var d = new Date(); d.setDate(d.getDate() + i);
          var isHol = store.get().holidays.indexOf(d.toISOString().slice(0, 10)) >= 0;
          strip.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn" + (picked.day && picked.day.toISOString().slice(0, 10) === d.toISOString().slice(0, 10) ? " is-on" : ""), disabled: isHol ? "disabled" : null,
            text: A.fmt.date(d) + (isHol ? " (مغلق)" : ""), onclick: function () { picked.day = d; picked.slot = null; render(); } }));
        }
        asst.appendChild(strip);
        two.appendChild(asst);

        var slotsBox = A.el("div", { class: "ax-card" });
        slotsBox.appendChild(A.el("h3", { text: "3) اختر الوقت" }));
        if (!picked.day) slotsBox.appendChild(A.el("p", { class: "ax-dim", text: "اختر يومًا من فوق لعرض الأوقات المتوفرة." }));
        else {
          var slots = slotsFor(picked.day, picked.service);
          var grid = A.el("div", { class: "ax-chips" });
          slots.forEach(function (s) {
            grid.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn" + (picked.slot === s.label ? " is-on" : ""), disabled: s.free ? null : "disabled", text: s.label + (s.free ? "" : " ✕"), onclick: function () { picked.slot = s.label; render(); } }));
          });
          slotsBox.appendChild(grid);
        }
        var form = A.form({
          fields: [
            { name: "name", label: "الاسم الكامل", validate: "required|len:3" },
            { name: "phone", label: "الهاتف", mask: "phone", validate: "required|phone" },
            { name: "note", label: "ملاحظة (اختياري)", type: "textarea", rows: 2 }
          ],
          submit: "أكّد الحجز",
          onSubmit: function (v) {
            if (!picked.day || !picked.slot) { A.toast("اختر اليوم والوقت أولاً", "warn"); return; }
            var svc = services.filter(function (s) { return s.id === picked.service; })[0];
            var booking = { id: "BK-" + A.rng().int(1000, 9999), at: picked.day.toISOString(), slot: picked.slot, service: svc.name, price: svc.price, minutes: svc.minutes, staff: picked.staff, client: v.name, phone: v.phone, note: v.note || "", createdAt: new Date().toISOString(), status: "مؤكد" };
            store.set({ bookings: [booking].concat(store.get().bookings) }, { kind: "book" });
            var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "SUMMARY:" + svc.name, "DTSTART:" + new Date(booking.at).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z", "DURATION:PT" + svc.minutes + "M", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
            A.modal({ title: "تأكيد الحجز " + booking.id, html: '<div class="ax-card"><p><b>' + A.esc(booking.client) + "</b> — " + A.esc(svc.name) + "</p><p class='ax-dim'>" + A.fmt.date(booking.at, "long") + " على " + booking.slot + " · " + A.fmt.dzd(svc.price) + "</p><p class='ax-dim'>نتصلو بك على " + A.esc(v.phone) + " للتأكيد النهائي.</p></div>", actions: [
              { label: "أضف للرزنامة (.ics)", kind: "primary", icon: "download", onClick: function () { A.download("booking-" + booking.id + ".ics", ics, "text/calendar"); } },
              { label: "إغلاق", kind: "ghost" }
            ] });
            A.motion.confetti(50);
            render();
          }
        });
        slotsBox.appendChild(form.el);
        two.appendChild(slotsBox);
        ui.appendChild(two);

        var list = A.el("div", { class: "ax-card" });
        list.appendChild(A.el("h3", { text: "الحجوزات القادمة" }));
        if (!bookings.length) list.appendChild(A.el("p", { class: "ax-dim", text: "بلا حجوزات بعد" }));
        bookings.slice(0, 12).forEach(function (b) {
          list.appendChild(A.el("div", { class: "ax-tile", style: { marginBottom: "8px", display: "flex", gap: "10px", alignItems: "center" } }, [
            A.el("div", { style: { flex: "1" }, html: "<strong>" + A.esc(b.client) + "</strong> — " + A.esc(b.service) + "<div class='ax-dim' style='font-size:12.5px'>" + A.fmt.date(b.at, "long") + " · " + b.slot + " · " + A.fmt.dzd(b.price) + "</div>" }),
            A.el("span", { class: "ax-pill ax-pill-ok", text: b.status }),
            A.el("button", { type: "button", class: "ax-icon-btn ax-danger", "aria-label": "إلغاء", html: A.icon("x", 15), onclick: function () {
              store.set({ bookings: store.get().bookings.filter(function (x) { return x.id !== b.id; }) }, { kind: "cancel" });
              A.toast("أُلغي الحجز", "warn"); render();
            } })
          ]));
        });
        list.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("download", 15) + " تصدير الحجوزات", onclick: function () { A.download("bookings.csv", A.csv(bookings.map(function (b) { return { الرقم: b.id, العميل: b.client, الخدمة: b.service, التاريخ: String(b.at).slice(0, 10), الوقت: b.slot, الهاتف: b.phone }; })), "text/csv;charset=utf-8"); } }));
        ui.appendChild(list);
      }
      render();
    }
  });
})();
