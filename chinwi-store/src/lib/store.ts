import { allSettings, getSetting, log, one, q, setSetting } from "./db";
import type {
  CategoryRow,
  ChannelRow,
  OrderRow,
  ProductRow,
  SettingsMap,
  UserRow,
  WalletRow,
} from "./types";

/* ───────────────────────── المستخدمون ───────────────────────── */

export type IncomingUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export async function upsertUser(from: IncomingUser, source = "bot"): Promise<UserRow> {
  const row = await one<UserRow>(
    `INSERT INTO users (tg_id, username, first_name, last_name, joined_from, last_seen_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (tg_id) DO UPDATE SET
       username = COALESCE(EXCLUDED.username, users.username),
       first_name = COALESCE(EXCLUDED.first_name, users.first_name),
       last_name = COALESCE(EXCLUDED.last_name, users.last_name),
       messages_count = users.messages_count + 1,
       last_seen_at = now()
     RETURNING *`,
    [from.id, from.username ?? null, from.first_name ?? null, from.last_name ?? null, source],
  );
  const user = row as UserRow;

  // صاحب المتجر يُعرَّف تلقائياً من اسم المستخدم حتى تصل إشعارات الطلبات
  const ownerHandle = String((await getSetting<string>("owner_username")) ?? "").replace(/^@/, "").toLowerCase();
  if (ownerHandle && (from.username ?? "").toLowerCase() === ownerHandle && !user.is_owner) {
    await q("UPDATE users SET is_owner = true, is_admin = true WHERE tg_id = $1", [from.id]);
    await setSetting("owner_chat_id", from.id);
    user.is_owner = true;
    user.is_admin = true;
    await log("owner_linked", { tg_id: from.id, username: from.username }, "success", "system");
  }
  return user;
}

export async function touchUser(tgId: number): Promise<void> {
  await q("UPDATE users SET last_seen_at = now() WHERE tg_id = $1", [tgId]);
}

export async function getUser(tgId: number | string): Promise<UserRow | null> {
  return one<UserRow>("SELECT * FROM users WHERE tg_id = $1", [tgId]);
}

export async function setUserState(
  tgId: number | string,
  state: string | null,
  data: Record<string, unknown> = {},
): Promise<void> {
  await q("UPDATE users SET state = $2, state_data = $3::jsonb WHERE tg_id = $1", [
    tgId,
    state,
    JSON.stringify(data),
  ]);
}

export async function clearUserState(tgId: number | string): Promise<void> {
  await q("UPDATE users SET state = NULL, state_data = '{}'::jsonb WHERE tg_id = $1", [tgId]);
}

export function isAdminUser(user: UserRow | null | undefined): boolean {
  if (!user) return false;
  if (user.is_owner || user.is_admin) return true;
  const envId = Number(process.env.OWNER_CHAT_ID ?? 0);
  return Boolean(envId && Number(user.tg_id) === envId);
}

