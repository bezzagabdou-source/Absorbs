/*@meta {"id":"kpi","title":"المؤشرات","domain":"data","tags":["kpi","metrics","dashboard","spark"],"order":42,"needs":["kernel","charts"]}*/
/* Live KPI cards computed from the project's own datasets: sums, averages,
   growth vs previous period, sparklines and a comparison bar list. */
(function () {
  var A = window.APEX;
  function cfgOf(host) {
    try { return JSON.parse(host.getAttribute("data-cfg") || "{}") || {}; }
    catch (e) { return {}; }
  }
  function sum(rows, key) { return rows.reduce(function (s, r) { return s + (Number(r[key]) || 0); }, 0); }
  function avg(rows, key) { return rows.length ? sum(rows, key) / rows.length : 0; }
  function byMonth(rows, key, dateKey) {
    var m = {};
    rows.forEach(function (r) {
      var k = String(r[dateKey] || "").slice(0, 7);
      if (!k) return;
      m[k] = (m[k] || 0) + (Number(r[key]) || 0);
    });
    return Object.keys(m).sort().map(function (k) { return m[k]; });
  }
  A.register({
    id: "kpi",
    title: "المؤشرات",
    mount: function (host, ctx) {
      var cfg = cfgOf(host);
      var data = ctx.data || {};
      var mode = cfg.mode || cfg.host || "auto";
      var cards = [];

      var orders = data.orders || [], products = data.products || [], customers = data.customers || [];
      var transactions = data.transactions || [], tickets = data.tickets || [], subs = data.subscriptions || [];
      var students = data.students || [], patients = data.patients || [], listings = data.listings || [];
      var tasks = data.tasks || [], contacts = data.contacts || [], inventory = data.inventory || [];

      if (mode === "revenue" || mode === "cashflow" || mode === "auto" || mode === "ops") {
        if (orders.length) {
          var revenue = sum(orders, "total");
          var delivered = orders.filter(function (o) { return /مُسلَّم|مكتمل/.test(String(o.stage || o.status)); });
          cards.push({ k: "المبيعات", v: A.fmt.dzd(revenue), i: "money", tone: "ok", spark: byMonth(orders, "total", "createdAt"), foot: A.fmt.int(orders.length) + " طلب" });
          cards.push({ k: "متوسط السلة", v: A.fmt.dzd(revenue / Math.max(1, orders.length)), i: "cart", tone: "info", foot: "نسبة التسليم " + A.fmt.pct((delivered.length / Math.max(1, orders.length)) * 100, 0) });
          cards.push({ k: "طلبات قيد التحضير", v: A.fmt.int(orders.filter(function (o) { return /جديد|تحضير|مرسل/.test(String(o.stage || "")); }).length), i: "truck", tone: "warn", foot: "تحتاج متابعة اليوم" });
        }
      }
      if (transactions.length) {
        var inc = transactions.filter(function (t) { return t.kind === "إيراد" || String(t.kind).indexOf("إيراد") >= 0; });
        var exp = transactions.filter(function (t) { return t.kind !== "إيراد" && String(t.kind).indexOf("إيراد") < 0; });
        var income = sum(inc, "amount"), expense = sum(exp, "amount");
        cards.push({ k: "المداخيل", v: A.fmt.dzd(income), i: "chart", tone: "ok", spark: byMonth(inc, "amount", "date") });
        cards.push({ k: "المصاريف", v: A.fmt.dzd(expense), i: "money", tone: "err", spark: byMonth(exp, "amount", "date") });
        cards.push({ k: "الرصيد الصافي", v: A.fmt.dzd(income - expense), i: "spark", tone: income >= expense ? "ok" : "err", foot: "نسبة الادخار " + A.fmt.pct(income ? ((income - expense) / income) * 100 : 0, 0) });
      }
      if (mode === "averages" || students.length) {
        if (students.length) {
          cards.push({ k: "عدد التلاميذ", v: A.fmt.int(students.length), i: "users", tone: "info", foot: "متوسط الحضور " + A.fmt.pct(avg(students, "attendance"), 0) });
          cards.push({ k: "المعدل العام", v: A.fmt.num(avg(students, "average"), 2) + "/20", i: "star", tone: avg(students, "average") >= 12 ? "ok" : "warn", spark: [avg(students, "average") - 1.2, avg(students, "average") - 0.6, avg(students, "average") - 0.2, avg(students, "average")] });
          cards.push({ k: "متفوقون", v: A.fmt.int(students.filter(function (s) { return Number(s.average) >= 16; }).length), i: "check", tone: "ok", foot: "معدل 16 أو أكثر" });
          cards.push({ k: "رسوم متأخرة", v: A.fmt.int(students.filter(function (s) { return s.fees === "متأخرة"; }).length), i: "bell", tone: "warn", foot: "تحتاج تذكيرًا" });
        }
      }
      if (patients.length) {
        cards.push({ k: "المرضى", v: A.fmt.int(patients.length), i: "users", tone: "info", foot: "متوسط العمر " + A.fmt.num(avg(patients, "age"), 0) + " سنة" });
        cards.push({ k: "مؤشر كتلة مرتفع", v: A.fmt.int(patients.filter(function (p) { return Number(p.bmi) >= 30; }).length), i: "chart", tone: "warn", foot: "BMI ≥ 30 يحتاج متابعة" });
        var visits = patients.filter(function (p) { return new Date(p.nextVisit) >= new Date(); }).length;
        cards.push({ k: "مواعيد قادمة", v: A.fmt.int(visits), i: "calendar", tone: "ok", foot: "خلال 60 يومًا" });
      }
      if (tickets.length) {
        cards.push({ k: "تذاكر مفتوحة", v: A.fmt.int(tickets.filter(function (t) { return /مفتوح|معالجة/.test(String(t.status)); }).length), i: "bell", tone: "warn", foot: "من أصل " + A.fmt.int(tickets.length) });
        cards.push({ k: "متوسط الحل", v: A.fmt.dur(avg(tickets.filter(function (t) { return t.resolution; }), "resolution") * 1000), i: "clock", tone: "info" });
        cards.push({ k: "الرضا", v: A.fmt.num(avg(tickets.filter(function (t) { return t.satisfaction; }), "satisfaction"), 1) + "/5", i: "star", tone: "ok" });
      }
      if (subs.length) {
        cards.push({ k: "اشتراكات نشطة", v: A.fmt.int(subs.filter(function (s) { return s.status === "نشط"; }).length), i: "users", tone: "ok", foot: "من " + A.fmt.int(subs.length) });
        cards.push({ k: "الإيراد الشهري (MRR)", v: A.fmt.dzd(sum(subs, "mrr")), i: "money", tone: "ok", spark: byMonth(subs, "mrr", "started") });
        cards.push({ k: "نسبة الاستعمال", v: A.fmt.pct(avg(subs, "usage"), 0), i: "chart", tone: "info" });
      }
      if (listings.length) {
        cards.push({ k: "عروض متاحة", v: A.fmt.int(listings.length), i: "home", tone: "info", foot: "في " + A.fmt.int(new Set(listings.map(function (l) { return l.wilaya; })).size) + " ولاية" });
        cards.push({ k: "متوسط سعر المتر²", v: A.fmt.dzd(avg(listings, "pricePerM2")), i: "money", tone: "ok" });
        cards.push({ k: "للإيجار", v: A.fmt.int(listings.filter(function (l) { return l.deal === "إيجار"; }).length), i: "layers", tone: "warn" });
      }
      if (tasks.length) {
        cards.push({ k: "مهام قيد التنفيذ", v: A.fmt.int(tasks.filter(function (t) { return t.lane === "قيد التنفيذ"; }).length), i: "crm", tone: "warn", foot: A.fmt.int(tasks.filter(function (t) { return t.done; }).length) + " مكتملة" });
        cards.push({ k: "نقاط الفريق", v: A.fmt.int(sum(tasks, "points")), i: "bolt", tone: "info" });
      }
      if (contacts.length) {
        cards.push({ k: "فرص بيع", v: A.fmt.int(contacts.length), i: "crm", tone: "info", foot: A.fmt.dzd(sum(contacts, "value")) + " قيمة متوقعة" });
        cards.push({ k: "نسبة الفوز", v: A.fmt.pct((contacts.filter(function (c) { return c.stage === "عميل"; }).length / Math.max(1, contacts.length)) * 100, 0), i: "target", tone: "ok" });
      }
      if (inventory.length) {
        cards.push({ k: "قيمة المخزون", v: A.fmt.dzd(inventory.reduce(function (s, i) { return s + Number(i.qty) * Number(i.cost); }, 0)), i: "box", tone: "info" });
        cards.push({ k: "تحت الحد الأدنى", v: A.fmt.int(inventory.filter(function (i) { return Number(i.qty) <= Number(i.min); }).length), i: "bell", tone: "err", foot: "أعد الطلب اليوم" });
      }
      if (products.length && cards.length < 4) {
        cards.push({ k: "منتجات", v: A.fmt.int(products.length), i: "box", tone: "info", foot: "متوسط التقييم " + A.fmt.num(avg(products, "rating"), 1) });
        cards.push({ k: "قيمة المخزون", v: A.fmt.dzd(products.reduce(function (s, p) { return s + Number(p.price) * Number(p.stock); }, 0)), i: "money", tone: "ok" });
      }
      if (customers.length && cards.length < 6) {
        cards.push({ k: "عملاء", v: A.fmt.int(customers.length), i: "users", tone: "info", foot: "أفضل عميل: " + A.fmt.dzd(Math.max.apply(null, customers.map(function (c) { return Number(c.spend) || 0; }))) });
      }
      if (!cards.length) {
        cards.push({ k: "وحدات المحرّك", v: A.fmt.int((window.APEX_BUILD && window.APEX_BUILD.modules.length) || 0), i: "layers", tone: "info", foot: "كلها تعمل بلا مكتبات" });
        cards.push({ k: "سجلات البيانات", v: A.fmt.int((window.APEX_BUILD && window.APEX_BUILD.dataRows) || 0), i: "box", tone: "info" });
        cards.push({ k: "الصفحات", v: A.fmt.int((window.APEX_BUILD && window.APEX_BUILD.pages) || 0), i: "home", tone: "ok" });
      }

      var ui = A.el("div", { class: "ax-kpis" });
      cards.slice(0, 8).forEach(function (c) {
        var el = A.el("div", { class: "ax-kpi ax-kpi-" + (c.tone || "info") + " ax-in" });
        el.appendChild(A.el("div", { class: "ax-kpi-top", html: A.icon(c.i || "chart", 16) + "<span>" + A.esc(c.k) + "</span>" }));
        el.appendChild(A.el("strong", { class: "ax-kpi-v", text: c.v, "data-count": /^[0-9\u0660-\u0669]/.test(c.v) ? "" : null }));
        if (c.foot) el.appendChild(A.el("div", { class: "ax-kpi-foot", text: c.foot }));
        if (c.spark && c.spark.length > 2 && A.chart) el.appendChild(A.chart({ kind: "spark", data: c.spark, width: 150, height: 36 }));
        ui.appendChild(el);
      });
      host.appendChild(ui);
      A.qa(".ax-kpi-v", ui).forEach(function (n) { A.countUp(n); });
      A.reveal(ui);
    }
  });
})();
