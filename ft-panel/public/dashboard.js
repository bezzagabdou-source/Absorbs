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
let AI_BUSY = false;
let AI_IMAGE = "";
const TITLES = {
  ai: "المساعد",
  instructions: "تعليمات المساعد",
  bot: "إدارة FT-bot",
  referrals: "الإحالات",
  set: "الإعدادات",
};
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
  const done = status?.done, reasons = status?.failureReasons;
  const explanation = reasons && status.failed ? `حظروا البوت ${reasons.blocked} · لم يبدأوا المحادثة ${reasons.notStarted} · حسابات غير نشطة ${reasons.deactivated} · اتصال ${reasons.network || 0} · أسباب أخرى أو قديمة ${reasons.other}` : '';
  box.innerHTML = `<b>${esc(message || (done ? 'انتهت معالجة البث' : 'البث جارٍ'))}</b><small>${esc(counts)}</small>` +
    (explanation ? `<small>${esc(explanation)}</small>` : '') +
    (status?.problem ? `<small class="err">${esc(status.problem)}</small>` : '') +
    (!done && status?.jobId ? `<button type="button" class="sm" data-act="broadcast-resume" data-id="${esc(status.jobId)}">استئناف البث</button>` : '') +
    (done && status?.failed > 0 && status?.jobId ? `<button type="button" class="sm" data-act="broadcast-retry" data-id="${esc(status.jobId)}">إعادة محاولة المرفوضين فقط</button>` : '') +
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
      broadcastProgress(last, last.problem || (last.busy ? 'تنتظر الدفعة انتهاء عملية أخرى…' : 'متابعة البث…'));
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
  if (!action?.ok || !['ft_broadcast_all', 'ft_broadcast_retry'].includes(action.tool)) return;
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
    const [connection, health] = await Promise.all([
      api("bot_connection").catch(() => ({ configured: false })),
      api("bot_health").catch((error) => ({ error: error.message })),
    ]);
    const online = health && !health.error;
    const status = online
      ? `<div class='item'><div><b>✅ متصل بـ FT-bot${health.telegram && health.telegram.username ? " · @" + esc(health.telegram.username) : ""}</b><small>${esc(health.origin || "")} · ${esc(String(health.users || 0))} عضو مسجّل · تخزين ${esc((health.storage && health.storage.backend) || "—")}${health.commit ? " · إصدار " + esc(String(health.commit).slice(0, 7)) : ""}</small></div></div>`
      : `<p class='err'>${esc(health && health.error ? health.error : "تعذّر فحص البوت")}</p>`;
    el.innerHTML =
      `<div class='card'><h3>حالة الربط</h3>${status}<button class='sm' data-act='bot-recheck'>إعادة الفحص</button><small>${connection.configured ? "مفتاح الربط محفوظ ومشفّر." : "لم يُحفظ مفتاح الربط بعد."}</small></div>` +
      `<div class='card'><h3>نقل بيانات اللوحة القديمة → FT-bot</h3><small>تُقرأ بيانات اللوحة القديمة (المستخدمون والنقاط والجوائز والطلبات والقنوات) وتُنقل إلى قاعدة FT-bot. لا يُحذف شيء من المصدر، وإعادة التشغيل آمنة ولا تضاعف النقاط.</small><button class='btn' data-act='legacy-scan'>فحص البيانات القديمة</button><div id='migration' class='mute'></div></div>` +
      `<div id='bot-ref-config' class='card'><h3>نقاط إحالات FT-bot</h3><small>جارٍ التحميل…</small></div>` +
      `<form id='bot-connect-form' class='card'><h3>ربط FT-bot</h3><small>${connection.configured ? "المفتاح محفوظ؛ يمكنك تغييره أدناه." : "أدخل مفتاح PANEL_PUBLIC_KEY من مشروع ft-bot في Vercel لتفعيل اللوحة."}</small><label>مفتاح الربط<input id='bot-key' type='password' autocomplete='off' minlength='8' maxlength='512' required></label><button class='btn' type='submit'>حفظ واختبار الربط</button><small>يُحفظ المفتاح مشفّراً ولا يُعرض مجدداً. لا ترسله في المحادثة.</small></form>` +
      `<form id='password-form' class='card'><h3>تغيير كلمة سر اللوحة</h3><label>كلمة السر الحالية<input id='pw-old' type='password' autocomplete='current-password' required></label><label>كلمة السر الجديدة (10 أحرف على الأقل)<input id='pw-new' type='password' minlength='10' maxlength='256' autocomplete='new-password' required></label><label>تأكيد كلمة السر الجديدة<input id='pw-confirm' type='password' minlength='10' maxlength='256' autocomplete='new-password' required></label><button class='btn' type='submit'>تغيير كلمة السر</button><small>تُغلق الجلسات القديمة بعد التغيير.</small></form>` +
      `<button class='sm red' data-act='out'>تسجيل الخروج</button>`;
    loadReferralConfig();
  } catch (e) {
    fail(el, e);
  }
}