export async function listUsers(opts: {
  search?: string;
  filter?: "all" | "active" | "blocked" | "buyers" | "admins";
  limit?: number;
  offset?: number;
}): Promise<{ rows: UserRow[]; total: number }> {
  const search = (opts.search ?? "").trim();
  const params: unknown[] = [];
  const where: string[] = [];
  if (search) {
    params.push(`%${search.replace(/^@/, "")}%`);
    where.push(`(u.username ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR CAST(u.tg_id AS TEXT) LIKE $${params.length})`);
  }
  if (opts.filter === "active") where.push("u.last_seen_at > now() - interval '24 hours'");
  if (opts.filter === "blocked") where.push("u.is_blocked = true");
  if (opts.filter === "buyers") where.push("u.orders_count > 0");
  if (opts.filter === "admins") where.push("u.is_admin = true OR u.is_owner = true");
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Number(opts.limit ?? 30), 200);
  const offset = Number(opts.offset ?? 0);
  // 👥 نعرض من جلب كل زبون (الإحالة) — لتظهر في لوحة التحكم
  const userCols = (await q<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'",
  )).map((c) => `u.${c.column_name}`);
  const rows = await q<UserRow>(
    `SELECT ${userCols.join(", ")},
            r.inviter_id,
            COALESCE(iu.first_name, iu.username, '—') AS inviter_name,
            iu.username AS inviter_username
     FROM users u
     LEFT JOIN referrals r ON r.invitee_id = u.tg_id
     LEFT JOIN users iu ON iu.tg_id = r.inviter_id
     ${clause} ORDER BY u.last_seen_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  const total = await one<{ count: string }>(`SELECT count(*)::text AS count FROM users u ${clause}`, params);
  return { rows, total: Number(total?.count ?? 0) };
}

export async function setUserFlags(
  tgId: number,
  flags: Partial<{ is_blocked: boolean; is_admin: boolean; notes: string; ban_reason: string }>,
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [tgId];
  for (const [key, value] of Object.entries(flags)) {
    if (value === undefined) continue;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  if (!sets.length) return;
  await q(`UPDATE users SET ${sets.join(", ")} WHERE tg_id = $1`, params);
}

export async function deleteUser(tgId: number): Promise<void> {
  await q("DELETE FROM users WHERE tg_id = $1", [tgId]);
}

export async function activeUserIds(limit = 5000): Promise<number[]> {
  const rows = await q<{ tg_id: string }>(
    "SELECT tg_id FROM users WHERE is_blocked = false ORDER BY last_seen_at DESC LIMIT $1",
    [limit],
  );
  return rows.map((r) => Number(r.tg_id));
}

/* ───────────────────────── الأقسام ───────────────────────── */

export async function listCategories(opts: { activeOnly?: boolean } = {}): Promise<CategoryRow[]> {
  return q<CategoryRow>(
    `SELECT c.*, (SELECT count(*) FROM products p WHERE p.category_id = c.id AND p.active)::int AS products_count
     FROM categories c
     ${opts.activeOnly ? "WHERE c.active = true" : ""}
     ORDER BY c.sort, c.id`,
  );
}

export async function getCategory(id: number): Promise<CategoryRow | null> {
  return one<CategoryRow>("SELECT * FROM categories WHERE id = $1", [id]);
}

export async function createCategory(input: Partial<CategoryRow>): Promise<CategoryRow> {
  const row = await one<CategoryRow>(
    `INSERT INTO categories (slug, name, emoji, section, description, image_url, sort, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      (input.slug || `cat-${Date.now()}`).toLowerCase().replace(/\s+/g, "-"),
      input.name || "قسم جديد",
      input.emoji || "📦",
      input.section || "games",
      input.description || "",
      input.image_url || null,
      Number(input.sort ?? 99),
      input.active !== false,
    ],
  );
  await log("category_created", { id: row?.id, name: input.name }, "success", "admin");
  return row as CategoryRow;
}

export async function updateCategory(id: number, input: Partial<CategoryRow>): Promise<CategoryRow | null> {
  const row = await one<CategoryRow>(
    `UPDATE categories SET
       name = COALESCE($2, name), emoji = COALESCE($3, emoji), section = COALESCE($4, section),
       description = COALESCE($5, description), image_url = COALESCE($6, image_url),
       sort = COALESCE($7, sort), active = COALESCE($8, active), slug = COALESCE($9, slug)
     WHERE id = $1 RETURNING *`,
    [
      id,
      input.name ?? null,
      input.emoji ?? null,
      input.section ?? null,
      input.description ?? null,
      input.image_url ?? null,
      input.sort ?? null,
      typeof input.active === "boolean" ? input.active : null,
      input.slug ?? null,
    ],
  );
  await log("category_updated", { id, name: input.name }, "info", "admin");
  return row;
}

export async function deleteCategory(id: number): Promise<void> {
  await q("DELETE FROM categories WHERE id = $1", [id]);
  await log("category_deleted", { id }, "warn", "admin");
}

/* ───────────────────────── المنتجات ───────────────────────── */

