/** بيانات اللوحة: إحصائيات + رسوم بيانية لكل فترة */
import { guard, json, safeDetail } from "@/lib/api";
import { loadDB, storeMode } from "@/lib/store";
import { countUsers, topUsers, refLink } from "@/lib/bot-utils";
import { detectAIProviders, env } from "@/lib/env";
import { getWebhookInfo, safeTg } from "@/lib/tg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(d);
}

export async function GET(req: Request) {
  const g = await guard();
  if (g) return g;
  try {
    const db = await loadDB();
    const url = new URL(req.url);
    const days = Math.min(60, Math.max(7, Number(url.searchParams.get("days") ?? 14)));

    const now = new Date();
    const series: { day: string; users: number; points: number; events: number; refs: number }[] = [];
    const users = Object.values(db.users);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400_000);
      const k = dayKey(d);
      series.push({
        day: k,
        users: users.filter((u) => dayKey(new Date(u.joinedAt)) === k).length,
        points: db.events.filter((e) => ["daily", "spin", "task", "ref"].includes(e.type) && dayKey(new Date(e.at)) === k).length,
        events: db.events.filter((e) => dayKey(new Date(e.at)) === k).length,
        refs: db.events.filter((e) => e.type === "ref" && dayKey(new Date(e.at)) === k).length,
      });
    }

    const c = countUsers(db);
    const today = dayKey(now);
    const newToday = users.filter((u) => dayKey(new Date(u.joinedAt)) === today).length;
    const dailyToday = users.filter((u) => u.daily.lastAt === today).length;
    const pending = db.claims.filter((x) => x.status === "pending").length;

    let webhook: unknown = null;
    try {
      const info = await getWebhookInfo();
      webhook = info ?? null;
    } catch {
      webhook = null;
    }

    const me = await safeTg<{ id: number; username?: string; first_name?: string }>("getMe");

    return json({
      ok: true,
      store: await storeMode(),
      bot: {
        configured: Boolean(env.botToken),
        online: Boolean(me),
        username: me?.username ?? db.meta.botUsername ?? null,
        name: me?.first_name ?? db.meta.botName ?? db.settings.botName,
        webhook,
      },
      ai: detectAIProviders(),
      stats: {
        ...c,
        newToday,
        dailyToday,
        pendingClaims: pending,
        totalClaims: db.claims.length,
        delivered: db.claims.filter((x) => x.status === "delivered" || x.status === "approved").length,
        visits: db.counters.visits,
        visitsToday: db.counters.visitsToday,
        messages: db.counters.messages,
        pointsGiven: db.counters.pointsGiven,
        pointsSpent: db.counters.pointsSpent,
        referrals: db.counters.referrals,
        dailyClaims: db.counters.dailyClaims,
        wheelSpins: db.counters.wheelSpins,
        conversion: c.total ? Math.round((c.withPoints / c.total) * 100) : 0,
        refRate: c.total ? Math.round((c.referrers / c.total) * 100) : 0,
        retention: c.total ? Math.round((c.active7d / c.total) * 100) : 0,
      },
      series,
      top: topUsers(db, 8).map((u) => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || String(u.id),
        username: u.username,
        points: u.points,
        refs: u.refCount,
        photo: u.photo ?? null,
      })),
      topRefs: topUsers(db, 5, "refs").map((u) => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || String(u.id),
        refs: u.refActive,
        points: u.points,
      })),
      recent: db.activity.slice(0, 12),
      settings: {
        botEnabled: db.settings.botEnabled,
        maintenance: db.settings.maintenance,
        forceJoin: db.settings.forceJoin,
        features: db.settings.features,
        points: db.settings.points,
      },
      site: env.siteUrl,
    });
  } catch (e) {
    return json({ ok: false, error: safeDetail(e) }, 500);
  }
}
