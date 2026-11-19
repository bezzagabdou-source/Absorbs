import { NextResponse } from "next/server";
import data from "../../../../mediators-bot/data.json";
import { db } from "@/lib/database";
import { authorized } from "@/lib/admin-auth";

const TOKEN = process.env.BOT_TOKEN || "9169731361:AAGdtx1soQWt2GIdcq23_vSyS1XfLcIH0NQ";
const API = `https://api.telegram.org/bot${TOKEN}`;
const REQUIRED_CHANNEL = "@mxabdou";
const REQUIRED_CHANNEL_URL = "https://t.me/mxabdou";

async function isSubscribed(userId: number | string) {
  try {
    const result = await call("getChatMember", { chat_id: REQUIRED_CHANNEL, user_id: userId });
    const status = result?.result?.status;
    return result?.ok === true && (status === "member" || status === "administrator" || status === "creator" || (status === "restricted" && result.result.is_member === true));
  } catch (error) {
    console.error("channel membership check failed", error);
    return false;
  }
}

const subscriptionPrompt = `🔒 <b>الاشتراك في القناة مطلوب لاستخدام البوت</b>\n\nاشترك في قناة @mxabdou، ثم اضغط «تحققت من الاشتراك».`;
const subscriptionMenu = {
  inline_keyboard: [
    [{ text: "📢 اشترك في القناة", url: REQUIRED_CHANNEL_URL, style: "success" }],
    [{ text: "✅ تحققت من الاشتراك", callback_data: "check_subscription", style: "primary" }],
  ],
};

