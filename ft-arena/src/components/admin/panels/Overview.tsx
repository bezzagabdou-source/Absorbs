"use client";
import { useEffect, useState } from "react";
import { Avatar, Copy, Empty, Num, Spinner, api, fmtNum, relTime, toast } from "../ui";

type Stats = {
  ok: boolean;
  store: string;
  bot: { configured: boolean; online: boolean; username?: string; name?: string; webhook?: { url?: string; pending_update_count?: number; last_error_message?: string } | null };
  ai: { name: string; label: string; configured: boolean }[];
  stats: Record<string, number>;
  series: { day: string; users: number; points: number; events: number; refs: number }[];
  top: { id: number; name: string; username?: string; points: number; refs: number; photo?: string | null }[];
  topRefs: { id: number; name: string; refs: number; points: number }[];
  recent: { at: string; actor: string; title: string; detail?: string; icon?: string }[];
  settings: { botEnabled: boolean; maintenance: boolean; forceJoin: { enabled: boolean; username: string; title: string }; points: { dailyMin: number; dailyMax: number } };
  site: string;
};

type TabId = "overview" | "users" | "store" | "claims" | "settings" | "broadcast" | "ai" | "bot" | "contests" | "library" | "activity";

const KPI = [
  { key: "total", label: "إجمالي الأعضاء", icon: "👥", tone: "gold" },
  { key: "active24h", label: "نشطون 24 ساعة", icon: "⚡️", tone: "emerald" },
  { key: "newToday", label: "أعضاء جدد اليوم", icon: "✨", tone: "blue" },
  { key: "points", label: "النقاط في المحافظ", icon: "💎", tone: "gold" },
  { key: "pendingClaims", label: "طلبات معلّقة", icon: "📦", tone: "red" },
  { key: "referrals", label: "إحالات مكتملة", icon: "🤝", tone: "emerald" },
  { key: "visitsToday", label: "زيارات اليوم", icon: "👀", tone: "blue" },
  { key: "dailyClaims", label: "هدايا مستلمة", icon: "🎁", tone: "gold" },
];

