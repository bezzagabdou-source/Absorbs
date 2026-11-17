import { log, one, q } from "./db";
import type { OrderRow, OrderStatus } from "./types";

export function orderCode(): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).toUpperCase().slice(2, 5);
  return `CH-${stamp}${rand}`;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "⏳ بانتظار الدفع",
  awaiting_review: "🟡 قيد التحقق",
  approved: "🟢 مقبول",
  rejected: "🔴 مرفوض",
  delivered: "✅ تم التسليم",
  cancelled: "⚪️ ملغى",
};

export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  pending_payment: "amber",
  awaiting_review: "amber",
  approved: "emerald",
  rejected: "rose",
  delivered: "emerald",
  cancelled: "slate",
};

export async function createOrder(input: {
  userId: number;
  kind?: "product" | "usd";
  productId?: number | null;
  productName: string;
  quantity?: number;
  amount: number;
  currency?: string;
  rate?: number | null;
  usdAmount?: number | null;
  status?: OrderStatus;
  paymentMethod?: string | null;
  details?: Record<string, string>;
  note?: string | null;
}): Promise<OrderRow> {
  const row = await one<OrderRow>(
    `INSERT INTO orders (code, user_id, kind, product_id, product_name, quantity, amount, currency,
        rate, usd_amount, status, payment_method, details, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)
     RETURNING *`,
    [
      orderCode(),
      input.userId,
      input.kind ?? "product",
      input.productId ?? null,
      input.productName,
      Number(input.quantity ?? 1),
      Number(input.amount ?? 0),
      input.currency ?? "دج",
      input.rate ?? null,
      input.usdAmount ?? null,
      input.status ?? "pending_payment",
      input.paymentMethod ?? null,
      JSON.stringify(input.details ?? {}),
      input.note ?? null,
    ],
  );
  await q("UPDATE users SET orders_count = orders_count + 1 WHERE tg_id = $1", [input.userId]);
  await log("order_created", { code: row?.code, amount: input.amount, product: input.productName }, "info", String(input.userId));
  return row as OrderRow;
}

export async function getOrder(id: number): Promise<OrderRow | null> {
  return one<OrderRow>(
    `SELECT o.*, u.username, u.first_name FROM orders o LEFT JOIN users u ON u.tg_id = o.user_id WHERE o.id = $1`,
    [id],
  );
}

export async function getOrderByCode(code: string): Promise<OrderRow | null> {
  return one<OrderRow>("SELECT * FROM orders WHERE code = $1", [code]);
}

export async function listOrders(opts: {
  status?: string;
  kind?: string;
  search?: string;
  userId?: number;
  limit?: number;
  offset?: number;
}): Promise<{ rows: OrderRow[]; total: number }> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.status && opts.status !== "all") {
    if (opts.status === "review") where.push("o.status = 'awaiting_review'");
    else {
      params.push(opts.status);
      where.push(`o.status = $${params.length}`);
    }
  }
  if (opts.kind && opts.kind !== "all") {
    params.push(opts.kind);
    where.push(`o.kind = $${params.length}`);
  }
  if (opts.userId) {
    params.push(opts.userId);
    where.push(`o.user_id = $${params.length}`);
  }
  if (opts.search) {
    params.push(`%${opts.search.trim()}%`);
    where.push(`(o.code ILIKE $${params.length} OR o.product_name ILIKE $${params.length} OR u.username ILIKE $${params.length} OR CAST(o.user_id AS TEXT) LIKE $${params.length})`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Number(opts.limit ?? 30), 200);
  const offset = Number(opts.offset ?? 0);
  const rows = await q<OrderRow>(
    `SELECT o.*, u.username, u.first_name FROM orders o
     LEFT JOIN users u ON u.tg_id = o.user_id
     ${clause} ORDER BY o.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  const total = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM orders o LEFT JOIN users u ON u.tg_id = o.user_id ${clause}`,
    params,
  );
  return { rows, total: Number(total?.count ?? 0) };
}

export async function setOrderStatus(
  id: number,
  status: OrderStatus,
  opts: { adminNote?: string | null; reviewedBy?: number } = {},
): Promise<OrderRow | null> {
  const row = await one<OrderRow>(
    `UPDATE orders SET status = $2, updated_at = now(),
       admin_note = COALESCE($3, admin_note), reviewed_by = COALESCE($4, reviewed_by)
     WHERE id = $1 RETURNING *`,
    [id, status, opts.adminNote ?? null, opts.reviewedBy ?? null],
  );
  if (row && (status === "approved" || status === "delivered")) {
    await q(
      `UPDATE users SET total_spent = total_spent + $2,
         orders_count = GREATEST(orders_count, 1) WHERE tg_id = $1`,
      [row.user_id, row.amount],
    );
    if (row.product_id) {
      await q("UPDATE products SET sold = sold + $2 WHERE id = $1", [row.product_id, row.quantity]);
    }
  }
  await log("order_status", { id, code: row?.code, status }, status === "rejected" ? "warn" : "success", "admin");
  return row;
}

export async function attachReceipt(
  id: number,
  fileId: string,
  kind: string,
  paymentMethod?: string,
): Promise<OrderRow | null> {
  return one<OrderRow>(
    `UPDATE orders SET receipt_file_id = $2, receipt_kind = $3, payment_method = COALESCE($4, payment_method),
       status = 'awaiting_review', updated_at = now() WHERE id = $1 RETURNING *`,
    [id, fileId, kind, paymentMethod ?? null],
  );
}

export async function userOrders(userId: number, limit = 10): Promise<OrderRow[]> {
  return q<OrderRow>(
    "SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit],
  );
}

export async function deleteOrder(id: number): Promise<void> {
  await q("DELETE FROM orders WHERE id = $1", [id]);
  await log("order_deleted", { id }, "warn", "admin");
}

export async function pendingReviewCount(): Promise<number> {
  const row = await one<{ count: string }>("SELECT count(*)::text AS count FROM orders WHERE status = 'awaiting_review'");
  return Number(row?.count ?? 0);
}

export async function ordersCsv(): Promise<string> {
  const rows = await q<OrderRow>(
    `SELECT o.*, u.username FROM orders o LEFT JOIN users u ON u.tg_id = o.user_id ORDER BY o.created_at DESC LIMIT 5000`,
  );
  const head = ["code", "date", "user_id", "username", "product", "quantity", "amount", "currency", "usd_amount", "rate", "status", "payment", "note"];
  const lines = rows.map((r) =>
    [
      r.code,
      new Date(r.created_at).toISOString(),
      r.user_id,
      r.username ?? "",
      r.product_name,
      r.quantity,
      r.amount,
      r.currency,
      r.usd_amount ?? "",
      r.rate ?? "",
      r.status,
      r.payment_method ?? "",
      (r.note ?? "").replace(/[\n\r,]/g, " "),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}