async function loadBotData() {
  const sql = db();
  await sql`CREATE TABLE IF NOT EXISTS mediator_state (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`INSERT INTO mediator_state (id, data) VALUES ('main', ${JSON.stringify(data)}::jsonb) ON CONFLICT (id) DO NOTHING`;
  const rows = await sql`SELECT data FROM mediator_state WHERE id = 'main'`;
  return rows[0]?.data || data;
}

async function ensureBotUsers() {
  const sql = db();
  await sql`CREATE TABLE IF NOT EXISTS telegram_users (
    user_id text PRIMARY KEY, username text NOT NULL DEFAULT '', first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '',
    first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(), starts integer NOT NULL DEFAULT 1
  )`;
  return sql;
}

async function trackUser(user: any) {
  if (!user?.id) return;
  const sql = await ensureBotUsers();
  await sql`INSERT INTO telegram_users (user_id, username, first_name, last_name, first_seen, last_seen, starts)
    VALUES (${String(user.id)}, ${user.username || ''}, ${user.first_name || ''}, ${user.last_name || ''}, now(), now(), 1)
    ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name, last_seen = now(), starts = telegram_users.starts + 1`;
}

async function getUsers() {
  const sql = await ensureBotUsers();
  return sql`SELECT user_id AS id, username, first_name, last_name, first_seen, last_seen, starts FROM telegram_users ORDER BY last_seen DESC LIMIT 500`;
}

async function getUserCount() {
  const sql = await ensureBotUsers();
  const rows = await sql`SELECT count(*)::int AS count FROM telegram_users`;
  return rows[0]?.count || 0;
}
async function call(method: string, body: any) {
  const r = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(7000),
  });
  return r.json().catch(() => ({}));
}

const link = (u: string) => `https://t.me/${(u || "").replace("@", "")}`;
// عرض اليوزر مفكك الحروف حتى لا يلتصق عند النسخ: @X _ W _ W _ R
const spaced = (u: string) => (u || "").replace(/^@/, "@").replace(/_/g, " _ ");
const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function sectionText(key: string, currentData: any): string {
  const items: any[] = currentData.sections[key] || [];
  const lines = items.map((it) => {
    const u = spaced(it.username);
    const namePart = it.name && it.name !== "وسيط XR" ? `<b>${esc(it.name)}</b>\n` : "";
    let line = `${it.note || "🔹"} ${namePart}👤 <a href="${link(it.username)}">${esc(u)}</a>`;
    if (it.guarantee) line += `\n💰 ضمانه: <b>${esc(it.guarantee)}</b>`;
    return line;
  });
  let body = lines.join("\n\n") || "✅ لا يوجد أي عنصر بعد";
  if (key === "xr") {
    const i = currentData.xr_info;
    body += `\n\n⚠️ <b>تنبيه:</b> أي يوزر غير مذكور أعلاه لا يمثل XR\n👑 المالك: <a href="${link(i.owner)}">${esc(spaced(i.owner))}</a>\n📩 الشكاوى: ${i.complaints.map((c: string) => `<a href="${link(c)}">${esc(spaced(c))}</a>`).join(" ")}\n👥 الكروب: <a href="${link(i.group)}">${esc(spaced(i.group))}</a>\n🛒 المتجر: <a href="${link(i.store)}">${esc(spaced(i.store))}</a>`;
  }
  if (key === "bm") body += `\n\n🛡️ <b>كل الوسطاء مضمونين من طرف المالك</b> <a href="${link(currentData.bm_info.owner)}">${esc(spaced(currentData.bm_info.owner))}</a>`;
  if (key === "ft") {
    const i = currentData.ft_info;
    body += `\n\n🗒️ هذه قائمة الوسطاء الموثوقين — انتبه للمنتحلين وتأكد من اليوزرات ⚜️\n🔹 ضمان وسطاء FT: <a href="${link(i.guarantee)}">${esc(spaced(i.guarantee))}</a>\n🔸 دليل ثقة وسطاء FT: <a href="${link(i.proof)}">${esc(spaced(i.proof))}</a>`;
  }
  if (key === "scammers" && !items.length) body = "🎉 <b>لم يتوفر أي محتال بعد</b> — الحمد لله ✅\n\n🛡️ قائمتنا نظيفة وموثوقة 100%";
  return body;
}

function sectionButtons(key: string, currentData: any) {
  const items: any[] = currentData.sections[key] || [];
  const btns: any[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const row = items.slice(i, i + 2)
      .filter((it) => it.username)
      .map((it) => ({ text: `💬 ${it.name === "وسيط XR" ? it.username : it.name}`, url: link(it.username), style: "success" }));
    if (row.length) btns.push(row);
  }
  btns.push([{ text: "⬅️ القائمة الرئيسية", callback_data: "menu", style: "primary" }]);
  return { inline_keyboard: btns };
}

const mainMenu = {
  inline_keyboard: [
    [{ text: "🛡️ وسطاء XR الرسميون", callback_data: "sec:xr", style: "primary" }, { text: "⚔️ وسطاء BM", callback_data: "sec:bm", style: "primary" }],
    [{ text: "🎩 وسطاء FT", callback_data: "sec:ft", style: "primary" }, { text: "👑 وسطاء ومالكين", callback_data: "sec:owners", style: "primary" }],
    [{ text: "🎁 مجانيين مؤقتاً", callback_data: "sec:free", style: "success" }, { text: "🚨 منتحلين الوسطاء", callback_data: "sec:scammers", style: "danger" }],
    [{ text: "📊 إحصائيات البوت", callback_data: "stats", style: "primary" }],
  ],
};

const TITLES: Record<string, string> = {
  xr: "🛡️ وسطاء XR الرسميون 🛡️", bm: "⚔️ وسطاء مجموعة BM ⚔️", ft: "🎩 وسطاء FT 🎩",
  owners: "👑 وسطاء ومالكين 👑", free: "🎁 وسطاء مجانيين مؤقتاً 🎁", scammers: "🚨 منتحلين الوسطاء 🚨",
};

function welcomeText(currentData: any) {
  const title = currentData.bot_name || "🛡️ بوت يجمع جميع الوسطاء المضمونين 🛡️";
  const message = currentData.welcome || "✨ أهلاً بك في منصة الوسطاء الموثوقين ✨\n🔒 ضمان كامل ضد السرقة والاحتيال\n✅ وسطاء مضمونين 100%\n⚠️ انتبه للمنتحلين وتأكد من اليوزرات";
  return `<b>${esc(title)}</b>\n\n${esc(message)}\n\n🔐 عند استخدام البوت، نحفظ معرّف تيليغرام وبيانات الحساب الأساسية لإحصاء المستخدمين.\n👇 <b>اختر القسم من الأسفل</b> 👇`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("setup") === "1") {
    if (!authorized(req)) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    const host = url.host;
    const res = await call("setWebhook", { url: `https://${host}/api/telegram`, drop_pending_updates: true });
    return NextResponse.json({ webhook: `https://${host}/api/telegram`, result: res });
  }
  if (url.searchParams.get("users") === "1") {
    if (!authorized(req)) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    try {
      const users = await getUsers();
      return NextResponse.json({ users, configured: Boolean(process.env.DATABASE_URL) });
    } catch (error) {
      console.error("visitor store read failed", error);
      return NextResponse.json({ users: [], configured: true, error: "store_unavailable" }, { status: 503 });
    }
  }
  return NextResponse.json({ ok: true, bot: "mediators-bot" });
}

