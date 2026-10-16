/*@meta {"id":"calendar","title":"الرزنامة","domain":"business","tags":["calendar","events","agenda","ics"],"order":42,"needs":["kernel"]}*/
/* Month / week / agenda views, real event CRUD, drag between days, recurrence, .ics export. */
(function () {
  var A = window.APEX;
  var WEEK = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  var MONTHS = ["جانفي", "فيفري", "مارس", "أفريل", "ماي", "جوان", "جويلية", "أوت", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  A.register({
    id: "calendar",
    title: "الرزنامة",
    mount: function (host, ctx) {
      var store = A.store("agenda", { events: (ctx.data.events || []).slice() });
      var cursor = new Date();
      var view = "month";
      var ui = A.el("div", { class: "ax-grid", style: { gap: "14px" } });
      host.appendChild(ui);
      var dragId = null;

      function evs() { return store.get().events; }
      function key(d) { return new Date(d).toISOString().slice(0, 10); }
      function dayEvents(d) { return evs().filter(function (e) { return key(e.at) === key(d); }); }
      function save(list) { store.set({ events: list }, { kind: "events" }); render(); }

      function render() {
        ui.innerHTML = "";
        var bar = A.el("div", { class: "ax-grid-bar" });
        bar.appendChild(A.el("button", { type: "button", class: "ax-icon-btn", title: "السابق", "aria-label": "الشهر السابق", html: A.icon("minus", 15), onclick: function () {
          if (view === "week") cursor.setDate(cursor.getDate() - 7); else cursor.setMonth(cursor.getMonth() - 1);
          render();
        } }));
        bar.appendChild(A.el("strong", { class: "ax-h2", style: { fontSize: "19px" }, text: view === "month" ? MONTHS[cursor.getMonth()] + " " + cursor.getFullYear() : "أسبوع " + A.fmt.date(cursor) }));
        bar.appendChild(A.el("button", { type: "button", class: "ax-icon-btn", title: "التالي", "aria-label": "الشهر القادم", html: A.icon("plus", 15), onclick: function () {
          if (view === "week") cursor.setDate(cursor.getDate() + 7); else cursor.setMonth(cursor.getMonth() + 1);
          render();
        } }));
        bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "اليوم", onclick: function () { cursor = new Date(); render(); } }));
        var seg = A.el("div", { class: "ax-seg" });
        [["month", "شهر"], ["week", "أسبوع"], ["agenda", "لائحة"]].forEach(function (v) {
          seg.appendChild(A.el("button", { type: "button", class: "ax-seg-btn" + (view === v[0] ? " is-on" : ""), text: v[1], onclick: function () { view = v[0]; render(); } }));
        });
        bar.appendChild(seg);
        bar.appendChild(A.el("span", { class: "ax-spacer" }));
        bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", html: A.icon("plus", 15) + " موعد", onclick: function () { openEvent(null, new Date()); } }));
        bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("download", 15) + " .ics", onclick: exportIcs }));
        ui.appendChild(bar);

        if (view === "month") {
          var grid = A.el("div", { class: "ax-cal-week" });
          WEEK.forEach(function (d) { grid.appendChild(A.el("div", { class: "ax-dim ax-center", style: { fontSize: "12.5px", fontWeight: "800" }, text: d })); });
          var first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
          var start = new Date(first); start.setDate(1 - first.getDay());
          for (var i = 0; i < 42; i++) {
            var d2 = new Date(start); d2.setDate(start.getDate() + i);
            var cell = A.el("div", { class: "ax-cal-cell" + (key(d2) === key(new Date()) ? " is-today" : "") + (d2.getMonth() !== cursor.getMonth() ? " ax-dim" : "") });
            cell.appendChild(A.el("div", { style: { display: "flex", justifyContent: "space-between" }, html: "<b>" + d2.getDate() + '</b><span class="ax-dim" style="font-size:11px">' + (d2.getMonth() === cursor.getMonth() ? MONTHS[d2.getMonth()].slice(0, 4) : "") + "</span>" }));
            dayEvents(d2).slice(0, 3).forEach(function (e) {
              var chip = A.el("div", { class: "ax-cal-ev", draggable: "true", text: A.fmt.time(e.at) + " " + e.title });
              A.on(chip, "dragstart", function () { dragId = e.id; });
              A.on(chip, "click", function (ev) { ev.stopPropagation(); openEvent(e, d2); });
              cell.appendChild(chip);
            });
            if (dayEvents(d2).length > 3) cell.appendChild(A.el("div", { class: "ax-dim", style: { fontSize: "11px" }, text: "+" + (dayEvents(d2).length - 3) + " أخرى" }));
            A.on(cell, "click", function () { openEvent(null, d2); });
            A.on(cell, "dragover", function (e) { e.preventDefault(); cell.style.borderColor = "var(--ax-brand)"; });
            A.on(cell, "dragleave", function () { cell.style.borderColor = ""; });
            A.on(cell, "drop", function (e) {
              e.preventDefault(); cell.style.borderColor = "";
              if (!dragId) return;
              save(evs().map(function (x) { var nd = new Date(d2); var old = new Date(x.at); nd.setHours(old.getHours(), old.getMinutes(), 0, 0); return x.id === dragId ? Object.assign({}, x, { at: nd.toISOString() }) : x; }));
              dragId = null;
              A.toast("نُقل الموعد إلى " + A.fmt.date(d2), "ok", 1500);
            });
            grid.appendChild(cell);
          }
          ui.appendChild(grid);
        } else if (view === "week") {
          var wk = A.el("div", { class: "ax-cal-week" });
          var base = new Date(cursor); base.setDate(base.getDate() - base.getDay());
          for (var w = 0; w < 7; w++) {
            var dw = new Date(base); dw.setDate(base.getDate() + w);
            var col = A.el("div", { class: "ax-cal-cell", style: { minHeight: "220px" } });
            col.appendChild(A.el("strong", { text: WEEK[w] + " " + dw.getDate() }));
            dayEvents(dw).forEach(function (e) { col.appendChild(A.el("div", { class: "ax-cal-ev", text: A.fmt.time(e.at) + " " + e.title, onclick: function () { openEvent(e, dw); } })); });
            A.on(col, "click", function () { openEvent(null, dw); });
            wk.appendChild(col);
          }
          ui.appendChild(wk);
        } else {
          var list = evs().slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); }).filter(function (e) { return new Date(e.at) >= new Date(Date.now() - 864e5); });
          var tl = A.el("div", { class: "ax-timeline" });
          if (!list.length) tl.appendChild(A.el("p", { class: "ax-empty", text: "ما كانش مواعيد قادمة — أضف واحد" }));
          list.slice(0, 40).forEach(function (e) {
            tl.appendChild(A.el("div", { class: "ax-timeline-item", html: "<strong>" + A.esc(e.title) + '</strong><div class="ax-dim">' + A.fmt.date(e.at, "long") + " · " + A.fmt.time(e.at) + " · " + A.esc(e.place || "") + " · " + A.esc(e.who || "") + "</div>" + (e.notes ? '<p class="ax-dim" style="margin:4px 0 0">' + A.esc(e.notes) + "</p>" : "") , onclick: function () { openEvent(e, new Date(e.at)); } }));
          });
          ui.appendChild(tl);
        }

        /* today card */
        var today = dayEvents(new Date());
        var card = A.el("div", { class: "ax-card" });
        card.appendChild(A.el("h3", { text: "برنامج اليوم — " + A.fmt.date(new Date(), "long") }));
        if (!today.length) card.appendChild(A.el("p", { class: "ax-dim", text: "ما كانش مواعيد اليوم. يوم هادي! ☕" }));
        today.forEach(function (e) {
          card.appendChild(A.el("div", { class: "ax-tile", style: { marginBottom: "8px" }, html: '<strong>' + A.fmt.time(e.at) + " — " + A.esc(e.title) + "</strong><div class='ax-dim'>" + A.esc(e.place || "") + " · " + A.esc(e.who || "") + "</div>" }));
        });
        ui.appendChild(card);
      }

      function openEvent(e, when) {
        var f = A.form({
          fields: [
            { name: "title", label: "عنوان الموعد", validate: "required|len:3", value: e ? e.title : "" },
            { name: "at", label: "التاريخ والساعة", type: "datetime-local", value: ((e ? new Date(e.at) : when).toISOString().slice(0, 16)), validate: "required" },
            { name: "hours", label: "المدة (ساعات)", type: "number", value: e ? e.hours : 1 },
            { name: "kind", label: "النوع", type: "select", options: ["اجتماع", "تكوين", "عميل", "مالي", "شخصي"], value: e ? e.kind : "اجتماع" },
            { name: "place", label: "المكان", value: e ? e.place : "مقر المؤسسة" },
            { name: "who", label: "مع من", value: e ? e.who : "" },
            { name: "repeat", label: "تكرار", type: "select", options: [{ value: "none", label: "بلا تكرار" }, { value: "weekly", label: "كل أسبوع (4 مرات)" }, { value: "monthly", label: "كل شهر (3 مرات)" }], value: "none" },
            { name: "notes", label: "ملاحظات", type: "textarea", rows: 2, value: e ? e.notes : "" }
          ],
          submit: e ? "حدّث الموعد" : "أضف الموعد",
          onSubmit: function (v) {
            var list = evs().slice();
            var base = Object.assign({ id: e ? e.id : A.uid("E"), at: new Date(v.at).toISOString(), hours: Number(v.hours) || 1 }, v);
            delete base.repeat;
            if (e) list = list.map(function (x) { return x.id === e.id ? Object.assign({}, x, base) : x; });
            else {
              list.push(base);
              if (v.repeat === "weekly") for (var i = 1; i <= 4; i++) { var d = new Date(v.at); d.setDate(d.getDate() + i * 7); list.push(Object.assign({}, base, { id: A.uid("E"), at: d.toISOString() })); }
              if (v.repeat === "monthly") for (var m = 1; m <= 3; m++) { var d2 = new Date(v.at); d2.setMonth(d2.getMonth() + m); list.push(Object.assign({}, base, { id: A.uid("E"), at: d2.toISOString() })); }
            }
            save(list);
            modal.close();
            A.toast(e ? "حُدّث الموعد" : "أُضيف الموعد", "ok");
          }
        });
        var modal = A.modal({ title: e ? "تعديل الموعد" : "موعد جديد", html: f.el, actions: e ? [
          { label: "حذف", kind: "danger", onClick: function () { save(evs().filter(function (x) { return x.id !== e.id; })); } },
          { label: "إلغاء", kind: "ghost" }
        ] : [{ label: "إلغاء", kind: "ghost" }] });
      }

      function exportIcs() {
        var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NEXUS APEX v18//AR//"];
        evs().forEach(function (e) {
          var start = new Date(e.at), end = new Date(start.getTime() + (e.hours || 1) * 3600000);
          var f = function (d) { return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"; };
          lines.push("BEGIN:VEVENT", "UID:" + e.id + "@apex", "DTSTAMP:" + f(new Date()), "DTSTART:" + f(start), "DTEND:" + f(end));
          lines.push("SUMMARY:" + String(e.title || "").replace(/[,;]/g, " "));
          if (e.place) lines.push("LOCATION:" + String(e.place).replace(/[,;]/g, " "));
          lines.push("END:VEVENT");
        });
        lines.push("END:VCALENDAR");
        A.download("agenda.ics", lines.join("\r\n"), "text/calendar;charset=utf-8");
        A.toast("تنزيل ملف الرزنامة — يفتح في Google Calendar وOutlook", "ok", 2600);
      }
      render();
    }
  });
})();
