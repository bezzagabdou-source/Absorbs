import crypto from "node:crypto";
import { broadcastStatus, createBroadcast, latestBroadcast, processBroadcast, retryFailedBroadcast } from "@/lib/broadcastJobs";
import { NextResponse, type NextRequest } from "next/server";
import { createContest, deleteContest, getContest, getLeaderboard, listContests, updateContest } from "@/lib/contests";
import { panelStats } from "@/lib/agent";
import {
  addPoints, balanceOf, bannedIds, decideRequest, ensureRewards, ensureSections, getJoinGroup,
  getPointsConfig, invitesOf, isBanned, listRequests, pushAdminLog, readAdminLog, savePointsConfig,
  saveRewards, setBalance, setBanned, setJoinGroup, topBalances, type PointsConfig, type Reward, type SectionId,
} from "@/lib/rewards";
import { getSettings, normalizeChannels, saveSettings } from "@/lib/settings";
import { getStats } from "@/lib/stats";
import { storageInfo } from "@/lib/store";
import { sendMessage } from "@/lib/telegram";
import type { Contest, Settings } from "@/lib/types";
import { getUser, listAllUsers, usersCount } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const expected = Buffer.from(process.env.PANEL_PUBLIC_KEY || "");
  const provided = Buffer.from(req.headers.get("x-panel-key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""));
  return expected.length > 0 && expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}
const reply = (data: Record<string, unknown>, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
const fail = (error: string, status = 400) => reply({ ok: false, error }, status);
class InputError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const invalid = (message: string): never => { throw new InputError(message); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function onlyKeys(input: Record<string, unknown>, keys: string[]) {
  if (Object.keys(input).some((key) => !keys.includes(key))) invalid("يوجد حقل غير مسموح في الطلب");
}
function str(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string") return invalid(`${label} غير صالح`);
  const out = value.trim();
  if (out.length > max || (required && !out)) return invalid(`${label} غير صالح`);
  return out;
}
function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) return invalid(`${label} غير صالح`);
  return value;
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") return invalid(`${label} غير صالح`);
  return value;
}
function resourceId(value: unknown, label = "المعرّف"): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) return invalid(`${label} غير صالح`);
  return value;
}
function userId(value: unknown): string {
  if (typeof value !== "string" || !/^\d{1,20}$/.test(value)) return invalid("معرّف المستخدم غير صالح");
  return value;
}
function cleanContest(c: Contest) {
  return { id: c.id, title: c.title, description: c.description, target: c.target, prize: c.prize, status: c.status, winners: c.winners, mode: c.mode || "referral", createdAt: c.createdAt, hasImage: Boolean(c.imageUrl) };
}
function cleanReward(r: Reward) {
  return { id: r.id, emoji: r.emoji, title: r.title, desc: r.desc, cost: r.cost, stock: r.stock, active: r.active, order: r.order, delivery: r.delivery, section: r.section || "accounts", hasImage: Boolean(r.image) };
}
function cleanSettings(s: Settings) {
  return { ownerUsername: s.ownerUsername, supportUsername: s.supportUsername, welcomeText: s.welcomeText,
    rulesText: s.rulesText, requiredChannels: s.requiredChannels, requireJoin: s.requireJoin,
    aiEnabled: s.aiEnabled, maintenanceMode: Boolean(s.maintenanceMode), autoApproveJoins: s.autoApproveJoins,
    groupChat: s.groupChat, groupTitle: s.groupTitle, groupUrl: s.groupUrl, groupTarget: s.groupTarget };
}
async function log(op: string, detail: string) {
  // A logging outage cannot turn a completed operation into a reported failure/retry.
  await pushAdminLog({ at: Date.now(), op, detail: detail.slice(0, 200), via: "panel" }).catch(() => undefined);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return fail("unauthorized", 401);
  const query = new URL(request.url).searchParams;
  const view = query.get("view") || "catalog";
  try {
    if (view === "broadcast") {
      const id = query.get("id");
      return reply({ ok: true, broadcast: id ? await broadcastStatus(id) : await latestBroadcast() });
    }
    if (view === "catalog") {
      const [rewards, contests, sections] = await Promise.all([ensureRewards(), listContests(), ensureSections()]);
      return reply({ ok: true, rewards: rewards.map(cleanReward), contests: contests.map(cleanContest), sections });
    }
    if (view === "overview") {
      const [settings, points, group, stats] = await Promise.all([getSettings(), getPointsConfig(), getJoinGroup(), panelStats()]);
      return reply({ ok: true, stats, points, group, storage: storageInfo(), settings: cleanSettings(settings) });
    }
    if (view === "stats") return reply({ ok: true, stats: await panelStats(), activity: await getStats(7), top: await topBalances(20), storage: storageInfo() });
    if (view === "requests") return reply({ ok: true, requests: await listRequests(100) });
    if (view === "log") return reply({ ok: true, log: await readAdminLog(100) });
    if (view === "users") {
      // 👥 جميع المستخدمين منذ إنشاء البوت (ما غير 100 الأخيرين) — مع بحث/حد اختياري
      const limit = Math.max(1, Math.min(5000, Number(query.get("limit")) || 2000));
      const q = (query.get("q") || "").trim().toLowerCase();
      const [all, banned, totals] = await Promise.all([listAllUsers(limit), bannedIds(), topBalances(Math.max(400, limit))]);
      const bannedSet = new Set(banned);
      const balances = new Map(totals.map((r) => [String(r.userId), Number(r.points) || 0]));
      const pool = q ? all.filter((u) => `${u.id} ${u.firstName || ""} ${u.username || ""}`.toLowerCase().includes(q)) : all;
      const picked = pool.slice(0, limit);
      // 🎯 القوائم الصغيرة: الرصيد الحقيقي بالضبط؛ الكبيرة: خريطة النقاط (سؤال واحد) بلا timeout
      const exact = picked.length <= 400;
      const result = await Promise.all(
        picked.map(async (u) => ({
          ...u,
          points: Math.max(0, exact ? await balanceOf(u.id) : balances.get(u.id) || 0),
          banned: bannedSet.has(u.id),
        })),
      );
      return reply({ ok: true, users: result, limit: picked.length, total: await usersCount() });
    }
    if (view === "user") {
      const id = userId(query.get("id"));
      const user = await getUser(id);
      if (!user) return fail("المستخدم غير موجود", 404);
      const [points, banned, referrals] = await Promise.all([balanceOf(id), isBanned(id), invitesOf(id)]);
      return reply({ ok: true, user: { ...user, points, banned, referrals } });
    }
    if (view === "leaderboard") {
      const id = resourceId(query.get("id"));
      const contest = await getContest(id);
      if (!contest) return fail("المسابقة غير موجودة", 404);
      const rows = await getLeaderboard(id, 30);
      const users = await Promise.all(rows.map((r) => getUser(r.member)));
      return reply({ ok: true, contest: cleanContest(contest), leaderboard: rows.map((r, i) => ({ id: r.member, count: r.score, name: users[i]?.firstName || "", username: users[i]?.username || "" })) });
    }
    if (view === "stickers") {
      const st = await import("@/lib/stickers");
      return reply({
        ok: true,
        stickers: await st.describeStickers(),
        emojiPacks: st.EMOJI_SETS,
        gallery: "/api/stickers/gallery",
        note: "الملصقات حيّة فكل شاشات البوت (الترحيب، المميزات، المتجر، الخدمات، النقاط، الترتيب، الربح).",
      });
    }
    return fail("عرض غير معروف", 404);
  } catch (error) {
    if (error instanceof Error && error.message === "البث غير موجود") return fail(error.message, 404);
    return error instanceof InputError ? fail(error.message, error.status) : fail("تعذّر تحميل بيانات البوت", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return fail("unauthorized", 401);
  try {
    const body = object(await request.json().catch(() => ({})));
    const op = String(body.op || "");
    // 🎭 الملصقات والإيموجي المخصّص (نفس اللي فاللوحة الداخلية)
    if (op === "stickers_save" || op === "stickers_refresh" || op === "stickers_test" || op === "emoji_import") {
      const st = await import("@/lib/stickers");
      if (op === "stickers_refresh") return reply({ ok: true, refresh: await st.refreshStickers() });
      if (op === "stickers_test") {
        const chat = typeof body.chat === "string" || typeof body.chat === "number" ? String(body.chat).trim() : "";
        if (!/^\d{2,20}$/.test(chat)) invalid("معرّف الشات غير صالح");
        const kind = str(body.kind || "welcome", "الصنف", 12);
        const sent = await st.sendStickers(chat, (["welcome", "react", "more", "win", "shop"].includes(kind) ? kind : "welcome") as "welcome");
        return reply({ ok: true, sent, chat, kind });
      }
      if (op === "stickers_save") {
        const sets = object(body.sets);
        for (const [kind, raw] of Object.entries(sets)) {
          const list = Array.isArray(raw) ? (raw as unknown[]) : invalid("قائمة النشرات غير صالحة");
          if (!/^[a-z_]{3,12}$/.test(kind)) invalid("صنف غير معروف");
          for (const n of list) if (typeof n !== "string" || !/^[A-Za-z0-9_]{3,64}$/.test(n)) invalid("اسم النشر غير صالح (حروف/أرقام/_ فقط)");
        }
        const saved = await st.saveStickerSets(sets as Record<string, string[]>);
        const refresh = await st.refreshStickers();
        await pushAdminLog({ at: Date.now(), op: "stickers_save", detail: `${Object.keys(saved.sets).join(",")} · ${refresh.ready}/${refresh.of} جاهز`, via: "panel" });
        return reply({ ok: true, saved, refresh, stickers: await st.describeStickers() });
      }
      const name = str(body.pack || body.name || "", "اسم النشر", 64, true);
      const res = await st.importEmojiPack(name);
      await pushAdminLog({ at: Date.now(), op: "emoji_import", detail: `${name}: ${res.message}`, via: "panel" });
      return reply(res.ok ? { ...res } : { ok: false, error: res.message }, res.ok ? 200 : 400);
    }

    if (op === "contest_save") {
      const input = object(body.contest);
      // 🧩 كامل الكائن كيتقبل (id/imageUrl/التواريخ) — التواريخ كتهمّل
      onlyKeys(input, ["title", "description", "prize", "target", "winners", "status", "mode", "id", "imageUrl", "hasImage", "createdAt", "startedAt", "endedAt"]);
      const id = body.id ? resourceId(body.id) : input.id !== undefined ? resourceId(input.id, "معرّف المسابقة") : "";
      if (!Object.keys(input).filter((k) => !["id", "hasImage", "createdAt", "startedAt", "endedAt"].includes(k)).length) return fail("حدد حقلاً للتعديل");
      const existing = id ? await getContest(id) : null;
      if (id && !existing) return fail("المسابقة غير موجودة", 404);
      const patch: Partial<Contest> = {};
      for (const [key, max] of [["title", 100], ["description", 2000], ["prize", 300]] as const)
        if (input[key] !== undefined) patch[key] = str(input[key], key, max, key === "title");
      for (const key of ["target", "winners"] as const)
        if (input[key] !== undefined) patch[key] = number(input[key], key, 1, 1_000_000);
      if (input.status !== undefined) {
        if (input.status !== "active" && input.status !== "draft" && input.status !== "ended") return fail("حالة المسابقة غير صالحة");
        patch.status = input.status;
      }
      if (input.imageUrl !== undefined) {
        const image = str(input.imageUrl, "صورة المسابقة", 2_000_000, true);
        if (image && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(image) && !/^https:\/\//.test(image)) return fail("صيغة الصورة غير مدعومة");
        patch.imageUrl = image || undefined;
      }
      if (input.mode !== undefined) {
        if (input.mode !== "group" && input.mode !== "referral") return fail("نوع المسابقة غير صالح");
        patch.mode = input.mode;
      }
      if (!id && (!patch.title || !patch.target)) return fail("الاسم والهدف مطلوبان");
      // updateContest merges the patch and preserves image and every omitted field.
      const result = id ? await updateContest(id, patch) : await createContest({ title: patch.title!, target: patch.target!, description: patch.description, prize: patch.prize, status: patch.status, winners: patch.winners, mode: patch.mode });
      if (!result) return fail("المسابقة غير موجودة", 404);
      await log(op, `${id ? "تعديل" : "إضافة"} المسابقة ${result.title}`);
      return reply({ ok: true, contest: cleanContest(result) });
    }
    if (op === "contest_delete") {
      const id = resourceId(body.id);
      const existing = await getContest(id);
      if (!existing) return fail("المسابقة غير موجودة", 404);
      if (body.confirm !== true) return fail("تأكيد الحذف مطلوب؛ سيُحذف مخزون المسابقة أيضاً");
      await deleteContest(id);
      await log(op, `حذف المسابقة ${existing.title}`);
      return reply({ ok: true, deleted: { id, title: existing.title }, removedStock: true });
    }
    if (op === "reward_save") {
      const input = object(body.reward);
      // 🧩 كتقبل الجائزة كاملة (حتى id/hasImage) باش «round-trip» ديال اللوحة والـAI ما يقعش
      onlyKeys(input, ["title", "desc", "emoji", "cost", "stock", "active", "order", "section", "delivery", "id", "image", "hasImage"]);
      const id = body.id ? resourceId(body.id) : input.id !== undefined ? resourceId(input.id, "معرّف الجائزة") : "";
      if (!Object.keys(input).filter((k) => k !== "id" && k !== "hasImage").length) return fail("حدد حقلاً للتعديل");
      const list = await ensureRewards();
      const previous = id ? list.find((r) => r.id === id) : undefined;
      if (id && !previous) return fail("الجائزة غير موجودة", 404);
      const next: Reward = previous ? { ...previous } : { id: `r_${crypto.randomBytes(6).toString("hex")}`, title: "", emoji: "🎁", desc: "", cost: 1, stock: null, active: true, order: list.length + 1, delivery: "", section: "accounts" };
      for (const [key, max] of [["title", 100], ["desc", 2000], ["emoji", 16], ["delivery", 1000]] as const)
        if (input[key] !== undefined) next[key] = str(input[key], key, max, key === "title");
      if (input.cost !== undefined) next.cost = number(input.cost, "السعر", 1, 1_000_000);
      if (input.stock !== undefined) next.stock = input.stock === null ? null : number(input.stock, "المخزون", 0, 1_000_000);
      if (input.active !== undefined) next.active = bool(input.active, "حالة الجائزة");
      if (input.order !== undefined) next.order = number(input.order, "الترتيب", 0, 1_000_000);
      if (input.section !== undefined) {
        if (!["accounts", "points", "services"].includes(String(input.section))) return fail("القسم غير صالح");
        next.section = input.section as SectionId;
      }
      if (input.image !== undefined) {
        const image = str(input.image, "صورة الجائزة", 2_000_000, true);
        if (image && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(image) && !/^https:\/\//.test(image)) return fail("صيغة الصورة غير مدعومة");
        next.image = image || undefined;
        if (!image) delete next.image;
      }
      if (!next.title || (!id && input.cost === undefined)) return fail("الاسم والسعر مطلوبان");
      await saveRewards(previous ? list.map((r) => r.id === id ? next : r) : [...list, next]);
      await log(op, `${id ? "تعديل" : "إضافة"} الجائزة ${next.title}`);
      return reply({ ok: true, reward: cleanReward(next) });
    }
    if (op === "reward_delete") {
      const id = resourceId(body.id);
      const list = await ensureRewards();
      const previous = list.find((r) => r.id === id);
      if (!previous) return fail("الجائزة غير موجودة", 404);
      if (body.confirm !== true) return fail("تأكيد حذف الجائزة مطلوب");
      await saveRewards(list.filter((r) => r.id !== id));
      await log(op, `حذف الجائزة ${previous.title}`);
      return reply({ ok: true, deleted: { id, title: previous.title } });
    }
    if (op === "user_points") {
      const id = userId(body.userId);
      if (!await getUser(id)) return fail("المستخدم غير موجود", 404);
      if ((body.points === undefined) === (body.delta === undefined)) return fail("حدد رصيداً أو تغييراً واحداً");
      const value = body.points !== undefined ? number(body.points, "النقاط", 0, 100_000_000) : number(body.delta, "التغيير", -1_000_000, 1_000_000);
      const balance = body.points !== undefined ? await setBalance(id, value) : await addPoints(id, value);
      await log(op, `تعديل نقاط ${id}: ${balance}`);
      return reply({ ok: true, userId: id, balance });
    }
    if (op === "user_ban") {
      const id = userId(body.userId);
      const banned = bool(body.banned, "الحظر");
      if (!await getUser(id)) return fail("المستخدم غير موجود", 404);
      await setBanned(id, banned);
      await log(op, `${banned ? "حظر" : "فك حظر"} ${id}`);
      return reply({ ok: true, userId: id, banned });
    }
    if (op === "request_decide") {
      const id = resourceId(body.id);
      if (body.status !== "approved" && body.status !== "rejected") return fail("حالة الطلب غير صالحة");
      const pending = (await listRequests(500)).find((r) => r.id === id);
      if (!pending) return fail("الطلب غير موجود", 404);
      if (pending.status !== "pending") return fail(`تم البت في الطلب مسبقاً: ${pending.status}`, 409);
      const req = await decideRequest(id, body.status);
      if (!req) return fail("الطلب غير موجود", 404);
      const text = body.status === "approved" ? `تمت الموافقة على طلبك: ${req.rewardTitle}.` : `تم رفض طلبك: ${req.rewardTitle}، وأُعيدت ${req.cost} نقطة إلى رصيدك.`;
      const sent = await sendMessage(req.userId, text, undefined, { parse_mode: undefined }).catch(() => ({ ok: false }));
      await log(op, `${body.status} ${id}`);
      return reply({ ok: true, request: req, notified: Boolean(sent.ok), refunded: body.status === "rejected" });
    }
    if (op === "points_config") {
      const input = object(body.points);
      // ⚠️ dailyMin/dailyMax حقول قديمة (الهدية اليومية محيّدة) — كنتقبلوهم و كنهملهم
      //    باش زر «حفظ النقاط» في اللوحة ما يقعش في «حقل غير مسموح»
      onlyKeys(input, ["enabled", "perJoin", "perActivated", "shopIntro", "dailyMin", "dailyMax"]);
      if (!Object.keys(input).length) return fail("حدد حقلاً للتعديل");
      const patch: Partial<PointsConfig> = {};
      if (input.enabled !== undefined) patch.enabled = bool(input.enabled, "نظام النقاط");
      for (const key of ["perJoin", "perActivated"] as const)
        if (input[key] !== undefined) patch[key] = number(input[key], key, 0, 1000);
      if (input.shopIntro !== undefined) patch.shopIntro = str(input.shopIntro, "مقدمة المتجر", 2000);
      for (const key of ["dailyMin", "dailyMax"] as const)
        if (input[key] !== undefined) number(input[key], key, 0, 100_000); // مقبول لكن غير مستعمل
      const points = await savePointsConfig(patch);
      await log(op, "تعديل إعدادات نقاط المتجر");
      return reply({ ok: true, points });
    }
    if (op === "settings_save") {
      const input = object(body.settings);
      onlyKeys(input, ["ownerUsername", "supportUsername", "welcomeText", "rulesText", "requiredChannels", "requireJoin", "aiEnabled", "maintenanceMode", "autoApproveJoins", "groupTarget"]);
      if (!Object.keys(input).length) return fail("حدد حقلاً للتعديل");
      const patch: Partial<Settings> = {};
      for (const key of ["ownerUsername", "supportUsername"] as const)
        if (input[key] !== undefined) {
          const value = str(input[key], key, 32).replace(/^@/, "");
          if (value && !/^[A-Za-z0-9_]{4,32}$/.test(value)) return fail("اسم المستخدم غير صالح");
          patch[key] = value;
        }
      for (const key of ["welcomeText", "rulesText"] as const) if (input[key] !== undefined) patch[key] = str(input[key], key, 3500, true);
      for (const key of ["requireJoin", "aiEnabled", "maintenanceMode", "autoApproveJoins"] as const) if (input[key] !== undefined) patch[key] = bool(input[key], key);
      if (input.groupTarget !== undefined) patch.groupTarget = number(input.groupTarget, "هدف المجموعة", 1, 1_000_000);
      if (input.requiredChannels !== undefined) {
        if (!Array.isArray(input.requiredChannels) || input.requiredChannels.length > 20 || input.requiredChannels.some((v) => typeof v !== "string")) return fail("قائمة القنوات غير صالحة");
        const channels = normalizeChannels(input.requiredChannels);
        if (channels.some((c) => !/^@[A-Za-z0-9_]{4,32}$/.test(c) && !/^-\d{5,20}$/.test(c))) return fail("استعمل @username أو معرّف قناة صالح");
        patch.requiredChannels = channels;
      }
      const settings = await saveSettings(patch);
      await log(op, "تعديل إعدادات البوت");
      return reply({ ok: true, settings: cleanSettings(settings) });
    }
    if (op === "set_group") {
      const chatId = str(body.chatId, "معرّف المجموعة", 33, true);
      if (!/^-\d{5,20}$/.test(chatId) && !/^@[A-Za-z0-9_]{4,32}$/.test(chatId)) return fail("معرّف المجموعة غير صالح");
      if (process.env.JOIN_GROUP_CHAT) return fail("المجموعة محددة من متغيرات البيئة؛ عدّلها في إعدادات البوت أولاً", 409);
      const group = await setJoinGroup(chatId, str(body.title || "", "الاسم", 100));
      await log(op, `تغيير المجموعة ${chatId}`);
      return reply({ ok: true, group });
    }
    if (op === "send_message") {
      const id = userId(body.userId);
      if (!await getUser(id)) return fail("المستخدم غير موجود", 404);
      const text = str(body.text, "الرسالة", 4000, true);
      const result = await sendMessage(id, text, undefined, { parse_mode: undefined });
      if (!result.ok) return fail("تعذّر إرسال الرسالة عبر تيليغرام", 502);
      await log(op, `إرسال رسالة إلى ${id}`);
      return reply({ ok: true, userId: id, sent: true });
    }
    if (op === "broadcast" || op === "broadcast_start") {
      if (body.confirm !== true) return fail("تأكيد البث مطلوب");
      const text = str(body.text, "الرسالة", 4000, true);
      // The caller supplies a stable ID so a lost start response can be retried safely.
      const id = typeof body.jobId === "string" ? body.jobId : "";
      if (!/^[A-Za-z0-9_-]{16,100}$/.test(id)) return fail("معرّف البث مطلوب لإمكان الاستئناف بأمان");
      const result = await createBroadcast(id, text);
      await log("broadcast_start", `بدء بث ${id} إلى ${result.total} عضو مسجل`);
      return reply({ ok: true, ...result });
    }
    if (op === "broadcast_retry") {
      if (body.confirm !== true) return fail("تأكيد إعادة محاولة المرفوضين مطلوب");
      const id = typeof body.jobId === "string" ? body.jobId : "";
      if (!/^[A-Za-z0-9_-]{16,100}$/.test(id)) return fail("معرّف البث غير صالح");
      try {
        const result = await retryFailedBroadcast(id);
        await log("broadcast_retry", `إعادة المرفوضين من البث ${id}: ${result.total}`);
        return reply({ ok: true, ...result });
      } catch (error) { return fail(error instanceof Error ? error.message.slice(0, 200) : "تعذّرت إعادة المحاولة", 409); }
    }
    if (op === "broadcast_step") {
      const id = typeof body.jobId === "string" ? body.jobId : "";
      if (!/^[A-Za-z0-9_-]{16,100}$/.test(id)) return fail("معرّف البث غير صالح");
      return reply({ ok: true, ...await processBroadcast(id) });
    }
    return fail("العملية غير معروفة", 404);
  } catch (error) {
    if (error instanceof Error && error.message === "البث غير موجود") return fail(error.message, 404);
    return error instanceof InputError ? fail(error.message, error.status) : fail("تعذّر تنفيذ العملية في البوت؛ تحقّق من التخزين أو البث", 500);
  }
}
