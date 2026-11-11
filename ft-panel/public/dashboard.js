const Q = String.fromCharCode(39);
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s == null ? "" : s)
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;")
    .split(Q)
    .join("&#39;")
    .split('"')
    .join("&quot;");
let TOKEN = localStorage.getItem("ftp") || "";
const HISTORY_KEY = "ft-agent-history-v1";
let HIST = [];
try {
  const saved = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
  if (Array.isArray(saved)) HIST = saved.filter(h => h && ["user", "assistant"].includes(h.role) && typeof h.content === "string");
} catch { /* the current session starts empty if storage is unavailable */ }
function saveHistory() { try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(HIST)); } catch { /* chat still works for this page */ } }
function requestId() { return globalThis.crypto?.randomUUID?.() || `request_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
let PRIZES = [];
let EDIT = null;
let RF = "pending";
let AI_BUSY = false;
let AI_IMAGE = "";
const TITLES = {
  ai: "المساعد",
  instructions: "تعليمات المساعد",
  bot: "إدارة FT-bot",
  stats: "الأرقام",
  prizes: "الجوائز",
  reqs: "الطلبات",
  users: "الأعضاء",
  referrals: "الإحالات",
  set: "الإعدادات",
};
const ST = { pending: "معلّق", approved: "مقبول", rejected: "مرفوض" };
function toast(m, bad) {
  const t = $("#toast");
  t.textContent = m;
  t.className = "show" + (bad ? " bad" : "");
  clearTimeout(toast.h);
  toast.h = setTimeout(() => {
    t.className = "";
  }, 3200);
}
async function api(action, data) {
  const options = {
    method: "POST",
    headers: { "content-type": "application/json", "x-token": TOKEN },
    body: JSON.stringify(Object.assign({ action }, data || {})),
  };
  let r;
  try {
    r = await fetch("/api/admin", options);
  } catch (error) {
    // Only AI requests with an idempotency key may be retried after a network error.
    if (action !== "ai" || !data?.requestId) throw error;
    r = await fetch("/api/admin", options);
  }
  const j = await r.json().catch(() => ({ error: "خطأ في الشبكة" }));
  if (r.status === 401) {
    logout();
    throw new Error("انتهت الجلسة، ادخل من جديد");
  }
  if (!j.ok) throw new Error(j.error || "خطأ");
  return j.data !== undefined ? j.data : j;
}
// A browser drives bounded, durable server-side batches. Closing the page
// pauses further batches; the saved job ID can be resumed without resending.
const BROADCAST_KEY = 'ft-active-broadcast-v1';
const BROADCAST_RUNNING = new Set();
const sleepBroadcast = ms => new Promise(resolve => setTimeout(resolve, ms));
function broadcastProgress(status, message = '') {
  const box = $('#broadcast-progress');
  if (!box) return;
  box.hidden = false;
  const counts = status && Number.isFinite(Number(status.total))
    ? `المسجلون ${status.total} · أُرسل ${status.sent} · فشل ${status.failed} · محظور ${status.excludedBanned} · غير مؤكد ${status.unknown} · متبقٍ ${status.remaining}` : '';
  const done = status?.done;
  box.innerHTML = `<b>${esc(message || (done ? 'انتهت معالجة البث' : 'البث جارٍ'))}</b><small>${esc(counts)}</small>` +
    (!done && status?.jobId ? `<button type="button" class="sm" data-act="broadcast-resume" data-id="${esc(status.jobId)}">استئناف البث</button>` : '') +
    `<small>أبقِ الصفحة مفتوحة لمتابعة الدفعات. لا تُعاد المحاولات غير المؤكدة تلقائياً.</small>`;
}
async function resumeBroadcast(jobId) {
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(String(jobId || '')) || BROADCAST_RUNNING.has(jobId)) return;
  BROADCAST_RUNNING.add(jobId);
  localStorage.setItem(BROADCAST_KEY, jobId);
  let last = { jobId };
  broadcastProgress(last, 'جارٍ متابعة البث…');
  try {
    while (TOKEN) {
      last = await api('bot_manage', { op: 'broadcast_step', input: { jobId } });
      broadcastProgress(last, last.busy ? 'تنتظر الدفعة انتهاء عملية أخرى…' : 'متابعة البث…');
      if (last.done) {
        if (localStorage.getItem(BROADCAST_KEY) === jobId) localStorage.removeItem(BROADCAST_KEY);
        broadcastProgress(last, 'انتهت معالجة البث');
        return;
      }
      await sleepBroadcast(last.busy ? 2000 : Math.max(250, Math.min(30000, Number(last.retryAfterMs) || 0)));
    }
  } catch (error) {
    if (/البث غير موجود/.test(error.message)) {
      if (localStorage.getItem(BROADCAST_KEY) === jobId) localStorage.removeItem(BROADCAST_KEY);
      broadcastProgress({ ...last, done: true }, 'لم تُنشأ مهمة بهذا المعرّف؛ يمكنك بدء بث جديد.');
    } else broadcastProgress(last, 'توقفت المتابعة: ' + error.message + ' — استأنف بنفس البث ولا تبدأ بثاً جديداً.');
  } finally { BROADCAST_RUNNING.delete(jobId); }
}
function startBroadcastFromAction(action) {
  if (!action?.ok || action.tool !== 'ft_broadcast_all') return;
  try {
    const result = JSON.parse(action.result);
    if (result.jobId) void resumeBroadcast(result.jobId);
  } catch { /* A missing result must not create or replay a broadcast. */ }
}
async function loadInstructions() {
  const status = $('#instructions-status');
  try {
    const data = await api('agent_instructions_get');
    $('#instructions-text').value = data.text || '';
    status.textContent = data.updatedAt ? 'محفوظة ومفعّلة للمحادثات التالية.' : 'لا توجد تعليمات إضافية محفوظة.';
  } catch (error) { status.textContent = error.message; }
}
$('#instructions-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  try {
    await api('agent_instructions_save', { text: $('#instructions-text').value });
    $('#instructions-status').textContent = 'حُفظت التعليمات للمحادثات التالية.';
    toast('حُفظت تعليمات المساعد');
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});
function logout() {
  localStorage.removeItem("ftp");
  try { sessionStorage.removeItem(HISTORY_KEY); } catch {}
  HIST = [];
  $("#chat").innerHTML = "";
  TOKEN = "";
  $("#app").hidden = true;
  $("#login").hidden = false;
}
async function login(pw) {
  const r = await fetch("/api/admin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "login", password: pw }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "خطأ");
  TOKEN = j.token;
  localStorage.setItem("ftp", TOKEN);
}
function show(t) {
  document.querySelectorAll("main>section").forEach((s) => {
    s.hidden = s.id !== "t-" + t;
  });
  document
    .querySelectorAll("#nav button")
    .forEach((b) => b.classList.toggle("on", b.dataset.t === t));
  $("#ttl").textContent = TITLES[t];
  if (LOAD[t]) LOAD[t]();
}
function fail(el, e) {
  el.innerHTML = "<p class=err>" + esc(e.message) + "</p>";
}
async function loadStats() {
  const el = $("#t-stats");
  el.innerHTML = "<p class=mute>جارٍ التحميل…</p>";
  try {
    const [s, top] = await Promise.all([
      api("stats"),
      api("top", { by: "points", limit: 10 }),
    ]);
    el.innerHTML = `<p class='scope-note'>أرقام اللوحة القديمة (Redis) منفصلة عن FT-bot. <button class='sm' data-act='open-bot'>أرقام البوت الفعلي</button></p><div class='grid'>${[
      ["المستخدمون", s.users],
      ["مجموع النقاط", s.totalPoints],
      ["الإحالات", s.totalRefs],
      ["طلبات معلّقة", s.pendingRequests],
      ["كل الطلبات", s.totalRequests],
      ["الجوائز", s.prizes],
      ["المحظورون", s.banned],
      ["الزيارات", s.visits],
    ]
      .map(
        (x) =>
          `<div class='stat'><b>${esc(x[1])}</b><span>${x[0]}</span></div>`,
      )
      .join(
        "",
      )}</div><h3>الأكثر نقاطاً</h3>${top.map((u) => `<div class='item'><div><b>${esc(u.name)}</b><small>${u.username ? "@" + esc(u.username) + " · " : ""}${u.id}</small></div><span class='num'>${u.points}</span></div>`).join("")}`;
  } catch (e) {
    fail(el, e);
  }
}
async function loadPrizes() {
  const el = $("#t-prizes");
  try {
    PRIZES = await api("prizes");
    el.innerHTML =
      `<p class='scope-note'>جوائز اللوحة القديمة (Redis) منفصلة عن متجر FT-bot. <button class='sm' data-act='open-bot'>إدارة جوائز البوت الفعلي</button></p><button class='btn full' data-act='padd'>+ إضافة جائزة للوحة القديمة</button>` +
      PRIZES.map(
        (p) =>
          `<div class='item'><div><b>${esc(p.emoji)} ${esc(p.title)}</b><small>${p.cost} نقطة${p.available ? "" : " · غير متوفرة"}</small></div><div class='acts'><button class='sm' data-act='pedit' data-id='${esc(p.id)}'>تعديل</button><button class='sm' data-act='pav' data-id='${esc(p.id)}' data-v='${p.available ? 0 : 1}'>${p.available ? "إيقاف" : "تفعيل"}</button><button class='sm red' data-act='pdel' data-id='${esc(p.id)}'>حذف</button></div></div>`,
      ).join("");
    el.insertAdjacentHTML("beforeend", `<div id='bot-media' class='media-list'><h3>صور مسابقات وجوائز FT-bot</h3><p class='mute'>جارٍ التحميل…</p></div>`);
    loadBotMedia();
  } catch (e) {
    fail(el, e);
  }
}
async function loadBotMedia() {
  const el = $("#bot-media");
  if (!el) return;
  try {
    const media = await api("bot_media");
    const group = (title, items, kind) => `<h3>${title}</h3>` + (items.length ? items.map((item) => `
      <div class='item'><div><b>${esc(item.title)}</b><small>${item.hasImage ? "توجد صورة" : "بدون صورة"}</small></div>
      <div class='acts wrap'><label class='sm upload-label'><input type='file' accept='image/jpeg,image/png,image/webp,image/gif' data-img-kind='${kind}' data-img-id='${esc(item.id)}'><span>رفع صورة</span></label>
      ${item.hasImage ? `<button class='sm red' data-act='remove-image' data-kind='${kind}' data-id='${esc(item.id)}'>حذف الصورة</button>` : ""}</div></div>`).join("") : `<p class='mute'>لا توجد عناصر.</p>`);
    el.innerHTML = `<h3>صور مسابقات وجوائز FT-bot</h3><small class='mute'>الصور تظهر في البوت؛ الحد 1.4 ميغا للصورة.</small>` + group("المسابقات", media.contests, "contest") + group("جوائز البوت", media.rewards, "reward");
  } catch (error) {
    el.innerHTML = `<h3>صور مسابقات وجوائز FT-bot</h3><p class='err'>${esc(error.message)}</p><button class='sm' data-act='connect-settings'>إعداد ربط البوت</button>`;
  }
}
async function loadReqs() {
  const el = $("#t-reqs");
  try {
    const rs = await api("requests", { status: RF === "all" ? "" : RF });
    el.innerHTML =
      `<p class='scope-note'>طلبات اللوحة القديمة (Redis). طلبات FT-bot في قسم إدارة البوت.</p><div class='seg'><button data-act='rf' data-v='pending' class='${RF === "pending" ? "on" : ""}'>معلّقة</button><button data-act='rf' data-v='all' class='${RF === "all" ? "on" : ""}'>الكل</button></div>` +
      (rs.length
        ? rs
            .map(
              (r) =>
                `<div class='item col'><div><b>${esc(r.title)}</b><small>${esc(r.name)}${r.username ? " · @" + esc(r.username) : ""} · ${r.cost} نقطة · <em class='st ${esc(r.status)}'>${esc(ST[r.status] || r.status)}</em></small></div>${r.status === "pending" ? `<div class='acts wrap'><button class='sm ok' data-act='rq' data-id='${r.id}' data-v='approved'>موافقة</button><button class='sm red' data-act='rq' data-id='${r.id}' data-v='rejected'>رفض</button><button class='sm' data-act='rq' data-id='${r.id}' data-v='rejected' data-r='1'>رفض + إرجاع النقاط</button></div>` : ""}</div>`,
            )
            .join("")
        : `<p class='mute'>لا توجد طلبات.</p>`);
  } catch (e) {
    fail(el, e);
  }
}
function loadUsers() {
  $("#t-users").innerHTML =
    `<p class='scope-note'>بحث في مستخدمي اللوحة القديمة (Redis). أعضاء FT-bot في قسم إدارة البوت.</p><form id='uf' class='bar'><input id='uq' placeholder='معرّف أو @يوزر أو اسم'><button class='btn'>بحث</button></form><div id='ures'></div>`;
}
function userCard(u) {
  return `<div class='card'><b>${esc(u.name)}</b><small>${u.username ? "@" + esc(u.username) + " · " : ""}${u.id}</small><div class='big'>${u.points} <span>نقطة</span></div><small>${u.refs} إحالة${u.banned ? " · محظور" : ""}</small><div class='acts wrap'><button class='sm' data-act='up' data-id='${u.id}' data-v='10'>+10</button><button class='sm' data-act='up' data-id='${u.id}' data-v='50'>+50</button><button class='sm' data-act='up' data-id='${u.id}' data-v='-10'>-10</button><button class='sm' data-act='upc' data-id='${u.id}'>مبلغ آخر</button><button class='sm' data-act='umsg' data-id='${u.id}'>رسالة</button><button class='sm ${u.banned ? "" : "red"}' data-act='uban' data-id='${u.id}' data-v='${u.banned ? 0 : 1}'>${u.banned ? "فك الحظر" : "حظر"}</button></div></div>`;
}
function referralPerson(id, name, username) {
  const initial = String(name || "؟").trim().slice(0, 1) || "؟";
  return `<div class='person'><div class='avatar' data-avatar-id='${esc(id)}'><span>${esc(initial)}</span><img hidden alt=''></div><div><b>${esc(name || "مستخدم")}</b><small>${username ? "@" + esc(username) + " · " : ""}${esc(id)}</small></div></div>`;
}
async function loadReferrals() {
  const el = $("#t-referrals");
  el.innerHTML = "<p class='mute'>جارٍ تحميل الإحالات…</p>";
  try {
    const rows = await api("referrals", { limit: 50 });
    el.innerHTML = `<div class='card'><h3>الإحالات</h3><small>الأحدث أولاً · الصور تظهر عند توفرها من تيليغرام</small></div>` + (rows.length ? rows.map((row) => `
      <div class='card'>${referralPerson(row.joinerId, row.joinerName, row.joinerUsername)}
      <div class='ref-arrow'>انضمّ بدعوة من ↓</div>${referralPerson(row.inviterId, row.inviterName, row.inviterUsername)}
      <small>${esc(row.contestTitle || "رابط البوت")} · ${row.at ? esc(new Date(row.at).toLocaleString("ar-DZ")) : ""}</small></div>`).join("") : `<p class='mute'>لا توجد إحالات مسجّلة بعد.</p>`);
    const ids = [...new Set(rows.flatMap((row) => [String(row.inviterId), String(row.joinerId)]))];
    const batches = [];
    for (let i = 0; i < ids.length; i += 8) batches.push(ids.slice(i, i + 8));
    await Promise.all(batches.map(async (batch) => {
      try {
        const photos = await api("referral_photos", { ids: batch });
        el.querySelectorAll("[data-avatar-id]").forEach((avatar) => {
          const photo = photos[avatar.dataset.avatarId];
          if (!photo) return;
          const img = avatar.querySelector("img");
          img.src = photo;
          img.hidden = false;
          avatar.querySelector("span").hidden = true;
        });
      } catch { /* names and initials remain visible */ }
    }));
  } catch (error) {
    el.innerHTML = `<p class='err'>${esc(error.message)}</p><button class='sm' data-act='connect-settings'>إعداد ربط البوت</button>`;
  }
}
async function loadSet() {
  const el = $("#t-set");
  el.innerHTML = "<p class=mute>جارٍ التحميل…</p>";
  try {
    const [s, ch, connection] = await Promise.all([
      api("settings_get"),
      api("channels_get"),
      api("bot_connection").catch(() => ({ configured: false })),
    ]);
    el.innerHTML = `<div class='card'><h3>إعدادات اللوحة الأصلية: الإحالة والترحيب</h3><label>نقاط كل إحالة<input id='s_ref' type='number' min='0' value='${esc(s.refPoints)}'></label><label>رسالة الترحيب<textarea id='s_wel' rows='4'>${esc(s.welcome)}</textarea></label><label class='chk'><input id='s_en' type='checkbox' ${s.enabled !== false ? "checked" : ""}> البوت مفعّل</label><button class='btn' data-act='sset'>حفظ</button></div><div id='bot-ref-config' class='card'><h3>نقاط إحالات FT-bot</h3><small>جارٍ التحميل…</small></div><div class='card'><h3>قنوات اللوحة القديمة فقط</h3><textarea id='s_ch' rows='6' placeholder='@channel في كل سطر'>${esc(ch.map((c) => c.chat).join("\n"))}</textarea><button class='btn' data-act='sch'>حفظ القنوات</button><div id='chs' class='mute'></div><button class='sm' data-act='chk'>فحص صلاحيات البوت في القنوات</button></div><div class='card'><h3>بث لمستخدمي اللوحة القديمة فقط</h3><textarea id='s_bc' rows='4' placeholder='نص الرسالة'></textarea><button class='btn' data-act='bc'>إرسال للجميع</button></div><div class='card'><button class='sm' data-act='hl'>حالة البوت والويب هوك</button><pre id='hl' class='pre'></pre></div><form id='password-form' class='card'><h3>تغيير كلمة سر اللوحة</h3><label>كلمة السر الحالية<input id='pw-old' type='password' autocomplete='current-password' required></label><label>كلمة السر الجديدة (10 أحرف على الأقل)<input id='pw-new' type='password' minlength='10' maxlength='256' autocomplete='new-password' required></label><label>تأكيد كلمة السر الجديدة<input id='pw-confirm' type='password' minlength='10' maxlength='256' autocomplete='new-password' required></label><button class='btn' type='submit'>تغيير كلمة السر</button><small>تُغلق الجلسات القديمة بعد التغيير.</small></form><form id='bot-connect-form' class='card'><h3>ربط FT-bot</h3><small>${connection.configured ? "مفتاح الربط محفوظ؛ يمكنك تغييره أدناه." : "اربط البوت لعرض الإحالات ورفع صور مسابقاته وجوائزه."}</small><label>مفتاح PANEL_PUBLIC_KEY من إعدادات مشروع ft-bot في Vercel<input id='bot-key' type='password' autocomplete='off' minlength='8' maxlength='512' required></label><button class='btn' type='submit'>حفظ واختبار الربط</button><small>يُحفظ المفتاح مشفّراً ولا يُعرض مجدداً. لا ترسله في المحادثة.</small></form><button class='sm red' data-act='out'>تسجيل الخروج</button>`;
  loadReferralConfig();
  } catch (e) {
    fail(el, e);
  }
}
async function loadReferralConfig() {
  const el = $('#bot-ref-config');
  if (!el) return;
  try {
    const config = await api('referral_config');
    el.innerHTML = `<h3>نقاط إحالات FT-bot</h3><label>نقاط كل عضو جديد<input id='bot-ref-points' type='number' min='0' max='1000' value='${esc(config.perJoin)}'></label><small>${config.enabled ? 'نظام نقاط المتجر مفعّل.' : 'نظام نقاط المتجر معطّل في إعدادات البوت.'}</small><button class='btn' data-act='bot-ref-save'>حفظ نقاط إحالات البوت</button>`;
  } catch (error) { el.innerHTML = `<h3>نقاط إحالات FT-bot</h3><p class='err'>${esc(error.message)}</p>`; }
}
const LOAD = {
  instructions: loadInstructions,
  stats: loadStats,
  prizes: loadPrizes,
  reqs: loadReqs,
  users: loadUsers,
  referrals: loadReferrals,
  set: loadSet,
};
function openDlg(p) {
  $("#dt").textContent = EDIT ? "تعديل جائزة" : "جائزة جديدة";
  $("#d_title").value = p.title || "";
  $("#d_cost").value = p.cost || 0;
  $("#d_emoji").value = p.emoji || "🎁";
  $("#d_desc").value = p.desc || "";
  $("#dlg").showModal();
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const a = b.dataset.act,
    id = b.dataset.id,
    v = b.dataset.v;
  try {
    if (a === "broadcast-resume") {
      void resumeBroadcast(id);
    } else if (a === "padd") {
      EDIT = null;
      openDlg({});
    } else if (a === "pedit") {
      EDIT = id;
      openDlg(PRIZES.find((p) => p.id === id) || {});
    } else if (a === "pav") {
      await api("set_available", { ref: id, available: v === "1" });
      toast("تم");
      loadPrizes();
    } else if (a === "pdel") {
      if (!confirm("حذف هذه الجائزة نهائياً؟")) return;
      await api("delete_prize", { ref: id });
      toast("تم الحذف");
      loadPrizes();
    } else if (a === "rf") {
      RF = v;
      loadReqs();
    } else if (a === "rq") {
      const result = await api("set_request", {
        id: +id,
        status: v,
        refund: b.dataset.r === "1",
      });
      toast(result.notified ? "تم وأُشعر المستخدم" : "تم تحديث الطلب؛ لم يُرسل إشعار");
      loadReqs();
    } else if (a === "up" || a === "upc") {
      const n =
        a === "up" ? +v : parseInt(prompt("عدد النقاط (سالب للخصم)"), 10);
      if (isNaN(n)) return;
      const u = await api("add_points", { user: id, points: n });
      $("#ures").innerHTML = userCard(u);
      toast("الرصيد الآن " + u.points);
    } else if (a === "umsg") {
      const t = prompt("نص الرسالة");
      if (!t) return;
      await api("send", { user: id, text: t });
      toast("أُرسلت");
    } else if (a === "uban") {
      const u = await api("ban", { user: id, banned: v === "1" });
      $("#ures").innerHTML = userCard(u);
      toast("تم");
    } else if (a === "sset") {
      await api("settings_set", {
        refPoints: $("#s_ref").value,
        welcome: $("#s_wel").value,
        enabled: $("#s_en").checked,
      });
      toast("تم الحفظ");
    } else if (a === "bot-ref-save") {
      b.disabled = true;
      await api('referral_config_set', { perJoin: Number($('#bot-ref-points').value) });
      toast('تم حفظ نقاط إحالات FT-bot');
      await loadReferralConfig();
    } else if (a === "sch") {
      const list = $("#s_ch")
        .value.split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
      const out = await api("channels_set", { channels: list });
      toast("حُفظت " + out.length + " قنوات");
    } else if (a === "chk") {
      $("#chs").textContent = "جارٍ الفحص…";
      const h = await api("health");
      $("#chs").innerHTML = h.channels
        .map(
          (c) =>
            esc(c.chat) +
            ": " +
            (c.botStatus === "administrator" || c.botStatus === "creator"
              ? "✓ أدمين"
              : "✗ " + esc(c.botStatus + (c.error ? " — " + c.error : ""))),
        )
        .join("<br>");
    } else if (a === "bc") {
      const t = $("#s_bc").value.trim();
      if (!t) return;
      if (!confirm("إرسال هذه الرسالة لكل المستخدمين؟")) return;
      b.disabled = true;
      const r = await api("broadcast", { text: t });
      b.disabled = false;
      toast("أُرسلت إلى " + r.sent + " من " + r.total);
    } else if (a === "hl") {
      const h = await api("health");
      $("#hl").textContent = JSON.stringify(h, null, 2);
    } else if (a === "connect-settings") {
      show("set");
    } else if (a === "remove-image") {
      if (!confirm("حذف الصورة من البوت؟")) return;
      b.disabled = true;
      await api("bot_image", { kind: b.dataset.kind, id, dataUrl: "" });
      toast("تم حذف الصورة");
      loadBotMedia();
    } else if (a === "out") {
      logout();
    }
  } catch (err) {
    toast(err.message, 1);
    b.disabled = false;
  }
});
document.addEventListener("change", async (event) => {
  const input = event.target.closest("input[data-img-kind]");
  if (!input || !input.files?.[0]) return;
  const file = input.files[0];
  if (!/^(image\/(jpeg|png|webp|gif))$/.test(file.type) || file.size > 1400000) {
    toast("اختر صورة JPG أو PNG أو WEBP أو GIF لا تتجاوز 1.4 ميغا", true);
    input.value = "";
    return;
  }
  input.disabled = true;
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("تعذّرت قراءة الصورة"));
      reader.readAsDataURL(file);
    });
    await api("bot_image", { kind: input.dataset.imgKind, id: input.dataset.imgId, dataUrl });
    toast("تم حفظ الصورة في البوت");
    loadBotMedia();
  } catch (error) { toast(error.message, true); }
  finally { input.disabled = false; input.value = ""; }
});
document.addEventListener("submit", async (e) => {
  if (e.target.id === "password-form") {
    e.preventDefault();
    const button = e.target.querySelector("button");
    if ($("#pw-new").value !== $("#pw-confirm").value) return toast("تأكيد كلمة السر غير مطابق", true);
    button.disabled = true;
    try {
      const result = await api("password_set", { oldPassword: $("#pw-old").value, newPassword: $("#pw-new").value });
      TOKEN = result.token;
      localStorage.setItem("ftp", TOKEN);
      e.target.reset();
      toast("تغيّرت كلمة السر وأُغلقت الجلسات القديمة");
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  } else if (e.target.id === "bot-connect-form") {
    e.preventDefault();
    const button = e.target.querySelector("button");
    button.disabled = true;
    try {
      await api("bot_connect", { key: $("#bot-key").value });
      e.target.reset();
      toast("تم ربط FT-bot بنجاح");
      loadSet();
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  } else if (e.target.id === "uf") {
    e.preventDefault();
    try {
      const u = await api("find_user", { user: $("#uq").value });
      $("#ures").innerHTML = userCard(u);
    } catch (err) {
      $("#ures").innerHTML = "<p class=err>" + esc(err.message) + "</p>";
    }
  } else if (e.target.id === "df") {
    e.preventDefault();
    try {
      await api("save_prize", {
        prize: {
          id: EDIT || undefined,
          title: $("#d_title").value,
          cost: $("#d_cost").value,
          emoji: $("#d_emoji").value,
          desc: $("#d_desc").value,
        },
      });
      $("#dlg").close();
      toast("تم الحفظ");
      loadPrizes();
    } catch (err) {
      toast(err.message, 1);
    }
  }
});
$("#d_cancel").onclick = () => $("#dlg").close();
function bubble(role, html) {
  const d = document.createElement("div");
  d.className = "msg " + role;
  d.innerHTML = html;
  $("#chat").appendChild(d);
  d.scrollIntoView({ block: "end" });
  return d;
}
function renderAction(a) {
  const label = a.skipped ? "↷" : a.ok ? "✓" : "✗";
  const details = a.diff ? `<details class='diff'><summary>عرض الفرق</summary><pre dir='ltr'>${esc(a.diff)}</pre></details>` : "";
  return `<details class='act ${a.ok ? "ok" : "bad"}'><summary>${label} ${esc(a.tool)}</summary><pre dir='auto'>${esc(JSON.stringify(a.args || {}))}\n${esc(a.result || "")}</pre>${details}</details>`;
}
async function aiRequest(data, onProgress) {
  const options = { method: "POST", headers: { "content-type": "application/json", "x-token": TOKEN, accept: "text/event-stream" }, body: JSON.stringify({ action: "ai", ...data }) };
  let response;
  try { response = await fetch("/api/admin", options); }
  catch { response = await fetch("/api/admin", options); } // same id: the server never replays a write
  if (response.status === 401) { logout(); throw new Error("انتهت الجلسة، ادخل من جديد"); }
  const streaming = response.headers?.get?.("content-type")?.includes("text/event-stream") && response.body?.getReader;
  if (!streaming) {
    const json = await response.json().catch(() => ({ error: "خطأ في الشبكة" }));
    if (!json.ok) throw new Error(json.error || "خطأ");
    return json.data;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", result = null, failure = "";
  const processEvent = (block) => {
    let event = "message"; const dataLines = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    let payload; try { payload = JSON.parse(dataLines.join("\n")); } catch { return; }
    if (event === "progress") onProgress(payload);
    else if (event === "result") result = payload.data;
    else if (event === "error") failure = payload.error || "تعذّر تنفيذ الطلب";
  };
  while (true) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done }).replace(/\r\n/g, "\n");
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) { processEvent(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); }
    if (chunk.done) break;
  }
  if (failure) throw new Error(failure);
  if (!result) throw new Error("انقطع البث قبل تأكيد النتيجة؛ راجع السجل قبل إعادة الطلب");
  return result;
}
async function ask(q, image = "") {
  if (AI_BUSY) return;
  AI_BUSY = true;
  bubble("me", esc(q || "صورة مرفقة") + (image ? `<img class="chat-image" src="${esc(image)}" alt="الصورة المرفقة">` : ""));
  const w = bubble("bot", "<span class=mute>…</span>"), progressActions = [];
  $("#aq").disabled = true;
  $("#ai-image").disabled = true;
  try {
    const r = await aiRequest({ prompt: q, history: HIST, image: image || undefined, requestId: requestId() }, event => {
      if (event.type === "heartbeat") return;
      if (event.type === "tool_end" && event.action) { progressActions.push(event.action); startBroadcastFromAction(event.action); }
      const status = event.type === "tool_start" ? `تنفيذ ${event.tool}…` : event.message || "جارٍ العمل…";
      w.innerHTML = `<span class='agent-progress'>${esc(status)}</span>` + progressActions.map(renderAction).join("");
    });
    (r.actions || []).forEach(startBroadcastFromAction);
    HIST.push(
      { role: "user", content: (q || "اشرح الصورة") + (image ? " [صورة مرفقة]" : "") },
      { role: "assistant", content: r.reply },
    );
    saveHistory();
    if (image && r.retainImage) restoreAiImage(image);
    w.innerHTML = esc(r.reply).split("\n").join("<br>") + (r.actions || []).map(renderAction).join("");
  } catch (err) {
    if (image) restoreAiImage(image);
    if (!$("#aq").value) $("#aq").value = q;
    w.innerHTML = "<span class=err>" + esc(err.message) + "</span>" + progressActions.map(renderAction).join("");
  } finally {
    AI_BUSY = false;
    $("#aq").disabled = false;
    $("#ai-image").disabled = false;
    $("#aq").focus();
  }
}
function renderAgentResult(data) {
  const statuses = (data.deployments || []).filter(d => d.id).map(d => `<button class='sm' type='button' data-agent-status='${esc(d.id)}'>حالة ${esc(d.project)}</button>`).join(" ");
  return `<pre dir='auto'>${esc(JSON.stringify(data, null, 2))}</pre>${statuses}`;
}
async function agentButton(button, action) {
  if (AI_BUSY || button.disabled) return;
  if (action === "agent_deploy" && !confirm("نشر المسودات إلى GitHub وبدء بناء الإنتاج؟")) return;
  button.disabled = true;
  const w = bubble("bot", "<span class='agent-progress'>جارٍ التنفيذ…</span>");
  try {
    const data = await api(action, ["agent_deploy", "agent_undo"].includes(action) ? { requestId: requestId() } : {});
    if (action === "agent_diff") w.innerHTML = data.files?.length ? data.files.map(f => `<details class='diff' open><summary>${esc(f.path)}</summary><pre dir='ltr'>${esc(f.diff)}</pre></details>`).join("") : "لا توجد مسودات.";
    else if (action === "agent_history") w.innerHTML = data.length ? data.map(item => `<div class='agent-history-row'><b>${esc(item.type)}</b> · ${esc(item.status)} <small>${esc(item.detail)} · ${esc(new Date(item.at).toLocaleString("ar-DZ"))}</small></div>`).join("") : "السجل فارغ.";
    else w.innerHTML = renderAgentResult(data);
  } catch (error) { w.innerHTML = `<span class='err'>${esc(error.message)}</span>`; }
  finally { button.disabled = false; }
}
$("#agent-diff").addEventListener("click", e => agentButton(e.currentTarget, "agent_diff"));
$("#agent-deploy").addEventListener("click", e => agentButton(e.currentTarget, "agent_deploy"));
$("#agent-undo").addEventListener("click", e => agentButton(e.currentTarget, "agent_undo"));
$("#agent-history").addEventListener("click", e => agentButton(e.currentTarget, "agent_history"));
$("#agent-clear").addEventListener("click", () => {
  if (AI_BUSY || !confirm("بدء محادثة جديدة؟ ستبقى المسودات والنسخ محفوظة.")) return;
  HIST = []; saveHistory(); $("#chat").innerHTML = ""; clearAiImage();
  bubble("bot", "محادثة جديدة. المسودات والنسخ السابقة لم تُحذف.");
});
document.addEventListener("click", async event => {
  const button = event.target.closest("[data-agent-status]");
  if (!button || button.disabled) return;
  button.disabled = true;
  try { bubble("bot", renderAgentResult(await api("agent_deploy_status", { id: button.dataset.agentStatus }))); }
  catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});
$("#aq").addEventListener("keydown", event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $("#af").requestSubmit(); } });
$("#af").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#aq").value.trim();
  if ((!q && !AI_IMAGE) || AI_BUSY) return;
  const image = AI_IMAGE;
  $("#aq").value = "";
  clearAiImage();
  ask(q, image);
});
function restoreAiImage(image) {
  AI_IMAGE = image;
  $("#ai-preview").src = image;
  $("#ai-attachment").hidden = false;
}
function clearAiImage() {
  AI_IMAGE = "";
  $("#ai-image").value = "";
  $("#ai-preview").removeAttribute("src");
  $("#ai-attachment").hidden = true;
}
$("#ai-remove").addEventListener("click", clearAiImage);
$("#ai-image").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > 1400000) {
    clearAiImage();
    return toast("اختر صورة JPG أو PNG أو WEBP أو GIF لا تتجاوز 1.4 ميغا", true);
  }
  try {
    AI_IMAGE = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("تعذّرت قراءة الصورة"));
      reader.readAsDataURL(file);
    });
    $("#ai-preview").src = AI_IMAGE;
    $("#ai-attachment").hidden = false;
  } catch (error) { clearAiImage(); toast(error.message, true); }
});
document.querySelectorAll(".chips button").forEach((b) => {
  b.onclick = () => ask(b.dataset.q);
});
document.querySelectorAll("#nav button").forEach((b) => {
  b.onclick = () => show(b.dataset.t);
});
$("#lf").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await login($("#pw").value);
    start();
  } catch (err) {
    $("#lerr").textContent = err.message;
  }
});
function start() {
  $("#login").hidden = true;
  $("#app").hidden = false;
  show("ai");
  const pendingBroadcast = localStorage.getItem(BROADCAST_KEY);
  if (pendingBroadcast) void resumeBroadcast(pendingBroadcast);
  api("health", { light: true })
    .then((h) => {
      $("#bot").textContent = h.bot;
    })
    .catch(() => {
      $("#bot").textContent = "—";
    });
  if (!$("#chat").children.length) {
    if (HIST.length) HIST.forEach(h => bubble(h.role === "user" ? "me" : "bot", esc(h.content).split("\n").join("<br>")));
    else bubble("bot", "أهلاً! أستطيع إدارة FT-bot وتطوير كوده، مراجعة المسودات والاختبار والنشر عند تهيئة التكامل. يمكنك إرفاق صورة أو حفظها على جائزة أو مسابقة.");
  }
}
if (TOKEN) start();
