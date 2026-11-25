import Link from "next/link";
import { loadDB } from "@/lib/store";
import { env } from "@/lib/env";
import { countUsers } from "@/lib/bot-utils";
import { APP } from "@/lib/defaults";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  let db;
  try {
    db = await loadDB();
  } catch {
    db = null;
  }
  const c = db ? countUsers(db) : { total: 0, points: 0, active24h: 0 };
  const bot = db?.meta.botUsername ?? "";
  const botUrl = bot ? `https://t.me/${bot}` : APP.channel.url;
  const rewards = (db?.rewards ?? []).filter((r) => r.active).sort((a, b) => a.order - b.order);
  const features = [
    { icon: "🎁", title: "هدية يومية", text: `${db?.settings.points.dailyMin ?? 1}–${db?.settings.points.dailyMax ?? 3} نقاط كل يوم + مكافأة سلسلة` },
    { icon: "🔗", title: "نظام إحالات", text: `+${db?.settings.points.refJoin ?? 3} نقطة لكل صديق، و+${db?.settings.points.refActive ?? 2} عند تفعيله` },
    { icon: "🎡", title: "عجلة الحظ", text: "دورات مجانية + دورات إضافية مع كل إحالات" },
    { icon: "🏆", title: "متصدرون مباشرون", text: "ترتيب لحظي بالنقاط وبأفضل الداعين" },
    { icon: "🛍️", title: "متجر جوائز", text: "استبدل نقاطك بحسابات وبطاقات وجوائز حقيقية" },
    { icon: "🏅", title: "مسابقات", text: "مسابقات دورية بجوائز إضافية للمتصدرين" },
  ];

  return (
    <main className="landing-hero">
      <div>
        <div className="row-between" style={{ marginBottom: 26 }}>
          <div className="brand" style={{ padding: 0 }}>
            <div className="brand-logo">🏆</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 17 }}>مسابقات MX</div>
              <div className="muted" style={{ fontSize: 11.5 }}>نقاط • جوائز • متصدرون</div>
            </div>
          </div>
          <div className="row">
            <Link href={APP.channel.url} className="btn btn-ghost btn-sm" target="_blank">
              📣 القناة
            </Link>
            <Link href="/admin" className="btn btn-primary btn-sm">
              🎛️ لوحة التحكم
            </Link>
          </div>
        </div>

        <div className="grid split" data-split="1">
          <div className="card" style={{ padding: "clamp(20px,4vw,38px)" }}>
            <span className="badge badge-gold" style={{ marginBottom: 14 }}>
              🔥 {c.total > 0 ? `${c.total} عضو نشط` : "انطلق الآن"}
            </span>
            <h1 style={{ lineHeight: 1.25 }}>
              اجمع <span className="gold">النقاط</span> من إحالاتك…
              <br />
              وحوّلها إلى <span className="emerald">جوائز حقيقية</span>
            </h1>
            <p className="muted" style={{ marginTop: 14, fontSize: 15 }}>
              {db?.settings.texts.startBody ??
                "هدية يومية، عجلة حظ، متصدرون، ونظام إحالات متطور — كل ذلك داخل بوت تيليجرام واحد."}
            </p>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 10, marginTop: 22,
            }}>
              {[
                { k: "الأعضاء", v: c.total },
                { k: "النقاط الموزعة", v: c.points },
                { k: "نشطون اليوم", v: c.active24h },
                { k: "جوائز", v: rewards.length },
              ].map((s) => (
                <div key={s.k} className="card-soft" style={{ padding: 13, textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900 }} className="gold">
                    {new Intl.NumberFormat("en-US").format(s.v)}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, fontWeight: 700 }}>{s.k}</div>
                </div>
              ))}
            </div>

            <div className="row wrap" style={{ marginTop: 24 }}>
              <Link href={botUrl} target="_blank" className="btn btn-primary btn-lg">
                🚀 ابدأ الآن على تيليجرام
              </Link>
              <Link href="/admin" className="btn btn-ghost btn-lg">
                🎛️ افتح لوحة التحكم
              </Link>
            </div>
            {bot && (
              <div className="muted" style={{ fontSize: 12, marginTop: 14 }}>
                البوت: <code className="gold">@{bot}</code> • القناة:{" "}
                <a href={APP.channel.url} target="_blank" className="gold">@{APP.channel.username}</a>
              </div>
            )}
          </div>

          <div className="card ai-glow" style={{ padding: 22 }}>
            <div className="row-between" style={{ marginBottom: 14 }}>
              <h3>🛍️ الجوائز المتاحة</h3>
              <span className="badge badge-green">متجر مباشر</span>
            </div>
            <div className="col" style={{ gap: 8 }}>
              {(rewards.length ? rewards : []).slice(0, 6).map((r) => (
                <div key={r.id} className="card-soft row-between" style={{ padding: "11px 13px" }}>
                  <div className="row" style={{ gap: 9 }}>
                    <span style={{ fontSize: 20 }}>{r.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{r.title}</div>
                      <div className="muted-2" style={{ fontSize: 11 }}>{r.desc}</div>
                    </div>
                  </div>
                  <span className="badge badge-gold">{r.cost} نقطة</span>
                </div>
              ))}
              {!rewards.length && <div className="empty">لا توجد جوائز بعد — أضفها من لوحة التحكم.</div>}
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 14, lineHeight: 1.8 }}>
              💡 كل جائزة تُسلّم بعد مراجعة الإدارة، وتصلك إشعارات فورية على تيليجرام.
            </div>
          </div>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginTop: 16 }}>
          {features.map((f) => (
            <div key={f.title} className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 22 }}>{f.icon}</div>
              <div style={{ fontWeight: 800, marginTop: 8, fontSize: 14 }}>{f.title}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.7 }}>{f.text}</div>
            </div>
          ))}
        </div>

        <div className="ticker" style={{ marginTop: 20 }}>
          <div>
            {Array.from({ length: 2 }).map((_, i) => (
              <span key={i}>
                🏆 مسابقات MX • قناة الاشتراك: @{APP.channel.username} • جوائز Coinbase و Google Play و Netflix •
                بوت + موقع مجانًا للمتصدر الأول • نقاط تُحفظ للأبد • ابدأ الآن 🚀
              </span>
            ))}
          </div>
        </div>

        <div className="center muted-2" style={{ fontSize: 11.5, marginTop: 22 }}>
          © {new Date().getFullYear()} مسابقات MX • {env.siteUrl.replace(/^https?:\/\//, "")}
        </div>
      </div>
    </main>
  );
}
