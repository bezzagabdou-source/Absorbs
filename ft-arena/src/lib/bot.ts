/**
 * 🏆 مسابقات MX — منطق البوت الكامل
 * كل شيء قابل للتحكم من لوحة التحكم: النقاط، الأزرار، النصوص، الجوائز، المهام، العجلة، المتصدرون، المسابقات.
 */
import type { DB, Reward, Task, User } from "./types";
import {
  DAY,
  addPoints,
  countUsers,
  displayName,
  ensureUser,
  findByRefCode,
  fmtDate,
  inline,
  canVerifyChannel,
  joinKeyboard,
  missingJoins,
  notifyAdmin,
  refLink,
  refreshAvatar,
  t,
  timeLeft,
  topUsers,
} from "./bot-utils";
import {
  answerCb,
  editText,
  esc,
  getChat,
  getChatMember,
  link,
  safeTg,
  sendAlbum,
  sendPhoto,
  sendMessage,
  setMyCommands,
  setMyDescription,
  setMyShortDescription,
  type TgCallback,
  type TgChatMemberUpdated,
  type TgMessage,
  type TgUpdate,
  type TgUser,
} from "./tg";
import { logActivity, pushEvent } from "./store";

/* ─────────────────────────────── أدوات داخلية ─────────────────────────────── */

const ok = new Set(["creator", "administrator", "member"]);

function algeriaDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(d); // YYYY-MM-DD
}

export function isBotAdmin(db: DB, id?: number, adminChatId?: string): boolean {
  if (!id) return false;
  const configured = (db.settings.admin.adminChatId || adminChatId || "").trim();
  return Boolean(configured) && String(configured) === String(id);
}

const num = (n: number) => new Intl.NumberFormat("en-US").format(n);

function medal(i: number) {
  return ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
}

function randInt(min: number, max: number) {
  const a = Math.max(0, Math.floor(min));
  const b = Math.max(a, Math.floor(max));
  return a + Math.floor(Math.random() * (b - a + 1));
}

function userLine(db: DB, u: User) {
  const name = displayName(u);
  return `${esc(name)}${u.vip ? " 👑" : ""}`;
}

/* ─────────────────────────────── الكيبوردات ─────────────────────────────── */

function mainKeyboard(db: DB, u: User, adminChatId?: string) {
  const f = db.settings.features;
  const rows: { text: string; data?: string; url?: string }[][] = [];
  const dailyReady = f.daily && u.daily.lastAt !== algeriaDay();
  rows.push([
    { text: dailyReady ? "🎁 هديتك اليومية جاهزة!" : "🎁 الهدية اليومية", data: "cb:daily" },
    { text: "🏆 المتصدرون", data: "cb:top" },
  ]);
  rows.push([
    ...(f.referrals ? [{ text: "🔗 رابط الإحالة", data: "cb:ref" }] : []),
    ...(f.wheel ? [{ text: "🎡 عجلة الحظ", data: "cb:wheel" }] : []),
  ]);
  if (f.shop) rows.push([{ text: "🛍️ المتجر", data: "cb:shop" }, { text: "💎 نقاطي", data: "cb:points" }]);
  else rows.push([{ text: "💎 نقاطي", data: "cb:points" }, { text: "📦 طلباتي", data: "cb:claims" }]);
  if (f.tasks) rows.push([{ text: "✅ المهام", data: "cb:tasks" }, { text: "🏅 المسابقات", data: "cb:contests" }]);
  rows.push([
    { text: "📚 القوانين", data: "cb:rules" },
    { text: "☎️ الدعم", data: "cb:support" },
  ]);
  if (isBotAdmin(db, u.id, adminChatId)) rows.push([{ text: "⚙️ لوحة التحكم", url: "/admin" }]);
  return inline(rows.map((r) => r.map((b) => (b.url ? { text: b.text, url: b.url } : b))));
}

/* ─────────────────────────────── النصوص ─────────────────────────────── */

