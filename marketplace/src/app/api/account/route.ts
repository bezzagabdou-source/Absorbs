import type { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, withActor } from "@/db";
import { api, ok, readJson } from "@/lib/server/http";
import { requireActor, revokeSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { AppError } from "@/lib/server/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const deleteSchema = z.object({ confirm: z.literal("DELETE"), password: z.string().min(1).max(128).optional() }).strict();

/** Permanently deletes the signed-in account and everything attached to it. */
export async function DELETE(request: NextRequest) {
  return api(request, { auth: true, mutation: true, limit: 5, windowMs: 3600000 }, async (actor) => {
    if (!actor) throw new AppError("auth_required", 401);
    const input = await readJson(request, deleteSchema);
    // Accounts created through Google have an unusable password hash; they confirm with the literal word only.
    if (input.password) {
      const row = await getDb().execute(sql`select password_hash from users where id = ${actor.id}::uuid`);
      const hash = (row.rows[0] as { password_hash: string | null } | undefined)?.password_hash ?? null;
      if (hash && !(await verifyPassword(input.password, hash))) throw new AppError("invalid_credentials", 401);
    }
    await withActor(actor, async (tx) => {
      // Uploaded media rows are owned by the user and cascade; listings go with them.
      await tx.execute(sql`delete from users where id = ${actor.id}::uuid`);
    });
    await revokeSession();
    return ok({ ok: true });
  });
}
