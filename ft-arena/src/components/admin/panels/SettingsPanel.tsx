"use client";
import { useCallback, useEffect, useState } from "react";
import { Field, Spinner, Toggle, api, toast } from "../ui";
import TasksPanel from "./TasksPanel";

type Settings = {
  botVersion: string;
  botEnabled: boolean;
  maintenance: boolean;
  maintenanceText: string;
  botName: string;
  brandEmoji: string;
  lang: "ar" | "fr" | "en";
  forceJoin: { enabled: boolean; username: string; title: string; url: string; verify: boolean };
  extraJoins: { enabled: boolean; username: string; title: string; url: string; verify: boolean }[];
  points: {
    dailyMin: number;
    dailyMax: number;
    streakEveryDays: number;
    streakBonus: number;
    maxStreakBonus: number;
    refJoin: number;
    refActive: number;
    wheelCooldownHours: number;
    wheelExtraPerRefs: number;
    shareBonus: number;
  };
  features: Record<string, boolean>;
  texts: {
    startTitle: string;
    startBody: string;
    startButton: string;
    startMedia?: string;
    rules: string;
    support: string;
    shareText: string;
  };
  admin: { notifyOnJoin: boolean; notifyOnRedeem: boolean; adminChatId?: string };
  security: { minAccountAgeDays: number; antiSpam: boolean; blockSelfReferral: boolean; requireJoinForRewards: boolean };
  ai: { enabled: boolean; provider: string; model: string; autoApply: boolean };
};

const FEATURES: [string, string, string][] = [
  ["daily", "🎁", "الهدية اليومية"],
  ["wheel", "🎡", "عجلة الحظ"],
  ["leaderboard", "🏆", "المتصدرون"],
  ["referrals", "🔗", "نظام الإحالات"],
  ["tasks", "✅", "المهام"],
  ["shop", "🛍️", "المتجر"],
  ["contests", "🏅", "المسابقات"],
];

