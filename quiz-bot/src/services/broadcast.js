import { q, logEvent } from "../db.js";
import { config } from "../config.js";
import { tg } from "./telegram.js";
import { sleep } from "../util.js";

/**
 * بثّ تدريجي محصّن ضد الحظر:
 *  - سقف رسالة/ثانية منخفض (BROADCAST_PER_SEC)
 *  - فاصل عشوائي بين الرسائل (نُقلّد سلوك بشري)
 *  - يختبر أول 50 مستخدم فقط، وإذا كثر الفشل يتوقف تلقائياً
 *  - يتجاهل من حظر البوت (403) ويسجّلهم
 */

let current = null;

export function broadcastStatus() {
  if (!current) return null;
  return {
    id: current.id,
    at: current.at,
    total: current.total,
    sent: current.sent,
    failed: current.failed,
    blocked: current.blocked,
    done: current.done,
    text: current.text.slice(0, 200),
  };
}

export function startBroadcast(text) {
  if (current && !current.done) throw new Error("كاين بثّ جاري");
  const row = q.run("INSERT INTO broadcast_jobs(at, text) VALUES(?,?)", Date.now(), text);
  const id = Number(row.lastInsertRowid);
  const total = q.get("SELECT COUNT(*) AS n FROM users WHERE is_bot = 0 AND blocked = 0").n;
  q.run("UPDATE broadcast_jobs SET total = ? WHERE id = ?", total, id);
  current = {
    id,
    at: Date.now(),
    text,
    total,
    sent: 0,
    failed: 0,
    blocked: 0,
    done: false,
    cursor: 0,
  };
  run().catch((e) => logEvent("broadcast_error", { severity: "error", detail: String(e?.message ?? e) }));
  return broadcastStatus();
}

async function run() {
  const job = current;
  const perSec = Math.max(3, Math.min(28, config.telegram.broadcastPerSec));
  const delay = Math.ceil(1000 / perSec);
  let consecutiveFails = 0;

  while (job) {
    const batch = q.all(
      "SELECT tg_id FROM users WHERE is_bot = 0 AND blocked = 0 AND tg_id > ? ORDER BY tg_id LIMIT 50",
      job.cursor
    );
    if (!batch.length) break;

    for (const u of batch) {
      if (job.aborted) break;
      job.cursor = u.tg_id;
      const res = await tg.sendMessage(u.tg_id, job.text, {
        reply_markup: {
          inline_keyboard: [[{ text: "🎯 العب", callback_data: "quiz:play" }]],
        },
      });
      if (res?.ok) {
        job.sent++;
        consecutiveFails = 0;
      } else if (res?.error_code === 403) {
        job.blocked++;
        q.run("UPDATE users SET blocked = 1, block_reason = 'البوت محظور من المستخدم', blocked_at = ? WHERE tg_id = ?", Date.now(), u.tg_id);
      } else {
        job.failed++;
        consecutiveFails++;
      }
      q.run("UPDATE broadcast_jobs SET sent = ?, failed = ?, blocked = ?, cursor_id = ? WHERE id = ?", job.sent, job.failed, job.blocked, job.cursor, job.id);

      // حماية: توقف تلقائي لو الأخطاء متتالية (حظر جماعي محتمل)
      if (consecutiveFails >= 25) {
        job.aborted = "fails";
        logEvent("broadcast_abort", { severity: "error", detail: "25 فشل متتالي — توقف تلقائي" });
        break;
      }
      await sleep(delay + Math.floor(Math.random() * delay * 0.6));
    }
    if (job.aborted) break;
  }

  if (job) {
    job.done = true;
    q.run("UPDATE broadcast_jobs SET done = 1, sent = ?, failed = ?, blocked = ? WHERE id = ?", job.sent, job.failed, job.blocked, job.id);
    logEvent("broadcast_done", { detail: `sent=${job.sent} failed=${job.failed} blocked=${job.blocked}` });
  }
}
