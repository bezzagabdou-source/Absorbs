/** إدارة المسابقات (إنشاء / إنهاء / تصدير الفائزين) */
import { guard, json, bad, safeDetail } from "@/lib/api";
import { loadDB, logActivity, mutate } from "@/lib/store";
import { topUsers } from "@/lib/bot-utils";
import type { Contest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard();
  if (g) return g;
  const db = await loadDB();
  return json({ ok: true, contests: db.contests });
}

export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  let body: { op?: string; contest?: Partial<Contest>; id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("JSON غير صالح");
  }
  try {
    const out = await mutate((db) => {
      const op = body.op ?? "save";
      if (op === "save") {
        const c = body.contest ?? {};
        if (!c.title) throw new Error("عنوان المسابقة مطلوب");
        if (body.id) {
          const ex = db.contests.find((x) => x.id === body.id);
          if (!ex) throw new Error("المسابقة غير موجودة");
          Object.assign(ex, {
            title: c.title ?? ex.title,
            desc: c.desc ?? ex.desc,
            prize: c.prize ?? ex.prize,
            winnersCount: Number(c.winnersCount ?? ex.winnersCount),
            endsAt: c.endsAt ?? ex.endsAt,
            status: c.status ?? ex.status,
          });
          return { contest: ex };
        }
        const created: Contest = {
          id: `ct_${Math.random().toString(36).slice(2, 9)}`,
          title: c.title,
          desc: c.desc ?? "",
          prize: c.prize ?? "جائزة",
          winnersCount: Math.max(1, Number(c.winnersCount ?? 3)),
          endsAt: c.endsAt ?? new Date(Date.now() + 7 * 86400_000).toISOString(),
          status: "active",
        };
        db.contests.push(created);
        logActivity(db, { actor: "admin", icon: "🏅", title: `إنشاء مسابقة: ${created.title}` });
        return { contest: created };
      }
      if (op === "end") {
        const ex = db.contests.find((x) => x.id === body.id);
        if (!ex) throw new Error("المسابقة غير موجودة");
        ex.status = "ended";
        ex.winners = topUsers(db, ex.winnersCount).map((u) => ({
          userId: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || String(u.id),
          points: u.points,
        }));
        logActivity(db, { actor: "admin", icon: "🏁", title: `إنهاء مسابقة: ${ex.title}`, detail: ex.winners.map((w) => w.name).join(", ") });
        return { contest: ex };
      }
      if (op === "delete") {
        db.contests = db.contests.filter((x) => x.id !== body.id);
        return { ok: true };
      }
      throw new Error("op غير معروف");
    });
    return json({ ok: true, ...out });
  } catch (e) {
    return bad(safeDetail(e));
  }
}
