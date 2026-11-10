/* برق — لوحة التحكم. بلا أي مكتبة خارجية، كل شيء على نفس الأصل. */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(n.dataset, v);
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false || kid === "") continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
};

const state = {
  tab: "overview",
  users: { q: "", filter: "all", page: 0 },
  refs: { status: "all" },
  uploads: [],
  aiBusy: false,
  timer: null,
  session: null,
};

const num = (n) => new Intl.NumberFormat("en-US").format(Number(n || 0));
const fmt = num;
const dt = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts), p = (x) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const ago = (ts) => {
  if (!ts) return "—";
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `قبل ${s} ث`;
  if (s < 3600) return `قبل ${Math.floor(s / 60)} د`;
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} س`;
  return `قبل ${Math.floor(s / 86400)} يوم`;
};

function toast(msg, bad = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (bad ? " bad" : "");
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 3000);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  if (res.status === 401) {
    showGate();
    throw new Error("auth");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
}

/* ══════════════ الدخول ══════════════ */

function showGate() {
  $("#gate").hidden = false;
  $("#app").hidden = true;
  clearInterval(state.timer);
}

$("#pwEye").addEventListener("click", () => {
  const p = $("#pw");
  p.type = p.type === "password" ? "text" : "password";
});

async function checkSession() {
  try {
    const s = await api("/api/auth/session");
    state.session = s;
    if (s.authed) {
      $("#gate").hidden = true;
      $("#app").hidden = false;
      $("#levelPill").textContent = `${s.demo ? "🧪 تجريبي" : "🚀 إنتاج"} · حماية`;
      if (s.ai) $("#brandSub").textContent = s.ai.openrouter || s.ai.grok ? "AI · متصل" : "AI · بلا مفتاح";
      await loadTab(state.tab);
      startPolling();
    } else showGate();
  } catch {
    showGate();
  }
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#loginBtn"), err = $("#loginErr");
  btn.disabled = true;
  err.textContent = "";
  try {
    await api("/api/auth/login", { method: "POST", body: JSON.stringify({ password: $("#pw").value }) });
    $("#pw").value = "";
    await checkSession();
  } catch (e2) {
    err.textContent = e2.message === "auth" ? "كلمة السر غالطة" : e2.message;
  } finally {
    btn.disabled = false;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  location.reload();
});

/* ══════════════ التنقل ══════════════ */

const TITLES = {
  overview: "نظرة عامة",
  ai: "عقل برق 🧠",
  referrals: "الإحالات",
  users: "المستخدمون",
  questions: "الأسئلة",
  security: "الحماية",
  settings: "الإعدادات",
};

function setTab(tab) {
  state.tab = tab;
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${tab}`));
  $("#pageTitle").textContent = TITLES[tab] ?? tab;
  $(".side")?.classList.remove("open");
  history.replaceState(null, "", `#${tab}`);
  loadTab(tab);
}

$("#nav").addEventListener("click", (e) => {
  const b = e.target.closest(".nav-btn");
  if (b) setTab(b.dataset.tab);
});
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-goto]");
  if (g) setTab(g.dataset.goto);
});
$("#burger").addEventListener("click", () => $(".side").classList.toggle("open"));

$("#refreshBtn").addEventListener("click", () => {
  loadTab(state.tab);
  toast("تم التحديث");
});

function startPolling() {
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    if (document.hidden) return;
    if (state.tab === "overview" || state.tab === "security") loadTab(state.tab, true);
  }, 20000);
}

async function loadTab(tab, silent = false) {
  try {
    if (tab === "overview") return await renderOverview();
    if (tab === "ai") return await renderAI();
    if (tab === "referrals") return await renderReferrals();
    if (tab === "users") return await renderUsers();
    if (tab === "questions") return await renderQuestions();
    if (tab === "security") return await renderSecurity();
    if (tab === "settings") return await renderSettings();
  } catch (e) {
    if (e.message !== "auth" && !silent) toast(e.message, true);
  }
}

/* ══════════════ نظرة عامة ══════════════ */

