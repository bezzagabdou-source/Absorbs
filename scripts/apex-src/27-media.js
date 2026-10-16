/*@meta {"id":"media","title":"معرض الوسائط","domain":"ui","tags":["gallery","images","lightbox","canvas","filters"],"order":47,"needs":["kernel"]}*/
/* Gallery with lightbox, keyboard nav, real canvas filters, slideshow, download and generated art. */
(function () {
  var A = window.APEX;
  function art(seed, palette, size) {
    var rng = A.rng(seed);
    var c = document.createElement("canvas");
    c.width = size || 640; c.height = Math.round((size || 640) * 0.66);
    var ctx = c.getContext("2d");
    var g = ctx.createLinearGradient(0, 0, c.width, c.height);
    g.addColorStop(0, palette[0]); g.addColorStop(0.5, palette[1]); g.addColorStop(1, palette[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    for (var i = 0; i < rng.int(18, 42); i++) {
      ctx.beginPath();
      ctx.globalAlpha = rng.float(0.08, 0.32, 2);
      ctx.fillStyle = palette[rng.int(0, palette.length - 1)];
      var r = rng.int(20, 180);
      ctx.arc(rng.int(0, c.width), rng.int(0, c.height), r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (var j = 0; j < 260; j++) {
      ctx.fillStyle = "rgba(255,255,255," + rng.float(0.02, 0.14, 2) + ")";
      ctx.fillRect(rng.int(0, c.width), rng.int(0, c.height), rng.int(1, 3), rng.int(1, 3));
    }
    return c;
  }
  A.register({
    id: "media",
    title: "معرض الوسائط",
    mount: function (host, ctx) {
      var pal = A.palette();
      var filter = "none";
      var rng = A.rng((ctx.plan && ctx.plan.seed) || 9);
      var shots = Array.from({ length: 24 }, function (_, i) {
        return { id: "IMG-" + (100 + i), title: rng.pick(["منظر صحراوي", "قصر قديم", "سوق شعبي", "شاطئ", "جبل", "ورشة حرفية", "مقهى", "منتوج جديد", "مخزن", "فريق العمل"]) + " #" + (i + 1), seed: (ctx.plan.seed || 1) + i * 7, likes: rng.int(3, 480), tag: rng.pick(["منتجات", "فريق", "أحداث", "وجهات"]) };
      });
      var ui = A.el("div", { class: "ax-grid", style: { gap: "14px" } });
      host.appendChild(ui);
      function render() {
        ui.innerHTML = "";
        var bar = A.el("div", { class: "ax-grid-bar" });
        bar.appendChild(A.el("div", { class: "ax-shop-search", html: A.icon("search") + '<input class="ax-input" type="search" placeholder="ابحث في الصور…" aria-label="بحث">' }));
        var tags = [];
        shots.forEach(function (s) { if (tags.indexOf(s.tag) < 0) tags.push(s.tag); });
        ["الكل"].concat(tags).forEach(function (tg) {
          bar.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn" + (tg === (bar.getAttribute("data-tag") || "الكل") ? " is-on" : ""), text: tg, onclick: function () { bar.setAttribute("data-tag", tg); paint(tg, A.q("input", bar).value); } }));
        });
        var filters = [["none", "بلا فلتر"], ["grayscale", "أبيض وأسود"], ["sepia", "سيبيا"], ["contrast", "تباين"], ["saturate", "تشبّع"], ["invert", "مقلوب"], ["blur", "ضبابي"]];
        var fsel = A.el("select", { class: "ax-input ax-mini", "aria-label": "فلتر" });
        filters.forEach(function (f) { fsel.appendChild(A.el("option", { value: f[0], text: f[1], selected: filter === f[0] ? "selected" : null })); });
        A.on(fsel, "change", function () { filter = fsel.value; apply(); });
        bar.appendChild(fsel);
        bar.appendChild(A.el("span", { class: "ax-spacer" }));
        bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("play", 15) + " عرض متتالي", onclick: function () { slideshow(0); } }));
        bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", html: A.icon("download", 15) + " نزّل الصورة المحدّدة", onclick: function () { downloadOne(0); } }));
        ui.appendChild(bar);
        var grid = A.el("div", { class: "ax-products", style: { gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))" } });
        ui.appendChild(grid);
        function apply() {
          A.qa("canvas", grid).forEach(function (cv) { cv.style.filter = filter === "none" ? "" : filter + "(" + (filter === "blur" ? "3px" : filter === "grayscale" ? "1" : filter === "invert" ? "1" : "1.6") + ")"; });
        }
        function paint(tag, q) {
          grid.innerHTML = "";
          var list = shots.filter(function (s) { return (tag === "الكل" || !tag || s.tag === tag) && (!q || s.title.toLowerCase().indexOf(String(q).toLowerCase()) >= 0); });
          if (!list.length) grid.appendChild(A.el("p", { class: "ax-empty", text: "ما كانش صور مطابقة" }));
          list.forEach(function (s, i) {
            var cv = art(s.seed, pal, 520);
            cv.style.cssText = "width:100%;height:auto;border-radius:12px;display:block";
            var card = A.el("figure", { class: "ax-product", style: { padding: "0", overflow: "hidden", cursor: "zoom-in" } });
            card.appendChild(cv);
            card.appendChild(A.el("figcaption", { style: { padding: "10px" }, html: "<strong style='font-size:13.5px'>" + A.esc(s.title) + "</strong><div class='ax-dim' style='font-size:12px'>❤️ " + s.likes + " · " + A.esc(s.tag) + "</div>" }));
            A.on(card, "click", function () { lightbox(i, list); });
            grid.appendChild(card);
          });
          apply();
        }
        A.on(A.q("input", bar), "input", A.debounce(function (e) { paint(bar.getAttribute("data-tag") || "الكل", e.target.value); }, 140));
        paint("الكل", "");
        function downloadOne() {
          var cvs = A.qa("canvas", grid);
          var cv = cvs[0];
          if (!cv) return;
          cv.toBlob(function (b) { var u = URL.createObjectURL(b); A.downloadUrl("apex-art.png", u); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); });
        }
        function lightbox(idx, list) {
          var wrap = A.el("div", { style: { textAlign: "center" } });
          var cv = A.el("canvas");
          var big = art(list[idx].seed, pal, 900);
          cv.width = big.width; cv.height = big.height;
          cv.getContext("2d").drawImage(big, 0, 0);
          cv.style.cssText = "width:100%;height:auto;border-radius:14px";
          cv.style.filter = filter === "none" ? "" : filter + "(" + (filter === "grayscale" ? "1" : "1.4") + ")";
          wrap.appendChild(cv);
          wrap.appendChild(A.el("p", { class: "ax-dim", style: { marginTop: "10px" }, text: list[idx].title + " · " + (idx + 1) + "/" + list.length + " — استعمل ← → للتنقل" }));
          var m = A.modal({ title: "عرض الصورة", wide: true, html: wrap, actions: [
            { label: "نزّل", kind: "ghost", icon: "download", onClick: function () { big.toBlob(function (b) { var u = URL.createObjectURL(b); A.downloadUrl(list[idx].title + ".png", u); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }); } },
            { label: "إغلاق", kind: "ghost" }
          ] });
          function key(e) {
            if (e.key === "ArrowRight") { m.close(); lightbox((idx + 1) % list.length, list); }
            if (e.key === "ArrowLeft") { m.close(); lightbox((idx - 1 + list.length) % list.length, list); }
          }
          A.on(window, "keydown", key, { once: true });
        }
        function slideshow(i) {
          if (i >= shots.length) return;
          var cv = art(shots[i].seed, pal, 800);
          var m = A.modal({ title: shots[i].title, wide: true, html: '<canvas id="sl" style="width:100%;height:auto;border-radius:12px"></canvas>', actions: [{ label: "وقف", kind: "ghost" }] });
          A.guard("slide", function () { A.q("#sl", m.el).getContext("2d").drawImage(cv, 0, 0); var c = A.q("#sl", m.el); c.width = cv.width; c.height = cv.height; c.getContext("2d").drawImage(cv, 0, 0); });
          setTimeout(function () { m.close(); slideshow(i + 1); }, 2200);
        }
      }
      render();
      A.bus.on("route", function () { A.guard("media:route", render); });
    }
  });
})();
