/*@meta {"id":"charts","title":"محرّك الرسوم","domain":"data","tags":["charts","svg","canvas","analytics"],"order":22}*/
/* Hand-drawn SVG charts — bar, line, area, donut, radar, gauge, heatmap, funnel, sparkline, treemap.
   Animated, responsive, with legends, tooltips, and PNG / CSV export. */
(function () {
  var A = window.APEX;
  var P = { ".5": 0.5 };
  function scale(dom, range) {
    var d0 = Math.min.apply(null, dom), d1 = Math.max.apply(null, dom);
    if (d0 === d1) { d0 -= 1; d1 += 1; }
    return function (v) { return range[0] + ((v - d0) / (d1 - d0)) * (range[1] - range[0]); };
  }
  function nice(max) {
    if (max <= 0) return 1;
    var pow = Math.pow(10, Math.floor(Math.log10(max)));
    var n = max / pow;
    var m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return m * pow;
  }
  function fmtV(v, unit) {
    var s = Math.abs(v) >= 1e6 ? A.fmt.num(v / 1e6, 1) + "M" : Math.abs(v) >= 1e4 ? A.fmt.num(v / 1e3, 1) + "K" : A.fmt.num(v, Number.isInteger(v) ? 0 : 1);
    return unit ? s + " " + unit : s;
  }
  function palette() {
    var css = getComputedStyle(document.documentElement);
    var list = (css.getPropertyValue("--ax-series") || "").trim();
    if (list) return list.split(",").map(function (s) { return s.trim(); });
    return ["#d97757", "#4f9cf9", "#f2c14e", "#47c2a2", "#a78bfa", "#f472b6", "#22d3ee", "#fb923c"];
  }
  function svgEl(w, h) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 " + w + " " + h);
    s.setAttribute("class", "ax-chart");
    s.setAttribute("preserveAspectRatio", "none");
    return s;
  }
  function tip(host) {
    var t = A.el("div", { class: "ax-tip", hidden: "hidden" });
    host.appendChild(t);
    return {
      show: function (x, y, html) { t.innerHTML = html; t.hidden = false; t.style.left = x + "px"; t.style.top = y + "px"; t.classList.add("is-on"); },
      hide: function () { t.classList.remove("is-on"); t.hidden = true; }
    };
  }
  function mk(kind, spec) {
    var host = A.el("div", { class: "ax-chart-wrap ax-chart-" + kind });
    var head = A.el("div", { class: "ax-chart-head" });
    if (spec.title) head.appendChild(A.el("strong", { text: A.t("c_" + (spec.id || kind), spec.title) }));
    if (spec.subtitle) head.appendChild(A.el("span", { class: "ax-dim", text: spec.subtitle }));
    var actions = A.el("div", { class: "ax-chart-acts" });
    actions.appendChild(A.el("button", { type: "button", class: "ax-icon-btn", title: "تنزيل صورة PNG", "aria-label": "تنزيل صورة", html: A.icon("download", 15), onclick: function () { exportPng(host, kind); } }));
    actions.appendChild(A.el("button", { type: "button", class: "ax-icon-btn", title: "بيانات CSV", "aria-label": "CSV", html: A.icon("copy", 15), onclick: function () {
      var rows = (spec.data || []).map(function (d) { return { label: d.label, value: d.value }; });
      A.download((spec.title || kind) + ".csv", A.csv(rows), "text/csv;charset=utf-8");
    } }));
    head.appendChild(actions);
    if (spec.title) host.appendChild(head);
    return { host: host, head: head };
  }
  function exportPng(host, name) {
    var svg = A.q("svg", host);
    if (!svg) return;
    var xml = new XMLSerializer().serializeToString(svg);
    var img = new Image();
    img.onload = function () {
      var c = document.createElement("canvas");
      c.width = img.width * 2; c.height = img.height * 2;
      var ctx = c.getContext("2d");
      ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#14140f";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(function (b) { var u = URL.createObjectURL(b); A.downloadUrl(name + ".png", u); setTimeout(function () { URL.revokeObjectURL(u); }, 5000); });
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  }

  function barChart(spec, stack) {
    var m = mk("bar", spec), data = spec.data || [];
    var W = 640, H = spec.height || 260, pad = { t: 18, r: 16, b: 42, l: 48 };
    var svg = svgEl(W, H);
    var t = tip(m.host);
    var max = nice(Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1])) * 1.08);
    var y = scale([0, max], [H - pad.b, pad.t]);
    var bw = (W - pad.l - pad.r) / Math.max(1, data.length);
    for (var g = 0; g <= 4; g++) {
      var val = (max / 4) * g;
      var gy = y(val);
      svg.appendChild(A.svg("line", { x1: pad.l, x2: W - pad.r, y1: gy, y2: gy, class: "ax-grid-line" }));
      var lab = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lab.setAttribute("x", pad.l - 8); lab.setAttribute("y", gy + 4); lab.setAttribute("text-anchor", "end"); lab.setAttribute("class", "ax-axis");
      lab.textContent = fmtV(val, spec.unit);
      svg.appendChild(lab);
    }
    data.forEach(function (d, i) {
      var h = Math.max(2, H - pad.b - y(d.value));
      var w = bw * 0.62;
      var x = pad.l + i * bw + (bw - w) / 2;
      var col = d.color || palette()[i % palette().length];
      var rect = A.svg("rect", { x: x, y: H - pad.b, width: w, height: 0, rx: 6, fill: col, class: "ax-bar" });
      rect.style.transition = "y 620ms cubic-bezier(.22,1,.36,1) " + i * 40 + "ms, height 620ms cubic-bezier(.22,1,.36,1) " + i * 40 + "ms";
      svg.appendChild(rect);
      requestAnimationFrame(function () { rect.setAttribute("y", y(d.value)); rect.setAttribute("height", h); });
      if (data.length <= 16) {
        var lab2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
        lab2.setAttribute("x", x + w / 2); lab2.setAttribute("y", H - pad.b + 18); lab2.setAttribute("text-anchor", "middle"); lab2.setAttribute("class", "ax-axis");
        lab2.textContent = String(d.label).slice(0, 12);
        svg.appendChild(lab2);
      }
      var hit = A.svg("rect", { x: pad.l + i * bw, y: pad.t, width: bw, height: H - pad.t - pad.b, fill: "transparent" });
      A.on(hit, "mouseenter", function () { t.show(pad.l + i * bw + bw / 2, y(d.value) - 10, "<b>" + A.esc(d.label) + "</b><br>" + fmtV(d.value, spec.unit)); rect.classList.add("is-hot"); });
      A.on(hit, "mouseleave", function () { t.hide(); rect.classList.remove("is-hot"); });
      svg.appendChild(hit);
    });
    m.host.appendChild(svg);
    if (spec.legend !== false && data.length <= 8) m.host.appendChild(legend(data, false));
    if (stack) m.host.classList.add("ax-chart-stacked");
    return m.host;
  }

  function lineChart(spec, area) {
    var m = mk(area ? "area" : "line", spec), data = spec.data || [];
    var W = 640, H = spec.height || 240, pad = { t: 18, r: 16, b: 34, l: 48 };
    var svg = svgEl(W, H);
    var t = tip(m.host);
    var max = nice(Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1])) * 1.1);
    var min = spec.zero === false ? Math.min.apply(null, data.map(function (d) { return d.value; })) : 0;
    var x = scale([0, data.length - 1], [pad.l, W - pad.r]);
    var y = scale([min, max], [H - pad.b, pad.t]);
    for (var g = 0; g <= 4; g++) {
      var val = min + ((max - min) / 4) * g, gy = y(val);
      svg.appendChild(A.svg("line", { x1: pad.l, x2: W - pad.r, y1: gy, y2: gy, class: "ax-grid-line" }));
      var lab = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lab.setAttribute("x", pad.l - 8); lab.setAttribute("y", gy + 4); lab.setAttribute("text-anchor", "end"); lab.setAttribute("class", "ax-axis");
      lab.textContent = fmtV(val, spec.unit);
      svg.appendChild(lab);
    }
    var pts = data.map(function (d, i) { return [x(i), y(d.value), d]; });
    var dLine = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
    if (area) {
      var fill = A.svg("path", { d: dLine + " L" + pts[pts.length - 1][0] + " " + (H - pad.b) + " L" + pts[0][0] + " " + (H - pad.b) + " Z", class: "ax-area", fill: spec.color || palette()[0] });
      fill.style.opacity = "0.22";
      svg.appendChild(fill);
    }
    var path = A.svg("path", { d: dLine, class: "ax-line", stroke: spec.color || palette()[0], fill: "none" });
    var len = 0;
    try { len = path.getTotalLength ? path.getTotalLength() : 1200; } catch (e) { len = 1200; }
    path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
    svg.appendChild(path);
    requestAnimationFrame(function () { path.style.transition = "stroke-dashoffset 1100ms cubic-bezier(.22,1,.36,1)"; path.style.strokeDashoffset = "0"; });
    pts.forEach(function (p, i) {
      var c = A.svg("circle", { cx: p[0], cy: p[1], r: i === pts.length - 1 ? 4.6 : 3.2, fill: spec.color || palette()[0], class: "ax-dot" });
      c.style.opacity = "0";
      c.style.transition = "opacity 400ms ease " + (500 + i * 26) + "ms, r 160ms ease";
      svg.appendChild(c);
      requestAnimationFrame(function () { c.style.opacity = "1"; });
      A.on(c, "mouseenter", function () { c.setAttribute("r", 6); t.show(p[0], p[1] - 14, "<b>" + A.esc(p[2].label) + "</b><br>" + fmtV(p[2].value, spec.unit)); });
      A.on(c, "mouseleave", function () { c.setAttribute("r", 3.4); t.hide(); });
    });
    (spec.markers || []).forEach(function (mkp) {
      var idx = data.findIndex(function (d) { return d.label === mkp.label; });
      if (idx < 0) return;
      var px = x(idx), py = y(data[idx].value);
      svg.appendChild(A.svg("line", { x1: px, x2: px, y1: pad.t, y2: H - pad.b, class: "ax-marker" }));
      var lab3 = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lab3.setAttribute("x", px + 4); lab3.setAttribute("y", pad.t + 12); lab3.setAttribute("class", "ax-axis ax-axis-strong");
      lab3.textContent = mkp.text || "★";
      svg.appendChild(lab3);
    });
    m.host.appendChild(svg);
    if (spec.compare) m.host.appendChild(compareSvg(spec));
    return m.host;
  }
  function compareSvg(spec) {
    var data = spec.compare || [];
    if (!data.length) return A.el("span");
    var W = 200, H = 46;
    var svg = svgEl(W, H);
    data.forEach(function (d, i) {
      var h = (d.value / Math.max.apply(null, data.map(function (q) { return q.value; })) || 0) * (H - 10);
      svg.appendChild(A.svg("rect", { x: 6 + i * 22, y: H - h - 4, width: 14, height: h, rx: 3, fill: palette()[i % 8] }));
    });
    svg.setAttribute("class", "ax-spark");
    return svg;
  }

  function donut(spec) {
    var m = mk("donut", spec), data = spec.data || [];
    var S = spec.size || 220, r = S / 2 - 14, cx = S / 2, cy = S / 2;
    var svg = svgEl(S, S);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    var total = data.reduce(function (s, d) { return s + d.value; }, 0) || 1;
    var off = -Math.PI / 2;
    var t = tip(m.host);
    data.forEach(function (d, i) {
      var ang = (d.value / total) * Math.PI * 2;
      var x1 = cx + r * Math.cos(off), y1 = cy + r * Math.sin(off);
      var x2 = cx + r * Math.cos(off + ang - 0.02), y2 = cy + r * Math.sin(off + ang - 0.02);
      var large = ang > Math.PI ? 1 : 0;
      var arc = A.svg("path", {
        d: "M" + x1 + " " + y1 + " A" + r + " " + r + " 0 " + large + " 1 " + x2 + " " + y2,
        stroke: d.color || palette()[i % 8], "stroke-width": 18, fill: "none", "stroke-linecap": "round", class: "ax-arc"
      });
      var len = Math.PI * 2 * r;
      arc.style.strokeDasharray = len; arc.style.strokeDashoffset = len;
      arc.style.transition = "stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1) " + i * 70 + "ms";
      svg.appendChild(arc);
      requestAnimationFrame(function () { arc.style.strokeDashoffset = len * (1 - d.value / total); });
      A.on(arc, "mouseenter", function () { arc.setAttribute("stroke-width", 23); t.show(cx, cy - 6, "<b>" + A.esc(d.label) + "</b><br>" + fmtV(d.value, spec.unit) + " · " + A.fmt.pct((d.value / total) * 100)); });
      A.on(arc, "mouseleave", function () { arc.setAttribute("stroke-width", 18); t.hide(); });
      off += ang;
    });
    var big = document.createElementNS("http://www.w3.org/2000/svg", "text");
    big.setAttribute("x", cx); big.setAttribute("y", cy + 4); big.setAttribute("text-anchor", "middle"); big.setAttribute("class", "ax-donut-big");
    big.textContent = fmtV(total, spec.unit);
    svg.appendChild(big);
    var cap = document.createElementNS("http://www.w3.org/2000/svg", "text");
    cap.setAttribute("x", cx); cap.setAttribute("y", cy + 22); cap.setAttribute("text-anchor", "middle"); cap.setAttribute("class", "ax-axis");
    cap.textContent = spec.centerLabel || "المجموع";
    svg.appendChild(cap);
    m.host.appendChild(svg);
    m.host.appendChild(legend(data, true, total));
    return m.host;
  }
  function legend(data, withPct, total) {
    var box = A.el("div", { class: "ax-legend" });
    (data || []).forEach(function (d, i) {
      box.appendChild(A.el("span", { class: "ax-legend-item", html: '<i style="background:' + (d.color || palette()[i % 8]) + '"></i>' + A.esc(d.label) + (withPct ? ' <b>' + A.fmt.pct((d.value / (total || 1)) * 100, 0) + "</b>" : "") }));
    });
    return box;
  }

  function radar(spec) {
    var m = mk("radar", spec);
    var axes = spec.axes || [], S = 260, r = S / 2 - 40, cx = S / 2, cy = S / 2;
    var svg = svgEl(S, S);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    var t = tip(m.host);
    for (var ring = 1; ring <= 4; ring++) {
      var pts = [];
      for (var i = 0; i < axes.length; i++) {
        var ang = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
        pts.push((cx + (r * ring / 4) * Math.cos(ang)).toFixed(1) + "," + (cy + (r * ring / 4) * Math.sin(ang)).toFixed(1));
      }
      svg.appendChild(A.svg("polygon", { points: pts.join(" "), class: "ax-grid-line", fill: "none" }));
    }
    axes.forEach(function (ax, i) {
      var ang = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
      svg.appendChild(A.svg("line", { x1: cx, y1: cy, x2: cx + r * Math.cos(ang), y2: cy + r * Math.sin(ang), class: "ax-grid-line" }));
      var lab = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lab.setAttribute("x", cx + (r + 18) * Math.cos(ang)); lab.setAttribute("y", cy + (r + 18) * Math.sin(ang));
      lab.setAttribute("text-anchor", "middle"); lab.setAttribute("class", "ax-axis");
      lab.textContent = ax.label;
      svg.appendChild(lab);
    });
    (spec.series || []).forEach(function (s, si) {
      var pts = s.values.map(function (v, i) {
        var ang = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
        var rr = r * A.clamp(v / 100, 0, 1);
        return (cx + rr * Math.cos(ang)).toFixed(1) + "," + (cy + rr * Math.sin(ang)).toFixed(1);
      });
      var poly = A.svg("polygon", { points: pts.join(" "), fill: s.color || palette()[si % 8], "fill-opacity": 0.26, stroke: s.color || palette()[si % 8], "stroke-width": 2, class: "ax-radar" });
      poly.style.transformOrigin = cx + "px " + cy + "px";
      poly.style.transform = "scale(.4)"; poly.style.opacity = "0";
      poly.style.transition = "transform 700ms cubic-bezier(.22,1,.36,1), opacity 600ms ease";
      svg.appendChild(poly);
      requestAnimationFrame(function () { poly.style.transform = "scale(1)"; poly.style.opacity = "1"; });
      A.on(poly, "mouseenter", function () { t.show(cx, cy, "<b>" + A.esc(s.label || "") + "</b><br>" + s.values.map(function (v, i) { return A.esc(axes[i].label) + ": " + v; }).join("<br>")); });
      A.on(poly, "mouseleave", function () { t.hide(); });
    });
    m.host.appendChild(svg);
    return m.host;
  }

  function gauge(spec) {
    var m = mk("gauge", spec);
    var v = A.clamp(spec.value || 0, 0, spec.max || 100), max = spec.max || 100;
    var S = 200, r = 78, cx = S / 2, cy = S / 2 + 16;
    var svg = svgEl(S, S - 20);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    var back = A.svg("path", { d: "M" + (cx - r) + " " + cy + " A" + r + " " + r + " 0 0 1 " + (cx + r) + " " + cy, stroke: "currentColor", "stroke-opacity": .12, "stroke-width": 16, fill: "none", "stroke-linecap": "round" });
    svg.appendChild(back);
    var len = Math.PI * r, pct = v / max;
    var arc = A.svg("path", { d: "M" + (cx - r) + " " + cy + " A" + r + " " + r + " 0 0 1 " + (cx + r) + " " + cy, stroke: spec.color || palette()[3], "stroke-width": 16, fill: "none", "stroke-linecap": "round" });
    arc.style.strokeDasharray = len; arc.style.strokeDashoffset = len;
    arc.style.transition = "stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)";
    svg.appendChild(arc);
    requestAnimationFrame(function () { arc.style.strokeDashoffset = len * (1 - pct); });
    var big = document.createElementNS("http://www.w3.org/2000/svg", "text");
    big.setAttribute("x", cx); big.setAttribute("y", cy - 6); big.setAttribute("text-anchor", "middle"); big.setAttribute("class", "ax-donut-big");
    big.textContent = A.fmt.num(v, 0) + (spec.suffix || "");
    svg.appendChild(big);
    var cap = document.createElementNS("http://www.w3.org/2000/svg", "text");
    cap.setAttribute("x", cx); cap.setAttribute("y", cy + 14); cap.setAttribute("text-anchor", "middle"); cap.setAttribute("class", "ax-axis");
    cap.textContent = spec.centerLabel || "";
    svg.appendChild(cap);
    m.host.appendChild(svg);
    var needle = A.el("input", { type: "range", min: 0, max: max, value: v, class: "ax-range", "aria-label": spec.title || "قيمة" });
    A.on(needle, "input", function () {
      var nv = Number(needle.value);
      arc.style.strokeDashoffset = len * (1 - nv / max);
      big.textContent = A.fmt.num(nv, 0) + (spec.suffix || "");
      if (spec.onChange) spec.onChange(nv);
    });
    if (spec.interactive !== false) m.host.appendChild(needle);
    return m.host;
  }

  function heatmap(spec) {
    var m = mk("heat", spec), data = spec.data || [];
    var cols = spec.cols || 7, rows = Math.ceil(data.length / cols);
    var cell = 26, W = cols * cell + 46, H = rows * cell + 30;
    var svg = svgEl(W, H);
    var t = tip(m.host);
    var max = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
    data.forEach(function (d, i) {
      var x = 40 + (i % cols) * cell, y = (Math.floor(i / cols)) * cell + 18;
      var ratio = d.value / max;
      var rect = A.svg("rect", { x: x, y: y, width: cell - 4, height: cell - 4, rx: 5, fill: spec.color || palette()[3], class: "ax-heat" });
      rect.style.opacity = String(0.12 + ratio * 0.88);
      rect.style.transition = "opacity 500ms ease " + Math.min(i * 8, 400) + "ms";
      svg.appendChild(rect);
      A.on(rect, "mouseenter", function () { rect.style.stroke = "currentColor"; t.show(x, y - 8, "<b>" + A.esc(d.label) + "</b><br>" + fmtV(d.value, spec.unit)); });
      A.on(rect, "mouseleave", function () { rect.style.stroke = "none"; t.hide(); });
      if (i % cols === 0) {
        var lab = document.createElementNS("http://www.w3.org/2000/svg", "text");
        lab.setAttribute("x", 34); lab.setAttribute("y", y + 16); lab.setAttribute("text-anchor", "end"); lab.setAttribute("class", "ax-axis");
        lab.textContent = A.esc(d.row || "");
        svg.appendChild(lab);
      }
    });
    m.host.appendChild(svg);
    return m.host;
  }

  function funnel(spec) {
    var m = mk("funnel", spec), data = spec.data || [];
    var W = 560, H = 40 + data.length * 46;
    var svg = svgEl(W, H);
    var max = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
    data.forEach(function (d, i) {
      var w = (d.value / max) * (W - 140), y = 12 + i * 46;
      svg.appendChild(A.svg("rect", { x: 20, y: y, width: 0, height: 34, rx: 9, fill: d.color || palette()[i % 8], class: "ax-funnel" }));
      var rects = A.qa("rect", svg);
      var rect = rects[i];
      rect.style.transition = "width 700ms cubic-bezier(.22,1,.36,1) " + i * 90 + "ms";
      requestAnimationFrame(function () { rect.setAttribute("width", w); });
      var lab = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lab.setAttribute("x", 28); lab.setAttribute("y", y + 22); lab.setAttribute("class", "ax-funnel-lab");
      lab.textContent = d.label + " · " + fmtV(d.value, spec.unit) + (i ? " (" + A.fmt.pct((d.value / data[0].value) * 100, 0) + ")" : "");
      svg.appendChild(lab);
    });
    m.host.appendChild(svg);
    return m.host;
  }

  function treemap(spec) {
    var m = mk("treemap", spec), data = (spec.data || []).slice().sort(function (a, b) { return b.value - a.value; });
    var W = 620, H = 320;
    var svg = svgEl(W, H);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    var total = data.reduce(function (s, d) { return s + d.value; }, 0) || 1;
    var x = 0, y = 0, rowH = 0, remain = total;
    data.forEach(function (d, i) {
      var frac = d.value / remain;
      var w = (frac > 0.5 ? W - x : Math.max(60, (W - x) * frac));
      var h = Math.max(36, (H - y) * Math.min(1, d.value / total * 2.2));
      if (x + w > W) { x = 0; y += rowH + 6; rowH = 0; w = W * frac; h = Math.max(36, (H - y) * 0.5); }
      var g = A.svg("g", { class: "ax-tm" });
      var rect = A.svg("rect", { x: x, y: y, width: Math.max(0, w - 6), height: Math.max(0, h - 6), rx: 10, fill: d.color || palette()[i % 8], "fill-opacity": .85 });
      g.appendChild(rect);
      var t1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t1.setAttribute("x", x + 12); t1.setAttribute("y", y + 24); t1.setAttribute("class", "ax-tm-lab");
      t1.textContent = d.label;
      g.appendChild(t1);
      var t2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t2.setAttribute("x", x + 12); t2.setAttribute("y", y + 44); t2.setAttribute("class", "ax-tm-val");
      t2.textContent = fmtV(d.value, spec.unit);
      g.appendChild(t2);
      svg.appendChild(g);
      A.on(g, "mouseenter", function () { rect.setAttribute("fill-opacity", "1"); });
      A.on(g, "mouseleave", function () { rect.setAttribute("fill-opacity", ".85"); });
      x += w; rowH = Math.max(rowH, h); remain -= d.value;
    });
    m.host.appendChild(svg);
    return m.host;
  }

  function sparkline(spec) {
    var data = (spec.data || []).map(function (d) { return typeof d === "number" ? { value: d } : d; });
    var W = spec.width || 120, H = spec.height || 34;
    var svg = svgEl(W, H);
    svg.setAttribute("class", "ax-spark " + (spec.class || ""));
    var max = Math.max.apply(null, data.map(function (d) { return d.value; })), min = Math.min.apply(null, data.map(function (d) { return d.value; }));
    var y = scale([min, max], [H - 4, 4]), x = scale([0, Math.max(1, data.length - 1)], [2, W - 2]);
    var dstr = data.map(function (d, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(d.value).toFixed(1); }).join(" ");
    svg.appendChild(A.svg("path", { d: dstr + " L" + (W - 2) + " " + H + " L2 " + H + " Z", fill: spec.color || palette()[3], "fill-opacity": .18 }));
    svg.appendChild(A.svg("path", { d: dstr, fill: "none", stroke: spec.color || palette()[3], "stroke-width": 2, "stroke-linejoin": "round" }));
    return svg;
  }

  A.chart = function (spec) {
    var k = spec.kind || "bar";
    if (k === "bar") return barChart(spec, false);
    if (k === "column") return barChart(spec, false);
    if (k === "line") return lineChart(spec, false);
    if (k === "area") return lineChart(spec, true);
    if (k === "donut" || k === "pie") return donut(spec);
    if (k === "radar") return radar(spec);
    if (k === "gauge") return gauge(spec);
    if (k === "heatmap") return heatmap(spec);
    if (k === "funnel") return funnel(spec);
    if (k === "treemap") return treemap(spec);
    if (k === "spark") return sparkline(spec);
    return barChart(spec, false);
  };
  /* svg helper also used by mapsvg / other modules */
  A.svg = function (tag, attrs) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); });
    return n;
  };
  A.palette = palette;
  A.register({ id: "charts", title: "محرّك الرسوم", mount: function (host) { A.guard("charts:mount", function () { (window.APEX_DATA[host.getAttribute("data-charts") || "charts"] || []).forEach(function (s) { host.appendChild(A.chart(s)); }); }); } });
})();