async function renderOverview() {
  const d = await api("/api/overview");
  $("#bRefs").textContent = d.stats.pending ? String(d.stats.pending) : "";
  $("#bRisk").textContent = d.stats.flagged ? String(d.stats.flagged) : "";
  $("#levelPill").textContent = `${d.demo ? "🧪 تجريبي" : "🚀 إنتاج"} · ${d.level.toUpperCase()}`;
  $("#heroTitle").textContent = `مرحباً 👋 — ${num(d.stats.users)} عضو`;
  $("#heroSub").textContent = `${num(d.stats.active)} نشط في 24 ساعة · ${num(d.stats.confirmed)} إحالة مفعّلة · ${num(d.stats.quizzes)} سؤال`;

  const cards = [
    { k: "المستخدمون", v: num(d.stats.users), d: `+${num(d.stats.newToday)} اليوم` },
    { k: "نشطون (24س)", v: num(d.stats.active), d: "دخلو البوت" },
    { k: "إحالات مفعّلة", v: num(d.stats.confirmed), d: `${num(d.stats.pending)} في الانتظار`, cls: "ok" },
    { k: "إحالات مشبوهة", v: num(d.stats.flagged), d: "تحتاج مراجعة", cls: d.stats.flagged ? "warn" : "" },
    { k: "مجموع النقاط", v: num(d.stats.points), d: `+${num(d.stats.earnedToday)} اليوم` },
    { k: "أسئلة مُجابة", v: num(d.stats.quizzes), d: `دقة ${d.stats.accuracy}%` },
    { k: "محظورون", v: num(d.stats.blocked), d: `${num(d.stats.nets)} شبكة محظورة`, cls: d.stats.blocked ? "bad" : "" },
    { k: "رسائل ناجحة", v: num(d.queue.sent), d: `${num(d.queue.throttled)} تهدئة · ${num(d.queue.failed)} فشل` },
  ];
  $("#statCards").replaceChildren(
    ...cards.map((c) =>
      el("div", { class: `card ${c.cls || ""}` }, el("div", { class: "k", text: c.k }), el("div", { class: "v", text: c.v }), el("div", { class: "d", text: c.d }))
    )
  );
  $("#chart").replaceChildren(chartBars(d.series));
  $("#topList").replaceChildren(...d.top.map((u, i) => miniRow(i, u, num(u.points))));
  $("#recentFlow").replaceChildren(...(d.recent.length ? d.recent.map(flowRow) : [el("div", { class: "muted small", text: "مازال ما كاين إحالات." })]));
}

function chartBars(series) {
  const max = Math.max(1, ...series.map((s) => Math.max(s.joins, s.refs, s.quiz)));
  const wrap = el("div", { style: "width:100%" });
  wrap.append(el("div", { class: "legend", html: '<span><i style="background:#2563eb"></i>دخول</span><span><i style="background:#7c3aed"></i>إحالات</span><span><i style="background:#059669"></i>أسئلة</span>' }));
  const cols = el("div", { class: "chart" });
  for (const s of series) {
    const bars = el("div", { class: "bars" });
    bars.append(
      el("div", { class: "bar join", style: `height:${(s.joins / max) * 100}%`, title: `دخول: ${s.joins}` }),
      el("div", { class: "bar ref", style: `height:${(s.refs / max) * 100}%`, title: `إحالات: ${s.refs}` }),
      el("div", { class: "bar quiz", style: `height:${(s.quiz / max) * 100}%`, title: `أسئلة: ${s.quiz}` })
    );
    cols.append(el("div", { class: "col" }, bars, el("div", { class: "lbl", text: s.day })));
  }
  wrap.append(cols);
  return wrap;
}

function avatar(u, cls = "av") {
  const img = el("img", {
    class: cls, alt: "", loading: "lazy", decoding: "async",
    src: `/api/avatar/${u.tg_id}?v=${u.avatar_version ?? 0}`,
  });
  img.addEventListener("error", () => {
    if (!img.dataset.fb) {
      img.dataset.fb = "1";
      img.src = "/api/avatar/0";
    }
  });
  return img;
}

function personCell(u, sub, onClick) {
  const name = u.name || [u.first_name, u.last_name].filter(Boolean).join(" ") || (u.username ? "@" + u.username : `#${u.tg_id}`);
  return el("div", { class: "person", onclick: onClick }, avatar(u), el("div", { class: "who" }, el("b", { text: name }), el("span", { text: sub })));
}

function miniRow(i, u, val) {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || (u.username ? "@" + u.username : `#${u.tg_id}`);
  return el(
    "div",
    { class: "mini-row", onclick: () => openUser(u.tg_id) },
    el("div", { class: "rank", text: i < 3 ? ["🥇", "🥈", "🥉"][i] : String(i + 1) }),
    avatar(u),
    el("div", { class: "who" }, el("b", { text: name }), el("span", { text: u.username ? "@" + u.username : `#${u.tg_id}` })),
    el("div", { class: "val", text: val })
  );
}

const STATUS_CHIP = { confirmed: ["chip ok", "✅ مفعّلة"], pending: ["chip warn", "⏳ في الانتظار"], flagged: ["chip bad", "⚠️ مشبوهة"] };

function flowRow(r) {
  const n = r.newUser ?? r.new_user;
  const ref = r.referrer ?? r.ref;
  const st = STATUS_CHIP[r.status] ?? STATUS_CHIP.pending;
  const reasons = r.reasons ? r.reasons.split(",").filter(Boolean).slice(0, 2) : [];
  return el(
    "div",
    { class: "flow-row" },
    personCell({ ...ref, avatar_version: ref.avatar_version }, "صاحب الرابط", () => openUser(ref.tg_id)),
    el("div", { class: "arrow", text: "←" }),
    personCell({ ...n, avatar_version: n.avatar_version }, "دخل من طرفو", () => openUser(n.tg_id)),
    el("div", { class: "meta" }, el("span", { class: st[0], text: st[1] }), el("span", { class: "time", text: ago(r.at) }), ...reasons.map((x) => el("span", { class: "chip", text: reasonLabel(x) })))
  );
}