function homeText(db: DB, u: User, botName: string) {
  const f = db.settings.features;
  const pos = Object.values(db.users)
    .filter((x) => !x.banned)
    .sort((a, b) => b.points - a.points)
    .findIndex((x) => x.id === u.id);
  const total = countUsers(db).total;
  return [
    `<b>${esc(db.settings.botName || botName)}</b> ${db.settings.brandEmoji}`,
    "",
    `👋 أهلًا <b>${userLine(db, u)}</b>`,
    "",
    `💎 نقاطك: <b>${num(u.points)}</b>`,
    `🏅 ترتيبك: <b>${pos >= 0 ? `#${pos + 1}` : "—"}</b> من ${num(total)} عضو`,
    f.referrals ? `🤝 إحالاتك: <b>${num(u.refActive)}</b> مؤكدة / ${num(u.refCount)} دخلوا` : "",
    "",
    `<i>${esc(db.settings.texts.startBody)}</i>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function pointsText(db: DB, u: User) {
  const h = u.history.slice(0, 8);
  return [
    "💎 <b>محفظة النقاط</b>",
    "",
    `💠 الرصيد الحالي: <b>${num(u.points)} نقطة</b>`,
    `📈 مجموع ما جمعته: <b>${num(u.totalEarned)}</b>`,
    `📉 مجموع ما استبدلته: <b>${num(u.totalSpent)}</b>`,
    "",
    h.length ? "🧾 <b>آخر الحركات:</b>" : "لا توجد حركات بعد — ابدأ بالهدية اليومية!",
    ...h.map((e) => `${e.delta >= 0 ? "➕" : "➖"} ${Math.abs(e.delta)} • ${esc(e.note)} <i>(${fmtDate(e.at)})</i>`),
    "",
    "💡 <i>اجمع أكثر نقاط عبر الإحالات والعجلة والمهام.</i>",
  ].join("\n");
}

function topText(db: DB, by: "points" | "refs" = "points") {
  const list = topUsers(db, 10, by);
  const lines = list.map((u, i) => {
    const v = by === "refs" ? `${u.refActive} إحالة` : `${num(u.points)} نقطة`;
    return `${medal(i)} ${userLine(db, u)} — <b>${v}</b>`;
  });
  const c = countUsers(db);
  return [
    by === "points" ? "🏆 <b>المتصدرون بالنقاط</b>" : "🤝 <b>أفضل الداعين</b>",
    "",
    ...(lines.length ? lines : ["لا يوجد متصدرون بعد."]),
    "",
    `👥 إجمالي الأعضاء: <b>${num(c.total)}</b> • النشطون اليوم: <b>${num(c.active24h)}</b>`,
    `💰 نقاط الجميع: <b>${num(c.points)}</b>`,
  ].join("\n");
}

function refText(db: DB, u: User) {
  const p = db.settings.points;
  const l = refLink(db, u);
  return [
    "🔗 <b>رابط الإحالة الخاص بك</b>",
    "",
    "اجمع نقاطًا مع كل شخص يدخل من رابطك:",
    `➕ <b>${p.refJoin}</b> نقطة عند دخوله`,
    `➕ <b>${p.refActive}</b> نقطة إضافية عند تفعيله (انضمامه للقناة)`,
    "",
    `👥 دخل من طرفك: <b>${num(u.refCount)}</b>`,
    `✅ إحالات مؤكدة: <b>${num(u.refActive)}</b>`,
    `💎 نقاط من الإحالات: <b>${num(u.refCount * p.refJoin + u.refActive * p.refActive)}</b>`,
    "",
    "📤 <b>رابطك:</b>",
    `<code>${l}</code>`,
    "",
    `🎡 وكل <b>${p.wheelExtraPerRefs}</b> إحالة مؤكدة = دورة إضافية مجانية في عجلة الحظ!`,
  ].join("\n");
}

function shopText(db: DB, u: User) {
  const active = db.rewards.filter((r) => r.active).sort((a, b) => a.order - b.order);
  return [
    "🛍️ <b>متجر الجوائز</b>",
    "",
    `💎 رصيدك: <b>${num(u.points)}</b> نقطة`,
    "",
    ...active.map(
      (r) =>
        `${r.emoji} <b>${esc(r.title)}</b> — ${num(r.cost)} نقطة${
          r.stock === 0 ? " (نفدت)" : r.stock !== null && r.stock !== undefined ? ` • متبقي ${r.stock}` : ""
        }`
    ),
    "",
    "اختر جائزتك من الأزرار أدناه 👇",
  ].join("\n");
}

function shopKeyboard(db: DB, u: User) {
  const rows = db.rewards
    .filter((r) => r.active && (r.stock === null || r.stock === undefined || r.stock > 0))
    .sort((a, b) => a.order - b.order)
    .map((r) => [
      {
        text: `${r.emoji} ${r.title} — ${r.cost}`,
        data: `cb:rw:${r.id}`,
      },
    ]);
  rows.push([
    { text: "📦 طلباتي", data: "cb:claims" },
    { text: "🔙 رجوع", data: "cb:home" },
  ]);
  return inline(rows);
}

function tasksText(db: DB, u: User) {
  const list = [...db.tasks].filter((x) => x.active).sort((a, b) => a.order - b.order);
  return [
    "✅ <b>المهام</b>",
    "",
    "أنجز المهام واحصل على نقاط إضافية:",
    "",
    ...list.map((tk, i) => {
      const done = tk.repeat === "once" ? Boolean(u.tasks[tk.id]) : u.tasks[tk.id] === algeriaDay();
      return `${done ? "✅" : "⬜️"} ${tk.emoji} ${esc(tk.title)} — <b>+${tk.points}</b> نقطة${done ? " <i>(منجزة)</i>" : ""}`;
    }),
    "",
    list.length ? "اضغط زر المهمة للتحقق." : "لا توجد مهام حاليًا.",
  ].join("\n");
}

function tasksKeyboard(db: DB, u: User) {
  const rows = db.tasks
    .filter((x) => x.active)
    .sort((a, b) => a.order - b.order)
    .map((tk) => {
      const done = tk.repeat === "once" ? Boolean(u.tasks[tk.id]) : u.tasks[tk.id] === algeriaDay();
      const label = `${done ? "✅" : tk.emoji} ${tk.title} (+${tk.points})`;
      if (done) return [{ text: label, data: "cb:noop" }];
      if (tk.type === "link" && tk.target) return [{ text: label, url: tk.target }];
      return [{ text: label, data: `cb:task:${tk.id}` }];
    });
  rows.push([
    { text: "🔄 تحديث", data: "cb:tasks" },
    { text: "🔙 رجوع", data: "cb:home" },
  ]);
  return inline(rows);
}

function contestsText(db: DB) {
  const list = db.contests.filter((c) => c.status === "active");
  if (!list.length) return "🏅 <b>المسابقات</b>\n\nلا توجد مسابقة نشطة الآن — تابعنا، قريبًا! 🔥";
  return [
    "🏅 <b>المسابقات النشطة</b>",
    "",
    ...list.map((c) => {
      const leaders = topUsers(db, c.winnersCount)
        .map((u, i) => `   ${medal(i)} ${userLine(db, u)} — ${num(u.points)}`)
        .join("\n");
      return [
        `<b>${esc(c.title)}</b>`,
        esc(c.desc),
        `🎁 الجائزة: ${esc(c.prize)}`,
        `⏳ تنتهي بعد: <b>${timeLeft(c.endsAt)}</b>`,
        "👑 <b>المتصدرون حاليًا:</b>",
        leaders,
      ].join("\n");
    }),
  ].join("\n\n");
}

/* ─────────────────────────────── بوابة الاشتراك ─────────────────────────────── */

function joinGateText(db: DB) {
  return [
    "🔒 <b>خطوة واحدة للبدء</b>",
    "",
    `اشترك في قناة ${esc(db.settings.forceJoin.title)} أولًا:`,
    `👉 ${link("اضغط هنا للاشتراك", db.settings.forceJoin.url)}`,
    "",
    "ثم اضغط <b>✅ تحقّقت من الاشتراك</b>.",
  ].join("\n");
}

/**
 * بوابة الاشتراك:
 *  - البوت أدمن  → تحقّق حقيقي: غير المشترك يُحجب حتى يضغط «✅ تحقّقت».
 *  - البوت ليس أدمن → التحقق مستحيل تقنيًا (getChatMember يفشل) فلا نحجب أحدًا،
 *    بل نُرسل تنبيهًا لطيفًا بمرّة يوميًا. هذا سبب «ضغطت تحقّقت وما صار شي».
 */
function joinHealCache() {
  const g = globalThis as typeof globalThis & { __joinHeal?: { checkedAt?: number; canVerify?: boolean | null } };
  g.__joinHeal ??= {};
  return g.__joinHeal;
}

async function canVerifyJoin(db: DB): Promise<boolean | null> {
  const c = joinHealCache();
  const now = Date.now();
  if (c.checkedAt && now - c.checkedAt < 10 * 60_000) return c.canVerify ?? null;
  const can = await canVerifyChannel(db);
  c.checkedAt = now;
  c.canVerify = can;
  if (can === false) db.meta.joinUnverifiable = true;
  return can;
}

async function gate(db: DB, u: User): Promise<{ title: string; url: string }[] | null> {
  if (!db.settings.forceJoin.enabled) return null;
  if (!db.settings.forceJoin.verify) return null;
  const can = await canVerifyJoin(db);
  if (can === false) return null; // لا نحجب بلا قدرة على التحقق
  const miss = await missingJoins(db, u.id);
  if (miss.length === 0) return null;
  return miss;
}

/**
 * الاشتراك الإجباري بلا قدرة على التحقق (البوت ليس أدمن):
 * لا نحجب أي زر — نُرسل تنبيهًا لطيفًا مرّة واحدة ونتابع.
 */
async function softJoinNudge(db: DB, u: User): Promise<boolean> {
  const j = db.settings.forceJoin;
  if (!j.enabled) return false;
  if (!j.verify) return false; // تحقّق فعلي يعمل → البوابة الصارمة تتولّى الأمر
  const today = new Date().toISOString().slice(0, 10);
  if (u.lastJoinNudge === today) return false;
  u.lastJoinNudge = today;
  await sendMessage(
    u.id,
    [
      "📣 <b>لا تنسَ الانضمام إلى قناة الجوائز</b>",
      "",
      `👉 ${link(esc(j.title || "قناتنا"), j.url)}`,
      "",
      "<i>كل المسابقات والجوائز تُعلن هناك أولًا.</i>",
    ].join("\n"),
    inline([[{ text: "📣 انضم للقناة", url: j.url }]])
  );
  return true;
}

/* ─────────────────────────────── هدية يومية ─────────────────────────────── */

function doDaily(db: DB, u: User): { ok: boolean; text: string } {
  const p = db.settings.points;
  const today = algeriaDay();
  if (!db.settings.features.daily) return { ok: false, text: "🎁 الهدية اليومية معطّلة مؤقتًا." };
  if (u.daily.lastAt === today) {
    return {
      ok: false,
      text: `🎁 أخذت هدية اليوم بالفعل!\n⏳ عُد غدًا لهدية جديدة.\n🔥 سلسلتك: <b>${u.daily.streak}</b> يوم`,
    };
  }
  const yesterday = algeriaDay(new Date(Date.now() - DAY));
  u.daily.streak = u.daily.lastAt === yesterday ? u.daily.streak + 1 : 1;
  u.daily.lastAt = today;
  u.daily.count += 1;
  u.lastDailyAt = today;
  const base = randInt(p.dailyMin, p.dailyMax);
  let bonus = 0;
  if (p.streakEveryDays > 0 && u.daily.streak % p.streakEveryDays === 0) {
    bonus = Math.min(p.streakBonus, p.maxStreakBonus);
  }
  addPoints(db, u.id, base + bonus, "daily", "هدية يومية");
  db.counters.dailyClaims += 1;
  pushEvent(db, "daily", u.id);
  return {
    ok: true,
    text: [
      "🎁 <b>هدية اليوم!</b>",
      "",
      `➕ حصلت على <b>${base}</b> نقطة`,
      bonus ? `🔥 مكافأة السلسلة (${u.daily.streak} أيام): <b>+${bonus}</b> نقطة` : "",
      "",
      `💎 رصيدك الآن: <b>${num(u.points)}</b> نقطة`,
      `🔥 سلسلتك: <b>${u.daily.streak}</b> يوم${u.daily.streak > 1 ? " متتالية" : ""}`,
      "",
      `📅 عُد غدًا لتحافظ على سلسلتك!`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/* ─────────────────────────────── عجلة الحظ ─────────────────────────────── */

function wheelText(db: DB, u: User) {
  const p = db.settings.points;
  const hours = p.wheelCooldownHours;
  const last = u.wheel.lastAt ? +new Date(u.wheel.lastAt) : 0;
  const ready = !last || Date.now() - last >= hours * 3600_000;
  const nextIn = last ? Math.max(0, hours * 3600_000 - (Date.now() - last)) : 0;
  return [
    "🎡 <b>عجلة الحظ</b>",
    "",
    `💎 رصيدك: <b>${num(u.points)}</b>`,
    `🎫 دورات إضافية: <b>${u.wheel.extra}</b>`,
    `🎯 دوراتك الكلية: <b>${u.wheel.spins}</b>`,
    "",
    ready
      ? "✨ العجلة جاهزة — اضغط <b>أدر العجلة</b>!"
      : `⏳ الدورة القادمة بعد: <b>${Math.ceil(nextIn / 60000)}</b> دقيقة${u.wheel.extra > 0 ? " — لكن لديك دورات إضافية!" : ""}`,
    "",
    "🎁 جوائز العجلة:",
    ...db.wheel.map((s) => `• ${esc(s.label)}`),
    "",
    `💡 كل <b>${p.wheelExtraPerRefs}</b> إحالة مؤكدة = دورة مجانية إضافية.`,
  ].join("\n");
}

function spinWheel(db: DB): number {
  const slices = db.wheel.filter((s) => s.weight > 0);
  const total = slices.reduce((a, s) => a + s.weight, 0);
  let r = Math.random() * total;
  for (const s of slices) {
    r -= s.weight;
    if (r <= 0) return s.points;
  }
  return slices[0]?.points ?? 1;
}

/* ─────────────────────────────── الإحالة ─────────────────────────────── */

async function applyReferral(db: DB, newUser: User, code: string, adminChatId?: string) {
  if (!db.settings.features.referrals) return;
  const ref = findByRefCode(db, code);
  if (!ref || ref.id === newUser.id || ref.banned) return;
  if (newUser.refBy) return;
  newUser.refBy = ref.id;
  ref.refCount += 1;
  const p = db.settings.points;
  addPoints(db, ref.id, p.refJoin, "ref", `إحالة جديدة: ${displayName(newUser)}`);
  db.counters.referrals += 1;
  pushEvent(db, "ref", ref.id, String(newUser.id));
  logActivity(db, {
    actor: "bot",
    icon: "🤝",
    title: `إحالة جديدة: ${displayName(newUser)}`,
    detail: `دخل من رابط ${displayName(ref)}`,
  });

  // صورة الداعي + صورة المنضم
  const [, newPhoto] = await Promise.all([refreshAvatar(db, ref.id), refreshAvatar(db, newUser.id)]);
  const refPhoto = ref.photo;
  const caption = [
    "🤝 <b>إحالة جديدة!</b>",
    "",
    `👤 <b>${esc(displayName(ref))}</b> دعا <b>${esc(displayName(newUser))}</b>`,
    "",
    `➕ ${p.refJoin} نقطة لك`,
    `💎 رصيدك: <b>${num(ref.points)}</b>`,
    `👥 إحالاتك: <b>${num(ref.refCount)}</b>`,
  ].join("\n");

  const photos = [refPhoto, newPhoto].filter(Boolean) as string[];
  if (photos.length >= 2) {
    const sent = await sendAlbum(ref.id, photos, caption);
    if (!sent) await sendMessage(ref.id, caption);
  } else if (photos.length === 1) {
    await safeTg("sendPhoto", {
      chat_id: ref.id,
      photo: photos[0],
      caption,
      parse_mode: "HTML",
    });
  } else {
    await sendMessage(ref.id, caption);
  }

  if (db.settings.admin.notifyOnJoin) {
    await notifyAdmin(
      db,
      [
        "🔔 <b>عضو جديد دخل برابط إحالة</b>",
        "",
        `👤 العضو: <b>${esc(displayName(newUser))}</b> ${newUser.username ? `(@${esc(newUser.username)})` : ""}`,
        `🆔 <code>${newUser.id}</code>`,
        `🤝 دعاه: <b>${esc(displayName(ref))}</b> ${ref.username ? `(@${esc(ref.username)})` : ""}`,
        `🆔 <code>${ref.id}</code>`,
        `👥 إحالات هذا العضو: ${num(ref.refCount)}`,
      ].join("\n"),
      photos.length === 1 ? { photo: photos[0] } : undefined
    );
  }
}

/** منح مكافأة التفعيل بعد التحقق من الاشتراك */
async function maybeActivateRef(db: DB, u: User) {
  if (!u.refBy || u.refBonusGiven) return false;
  const ref = db.users[String(u.refBy)];
  if (!ref) return false;
  const miss = db.settings.forceJoin.enabled ? await missingJoins(db, u.id) : [];
  if (miss.length > 0) return false;
  u.refBonusGiven = true;
  ref.refActive += 1;
  if (db.settings.features.referrals) {
    addPoints(db, ref.id, db.settings.points.refActive, "ref", `تفعيل إحالة: ${displayName(u)}`);
    // دورة عجلة إضافية لكل عدد إحالات
    if (db.settings.points.wheelExtraPerRefs > 0 && ref.refActive % db.settings.points.wheelExtraPerRefs === 0) {
      ref.wheel.extra += 1;
      await sendMessage(ref.id, "🎡 <b>مبروك!</b> حصلت على دورة إضافية مجانية في عجلة الحظ بسبب إحالاتك! 🎉");
    }
  }
  await sendMessage(
    ref.id,
    `✅ <b>تم تفعيل إحالتك!</b>\n\n👤 <b>${esc(displayName(u))}</b> انضم واشترك في القناة.\n➕ <b>+${db.settings.points.refActive}</b> نقطة\n💎 رصيدك: <b>${num(ref.points)}</b>`
  );
  return true;
}

/* ─────────────────────────────── الاستبدال ─────────────────────────────── */

function claimCode() {
  return `MX-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function redeem(db: DB, u: User, reward: Reward) {
  if (!db.settings.features.shop) return { ok: false, text: "🛍️ المتجر مغلق مؤقتًا." };
  if (u.points < reward.cost) {
    return {
      ok: false,
      text: `❌ نقاطك غير كافية.\n\n💎 لديك: <b>${num(u.points)}</b>\n💰 تحتاج: <b>${num(reward.cost)}</b>\n\n🔗 اجمع النقاط عبر الإحالات والهدية اليومية!`,
    };
  }
  if (reward.stock !== null && reward.stock !== undefined && reward.stock <= 0) {
    return { ok: false, text: "😔 نفدت هذه الجائزة. اختر جائزة أخرى." };
  }
  const code = claimCode();
  addPoints(db, u.id, -reward.cost, "prize", `استبدال: ${reward.title}`);
  if (reward.stock !== null && reward.stock !== undefined) reward.stock = Math.max(0, reward.stock - 1);
  db.claims.unshift({
    id: `cl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    code,
    userId: u.id,
    userName: displayName(u),
    rewardId: reward.id,
    rewardTitle: reward.title,
    cost: reward.cost,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  if (db.claims.length > 2000) db.claims.length = 2000;
  logActivity(db, {
    actor: "user",
    icon: "🛍️",
    title: `طلب استبدال: ${reward.title}`,
    detail: `${displayName(u)} • ${reward.cost} نقطة • ${code}`,
  });
  pushEvent(db, "redeem", u.id, reward.title);

  if (db.settings.admin.notifyOnRedeem) {
    await notifyAdmin(
      db,
      [
        "🛍️ <b>طلب استبدال جديد</b>",
        "",
        `👤 ${esc(displayName(u))} ${u.username ? `(@${esc(u.username)})` : ""}`,
        `🆔 <code>${u.id}</code>`,
        `🎁 الجائزة: <b>${esc(reward.title)}</b>`,
        `💰 التكلفة: <b>${reward.cost}</b> نقطة`,
        `🔑 الرمز: <code>${code}</code>`,
        "",
        "راجع الطلب من لوحة التحكم → الطلبات.",
      ].join("\n")
    );
  }
  return {
    ok: true,
    text: [
      "✅ <b>تم استلام طلبك!</b>",
      "",
      `🎁 الجائزة: <b>${esc(reward.title)}</b>`,
      `💰 خُصم: <b>${num(reward.cost)}</b> نقطة`,
      `💎 رصيدك المتبقي: <b>${num(u.points)}</b>`,
      `🔑 رمز الطلب: <code>${code}</code>`,
      "",
      `📦 ${esc(reward.delivery || "سيتم التسليم بعد المراجعة.")}`,
      "⏳ عادة تتم المراجعة خلال 24 ساعة.",
    ].join("\n"),
  };
}

function claimsText(db: DB, u: User) {
  const list = db.claims.filter((c) => c.userId === u.id).slice(0, 10);
  const st: Record<string, string> = {
    pending: "⏳ قيد المراجعة",
    approved: "✅ مقبول",
    delivered: "📦 تم التسليم",
    rejected: "❌ مرفوض",
  };
  return [
    "📦 <b>طلباتي</b>",
    "",
    ...(list.length
      ? list.map(
          (c) =>
            `• <b>${esc(c.rewardTitle)}</b> — ${st[c.status]}\n   🔑 <code>${c.code}</code> • ${fmtDate(c.createdAt)}`
        )
      : ["لا توجد طلبات بعد. تسوّق من المتجر! 🛍️"]),
  ].join("\n");
}

/* ─────────────────────────────── معالجة التحديثات ─────────────────────────────── */

const rate = new Map<number, { n: number; at: number }>();
const RATE_WINDOW_MS = 3000;
const RATE_MAX = 18;

/** حد بسيط ضد الضغط العشوائي — لا يؤثر على الاستخدام الطبيعي. */
function throttled(id: number): boolean {
  const now = Date.now();
  const r = rate.get(id);
  if (!r || now - r.at > RATE_WINDOW_MS) {
    rate.set(id, { n: 1, at: now });
    if (rate.size > 5000) rate.clear();
    return false;
  }
  r.n += 1;
  return r.n > RATE_MAX;
}

/** للاختبارات فقط */
export function __resetRateLimit() {
  rate.clear();
}

export async function handleUpdate(
  upd: TgUpdate,
  db: DB,
  botInfo: { username?: string; name?: string }
): Promise<void> {
  if (botInfo.username) db.meta.botUsername = botInfo.username;
  if (botInfo.name) db.meta.botName = botInfo.name;

  if (upd.callback_query) return handleCallback(upd.callback_query, db);
  if (upd.chat_member) return handleMember(upd.chat_member, db);
  if (upd.message) return handleMessage(upd.message, db);
}

async function handleMember(ev: TgChatMemberUpdated, db: DB) {
  const u = db.users[String(ev.from.id)];
  if (!u) return;
  const status = ev.new_chat_member?.status ?? "";
  u.status = ok.has(status) ? "member" : "left";
}

async function handleMessage(msg: TgMessage, db: DB) {
  const from = msg.from;
  if (!from || from.is_bot) return;
  const text = (msg.text ?? msg.caption ?? "").trim();
  if (!text) return;
  if (throttled(from.id)) return;

  // حماية: لا نتفاعل داخل المجموعات إلا مع الأوامر
  if (msg.chat.type !== "private" && !text.startsWith("/")) return;

  const u = ensureUser(db, from);
  db.counters.messages += 1;
  u.messages += 1;
  pushEvent(db, "msg", u.id);

  if (u.banned) {
    await sendMessage(from.id, `🚫 حسابك محظور.\n${u.banReason ? `السبب: ${esc(u.banReason)}` : ""}`);
    return;
  }
  if (db.settings.maintenance && !isBotAdmin(db, u.id)) {
    await sendMessage(from.id, esc(db.settings.maintenanceText));
    return;
  }
  if (!db.settings.botEnabled) return;

  const [cmd, ...args] = text.split(/\s+/);
  const arg = args[0] ?? "";

  if (cmd === "/start") {
    const payload = arg.replace(/^ref_?/, "").trim();
    // صورة الحساب (مرة واحدة)
    if (!u.photo) void refreshAvatar(db, u.id);

    if (payload && !u.refBy) {
      await applyReferral(db, u, payload, db.settings.admin.adminChatId);
    }
    const miss = await gate(db, u);
    if (miss) {
      await sendMessage(from.id, joinGateText(db), joinKeyboard(miss));
      return;
    }
    await maybeActivateRef(db, u);
    await softJoinNudge(db, u);
    const s = db.settings;
    if (s.texts.startMedia) {
      await safeTg("sendPhoto", {
        chat_id: from.id,
        photo: s.texts.startMedia,
        caption: `${homeText(db, u, botInfoName(db))}\n\n${s.texts.startBody}`,
        parse_mode: "HTML",
        reply_markup: mainKeyboard(db, u, s.admin.adminChatId),
      });
      return;
    }
    await sendMessage(from.id, homeText(db, u, botInfoName(db)), mainKeyboard(db, u, s.admin.adminChatId));
    if (!u.adminNotified) {
      u.adminNotified = true;
      if (db.settings.admin.notifyOnJoin) {
        await notifyAdmin(
          db,
          [
            "👋 <b>عضو دخل البوت</b>",
            "",
            `👤 <b>${esc(displayName(u))}</b> ${u.username ? `(@${esc(u.username)})` : ""}`,
            `🆔 <code>${u.id}</code>`,
            `👥 إجمالي الأعضاء: ${num(countUsers(db).total)}`,
            payload ? `🔗 دخل من رابط: <code>${esc(payload)}</code>` : "🔍 دخل مباشرة",
          ].join("\n"),
          u.photo ? { photo: u.photo } : undefined
        );
      }
    }
    return;
  }

  if (cmd === "/points" || cmd === "/balance") {
    await sendMessage(from.id, pointsText(db, u), inline([
      [{ text: "🎁 هدية اليوم", data: "cb:daily" }, { text: "🔙 القائمة", data: "cb:home" }],
    ]));
    return;
  }
  if (cmd === "/daily") {
    const miss = await gate(db, u);
    if (miss) return void (await sendMessage(from.id, joinGateText(db), joinKeyboard(miss)));
    const r = doDaily(db, u);
    await sendMessage(from.id, r.text, inline([[{ text: "🔙 القائمة", data: "cb:home" }]]));
    return;
  }
  if (cmd === "/top" || cmd === "/leaderboard") {
    await sendMessage(
      from.id,
      topText(db, "points"),
      inline([[{ text: "🤝 أفضل الداعين", data: "cb:top:refs" }, { text: "🔙 رجوع", data: "cb:home" }]])
    );
    return;
  }
  if (cmd === "/ref" || cmd === "/invite") {
    const l = refLink(db, u);
    const share = `${db.settings.texts.shareText}\n${l}`;
    await sendMessage(
      from.id,
      refText(db, u),
      inline([
        [{ text: "📤 شارك رابطك", url: `https://t.me/share/url?url=${encodeURIComponent(l)}&text=${encodeURIComponent(db.settings.texts.shareText)}` }],
        [{ text: "🔙 رجوع", data: "cb:home" }],
      ])
    );
    void share;
    return;
  }
  if (cmd === "/shop" || cmd === "/store") {
    await sendMessage(from.id, shopText(db, u), shopKeyboard(db, u));
    return;
  }
  if (cmd === "/help") {
    await sendMessage(from.id, helpText(db), inline([[{ text: "🔙 رجوع", data: "cb:home" }]]));
    return;
  }
  // أي رسالة أخرى → القائمة (بوت ودود)
  await sendMessage(from.id, homeText(db, u, botInfoName(db)), mainKeyboard(db, u, db.settings.admin.adminChatId));
}

