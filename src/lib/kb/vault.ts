/**
 * NEXUS ATLAS — خزنة البيانات الشخصية (v18) · الطبقة المخزِّنة
 * ---------------------------------------------------------------------------
 * The user's own "big database": uploaded PDFs / CSV / JSON / TXT / MD, URLs
 * crawled from the internet, and files the agent downloaded. Chunking and
 * indexing are pure (`@/lib/kb/vault-index`); this module only talks to
 * Postgres (`barq.atlas_docs`) and is imported from server routes only.
 */

export type VaultDoc = {
  id: string;
  name: string;
  /** upload · url · agent · manual */
  origin: string;
  source?: string;
  /** first 400 chars — enough for a list card */
  preview: string;
  bytes: number;
  createdAt: string;
};

type Row = {
  id: string;
  user_id: string;
  name: string;
  origin: string;
  source: string | null;
  text: string;
  bytes: number;
  created_at: Date | string;
};

type Pool = { query: <T extends Row = Row>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> };

export const MAX_DOC_CHARS = 400_000;

function toDoc(r: Row): VaultDoc {
  return {
    id: r.id,
    name: r.name,
    origin: r.origin,
    source: r.source ?? undefined,
    preview: (r.text ?? "").slice(0, 400),
    bytes: r.bytes ?? (r.text ?? "").length,
    createdAt: typeof r.created_at === "string" ? r.created_at : r.created_at.toISOString(),
  };
}

export async function vaultList(userId: string, pool: Pool): Promise<VaultDoc[]> {
  const r = await pool.query(
    `select id, user_id, name, origin, source, left(text, 400) as text, bytes, created_at
       from barq.atlas_docs where user_id = $1 order by created_at desc limit 300`,
    [userId]
  );
  return r.rows.map(toDoc);
}

export async function vaultAdd(
  userId: string,
  doc: { name: string; text: string; origin: string; source?: string },
  pool: Pool
): Promise<VaultDoc | null> {
  const text = (doc.text ?? "").replace(/\r\n?/g, "\n").slice(0, MAX_DOC_CHARS);
  if (!text.trim()) return null;
  const r = await pool.query(
    `insert into barq.atlas_docs (user_id, name, origin, source, text, bytes)
     values ($1,$2,$3,$4,$5,$6)
     returning id, user_id, name, origin, source, left(text,400) as text, bytes, created_at`,
    [
      userId,
      (doc.name || "document").slice(0, 200),
      (doc.origin || "upload").slice(0, 30),
      doc.source?.slice(0, 500) ?? null,
      text,
      text.length,
    ]
  );
  return r.rows[0] ? toDoc(r.rows[0]) : null;
}

export async function vaultGet(userId: string, id: string, pool: Pool): Promise<{ doc: VaultDoc; text: string } | null> {
  const r = await pool.query(
    `select id, user_id, name, origin, source, text, bytes, created_at
       from barq.atlas_docs where user_id = $1 and id = $2 limit 1`,
    [userId, id]
  );
  const row = r.rows[0];
  return row ? { doc: toDoc(row), text: row.text } : null;
}

/** Full text of the most recent documents — used to build the retrieval index. */
export async function vaultCorpus(userId: string, pool: Pool, limit = 40): Promise<{ id: string; name: string; text: string; origin: string }[]> {
  const r = await pool.query(
    `select id, name, origin, left(text, 200000) as text, bytes, created_at
       from barq.atlas_docs where user_id = $1 order by created_at desc limit $2`,
    [userId, limit]
  );
  return r.rows.map((row) => ({ id: row.id, name: row.name, text: row.text ?? "", origin: row.origin }));
}

export async function vaultDelete(userId: string, id: string, pool: Pool): Promise<boolean> {
  const r = await pool.query(`delete from barq.atlas_docs where user_id = $1 and id = $2 returning id`, [userId, id]);
  return r.rows.length > 0;
}

export async function vaultWipe(userId: string, pool: Pool): Promise<number> {
  const r = await pool.query(`delete from barq.atlas_docs where user_id = $1 returning id`, [userId]);
  return r.rows.length;
}

export async function vaultStats(userId: string, pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }): Promise<{
  docs: number;
  bytes: number;
}> {
  const r = await pool.query(`select count(*) as docs, coalesce(sum(bytes), 0) as bytes from barq.atlas_docs where user_id = $1`, [userId]);
  const row = r.rows[0] ?? {};
  return { docs: Number(row.docs ?? 0), bytes: Number(row.bytes ?? 0) };
}
