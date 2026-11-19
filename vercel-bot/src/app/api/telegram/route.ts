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

function sectionText(key: string): string {
  const items: any[] = (data as any).sections[key] || [];
  const lines = items.map((it) => {
    let line = `${it.note || ""} ${it.name} — [${it.username}](${link(it.username)})`;
    if (it.guarantee) line += ` — ضمانه: ${it.guarantee}`;
    return line;
  });
  let body = lines.join("\n") || "لا يوجد أي عنصر بعد ✅";
  if (key === "xr") {
    const i = (data as any).xr_info;
    body += `\n\n⚠️ أي يوزر غير مذكور أعلاه لا يمثل XR.\n👑 المالك: ${i.owner}\n📩 الشكاوى: ${i.complaints.join(" ")}\n👥 الكروب: ${i.group}\n🛒 المتجر: ${i.store}`;
  }
  if (key === "bm") body += `\n\n*كل الوسطاء مضمونين من طرف المالك ${(data as any).bm_info.owner}*`;
  if (key === "ft") {
    const i = (data as any).ft_info;
    body += `\n\nهذه هي قائمة الوسطاء الموثوقين لدينا. يرجى الانتباه للمنتحلين وتأكد من اليوزرات 🗒⚜️\nضمان الوسطاء Ft: ${i.guarantee} 🔹️\nدليل ثقة وسطاء FT: ${i.proof} 🔸️`;
  }
  if (key === "scammers" && !items.length) body = "✅ لم يتوفر أي محتال بعد — الحمد لله";
  return body;
}

function sectionButtons(key: string) {
  const items: any[] = (data as any).sections[key] || [];
  const btns = items
    .filter((it) => it.username)
    .map((it) => [{ text: `💬 ${it.name} — ${it.username}`, url: link(it.username) }]);
  btns.push([{ text: "🔙 رجوع", callback_data: "menu" }]);
  return { inline_keyboard: btns };
}

const mainMenu = {
  inline_keyboard: [
    [{ text: "🛡️ وسطاء XR", callback_data: "sec:xr" }, { text: "⚔️ وسطاء BM", callback_data: "sec:bm" }],
    [{ text: "🎩 وسطاء FT", callback_data: "sec:ft" }, { text: "👑 وسطاء ومالكين", callback_data: "sec:owners" }],
    [{ text: "🎁 وسطاء مجانيين مؤقتاً", callback_data: "sec:free" }, { text: "🚨 منتحلين الوسطاء", callback_data: "sec:scammers" }],
    [{ text: "📊 إحصائيات البوت", callback_data: "stats" }],
  ],
};

const TITLES: Record<string, string> = {
  xr: "🛡️ وسطاء XR الرسميون", bm: "⚔️ وسطاء مجموعة BM", ft: "🎩 وسطاء FT",
  owners: "👑 وسطاء ومالكين", free: "🎁 وسطاء مجانيين مؤقتاً", scammers: "🚨 منتحلين الوسطاء",
};

// تفعيل Webhook: افتح الرابط مرة واحدة بعد النشر
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
        text: (data as any).welcome,
        reply_markup: mainMenu,
        disable_web_page_preview: true,
      });
    } else if (update.callback_query) {
      const q = update.callback_query;
      const cb: string = q.data || "";
      await call("answerCallbackQuery", { callback_query_id: q.id });
      if (cb === "menu") {
        await call("editMessageText", {
          chat_id: q.message.chat.id, message_id: q.message.message_id,
          text: (data as any).welcome, reply_markup: mainMenu, disable_web_page_preview: true,
        });
      } else if (cb === "stats") {
        const total = Object.values((data as any).sections).reduce((a: number, v: any) => a + v.length, 0);
        await call("editMessageText", {
          chat_id: q.message.chat.id, message_id: q.message.message_id,
          text: `📊 إحصائيات البوت\n\n👥 عدد المستخدمين: ${(data as any).users.length}\n🛡️ إجمالي الوسطاء: ${total}`,
          reply_markup: { inline_keyboard: [[{ text: "🔙 رجوع", callback_data: "menu" }]] },
        });
      } else if (cb.startsWith("sec:")) {
        const key = cb.split(":")[1];
        const caption = `${TITLES[key] || key}\n\n${sectionText(key)}`;
        const photo = ["xr", "bm", "ft"].includes(key)
          ? `https://raw.githubusercontent.com/bezzagabdou-source/Absorbs/arena/c45408d9-absorbs/mediators-bot/assets/${key}.jpg` : null;
        if (photo) {
          await call("sendPhoto", {
            chat_id: q.message.chat.id, photo, caption,
            parse_mode: "Markdown", reply_markup: sectionButtons(key),
          });
        } else {
          await call("editMessageText", {
            chat_id: q.message.chat.id, message_id: q.message.message_id,
            text: caption, parse_mode: "Markdown",
            reply_markup: sectionButtons(key), disable_web_page_preview: true,
          });
        }
      }
    }
  } catch (e) {
    console.error("webhook error", e);
  }
  return NextResponse.json({ ok: true });
}
