/** إدارة المستخدمين: بحث، فرز، تعديل النقاط، حظر، VIP… */
import { guard, json, bad, safeDetail } from "@/lib/api";
import { loadDB, logActivity, mutate } from "@/lib/store";
import { addPoints, displayName, refLink } from "@/lib/bot-utils";
import { sendMessage } from "@/lib/tg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard();
  if (g) return g;
  const db = await loadDB();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const sort = url.searchParams.get("sort") ?? "points";
  const filter = url.searchParams.get("filter") ?? "all";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const per = 25;

  let list = Object.values(db.users);
  if (q) {
    list = list.filter(
      (u) =>
        displayName(u).toLowerCase().includes(q) ||
        (u.username ?? "").toLowerCase().includes(q) ||
        String(u.id).includes(q) ||
        (u.refCode ?? "").toLowerCase().includes(q)
    );
  }
  if (filter === "banned") list = list.filter((u) => u.banned);
  if (filter === "vip") list = list.filter((u) => u.vip);
  if (filter === "active") list = list.filter((u) => Date.now() - +new Date(u.lastSeenAt) < 86400_000);
  if (filter === "inactive") list = list.filter((u) => Date.now() - +new Date(u.lastSeenAt) > 7 * 86400_000);
  if (filter === "refs") list = list.filter((u) => u.refCount > 0);

  const sorters: Record<string, (a: typeof list[number], b: typeof list[number]) => number> = {
    points: (a, b) => b.points - a.points,
    refs: (a, b) => b.refCount - a.refCount,
    new: (a, b) => +new Date(b.joinedAt) - +new Date(a.joinedAt),
    active: (a, b) => +new Date(b.lastSeenAt) - +new Date(a.lastSeenAt),
    earned: (a, b) => b.totalEarned - a.totalEarned,
  };
  list.sort(sorters[sort] ?? sorters.points);

  const total = list.length;
  const items = list.slice((page - 1) * per, page * per).map((u) => ({
    id: u.id,
    name: displayName(u),
    username: u.username,
    photo: u.photo,
    points: u.points,
    earned: u.totalEarned,
    spent: u.totalSpent,
    refs: u.refCount,
    refsActive: u.refActive,
    joinedAt: u.joinedAt,
    lastSeenAt: u.lastSeenAt,
    banned: u.banned,
    vip: u.vip,
    status: u.status,
    messages: u.messages,
    streak: u.daily.streak,
    refCode: u.refCode,
    refBy: u.refBy,
    link: refLink(db, u),
    history: u.history.slice(0, 10),
  }));

  return json({ ok: true, items, total, page, per });
}

export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  let body: {
    action?: string;
    id?: number;
    amount?: number;
    message?: string;
    note?: string;
    reason?: string;
    vip?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("JSON غير صالح");
  }
  const id = Number(body.id);
  if (!id) return bad("معرّف المستخدم مطلوب");

  try {
    const out = await mutate(async (db) => {
      const u = db.users[String(id)];
      if (!u) throw new Error("المستخدم غير موجود");
      switch (body.action) {
        case "add": {
          const n = Number(body.amount ?? 0);
          addPoints(db, id, n, "admin", body.note || "تعديل من الإدارة");
          if (body.message) await sendMessage(id, String(body.message));
          logActivity(db, { actor: "admin", icon: "💎", title: `تعديل نقاط: ${displayName(u)}`, detail: `${n > 0 ? "+" : ""}${n}` });
          return { points: u.points };
        }
        case "set": {
          const n = Math.max(0, Number(body.amount ?? 0));
          addPoints(db, id, n - u.points, "admin", body.note || "تعيين الرصيد من الإدارة");
          logActivity(db, { actor: "admin", icon: "💎", title: `تعيين رصيد: ${displayName(u)}`, detail: String(n) });
          return { points: u.points };
        }
        case "ban": {
          u.banned = true;
          u.banReason = body.reason || "مخالفة القوانين";
          logActivity(db, { actor: "admin", icon: "🚫", title: `حظر: ${displayName(u)}`, detail: u.banReason });
          return { banned: true };
        }
        case "unban": {
          u.banned = false;
          u.banReason = undefined;
          logActivity(db, { actor: "admin", icon: "✅", title: `فك الحظر: ${displayName(u)}` });
          return { banned: false };
        }
        case "vip": {
          u.vip = body.vip ?? !u.vip;
          logActivity(db, { actor: "admin", icon: "👑", title: `${u.vip ? "منح VIP" : "إزالة VIP"}: ${displayName(u)}` });
          return { vip: u.vip };
        }
        case "note": {
          u.note = String(body.note ?? "");
          return { note: u.note };
        }
        case "message": {
          const sent = await sendMessage(id, String(body.message ?? ""));
          return { sent: Boolean(sent) };
        }
        case "refreshPhoto": {
          const { profilePhoto } = await import("@/lib/tg");
          u.photo = (await profilePhoto(id)) ?? u.photo;
          return { photo: u.photo ?? null };
        }
        case "reset": {
          addPoints(db, id, -u.points, "admin", "تصفير الرصيد");
          return { points: 0 };
        }
        default:
          throw new Error("action غير معروف");
      }
    });
    return json({ ok: true, ...out });
  } catch (e) {
    return bad(safeDetail(e), 400);
  }
}
