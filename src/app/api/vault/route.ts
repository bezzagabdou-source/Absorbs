import { after } from "next/server";
import { json, serverError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { ensureSchema } from "@/db/ensure-schema";
import { pool } from "@/db";
import { vaultAdd, vaultCorpus, vaultDelete, vaultList, vaultStats, vaultWipe, MAX_DOC_CHARS } from "@/lib/kb/vault";
import { extractText } from "@/lib/net/extract";
import { netFetch } from "@/lib/net/fetch";
import { invalidateVault } from "@/lib/atlas-context";
import { getProfile } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * v18 ATLAS — خزنة البيانات الشخصية.
 *
 *   GET    /api/vault                     قائمة الوثائق + الإحصائيات
 *   POST   /api/vault  (JSON)             { name, text } أو { url } أو { name, base64, mime }
 *   POST   /api/vault  (multipart)        file=<pdf|docx|csv|json|txt|zip|…>
 *   DELETE /api/vault?id=…                حذف وثيقة (أو ?all=1 لمسح الخزنة)
 *
 * كل وثيقة تُخزَّن كنص (يُستخرج من PDF/DOCX/XLSX محليًا بدون مكتبات) ثم
 * تُفهرَس وتُقتبس تلقائيًا في المحادثة عبر @/lib/atlas-context.
 */

const PRO_LIMIT = 120;
const FREE_LIMIT = 25;

async function quota(uid: string): Promise<number> {
  try {
    const p = await getProfile(uid);
    return p?.plan === "pro" ? PRO_LIMIT : FREE_LIMIT;
  } catch {
    return FREE_LIMIT;
  }
}

export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  try {
    await ensureSchema();
    const [docs, stats] = await Promise.all([vaultList(user.uid, pool), vaultStats(user.uid, pool)]);
    return json(200, { docs, stats, limit: await quota(user.uid), maxChars: MAX_DOC_CHARS });
  } catch (e) {
    return serverError("vault:get", e);
  }
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`vault:${user.uid}`, 40, 60_000).ok) return json(429, { code: "RATE" });

  try {
    await ensureSchema();
    const stats = await vaultStats(user.uid, pool);
    const limit = await quota(user.uid);
    if (stats.docs >= limit) return json(403, { code: "QUOTA", detail: `الحد الأقصى ${limit} وثيقة في خطتك الحالية` });

    const type = req.headers.get("content-type") ?? "";
    let name = "";
    let text = "";
    let origin = "upload";
    let source: string | undefined;

    if (type.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (file instanceof File) {
        name = file.name || "upload";
        const buf = new Uint8Array(await file.arrayBuffer());
        if (buf.byteLength > 25_000_000) return json(413, { code: "TOO_LARGE", detail: "الحد 25 ميغابايت" });
        const ex = extractText(name, file.type, buf);
        if (!ex.ok || !ex.text.trim()) {
          return json(422, { code: "NO_TEXT", detail: ex.note ?? "ما قدرناش نستخرجو نص من هذا الملف" });
        }
        text = ex.text;
        if (ex.note) source = ex.note;
      } else {
        const raw = form.get("text");
        name = String(form.get("name") ?? "note").slice(0, 200);
        text = typeof raw === "string" ? raw : "";
        origin = "manual";
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as {
        name?: unknown;
        text?: unknown;
        url?: unknown;
        base64?: unknown;
        mime?: unknown;
      };
      if (typeof body.url === "string" && body.url.trim()) {
        origin = "url";
        source = body.url.trim();
        const res = await netFetch(source, { textChars: MAX_DOC_CHARS, inline: false });
        if (!res.ok) return json(502, { code: "FETCH_FAILED", detail: res.error ?? `HTTP ${res.status}` });
        if (res.dataUrl && !res.text) {
          const b64 = res.dataUrl.split(",")[1] ?? "";
          const buf = new Uint8Array(Buffer.from(b64, "base64"));
          const ex = extractText(new URL(source).pathname.split("/").pop() ?? "file", res.mime, buf);
          if (!ex.ok) return json(422, { code: "NO_TEXT", detail: ex.note ?? "ملف بلا نص" });
          text = ex.text;
          name = String(body.name ?? new URL(source).pathname.split("/").pop() ?? "url-file").slice(0, 200);
        } else {
          text = res.text;
          name = String(body.name ?? res.title ?? source).slice(0, 200);
        }
      } else if (typeof body.base64 === "string" && body.base64.length > 16) {
        origin = "upload";
        name = String(body.name ?? "file").slice(0, 200);
        const mime = String(body.mime ?? "");
        const buf = new Uint8Array(Buffer.from(body.base64.slice(0, 34_000_000), "base64"));
        if (buf.byteLength > 25_000_000) return json(413, { code: "TOO_LARGE" });
        const ex = extractText(name, mime, buf);
        if (!ex.ok || !ex.text.trim()) return json(422, { code: "NO_TEXT", detail: ex.note ?? "ما قدرناش نستخرجو نص" });
        text = ex.text;
      } else {
        origin = "manual";
        name = String(body.name ?? "note").slice(0, 200);
        text = typeof body.text === "string" ? body.text : "";
      }
    }

    if (!text.trim()) return json(400, { code: "EMPTY" });
    const doc = await vaultAdd(user.uid, { name: name || "document", text, origin, source }, pool);
    if (!doc) return json(422, { code: "EMPTY" });
    invalidateVault(user.uid);
    after(() => void logDoc(user.uid, doc.name, origin));
    return json(200, { doc, stats: await vaultStats(user.uid, pool) });
  } catch (e) {
    return serverError("vault:add", e);
  }
}

async function logDoc(uid: string, name: string, origin: string): Promise<void> {
  try {
    await pool.query(
      `insert into barq.mind_events (user_id, kind, intent, lang, confidence, ms, payload)
       values ($1,'vault','add','ar',100,0,$2)`,
      [uid, JSON.stringify({ name: name.slice(0, 120), origin })]
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
      const n = await vaultWipe(user.uid, pool);
      invalidateVault(user.uid);
      return json(200, { deleted: n });
    }
    const id = u.searchParams.get("id") ?? "";
    if (!id) return json(400, { code: "MISSING_ID" });
    const ok = await vaultDelete(user.uid, id, pool);
    invalidateVault(user.uid);
    return json(ok ? 200 : 404, { ok });
  } catch (e) {
    return serverError("vault:delete", e);
  }
}

/** Used by the chat route: the corpus that gets indexed for retrieval. */
export async function vaultContextDocs(userId: string) {
  await ensureSchema();
  return vaultCorpus(userId, pool, 40);
}
