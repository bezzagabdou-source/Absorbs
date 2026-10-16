/*@meta {"id":"view","title":"عرض البيانات الذكي","domain":"data","tags":["list","cards","table","filters","detail"],"order":41,"needs":["kernel","search"]}*/
/* One module that renders ANY dataset as cards, a table, a timeline or a gallery,
   with search, auto-detected filters, sorting, pagination and a detail panel.
   Every list page in a generated project is backed by real records through it. */
(function () {
  var A = window.APEX;

  /* field labels per dataset — keeps every screen readable without config */
  var LABELS = {
    products: { name: "المنتج", category: "التصنيف", price: "السعر", stock: "المخزون", rating: "التقييم", sold: "المبيعات", sku: "الرمز", brand: "العلامة", emoji: "رمز" },
    orders: { ref: "المرجع", customer: "العميل", wilaya: "الولاية", total: "الإجمالي", status: "الحالة", stage: "المرحلة", payment: "الدفع", items: "المنتجات", createdAt: "التاريخ", carrier: "الناقل" },
    customers: { name: "العميل", email: "البريد", phone: "الهاتف", wilaya: "الولاية", segment: "الفئة", spend: "إجمالي الشراء", orders: "الطلبات", points: "النقاط", lastSeen: "آخر زيارة" },
    contacts: { name: "الاسم", company: "المؤسسة", role: "المنصب", email: "البريد", phone: "الهاتف", wilaya: "الولاية", stage: "المرحلة", value: "القيمة المتوقعة", lastTouch: "آخر تواصل", nextStep: "الخطوة القادمة" },
    listings: { title: "العرض", type: "النوع", deal: "الصيغة", wilaya: "الولاية", commune: "البلدية", rooms: "الغرف", area: "المساحة", price: "السعر", floor: "الطابق", owner: "صاحب العرض", added: "أضيف في" },
    posts: { title: "المقال", author: "الكاتب", tags: "الوسوم", minutes: "دقائق القراءة", views: "المشاهدات", likes: "الإعجابات", date: "التاريخ" },
    courses: { title: "الدورة", subject: "المادة", teacher: "المدرّب", classes: "القسم", hours: "الساعات", lessons: "الدروس", price: "السعر", enrolled: "المسجّلون", mode: "النمط" },
    students: { name: "التلميذ", klass: "القسم", wilaya: "الولاية", average: "المعدل", rank: "الرتبة", attendance: "الحضور", fees: "الرسوم", note: "الملاحظة", gender: "الجنس" },
    patients: { name: "المريض", age: "العمر", gender: "الجنس", phone: "الهاتف", blood: "الزمرة", bmi: "مؤشر الكتلة", pressure: "الضغط", service: "الخدمة", lastVisit: "آخر زيارة", insurance: "التأمين" },
    destinations: { name: "الوجهة", wilaya: "الولاية", type: "النوع", days: "الأيام", price: "السعر", rating: "التقييم", best: "أفضل موسم", desc: "الوصف" },
    menu: { name: "الطبق", cat: "الصنف", price: "السعر", rating: "التقييم", sold: "عدد الطلبات", available: "متوفر" },
    inventory: { name: "المادة", sku: "الرمز", category: "التصنيف", shelf: "الرف", qty: "الكمية", min: "الحد الأدنى", cost: "الكلفة", price: "سعر البيع", supplier: "المورّد", lastMove: "آخر حركة" },
    tickets: { ticket: "التذكرة", subject: "الموضوع", customer: "العميل", priority: "الأولوية", status: "الحالة", channel: "القناة", agent: "الموظف", createdAt: "أُنشئت", satisfaction: "الرضا" },
    services: { name: "الخدمة", price: "السعر", minutes: "المدة", staff: "المسؤول", room: "القاعة", rating: "التقييم" },
    staff: { name: "الموظف", role: "المنصب", phone: "الهاتف", salary: "الأجر", shift: "الوردية", rating: "التقييم", tasks: "المهام" },
    transactions: { date: "التاريخ", label: "البيان", category: "الفئة", kind: "النوع", amount: "المبلغ", method: "طريقة الدفع", wilaya: "الولاية" },
    tasks: { title: "المهمة", project: "المشروع", assignee: "المسؤول", lane: "المرحلة", priority: "الأولوية", due: "الاستحقاق", points: "النقاط" },
    events: { title: "المناسبة", kind: "النوع", date: "التاريخ", start: "الساعة", place: "المكان", people: "العدد", owner: "المسؤول" },
    subscriptions: { customer: "المشترك", plan: "الخطة", mrr: "الاشتراك الشهري", seats: "المقاعد", status: "الحالة", started: "البداية", renews: "التجديد", usage: "الاستعمال", country: "البلد" },
    plans: { name: "الخطة", price: "السعر", features: "المزايا" },
    agents: { name: "الوكيل", phone: "الهاتف", wilaya: "الولاية", deals: "الصفقات", rating: "التقييم" }
  };
  var LIST_FIELDS = ["name", "title", "ref", "ticket", "customer", "label"];
  var MONEY_FIELDS = ["price", "total", "spend", "value", "amount", "salary", "mrr", "cost", "subtotal", "tva"];
  var BADGE_FIELDS = ["status", "stage", "segment", "kind", "priority", "deal", "mode", "shift", "fees", "available", "insurance", "priority", "channel", "best", "type"];
  var SKIP_FIELDS = ["id", "slug", "coords", "marks", "photos", "barcode", "signed", "rank", "reviews"];

  function labelOf(dataset, key) {
    return (LABELS[dataset] && LABELS[dataset][key]) || key;
  }
  function isMoney(key) { return MONEY_FIELDS.indexOf(key) >= 0; }
  function isBadge(key) { return BADGE_FIELDS.indexOf(key) >= 0; }
  function primaryKey(rows) {
    for (var i = 0; i < LIST_FIELDS.length; i++) if (rows[0] && rows[0][LIST_FIELDS[i]] != null) return LIST_FIELDS[i];
    return Object.keys(rows[0] || {})[0] || "id";
  }
  function value(key, v) {
    if (v == null || v === "") return "—";
    if (Array.isArray(v)) return v.join(" · ");
    if (typeof v === "boolean") return v ? "نعم" : "لا";
    if (isMoney(key)) return A.fmt.dzd(Number(v));
    if (key === "rating") return A.fmt.num(v, 1) + " ★";
    if (key === "average" || key === "usage" || key === "satisfaction" || key === "attendance") return A.fmt.num(v, key === "satisfaction" ? 0 : 1) + (key === "average" ? "/20" : "%");
    if (/date|createdAt|added|lastVisit|lastMove|renews|started|due/.test(key)) return A.fmt.date(v, "short");
    if (typeof v === "number") return A.fmt.int(v);
    return String(v);
  }
  function cfgOf(host) {
    try { return JSON.parse(host.getAttribute("data-cfg") || "{}") || {}; }
    catch (e) { return {}; }
  }

  A.register({
    id: "view",
    title: "عرض البيانات",
    mount: function (host, ctx) {
      var cfg = cfgOf(host);
      var data = ctx.data || {};
      var dataset = cfg.data || cfg.host || "products";
      var rows = (data[dataset] || []).slice();
      if (!rows.length) {
        /* fall back to any dataset so a list screen is never empty */
        var keys = Object.keys(data).filter(function (k) { return Array.isArray(data[k]) && data[k].length; });
        dataset = keys[0] || dataset;
        rows = (data[dataset] || []).slice();
      }
      if (!rows.length) { host.appendChild(A.el("div", { class: "ax-empty", text: "لا توجد بيانات لهذا العرض — أضف سجلات في js/02-data.js" })); return; }

      var pk = primaryKey(rows);
      var keysAll = Object.keys(rows[0]).filter(function (k) { return SKIP_FIELDS.indexOf(k) < 0; });
      var badgeKeys = keysAll.filter(isBadge);
      var filters = badgeKeys.slice(0, 3).map(function (k) {
        var vals = [];
        rows.forEach(function (r) { var v = String(r[k]); if (v && vals.indexOf(v) < 0 && vals.length < 8) vals.push(v); });
        return { key: k, values: vals };
      }).filter(function (f) { return f.values.length > 1 && f.values.length < 9; });
      var sorts = [pk].concat(keysAll.filter(function (k) { return isMoney(k) || /rating|average|sold|qty|views|date|added/.test(k); })).slice(0, 5);
      var state = { q: "", page: 1, size: cfg.size || 12, sort: sorts[0], dir: "desc", pick: {}, layout: cfg.layout || (dataset === "posts" ? "cards" : "cards") };
      var ui = A.el("div", { class: "ax-view" });
      host.appendChild(ui);

      function filtered() {
        var out = rows.slice();
        if (state.q) {
          var needle = state.q.toLowerCase();
          out = out.filter(function (r) { return keysAll.some(function (k) { return String(r[k] == null ? "" : r[k]).toLowerCase().indexOf(needle) >= 0; }); });
        }
        filters.forEach(function (f) { if (state.pick[f.key]) out = out.filter(function (r) { return String(r[f.key]) === state.pick[f.key]; }); });
        out.sort(function (a, b) {
          var av = a[state.sort], bv = b[state.sort];
          var num = typeof av === "number" && typeof bv === "number";
          if (num) return (av - bv) * (state.dir === "asc" ? 1 : -1);
          return String(av).localeCompare(String(bv), "ar") * (state.dir === "asc" ? 1 : -1);
        });
        return out;
      }

      function detail(row) {
        var body = A.el("div", {});
        keysAll.slice(0, 14).forEach(function (k) {
          body.appendChild(A.el("div", { class: "ax-kv" }, [A.el("span", { class: "ax-dim", text: labelOf(dataset, k) }), A.el("b", { text: value(k, row[k]) })]));
        });
        A.modal({
          title: String(row[pk] || "تفاصيل"),
          body: body,
          actions: [
            { label: "إغلاق", kind: "ghost" },
            { label: "طباعة البطاقة", kind: "primary", onClick: function () { A.printDoc('<div class="ax-doc" dir="rtl"><h2>' + A.esc(String(row[pk])) + "</h2>" + body.innerHTML + "</div>", String(row[pk])); } }
          ]
        });
      }

      function cardOf(row) {
        var el = A.el("article", { class: "ax-card ax-card-hover ax-item", tabindex: "0", role: "button" });
        var head = A.el("div", { class: "ax-item-head" });
        head.appendChild(A.el("h3", { class: "ax-item-title", text: String(row[pk] || "—") }));
        var badgeKey = badgeKeys.filter(function (k) { return row[k] != null; })[0];
        if (badgeKey) head.appendChild(A.el("span", { class: "ax-badge ax-badge-" + (/متوفر|نشط|مكتمل|مدفوع|محلول|مُسلَّم|جديد|نعم/.test(String(row[badgeKey])) ? "ok" : /ملغى|متأخر|عاجلة|مفقود|لا/.test(String(row[badgeKey])) ? "err" : "warn"), text: String(row[badgeKey]) }));
        el.appendChild(head);
        keysAll.filter(function (k) { return k !== pk && k !== badgeKey && !isMoney(k) && k !== "desc" && k !== "note" }).slice(0, 4).forEach(function (k) {
          el.appendChild(A.el("div", { class: "ax-kv ax-kv-sm" }, [A.el("span", { class: "ax-dim", text: labelOf(dataset, k) }), A.el("span", { text: value(k, row[k]) })]));
        });
        var moneyKey = keysAll.filter(function (k) { return isMoney(k) && row[k] != null; })[0];
        var foot = A.el("div", { class: "ax-item-foot" });
        if (moneyKey) foot.appendChild(A.el("b", { class: "ax-price-tag", text: value(moneyKey, row[moneyKey]) }));
        foot.appendChild(A.el("span", { class: "ax-spacer" }));
        foot.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "التفاصيل", onclick: function (e) { e.stopPropagation(); detail(row); } }));
        el.appendChild(foot);
        A.on(el, "click", function () { detail(row); });
        A.on(el, "keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); detail(row); } });
        return el;
      }

      function tableOf(list) {
        var cols = [pk].concat(keysAll.filter(function (k) { return k !== pk; })).slice(0, 7);
        var wrap = A.el("div", { class: "ax-table-wrap" });
        var t = A.el("table", { class: "ax-table" });
        var head = "<tr>" + cols.map(function (k) { return '<th class="' + (isMoney(k) ? "ax-num" : "") + '">' + A.esc(labelOf(dataset, k)) + "</th>"; }).join("") + "<th></th></tr>";
        t.appendChild(A.el("thead", { html: head }));
        var tb = A.el("tbody", {});
        list.forEach(function (r) {
          var tr = A.el("tr", {});
          cols.forEach(function (k) {
            var td = A.el("td", { class: isMoney(k) ? "ax-num" : "" });
            if (isBadge(k)) { td.appendChild(A.el("span", { class: "ax-badge", text: String(r[k]) })); }
            else td.textContent = value(k, r[k]);
            tr.appendChild(td);
          });
          var act = A.el("td", {});
          act.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "عرض", onclick: function () { detail(r); } }));
          tr.appendChild(act);
          tb.appendChild(tr);
        });
        t.appendChild(tb);
        wrap.appendChild(t);
        return wrap;
      }

      function render() {
        ui.innerHTML = "";
        var bar = A.el("div", { class: "ax-view-bar" });
        var search = A.el("input", { class: "ax-input", type: "search", placeholder: "ابحث في " + A.fmt.int(rows.length) + " سجل…", "aria-label": "بحث" });
        A.on(search, "input", A.debounce(function () { state.q = search.value; state.page = 1; body_(); }, 160));
        bar.appendChild(search);
        filters.forEach(function (f) {
          var sel = A.el("select", { class: "ax-select", "aria-label": labelOf(dataset, f.key) });
          sel.appendChild(A.el("option", { value: "", text: "كل " + labelOf(dataset, f.key) }));
          f.values.forEach(function (v) { sel.appendChild(A.el("option", { value: v, text: v, selected: state.pick[f.key] === v })); });
          A.on(sel, "change", function () { if (sel.value) state.pick[f.key] = sel.value; else delete state.pick[f.key]; state.page = 1; body_(); });
          bar.appendChild(sel);
        });
        var sortSel = A.el("select", { class: "ax-select", "aria-label": "الترتيب" });
        sorts.forEach(function (k) { sortSel.appendChild(A.el("option", { value: k, text: "ترتيب: " + labelOf(dataset, k), selected: state.sort === k })); });
        A.on(sortSel, "change", function () { state.sort = sortSel.value; body_(); });
        bar.appendChild(sortSel);
        bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: state.dir === "desc" ? "↓ تنازلي" : "↑ تصاعدي", onclick: function () { state.dir = state.dir === "desc" ? "asc" : "desc"; render(); } }));
        bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("filter", 15) + " جدول", onclick: function () { state.layout = state.layout === "table" ? "cards" : "table"; render(); } }));
        bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("download", 15) + " CSV", onclick: function () { A.download("nexus-" + dataset + ".csv", A.csv(filtered(), [pk].concat(keysAll.slice(0, 10))), "text/csv;charset=utf-8"); A.toast("صُدِّر " + A.fmt.int(filtered().length) + " سجل", "ok"); } }));
        ui.appendChild(bar);

        function body_() {
          var old = A.q(".ax-view-body", ui);
          if (old) old.remove();
          var list = filtered();
          var body = A.el("div", { class: "ax-view-body" });
          var start = (state.page - 1) * state.size;
          var pageRows = list.slice(start, start + state.size);
          if (!pageRows.length) body.appendChild(A.el("div", { class: "ax-empty", text: "ما لقيناش نتائج مطابقة — بدّل الفلتر أو البحث." }));
          else if (state.layout === "table") body.appendChild(tableOf(pageRows));
          else {
            var g = A.el("div", { class: "ax-grid ax-grid-3" });
            pageRows.forEach(function (r) { g.appendChild(cardOf(r)); });
            body.appendChild(g);
          }
          var total = list.length;
          var pages = Math.max(1, Math.ceil(total / state.size));
          var pager = A.el("div", { class: "ax-pager" });
          pager.appendChild(A.el("span", { class: "ax-dim", text: A.fmt.int(total) + " نتيجة · صفحة " + state.page + " من " + pages }));
          var prev = A.el("button", { type: "button", text: "‹", disabled: state.page === 1, onclick: function () { state.page--; body_(); } });
          var next = A.el("button", { type: "button", text: "›", disabled: state.page === pages, onclick: function () { state.page++; body_(); } });
          pager.appendChild(prev);
          for (var p = Math.max(1, state.page - 2); p <= Math.min(pages, state.page + 2); p++) {
            (function (pp) { pager.appendChild(A.el("button", { type: "button", class: pp === state.page ? "is-on" : "", text: String(pp), onclick: function () { state.page = pp; body_(); } })); })(p);
          }
          pager.appendChild(next);
          body.appendChild(pager);
          ui.appendChild(body);
          A.reveal(body);
        }
        body_();
      }

      render();
      A.bus.emit("view:ready", { dataset: dataset, rows: rows.length });
    }
  });
})();
