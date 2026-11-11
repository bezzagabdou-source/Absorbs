import crypto from "node:crypto";
import { getPool, getStore } from "./store";

// The bot uses several related tables. These tools expose individual JSON keys,
// not arbitrary SQL, so backups and optimistic concurrency can be guaranteed.
// Balances/request decisions/settings have dedicated invariant-preserving APIs.
function validKey(value: unknown, write = false): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9:_-]{1,120}$/.test(value)) throw new Error("مفتاح البيانات غير صالح");
  if (/^(?:system|admin|auth)(?::|$)|(?:token|secret|password|credential|webhook|:pool|:claim)/i.test(value) || value === "settings") throw new Error("المفتاح يحتوي إعدادات حساسة؛ استخدم أدوات الإعدادات");
  if (write && /^(?:pts:|rreq:|refs:|daily:|points:config$)/i.test(value)) throw new Error("استخدم أدوات النقاط أو الطلبات أو الإعدادات للحفاظ على الترابط");
  return value;
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}
function version(row: { v: unknown; n: unknown } | undefined): string {
  return crypto.createHash("sha256").update(JSON.stringify(row ? { exists: true, value: stable(row.v), number: String(row.n) } : { exists: false })).digest("hex");
}
function safeValue(value: unknown) {
  const raw = JSON.stringify(value);
  if (raw === undefined || Buffer.byteLength(raw) > 100_000) throw new Error("قيمة JSON غير صالحة أو كبيرة جداً");
  // Do not send database secrets to an AI provider or overwrite masked fields.
  if (/"(?:botToken|webhookSecret|password|accessToken|apiKey|secret)"\s*:/i.test(raw) || /\b\d{7,12}:[A-Za-z0-9_-]{25,}\b/.test(raw)) throw new Error("القيمة تحتوي حقولاً حساسة؛ استخدم أداة متخصصة");
  return raw;
}
function backupKey(): Buffer {
  const secret = process.env.AGENT_DB_BACKUP_KEY || process.env.ADMIN_SECRET || "";
  if (!secret) throw new Error("هيّئ AGENT_DB_BACKUP_KEY أو ADMIN_SECRET لتشفير نسخ قاعدة البيانات");
  return crypto.createHmac("sha256", secret).update("ft bot agent backups v1").digest();
}
function seal(value: unknown): string {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", backupKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") });
}
function open(raw: string): { key: string; before: { v: unknown; n: unknown } | null; afterVersion: string } {
  try {
    const a = JSON.parse(raw), cipher = crypto.createDecipheriv("aes-256-gcm", backupKey(), Buffer.from(a.iv, "base64"));
    cipher.setAuthTag(Buffer.from(a.tag, "base64"));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(a.data, "base64")), cipher.final()]).toString("utf8"));
  } catch { throw new Error("تعذّر فك النسخة؛ تحقّق من مفتاح التشفير"); }
}
async function pool() {
  if (getStore().backend !== "postgres") throw new Error("تعديل مفاتيح البيانات المدعوم هنا يتطلب Postgres؛ استخدم أدوات البوت المتخصصة لهذا التخزين");
  return getPool();
}
async function ensureVersions(db: { query: (sql: string, args?: unknown[]) => Promise<unknown> }) {
  await db.query("create table if not exists ft_agent_versions (id text primary key, snapshot text not null, undone boolean not null default false, created_at timestamptz not null default now())");
}
export async function dbQuery(input: Record<string, unknown>) {
  const key = validKey(input.key), db = await pool();
  const { rows } = await db.query("select v, n from ft_kv where k = $1", [key]);
  if (rows[0]) safeValue(rows[0].v);
  return { key, exists: !!rows.length, value: rows[0]?.v ?? null, number: rows[0] ? String(rows[0].n) : null, version: version(rows[0]) };
}
export async function dbUpdate(input: Record<string, unknown>) {
  const key = validKey(input.key, true);
  if (!Object.prototype.hasOwnProperty.call(input, "value")) throw new Error("حدد قيمة JSON");
  const json = safeValue(input.value), expected = String(input.expectedVersion || "");
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error("اقرأ المفتاح أولاً وحدد expectedVersion لمنع تضارب الكتابة");
  const db = await pool(), client = await db.connect(), id = crypto.randomUUID();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '5s'");
    await ensureVersions(client);
    // The row lock protects existing values. Inserting a new key uses DO NOTHING
    // so a concurrent normal application insert cannot be silently overwritten.
    const found = await client.query("select v, n from ft_kv where k = $1 for update", [key]);
    const before = found.rows[0] || null;
    if (before) safeValue(before.v);
    if (version(before || undefined) !== expected) throw new Error("تغيّرت البيانات منذ قراءتها؛ اقرأها من جديد");
    const afterVersion = version({ v: input.value, n: before?.n ?? "0" });
    await client.query("insert into ft_agent_versions (id, snapshot) values ($1, $2)", [id, seal({ key, before, afterVersion })]);
    if (before) await client.query("update ft_kv set v = $2::jsonb where k = $1", [key, json]);
    else {
      const inserted = await client.query("insert into ft_kv (k, v) values ($1, $2::jsonb) on conflict do nothing returning k", [key, json]);
      if (!inserted.rowCount) throw new Error("أُنشئ المفتاح في عملية أخرى؛ اقرأه من جديد");
    }
    await client.query("commit");
    return { key, version: afterVersion, backupId: id, updated: true };
  } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
  finally { client.release(); }
}
export async function dbUndo(input: Record<string, unknown>) {
  const id = String(input.id || "");
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("معرّف النسخة غير صالح");
  const db = await pool(), client = await db.connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '5s'");
    await ensureVersions(client);
    const backup = await client.query("select snapshot, undone from ft_agent_versions where id = $1 for update", [id]);
    if (!backup.rows.length || backup.rows[0].undone) throw new Error("النسخة غير موجودة أو استُعيدت مسبقاً");
    const snap = open(backup.rows[0].snapshot);
    validKey(snap.key, true);
    const found = await client.query("select v, n from ft_kv where k = $1 for update", [snap.key]);
    if (version(found.rows[0]) !== snap.afterVersion) throw new Error("تغيّرت البيانات بعد التعديل؛ لم يتم التراجع");
    if (snap.before) await client.query("update ft_kv set v = $2::jsonb, n = $3::bigint where k = $1", [snap.key, JSON.stringify(snap.before.v), String(snap.before.n)]);
    else await client.query("delete from ft_kv where k = $1", [snap.key]);
    await client.query("update ft_agent_versions set undone = true where id = $1", [id]);
    await client.query("commit");
    return { restored: true, key: snap.key, backupId: id };
  } catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
  finally { client.release(); }
}
