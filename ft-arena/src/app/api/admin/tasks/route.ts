/** إدارة المهام (اشتراك قناة / زيارة رابط / مهمة يدوية) */
import { guard, json, bad, safeDetail } from "@/lib/api";
import { loadDB, logActivity, mutate } from "@/lib/store";
import type { Task } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard();
  if (g) return g;
  const db = await loadDB();
  return json({ ok: true, tasks: db.tasks.sort((a, b) => a.order - b.order) });
}

export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  let body: { op?: string; task?: Partial<Task>; id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("JSON غير صالح");
  }
  try {
    const out = await mutate((db) => {
      const op = body.op ?? "save";
      if (op === "save") {
        const t = body.task ?? {};
        if (!t.title) throw new Error("عنوان المهمة مطلوب");
        if (body.id) {
          const ex = db.tasks.find((x) => x.id === body.id);
          if (!ex) throw new Error("المهمة غير موجودة");
          Object.assign(ex, {
            emoji: t.emoji ?? ex.emoji,
            title: t.title,
            type: t.type ?? ex.type,
            target: t.target ?? ex.target,
            points: Number(t.points ?? ex.points),
            active: t.active ?? ex.active,
            repeat: t.repeat ?? ex.repeat,
            order: Number(t.order ?? ex.order),
          });
          logActivity(db, { actor: "admin", icon: "✅", title: `تعديل مهمة: ${ex.title}` });
          return { task: ex };
        }
        const created: Task = {
          id: `tk_${Math.random().toString(36).slice(2, 9)}`,
          emoji: t.emoji ?? "⭐️",
          title: t.title,
          type: t.type ?? "custom",
          target: t.target ?? "",
          points: Math.max(1, Number(t.points ?? 1)),
          active: t.active ?? true,
          repeat: t.repeat ?? "once",
          order: Number(t.order ?? db.tasks.length + 1),
        };
        db.tasks.push(created);
        logActivity(db, { actor: "admin", icon: "✅", title: `إضافة مهمة: ${created.title}`, detail: `+${created.points}` });
        return { task: created };
      }
      if (op === "delete") {
        const i = db.tasks.findIndex((x) => x.id === body.id);
        if (i < 0) throw new Error("المهمة غير موجودة");
        const [rm] = db.tasks.splice(i, 1);
        return { deleted: rm.id };
      }
      if (op === "toggle") {
        const ex = db.tasks.find((x) => x.id === body.id);
        if (!ex) throw new Error("المهمة غير موجودة");
        ex.active = !ex.active;
        return { task: ex };
      }
      throw new Error("op غير معروف");
    });
    return json({ ok: true, ...out, tasks: (await loadDB()).tasks.sort((a, b) => a.order - b.order) });
  } catch (e) {
    return bad(safeDetail(e));
  }
}
