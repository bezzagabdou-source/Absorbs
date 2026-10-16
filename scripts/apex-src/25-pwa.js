/*@meta {"id":"pwa","title":"تطبيق أوفلاين","domain":"core","tags":["pwa","offline","install","cache"],"order":45,"needs":["kernel"]}*/
/* Install prompt, offline/online live state, cache controls, storage estimate, update toast. */
(function () {
  var A = window.APEX;
  A.register({
    id: "pwa",
    title: "تطبيق أوفلاين",
    mount: function (host) {
      var promptEvent = null;
      var ui = A.el("div", { class: "ax-card ax-grid", style: { gap: "12px" } });
      host.appendChild(ui);
      function paint() {
        var online = navigator.onLine;
        ui.innerHTML = "";
        ui.appendChild(A.el("div", { class: "ax-grid-bar" }, [
          A.el("span", { class: "ax-pill " + (online ? "ax-pill-ok" : "ax-pill-err"), text: online ? "متصل بالإنترنت" : "بلا إنترنت — التطبيق يخدم" }),
          A.el("span", { class: "ax-spacer" }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", html: A.icon("download", 15) + " ثبّت التطبيق", onclick: install }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("layers", 15) + " حدّث الكاش", onclick: refresh }),
          A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("trash", 15) + " امسح الكاش", onclick: clear })
        ]));
        var grid = A.el("div", { class: "ax-four ax-grid" });
        [
          ["الوحدات المحمّلة", A.modules.length + " وحدة"],
          ["حجم البيانات المحلية", A.fmt.bytes(new Blob([JSON.stringify(localStorage)]).size)],
          ["دعم Service Worker", "serviceWorker" in navigator ? "مدعوم ✅" : "غير مدعوم"],
          ["آخر تحديث", A.fmt.time(new Date())]
        ].forEach(function (r) { grid.appendChild(A.el("div", { class: "ax-tile", html: "<strong>" + A.esc(r[1]) + "</strong><div class='ax-dim'>" + A.esc(r[0]) + "</div>" })); });
        ui.appendChild(grid);
        if (navigator.storage && navigator.storage.estimate) {
          navigator.storage.estimate().then(function (est) {
            var used = est.usage || 0, quota = est.quota || 1;
            ui.appendChild(A.el("div", { html: '<div class="ax-progressbar"><i style="width:' + ((used / quota) * 100).toFixed(1) + '%"></i></div><p class="ax-dim" style="font-size:12.5px">استعملت ' + A.fmt.bytes(used) + " من " + A.fmt.bytes(quota) + "</p>" }));
          }).catch(function () { /* unsupported */ });
        }
      }
      function install() {
        if (promptEvent) { promptEvent.prompt(); promptEvent.userChoice.then(function (r) { A.toast(r.outcome === "accepted" ? "يتثبّت التطبيق 🎉" : "تقدر تجربه من جديد", r.outcome === "accepted" ? "ok" : "info"); }); return; }
        A.toast("من قائمة المتصفح: «إضافة إلى الشاشة الرئيسية»", "info", 3200);
      }
      function refresh() {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.update(); }); A.toast("فحصنا التحديثات", "ok"); });
        } else A.toast("هذا المتصفح ما يدعمش الكاش", "warn");
      }
      function clear() {
        A.confirm("نمسح الكاش المحلي؟ البيانات المحفوظة غادي تمسح.").then(function (ok) {
          if (!ok) return;
          if (window.caches) caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); });
          A.toast("تمسح الكاش", "ok");
          paint();
        });
      }
      A.on(window, "beforeinstallprompt", function (e) { e.preventDefault(); promptEvent = e; });
      A.on(window, "online", function () { paint(); A.toast("رجع الإنترنت ✅", "ok", 2000); });
      A.on(window, "offline", function () { paint(); A.toast("بلا إنترنت — كل شيء يخدم محليًا", "warn", 2600); });
      if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () { /* file:// */ });
      paint();
    }
  });
})();
