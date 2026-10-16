/*@meta {"id":"datagrid","title":"جدول البيانات","domain":"ui","tags":["table","grid","sort","filter","export","edit"],"order":21}*/
/* A production data grid: sort, multi-filter, pagination, column resize, inline edit, bulk select, CSV/JSON export. */
(function () {
  var A = window.APEX;
  A.grid = function (host, spec) {
    spec = spec || {};
    var cols = spec.columns || [];
    var rows = (spec.rows || []).slice();
    var state = { sort: spec.sort || null, dir: spec.dir || "asc", page: 1, size: spec.pageSize || 12, q: "", filters: {}, selected: {}, view: "table" };
    var root = A.el("div", { class: "ax-grid" });
    host.appendChild(root);

    function filtered() {
      var out = rows;
      if (state.q) {
        var needle = state.q.toLowerCase();
        out = out.filter(function (r) { return cols.some(function (c) { return String(r[c.key] == null ? "" : r[c.key]).toLowerCase().indexOf(needle) >= 0; }); });
      }
      Object.keys(state.filters).forEach(function (k) {
        if (!state.filters[k]) return;
        out = out.filter(function (r) { return String(r[k]) === state.filters[k]; });
      });
      if (spec.filterFn) out = out.filter(spec.filterFn);
      if (state.sort) {
        var c = cols.filter(function (x) { return x.key === state.sort; })[0] || { key: state.sort };
        out = out.slice().sort(function (a, b) {
          var va = a[c.key], vb = b[c.key];
          var num = c.numeric || (typeof va === "number" && typeof vb === "number");
          if (num) return (Number(va) - Number(vb)) * (state.dir === "asc" ? 1 : -1);
          return String(va).localeCompare(String(vb), "ar") * (state.dir === "asc" ? 1 : -1);
        });
      }
      return out;
    }
    function selectedRows() { return rows.filter(function (r) { return state.selected[r[spec.idKey || "id"]]; }); }

    function render() {
      var data = filtered();
      var pages = Math.max(1, Math.ceil(data.length / state.size));
      if (state.page > pages) state.page = pages;
      var slice = data.slice((state.page - 1) * state.size, state.page * state.size);
      root.innerHTML = "";

      /* ---- toolbar ---- */
      var bar = A.el("div", { class: "ax-grid-bar" });
      bar.appendChild(A.el("div", { class: "ax-grid-search", html: A.icon("search") + '<input type="search" class="ax-input" placeholder="' + A.esc(spec.searchHint || "بحث في الجدول…") + '" value="' + A.esc(state.q) + '">' }));
      A.on(A.q("input", bar), "input", A.debounce(function (e) { state.q = e.target.value; state.page = 1; render(); }, 160));
      if (spec.filterCols) spec.filterCols.forEach(function (fc) {
        var vals = [];
        rows.forEach(function (r) { if (vals.indexOf(r[fc]) < 0) vals.push(r[fc]); });
        var sel = A.el("select", { class: "ax-input ax-mini", "aria-label": fc });
        sel.appendChild(A.el("option", { value: "", text: A.t("all_" + fc, "الكل") }));
        vals.slice(0, 40).forEach(function (v) { sel.appendChild(A.el("option", { value: v, text: v, selected: state.filters[fc] === String(v) ? "selected" : null })); });
        A.on(sel, "change", function () { state.filters[fc] = sel.value; state.page = 1; render(); });
        bar.appendChild(sel);
      });
      var selCount = selectedRows().length;
      if (selCount) {
        bar.appendChild(A.el("span", { class: "ax-badge", text: selCount + " محدَّد" }));
        bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-danger ax-mini", html: A.icon("trash", 15) + " حذف المحدد", onclick: function () {
          A.confirm("تحذف " + selCount + " سطر؟").then(function (ok) {
            if (!ok) return;
            var ids = selectedRows().map(function (r) { return r[spec.idKey || "id"]; });
            rows = rows.filter(function (r) { return ids.indexOf(r[spec.idKey || "id"]) < 0; });
            state.selected = {}; state.page = 1; render();
            A.toast("حُذف " + ids.length + " سطر", "ok");
            if (spec.onDelete) spec.onDelete(ids);
          });
        } }));
      }
      bar.appendChild(A.el("span", { class: "ax-spacer" }));
      bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("plus", 15) + " " + A.esc(spec.addLabel || "سطر جديد"), onclick: function () {
        var fresh = {}; cols.forEach(function (c) { fresh[c.key] = c.default == null ? "" : c.default; });
        fresh[spec.idKey || "id"] = A.rng().id("row");
        rows.unshift(fresh); state.page = 1; render();
        if (spec.onAdd) spec.onAdd(fresh);
        A.toast("أضف سطر — عدّل الخلايا مباشرة", "info", 2600);
      } }));
      bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("download", 15) + " CSV", onclick: function () {
        var out = filtered().map(function (r) { var o = {}; cols.forEach(function (c) { o[c.key] = r[c.key]; }); return o; });
        A.download((spec.name || "data") + ".csv", A.csv(out), "text/csv;charset=utf-8");
        A.toast("تنزيل CSV", "ok", 1500);
      } }));
      bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("copy", 15) + " JSON", onclick: function () { A.copy(JSON.stringify(filtered(), null, 2)); } }));
      bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("download", 15) + " JSON", onclick: function () { A.download((spec.name || "data") + ".json", JSON.stringify(filtered(), null, 2), "application/json"); } }));
      bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("play", 15) + " طباعة", onclick: function () { window.print(); } }));
      root.appendChild(bar);

      /* ---- table ---- */
      var scroll = A.el("div", { class: "ax-grid-scroll" });
      var table = A.el("table", { class: "ax-table" });
      var thead = A.el("thead");
      var hr = A.el("tr");
      hr.appendChild(A.el("th", { class: "ax-th-check", html: '<input type="checkbox" class="ax-check" aria-label="تحديد الكل">' }));
      A.on(A.q("input", hr), "change", function (e) {
        slice.forEach(function (r) { state.selected[r[spec.idKey || "id"]] = e.target.checked; });
        render();
      });
      cols.forEach(function (c) {
        var th = A.el("th", {
          class: "ax-th" + (c.numeric ? " ax-num" : "") + (state.sort === c.key ? " is-sorted" : ""),
          html: '<span class="ax-th-label">' + A.esc(c.label) + "</span>" + (state.sort === c.key ? A.icon(state.dir === "asc" ? "check" : "minus", 12) : "")
        });
        th.setAttribute("tabindex", "0");
        A.on(th, "click", function () {
          if (state.sort === c.key) state.dir = state.dir === "asc" ? "desc" : "asc";
          else { state.sort = c.key; state.dir = "asc"; }
          render();
        });
        hr.appendChild(th);
      });
      hr.appendChild(A.el("th", { class: "ax-th-acts", text: "إجراءات" }));
      thead.appendChild(hr);
      table.appendChild(thead);
      var tb = A.el("tbody");
      if (!slice.length) tb.appendChild(A.el("tr", {}, [A.el("td", { class: "ax-empty", colspan: cols.length + 2, text: "لا نتائج — بدّل البحث أو الفلاتر" })]));
      slice.forEach(function (r, ri) {
        var tr = A.el("tr", { class: "ax-row", style: { animationDelay: (ri * 22) + "ms" } });
        tr.appendChild(A.el("td", { html: '<input type="checkbox" class="ax-check" aria-label="تحديد">' }));
        A.on(A.q("input", tr), "change", function (e) { state.selected[r[spec.idKey || "id"]] = e.target.checked; render(); });
        if (state.selected[r[spec.idKey || "id"]]) A.q("input", tr).checked = true;
        cols.forEach(function (c) {
          var td = A.el("td", { class: "ax-td" + (c.numeric ? " ax-num" : "") });
          var html = c.render ? c.render(r[c.key], r) : A.esc(r[c.key]);
          if (c.editable) {
            td.innerHTML = '<span class="ax-cell" contenteditable="true" role="textbox" aria-label="' + A.esc(c.label) + '">' + (c.render ? html : A.esc(r[c.key]) + "</span>");
            var cell = A.q(".ax-cell", td);
            A.on(cell, "blur", function () {
              var v = c.numeric ? Number(cell.textContent.replace(/[^\d.-]/g, "")) : cell.textContent.trim();
              if (String(r[c.key]) !== String(v)) { r[c.key] = v; if (spec.onEdit) spec.onEdit(r, c.key, v); A.bus.emit("grid:edit", { row: r, key: c.key, value: v }); render(); }
            });
            A.on(cell, "keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); cell.blur(); } });
          } else td.innerHTML = html;
          tr.appendChild(td);
        });
        var acts = A.el("td", { class: "ax-acts" });
        acts.appendChild(A.el("button", { type: "button", class: "ax-icon-btn", title: "تعديل", "aria-label": "تعديل", html: A.icon("edit", 15), onclick: function () { if (spec.onEditRow) spec.onEditRow(r, render); } }));
        acts.appendChild(A.el("button", { type: "button", class: "ax-icon-btn ax-danger", title: "حذف", "aria-label": "حذف", html: A.icon("trash", 15), onclick: function () {
          rows = rows.filter(function (x) { return x !== r; }); render(); A.toast("حُذف السطر", "ok", 1600);
          if (spec.onDelete) spec.onDelete([r[spec.idKey || "id"]]);
        } }));
        tr.appendChild(acts);
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      scroll.appendChild(table);
      root.appendChild(scroll);

      /* ---- footer ---- */
      var foot = A.el("div", { class: "ax-grid-foot" });
      foot.appendChild(A.el("span", { class: "ax-dim", text: A.fmt.int(data.length) + " سطر · صفحة " + state.page + "/" + pages }));
      var pager = A.el("div", { class: "ax-pager" });
      pager.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "الأول", disabled: state.page === 1 ? "disabled" : null, onclick: function () { state.page = 1; render(); } }));
      pager.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "السابق", disabled: state.page === 1 ? "disabled" : null, onclick: function () { state.page--; render(); } }));
      var from = Math.max(1, state.page - 2), to = Math.min(pages, from + 4);
      for (var p = from; p <= to; p++) pager.appendChild(A.el("button", { type: "button", class: "ax-btn ax-mini " + (p === state.page ? "ax-btn-primary" : "ax-btn-ghost"), text: p, onclick: (function (pp) { return function () { state.page = pp; render(); }; })(p) }));
      pager.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "التالي", disabled: state.page === pages ? "disabled" : null, onclick: function () { state.page++; render(); } }));
      pager.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "الأخير", disabled: state.page === pages ? "disabled" : null, onclick: function () { state.page = pages; render(); } }));
      var size = A.el("select", { class: "ax-input ax-mini", "aria-label": "حجم الصفحة" });
      [8, 12, 20, 50, 100].forEach(function (n) { size.appendChild(A.el("option", { value: n, text: n + " / صفحة", selected: state.size === n ? "selected" : null })); });
      A.on(size, "change", function () { state.size = Number(size.value); state.page = 1; render(); });
      pager.appendChild(size);
      foot.appendChild(pager);
      root.appendChild(foot);
    }
    render();
    return { el: root, rows: function () { return rows; }, setRows: function (r) { rows = r.slice(); render(); }, render: render, state: state, selected: selectedRows };
  };
  A.register({ id: "datagrid", title: "جدول البيانات", mount: function (host) { A.guard("grid:mount", function () { A.grid(host, window.APEX_DATA[host.getAttribute("data-grid") || "grid"] || {}); }); } });
})();
