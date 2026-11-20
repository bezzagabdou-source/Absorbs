import { eq, not } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { adminSessions, categories, products, settings, visitorStats } from "@/db/schema";
import { authenticated, hashPassword, hashToken, SESSION_COOKIE } from "@/lib/server/auth";
import { ensureStore, getAdminData, todayInAlgeria } from "@/lib/server/store";
import type { Availability } from "@/lib/types";

const fail = (message: string, status = 400) => Response.json({ error: message }, { status });
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

export async function GET(request: NextRequest) {
  if (!await authenticated(request)) return fail("يرجى تسجيل الدخول أولاً.", 401);
  try {
    return Response.json(await getAdminData(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin data error", error);
    return fail("تعذر تحميل لوحة التحكم.", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!await authenticated(request)) return fail("يرجى تسجيل الدخول أولاً.", 401);
  try {
    await ensureStore();
    const body = await request.json();
    if (body.action === "saveProduct") {
      const product = body.product || {};
      const name = clean(product.name, 200);
      const categoryId = Number(product.categoryId);
      const price = Number(product.price);
      const status = product.status as Availability;
      const id = Number(product.id);
      if (!name || !Number.isInteger(categoryId) || !Number.isFinite(price) || price < 0 || price > 99999999 || !["available", "unavailable", "limited"].includes(status)) {
        return fail("يرجى إدخال اسم وقسم وسعر وحالة صحيحة.");
      }
      const [category] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
      if (!category) return fail("القسم المحدد غير موجود.");
      const requestedImage = clean(product.image, 1000);
      const image = requestedImage && (/^\/images\//.test(requestedImage) || /^https:\/\//i.test(requestedImage)) ? requestedImage : category.image;
      const values = { name, categoryId, price: price.toFixed(2), status, image };
      if (id && Number.isInteger(id)) {
        await db.update(products).set(values).where(eq(products.id, id));
      } else {
        await db.insert(products).values({ ...values, sortOrder: 100 });
      }
    } else if (body.action === "deleteProduct") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return fail("المنتج غير صالح.");
      await db.delete(products).where(eq(products.id, id));
    } else if (body.action === "addCategory") {
      const name = clean(body.name, 120);
      if (!name) return fail("أدخل اسم القسم.");
      const requestedImage = clean(body.image, 1000);
      const image = requestedImage && (/^\/images\//.test(requestedImage) || /^https:\/\//i.test(requestedImage)) ? requestedImage : "/images/herbs.png";
      await db.insert(categories).values({ name, image, sortOrder: 100 });
    } else if (body.action === "saveSettings") {
      const storeName = clean(body.settings?.storeName, 100);
      const whatsapp = clean(body.settings?.whatsapp, 30);
      const deliveryMessage = clean(body.settings?.deliveryMessage, 150);
      const currency = clean(body.settings?.currency, 12);
      const password = typeof body.settings?.password === "string" ? body.settings.password : "";
      if (!storeName || !deliveryMessage || !currency || !/^[+\d\s()-]{7,30}$/.test(whatsapp)) return fail("يرجى إكمال إعدادات المتجر بشكل صحيح.");
      if (password && (password.length < 8 || password.length > 200)) return fail("يجب أن تتكون كلمة المرور الجديدة من 8 أحرف على الأقل.");
      await db.update(settings).set({ storeName, whatsapp, deliveryMessage, currency, ...(password ? { passwordHash: hashPassword(password) } : {}) }).where(eq(settings.id, 1));
      if (password) {
        const token = request.cookies.get(SESSION_COOKIE)?.value;
        if (token) await db.delete(adminSessions).where(not(eq(adminSessions.tokenHash, hashToken(token))));
      }
    } else if (body.action === "setVisits") {
      const total = Number(body.totalVisits);
      const today = Number(body.todayVisits);
      if (!Number.isInteger(total) || !Number.isInteger(today) || total < 0 || today < 0 || total > 2147483647 || today > total) return fail("أدخل أرقاماً صحيحة؛ زيارات اليوم لا يمكن أن تتجاوز الإجمالي.");
      await db.update(visitorStats).set({ totalVisits: total, todayVisits: today, lastVisitDate: todayInAlgeria() }).where(eq(visitorStats.id, 1));
    } else {
      return fail("العملية غير معروفة.");
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Admin action error", error);
    return fail("تعذر حفظ التغييرات، حاول مرة أخرى.", 500);
  }
}
