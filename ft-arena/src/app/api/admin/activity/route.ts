/** سجل النشاط + الأحداث + إمكانية حذف السجل */
import { guard, json } from "@/lib/api";
import { loadDB, logActivity, mutate } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard();
  if (g) return g;
  const db = await loadDB();
  return json({ ok: true, activity: db.activity, logs: db.logs.slice(0, 50) });
}

export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  let body: { op?: string };
  try {
    body = (await req.json()) as { op?: string };
  } catch {
    body = {};
  }
  await mutate((db) => {
    if (body.op === "clear") {
      db.activity = [];
      db.logs = [];
      logActivity(db, { actor: "admin", icon: "🧹", title: "تفريغ السجل" });
    }
    return true;
  });
  return json({ ok: true });
}