function reasonLabel(r) {
  return {
    same_network: "نفس الشبكة", ip_reused: "IP مستعمل", velocity: "سرعة عالية", name_pattern: "أسماء متشابهة",
    username_pattern: "يوزرات متشابهة", same_device: "نفس الجهاز", self_referral: "عزم روحو", daily_cap: "سقف يومي",
    referrer_blocked: "المُحيل محظور", ip_blocked: "شبكة محظورة", referrer_too_new: "حساب جديد",
    already_referred: "مسجّل من قبل", manual_ok: "تأكيد يدوي", ai_ok: "تأكيد بالعقل", rejected: "مرفوضة",
  }[r] ?? r;
}

/* ══════════════ عقل برق ══════════════ */

let pendingImages = [];

async function renderAI() {
  const [h, tools, diag] = await Promise.all([
    api("/api/ai/history"),
    api("/api/ai/tools"),
    api("/api/ai/diagnose").catch(() => null),
  ]);
  $("#aiModelChip").textContent = h.providers.openrouter || h.providers.grok ? `🧠 ${h.providers.model || "grok"}` : "⚠️ بلا مفتاح";
  $("#toolCount").textContent = `${tools.tools.length} أداة`;

  // الحالة
  if (diag) {
    $("#aiStatus").replaceChildren(
      ...[
        ["المزوّدون", `${diag.providers.openrouter ? "OpenRouter ✓ " : ""}${diag.providers.grok ? "Grok ✓" : ""}`.trim() || "—"],
        ["النموذج", diag.providers.model || "—"],
        ["المستخدمون", num(diag.stats.users)],
        ["إحالات معلّقة", num(diag.stats.pending)],
        ["مشاكل", diag.issues.length ? String(diag.issues.length) : "0 ✅"],
      ].flatMap(([k, v]) => [el("span", { text: k }), el("b", { text: v })])
    );
  }

  // القدرات
  $("#toolsCloud").replaceChildren(
    ...tools.tools.map((t) => el("span", { class: `tc ${t.category === "write" ? "w" : ""}`, title: t.description, text: t.name }))
  );

  // سجل العمليات
  $("#aiActCount").textContent = `${h.actions.length}`;
  $("#aiActions").replaceChildren(
    ...(h.actions.length
      ? h.actions.map((a) =>
          el(
            "div",
            { class: "act" },
            el("span", { class: a.ok ? "ok" : "no", text: a.ok ? "✓" : "✕" }),
            el("span", { class: "nm", text: a.tool }),
            el("span", { class: "tiny muted", text: ago(a.at) })
          )
        )
      : [el("div", { class: "muted tiny", text: "مازال ما كاين عمليات." })])
  );

  renderAIChat(h.messages);
}

function renderAIChat(messages) {
  const box = $("#aiChat");
  if (!messages.length) {
    box.replaceChildren($("#aiEmpty"));
    return;
  }
  const empty = $("#aiEmpty");
  if (empty) empty.remove();
  box.replaceChildren(
    ...messages.map((m, i) => {
      const isUser = m.role === "user";
      const bubble = el("div", { class: "bubble" });
      const imgs = (() => {
        try {
          const t = m.tools ? JSON.parse(m.tools) : null;
          return null;
        } catch {
          return null;
        }
      })();
      bubble.textContent = m.content ?? "";
      let trace = null;
      try {
        const t = m.tools ? JSON.parse(m.tools) : null;
        if (Array.isArray(t) && t.length) {
          trace = el("div", { class: "trace" }, ...t.map((x) => el("span", { class: `tpill ${x.ok ? "" : "bad"}`, text: (x.ok ? "✓ " : "✕ ") + x.tool })));
        }
      } catch {}
      return el(
        "div",
        { class: `msg ${isUser ? "user" : "ai"}`, dataset: { id: m.id } },
        el("div", { class: "avatar", text: isUser ? "👤" : "🧠" }),
        el("div", {}, bubble, trace)
      );
    })
  );
  box.scrollTop = box.scrollHeight;
}

function appendMsg(role, content, { trace = null, images = [] } = {}) {
  const box = $("#aiChat");
  const empty = $("#aiEmpty");
  if (empty) empty.remove();
  const bubble = el("div", { class: "bubble", text: content });
  const wrap = el("div", { class: `msg ${role === "user" ? "user" : "ai"}` }, el("div", { class: "avatar", text: role === "user" ? "👤" : "🧠" }), el("div", {}));
  if (images.length) {
    wrap.lastChild.append(el("div", { class: "imgs" }, ...images.map((u) => el("img", { src: u, alt: "" }))));
  }
  wrap.lastChild.append(bubble);
  if (trace?.length) {
    wrap.lastChild.append(el("div", { class: "trace" }, ...trace.map((x) => el("span", { class: `tpill ${x.ok ? "" : "bad"}`, text: (x.ok ? "✓ " : "✕ ") + x.tool }))));
  }
  box.append(wrap);
  box.scrollTop = box.scrollHeight;
  return wrap;
}

function showTyping() {
  const box = $("#aiChat");
  const wrap = el("div", { class: "msg ai", id: "typingRow" }, el("div", { class: "avatar", text: "🧠" }), el("div", { class: "bubble typing" }, el("i"), el("i"), el("i")));
  box.append(wrap);
  box.scrollTop = box.scrollHeight;
  return () => wrap.remove();
}

