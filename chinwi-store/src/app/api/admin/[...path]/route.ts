import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AI_SUGGESTIONS, aiProviders, assistantPlan, extractProductsFromImage, setAiKeys, testProviders, probeFreeProviders, freeProviders, localBrain, type AiMessage } from "@/lib/ai";
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
import { announcePrizeDelivery, broadcastToAll, sendToUser } from "@/lib/bot";
import {
  createPrize,
  decideRedemption,
  deletePrize,
  listPrizes,
  listRedemptions,
  topReferrers,
  updatePrize,
} from "@/lib/points";
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


/** يقرأ مفاتيح AI المخزّنة في الإعدادات ويطبّقها (تتقدّم على متغيرات البيئة) */
async function applyAiKeys(): Promise<{ groq: string; gemini: string; openrouter: string }> {
  const keys = {
    groq: str(await getSetting<string>("groq_key")),
    gemini: str(await getSetting<string>("gemini_key")),
    openrouter: str(await getSetting<string>("openrouter_key")),
  };
  setAiKeys(keys);
  return keys;
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
  const [coupons, faqs, secs, blocks, wallets] = await Promise.all([
    q("SELECT code, kind, amount, uses, max_uses, active FROM coupons ORDER BY id DESC LIMIT 12").catch(() => []),
    q("SELECT question FROM faq WHERE active = true ORDER BY sort LIMIT 12").catch(() => []),
    q("SELECT kind, detail, severity, created_at FROM security_events ORDER BY created_at DESC LIMIT 10").catch(() => []),
    one<{ c: string }>("SELECT count(*)::text AS c FROM users WHERE is_blocked = true").catch(() => null),
    q("SELECT id, name, account FROM wallets WHERE active = true ORDER BY sort").catch(() => []),
  ]);
  if (wallets.length) {
    lines.push("محافظ الدفع (id | الاسم | الرقم):");
    for (const w of wallets as Record<string, unknown>[]) lines.push(`- ${w.id} | ${w.name} | ${w.account}`);
  }
  if (coupons.length) {
    lines.push("أكواد الخصم:");
    for (const c of coupons as Record<string, unknown>[]) lines.push(`- ${c.code} | ${c.kind} ${c.amount} | استُخدم ${c.uses}/${c.max_uses} | ${c.active ? "نشط" : "موقوف"}`);
  }
  if (faqs.length) lines.push(`أسئلة شائعة موجودة: ${(faqs as Record<string, unknown>[]).map((f) => f.question).join(" • ")}`);
  lines.push(`مستخدمون محظورون: ${blocks?.c ?? 0}`);
  if (secs.length) {
    lines.push("آخر أحداث أمنية:");
    for (const e of secs as Record<string, unknown>[]) lines.push(`- ${e.kind} | ${e.severity} | ${e.detail}`);
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

const ACTION_LABELS: Record<string, string> = {
  create_product: "إضافة منتج",
  update_product: "تعديل منتج",
  delete_product: "حذف منتج",
  create_category: "إضافة قسم",
  delete_category: "حذف قسم",
  update_setting: "تعديل إعداد",
  ban_user: "حظر مستخدم",
  unban_user: "إلغاء حظر",
  set_order_status: "حالة طلب",
  broadcast: "إذاعة",
  create_coupon: "كود خصم",
  add_faq: "سؤال شائع",
  add_task: "مهمة",
  lock_bot: "قفل/فتح البوت",
  maintenance: "وضع الصيانة",
  bulk_price: "تعديل أسعار جماعي",
  update_wallet: "تعديل محفظة",
  send_message: "رسالة لمستخدم",
  add_points: "إضافة/خصم نقاط",
  decide_redemption: "قرار طلب جائزة",
  create_prize: "إضافة جائزة",
  update_prize: "تعديل جائزة",
  delete_prize: "حذف جائزة",
  delete_wallet: "حذف محفظة",
  create_wallet: "إنشاء محفظة",
  create_channel: "إضافة قناة",
  update_channel: "تعديل قناة",
  delete_channel: "حذف قناة",
  delete_order: "حذف طلب",
  reset_stats: "تصفير الإحصائيات",
  toggle_product: "تفعيل/تعطيل منتج",
  delete_coupon: "حذف كود خصم",
  update_category: "تعديل قسم",
};

async function findUserId(action: Record<string, unknown>): Promise<number> {
  const direct = num(action.tg_id ?? action.user_id ?? action.id);
  if (direct) return direct;
  const raw = str(action.username ?? action.user ?? action.name).replace(/^@/, "").trim();
  if (!raw) return 0;
  const row = await one<{ tg_id: string }>(
    "SELECT tg_id FROM users WHERE lower(username) = lower($1) OR lower(first_name) = lower($1) LIMIT 1",
    [raw],
  );
  return Number(row?.tg_id ?? 0);
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
      case "create_wallet": {
        const name = str(action.name, "محفظة جديدة");
        const created = await createWallet({
          name,
          emoji: str(action.emoji, "💳"),
          kind: str(action.kind, "other"),
          account: str(action.account),
          holder: str(action.holder, name),
          instructions: str(action.instructions, "أرسل صورة الإيصال بعد التحويل."),
        });
        return { type, ok: true, result: `أُنشئت المحفظة #${created.id} — ${created.name}` };
      }
      case "maintenance": {
        const on = bool(action.on ?? action.enabled) ?? true;
        await setSetting("maintenance", on);
        return { type, ok: true, result: on ? "تم إيقاف البوت (وضع الصيانة) — الزبائن يرون رسالة صيانة" : "تم تشغيل البوت من جديد" };
      }
      case "delete_category": {
        const catId = await resolveCategoryId(str(action.category ?? action.name));
        if (!catId) return { type, ok: false, result: "قسم غير موجود" };
        await deleteCategory(catId);
        return { type, ok: true, result: `تم حذف القسم #${catId} بمنتجاته` };
      }
      case "send_message": {
        const tgId = await findUserId(action);
        if (!tgId) return { type, ok: false, result: "لم أجد المستخدم" };
        await sendToUser(tgId, str(action.text, "رسالة من إدارة المتجر"));
        return { type, ok: true, result: `أُرسلت رسالة إلى ${tgId}` };
      }
      case "ban_user": {
        const tgId = await findUserId(action);
        if (!tgId) return { type, ok: false, result: "لم أجد المستخدم" };
        await setUserFlags(tgId, { is_blocked: true, ban_reason: str(action.reason, "حظر من لوحة التحكم") });
        await sendToUser(tgId, "🔴 تم حظر حسابك من استخدام المتجر.\nللاستفسار تواصل مع الدعم.");
        return { type, ok: true, result: `تم حظر ${tgId}` };
      }
      case "unban_user": {
        const tgId = await findUserId(action);
        if (!tgId) return { type, ok: false, result: "لم أجد المستخدم" };
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
      case "create_coupon": {
        const code = str(action.code).trim().toUpperCase();
        if (!code) return { type, ok: false, result: "كود فارغ" };
        await q(
          `INSERT INTO coupons (code, kind, amount, max_uses) VALUES ($1,$2,$3,$4)
           ON CONFLICT (code) DO UPDATE SET amount = excluded.amount, max_uses = excluded.max_uses`,
          [code, str(action.kind, "percent"), num(action.amount), num(action.max_uses)],
        );
        return { type, ok: true, result: `تم إنشاء الكود ${code}` };
      }
      case "add_faq": {
        const question = str(action.question).trim();
        const answer = str(action.answer).trim();
        if (!question || !answer) return { type, ok: false, result: "سؤال أو جواب فارغ" };
        await q("INSERT INTO faq (question, answer, sort) VALUES ($1,$2,90)", [question, answer]);
        return { type, ok: true, result: `تمت إضافة سؤال: ${question}` };
      }
      case "add_task": {
        await q("INSERT INTO tasks (title, note, priority) VALUES ($1,$2,$3)", [
          str(action.title, "مهمة جديدة"),
          str(action.note),
          num(action.priority, 2),
        ]);
        return { type, ok: true, result: `تمت إضافة مهمة: ${str(action.title)}` };
      }
      case "lock_bot": {
        const locked = bool(action.locked) ?? true;
        await setSetting("bot_locked", locked);
        await q("INSERT INTO security_events (kind, detail, severity) VALUES ($1,'بواسطة شينوي AI',$2)", [
          locked ? "bot_locked" : "bot_unlocked",
          locked ? "warn" : "info",
        ]);
        return { type, ok: true, result: locked ? "تم قفل البوت" : "تم فتح البوت" };
      }
      case "bulk_price": {
        const category = str(action.category);
        const percent = num(action.percent, 0);
        const catId = await resolveCategoryId(category);
        if (!catId) return { type, ok: false, result: `قسم غير موجود: ${category}` };
        const updated = await bulkPriceAdjust(catId, percent);
        return { type, ok: true, result: `تم تعديل ${updated} سعراً في القسم بنسبة ${percent}%` };
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
      case "add_points": {
        const tgId = await findUserId(action);
        if (!tgId) return { type, ok: false, result: "لم أجد المستخدم" };
        const delta = Math.trunc(num(action.points));
        if (!delta) return { type, ok: false, result: "عدد النقاط غير صحيح" };
        await q("UPDATE users SET points = GREATEST(0, points + $2) WHERE tg_id = $1", [tgId, delta]);
        const after = await one<{ points: string }>("SELECT points FROM users WHERE tg_id = $1", [tgId]);
        return { type, ok: true, result: `${delta >= 0 ? "أُضيفت" : "أُخصمت"} ${Math.abs(delta)} نقطة لـ ${tgId} — الرصيد الآن ${after?.points ?? "?"}` };
      }
      case "decide_redemption": {
        const id = num(action.id);
        const approve = bool(action.approve ?? (str(action.status) === "approved")) ?? false;
        const row = await decideRedemption(id, approve ? "approved" : "rejected", str(action.note) || undefined);
        if (!row) return { type, ok: false, result: `لم أجد الطلب #${id}` };
        return { type, ok: true, result: `الطلب #${id} → ${approve ? "مقبول ✅ (سُلّمت الجائزة)" : "مرفوض ❌ (رجعت النقاط)"}` };
      }
      case "create_prize": {
        const title = str(action.title).trim();
        const points = num(action.points);
        if (!title || !(points > 0)) return { type, ok: false, result: "الجائزة تحتاج اسم وعدد نقاط" };
        const created = await createPrize({ title, points, icon: str(action.icon, "🎁"), note: str(action.note) });
        return { type, ok: true, result: `أُنشئت الجائزة «${created.title}» (#${created.id}) ب ${points} نقطة` };
      }
      case "update_prize": {
        const id = num(action.id);
        const patch: Record<string, unknown> = {};
        for (const k of ["title", "icon", "note"] as const) if (action[k] !== undefined) patch[k] = str(action[k]);
        if (action.points !== undefined) patch.points = num(action.points);
        if (action.active !== undefined) patch.active = Boolean(action.active);
        const updated = await updatePrize(id, patch as never);
        return { type, ok: Boolean(updated), result: updated ? `تم تحديث الجائزة #${id}` : `لم تُعثر على الجائزة #${id}` };
      }
      case "delete_prize": {
        const id = num(action.id);
        await deletePrize(id);
        return { type, ok: true, result: `تم حذف الجائزة #${id}` };
      }
      case "delete_wallet": {
        const id = num(action.id);
        await deleteWallet(id);
        return { type, ok: true, result: `تم حذف المحفظة #${id}` };
      }
      case "create_channel": {
        const chat = str(action.chat).trim();
        const title = str(action.title).trim() || chat;
        if (!chat) return { type, ok: false, result: "معرّف القناة مطلوب (مثال @chinwichi)" };
        const created = await createChannel({ chat, title, url: str(action.url, `https://t.me/${chat.replace(/^@/, "")}`) });
        return { type, ok: true, result: `أُنشئت القناة «${created.title}» (${created.chat})` };
      }
      case "update_channel": {
        const id = num(action.id);
        const patch: Record<string, unknown> = {};
        for (const k of ["title", "chat", "url"] as const) if (action[k] !== undefined) patch[k] = str(action[k]);
        if (action.active !== undefined) patch.active = Boolean(action.active);
        const updated = await updateChannel(id, patch as never);
        return { type, ok: Boolean(updated), result: updated ? `تم تحديث القناة #${id}` : `لم تُعثر القناة #${id}` };
      }
      case "delete_channel": {
        const id = num(action.id);
        await deleteChannel(id);
        return { type, ok: true, result: `تم حذف القناة #${id}` };
      }
      case "delete_order": {
        const id = num(action.id);
        await deleteOrder(id);
        return { type, ok: true, result: `تم حذف الطلب #${id}` };
      }
      case "reset_stats": {
        await setSetting("stats_reset_at", new Date().toISOString());
        await q("UPDATE products SET sold = 0");
        await log("stats_reset", {}, "warn", "ai");
        return { type, ok: true, result: "تم تصفير الإحصائيات والمبيعات — تبدأ الأرقام من الصفر (الطلبات محفوظة)" };
      }
      case "toggle_product": {
        const id = num(action.id);
        const active = bool(action.active) ?? true;
        const updated = await updateProduct(id, { active } as never);
        return { type, ok: Boolean(updated), result: `المنتج #${id} → ${active ? "مفعّل ✅" : "معطّل ⏸"}` };
      }
      case "delete_coupon": {
        const code = str(action.code).trim().toUpperCase();
        if (!code) return { type, ok: false, result: "الكود مطلوب" };
        await q("DELETE FROM coupons WHERE code = $1", [code]);
        return { type, ok: true, result: `تم حذف الكود ${code}` };
      }
      case "update_category": {
        const raw = str(action.category ?? action.id);
        const id = /^\d+$/.test(raw) ? num(raw) : await resolveCategoryId(raw);
        if (!id) return { type, ok: false, result: `قسم غير موجود: ${raw}` };
        const patch: Record<string, unknown> = {};
        for (const k of ["name", "emoji", "description"] as const) if (action[k] !== undefined) patch[k] = str(action[k]);
        if (action.active !== undefined) patch.active = Boolean(action.active);
        const updated = await updateCategory(id, patch as never);
        return { type, ok: Boolean(updated), result: updated ? `تم تحديث القسم «${updated.name}»` : `لم يُعثر القسم #${id}` };
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

    case "contests": {
      const [prizes, redemptions, pending, top] = await Promise.all([
        listPrizes(false),
        listRedemptions(undefined, 60),
        listRedemptions("pending", 60),
        topReferrers(10),
      ]);
      const stats = await one<{ referrals: string; points: string; pending: string }>(
        `SELECT (SELECT count(*) FROM referrals)::text AS referrals,
                coalesce((SELECT sum(points) FROM users),0)::text AS points,
                (SELECT count(*) FROM redemptions WHERE status = 'pending')::text AS pending`,
      );
      const referrals = await q(
        `SELECT r.id, r.inviter_id, r.invitee_id, r.points, r.created_at,
                iu.first_name AS inviter_name, iu.username AS inviter_username,
                vu.first_name AS invitee_name, vu.username AS invitee_username
         FROM referrals r
         LEFT JOIN users iu ON iu.tg_id = r.inviter_id
         LEFT JOIN users vu ON vu.tg_id = r.invitee_id
         ORDER BY r.created_at DESC LIMIT 200`,
      );
      return NextResponse.json({
        ok: true,
        prizes,
        redemptions,
        pending,
        top,
        referrals,
        stats: {
          referrals: Number(stats?.referrals ?? 0),
          points: Number(stats?.points ?? 0),
          pending: Number(stats?.pending ?? 0),
        },
      });
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

    case "ai/status": {
      const keys = await applyAiKeys();
      return NextResponse.json({
        ok: true,
        providers: aiProviders(),
        suggestions: AI_SUGGESTIONS,
        keys: {
          groq: keys.groq ? `••••${keys.groq.slice(-4)}` : "",
          gemini: keys.gemini ? `••••${keys.gemini.slice(-4)}` : "",
          openrouter: keys.openrouter ? `••••${keys.openrouter.slice(-4)}` : "",
        },
        envKeys: { groq: Boolean(env.groqKey), gemini: Boolean(env.geminiKey), openrouter: Boolean(env.openrouterKey) },
      });
    }

    case "ai/test": {
      await applyAiKeys();
      const [results, free] = await Promise.all([testProviders(), probeFreeProviders()]);
      const okCount =
        Object.values(results).filter((r) => r.ok).length + Object.values(free).filter((r) => r.ok).length;
      const total = Object.keys(results).length + Object.keys(free).length;
      return NextResponse.json({ ok: okCount > 0, results, free, freeList: freeProviders(), okCount, total });
    }

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


    /* ── أكواد الخصم ── */
    case "coupons": {
      const rows = await q("SELECT * FROM coupons ORDER BY created_at DESC LIMIT 200");
      const used = await one<{ c: string; total: string }>(
        "SELECT count(*)::text AS c, coalesce(sum(uses),0)::text AS total FROM coupons",
      );
      return NextResponse.json({ ok: true, rows, stats: { count: Number(used?.c ?? 0), uses: Number(used?.total ?? 0) } });
    }

    /* ── الأسئلة الشائعة ── */
    case "faq":
      return NextResponse.json({ ok: true, rows: await q("SELECT * FROM faq ORDER BY sort ASC, id ASC LIMIT 300") });

    /* ── التقييمات ── */
    case "reviews": {
      const rows = await q("SELECT * FROM reviews ORDER BY created_at DESC LIMIT 200");
      const stat = await one<{ c: string; avg: string }>(
        "SELECT count(*)::text AS c, coalesce(round(avg(rating),2),0)::text AS avg FROM reviews WHERE approved = true",
      );
      return NextResponse.json({ ok: true, rows, stats: { count: Number(stat?.c ?? 0), avg: Number(stat?.avg ?? 0) } });
    }

    /* ── مهام المالك ── */
    case "tasks": {
      const rows = await q("SELECT * FROM tasks ORDER BY done ASC, priority ASC, created_at DESC LIMIT 300");
      return NextResponse.json({ ok: true, rows });
    }


    /* ── الأشخاص النشطون ── */
    case "activity": {
      const [rows, totals] = await Promise.all([
        q(
          `SELECT u.tg_id, u.first_name, u.username, u.avatar_file_id, u.is_blocked, u.messages_count, u.clicks_count,
                  u.last_seen_at, u.created_at,
                  (SELECT count(*)::int FROM orders o WHERE o.user_id = u.tg_id) AS orders_count,
                  (SELECT coalesce(sum(amount),0)::float FROM orders o WHERE o.user_id = u.tg_id AND o.status = 'delivered') AS spent
             FROM users u
            ORDER BY u.last_seen_at DESC
            LIMIT 200`,
        ),
        one<Record<string, string>>(
          `SELECT (SELECT count(*) FROM users)::text AS users,
                  (SELECT count(*) FROM users WHERE last_seen_at > now() - interval '24 hours')::text AS active_day,
                  (SELECT count(*) FROM users WHERE last_seen_at > now() - interval '7 days')::text AS active_week,
                  (SELECT coalesce(sum(messages_count),0) FROM users)::text AS messages,
                  (SELECT coalesce(sum(clicks_count),0) FROM users)::text AS clicks,
                  (SELECT count(*) FROM users WHERE created_at > now() - interval '24 hours')::text AS new_day`,
        ),
      ]);
      return NextResponse.json({ ok: true, rows, totals });
    }

    /* ── البحث الشامل ── */
    case "search": {
      const term = str(url.searchParams.get("q")).trim();
      if (!term) return NextResponse.json({ ok: true, orders: [], users: [], products: [], empty: true });
      const like = `%${term}%`;
      const [orders, users, products] = await Promise.all([
        q(
          `SELECT id, code, product_name, amount, status, user_id, created_at FROM orders
            WHERE code ILIKE $1 OR product_name ILIKE $1 OR user_id::text = $2
            ORDER BY created_at DESC LIMIT 20`,
          [like, term],
        ),
        q(
          `SELECT tg_id, first_name, username, is_blocked, last_seen_at FROM users
            WHERE first_name ILIKE $1 OR username ILIKE $1 OR tg_id::text = $2
            ORDER BY last_seen_at DESC LIMIT 20`,
          [like, term],
        ),
        q(
          `SELECT id, name, price, category_id, active FROM products WHERE name ILIKE $1 ORDER BY id DESC LIMIT 20`,
          [like],
        ),
      ]);
      return NextResponse.json({ ok: true, orders, users, products });
    }

    /* ── الوسائط المرفوعة ── */
    case "media": {
      const rows = await q(
        `SELECT id, kind, file_id, mime, size, created_at FROM media ORDER BY created_at DESC LIMIT 120`,
      ).catch(() => []);
      const stat = await one<{ c: string; size: string }>(
        "SELECT count(*)::text AS c, coalesce(sum(size),0)::text AS size FROM media",
      ).catch(() => null);
      return NextResponse.json({ ok: true, rows, stats: { count: Number(stat?.c ?? 0), size: Number(stat?.size ?? 0) } });
    }

    /* ── مركز الحماية ── */
    case "security": {
      const [settings, events, blocked, counters] = await Promise.all([
        allSettings(),
        q("SELECT * FROM security_events ORDER BY created_at DESC LIMIT 60"),
        q("SELECT tg_id, first_name, username, is_blocked, created_at FROM users WHERE is_blocked = true ORDER BY created_at DESC LIMIT 50"),
        q("SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS c FROM orders WHERE created_at > now() - interval '7 days' GROUP BY 1 ORDER BY 1"),
      ]);
      const keys = [
        "bot_locked",
        "lock_message",
        "rate_limit_per_min",
        "max_orders_per_hour",
        "block_words",
        "auto_block_after",
        "anti_fake_receipt",
        "require_phone_confirm",
        "security_alert_owner",
        "maintenance",
        "require_subscription",
        "gate_bypass",
      ];
      const picked: Record<string, unknown> = {};
      for (const k of keys) picked[k] = settings[k];
      return NextResponse.json({ ok: true, settings: picked, events, blocked, orders: counters });
    }

    /* ── بوابة الاشتراك ── */
    case "gate": {
      const settings = await allSettings();
      return NextResponse.json({
        ok: true,
        channels: await listChannels(false),
        settings: {
          require_subscription: settings.require_subscription,
          gate_bypass: settings.gate_bypass,
          maintenance: settings.maintenance,
          maintenance_text: settings.maintenance_text,
        },
      });
    }

    /* ── التحليلات ── */
    case "analytics": {
      const days = Math.min(90, Math.max(7, num(url.searchParams.get("days"), 30)));
      const [series, top, statuses, kinds, hours, usersSeries, totals] = await Promise.all([
        q(
          `SELECT to_char(d.day,'YYYY-MM-DD') AS day,
                  coalesce(o.c,0)::int AS orders,
                  coalesce(o.revenue,0)::float AS revenue
             FROM generate_series(current_date - ($1::int - 1), current_date, interval '1 day') AS d(day)
             LEFT JOIN (
               SELECT created_at::date AS day, count(*)::int AS c, sum(amount)::float AS revenue
                 FROM orders GROUP BY 1
             ) o ON o.day = d.day
            ORDER BY d.day`,
          [days],
        ),
        q(
          `SELECT product_name, count(*)::int AS orders, sum(amount)::float AS revenue
             FROM orders GROUP BY 1 ORDER BY orders DESC LIMIT 10`,
        ),
        q("SELECT status, count(*)::int AS c FROM orders GROUP BY 1 ORDER BY c DESC"),
        q("SELECT kind, count(*)::int AS c FROM orders GROUP BY 1"),
        q("SELECT extract(hour FROM created_at)::int AS h, count(*)::int AS c FROM orders GROUP BY 1 ORDER BY 1"),
        q(
          `SELECT to_char(d.day,'YYYY-MM-DD') AS day, coalesce(u.c,0)::int AS c
             FROM generate_series(current_date - 13, current_date, interval '1 day') AS d(day)
             LEFT JOIN (SELECT created_at::date AS day, count(*)::int AS c FROM users GROUP BY 1) u ON u.day = d.day
            ORDER BY d.day`,
        ),
        getStats(),
      ]);
      return NextResponse.json({ ok: true, days, series, top, statuses, kinds, hours, usersSeries, totals });
    }

    /* ── صحة النظام ── */
    case "health": {
      const started = Date.now();
      const dbPing = await one<{ now: string }>("SELECT now()::text AS now");
      const counts = await one<Record<string, string>>(
        `SELECT (SELECT count(*) FROM users)::text AS users,
                (SELECT count(*) FROM products)::text AS products,
                (SELECT count(*) FROM orders)::text AS orders,
                (SELECT count(*) FROM security_events)::text AS events`,
      );
      const webhook = await webhookStatus().catch(() => null);
      const media = await one<{ c: string; size: string }>(
        "SELECT count(*)::text AS c, coalesce(sum(size),0)::text AS size FROM media",
      );
      return NextResponse.json({
        ok: true,
        site: env.siteUrl,
        db: { connected: Boolean(dbPing), now: dbPing?.now ?? null, ms: Date.now() - started },
        counts,
        webhook: webhook
          ? { ...webhook, ok: Boolean(webhook.url) && webhook.url === webhook.expected }
          : null,
        ai: aiProviders(),
        emoji: await emojiStats().catch(() => null),
        media: { count: Number(media?.c ?? 0), size: Number(media?.size ?? 0) },
        runtime: { node: process.version, uptime: Math.round(process.uptime()) },
      });
    }

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

  /* ── المسابقات: الجوائز ── */
  if (route === "prizes") {
    const title = str(body.title).trim();
    if (!title) return bad("اسم الجائزة مطلوب");
    const prize = await createPrize({
      title,
      points: num(body.points, 10),
      icon: str(body.icon, "🎁"),
      note: str(body.note),
      sort: num(body.sort, 99),
    });
    return NextResponse.json({ ok: true, prize });
  }

  if (seg[0] === "prizes" && seg[1]) {
    const id = num(seg[1]);
    if (seg[2] === "delete") {
      await deletePrize(id);
      return NextResponse.json({ ok: true });
    }
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = str(body.title);
    if (body.points !== undefined) patch.points = num(body.points);
    if (body.icon !== undefined) patch.icon = str(body.icon);
    if (body.note !== undefined) patch.note = str(body.note);
    if (body.active !== undefined) patch.active = bool(body.active);
    if (body.sort !== undefined) patch.sort = num(body.sort);
    const prize = await updatePrize(id, patch as never);
    return NextResponse.json({ ok: Boolean(prize), prize });
  }

  /* ── المسابقات: تسليم جائزة بعد الموافقة → الحالة delivered + إعلان للجميع ── */
  if (seg[0] === "redemptions" && seg[1] && seg[2] === "deliver") {
    const id = num(seg[1]);
    const result = await announcePrizeDelivery(id);
    if (!result.ok) return bad(result.reason, 400);
    return NextResponse.json({ ok: true, sent: result.sent, failed: result.failed });
  }

  /* ── المسابقات: طلبات الجوائز ── */
  if (seg[0] === "redemptions" && seg[1]) {
    const id = num(seg[1]);
    const action = str(body.action);
    if (action !== "approve" && action !== "reject") return bad("قرار غير معروف");
    const redemption = await decideRedemption(id, action === "approve" ? "approved" : "rejected", str(body.note) || undefined);
    if (!redemption) return bad("الطلب غير موجود", 404);
    const msg =
      action === "approve"
        ? `🎉 <b>تمت الموافقة على جائزتك</b>\n\n🎁 ${redemption.prize_title}\n⭐️ خُصمت: <b>${redemption.points}</b> نقطة\n\n⏱ سيتواصل معك المالك للتسليم قريباً.`
        : `⚠️ <b>تم رفض طلب الجائزة</b>\n\n🎁 ${redemption.prize_title}\n⭐️ أُعيدت <b>${redemption.points}</b> نقطة إلى رصيدك.${str(body.note) ? `\n📝 ${str(body.note)}` : ""}`;
    await sendToUser(Number(redemption.user_id), msg).catch(() => null);
    return NextResponse.json({ ok: true, redemption });
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


  /* ── أكواد الخصم ── */
  if (route === "coupons") {
    const code = str(body.code).trim().toUpperCase();
    if (!code) return bad("اكتب كود الخصم");
    const row = await one(
      `INSERT INTO coupons (code, kind, amount, min_amount, max_uses, active, note, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (code) DO UPDATE SET kind = excluded.kind, amount = excluded.amount,
         min_amount = excluded.min_amount, max_uses = excluded.max_uses, active = excluded.active,
         note = excluded.note, expires_at = excluded.expires_at
       RETURNING *`,
      [
        code,
        str(body.kind, "percent"),
        num(body.amount, 0),
        num(body.min_amount, 0),
        num(body.max_uses, 0),
        bool(body.active) ?? true,
        str(body.note) || null,
        str(body.expires_at) || null,
      ],
    );
    await log("coupon_saved", { code }, "success", "admin");
    return NextResponse.json({ ok: true, coupon: row });
  }
  if (seg[0] === "coupons" && seg[1]) {
    const id = num(seg[1]);
    if (seg[2] === "delete") {
      await q("DELETE FROM coupons WHERE id = $1", [id]);
      return NextResponse.json({ ok: true });
    }
    if (seg[2] === "reset") {
      await q("UPDATE coupons SET uses = 0 WHERE id = $1", [id]);
      return NextResponse.json({ ok: true });
    }
    const row = await one("UPDATE coupons SET active = coalesce($2, active) WHERE id = $1 RETURNING *", [
      id,
      body.active !== undefined ? bool(body.active) : null,
    ]);
    return NextResponse.json({ ok: true, coupon: row });
  }

  /* ── الأسئلة الشائعة ── */
  if (route === "faq") {
    const question = str(body.question).trim();
    const answer = str(body.answer).trim();
    if (!question || !answer) return bad("السؤال والجواب مطلوبان");
    const row = await one(
      `INSERT INTO faq (question, answer, sort, active) VALUES ($1,$2,$3,$4) RETURNING *`,
      [question, answer, num(body.sort, 99), bool(body.active) ?? true],
    );
    return NextResponse.json({ ok: true, item: row });
  }
  if (seg[0] === "faq" && seg[1]) {
    const id = num(seg[1]);
    if (seg[2] === "delete") {
      await q("DELETE FROM faq WHERE id = $1", [id]);
      return NextResponse.json({ ok: true });
    }
    const row = await one(
      `UPDATE faq SET question = coalesce($2, question), answer = coalesce($3, answer),
              sort = coalesce($4, sort), active = coalesce($5, active) WHERE id = $1 RETURNING *`,
      [
        id,
        body.question !== undefined ? str(body.question) : null,
        body.answer !== undefined ? str(body.answer) : null,
        body.sort !== undefined ? num(body.sort) : null,
        body.active !== undefined ? bool(body.active) : null,
      ],
    );
    return NextResponse.json({ ok: true, item: row });
  }

  /* ── التقييمات ── */
  if (route === "reviews") {
    const row = await one(
      `INSERT INTO reviews (user_id, name, rating, body, product_name, approved)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [num(body.user_id) || null, str(body.name, "زبون"), Math.min(5, Math.max(1, num(body.rating, 5))), str(body.body), str(body.product_name), bool(body.approved) ?? true],
    );
    return NextResponse.json({ ok: true, review: row });
  }
  if (seg[0] === "reviews" && seg[1]) {
    const id = num(seg[1]);
    if (seg[2] === "delete") {
      await q("DELETE FROM reviews WHERE id = $1", [id]);
      return NextResponse.json({ ok: true });
    }
    const row = await one("UPDATE reviews SET approved = coalesce($2, approved), rating = coalesce($3, rating) WHERE id = $1 RETURNING *", [
      id,
      body.approved !== undefined ? bool(body.approved) : null,
      body.rating !== undefined ? Math.min(5, Math.max(1, num(body.rating, 5))) : null,
    ]);
    return NextResponse.json({ ok: true, review: row });
  }

  /* ── مهام المالك ── */
  if (route === "tasks") {
    const title = str(body.title).trim();
    if (!title) return bad("اكتب عنوان المهمة");
    const row = await one(
      `INSERT INTO tasks (title, note, priority, due_at) VALUES ($1,$2,$3,$4) RETURNING *`,
      [title, str(body.note), Math.min(3, Math.max(1, num(body.priority, 2))), str(body.due_at) || null],
    );
    return NextResponse.json({ ok: true, task: row });
  }
  if (seg[0] === "tasks" && seg[1]) {
    const id = num(seg[1]);
    if (seg[2] === "delete") {
      await q("DELETE FROM tasks WHERE id = $1", [id]);
      return NextResponse.json({ ok: true });
    }
    if (seg[2] === "toggle") {
      const row = await one("UPDATE tasks SET done = NOT done WHERE id = $1 RETURNING *", [id]);
      return NextResponse.json({ ok: true, task: row });
    }
    const row = await one(
      "UPDATE tasks SET title = coalesce($2,title), note = coalesce($3,note), done = coalesce($4,done), priority = coalesce($5,priority) WHERE id = $1 RETURNING *",
      [id, body.title !== undefined ? str(body.title) : null, body.note !== undefined ? str(body.note) : null, body.done !== undefined ? bool(body.done) : null, body.priority !== undefined ? num(body.priority) : null],
    );
    return NextResponse.json({ ok: true, task: row });
  }

  /* ── مركز الحماية ── */
  if (route === "security/lock" || route === "security/unlock") {
    const locked = route === "security/lock";
    await setSetting("bot_locked", locked);
    await log(locked ? "bot_locked" : "bot_unlocked", { by: "admin" }, locked ? "warn" : "success", "security");
    await q("INSERT INTO security_events (kind, detail, severity) VALUES ($1,$2,$3)", [
      locked ? "bot_locked" : "bot_unlocked",
      "من لوحة التحكم",
      locked ? "warn" : "info",
    ]);
    return NextResponse.json({ ok: true, locked });
  }
  if (route === "security/save") {
    const allowed = [
      "rate_limit_per_min",
      "max_orders_per_hour",
      "auto_block_after",
      "anti_fake_receipt",
      "require_phone_confirm",
      "security_alert_owner",
      "lock_message",
      "gate_bypass",
      "maintenance",
      "require_subscription",
      "maintenance_text",
    ];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] === undefined) continue;
      if (key === "block_words") patch[key] = body[key];
      else if (["anti_fake_receipt", "require_phone_confirm", "security_alert_owner", "maintenance", "require_subscription"].includes(key))
        patch[key] = bool(body[key]) ?? false;
      else if (["rate_limit_per_min", "max_orders_per_hour", "auto_block_after"].includes(key)) patch[key] = num(body[key], 0);
      else patch[key] = str(body[key]);
    }
    if (Array.isArray(body.block_words)) {
      patch.block_words = (body.block_words as unknown[]).map((w) => str(w).trim()).filter(Boolean).slice(0, 200);
    }
    await saveSettings(patch);
    return NextResponse.json({ ok: true, saved: Object.keys(patch) });
  }
  if (route === "security/clear") {
    await q("DELETE FROM security_events");
    return NextResponse.json({ ok: true });
  }
  if (route === "security/unblock") {
    const userId = num(body.user_id);
    await q("UPDATE users SET is_blocked = false WHERE tg_id = $1", [userId]);
    await q("INSERT INTO security_events (kind, user_id, detail, severity) VALUES ('unblock',$1,'فك حظر من لوحة التحكم','info')", [
      userId,
    ]);
    return NextResponse.json({ ok: true });
  }

  /* ── الذكاء الاصطناعي ── */
  if (route === "ai/chat") {
    await applyAiKeys();
    const text = str(body.text).trim();
    const history = Array.isArray(body.history) ? (body.history as AiMessage[]) : [];
    const rawImage = str(body.image);
    let image: { mime: string; data: Buffer } | null = null;
    if (rawImage.startsWith("data:")) {
      const match = /^data:([^;]+);base64,(.+)$/s.exec(rawImage);
      if (!match) return bad("صورة غير صالحة");
      const buf = Buffer.from(match[2], "base64");
      if (buf.byteLength > 6 * 1024 * 1024) return bad("الصورة كبيرة (الحد 6MB)");
      image = { mime: match[1], data: buf };
    }
    if (!text && !image) return bad("اكتب طلبك أو أرفق صورة");
    await q("INSERT INTO ai_messages (session, role, content) VALUES ('main','user',$1)", [
      image ? `${text || "📷 صورة مرفقة"} [صورة]` : text,
    ]);
    try {
      const context = await aiContext();
      const plan = await assistantPlan(
        [...history.slice(-8).map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: String(m.content).slice(0, 2000) })), { role: "user", content: text || "حلّل هذه الصورة" }],
        context,
        image,
      );
      // تنفيذ فوري حقيقي: لا "قبول وهمي" — كل عملية تُنفَّذ الآن وتُعاد نتيجتها
      const results: { type: string; ok: boolean; result: string }[] = [];
      for (const action of (plan.actions ?? []).slice(0, 12)) {
        results.push(await executeAction(action as Record<string, unknown>));
      }
      if (results.length) await log("ai_actions", { results }, "success", "ai");
      const summary = results
        .map((r) => `${r.ok ? "✅" : "⚠️"} ${ACTION_LABELS[r.type] ?? r.type}: ${r.result}`)
        .join("\n");
      const reply = summary ? `${plan.reply}\n\n<b>النتيجة الفعلية:</b>\n${summary}` : plan.reply;
      await q("INSERT INTO ai_messages (session, role, content, actions, provider) VALUES ('main','assistant',$1,$2::jsonb,$3)", [
        reply,
        JSON.stringify(plan.actions ?? []),
        plan.provider,
      ]);
      return NextResponse.json({ ok: true, ...plan, reply, results });
    } catch (err) {
      // ممنوع أن يرفض: لو فشلت كل المزوّدات ننفّذ محلياً بدل إرجاع خطأ
      const fallback = localBrain(text || "حلّل هذه الصورة", await aiContext().catch(() => ""));
      await q(
        "INSERT INTO ai_messages (session, role, content, actions, provider) VALUES ('main','assistant',$1,$2::jsonb,$3)",
        [fallback.reply, JSON.stringify(fallback.actions ?? []), "local"],
      ).catch(() => null);
      return NextResponse.json({ ok: true, ...fallback, provider: "local", note: String(err).slice(0, 200) });
    }
  }

  if (route === "ai/keys") {
    const patch: Record<string, unknown> = {};
    if (body.groq !== undefined) patch.groq_key = str(body.groq).trim();
    if (body.gemini !== undefined) patch.gemini_key = str(body.gemini).trim();
    if (body.openrouter !== undefined) patch.openrouter_key = str(body.openrouter).trim();
    await saveSettings(patch);
    await applyAiKeys();
    const results = await testProviders();
    return NextResponse.json({ ok: true, results, providers: aiProviders() });
  }

  if (route === "ai/local") {
    const text = str(body.text).trim();
    if (!text) return bad("اكتب طلبك أولاً");
    const plan = localBrain(text, await aiContext());
    return NextResponse.json({ ok: true, ...plan });
  }

  if (route === "ai/apply") {
    const actions = Array.isArray(body.actions) ? (body.actions as Record<string, unknown>[]) : [];
    const results = [];
    for (const action of actions.slice(0, 12)) results.push(await executeAction(action));
    await log("ai_actions", { results }, "success", "ai");
    return NextResponse.json({ ok: true, results });
  }

  if (route === "ai/vision") {
    await applyAiKeys();
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
  if (seg[0] === "prizes" && seg[1]) {
    await deletePrize(num(seg[1]));
    return NextResponse.json({ ok: true });
  }
  return bad("مسار غير معروف", 404);
}

export async function PUT(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  return POST(req, ctx);
}

/* إبقاء أدوات التنسيق مستخدمة (تُستخدم في الردود النصية) */
void shortDate;