export async function listProducts(opts: {
  categoryId?: number;
  activeOnly?: boolean;
  search?: string;
  limit?: number;
  featured?: boolean;
  unpriced?: boolean;
} = {}): Promise<ProductRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.categoryId) {
    params.push(opts.categoryId);
    where.push(`p.category_id = $${params.length}`);
  }
  if (opts.activeOnly) where.push("p.active = true");
  if (opts.featured) where.push("p.featured = true");
  if (opts.unpriced) where.push("p.price IS NULL");
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where.push(`p.name ILIKE $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Number(opts.limit ?? 400), 500);
  return q<ProductRow>(
    `SELECT p.*, c.name AS category_name FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     ${clause} ORDER BY p.sort, p.id LIMIT ${limit}`,
    params,
  );
}

export async function getProduct(id: number): Promise<ProductRow | null> {
  return one<ProductRow>("SELECT * FROM products WHERE id = $1", [id]);
}

export type ProductInput = {
  name: string;
  category_id?: number | null;
  description?: string;
  price?: number | string | null;
  price_label?: string | null;
  image_url?: string | null;
  image_file_id?: string | null;
  active?: boolean;
  featured?: boolean;
  sort?: number;
  fields?: { key: string; label: string; placeholder?: string; required?: boolean }[];
  stock?: number | null;
  badge?: string | null;
};

export async function createProduct(input: ProductInput): Promise<ProductRow> {
  const row = await one<ProductRow>(
    `INSERT INTO products (category_id, name, description, price, price_label, image_url, image_file_id,
       active, featured, sort, fields, stock, badge)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13) RETURNING *`,
    [
      input.category_id ?? null,
      input.name,
      input.description ?? "",
      input.price ?? null,
      input.price_label ?? null,
      input.image_url ?? null,
      input.image_file_id ?? null,
      input.active !== false,
      Boolean(input.featured),
      Number(input.sort ?? 99),
      JSON.stringify(input.fields ?? []),
      input.stock ?? null,
      input.badge ?? null,
    ],
  );
  await log("product_created", { id: row?.id, name: input.name, price: input.price }, "success", "admin");
  return row as ProductRow;
}

export async function updateProduct(id: number, input: Partial<ProductInput>): Promise<ProductRow | null> {
  const row = await one<ProductRow>(
    `UPDATE products SET
       category_id = COALESCE($2, category_id),
       name = COALESCE($3, name),
       description = COALESCE($4, description),
       price = $5,
       price_label = $6,
       image_url = COALESCE($7, image_url),
       image_file_id = COALESCE($8, image_file_id),
       active = COALESCE($9, active),
       featured = COALESCE($10, featured),
       sort = COALESCE($11, sort),
       fields = COALESCE($12::jsonb, fields),
       stock = $13,
       badge = $14,
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      id,
      input.category_id ?? null,
      input.name ?? null,
      input.description ?? null,
      input.price === undefined ? undefined : input.price === null ? null : Number(input.price),
      input.price_label === undefined ? undefined : input.price_label,
      input.image_url ?? null,
      input.image_file_id ?? null,
      typeof input.active === "boolean" ? input.active : null,
      typeof input.featured === "boolean" ? input.featured : null,
      input.sort ?? null,
      input.fields ? JSON.stringify(input.fields) : null,
      input.stock === undefined ? undefined : input.stock,
      input.badge === undefined ? undefined : input.badge,
    ],
  );
  await log("product_updated", { id, name: input.name }, "info", "admin");
  return row;
}

export async function deleteProduct(id: number): Promise<void> {
  await q("DELETE FROM products WHERE id = $1", [id]);
  await log("product_deleted", { id }, "warn", "admin");
}

export async function bumpProductSold(id: number, quantity: number): Promise<void> {
  await q("UPDATE products SET sold = sold + $2 WHERE id = $1", [id, quantity]);
}

export async function bulkPriceAdjust(percent: number, categoryId?: number): Promise<number> {
  const factor = 1 + percent / 100;
  const rows = await q<{ id: number }>(
    `UPDATE products SET price = ROUND(price * $1, 0), updated_at = now()
     WHERE price IS NOT NULL ${categoryId ? "AND category_id = $2" : ""} RETURNING id`,
    categoryId ? [factor, categoryId] : [factor],
  );
  await log("products_price_bulk", { percent, categoryId, count: rows.length }, "warn", "admin");
  return rows.length;
}

/* ───────────────────────── المحافظ والقنوات ───────────────────────── */

export async function listWallets(activeOnly = false): Promise<WalletRow[]> {
  return q<WalletRow>(
    `SELECT * FROM wallets ${activeOnly ? "WHERE active = true" : ""} ORDER BY sort, id`,
  );
}

