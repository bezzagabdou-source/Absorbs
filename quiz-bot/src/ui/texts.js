import { esc, num, fmtDateTime } from "../util.js";
import { isAdmin } from "../config.js";

export function displayName(u) {
  if (!u) return "مجهول";
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  const handle = u.username ? `@${u.username}` : null;
  if (full && handle) return `${full} (${handle})`;
  return full || handle || `#${u.tg_id}`;
}

export function welcome(user, { botName = "FT AI" } = {}) {
  const admin = isAdmin(user.tg_id) ? "👑 أنت آدمِن." : "";
  return (
    `⚡ <b>${esc(botName)}</b> — بوت المسابقات\n` +
    `أهلاً ${esc(user.first_name ?? "صاحبي")}! ${admin}\n\n` +
    `🎯 <b>جاوب</b> على الأسئلة واجمع نقاط\n` +
    `🎁 <b>نقاطك اليومية</b> كل يوم\n` +
    `🔗 <b>عزم صحابك</b> برابط الإحالة\n` +
    `🏆 <b>تنافس</b> في لوحة الشرف\n\n` +
    `استعمل الأزرار تحت 👇`
  );
}

export function mainMenu(user) {
  const rows = [
    [{ text: "🎯 العب مسابقة", callback_data: "quiz:play" }],
    [
      { text: "💰 نقاطي", callback_data: "me:points" },
      { text: "💡 مكافأة اليوم", callback_data: "daily:claim" },
    ],
    [
      { text: "🔗 رابط الإحالة", callback_data: "ref:link" },
      { text: "👥 المسجلين بسببي", callback_data: "ref:list" },
    ],
    [{ text: "🏆 لوحة الشرف", callback_data: "board:top" }],
  ];
  if (isAdmin(user.tg_id)) {
    rows.push([{ text: "👑 إدارة", callback_data: "admin:panel" }]);
  }
  return rows;
}

export function questionText({ question, categoryLabel, seconds, n, total }) {
  return (
    `❓ <b>سؤال ${n ?? 1}/${total ?? 1}</b> — ${esc(categoryLabel)}\n\n` +
    `<b>${esc(question)}</b>\n\n` +
    `⏱️ عندك <b>${seconds}</b> ثانية`
  );
}

export function quizResult({ correct, points, speedBonus, streak, correctText }) {
  if (correct) {
    return (
      `✅ <b>صحيح!</b>\n` +
      `+${num(points)} نقطة ${speedBonus ? `(منها ${speedBonus} مكافأة سرعة ⚡)` : ""}\n` +
      `🔥 سلسلة: <b>${num(streak ?? 0)}</b>`
    );
  }
  return `❌ <b>غلط.</b> الجواب الصحيح: <b>${esc(correctText)}</b>\nمعليش، السلسلة تتصفّر 🔄`;
}

export function profileCard(user) {
  const bot = "";
  return (
    `👤 <b>بطاقتك</b>${bot}\n\n` +
    `الاسم: <b>${esc([user.first_name, user.last_name].filter(Boolean).join(" ") || "—")}</b>\n` +
    `المعرّف: <code>${user.tg_id}</code>\n` +
    `النقاط: <b>${num(user.points)}</b>\n` +
    `أفضل سلسلة: <b>${num(user.best_streak)}</b>\n` +
    `الإحالات: <b>${num(user.referrals)}</b>\n` +
    `منذ: ${fmtDateTime(user.joined_at)}`
  );
}

export function referralCard(user, link, summary) {
  return (
    `🔗 <b>رابط الإحالة تاعك</b>\n\n` +
    `<code>${esc(link)}</code>\n\n` +
    `شارك الرابط، وكل واحد يسجّل بيه تاخد نقاط:\n` +
    `• مسجّلين: <b>${num(summary.total)}</b>\n` +
    `• مفعّلين: <b>${num(summary.confirmed)}</b> (${num(summary.earned)} نقطة)\n` +
    `• في الانتظار: <b>${num(summary.pending)}</b>\n` +
    `• مشبوهين: <b>${num(summary.flagged)}</b>\n\n` +
    `⚠️ الحسابات المزورة تُلغى والنقاط تُسحب.`
  );
}

export function boardText(rows, me) {
  if (!rows.length) return "لوحة الشرف خاوية مازال 👀";
  const medals = ["🥇", "🥈", "🥉"];
  let s = "🏆 <b>لوحة الشرف</b>\n\n";
  rows.forEach((r, i) => {
    const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || (r.username ? "@" + r.username : `#${r.tg_id}`);
    s += `${medals[i] ?? `${i + 1}.`} ${esc(name)} — <b>${num(r.points)}</b>\n`;
  });
  if (me) s += `\n📍 موقعك: <b>#${me.rank}</b> — ${num(me.points)} نقطة`;
  return s;
}

export function blockedText(reason, until) {
  let s = `🛑 <b>توقّف شوية</b>\n\n${esc(reason ?? "نشاط مريب")}`;
  if (until) {
    const s2 = Math.ceil((until - Date.now()) / 1000);
    s += `\n⏳ حاول بعد <b>${s2}</b> ثانية.`;
  }
  return s;
}

export function dailyText(res) {
  if (!res.ok && res.reason === "already") {
    return `📅 خديت مكافأة اليوم من قبل ✅\nجرب غدوة بإذن الله.`;
  }
  return (
    `🎁 <b>مكافأة اليوم</b>\n` +
    `+${num(res.points)} نقطة${res.bonus ? `\n(+${res.bonus} مكافأة سلسلة 🔥 ${res.streak} يوم)` : ""}\n\n` +
    `ارجع غدوة باش ما تقطعش السلسلة!`
  );
}

export { esc, num };
