/*@meta {"id":"cart","title":"المتجر والسلة","domain":"commerce","tags":["shop","cart","checkout","orders","shipping"],"order":30,"needs":["kernel"]}*/
/* A complete Algerian storefront: catalog, search, filters, cart, coupons, 58-wilaya shipping, VAT, checkout, receipt. */
(function () {
  var A = window.APEX;
  /* the 58 wilayas with their real delivery zoning — used by shipping + checkout */
  A.WILAYAS = ["أدرار","الشلف","الأغواط","أم البواقي","باتنة","بجاية","بسكرة","بشار","البليدة","البويرة","تمنراست","تبسة","تلمسان","تيارت","تيزي وزو","الجزائر","الجلفة","جيجل","سطيف","سعيدة","سكيكدة","سيدي بلعباس","عنابة","قالمة","قسنطينة","المدية","مستغانم","المسيلة","معسكر","ورقلة","وهران","البيض","إليزي","برج بوعريريج","بومرداس","الطارف","تندوف","تيسمسيلت","الوادي","خنشلة","سوق أهراس","تيبازة","ميلة","عين الدفلى","النعامة","عين تموشنت","غرداية","غليزان","تيميمون","برج باجي مختار","أولاد جلال","بني عباس","عين صالح","عين قزام","تقرت","جانت","المغير","المنيعة"];
  A.SHIP = { desk: 400, home: 700, freeFrom: 12000, zone2: ["أدرار","تمنراست","إليزي","تندوف","جانت","عين قزام","برج باجي مختار","تيميمون","بني عباس","أولاد جلال","المنيعة","المغير","عين صالح"], zone2Fee: 400 };
  A.shippingFor = function (wilaya, mode, subtotal) {
    if (subtotal >= A.SHIP.freeFrom) return 0;
    var base = mode === "home" ? A.SHIP.home : A.SHIP.desk;
    return base + (A.SHIP.zone2.indexOf(wilaya) >= 0 ? A.SHIP.zone2Fee : 0);
  };
  A.register({
    id: "cart",
    title: "المتجر",
    mount: function (host, ctx) {
      var products = (ctx.data.products || []).slice();
      var coupons = ctx.data.coupons || [{ code: "NEXUS10", percent: 10 }, { code: "WELCOME", amount: 500 }, { code: "LIVRAISON", shipping: true }];
      var cart = A.store("cart", { items: {}, coupon: null, wilaya: "الجزائر", ship: "desk" });
      var ui = A.el("div", { class: "ax-shop" });
      host.appendChild(ui);
      function subtotal() {
        var s = 0;
        Object.keys(cart.get().items).forEach(function (id) {
          var p = products.filter(function (x) { return x.id === id; })[0];
          if (p) s += p.price * cart.get().items[id];
        });
        return s;
      }
      function discount(sub) {
        var c = cart.get().coupon;
        if (!c) return 0;
        var found = coupons.filter(function (x) { return x.code.toUpperCase() === String(c).toUpperCase(); })[0];
        if (!found) return 0;
        if (found.percent) return Math.round(sub * found.percent / 100);
        if (found.amount) return Math.min(sub, found.amount);
        return 0;
      }
      function totals() {
        var sub = subtotal(), disc = discount(sub);
        var ship = A.shippingFor(cart.get().wilaya, cart.get().ship, sub - disc);
        var c = coupons.filter(function (x) { return String(cart.get().coupon || "").toUpperCase() === x.code; })[0];
        if (c && c.shipping) ship = 0;
        var net = Math.max(0, sub - disc);
        var tva = Math.round(net * 0.19);
        return { sub: sub, disc: disc, ship: ship, tva: tva, total: net + ship, net: net };
      }
      function paint() {
        ui.innerHTML = "";
        var head = A.el("div", { class: "ax-shop-head" });
        head.appendChild(A.el("div", { class: "ax-shop-search", html: A.icon("search") + '<input class="ax-input" type="search" placeholder="ابحث عن منتج…" aria-label="بحث المنتجات">' }));
        var card = A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-cart-btn", html: A.icon("cart") + ' السلة <b class="ax-badge">' + Object.keys(cart.get().items).reduce(function (s, k) { return s + cart.get().items[k]; }, 0) + "</b>", onclick: openCart });
        head.appendChild(card);
        ui.appendChild(head);
        var facs = A.el("div", { class: "ax-facets" });
        var cats = [];
        products.forEach(function (p) { if (cats.indexOf(p.cat) < 0) cats.push(p.cat); });
        ["الكل"].concat(cats).forEach(function (c) {
          facs.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn" + (c === "الكل" ? " is-on" : ""), text: c, onclick: function () { A.qa(".ax-chip", facs).forEach(function (b) { b.classList.remove("is-on"); }); this.classList.add("is-on"); grid.setRows(c === "الكل" ? products : products.filter(function (p) { return p.cat === c; })); } }));
        });
        ui.appendChild(facs);
        var grid = A.el("div", { class: "ax-products" });
        ui.appendChild(grid);
        function renderProducts(list) {
          grid.innerHTML = "";
          list.forEach(function (p, i) {
            var c = A.el("article", { class: "ax-product ax-in", style: { animationDelay: (i * 26) + "ms" } });
            c.appendChild(A.el("div", { class: "ax-product-media", html: '<span class="ax-product-emoji" aria-hidden="true">' + A.esc(p.emoji || "📦") + "</span>" + (p.badge ? '<span class="ax-tag">' + A.esc(p.badge) + "</span>" : "") + (p.stock <= 4 ? '<span class="ax-tag ax-tag-warn">آخر ' + p.stock + " قطع</span>" : "") }));
            var body = A.el("div", { class: "ax-product-body" });
            body.appendChild(A.el("h3", { text: p.name }));
            body.appendChild(A.el("p", { class: "ax-dim", text: p.desc || "" }));
            var stars = A.el("div", { class: "ax-stars", "aria-label": "التقييم " + p.rating + " من 5" });
            for (var s = 1; s <= 5; s++) stars.insertAdjacentHTML("beforeend", '<span class="' + (s <= Math.round(p.rating) ? "is-on" : "") + '">★</span>');
            stars.insertAdjacentHTML("beforeend", '<span class="ax-dim"> ' + p.rating + " (" + p.reviews + ")</span>");
            body.appendChild(stars);
            var foot = A.el("div", { class: "ax-product-foot" });
            foot.appendChild(A.el("strong", { class: "ax-price", text: A.fmt.dzd(p.price) + (p.old ? "" : "") }));
            var old = p.old ? A.el("s", { class: "ax-old", text: A.fmt.dzd(p.old) }) : null;
            if (old) foot.appendChild(old);
            foot.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", html: A.icon("cart", 15) + " أضف", onclick: function () {
              cart.set(function (s) { var n = A.deep(s); n.items[p.id] = (n.items[p.id] || 0) + 1; return n; }, { kind: "add", product: p.id });
              A.toast("أُضيف: " + p.name, "ok", 1600);
              A.motion.ripple(card);
              paint();
            } }));
            body.appendChild(foot);
            c.appendChild(body);
            grid.appendChild(c);
          });
        }
        renderProducts(products);
        A.on(A.q("input", head), "input", A.debounce(function (e) { renderProducts(products.filter(function (p) { return (p.name + " " + (p.desc || "") + " " + p.cat).toLowerCase().indexOf(e.target.value.toLowerCase()) >= 0; })); }, 140));
      }
      function openCart() {
        var t = totals();
        var html = A.el("div", { class: "ax-cart-panel" });
        var list = A.el("div", { class: "ax-cart-list" });
        var ids = Object.keys(cart.get().items);
        if (!ids.length) list.appendChild(A.el("p", { class: "ax-empty", text: "السلة فارغة — زيد منتجات" }));
        ids.forEach(function (id) {
          var p = products.filter(function (x) { return x.id === id; })[0];
          if (!p) return;
          var qty = cart.get().items[id];
          var row = A.el("div", { class: "ax-cart-row" });
          row.appendChild(A.el("span", { class: "ax-cart-emoji", text: p.emoji || "📦" }));
          row.appendChild(A.el("div", { class: "ax-cart-info" }, [A.el("strong", { text: p.name }), A.el("span", { class: "ax-dim", text: A.fmt.dzd(p.price) + " × " + qty })]));
          var q = A.el("div", { class: "ax-qty" });
          q.appendChild(A.el("button", { type: "button", class: "ax-icon-btn", html: A.icon("minus", 14), "aria-label": "أنقص", onclick: function () { cart.set(function (s) { var n = A.deep(s); n.items[id] = Math.max(0, n.items[id] - 1); if (!n.items[id]) delete n.items[id]; return n; }); modal.close(); openCart(); } }));
          q.appendChild(A.el("b", { text: qty }));
          q.appendChild(A.el("button", { type: "button", class: "ax-icon-btn", html: A.icon("plus", 14), "aria-label": "زيد", onclick: function () { cart.set(function (s) { var n = A.deep(s); n.items[id]++; return n; }); modal.close(); openCart(); } }));
          row.appendChild(q);
          row.appendChild(A.el("strong", { class: "ax-price", text: A.fmt.dzd(p.price * qty) }));
          list.appendChild(row);
        });
        html.appendChild(list);
        var shipBox = A.el("div", { class: "ax-field" });
        var sel = A.el("select", { class: "ax-input", "aria-label": "الولاية" });
        A.WILAYAS.forEach(function (w) { sel.appendChild(A.el("option", { text: w, value: w, selected: w === cart.get().wilaya ? "selected" : null })); });
        A.on(sel, "change", function () { cart.set({ wilaya: sel.value }, { kind: "wilaya" }); modal.close(); openCart(); });
        shipBox.appendChild(A.el("label", { class: "ax-label", text: "ولاية التوصيل" }));
        shipBox.appendChild(sel);
        var mode = A.el("div", { class: "ax-seg" });
        [["desk", "مكتب التوصيل"], ["home", "للمنزل"]].forEach(function (m) {
          mode.appendChild(A.el("button", { type: "button", class: "ax-seg-btn" + (cart.get().ship === m[0] ? " is-on" : ""), text: m[1], onclick: function () { cart.set({ ship: m[0] }, { kind: "ship" }); modal.close(); openCart(); } }));
        });
        shipBox.appendChild(mode);
        html.appendChild(shipBox);
        var coup = A.el("div", { class: "ax-coupon", html: '<input class="ax-input" placeholder="كود الخصم (NEXUS10)" value="' + A.esc(cart.get().coupon || "") + '" aria-label="كود الخصم"><button type="button" class="ax-btn ax-btn-ghost ax-mini">طبّق</button>' });
        A.on(A.q("button", coup), "click", function () {
          var code = A.q("input", coup).value.trim().toUpperCase();
          var ok = coupons.filter(function (x) { return x.code === code; })[0];
          cart.set({ coupon: ok ? code : null }, { kind: "coupon" });
          A.toast(ok ? "كود صحيح — خصم مطبّق" : "كود غير صحيح", ok ? "ok" : "warn");
          modal.close(); openCart();
        });
        html.appendChild(coup);
        html.appendChild(A.el("div", { class: "ax-totals", html:
          "<div><span>المجموع الجزئي</span><b>" + A.fmt.dzd(t.sub) + "</b></div>" +
          (t.disc ? "<div class='is-ok'><span>الخصم</span><b>− " + A.fmt.dzd(t.disc) + "</b></div>" : "") +
          "<div><span>التوصيل</span><b>" + (t.ship ? A.fmt.dzd(t.ship) : "مجاني") + "</b></div>" +
          "<div><span>الرسم على القيمة المضافة 19%</span><b>" + A.fmt.dzd(t.tva) + "</b></div>" +
          '<div class="ax-total-line"><span>المجموع</span><b>' + A.fmt.dzd(t.total) + "</b></div>" }));
        var modal = A.modal({ title: "السلة والدفع", wide: true, html: html, actions: [
          { label: "كمّل الطلب", kind: "primary", close: false, onClick: function (_, api2) { if (!ids.length) { A.toast("السلة فارغة", "warn"); return; } checkout(api2); } },
          { label: "إغلاق", kind: "ghost" }
        ] });
      }
      function checkout(api2) {
        var t = totals(), order = { id: A.rng().id("ORD"), at: new Date().toISOString(), wilaya: cart.get().wilaya, ship: cart.get().ship, totals: t, items: cart.get().items, status: "قيد التحضير" };
        var orders = A.store("orders", []);
        orders.set(orders.get().concat([order]));
        api2.set(A.el("div", { class: "ax-receipt", html:
          '<div class="ax-receipt-mark">' + A.icon("check", 26) + "</div>" +
          "<h3>تم تسجيل طلبك</h3>" +
          '<p class="ax-dim">رقم الطلب <b class="ax-mono">' + order.id + "</b> · " + A.fmt.date(order.at, "long") + "</p>" +
          '<p class="ax-dim">التوصيل إلى ' + A.esc(order.wilaya) + " — " + (order.ship === "home" ? "للمنزل" : "مكتب التوصيل") + "</p>" +
          '<div class="ax-totals"><div class="ax-total-line"><span>المبلغ الإجمالي</span><b>' + A.fmt.dzd(t.total) + '</b></div></div>' +
          '<p class="ax-dim">المتجر يتصل بك لتأكيد الطلب. كل الطلبات محفوظة على هذا الجهاز.</p>' }));
        cart.set({ items: {}, coupon: null }, { kind: "ordered" });
        A.motion.confetti(70);
        setTimeout(paint, 400);
      }
      paint();
      A.bus.on("cart:add", function (id) {
        cart.set(function (s) { var n = A.deep(s); n.items[id] = (n.items[id] || 0) + 1; return n; }, { kind: "add", product: id });
        A.toast("أُضيف للسلة", "ok", 1500);
      });
    }
  });
})();