export async function createWallet(input: Partial<WalletRow>): Promise<WalletRow> {
  const row = await one<WalletRow>(
    `INSERT INTO wallets (name, emoji, kind, account, holder, instructions, active, sort)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      input.name || "محفظة",
      input.emoji || "💳",
      input.kind || "other",
      input.account || "",
      input.holder || "",
      input.instructions || "",
      input.active !== false,
      Number(input.sort ?? 99),
    ],
  );
  await log("wallet_created", { id: row?.id, name: input.name }, "success", "admin");
  return row as WalletRow;
}

export async function updateWallet(id: number, input: Partial<WalletRow>): Promise<WalletRow | null> {
  return one<WalletRow>(
    `UPDATE wallets SET name = COALESCE($2,name), emoji = COALESCE($3,emoji), kind = COALESCE($4,kind),
       account = COALESCE($5,account), holder = COALESCE($6,holder), instructions = COALESCE($7,instructions),
       active = COALESCE($8,active), sort = COALESCE($9,sort)
     WHERE id = $1 RETURNING *`,
    [
      id,
      input.name ?? null,
      input.emoji ?? null,
      input.kind ?? null,
      input.account ?? null,
      input.holder ?? null,
      input.instructions ?? null,
      typeof input.active === "boolean" ? input.active : null,
      input.sort ?? null,
    ],
  );
}

export async function deleteWallet(id: number): Promise<void> {
  await q("DELETE FROM wallets WHERE id = $1", [id]);
  await log("wallet_deleted", { id }, "warn", "admin");
}

export async function listChannels(activeOnly = false): Promise<ChannelRow[]> {
  return q<ChannelRow>(`SELECT * FROM channels ${activeOnly ? "WHERE active = true" : ""} ORDER BY sort, id`);
}

export async function createChannel(input: Partial<ChannelRow>): Promise<ChannelRow> {
  const chat = String(input.chat || "").trim();
  const row = await one<ChannelRow>(
    `INSERT INTO channels (chat, title, url, active, sort) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (chat) DO UPDATE SET title = EXCLUDED.title, url = EXCLUDED.url
     RETURNING *`,
    [
      chat.startsWith("@") || chat.startsWith("-") || /^https?:/.test(chat) ? chat : `@${chat}`,
      input.title || chat.replace(/^@/, ""),
      input.url || (chat.startsWith("@") ? `https://t.me/${chat.slice(1)}` : chat),
      input.active !== false,
      Number(input.sort ?? 99),
    ],
  );
  await log("channel_created", { chat }, "success", "admin");
  return row as ChannelRow;
}

export async function updateChannel(id: number, input: Partial<ChannelRow>): Promise<ChannelRow | null> {
  return one<ChannelRow>(
    `UPDATE channels SET chat = COALESCE($2,chat), title = COALESCE($3,title), url = COALESCE($4,url),
      active = COALESCE($5,active), sort = COALESCE($6,sort) WHERE id = $1 RETURNING *`,
    [id, input.chat ?? null, input.title ?? null, input.url ?? null, typeof input.active === "boolean" ? input.active : null, input.sort ?? null],
  );
}

export async function deleteChannel(id: number): Promise<void> {
  await q("DELETE FROM channels WHERE id = $1", [id]);
  await log("channel_deleted", { id }, "warn", "admin");
}

/* ───────────────────────── الإحصاءات ───────────────────────── */

export type StatsPayload = {
  users: number;
  users_today: number;
  active_24h: number;
  blocked: number;
  orders: number;
  orders_today: number;
  pending: number;
  revenue: number;
  revenue_today: number;
  revenue_month: number;
  usd_volume: number;
  products: number;
  categories: number;
  conversion: number;
  series: { day: string; orders: number; revenue: number; users: number }[];
  status_breakdown: Record<string, number>;
  top_products: { name: string; orders: number; revenue: number }[];
};

