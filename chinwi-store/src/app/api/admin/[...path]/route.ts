import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AI_SUGGESTIONS, aiProviders, assistantPlan, extractProductsFromImage, type AiMessage } from "@/lib/ai";
import {
  COOKIE_NAME,
  changePassword,
  checkPassword,
  clearAttempts,
  clientKey,
  cookieOptions,
  cookieValue,
  noteAttempt,
  tooManyAttempts,
  verifyToken,
} from "@/lib/auth";
import { ensureWebhook, webhookStatus } from "@/lib/bootstrap";
import { allSettings, backupJson, backupSql, ensureDb, getSetting, log, one, q, setSetting } from "@/lib/db";
import { env } from "@/lib/env";
import { emojiStats, setEmojiEnabled, syncEmojiSet } from "@/lib/emoji";
import { money, shortDate } from "@/lib/format";
import { deleteOrder, getOrder, listOrders, ordersCsv, setOrderStatus } from "@/lib/orders";
import {
  bulkPriceAdjust,
  createCategory,
  createProduct,
  createWallet,
  createChannel,
  deleteCategory,
  deleteProduct,
  deleteUser,
  deleteWallet,
  deleteChannel,
  getProduct,
  getStats,
  getUser,
  listCategories,
  listChannels,
  listProducts,
  listUsers,
  listWallets,
  recentOrders,
  setUserFlags,
  updateCategory,
  updateChannel,
  updateProduct,
  updateWallet,
} from "@/lib/store";
import { broadcastToAll, sendToUser } from "@/lib/bot";
import type { OrderStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* ───────────────────────── أدوات ───────────────────────── */

function bad(message: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get(COOKIE_NAME)?.value);
}

function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function bool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return undefined;
}

const SECRET_KEYS = new Set(["admin_password", "panel_salt"]);

async function saveSettings(input: Record<string, unknown>): Promise<string[]> {
  const saved: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (!/^[a-z0-9_]+$/.test(key) || SECRET_KEYS.has(key)) continue;
    await setSetting(key, value);
    saved.push(key);
  }
  await log("settings_saved", { keys: saved }, "info", "admin");
  return saved;
}

/* ───────────────────────── سياق الذكاء الاصطناعي ───────────────────────── */

async function aiContext(): Promise<string> {
  const [cats, prods, settings, stats, orders] = await Promise.all([
    listCategories(),
    listProducts({ limit: 200 }),
    allSettings(),
    getStats(),
    listOrders({ limit: 8 }),
  ]);
  const lines: string[] = [];
  lines.push(`المتجر: ${str(settings.store_name)} — العملة: ${str(settings.currency, "دج")}`);
  lines.push(
    `الإحصاءات: مستخدمون ${stats.users} | طلبات ${stats.orders} | معلّقة ${stats.pending} | مبيعات ${money(stats.revenue, str(settings.currency, "دج"))} | دولار ${stats.usd_volume}$`,
  );
  lines.push(`إعدادات: اشتراك إجباري=${settings.require_subscription} | صيانة=${settings.maintenance} | أسعار الدولار=${JSON.stringify(settings.usd_rates)}`);
  lines.push("الأقسام (id | الاسم | slug):");
  for (const c of cats) lines.push(`- ${c.id} | ${c.name} | ${c.slug} | ${c.products_count ?? 0} منتج`);
  lines.push("المنتجات (id | الاسم | السعر | القسم):");
  for (const p of prods.slice(0, 120)) {
    lines.push(`- ${p.id} | ${p.name} | ${p.price ?? "غير محدد"} | ${p.category_name ?? "-"}`);
  }
  lines.push("آخر الطلبات (id | code | المنتج | المبلغ | الحالة | المستخدم):");
  for (const o of orders.rows) {
    lines.push(`- ${o.id} | ${o.code} | ${o.product_name} | ${o.amount} | ${o.status} | ${o.user_id}`);
  }
  return lines.join("\n").slice(0, 12_000);
}

/* ───────────────────────── تنفيذ عمليات الذكاء الاصطناعي ───────────────────────── */

