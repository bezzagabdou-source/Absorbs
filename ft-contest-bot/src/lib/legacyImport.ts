/**
 * 🔁 ترحيل بيانات «اللوحة القديمة» (ft-panel legacy Redis) إلى قاعدة بيانات البوت.
 *
 * اللوحة القديمة كانت تخزّن المستخدمين والجوائز والطلبات والإعدادات في Redis خاص
 * بها، بينما البوت يخزّنها في قاعدته (Postgres/Redis). هذا الملف يستقبل لقطة
 * (snapshot) من اللوحة ويحوّلها إلى نموذج البوت:
 *
 *   - المستخدمون  : user:<id> + users:ids + users:joined
 *   - النقاط      : pts:<id> (+ pts:top)
 *   - الحظر       : users:banned
 *   - الإحالات    : refs:joined:<id>
 *   - الجوائز     : rewards:list (دمج بالعنوان، بلا حذف أو تخفيض سعر)
 *   - الطلبات     : rreq:<id> + rewards:requests
 *   - القنوات     : settings.requiredChannels (إضافة فقط)
 *
 * القواعد: الترحيل idempotent (إعادة التشغيل لا تضاعف)، والافتراضي «معاينة» بلا
 * كتابة، ولا يطمس أي بيانات أحدث موجودة في البوت.
 */
import { ensureRewards, getPointsConfig, savePointsConfig, saveRewards, type Reward, type SectionId } from "./rewards";
import { getSettings, normalizeChannels, saveSettings } from "./settings";
import { getStore } from "./store";

export type LegacyUser = { id: string; name?: string; username?: string; points?: number; refs?: number; banned?: boolean; joined?: number };
export type LegacyPrize = { id?: string; title?: string; emoji?: string; desc?: string; cost?: number; active?: boolean; order?: number };
export type LegacyRequest = { id?: string | number; uid?: string; title?: string; cost?: number; status?: string; at?: number; done?: number };
export type LegacySnapshot = {
  source?: string;
  users?: LegacyUser[];
  prizes?: LegacyPrize[];
  requests?: LegacyRequest[];
  settings?: { refPoints?: number; welcome?: string; enabled?: boolean; perJoin?: number };
  channels?: Array<{ chat?: string; title?: string } | string>;
  visits?: number;
};

export type MigrationOptions = {
  users?: boolean;
  points?: "fill-empty" | "max" | "skip";
  prizes?: boolean;
  requests?: "pending" | "all" | "skip";
  settings?: boolean;
  channels?: boolean;
};

type UserReport = { total: number; created: number; existing: number; pointsSet: number; pointsKept: number; banned: number; refs: number };
type PrizeReport = { total: number; created: number; existing: number; updated: number };
type RequestReport = { total: number; imported: number; skipped: number };
type ChannelReport = { added: string[]; existing: number };
export type MigrationReport = {
  dryRun: boolean;
  users: UserReport;
  prizes: PrizeReport;
  requests: RequestReport;
  channels: ChannelReport;
  settings: { perJoin: number | null; pointsEnabled: boolean | null };
  warnings: string[];
  skipped: string[];
};

const LIMIT = { users: 5000, prizes: 200, requests: 1000, channels: 20 };
const USER_ID = /^\d{1,20}$/;
const text = (value: unknown, max: number) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const num = (value: unknown, min: number, max: number) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

export type NormalizedSnapshot = {
  source: string;
  users: LegacyUser[];
  prizes: LegacyPrize[];
  requests: LegacyRequest[];
  channels: Array<{ chat: string; title: string }>;
  settings: { refPoints?: number; welcome: string; enabled?: boolean };
  visits: number;
};