async function sendAI(text) {
  if (state.aiBusy) return toast("عقل برق يخدم دوك، استنى…", true);
  text = String(text ?? $("#aiInput").value ?? "").trim();
  const images = [...pendingImages];
  if (!text && !images.length) return;
  state.aiBusy = true;
  $("#aiSend").disabled = true;
  $("#aiInput").value = "";
  $("#aiInput").style.height = "auto";
  pendingImages = [];
  renderAttach();
  appendMsg("user", text || "📷 صورة", { images: images.map((u) => `/uploads/${u}`) });
  const stop = showTyping();
  try {
    const out = await api("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message: text, images }),
    });
    stop();
    appendMsg("ai", out.text || "(بلا نص)", { trace: out.trace });
    if (out.trace?.length) renderAIActionsRefresh();
  } catch (e) {
    stop();
    appendMsg("ai", "⚠️ " + e.message);
  } finally {
    state.aiBusy = false;
    $("#aiSend").disabled = false;
    $("#aiInput").focus();
  }
}

async function renderAIActionsRefresh() {
  try {
    const h = await api("/api/ai/history");
    $("#aiActCount").textContent = `${h.actions.length}`;
    $("#aiActions").replaceChildren(
      ...h.actions.map((a) =>
        el("div", { class: "act" }, el("span", { class: a.ok ? "ok" : "no", text: a.ok ? "✓" : "✕" }), el("span", { class: "nm", text: a.tool }), el("span", { class: "tiny muted", text: ago(a.at) }))
      )
    );
  } catch {}
}

$("#aiSend").addEventListener("click", () => sendAI());

$("#aiInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendAI();
  }
});
$("#aiInput").addEventListener("input", (e) => {
  e.target.style.height = "auto";
  e.target.style.height = Math.min(150, e.target.scrollHeight) + "px";
});

$("#aiSuggest").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) sendAI(b.dataset.say);
});

$("#aiClear").addEventListener("click", async () => {
  await api("/api/ai/history", { method: "DELETE" });
  $("#aiChat").replaceChildren($("#aiEmpty"));
  toast("تم مسح المحادثة");
});

$("#aiDiagnose").addEventListener("click", async () => {
  const d = await api("/api/ai/diagnose", { method: "POST" });
  const lines = [
    `👥 المستخدمون: ${num(d.stats.users)}`,
    `🔗 إحالات معلّقة: ${num(d.stats.pending)} · مشبوهة: ${num(d.stats.flagged)}`,
    `🧠 المزوّدون: ${d.providers.openrouter ? "OpenRouter ✓" : ""} ${d.providers.grok ? "Grok ✓" : ""}`.trim(),
    d.issues.length ? `⚠️ ${d.issues.join("\n⚠️ ")}` : "✅ كل شيء سليم",
  ];
  appendMsg("ai", lines.join("\n"));
});

/* رفع الصور في المحادثة */
$("#aiUploadBtn").addEventListener("click", () => $("#aiFile").click());

$("#aiFile").addEventListener("change", async (e) => {
  const files = [...(e.target.files ?? [])].slice(0, 6);
  e.target.value = "";
  for (const f of files) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) {
      toast("غير مدعوم: " + f.name, true);
      continue;
    }
    if (f.size > 12 * 1024 * 1024) {
      toast("كبيرة بزاف: " + f.name, true);
      continue;
    }
    const data = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(f);
    });
    try {
      const out = await api("/api/uploads", { method: "POST", body: JSON.stringify({ data, name: f.name }) });
      pendingImages.push(out.upload.id);
      toast("ترفعت الصورة ✅");
    } catch (err) {
      toast(err.message, true);
    }
  }
  renderAttach();
});

function renderAttach() {
  $("#aiAttach").replaceChildren(
    ...pendingImages.map((id) =>
      el(
        "div",
        { class: "att" },
        el("img", { src: `/uploads/${id}`, alt: "" }),
        el("button", {
          text: "×",
          title: "حذف",
          onclick: () => {
            pendingImages = pendingImages.filter((x) => x !== id);
            renderAttach();
          },
        })
      )
    )
  );
}

/* سحب وإفلات */
const chatBox = document.querySelector(".ai-main");
["dragover", "drop"].forEach((ev) =>
  chatBox?.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === "drop" && e.dataTransfer?.files?.length) {
      $("#aiFile").files = e.dataTransfer.files;
      $("#aiFile").dispatchEvent(new Event("change"));
    }
  })
);

/* ══════════════ الإحالات ══════════════ */

