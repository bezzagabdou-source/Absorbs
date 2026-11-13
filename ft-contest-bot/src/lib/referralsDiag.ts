/**
 * 🩺 referralsDiag.ts — تشخيص مشكل «الإحالات ما كيبانوش».
 *
 * كيجمع في نفس الوقت:
 *   • العدّادات الحقيقية (score + النقاط)
 *   • سجل الإحالات referrals:log
 *   • سجل دخول المجموعة (بدون فلترة) join:log:<chat>
 *   • إعدادات المجموعة/المسابقة (هل نظام الرابط شغّال؟)
 * ويرجّع «أسباب» مرتّبة بالأولوية + اقتراح إصلاح لكل سبب.
 *
 * الأهم: `creditGroupJoin` ولات كتسجّل كل محاولة (حتى غير المحتسبة) في join:log،
 *   لهذا نقدر نشوفو علاش الناس ما كيتحسبوش (رابط عادي / داخلين بلا رابط / تكرار...).
 */

import { getStore } from "./store";
import { getSettings } from "./settings";
import { listContests, participantsCount } from "./contests";

import { linkedGroup } from "./groups";
import { isMock, tgCall } from "./telegram";

export const JOIN_LOG = (chatId: string | number) => `join:log:${chatId}`;
export const REF_LOG = "referrals:log";
const LOG_CAP = 500;

export type ReferralCause = { code: string; title: string; fix: string; count?: number };

/* ───────────────────── تسجيل محاولات الدخول (حتى غير المحتسبة) ───────────────────── */

export type JoinAttempt = {
  at: number;
  chatId: string;
  joinerId: string;
  joinerName: string;
  ownerId: string;
  reason: string;
  counted: boolean;
  inviteName: string;
  hasLink: boolean;
  /** المسابقة اللي تحسبت فيها (إلا كانت ناجحة) */
  contestId?: string;
};

export async function logJoinAttempt(attempt: JoinAttempt): Promise<void> {
  try {
    const store = getStore();
    const key = JOIN_LOG(attempt.chatId);
    await store.listPush(key, [JSON.stringify(attempt)]);
    const len = await store.listLen(key);
    if (len > LOG_CAP + 50) {
      const all = (await store.listAll(key, LOG_CAP)).slice(-LOG_CAP);
      await store.delList(key);
      await store.listPush(key, all);
    }
  } catch {
    /* السجل ما يعطّلش أبداً */
  }
}