/** تطبيع لقطة اللوحة القديمة: يحذف غير الصالح ويحدّ الأحجام (حماية للطلب والوقت). */
export function normalizeSnapshot(raw: unknown): { snapshot: NormalizedSnapshot; warnings: string[]; skipped: string[] } {
  const input = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as LegacySnapshot;
  const warnings: string[] = [];
  const skipped: string[] = [];

  const users: LegacyUser[] = [];
  const seenUsers = new Set<string>();
  const rawUsers = Array.isArray(input.users) ? input.users : [];
  if (rawUsers.length > LIMIT.users) warnings.push(`المستخدمون: أُخذ أول ${LIMIT.users} من ${rawUsers.length} في هذه الدفعة`);
  for (const item of rawUsers.slice(0, LIMIT.users)) {
    const id = text((item as LegacyUser)?.id, 20);
    if (!USER_ID.test(id) || seenUsers.has(id)) continue;
    seenUsers.add(id);
    users.push({
      id,
      name: text((item as LegacyUser).name, 64),
      username: text((item as LegacyUser).username, 32).replace(/^@/, ""),
      points: num((item as LegacyUser).points, 0, 100_000_000) ?? 0,
      refs: num((item as LegacyUser).refs, 0, 1_000_000) ?? 0,
      banned: Boolean((item as LegacyUser).banned),
      joined: num((item as LegacyUser).joined, 0, 9_999_999_999_999) ?? 0,
    });
  }

  const prizes: LegacyPrize[] = [];
  const rawPrizes = Array.isArray(input.prizes) ? input.prizes : [];
  if (rawPrizes.length > LIMIT.prizes) warnings.push(`الجوائز: أُخذ أول ${LIMIT.prizes} من ${rawPrizes.length}`);
  for (const item of rawPrizes.slice(0, LIMIT.prizes)) {
    const title = text((item as LegacyPrize).title, 100);
    if (!title) continue;
    prizes.push({
      id: text((item as LegacyPrize).id, 64) || undefined,
      title,
      emoji: text((item as LegacyPrize).emoji, 16) || "🎁",
      desc: text((item as LegacyPrize).desc, 2000),
      cost: num((item as LegacyPrize).cost, 1, 1_000_000) ?? 1,
      active: (item as LegacyPrize).active !== false,
      order: num((item as LegacyPrize).order, 0, 1_000_000) ?? prizes.length + 1,
    });
  }

  const requests: LegacyRequest[] = [];
  const rawRequests = Array.isArray(input.requests) ? input.requests : [];
  if (rawRequests.length > LIMIT.requests) warnings.push(`الطلبات: أُخذ أول ${LIMIT.requests} من ${rawRequests.length}`);
  for (const item of rawRequests.slice(0, LIMIT.requests)) {
    const uid = text((item as LegacyRequest).uid, 20);
    const title = text((item as LegacyRequest).title, 100);
    if (!USER_ID.test(uid) || !title) continue;
    const status = ["pending", "approved", "rejected"].includes(String((item as LegacyRequest).status))
      ? String((item as LegacyRequest).status)
      : "pending";
    requests.push({
      id: text((item as LegacyRequest).id, 64) || undefined,
      uid,
      title,
      cost: num((item as LegacyRequest).cost, 0, 1_000_000) ?? 0,
      status,
      at: num((item as LegacyRequest).at, 0, 9_999_999_999_999) || num((item as LegacyRequest).done, 0, 9_999_999_999_999) || Date.now(),
    });
  }

  const channels: Array<{ chat: string; title: string }> = [];
  const rawChannels = Array.isArray(input.channels) ? input.channels : [];
  for (const item of rawChannels.slice(0, LIMIT.channels)) {
    const value = typeof item === "string" ? item : item?.chat;
    const chat = text(value, 64);
    if (!chat) continue;
    const normalized = /^https?:\/\/t\.me\//i.test(chat) ? `@${chat.replace(/^https?:\/\/t\.me\//i, "").replace(/\/.*$/, "")}` : chat;
    if (!/^@[A-Za-z0-9_]{4,32}$/.test(normalized) && !/^-\d{5,20}$/.test(normalized)) {
      skipped.push(`قناة غير صالحة: ${chat.slice(0, 32)}`);
      continue;
    }
    if (channels.some((c) => c.chat.toLowerCase() === normalized.toLowerCase())) continue;
    channels.push({ chat: normalized, title: text(typeof item === "string" ? "" : item?.title, 100) });
  }

  const settings = input.settings && typeof input.settings === "object" ? input.settings : {};
  const refPoints = num(settings.refPoints ?? settings.perJoin, 0, 1000);

  return {
    snapshot: {
      source: text(input.source, 60) || "ft-panel-legacy-v1",
      users,
      prizes,
      requests,
      channels,
      settings: { refPoints: refPoints ?? undefined, welcome: text(settings.welcome, 3500), enabled: typeof settings.enabled === "boolean" ? settings.enabled : undefined },
      visits: num(input.visits, 0, 1_000_000_000) ?? 0,
    },
    warnings,
    skipped,
  };
}

