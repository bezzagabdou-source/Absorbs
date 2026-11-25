/** إعدادات البوت — قراءة وتعديل شامل */
import { guard, json, bad, safeDetail } from "@/lib/api";
import { loadDB, logActivity, mutate } from "@/lib/store";
import type { Settings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard();
  if (g) return g;
  const db = await loadDB();
  return json({ ok: true, settings: db.settings, wheel: db.wheel, tasks: db.tasks, rewards: db.rewards });
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("JSON غير صالح");
  }
  try {
    const result = await mutate((db) => {
      const s = db.settings as unknown as Record<string, unknown>;
      // دمج عميق آمن (فقط الحقول الموجودة)
      const merge = (target: Record<string, unknown>, src: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(src)) {
          if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object") {
            merge(target[k] as Record<string, unknown>, v as Record<string, unknown>);
          } else if (k in target || k === "startMedia" || k === "welcomeSticker") {
            target[k] = v;
          }
        }
      };
      if (body.settings && typeof body.settings === "object") {
        merge(s, body.settings as Record<string, unknown>);
        if (body.settings && typeof (body.settings as Settings).botName === "string") {
          db.settings.botName = String((body.settings as Settings).botName).slice(0, 40) || "مسابقات MX";
        }
      }
      if (Array.isArray(body.wheel)) db.wheel = clone(body.wheel) as typeof db.wheel;
      logActivity(db, { actor: "admin", icon: "⚙️", title: "تحديث الإعدادات", detail: Object.keys(body).join(", ") });
      return db.settings;
    });
    return json({ ok: true, settings: result });
  } catch (e) {
    return bad(safeDetail(e), 500);
  }
}
