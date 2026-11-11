"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { sendMessage } from "@/lib/telegram";
import {
  addPoints,
  balanceOf,
  decideRequest as decideRewardRequest,
  ensureRewards,
  getJoinGroup,
  savePointsConfig,
  saveRewards,
  setBalance,
  setJoinGroup,
  type Reward,
} from "@/lib/rewards";

function str(form: FormData, key: string, fallback = ""): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : fallback;
}

function int(form: FormData, key: string, fallback: number): number {
  const parsed = Number(str(form, key));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function go(path: string, kind: "ok" | "err", message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

async function guard(): Promise<void> {
  if (!(await isAuthenticated())) redirect("/admin/login");
}

/* ───────────────────────────── النقاط والجوائز ───────────────────────────── */

export async function savePointsConfigForm(form: FormData): Promise<void> {
  await guard();
  await savePointsConfig({
    enabled: str(form, "enabled") === "on",
    perJoin: int(form, "perJoin", 2),
    perActivated: int(form, "perActivated", 1),
    dailyMin: int(form, "dailyMin", 1),
    dailyMax: int(form, "dailyMax", 3),
    shopIntro: str(form, "shopIntro"),
  });
  revalidatePath("/admin/rewards");
  go("/admin/rewards", "ok", "✅ إعدادات النقاط تسجلت");
}

export async function saveRewardForm(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id");
  const list = await ensureRewards();
  const payload: Reward = {
    id: id || `r_${Date.now().toString(36)}`,
    emoji: str(form, "emoji", "🎁") || "🎁",
    title: str(form, "title") || "جائزة",
    desc: str(form, "desc"),
    cost: int(form, "cost", 10),
    stock: str(form, "stock") === "" ? null : int(form, "stock", 0),
    active: str(form, "active") === "on",
    order: Number(str(form, "order")) || list.length + 1,
    delivery: str(form, "delivery"),
  };
  const next = list.some((r) => r.id === payload.id)
    ? list.map((r) => (r.id === payload.id ? payload : r))
    : [...list, payload];
  await saveRewards(next);
  revalidatePath("/admin/rewards");
  go("/admin/rewards", "ok", `✅ الجائزة «${payload.title}» تسجلت`);
}

export async function deleteRewardForm(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id");
  const list = await ensureRewards();
  await saveRewards(list.filter((r) => r.id !== id));
  revalidatePath("/admin/rewards");
  go("/admin/rewards", "ok", "🗑 تحيدت الجائزة");
}

export async function setPointsForm(form: FormData): Promise<void> {
  await guard();
  const userId = str(form, "userId");
  const value = Number(str(form, "points"));
  if (!/^\d+$/.test(userId)) go("/admin/rewards", "err", "آي دي المستخدم ماشي صحيح");
  if (!Number.isFinite(value) || value < 0) go("/admin/rewards", "err", "عدد النقاط ماشي صحيح");
  const before = await balanceOf(userId);
  await setBalance(userId, value);
  revalidatePath("/admin/rewards");
  go("/admin/rewards", "ok", `✅ نقاط ${userId}: ${before} → ${Math.floor(value)}`);
}

export async function decideRewardForm(form: FormData): Promise<void> {
  await guard();
  const id = str(form, "id");
  const status = str(form, "status") === "approved" ? "approved" : "rejected";
  const req = await decideRewardRequest(id, status);
  if (!req) go("/admin/rewards", "err", "الطلب ماشي موجود");

  const userMsg =
    status === "approved"
      ? `🎉 <b>مبروك!</b>\n\n${req.emoji} <b>${req.rewardTitle}</b> تمت الموافقة عليها.\nالمالك راح يتواصل معك للتسليم.`
      : `😕 طلبك على ${req.emoji} <b>${req.rewardTitle}</b> ما تمّش.\nتم إرجاع <b>${req.cost}</b> نقطة لرصيدك.`;
  await sendMessage(req.userId, userMsg).catch(() => undefined);
  revalidatePath("/admin/rewards");
  go(
    "/admin/rewards",
    "ok",
    status === "approved" ? `✅ تسلّمت الجائزة لـ ${req.userId}` : `↩️ رفضت الطلب ورجعت ${req.cost} نقطة`,
  );
}

export async function setJoinGroupForm(form: FormData): Promise<void> {
  await guard();
  const chatId = str(form, "chatId");
  if (!chatId) go("/admin/rewards", "err", "حط آي دي المجموعة (مثال: -1001234567890)");
  const target = await setJoinGroup(chatId, str(form, "title"));
  revalidatePath("/admin/rewards");
  go("/admin/rewards", "ok", `✅ المجموعة تربطت: ${target.title} (${target.chatId})`);
}

export async function fetchJoinGroupAction(): Promise<void> {
  await guard();
  const target = await getJoinGroup();
  go("/admin/rewards", target ? "ok" : "err", target ? `المجموعة الحالية: ${target.title}` : "ما فيه مجموعة مربوطة");
}

export async function grantPointsForm(form: FormData): Promise<void> {
  await guard();
  const userId = str(form, "userId");
  const amount = Number(str(form, "amount"));
  if (!/^\d+$/.test(userId) || !Number.isFinite(amount)) go("/admin/rewards", "err", "بيانات ناقصة");
  const next = await addPoints(userId, amount);
  revalidatePath("/admin/rewards");
  go("/admin/rewards", "ok", `✅ ${amount > 0 ? "+" : ""}${amount} نقطة لـ ${userId} — الرصيد: ${next}`);
}