export async function getStats(): Promise<StatsPayload> {
  // 📈 تصفير الإحصائيات: لو stats_reset_at مضبوط، نحوسب فقط ما بعده
  const resetRaw = await getSetting<string>("stats_reset_at");
  const resetDate = resetRaw ? new Date(resetRaw) : null;
  const rs = resetDate && !Number.isNaN(resetDate.getTime()) ? ` AND created_at >= '${resetDate.toISOString()}'` : "";
  const [u, o, p, c] = await Promise.all([
    one<{ total: string; today: string; active: string; blocked: string }>(
      `SELECT count(*)::text AS total,
        count(*) FILTER (WHERE created_at > now() - interval '24 hours')::text AS today,
        count(*) FILTER (WHERE last_seen_at > now() - interval '24 hours')::text AS active,
        count(*) FILTER (WHERE is_blocked)::text AS blocked
       FROM users WHERE true${rs}`,
    ),
    one<{
      total: string;
      today: string;
      pending: string;
      revenue: string;
      revenue_today: string;
      revenue_month: string;
      usd: string;
    }>(
      `SELECT count(*)::text AS total,
        count(*) FILTER (WHERE created_at > now() - interval '24 hours')::text AS today,
        count(*) FILTER (WHERE status = 'awaiting_review')::text AS pending,
        COALESCE(sum(amount) FILTER (WHERE status IN ('approved','delivered')),0)::text AS revenue,
        COALESCE(sum(amount) FILTER (WHERE status IN ('approved','delivered') AND created_at > now() - interval '24 hours'),0)::text AS revenue_today,
        COALESCE(sum(amount) FILTER (WHERE status IN ('approved','delivered') AND created_at > date_trunc('month', now())),0)::text AS revenue_month,
        COALESCE(sum(usd_amount) FILTER (WHERE kind = 'usd' AND status IN ('approved','delivered')),0)::text AS usd
       FROM orders WHERE true${rs}`,
    ),
    one<{ total: string }>("SELECT count(*)::text AS total FROM products"),
    one<{ total: string }>("SELECT count(*)::text AS total FROM categories"),
  ]);

  const series = await q<{ day: string; orders: string; revenue: string; users: string }>(
    `WITH days AS (
       SELECT generate_series(current_date - interval '13 days', current_date, interval '1 day')::date AS day
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
       (SELECT count(*) FROM orders WHERE created_at::date = d.day${rs})::text AS orders,
       (SELECT COALESCE(sum(amount),0) FROM orders WHERE created_at::date = d.day AND status IN ('approved','delivered')${rs})::text AS revenue,
       (SELECT count(*) FROM users WHERE created_at::date = d.day${rs})::text AS users
     FROM days d ORDER BY d.day`,
  );

  const statusRows = await q<{ status: string; count: string }>(
    `SELECT status, count(*)::text AS count FROM orders WHERE true${rs} GROUP BY status`,
  );
  const status_breakdown: Record<string, number> = {};
  for (const r of statusRows) status_breakdown[r.status] = Number(r.count);

  const top = await q<{ name: string; orders: string; revenue: string }>(
    `SELECT product_name AS name, count(*)::text AS orders,
       COALESCE(sum(amount),0)::text AS revenue
     FROM orders WHERE status IN ('approved','delivered')${rs}
     GROUP BY product_name ORDER BY count(*) DESC LIMIT 6`,
  );

  const totalUsers = Number(u?.total ?? 0);
  const ordersCount = Number(o?.total ?? 0);
  return {
    users: totalUsers,
    users_today: Number(u?.today ?? 0),
    active_24h: Number(u?.active ?? 0),
    blocked: Number(u?.blocked ?? 0),
    orders: ordersCount,
    orders_today: Number(o?.today ?? 0),
    pending: Number(o?.pending ?? 0),
    revenue: Number(o?.revenue ?? 0),
    revenue_today: Number(o?.revenue_today ?? 0),
    revenue_month: Number(o?.revenue_month ?? 0),
    usd_volume: Number(o?.usd ?? 0),
    products: Number(p?.total ?? 0),
    categories: Number(c?.total ?? 0),
    conversion: totalUsers ? Math.round((ordersCount / totalUsers) * 1000) / 10 : 0,
    series: series.map((s) => ({
      day: s.day,
      orders: Number(s.orders),
      revenue: Number(s.revenue),
      users: Number(s.users),
    })),
    status_breakdown,
    top_products: top.map((t) => ({ name: t.name, orders: Number(t.orders), revenue: Number(t.revenue) })),
  };
}

/* ───────────────────────── الإعدادات ───────────────────────── */

export async function settings(): Promise<SettingsMap> {
  return (await allSettings()) as SettingsMap;
}

export function settingString(map: SettingsMap, key: string, fallback = ""): string {
  const v = map[key];
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;
}

export function settingNumber(map: SettingsMap, key: string, fallback = 0): number {
  const v = map[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function settingBool(map: SettingsMap, key: string, fallback = false): boolean {
  const v = map[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "1";
  return fallback;
}

export async function ordersCountByStatus(status: string): Promise<number> {
  const row = await one<{ count: string }>("SELECT count(*)::text AS count FROM orders WHERE status = $1", [status]);
  return Number(row?.count ?? 0);
}

export async function recentOrders(limit = 8): Promise<OrderRow[]> {
  return q<OrderRow>(
    `SELECT o.*, u.username, u.first_name FROM orders o
     LEFT JOIN users u ON u.tg_id = o.user_id
     ORDER BY o.created_at DESC LIMIT $1`,
    [limit],
  );
}