async function resolveCategoryId(ref: unknown): Promise<number | null> {
  const value = str(ref).trim();
  if (!value) return null;
  const asNumber = Number(value);
  const cats = await listCategories();
  const found =
    cats.find((c) => String(c.id) === value) ||
    cats.find((c) => c.slug.toLowerCase() === value.toLowerCase()) ||
    cats.find((c) => c.name.trim() === value.trim()) ||
    cats.find((c) => c.name.includes(value) || value.includes(c.name));
  if (found) return found.id;
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
  return null;
}

async function executeAction(action: Record<string, unknown>): Promise<{ type: string; ok: boolean; result: string }> {
  const type = str(action.type);
  try {
    switch (type) {
      case "create_product": {
        const categoryId = await resolveCategoryId(action.category);
        const priceRaw = action.price;
        const price = priceRaw === null || priceRaw === undefined || priceRaw === "" ? null : num(priceRaw);
        const created = await createProduct({
          name: str(action.name).trim() || "منتج جديد",
          category_id: categoryId,
          price,
          price_label: str(action.price_label ?? (price === null ? "تواصل مع المالك" : "")).trim() || null,
          description: str(action.description),
          badge: str(action.badge) || null,
        });
        return { type, ok: true, result: `أُنشئ المنتج #${created.id} — ${created.name}` };
      }
      case "update_product": {
        const id = num(action.id);
        if (!id) throw new Error("id مطلوب");
        const patch: Record<string, unknown> = {};
        if (action.name !== undefined) patch.name = str(action.name);
        if (action.description !== undefined) patch.description = str(action.description);
        if (action.price !== undefined) patch.price = action.price === null || action.price === "" ? null : num(action.price);
        if (action.price_label !== undefined) patch.price_label = action.price_label ? str(action.price_label) : null;
        if (action.badge !== undefined) patch.badge = action.badge ? str(action.badge) : null;
        if (action.active !== undefined) patch.active = Boolean(action.active);
        if (action.category !== undefined) patch.category_id = await resolveCategoryId(action.category);
        const updated = await updateProduct(id, patch as never);
        return { type, ok: Boolean(updated), result: updated ? `تم تحديث #${id} — ${updated.name}` : `لم يُعثر على #${id}` };
      }
      case "delete_product": {
        const id = num(action.id);
        await deleteProduct(id);
        return { type, ok: true, result: `تم حذف المنتج #${id}` };
      }
      case "create_category": {
        const created = await createCategory({
          name: str(action.name, "قسم جديد"),
          emoji: str(action.emoji, "📦"),
          section: str(action.section, "games"),
          slug: str(action.name).trim().toLowerCase().replace(/\s+/g, "-") || `cat-${Date.now()}`,
        });
        return { type, ok: true, result: `أُنشئ القسم #${created.id} — ${created.name}` };
      }
      case "update_setting": {
        const key = str(action.key);
        if (!/^[a-z0-9_]+$/.test(key) || SECRET_KEYS.has(key)) throw new Error("مفتاح غير مسموح");
        await setSetting(key, action.value);
        return { type, ok: true, result: `تم تحديث الإعداد ${key}` };
      }
      case "ban_user": {
        const tgId = num(action.tg_id);
        await setUserFlags(tgId, { is_blocked: true, ban_reason: str(action.reason, "حظر من لوحة التحكم") });
        await sendToUser(tgId, "🔴 تم حظر حسابك من استخدام المتجر.\nللاستفسار تواصل مع الدعم.");
        return { type, ok: true, result: `تم حظر ${tgId}` };
      }
      case "unban_user": {
        const tgId = num(action.tg_id);
        await setUserFlags(tgId, { is_blocked: false, ban_reason: "" });
        return { type, ok: true, result: `تم إلغاء حظر ${tgId}` };
      }
      case "set_order_status": {
        const id = num(action.id);
        const status = str(action.status) as OrderStatus;
        const allowed: OrderStatus[] = ["pending_payment", "awaiting_review", "approved", "rejected", "delivered", "cancelled"];
        if (!allowed.includes(status)) throw new Error("حالة غير صحيحة");
        await setOrderStatus(id, status);
        return { type, ok: true, result: `الطلب #${id} → ${status}` };
      }
      case "broadcast": {
        const result = await broadcastToAll(str(action.text));
        return { type, ok: true, result: `أُرسلت الإذاعة: ${result.sent} ✅ / ${result.failed} ❌` };
      }
      case "update_wallet": {
        const id = num(action.id);
        const updated = await updateWallet(id, {
          account: action.account !== undefined ? str(action.account) : undefined,
          name: action.name !== undefined ? str(action.name) : undefined,
          instructions: action.instructions !== undefined ? str(action.instructions) : undefined,
        });
        return { type, ok: Boolean(updated), result: updated ? `تم تحديث المحفظة #${id}` : "لم تُعثر المحفظة" };
      }
      default:
        return { type, ok: false, result: "نوع عملية غير معروف" };
    }
  } catch (err) {
    return { type, ok: false, result: String(err) };
  }
}

