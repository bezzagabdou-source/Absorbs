/*@meta {"id":"shop","title":"الكتالوج والمنتج","domain":"commerce","tags":["catalog","product","filters","compare","wishlist","reviews"],"order":43,"needs":["kernel","search"]}*/
/* Storefront front-half: hero stats, faceted catalogue (category, price, rating,
   brand, availability), sorting, quick view, compare tray, wishlist, product page
   with gallery + reviews, and "add to cart" wired into the cart module by id. */
(function () {
  var A = window.APEX;
  function cfgOf(host) {
    try { return JSON.parse(host.getAttribute("data-cfg") || "{}") || {}; }
    catch (e) { return {}; }
  }
  function stars(n) {
    var full = Math.round(Number(n) || 0);
    return "<span class='ax-stars' aria-label='" + A.fmt.num(n, 1) + " من 5'>" + "★".repeat(full) + "☆".repeat(Math.max(0, 5 - full)) + "</span>";
  }
  function wishlistStore() { return A.store("wishlist", { ids: [] }); }
  function compareStore() { return A.store("compare", { ids: [] }); }
  A.shop = {
    addToCart: function (id, qty) { A.bus.emit("cart:add", { id: id, qty: qty || 1 }); A.toast("أُضيف إلى السلة", "ok", 1600); },
    toggleWish: function (id) {
      var w = wishlistStore();
      var ids = w.get().ids.slice();
      var i = ids.indexOf(id);
      if (i >= 0) { ids.splice(i, 1); A.toast("أُزيل من المفضلة", "warn", 1500); }
      else { ids.push(id); A.toast("أُضيف إلى المفضلة ♥", "ok", 1500); }
      w.set({ ids: ids });
      A.bus.emit("shop:wish", id);
    },
    toggleCompare: function (id) {
      var c = compareStore();
      var ids = c.get().ids.slice();
      var i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1);
      else { if (ids.length >= 4) { A.toast("تقدر تقارن 4 منتجات فقط", "warn"); return; } ids.push(id); }
      c.set({ ids: ids });
      A.bus.emit("shop:compare", ids);
    }
  };

  A.register({
    id: "shop",
    title: "الكتالوج",
    mount: function (host, ctx) {
      var cfg = cfgOf(host);
      var all = (ctx.data.products || []).slice();
      var mode = cfg.host === "product" || cfg.mode === "product" ? "product" : "catalog";
      var ui = A.el("div", { class: "ax-shop-products" });
      host.appendChild(ui);
      if (!all.length) { ui.appendChild(A.el("div", { class: "ax-empty", text: "لا منتجات في البيانات — أضف مصفوفة products في js/02-data.js" })); return; }

      var cats = Array.from(new Set(all.map(function (p) { return p.category; })));
      var brands = Array.from(new Set(all.map(function (p) { return p.brand; }).filter(Boolean))).slice(0, 8);
      var maxPrice = Math.max.apply(null, all.map(function (p) { return Number(p.price) || 0; }));
      var state = { q: "", cat: "", brand: "", max: maxPrice, rating: 0, stockOnly: false, sort: "popular", page: 1, size: cfg.size || 9, view: "grid" };
      var wish = wishlistStore();

      function filtered() {
        var out = all.slice();
        if (state.q) {
          var n = state.q.toLowerCase();
          out = out.filter(function (p) { return (p.name + " " + p.category + " " + (p.brand || "")).toLowerCase().indexOf(n) >= 0; });
        }
        if (state.cat) out = out.filter(function (p) { return p.category === state.cat; });
        if (state.brand) out = out.filter(function (p) { return p.brand === state.brand; });
        out = out.filter(function (p) { return Number(p.price) <= state.max; });
        if (state.rating) out = out.filter(function (p) { return Number(p.rating) >= state.rating; });
        if (state.stockOnly) out = out.filter(function (p) { return Number(p.stock) > 0; });
        var sorters = {
          popular: function (a, b) { return Number(b.sold) - Number(a.sold); },
          cheap: function (a, b) { return Number(a.price) - Number(b.price); },
          expensive: function (a, b) { return Number(b.price) - Number(a.price); },
          rated: function (a, b) { return Number(b.rating) - Number(a.rating); },
          new: function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); },
          az: function (a, b) { return String(a.name).localeCompare(String(b.name), "ar"); }
        };
        return out.sort(sorters[state.sort] || sorters.popular);
      }

      function productPage(p) {
        var box = A.el("div", { class: "ax-product" });
        var media = A.el("div", { class: "ax-product-media" });
        var swatches = ["linear-gradient(135deg,#d97757,#f0b27a)", "linear-gradient(135deg,#4f9cf9,#7ee0d0)", "linear-gradient(135deg,#a78bfa,#f472b6)", "linear-gradient(135deg,#34d399,#a3e635)"];
        swatches.forEach(function (bg, i) {
          var shot = A.el("button", { type: "button", class: "ax-swatch" + (i === 0 ? " is-on" : ""), "aria-label": "صورة " + (i + 1), style: { background: bg }, onclick: function () {
            main.style.background = bg;
            A.qa(".ax-swatch", media).forEach(function (s) { s.classList.remove("is-on"); });
            shot.classList.add("is-on");
          } });
          if (i === 0) shot.textContent = p.emoji || "📦";
          media.appendChild(shot);
        });
        var main = A.el("div", { class: "ax-product-main", style: { background: swatches[0] }, text: p.emoji || "📦" });
        var gallery = A.el("div", { class: "ax-product-gallery" }, [main, media]);
        box.appendChild(gallery);
        var info = A.el("div", { class: "ax-product-info" });
        info.appendChild(A.el("span", { class: "ax-badge", text: p.category }));
        info.appendChild(A.el("h3", { text: p.name }));
        info.appendChild(A.el("div", { class: "ax-row", html: stars(p.rating) + "<span class='ax-dim'>" + A.fmt.num(p.rating, 1) + " · " + A.fmt.int(p.reviews) + " تقييم · " + A.fmt.int(p.sold) + " مبيع</span>" }));
        var priceRow = A.el("div", { class: "ax-row ax-price-row" });
        priceRow.appendChild(A.el("b", { class: "ax-price-big", text: A.fmt.dzd(p.price) }));
        if (p.oldPrice && Number(p.oldPrice) > Number(p.price)) {
          priceRow.appendChild(A.el("s", { class: "ax-dim", text: A.fmt.dzd(p.oldPrice) }));
          priceRow.appendChild(A.el("span", { class: "ax-badge ax-badge-err", text: "تخفيض " + A.fmt.pct((1 - p.price / p.oldPrice) * 100, 0) }));
        }
        info.appendChild(priceRow);
        info.appendChild(A.el("p", { class: "ax-dim", text: "الرمز " + (p.sku || "—") + " · العلامة " + (p.brand || "—") + " · المخزون " + (Number(p.stock) > 0 ? A.fmt.int(p.stock) + " قطعة" : "منتهٍ") }));
        var qty = A.el("input", { class: "ax-input", type: "number", min: 1, max: Math.max(1, Number(p.stock) || 1), value: 1, "aria-label": "الكمية" });
        var row = A.el("div", { class: "ax-row" });
        row.appendChild(qty);
        row.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-btn-lg", html: A.icon("cart", 18) + " أضف إلى السلة", disabled: Number(p.stock) <= 0, onclick: function () { A.shop.addToCart(p.id, Math.max(1, Number(qty.value) || 1)); A.motion.confetti(40); } }));
        row.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost", html: A.icon("heart", 17) + " المفضلة", onclick: function () { A.shop.toggleWish(p.id); } }));
        row.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost", html: A.icon("layers", 17) + " قارن", onclick: function () { A.shop.toggleCompare(p.id); } }));
        info.appendChild(row);
        var ship = A.el("div", { class: "ax-card ax-ship-card" }, [
          A.el("b", { text: "التوصيل والدفع" }),
          A.el("ul", { class: "ax-list", html: "<li>مكتب التوصيل: 400 دج (1-3 أيام)</li><li>إلى المنزل: 700 دج</li><li>مجاني فوق 12,000 دج</li><li>دفع عند التسليم أو بطاقة CIB / BaridiMob</li><li>إرجاع داخل 7 أيام</li><li>ضمان 12 شهرًا على الإلكترونيات</li>" })
        ]);
        info.appendChild(ship);
        box.appendChild(info);
        var revs = A.el("div", { class: "ax-reviews" });
        revs.appendChild(A.el("h3", { text: "آراء المشترين" }));
        var rng = A.rng((ctx.plan && ctx.plan.seed) || 5);
        var samples = [["أمينة", "جودة ممتازة والتوصيل سريع."], ["ياسين", "السعر أحسن من المحلات بفرق واضح."], ["سمير", "المنتج كيما في الصورة، راضي 100%."], ["نورة", "خدمة ما بعد البيع ترد بسرعة."], ["حمزة", "شريت 3 وكلهم بخير، نوصي به."]];
        rng.shuffle(samples).slice(0, 4).forEach(function (s) {
          revs.appendChild(A.el("article", { class: "ax-card ax-rev" }, [
            A.el("div", { class: "ax-row-between", html: "<b>" + s[0] + "</b>" + stars(4 + rng.int(0, 1)) }),
            A.el("p", { class: "ax-dim", text: s[1] }),
            A.el("small", { class: "ax-dim", text: A.fmt.ago(new Date(Date.now() - rng.int(1, 90) * 86400000)) })
          ]));
        });
        var rate = A.el("div", { class: "ax-card" }, [A.el("b", { text: "شارك تجربتك" })]);
        rate.appendChild(A.form({
          fields: [
            { name: "rating", label: "التقييم", type: "select", options: ["5", "4", "3", "2", "1"], required: true },
            { name: "text", label: "تعليقك", type: "textarea", required: true, rules: [["len", 10]] }
          ],
          submit: "أرسل التقييم",
          onSubmit: function () { A.toast("شكرًا! تقييمك انضاف", "ok"); A.motion.confetti(50); }
        }));
        revs.appendChild(rate);
        box.appendChild(revs);
        return box;
      }

      function cardOf(p) {
        var cardEl = A.el("article", { class: "ax-card ax-card-hover ax-prod" });
        cardEl.appendChild(A.el("div", { class: "ax-prod-thumb", text: p.emoji || "📦" }));
        if (p.oldPrice && Number(p.oldPrice) > Number(p.price)) cardEl.appendChild(A.el("span", { class: "ax-prod-off", text: "-" + A.fmt.pct((1 - p.price / p.oldPrice) * 100, 0) }));
        cardEl.appendChild(A.el("button", { type: "button", class: "ax-prod-wish" + (wish.get().ids.indexOf(p.id) >= 0 ? " is-on" : ""), "aria-label": "المفضلة", html: A.icon("heart", 16), onclick: function (e) { e.stopPropagation(); A.shop.toggleWish(p.id); var on = wishlistStore().get().ids.indexOf(p.id) >= 0; e.currentTarget.classList.toggle("is-on", on); } }));
        cardEl.appendChild(A.el("h3", { class: "ax-prod-name", text: p.name }));
        cardEl.appendChild(A.el("div", { class: "ax-row ax-prod-meta", html: stars(p.rating) + "<span class='ax-dim'>(" + A.fmt.int(p.reviews) + ")</span>" }));
        cardEl.appendChild(A.el("div", { class: "ax-row-between" }, [
          A.el("b", { class: "ax-price-tag", text: A.fmt.dzd(p.price) }),
          A.el("span", { class: "ax-badge " + (Number(p.stock) > 10 ? "ax-badge-ok" : Number(p.stock) > 0 ? "ax-badge-warn" : "ax-badge-err"), text: Number(p.stock) > 0 ? (Number(p.stock) > 10 ? "متوفر" : "بقي " + A.fmt.int(p.stock)) : "منتهٍ" })
        ]));
        var actions = A.el("div", { class: "ax-prod-actions" });
        actions.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", html: A.icon("cart", 15) + " أضف", disabled: Number(p.stock) <= 0, onclick: function (e) { e.stopPropagation(); A.shop.addToCart(p.id, 1); A.motion.ripple(e.currentTarget); } }));
        actions.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "تفاصيل", onclick: function (e) {
          e.stopPropagation();
          A.modal({ title: p.name, body: productPage(p), wide: true, actions: [{ label: "إغلاق", kind: "ghost" }, { label: "أضف إلى السلة", kind: "primary", onClick: function () { A.shop.addToCart(p.id, 1); } }] });
        } }));
        actions.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("layers", 15), "aria-label": "قارن", onclick: function (e) { e.stopPropagation(); A.shop.toggleCompare(p.id); } }));
        cardEl.appendChild(actions);
        A.on(cardEl, "click", function () { A.bus.emit("shop:open", p.id); });
        return cardEl;
      }

      function compareTray() {
        var ids = compareStore().get().ids;
        if (!ids.length) return null;
        var picked = ids.map(function (id) { return all.filter(function (p) { return p.id === id; })[0]; }).filter(Boolean);
        var box = A.el("div", { class: "ax-compare ax-card" });
        box.appendChild(A.el("div", { class: "ax-row-between" }, [
          A.el("b", { text: "مقارنة (" + picked.length + ")" }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "تفريغ", onclick: function () { compareStore().set({ ids: [] }); render(); } })
        ]));
        var wrap = A.el("div", { class: "ax-table-wrap" });
        var t = A.el("table", { class: "ax-table ax-table-sm" });
        var fields = [["price", "السعر"], ["oldPrice", "السعر القديم"], ["rating", "التقييم"], ["stock", "المخزون"], ["brand", "العلامة"], ["category", "التصنيف"], ["sold", "المبيعات"]];
        t.appendChild(A.el("thead", { html: "<tr><th>الخاصية</th>" + picked.map(function (p) { return "<th>" + A.esc(p.name) + "</th>"; }).join("") + "</tr>" }));
        var tb = A.el("tbody", {});
        fields.forEach(function (f) {
          var best = f[0] === "price" || f[0] === "oldPrice"
            ? Math.min.apply(null, picked.map(function (x) { return Number(x[f[0]]) || Infinity; }))
            : Math.max.apply(null, picked.map(function (x) { return Number(x[f[0]]) || 0; }));
          var cells = picked.map(function (p) {
            var v = p[f[0]];
            var isBest = Number(v) === best && (f[0] === "price" || f[0] === "rating" || f[0] === "stock" || f[0] === "sold");
            var shown = (f[0] === "price" || f[0] === "oldPrice") ? A.fmt.dzd(v) : (v == null ? "—" : v);
            return "<td class='ax-num" + (isBest ? " ax-best" : "") + "'>" + A.esc(String(shown)) + "</td>";
          }).join("");
          tb.appendChild(A.el("tr", { html: "<td><b>" + f[1] + "</b></td>" + cells }));
        });
        t.appendChild(tb);
        wrap.appendChild(t);
        box.appendChild(wrap);
        return box;
      }

      function render() {
        ui.innerHTML = "";
        if (mode === "product") {
          var rng = A.rng((ctx.plan && ctx.plan.seed) || 9);
          ui.appendChild(productPage(rng.pick(all)));
          return;
        }
        var bar = A.el("div", { class: "ax-shop-bar" });
        var search = A.el("input", { class: "ax-input", type: "search", placeholder: "ابحث عن منتج…", "aria-label": "بحث" });
        A.on(search, "input", A.debounce(function () { state.q = search.value; state.page = 1; paint(); }, 170));
        bar.appendChild(search);
        var catSel = A.el("select", { class: "ax-select", "aria-label": "التصنيف" });
        catSel.appendChild(A.el("option", { value: "", text: "كل التصنيفات" }));
        cats.forEach(function (c) { catSel.appendChild(A.el("option", { value: c, text: c })); });
        A.on(catSel, "change", function () { state.cat = catSel.value; state.page = 1; paint(); });
        bar.appendChild(catSel);
        var brandSel = A.el("select", { class: "ax-select", "aria-label": "العلامة" });
        brandSel.appendChild(A.el("option", { value: "", text: "كل العلامات" }));
        brands.forEach(function (b) { brandSel.appendChild(A.el("option", { value: b, text: b })); });
        A.on(brandSel, "change", function () { state.brand = brandSel.value; paint(); });
        bar.appendChild(brandSel);
        var sortSel = A.el("select", { class: "ax-select", "aria-label": "الترتيب" });
        [["popular", "الأكثر مبيعًا"], ["cheap", "الأرخص أولًا"], ["expensive", "الأغلى أولًا"], ["rated", "الأعلى تقييمًا"], ["new", "الأحدث"], ["az", "أبجديًا"]].forEach(function (o) { sortSel.appendChild(A.el("option", { value: o[0], text: o[1] })); });
        A.on(sortSel, "change", function () { state.sort = sortSel.value; paint(); });
        bar.appendChild(sortSel);
        bar.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn" + (state.stockOnly ? " is-on" : ""), text: "المتوفر فقط", onclick: function (e) { state.stockOnly = !state.stockOnly; e.currentTarget.classList.toggle("is-on", state.stockOnly); paint(); } }));
        ui.appendChild(bar);
        var range = A.el("div", { class: "ax-shop-range" });
        range.appendChild(A.el("span", { class: "ax-dim", text: "السعر الأقصى: " + A.fmt.dzd(state.max) }));
        var slider = A.el("input", { type: "range", min: 0, max: maxPrice, step: 500, value: state.max, class: "ax-range", "aria-label": "السعر الأقصى" });
        A.on(slider, "input", function () { state.max = Number(slider.value); A.q("span", range).textContent = "السعر الأقصى: " + A.fmt.dzd(state.max); paint(); });
        range.appendChild(slider);
        ui.appendChild(range);
        var compare = compareTray();
        if (compare) ui.appendChild(compare);
        paint();
      }

      function paint() {
        var old = A.q(".ax-shop-body", ui);
        if (old) old.remove();
        var list = filtered();
        var body = A.el("div", { class: "ax-shop-body" });
        body.appendChild(A.el("div", { class: "ax-row-between" }, [
          A.el("span", { class: "ax-dim", text: A.fmt.int(list.length) + " منتج" }),
          A.el("span", { class: "ax-dim", text: "الأكثر مبيعًا: " + (list[0] ? list[0].name : "—") })
        ]));
        var g = A.el("div", { class: "ax-grid ax-grid-3" });
        var start = (state.page - 1) * state.size;
        list.slice(start, start + state.size).forEach(function (p) { g.appendChild(cardOf(p)); });
        if (!list.length) body.appendChild(A.el("div", { class: "ax-empty", text: "ما لقيناش منتجات بهذي الفلاتر — وسّع البحث." }));
        else body.appendChild(g);
        var pages = Math.max(1, Math.ceil(list.length / state.size));
        var pager = A.el("div", { class: "ax-pager" });
        pager.appendChild(A.el("button", { type: "button", text: "‹", disabled: state.page === 1, onclick: function () { state.page--; paint(); } }));
        for (var i = 1; i <= pages; i++) (function (pp) { pager.appendChild(A.el("button", { type: "button", class: pp === state.page ? "is-on" : "", text: String(pp), onclick: function () { state.page = pp; paint(); } })); })(i);
        pager.appendChild(A.el("button", { type: "button", text: "›", disabled: state.page === pages, onclick: function () { state.page++; paint(); } }));
        body.appendChild(pager);
        ui.appendChild(body);
        A.reveal(body);
      }

      render();
      A.bus.on("shop:wish", function () { if (mode !== "product") render(); });
      A.bus.on("shop:compare", function () { if (mode !== "product") render(); });
    }
  });
})();
