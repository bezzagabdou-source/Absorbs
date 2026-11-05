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
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
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
  });
  const contestId = (created.location.match(/\/admin\/contests\/([a-zA-Z0-9_-]+)/) || [])[1];
  check("تم إنشاء المسابقة", Boolean(contestId), created.location);

  const contestUrl = `/admin/contests/${contestId}`;
  let detail = await page(contestUrl);
  check("صفحة المسابقة تفتح", detail.status === 200);

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

  /* ── 5ب) المجموعة + أسرع ضيف ── */
  console.log("\n5ب) ربط المجموعة ونظام أسرع ضيف");
  const GROUP_ID = -1001234567890;
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
  const callsJoin = await mockCalls();
  adderMessages = textTo(callsJoin, adder);
  check(
    "العضو الجديد يتحسب كجهة",
    adderMessages.filter((t) => t.includes("جهة جديدة")).length === 2,
    `count=${adderMessages.filter((t) => t.includes("جهة جديدة")).length}`,
  );
  check(
    "قبول طلبات الانضمام تلقائياً",
    callsJoin.filter((c) => c.method === "approveChatJoinRequest").length === 3,
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

  console.log(`\n${failed === 0 ? "🎉" : "⚠️"} النتيجة: ${passed} ناجح / ${failed} فاشل\n`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.error("\n💥 فشل الاختبار:", error);
  process.exit(1);
});
