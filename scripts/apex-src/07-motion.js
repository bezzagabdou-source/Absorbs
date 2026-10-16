/*@meta {"id":"motion","title":"الحركة والتفاعل","domain":"ui","tags":["animation","scroll","parallax","tilt","cursor"],"order":24}*/
/* Scroll choreography, parallax, tilt cards, magnetic buttons, marquee, page transitions, custom cursor. */
(function () {
  var A = window.APEX;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var M = {
    scrollProgress: function () {
      var bar = A.el("div", { class: "ax-progress", role: "progressbar", "aria-label": "تقدّم الصفحة" });
      document.body.appendChild(bar);
      var paint = A.throttle(function () {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = "scaleX(" + (h > 0 ? A.clamp(window.scrollY / h, 0, 1) : 0) + ")";
      }, 40);
      A.on(window, "scroll", paint, { passive: true });
      paint();
      return bar;
    },
    parallax: function (root) {
      var nodes = A.qa("[data-parallax]", root || document);
      if (!nodes.length || reduced) return;
      var paint = A.throttle(function () {
        var vh = window.innerHeight;
        nodes.forEach(function (n) {
          var r = n.getBoundingClientRect();
          if (r.bottom < -120 || r.top > vh + 120) return;
          var speed = parseFloat(n.getAttribute("data-parallax")) || 0.18;
          var mid = r.top + r.height / 2 - vh / 2;
          n.style.transform = "translate3d(0," + (-mid * speed).toFixed(2) + "px,0)";
        });
      }, 16);
      A.on(window, "scroll", paint, { passive: true });
      paint();
    },
    tilt: function (root) {
      A.qa("[data-tilt]", root || document).forEach(function (card) {
        if (reduced) return;
        var max = parseFloat(card.getAttribute("data-tilt")) || 8;
        A.on(card, "pointermove", function (e) {
          var r = card.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
          card.style.transform = "perspective(900px) rotateY(" + (px * max) + "deg) rotateX(" + (-py * max) + "deg) translateZ(6px)";
          card.style.setProperty("--mx", ((px + .5) * 100).toFixed(1) + "%");
          card.style.setProperty("--my", ((py + .5) * 100).toFixed(1) + "%");
        });
        A.on(card, "pointerleave", function () { card.style.transform = ""; });
      });
    },
    magnetic: function (root) {
      A.qa("[data-magnet]", root || document).forEach(function (btn) {
        if (reduced) return;
        var strength = parseFloat(btn.getAttribute("data-magnet")) || 10;
        A.on(btn, "pointermove", function (e) {
          var r = btn.getBoundingClientRect();
          btn.style.transform = "translate(" + (((e.clientX - r.left) / r.width - .5) * strength) + "px," + (((e.clientY - r.top) / r.height - .5) * strength) + "px)";
        });
        A.on(btn, "pointerleave", function () { btn.style.transform = ""; });
      });
    },
    typedText: function (node, lines, speed) {
      var text = lines.join(" \u00B7 ");
      var i = 0;
      node.textContent = "";
      node.classList.add("ax-typing");
      (function tick() {
        node.textContent = text.slice(0, i++);
        if (i <= text.length) setTimeout(tick, speed || 34);
        else node.classList.remove("ax-typing");
      })();
    },
    counters: function (root) { A.qa("[data-count]", root || document).forEach(function (n) { A.countUp(n, parseFloat(n.getAttribute("data-count")), 1100); }); },
    cursor: function () {
      if (reduced || window.matchMedia("(pointer: coarse)").matches) return;
      var dot = A.el("div", { class: "ax-cursor" });
      var ring = A.el("div", { class: "ax-cursor-ring" });
      document.body.appendChild(dot); document.body.appendChild(ring);
      var rx = 0, ry = 0, tx = 0, ty = 0;
      A.on(window, "pointermove", function (e) {
        tx = e.clientX; ty = e.clientY;
        dot.style.transform = "translate(" + tx + "px," + ty + "px)";
        var hot = e.target.closest && e.target.closest("a,button,[data-tilt],[data-magnet]");
        ring.classList.toggle("is-hot", !!hot);
      }, { passive: true });
      (function loop() { rx += (tx - rx) * .16; ry += (ty - ry) * .16; ring.style.transform = "translate(" + rx + "px," + ry + "px)"; requestAnimationFrame(loop); })();
    },
    marquee: function (host, items, reverse) {
      var wrap = A.el("div", { class: "ax-marquee" + (reverse ? " ax-marquee-rev" : "") });
      var inner = A.el("div", { class: "ax-marquee-in" });
      [0, 1].forEach(function () {
        var seg = A.el("div", { class: "ax-marquee-seg" });
        items.forEach(function (it) { seg.appendChild(A.el("span", { class: "ax-marquee-item", text: it })); });
        inner.appendChild(seg);
      });
      wrap.appendChild(inner);
      host.appendChild(wrap);
      return wrap;
    },
    shimmer: function (host, count) {
      for (var i = 0; i < (count || 3); i++) host.appendChild(A.el("div", { class: "ax-skel", style: { width: (60 + i * 12) + "%" } }));
    },
    confetti: function (n) {
      var host = A.el("div", { class: "ax-confetti", "aria-hidden": "true" });
      var colors = A.palette();
      for (var i = 0; i < (n || 90); i++) {
        host.appendChild(A.el("i", {
          style: {
            left: (Math.random() * 100) + "%", background: colors[i % colors.length],
            animationDelay: (Math.random() * .8) + "s", animationDuration: (1.6 + Math.random() * 1.4) + "s",
            transform: "rotate(" + (Math.random() * 360) + "deg)"
          }
        }));
      }
      document.body.appendChild(host);
      setTimeout(function () { host.remove(); }, 3400);
    },
    ripple: function (btn) {
      A.on(btn, "pointerdown", function (e) {
        var r = btn.getBoundingClientRect();
        var s = A.el("span", { class: "ax-ripple", style: { left: (e.clientX - r.left) + "px", top: (e.clientY - r.top) + "px" } });
        btn.appendChild(s);
        setTimeout(function () { s.remove(); }, 620);
      });
    }
  };
  A.motion = M;
  A.register({
    id: "motion",
    title: "الحركة والتفاعل",
    mount: function () {
      A.guard("motion:boot", function () {
        M.scrollProgress(); M.parallax(); M.tilt(); M.magnetic(); M.cursor();
        A.qa(".ax-btn, .ax-cta").forEach(M.ripple);
        A.qa("[data-typed]").forEach(function (n) { M.typedText(n, String(n.getAttribute("data-typed")).split("|"), 30); });
      });
      A.bus.on("route", function () { A.guard("motion:route", function () { M.parallax(); M.tilt(document); M.magnetic(document); }); });
    }
  });
})();
