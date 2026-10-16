/*@meta {"id":"support","title":"مركز الدعم","domain":"support","tags":["tickets","helpdesk","sla","knowledge"],"order":45,"needs":["kernel","search"]}*/
/* Help desk: ticket board with SLA timers, priorities, agent assignment, ticket
   conversation, knowledge-base search over the project's own articles, and a
   new-ticket form with real validation. */
(function () {
  var A = window.APEX;
  function cfgOf(host) {
    try { return JSON.parse(host.getAttribute("data-cfg") || "{}") || {}; }
    catch (e) { return {}; }
  }
  var SLA = { "عاجلة": 30, "عالية": 120, "عادية": 480, "منخفضة": 2880 };
  function minutesBetween(a, b) { return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)); }
  A.register({
    id: "support",
    title: "الدعم",
    mount: function (host, ctx) {
      var cfg = cfgOf(host);
      var all = (ctx.data.tickets || []).slice();
      var articles = (ctx.data.posts || []).slice(0, 12);
      var mode = cfg.host === "knowledge" ? "kb" : "desk";
      var ui = A.el("div", { class: "ax-support" });
      host.appendChild(ui);

      if (mode === "kb") {
        var kbCard = A.el("div", { class: "ax-card" });
        ui.appendChild(kbCard);
        kbCard.appendChild(A.el("h3", { text: "قاعدة المعرفة" }));
        var searchInput = A.el("input", { class: "ax-input", type: "search", placeholder: "ابحث في المقالات والحلول…", "aria-label": "بحث في الدليل" });
        kbCard.appendChild(searchInput);
        var results = A.el("div", { class: "ax-grid ax-grid-2" });
        kbCard.appendChild(results);
        function kbPaint() {
          results.innerHTML = "";
          var q = searchInput.value.trim().toLowerCase();
          var list = articles.filter(function (a) { return !q || (a.title + " " + (a.excerpt || "")).toLowerCase().indexOf(q) >= 0; });
          if (!list.length) {
            var fallback = [["كيفاش نبدل كلمة السر؟", "من الإعدادات ← الأمان ← تبديل كلمة السر، وتوصلك رسالة تأكيد."], ["كيفاش نستورد البيانات؟", "صيغة CSV أو JSON، أو عدّل js/02-data.js مباشرة."], ["واش على النسخ الاحتياطي؟", "زر «تصدير كل البيانات» ينزّل ملف JSON فيه كل شيء."], ["كيفاش نضيف مستخدم؟", "من صفحة المستخدمين، وحدّد الدور والصلاحيات."]];
            fallback.forEach(function (f) {
              results.appendChild(A.el("article", { class: "ax-card ax-card-hover" }, [A.el("b", { text: f[0] }), A.el("p", { class: "ax-dim", text: f[1] })]));
            });
            return;
          }
          list.forEach(function (a) {
            results.appendChild(A.el("article", { class: "ax-card ax-card-hover" }, [
              A.el("b", { text: a.title }),
              A.el("p", { class: "ax-dim", text: a.excerpt || "" }),
              A.el("small", { class: "ax-dim", text: "قراءة " + A.fmt.int(a.minutes || 4) + " دقائق · " + A.fmt.date(a.date, "short") })
            ]));
          });
        }
        A.on(searchInput, "input", A.debounce(kbPaint, 160));
        kbPaint();
        return;
      }

      if (!all.length) {
        ui.appendChild(A.el("div", { class: "ax-empty", text: "ما كاينش تذاكر — أضف مصفوفة tickets في البيانات." }));
        return;
      }

      var state = { q: "", status: "", priority: "", agent: "", page: 1, size: cfg.size || 8 };
      var agents = Array.from(new Set(all.map(function (t) { return t.agent; }).filter(Boolean))).slice(0, 10);

      function filtered() {
        var out = all.slice();
        if (state.q) {
          var n = state.q.toLowerCase();
          out = out.filter(function (t) { return (String(t.ticket) + " " + String(t.subject) + " " + String(t.customer)).toLowerCase().indexOf(n) >= 0; });
        }
        if (state.status) out = out.filter(function (t) { return t.status === state.status; });
        if (state.priority) out = out.filter(function (t) { return t.priority === state.priority; });
        if (state.agent) out = out.filter(function (t) { return t.agent === state.agent; });
        return out.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      }
      function detail(t) {
        var body = A.el("div", {});
        body.appendChild(A.el("div", { class: "ax-row" }, [
          A.el("span", { class: "ax-badge ax-badge-" + (/عاجلة/.test(t.priority) ? "err" : /عالية/.test(t.priority) ? "warn" : "") , text: t.priority }),
          A.el("span", { class: "ax-badge", text: t.status }),
          A.el("span", { class: "ax-dim", text: "فتحها " + t.customer + " عبر " + t.channel })
        ]));
        body.appendChild(A.el("p", { text: t.subject }));
        body.appendChild(A.el("div", { class: "ax-kv" }, [A.el("span", { class: "ax-dim", text: "الموظف المسؤول" }), A.el("b", { text: t.agent })]));
        body.appendChild(A.el("div", { class: "ax-kv" }, [A.el("span", { class: "ax-dim", text: "أُنشئت" }), A.el("b", { text: A.fmt.date(t.createdAt) + " " + A.fmt.ago(t.createdAt) })]));
        if (t.firstReply) body.appendChild(A.el("div", { class: "ax-kv" }, [A.el("span", { class: "ax-dim", text: "أول رد" }), A.el("b", { text: A.fmt.dur(t.firstReply * 60000) })]));
        if (t.resolution) body.appendChild(A.el("div", { class: "ax-kv" }, [A.el("span", { class: "ax-dim", text: "زمن الحل" }), A.el("b", { text: A.fmt.dur(t.resolution * 60000) })]));
        var thread = A.el("div", { class: "ax-thread" });
        var rng = A.rng(Number(String(t.ticket).replace(/\D/g, "")) || 3);
        for (var i = 0; i < Math.min(5, Math.max(2, Number(t.messages) || 3)); i++) {
          var mine = i % 2 === 1;
          thread.appendChild(A.el("div", { class: "ax-msg" + (mine ? " is-me" : "") }, [
            A.el("div", { text: mine ? rng.pick(["رانا نشوفو المشكل، عطيني رقم الطلب.", "تم التحويل للقسم التقني.", "المشكل تحل، جرّب دروك."]) : rng.pick(["سلام، عندي مشكل من أمس.", "ما زال ما خدمش.", "شكرًا، خدم دروك."]) }),
            A.el("small", { class: "ax-msg-time", text: A.fmt.ago(new Date(new Date(t.createdAt).getTime() + i * 3.6e6)) })
          ]));
          thread.appendChild(A.el("div", { class: "ax-thread-gap" }));
        }
        body.appendChild(thread);
        var reply = A.el("textarea", { class: "ax-input", rows: 3, placeholder: "اكتب ردك…", "aria-label": "رد" });
        body.appendChild(reply);
        A.modal({
          title: "تذكرة " + t.ticket,
          body: body,
          wide: true,
          actions: [
            { label: "إغلاق", kind: "ghost" },
            { label: "أرسل الرد", kind: "primary", onClick: function () {
              if (!reply.value.trim()) { A.toast("اكتب الرد أولًا", "warn"); return; }
              A.toast("صُدِّر الرد وأُرسل للموظف", "ok");
            } }
          ]
        });
      }

      function render() {
        ui.innerHTML = "";
        var open = all.filter(function (t) { return /مفتوح|معالجة/.test(String(t.status)); });
        var kpis = A.el("div", { class: "ax-kpis" });
        [["تذاكر مفتوحة", open.length, "bell", open.length > 12 ? "warn" : "info"],
         ["تجاوزت SLA", open.filter(function (t) { return minutesBetween(t.createdAt, new Date()) > (SLA[t.priority] || 480); }).length, "clock", "err"],
         ["محلولة", all.filter(function (t) { return /محلول|مغلق/.test(String(t.status)); }).length, "check", "ok"],
         ["متوسط الرضا", A.fmt.num(all.filter(function (t) { return t.satisfaction; }).reduce(function (s, t) { return s + Number(t.satisfaction); }, 0) / Math.max(1, all.filter(function (t) { return t.satisfaction; }).length), 1) + "/5", "star", "ok"]]
          .forEach(function (k) {
            kpis.appendChild(A.el("div", { class: "ax-kpi ax-kpi-" + k[3] }, [
              A.el("div", { class: "ax-kpi-top", html: A.icon(k[2], 16) + "<span>" + k[0] + "</span>" }),
              A.el("strong", { class: "ax-kpi-v", text: typeof k[1] === "number" ? A.fmt.int(k[1]) : k[1] })
            ]));
          });
        ui.appendChild(kpis);

        var bar = A.el("div", { class: "ax-shop-bar" });
        var search = A.el("input", { class: "ax-input", type: "search", placeholder: "ابحث في التذاكر…", "aria-label": "بحث" });
        A.on(search, "input", A.debounce(function () { state.q = search.value; paint(); }, 160));
        bar.appendChild(search);
        [["status", ["مفتوح", "قيد المعالجة", "بانتظار العميل", "محلول", "مغلق"], "كل الحالات"], ["priority", ["عاجلة", "عالية", "عادية", "منخفضة"], "كل الأولويات"]].forEach(function (pair) {
          var sel = A.el("select", { class: "ax-select", "aria-label": pair[2] });
          sel.appendChild(A.el("option", { value: "", text: pair[2] }));
          pair[1].forEach(function (v) { sel.appendChild(A.el("option", { value: v, text: v })); });
          A.on(sel, "change", function () { state[pair[0]] = sel.value; paint(); });
          bar.appendChild(sel);
        });
        var agentSel = A.el("select", { class: "ax-select", "aria-label": "الموظف" });
        agentSel.appendChild(A.el("option", { value: "", text: "كل الموظفين" }));
        agents.forEach(function (a) { agentSel.appendChild(A.el("option", { value: a, text: a })); });
        A.on(agentSel, "change", function () { state.agent = agentSel.value; paint(); });
        bar.appendChild(agentSel);
        bar.appendChild(A.el("button", { type: "button", class: "ax-btn ax-btn-primary ax-mini", html: A.icon("plus", 15) + " تذكرة جديدة", onclick: function () {
          var form = A.form({
            fields: [
              { name: "subject", label: "الموضوع", required: true, rules: [["len", 6]] },
              { name: "priority", label: "الأولوية", type: "select", options: ["عاجلة", "عالية", "عادية", "منخفضة"], required: true },
              { name: "channel", label: "القناة", type: "select", options: ["دردشة", "بريد", "هاتف", "واتساب"], required: true },
              { name: "body", label: "اشرح المشكل", type: "textarea", required: true, rules: [["len", 12]] }
            ],
            submit: "أرسل التذكرة",
            onSubmit: function () { A.toast("فتحنا التذكرة — نجيبك في أقرب وقت", "ok"); A.motion.confetti(50); }
          });
          A.modal({ title: "تذكرة جديدة", body: form, wide: true, actions: [{ label: "إغلاق", kind: "ghost" }] });
        } }));
        ui.appendChild(bar);
        paint();
      }

      function paint() {
        var old = A.q(".ax-support-body", ui);
        if (old) old.remove();
        var list = filtered();
        var body = A.el("div", { class: "ax-support-body ax-kanban" });
        var lanes = ["مفتوح", "قيد المعالجة", "بانتظار العميل", "محلول"];
        lanes.forEach(function (lane) {
          var laneEl = A.el("div", { class: "ax-lane" });
          var items = list.filter(function (t) { return (lane === "محلول" ? /محلول|مغلق/.test(String(t.status)) : t.status === lane); });
          laneEl.appendChild(A.el("div", { class: "ax-lane-head", html: A.esc(lane) + "<span class='ax-badge'>" + A.fmt.int(items.length) + "</span>" }));
          items.slice(0, 6).forEach(function (t) {
            var late = minutesBetween(t.createdAt, new Date()) > (SLA[t.priority] || 480);
            var cardEl = A.el("article", { class: "ax-cardtask", tabindex: "0", role: "button" });
            cardEl.appendChild(A.el("div", { class: "ax-row-between" }, [A.el("b", { text: t.ticket }), A.el("span", { class: "ax-badge ax-badge-" + (/عاجلة/.test(t.priority) ? "err" : /عالية/.test(t.priority) ? "warn" : ""), text: t.priority })]));
            cardEl.appendChild(A.el("p", { text: t.subject }));
            cardEl.appendChild(A.el("small", { class: "ax-dim", text: t.agent + " · " + A.fmt.ago(t.createdAt) + (late ? " · ⚠ تجاوز SLA" : "") }));
            A.on(cardEl, "click", function () { detail(t); });
            laneEl.appendChild(cardEl);
          });
          if (!items.length) laneEl.appendChild(A.el("div", { class: "ax-empty ax-empty-sm", text: "لا شيء هنا" }));
          body.appendChild(laneEl);
        });
        ui.appendChild(body);
      }

      render();
    }
  });
})();