/* ───────────────────────── GET ───────────────────────── */

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const seg = path ?? [];
  const route = seg.join("/");
  const url = new URL(req.url);

  if (!(await authed())) return bad("unauthorized", 401);

  try {
    await ensureDb();
  } catch (err) {
    return bad(`قاعدة البيانات غير متصلة: ${String(err).slice(0, 200)}`, 503);
  }

  const page = Math.max(1, num(url.searchParams.get("page"), 1));
  const limit = Math.min(100, num(url.searchParams.get("limit"), 25));

  switch (route) {
    case "session":
      return NextResponse.json({
        ok: true,
        site: env.siteUrl,
        store: await getSetting<string>("store_name"),
        ai: aiProviders(),
        suggestions: AI_SUGGESTIONS,
        owner: env.ownerUsername,
      });

    case "dashboard": {
      const [stats, orders, logs, users, pending] = await Promise.all([
        getStats(),
        recentOrders(7),
        q("SELECT * FROM logs ORDER BY created_at DESC LIMIT 10"),
        q("SELECT tg_id, username, first_name, avatar_file_id, created_at, last_seen_at FROM users ORDER BY created_at DESC LIMIT 6"),
        one<{ count: string }>("SELECT count(*)::text AS count FROM orders WHERE status = 'awaiting_review'"),
      ]);
      return NextResponse.json({
        ok: true,
        stats,
        orders,
        logs,
        users,
        pending: Number(pending?.count ?? 0),
      });
    }

    case "stats":
      return NextResponse.json({ ok: true, stats: await getStats() });

    case "orders": {
      const result = await listOrders({
        status: url.searchParams.get("status") ?? "all",
        kind: url.searchParams.get("kind") ?? "all",
        search: url.searchParams.get("search") ?? "",
        userId: num(url.searchParams.get("user")) || undefined,
        limit,
        offset: (page - 1) * limit,
      });
      return NextResponse.json({ ok: true, ...result, page, limit });
    }

    case "users": {
      const result = await listUsers({
        search: url.searchParams.get("search") ?? "",
        filter: (url.searchParams.get("filter") as "all" | "active" | "blocked" | "buyers" | "admins") ?? "all",
        limit,
        offset: (page - 1) * limit,
      });
      return NextResponse.json({ ok: true, ...result, page, limit });
    }

    case "products":
      return NextResponse.json({
        ok: true,
        products: await listProducts({
          categoryId: num(url.searchParams.get("category")) || undefined,
          search: url.searchParams.get("search") ?? "",
          limit: 400,
        }),
        categories: await listCategories(),
      });

    case "categories":
      return NextResponse.json({ ok: true, categories: await listCategories() });

    case "wallets":
      return NextResponse.json({ ok: true, wallets: await listWallets() });

    case "channels":
      return NextResponse.json({ ok: true, channels: await listChannels() });

    case "settings": {
      const all = await allSettings();
      const safe: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(all)) if (!SECRET_KEYS.has(key)) safe[key] = value;
      return NextResponse.json({
        ok: true,
        settings: safe,
        ai: aiProviders(),
        emoji: await emojiStats(),
        site: env.siteUrl,
        owner: env.ownerUsername,
      });
    }

    case "logs": {
      const level = url.searchParams.get("level") ?? "all";
      const rows = await q(
        `SELECT * FROM logs ${level !== "all" ? "WHERE level = $3" : ""} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        level !== "all" ? [limit, (page - 1) * limit, level] : [limit, (page - 1) * limit],
      );
      const total = await one<{ count: string }>("SELECT count(*)::text AS count FROM logs");
      return NextResponse.json({ ok: true, rows, total: Number(total?.count ?? 0), page, limit });
    }

    case "broadcasts":
      return NextResponse.json({
        ok: true,
        rows: await q("SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 20"),
        users: await one<{ count: string }>("SELECT count(*)::text AS count FROM users WHERE is_blocked = false"),
      });

    case "ai/status":
      return NextResponse.json({ ok: true, providers: aiProviders(), suggestions: AI_SUGGESTIONS });

    case "ai/history": {
      const rows = await q(
        "SELECT * FROM ai_messages WHERE session = 'main' ORDER BY created_at DESC LIMIT 40",
      );
      return NextResponse.json({ ok: true, rows: rows.reverse() });
    }

    case "setup": {
      const status = await webhookStatus();
      const users = await one<{ count: string }>("SELECT count(*)::text AS count FROM users");
      const ownerId = num(await getSetting<number>("owner_chat_id"));
      return NextResponse.json({ ok: true, ...status, users: Number(users?.count ?? 0), ownerId });
    }

    case "emoji":
      return NextResponse.json({ ok: true, ...(await emojiStats()) });

    default:
      break;
  }

  // مسارات بمعرّف
  if (seg[0] === "orders" && seg[1]) {
    const order = await getOrder(num(seg[1]));
    if (!order) return bad("الطلب غير موجود", 404);
    const user = await getUser(order.user_id);
    return NextResponse.json({ ok: true, order, user });
  }
  if (seg[0] === "users" && seg[1]) {
    const user = await getUser(num(seg[1]));
    if (!user) return bad("المستخدم غير موجود", 404);
    const orders = await listOrders({ userId: Number(user.tg_id), limit: 20 });
    return NextResponse.json({ ok: true, user, orders: orders.rows });
  }
  if (seg[0] === "products" && seg[1]) {
    const product = await getProduct(num(seg[1]));
    if (!product) return bad("المنتج غير موجود", 404);
    return NextResponse.json({ ok: true, product });
  }
  if (seg[0] === "export" && seg[1]) {
    if (seg[1] === "backup") {
      const dump = await backupJson();
      return new Response(JSON.stringify(dump, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="chinwi-backup-${Date.now()}.json"`,
        },
      });
    }
    if (seg[1] === "sql") {
      const sql = await backupSql();
      return new Response(sql, {
        headers: {
          "content-type": "application/sql; charset=utf-8",
          "content-disposition": `attachment; filename="chinwi-backup-${Date.now()}.sql"`,
        },
      });
    }
    if (seg[1] === "orders") {
      const csv = await ordersCsv();
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="orders-${Date.now()}.csv"`,
        },
      });
    }
    if (seg[1] === "users") {
      const rows = await q<Record<string, unknown>>(
        "SELECT tg_id, username, first_name, is_blocked, orders_count, total_spent, created_at, last_seen_at FROM users ORDER BY created_at DESC LIMIT 5000",
      );
      const head = ["tg_id", "username", "first_name", "blocked", "orders", "spent", "joined", "last_seen"];
      const body = rows.map((r) =>
        [r.tg_id, r.username ?? "", r.first_name ?? "", r.is_blocked, r.orders_count, r.total_spent, r.created_at, r.last_seen_at]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(","),
      );
      return new Response([head.join(","), ...body].join("\n"), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="users-${Date.now()}.csv"`,
        },
      });
    }
  }

  return bad("مسار غير معروف", 404);
}