export default function SettingsPanel() {
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"pts" | "txt" | "join" | "tasks" | "adv">("pts");

  const load = useCallback(async () => {
    try {
      const r = await api<{ settings: Settings }>("/api/admin/settings");
      setS(r.settings);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function save() {
    if (!s) return;
    setBusy(true);
    try {
      await api("/api/admin/settings", { settings: s });
      toast("تم الحفظ وتطبيقه فورًا ✅", "ok");
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <div className="card" style={{ padding: 40, display: "grid", placeItems: "center" }}><Spinner /></div>;

  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch });
  const setPoints = (patch: Partial<Settings["points"]>) => setS({ ...s, points: { ...s.points, ...patch } });
  const setTexts = (patch: Partial<Settings["texts"]>) => setS({ ...s, texts: { ...s.texts, ...patch } });
  const setJoin = (patch: Partial<Settings["forceJoin"]>) => setS({ ...s, forceJoin: { ...s.forceJoin, ...patch } });

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card row-between wrap" style={{ padding: 14 }}>
        <div className="pillbar">
          {([
            ["pts", "💰 النقاط"],
            ["txt", "📝 النصوص"],
            ["join", "🔒 الاشتراك"],
            ["tasks", "✅ المهام والعجلة"],
            ["adv", "🧩 الميزات والمتقدّم"],
          ] as const).map(([k, l]) => (
            <button key={k} className={`pill ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <div className="row">
          <span className="badge badge-muted">v{s.botVersion}</span>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : "💾 حفظ الكل"}</button>
        </div>
      </div>

      {tab === "pts" && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>🎁 الهدية اليومية</h3>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="أقل نقاط"><input className="input" type="number" value={s.points.dailyMin} onChange={(e) => setPoints({ dailyMin: Number(e.target.value) })} /></Field>
              <Field label="أكثر نقاط"><input className="input" type="number" value={s.points.dailyMax} onChange={(e) => setPoints({ dailyMax: Number(e.target.value) })} /></Field>
            </div>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="مكافأة السلسلة كل (أيام)"><input className="input" type="number" value={s.points.streakEveryDays} onChange={(e) => setPoints({ streakEveryDays: Number(e.target.value) })} /></Field>
              <Field label="قيمة مكافأة السلسلة"><input className="input" type="number" value={s.points.streakBonus} onChange={(e) => setPoints({ streakBonus: Number(e.target.value) })} /></Field>
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>🔗 الإحالات</h3>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="نقاط دخول الصديق"><input className="input" type="number" value={s.points.refJoin} onChange={(e) => setPoints({ refJoin: Number(e.target.value) })} /></Field>
              <Field label="نقاط تأكيد الصديق"><input className="input" type="number" value={s.points.refActive} onChange={(e) => setPoints({ refActive: Number(e.target.value) })} /></Field>
            </div>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="إحالات = دورة عجلة"><input className="input" type="number" value={s.points.wheelExtraPerRefs} onChange={(e) => setPoints({ wheelExtraPerRefs: Number(e.target.value) })} /></Field>
              <Field label="نقاط المشاركة"><input className="input" type="number" value={s.points.shareBonus} onChange={(e) => setPoints({ shareBonus: Number(e.target.value) })} /></Field>
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>🎡 العجلة</h3>
            <Field label="مدة الانتظار بين الدورات (ساعات)">
              <input className="input" type="number" value={s.points.wheelCooldownHours} onChange={(e) => setPoints({ wheelCooldownHours: Number(e.target.value) })} />
            </Field>
            <Field label="أقصى مكافأة سلسلة">
              <input className="input" type="number" value={s.points.maxStreakBonus} onChange={(e) => setPoints({ maxStreakBonus: Number(e.target.value) })} />
            </Field>
          </div>
        </div>
      )}

      {tab === "txt" && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>👋 رسالة الترحيب</h3>
            <Field label="عنوان الترحيب"><input className="input" value={s.texts.startTitle} onChange={(e) => setTexts({ startTitle: e.target.value })} /></Field>
            <Field label="نص البداية"><textarea className="textarea" rows={4} value={s.texts.startBody} onChange={(e) => setTexts({ startBody: e.target.value })} /></Field>
            <Field label="نص المشاركة"><textarea className="textarea" rows={2} value={s.texts.shareText} onChange={(e) => setTexts({ shareText: e.target.value })} /></Field>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>📚 القوانين والدعم</h3>
            <Field label="القوانين"><textarea className="textarea" rows={5} value={s.texts.rules} onChange={(e) => setTexts({ rules: e.target.value })} /></Field>
            <Field label="الدعم"><textarea className="textarea" rows={3} value={s.texts.support} onChange={(e) => setTexts({ support: e.target.value })} /></Field>
            <Field label="صورة الترحيب (file_id أو رابط)">
              <input className="input" value={s.texts.startMedia ?? ""} onChange={(e) => setTexts({ startMedia: e.target.value })} />
            </Field>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>🎨 الهوية</h3>
            <div className="grid" style={{ gridTemplateColumns: "1fr 90px" }}>
              <Field label="اسم البوت"><input className="input" value={s.botName} onChange={(e) => set({ botName: e.target.value })} /></Field>
              <Field label="الرمز"><input className="input center" value={s.brandEmoji} onChange={(e) => set({ brandEmoji: e.target.value.slice(0, 4) })} /></Field>
            </div>
            <Field label="لغة البوت الافتراضية">
              <select className="select" value={s.lang} onChange={(e) => set({ lang: e.target.value as Settings["lang"] })}>
                <option value="ar">العربية</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Field label="نص الصيانة"><textarea className="textarea" rows={2} value={s.maintenanceText} onChange={(e) => set({ maintenanceText: e.target.value })} /></Field>
          </div>
        </div>
      )}

      {tab === "join" && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="row-between" style={{ marginBottom: 12 }}>
              <h3>🔒 قناة الاشتراك الإجباري</h3>
              <span className={`badge ${s.forceJoin.enabled ? "badge-green" : "badge-muted"}`}>{s.forceJoin.enabled ? "مفعّل" : "معطّل"}</span>
            </div>
            <Toggle on={s.forceJoin.enabled} onChange={(v) => setJoin({ enabled: v })} label="تفعيل الاشتراك الإجباري" desc="لن يستخدم البوت إلا بعد الاشتراك في قناتك" />
            <Field label="معرّف القناة (@username)">
              <input className="input" value={s.forceJoin.username} onChange={(e) => setJoin({ username: e.target.value.replace(/^@/, "") })} placeholder="mxabdou" />
            </Field>
            <Field label="اسم القناة المعروض"><input className="input" value={s.forceJoin.title} onChange={(e) => setJoin({ title: e.target.value })} /></Field>
            <Field label="رابط القناة"><input className="input" value={s.forceJoin.url} onChange={(e) => setJoin({ url: e.target.value })} /></Field>
            <Toggle on={s.forceJoin.verify} onChange={(v) => setJoin({ verify: v })} label="تحقق حقيقي عبر getChatMember" desc="يتطلب أن يكون البوت أدمنًا في القناة لتأكيد الاشتراك" />
            <a className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 6 }} href={s.forceJoin.url} target="_blank">📣 فتح القناة</a>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>➕ قنوات إضافية</h3>
            {s.extraJoins.map((j, i) => (
              <div key={i} className="card-soft" style={{ padding: 10, marginBottom: 8 }}>
                <div className="row">
                  <input className="input grow" placeholder="@channel" value={j.username}
                    onChange={(e) => set(({
                      extraJoins: s.extraJoins.map((x, idx) => idx === i ? { ...x, username: e.target.value.replace(/^@/, "") } : x),
                    }))} />
                  <input className="input" style={{ width: 110 }} placeholder="الاسم" value={j.title}
                    onChange={(e) => set(({ extraJoins: s.extraJoins.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x) }))} />
                  <button className="toggle" data-on={j.enabled} onClick={() => set(({ extraJoins: s.extraJoins.map((x, idx) => idx === i ? { ...x, enabled: !x.enabled } : x) }))} aria-label="تفعيل" />
                  <button className="btn btn-ghost btn-sm" onClick={() => set(({ extraJoins: s.extraJoins.filter((_, idx) => idx !== i) }))}>✕</button>
                </div>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => set(({ extraJoins: [...s.extraJoins, { enabled: true, username: "", title: "", url: "", verify: true }] }))}>
              ➕ أضف قناة
            </button>
          </div>
        </div>
      )}

      {tab === "tasks" && <TasksPanel />}

      {tab === "adv" && (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>🧩 ميزات البوت</h3>
            {FEATURES.map(([k, icon, label]) => (
              <Toggle
                key={k}
                on={Boolean(s.features[k])}
                onChange={(v) => set(({ features: { ...s.features, [k]: v } }))}
                label={`${icon} ${label}`}
              />
            ))}
          </div>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>⚙️ إعدادات عامة</h3>
            <Toggle on={s.botEnabled} onChange={(v) => set({ botEnabled: v })} label="البوت يعمل" />
            <Toggle on={s.maintenance} onChange={(v) => set({ maintenance: v })} label="وضع الصيانة 🛠️" desc="الأدمن فقط يستطيع استخدام البوت" />
            <Field label="معرّف محادثة الأدمن (ADMIN_CHAT_ID)" hint="لتلقي إشعارات الانضمام والطلبات + رسالة تجربة">
              <input className="input" value={s.admin.adminChatId ?? ""} onChange={(e) => set({ admin: { ...s.admin, adminChatId: e.target.value } })} placeholder="مثال: 123456789" />
            </Field>
            <Toggle on={s.admin.notifyOnJoin} onChange={(v) => set({ admin: { ...s.admin, notifyOnJoin: v } })} label="إشعار عند دخول عضو جديد" desc="يظهر اسم وصورة من دعاه ← ومن دخل" />
            <Toggle on={s.admin.notifyOnRedeem} onChange={(v) => set({ admin: { ...s.admin, notifyOnRedeem: v } })} label="إشعار عند كل طلب استبدال" />
          </div>
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>🛡️ الأمان</h3>
            <Toggle on={s.security.antiSpam} onChange={(v) => set({ security: { ...s.security, antiSpam: v } })} label="مكافحة السبام" />
            <Toggle on={s.security.blockSelfReferral} onChange={(v) => set({ security: { ...s.security, blockSelfReferral: v } })} label="منع إحالة النفس" />
            <Toggle on={s.security.requireJoinForRewards} onChange={(v) => set({ security: { ...s.security, requireJoinForRewards: v } })} label="الاشتراك شرط للجوائز" />
            <Field label="أقل عمر للحساب (أيام) لمنع الوهمي">
              <input className="input" type="number" value={s.security.minAccountAgeDays} onChange={(e) => set({ security: { ...s.security, minAccountAgeDays: Number(e.target.value) } })} />
            </Field>
          </div>
        </div>
      )}

      <div className="card row-between" style={{ padding: 12 }}>
        <span className="muted" style={{ fontSize: 12 }}>⚠️ لا تنسَ الحفظ — التغييرات تُطبَّق فورًا على البوت.</span>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner /> : "💾 حفظ الكل"}</button>
      </div>
    </div>
  );
}