async function renderReferrals() {
  const status = state.refs.status;
  const [refs, referrers] = await Promise.all([api(`/api/referrals?status=${status}&limit=100`), api("/api/referrers")]);
  $("#refFlow").replaceChildren(...(refs.rows.length ? refs.rows.map(flowRow) : [el("div", { class: "muted small", text: "ما كاين حتى إحالة في هذا القسم." })]));
  $("#refCards").replaceChildren(
    ...(() => {
      const all = refs.rows;
      const confirmed = all.filter((r) => r.status === "confirmed").length;
      const pending = all.filter((r) => r.status === "pending").length;
      const flagged = all.filter((r) => r.status === "flagged").length;
      return [
        { k: "معروضة", v: num(all.length) },
        { k: "مفعّلة", v: num(confirmed), cls: "ok" },
        { k: "في الانتظار", v: num(pending), cls: "warn" },
        { k: "مشبوهة", v: num(flagged), cls: flagged ? "bad" : "" },
      ].map((x) => el("div", { class: `card ${x.cls || ""}` }, el("div", { class: "k", text: x.k }), el("div", { class: "v", text: x.v })));
    })()
  );
  $("#referrersList").replaceChildren(
    ...referrers.rows.map((r, i) =>
      el(
        "div",
        { class: "mini-row", onclick: () => openUser(r.tg_id) },
        el("div", { class: "rank", text: String(i + 1) }),
        avatar({ tg_id: r.tg_id, avatar_version: r.avatar_version }),
        el("div", { class: "who" }, el("b", { text: [r.first_name, r.last_name].filter(Boolean).join(" ") || "@" + r.username }), el("span", { text: `✅ ${r.confirmed ?? 0} · ⚠️ ${r.flagged ?? 0}` })),
        el("div", { class: "val", text: `${r.invites}` })
      )
    )
  );
}

$("#refSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  $$("#refSeg button").forEach((x) => x.classList.toggle("on", x === b));
  state.refs.status = b.dataset.status;
  renderReferrals().catch((e2) => toast(e2.message, true));
});

/* ══════════════ المستخدمون ══════════════ */

async function renderUsers() {
  const { q, filter, page } = state.users;
  const d = await api(`/api/users?${new URLSearchParams({ q, filter, page: String(page) })}`);
  $("#userList").replaceChildren(
    ...d.users.map((u) => {
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || (u.username ? "@" + u.username : `#${u.tg_id}`);
      return el(
        "div",
        { class: `user-card ${u.blocked ? "blocked" : ""}`, onclick: () => openUser(u.tg_id) },
        avatar(u),
        el(
          "div",
          { class: "who" },
          el("b", { text: name }),
          el("span", { text: u.username ? "@" + u.username : `#${u.tg_id}` }),
          el("div", { class: "stats" },
            el("span", { text: `💰 ${num(u.points)}` }),
            el("span", { text: `🔗 ${num(u.referrals)}` }),
            u.risk_score >= 40 ? el("span", { text: `⚠️ ${u.risk_score}` }) : null,
            u.inline ? el("span", { text: `⏳ ${Math.ceil(u.inline / 1000)}ث` }) : null,
            u.blocked ? el("span", { text: "🛑" }) : null
          )
        )
      );
    })
  );
  const pager = $("#userPager");
  pager.replaceChildren();
  if (d.pages > 1) {
    pager.append(
      el("button", { class: "ghost sm", text: "السابق", onclick: () => ((state.users.page = Math.max(0, page - 1)), renderUsers()) }),
      el("span", { class: "muted small", text: `${page + 1} / ${d.pages} · ${num(d.total)}` }),
      el("button", { class: "ghost sm", text: "التالي", onclick: () => ((state.users.page = Math.min(d.pages - 1, page + 1)), renderUsers()) })
    );
  } else pager.append(el("span", { class: "muted small", text: `${num(d.total)} مستخدم` }));
}

let searchTimer;
$("#userSearch").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const v = e.target.value.trim();
  searchTimer = setTimeout(() => {
    state.users.q = v;
    state.users.page = 0;
    renderUsers().catch((e2) => toast(e2.message, true));
  }, 220);
});

$("#userSeg").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  $$("#userSeg button").forEach((x) => x.classList.toggle("on", x === b));
  state.users.filter = b.dataset.filter;
  state.users.page = 0;
  renderUsers().catch((e2) => toast(e2.message, true));
});

/* ══════════════ الأسئلة ══════════════ */

