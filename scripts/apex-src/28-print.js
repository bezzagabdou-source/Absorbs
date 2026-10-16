/*@meta {"id":"print","title":"الطباعة والتقارير","domain":"business","tags":["print","pdf","report","invoice","certificate"],"order":48,"needs":["kernel"]}*/
/* Print centre: monthly report, invoice, receipt, certificate, custom document — all print/PDF ready. */
(function () {
  var A = window.APEX;
  A.register({
    id: "print",
    title: "مركز الطباعة",
    mount: function (host, ctx) {
      var seed = (ctx.plan && ctx.plan.seed) || 5;
      var rng = A.rng(seed);
      var company = (window.APEX_DATA && window.APEX_DATA.brand) || "المؤسسة";
      var ui = A.el("div", { class: "ax-grid", style: { gap: "14px" } });
      host.appendChild(ui);
      var month = new Date().toISOString().slice(0, 7);
      var tx = (ctx.data.transactions || []).filter(function (t) { return String(t.date).slice(0, 7) === month; });
      if (!tx.length) tx = ctx.data.transactions || [];
      var income = tx.filter(function (t) { return t.kind === "income"; }).reduce(function (s, t) { return s + Number(t.amount); }, 0);
      var expense = tx.filter(function (t) { return t.kind === "expense"; }).reduce(function (s, t) { return s + Number(t.amount); }, 0);

      function render() {
        ui.innerHTML = "";
        ui.appendChild(A.el("div", { class: "ax-kpis", html: [
          ["مستندات جاهزة", "5 قوالب", "book"],
          ["الفترة", month, "calendar"],
          ["النتيجة", A.fmt.dzd(income - expense), "money"],
          ["مقاس الورق", "A4 · RTL", "layers"]
        ].map(function (r) { return '<div class="ax-kpi ax-kpi-ok ax-in"><div class="ax-kpi-top">' + A.icon(r[2], 16) + "<span>" + r[0] + "</span></div><strong class='ax-kpi-v'>" + A.esc(r[1]) + "</strong></div>"; }).join("") }));
        var cards = A.el("div", { class: "ax-three ax-grid" });
        [
          { id: "report", icon: "chart", title: "تقرير شهري", text: "مداخيل، مصاريف، ميزانية وتوزيع بالفئات" },
          { id: "invoice", icon: "money", title: "فاتورة رسمية", text: "مع NIF، TVA، بنود، ومبلغ للدفع" },
          { id: "receipt", icon: "box", title: "وصل تسليم", text: "وصل بسيط للعميل مع رقم التتبع" },
          { id: "certificate", icon: "star", title: "شهادة / تقدير", text: "شهادة إتمام مع رقم مرجعي وتوقيع" },
          { id: "contract", icon: "shield", title: "عقد خدمة", text: "نموذج عقد مبسّط مع بنود ومدة" },
          { id: "custom", icon: "edit", title: "مستند حر", text: "اكتب عنوانًا ونصًا واطبع كما هو" }
        ].forEach(function (c) {
          cards.appendChild(A.el("article", { class: "ax-card ax-card-hover", style: { cursor: "pointer" }, html: '<div style="font-size:26px">' + A.icon(c.icon, 26) + "</div><h3>" + A.esc(c.title) + "</h3><p class='ax-dim' style='margin:0'>" + A.esc(c.text) + "</p>", onclick: function () { open(c.id, c.title); } }));
        });
        ui.appendChild(cards);
        var preview = A.el("div", { class: "ax-card" });
        preview.appendChild(A.el("h3", { text: "معاينة التقرير الشهري" }));
        preview.appendChild(A.el("div", { class: "ax-invoice-preview", html: reportHtml() }));
        preview.appendChild(A.el("div", { class: "ax-grid-bar", style: { marginTop: "12px" } }, [
          A.el("button", { type: "button", class: "ax-btn ax-btn-primary", html: A.icon("download") + " طباعة / PDF", onclick: function () { A.printDoc(reportHtml(), "تقرير " + month); } }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost", html: A.icon("download") + " تنزيل HTML", onclick: function () { A.download("report-" + month + ".html", reportHtml(), "text/html;charset=utf-8"); } })
        ]));
        ui.appendChild(preview);
      }
      function reportHtml() {
        var byCat = {};
        tx.forEach(function (t) { byCat[t.cat] = (byCat[t.cat] || 0) + Number(t.amount); });
        var rows = Object.keys(byCat).map(function (k) { return "<tr><td>" + A.esc(k) + "</td><td class='n'>" + A.fmt.dzd(byCat[k]) + "</td></tr>"; }).join("");
        return '<div class="ax-doc" dir="rtl"><header class="ax-doc-head"><div><h2>' + A.esc(company) + "</h2><p class='ax-dim'>تقرير مالي شهري · " + month + "</p></div><div class='ax-doc-meta'><b>وثيقة داخلية</b><span>صفحة 1/1</span></div></header>" +
          '<div style="display:flex;gap:14px;flex-wrap:wrap;margin:14px 0"><div><b>المداخيل:</b> ' + A.fmt.dzd(income) + "</div><div><b>المصاريف:</b> " + A.fmt.dzd(expense) + "</div><div><b>النتيجة:</b> " + A.fmt.dzd(income - expense) + "</div></div>" +
          "<table class='ax-doc-table'><thead><tr><th>البند</th><th class='n'>المبلغ</th></tr></thead><tbody>" + rows + "</tbody></table>" +
          "<p class='ax-doc-note'>هذا التقرير محسوب من " + tx.length + " عملية مسجلة في النظام. الأرقام بالدينار الجزائري.</p>" +
          "<footer class='ax-doc-foot'>حرّر بواسطة NEXUS APEX · " + A.fmt.date(new Date(), "long") + "</footer></div>";
      }
      function open(kind, title) {
        var html = "";
        if (kind === "report") html = reportHtml();
        else if (kind === "invoice") html = A.invoice({ number: "FA-" + new Date().getFullYear() + "-" + rng.int(100, 999), date: new Date(), company: company, client: { name: (ctx.data.contacts && ctx.data.contacts[0] && ctx.data.contacts[0].name) || "العميل", nif: "0000" + rng.int(100000, 999999) }, lines: [{ label: "خدمات واستشارات", qty: 1, price: 45000 }, { label: "صيانة دورية", qty: 3, price: 6500 }], tva: 19 });
        else if (kind === "receipt") html = '<div class="ax-doc" dir="rtl"><header class="ax-doc-head"><div><h2>وصل تسليم</h2><p class="ax-dim">' + A.esc(company) + "</p></div><div class='ax-doc-meta'><b>TRK-" + rng.int(100000, 999999) + "</b><span>" + A.fmt.date(new Date(), "long") + "</span></div></header>" +
          "<p>تسلّم السيد(ة) <b>________________</b> الطلبية عدد <b>" + rng.int(1, 9) + "</b> — الحالة: <b>سليمة</b>.</p>" +
          "<p class='ax-doc-note'>التوقيع: ____________________ &nbsp;&nbsp; ختم المؤسسة: ____________________</p>" +
          "<footer class='ax-doc-foot'>يُستعمل هذا الوصل كإثبات تسليم.</footer></div>";
        else if (kind === "certificate") html = '<div class="ax-doc" dir="rtl" style="text-align:center"><h2 style="font-size:26px">شهادة إتمام</h2><p class="ax-dim">تشهد المؤسسة أن</p><h3 style="font-size:22px">' +
          A.esc((ctx.data.students && ctx.data.students[0] && ctx.data.students[0].name) || (ctx.data.staff && ctx.data.staff[0] && ctx.data.staff[0].name) || "المعني بالأمر") +
          "</h3><p>أتم بنجاح البرنامج التدريبي المحدد في مدة " + rng.int(2, 12) + " أسابيع، بمعدل عام " + rng.float(14, 18, 2) + "/20.</p><p class='ax-doc-note'>رقم المرجع: CERT-" + rng.int(10000, 99999) + " · " + A.fmt.date(new Date(), "long") + "</p><footer class='ax-doc-foot'>توقيع المدير: ____________________</footer></div>";
        else if (kind === "contract") html = '<div class="ax-doc" dir="rtl"><h2>عقد تقديم خدمات</h2><p>بين الموقّعين أدناه: <b>' + A.esc(company) + "</b> و<b>العميل</b>.</p><ol>" +
          ["الموضوع: تنفيذ الخدمات المتفق عليها حسب العرض التقني.", "المدة: " + rng.int(1, 12) + " أشهر من تاريخ التوقيع.", "المبلغ: " + A.fmt.dzd(rng.int(60000, 900000)) + " يدفع " + rng.pick(["دفعة واحدة", "على 3 أقساط", "50% مقدّمًا"]) + ".", "الالتزامات: التسليم في الآجال، الجودة المطابقة، والسرية الكاملة.", "الفسخ: بإشعار كتابي قبل 15 يومًا."].map(function (x, i) { return "<li>" + A.esc(x) + "</li>"; }).join("") + "</ol><p class='ax-doc-note'>حرّر بالجزائر العاصمة في " + A.fmt.date(new Date(), "long") + "</p><div style='display:flex;gap:30px;margin-top:24px'><span>الطرف الأول: __________</span><span>الطرف الثاني: __________</span></div></div>";
        else {
          var t = A.el("input", { class: "ax-input", value: title, "aria-label": "العنوان" });
          var b = A.el("textarea", { class: "ax-input", rows: 8, placeholder: "اكتب نص المستند…", "aria-label": "النص" });
          var box = A.el("div", { class: "ax-grid" }, [t, b]);
          var m = A.modal({ title: "مستند حر", wide: true, html: box, actions: [
            { label: "طباعة", kind: "primary", onClick: function () { A.printDoc('<div class="ax-doc" dir="rtl"><h2>' + A.esc(t.value) + "</h2><p>" + A.esc(b.value).replace(/\n/g, "<br>") + "</p></div>", t.value); } },
            { label: "إغلاق", kind: "ghost" }
          ] });
          void m;
          return;
        }
        A.modal({ title: title, wide: true, html: '<div class="ax-invoice-preview">' + html + "</div>", actions: [
          { label: "طباعة / PDF", kind: "primary", icon: "download", onClick: function () { A.printDoc(html, title); } },
          { label: "تنزيل", kind: "ghost", icon: "download", onClick: function () { A.download(title + ".html", html, "text/html;charset=utf-8"); } },
          { label: "إغلاق", kind: "ghost" }
        ] });
      }
      render();
    }
  });
})();
