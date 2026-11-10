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
    if (res.status === 401 && data?.code === "session" && !path.includes("/login")) {
      // ماشي دائماً انتهاء جلسة: نبيّن السبب ونطلب إعادة الدخول
      if (data?.error) toast(data.error, "bad");
      showLogin();
    }
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
  const TITLES = { overview: "نظرة عامة", ai: "FT AI", bot: "البوت", users: "الأعضاء", refs: "الإحالات", quiz: "الأسئلة", media: "الصور", settings: "الإعدادات", security: "الأمان" };
  function tab(name) {
    state.tab = name;
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    $$(".tab").forEach((t) => (t.hidden = t.id !== `tab-${name}`));
    $("#tab-title").textContent = TITLES[name] ?? "FT AI";
    $("#side")?.classList.remove("open");
    $(".side")?.classList.remove("open");
    if (name === "bot") loadBot();
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
      body: { current: $("#pw-current").value.trim(), next: $("#pw-next").value },
    });
    if (out.ok) {
      msg.className = "msg ok";
      msg.textContent = "تبدّلت ✅ — كل الأجهزة الأخرى خرجت (جلسة هذا الجهاز بقيت)";
      e.target.reset();
      setTimeout(() => ($("#pw-modal").hidden = true), 1600);
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
        toast(`البوت: ${r.bot?.username ?? "؟"} · webhook: ${r.webhook?.url || "ماشي مضبوط"}`, r.ok ? "ok" : "bad");
      } else toast(r.ok ? "تصحّح ✅" : r.error || "فشل", r.ok ? "ok" : "bad");
    })
  );


  /* ═══════════════ 🤖 البوت — تحكّم حقيقي عبر FT AI ═══════════════ */
  const BOT_API = "/api/bot";           // وسيط اللوحة ← البوت
  const bot = { data: null, editing: null, lastPrompt: [] };

  async function botCall(method = "GET", body) {
    const res = await fetch(BOT_API, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    let data = {};
    try { data = await res.json(); } catch { data = { ok: false, error: "جواب ماشي صالح" }; }
    return { ...data, status: res.status };
  }

  async function loadBot() {
    const r = await botCall("GET");
    if (!r.ok) {
      $("#bot-health").innerHTML = `<div class="st bad"><b>!</b><span>${esc(r.error || "ما قدرناش نوصلو للبوت")}</span></div>`;
      $("#bot-health-note").textContent = r.hint || "تأكد أن البوت مربوط وأن VERCEL_BOT_KEY مضبوط في اللوحة.";
      return;
    }
    bot.data = r;
    renderBotHealth(r);
    renderBotPoints(r.points);
    renderBotRewards(r.rewards ?? []);
    renderBotRequests(r.requests ?? []);
    renderBotBalances(r.leaderboard ?? []);
    renderBotContests(r.contests ?? []);
    renderBotGroup(r.joinGroup);
  }

  function renderBotHealth(r) {
    const h = r.health ?? {};
    const ai = h.ai ?? {};
    $("#bot-health").innerHTML = [
      ["👥", h.users ?? 0, "مستخدم", ""],
      ["🏆", h.contests ?? 0, "مسابقة", ""],
      ["🎁", (r.rewards ?? []).filter((x) => x.active).length, "جائزة مفعّلة", "gold"],
      ["📨", (r.requests ?? []).filter((x) => x.status === "pending").length, "طلب في الانتظار", "gold"],
      ["💾", h.storage?.backend ?? "—", "التخزين", ""],
      ["⚡", ai.available ? "شغّال" : "متوقف", "FT AI", ai.available ? "gold" : ""],
    ].map(([ic, v, l, cls]) => `<div class="st ${cls}"><b>${esc(v)}</b><span>${ic} ${esc(l)}</span></div>`).join("");
    $("#bot-health-note").textContent = `متصل بـ ${r.source || "البوت"} · المزوّد: ${ai.provider || "—"} · النموذج: ${ai.model || "—"}`;
  }

  function renderBotPoints(p) {
    if (!p) return;
    const rows = [
      ["perJoin", "نقاط كل عضو جديد", p.perJoin],
      ["perActivated", "نقاط أول استعمال", p.perActivated],
      ["dailyMin", "هدية اليوم — من", p.dailyMin],
      ["dailyMax", "هدية اليوم — إلى", p.dailyMax],
    ];
    $("#bot-points").innerHTML =
      `<label class="tiny"><input type="checkbox" id="bp-enabled" ${p.enabled ? "checked" : ""}> نظام النقاط مفعّل</label>` +
      rows.map(([k, l, v]) => `<label class="tiny">${l}<input data-bp="${k}" type="number" min="0" value="${Number(v) || 0}"></label>`).join("") +
      `<label class="tiny">نص المتجر<input data-bp="shopIntro" value="${esc(p.shopIntro ?? "")}"></label>`;
  }

  function renderBotRewards(list) {
    $("#bot-rewards-count").textContent = `${list.length}`;
    $("#bot-rewards-table tbody").innerHTML = list.length
      ? list.map((r) => `<tr>
          <td>${esc(r.emoji)}</td>
          <td><b>${esc(r.title)}</b><div class="tiny muted">${esc(r.desc || "")}</div></td>
          <td>${r.cost}</td>
          <td>${r.stock === null ? "∞" : r.stock}</td>
          <td>${r.active ? "✅" : "🚫"}</td>
          <td class="row">
            <button class="btn ghost sm" data-rw-edit="${esc(r.id)}">✏️</button>
            <button class="btn ghost sm" data-rw-del="${esc(r.id)}">🗑</button>
          </td>
        </tr>`).join("")
      : `<tr><td colspan="6" class="muted">ما فيه حتى جائزة</td></tr>`;
  }

  function renderBotRequests(list) {
    $("#bot-requests tbody").innerHTML = list.length
      ? list.slice(0, 40).map((r) => `<tr>
          <td>${esc(r.userName || r.userId)}<div class="tiny muted">${r.username ? "@" + esc(r.username) : esc(r.userId)}</div></td>
          <td>${esc(r.emoji)} ${esc(r.rewardTitle)}</td>
          <td>${r.cost}</td>
          <td>${r.status === "pending" ? "⏳" : r.status === "approved" ? "✅ سلّمت" : "↩️ مرفوض"}</td>
          <td class="row">${r.status === "pending"
            ? `<button class="btn sm" data-rq-ok="${esc(r.id)}">✅</button><button class="btn ghost sm" data-rq-no="${esc(r.id)}">↩️</button>`
            : ""}</td>
        </tr>`).join("")
      : `<tr><td colspan="5" class="muted">ما زال ما فيه طلبات</td></tr>`;
  }

  function renderBotBalances(list) {
    $("#bot-balances tbody").innerHTML = list.length
      ? list.map((u) => `<tr>
          <td>${esc(u.name)}<div class="tiny muted">${esc(u.userId)}</div></td>
          <td><b>${u.balance ?? u.points}</b></td>
          <td><button class="btn ghost sm" data-pt-set="${esc(u.userId)}">تعديل</button></td>
        </tr>`).join("")
      : `<tr><td colspan="3" class="muted">—</td></tr>`;
  }

  function renderBotContests(list) {
    $("#bot-contests tbody").innerHTML = list.length
      ? list.slice(0, 20).map((c) => `<tr>
          <td>${esc(c.title)}<div class="tiny muted">${esc(c.prize || "")}</div></td>
          <td>${c.target}</td>
          <td>${c.status === "active" ? "🟢" : c.status === "ended" ? "🔴" : "⚪️"}</td>
          <td class="row">
            <button class="btn ghost sm" data-ct-toggle="${esc(c.id)}" data-ct-status="${c.status === "active" ? "ended" : "active"}">${c.status === "active" ? "⏹" : "▶️"}</button>
            <button class="btn ghost sm" data-ct-del="${esc(c.id)}">🗑</button>
          </td>
        </tr>`).join("")
      : `<tr><td colspan="4" class="muted">ما فيه مسابقات</td></tr>`;
  }

  function renderBotGroup(g) {
    $("#bot-group-state").textContent = g ? `المجموعة الحالية: ${g.title} (${g.chatId})` : "ما فيه حتى مجموعة مربوطة";
    $("#bot-group-id").value = g?.chatId ?? "";
  }

  /* أحداث تبويب البوت */
  $("#bot-save-points")?.addEventListener("click", async () => {
    const points = { enabled: $("#bp-enabled").checked };
    $$("[data-bp]").forEach((el) => {
      points[el.dataset.bp] = el.type === "number" ? Number(el.value) : el.value;
    });
    const r = await botCall("POST", { op: "save_points", points });
    toast(r.ok ? "تسجّلت إعدادات النقاط ✅" : r.error || "فشل", r.ok ? "ok" : "bad");
    if (r.ok) loadBot();
  });

  $("#bot-save-group")?.addEventListener("click", async () => {
    const chatId = $("#bot-group-id").value.trim();
    if (!chatId) return toast("حط آي دي المجموعة", "bad");
    const r = await botCall("POST", { op: "set_group", chatId });
    toast(r.ok ? `تربطت: ${r.joinGroup?.title ?? chatId}` : r.error || "فشل", r.ok ? "ok" : "bad");
    if (r.ok) loadBot();
  });

  $("#rw-save")?.addEventListener("click", async () => {
    const reward = {
      id: bot.editing?.id,
      emoji: $("#rw-emoji").value.trim() || "🎁",
      title: $("#rw-title").value.trim(),
      cost: Number($("#rw-cost").value) || 10,
      stock: $("#rw-stock").value === "" ? null : Number($("#rw-stock").value),
      active: $("#rw-active").checked,
      desc: $("#rw-desc").value.trim(),
      delivery: $("#rw-delivery").value.trim(),
      order: bot.editing?.order,
    };
    if (!reward.title) return toast("سمّي الجائزة", "bad");
    const r = await botCall("POST", { op: "save_reward", reward });
    toast(r.ok ? "تسجّلت الجائزة ✅" : r.error || "فشل", r.ok ? "ok" : "bad");
    if (r.ok) { clearRewardForm(); loadBot(); }
  });

  function clearRewardForm() {
    bot.editing = null;
    ["rw-emoji", "rw-title", "rw-cost", "rw-stock", "rw-desc", "rw-delivery"].forEach((id) => ($("#" + id).value = ""));
    $("#rw-emoji").value = "🎁";
    $("#rw-active").checked = true;
  }
  $("#rw-reset")?.addEventListener("click", clearRewardForm);

  $("#pt-apply")?.addEventListener("click", async () => {
    const userId = $("#pt-user").value.trim();
    const delta = Number($("#pt-delta").value);
    if (!userId || !Number.isFinite(delta)) return toast("آي دي + عدد", "bad");
    const r = await botCall("POST", { op: "set_points", userId, delta });
    toast(r.ok ? `الرصيد: ${r.balance}` : r.error || "فشل", r.ok ? "ok" : "bad");
    if (r.ok) loadBot();
  });

  $("#ct-create")?.addEventListener("click", async () => {
    const contest = {
      title: $("#ct-title").value.trim(),
      target: Number($("#ct-target").value) || 20,
      prize: $("#ct-prize").value.trim(),
      status: "active",
    };
    if (!contest.title) return toast("عنوان المسابقة", "bad");
    const r = await botCall("POST", { op: "save_contest", contest });
    toast(r.ok ? "تزادت المسابقة ✅" : r.error || "فشل", r.ok ? "ok" : "bad");
    if (r.ok) { $("#ct-title").value = $("#ct-target").value = $("#ct-prize").value = ""; loadBot(); }
  });

  $("#msg-send")?.addEventListener("click", async () => {
    const text = $("#msg-text").value.trim();
    const to = $("#msg-to").value.trim();
    if (!text) return toast("اكتب الرسالة", "bad");
    const r = to
      ? await botCall("POST", { op: "send_message", chatId: to, text })
      : await botCall("POST", { op: "announce", text, limit: 25 });
    toast(r.ok ? (to ? "تصيفطت ✅" : `بثّ: ${r.sent}/${r.total}`) : r.error || "فشل", r.ok ? "ok" : "bad");
  });

  $("#msg-ai")?.addEventListener("click", async () => {
    const idea = $("#msg-text").value.trim() || "إعلان مسابقة جديدة وجوائز في متجر البوت";
    toast("FT AI يكتب…");
    const r = await botCall("POST", { op: "ai_write", idea, kind: "announcement" });
    if (r.ok && r.text) { $("#msg-text").value = r.text.trim(); toast("تكتبت ✅"); }
    else toast(r.error || "فشل", "bad");
  });

  /* إيموجي */
  const EMOJIS = ["🔥","⚡","🎁","🏆","🎯","⭐","🌟","💫","🧸","💵","🤝","📢","🚀","✅","❤️","😂","😍","🙏","💎","👑","🆓","📌","🕹","🎮"];
  $("#emoji-bar") && ($("#emoji-bar").innerHTML = EMOJIS.map((e) => `<button class="emoji" data-emoji="${e}">${e}</button>`).join(""));
  $("#emoji-bar")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-emoji]");
    if (!b) return;
    const el = $("#msg-text");
    el.value += b.dataset.emoji;
    el.focus();
  });

  $("#sticker-send")?.addEventListener("click", async () => {
    const fileId = $("#sticker-id").value.trim();
    const to = $("#msg-to").value.trim();
    if (!fileId) return toast("حط file_id", "bad");
    const r = await botCall("POST", { op: "send_sticker", chatId: to || "all", fileId });
    toast(r.ok ? "تصيفط الستيكر ✅" : r.error || "فشل", r.ok ? "ok" : "bad");
  });

  /* ⚡ FT AI ينفّذ أوامر على البوت */
  $("#bot-ai-run")?.addEventListener("click", async () => {
    const prompt = $("#bot-ai-input").value.trim();
    if (!prompt) return toast("كتب طلبك", "bad");
    $("#bot-ai-out").textContent = "…";
    const ctx = bot.data
      ? `المستخدمون: ${bot.data.health?.users ?? 0}\nالجوائز: ${(bot.data.rewards ?? []).map((r) => `${r.title}=${r.cost}`).join("، ")}\nالمسابقات: ${(bot.data.contests ?? []).map((c) => `${c.title}(${c.status})`).join("، ")}`
      : "";
    const r = await botCall("POST", { op: "ai_act", prompt, context: ctx, history: bot.lastPrompt.slice(-6) });
    bot.lastPrompt.push(prompt);
    $("#bot-ai-out").textContent = r.ok ? (r.text || "تنفّذ ✅") : (r.error || "فشل");
    if (r.ok) { toast("FT AI نفّذ ✅"); loadBot(); }
    else toast(r.error || "فشل", "bad");
  });

  /* أحداث الجداول (تفويض) */
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-rw-edit],[data-rw-del],[data-rq-ok],[data-rq-no],[data-pt-set],[data-ct-toggle],[data-ct-del]");
    if (!t) return;
    if (t.dataset.rwEdit) {
      const r = (bot.data?.rewards ?? []).find((x) => x.id === t.dataset.rwEdit);
      if (!r) return;
      bot.editing = r;
      $("#rw-emoji").value = r.emoji; $("#rw-title").value = r.title; $("#rw-cost").value = r.cost;
      $("#rw-stock").value = r.stock ?? ""; $("#rw-active").checked = r.active;
      $("#rw-desc").value = r.desc ?? ""; $("#rw-delivery").value = r.delivery ?? "";
      $("#rw-title").focus();
    }
    if (t.dataset.rwDel) {
      if (!confirm("تحيد الجائزة؟")) return;
      const r = await botCall("POST", { op: "delete_reward", id: t.dataset.rwDel });
      toast(r.ok ? "تحيدت" : r.error || "فشل", r.ok ? "ok" : "bad");
      if (r.ok) loadBot();
    }
    if (t.dataset.rqOk || t.dataset.rqNo) {
      const id = t.dataset.rqOk || t.dataset.rqNo;
      const r = await botCall("POST", { op: "decide", id, status: t.dataset.rqOk ? "approved" : "rejected" });
      toast(r.ok ? "تم ✅" : r.error || "فشل", r.ok ? "ok" : "bad");
      if (r.ok) loadBot();
    }
    if (t.dataset.ptSet) {
      const id = t.dataset.ptSet;
      const val = prompt(`الرصيد الجديد لـ ${id} (فارغ = بلا تغيير):`);
      if (val === null) return;
      const r = await botCall("POST", { op: "set_points", userId: id, points: Number(val) });
      toast(r.ok ? `الرصيد: ${r.balance}` : r.error || "فشل", r.ok ? "ok" : "bad");
      if (r.ok) loadBot();
    }
    if (t.dataset.ctToggle) {
      const r = await botCall("POST", { op: "set_contest_status", id: t.dataset.ctToggle, status: t.dataset.ctStatus });
      toast(r.ok ? "تبدّلت الحالة" : r.error || "فشل", r.ok ? "ok" : "bad");
      if (r.ok) loadBot();
    }
    if (t.dataset.ctDel) {
      if (!confirm("تحيد المسابقة؟")) return;
      const r = await botCall("POST", { op: "delete_contest", id: t.dataset.ctDel });
      toast(r.ok ? "تحيدت" : r.error || "فشل", r.ok ? "ok" : "bad");
      if (r.ok) loadBot();
    }
  });

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
