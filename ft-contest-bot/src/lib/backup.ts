/**
 * 💾 النسخ الاحتياطي — يجمع كل بيانات البوت فـ JSON واحد.
 *
 * كيستعمل من:
 *   • GET /api/panel/backup?key=...            → تحميل نسخة (JSON) مباشرة للمتصفح
 *   • POST /api/panel/backup?key=...           → تخزين نسخة داخل قاعدة البيانات (system:backup:latest)
 *   • GET /api/cron/backup?key=CRON_SECRET     → نسخة تلقائية يومية (cron من vercel.json)
 *
 * الصيغ: mode=meta (الأرقام فقط) · mode=full (كلشي: أعضاء، مسابقات، نقاط، مراقب، سجل)
 */

import { getStore, storageInfo } from "./store";
import { getSettings } from "./settings";
import { listContests } from "./contests";
import { listAllUsers, allUserIds, usersCount } from "./users";
import { ensureRewards, ensureSections, getPointsConfig, listRequests, readAdminLog, topBalances } from "./rewards";
import { listReports } from "./monitor";

export const BACKUP_VERSION = 2;
const LATEST_KEY = "system:backup:latest";
const LIST_KEY = "system:backup:index";
const KEEP = 5;

export type BackupPayload = {
  version: number;
  at: number;
  iso: string;
  mode: "meta" | "full";
  storage: { backend: string; persistent: boolean };
  counts: Record<string, number>;
  settings?: unknown;
  contests?: unknown;
  users?: unknown;
  points?: unknown;
  rewards?: unknown;
  sections?: unknown;
  requests?: unknown;
  reports?: unknown;
  adminLog?: unknown;
  topBalances?: unknown;
};

/** يبني النسخة. `mode=full` كيجيب حتى بيانات الأعضاء (ثقيلة شوية). */
export async function buildBackup(mode: "meta" | "full" = "full"): Promise<BackupPayload> {
  const store = getStore();
  const [settings, contests, users, points, rewards, sections, requests, reports, adminLog, top, ids, count] =
    await Promise.all([
      getSettings().catch(() => null),
      listContests().catch(() => []),
      mode === "full" ? listAllUsers(5000).catch(() => []) : Promise.resolve([]),
      getPointsConfig().catch(() => null),
      mode === "full" ? ensureRewards().catch(() => []) : Promise.resolve([]),
      mode === "full" ? ensureSections().catch(() => []) : Promise.resolve([]),
      mode === "full" ? listRequests(500).catch(() => []) : Promise.resolve([]),
      listReports(300).catch(() => ({ reports: [], total: 0 })),
      mode === "full" ? readAdminLog(300).catch(() => []) : Promise.resolve([]),
      topBalances(50).catch(() => []),
      allUserIds().catch(() => []),
      usersCount().catch(() => 0),
    ]);

  const reportList = (reports as { reports?: unknown[] })?.reports || [];
  const [refsCount, claimsCount] = await Promise.all([
    store.zCount("ref:index").catch(() => 0),
    store.zCount("claims:index").catch(() => 0),
  ]);
  const payload: BackupPayload = {
    version: BACKUP_VERSION,
    at: Date.now(),
    iso: new Date().toISOString(),
    mode,
    storage: storageInfo() as unknown as { backend: string; persistent: boolean },
    counts: {
      users: count,
      userIds: ids.length,
      contests: Array.isArray(contests) ? contests.length : 0,
      requests: Array.isArray(requests) ? requests.length : 0,
      reports: reportList.length,
      adminLog: Array.isArray(adminLog) ? adminLog.length : 0,
      referralsLogged: refsCount,
      claims: claimsCount,
    },
    settings: settings || undefined,
    contests,
    users: mode === "full" ? users : undefined,
    points,
    rewards,
    sections,
    requests,
    reports: reportList,
    adminLog,
    topBalances: top,
  };
  return payload;
}

/** يخزّن النسخة داخل قاعدة البيانات (آخر 5 نسخ). */
export async function saveSnapshot(mode: "meta" | "full" = "full"): Promise<{ at: number; size: number; kept: number }> {
  const store = getStore();
  const payload = await buildBackup(mode);
  const json = JSON.stringify(payload);
  await store.set(LATEST_KEY, payload);
  await store.listPush(LIST_KEY, [JSON.stringify({ at: payload.at, iso: payload.iso, mode, bytes: json.length })]);
  let kept = 0;
  try {
    const index = await store.listAll(LIST_KEY, 100);
    kept = index.length;
    if (index.length > KEEP) {
      await store.delList(LIST_KEY);
      await store.listPush(LIST_KEY, index.slice(-KEEP));
      kept = KEEP;
    }
  } catch {
    /* ما وقفناش */
  }
  return { at: payload.at, size: json.length, kept };
}

/** آخر نسخة محفوظة فقاعدة البيانات (أو null). */
export async function latestSnapshot(): Promise<BackupPayload | null> {
  return getStore().get<BackupPayload>(LATEST_KEY).catch(() => null);
}