export async function POST(req: Request) {
  const update = await req.json().catch(() => ({}));
  const liveData = await loadBotData().catch(() => data);
  const welcome = welcomeText(liveData);
  try {
    if (update.message?.text?.startsWith("/start")) {
      const member = await isSubscribed(update.message.from.id);
      await Promise.allSettled([
        trackUser(update.message.from),
        call("sendMessage", {
          chat_id: update.message.chat.id,
          text: member ? welcome : subscriptionPrompt,
          parse_mode: "HTML",
          reply_markup: member ? mainMenu : subscriptionMenu,
          disable_web_page_preview: true,
        }),
      ]);
    } else if (update.callback_query) {
      const q = update.callback_query;
      const cb: string = q.data || "";
      const [chat_id, message_id] = [q.message.chat.id, q.message.message_id];
      if (cb === "check_subscription") {
        const member = await isSubscribed(q.from.id);
        if (member) {
          await Promise.all([
            call("answerCallbackQuery", { callback_query_id: q.id, text: "تم التحقق من اشتراكك ✅" }),
            call("editMessageText", { chat_id, message_id, text: welcome, parse_mode: "HTML", reply_markup: mainMenu, disable_web_page_preview: true }),
          ]);
        } else {
          await Promise.all([
            call("answerCallbackQuery", { callback_query_id: q.id, text: "لم يظهر اشتراكك بعد. اشترك بالقناة ثم أعد المحاولة.", show_alert: true }),
            call("editMessageText", { chat_id, message_id, text: subscriptionPrompt, parse_mode: "HTML", reply_markup: subscriptionMenu }),
          ]);
        }
        return NextResponse.json({ ok: true });
      }
      // يمنع فتح القوائم إذا أُلغي الاشتراك بعد بدء البوت.
      const member = await isSubscribed(q.from.id);
      if (!member) {
        await Promise.all([
          call("answerCallbackQuery", { callback_query_id: q.id, text: "الاشتراك بالقناة مطلوب أولاً", show_alert: true }),
          call("editMessageText", { chat_id, message_id, text: subscriptionPrompt, parse_mode: "HTML", reply_markup: subscriptionMenu }),
        ]);
        return NextResponse.json({ ok: true });
      }
      const answer = call("answerCallbackQuery", { callback_query_id: q.id });
      if (cb === "menu") {
        await Promise.all([answer, call("editMessageText", {
          chat_id, message_id, text: welcome, parse_mode: "HTML",
          reply_markup: mainMenu, disable_web_page_preview: true,
        })]);
      } else if (cb === "stats") {
        const total = Object.values(liveData.sections).reduce((a: number, v: any) => a + v.length, 0);
        const userCount = await getUserCount().catch(() => (liveData.users || []).length);
        await Promise.all([answer, call("editMessageText", {
          chat_id, message_id,
          text: `📊 <b>إحصائيات البوت</b> 📊\n\n👥 عدد المستخدمين: <b>${userCount}</b>\n🛡️ إجمالي الوسطاء: <b>${total}</b>\n🚨 المنتحلين: <b>${liveData.sections.scammers.length}</b>`,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "⬅️ رجوع", callback_data: "menu", style: "primary" }]] },
        })]);
      } else if (cb.startsWith("sec:")) {
        const key = cb.split(":")[1];
        await Promise.all([answer, call("editMessageText", {
          chat_id, message_id,
          text: `${TITLES[key] || key}\n\n${sectionText(key, liveData)}`,
          parse_mode: "HTML",
          reply_markup: sectionButtons(key, liveData),
          disable_web_page_preview: true,
        })]);
      }
    }
  } catch (e) {
    console.error("webhook error", e);
  }
  return NextResponse.json({ ok: true });
}
