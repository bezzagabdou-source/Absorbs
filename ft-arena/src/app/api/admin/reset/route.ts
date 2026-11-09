import { env } from "@/lib/env";
import { mutate, readFresh } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** إعادة البوت لحالة تشغيل طبيعية بعد اختبارات حقيقية. محميّ بسرّ الـ webhook. */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (key !== env.webhookSecret) return Response.json({ ok: false }, { status: 401 });

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
    s.forceJoin.verify = false; // البوت ليس أدمن → التحقق مستحيل، لا نحجب
    s.extraJoins = (s.extraJoins ?? []).filter((j) => j.username !== "mxabdou2");
    db.settings.points.dailyMin = 1;
    db.settings.points.dailyMax = 3;
    db.settings.points.refJoin = 3;
    // إزالة مخلفات الاختبار
    db.rewards = db.rewards.filter((r) => !/كونت بيس|نتفليكس بلس|PlayStation Plus/.test(r.title));
    db.contests = db.contests.filter((c) => !/رمضان|الاختبار/.test(c.title));
    db.tasks = db.tasks.filter((t) => !/mxabdou2/.test(t.target ?? ""));
    return {
      maintenance: s.maintenance,
      botName: s.botName,
      wheel: s.features.wheel,
      verify: s.forceJoin.verify,
      rewards: db.rewards.map((r) => `${r.title}:${r.cost}`),
      contests: db.contests.map((c) => c.title),
      tasks: db.tasks.map((t) => `${t.title}(${t.points})`),
      daily: `${s.points.dailyMin}-${s.points.dailyMax}`,
      refJoin: s.points.refJoin,
      extraJoins: (s.extraJoins ?? []).map((j) => j.username),
    };
  });

  const fresh = await readFresh();
  return Response.json({ ok: true, applied: out, persisted: fresh ? { botName: fresh.settings.botName, maintenance: fresh.settings.maintenance } : null });
}
