#!/usr/bin/env node
/**
 * اختبار دورة كاملة (Smoke / E2E) للبوت واللوحة.
 *
 * التشغيل:
 *   1) شغّل السيرفر بوضع المحاكاة:
 *        TELEGRAM_MOCK=1 ADMIN_SECRET=dev-secret-1234567890 npm run dev
 *   2) في تيرمنال ثاني:
 *        ADMIN_PASSWORD=test1234 node scripts/smoke.mjs
 *
 * السكربت يتكلم مع الموقع فقط (بدون تيليغرام) عبر واجهة الويب هوك + سجل المحاكاة.
 */

const BASE = process.env.BASE || "http://localhost:3000";

/** أصغر PNG صالح (1×1) لاختبار رفع الصور */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);
const PASSWORD = process.env.ADMIN_PASSWORD || "test1234";
// لازم يطابق TELEGRAM_WEBHOOK_SECRET على السيرفر (يُضبط تلقائياً عند ربط الويب هوك)
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "smoke-secret";

let cookie = "";
let passed = 0;
let failed = 0;

function check(label, condition, extra = "") {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label} ${extra}`);
  }
}

function extractForms(html) {
  return [...html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/g)].map((m) => ({
    id: (m[1].match(/\$ACTION_ID_([a-z0-9]+)/) || [])[1],
    names: [...m[1].matchAll(/name="([^"]+)"/g)].map((x) => x[1]),
    inner: m[1],
  }));
}

function findForm(forms, label) {
  return forms.find((f) => f.id && f.inner.includes(label));
}

/** نص الصفحة بدون وسوم (لتجاهل تعليقات React بين عناصر JSX) */
function plain(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
}

async function page(path, withAuth = true) {
  const res = await fetch(BASE + path, {
    headers: withAuth && cookie ? { Cookie: cookie } : {},
  });
  return { status: res.status, html: await res.text(), headers: res.headers };
}

async function submit(path, actionId, fields) {
  const fd = new FormData();
  fd.append(`$ACTION_ID_${actionId}`, "");
  for (const [k, v] of Object.entries(fields)) {
    if (v && typeof v === "object" && typeof v.arrayBuffer === "function") {
      fd.append(k, v, v.name || "upload.bin");
    } else {
      fd.append(k, v);
    }
  }
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { Accept: "text/html", Origin: BASE, ...(cookie ? { Cookie: cookie } : {}) },
    body: fd,
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  // نتجاهل كوكي الحذف (تسجيل خروج) لتفادي إفساد الجلسة أثناء الاختبار
  if (setCookie && /ft_admin=[^;]+/.test(setCookie)) cookie = setCookie.split(";")[0];
  return {
    status: res.status,
    location: res.headers.get("location") || "",
    html: await res.text(),
  };
}

async function update(updateObject) {
  const res = await fetch(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": SECRET,
    },
    body: JSON.stringify(updateObject),
  });
  if (res.status !== 200) {
    throw new Error(
      `الويب هوك رفض التحديث (${res.status}) — تأكد أن TELEGRAM_WEBHOOK_SECRET=${SECRET} على السيرفر`,
    );
  }
  return res.status;
}

async function mockCalls() {
  const res = await fetch(`${BASE}/api/dev/mock`);
  if (!res.ok) throw new Error("mock API غير متاح — شغّل السيرفر بـ TELEGRAM_MOCK=1");
  return (await res.json()).calls;
}

const textTo = (calls, chatId) =>
  calls
    .filter((c) => c.method === "sendMessage" && String(c.payload.chat_id) === String(chatId))
    .map((c) => String(c.payload.text || ""));

(async () => {
  console.log(`\n🔎 اختبار ${BASE}\n`);
  await fetch(`${BASE}/api/dev/mock?clear=1`, { method: "DELETE" }).catch(() => undefined);

  /* ── 1) لوحة التحكم ── */
  console.log("1) لوحة التحكم والدخول");
  const loginPage = await page("/admin/login", false);
  check("صفحة الدخول تعمل", loginPage.status === 200, `(${loginPage.status})`);
  const loginForm = extractForms(loginPage.html).find((f) => f.names.includes("password"));
  const login = await submit("/admin/login", loginForm.id, {
    password: PASSWORD,
    confirm: PASSWORD,
  });
  check("تسجيل الدخول / إنشاء كلمة المرور", login.status === 303 || login.status === 200);
  check("تم إنشاء جلسة موقّعة", Boolean(cookie), cookie);
  check("لوحة المعلومات محمية", (await page("/admin")).status === 200);
  const anon = await fetch(BASE + "/admin", { redirect: "manual" });
  check("منع الوصول بدون جلسة", anon.status === 307 || anon.status === 302, `(${anon.status})`);

  /* ── 2) إنشاء مسابقة ── */
  console.log("\n2) إنشاء مسابقة");
  const contestsPage = await page("/admin/contests");
  const createForm = extractForms(contestsPage.html).find((f) => f.names.includes("title"));
  const created = await submit("/admin/contests", createForm.id, {
    title: "مسابقة اختبار — 3 جهات",
    target: "3",
    winners: "1",
    prize: "حساب FT تجريبي",
    description: "اختبار تلقائي",
    status: "active",
    mode: "referral",
    image: new File([TINY_PNG], "contest.png", { type: "image/png" }),
  });
  const contestId = (created.location.match(/\/admin\/contests\/([a-zA-Z0-9_-]+)/) || [])[1];
  check("تم إنشاء المسابقة", Boolean(contestId), created.location);

  const contestUrl = `/admin/contests/${contestId}`;
  let detail = await page(contestUrl);
  check("صفحة المسابقة تفتح", detail.status === 200);
  check("صورة المسابقة محفوظة وتظهر في اللوحة", detail.html.includes(`/api/contests/${contestId}/image`));

  /* ── 3) مخزون الحسابات ── */
  console.log("\n3) مخزون الحسابات");
  const addForm = extractForms(detail.html).find((f) => f.names.includes("accounts"));
  const added = await submit(contestUrl, addForm.id, {
    id: contestId,
    accounts: "acc1@ft.com:Secret1\nacc2@ft.com:Secret2",
  });
  check("إضافة حسابات", added.status === 303, `(${added.status})`);
  detail = await page(contestUrl);
  const detailText = plain(detail.html);
  check("المخزون = 2", /مخزون الحسابات\s*\(\s*2\s*\)/.test(detailText), detailText.slice(0, 120));
  check("كلمات السر مخفية", detailText.includes("••••") && !detail.html.includes("Secret1"));

  /* ── 3ب) صورة المسابقة ── */
  console.log("\n3ب) صورة المسابقة");
  const imageRes = await fetch(`${BASE}/api/contests/${contestId}/image`);
  check("رابط الصورة يعمل", imageRes.status === 200, `(${imageRes.status})`);
  check(
    "نوع المحتوى صورة PNG",
    (imageRes.headers.get("content-type") || "").includes("image/png"),
    imageRes.headers.get("content-type") || "",
  );
  const imageBytes = new Uint8Array(await imageRes.arrayBuffer());
  check("حجم الصورة صحيح", imageBytes.length === TINY_PNG.length, `${imageBytes.length}`);
  const landingWithImage = await page("/", false);
  check(
    "الصورة تظهر في الموقع العام",
    landingWithImage.html.includes(`/api/contests/${contestId}/image`),
  );

  /* ── 4) الإعدادات + الويب هوك (mock) ── */
  console.log("\n4) الإعدادات والربط");
  const settingsPage = await page("/admin/settings");
  check("صفحة الإعدادات تفتح", settingsPage.status === 200);
  const settingsForm = extractForms(settingsPage.html).find((f) => f.names.includes("botToken"));
  const saved = await submit("/admin/settings", settingsForm.id, {
    botToken: "123456:TEST-TOKEN",
    channelChat: "",
    channelUrl: "",
    supportUsername: "ft_support",
    logChatId: "",
    adminIds: "999",
    welcomeText: "",
    rulesText: "",
  });
  check("حفظ الإعدادات", saved.status === 303, `(${saved.status})`);

  const settings2 = await page("/admin/settings");
  const settingsForms = extractForms(settings2.html);
  const checkForm = findForm(settingsForms, "فحص التوكن");
  const checked = await submit("/admin/settings", checkForm.id, {});
  check("فحص توكن البوت", checked.status === 303, `(${checked.status})`);
  const botName = plain((await page("/admin/settings")).html);
  check("حفظ يوزر البوت بعد الفحص", /@\s*ft_contest_mock_bot/.test(botName));

  const webhookForm = findForm(extractForms((await page("/admin/settings")).html), "ربط الويب هوك");
  const hooked = await submit("/admin/settings", webhookForm.id, {});
  check("ربط الويب هوك", hooked.status === 303, `(${hooked.status})`);
  const afterHook = plain((await page("/admin/settings")).html);
  check("تسجيل رابط الويب هوك", afterHook.includes("/api/telegram/webhook"));

  /* ── 5) الإحالات والجهات ── */
  console.log("\n5) الإحالة وحساب الجهات");
  const inviter = "900001";
  await update({
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: Number(inviter), first_name: "الفائز" },
      chat: { id: Number(inviter), type: "private" },
      text: "/start",
    },
  });
  let inviterMessages = textTo(await mockCalls(), inviter);
  check(
    "رسالة ترحيب قصيرة: مرحبا بكم في بوت مسابقات FT",
    inviterMessages.some((t) => t.includes("مرحبا بكم في بوت مسابقات FT")),
    inviterMessages[0],
  );
  check("الترحيب ما فيه كلام طويل", (inviterMessages[0] || "").length < 80, inviterMessages[0]);
  const ownerScreen = await (async () => {
    await update({
      update_id: 2,
      message: {
        message_id: 2,
        from: { id: Number(inviter), first_name: "الفائز" },
        chat: { id: Number(inviter), type: "private" },
        text: "/owner",
      },
    });
    return textTo(await mockCalls(), inviter).find((t) => t.includes("مالك البوت")) || "";
  })();
  check("أمر المالك يعرض @F_Y_Y_T", ownerScreen.includes("@F_Y_Y_T"), ownerScreen.slice(0, 80));

  for (let i = 1; i <= 3; i++) {
    await update({
      update_id: 10 + i,
      message: {
        message_id: 10 + i,
        from: { id: 910000 + i, first_name: `جهة ${i}` },
        chat: { id: 910000 + i, type: "private" },
        text: `/start r_${contestId}_${inviter}`,
      },
    });
  }
  const calls = await mockCalls();
  inviterMessages = textTo(calls, inviter);
  check(
    "إشعارات الجهات تصل لصاحب الرابط",
    inviterMessages.filter((t) => t.includes("جهة جديدة")).length === 2,
    `count=${inviterMessages.filter((t) => t.includes("جهة جديدة")).length}`,
  );
  check(
    "إشعار الوصول للهدف",
    inviterMessages.some((t) => t.includes("وصلت للهدف")),
  );

  console.log("\n5أ) صورة المسابقة في البوت");
  const photoUser = "900009";
  await update({
    update_id: 25,
    callback_query: {
      id: "cb-photo",
      from: { id: Number(photoUser), first_name: "زائر" },
      data: `c:${contestId}`,
      message: { message_id: 9, chat: { id: Number(photoUser), type: "private" } },
    },
  });
  const photoCalls = (await mockCalls()).filter((c) => c.method === "sendPhoto");
  check("البوت يرسل صورة المسابقة", photoCalls.length > 0, `count=${photoCalls.length}`);
  check(
    "رابط الصورة في رسالة البوت",
    photoCalls.some((c) => String(c.payload.photo).includes(`/api/contests/${contestId}/image`)),
    JSON.stringify(photoCalls[0]?.payload?.photo || ""),
  );

  /* ── 5ب) المجموعة + أسرع ضيف ── */
  console.log("\n5ب) ربط المجموعة ونظام أسرع ضيف");
  // مجموعة جديدة كل تشغيل حتى تبقى الاختبارات مستقلة (روابط الدعوة تُخزَّن لكل مجموعة)
  const GROUP_ID = -(1000000000000 + Math.floor(Math.random() * 900000));
  await update({
    update_id: 40,
    my_chat_member: {
      chat: { id: GROUP_ID, type: "supergroup", title: "مجموعة FT" },
      from: { id: 900002, first_name: "المشرف" },
      new_chat_member: { status: "administrator", user: { id: 7000000001, is_bot: true } },
    },
  });
  const groupPage = await page("/admin/group");
  const groupText = plain(groupPage.html);
  check("صفحة المجموعة تفتح", groupPage.status === 200);
  check("تم ربط المجموعة تلقائياً", groupText.includes("مجموعة FT"), groupText.slice(0, 120));
  check("تم إنشاء مسابقة أسرع ضيف", groupText.includes("أسرع ضيف") && groupText.includes("20"));
  check(
    "إشعار الربط في المجموعة",
    textTo(await mockCalls(), GROUP_ID).some((t) => t.includes("تم ربط المجموعة")),
  );

  const adder = "900003";
  await update({
    update_id: 41,
    message: {
      message_id: 41,
      from: { id: Number(adder), first_name: "أسرع ضيف" },
      chat: { id: Number(adder), type: "private" },
      text: "/fastest",
    },
  });
  let adderMessages = textTo(await mockCalls(), adder);
  check("شاشة أسرع ضيف تعمل", adderMessages.some((t) => t.includes("أسرع ضيف")), adderMessages.at(-1));
  const fastestButtons = (await mockCalls())
    .filter((c) => c.method === "sendMessage" && String(c.payload.chat_id) === adder)
    .map((c) => JSON.stringify(c.payload.reply_markup || {}))
    .join(" ");
  check("زر «رابطي — أضف أعضاء» موجود", fastestButtons.includes("رابطي"), fastestButtons.slice(0, 160));

  const gCallsBefore = (await mockCalls()).filter((c) => c.method === "createChatInviteLink").length;
  await update({
    update_id: 42,
    callback_query: {
      id: "cb-ginv",
      from: { id: Number(adder), first_name: "أسرع ضيف" },
      data: "ginv:",
      message: { message_id: 5, chat: { id: Number(adder), type: "private" } },
    },
  });
  const callsG = await mockCalls();
  const gInvites = callsG.filter((c) => c.method === "createChatInviteLink");
  check("تم إنشاء رابط دعوة خاص", gInvites.length > gCallsBefore, `count=${gInvites.length}`);
  check(
    "طلب الانضمام مفعّل على الرابط",
    Boolean(gInvites[0]?.payload.creates_join_request),
    JSON.stringify(gInvites[0]?.payload),
  );
  adderMessages = textTo(await mockCalls(), adder);
  check(
    "اسم الدعوة يحمل صاحب الرابط (خطة احتياطية)",
    /^FT-\d+-\S+$/.test(String(gInvites[0]?.payload.name || "")),
    String(gInvites[0]?.payload.name),
  );
  const gLink = (adderMessages.join("\n").match(/https:\/\/t\.me\/\+[A-Za-z0-9_-]+/) || [])[0] || "";
  check("الرابط وصل للمشارك", Boolean(gLink), adderMessages.at(-1)?.slice(0, 120));

  const joinRequest = (uid, name) => ({
    update_id: 50 + uid,
    chat_join_request: {
      chat: { id: GROUP_ID, type: "supergroup", title: "مجموعة FT" },
      from: { id: uid, first_name: name },
      user_chat_id: uid,
      date: Math.floor(Date.now() / 1000),
      invite_link: { invite_link: gLink, creates_join_request: true },
    },
  });

  await update(joinRequest(920001, "عضو أول"));
  await update(joinRequest(920002, "عضو ثاني"));
  await update(joinRequest(920001, "عضو مكرر")); // نفس العضو — ما يتحسبش مرتين
  // خطة احتياطية: رابط غير معروف لكن اسم الدعوة يحمل صاحبها
  await update({
    update_id: 60,
    chat_join_request: {
      chat: { id: GROUP_ID, type: "supergroup", title: "مجموعة FT" },
      from: { id: 920003, first_name: "عضو ثالث" },
      user_chat_id: 920003,
      invite_link: { invite_link: "https://t.me/+unknownxyz", name: gInvites[0].payload.name },
    },
  });
  const callsJoin = await mockCalls();
  adderMessages = textTo(callsJoin, adder);
  check(
    "العضو الجديد يتحسب كجهة",
    adderMessages.filter((t) => t.includes("جهة جديدة")).length === 3,
    `count=${adderMessages.filter((t) => t.includes("جهة جديدة")).length}`,
  );
  check(
    "قبول طلبات الانضمام تلقائياً",
    callsJoin.filter((c) => c.method === "approveChatJoinRequest").length === 4,
    `count=${callsJoin.filter((c) => c.method === "approveChatJoinRequest").length}`,
  );
  const groupText2 = plain((await page("/admin/group")).html);
  check("الترتيب يعرض المشارك", groupText2.includes("أسرع ضيف") && groupText2.includes("900003"));
  check("سجل المنضمّين يعرضهم", groupText2.includes("عضو أول"));

  /* ── 6) استلام الجائزة ── */
  console.log("\n6) استلام الجائزة");
  await update({
    update_id: 30,
    callback_query: {
      id: "cb-claim",
      from: { id: Number(inviter), first_name: "الفائز" },
      data: `claim:${contestId}`,
      message: { message_id: 2, chat: { id: Number(inviter), type: "private" } },
    },
  });
  const afterClaim = textTo(await mockCalls(), inviter);
  const prize = afterClaim.find((t) => t.includes("ربحت الحساب"));
  check("تم تسليم بيانات الحساب", Boolean(prize));
  check("الإيميل الأول من المخزون", Boolean(prize && prize.includes("acc1@ft.com")), prize);
  check("كلمة السر سُلّمت", Boolean(prize && prize.includes("Secret1")));

  detail = await page(contestUrl);
  const detailText2 = plain(detail.html);
  check("المخزون نقص إلى 1", /مخزون الحسابات\s*\(\s*1\s*\)/.test(detailText2));
  check("المسابقة انتهت بعد الفائز الأول", detail.html.includes("badge badge-ended"));

  /* ── 7) إعادة المحاولة (idempotent) ── */
  console.log("\n7) إعادة طلب الجائزة");
  await update({
    update_id: 31,
    callback_query: {
      id: "cb-claim-2",
      from: { id: Number(inviter), first_name: "الفائز" },
      data: `claim:${contestId}`,
      message: { message_id: 3, chat: { id: Number(inviter), type: "private" } },
    },
  });
  const again = textTo(await mockCalls(), inviter);
  check(
    "نفس البيانات تُعاد بدون سحب حساب جديد",
    again.some((t) => t.includes("ربحت هذه المسابقة بالفعل") && t.includes("acc1@ft.com")),
  );

  /* ── 8) صفحة الجوائز + البث ── */
  console.log("\n8) الجوائز والبث");
  const claimsPage = await page("/admin/claims");
  check("سجل الجوائز يعرض العملية", plain(claimsPage.html).includes("acc1@ft.com"));
  const usersPage = await page("/admin/users");
  check("صفحة المستخدمين تعمل", usersPage.status === 200);

  const broadcastPage = await page("/admin/broadcast");
  const broadcastForm = extractForms(broadcastPage.html).find((f) => f.names.includes("text"));
  const sent = await submit("/admin/broadcast", broadcastForm.id, {
    text: "🏆 مسابقة جديدة!",
    limit: "50",
  });
  check("إرسال البث", sent.status === 303);
  const broadcastCalls = textTo(await mockCalls(), inviter);
  check("وصول رسالة البث", broadcastCalls.some((t) => t.includes("مسابقة جديدة")));

  /* ── 9) صفحات عامة ── */
  console.log("\n9) الموقع العام");
  const landing = await page("/", false);
  check("الصفحة العامة تعمل", landing.status === 200);
  check("تعرض المسابقات", landing.html.includes("مسابقة اختبار"));
  check("لا تُظهر كلمات سر المخزون", !landing.html.includes("Secret1"));

  /* ── 10) الإحصائيات ── */
  console.log("\n10) الإحصائيات");
  await page("/", false);
  await page("/", false);
  const statsPage = await page("/admin/stats");
  const statsText = plain(statsPage.html);
  check("صفحة الإحصائيات تفتح", statsPage.status === 200);
  const visitors = Number((statsText.match(/(\d+)\s+زوار اليوم/) || [])[1] || 0);
  check("تُحسب زيارات الموقع", visitors > 0, `visitors=${visitors}`);
  const activeNow = Number((statsText.match(/(\d+)\s+نشطين في البوت اليوم/) || [])[1] || 0);
  check("يُحسب نشاط مستخدمي البوت", activeNow > 0, `active=${activeNow}`);
  const msgs = Number((statsText.match(/(\d+)\s+رسائل البوت اليوم/) || [])[1] || 0);
  check("تُحسب رسائل البوت", msgs > 0, `messages=${msgs}`);
  check("تفصيل يومي موجود", statsPage.html.includes("التفصيل اليومي"));
  const dash = plain((await page("/admin")).html);
  check("اللوحة تعرض الزوار والنشطين", dash.includes("زائر اليوم") && dash.includes("نشط في البوت اليوم"));

  const resetForm = findForm(extractForms(statsPage.html), "تصفير الإحصائيات");
  const reset = await submit("/admin/stats", resetForm.id, { days: "30" });
  check("تصفير الإحصائيات", reset.status === 303, `(${reset.status})`);
  const afterReset = plain((await page("/admin/stats")).html);
  check(
    "الأرقام تصفّرت",
    /0\s+زوار اليوم/.test(afterReset) || /0\s+زيارات اليوم/.test(afterReset),
    afterReset.slice(0, 160),
  );


  /* ── 11) المساعد الذكي ── */
  console.log("\n11) المساعد الذكي");
  const aiPage = await page("/admin/ai");
  const aiText = plain(aiPage.html);
  check("صفحة المساعد الذكي تفتح", aiPage.status === 200);
  check("تعرض حالة المحرّك", aiText.includes("حالة المحرّك"));
  const aiForm = findForm(extractForms(aiPage.html), "ولّد النص");
  const generated = await submit("/admin/ai", aiForm.id, {
    kind: "contest",
    prompt: "مسابقة 300 دعوة وجائزة حساب FT",
  });
  check("توليد نص بالذكاء الاصطناعي", generated.status === 303, `(${generated.status})`);
  const aiAfter = plain((await page("/admin/ai")).html);
  check("النص المولّد ظاهر في الصفحة", aiAfter.includes("محاكاة"), aiAfter.slice(0, 160));

  const aiChat = 910002;
  await update({
    message: {
      message_id: 5100,
      from: { id: aiChat, is_bot: false, first_name: "سائل" },
      chat: { id: aiChat, type: "private" },
      text: "كيفاش نجمع 200 دعوة بسرعة؟",
    },
  });
  const aiCalls = await mockCalls();
  const aiReplies = textTo(aiCalls, aiChat);
  check(
    "البوت يجاوب على الأسئلة الحرة بالذكاء الاصطناعي",
    aiReplies.some((t) => t.includes("محاكاة")),
    aiReplies.at(-1)?.slice(0, 120),
  );
  check(
    "الجواب فيه زر رجوع للمسابقات",
    aiCalls.some(
      (c) =>
        c.method === "sendMessage" &&
        String(c.payload.chat_id) === String(aiChat) &&
        JSON.stringify(c.payload.reply_markup || {}).includes("المسابقات"),
    ),
  );
  check(
    "البوت كيبين «يكتب…» قبل الجواب",
    aiCalls.some(
      (c) => c.method === "sendChatAction" && String(c.payload.chat_id) === String(aiChat),
    ),
  );

  const aiHelpChat = 910003;
  await update({
    message: {
      message_id: 5101,
      from: { id: aiHelpChat, is_bot: false, first_name: "سائل" },
      chat: { id: aiHelpChat, type: "private" },
      text: "/ai",
    },
  });
  const aiHelp = textTo(await mockCalls(), aiHelpChat);
  check(
    "أمر /ai يشرح المساعد",
    aiHelp.some((t) => t.includes("المساعد الذكي")),
    aiHelp.at(-1)?.slice(0, 120),
  );

  const contestPage = await page(`/admin/contests/${contestId}`);
  check("زر توليد الوصف في صفحة المسابقة", contestPage.html.includes("ولّد الوصف"));
  const broadcastAi = await page("/admin/broadcast");
  check("كارت الصياغة الذكية في البث", broadcastAi.html.includes("صياغة بالذكاء الاصطناعي"));
  const settingsAi = await page("/admin/settings");
  check("إعدادات المساعد الذكي", settingsAi.html.includes("المساعد الذكي"));


  /* ── 12) المسابقات: من اللوحة إلى البوت ── */
  console.log("\n12) المسابقات كتوصل للبوت");
  const contestsPage2 = await page("/admin/contests");
  const wizardForm = findForm(extractForms(contestsPage2.html), "أنشئ المسابقة الآن");
  check("كارت «مسابقة بسطر واحد» موجود", Boolean(wizardForm));
  const wizard = await submit("/admin/contests", wizardForm.id, {
    idea: "مسابقة 300 دعوة وجائزة حساب FT سنة، 3 فائزين",
  });
  check("توليد مسابقة من سطر واحد", wizard.status === 303, `(${wizard.status})`);
  const listAfter = plain((await page("/admin/contests")).html);
  check(
    "المسابقة الجديدة ظاهرة في اللوحة",
    listAfter.includes("300") || listAfter.includes("دعوة"),
    listAfter.slice(0, 160),
  );

  const botChat = 930001;
  await update({
    message: {
      message_id: 7001,
      from: { id: botChat, is_bot: false, first_name: "لاعب" },
      chat: { id: botChat, type: "private" },
      text: "/start",
    },
  });
  const botCalls = await mockCalls();
  const home = textTo(botCalls, botChat);
  const homeButtons = botCalls
    .filter((c) => c.method === "sendMessage" && String(c.payload.chat_id) === String(botChat))
    .map((c) => JSON.stringify(c.payload.reply_markup || {}))
    .join(" ");
  check("البوت كيرحّب", home.length > 0, home.at(-1)?.slice(0, 140));
  check(
    "المسابقة الجديدة بانت كزر في البوت",
    /دعوة|مسابقة|جهة/.test(homeButtons),
    homeButtons.slice(0, 160),
  );

  const dashBoard = plain((await page("/admin")).html);
  check(
    "اللوحة كتحذّر من التخزين المؤقت محلياً",
    dashBoard.includes("التخزين مؤقت") || dashBoard.includes("التخزين دائم"),
    dashBoard.slice(0, 120),
  );
  const statusPage2 = await page("/status");
  const statusText = plain(statusPage2.html);
  check(
    "صفحة التشخيص كتوري حالة قاعدة البيانات",
    statusText.includes("قاعدة البيانات"),
    statusText.slice(0, 120),
  );

  console.log(`\n${failed === 0 ? "🎉" : "⚠️"} النتيجة: ${passed} ناجح / ${failed} فاشل\n`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.error("\n💥 فشل الاختبار:", error);
  process.exit(1);
});
