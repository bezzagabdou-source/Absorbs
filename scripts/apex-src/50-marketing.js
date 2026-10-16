/*@meta {"id":"marketing","title":"الأقسام التسويقية","domain":"content","tags":["hero","features","pricing","faq","testimonials","landing"],"order":40,"needs":["kernel","motion"]}*/
/* Every marketing block a real launch page needs: hero, feature grid, pricing
   table, testimonials, FAQ accordion, steps, about, SLA table and tips —
   written in Arabic, responsive, and driven by the project's own data. */
(function () {
  var A = window.APEX;
  function cfgOf(host) {
    try { return JSON.parse(host.getAttribute("data-cfg") || "{}") || {}; }
    catch (e) { return {}; }
  }
  function section(title, sub, body) {
    var wrap = A.el("div", { class: "ax-wrap ax-reveal" });
    if (title) wrap.appendChild(A.el("h2", { class: "ax-h2", text: title }));
    if (sub) wrap.appendChild(A.el("p", { class: "ax-lead", text: sub }));
    if (body) wrap.appendChild(body);
    return wrap;
  }
  function grid(items, cols) {
    var g = A.el("div", { class: "ax-grid ax-grid-" + (cols || 3) });
    items.forEach(function (it) { g.appendChild(it); });
    return g;
  }
  function card(icon, title, text) {
    return A.el("article", { class: "ax-card ax-card-hover ax-reveal" }, [
      A.el("div", { class: "ax-ico", html: A.icon(icon, 22) }),
      A.el("h3", { text: title }),
      A.el("p", { class: "ax-dim", text: text })
    ]);
  }
  A.register({
    id: "marketing",
    title: "أقسام التسويق",
    mount: function (host, ctx) {
      var cfg = cfgOf(host);
      var variant = cfg.host || cfg.variant || "features";
      var app = (window.APEX_STRINGS && window.APEX_STRINGS.app) || {};
      var title = app.title || (ctx.plan && ctx.plan.title) || "نكسس";
      var tagline = app.tagline || "حل رقمي جاهز للاستعمال";
      var out = A.el("div", { class: "ax-mark ax-mark-" + variant });
      host.appendChild(out);

      function hero(kind) {
        var box = A.el("div", { class: "ax-hero ax-reveal" });
        var left = A.el("div", { class: "ax-hero-copy" });
        left.appendChild(A.el("span", { class: "ax-pill", text: kind || "الجزائر · بلا مكاتب خارجية" }));
        left.appendChild(A.el("h1", { text: title }));
        left.appendChild(A.el("p", { class: "ax-lead", text: tagline }));
        var cta = A.el("div", { class: "ax-row" });
        cta.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-btn-lg", html: A.icon("bolt", 18) + " ابدأ الآن", onclick: function () { A.bus.emit("cta:primary"); A.toast("يلا نبداو — افتح الصفحة الأولى", "ok"); } }));
        cta.appendChild(A.el("a", { class: "ax-btn ax-btn-ghost ax-btn-lg", href: "#" + ((window.APEX_BUILD && window.APEX_BUILD.pages > 1) ? "1" : "home"), text: "شوف التفاصيل" }));
        left.appendChild(cta);
        var stats = A.el("div", { class: "ax-hero-stats" });
        [["5,000+", "سجل بيانات جاهز"], ["58", "ولاية مغطاة"], ["0", "مكتبة خارجية"], ["3 ثوانٍ", "زمن التحميل"]].forEach(function (s) {
          stats.appendChild(A.el("div", { class: "ax-stat" }, [A.el("b", { text: s[0] }), A.el("span", { class: "ax-dim", text: s[1] })]));
        });
        left.appendChild(stats);
        box.appendChild(left);
        var right = A.el("div", { class: "ax-hero-art" }, [
          A.el("div", { class: "ax-glass-card ax-tilt" }, [
            A.el("div", { class: "ax-row-between" }, [A.el("b", { text: "لوحة مباشرة" }), A.el("span", { class: "ax-badge ax-badge-ok", text: "يعمل الآن" })]),
            A.el("div", { class: "ax-kpis" }, [
              A.el("div", { class: "ax-kpi" }, [A.el("span", { class: "ax-kpi-k", text: "الطلبات اليوم" }), A.el("strong", { class: "ax-kpi-v", text: A.fmt.int(128) })]),
              A.el("div", { class: "ax-kpi" }, [A.el("span", { class: "ax-kpi-k", text: "المبيعات" }), A.el("strong", { class: "ax-kpi-v", text: A.fmt.dzd(184000) })])
            ])
          ])
        ]);
        box.appendChild(right);
        return box;
      }

      var render = {
        "hero": function () { return hero("منصة جزائرية"); },
        "hero-shop": function () { return hero("توصيل إلى 58 ولاية"); },
        "hero-blog": function () { return hero("محتوى مبني على تجربة"); },
        "hero-portfolio": function () { return hero("أعمال مختارة"); },
        "hero-travel": function () { return hero("اكتشف الجزائر"); },
        "hero-re": function () { return hero("عروض في 58 ولاية"); },
        "hero-resto": function () { return hero("نكهة بيتية"); },
        "hero-support": function () { return hero("دعم بزمن استجابة مضمون"); },
        features: function () {
          return section("كل ما تحتاجه… في مكان واحد", "وحدات حقيقية تشتغل من أول تحميل، بلا إعداد طويل.", grid([
            card("bolt", "سرعة فورية", "بلا مكتبات خارجية: الصفحة تُرسم من الملف الأول، والتنقل لحظي."),
            card("shield", "أمان افتراضي", "تنقية كل نص مُدخل، وتخزين محلي بلا إرسال بيانات لأي جهة."),
            card("globe", "عربي أولًا", "RTL كامل، خطوط عربية، تواريخ ومبالغ بصيغة جزائرية (دج)."),
            card("layers", "وحدات مركّبة", "أضف وحدة جديدة بسطر واحد، أو أزل ما لا تحتاجه."),
            card("box", "بيانات جاهزة", "كل شاشة تعرض بيانات حقيقية مولَّدة، ما فيها شاشات فارغة."),
            card("check", "بلا إنترنت", "يشتغل كتطبيق مثبّت (PWA) مع تخزين مؤقت كامل."),
            card("edit", "قابل للتعديل", "الألوان متغيّرات CSS، والبيانات ملف JSON واحد."),
            card("phone", "موبايل أولًا", "مصمَّم على 360px ويشتغل على أي شاشة."),
            card("spark", "مؤثرات راقية", "حركات ناعمة، توهّج، وزجاج — بلا ثقل على الجهاز.")
          ], 3));
        },
        pricing: function () {
          var plans = (ctx.data && ctx.data.plans) || [
            { name: "مجاني", price: 0, features: ["مشروع واحد", "تصدير HTML", "دعم بالبريد"] },
            { name: "احترافي", price: 2900, features: ["مشاريع غير محدودة", "تصدير ZIP", "نطاق مخصص", "دعم 24 ساعة"] },
            { name: "أعمال", price: 7900, features: ["كل ما في الاحترافي", "5 أعضاء", "تقارير", "واجهة API"] }
          ];
          var g = A.el("div", { class: "ax-grid ax-grid-3" });
          plans.slice(0, 4).forEach(function (p, i) {
            var cardEl = A.el("article", { class: "ax-card ax-price" + (i === 1 ? " is-featured" : "") });
            if (i === 1) cardEl.appendChild(A.el("span", { class: "ax-badge", text: "الأكثر اختيارًا" }));
            cardEl.appendChild(A.el("h3", { text: p.name }));
            cardEl.appendChild(A.el("div", { class: "ax-price-v" }, [A.el("b", { html: p.price ? A.fmt.dzd(p.price) : "مجانًا" }), A.el("span", { class: "ax-dim", text: p.price ? " / شهريًا" : "" })]));
            var ul = A.el("ul", { class: "ax-list" });
            (p.features || []).forEach(function (f) { ul.appendChild(A.el("li", { html: A.icon("check", 15) + " " + A.esc(f) })); });
            cardEl.appendChild(ul);
            cardEl.appendChild(A.el("button", { type: "button", class: "ax-btn " + (i === 1 ? "ax-btn-primary" : "ax-btn-ghost"), text: "اختر " + p.name, onclick: function () { A.toast("تم اختيار الخطة: " + p.name, "ok"); A.bus.emit("plan:pick", p); } }));
            g.appendChild(cardEl);
          });
          return section("خطط واضحة بلا مفاجآت", "كل خطة تشمل تحديثات مجانية ودعمًا بالعربية.", g);
        },
        testimonials: function () {
          var names = [["أمينة حمداني", "مديرة متجر", "ربحت وقتًا: الطلبات والفواتير في شاشة واحدة."], ["ياسين بن عمر", "مهندس", "الأداء يبان من أول ثانية، حتى على 3G."], ["سلمى مرابط", "محاسبة", "TVA والفواتير تحسب وحدها — ما نعاودش نحسب بيدي."], ["بلال شريفي", "صاحب مطعم", "لوحة المطبخ بدلت طريقة عملنا كامل."], ["نور الزهراء", "أستاذة", "الكشوف تطبع مباشرة، والغيابات تتسجل في ثوانٍ."], ["كريم زروقي", "تاجر إلكترونيات", "المخزون يولّي واضح، ما نبقاش نخلط."]];
          var rng = A.rng((ctx.plan && ctx.plan.seed) || 3);
          var g = A.el("div", { class: "ax-grid ax-grid-3" });
          rng.shuffle(names).slice(0, 6).forEach(function (n) {
            g.appendChild(A.el("article", { class: "ax-card ax-quote-card ax-reveal" }, [
              A.el("div", { class: "ax-row", html: "<span class='ax-stars'>" + "★".repeat(5) + "</span>" }),
              A.el("p", { text: n[2] }),
              A.el("div", { class: "ax-row" }, [A.el("b", { text: n[0] }), A.el("span", { class: "ax-dim", text: "· " + n[1] })])
            ]));
          });
          return section("رأي من استعملوه فعلًا", "نتائج من استعمال يومي حقيقي.", g);
        },
        faq: function () {
          var qs = [
            ["واش نحتاج باش نبدأ؟", "ما تحتاجش أي تسجيل: افتح الملف، والتطبيق يخدم مباشرة ببيانات تجريبية تقدر تبدّلها."],
            ["البيانات تروح لجهة أخرى؟", "لا. كل شيء يشتغل داخل المتصفح ويُخزَّن محليًا في جهازك، بلا إرسال لأي سيرفر."],
            ["نقدر نستعملو بلا إنترنت؟", "نعم، التطبيق يُخزَّن مؤقتًا ويعمل بلا شبكة بعد أول زيارة."],
            ["واش على الأرقام والفواتير؟", "المبالغ بالدينار الجزائري، والرسم TVA محسوب 19% تلقائيًا مع طباعة فاتورة جاهزة."],
            ["كيفاش نبدل اللوغو والألوان؟", "من ملف CSS: كل لون متغيّر واحد (--ax-brand)."],
            ["واش على اللغة الفرنسية؟", "النصوص كلها في ملف واحد، تقدر تزيد ترجمة بسهولة."]
          ];
          var box = A.el("div", { class: "ax-faq" });
          qs.forEach(function (pair, i) {
            var item = A.el("details", { class: "ax-faq-item", open: i === 0 });
            item.appendChild(A.el("summary", { text: pair[0] }));
            item.appendChild(A.el("p", { class: "ax-dim", text: pair[1] }));
            box.appendChild(item);
          });
          return section("أسئلة يطرحها الجميع", "ستة أجوبة تختصر عليك الطريق.", box);
        },
        steps: function () {
          var list = [["1", "افتح الصفحة", "بلا تثبيت وبلا حساب: كل شيء جاهز."], ["2", "عدّل البيانات", "ملف JSON واحد فيه كل السجلات."], ["3", "أضف ميزة", "وحدة جديدة = ملف واحد + عنصر في الصفحة."], ["4", "انشر", "ارفع الملفات وخلاص — بلا build."]];
          var box = A.el("div", { class: "ax-steps-row" });
          list.forEach(function (s) {
            box.appendChild(A.el("div", { class: "ax-step-card ax-reveal" }, [
              A.el("span", { class: "ax-step-n", text: s[0] }),
              A.el("b", { text: s[1] }),
              A.el("p", { class: "ax-dim", text: s[2] })
            ]));
          });
          return section("أربع خطوات… وخلاص", "من الصفر إلى منشور فعليًا.", box);
        },
        about: function () {
          return section("على من نشتغل", (app.desc || tagline), A.el("div", { class: "ax-grid ax-grid-2" }, [
            A.el("div", { class: "ax-card" }, [A.el("h3", { text: "طريقتنا" }), A.el("p", { class: "ax-dim", text: "نبنو نسخة كاملة تشتغل فعلًا، ثم نحسّن بالأرقام لا بالتخمين. كل وحدة مستقلة، وكل شاشة لها بيانات حقيقية." })]),
            A.el("div", { class: "ax-card" }, [A.el("h3", { text: "الأرقام" }), A.el("p", { class: "ax-dim", text: "أكثر من " + A.fmt.int(((window.APEX_DATA && Object.keys(window.APEX_DATA).length) || 4) * 120) + " سجل بيانات جاهز للتجربة، و12 مكوّن تصميم، و58 ولاية في الحسابات." })])
          ]));
        },
        tips: function () {
          var tips = ["تحقق من وثائق الملكية وشهادة المسح قبل أي دفعة.", "قارن سعر المتر² في البلدية نفسها، لا في الولاية كاملة.", "احسب القسط قبل: 80% من الثمن على 20 سنة بمعدل 4.5%.", "اسأل عن الرسوم والضرائب السنوية، ما تشوفهاش في الإعلان."];
          var box = A.el("div", { class: "ax-card ax-list" });
          var ul = A.el("ul", { class: "ax-list" });
          tips.forEach(function (t) { ul.appendChild(A.el("li", { html: A.icon("check", 15) + " " + A.esc(t) })); });
          box.appendChild(ul);
          return section("نصائح قبل القرار", "توفّر عليك وقتًا ومشاكل.", box);
        },
        sla: function () {
          var rows = [["عاجلة", "30 دقيقة", "على مدار الساعة", "هاتف + دردشة"], ["عالية", "ساعتان", "8:00 → 20:00", "دردشة + بريد"], ["عادية", "8 ساعات عمل", "أيام العمل", "بريد"], ["منخفضة", "يومان", "أيام العمل", "بريد"]];
          var t = A.el("table", { class: "ax-table" });
          t.appendChild(A.el("thead", { html: "<tr><th>الأولوية</th><th>زمن الاستجابة</th><th>التغطية</th><th>القنوات</th></tr>" }));
          var tb = A.el("tbody", {});
          rows.forEach(function (r) { tb.appendChild(A.el("tr", { html: "<td><b>" + r[0] + "</b></td><td>" + r[1] + "</td><td>" + r[2] + "</td><td>" + r[3] + "</td>" })); });
          t.appendChild(tb);
          return section("زمن استجابة مكتوب", "التزام واضح حسب أولوية التذكرة.", A.el("div", { class: "ax-table-wrap" }, [t]));
        },
        howto: function () {
          var g = A.el("div", { class: "ax-grid ax-grid-3" });
          [["⌨️", "لوحة المفاتيح", "أسهم / WASD للحركة، مسافة للقفز أو الهجوم، 1-2-3 للقدرات، P إيقاف، M كتم الصوت."],
           ["📱", "اللمس", "في الهاتف: اضغط اليسار للحركة، واضغط على الساحة للأداء. كل الأزرار ظاهرة تحت اللعبة."],
           ["🎯", "نصائح للعب", "راقب طاقتك، اجمع العملات لترقية القدرات، والوحوش الكبيرة تحتاج ضربة مضاعفة."]]
            .forEach(function (c, i) {
              g.appendChild(A.el("article", { class: "ax-card ax-card-hover" }, [A.el("div", { class: "ax-ico ax-ico-lg", text: c[0] }), A.el("h3", { text: c[1] }), A.el("p", { class: "ax-dim", text: c[2] })]));
            });
          return section("كيف تلعب وما تنساش", "التحكم كامل على اللوحة والهاتف.", g);
        }
      };

      var builder = render[variant] || render.features;
      A.guard("marketing:" + variant, function () {
        var node = builder();
        out.appendChild(node);
        A.qa(".ax-btn", node).forEach(function (b) { A.motion.ripple(b); });
      });
      A.reveal(out);
    }
  });
})();
