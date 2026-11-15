/** إدارة طلبات الاستبدال: قبول / رفض / تسليم + استرداد النقاط */
import { guard, json, bad, safeDetail } from "@/lib/api";
import { loadDB, logActivity, mutate } from "@/lib/store";
import { addPoints, displayName } from "@/lib/bot-utils";
import { sendMessage } from "@/lib/tg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard();
  if (g) return g;
  const db = await loadDB();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "all";
  let list = [...db.claims];
  if (status !== "all") list = list.filter((c) => c.status === status);
  return json({ ok: true, claims: list.slice(0, 300), counts: {
    all: db.claims.length,
    pending: db.claims.filter((c) => c.status === "pending").length,
    approved: db.claims.filter((c) => c.status === "approved").length,
    delivered: db.claims.filter((c) => c.status === "delivered").length,
    rejected: db.claims.filter((c) => c.status === "rejected").length,
  } });
}

export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  let body: { id?: string; action?: "approve" | "reject" | "deliver"; note?: string; refund?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("JSON غير صالح");
  }
  try {
    const out = await mutate(async (db) => {
      const c = db.claims.find((x) => x.id === body.id);
      if (!c) throw new Error("الطلب غير موجود");
      const u = db.users[String(c.userId)];
      const decision = new Date().toISOString();

      if (body.action === "approve") {
        c.status = "approved";
        c.decidedAt = decision;
        c.adminNote = body.note;
        await sendMessage(
          c.userId,
          `✅ <b>تمت الموافقة على طلبك!</b>\n\n🎁 ${c.rewardTitle}\n🔑 <code>${c.code}</code>\n\n${
            body.note ? `📝 ${body.note}\n\n` : ""
          }⏳ سيتم التسليم قريبًا.`
        );
      } else if (body.action === "deliver") {
        c.status = "delivered";
        c.decidedAt = decision;
        c.adminNote = body.note;
        db.counters.rewardsDelivered += 1;
        await sendMessage(
          c.userId,
          `📦 <b>تم تسليم جائزتك!</b>\n\n🎁 ${c.rewardTitle}\n🔑 <code>${c.code}</code>\n\n${
            body.note ? `📝 ${body.note}\n\n` : ""
          }🎉 تهانينا! شاركنا رأيك.`
        );
      } else if (body.action === "reject") {
        c.status = "rejected";
        c.decidedAt = decision;
        c.adminNote = body.note;
        if (u && body.refund !== false) {
          addPoints(db, c.userId, c.cost, "admin", `استرداد طلب: ${c.rewardTitle}`);
          const rw = db.rewards.find((r) => r.id === c.rewardId);
          if (rw && rw.stock !== null) rw.stock += 1;
        }
        await sendMessage(
          c.userId,
          `❌ <b>تم رفض طلب الاستبدال</b>\n\n🎁 ${c.rewardTitle}\n🔑 <code>${c.code}</code>\n\n${
            body.note ? `📝 ${body.note}\n\n` : ""
          }${body.refund !== false ? `💎 تم إرجاع <b>${c.cost}</b> نقطة إلى رصيدك.` : ""}`
        );
      } else {
        throw new Error("action غير معروف");
      }
      logActivity(db, {
        actor: "admin",
        icon: body.action === "reject" ? "❌" : body.action === "deliver" ? "📦" : "✅",
        title: `طلب ${c.rewardTitle}: ${body.action}`,
        detail: `${c.userName} • ${c.code}`,
      });
      return { claim: c };
    });
    return json({ ok: true, claim: out.claim });
  } catch (e) {
    return bad(safeDetail(e));
  }
}
