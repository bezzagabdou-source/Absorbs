import { getStore } from "./store";

/* ══════════════════════════════════════════════════════════════════════════
   تسليم الحسابات + التحقّق من الحساب بعد التسليم.

   • كل جائزة عندها مخزون حسابات: سطر لكل حساب بصيغة  email:password
     (مقبول حتى  email|password  أو  email password).
   • عند الموافقة على الطلب: نسحب حساباً من المخزون (سحب ذرّي FIFO) ونبعثو
     للمستخدم مع رسالة التحقّق وزرّين: ✅ Working / ❌ Not Working.
   • Working  → يتقفل التحقّق ويقدر يطلب جائزة جديدة.
   • Not Working → نبلّغو المالك، ونعطيوه حساباً بديلاً إذا كاين، وإلا نرجّعولو نقاطو.
   ══════════════════════════════════════════════════════════════════════════ */

export type RewardAccount = { email: string; password: string };

export type VerificationState = {
  userId: string;
  requestId: string;
  rewardId: string;
  rewardTitle: string;
  emoji: string;
  cost: number;
  account: RewardAccount;
  /** رقم المحاولة (1 = الحساب الأول) */
  attempt: number;
  at: number;
};

const poolKey = (rewardId: string) => `rwpool:${rewardId}`;
const verifyKey = (userId: string) => `verify:${userId}`;
const deliveredKey = (rewardId: string) => `rwpool:${rewardId}:delivered`;

/** سطر → حساب. يقبل الفواصل : | , أو مسافة */
export function parseAccountLine(line: string): RewardAccount | null {
  const raw = String(line || "").trim();
  if (!raw || raw.startsWith("#")) return null;
  const parts = raw.split(/\s*[|:,]\s*|\s{2,}|\t+/);
  let email = "";
  let password = "";
  if (parts.length >= 2) {
    email = (parts[0] || "").trim();
    password = (parts.slice(1).join(":") || "").trim();
  } else {
    // آخر محاولة: أول مسافة تفصل
    const sp = raw.indexOf(" ");
    if (sp > 0) {
      email = raw.slice(0, sp).trim();
      password = raw.slice(sp + 1).trim();
    }
  }
  if (!email || !password) return null;
  if (/\s/.test(email)) return null;
  return { email: email.slice(0, 120), password: password.slice(0, 120) };
}

export function parseAccounts(text: string): RewardAccount[] {
  const out: RewardAccount[] = [];
  for (const line of String(text || "").split(/[\n\r]+/)) {
    const acc = parseAccountLine(line);
    if (!acc) continue;
    if (out.some((x) => x.email.toLowerCase() === acc.email.toLowerCase())) continue;
    out.push(acc);
  }
  return out;
}

export function formatAccount(acc: RewardAccount): { line: string; base64: string } {
  const line = `${acc.email}:${acc.password}`;
  return { line, base64: Buffer.from(line, "utf8").toString("base64") };
}

/** يزيد حسابات لمخزون جائزة. يرجّع عدد اللي تزادو */
export async function addRewardAccounts(rewardId: string, text: string): Promise<number> {
  const added = parseAccounts(text).map((a) => `${a.email}:${a.password}`);
  if (!added.length) return 0;
  const store = getStore();
  const existing = new Set(await store.listAll(poolKey(rewardId), 5000));
  const fresh = added.filter((line) => !existing.has(line));
  if (fresh.length) await store.listPush(poolKey(rewardId), fresh);
  return fresh.length;
}

export async function rewardPoolCount(rewardId: string): Promise<number> {
  return getStore().listLen(poolKey(rewardId));
}

/** مخزون الحسابات مع إخفاء كلمة السر (للعرض في اللوحة) */
export async function rewardPool(rewardId: string): Promise<{ count: number; emails: string[] }> {
  const raw = await getStore().listAll(poolKey(rewardId), 200);
  const emails = raw
    .map((line) => parseAccountLine(line))
    .filter((a): a is RewardAccount => Boolean(a))
    .map((a) => a.email);
  return { count: raw.length, emails };
}

export async function clearRewardPool(rewardId: string): Promise<void> {
  await getStore().delList(poolKey(rewardId));
}

/** سحب ذرّي (FIFO): كل حساب يتسلّم مرة واحدة فقط */
export async function takeRewardAccount(rewardId: string): Promise<RewardAccount | null> {
  const store = getStore();
  // نحاولو عدة مرات إلا كان سطر تالف في المخزون
  for (let i = 0; i < 5; i++) {
    const line = await store.listPop(poolKey(rewardId));
    if (!line) return null;
    const acc = parseAccountLine(line);
    if (!acc) continue;
    await store.listPush(deliveredKey(rewardId), [line]);
    return acc;
  }
  return null;
}

/** alias مقروء للاستعمال من الوحدات الأخرى */
export const poolCount = rewardPoolCount;

/* ───────────────────── حالة التحقّق المفتوحة للمستخدم ───────────────────── */

export async function getVerification(userId: string): Promise<VerificationState | null> {
  const state = await getStore().get<VerificationState>(verifyKey(String(userId)));
  if (!state) return null;
  // صلاحية 7 أيام — بعدها ما نبلوكيوهش المستخدم للأبد
  if (Date.now() - (state.at || 0) > 7 * 24 * 60 * 60 * 1000) {
    await closeVerification(String(userId));
    return null;
  }
  return state;
}

export async function openVerification(state: Omit<VerificationState, "at">): Promise<VerificationState> {
  const full: VerificationState = { ...state, userId: String(state.userId), at: Date.now() };
  await getStore().set(verifyKey(full.userId), full);
  return full;
}

export async function closeVerification(userId: string): Promise<void> {
  await getStore().del(verifyKey(String(userId)));
}

/** نص التحقّق المطلوب حرفياً (كما طلبه المالك) */
export function verifyPromptText(account: RewardAccount): string {
  return [
    "🎁 <b>الحساب تاعك:</b>",
    "",
    `📧 <b>الإيميل:</b> <code>${account.email}</code>`,
    `🔑 <b>كلمة السر:</b> <code>${account.password}</code>`,
    "",
    "<i>You need to verify this account to get new account. Verify using these buttons.</i>",
  ].join("\n");
}
