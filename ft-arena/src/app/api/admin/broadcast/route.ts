/** البث الجماعي — إرسال رسالة/صورة لكل الأعضاء مع تتبع النتائج */
import { guard, json, bad, safeDetail } from "@/lib/api";
import { loadDB, logActivity, mutate } from "@/lib/store";
import { safeTg } from "@/lib/tg";
import type { Broadcast } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const g = await guard();
  if (g) return g;
  const db = await loadDB();
  return json({ ok: true, broadcasts: db.broadcasts.slice(0, 20) });
}

export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  let body: {
    text?: string;
    image?: string;
    buttonLabel?: string;
    buttonUrl?: string;
    audience?: Broadcast["audience"];
    test?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("JSON غير صالح");
  }
  const text = (body.text ?? "").trim();
  if (!text) return bad("نص الرسالة مطلوب");

  const db = await loadDB();
  const audience = body.audience ?? "all";
  const now = Date.now();
  let targets = Object.values(db.users).filter((u) => !u.banned);
  if (audience === "active") targets = targets.filter((u) => now - +new Date(u.lastSeenAt) < 7 * 86400_000);
  if (audience === "inactive") targets = targets.filter((u) => now - +new Date(u.lastSeenAt) > 7 * 86400_000);
  if (audience === "vip") targets = targets.filter((u) => u.vip);
  if (audience === "withPoints") targets = targets.filter((u) => u.points > 0);

  const markup =
    body.buttonLabel && body.buttonUrl
      ? { inline_keyboard: [[{ text: body.buttonLabel, url: body.buttonUrl }]] }
      : undefined;

  if (body.test) {
    const adminId = db.settings.admin.adminChatId;
    if (!adminId) return bad("حدّد ADMIN_CHAT_ID في الإعدادات لإرسال تجربة");
    const r = body.image
      ? await safeTg("sendPhoto", { chat_id: adminId, photo: body.image, caption: text, parse_mode: "HTML", ...(markup ? { reply_markup: markup } : {}) })
      : await safeTg("sendMessage", { chat_id: adminId, text, parse_mode: "HTML", ...(markup ? { reply_markup: markup } : {}) });
    return json({ ok: Boolean(r), tested: true });
  }

  const id = `bc_${Date.now().toString(36)}`;
  const record: Broadcast = {
    id,
    text,
    image: body.image,
    buttonLabel: body.buttonLabel,
    buttonUrl: body.buttonUrl,
    createdAt: new Date().toISOString(),
    status: "sending",
    sent: 0,
    failed: 0,
    audience,
  };
  await mutate((d) => {
    d.broadcasts.unshift(record);
    if (d.broadcasts.length > 30) d.broadcasts.length = 30;
    logActivity(d, { actor: "admin", icon: "📢", title: `بث جماعي (${targets.length} عضو)`, detail: text.slice(0, 120) });
    return true;
  });

  // إرسال على دفعات صغيرة لاحترام حدود تيليجرام
  let sent = 0;
  let failed = 0;
  const chunk = 22;
  for (let i = 0; i < targets.length; i += chunk) {
    const slice = targets.slice(i, i + chunk);
    await Promise.all(
      slice.map(async (u) => {
        try {
          const res = body.image
            ? await safeTg("sendPhoto", {
                chat_id: u.id,
                photo: body.image,
                caption: text,
                parse_mode: "HTML",
                ...(markup ? { reply_markup: markup } : {}),
              })
            : await safeTg("sendMessage", {
                chat_id: u.id,
                text,
                parse_mode: "HTML",
                link_preview_options: { is_disabled: false },
                ...(markup ? { reply_markup: markup } : {}),
              });
          if (res) sent += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      })
    );
    if (i + chunk < targets.length) await new Promise((r) => setTimeout(r, 900));
  }

  await mutate((d) => {
    const rec = d.broadcasts.find((x) => x.id === id);
    if (rec) {
      rec.sent = sent;
      rec.failed = failed;
      rec.status = "done";
    }
    return true;
  });

  return json({ ok: true, id, sent, failed, total: targets.length });
}
