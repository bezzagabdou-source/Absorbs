import { getSetting, log, one, q, tx } from "./db";

/**
 * points.ts — المسابقات ونقاط الإحالة
 * كل شخص يدخل من رابط إحالة = نقطة واحدة لصاحب الرابط.
 * النقاط تُستبدل بجوائز من جدول prizes (كل جائزة لها عدد نقاط).
 */

export type PrizeRow = {
  id: number;
  title: string;
  points: number;
  icon: string;
  note: string;
  active: boolean;
  sort: number;
  claims?: number;
};

export type ReferralRow = {
  inviter_id: string;
  invitee_id: string;
  points: number;
  created_at: string;
  invitee_name?: string | null;
  invitee_username?: string | null;
};

export type RedemptionRow = {
  id: number;
  user_id: string;
  prize_id: number | null;
  prize_title: string;
  points: number;
  status: string;
  note: string | null;
  created_at: string;
  username?: string | null;
  first_name?: string | null;
};

// إخفاء جوائز الشحن والبطاقات القديمة دون حذف السجلات.
export function isContestPrize(prize: { title: string; note: string | null }): boolean {
  return !/(شحن|فليكسي|فلكسي|رصيد|بطاق|كارت|كرت|كروت|جواهر|شدات|كوينز|free\s*fire|pubg|efootball|flexy|top[ -]?up|recharge|gift\s*card)/i.test(`${prize.title} ${prize.note ?? ""}`);
}

export async function listPrizes(activeOnly = false): Promise<PrizeRow[]> {
  const prizes = await q<PrizeRow>(
    `SELECT p.*, (SELECT count(*) FROM redemptions r WHERE r.prize_id = p.id)::int AS claims
     FROM prizes p ${activeOnly ? "WHERE p.active = true" : ""} ORDER BY p.points ASC, p.sort ASC, p.id ASC`,
  );
  return prizes.filter(isContestPrize);
}