const botInfoName = (db: DB) => db.meta.botName || "مسابقات MX";

function helpText(db: DB) {
  return [
    "ℹ️ <b>المساعدة</b>",
    "",
    "🔹 <code>/start</code> — القائمة الرئيسية",
    "🔹 <code>/points</code> — رصيدك",
    "🔹 <code>/daily</code> — هدية اليوم",
    "🔹 <code>/top</code> — المتصدرون",
    "🔹 <code>/ref</code> — رابط الإحالة",
    "🔹 <code>/shop</code> — المتجر",
    "",
    "📚 <b>القوانين:</b>",
    esc(db.settings.texts.rules),
    "",
    `☎️ ${esc(db.settings.texts.support)}`,
  ].join("\n");
}

/* ─────────────────────────────── الأزرار ─────────────────────────────── */

async function handleCallback(q: TgCallback, db: DB) {
  const data = q.data ?? "";
  const from = q.from;
  const msg = q.message;
  if (!msg) return void (await answerCb(q.id, "انتهت صلاحية الرسالة.", true));
  const u = db.users[String(from.id)] ?? ensureUser(db, from);
  const key = mainKeyboard(db, u, db.settings.admin.adminChatId);
  const show = async (text: string, keyboard: unknown = key) => {
    await editText(msg.chat.id, msg.message_id, text, keyboard);
  };

  if (u.banned) return void (await answerCb(q.id, "🚫 حسابك محظور", true));
  if (throttled(from.id)) return void (await answerCb(q.id));

  const [ns, action, a1] = data.split(":");

  if (data === "noop") return void (await answerCb(q.id));

  if (data === "check_join") {
    const miss = await gate(db, u);
    if (miss && miss.length) {
      await answerCb(q.id, "❌ لم تشترك بعد!", true);
      await show(joinGateText(db), joinKeyboard(miss));
      return;
    }
    await answerCb(q.id, "✅ تم التحقق", false);
    await maybeActivateRef(db, u);
    await show(homeText(db, u, botInfoName(db)));
    return;
  }

  if (ns !== "cb") return void (await answerCb(q.id));

  if (action === "home") {
    await answerCb(q.id);
    await show(homeText(db, u, botInfoName(db)));
    return;
  }
  if (action === "points") {
    await answerCb(q.id);
    await show(pointsText(db, u), inline([[{ text: "🎁 هدية اليوم", data: "cb:daily" }, { text: "🔙 رجوع", data: "cb:home" }]]));
    return;
  }
  if (action === "top") {
    await answerCb(q.id);
    const by = a1 === "refs" ? "refs" : "points";
    await show(
      topText(db, by),
      inline([
        [
          { text: by === "points" ? "• النقاط •" : "النقاط", data: "cb:top" },
          { text: by === "refs" ? "• الداعون •" : "أفضل الداعين", data: "cb:top:refs" },
        ],
        [{ text: "🔙 رجوع", data: "cb:home" }],
      ])
    );
    return;
  }
  if (action === "ref") {
    await answerCb(q.id);
    const l = refLink(db, u);
    await show(
      refText(db, u),
      inline([
        [{ text: "📤 شارك رابطك", url: `https://t.me/share/url?url=${encodeURIComponent(l)}&text=${encodeURIComponent(db.settings.texts.shareText)}` }],
        [{ text: "🔄 تحديث", data: "cb:ref" }, { text: "🔙 رجوع", data: "cb:home" }],
      ])
    );
    return;
  }
  if (action === "daily") {
    const miss = await gate(db, u);
    if (miss && miss.length) {
      await answerCb(q.id, "🔒 اشترك أولًا", true);
      await show(joinGateText(db), joinKeyboard(miss));
      return;
    }
    const r = doDaily(db, u);
    await answerCb(q.id, r.ok ? "🎁 مبروك!" : "⏳ غدًا إن شاء الله", !r.ok);
    await show(r.text, inline([[{ text: "🎡 عجلة الحظ", data: "cb:wheel" }, { text: "🔙 رجوع", data: "cb:home" }]]));
    return;
  }
  if (action === "wheel") {
    await answerCb(q.id);
    await show(wheelText(db, u), inline([[{ text: "🎯 أدر العجلة", data: "cb:spin" }], [{ text: "🔙 رجوع", data: "cb:home" }]]));
    return;
  }
  if (action === "spin") {
    const p = db.settings.points;
    const last = u.wheel.lastAt ? +new Date(u.wheel.lastAt) : 0;
    const ready = !last || Date.now() - last >= p.wheelCooldownHours * 3600_000;
    if (!ready && u.wheel.extra <= 0) {
      const mins = Math.ceil((p.wheelCooldownHours * 3600_000 - (Date.now() - last)) / 60000);
      await answerCb(q.id, `⏳ العجلة متاحة بعد ${mins} دقيقة`, true);
      return;
    }
    if (u.wheel.extra > 0) u.wheel.extra -= 1;
    else u.wheel.lastAt = new Date().toISOString();
    u.wheel.spins += 1;
    db.counters.wheelSpins += 1;
    const pts = spinWheel(db);
    if (pts > 0) addPoints(db, u.id, pts, "wheel", "عجلة الحظ");
    pushEvent(db, "spin", u.id);
    await answerCb(q.id, pts > 0 ? `🎉 ربحت ${pts} نقطة!` : "😅 حظ أوفر", true);
    await show(
      [
        "🎡 <b>نتیجه العجلة</b>",
        "",
        pts > 0 ? `🎉 مبروك! ربحت <b>${pts}</b> نقطة` : "😅 لا شيء هذه المرة… جرّب لاحقًا!",
        "",
        `💎 رصيدك: <b>${num(u.points)}</b>`,
        `🎫 دورات إضافية: <b>${u.wheel.extra}</b>`,
      ].join("\n"),
      inline([[{ text: "🎯 أدر مرة أخرى", data: "cb:spin" }], [{ text: "🔙 رجوع", data: "cb:home" }]])
    );
    return;
  }
  if (action === "tasks") {
    await answerCb(q.id);
    await show(tasksText(db, u), tasksKeyboard(db, u));
    return;
  }
  if (action === "task") {
    const tk = db.tasks.find((x) => x.id === a1);
    if (!tk) return void (await answerCb(q.id, "المهمة غير موجودة", true));
    const done = tk.repeat === "once" ? Boolean(u.tasks[tk.id]) : u.tasks[tk.id] === algeriaDay();
    if (done) return void (await answerCb(q.id, "✅ أنجزت هذه المهمة مسبقًا", true));
    if (tk.type === "channel") {
      const handle = tk.target.replace(/^@/, "");
      const res = await getChatMember(`@${handle}`, u.id);
      // res === null  → البوت لا يستطيع القراءة (ليس أدمن): لا نحجب العضو، نمنح النقاط بثقة
      // res.ok        → نتحقّق فعليًا ولا نمنح إن لم يشترك
      if (res && !ok.has(res.status)) {
        await answerCb(q.id, "❌ لم تشترك بعد!", true);
        return;
      }
    }
    u.tasks[tk.id] = tk.repeat === "once" ? new Date().toISOString() : algeriaDay();
    addPoints(db, u.id, tk.points, "task", `مهمة: ${tk.title}`);
    pushEvent(db, "task", u.id, tk.title);
    await answerCb(q.id, `✅ +${tk.points} نقطة`, true);
    await show(tasksText(db, u), tasksKeyboard(db, u));
    return;
  }
  if (action === "shop") {
    await answerCb(q.id);
    await show(shopText(db, u), shopKeyboard(db, u));
    return;
  }
  if (action === "rw") {
    const rw = db.rewards.find((r) => r.id === a1);
    if (!rw) return void (await answerCb(q.id, "الجائزة غير موجودة", true));
    await answerCb(q.id);
    const can = u.points >= rw.cost;
    await show(
      [
        `${rw.emoji} <b>${esc(rw.title)}</b>`,
        "",
        esc(rw.desc),
        "",
        `💰 السعر: <b>${num(rw.cost)}</b> نقطة`,
        `💎 رصيدك: <b>${num(u.points)}</b> ${can ? "✅" : "❌"}`,
        rw.stock !== null && rw.stock !== undefined ? `📦 المتوفر: <b>${rw.stock}</b>` : "📦 متوفر دائمًا",
        "",
        rw.delivery ? `🚚 ${esc(rw.delivery)}` : "",
        can ? "هل تريد تأكيد الاستبدال؟" : "اجمع المزيد من النقاط أولًا 🔗",
      ]
        .filter(Boolean)
        .join("\n"),
      inline([
        can ? [{ text: "✅ تأكيد الاستبدال", data: `cb:buy:${rw.id}` }] : [{ text: "🔗 اجمع نقاطًا", data: "cb:ref" }],
        [{ text: "🔙 المتجر", data: "cb:shop" }],
      ])
    );
    return;
  }
  if (action === "buy") {
    const rw = db.rewards.find((r) => r.id === a1);
    if (!rw) return void (await answerCb(q.id, "الجائزة غير موجودة", true));
    const miss = await gate(db, u);
    if (miss && miss.length) {
      await answerCb(q.id, "🔒 اشترك أولًا", true);
      return;
    }
    const res = await redeem(db, u, rw);
    await answerCb(q.id, res.ok ? "✅ تم إرسال طلبك" : "❌ تعذّر", !res.ok);
    await show(res.text, inline([[{ text: "🛍️ المتجر", data: "cb:shop" }, { text: "📦 طلباتي", data: "cb:claims" }], [{ text: "🔙 رجوع", data: "cb:home" }]]));
    return;
  }
  if (action === "claims") {
    await answerCb(q.id);
    await show(claimsText(db, u), inline([[{ text: "🛍️ المتجر", data: "cb:shop" }, { text: "🔙 رجوع", data: "cb:home" }]]));
    return;
  }
  if (action === "contests") {
    await answerCb(q.id);
    const active = db.contests.filter((c) => c.status === "active" && c.image);
    const first = active[0];
    if (first?.image) {
      // مسابقة بصورتها: نُرسل بطاقة مصوّرة، ونعدّل نص القائمة تحتها
      const kb = inline([
        ...(first.buttonUrl ? [[{ text: first.buttonLabel || "🔗 تفاصيل المسابقة", url: first.buttonUrl }]] : []),
        [{ text: "🏆 المتصدرون", data: "cb:top" }, { text: "🔙 رجوع", data: "cb:home" }],
      ]);
      await sendPhoto(msg.chat.id, first.image, contestsText(db), kb);
      return;
    }
    await show(contestsText(db), inline([[{ text: "🏆 المتصدرون", data: "cb:top" }, { text: "🔙 رجوع", data: "cb:home" }]]));
    return;
  }
  if (action === "rules") {
    await answerCb(q.id);
    await show(`📚 <b>القوانين</b>\n\n${esc(db.settings.texts.rules)}`, inline([[{ text: "🔙 رجوع", data: "cb:home" }]]));
    return;
  }
  if (action === "support") {
    await answerCb(q.id);
    await show(
      `☎️ <b>الدعم</b>\n\n${esc(db.settings.texts.support)}\n\n📣 قناتنا: ${link(db.settings.forceJoin.title, db.settings.forceJoin.url)}`,
      inline([[{ text: "📣 القناة", url: db.settings.forceJoin.url }], [{ text: "🔙 رجوع", data: "cb:home" }]])
    );
    return;
  }
  await answerCb(q.id);
}

/* ─────────────────────────────── التهيئة ─────────────────────────────── */

export async function setupBot(db: DB) {
  const results: Record<string, boolean> = {};
  results.commands = Boolean(await setMyCommands());
  results.description = Boolean(await setMyDescription());
  results.short = Boolean(await setMyShortDescription());
  const me = await safeTg<{ username?: string; first_name?: string }>("getMe");
  if (me?.username) db.meta.botUsername = me.username;
  if (me?.first_name) db.meta.botName = me.first_name;
  const chat = db.settings.forceJoin.username ? await getChat(`@${db.settings.forceJoin.username.replace(/^@/, "")}`) : null;
  if (chat) {
    if (chat.title) db.settings.forceJoin.title = chat.title;
    if (chat.invite_link) db.settings.forceJoin.url = chat.invite_link;
  }
  db.meta.setupAt = new Date().toISOString();
  return { results, me };
}
