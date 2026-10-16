/*@meta {"id":"mapsvg","title":"الخريطة والولايات","domain":"data","tags":["map","algeria","wilayas","choropleth"],"order":60,"needs":["kernel"]}*/
/* Algeria distribution map drawn from real wilaya coordinates: bubbles, choropleth intensity,
   selection, ranking table and live search — no map library, no tiles, no network. */
(function () {
  var A = window.APEX;
  var GEO = {
    "أدرار": [27.87, -0.29], "الشلف": [36.16, 1.33], "الأغواط": [33.8, 2.86], "أم البواقي": [35.87, 7.11], "باتنة": [35.55, 6.17],
    "بجاية": [36.75, 5.08], "بسكرة": [34.85, 5.73], "بشار": [31.62, -2.22], "البليدة": [36.47, 2.83], "البويرة": [36.37, 3.9],
    "تمنراست": [22.79, 5.53], "تبسة": [35.4, 8.12], "تلمسان": [34.88, -1.32], "تيارت": [35.37, 1.32], "تيزي وزو": [36.72, 4.05],
    "الجزائر": [36.75, 3.06], "الجلفة": [34.67, 3.25], "جيجل": [36.82, 5.77], "سطيف": [36.19, 5.41], "سعيدة": [34.83, 0.15],
    "سكيكدة": [36.88, 6.9], "سيدي بلعباس": [35.2, -0.63], "عنابة": [36.9, 7.77], "قالمة": [36.46, 7.43], "قسنطينة": [36.36, 6.61],
    "المدية": [36.26, 2.75], "مستغانم": [35.93, 0.09], "المسيلة": [35.7, 4.54], "معسكر": [35.4, 0.14], "ورقلة": [31.95, 5.32],
    "وهران": [35.7, -0.63], "البيض": [33.68, 1.02], "إليزي": [26.5, 8.47], "برج بوعريريج": [36.07, 4.76], "بومرداس": [36.76, 3.47],
    "الطارف": [36.77, 8.31], "تندوف": [27.67, -8.13], "تيسمسيلت": [35.6, 1.81], "الوادي": [33.37, 6.87], "خنشلة": [35.44, 7.14],
    "سوق أهراس": [36.29, 7.95], "تيبازة": [36.59, 2.45], "ميلة": [36.45, 6.26], "عين الدفلى": [36.26, 1.97], "النعامة": [33.27, -0.31],
    "عين تموشنت": [35.3, -1.14], "غرداية": [32.49, 3.67], "غليزان": [35.74, 0.56], "تيميمون": [29.26, 0.24], "برج باجي مختار": [21.33, 0.95],
    "أولاد جلال": [34.43, 5.06], "بني عباس": [30.13, -2.17], "عين صالح": [27.2, 2.47], "عين قزام": [19.57, 5.77], "تقرت": [33.1, 6.06],
    "جانت": [24.55, 9.48], "المغير": [33.95, 5.92], "المنيعة": [30.58, 2.88]
  };
  A.register({
    id: "mapsvg",
    title: "خريطة الولايات",
    mount: function (host, ctx) {
      var ui = A.el("div", { class: "ax-grid", style: { gap: "16px" } });
      host.appendChild(ui);
      var metric = "طلبات";
      var data = {};
      var src = ctx.data.orders || ctx.data.listings || ctx.data.contacts || ctx.data.exports || [];
      Object.keys(GEO).forEach(function (w) { data[w] = 0; });
      src.forEach(function (row) { var w = row.wilaya; if (w && data[w] != null) data[w] += 1; });
      if (!src.length) Object.keys(GEO).forEach(function (w) { data[w] = A.rng(w.length * 13).int(0, 60); });

      var W = 720, H = 620;
      function project(lat, lng) {
        var x = ((lng + 9.2) / (12.4 + 9.2)) * W;
        var y = ((37.6 - lat) / (37.6 - 18.6)) * H;
        return [x, y];
      }
      function render() {
        ui.innerHTML = "";
        var bar = A.el("div", { class: "ax-grid-bar" });
        bar.appendChild(A.el("span", { class: "ax-chip", text: "كل ولايات الجزائر: 58" }));
        ["طلبات", "قيمة", "عملاء"].forEach(function (mt) {
          bar.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn" + (metric === mt ? " is-on" : ""), text: mt, onclick: function () { metric = mt; render(); } }));
        });
        bar.appendChild(A.el("span", { class: "ax-spacer" }));
        bar.appendChild(A.el("div", { class: "ax-shop-search", html: A.icon("search") + '<input class="ax-input" type="search" placeholder="ابحث عن ولاية…" aria-label="بحث">' }));
        ui.appendChild(bar);

        var wrap = A.el("div", { class: "ax-card", style: { padding: "10px" } });
        var svg = A.svg("svg", { viewBox: "0 0 " + W + " " + H, class: "ax-mapsvg", role: "img", "aria-label": "خريطة توزيع حسب الولاية" });
        /* graticule */
        for (var gx = 0; gx <= 6; gx++) svg.appendChild(A.svg("line", { x1: (gx * W) / 6, x2: (gx * W) / 6, y1: 0, y2: H, class: "ax-grid-line" }));
        for (var gy = 0; gy <= 5; gy++) svg.appendChild(A.svg("line", { x1: 0, x2: W, y1: (gy * H) / 5, y2: (gy * H) / 5, class: "ax-grid-line" }));
        var max = Math.max.apply(null, Object.keys(data).map(function (k) { return data[k]; }).concat([1]));
        var pal = A.palette();
        var tooltip = A.el("div", { class: "ax-tip" });
        wrap.appendChild(tooltip);
        Object.keys(GEO).forEach(function (w, i) {
          var p = project(GEO[w][0], GEO[w][1]);
          var v = data[w];
          var r = 5 + (v / max) * 22;
          var circle = A.svg("circle", { cx: p[0], cy: p[1], r: r, fill: pal[3], "fill-opacity": 0.18 + (v / max) * 0.7, stroke: pal[0], "stroke-width": 0.8, class: "ax-map-bubble" });
          circle.style.transition = "r 600ms cubic-bezier(.22,1,.36,1) " + (i * 6) + "ms, fill-opacity 600ms ease";
          svg.appendChild(circle);
          var label = document.createElementNS("http://www.w3.org/2000/svg", "text");
          label.setAttribute("x", p[0]); label.setAttribute("y", p[1] + 3); label.setAttribute("text-anchor", "middle");
          label.setAttribute("font-size", "7.5"); label.setAttribute("fill", "rgba(255,255,255,.9)");
          label.textContent = String(v);
          svg.appendChild(label);
          A.on(circle, "mouseenter", function () {
            circle.setAttribute("stroke-width", "2.4");
            tooltip.innerHTML = "<b>" + A.esc(w) + "</b><br>" + metric + ": " + v + " · نسبة " + A.fmt.pct((v / max) * 100, 0);
            tooltip.hidden = false;
            tooltip.style.left = (p[0] / W) * 100 + "%";
            tooltip.style.top = (p[1] / H) * 100 + "%";
            tooltip.classList.add("is-on");
          });
          A.on(circle, "mouseleave", function () { circle.setAttribute("stroke-width", "0.8"); tooltip.classList.remove("is-on"); tooltip.hidden = true; });
          A.on(circle, "click", function () { detail(w, data[w]); });
        });
        wrap.appendChild(svg);
        wrap.appendChild(A.el("p", { class: "ax-dim", style: { fontSize: "12.5px" }, text: "الحجم والكثافة يمثّلان " + metric + " في كل ولاية. اضغط على أي دائرة للتفاصيل." }));
        ui.appendChild(wrap);

        var two = A.el("div", { class: "ax-two" });
        two.appendChild(A.chart({ kind: "bar", title: "أعلى 12 ولاية", unit: metric, data: Object.keys(data).map(function (k) { return { label: k, value: data[k] }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 12) }));
        two.appendChild(A.chart({ kind: "treemap", title: "توزيع جغرافي", unit: metric, data: Object.keys(data).map(function (k) { return { label: k, value: data[k] + 1 }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 14) }));
        ui.appendChild(two);
        A.grid(ui, {
          name: "wilayas", rows: Object.keys(data).map(function (k, i) { return { id: "W" + i, wilaya: k, value: data[k], share: Math.round((data[k] / Math.max(1, max)) * 100), lat: GEO[k][0], lng: GEO[k][1] }; }),
          pageSize: 12, sort: "value", dir: "desc",
          columns: [
            { key: "wilaya", label: "الولاية" },
            { key: "value", label: metric, numeric: true },
            { key: "share", label: "الوزن النسبي", numeric: true, render: function (v) { return '<span class="ax-progressbar" style="width:90px;display:inline-block"><i style="width:' + v + '%"></i></span> ' + v + "%"; } },
            { key: "lat", label: "خط العرض", numeric: true }, { key: "lng", label: "خط الطول", numeric: true }
          ]
        });
        var search = A.q("input", bar);
        A.on(search, "input", A.debounce(function () {
          var q = search.value.trim();
          if (!q) return;
          var hit = Object.keys(GEO).filter(function (w) { return w.indexOf(q) >= 0; })[0];
          if (hit) detail(hit, data[hit]);
        }, 400));
      }
      function detail(w, v) {
        A.modal({ title: "ولاية " + w, html: A.el("div", { class: "ax-grid", style: { gap: "10px" } }, [
          A.el("div", { class: "ax-tile", html: "<strong>" + w + "</strong><div class='ax-dim'>الإحداثيات: " + GEO[w][0] + " / " + GEO[w][1] + "</div>" }),
          A.el("div", { class: "ax-tile", html: "<strong>" + v + "</strong><div class='ax-dim'>" + metric + " مسجّلة</div>" }),
          A.chart({ kind: "spark", data: Array.from({ length: 12 }, function (_, i) { return v * (0.6 + A.rng(w.length + i).next() * 0.8); }), width: 240, height: 50 })
        ]), actions: [{ label: "إغلاق", kind: "ghost" }] });
      }
      render();
    }
  });
})();
