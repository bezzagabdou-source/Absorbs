/* FT AI — اللوحة */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const api = async (path, { method = "GET", body } = {}) => {
    const res = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    let data = {};
    try { data = await res.json(); } catch { data = { ok: false }; }
    if (res.status === 401 && !path.includes("/login")) showLogin();
    return { ...data, status: res.status };
  };

  let state = { overview: null, tab: "overview", attachments: [], busy: false };

  /* ── توست ── */
  let toastTimer = null;
  function toast(msg, kind = "") {
    const el = $("#toast");
    el.textContent = msg;
    el.className = `toast ${kind}`;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3600);
  }

  /* ── الدخول ── */
  function showLogin() {
    $("#app").hidden = true;
    $("#login").hidden = false;
  }
  function showApp() {
    $("#login").hidden = true;
    $("#app").hidden = false;
    loadAll();
  }

  $("#pw-eye")?.addEventListener("click", () => {
    const i = $("#pw");
    i.type = i.type === "password" ? "text" : "password";
  });

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#login-btn");
    const msg = $("#login-msg");
    btn.disabled = true;
    btn.textContent = "…";
    msg.className = "msg";
    msg.textContent = "";
    const out = await api("/api/login", { method: "POST", body: { password: $("#pw").value } });
    btn.disabled = false;
    btn.textContent = "دخول";
    if (out.ok) { msg.className = "msg ok"; msg.textContent = "مرحبا بيك ⚡"; showApp(); }
    else msg.textContent = out.error || "ما قدرتش ندخل";
  });

  $("#logout").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    showLogin();
  });

  /* ── التنقّل ── */
  const TITLES = { overview: "نظرة عامة", ai: "FT AI", users: "الأعضاء", refs: "الإحالات", quiz: "الأسئلة", media: "الصور", settings: "الإعدادات", security: "الأمان" };
  function tab(name) {
    state.tab = name;
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    $$(".tab").forEach((t) => (t.hidden = t.id !== `tab-${name}`));
    $("#tab-title").textContent = TITLES[name] ?? "FT AI";
    $("#side")?.classList.remove("open");
    $(".side")?.classList.remove("open");
    if (name === "users") loadUsers();
    if (name === "refs") loadRefs();
    if (name === "quiz") loadQuestions();
    if (name === "media") loadMedia();
    if (name === "settings") loadSettings();
    if (name === "security") loadSecurity();
  }
  $$(".nav-item").forEach((b) => b.addEventListener("click", () => tab(b.dataset.tab)));
  $("#menu")?.addEventListener("click", () => $(".side")?.classList.toggle("open"));

  /* ── نظرة عامة ── */
  async function loadAll() {
    const o = await api("/api/overview");
    if (!o.ok) return;
    state.overview = o;
    $("#storage-badge").textContent = o.security.storage === "redis" ? "Redis ✅" : "ذاكرة ⚠️";
    $("#bot-pill").textContent = `${o.bot.name} ${o.bot.tokenSet ? "· متصل" : "· بلا توكن (تجربة)"}`;
    const s = o.stats;
    $("#stats-grid").innerHTML = [
      ["👥", s.users, "أعضاء", ""],
      ["🆕", s.new_today, "اليوم", ""],
      ["⚡", s.points_total, "مجموع النقاط", "gold"],
      ["🔗", s.refs_confirmed, "إحالات مؤكّدة", ""],
      ["⏳", s.refs_pending, "معلّقة", ""],
      ["🚩", s.refs_flagged, "مشبوهة", ""],
      ["🎯", s.questions, "أسئلة", ""],
      ["🛡", o.protection.level, "الحماية", "gold"],
    ].map(([ic, v, l, cls]) => `<div class="st ${cls}"><b>${v}</b><span>${ic} ${l}</span></div>`).join("");

    $("#actions").innerHTML = (o.actions ?? []).length
      ? o.actions.map((a) => `<li><b>${esc(a.kind)}</b><span>${esc(a.detail ?? "")}</span><span class="tiny muted">${time(a.at)}</span></li>`).join("")
      : '<li class="muted">ما كاينش نشاط بعد</li>';
    $("#top5").innerHTML = (o.top ?? []).map((u) => `<li>${esc(u.name)} — <b>${u.points}</b> نقطة</li>`).join("") || '<li class="muted">—</li>';
    renderTokenState(o);
    $("#ai-status").textContent = `مزوّدون: OpenRouter ${o.ai.providers.openrouter} · Grok ${o.ai.providers.grok} · النموذج ${o.ai.model}`;
  }
  $("#refresh").addEventListener("click", () => { loadAll(); toast("تحدّث"); });

  /* ── FT AI ── */
  const log = $("#chat-log");
  function bubble(kind, text, meta = {}) {
    const el = document.createElement("div");
    el.className = `bubble ${kind}`;
    el.textContent = text;
    if (meta.tools?.length) {
      const wrap = document.createElement("div");
      wrap.className = "tools";
      for (const t of meta.tools) {
        const tag = document.createElement("span");
        tag.className = `tool-tag ${t.ok === false ? "bad" : ""}`;
        tag.textContent = `${t.ok === false ? "⚠️" : "✅"} ${t.tool}`;
        wrap.appendChild(tag);
      }
      el.appendChild(wrap);
    }
    for (const src of meta.images ?? []) {
      const img = document.createElement("img");
      img.src = src;
      el.appendChild(img);
    }
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  async function sendAI(message) {
    if (state.busy) return;
    const text = String(message ?? $("#ai-input").value).trim();
    const images = state.attachments.slice();
    if (!text && !images.length) return;
    state.busy = true;
    $("#send").disabled = true;
    if (!message) $("#ai-input").value = "";
    bubble("user", text || "📎 صورة", { images: images.map((i) => i.dataUrl) });
    state.attachments = [];
    renderAttachments();
    const typing = bubble("sys", "");
    typing.innerHTML = '<span class="typing"><i></i><i></i><i></i></span> شغّال…';
    try {
      const out = await api("/api/ai/chat", { method: "POST", body: { message: text, images } });
      typing.remove();
      if (out.ok) {
        bubble("ai", out.text || "تم", { tools: out.trace ?? [] });
        if (out.provider) bubble("sys", `المزوّد: ${out.provider}${out.model ? " · " + out.model : ""} · ${out.latency}ms`);
      } else {
        bubble("ai", out.error || "وقعت مشكلة");
      }
    } catch (e) {
      typing.remove();
      bubble("ai", "خطأ في الاتصال: " + e.message);
    } finally {
      state.busy = false;
      $("#send").disabled = false;
      loadAll();
    }
  }

  $("#composer").addEventListener("submit", (e) => { e.preventDefault(); sendAI(); });
  $("#ai-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); sendAI(); }
  });
  $("#ai-input").addEventListener("input", (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(150, e.target.scrollHeight) + "px";
  });
  $$("#ai-suggest .chip").forEach((c) => c.addEventListener("click", () => sendAI(c.textContent)));
  $("#ai-clear")?.addEventListener("click", async () => {
    await api("/api/ai/history", { method: "DELETE" });
    log.innerHTML = "";
    toast("تمسح السجل", "ok");
  });

  /* صور */
  function renderAttachments() {
    $("#attach-preview").innerHTML = state.attachments
      .map((a, i) => `<div class="attach"><img src="${a.dataUrl}"><button type="button" data-i="${i}">×</button></div>`)
      .join("");
    $$("#attach-preview button").forEach((b) =>
      b.addEventListener("click", () => { state.attachments.splice(+b.dataset.i, 1); renderAttachments(); })
    );
  }
  async function addFiles(files) {
    for (const f of [...files].slice(0, 4)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 8 * 1024 * 1024) { toast("الصورة كبيرة (حد 8 ميغا)", "bad"); continue; }
      const dataUrl = await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.readAsDataURL(f);
      });
      state.attachments.push({ dataUrl, name: f.name });
    }
    renderAttachments();
    if (state.attachments.length) toast(`${state.attachments.length} صورة مرفقة — اكتب طلبك وسيّر`, "ok");
  }
  $("#file").addEventListener("change", (e) => addFiles(e.target.files));
  const chatEl = $(".chat");
  ["dragenter", "dragover"].forEach((ev) => chatEl.addEventListener(ev, (e) => { e.preventDefault(); chatEl.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => chatEl.addEventListener(ev, (e) => { e.preventDefault(); chatEl.classList.remove("drag"); }));
  chatEl.addEventListener("drop", (e) => { if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });

  /* ── الأعضاء ── */
  async function loadUsers() {
    const q = encodeURIComponent($("#user-search").value.trim());
    const out = await api(`/api/users?q=${q}&filter=${$("#user-filter").value}&sort=${$("#user-sort").value}`);
    if (!out.ok) return;
    const tb = $("#users-table tbody");
    tb.innerHTML = out.users.map((u) => `
      <tr>
        <td><b>${esc(u.name)}</b>${u.username ? `<br><span class="tiny muted">@${esc(u.username)}</span>` : ""}<br><span class="tiny muted">${u.id}</span></td>
        <td>${u.points}</td>
        <td>${u.referrals}</td>
        <td>${u.quiz_correct}/${u.quiz_total}</td>
        <td>${u.risk >= 40 ? `<span class="tag bad">${u.risk}</span>` : u.risk}</td>
        <td>${u.blocked ? '<span class="tag bad">محظور</span>' : u.flagged ? '<span class="tag warn">مشبوه</span>' : '<span class="tag ok">نشط</span>'}</td>
        <td>
          <button class="btn sm" data-block="${u.id}" data-to="${u.blocked ? 0 : 1}">${u.blocked ? "فك" : "حظر"}</button>
          <button class="btn sm ghost" data-msg="${u.id}">رسالة</button>
        </td>
      </tr>`).join("") || '<tr><td colspan="7" class="muted">ما كاينش نتائج</td></tr>';

    $$("#users-table [data-block]").forEach((b) =>
      b.addEventListener("click", async () => {
        const out2 = await api("/api/users", { method: "PATCH", body: { id: b.dataset.block, blocked: b.dataset.to === "1" } });
        toast(out2.ok ? "تم" : "ما نجحش", out2.ok ? "ok" : "bad");
        loadUsers();
      })
    );
    $$("#users-table [data-msg]").forEach((b) =>
      b.addEventListener("click", () => {
        const txt = prompt("الرسالة للعضو:");
        if (!txt) return;
        api("/api/actions", { method: "POST", body: { job: "message", user_id: b.dataset.msg, text: txt } })
          .then((r) => toast(r.ok ? "وصلات ✅" : r.error || "ما وصلاتش", r.ok ? "ok" : "bad"));
      })
    );
  }
  ["#user-search", "#user-filter", "#user-sort"].forEach((s) => $(s).addEventListener("input", loadUsers));

  /* ── الإحالات ── */
  async function loadRefs() {
    const out = await api(`/api/referrals?status=${$("#ref-status").value}`);
    if (!out.ok) return;
    $("#ref-stats").innerHTML = [
      ["✅", out.totals.confirmed, "مؤكّدة"],
      ["⏳", out.totals.pending, "معلّقة"],
      ["🚩", out.totals.flagged, "مشبوهة"],
    ].map(([i, v, l]) => `<div class="st"><b>${v}</b><span>${i} ${l}</span></div>`).join("");

    $("#refs-table tbody").innerHTML = out.referrals.map((r) => `
      <tr>
        <td><b>${esc(r.new_user)}</b>${r.new_username ? `<br><span class="tiny muted">@${esc(r.new_username)}</span>` : ""}</td>
        <td><b>${esc(r.referrer)}</b>${r.referrer_username ? `<br><span class="tiny muted">@${esc(r.referrer_username)}</span>` : ""}</td>
        <td>${statusTag(r.status)}${r.same_ip ? ' <span class="tag warn">نفس IP</span>' : ""}</td>
        <td>${r.points_awarded}</td>
        <td class="tiny muted">${time(r.at)}</td>
        <td>
          ${r.status !== "confirmed" ? `<button class="btn sm" data-ref="${r.id}" data-act="confirm">تأكيد</button>` : ""}
          ${r.status !== "rejected" ? `<button class="btn sm danger" data-ref="${r.id}" data-act="reject">رفض</button>` : ""}
        </td>
      </tr>`).join("") || '<tr><td colspan="6" class="muted">ما كاينش إحالات</td></tr>';

    $$("#refs-table [data-ref]").forEach((b) =>
      b.addEventListener("click", async () => {
        const r = await api("/api/referrals", { method: "POST", body: { id: +b.dataset.ref, action: b.dataset.act } });
        toast(r.ok ? "تم" : "ما نجحش", r.ok ? "ok" : "bad");
        loadRefs();
      })
    );
  }
  $("#ref-status").addEventListener("change", loadRefs);

  /* ── الأسئلة ── */
  async function loadQuestions() {
    const out = await api("/api/questions");
    if (!out.ok) return;
    $("#q-count").textContent = out.count;
    $("#q-list").innerHTML = out.questions.map((q) => `
      <div class="q-item">
        <b>${esc(q.text)}</b> <span class="tag">${esc(q.category)}</span>
        <div class="opts">${q.options.map((o, i) => `<span class="opt ${i === q.correct ? "right" : ""}">${"ABCD"[i]}) ${esc(o)}</span>`).join("")}</div>
        <div class="row end" style="margin-top:9px"><button class="btn sm danger" data-q="${q.id}">حذف</button></div>
      </div>`).join("") || '<p class="muted">ما كاينش أسئلة — زيد واحد فوق.</p>';
    $$("#q-list [data-q]").forEach((b) =>
      b.addEventListener("click", async () => {
        await api(`/api/questions?id=${b.dataset.q}`, { method: "DELETE" });
        toast("تحذف", "ok");
        loadQuestions();
      })
    );
  }
  $("#q-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const options = $$(".q-opt").map((i) => i.value.trim()).filter(Boolean);
    const out = await api("/api/questions", {
      method: "POST",
      body: { text: $("#q-text").value, options, correct: +$("#q-correct").value, category: $("#q-cat").value || "عام" },
    });
    if (out.ok) { toast("تزاد السؤال ✅", "ok"); e.target.reset(); loadQuestions(); }
    else toast(out.error || "ما تزادش", "bad");
  });

  /* ── الصور ── */
  async function loadMedia() {
    const out = await api("/api/uploads");
    if (!out.ok) return;
    $("#media-grid").innerHTML = out.uploads.map((u) => `
      <div class="media-item">
        <img src="/api/uploads?id=${u.id}" alt="">
        <div class="meta"><span class="tiny">${(u.bytes / 1024).toFixed(0)}KB</span><button class="del" data-del="${u.id}">حذف</button></div>
      </div>`).join("");
    $$("#media-grid [data-del]").forEach((b) =>
      b.addEventListener("click", async () => {
        await api(`/api/uploads?id=${b.dataset.del}`, { method: "DELETE" });
        toast("تحذفت", "ok");
        loadMedia();
      })
    );
  }
  async function uploadFiles(files) {
    for (const f of [...files]) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 8 * 1024 * 1024) { toast(`${f.name}: كبيرة بزاف`, "bad"); continue; }
      const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      const out = await api("/api/uploads", { method: "POST", body: { data: dataUrl, name: f.name } });
      if (!out.ok) toast(out.error || "ما ترفعتش", "bad");
    }
    toast("ترفعت الصور ✅", "ok");
    loadMedia();
  }
  $("#media-pick").addEventListener("click", () => $("#media-file").click());
  $("#media-file").addEventListener("change", (e) => uploadFiles(e.target.files));
  const dz = $("#media-drop");
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", (e) => { if (e.dataTransfer?.files) uploadFiles(e.dataTransfer.files); });

  /* ── الإعدادات ── */
  const LEVELS = [["off", "بلا حماية"], ["light", "خفيفة"], ["normal", "عادية"], ["high", "قوية"], ["max", "قصوى"]];
  const NUMBERS = [
    ["rewardCorrect", "نقاط الجواب الصحيح"], ["rewardStreak", "مكافأة السلسلة"], ["dailyBonus", "مكافأة اليوم"],
    ["referralRewardNew", "مكافأة العضو الجديد"], ["referralRewardReferrer", "مكافأة صاحب الإحالة"],
    ["minAnswerMs", "أقل زمن جواب (ms)"], ["cooldownMs", "فاصل بين سؤالين (ms)"],
    ["maxAnswersPer10m", "حد الأجوبة/10د"], ["maxReferralsPerDay", "حد الإحالات/يوم"], ["broadcastRate", "سرعة البثّ/ثانية"],
  ];
  async function loadSettings() {
    const out = await api("/api/settings");
    if (!out.ok) return;
    const s = out.settings;
    $("#levels").innerHTML = LEVELS.map(([k, l]) => `<div class="level ${s.protectionLevel === k ? "on" : ""}" data-level="${k}">${l}<small>${k}</small></div>`).join("");
    $$("#levels .level").forEach((el) => el.addEventListener("click", () => {
      $$("#levels .level").forEach((x) => x.classList.remove("on"));
      el.classList.add("on");
    }));
    $("#set-numbers").innerHTML = NUMBERS.map(([k, l]) => `<div><label>${l}</label><input type="number" data-set="${k}" value="${s[k]}"></div>`).join("");
    $("#set-welcome").value = s.welcomeText ?? "";
    $("#set-persona").value = s.aiPersona ?? "";
  }
  $("#save-settings").addEventListener("click", async () => {
    const settings = {};
    settings.protectionLevel = $("#levels .level.on")?.dataset.level ?? "max";
    $$("#set-numbers [data-set]").forEach((i) => (settings[i.dataset.set] = +i.value));
    settings.welcomeText = $("#set-welcome").value;
    settings.aiPersona = $("#set-persona").value;
    const out = await api("/api/settings", { method: "POST", body: { settings } });
    toast(out.ok ? "تحفظت ✅" : out.error || "ما تحفظتش", out.ok ? "ok" : "bad");
    loadAll();
  });

  /* ── ربط البوت ── */
  function renderTokenState(o) {
    const el = $("#token-state");
    if (!el || !o?.bot) return;
    const src = o.bot.tokenSource ?? "none";
    el.textContent = src === "env"
      ? `متصل عبر متغيّر Vercel (BOT_TOKEN)${o.bot.username ? " · @" + o.bot.username : ""}`
      : src === "panel"
        ? `متصل عبر اللوحة${o.bot.username ? " · @" + o.bot.username : ""}`
        : "ماشي مربوط — حط التوكن هنا وراه يتسجّل الـ webhook وحدو";
  }
  $("#save-token")?.addEventListener("click", async () => {
    const token = $("#bot-token").value.trim();
    if (!token) return toast("حط التوكن أول", "bad");
    $("#save-token").disabled = true;
    const r = await api("/api/actions", { method: "POST", body: { job: "set_token", token } });
    $("#save-token").disabled = false;
    if (r.ok) {
      toast(`تربط البوت @${r.bot?.username ?? ""} ✅ — الـ webhook تسجّل`, "ok");
      $("#bot-token").value = "";
      loadAll();
    } else toast(r.error || "ما تربطش", "bad");
  });

  /* ── الأمان ── */
  async function loadSecurity() {
    const o = state.overview ?? (await api("/api/overview"));
    if (!o?.ok) return;
    $("#pw-meta").textContent = o.security.password_changed_at
      ? `آخر تغيير: ${time(o.security.password_changed_at)} · تخزين: ${o.security.storage}`
      : "كلمة السر مازال ما تبدّلتش من البداية — بدّلها توّا!";
    $("#actions-2").innerHTML = (o.actions ?? []).map((a) => `<li><b>${esc(a.kind)}</b><span>${esc(a.detail ?? "")}</span><span class="tiny muted">${time(a.at)}</span></li>`).join("") || '<li class="muted">—</li>';
  }

  /* ── نافذة كلمة السر ── */
  function openPw() { $("#pw-modal").hidden = false; $("#pw-current").focus(); }
  ["#open-password", "#open-password-2"].forEach((s) => $(s)?.addEventListener("click", openPw));
  $("#pw-cancel").addEventListener("click", () => ($("#pw-modal").hidden = true));
  $("#pw-modal").addEventListener("click", (e) => { if (e.target.id === "pw-modal") $("#pw-modal").hidden = true; });
  $("#pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#pw-msg");
    msg.className = "msg";
    if ($("#pw-next").value !== $("#pw-next2").value) { msg.textContent = "التأكيد ماشي كيما الجديدة"; return; }
    const out = await api("/api/auth/password", {
      method: "POST",
      body: { current: $("#pw-current").value, next: $("#pw-next").value },
    });
    if (out.ok) {
      msg.className = "msg ok";
      msg.textContent = "تبدّلت ✅ — كل الأجهزة الأخرى خرجت";
      e.target.reset();
      setTimeout(() => ($("#pw-modal").hidden = true), 1400);
      loadSecurity();
    } else msg.textContent = out.error || "ما تبدّلتش";
  });

  /* ── أدوات سريعة ── */
  $$("[data-quick]").forEach((b) =>
    b.addEventListener("click", async () => {
      const job = b.dataset.quick;
      if (job === "ask-ai") { tab("ai"); $("#ai-input").focus(); return; }
      if (job === "broadcast") {
        const text = prompt("نص البثّ لكل الأعضاء:");
        if (!text) return;
        toast("راه يبثّ…");
        const r = await api("/api/actions", { method: "POST", body: { job: "broadcast", text } });
        toast(r.ok ? `وصل لـ ${r.sent}/${r.total}` : r.error || "فشل", r.ok ? "ok" : "bad");
        return;
      }
      const r = await api("/api/actions", { method: "POST", body: { job } });
      if (job === "diagnose") {
        bubble?.("sys", "");
        toast(`البوت: ${r.bot?.username ?? "؟"} · webhook: ${r.webhook?.url || "ماشي مضبوط"}`, r.ok ? "ok" : "bad");
      } else toast(r.ok ? "تصحّح ✅" : r.error || "فشل", r.ok ? "ok" : "bad");
    })
  );

  /* ── أدوات ── */
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function time(ms) {
    if (!ms) return "—";
    const d = new Date(ms);
    const diff = Date.now() - ms;
    if (diff < 60000) return "توّا";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} دقيقة`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ساعة`;
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
  function statusTag(s) {
    if (s === "confirmed") return '<span class="tag ok">مؤكّدة</span>';
    if (s === "flagged") return '<span class="tag warn">مشبوهة</span>';
    if (s === "rejected") return '<span class="tag bad">مرفوضة</span>';
    return '<span class="tag">معلّقة</span>';
  }

  /* ── بدء ── */
  (async () => {
    const s = await api("/api/session");
    if (s.authed) showApp();
    else showLogin();
  })();
})();