export default function Overview({ onGoto }: { onGoto: (t: TabId) => void }) {
  const [data, setData] = useState<Stats | null>(null);
  const [days, setDays] = useState(14);
  const [metric, setMetric] = useState<"users" | "events" | "refs" | "points">("users");
  const [busy, setBusy] = useState(false);

  async function load(d = days) {
    setBusy(true);
    try {
      const res = await api<Stats>(`/api/admin/stats?days=${d}`);
      setData(res);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  if (!data) {
    return (
      <div className="card" style={{ padding: 44, display: "grid", placeItems: "center", gap: 12 }}>
        <Spinner />
        <span className="muted">جارٍ تحميل الإحصائيات…</span>
      </div>
    );
  }

  const s = data.stats;
  const max = Math.max(1, ...data.series.map((x) => x[metric]));

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))" }}>
        {KPI.map((k) => (
          <div key={k.key} className="card kpi">
            <div className="row-between">
              <span className="kpi-label">{k.label}</span>
              <span style={{ fontSize: 17 }}>{k.icon}</span>
            </div>
            <div className={`kpi-value ${k.tone === "emerald" ? "emerald" : k.tone === "red" ? "red" : k.tone === "blue" ? "" : "gold"}`}>
              {fmtNum(s[k.key] ?? 0)}
            </div>
            <div className="kpi-delta muted-2">
              {k.key === "total" && `نشطون 7 أيام: ${fmtNum(s.active7d ?? 0)}`}
              {k.key === "active24h" && `استمرارية: ${s.retention ?? 0}%`}
              {k.key === "newToday" && `معدل التحويل: ${s.conversion ?? 0}%`}
              {k.key === "points" && `موزّعة: ${fmtNum(s.pointsGiven ?? 0)} • مستهلكة: ${fmtNum(s.pointsSpent ?? 0)}`}
              {k.key === "pendingClaims" && `تم التسليم: ${fmtNum(s.delivered ?? 0)}`}
              {k.key === "referrals" && `داعون: ${fmtNum(s.referrers ?? 0)}`}
              {k.key === "visitsToday" && `الإجمالي: ${fmtNum(s.visits ?? 0)}`}
              {k.key === "dailyClaims" && `دورات العجلة: ${fmtNum(s.wheelSpins ?? 0)}`}
            </div>
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)" }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="row-between wrap" style={{ marginBottom: 12 }}>
            <h3>📈 النمو خلال الفترة</h3>
            <div className="row wrap">
              <div className="pillbar">
                {(["users", "events", "refs", "points"] as const).map((m) => (
                  <button key={m} className={`pill ${metric === m ? "active" : ""}`} onClick={() => setMetric(m)}>
                    {m === "users" ? "أعضاء" : m === "events" ? "تفاعل" : m === "refs" ? "إحالات" : "نشاط نقاط"}
                  </button>
                ))}
              </div>
              <div className="pillbar">
                {[7, 14, 30].map((d) => (
                  <button key={d} className={`pill ${days === d ? "active" : ""}`} onClick={() => setDays(d)}>
                    {d}ي
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="chart">
            {data.series.map((x) => (
              <div
                key={x.day}
                className={`bar ${metric === "refs" ? "green" : ""}`}
                style={{ height: `${Math.max(3, (x[metric] / max) * 100)}%` }}
                title={`${x.day}: ${x[metric]}`}
              >
                {data.series.length <= 16 && <span>{x.day.slice(5)}</span>}
              </div>
            ))}
          </div>
          <div style={{ height: 22 }} />
          <div className="row wrap muted-2" style={{ fontSize: 11.5, gap: 16 }}>
            <span>مجموع الفترة: <b className="gold">{fmtNum(data.series.reduce((a, x) => a + x[metric], 0))}</b></span>
            <span>الذروة: <b className="gold">{fmtNum(max)}</b></span>
            {busy && <Spinner />}
          </div>
        </div>

        <div className="col" style={{ gap: 12 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="row-between" style={{ marginBottom: 10 }}>
              <h3>🤖 حالة النظام</h3>
              <span className={`badge ${data.bot.online ? "badge-green" : "badge-red"}`}>
                {data.bot.online ? "متصل" : "غير متصل"}
              </span>
            </div>
            <div className="col" style={{ gap: 8, fontSize: 12.5 }}>
              <Row k="البوت" v={data.bot.username ? `@${data.bot.username}` : "—"} />
              <Row k="Webhook" v={data.bot.webhook?.url ? "مضبوط ✅" : "غير مضبوط ⚠️"} />
              <Row k="التخزين" v={data.store} />
              <Row k="الصيانة" v={data.settings.maintenance ? "مفعّلة 🛠️" : "متوقفة"} />
              <Row k="الاشتراك الإجباري" v={data.settings.forceJoin.enabled ? `@${data.settings.forceJoin.username}` : "معطّل"} />
              <Row k="الهدية اليومية" v={`${data.settings.points.dailyMin}–${data.settings.points.dailyMax} نقطة`} />
            </div>
            {(!data.bot.webhook?.url || !data.bot.online) && (
              <button className="btn btn-primary btn-sm" style={{ width: "100%", marginTop: 12 }} onClick={() => onGoto("bot")}>
                🔗 اضبط الاتصال الآن
              </button>
            )}
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <h3>🧠 محركات الذكاء</h3>
              <span className="badge badge-muted">{data.ai.filter((a) => a.configured).length}/{data.ai.length}</span>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {data.ai.map((a) => (
                <span key={a.name} className={`badge ${a.configured ? "badge-green" : "badge-muted"}`}>
                  {a.label}
                </span>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 10 }} onClick={() => onGoto("ai")}>
              افتح الكونسول الذكي ↗
            </button>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <h3>🏆 أفضل 8 أعضاء</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => onGoto("users")}>الكل ↗</button>
          </div>
          <div className="col" style={{ gap: 7 }}>
            {data.top.length ? (
              data.top.map((u, i) => (
                <div key={u.id} className="row" style={{ gap: 10 }}>
                  <span className="muted-2" style={{ width: 18, fontSize: 11 }}>{i + 1}</span>
                  <Avatar src={u.photo ? `/api/avatar/${u.id}` : null} name={u.name} size="sm" />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.name}
                    </div>
                    <div className="muted-2" style={{ fontSize: 10.5 }}>
                      {u.username ? `@${u.username} • ` : ""}{u.refs} إحالة
                    </div>
                  </div>
                  <span className="badge badge-gold">{fmtNum(u.points)}</span>
                </div>
              ))
            ) : (
              <Empty text="لا يوجد أعضاء بعد — شارك رابط البوت!" />
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <h3>🤝 أفضل الداعين</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => onGoto("broadcast")}>بث ↗</button>
          </div>
          <div className="col" style={{ gap: 7 }}>
            {data.topRefs.length ? (
              data.topRefs.map((u) => (
                <div key={u.id} className="row-between card-soft" style={{ padding: "8px 11px" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{u.name}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <span className="badge badge-green">{u.refs} إحالة</span>
                    <span className="badge badge-muted">{fmtNum(u.points)}</span>
                  </span>
                </div>
              ))
            ) : (
              <Empty text="لا توجد إحالات بعد." />
            )}
          </div>
          <div className="card-soft" style={{ padding: 11, marginTop: 10, fontSize: 11.5 }}>
            📎 رابط المشاركة السريع:
            <div className="row" style={{ marginTop: 6 }}>
              <code className="gold grow" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>
                {data.site}/s/…
              </code>
              <Copy text={data.site} label="" />
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <h3>🛰️ آخر الأحداث</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => onGoto("activity")}>السجل ↗</button>
          </div>
          <div className="col" style={{ gap: 8 }}>
            {data.recent.length ? (
              data.recent.slice(0, 8).map((a, i) => (
                <div key={i} className="row" style={{ gap: 9, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 14 }}>{a.icon ?? "•"}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{a.title}</div>
                    <div className="muted-2" style={{ fontSize: 10.5 }}>
                      {relTime(a.at)}{a.detail ? ` • ${a.detail.slice(0, 48)}` : ""}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <Empty text="لا توجد أحداث بعد." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="row-between">
      <span className="muted">{k}</span>
      <span style={{ fontWeight: 700 }}>{v}</span>
    </div>
  );
}
