/*@meta {"id":"restaurant","title":"المطعم والقائمة","domain":"food","tags":["restaurant","menu","orders","kitchen","qr"],"order":57,"needs":["kernel"]}*/
/* Digital menu with categories, cart, WhatsApp order text, kitchen board, table QR, daily special. */
(function () {
  var A = window.APEX;
  A.register({
    id: "restaurant",
    title: "المطعم",
    mount: function (host, ctx) {
      var menu = (ctx.data.menu || []).slice();
      var store = A.store("resto", { orders: [], favs: {} });
      var ui = A.el("div", { class: "ax-grid", style: { gap: "16px" } });
      host.appendChild(ui);
      var cat = "الكل", q = "";
      var cart = [];

      function render() {
        ui.innerHTML = "";
        var cats = [];
        menu.forEach(function (m) { if (cats.indexOf(m.cat) < 0) cats.push(m.cat); });
        var head = A.el("div", { class: "ax-grid-bar" });
        head.appendChild(A.el("div", { class: "ax-shop-search", html: A.icon("search") + '<input class="ax-input" type="search" placeholder="ابحث في القائمة…" aria-label="بحث" value="' + A.esc(q) + '">' }));
        var special = menu.filter(function (m) { return m.spicy || m.rating > 4.5; })[0];
        if (special) head.appendChild(A.el("span", { class: "ax-chip", html: "🔥 طبق اليوم: <b>" + A.esc(special.name) + "</b> · " + A.fmt.dzd(special.price) }));
        head.appendChild(A.el("span", { class: "ax-spacer" }));
        head.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("copy", 15) + " QR الطاولة", onclick: function () {
          var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" width="220" height="220" shape-rendering="crispEdges">' + (function () {
            var rng = A.rng(7), out = '<rect width="29" height="29" fill="#fff"/>';
            for (var y = 0; y < 29; y++) for (var x = 0; x < 29; x++) if (rng.chance(0.46)) out += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="#111"/>';
            return out;
          })() + "</svg>";
          A.modal({ title: "QR القائمة الرقمية", html: '<div class="ax-center">' + svg + '<p class="ax-dim">علّق هذا الرمز على الطاولة — يفتح القائمة مباشرة.</p></div>', actions: [{ label: "إغلاق", kind: "ghost" }] });
        } }));
        head.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", html: A.icon("cart", 15) + " الطلبية (" + cart.reduce(function (s, l) { return s + l.qty; }, 0) + ")", onclick: openCart }));
        ui.appendChild(head);
        var facs = A.el("div", { class: "ax-facets" });
        ["الكل"].concat(cats).forEach(function (c) {
          facs.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn" + (cat === c ? " is-on" : ""), text: c, onclick: function () { cat = c; render(); } }));
        });
        ui.appendChild(facs);
        var grid = A.el("div", { class: "ax-products", style: { gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))" } });
        var list = menu.filter(function (m) { return (cat === "الكل" || m.cat === cat) && (!q || m.name.toLowerCase().indexOf(q.toLowerCase()) >= 0); });
        list.forEach(function (m, i) {
          var card = A.el("article", { class: "ax-product ax-in", style: { animationDelay: (i * 18) + "ms" } });
          card.appendChild(A.el("div", { class: "ax-product-media", style: { fontSize: "44px" }, html: '<span aria-hidden="true">' + m.emoji + "</span>" + (m.spicy ? '<span class="ax-tag">حار 🌶️</span>' : "") + (m.veg ? '<span class="ax-tag ax-tag-warn">نباتي</span>' : "") }));
          var body = A.el("div", { class: "ax-product-body" });
          body.appendChild(A.el("h3", { text: m.name }));
          body.appendChild(A.el("p", { class: "ax-dim", text: m.desc }));
          body.appendChild(A.el("div", { class: "ax-dim", style: { fontSize: "12.5px" }, html: "⏱ " + m.time + " دقيقة · ⭐ " + m.rating }));
          var foot = A.el("div", { class: "ax-product-foot" });
          foot.appendChild(A.el("strong", { class: "ax-price", text: A.fmt.dzd(m.price) }));
          foot.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", html: A.icon("plus", 15) + " أضف", onclick: function () { add(m); render(); } }));
          body.appendChild(foot);
          card.appendChild(body);
          grid.appendChild(card);
        });
        ui.appendChild(grid);
        A.on(A.q("input", head), "input", A.debounce(function (e) { q = e.target.value; render(); }, 150));

        /* kitchen board */
        var orders = store.get().orders;
        if (orders.length) {
          var board = A.el("div", { class: "ax-card" });
          board.appendChild(A.el("h3", { text: "لوحة المطبخ" }));
          var lanes = {};
          orders.forEach(function (o) { lanes[o.status] = (lanes[o.status] || []).concat([o]); });
          var kb = A.el("div", { class: "ax-kanban" });
          ["جديد", "في التحضير", "جاهز للتقديم"].forEach(function (st) {
            var lane = A.el("section", { class: "ax-lane" });
            lane.appendChild(A.el("div", { class: "ax-lane-head", html: "<span>" + st + '</span><span class="ax-badge">' + ((lanes[st] || []).length) + "</span>" }));
            (lanes[st] || []).forEach(function (o) {
              lane.appendChild(A.el("article", { class: "ax-taskcard", html: "<h5>" + A.esc(o.id) + " · طاولة " + o.table + "</h5>" + o.lines.map(function (l) { return "<div class='ax-dim' style='font-size:12.5px'>" + l.qty + "× " + A.esc(l.name) + "</div>"; }).join("") + '<div class="ax-chips" style="margin-top:6px"><span class="ax-chip">' + A.fmt.time(o.at) + "</span><span class='ax-chip'>" + A.fmt.dzd(o.total) + "</span></div>" }));
              lane.lastChild.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", style: { marginTop: "6px" }, text: "التالي →", onclick: function () {
                var next = o.status === "جديد" ? "في التحضير" : o.status === "في التحضير" ? "جاهز للتقديم" : "جاهز للتقديم";
                store.set({ orders: store.get().orders.map(function (x) { return x.id === o.id ? Object.assign({}, x, { status: next }) : x; }) }, { kind: "board" });
                render();
              } }));
            });
            kb.appendChild(lane);
          });
          board.appendChild(kb);
          ui.appendChild(board);
        }
      }
      function add(m) {
        var line = cart.filter(function (l) { return l.id === m.id; })[0];
        if (line) line.qty++; else cart.push({ id: m.id, name: m.name, price: m.price, qty: 1 });
        A.toast("أُضيف: " + m.name, "ok", 1200);
      }
      function openCart() {
        if (!cart.length) { A.toast("الطلبية فارغة", "warn"); return; }
        var total = cart.reduce(function (s, l) { return s + l.price * l.qty; }, 0);
        var box = A.el("div", { class: "ax-grid", style: { gap: "10px" } });
        cart.forEach(function (l) {
          box.appendChild(A.el("div", { class: "ax-cart-row", html: "<span style='flex:1'>" + A.esc(l.name) + " × " + l.qty + "</span><strong>" + A.fmt.dzd(l.price * l.qty) + "</strong>" }));
        });
        var table = A.el("input", { class: "ax-input", placeholder: "رقم الطاولة أو «توصيل»", value: "طاولة 4", "aria-label": "الطاولة" });
        box.appendChild(table);
        box.appendChild(A.el("div", { class: "ax-totals", html: '<div class="ax-total-line"><span>المجموع</span><b>' + A.fmt.dzd(total) + "</b></div>" }));
        var m = A.modal({ title: "تأكيد الطلبية", html: box, actions: [
          { label: "أرسل للمطبخ", kind: "primary", icon: "check", onClick: function () {
            var order = { id: "ORD-" + A.rng().int(100, 999), at: new Date().toISOString(), table: table.value || "طاولة 4", lines: cart.slice(), total: total, status: "جديد" };
            store.set({ orders: [order].concat(store.get().orders) }, { kind: "order" });
            cart = [];
            render();
            A.motion.confetti(50);
            A.toast("وصلت الطلبية للمطبخ 🍳", "ok", 2600);
          } },
          { label: "واتساب", kind: "ghost", icon: "phone", onClick: function () {
            var text = "طلبية:\n" + cart.map(function (l) { return l.qty + "× " + l.name; }).join("\n") + "\nالمجموع: " + total + " دج";
            A.copy(text);
            A.toast("نسخنا الطلبية — الصقها في واتساب", "ok", 2600);
          } },
          { label: "إلغاء", kind: "ghost" }
        ] });
        void m;
      }
      render();
      A.bus.on("route", function () { A.guard("resto:route", render); });
    }
  });
})();