function migrationSummary(s) {
  if (!s) return "";
  return `<div class='item col'><div><b>المصدر: اللوحة القديمة</b><small>${esc(String(s.users))} مستخدم${s.usersTruncated ? " (أُخذ أول دفعة)" : ""} · ${esc(String(s.prizes))} جائزة · ${esc(String(s.requests))} طلب (${esc(String(s.pendingRequests))} معلّق) · ${esc(String(s.channels))} قناة</small></div></div>`;
}
function migrationReport(r) {
  if (!r) return "";
  const rows = [
    ["مستخدمون جدد", r.users.created], ["مستخدمون موجودون", r.users.existing],
    ["أُرصدة نُقلت", r.users.pointsSet], ["أُرصدة محفوظة كما هي", r.users.pointsKept],
    ["حظر نُقل", r.users.banned], ["إحالات نُقلت", r.users.refs],
    ["جوائز جديدة", r.prizes.created], ["جوائز محدّثة", r.prizes.updated],
    ["طلبات نُقلت", r.requests.imported], ["طلبات متجاهلة", r.requests.skipped],
    ["قنوات أُضيفت", (r.channels.added || []).length], ["قنوات موجودة", r.channels.existing],
  ];
  return `<div class='card'><h3>${r.dryRun ? "معاينة الترحيل (لم تُكتب أي بيانات)" : "تمّ الترحيل"}</h3>` +
    rows.map(([label, value]) => `<div class='item'><div><b>${esc(String(value))}</b><small>${esc(label)}</small></div></div>`).join("") +
    ((r.warnings || []).length ? `<small class='err'>${esc(r.warnings.join(" · "))}</small>` : "") +
    ((r.skipped || []).length ? `<small class='mute'>${esc(r.skipped.slice(0, 5).join(" · "))}</small>` : "") +
    `</div>`;
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
  referrals: loadReferrals,
  set: loadSet,
};
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const a = b.dataset.act,
    id = b.dataset.id,
    v = b.dataset.v;
  try {
    if (a === "broadcast-resume") {
      void resumeBroadcast(id);
    } else if (a === "broadcast-retry") {
      if (!confirm('إعادة المحاولة فقط للرسائل التي رفضها تيليغرام؟ لن نعيد الرسائل الناجحة أو غير المؤكدة.')) return;
      b.disabled = true;
      const result = await api('bot_manage', { op: 'broadcast_retry', input: { jobId: id, confirm: true } });
      broadcastProgress(result, 'بدء إعادة محاولة الرسائل المرفوضة فقط');
      if (!result.done) void resumeBroadcast(result.jobId);
    } else if (a === "bot-ref-save") {
      b.disabled = true;
      await api('referral_config_set', { perJoin: Number($('#bot-ref-points').value) });
      toast('تم حفظ نقاط إحالات FT-bot');
      await loadReferralConfig();
    } else if (a === "bot-recheck") {
      b.disabled = true;
      await loadSet();
    } else if (a === "legacy-scan") {
      b.disabled = true;
      const box = $("#migration");
      box.className = "";
      box.innerHTML = "<p class='mute'>جارٍ فحص بيانات اللوحة القديمة…</p>";
      try {
        const scan = await api("legacy_scan");
        box.innerHTML = migrationSummary(scan.summary) +
          `<div class='acts wrap'><button class='sm' data-act='legacy-preview'>معاينة النقل</button><button class='sm ok' data-act='legacy-apply'>تنفيذ النقل إلى FT-bot</button></div>`;
      } catch (error) {
        box.className = "err";
        box.textContent = error.message;
      } finally { b.disabled = false; }
    } else if (a === "legacy-preview" || a === "legacy-apply") {
      const apply = a === "legacy-apply";
      if (apply && !confirm("نقل بيانات اللوحة القديمة إلى قاعدة FT-bot؟ العملية لا تحذف المصدر ولا تُنقص أي رصيد موجود.")) return;
      b.disabled = true;
      const box = $("#migration");
      box.className = "";
      box.innerHTML = `<p class='mute'>${apply ? "جارٍ النقل…" : "جارٍ حساب المعاينة…"}</p>`;
      try {
        const out = await api("legacy_import", apply ? { dryRun: false, confirm: true } : { dryRun: true });
        box.innerHTML = migrationSummary(out.summary) + migrationReport(out.report) +
          (apply ? "" : `<div class='acts wrap'><button class='sm ok' data-act='legacy-apply'>تنفيذ النقل الآن</button></div>`);
        if (apply) toast("تمّ نقل بيانات اللوحة القديمة إلى FT-bot");
      } catch (error) {
        box.className = "err";
        box.textContent = error.message;
      } finally { b.disabled = false; }
    } else if (a === "connect-settings") {
      show("set");
    } else if (a === "remove-image") {
      if (!confirm("حذف الصورة من البوت؟")) return;
      b.disabled = true;
      await api("bot_image", { kind: b.dataset.kind, id, dataUrl: "" });
      toast("تم حذف الصورة");
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
  }
});
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