const SECTION_BY_TITLE = (title: string): SectionId => {
  if (/نجم|نجوم|دب|star|bear|هدية تيليجرام/i.test(title)) return "points";
  if (/وساط|دولار|خدم|usd|\$|service/i.test(title)) return "services";
  return "accounts";
};
const clean = (value: string) => value.replace(/\s*\([^)]*غير متوفر[^)]*\)/g, "").replace(/\s*\([^)]*متوفر[^)]*\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** ترحيل لقطة اللوحة القديمة إلى البوت. dryRun=true افتراضياً (معاينة بلا كتابة). */
export async function migrateLegacy(raw: unknown, options: MigrationOptions = {}, { dryRun = true } = {}): Promise<MigrationReport> {
  const { snapshot, warnings, skipped } = normalizeSnapshot(raw);
  const store = getStore();
  const opts: Required<MigrationOptions> = {
    users: options.users !== false,
    points: options.points || "fill-empty",
    prizes: options.prizes !== false,
    requests: options.requests || "pending",
    settings: options.settings !== false,
    channels: options.channels !== false,
  };

  const report: MigrationReport = {
    dryRun,
    users: { total: snapshot.users!.length, created: 0, existing: 0, pointsSet: 0, pointsKept: 0, banned: 0, refs: 0 },
    prizes: { total: snapshot.prizes!.length, created: 0, existing: 0, updated: 0 },
    requests: { total: snapshot.requests!.length, imported: 0, skipped: 0 },
    channels: { added: [], existing: 0 },
    settings: { perJoin: null, pointsEnabled: null },
    warnings,
    skipped,
  };

  /* ── المستخدمون والنقاط والحظر والإحالات ── */
  if (opts.users) {
    for (let i = 0; i < snapshot.users!.length; i += 20) {
      const chunk = snapshot.users!.slice(i, i + 20);
      await Promise.all(
        chunk.map(async (user) => {
          const existing = await store.get<{ id: string }>(`user:${user.id}`);
          if (existing) report.users.existing += 1;
          else {
            report.users.created += 1;
            if (!dryRun) {
              await store.set(`user:${user.id}`, {
                id: user.id,
                firstName: user.name || "صديق",
                username: user.username || "",
                joinedAt: user.joined && user.joined > 1_000_000_000_000 ? user.joined : Date.now(),
              });
              await store.sAdd("users:ids", user.id);
              await store.zIncr("users:joined", user.id, user.joined && user.joined > 1_000_000_000_000 ? user.joined : Date.now());
            }
          }
          // النقاط: لا نُنقص رصيداً موجوداً أبداً
          if (opts.points !== "skip" && user.points && user.points > 0) {
            const current = await store.get<number>(`pts:${user.id}`);
            const balance = Math.max(0, Number(current) || 0);
            const wanted = balance === 0 || (opts.points === "max" && user.points > balance);
            if (wanted) {
              report.users.pointsSet += 1;
              if (!dryRun) await store.set(`pts:${user.id}`, user.points);
              if (!dryRun) await store.zIncr("pts:top", user.id, user.points - balance);
            } else report.users.pointsKept += 1;
          }
          if (user.banned) {
            const already = await store.sHas("users:banned", user.id);
            if (!already) {
              report.users.banned += 1;
              if (!dryRun) await store.sAdd("users:banned", user.id);
            }
          }
          if (user.refs && user.refs > 0 && opts.points !== "skip") {
            const key = `refs:joined:${user.id}`;
            const current = Number(await store.get<number>(key)) || 0;
            if (user.refs > current) {
              report.users.refs += 1;
              if (!dryRun) await store.set(key, user.refs);
            }
          }
        }),
      );
    }
  }

  /* ── الجوائز: دمج بالعنوان، بدون حذف أو تخفيض سعر ── */
  if (opts.prizes && snapshot.prizes!.length) {
    const list = await ensureRewards();
    const next: Reward[] = [...list];
    for (const prize of snapshot.prizes!) {
      const key = clean(prize.title!.replace(/\(.*?\)/g, ""));
      const found = next.find((r) => clean(r.title) === key || (prize.id && r.id === prize.id));
      if (found) {
        report.prizes.existing += 1;
        const merged = { ...found } as Reward;
        let changed = false;
        if (!merged.desc && prize.desc) {
          merged.desc = prize.desc;
          changed = true;
        }
        if ((merged.cost ?? 0) <= 0 && prize.cost) {
          merged.cost = prize.cost;
          changed = true;
        }
        if (changed) {
          report.prizes.updated += 1;
          if (!dryRun) next[next.findIndex((r) => r.id === found.id)] = merged;
        }
        continue;
      }
      report.prizes.created += 1;
      if (!dryRun) {
        next.push({
          id: `r_legacy_${(prize.id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48) || Math.random().toString(36).slice(2, 10)}`.slice(0, 64),
          title: prize.title!,
          emoji: prize.emoji || "🎁",
          desc: prize.desc || "",
          cost: prize.cost ?? 1,
          stock: null,
          active: prize.active !== false,
          order: prize.order ?? next.length + 1,
          delivery: "",
          section: SECTION_BY_TITLE(prize.title!),
        });
      }
    }
    if (!dryRun && report.prizes.created + report.prizes.updated > 0) await saveRewards(next);
  }

  /* ── الطلبات: الافتراضي «المعلّقة فقط» لأنها تحتاج قراراً؛ النقاط خُصمت أصلاً ── */
  if (opts.requests !== "skip" && snapshot.requests!.length) {
    const wanted = snapshot.requests!.filter((r) => opts.requests === "all" || r.status === "pending");
    for (const request of wanted) {
      const id = `rq_legacy_${String(request.id || `${request.uid}_${request.at}`).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40)}`;
      const existing = await store.get(`rreq:${id}`);
      if (existing) {
        report.requests.skipped += 1;
        continue;
      }
      report.requests.imported += 1;
      if (!dryRun) {
        await store.set(`rreq:${id}`, {
          id,
          userId: request.uid!,
          userName: "",
          username: "",
          rewardId: "",
          rewardTitle: request.title!,
          emoji: "🎁",
          cost: request.cost ?? 0,
          status: request.status || "pending",
          at: request.at || Date.now(),
          note: "legacy-panel",
        });
        await store.listPush("rewards:requests", [id]);
      }
    }
    report.requests.skipped += snapshot.requests!.length - wanted.length;
  }

  /* ── القنوات المطلوبة: إضافة فقط ── */
  if (opts.channels && snapshot.channels!.length) {
    const settings = await getSettings();
    const current = normalizeChannels(settings.requiredChannels);
    const missing = snapshot.channels!.map((c) => c.chat).filter((chat) => !current.some((c) => c.toLowerCase() === chat.toLowerCase()));
    report.channels.existing = snapshot.channels!.length - missing.length;
    report.channels.added = missing;
    if (!dryRun && missing.length) await saveSettings({ requiredChannels: [...current, ...missing] });
  }

  /* ── إعدادات النقاط: perJoin إن كان ما زال على الافتراضي ── */
  if (opts.settings) {
    const refPoints = snapshot.settings?.refPoints;
    if (typeof refPoints === "number") {
      const config = await getPointsConfig();
      report.settings.perJoin = refPoints;
      report.settings.pointsEnabled = config.enabled;
      if (!dryRun && config.perJoin === 2 && refPoints !== 2) {
        await savePointsConfig({ perJoin: refPoints });
      }
    }
  }

  return report;
}