async function renderQuestions() {
  const d = await api("/api/questions");
  const sel = $("#qCat");
  if (!sel.options.length) {
    sel.replaceChildren(...d.categories.map((c) => el("option", { value: c.id, text: c.label })));
  }
  $("#qStats").textContent = `${d.stats.total} سؤال · ${d.stats.active} نشط`;
  $("#qList").replaceChildren(
    ...(d.questions.length
      ? d.questions.map((q) =>
          el(
            "div",
            { class: "qitem" },
            el("div", { class: "q", text: q.question }),
            el("div", { class: "o" }, ...q.options.map((o, i) => el("span", { html: i === q.correct ? `<b>${escapeHtml(o)} ✓</b>` : escapeHtml(o) + (i < q.options.length - 1 ? " · " : "") }))),
            el("div", { class: "row" }, el("span", { class: "chip", text: q.categoryLabel }), el("button", { class: "ghost sm", text: "حذف", onclick: () => delQuestion(q.id) }))
          )
        )
      : [el("div", { class: "muted small", text: "ما كاين حتى سؤال مخصّص. زيد واحد من اليسار." })])
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function delQuestion(id) {
  await api(`/api/questions/${id}`, { method: "DELETE" });
  toast("تحذف السؤال");
  renderQuestions();
}

$("#qForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const options = $("#qOptions").value.split("\n").map((s) => s.trim()).filter(Boolean);
  try {
    await api("/api/questions", {
      method: "POST",
      body: JSON.stringify({ question: $("#qText").value, options, correct: Number($("#qCorrect").value), category: $("#qCat").value }),
    });
    $("#qText").value = "";
    $("#qOptions").value = "";
    $("#qCorrect").value = "0";
    toast("تزاد السؤال ✅");
    renderQuestions();
  } catch (e2) {
    toast(e2.message, true);
  }
});

/* ══════════════ الحماية ══════════════ */

async function renderSecurity() {
  const d = await api("/api/security");
  const q = d.queue;
  const cards = [
    { k: "مستوى الحماية", v: d.level.toUpperCase(), d: "PROTECTION_LEVEL" },
    { k: "رسائل ناجحة", v: num(q.sent), cls: "ok" },
    { k: "تهدئات 429", v: num(q.throttled), cls: q.throttled ? "warn" : "" },
    { k: "فشل", v: num(q.failed), cls: q.failed ? "bad" : "" },
    { k: "محادثات مكتومة", v: num(q.blocked) },
    { k: "جلسات اللوحة", v: num(d.sessions) },
  ];
  $("#secCards").replaceChildren(...cards.map((c) => el("div", { class: `card ${c.cls || ""}` }, el("div", { class: "k", text: c.k }), el("div", { class: "v", text: c.v }), c.d ? el("div", { class: "d", text: c.d }) : null)));
  $("#queueBox").replaceChildren(
    ...[["مرسل", num(q.sent)], ["فشل", num(q.failed)], ["إعادة محاولة", num(q.retried)], ["تهدئة", num(q.throttled)], ["403", num(q.blocked)]].flatMap(([k, v]) => [el("span", { text: k }), el("b", { text: v })])
  );
  const total = Math.max(1, ...d.counts.map((c) => c.n));
  $("#eventKinds").replaceChildren(
    ...d.counts.map((c) => el("div", { class: "bar-row" }, el("span", { text: c.kind }), el("div", { class: "bar-track" }, el("div", { class: "bar-fill", style: `width:${(c.n / total) * 100}%` })), el("b", { text: String(c.n) })))
  );
  $("#netsList").replaceChildren(
    ...(d.nets.length
      ? d.nets.map((n) => el("div", { class: "net-row" }, el("code", { text: n.net }), el("span", { class: "muted tiny", text: n.reason ?? "" }), el("span", { class: "chip", text: n.auto ? "آلي" : "يدوي" }), el("button", { class: "ghost sm", text: "رفع", onclick: () => removeNet(n.net) })))
      : [el("div", { class: "muted small", text: "ما كاين حتى شبكة محظورة ✅" })])
  );
  $("#envListSec").replaceChildren(...d.env.map((x) => el("div", { class: "env" }, el("span", { class: `dot ${x.set ? "on" : "off"}` }), el("code", { text: x.key }), x.note ? el("span", { class: "muted tiny", text: x.note }) : null)));
  $("#eventsList").replaceChildren(
    ...d.events.map((e) =>
      el("div", { class: "ev" }, el("span", { class: `sev ${e.severity}` }), el("code", { text: e.kind }), el("span", { text: e.detail ?? "" }), el("span", { class: "time", text: dt(e.at), style: "margin-inline-start:auto" }), e.user_id ? el("span", { class: "chip", text: `#${e.user_id}`, style: "cursor:pointer", onclick: () => openUser(e.user_id) }) : null)
    )
  );
}

async function removeNet(net) {
  await api("/api/nets", { method: "POST", body: JSON.stringify({ action: "delete", net }) });
  toast("ترفع الحظر");
  renderSecurity();
}

/* ══════════════ الإعدادات ══════════════ */

const SETTINGS_FIELDS = [
  ["bot_enabled", "البوت شغّال (1/0)"],
  ["points_correct", "نقاط الإجابة الصحيحة"],
  ["points_speed_bonus_max", "أقصى مكافأة سرعة"],
  ["points_daily", "مكافأة اليوم"],
  ["referral_points", "نقاط صاحب الرابط"],
  ["referee_points", "نقاط العضو الجديد"],
  ["max_referrals_per_day", "سقف الإحالات/يوم"],
  ["require_engagement_for_referral", "تفعيل بعد نشاط (1/0)"],
  ["quiz_seconds", "مدة السؤال (ث)"],
  ["quiz_questions_per_session", "أسئلة الجلسة"],
  ["quiz_per_day", "سقف الأسئلة/يوم"],
  ["min_account_age_for_referrals_min", "عمر أدنى للمُحيل (د)"],
];

async function renderSettings() {
  const d = await api("/api/settings");
  const form = $("#settingsForm");
  form.replaceChildren(
    ...SETTINGS_FIELDS.map(([key, label]) =>
      el("div", { class: "field" }, el("label", { text: label, for: `s-${key}` }), el("input", { id: `s-${key}`, name: key, value: d.settings[key] ?? "", inputmode: "numeric" }))
    )
  );
  $("#envListSettings").replaceChildren(...d.env.map((x) => el("div", { class: "env" }, el("span", { class: `dot ${x.set ? "on" : "off"}` }), el("code", { text: x.key }), x.note ? el("span", { class: "muted tiny", text: x.note }) : null)));
  if (d.settings.ai_model) $("#aiModelInput").value = d.settings.ai_model;
}

$("#saveSettings").addEventListener("click", async () => {
  const body = {};
  for (const [key] of SETTINGS_FIELDS) body[key] = $(`#s-${key}`).value.trim();
  try {
    await api("/api/settings", { method: "POST", body: JSON.stringify(body) });
    toast("تحفظت الإعدادات ✅");
  } catch (e) {
    toast(e.message, true);
  }
});

$("#saveKeys").addEventListener("click", async () => {
  const body = {};
  const o = $("#kOpenrouter").value.trim();
  const g = $("#kGrok").value.trim();
  if (o) body.openrouter = o;
  if (g) body.grok = g;
  if (!o && !g) return toast("دخّل مفتاح واحد على الأقل", true);
  try {
    const out = await api("/api/ai/keys", { method: "POST", body: JSON.stringify(body) });
    $("#kOpenrouter").value = "";
    $("#kGrok").value = "";
    $("#keysStatus").textContent = `OpenRouter: ${out.providers.openrouter ? "✓" : "—"} · Grok: ${out.providers.grok ? "✓" : "—"}`;
    toast("تحفظات المفاتيح ✅");
  } catch (e) {
    toast(e.message, true);
  }
});

$("#saveModel").addEventListener("click", async () => {
  const model = $("#aiModelInput").value.trim();
  if (!model) return;
  await api("/api/ai/model", { method: "POST", body: JSON.stringify({ model }) });
  toast("تبدّل النموذج");
});

$("#bcBtn").addEventListener("click", async (e) => {
  const text = $("#bcText").value.trim();
  if (text.length < 3) return toast("اكتب نص الرسالة", true);
  e.target.disabled = true;
  try {
    const d = await api("/api/broadcast", { method: "POST", body: JSON.stringify({ text }) });
    toast(`بدأ البثّ لـ ${num(d.job.total)} مستخدم`);
    pollBroadcast();
  } catch (e2) {
    toast(e2.message, true);
    e.target.disabled = false;
  }
});

function pollBroadcast() {
  clearInterval(pollBroadcast._t);
  pollBroadcast._t = setInterval(async () => {
    try {
      const d = await api("/api/broadcast");
      if (!d.job) return;
      const j = d.job;
      $("#bcStatus").textContent = `أُرسل ${num(j.sent)} · فشل ${num(j.failed)} · محظور ${num(j.blocked)}${j.done ? " · انتهى" : ""}`;
      if (j.done) {
        clearInterval(pollBroadcast._t);
        $("#bcBtn").disabled = false;
      }
    } catch {
      clearInterval(pollBroadcast._t);
    }
  }, 2500);
}

/* ══════════════ تغيير كلمة السر ══════════════ */

$("#pwBtn").addEventListener("click", () => {
  $("#pwModal").hidden = false;
  $("#pwErr").textContent = "";
  $("#pwCurrent").value = $("#pwNext").value = $("#pwNext2").value = "";
  setTimeout(() => $("#pwCurrent").focus(), 60);
});

$("#pwForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#pwErr");
  err.textContent = "";
  const cur = $("#pwCurrent").value;
  const next = $("#pwNext").value;
  const next2 = $("#pwNext2").value;
  if (next !== next2) {
    err.textContent = "التأكيد ماشي مطابق";
    return;
  }
  try {
    await api("/api/auth/password", { method: "POST", body: JSON.stringify({ current: cur, next }) });
    $("#pwModal").hidden = true;
    toast("تبدّلت كلمة السر — عاود دخّل");
    setTimeout(() => location.reload(), 900);
  } catch (e2) {
    err.textContent = e2.message;
  }
});

