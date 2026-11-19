import { NextResponse } from "next/server";
import data from "../../../../mediators-bot/data.json";

const TOKEN = process.env.BOT_TOKEN || "9169731361:AAGdtx1soQWt2GIdcq23_vSyS1XfLcIH0NQ";
const API = `https://api.telegram.org/bot${TOKEN}`;

async function call(method: string, body: any) {
  const r = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json().catch(() => ({}));
}

const link = (u: string) => `https://t.me/${(u || "").replace("@", "")}`;
// عرض اليوزر مفكك الحروف حتى لا يلتصق عند النسخ: @X _ W _ W _ R
const spaced = (u: string) => (u || "").replace(/^@/, "@").replace(/_/g, " _ ");
const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function sectionText(key: string): string {
  const items: any[] = (data as any).sections[key] || [];
  const lines = items.map((it) => {
    const u = spaced(it.username);
    let line = `${it.note || "🔹"} <b>${esc(it.name)}</b>\n👤 <a href="${link(it.username)}">${esc(u)}</a>`;
    if (it.guarantee) line += `\n💰 ضمانه: <b>${esc(it.guarantee)}</b>`;
    return line;
  });
  let body = lines.join("\n\n") || "✅ لا يوجد أي عنصر بعد";
  if (key === "xr") {
    const i = (data as any).xr_info;
    body += `\n\n⚠️ <b>تنبيه:</b> أي يوزر غير مذكور أعلاه لا يمثل XR\n👑 المالك: <a href="${link(i.owner)}">${esc(spaced(i.owner))}</a>\n📩 الشكاوى: ${i.complaints.map((c: string) => `<a href="${link(c)}">${esc(spaced(c))}</a>`).join(" ")}\n👥 الكروب: <a href="${link(i.group)}">${esc(spaced(i.group))}</a>\n🛒 المتجر: <a href="${link(i.store)}">${esc(spaced(i.store))}</a>`;
  }
  if (key === "bm") body += `\n\n🛡️ <b>كل الوسطاء مضمونين من طرف المالك</b> <a href="${link((data as any).bm_info.owner)}">${esc(spaced((data as any).bm_info.owner))}</a>`;
  if (key === "ft") {
    const i = (data as any).ft_info;
    body += `\n\n🗒️ هذه قائمة الوسطاء الموثوقين — انتبه للمنتحلين وتأكد من اليوزرات ⚜️\n🔹 ضمان وسطاء FT: <a href="${link(i.guarantee)}">${esc(spaced(i.guarantee))}</a>\n🔸 دليل ثقة وسطاء FT: <a href="${link(i.proof)}">${esc(spaced(i.proof))}</a>`;
  }
  if (key === "scammers" && !items.length) body = "🎉 <b>لم يتوفر أي محتال بعد</b> — الحمد لله ✅\n\n🛡️ قائمتنا نظيفة وموثوقة 100%";
  return body;
}

function sectionButtons(key: string) {
  const items: any[] = (data as any).sections[key] || [];
  const btns: any[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const row = items.slice(i, i + 2)
      .filter((it) => it.username)
      .map((it) => ({ text: `💬 ${it.name}`, url: link(it.username) }));
    if (row.length) btns.push(row);
  }
  btns.push([{ text: "⬅️ القائمة الرئيسية", callback_data: "menu" }]);
  return { inline_keyboard: btns };
}

const mainMenu = {
  inline_keyboard: [
    [{ text: "🛡️ وسطاء XR الرسميون", callback_data: "sec:xr" }, { text: "⚔️ وسطاء BM", callback_data: "sec:bm" }],
    [{ text: "🎩 وسطاء FT", callback_data: "sec:ft" }, { text: "👑 وسطاء ومالكين", callback_data: "sec:owners" }],
    [{ text: "🎁 مجانيين مؤقتاً", callback_data: "sec:free" }, { text: "🚨 منتحلين الوسطاء", callback_data: "sec:scammers" }],
    [{ text: "📊 إحصائيات البوت", callback_data: "stats" }],
  ],
};

const TITLES: Record<string, string> = {
  xr: "🛡️ وسطاء XR الرسميون 🛡️", bm: "⚔️ وسطاء مجموعة BM ⚔️", ft: "🎩 وسطاء FT 🎩",
  owners: "👑 وسطاء ومالكين 👑", free: "🎁 وسطاء مجانيين مؤقتاً 🎁", scammers: "🚨 منتحلين الوسطاء 🚨",
};

const WELCOME = `🛡️ <b>بوت يجمع جميع الوسطاء المضمونين</b> 🛡️

✨ أهلاً بك في منصة الوسطاء الموثوقين ✨
🔒 ضمان كامل ضد السرقة والاحتيال
✅ وسطاء مضمونين 100%
⚠️ انتبه للمنتحلين وتأكد من اليوزرات

👇 <b>اختر القسم من الأسفل</b> 👇`;

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("setup") === "1") {
    const host = url.host;
    const res = await call("setWebhook", { url: `https://${host}/api/telegram`, drop_pending_updates: true });
    return NextResponse.json({ webhook: `https://${host}/api/telegram`, result: res });
  }
  return NextResponse.json({ ok: true, bot: "mediators-bot" });
}

export async function POST(req: Request) {
  const update = await req.json().catch(() => ({}));
  try {
    if (update.message?.text?.startsWith("/start")) {
      await call("sendMessage", {
        chat_id: update.message.chat.id,
        text: WELCOME,
        parse_mode: "HTML",
        reply_markup: mainMenu,
        disable_web_page_preview: true,
      });
    } else if (update.callback_query) {
      const q = update.callback_query;
      const cb: string = q.data || "";
      // رد فوري + تنفيذ بالتوازي = سرعة أعلى
      const [chat_id, message_id] = [q.message.chat.id, q.message.message_id];
      const answer = call("answerCallbackQuery", { callback_query_id: q.id });
      if (cb === "menu") {
        await Promise.all([answer, call("editMessageText", {
          chat_id, message_id, text: WELCOME, parse_mode: "HTML",
          reply_markup: mainMenu, disable_web_page_preview: true,
        })]);
      } else if (cb === "stats") {
        const total = Object.values((data as any).sections).reduce((a: number, v: any) => a + v.length, 0);
        await Promise.all([answer, call("editMessageText", {
          chat_id, message_id,
          text: `📊 <b>إحصائيات البوت</b> 📊\n\n👥 عدد المستخدمين: <b>${(data as any).users.length}</b>\n🛡️ إجمالي الوسطاء: <b>${total}</b>\n🚨 المنتحلين: <b>${(data as any).sections.scammers.length}</b>`,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [[{ text: "⬅️ رجوع", callback_data: "menu" }]] },
        })]);
      } else if (cb.startsWith("sec:")) {
        const key = cb.split(":")[1];
        await Promise.all([answer, call("editMessageText", {
          chat_id, message_id,
          text: `${TITLES[key] || key}\n\n${sectionText(key)}`,
          parse_mode: "HTML",
          reply_markup: sectionButtons(key),
          disable_web_page_preview: true,
        })]);
      }
    }
  } catch (e) {
    console.error("webhook error", e);
  }
  return NextResponse.json({ ok: true });
}
