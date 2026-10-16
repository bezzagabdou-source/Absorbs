/*@meta {"id":"chat","title":"المحادثات","domain":"communication","tags":["chat","messages","team","support"],"order":43,"needs":["kernel"]}*/
/* Team/support messenger: threads, unread badges, quick replies, attachments names, search, export. */
(function () {
  var A = window.APEX;
  A.register({
    id: "chat",
    title: "المحادثات",
    mount: function (host, ctx) {
      var people = (ctx.data.staff || ctx.data.contacts || []).slice(0, 18);
      if (!people.length) people = [{ id: "me", name: "فريق الدعم", role: "خدمة العملاء" }];
      var rng = A.rng((ctx.plan && ctx.plan.seed) || 3);
      var SEED_MSGS = ["سلام، كيفاش نقدر نعاونك؟", "شكرًا على الرد السريع 🙏", "واش من وقت متوفر للتوصيل؟", "عندي مشكل في الفاتورة", "نحتاج عرض سعر لـ 50 وحدة", "المنتج وصل وكلش مليح ✅", "نقدر نبدل الطلبية؟", "شكرًا، خدمة ممتازة!"];
      var store = A.store("chat", {
        threads: people.map(function (p) {
          return {
            id: "th-" + p.id,
            name: p.name,
            role: p.role || "زميل",
            unread: rng.int(0, 3),
            msgs: Array.from({ length: rng.int(2, 6) }, function (_, i) {
              return { id: A.uid("m"), from: i % 2 === 0 ? "them" : "me", text: rng.pick(SEED_MSGS), at: new Date(Date.now() - rng.int(1, 900) * 60000).toISOString() };
            })
          };
        }),
        active: null,
        quick: ["تم", "غدوة نرد عليك", "شكرًا 🌹", "أرسل التفاصيل", "موافق", "نحتاج وقت"]
      });
      var ui = A.el("div", { class: "ax-chat-ui", style: { display: "grid", gridTemplateColumns: "minmax(200px,260px) 1fr", gap: "14px", alignItems: "start" } });
      host.appendChild(ui);
      if (!store.get().active) store.set({ active: store.get().threads[0].id });

      function t(id) { return store.get().threads.filter(function (x) { return x.id === id; })[0]; }
      function push(text) {
        var th = t(store.get().active);
        if (!th || !text.trim()) return;
        store.set(function (s) {
          var n = A.deep(s);
          n.threads = n.threads.map(function (x) {
            if (x.id !== th.id) return x;
            return Object.assign({}, x, { unread: 0, msgs: x.msgs.concat([{ id: A.uid("m"), from: "me", text: text.trim(), at: new Date().toISOString() }]) });
          });
          return n;
        }, { kind: "send" });
        render();
        var box = A.q("[data-chat-scroll]", ui);
        if (box) box.scrollTop = box.scrollHeight;
        setTimeout(function () {
          if (A.rng().chance(0.35)) autoReply();
        }, 900);
      }
      function autoReply() {
        var th = t(store.get().active);
        if (!th) return;
        var reply = A.rng().pick(["مليح، نشوفلك ونرد عليك.", "وصلت المعلومة، شكرًا 🙏", "نمشي على هذا الاتفاق.", "نحتاج نأكد مع المدير ونعيطلك."]);
        store.set(function (s) {
          var n = A.deep(s);
          n.threads = n.threads.map(function (x) { return x.id === th.id ? Object.assign({}, x, { msgs: x.msgs.concat([{ id: A.uid("m"), from: "them", text: reply, at: new Date().toISOString() }]) }) : x; });
          return n;
        }, { kind: "reply" });
        render();
        A.toast(th.name + ": " + reply, "info", 2600);
      }
      function render() {
        ui.innerHTML = "";
        var s = store.get();
        var activeId = s.active;

        /* thread list */
        var list = A.el("aside", { class: "ax-card", style: { padding: "12px", maxHeight: "70vh", overflowY: "auto" } });
        list.appendChild(A.el("div", { class: "ax-shop-search", html: A.icon("search") + '<input class="ax-input" type="search" placeholder="بحث في المحادثات…" aria-label="بحث">' }));
        var items = A.el("div", { style: { marginTop: "10px" }, "data-thread-list": "1" });
        s.threads.forEach(function (th) {
          var last = th.msgs[th.msgs.length - 1] || { text: "…", at: new Date().toISOString() };
          var row = A.el("button", {
            type: "button", class: "ax-result" + (th.id === activeId ? " is-on" : ""),
            style: { width: "100%", textAlign: "start", borderColor: th.id === activeId ? "var(--ax-brand)" : "", display: "block" },
            html: '<div style="display:flex;gap:8px;align-items:center"><strong style="flex:1">' + A.esc(th.name) + "</strong>" +
              (th.unread ? '<span class="ax-badge">' + th.unread + "</span>" : "") + "</div>" +
              '<div class="ax-dim" style="font-size:12.5px">' + A.esc(String(last.text).slice(0, 44)) + "</div>" +
              '<div class="ax-dim" style="font-size:11px">' + A.fmt.ago(last.at) + "</div>",
            onclick: function () {
              store.set(function (st) { var n = A.deep(st); n.active = th.id; n.threads = n.threads.map(function (x) { return x.id === th.id ? Object.assign({}, x, { unread: 0 }) : x; }); return n; });
              render();
            }
          });
          items.appendChild(row);
        });
        list.appendChild(items);
        ui.appendChild(list);

        /* conversation */
        var th2 = t(activeId) || s.threads[0];
        var convo = A.el("section", { class: "ax-card", style: { display: "flex", flexDirection: "column", gap: "10px", minHeight: "420px" } });
        convo.appendChild(A.el("div", { class: "ax-grid-bar" }, [
          A.el("div", { class: "ax-call-avatar", style: { width: "40px", height: "40px", fontSize: "16px" }, text: th2.name.slice(0, 1) }),
          A.el("div", {}, [A.el("strong", { text: th2.name }), A.el("div", { class: "ax-dim", style: { fontSize: "12px" }, text: th2.role + " · متصل الآن" })]),
          A.el("span", { class: "ax-spacer" }),
          A.el("button", { type: "button", class: "ax-icon-btn", title: "اتصال صوتي", "aria-label": "اتصال", html: A.icon("phone", 15), onclick: function () { A.toast("نفتح لك مكالمة " + th2.name + "…", "info"); } }),
          A.el("button", { type: "button", class: "ax-icon-btn", title: "تصدير المحادثة", "aria-label": "تصدير", html: A.icon("download", 15), onclick: function () {
            var text = th2.name + "\n" + th2.msgs.map(function (m) { return "[" + A.fmt.time(m.at) + "] " + (m.from === "me" ? "أنا" : th2.name) + ": " + m.text; }).join("\n");
            A.download("chat-" + th2.id + ".txt", text);
          } })
        ]));
        var scroll = A.el("div", { class: "scroll-y", style: { flex: "1", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", padding: "4px" }, "data-chat-scroll": "1" });
        var day = "";
        th2.msgs.forEach(function (m) {
          var d = A.fmt.date(m.at, "long");
          if (d !== day) { day = d; scroll.appendChild(A.el("div", { class: "ax-dim ax-center", style: { fontSize: "11.5px" }, text: d })); }
          scroll.appendChild(A.el("div", {
            style: { alignSelf: m.from === "me" ? "flex-end" : "flex-start", maxWidth: "78%" },
            html: '<div class="ax-card" style="padding:9px 13px;border-radius:16px;' + (m.from === "me" ? "background:linear-gradient(135deg,var(--ax-brand-1),var(--ax-brand-3));color:var(--ax-brand-ink)" : "") + '">' +
              A.esc(m.text) + '</div><div class="ax-dim" style="font-size:10.5px;text-align:' + (m.from === "me" ? "end" : "start") + '">' + A.fmt.time(m.at) + "</div>"
          }));
        });
        convo.appendChild(scroll);
        var quick = A.el("div", { class: "ax-chips" });
        s.quick.forEach(function (q) { quick.appendChild(A.el("button", { type: "button", class: "ax-chip ax-chip-btn", text: q, onclick: function () { push(q); } })); });
        convo.appendChild(quick);
        var inputRow = A.el("div", { class: "ax-shop-search", style: { marginTop: "4px" } });
        var input = A.el("input", { class: "ax-input", placeholder: "اكتب رسالة… (Enter للإرسال)", "aria-label": "رسالة" });
        inputRow.appendChild(input);
        inputRow.appendChild(A.el("button", { type: "button", class: "ax-icon-btn", "aria-label": "إرسال", html: A.icon("play", 15), onclick: function () { push(input.value); input.value = ""; } }));
        A.on(input, "keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); push(input.value); input.value = ""; } });
        inputRow.appendChild(A.el("button", { type: "button", class: "ax-icon-btn", "aria-label": "إرفاق", html: A.icon("upload", 15), onclick: function () { A.toast("اسم الملف يُرفق كنص (بلا سيرفر)", "info"); } }));
        convo.appendChild(inputRow);
        ui.appendChild(convo);
        scroll.scrollTop = scroll.scrollHeight;
      }
      render();
      store.sub(A.debounce(render, 90));
      A.bus.on("route", function () { A.guard("chat:route", render); });
    }
  });
})();
