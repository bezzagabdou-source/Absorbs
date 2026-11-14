/**
 * 🩹 إصلاح ذاتي للحالة الحرجة — كيتنفّذ من الكرون ومن نقاط الفحص.
 *
 * الفكرة: بدل ما نستنّو المالك يفتح الصفحة ويدير «تحديث» باش يصلح الويب هوك،
 * البوت كيتفحّص راسو ويكمّل الناقص: الترحيلات، الكتابات المتراكمة، منيو الأوامر.
 * كل خطوة مستقلة — فشل واحدة ما كيمنعش الباقي.
 */
import { retryPendingWrites, storageInfo } from "./store";
import { dbHealth, migrationsInfo } from "./store";
import { logError } from "./errors";
import { tgCall } from "./telegram";
import { BOT_COMMANDS } from "./botSetup";

export type HealStep = { step: string; ok: boolean; detail: string };

export type HealReport = {
  ok: boolean;
  steps: HealStep[];
  retriedWrites: number;
};

/**
 * كتصلّح شنو ممكن يتصلّح بلا تدخّل بشري.
 * ما كترميش أبداً: كل خطوة في try/catch، والنتيجة كترجع حتى إلا فشل كلشي.
 */
export async function runHealthRepair(): Promise<HealReport> {
  const steps: HealStep[] = [];
  const push = (step: string, ok: boolean, detail: string) => steps.push({ step, ok, detail });

  // 1) الكتابات المتراكمة وقت عطل القاعدة
  let retriedWrites = 0;
  try {
    const result = await retryPendingWrites();
    retriedWrites = result.applied;
    push("pending-writes", result.pending === 0, `${result.applied} applied · ${result.pending} pending`);
  } catch (error) {
    push("pending-writes", false, String((error as Error)?.message || error).slice(0, 160));
  }

  // 2) الترحيلات الناقصة (كتتطبّق تلقائياً أول قراءة ناجحة)
  try {
    const info = await migrationsInfo();
    push("migrations", info.pending.length === 0, info.pending.length ? `pending: ${info.pending.join(",")}` : "up-to-date");
  } catch (error) {
    push("migrations", false, String((error as Error)?.message || error).slice(0, 160));
  }

  // 3) القاعدة (معلوماتي — العطل ما كيوقّفش)
  try {
    const db = await dbHealth();
    push("database", db.ok, db.ok ? `${db.backend} ${db.latencyMs}ms` : db.error.slice(0, 160));
  } catch (error) {
    push("database", false, String((error as Error)?.message || error).slice(0, 160));
  }

  // 4) منيو الأوامر (باش البوت يبان منظم حتى بعد أي إعادة نشر)
  try {
    const res = await tgCall("setMyCommands", { commands: BOT_COMMANDS });
    push("commands", res.ok, res.ok ? "updated" : String(res.description || "failed").slice(0, 160));
  } catch (error) {
    push("commands", false, String((error as Error)?.message || error).slice(0, 160));
  }

  const critical = steps.filter((s) => ["pending-writes", "migrations", "database"].includes(s.step));
  const ok = critical.every((s) => s.ok);
  if (!ok) {
    const failed = steps.filter((s) => !s.ok).map((s) => `${s.step}: ${s.detail}`).join(" | ");
    void logError("cron", new Error("health repair incomplete"), { steps: failed.slice(0, 600) }).catch(() => undefined);
  } else {
    void storageInfo();
  }
  return { ok, steps, retriedWrites };
}
