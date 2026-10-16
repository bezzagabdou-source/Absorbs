import { after } from "next/server";
import { json, serverError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { ensureSchema } from "@/db/ensure-schema";
import { pool } from "@/db";
import { buildFile, fileKindMeta, slugFilename, byteLength, type FileKind } from "@/lib/atlas-files";
import { getProfile } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * v18 ATLAS — خزنة الملفات (File Factory).
 *
 *   GET    /api/files            قائمة ملفات المستخدم (+ ?kind=html)
 *   POST   /api/files            حفظ ملف: { code, lang?, title?, extras?, visibility? }
 *   DELETE /api/files?id=…       حذف (أو ?all=1)
 *
 * التسليم (معاينة/تنزيل/ZIP/رابط عام) في /api/files/deliver/[id].
 */

const KINDS: FileKind[] = ["html", "svg", "markdown", "json", "csv", "code", "text", "image", "audio", "zip"];
const MAX_CONTENT = 6_000_000;

type Row = {
  id: string;
  title: string;
  kind: string;
  filename: string;
  mime: string;
  bytes: number;
  extras: unknown;
  visibility: string;
  views: number;
  downloads: number;
  created_at: Date | string;
  head?: string;
};

function rowOut(r: Row) {
  return {
    id: r.id,
    title: r.title,
    kind: r.kind,
    filename: r.filename,
    mime: r.mime,
    bytes: r.bytes,
    extras: Array.isArray(r.extras) ? (r.extras as { path: string }[]).length : 0,
    visibility: r.visibility,
    views: r.views,
    downloads: r.downloads,
    createdAt: typeof r.created_at === "string" ? r.created_at : r.created_at.toISOString(),
    head: r.head ?? undefined,
  };
}

export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind") ?? "";
  const limit = Math.min(200, Math.max(1, Number(u.searchParams.get("limit") ?? 60) || 60));
  try {
    await ensureSchema();
    const params: unknown[] = [user.uid, limit];
    let where = "user_id = $1";
    if (KINDS.includes(kind as FileKind)) {
      where += " and kind = $2";
      params.splice(1, 0, kind);
    }
    const r = await pool.query(
      `select id, title, kind, filename, mime, bytes, extras, visibility, views, downloads, created_at,
              left(content, 220) as head
         from barq.atlas_files where ${where}
        order by created_at desc limit $${params.length}`,
      params
    );
    const byKind: Record<string, number> = {};
    for (const row of r.rows) byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
    const totals = await pool.query(
      `select count(*)::int as n, coalesce(sum(bytes),0)::bigint as b from barq.atlas_files where user_id = $1`,
      [user.uid]
    );
    return json(200, {
      files: r.rows.map(rowOut),
      byKind,
      total: Number(totals.rows[0]?.n ?? 0),
      bytes: Number(totals.rows[0]?.b ?? 0),
    });
  } catch (e) {
    return serverError("files:list", e);
  }
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`files:${user.uid}`, 90, 60_000).ok) return json(429, { code: "RATE" });

  let body: {
    code?: unknown;
    lang?: unknown;
    title?: unknown;
    info?: unknown;
    extras?: unknown;
    visibility?: unknown;
    conversationId?: unknown;
    naming?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { code: "BAD_JSON" });
  }

  const code = typeof body.code === "string" ? body.code : "";
  if (!code.trim()) return json(400, { code: "EMPTY" });
  if (code.length > MAX_CONTENT) return json(413, { code: "TOO_LARGE", detail: `الحد ${MAX_CONTENT / 1_000_000} مليون حرف` });

  try {
    await ensureSchema();
    let pro = false;
    try {
      pro = (await getProfile(user.uid))?.plan === "pro";
    } catch {
      pro = false;
    }
    const count = await pool.query(`select count(*)::int as n from barq.atlas_files where user_id = $1`, [user.uid]);
    const cap = pro ? 5000 : 400;
    if (Number(count.rows[0]?.n ?? 0) >= cap) return json(403, { code: "QUOTA", detail: `الحد الأقصى ${cap} ملف في خطتك` });

    const naming = body.naming === "title" || body.naming === "timestamp" ? body.naming : "smart";
    const f = buildFile({
      code,
      lang: typeof body.lang === "string" ? body.lang : "",
      title: typeof body.title === "string" ? body.title : undefined,
      info: typeof body.info === "string" ? body.info : undefined,
      naming,
    });
    const extras = Array.isArray(body.extras)
      ? body.extras
          .filter((e): e is { path: string; data: string } => !!e && typeof (e as { path?: unknown }).path === "string" && typeof (e as { data?: unknown }).data === "string")
          .slice(0, 40)
          .map((e) => ({ path: String(e.path).slice(0, 200), data: String(e.data).slice(0, MAX_CONTENT) }))
      : [];
    const visibility = body.visibility === "unlisted" ? "unlisted" : "private";
    const convId = typeof body.conversationId === "string" && /^[0-9a-f-]{36}$/i.test(body.conversationId) ? body.conversationId : null;
    const bytes = byteLength(code) + extras.reduce((n, e) => n + byteLength(e.data), 0);
    const filename = extras.length ? slugFilename(f.title, "zip", naming) : f.filename;

    const r = await pool.query(
      `insert into barq.atlas_files
         (user_id, conversation_id, title, kind, filename, mime, content, bytes, extras, visibility)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id, title, kind, filename, mime, bytes, extras, visibility, views, downloads, created_at`,
      [
        user.uid,
        convId,
        f.title.slice(0, 160),
        extras.length ? "zip" : f.kind,
        filename,
        extras.length ? fileKindMeta("zip").mime : f.mime,
        code,
        bytes,
        JSON.stringify(extras),
        visibility,
      ]
    );
    const row = r.rows[0] as Row;
    if (!row) return json(500, { code: "SAVE_FAILED" });
    after(() => void logFile(user.uid, row.kind));
    return json(200, { file: rowOut(row), url: `/api/files/deliver/${row.id}`, pro });
  } catch (e) {
    return serverError("files:add", e);
  }
}

async function logFile(uid: string, kind: string): Promise<void> {
  try {
    await pool.query(
      `insert into barq.mind_events (user_id, kind, intent, lang, confidence, ms, payload)
       values ($1,'file','create','ar',100,0,$2)`,
      [uid, JSON.stringify({ fileKind: kind })]
    );
  } catch {
    /* telemetry only */
  }
}

export async function DELETE(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const u = new URL(req.url);
  try {
    await ensureSchema();
    if (u.searchParams.get("all") === "1") {
      const r = await pool.query(`delete from barq.atlas_files where user_id = $1 returning id`, [user.uid]);
      return json(200, { deleted: r.rows.length });
    }
    const id = u.searchParams.get("id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { code: "MISSING_ID" });
    const r = await pool.query(`delete from barq.atlas_files where user_id = $1 and id = $2 returning id`, [user.uid, id]);
    return json(r.rows.length ? 200 : 404, { ok: r.rows.length > 0 });
  } catch (e) {
    return serverError("files:delete", e);
  }
}