export async function createPrize(input: {
  title: string;
  points: number;
  icon?: string;
  note?: string;
  sort?: number;
}): Promise<PrizeRow> {
  const row = await one<PrizeRow>(
    `INSERT INTO prizes (title, points, icon, note, sort) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [input.title, Math.max(0, Math.round(input.points)), input.icon ?? "🎁", input.note ?? "", input.sort ?? 99],
  );
  await log("prize_created", { title: input.title, points: input.points }, "success", "admin");
  return row as PrizeRow;
}

export async function updatePrize(id: number, input: Partial<PrizeRow>): Promise<PrizeRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const key of ["title", "points", "icon", "note", "active", "sort"] as const) {
    if (input[key] === undefined) continue;
    params.push(input[key]);
    sets.push(`${key} = $${params.length}`);
  }
  if (!sets.length) return null;
  return one<PrizeRow>(`UPDATE prizes SET ${sets.join(", ")} WHERE id = $1 RETURNING *`, params);
}

export async function deletePrize(id: number): Promise<void> {
  await q("DELETE FROM prizes WHERE id = $1", [id]);
}

/* ───────────────────────── الإحالات ───────────────────────── */

export function referralLink(botUsername: string, userId: number | string): string {
  const name = (botUsername || "chinwistorebot").replace(/^@/, "");
  return `https://t.me/${name}?start=ref_${userId}`;
}

/** يسجّل إحالة جديدة (مرة واحدة لكل مدعو) ويمنح النقاط لصاحب الرابط */
export async function creditReferral(
  inviterId: number,
  inviteeId: number,
  points = 1,
): Promise<{ ok: boolean; reason?: string }> {
  if (!inviterId || !inviteeId) return { ok: false, reason: "معرّف غير صالح" };
  if (Number(inviterId) === Number(inviteeId)) return { ok: false, reason: "لا يمكن إحالة نفسك" };
  const amount = Math.max(1, Math.round(points));
  const credited = await tx(async ({ query }) => {
    // Serialize credits per inviter across serverless instances, not just in memory.
    await query("SELECT pg_advisory_xact_lock($1::bigint)", [inviterId]);
    const inviter = await query("SELECT tg_id FROM users WHERE tg_id = $1 AND is_blocked = false", [inviterId]);
    if (!inviter.rows.length) return false;
    const invitee = await query("SELECT joined_from, is_blocked FROM users WHERE tg_id = $1 FOR UPDATE", [inviteeId]);
    if (!invitee.rows.length || invitee.rows[0].is_blocked || invitee.rows[0].joined_from !== `pending_ref:${inviterId}`) return false;
    const recent = await query("SELECT count(*)::int AS n FROM referrals WHERE inviter_id = $1 AND created_at > now() - interval '1 day'", [inviterId]);
    if (Number(recent.rows[0].n) >= 10) return false;
    const inserted = await query(
      "INSERT INTO referrals (inviter_id, invitee_id, points) VALUES ($1,$2,$3) ON CONFLICT (invitee_id) DO NOTHING RETURNING id",
      [inviterId, inviteeId, amount],
    );
    if (!inserted.rows.length) return false;
    await query("UPDATE users SET points = points + $2, referrals_count = referrals_count + 1 WHERE tg_id = $1", [inviterId, amount]);
    await query("UPDATE users SET joined_from = $2 WHERE tg_id = $1", [inviteeId, `ref:${inviterId}`]);
    return true;
  });
  if (!credited) return { ok: false, reason: "الإحالة غير مؤهلة أو بلغت الحد اليومي" };
  await log("referral_credited", { inviter: inviterId, invitee: inviteeId, points: amount }, "success", String(inviterId));
  return { ok: true };
}

export async function referralStats(userId: number | string): Promise<{
  points: number;
  referrals: number;
  today: number;
  spent: number;
  rows: ReferralRow[];
}> {
  const user = await one<{ points: string; referrals_count: string }>(
    "SELECT points, referrals_count FROM users WHERE tg_id = $1",
    [userId],
  );
  const today = await one<{ c: string }>(
    "SELECT count(*)::text AS c FROM referrals WHERE inviter_id = $1 AND created_at > now() - interval '1 day'",
    [userId],
  );
  const spent = await one<{ s: string }>(
    "SELECT coalesce(sum(points),0)::text AS s FROM redemptions WHERE user_id = $1 AND status <> 'rejected'",
    [userId],
  );
  const rows = await q<ReferralRow>(
    `SELECT r.*, u.first_name AS invitee_name, u.username AS invitee_username
     FROM referrals r LEFT JOIN users u ON u.tg_id = r.invitee_id
     WHERE r.inviter_id = $1 ORDER BY r.created_at DESC LIMIT 25`,
    [userId],
  );
  return {
    points: Number(user?.points ?? 0),
    referrals: Number(user?.referrals_count ?? 0),
    today: Number(today?.c ?? 0),
    spent: Number(spent?.s ?? 0),
    rows,
  };
}

export async function topReferrers(limit = 10): Promise<
  { tg_id: string; username: string | null; first_name: string | null; referrals_count: string; points: string }[]
> {
  return q(
    `SELECT tg_id, username, first_name, referrals_count, points FROM users
     WHERE referrals_count > 0 ORDER BY referrals_count DESC, points DESC LIMIT ${Math.min(Math.max(limit, 1), 50)}`,
  );
}

/* ───────────────────────── الاستبدال ───────────────────────── */

export async function redeemPrize(
  userId: number | string,
  prizeId: number,
): Promise<{ ok: boolean; reason?: string; redemption?: RedemptionRow }> {
  const prize = await one<PrizeRow>("SELECT * FROM prizes WHERE id = $1 AND active = true", [prizeId]);
  if (!prize || !isContestPrize(prize)) return { ok: false, reason: "الجائزة غير متوفرة" };
  const user = await one<{ points: string }>("SELECT points FROM users WHERE tg_id = $1", [userId]);
  const balance = Number(user?.points ?? 0);
  if (balance < Number(prize.points)) {
    return { ok: false, reason: `نقاطك غير كافية — تحتاج ${prize.points} نقطة ولديك ${balance}` };
  }
  const pending = await one<{ c: string }>(
    "SELECT count(*)::text AS c FROM redemptions WHERE user_id = $1 AND status = 'pending'",
    [userId],
  );
  if (Number(pending?.c ?? 0) > 0) return { ok: false, reason: "عندك طلب جائزة قيد المراجعة" };

  const redemption = await one<RedemptionRow>(
    `INSERT INTO redemptions (user_id, prize_id, prize_title, points, status)
     VALUES ($1,$2,$3,$4,'pending') RETURNING *`,
    [userId, prize.id, prize.title, prize.points],
  );
  await q("UPDATE users SET points = points - $2 WHERE tg_id = $1", [userId, prize.points]);
  await log("prize_redeemed", { user: userId, prize: prize.title, points: prize.points }, "info", String(userId));
  return { ok: true, redemption: redemption as RedemptionRow };
}

export async function listRedemptions(status?: string, limit = 100): Promise<RedemptionRow[]> {
  const where = status ? "WHERE r.status = $1" : "";
  const params = status ? [status] : [];
  return q<RedemptionRow>(
    `SELECT r.*, u.username, u.first_name FROM redemptions r LEFT JOIN users u ON u.tg_id = r.user_id
     ${where} ORDER BY r.created_at DESC LIMIT ${Math.min(Math.max(limit, 1), 300)}`,
    params,
  );
}

/** موافقة/رفض طلب جائزة — الرفض يعيد النقاط للزبون */
export async function decideRedemption(
  id: number,
  status: "approved" | "rejected",
  note?: string,
): Promise<RedemptionRow | null> {
  const updated = await tx(async ({ query }) => {
    const result = await query("SELECT * FROM redemptions WHERE id = $1 FOR UPDATE", [id]);
    const current = result.rows[0] as RedemptionRow | undefined;
    if (!current || current.status !== "pending") return current ?? null;
    const changed = await query(
      "UPDATE redemptions SET status = $2, note = $3, updated_at = now() WHERE id = $1 RETURNING *",
      [id, status, note ?? null],
    );
    if (status === "rejected") await query("UPDATE users SET points = points + $2 WHERE tg_id = $1", [current.user_id, current.points]);
    return changed.rows[0] as RedemptionRow;
  });
  if (updated) await log("redemption_decided", { id, status: updated.status }, status === "approved" ? "success" : "warn", "admin");
  return updated;
}

/** إحالات شخص معيّن — لعرض "مين دخل من رابطك" في اللوحة */
export async function referralsOf(userId: number | string): Promise<ReferralRow[]> {
  return q<ReferralRow>(
    `SELECT r.*, u.first_name AS invitee_name, u.username AS invitee_username
     FROM referrals r LEFT JOIN users u ON u.tg_id = r.invitee_id
     WHERE r.inviter_id = $1 ORDER BY r.created_at DESC LIMIT 200`,
    [userId],
  );
}

/** إحالة شخص معيّن — "مين جابك" */
export async function inviterOf(userId: number | string): Promise<ReferralRow | null> {
  return one<ReferralRow>(
    `SELECT r.*, u.first_name AS invitee_name, u.username AS invitee_username
     FROM referrals r LEFT JOIN users u ON u.tg_id = r.inviter_id
     WHERE r.invitee_id = $1`,
    [userId],
  );
}

/* ───────────────────────── الهدية اليومية ───────────────────────── */

export async function dailyGiftStatus(userId: number | string): Promise<{ claimed: boolean; points: number }> {
  const claimed = await one<{ c: string }>(
    "SELECT count(*)::text AS c FROM daily_gifts WHERE user_id = $1 AND claim_date = CURRENT_DATE",
    [userId],
  );
  const raw = await getSetting<number>("daily_gift_points");
  return { claimed: Number(claimed?.c ?? 0) > 0, points: Math.max(1, Number(raw ?? 1)) };
}

/** 🎁 هدية يومية — مرة واحدة في اليوم لكل زبون */
export async function claimDailyGift(
  userId: number | string,
): Promise<{ ok: boolean; reason?: string; points?: number }> {
  const raw = await getSetting<number>("daily_gift_points");
  const points = Math.max(1, Number(raw ?? 1));
  const inserted = await one<{ id: number }>(
    `INSERT INTO daily_gifts (user_id, points) VALUES ($1,$2)
     ON CONFLICT (user_id, claim_date) DO NOTHING RETURNING id`,
    [userId, points],
  );
  if (!inserted) return { ok: false, reason: "أخذت هديتك اليوم — ارجع غداً 🎁" };
  await q("UPDATE users SET points = points + $2 WHERE tg_id = $1", [userId, points]);
  await log("daily_gift", { user: userId, points }, "info", String(userId));
  return { ok: true, points };
}

/** 📦 تسليم جائزة مقبولة — تتبدّل الحالة إلى delivered + إرجاع صف الطلب مع بيانات الزبون */
export async function deliverRedemption(
  id: number,
): Promise<{ ok: true; redemption: RedemptionRow } | { ok: false; reason: string }> {
  const current = await one<RedemptionRow>(
    `SELECT r.*, u.username, u.first_name FROM redemptions r LEFT JOIN users u ON u.tg_id = r.user_id WHERE r.id = $1`,
    [id],
  );
  if (!current) return { ok: false, reason: "الطلب غير موجود" };
  if (current.status === "delivered") return { ok: false, reason: "الجائزة تسلّمت بالفعل ✅" };
  if (current.status !== "approved") return { ok: false, reason: "وافق على الطلب أولاً ثم سلّمها ✅" };
  const updated = await one<RedemptionRow>(
    "UPDATE redemptions SET status = 'delivered', updated_at = now() WHERE id = $1 RETURNING *",
    [id],
  );
  await log("redemption_delivered", { id }, "success", "admin");
  return {
    ok: true,
    redemption: { ...(updated as RedemptionRow), username: current.username, first_name: current.first_name },
  };
}
