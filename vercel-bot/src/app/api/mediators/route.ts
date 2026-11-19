import { NextResponse } from "next/server";
import initialData from "../../../../mediators-bot/data.json";
import { authorized } from "@/lib/admin-auth";
import { db } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load() {
  const sql = db();
  await sql`CREATE TABLE IF NOT EXISTS mediator_state (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
  await sql`INSERT INTO mediator_state (id, data) VALUES ('main', ${JSON.stringify(initialData)}::jsonb) ON CONFLICT (id) DO NOTHING`;
  const rows = await sql`SELECT data FROM mediator_state WHERE id = 'main'`;
  return rows[0]?.data as any;
}

async function save(data: any) {
  const sql = db();
  await sql`UPDATE mediator_state SET data = ${JSON.stringify(data)}::jsonb, updated_at = now() WHERE id = 'main'`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  try {
    return NextResponse.json(await load(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("mediator data load failed", error);
    return NextResponse.json({ error: "تعذر الاتصال بقاعدة البيانات" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  try {
    const body = await request.json();
    const data = await load();
    const section = data.sections?.[body.section];
    if (body.action === "add" && Array.isArray(section)) {
      section.push({ name: body.name || "", username: body.username || "", guarantee: body.guarantee || "", note: body.note || "🔹" });
    } else if (body.action === "update" && Array.isArray(section) && Number.isInteger(body.index) && section[body.index]) {
      section[body.index] = { ...section[body.index], name: body.name || "", username: body.username || "", guarantee: body.guarantee || "", note: body.note || "🔹" };
    } else if (body.action === "del" && Array.isArray(section) && Number.isInteger(body.index) && body.index >= 0 && body.index < section.length) {
      section.splice(body.index, 1);
    } else if (body.action === "update_info" && ["xr_info", "bm_info", "ft_info"].includes(body.key) && body.value && typeof body.value === "object") {
      data[body.key] = body.value;
    } else if (body.action === "update_setting" && ["bot_name", "welcome"].includes(body.key) && typeof body.value === "string") {
      data[body.key] = body.value;
    } else {
      return NextResponse.json({ error: "عملية غير صالحة" }, { status: 400 });
    }
    await save(data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("mediator data save failed", error);
    return NextResponse.json({ error: "تعذر حفظ التغييرات" }, { status: 503 });
  }
}