export async function recentJoinAttempts(chatId: string | number, limit = 50): Promise<JoinAttempt[]> {
  // 📚 نجيبو السجل كامل (متكوّس ~500) من اللول — باش ديما نلقاو الأحدث
  const raw = await getStore().listAll(JOIN_LOG(chatId), 1000);
  const out: JoinAttempt[] = [];
  for (const line of raw) {
    try {
      out.push(JSON.parse(line) as JoinAttempt);
    } catch {
      /* سطر تالف */
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

/* ───────────────────────────── الفحص الكامل ───────────────────────────── */

export type ReferralCheck = {
  ok: boolean;
  group: { chatId: string; title: string } | null;
  botInGroup: string;
  canInvite: string;
  contests: { id: string; title: string; mode: string; status: string }[];
  totals: {
    scoreRows: number;
    pointsRows: number;
    pointInvites: number;
    loggedReferrals: number;
    groupJoinsLogged: number;
    countedJoins: number;
    uncountedJoins: number;
  };
  causes: ReferralCause[];
  lastUncounted: JoinAttempt[];
  hint: string;
};

/** 🩺 فحص شامل: علاش الإحالات ما كيبانوش */
export async function referralCheck(chatIdInput?: string | number): Promise<ReferralCheck> {
  const store = getStore();
  const settings = await getSettings();
  const contests = await listContests();
  const group = linkedGroup(settings);
  const chatId = String(chatIdInput || settings.groupChat || group?.chatId || "");

  let botInGroup = "?";
  let canInvite = "?";
  if (chatId) {
    const me = await tgCall<{ id?: number }>("getMe");
    const member = await tgCall<{ status?: string; can_invite_users?: boolean }>("getChatMember", {
      chat_id: chatId,
      user_id: me.result?.id || 0,
    });
    // 🧪 وضع التجربة كيرجّع "member" — ما نعتمدوش عليه في التشخيص
    botInGroup = isMock()
      ? "وضع التجربة"
      : member.ok
        ? member.result?.status || "unknown"
        : `خطأ: ${member.description || "?"}`;
    canInvite = isMock() ? "وضع التجربة" : member.ok ? (member.result?.can_invite_users ? "نعم" : "لا") : "?";
  }

  const scores = await Promise.all(contests.map((c) => participantsCount(c.id)));
  const scoreRows = scores.reduce((n, s) => n + s, 0);
  const [pointsRows, loggedReferrals, joins] = await Promise.all([
    store.zCount("points:invites"),
    store.listLen(REF_LOG),
    chatId ? store.listLen(JOIN_LOG(chatId)) : 0,
  ]);

  const attempts = chatId ? await recentJoinAttempts(chatId, 200) : [];
  const counted = attempts.filter((a) => a.counted).length;
  const uncounted = attempts.filter((a) => !a.counted);
  const byReason = new Map<string, number>();
  for (const a of uncounted) byReason.set(a.reason, (byReason.get(a.reason) || 0) + 1);

  const causes: ReferralCause[] = [];
  if (!chatId) {
    causes.push({
      code: "no-group",
      title: "ما كاينش مجموعة مربوطة بالبوت → روابط الدعوة ما كتولّدش",
      fix: "اربط المجموعة: زيد البوت للمجموعة كأدمن ثم /linkgroup أو من اللوحة",
    });
  } else if (["administrator", "creator", "وضع التجربة"].includes(botInGroup) === false) {
    causes.push({
      code: "bot-not-admin",
      title: `البوت ماشي أدمن في المجموعة (${botInGroup}) → ما كيشوفش شكون دخل بلا رابط`,
      fix: "دير البوت أدمن + فعّل صلاحية «دعوة المستخدمين» (Invite Users)",
    });
  } else if (canInvite === "لا") {
    causes.push({
      code: "no-invite-right",
      title: "البوت أدمن ولكن بلا صلاحية «دعوة المستخدمين» → كل الروابط كتولّد عادية",
      fix: "صلاحيات الأدمن ← فعّل Invite Users",
    });
  }
  if (!contests.some((c) => c.mode === "group" && c.status === "active")) {
    causes.push({
      code: "no-group-contest",
      title: "ما كاينش مسابقة «مجموعة» نشطة → الداخلين ما كيتحسبوش",
      fix: "من اللوحة: زيد مسابقة mode=group وحوّلها active",
    });
  }
  if (byReason.get("link-only") || byReason.get("duplicate")) {
    causes.push({
      code: "duplicate",
      title: `${byReason.get("duplicate") || 0} عضو دخلو من قبل (كل عضو كيتحسب مرة وحدة فقط)`,
      fix: "طبيعي — العضو القديم ما كيتحسبش مرة أخرى",
    });
  }
  if (byReason.get("self-or-unknown")) {
    causes.push({
      code: "plain-link",
      title: `${byReason.get("self-or-unknown") || 0} داخلين برابط عادي (ماشي رابط شخصي) → ما كيتحسبوش`,
      fix: "خاص المشاركين يستعملو «رابط الإحالة الخاص بي» من البوت، ماشي رابط المجموعة العام",
    });
  }
  if (byReason.get("no-contest")) {
    causes.push({
      code: "no-contest",
      title: `${byReason.get("no-contest") || 0} محاولة بلا مسابقة نشطة`,
      fix: "فعّل مسابقة مجموعة",
    });
  }
  if (!causes.length && !attempts.length && scoreRows === 0) {
    causes.push({
      code: "no-data",
      title: "ما كاين حتى محاولة دخول مسجّلة → غالباً الويب هوك ما كيستقبلش تحديثات المجموعة",
      fix: "شوف /api/telegram/status (updatesOk) وتأكد chat_member/chat_join_request مسجّلين",
    });
  }

  return {
    ok: causes.length === 0,
    group: chatId ? { chatId, title: group?.title || settings.groupUrl || "" } : null,
    botInGroup,
    canInvite,
    contests: contests.map((c) => ({ id: c.id, title: c.title, mode: String(c.mode || "referral"), status: String(c.status) })),
    totals: {
      scoreRows,
      pointsRows,
      pointInvites: 0,
      loggedReferrals,
      groupJoinsLogged: joins,
      countedJoins: counted,
      uncountedJoins: uncounted.length,
    },
    causes,
    lastUncounted: uncounted.slice(0, 10),
    hint: "زر «إصلاح تلقائي» كيعاود يحسب الداخلين اللي فاتو (idempotent، ما كيزيدش العدّ)",
  };
}

/* ─────────────────────── إصلاح تلقائي (إعادة حساب) ─────────────────────── */

export type FixResult = { fixed: number; skipped: number; contests: string[]; notes: string[] };

/**
 * 🔧 يعاود يحسب كل الداخلين المسجّلين في join:log للذين ما تحسبوش،
 *    ويضيف +1 لصاحب الرابط في score المسابقة وفي نقاط البوت.
 *    idempotent: يعتمد على مجموعة `credited` باش ما يتكرّرش العدّ.
 */
export async function backfillReferrals(chatId?: string | number): Promise<FixResult> {
  const store = getStore();
  const settings = await getSettings();
  const chat = String(chatId || settings.groupChat || "");
  const notes: string[] = [];
  let fixed = 0;
  let skipped = 0;
  const touched = new Set<string>();
  const contests = (await listContests()).filter((c) => c.status === "active");
  const contest = contests.find((c) => c.mode === "group") || contests[0];
  if (!contest) return { fixed: 0, skipped: 0, contests: [], notes: ["ما كاينش مسابقة نشطة"] };

  const events = chat ? await recentJoinAttempts(chat, 500) : [];
  const { creditPoints } = await import("./points");
  const credit = async (contestId: string, ownerId: string, joinerId: string, withPoints: boolean) => {
    if (await store.get(`refbtot:${contestId}:${joinerId}`)) return false;
    const added = await store.sAdd(`contest:${contestId}:credited`, joinerId);
    if (added) {
      await store.zIncr(`contest:${contestId}:score`, ownerId, 1);
      if (withPoints) await creditPoints(ownerId);
    }
    await store.set(`refbtot:${contestId}:${joinerId}`, Date.now());
    return added;
  };
  for (const event of events) {
    // 🛡️ ما نعاودوش نحسبو واحد مسجّل «محسوب» ولا بلا صاحب رابط (باش ما يتضاعفش العدّ)
    if (event.counted || !event.ownerId || event.ownerId === event.joinerId) {
      skipped += 1;
      continue;
    }
    const target = (event.contestId && (await store.get(`contest:${event.contestId}`))) ? event.contestId : contest.id;
    if (!(await credit(target, event.ownerId, event.joinerId, true))) {
      skipped += 1;
      continue;
    }
    touched.add(event.ownerId);
    fixed += 1;
  }

  // ️ استرجاع سجل الإحالات القديمة (referrals:log) — إلا كانت مسابقتها تمسحات
  //    تحسب غير على المسابقة النشطة (بلا نقاط جديدة: النقاط تعاوط وقتها)
  const refLines = await store.listAll(REF_LOG, 2000);
  let restored = 0;
  for (const line of refLines) {
    try {
      const e = JSON.parse(line) as {
        counted?: boolean;
        inviterId?: string;
        joinerId?: string;
        contestId?: string;
      };
      if (!e.counted || !e.inviterId || !e.joinerId || e.inviterId === e.joinerId) continue;
      const alive = e.contestId ? await store.get(`contest:${e.contestId}`) : null;
      const cid = alive ? String(e.contestId) : contest.id;
      if (await credit(cid, String(e.inviterId), String(e.joinerId), false)) restored += 1;
    } catch {
      /* سطر تالف */
    }
  }
  if (restored) notes.push(`🕰️ استرجعنا ${restored} إحالة قديمة كانت ضايعة (المسابقة تبدلات)`);

  notes.push(`تمّ حساب ${fixed} ضيف لـ ${touched.size} مشارك (المسابقة: ${contest.title})`);
  if (skipped) notes.push(`${skipped} كانو محسوبين من قبل — ما تبدّل والو`);
  return { fixed, skipped, contests: [contest.id], notes };
}

/* ══════════════════════════════════════════════════════════════════════════
   ♻️ إعادة حساب نقاط الإحالات القديمة
   كنقراو سجل الإحالات (referrals:log) + scores ديال المسابقات، وكنديرو لكل
   واحد نقاط المتجر اللي خاصو (perJoin لكل ضيف) — بعلامة refpts:* باش ما تتكررش.
   ══════════════════════════════════════════════════════════════════════════ */

export type RecountResult = {
  scanned: number;
  wouldCredit: number;
  credited: number;
  skipped: number;
  perJoin: number;
  inviters: { userId: string; name: string; referrals: number; paid: number; addPoints: number; balance: number }[];
  notes: string[];
  applied: boolean;
};

export async function recountReferralPoints(apply = false, maxRows = 4000): Promise<RecountResult> {
  const store = getStore();
  const { getPointsConfig, addPoints, balanceOf, joinedCreditCount } = await import("./rewards");
  const { getUser } = await import("./users");
  const cfg = await getPointsConfig();
  const per = Math.max(1, Math.floor(Number(cfg.perJoin) || 1));
  const raw = await store.listAll(REF_LOG, maxRows).catch(() => [] as string[]);
  const rows: { at: number; contestId: string; inviterId: string; inviterName?: string; joinerId: string }[] = [];
  const notes: string[] = [];
  let skipped = 0;

  // 🕰️ السجل فيه أشكال قديمة (inviter/referrer/userId…) → كنقبلو كل الأسماء المعروفة
  const pick = (e: Record<string, unknown>, keys: string[]) => {
    for (const k of keys) {
      const v = e?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };
  const fallbackContest =
    (await import("./contests"))
      .listContests()
      .then((cs) => (cs.find((c) => c.status === "active") || cs[0])?.id || "")
      .catch(() => "");
  let badRows = 0;
  for (const line of raw) {
    try {
      const e = (typeof line === "string" ? JSON.parse(line) : line) as Record<string, unknown>;
      if (e?.counted === false) {
        skipped++;
        continue;
      }
      const inviterId = pick(e, ["inviterId", "inviter", "ownerId", "referrer", "refId", "from", "senderId"]);
      const joinerId = pick(e, ["joinerId", "joiner", "newUserId", "userId", "memberId", "user", "referred"]);
      const contestId = pick(e, ["contestId", "contest", "cid"]) || (await fallbackContest);
      if (!/^\d+$/.test(inviterId) || !/^\d+$/.test(joinerId) || inviterId === joinerId || !contestId) {
        badRows++;
        skipped++;
        continue;
      }
      rows.push({
        at: Number(e?.at || e?.atMs || e?.ts) || 0,
        contestId,
        inviterId,
        inviterName: String(e?.inviterName || e?.ownerName || ""),
        joinerId,
      });
    } catch {
      badRows++;
      skipped++;
    }
  }
  if (badRows) notes.push(`${badRows} سطر قديم ما فيهش ما يكفي من المعلومات — تجاوزه`);

  const perInviter = new Map<string, { n: number; name: string }>();
  let wouldCredit = 0;
  for (const r of rows) {
    const mark = `refpts:${r.contestId}:${r.joinerId}`;
    if (seenInRun.has(mark)) continue;
    seenInRun.add(mark);
    if (await store.get<number>(mark).catch(() => null)) {
      skipped++;
      continue;
    }
    wouldCredit++;
    const cur = perInviter.get(r.inviterId) || { n: 0, name: r.inviterName || "" };
    cur.n += 1;
    perInviter.set(r.inviterId, cur);
  }

  const inviters: RecountResult["inviters"] = [];
  let credited = 0;
  let totalOwed = 0;
  for (const [userId, info] of [...perInviter.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 50)) {
    // 🚫 بلا ما نعدّو مرتين: كنطرحو اللي خدّو نقاطهم من قبل (عدّاد creditInvite)
    const paid = await joinedCreditCount(userId).catch(() => 0);
    const owed = Math.max(0, info.n - paid);
    totalOwed += owed;
    const add = owed * per;
    let balance = await balanceOf(userId).catch(() => 0);
    if (apply && owed > 0) {
      try {
        balance = await addPoints(userId, add);
        credited += owed;
        // نعلّمو حتى على level ديال المسابقة باش ما يعاودش الإصلاح يحسبها
        for (const r of rows.filter((x) => x.inviterId === userId)) {
          await store.set(`refpts:${r.contestId}:${r.joinerId}`, Date.now()).catch(() => undefined);
          await store.sAdd(`contest:${r.contestId}:credited`, r.joinerId).catch(() => undefined);
          await store.set(`refbtot:${r.contestId}:${r.joinerId}`, Date.now()).catch(() => undefined);
        }
      } catch (error) {
        notes.push(`زيدش مشكل مع ${userId}: ${String((error as Error)?.message || error)}`);
      }
    }
    inviters.push({
      userId,
      name: info.name || (await getUser(userId).catch(() => null))?.firstName || `عضو ${userId.slice(-4)}`,
      referrals: info.n,
      paid,
      addPoints: add,
      balance,
    });
  }
  wouldCredit = totalOwed;

  if (!rows.length) notes.push("سجل الإحالات خاوي — ما كاين حتى ضيف مسجلة باش تعاد الحسبة.");
  if (apply && !credited) notes.push("كل الإحالات عندها نقاط من قبل — ما كاين ما يعاود يتحسب.");
  seenInRun.clear();

  return {
    scanned: rows.length,
    wouldCredit,
    credited: apply ? credited : 0,
    skipped,
    perJoin: per,
    inviters,
    notes,
    applied: apply,
  };
}

/** بصمة داخل نفس العملية (باش ما نحسبوش نفس الضيف مرتين في نفس الـrun) */
const seenInRun = new Set<string>();
