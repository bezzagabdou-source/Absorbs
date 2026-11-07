import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

/*
 * Single-use hand-off codes for the Android browser sign-in.
 *
 * The table ships in migration `0002_app_handoff_codes` with its RLS policy in
 * `docs/rls-policies.sql`, so nothing is created at runtime: the runtime database
 * role may not create tables, only read and touch its own codes.
 *
 * Only the SHA-256 of each code is stored, so a database leak cannot be replayed,
 * and hashing happens here rather than in SQL to avoid depending on pgcrypto.
 */
const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/** Stores a freshly minted code bound to a signed-in user; returns the plain code. */
export async function createHandoffCode(userId: string): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  await getDb().execute(sql`
    insert into app_handoff_codes (code_hash, user_id, expires_at)
    values (${hash(code)}, ${userId}::uuid, now() + interval '120 seconds')
  `);
  return code;
}

/** Consumes a code exactly once; returns the owning user id, or null if unusable. */
export async function consumeHandoffCode(code: string): Promise<string | null> {
  const result = await getDb().execute(sql`
    update app_handoff_codes
       set used_at = now()
     where code_hash = ${hash(code)}
       and used_at is null
       and expires_at > now()
    returning user_id
  `);
  const row = result.rows[0] as { user_id: string } | undefined;
  return row ? row.user_id : null;
}
