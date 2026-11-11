/** إدارة جوائز المتجر (CRUD كامل) */
import { guard, json, bad, safeDetail } from "@/lib/api";
import { loadDB, logActivity, mutate } from "@/lib/store";
import type { Reward } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard();
  if (g) return g;
  const db = await loadDB();
  return json({ ok: true, rewards: db.rewards.sort((a, b) => a.order - b.order) });
}

export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  let body: { op?: string; reward?: Partial<Reward>; id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("JSON غير صالح");
  }
  try {
    const out = await mutate((db) => {
      const op = body.op ?? "save";
      if (op === "save") {
        const r = body.reward ?? {};
        if (!r.title) throw new Error("عنوان الجائزة مطلوب");
        if (body.id) {
          const ex = db.rewards.find((x) => x.id === body.id);
          if (!ex) throw new Error("الجائزة غير موجودة");
          Object.assign(ex, {
            emoji: r.emoji ?? ex.emoji,
            title: r.title,
            desc: r.desc ?? ex.desc,
            cost: Number(r.cost ?? ex.cost),
            stock: r.stock === undefined ? ex.stock : r.stock === null ? null : Number(r.stock),
            image: r.image ?? ex.image,
            active: r.active ?? ex.active,
            delivery: r.delivery ?? ex.delivery,
            order: Number(r.order ?? ex.order),
          });
          // إشعار كل المستخدمين؟ لا — فقط سجل
          logActivity(db, { actor: "admin", icon: "🛍️", title: `تعديل جائزة: ${ex.title}`, detail: `${ex.cost} نقطة` });
          return { reward: ex };
        }
        const created: Reward = {
          id: `rw_${Math.random().toString(36).slice(2, 9)}`,
          emoji: r.emoji ?? "🎁",
          title: r.title,
          desc: r.desc ?? "",
          cost: Math.max(1, Number(r.cost ?? 10)),
          stock: r.stock === undefined ? null : r.stock === null ? null : Number(r.stock),
          image: r.image,
          active: r.active ?? true,
          delivery: r.delivery ?? "يتم التسليم بعد المراجعة.",
          order: Number(r.order ?? db.rewards.length + 1),
        };
        db.rewards.push(created);
        logActivity(db, { actor: "admin", icon: "🛍️", title: `إضافة جائزة: ${created.title}`, detail: `${created.cost} نقطة` });
        return { reward: created };
      }
      if (op === "delete") {
        const i = db.rewards.findIndex((x) => x.id === body.id);
        if (i < 0) throw new Error("الجائزة غير موجودة");
        const [rm] = db.rewards.splice(i, 1);
        logActivity(db, { actor: "admin", icon: "🗑️", title: `حذف جائزة: ${rm.title}` });
        return { deleted: rm.id };
      }
      if (op === "toggle") {
        const ex = db.rewards.find((x) => x.id === body.id);
        if (!ex) throw new Error("الجائزة غير موجودة");
        ex.active = !ex.active;
        return { reward: ex };
      }
      if (op === "reorder") {
        db.rewards = db.rewards.map((r, i) => ({ ...r, order: i + 1 }));
        return { ok: true };
      }
      throw new Error("op غير معروف");
    });
    return json({ ok: true, ...out, rewards: (await loadDB()).rewards.sort((a, b) => a.order - b.order) });
  } catch (e) {
    return bad(safeDetail(e));
  }
}