/* ───────────────────────── POST ───────────────────────── */

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const seg = path ?? [];
  const route = seg.join("/");
  const key = clientKey(req);

  // تسجيل الدخول (بدون جلسة)
  if (route === "login") {
    if (tooManyAttempts(key)) return bad("محاولات كثيرة — انتظر 10 دقائق", 429);
    const body = (await req.json().catch(() => ({}))) as { password?: string };
    if (!body.password) return bad("أدخل كلمة السر");
    const ok = await checkPassword(String(body.password));
    if (!ok) {
      noteAttempt(key);
      await log("login_failed", { ip: key }, "warn", "admin");
      return bad("كلمة السر غير صحيحة", 401);
    }
    clearAttempts(key);
    await ensureDb();
    await log("login_success", { ip: key }, "success", "admin");
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, cookieValue(), cookieOptions);
    return res;
  }

  if (route === "logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, "", { ...cookieOptions, maxAge: 0 });
    return res;
  }

  if (!(await authed())) return bad("unauthorized", 401);

  try {
    await ensureDb();
  } catch (err) {
    return bad(`قاعدة البيانات غير متصلة: ${String(err).slice(0, 200)}`, 503);
  }

  const contentType = req.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");
  const body: Record<string, unknown> = isMultipart
    ? {}
    : ((await req.json().catch(() => ({}))) as Record<string, unknown>);
  const form = isMultipart ? await req.formData() : null;

  /* ── رفع صورة ── */
  if (route === "upload") {
    const file = form?.get("file");
    if (!(file instanceof File)) return bad("لم يُرسل ملف");
    if (file.size > 6 * 1024 * 1024) return bad("الحجم أكبر من 6 ميغابايت");
    if (!file.type.startsWith("image/")) return bad("الملف ليس صورة");
    const buffer = Buffer.from(await file.arrayBuffer());
    const row = await one<{ id: string }>(
      "INSERT INTO media (mime, data, filename, size) VALUES ($1,$2,$3,$4) RETURNING id",
      [file.type, buffer, file.name || "image", file.size],
    );
    return NextResponse.json({ ok: true, url: `/api/media/${row?.id}`, id: row?.id });
  }

  /* ── الطلبات ── */
  if (seg[0] === "orders" && seg[1]) {
    const id = num(seg[1]);
    if (seg[2] === "delete") {
      await deleteOrder(id);
      return NextResponse.json({ ok: true });
    }
    const status = str(body.status) as OrderStatus;
    if (!status) return bad("الحالة مطلوبة");
    const order = await setOrderStatus(id, status, {
      adminNote: body.adminNote === undefined ? null : str(body.adminNote),
    });
    if (!order) return bad("الطلب غير موجود", 404);
    if (status === "rejected" || status === "delivered" || status === "approved") {
      const message =
        status === "rejected"
          ? `🔴 <b>تم رفض طلبك</b>\n\n🧾 <code>${order.code}</code> — ${order.product_name}${order.admin_note ? `\n📝 ${order.admin_note}` : ""}\n\nللاستفسار: تواصل مع الدعم 💬`
          : `✅ <b>تم تنفيذ طلبك</b>\n\n🧾 <code>${order.code}</code> — ${order.product_name}\n💰 ${money(order.amount, order.currency)}\n\nشكراً لثقتك 🙏`;
      await sendToUser(Number(order.user_id), message);
    }
    if (status === "awaiting_review" && !order.receipt_file_id) {
      await sendToUser(Number(order.user_id), `🟡 طلبك <code>${order.code}</code> قيد المراجعة.`);
    }
    return NextResponse.json({ ok: true, order });
  }

  /* ── المستخدمون ── */
  if (seg[0] === "users" && seg[1]) {
    const tgId = num(seg[1]);
    if (seg[2] === "delete") {
      await deleteUser(tgId);
      return NextResponse.json({ ok: true });
    }
    const action = str(body.action);
    if (action === "message") {
      const text = str(body.text).trim();
      if (!text) return bad("الرسالة فارغة");
      const sent = await sendToUser(tgId, text);
      await log("user_message", { tgId, sent }, sent ? "success" : "warn", "admin");
      return NextResponse.json({ ok: sent, error: sent ? undefined : "تعذّر الإرسال (ربما حظر البوت)" });
    }
    if (action === "ban") {
      await setUserFlags(tgId, { is_blocked: true, ban_reason: str(body.reason, "حظر إداري") });
      await sendToUser(tgId, "🔴 تم حظر حسابك من استخدام المتجر.");
    }
    if (action === "unban") await setUserFlags(tgId, { is_blocked: false, ban_reason: "" });
    if (action === "admin") await setUserFlags(tgId, { is_admin: true });
    if (action === "unadmin") await setUserFlags(tgId, { is_admin: false });
    if (action === "note") await setUserFlags(tgId, { notes: str(body.text) });
    return NextResponse.json({ ok: true, user: await getUser(tgId) });
  }

  /* ── المنتجات ── */
  if (route === "products") {
    const created = await createProduct({
      name: str(body.name, "منتج جديد").trim(),
      category_id: num(body.category_id) || null,
      price: body.price === null || body.price === "" || body.price === undefined ? null : num(body.price),
      price_label: str(body.price_label) || null,
      description: str(body.description),
      image_url: str(body.image_url) || null,
      active: bool(body.active) ?? true,
      featured: bool(body.featured) ?? false,
      sort: num(body.sort, 99),
      badge: str(body.badge) || null,
      stock: body.stock === null || body.stock === "" || body.stock === undefined ? null : num(body.stock),
      fields: Array.isArray(body.fields) ? (body.fields as never) : [],
    });
    return NextResponse.json({ ok: true, product: created });
  }

  if (seg[0] === "products" && seg[1] === "bulk") {
    const count = await bulkPriceAdjust(num(body.percent), num(body.category_id) || undefined);
    return NextResponse.json({ ok: true, count });
  }

  if (seg[0] === "products" && seg[1] === "import") {
    const items = Array.isArray(body.items) ? body.items : [];
    let created = 0;
    for (const raw of items as Record<string, unknown>[]) {
      const name = str(raw.name).trim();
      if (!name) continue;
      const categoryId = raw.category_id ? num(raw.category_id) : await resolveCategoryId(raw.category);
      const price = raw.price === null || raw.price === "" || raw.price === undefined ? null : num(raw.price);
      await createProduct({
        name,
        category_id: categoryId,
        price,
        price_label: price === null ? "تواصل مع المالك" : null,
        description: str(raw.description),
        badge: str(raw.badge) || null,
      });
      created += 1;
    }
    return NextResponse.json({ ok: true, created });
  }

  if (seg[0] === "products" && seg[1]) {
    const id = num(seg[1]);
    if (seg[2] === "delete") {
      await deleteProduct(id);
      return NextResponse.json({ ok: true });
    }
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = str(body.name);
    if (body.category_id !== undefined) patch.category_id = num(body.category_id) || null;
    if (body.price !== undefined) patch.price = body.price === null || body.price === "" ? null : num(body.price);
    if (body.price_label !== undefined) patch.price_label = str(body.price_label) || null;
    if (body.description !== undefined) patch.description = str(body.description);
    if (body.image_url !== undefined) patch.image_url = str(body.image_url) || null;
    if (body.active !== undefined) patch.active = bool(body.active);
    if (body.featured !== undefined) patch.featured = bool(body.featured);
    if (body.sort !== undefined) patch.sort = num(body.sort);
    if (body.badge !== undefined) patch.badge = str(body.badge) || null;
    if (body.stock !== undefined) patch.stock = body.stock === null || body.stock === "" ? null : num(body.stock);
    if (body.fields !== undefined && Array.isArray(body.fields)) patch.fields = body.fields;
    const product = await updateProduct(id, patch as never);
    return NextResponse.json({ ok: Boolean(product), product });
  }

  /* ── الأقسام ── */
  if (route === "categories") {
    const category = await createCategory({
      name: str(body.name, "قسم جديد").trim(),
      slug: str(body.slug).trim() || undefined,
      emoji: str(body.emoji, "📦"),
      section: str(body.section, "games"),
      description: str(body.description),
      image_url: str(body.image_url) || null,
      sort: num(body.sort, 99),
      active: bool(body.active) ?? true,
    });
    return NextResponse.json({ ok: true, category });
  }
  if (seg[0] === "categories" && seg[1]) {
    const id = num(seg[1]);
    if (seg[2] === "delete") {
      await deleteCategory(id);
      return NextResponse.json({ ok: true });
    }
    const category = await updateCategory(id, {
      name: body.name !== undefined ? str(body.name) : undefined,
      emoji: body.emoji !== undefined ? str(body.emoji) : undefined,
      section: body.section !== undefined ? str(body.section) : undefined,
      description: body.description !== undefined ? str(body.description) : undefined,
      image_url: body.image_url !== undefined ? str(body.image_url) || null : undefined,
      sort: body.sort !== undefined ? num(body.sort) : undefined,
      active: body.active !== undefined ? bool(body.active) : undefined,
    });
    return NextResponse.json({ ok: true, category });
  }

  /* ── المحافظ ── */
  if (route === "wallets") {
    const wallet = await createWallet({
      name: str(body.name, "محفظة"),
      emoji: str(body.emoji, "💳"),
      kind: str(body.kind, "other"),
      account: str(body.account),
      holder: str(body.holder),
      instructions: str(body.instructions),
      sort: num(body.sort, 99),
      active: bool(body.active) ?? true,
    });
    return NextResponse.json({ ok: true, wallet });
  }
  if (seg[0] === "wallets" && seg[1]) {
    const id = num(seg[1]);
    if (seg[2] === "delete") {
      await deleteWallet(id);
      return NextResponse.json({ ok: true });
    }
    const wallet = await updateWallet(id, {
      name: body.name !== undefined ? str(body.name) : undefined,
      emoji: body.emoji !== undefined ? str(body.emoji) : undefined,
      account: body.account !== undefined ? str(body.account) : undefined,
      holder: body.holder !== undefined ? str(body.holder) : undefined,
      instructions: body.instructions !== undefined ? str(body.instructions) : undefined,
      active: body.active !== undefined ? bool(body.active) : undefined,
      sort: body.sort !== undefined ? num(body.sort) : undefined,
    });
    return NextResponse.json({ ok: true, wallet });
  }

  /* ── القنوات ── */
  if (route === "channels") {
    const channel = await createChannel({
      chat: str(body.chat),
      title: str(body.title),
      url: str(body.url),
      sort: num(body.sort, 99),
      active: bool(body.active) ?? true,
    });
    return NextResponse.json({ ok: true, channel });
  }
  if (seg[0] === "channels" && seg[1] && seg[2] === "test") {
    const { getChat } = await import("@/lib/telegram");
    const chat = str(body.chat);
    const info = await getChat(chat);
    return NextResponse.json({ ok: Boolean(info), info });
  }
  if (seg[0] === "channels" && seg[1]) {
    const id = num(seg[1]);
    if (seg[2] === "delete") {
      await deleteChannel(id);
      return NextResponse.json({ ok: true });
    }
    const channel = await updateChannel(id, {
      chat: body.chat !== undefined ? str(body.chat) : undefined,
      title: body.title !== undefined ? str(body.title) : undefined,
      url: body.url !== undefined ? str(body.url) : undefined,
      active: body.active !== undefined ? bool(body.active) : undefined,
      sort: body.sort !== undefined ? num(body.sort) : undefined,
    });
    return NextResponse.json({ ok: true, channel });
  }

  /* ── الإعدادات ── */
  if (route === "settings") return NextResponse.json({ ok: true, saved: await saveSettings(body) });

  if (route === "password") {
    const current = str(body.current);
    const next = str(body.next);
    if (next.length < 6) return bad("كلمة السر الجديدة قصيرة جداً (6 أحرف على الأقل)");
    if (!(await checkPassword(current))) return bad("كلمة السر الحالية غير صحيحة", 401);
    await changePassword(next);
    await log("password_changed", {}, "warn", "admin");
    return NextResponse.json({ ok: true });
  }

  /* ── الإذاعة ── */
  if (route === "broadcast") {
    const text = str(body.text).trim();
    if (!text) return bad("نص الإذاعة فارغ");
    const target = str(body.target, "all");
    const result = await broadcastToAll(text);
    await log("broadcast", { sent: result.sent, failed: result.failed, target }, "success", "admin");
    return NextResponse.json({ ok: true, ...result });
  }

  /* ── الويبهوك ── */
  if (route === "setup") {
    const result = await ensureWebhook(true);
    await log("webhook_setup", result, result.ok ? "success" : "error", "admin");
    return NextResponse.json({ ...result, ok: result.ok, status: await webhookStatus() });
  }

  /* ── الإيموجي المتحرك ── */
  if (route === "emoji/sync") {
    try {
      const result = await syncEmojiSet(str(body.set));
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return bad(String(err).slice(0, 300));
    }
  }
  if (route === "emoji/toggle") {
    await setEmojiEnabled(Boolean(body.enabled));
    return NextResponse.json({ ok: true, ...(await emojiStats()) });
  }

  /* ── الذكاء الاصطناعي ── */
  if (route === "ai/chat") {
    const text = str(body.text).trim();
    const history = Array.isArray(body.history) ? (body.history as AiMessage[]) : [];
    if (!text) return bad("اكتب طلبك أولاً");
    await q("INSERT INTO ai_messages (session, role, content) VALUES ('main','user',$1)", [text]);
    try {
      const context = await aiContext();
      const plan = await assistantPlan(
        [...history.slice(-8).map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: String(m.content).slice(0, 2000) })), { role: "user", content: text }],
        context,
      );
      await q("INSERT INTO ai_messages (session, role, content, actions, provider) VALUES ('main','assistant',$1,$2::jsonb,$3)", [
        plan.reply,
        JSON.stringify(plan.actions ?? []),
        plan.provider,
      ]);
      return NextResponse.json({ ok: true, ...plan });
    } catch (err) {
      return bad(String(err).slice(0, 400), 502);
    }
  }

  if (route === "ai/apply") {
    const actions = Array.isArray(body.actions) ? (body.actions as Record<string, unknown>[]) : [];
    const results = [];
    for (const action of actions.slice(0, 12)) results.push(await executeAction(action));
    await log("ai_actions", { results }, "success", "ai");
    return NextResponse.json({ ok: true, results });
  }

  if (route === "ai/vision") {
    const file = form?.get("file");
    if (!(file instanceof File)) return bad("أرسل صورة أولاً");
    if (!file.type.startsWith("image/")) return bad("الملف ليس صورة");
    const cats = await listCategories();
    try {
      const result = await extractProductsFromImage(
        { mime: file.type, data: Buffer.from(await file.arrayBuffer()) },
        cats.map((c) => `${c.name} (${c.slug})`),
      );
      const mediaRow = await one<{ id: string }>(
        "INSERT INTO media (mime, data, filename, size) VALUES ($1,$2,$3,$4) RETURNING id",
        [file.type, Buffer.from(await file.arrayBuffer()), file.name || "upload", file.size],
      );
      return NextResponse.json({ ok: true, ...result, mediaId: mediaRow?.id, categories: cats });
    } catch (err) {
      return bad(String(err).slice(0, 400), 502);
    }
  }

  if (route === "ai/clear") {
    await q("DELETE FROM ai_messages WHERE session = 'main'");
    return NextResponse.json({ ok: true });
  }

  return bad("مسار غير معروف", 404);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  if (!(await authed())) return bad("unauthorized", 401);
  await ensureDb();
  const seg = path ?? [];
  if (seg[0] === "products" && seg[1]) {
    await deleteProduct(num(seg[1]));
    return NextResponse.json({ ok: true });
  }
  if (seg[0] === "orders" && seg[1]) {
    await deleteOrder(num(seg[1]));
    return NextResponse.json({ ok: true });
  }
  return bad("مسار غير معروف", 404);
}

export async function PUT(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  return POST(req, ctx);
}

/* إبقاء أدوات التنسيق مستخدمة (تُستخدم في الردود النصية) */
void shortDate;
