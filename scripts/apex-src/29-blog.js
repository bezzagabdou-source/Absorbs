/*@meta {"id":"blog","title":"المدونة","domain":"content","tags":["blog","articles","markdown","tags","search"],"order":49,"needs":["kernel"]}*/
/* Editorial blog: list, filters, reading view with real Arabic typography, comments, likes, RSS. */
(function () {
  var A = window.APEX;
  A.register({
    id: "blog",
    title: "المدونة",
    mount: function (host, ctx) {
      var posts = (ctx.data.posts || []).slice();
      var store = A.store("blog", { likes: {}, comments: {}, read: [] });
      var ui = A.el("div", { class: "ax-grid", style: { gap: "16px" } });
      host.appendChild(ui);
      var tag = "الكل", q = "", open = null;

      function like(p) {
        var likes = store.get().likes;
        likes[p.id] = !likes[p.id];
        store.set({ likes: likes }, { kind: "like" });
        render();
      }
      function render() {
        ui.innerHTML = "";
        if (open) return renderPost(open);
        var bar = A.el("div", { class: "ax-grid-bar" });
        bar.appendChild(A.el("div", { class: "ax-shop-search", html: A.icon("search") + '<input class="ax-input" type="search" placeholder="ابحث في المقالات…" value="' + A.esc(q) + '" aria-label="بحث">' }));
        var tags = [];
        posts.forEach(function (p) { (p.tags || []).forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); }); });
        ["الكل"].concat(tags).forEach(function (t) {
          bar.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn" + (tag === t ? " is-on" : ""), text: t, onclick: function () { tag = t; render(); } }));
        });
        bar.appendChild(A.el("span", { class: "ax-spacer" }));
        bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("download", 15) + " RSS", onclick: function () {
          var items = posts.map(function (p) { return "<item><title>" + A.esc(p.title) + "</title><description>" + A.esc(p.excerpt) + "</description></item>"; }).join("");
          A.download("feed.xml", '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>مدونتنا</title>' + items + "</channel></rss>", "application/rss+xml");
        } }));
        ui.appendChild(bar);

        var list = posts
          .filter(function (p) { return p.status !== "مسودة"; })
          .filter(function (p) { return tag === "الكل" || (p.tags || []).indexOf(tag) >= 0; })
          .filter(function (p) { return !q || (p.title + " " + p.excerpt + " " + (p.tags || []).join(" ")).toLowerCase().indexOf(q.toLowerCase()) >= 0; });
        if (!list.length) ui.appendChild(A.el("p", { class: "ax-empty", text: "ما كانش مقالات — بدّل البحث" }));
        var grid = A.el("div", { class: "ax-products", style: { gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" } });
        list.forEach(function (p, i) {
          var card = A.el("article", { class: "ax-product ax-in", style: { padding: "16px", cursor: "pointer", animationDelay: (i * 20) + "ms" } });
          card.appendChild(A.el("div", { class: "ax-chips", html: (p.tags || []).map(function (t) { return '<span class="ax-chip">' + A.esc(t) + "</span>"; }).join("") }));
          card.appendChild(A.el("h3", { style: { marginTop: "8px" }, text: p.title }));
          card.appendChild(A.el("p", { class: "ax-dim", style: { fontSize: "13.5px" }, text: p.excerpt }));
          card.appendChild(A.el("div", { class: "ax-dim", style: { fontSize: "12.5px", display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "auto" }, html: "<span>✍️ " + A.esc(p.author) + "</span><span>" + A.fmt.date(p.at) + "</span><span>⏱ " + p.readMin + " د</span><span>👁 " + A.fmt.int(p.views) + "</span><span>❤️ " + (p.likes + (store.get().likes[p.id] ? 1 : 0)) + "</span>" }));
          A.on(card, "click", function () { open = p; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
          grid.appendChild(card);
        });
        ui.appendChild(grid);
        A.on(A.q("input", bar), "input", A.debounce(function (e) { q = e.target.value; render(); }, 160));
      }
      function renderPost(p) {
        var head = A.el("div", { class: "ax-grid-bar" }, [
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "→ رجوع للمقالات", onclick: function () { open = null; render(); } }),
          A.el("span", { class: "ax-spacer" }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("star", 15) + " " + (store.get().likes[p.id] ? "أعجبني ✓" : "أعجبني"), onclick: function () { like(p); } }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("copy", 15) + " نسخ الرابط", onclick: function () { A.copy(location.origin + location.pathname + "#article-" + p.id); } }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("download", 15) + " نزّل", onclick: function () { A.download(p.slug + ".txt", p.title + "\n\n" + p.body); } })
        ]);
        ui.appendChild(head);
        var art = A.el("article", { class: "ax-card ax-prose", style: { maxWidth: "80ch", marginInline: "auto" } });
        art.appendChild(A.el("span", { class: "ax-tagline", text: (p.tags || [])[0] || "مقال" }));
        art.appendChild(A.el("h1", { style: { fontSize: "clamp(22px,3.4vw,34px)" }, text: p.title }));
        art.appendChild(A.el("div", { class: "ax-dim", style: { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }, html: "<span>✍️ " + A.esc(p.author) + "</span><span>📅 " + A.fmt.date(p.at, "long") + "</span><span>⏱ " + p.readMin + " دقائق</span><span>👁 " + A.fmt.int(p.views) + "</span>" }));
        String(p.body || "").split("\n\n").forEach(function (para, i) {
          if (i === 2) {
            art.insertAdjacentHTML("beforeend", "<h2>لماذا هذا مهم في السوق الجزائري؟</h2>");
            art.insertAdjacentHTML("beforeend", "<blockquote>«المعطى الصحيح في الوقت الصحيح يساوي صفقة.» — قاعدة عمل محلية</blockquote>");
          }
          art.insertAdjacentHTML("beforeend", "<p>" + A.esc(para) + "</p>");
        });
        art.insertAdjacentHTML("beforeend", "<h2>خطوات عملية</h2><ol>" + ["قسّم العمل على مراحل صغيرة قابلة للقياس.", "سجّل كل رقم في مكان واحد (هذا النظام يفعل ذلك).", "راجع المؤشرات كل أسبوع، لا كل ثلاثة أشهر.", "صدّر تقريرًا شهريًا PDF وشاركه مع الفريق."].map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ol>");
        art.insertAdjacentHTML("beforeend", "<h2>مثال كود جاهز للنسخ</h2><pre dir=\"ltr\">" + A.esc("const total = rows.reduce((s, r) => s + r.amount, 0);\nconsole.log(new Intl.NumberFormat('ar-DZ').format(total) + ' دج');") + "</pre>");
        art.insertAdjacentHTML("beforeend", "<p class='ax-dim'>كاتب المقال: " + A.esc(p.author) + " — للتواصل عبر الصفحة «تواصل معنا».</p>");
        ui.appendChild(art);

        var cbox = A.el("div", { class: "ax-card", style: { maxWidth: "80ch", marginInline: "auto", width: "100%" } });
        cbox.appendChild(A.el("h3", { text: "التعليقات" }));
        var mine = (store.get().comments[p.id] || []);
        if (!mine.length) cbox.appendChild(A.el("p", { class: "ax-dim", text: "كون أول من يعلّق" }));
        mine.forEach(function (c) { cbox.appendChild(A.el("div", { class: "ax-tile", style: { marginBottom: "8px" }, html: "<strong>" + A.esc(c.name) + "</strong><p style='margin:4px 0 0'>" + A.esc(c.text) + "</p><div class='ax-dim' style='font-size:11.5px'>" + A.fmt.ago(c.at) + "</div>" })); });
        var row = A.el("div", { class: "ax-grid-bar", style: { marginTop: "10px" } });
        var name = A.el("input", { class: "ax-input", placeholder: "اسمك", style: { maxWidth: "160px" }, "aria-label": "الاسم" });
        var text = A.el("input", { class: "ax-input", placeholder: "اكتب تعليقًا…", "aria-label": "تعليق" });
        row.appendChild(name); row.appendChild(text);
        row.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", text: "أرسل", onclick: function () {
          if (!text.value.trim()) return;
          var all = store.get().comments;
          all[p.id] = (all[p.id] || []).concat([{ name: name.value.trim() || "زائر", text: text.value.trim(), at: new Date().toISOString() }]);
          store.set({ comments: all }, { kind: "comment" });
          render();
        } }));
        cbox.appendChild(row);
        ui.appendChild(cbox);
      }
      render();
    }
  });
})();
