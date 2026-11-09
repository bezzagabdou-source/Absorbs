import { env } from "@/lib/env";
import { loadDB, mutate, readFresh } from "@/lib/store";
import { canVerifyChannel } from "@/lib/bot-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * إعادة البوت لحالة تشغيل طبيعية بعد اختبارات حقيقية. محميّ بسرّ الـ webhook.
 *
 * بوابة الاشتراك تُضبط حسب **القدرة الفعلية**: إن كان البوت أدمن في القناة
 * (يستطيع getChatMember) نُشغّل التحقق الحقيقي مع زر «✅ تحقّقت من الاشتراك»؛
 * وإن لم يكن أدمن فالتحقق مستحيل تقنيًا فلا نحجب أحدًا.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (key !== env.webhookSecret) return Response.json({ ok: false }, { status: 401 });

  // نفحص الصلاحية قبل القفل حتى لا نحتجزه أثناء نداء شبكة
  const current = await loadDB();
  let canVerify: boolean | null = null;
  try {
    canVerify = await canVerifyChannel(current);
  } catch {
    canVerify = null;
  }
  const verify = canVerify === true;

  const out = await mutate((db) => {
    const s = db.settings;
    s.maintenance = false;
    s.botEnabled = true;
    s.botName = "مسابقات MX";
    s.features.wheel = true;
    s.features.daily = true;
    s.features.shop = true;
    s.features.tasks = true;
    s.features.referrals = true;
    s.forceJoin.enabled = true;
    s.forceJoin.verify = verify;
    s.extraJoins = (s.extraJoins ?? []).filter((j) => j.username !== "mxabdou2");
    db.settings.points.dailyMin = 1;
    db.settings.points.dailyMax = 3;
    db.settings.points.refJoin = 3;
    // إزالة مخلفات الاختبار
    db.rewards = db.rewards.filter((r) => !/كونت بيس|نتفليكس بلس|PlayStation Plus/.test(r.title));
    db.contests = db.contests.filter((c) => !/رمضان|الاختبار/.test(c.title));
    db.tasks = db.tasks.filter((t) => !/mxabdou2/.test(t.target ?? ""));

    /**
     * إزالة حسابات الاختبار التي ينشئها /api/admin/sim (750000–799999)
     * حتى لا تتضخم قاعدة الإنتاج بأعضاء وهميين أو يتشوّه ترتيب المتصدرين.
     */
    let removed = 0;
    for (const [id, u] of Object.entries(db.users)) {
      const n = Number(id);
      if (n >= 750000 && n <= 799999 && u.username === "probe") {
        delete db.users[id];
        removed += 1;
      }
    }

    return {
      removedTestUsers: removed,
      maintenance: s.maintenance,
      botName: s.botName,
      wheel: s.features.wheel,
      verify: s.forceJoin.verify,
      canVerify,
      rewards: db.rewards.map((r) => `${r.title}:${r.cost}`),
      contests: db.contests.map((c) => c.title),
      tasks: db.tasks.map((t) => `${t.title}(${t.points})`),
      daily: `${s.points.dailyMin}-${s.points.dailyMax}`,
      refJoin: s.points.refJoin,
      extraJoins: (s.extraJoins ?? []).map((j) => j.username),
    };
  });

  const fresh = await readFresh();
  return Response.json({
    ok: true,
    applied: out,
    persisted: fresh
      ? {
          botName: fresh.settings.botName,
          maintenance: fresh.settings.maintenance,
          verify: fresh.settings.forceJoin.verify,
        }
      : null,
  });
}
