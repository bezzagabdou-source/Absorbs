"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSession,
  destroySession,
  hasAdminPassword,
  isAuthenticated,
  setAdminPassword,
  verifyPassword,
} from "@/lib/auth";
import {
  addAccounts,
  clearAccounts,
  createContest,
  deleteContest,
  getContest,
  removeAccountAt,
  updateContest,
} from "@/lib/contests";
import { ALLOWED_UPDATES, BOT_COMMANDS, resetAutoSetupCache } from "@/lib/botSetup";
import { normalizeImageUrl, readUploadedImage } from "@/lib/images";
import { resetStats } from "@/lib/stats";
import { ensureGroupContest, linkGroup, syncGroupInfo, unlinkGroup } from "@/lib/groups";
import { ensureWebhookSecret, getSettings, saveSettings } from "@/lib/settings";
import { sendMessage, tgCall } from "@/lib/telegram";
import type { ContestStatus } from "@/lib/types";
import { listRecentUsers } from "@/lib/users";

function str(form: FormData, key: string, fallback = ""): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : fallback;
}

function int(form: FormData, key: string, fallback: number): number {
  const parsed = Number(str(form, key));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function go(path: string, kind: "ok" | "err", message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

async function guard(): Promise<void> {
  if (!(await isAuthenticated())) redirect("/admin/login");
}

/* ────────────────────────────── المصادقة ────────────────────────────── */

export async function loginAction(form: FormData): Promise<void> {
  const password = str(form, "password");
  const confirm = str(form, "confirm");
  const firstTime = !(await hasAdminPassword());

  if (firstTime) {
    if (password.length < 6) go("/admin/login", "err", "كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    if (password !== confirm) go("/admin/login", "err", "كلمتا المرور غير متطابقتين");
    await setAdminPassword(password);
    await createSession();
    redirect("/admin");
  }

  if (!(await verifyPassword(password))) go("/admin/login", "err", "كلمة المرور غير صحيحة");
  await createSession();
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}

export async function changePasswordAction(form: FormData): Promise<void> {
  await guard();
  const current = str(form, "current");
  const next = str(form, "next");
  const confirm = str(form, "confirm");
  if (!(await verifyPassword(current))) go("/admin/settings", "err", "كلمة المرور الحالية غير صحيحة");
  if (next.length < 6) go("/admin/settings", "err", "كلمة المرور الجديدة قصيرة جداً");
  if (next !== confirm) go("/admin/settings", "err", "تأكيد كلمة المرور غير مطابق");
  await setAdminPassword(next);
  go("/admin/settings", "ok", "تم تحديث كلمة مرور اللوحة ✅");
}

/* ────────────────────────────── الإعدادات ────────────────────────────── */

export async function saveSettingsAction(form: FormData): Promise<void> {
  await guard();
  const before = await getSettings();
  // النموذج الكامل يرسل settingsForm=1 — بهذا نفرّق بين «غير محدد» و«مُلغى»
  const fullForm = str(form, "settingsForm") === "1";
  const flag = (name: string, fallback: boolean) => (fullForm ? str(form, name) === "on" : fallback);
  const tokenInput = str(form, "botToken");
  const clearToken = str(form, "clearToken") === "on";
  const botToken = clearToken ? "" : tokenInput || before.botToken;
  const tokenChanged = botToken !== before.botToken;

  await saveSettings({
    botToken,
    botUsername: tokenChanged ? "" : before.botUsername,
    botId: tokenChanged ? null : before.botId,
    channelChat: str(form, "channelChat"),
    channelUrl: str(form, "channelUrl"),
    supportUsername: str(form, "supportUsername").replace(/^@/, ""),
    ownerUsername: str(form, "ownerUsername").replace(/^@/, "") || before.ownerUsername,
    logChatId: str(form, "logChatId"),
    adminIds: str(form, "adminIds")
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean),
    requireJoin: flag("requireJoin", before.requireJoin),
    autoGrant: flag("autoGrant", before.autoGrant),
    autoApproveJoins: flag("autoApproveJoins", before.autoApproveJoins),
    groupTarget: int(form, "groupTarget", before.groupTarget),
    groupChat: str(form, "groupChat") || before.groupChat,
    groupUrl: str(form, "groupUrl"),
    welcomeText: str(form, "welcomeText") || before.welcomeText,
    rulesText: str(form, "rulesText") || before.rulesText,
  });
  resetAutoSetupCache();

  revalidatePath("/admin/settings");
  revalidatePath("/");
  go("/admin/settings", "ok", "تم حفظ الإعدادات ✅");
}

export async function checkBotAction(): Promise<void> {
  await guard();
  const res = await tgCall<{ id: number; username?: string; first_name?: string }>("getMe");
  if (!res.ok || !res.result) {
    go("/admin/settings", "err", `تعذّر الاتصال بالبوت: ${res.description || "تحقق من التوكن"}`);
  }
  await saveSettings({ botUsername: res.result.username || "", botId: res.result.id });
  go(
    "/admin/settings",
    "ok",
    `البوت متصل: @${res.result.username || "بدون يوزر"} (${res.result.first_name || res.result.id})`,
  );
}

export async function connectWebhookAction(): Promise<void> {
  await guard();
  const settings = await getSettings();
  if (!settings.botToken) go("/admin/settings", "err", "أضف توكن البوت أولاً");

  const secret = await ensureWebhookSecret();
  const headerBag = await headers();
  const host = headerBag.get("x-forwarded-host") || headerBag.get("host") || "";
  const proto = headerBag.get("x-forwarded-proto") || "https";
  if (!host) go("/admin/settings", "err", "تعذّر معرفة رابط الموقع");
  const url = `${proto}://${host}/api/telegram/webhook`;

  const res = await tgCall("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ALLOWED_UPDATES,
    drop_pending_updates: false,
  });
  if (!res.ok) go("/admin/settings", "err", `فشل ربط الويب هوك: ${res.description}`);

  const me = await tgCall<{ username?: string; id: number }>("getMe");
  if (me.ok && me.result) await saveSettings({ botUsername: me.result.username || "", botId: me.result.id });

  revalidatePath("/admin/settings");
  go("/admin/settings", "ok", `تم ربط البوت بالموقع ✅ — ${url}`);
}

export async function disconnectWebhookAction(): Promise<void> {
  await guard();
  const res = await tgCall("deleteWebhook", { drop_pending_updates: false });
  if (!res.ok) go("/admin/settings", "err", `فشل فصل الويب هوك: ${res.description}`);
  go("/admin/settings", "ok", "تم فصل الويب هوك (البوت توقف عن استقبال الرسائل)");
}

export async function setCommandsAction(): Promise<void> {
  await guard();
  const res = await tgCall("setMyCommands", { commands: BOT_COMMANDS });
  if (!res.ok) go("/admin/settings", "err", `فشل ضبط الأوامر: ${res.description}`);
  go("/admin/settings", "ok", "تم ضبط أوامر البوت ✅");
}

/* ────────────────────────────── المسابقات ────────────────────────────── */

export async function createContestAction(form: FormData): Promise<void> {
  await guard();
  const title = str(form, "title");
  if (!title) go("/admin/contests", "err", "اكتب عنوان المسابقة");
  const status = (str(form, "status", "draft") as ContestStatus) || "draft";
  const upload = await readUploadedImage(form);
  if (upload.error) go("/admin/contests", "err", upload.error);
  const imageUrl = upload.dataUrl || normalizeImageUrl(str(form, "imageUrl")) || "";
  const contest = await createContest({
    title,
    description: str(form, "description"),
    target: int(form, "target", 200),
    prize: str(form, "prize"),
    winners: int(form, "winners", 1),
    status,
    mode: str(form, "mode") === "group" ? "group" : "referral",
    imageUrl,
  });
  revalidatePath("/");
  revalidatePath("/admin/contests");
  redirect(`/admin/contests/${contest.id}?ok=${encodeURIComponent("تم إنشاء المسابقة ✅ أضف الحسابات ثم فعّلها")}`);
}

export async function updateContestAction(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id");
  if (!id) go("/admin/contests", "err", "مسابقة غير معروفة");
  const before = await getContest(id);
  const upload = await readUploadedImage(form);
  if (upload.error) go(`/admin/contests/${id}`, "err", upload.error);
  const manual = normalizeImageUrl(str(form, "imageUrl"));
  const removeImage = str(form, "removeImage") === "on";
  const imageUrl = upload.dataUrl || manual || (removeImage ? "" : (before?.imageUrl ?? ""));
  await updateContest(id, {
    title: str(form, "title") || "مسابقة",
    description: str(form, "description"),
    target: int(form, "target", 200),
    prize: str(form, "prize"),
    winners: int(form, "winners", 1),
    status: (str(form, "status", "draft") as ContestStatus) || "draft",
    mode: str(form, "mode") === "group" ? "group" : "referral",
    imageUrl,
  });
  revalidatePath(`/admin/contests/${id}`);
  revalidatePath("/");
  go(`/admin/contests/${id}`, "ok", "تم تحديث المسابقة ✅");
}

export async function setContestStatusAction(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id");
  const status = str(form, "status") as ContestStatus;
  const contest = await getContest(id);
  if (!contest) go("/admin/contests", "err", "المسابقة غير موجودة");
  await updateContest(id, { status });
  revalidatePath(`/admin/contests/${id}`);
  revalidatePath("/");
  go(`/admin/contests/${id}`, "ok", `تم تغيير الحالة إلى: ${status}`);
}

export async function deleteContestAction(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id");
  await deleteContest(id);
  revalidatePath("/admin/contests");
  revalidatePath("/");
  redirect("/admin/contests?ok=" + encodeURIComponent("تم حذف المسابقة"));
}

/* ────────────────────────────── المخزون ────────────────────────────── */

export async function addAccountsAction(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id");
  const raw = str(form, "accounts");
  const added = await addAccounts(id, raw);
  revalidatePath(`/admin/contests/${id}`);
  if (!added) {
    go(`/admin/contests/${id}`, "err", "لم يتم إضافة أي حساب — استخدم صيغة email:password في كل سطر");
  }
  go(`/admin/contests/${id}`, "ok", `تمت إضافة ${added} حساب للمخزون ✅`);
}

export async function removeAccountAction(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id");
  const index = Number(str(form, "index"));
  const removed = await removeAccountAt(id, Number.isFinite(index) ? index : -1);
  revalidatePath(`/admin/contests/${id}`);
  go(
    `/admin/contests/${id}`,
    removed ? "ok" : "err",
    removed ? "تم حذف الحساب من المخزون" : "لم يتم العثور على الحساب",
  );
}

export async function clearAccountsAction(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id");
  await clearAccounts(id);
  revalidatePath(`/admin/contests/${id}`);
  go(`/admin/contests/${id}`, "ok", "تم تفريغ مخزون الحسابات");
}

/* ─────────────────────── المجموعة / أسرع ضيف ─────────────────────── */

export async function syncGroupAction(): Promise<void> {
  await guard();
  const result = await syncGroupInfo();
  if (!result.ok) go("/admin/group", "err", `تعذّر قراءة المجموعة: ${result.error}`);
  revalidatePath("/admin/group");
  go("/admin/group", "ok", `تم تحديث بيانات المجموعة: ${result.title} ✅`);
}

export async function linkGroupAction(form: FormData): Promise<void> {
  await guard();
  const raw = str(form, "groupChat");
  if (!raw) go("/admin/group", "err", "اكتب آي دي المجموعة أو @username");
  const res = await tgCall<{ id: number; title?: string; username?: string }>("getChat", {
    chat_id: raw,
  });
  if (!res.ok || !res.result) {
    go("/admin/group", "err", `تعذّر ربط المجموعة: ${res.description || "تحقق أن البوت أدمن"}`);
  }
  await linkGroup({
    id: res.result.id,
    title: res.result.title,
    username: res.result.username,
  });
  const contest = await ensureGroupContest();
  revalidatePath("/admin/group");
  go(
    "/admin/group",
    "ok",
    `تم ربط المجموعة ${res.result.title || res.result.id} ✅ — مسابقة: ${contest.title} (${contest.target} عضو)`,
  );
}

export async function unlinkGroupAction(): Promise<void> {
  await guard();
  await unlinkGroup();
  revalidatePath("/admin/group");
  go("/admin/group", "ok", "تم فصل المجموعة — نظام أسرع ضيف متوقف حتى تربط واحدة أخرى.");
}

export async function createGroupContestAction(form: FormData): Promise<void> {
  await guard();
  const target = int(form, "target", 20);
  const contest = await ensureGroupContest(target);
  revalidatePath("/admin/group");
  revalidatePath("/admin/contests");
  go("/admin/group", "ok", `مسابقة أسرع ضيف جاهزة: ${contest.title} — ${contest.target} عضو ✅`);
}

/* ────────────────────────────── الإحصائيات ────────────────────────────── */

export async function resetStatsAction(form: FormData): Promise<void> {
  await guard();
  const days = int(form, "days", 30);
  await resetStats(days);
  revalidatePath("/admin/stats");
  revalidatePath("/admin");
  go("/admin/stats", "ok", "تم تصفير الإحصائيات (الزيارات والنشاط) ✅");
}

/* ────────────────────────────── البث ────────────────────────────── */

export async function broadcastAction(form: FormData): Promise<void> {
  await guard();
  const text = str(form, "text");
  if (!text) go("/admin/broadcast", "err", "اكتب نص الرسالة");
  const limit = Math.min(250, int(form, "limit", 100));
  const users = await listRecentUsers(limit);
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i += 15) {
    const chunk = users.slice(i, i + 15);
    const results = await Promise.all(chunk.map((u) => sendMessage(u.id, text)));
    results.forEach((r) => (r.ok ? sent++ : failed++));
  }

  go("/admin/broadcast", "ok", `تم الإرسال: ${sent} ✅ — فشل: ${failed} ⚠️`);
}
