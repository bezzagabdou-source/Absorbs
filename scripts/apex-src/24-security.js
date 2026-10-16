/*@meta {"id":"security","title":"الأمان والحسابات","domain":"core","tags":["security","auth","password","sessions","audit"],"order":44,"needs":["kernel"]}*/
/* Local account layer: signup/login (salted SHA-256), password strength, sessions list, audit log, roles. */
(function () {
  var A = window.APEX;
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function randHex(n) { var a = new Uint8Array(n); (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.floor(Math.random() * 256); }); return hex(a.buffer); }
  function djb2(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }
  function hash(pw, salt) {
    var text = salt + "::" + pw + "::apex18";
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      try {
        return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (b) { return hex(b); });
      } catch (e) { /* fall through */ }
    }
    return Promise.resolve("dj2$" + djb2(text) + djb2(salt + djb2(pw)));
  }
  var STRENGTH_LABEL = ["ضعيفة جدًا", "ضعيفة", "مقبولة", "قوية", "قوية جدًا"];
  A.passwordScore = function (pw) {
    var n = 0;
    if (pw.length >= 8) n++;
    if (pw.length >= 12) n++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++;
    if (/\d/.test(pw)) n++;
    if (/[^A-Za-z0-9]/.test(pw)) n++;
    return Math.min(4, n);
  };
  A.register({
    id: "security",
    title: "الأمان",
    mount: function (host, ctx) {
      var store = A.store("auth", { users: [], sessions: [], audit: [], current: null });
      var ui = A.el("div", { class: "ax-grid", style: { gap: "16px" } });
      host.appendChild(ui);
      function log(what) {
        store.set(function (s) { var n = A.deep(s); n.audit = [{ at: new Date().toISOString(), what: what, agent: navigator.userAgent.slice(0, 60) }].concat(n.audit).slice(0, 40); return n; });
      }
      function paint() {
        ui.innerHTML = "";
        var s = store.get();
        var kpis = A.el("div", { class: "ax-kpis" });
        [
          { k: "حسابات مسجّلة", v: String(s.users.length), i: "users", tone: "info" },
          { k: "الجلسة الحالية", v: s.current ? s.current.email : "بلا جلسة", i: "shield", tone: s.current ? "ok" : "warn" },
          { k: "أحداث مسجّلة", v: String(s.audit.length), i: "book", tone: "info" },
          { k: "تشفير", v: "SHA-256 + ملح", i: "lock", tone: "ok" }
        ].forEach(function (c) { kpis.appendChild(A.el("div", { class: "ax-kpi ax-kpi-" + c.tone + " ax-in", html: '<div class="ax-kpi-top">' + A.icon(c.i, 16) + "<span>" + c.k + "</span></div><strong class='ax-kpi-v'>" + A.esc(c.v) + "</strong>" })); });
        ui.appendChild(kpis);

        var two = A.el("div", { class: "ax-two" });
        /* account panel */
        var acc = A.el("div", { class: "ax-card" });
        acc.appendChild(A.el("h3", { text: s.current ? "حسابك" : "إنشاء حساب / دخول" }));
        if (s.current) {
          acc.appendChild(A.el("div", { class: "ax-tile", html: "<strong>" + A.esc(s.current.email) + "</strong><div class='ax-dim'>" + A.esc(s.current.role) + " · انشأ في " + A.fmt.date(s.current.at, "long") + "</div>" }));
          acc.appendChild(A.el("div", { class: "ax-grid-bar", style: { marginTop: "12px" } }, [
            A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", text: "تسجيل خروج", onclick: function () {
              store.set(function (st) { var n = A.deep(st); n.current = null; return n; });
              log("تسجيل خروج"); paint(); A.toast("خرجت", "ok");
            } }),
            A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", text: "تغيير كلمة السر", onclick: changePw })
          ]));
          acc.appendChild(A.el("div", { class: "ax-timeline", style: { marginTop: "14px" }, html: s.audit.slice(0, 8).map(function (a) { return '<div class="ax-timeline-item"><strong>' + A.esc(a.what) + '</strong><div class="ax-dim">' + A.fmt.time(a.at) + " · " + A.fmt.ago(a.at) + "</div></div>"; }).join("") }));
        } else {
          var f = A.form({
            fields: [
              { name: "email", label: "البريد الإلكتروني", type: "email", validate: "required|email" },
              { name: "password", label: "كلمة السر", type: "password", validate: "required|len:8" },
              { name: "role", label: "الدور", type: "select", options: [{ value: "مدير", label: "مدير النظام" }, { value: "موظف", label: "موظف" }, { value: "محاسب", label: "محاسب" }, { value: "مشاهد", label: "مشاهد فقط" }], value: "مدير" }
            ],
            submit: "تسجيل الدخول أو إنشاء الحساب",
            onSubmit: function (v) {
              var existing = store.get().users.filter(function (u) { return u.email === v.email; })[0];
              if (existing) {
                hash(v.password, existing.salt).then(function (h) {
                  if (h !== existing.hash) { A.toast("كلمة السر غير صحيحة", "err"); return; }
                  store.set(function (s2) { var n = A.deep(s2); n.current = { email: v.email, role: existing.role, at: existing.at }; n.sessions = [{ at: new Date().toISOString(), ua: navigator.userAgent.slice(0, 40) }].concat(n.sessions).slice(0, 8); return n; });
                  log("دخول ناجح: " + v.email); paint(); A.toast("مرحبا " + v.email, "ok");
                });
              } else {
                var salt = randHex(8);
                hash(v.password, salt).then(function (h) {
                  store.set(function (s2) {
                    var n = A.deep(s2);
                    n.users.push({ email: v.email, salt: salt, hash: h, role: v.role, at: new Date().toISOString() });
                    n.current = { email: v.email, role: v.role, at: new Date().toISOString() };
                    return n;
                  });
                  log("حساب جديد: " + v.email); paint(); A.motion.confetti(50); A.toast("أُنشئ الحساب", "ok");
                });
              }
            }
          });
          acc.appendChild(f.el);
          var meter = A.el("div", { html: '<div class="ax-progressbar" data-strength><i style="width:0%"></i></div><p class="ax-dim" style="font-size:12.5px" data-strength-label></p>' });
          f.el.appendChild(meter);
          var pwInput = f.fields.password;
          A.on(pwInput, "input", function () {
            var sc = A.passwordScore(pwInput.value) + 1;
            A.q("[data-strength] i", meter).style.width = (sc / 5) * 100 + "%";
            A.q("[data-strength-label]", meter).textContent = "قوة كلمة السر: " + STRENGTH_LABEL[Math.min(4, sc - 1)] + (sc <= 2 ? " — زيد أرقام ورموز" : "");
          });
        }
        two.appendChild(acc);

        var side = A.el("div", { class: "ax-card" });
        side.appendChild(A.el("h3", { text: "الجلسات والأجهزة" }));
        var sessions = s.sessions.length ? s.sessions : [{ at: new Date().toISOString(), ua: "هذا الجهاز · " + navigator.userAgent.split(")")[0].slice(0, 46) + ")" }];
        sessions.forEach(function (se) {
          side.appendChild(A.el("div", { class: "ax-tile", style: { marginBottom: "8px" }, html: "<strong>" + A.esc(se.ua) + "</strong><div class='ax-dim'>" + A.fmt.date(se.at, "long") + " · " + A.fmt.time(se.at) + "</div>" }));
        });
        side.appendChild(A.el("h3", { text: "نصائح حماية", style: { marginTop: "16px" } }));
        side.appendChild(A.el("ul", { html: ["كلمة سر 12 حرفًا مع رموز", "لا تعيد نفس كلمة السر بين الحسابات", "سجّل خروج من الأجهزة المشتركة", "راقب سجل الأحداث هذا شهريًا"].map(function (x) { return "<li>" + x + "</li>"; }).join("") }));
        side.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-ghost ax-mini", html: A.icon("download", 15) + " تصدير سجل التدقيق", onclick: function () {
          A.download("audit-log.json", JSON.stringify(store.get().audit, null, 2), "application/json");
        } }));
        two.appendChild(side);
        ui.appendChild(two);
      }
      function changePw() {
        var f = A.form({
          fields: [
            { name: "old", label: "كلمة السر الحالية", type: "password", validate: "required" },
            { name: "next", label: "كلمة السر الجديدة", type: "password", validate: "required|len:8" },
            { name: "again", label: "أكّد كلمة السر", type: "password", validate: "required" }
          ],
          submit: "تغيير",
          onSubmit: function (v) {
            if (v.next !== v.again) { A.toast("الكلمتان ما يمشيوش كيف كيف", "err"); return; }
            var s = store.get();
            var me = s.users.filter(function (u) { return u.email === s.current.email; })[0];
            hash(v.old, me.salt).then(function (h) {
              if (h !== me.hash) { A.toast("كلمة السر الحالية غلط", "err"); return; }
              var salt = randHex(8);
              hash(v.next, salt).then(function (nh) {
                store.set(function (st) {
                  var n = A.deep(st);
                  n.users = n.users.map(function (u) { return u.email === me.email ? Object.assign({}, u, { salt: salt, hash: nh }) : u; });
                  return n;
                });
                log("تغيير كلمة السر: " + me.email);
                m.close(); paint(); A.toast("تبدلت كلمة السر 🔐", "ok");
              });
            });
          }
        });
        var m = A.modal({ title: "تغيير كلمة السر", html: f.el, actions: [{ label: "إغلاق", kind: "ghost" }] });
      }
      paint();
      store.sub(A.debounce(paint, 120));
    }
  });
})();
