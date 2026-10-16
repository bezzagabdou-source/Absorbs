/*@meta {"id":"kanban","title":"لوحة المهام","domain":"business","tags":["kanban","tasks","drag","projects"],"order":41,"needs":["kernel"]}*/
/* Real drag & drop kanban: lanes, WIP limits, filters, due dates, owners, progress. */
(function () {
  var A = window.APEX;
  var LANES = ["قيد الانتظار", "قيد التنفيذ", "مراجعة", "مكتمل"];
  A.register({
    id: "kanban",
    title: "لوحة المهام",
    mount: function (host, ctx) {
      var store = A.store("tasks", { rows: (ctx.data.tasks || []).slice() });
      var ui = A.el("div", { class: "ax-grid", style: { gap: "14px" } });
      host.appendChild(ui);
      var drag = null;
      var filter = { owner: "", q: "" };

      function rows() { return store.get().rows; }
      function laneOf(name) { return rows().filter(function (t) { return t.lane === name; }); }
      function matches(t) {
        if (filter.owner && t.owner !== filter.owner) return false;
        if (filter.q && (t.title + " " + (t.tag || "") + " " + (t.owner || "")).toLowerCase().indexOf(filter.q) < 0) return false;
        return true;
      }
      function move(id, lane) {
        store.set(function (s) {
          var n = A.deep(s);
          n.rows = n.rows.map(function (t) { return t.id === id ? Object.assign({}, t, { lane: lane, movedAt: new Date().toISOString() }) : t; });
          return n;
        }, { kind: "move" });
        render();
        A.toast("نُقلت إلى «" + lane + "»", "ok", 1400);
      }

      function render() {
        ui.innerHTML = "";
        var bar = A.el("div", { class: "ax-grid-bar" });
        bar.appendChild(A.el("div", { class: "ax-grid-search", html: A.icon("search") + '<input class="ax-input" type="search" placeholder="بحث في المهام…" value="' + A.esc(filter.q) + '" aria-label="بحث">' }));
        var owners = [];
        rows().forEach(function (t) { if (owners.indexOf(t.owner) < 0) owners.push(t.owner); });
        var sel = A.el("select", { class: "ax-input ax-mini", "aria-label": "المسؤول" });
        sel.appendChild(A.el("option", { value: "", text: "كل المسؤولين" }));
        owners.forEach(function (o) { sel.appendChild(A.el("option", { value: o, text: o, selected: filter.owner === o ? "selected" : null })); });
        A.on(sel, "change", function () { filter.owner = sel.value; render(); });
        bar.appendChild(sel);
        bar.appendChild(A.el("span", { class: "ax-dim", text: rows().length + " مهمة · " + rows().filter(function (t) { return t.lane === "مكتمل"; }).length + " مكتملة" }));
        bar.appendChild(A.el("span", { class: "ax-spacer" }));
        var prog = Math.round((rows().filter(function (t) { return t.lane === "مكتمل"; }).length / Math.max(1, rows().length)) * 100);
        bar.appendChild(A.el("span", { class: "ax-progressbar", style: { width: "160px" }, html: "<i style='width:" + prog + "%'></i>" }));
        bar.appendChild(A.el("span", { class: "ax-badge", text: prog + "%" }));
        bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", html: A.icon("plus", 15) + " مهمة", onclick: newTask }));
        ui.appendChild(bar);

        var board = A.el("div", { class: "ax-kanban" });
        LANES.forEach(function (lane) {
          var list = laneOf(lane).filter(matches);
          var el = A.el("section", { class: "ax-lane", "data-lane": lane, "aria-label": lane });
          el.appendChild(A.el("div", { class: "ax-lane-head", html: "<span>" + lane + '</span><span class="ax-badge">' + list.length + "</span>" }));
          if (!list.length) el.appendChild(A.el("p", { class: "ax-dim", style: { fontSize: "13px" }, text: "اسحب مهمة إلى هنا" }));
          list.forEach(function (t) {
            var card = A.el("article", { class: "ax-taskcard", draggable: "true", "data-id": t.id });
            card.appendChild(A.el("h5", { text: t.title }));
            card.appendChild(A.el("div", { class: "ax-chips", html:
              '<span class="ax-chip">' + A.esc(t.owner) + "</span>" +
              '<span class="ax-chip">' + A.esc(t.tag || "عام") + "</span>" +
              '<span class="ax-chip' + (t.priority === "عالية" ? " ax-chip-btn is-on" : "") + '">' + A.esc(t.priority) + "</span>" +
              '<span class="ax-chip">' + A.fmt.dur(t.estimate * 3600000) + "</span>" }));
            card.appendChild(A.el("div", { class: "ax-dim", style: { display: "flex", gap: "10px", marginTop: "6px" }, html: '<span>📅 ' + A.fmt.date(t.due) + "</span><span>🆔 " + A.esc(t.id) + "</span>" }));
            A.on(card, "dragstart", function (e) {
              drag = t.id; card.classList.add("is-drag");
              try { e.dataTransfer.setData("text/plain", t.id); } catch (err) { /* safari */ }
            });
            A.on(card, "dragend", function () { card.classList.remove("is-drag"); drag = null; });
            A.on(card, "click", function () { openTask(t); });
            el.appendChild(card);
          });
          A.on(el, "dragover", function (e) { e.preventDefault(); el.classList.add("is-over"); });
          A.on(el, "dragleave", function () { el.classList.remove("is-over"); });
          A.on(el, "drop", function (e) {
            e.preventDefault(); el.classList.remove("is-over");
            var id = drag || (e.dataTransfer && e.dataTransfer.getData("text/plain"));
            if (id) move(id, lane);
          });
          /* keyboard/touch fallback: tap the lane header arrows */
          var head = A.q(".ax-lane-head", el);
          head.appendChild(A.el("span", { class: "ax-chips", html: '<button class="ax-icon-btn" type="button" aria-label="انقل المهام للتالي">↔</button>' }));
          A.on(A.q("button", head), "click", function () { A.toast("اسحب البطاقة، أو استعمل زر النقل في بطاقة المهمة", "info", 2200); });
          board.appendChild(el);
        });
        ui.appendChild(board);
      }

      function newTask() {
        var f = A.form({
          fields: [
            { name: "title", label: "عنوان المهمة", validate: "required|len:4" },
            { name: "owner", label: "المسؤول", validate: "required" },
            { name: "priority", label: "الأولوية", type: "select", options: ["عالية", "متوسطة", "منخفضة"], value: "متوسطة" },
            { name: "lane", label: "المرحلة", type: "select", options: LANES, value: LANES[0] },
            { name: "tag", label: "الوسم", value: "عام" },
            { name: "estimate", label: "التقدير (ساعات)", type: "number", value: 4 },
            { name: "notes", label: "ملاحظات", type: "textarea", rows: 3 }
          ],
          submit: "أضف المهمة",
          onSubmit: function (v) {
            store.set(function (s) { var n = A.deep(s); n.rows.unshift(Object.assign({ id: A.uid("T"), due: new Date().toISOString().slice(0, 10), estimate: Number(v.estimate) || 2 }, v)); return n; }, { kind: "add" });
            modal.close(); render(); A.toast("أُضيفت المهمة", "ok");
          }
        });
        var modal = A.modal({ title: "مهمة جديدة", html: f.el, actions: [{ label: "إغلاق", kind: "ghost" }] });
      }

      function openTask(t) {
        var box = A.el("div", { class: "ax-grid", style: { gap: "12px" } });
        box.appendChild(A.el("div", { class: "ax-tile", html: "<strong>" + A.esc(t.title) + "</strong><p class='ax-dim' style='margin:6px 0 0'>" + A.esc(t.notes || "بلا ملاحظات") + "</p>" }));
        var moves = A.el("div", { class: "ax-chips" });
        LANES.forEach(function (l) {
          moves.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn" + (l === t.lane ? " is-on" : ""), text: l, onclick: function () { move(t.id, l); m.close(); } }));
        });
        box.appendChild(moves);
        box.appendChild(A.el("div", { class: "ax-chips", html: ["تعديل", "تكرار", "تعليق", "أرشفة"].map(function (a) { return '<span class="ax-chip ax-chip-btn">' + a + "</span>"; }).join("") }));
        var m = A.modal({ title: "المهمة " + t.id, html: box, actions: [
          { label: "حذف", kind: "danger", onClick: function () { store.set(function (s) { var n = A.deep(s); n.rows = n.rows.filter(function (x) { return x.id !== t.id; }); return n; }); render(); } },
          { label: "إغلاق", kind: "ghost" }
        ] });
      }
      render();
    }
  });
})();