/* ══════════════ درج المستخدم ══════════════ */

async function openUser(id) {
  const drawer = $("#drawer");
  const card = $("#drawerCard");
  drawer.hidden = false;
  card.replaceChildren(el("div", { class: "sk", style: "height:120px;margin-bottom:12px" }), el("div", { class: "sk", style: "height:240px" }));
  try {
    const d = await api(`/api/users/${id}`);
    const u = d.user;
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || (u.username ? "@" + u.username : `#${u.tg_id}`);
    const inviter = d.inviter;

    card.replaceChildren(
      el("div", { class: "profile-head" },
        avatar({ tg_id: u.tg_id, avatar_version: u.avatar_version }, "av lg"),
        el("div", { style: "min-width:0;flex:1" },
          el("h3", { text: name }),
          el("div", { class: "muted small", text: u.username ? "@" + u.username : "بلا يوزر" }),
          el("div", { style: "display:flex;gap:6px;margin-top:6px;flex-wrap:wrap" },
            el("span", { class: `chip ${u.blocked ? "bad" : "ok"}`, text: u.blocked ? "🛑 محظور" : "✅ نشط" }),
            u.risk_score >= 40 ? el("span", { class: "chip warn", text: `⚠️ خطر ${u.risk_score}` }) : null,
            u.is_premium ? el("span", { class: "chip", text: "⭐ بريميوم" }) : null,
            u.lock ? el("span", { class: "chip warn", text: `⏳ تهدئة ${Math.ceil((u.lock.until - Date.now()) / 1000)}ث` }) : null
          )
        ),
        el("button", { class: "ghost sm", text: "✕", onclick: () => (drawer.hidden = true) })
      ),
      el("div", { class: "profile-stats" },
        ps("النقاط", num(u.points)), ps("الإحالات", num(d.stats.invites)), ps("مفعّلة", num(d.stats.confirmed)),
        ps("مشبوهة", num(d.stats.flagged)), ps("الأسئلة", num(d.quiz.total)), ps("الدقة", d.quiz.accuracy + "%")
      ),
      el("div", { class: "sec-title", text: "🔗 من طرف شكون دخل" }),
      inviter
        ? el("div", { class: "mini-row" }, avatar({ tg_id: inviter.tg_id, avatar_version: inviter.avatar_version }),
            el("div", { class: "who" }, el("b", { text: [inviter.first_name, inviter.last_name].filter(Boolean).join(" ") || "@" + inviter.username }), el("span", { text: `${inviter.username ? "@" + inviter.username : "#" + inviter.tg_id} · ${dt(inviter.event?.at)}` })),
            el("button", { class: "ghost sm", text: "فتح", onclick: () => openUser(inviter.tg_id) }))
        : el("div", { class: "muted small", text: "دخل مباشرة بلا إحالة." }),
      el("div", { class: "sec-title", text: `👥 اللي جابهم (${d.invites.length})` }),
      d.invites.length
        ? el("div", { class: "mini-list" }, ...d.invites.map((r) =>
            el("div", { class: "mini-row", style: "cursor:pointer", onclick: () => openUser(r.tg_id) },
              avatar({ tg_id: r.tg_id, avatar_version: r.avatar_version }),
              el("div", { class: "who" }, el("b", { text: r.name || "@" + r.username }), el("span", { text: `${r.username ? "@" + r.username : "#" + r.tg_id} · ${ago(r.at)}` })),
              el("span", { class: `chip ${r.status === "confirmed" ? "ok" : r.status === "flagged" ? "bad" : "warn"}`, text: r.status === "confirmed" ? "✅" : r.status === "flagged" ? "⚠️" : "⏳" })
            )))
        : el("div", { class: "muted small", text: "ما جاب حتى واحد مازال." }),
      el("div", { class: "sec-title", text: "📒 آخر حركات النقاط" }),
      el("table", { class: "mini-table" }, ...d.ledger.slice(0, 10).map((l) => el("tr", {}, el("td", { text: l.reason }), el("td", { text: `${l.delta > 0 ? "+" : ""}${num(l.delta)}` }), el("td", { text: dt(l.at) })))),
      el("div", { class: "sec-title", text: "🛡️ سجل الحماية" }),
      d.riskEvents.length
        ? el("table", { class: "mini-table" }, ...d.riskEvents.slice(0, 7).map((e) => el("tr", {}, el("td", { text: e.kind }), el("td", { text: (e.detail ?? "").slice(0, 40) }), el("td", { text: dt(e.at) }))))
        : el("div", { class: "muted small", text: "نظيف ✅" }),
      el("div", { class: "actions" },
        el("button", { class: u.blocked ? "ok" : "danger", text: u.blocked ? "🔓 فك الحظر" : "🛑 حظر", onclick: async () => {
          await api(`/api/users/${u.tg_id}`, { method: "POST", body: JSON.stringify({ action: u.blocked ? "unblock" : "block", reason: "من لوحة التحكم" }) });
          toast(u.blocked ? "تفك الحظر" : "تحظر");
          openUser(id);
        }}),
        el("button", { text: "+100 نقطة", onclick: async () => {
          await api(`/api/users/${u.tg_id}`, { method: "POST", body: JSON.stringify({ action: "points", delta: 100, reason: "bonus" }) });
          toast("+100 نقطة"); openUser(id);
        }}),
        el("button", { text: "تصفير الخطر", onclick: async () => {
          await api(`/api/users/${u.tg_id}`, { method: "POST", body: JSON.stringify({ action: "reset-risk" }) });
          toast("تصفّر"); openUser(id);
        }}),
        el("button", { text: "🧠 اطلب من العقل", onclick: () => { drawer.hidden = true; setTab("ai"); $("#aiInput").value = `دير تشخيص كامل للمستخدم ${u.tg_id} وقلي واش خاصو`; $("#aiInput").focus(); }})
      )
    );
  } catch (e) {
    card.replaceChildren(el("div", { class: "err", text: e.message }));
  }
}

function ps(k, v) {
  return el("div", { class: "ps" }, el("b", { text: v }), el("span", { text: k }));
}

$("#drawer").addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) $("#drawer").hidden = true;
});
$("#pwModal").addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) $("#pwModal").hidden = true;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    $("#drawer").hidden = true;
    $("#pwModal").hidden = true;
    $(".side")?.classList.remove("open");
  }
});

/* drag & drop على الشاشة كلها لصور العقل */
document.addEventListener("dragover", (e) => {
  if (state.tab !== "ai") return;
  e.preventDefault();
});
document.addEventListener("drop", (e) => {
  if (state.tab !== "ai") return;
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  e.preventDefault();
  $("#aiFile").files = files;
  $("#aiFile").dispatchEvent(new Event("change"));
});

/* ══════════════ الإقلاع ══════════════ */

const startTab = location.hash.replace("#", "");
if (TITLES[startTab]) state.tab = startTab;
$$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === state.tab));
$$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${state.tab}`));
$("#pageTitle").textContent = TITLES[state.tab];

checkSession();
