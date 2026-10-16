/*@meta {"id":"docs","title":"بوابة الوثائق","domain":"content","tags":["docs","guide","api","search","anchors"],"order":51,"needs":["kernel"]}*/
/* In-app documentation portal: sidebar nav, live search with highlighting, anchors, code copy, print. */
(function () {
  var A = window.APEX;
  A.register({
    id: "docs",
    title: "الوثائق",
    mount: function (host, ctx) {
      var project = (window.APEX_PLAN && window.APEX_PLAN.title) || "المشروع";
      var SECTIONS = [
        { id: "intro", title: "المقدمة", body: "<p><b>" + A.esc(project) + "</b> تطبيق ويب كامل يشتغل بلا إنترنت: بلا مكتبات خارجية، بلا سيرفر، وبلا حساب. كل شيء داخل نفس المجلد.</p><p>هذه الوثائق مكتوبة داخل المشروع وتُقرأ أوفلاين.</p>" },
        { id: "start", title: "التشغيل السريع", body: "<ol><li>افتح <code>index.html</code> مباشرة.</li><li>أو خدّم المجلد: <code>npx serve .</code></li><li>افتح العنوان المعروض في المتصفح.</li></ol><pre dir='ltr'>npx serve .\n# http://localhost:3000</pre>" },
        { id: "structure", title: "بنية الملفات", body: "<pre dir='ltr'>index.html      كل الصفحات مدمجة\ncss/app.css     نظام التصميم\njs/01-strings.js  النصوص\njs/02-data.js   البيانات + الصفحات\njs/mods/*.js    الوحدات\njs/99-boot.js   الإقلاع\nsw.js manifest  أوفلاين PWA</pre>" },
        { id: "data", title: "البيانات والحفظ", body: "<p>المعطيات في <code>window.APEX_DATA</code>، وكل تعديل من الواجهة يُحفظ في <code>localStorage</code> تحت المفتاح <code>apex:</code>.</p><pre dir='ltr'>const rows = window.APEX_DATA.transactions;\nconsole.log(rows.length, \"سجل\");</pre>" },
        { id: "add", title: "زيد صفحة أو وحدة", body: "<p>الصفحات في <code>window.APEX_PAGES</code>: أضف كائنًا فيه <code>id</code> و<code>title</code> و<code>html</code>، وضع فيه عنصر <code>&lt;div data-apex=\"charts\"&gt;&lt;/div&gt;</code> وستُركَّب الوحدة تلقائيًا.</p><pre dir='ltr'>APEX_PAGES.push({ id: \"new\", title: \"جديد\", html: \"&lt;div data-apex='datagrid'&gt;&lt;/div&gt;\" });</pre>" },
        { id: "theme", title: "الألوان والتصميم", body: "<p>كل التصميم متغيرات CSS في أول <code>css/app.css</code>:</p><pre dir='ltr'>:root{ --ax-brand:#d97757; --ax-accent:#e6c37a; --ax-r:16px; }</pre><p>بدّل هذي القيم ويتغيّر المشروع كامل (أزرار، رسوم، حدود، توهّج).</p>" },
        { id: "export", title: "التصدير والطباعة", body: "<p>كل جدول يقبل تصدير CSV/JSON، وكل مستند يقبل طباعة A4 أو PDF من مركز الطباعة.</p>" },
        { id: "deploy", title: "النشر", body: "<table><tr><th>منصة</th><th>طريقة</th></tr><tr><td>Vercel</td><td><code>vercel --prod</code></td></tr><tr><td>Netlify</td><td>اسحب المجلد</td></tr><tr><td>GitHub Pages</td><td>فعّل Pages على المجلد</td></tr></table>" },
        { id: "faq", title: "أسئلة تقنية", body: "<dl><dt>واش من متصفحات؟</dt><dd>كل متصفح حديث (Chrome 90+, Safari 15+, Firefox 90+).</dd><dt>كاين سيرفر؟</dt><dd>لا. لكن تقدر توصله بـ API خارجي إن حبيت.</dd><dt>كيفاش نحدّث؟</dt><dd>بدّل الملفات وأعد التحميل — الـ Service Worker يحدّث الكاش.</dd></dl>" }
      ];
      var ui = A.el("div", { class: "ax-doc-layout", style: { marginTop: "18px" } });
      host.appendChild(ui);
      function render(q) {
        ui.innerHTML = "";
        var nav = A.el("aside", { class: "ax-doc-side" });
        var search = A.el("input", { class: "ax-input", type: "search", placeholder: "ابحث في الوثائق…", value: q || "", "aria-label": "بحث" });
        nav.appendChild(search);
        var hits = SECTIONS.filter(function (s) { return !q || (s.title + " " + s.body).toLowerCase().indexOf(q.toLowerCase()) >= 0; });
        hits.forEach(function (s) { nav.appendChild(A.el("a", { href: "#doc-" + s.id, text: s.title })); });
        nav.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", style: { marginTop: "10px" }, html: A.icon("download", 15) + " طباعة الوثائق", onclick: function () {
          A.printDoc('<div class="ax-doc" dir="rtl">' + SECTIONS.map(function (s) { return "<h2>" + s.title + "</h2>" + s.body; }).join("") + "</div>", "الوثائق");
        } }));
        ui.appendChild(nav);
        var main = A.el("main", { class: "ax-prose" });
        if (!hits.length) main.appendChild(A.el("p", { class: "ax-empty", text: "ما كانش نتائج — جرّب كلمة أخرى" }));
        hits.forEach(function (s) {
          var sec = A.el("section", { id: "doc-" + s.id });
          sec.appendChild(A.el("h2", { text: s.title }));
          sec.appendChild(A.el("div", { html: s.body }));
          if (s.body.indexOf("<pre") >= 0) {
            A.qa("pre", sec).forEach(function (pre) {
              pre.style.position = "relative";
              pre.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", style: { position: "absolute", insetInlineEnd: "8px", top: "8px" }, text: "نسخ", onclick: function () { A.copy(pre.textContent.replace("نسخ", "")); } }));
            });
          }
          main.appendChild(sec);
        });
        ui.appendChild(main);
        A.on(search, "input", A.debounce(function () { render(search.value); }, 150));
      }
      render("");
    }
  });
})();
