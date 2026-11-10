"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* ══════════════════════════════════════════════════════════════════════════
   لوحة التحكم الجديدة — كلش في بلاصة وحدة + FT AI
   ══════════════════════════════════════════════════════════════════════════ */

type Section = { id: string; title: string; emoji: string; order: number; active: boolean };
type Reward = {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  cost: number;
  stock: number | null;
  active: boolean;
  order: number;
  delivery: string;
  section?: string;
  image?: string;
};
type UserRow = { id: string; firstName: string; username: string; joinedAt: number; points: number; banned: boolean };
type LogRow = { at: number; op: string; detail: string; via: string };
type Outcome = { op: string; ok: boolean; detail: string };
type AiRun = { say: string; actions: { op: string; [k: string]: unknown }[]; results: Outcome[]; refused: string[] };
type Data = {
  rewards: Reward[];
  sections: Section[];
  points: { perJoin: number; perActivated: number; dailyMin: number; dailyMax: number; shopIntro: string; enabled: boolean };
  settings: {
    ownerUsername: string;
    supportUsername: string;
    welcomeText?: string;
    rulesText?: string;
    requiredChannels: string[];
    requireJoin: boolean;
    aiEnabled: boolean;
  };
  requests: { id: string; userName: string; rewardTitle: string; cost: number; status: string; at: number }[];
  contests: { id: string; title: string; status: string; target: number }[];
  top: { userId: string; points: number }[];
  stats: { users: number; rewards: number; activeRewards: number; banned: number; pointsEnabled: boolean; gate: boolean; ai: { available: boolean; provider: string } };
  ai: { available: boolean; provider: string; model: string };
  ops: string[];
  storage: { backend: string; persistent: boolean };
};

type ChatMsg = { who: "me" | "ai"; text: string; results?: Outcome[]; refused?: string[] };

const TABS = [
  { id: "ai", label: "🤖 FT AI" },
  { id: "rewards", label: "🎁 الجوائز" },
  { id: "users", label: "👥 المستخدمين" },
  { id: "message", label: "✉️ الرسائل" },
  { id: "gate", label: "🔒 القنوات" },
  { id: "texts", label: "📝 النصوص" },
  { id: "contests", label: "🏆 المسابقات" },
  { id: "stats", label: "📊 إحصائيات" },
  { id: "log", label: "🧾 السجل" },
] as const;

const SECTION_META: Record<string, { label: string; emoji: string }> = {
  accounts: { label: "حسابات بيس", emoji: "🎁" },
  points: { label: "نقاط", emoji: "⭐️" },
  services: { label: "خدمات", emoji: "🤝" },
};

async function api(body: Record<string, unknown>) {
  const res = await fetch("/api/admin2", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.ok === false) throw new Error(String(json.error || `فشل (${res.status})`));
  return json;
}

export default function Panel() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [logging, setLogging] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<string>("ai");
  const [data, setData] = useState<Data | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = useCallback((kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 3800);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [d, u, l] = await Promise.all([
        fetch("/api/admin2?what=all").then((r) => r.json()),
        fetch("/api/admin2?what=users").then((r) => r.json()),
        fetch("/api/admin2?what=log").then((r) => r.json()),
      ]);
      if (!d.ok) throw new Error(String(d.error || "خطأ"));
      setData(d as Data);
      setUsers((u.users || []) as UserRow[]);
      setLog((l.log || []) as LogRow[]);
      setReady(true);
    } catch {
      setReady(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLogging(true);
    setErr("");
    try {
      await api({ action: "login", password });
      setPassword("");
      await loadAll();
    } catch (e2) {
      setErr(String((e2 as Error).message));
    } finally {
      setLogging(false);
    }
  }

  async function logout() {
    await api({ action: "logout" }).catch(() => undefined);
    setReady(false);
    setData(null);
  }

  if (!ready || !data) {
    return (
      <div className="a2-login">
        <form className="box" onSubmit={login}>
          <div className="a2-logo" style={{ margin: "0 auto 14px" }}>
            🔐
          </div>
          <h1>لوحة التحكم</h1>
          <p>ادخل كلمة السر باش تدير البوت والأقسام والجوائز.</p>
          <label className="f">
            <span>كلمة السر</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              required
            />
          </label>
          {err ? (
            <div className="a2-toast err" style={{ position: "static", marginBottom: 12, width: "100%" }}>
              {err}
            </div>
          ) : null}
          <button className="btn2 gold" type="submit" style={{ width: "100%", justifyContent: "center" }} disabled={logging}>
            {logging ? "…كنتحقق" : "دخول"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      <div className="a2-head">
        <div className="a2-logo">🏆</div>
        <div>
          <h1>لوحة التحكم</h1>
          <small>
            {data.stats.users} مستخدم · {data.stats.rewards} جائزة · بوابة {data.stats.gate ? "شغّالة" : "مطفية"} · مخزن{" "}
            {data.storage.backend}
          </small>
        </div>
        <div className="a2-spacer" />
        <div className="a2-row">
          <span className={`a2-pill ${data.ai.available ? "on" : "off"}`}>🤖 {data.ai.available ? data.ai.provider || "AI" : "AI ماشي مفعّل"}</span>
          <button className="btn2 sm" onClick={() => loadAll().then(() => flash("ok", "تحدّثت البيانات"))}>
            ↻ تحديث
          </button>
          <button className="btn2 sm red" onClick={logout}>
            خروج
          </button>
        </div>
      </div>

      <div className="a2-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`a2-tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ai" ? <AiTab flash={flash} onDone={loadAll} /> : null}
      {tab === "rewards" ? <RewardsTab data={data} flash={flash} onDone={loadAll} /> : null}
      {tab === "users" ? <UsersTab users={users} flash={flash} onDone={loadAll} /> : null}
      {tab === "message" ? <MessageTab users={users} flash={flash} /> : null}
      {tab === "gate" ? <GateTab data={data} flash={flash} onDone={loadAll} /> : null}
      {tab === "texts" ? <TextsTab data={data} flash={flash} onDone={loadAll} /> : null}
      {tab === "contests" ? <ContestsTab data={data} flash={flash} onDone={loadAll} /> : null}
      {tab === "stats" ? <StatsTab data={data} users={users} /> : null}
      {tab === "log" ? <LogTab log={log} /> : null}

      {toast ? <div className={`a2-toast ${toast.kind}`}>{toast.text}</div> : null}
      <div style={{ display: "none" }}>{busy ? "…" : ""}</div>
    </>
  );
}

/* ───────────────────────────── 🤖 FT AI ───────────────────────────── */
const EXAMPLES = [
  "زيد جائزة 100 نجمة بـ 80 نقطة في قسم النقاط",
  "حسابات بيس: بدّل سعر كونت بيس لـ 250",
  "أعطي المستخدم 12345678 20 نقطة",
  "احظر المستخدم 12345678",
  "أبعث رسالة للجميع: غدوة مسابقة جديدة 🎉",
  "زيد القناة @newchannel للاشتراك الإجباري",
  "طفي بوابة الاشتراك",
  "بدّل نص الترحيب لـ: أهلاً بيك في بوت FT 👋",
];

function AiTab({ flash, onDone }: { flash: (k: "ok" | "err", t: string) => void; onDone: () => void | Promise<void> }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { who: "ai", text: "أهلاً 👋 أنا FT AI. قولّي واش تحب ندير في البوت (جوائز، أسعار، نقاط، حظر، رسائل، قنوات، نصوص…) ونفّذها." },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(prompt: string) {
    const p = prompt.trim();
    if (!p || busy) return;
    setText("");
    setMsgs((m) => [...m, { who: "me", text: p }]);
    setBusy(true);
    try {
      const res = (await api({ action: "ai", prompt: p })) as unknown as AiRun;
      setMsgs((m) => [
        ...m,
        { who: "ai", text: res.say || "تم.", results: res.results, refused: res.refused },
      ]);
      if (res.results?.some((r) => r.ok)) onDone();
    } catch (e) {
      setMsgs((m) => [...m, { who: "ai", text: `⚠️ ${String((e as Error).message)}` }]);
      flash("err", String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="a2-card">
      <h2>
        🤖 FT AI <span className="a2-hint">اكتب طلبك بالدارجة — ينفّذ فقط العمليات المسموحة</span>
      </h2>
      <div className="a2-chips">
        {EXAMPLES.map((x) => (
          <button key={x} className="a2-chip" onClick={() => send(x)} disabled={busy}>
            {x}
          </button>
        ))}
      </div>
      <div className="a2-chat">
        {msgs.map((m, i) => (
          <div key={i} className={`a2-msg ${m.who}`}>
            {m.text}
            {m.results?.length ? (
              <span className="res">
                {m.results.map((r, j) => (
                  <span key={j} style={{ display: "block" }}>
                    <b className={r.ok ? "" : "no"}>{r.ok ? "✅" : "⛔"} </b>
                    {r.detail}
                  </span>
                ))}
              </span>
            ) : null}
            {m.refused?.length ? (
              <span className="res">
                {m.refused.map((r, j) => (
                  <span key={j} style={{ display: "block" }}>
                    ⛔ {r}
                  </span>
                ))}
              </span>
            ) : null}
          </div>
        ))}
        {busy ? <div className="a2-msg ai">…كنفكّر وننفّذ</div> : null}
      </div>
      <form
        className="a2-row"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          style={{ flex: 1, minWidth: 200 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="مثال: بدّل سعر كونت بيس لـ 250 نقطة"
        />
        <button className="btn2 gold" type="submit" disabled={busy || !text.trim()}>
          {busy ? "…" : "نفّذ"}
        </button>
      </form>
      <div className="a2-muted" style={{ marginTop: 8 }}>
        ⚠️ إذا ظهر «فشل (200)»: معناها النموذج تعطّل/تأخّر — عاود «نفّذ» مرة أخرى، أو استعمل الأزرار فوق (الجوائز/المستخدمين) وتخدم مباشرة بلا AI.
      </div>
    </div>
  );
}

/* ───────────────────────────── 🎁 الجوائز ───────────────────────────── */
const blankReward = (section: string, order: number): Reward => ({
  id: "",
  emoji: "🎁",
  title: "",
  desc: "",
  cost: 10,
  stock: null,
  active: true,
  order,
  delivery: "",
  section,
});

function RewardsTab({ data, flash, onDone }: { data: Data; flash: (k: "ok" | "err", t: string) => void; onDone: () => void }) {
  const [editing, setEditing] = useState<Reward | null>(null);
  const [activeSection, setActiveSection] = useState<string>("accounts");
  const [busy, setBusy] = useState(false);

  const sections = data.sections.length ? data.sections : Object.keys(SECTION_META).map((id, i) => ({ id, title: SECTION_META[id].label, emoji: SECTION_META[id].emoji, order: i + 1, active: true }));

  const bySection = useMemo(() => {
    const map: Record<string, Reward[]> = {};
    for (const s of sections) map[s.id] = [];
    for (const r of data.rewards) {
      const key = r.section && map[r.section] ? r.section : "accounts";
      (map[key] ||= []).push(r);
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.order - b.order);
    return map;
  }, [data.rewards, sections]);

  function openEditor(r: Reward) {
    setEditing({ ...r });
  }

  async function save(reward: Reward) {
    setBusy(true);
    try {
      const payload = { ...reward, id: reward.id || `r_${Date.now().toString(36)}` };
      const res = (await api({ action: "save_reward", reward: payload })) as { result: Outcome };
      if (!res.result.ok) throw new Error(res.result.detail);
      flash("ok", res.result.detail);
      setEditing(null);
      onDone();
    } catch (e) {
      flash("err", String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`تحب تحذف «${title}»؟`)) return;
    setBusy(true);
    try {
      const res = (await api({ action: "delete_reward", id })) as { result: Outcome };
      if (!res.result.ok) throw new Error(res.result.detail);
      flash("ok", res.result.detail);
      onDone();
    } catch (e) {
      flash("err", String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(r: Reward) {
    await save({ ...r, active: !r.active });
  }

  return (
    <>
      <div className="a2-card">
        <h2>
          🎁 الجوائز والأقسام <span className="a2-hint">كل قسم عندو زر خاص بيه</span>
        </h2>
        <div className="a2-chips">
          {sections.map((s) => (
            <button
              key={s.id}
              className={`a2-tab ${activeSection === s.id ? "on" : ""}`}
              style={{ padding: "7px 13px", fontSize: 13 }}
              onClick={() => setActiveSection(s.id)}
            >
              {s.emoji} {s.title} ({(bySection[s.id] || []).length})
            </button>
          ))}
        </div>

        <div className="a2-row" style={{ marginBottom: 12 }}>
          <button className="btn2 gold sm" onClick={() => openEditor(blankReward(activeSection, (bySection[activeSection] || []).length + 1))}>
            ➕ زيد جائزة في «{sections.find((s) => s.id === activeSection)?.title || activeSection}»
          </button>
        </div>

        {editing ? (
          <RewardForm
            key={`${editing.id || "new"}-${editing.section}-${editing.title}`}
            reward={editing}
            sections={sections}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSave={(r) => save(r)}
          />
        ) : null}

        <div className="a2-list">
          {(bySection[activeSection] || []).map((r) => (
            <div key={r.id} className="a2-item">
              <div className="top">
                {r.image ? (
                  <img src={r.image} alt="" style={{ width: 44, height: 32, objectFit: "cover", borderRadius: 7, border: "1px solid var(--a2-line)" }} />
                ) : (
                  <span style={{ fontSize: 20 }}>{r.emoji}</span>
                )}
                <b>{r.title}</b>
                <span className="a2-pill gold">{r.cost} نقطة</span>
                <span className="a2-pill">{r.stock === null ? "كمية بلا حد" : `كمية ${r.stock}`}</span>
                <span className={`a2-pill ${r.active ? "on" : "off"}`}>{r.active ? "مفعّلة" : "مطفية"}</span>
                <div className="a2-spacer" style={{ flex: 1 }} />
                <button className="btn2 sm" onClick={() => openEditor(r)}>
                  ✏️ تعديل
                </button>
                <button className="btn2 sm green" onClick={() => toggle(r)} disabled={busy}>
                  {r.active ? "إطفاء" : "تفعيل"}
                </button>
                <button className="btn2 sm red" onClick={() => remove(r.id, r.title)} disabled={busy}>
                  🗑 حذف
                </button>
              </div>
              {r.desc ? <div className="a2-muted">{r.desc}</div> : null}
            </div>
          ))}
          {!(bySection[activeSection] || []).length ? (
            <div className="a2-muted">ماكانش جوائز في هذا القسم — اضغط «زيد جائزة».</div>
          ) : null}
        </div>
      </div>

      <div className="a2-card">
        <h2>
          ⭐️ نظام النقاط <span className="a2-hint">شحال يدي المستخدم على كل عملية</span>
        </h2>
        <PointsForm data={data} flash={flash} onDone={onDone} />
      </div>
    </>
  );
}

function RewardForm({
  reward,
  sections,
  busy,
  onCancel,
  onSave,
}: {
  reward: Reward;
  sections: Section[];
  busy: boolean;
  onCancel: () => void;
  onSave: (r: Reward) => void;
}) {
  const [r, setR] = useState<Reward>(reward);
  return (
    <div className="a2-item" style={{ borderColor: "rgba(246,196,83,0.45)", marginBottom: 12 }}>
      <div className="a2-grid">
        <label className="f">
          <span>إيموجي</span>
          <input value={r.emoji} onChange={(e) => setR({ ...r, emoji: e.target.value })} maxLength={8} />
        </label>
        <label className="f">
          <span>العنوان</span>
          <input value={r.title} onChange={(e) => setR({ ...r, title: e.target.value })} placeholder="كونت بيس" />
        </label>
        <label className="f">
          <span>السعر (نقاط)</span>
          <input type="number" min={1} value={r.cost} onChange={(e) => setR({ ...r, cost: Number(e.target.value) })} />
        </label>
        <label className="f">
          <span>الكمية (خالي = بلا حد)</span>
          <input
            type="number"
            min={0}
            value={r.stock === null ? "" : r.stock}
            onChange={(e) => setR({ ...r, stock: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="بلا حد"
          />
        </label>
        <label className="f">
          <span>القسم</span>
          <select value={r.section || "accounts"} onChange={(e) => setR({ ...r, section: e.target.value })}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.emoji} {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="f">
          <span>الحالة</span>
          <select value={r.active ? "1" : "0"} onChange={(e) => setR({ ...r, active: e.target.value === "1" })}>
            <option value="1">مفعّلة</option>
            <option value="0">مطفية</option>
          </select>
        </label>
      </div>
      <label className="f">
        <span>الوصف</span>
        <input value={r.desc} onChange={(e) => setR({ ...r, desc: e.target.value })} />
      </label>
      <label className="f">
        <span>نص التسليم</span>
        <input value={r.delivery} onChange={(e) => setR({ ...r, delivery: e.target.value })} placeholder="يتواصل معك المالك على الخاص" />
      </label>
      <label className="f">
        <span>🖼️ صورة الجائزة (تظهر في البوت مع الاسم والسعر)</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 1_400_000) {
              window.alert("الصورة كبيرة — الحد 1.4 ميغا");
              return;
            }
            const reader = new FileReader();
            reader.onload = () => setR({ ...r, image: String(reader.result || "") });
            reader.readAsDataURL(file);
          }}
        />
      </label>
      {r.image ? (
        <div className="a2-row" style={{ marginBottom: 10 }}>
          <img src={r.image} alt="" style={{ width: 120, height: 84, objectFit: "cover", borderRadius: 10, border: "1px solid var(--a2-line)" }} />
          <button className="btn2 sm red" onClick={() => setR({ ...r, image: "" })}>
            حيّد الصورة
          </button>
        </div>
      ) : (
        <div className="a2-muted" style={{ marginBottom: 10 }}>
          بلا صورة → يتصوّر تلقائياً صورة القسم ({SECTION_META[r.section || "accounts"]?.label}).
        </div>
      )}
      <div className="a2-row">
        <button className="btn2 gold" onClick={() => onSave(r)} disabled={busy || !r.title.trim()}>
          💾 حفظ
        </button>
        <button className="btn2" onClick={onCancel} disabled={busy}>
          إلغاء
        </button>
      </div>
    </div>
  );
}

function PointsForm({ data, flash, onDone }: { data: Data; flash: (k: "ok" | "err", t: string) => void; onDone: () => void | Promise<void> }) {
  const [p, setP] = useState(data.points);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = (await api({ action: "run", op: "set_points", pointsConfig: p })) as { result: Outcome };
      if (!res.result.ok) throw new Error(res.result.detail);
      flash("ok", "تسجّلت إعدادات النقاط");
      onDone();
    } catch (e) {
      flash("err", String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="a2-grid">
        <label className="f">
          <span>نقاط كل عضو جديد</span>
          <input type="number" min={0} value={p.perJoin} onChange={(e) => setP({ ...p, perJoin: Number(e.target.value) })} />
        </label>
        <label className="f">
          <span>نقاط التفعيل</span>
          <input type="number" min={0} value={p.perActivated} onChange={(e) => setP({ ...p, perActivated: Number(e.target.value) })} />
        </label>
        <label className="f">
          <span>الهدية اليومية (أدنى)</span>
          <input type="number" min={0} value={p.dailyMin} onChange={(e) => setP({ ...p, dailyMin: Number(e.target.value) })} />
        </label>
        <label className="f">
          <span>الهدية اليومية (أقصى)</span>
          <input type="number" min={0} value={p.dailyMax} onChange={(e) => setP({ ...p, dailyMax: Number(e.target.value) })} />
        </label>
      </div>
      <label className="f">
        <span>نص مقدمة المتجر</span>
        <textarea value={p.shopIntro} onChange={(e) => setP({ ...p, shopIntro: e.target.value })} />
      </label>
      <div className="a2-row">
        <button className="btn2 gold" onClick={save} disabled={busy}>
          💾 حفظ النقاط
        </button>
        <button
          className={`btn2 ${p.enabled ? "green" : "red"}`}
          onClick={async () => {
            const next = !p.enabled;
            setP({ ...p, enabled: next });
            try {
              const res = (await api({ action: "run", op: "set_points", pointsConfig: { enabled: next } })) as { result: Outcome };
              flash(res.result.ok ? "ok" : "err", res.result.detail);
              onDone();
            } catch (e) {
              flash("err", String((e as Error).message));
            }
          }}
        >
          {p.enabled ? "✅ مفعّل — اضغط للطفي" : "⛔ مطفي — اضغط للتفعيل"}
        </button>
      </div>
    </>
  );
}

/* ───────────────────────────── 👥 المستخدمين ───────────────────────────── */
function UsersTab({ users, flash, onDone }: { users: UserRow[]; flash: (k: "ok" | "err", t: string) => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const rows = users.filter((u) => {
    if (!q.trim()) return true;
    const s = `${u.id} ${u.firstName} ${u.username}`.toLowerCase();
    return s.includes(q.trim().toLowerCase());
  });

  async function run(op: string, userId: string, delta?: number) {
    setBusy(`${op}:${userId}`);
    try {
      const res = (await api({ action: "run", op, userId, delta })) as { result: Outcome };
      if (!res.result.ok) throw new Error(res.result.detail);
      flash("ok", res.result.detail);
      onDone();
    } catch (e) {
      flash("err", String((e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  async function setTo(userId: string) {
    const v = window.prompt("الرصيد الجديد (نقطة):");
    if (v === null) return;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return flash("err", "رقم ماشي صحيح");
    setBusy(`set:${userId}`);
    try {
      const res = (await api({ action: "run", op: "set_points", userId, points: n })) as { result: Outcome };
      if (!res.result.ok) throw new Error(res.result.detail);
      flash("ok", res.result.detail);
      onDone();
    } catch (e) {
      flash("err", String((e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="a2-card">
      <h2>
        👥 المستخدمين <span className="a2-hint">{users.length} مسجّل</span>
      </h2>
      <label className="f">
        <span>بحث (آي دي / اسم / يوزر)</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="12345678 أو @username" />
      </label>
      <div className="a2-scroll">
        <table className="a2-table">
          <thead>
            <tr>
              <th>المستخدم</th>
              <th>الآي دي</th>
              <th>النقاط</th>
              <th>الحالة</th>
              <th>عمليات</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((u) => (
              <tr key={u.id}>
                <td>
                  {u.firstName || "—"}
                  {u.username ? <div className="a2-muted">@{u.username}</div> : null}
                </td>
                <td className="a2-muted" style={{ fontFamily: "monospace" }}>
                  {u.id}
                </td>
                <td>
                  <b style={{ color: "var(--a2-gold)" }}>{u.points}</b>
                </td>
                <td>
                  <span className={`a2-pill ${u.banned ? "off" : "on"}`}>{u.banned ? "محظور" : "نشط"}</span>
                </td>
                <td>
                  <div className="a2-row">
                    <button className="btn2 sm green" disabled={busy === `set_points:${u.id}`} onClick={() => run("set_points", u.id, 5)}>
                      +5
                    </button>
                    <button className="btn2 sm green" disabled={busy === `set_points:${u.id}`} onClick={() => run("set_points", u.id, 20)}>
                      +20
                    </button>
                    <button className="btn2 sm red" disabled={busy === `set_points:${u.id}`} onClick={() => run("set_points", u.id, -5)}>
                      −5
                    </button>
                    <button className="btn2 sm" onClick={() => setTo(u.id)}>
                      تعيين
                    </button>
                    {u.banned ? (
                      <button className="btn2 sm blue" disabled={busy === `unban_user:${u.id}`} onClick={() => run("unban_user", u.id)}>
                        فك الحظر
                      </button>
                    ) : (
                      <button className="btn2 sm red" disabled={busy === `ban_user:${u.id}`} onClick={() => run("ban_user", u.id)}>
                        حظر
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? <div className="a2-muted">ما لقيت حتى مستخدم.</div> : null}
    </div>
  );
}

/* ───────────────────────────── ✉️ الرسائل ───────────────────────────── */
function MessageTab({ users, flash }: { users: UserRow[]; flash: (k: "ok" | "err", t: string) => void }) {
  const [target, setTarget] = useState("all");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<string>("");

  async function send() {
    if (!text.trim()) return;
    if (target === "all" && !window.confirm(`تحب تبعث للجميع (${users.length} مستخدم)؟`)) return;
    setBusy(true);
    setOut("");
    try {
      const res = (await api({ action: "message", userId: target, text })) as { result: Outcome };
      if (!res.result.ok) throw new Error(res.result.detail);
      setOut(res.result.detail);
      flash("ok", res.result.detail);
      setText("");
    } catch (e) {
      flash("err", String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="a2-card">
      <h2>
        ✉️ رسالة لمستخدم / بثّ للجميع <span className="a2-hint">HTML مسموح: &lt;b&gt; &lt;i&gt; &lt;a&gt;</span>
      </h2>
      <label className="f">
        <span>المرسل إليه</span>
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="all">📢 الجميع (بثّ)</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName || u.id} {u.username ? `@${u.username}` : ""} — {u.id}
            </option>
          ))}
        </select>
      </label>
      <label className="f">
        <span>النص</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب الرسالة…" />
      </label>
      <div className="a2-row">
        <button className="btn2 gold" onClick={send} disabled={busy || !text.trim()}>
          {busy ? "…كنبعث" : target === "all" ? "📢 بثّ للجميع" : "📨 أرسل"}
        </button>
        {out ? <span className="a2-pill on">{out}</span> : null}
      </div>
    </div>
  );
}

/* ───────────────────────────── 🔒 بوابة القنوات ───────────────────────────── */
function GateTab({ data, flash, onDone }: { data: Data; flash: (k: "ok" | "err", t: string) => void; onDone: () => void }) {
  const [channels, setChannels] = useState<string[]>(data.settings.requiredChannels || []);
  const [on, setOn] = useState<boolean>(Boolean(data.settings.requireJoin));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  function addChannel() {
    const raw = input
      .split(/[\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => (x.startsWith("https://t.me/") ? `@${x.replace(/^https:\/\/t\.me\//, "").replace(/\/.*$/, "")}` : x));
    const next = [...channels];
    for (const c of raw) if (!next.includes(c)) next.push(c);
    setChannels(next);
    setInput("");
  }

  async function save(nextOn = on, nextChannels = channels) {
    setBusy(true);
    try {
      const res = (await api({
        action: "save_settings",
        settings: { requiredChannels: nextChannels, requireJoin: nextOn },
      })) as { result: Outcome };
      if (!res.result.ok) throw new Error(res.result.detail);
      flash("ok", res.result.detail);
      onDone();
    } catch (e) {
      flash("err", String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="a2-card">
      <h2>
        🔒 الاشتراك الإجباري <span className="a2-hint">إذا فشل التحقق من قناة، تتخطّاها ولا توقّف البوت</span>
      </h2>
      <div className="a2-row" style={{ marginBottom: 14 }}>
        <button
          className={`btn2 ${on ? "green" : "red"}`}
          onClick={() => {
            const next = !on;
            setOn(next);
            save(next);
          }}
          disabled={busy}
        >
          {on ? "✅ البوابة شغّالة — اضغط باش تطفّيها" : "⛔ البوابة مطفية — اضغط باش تشعّلها"}
        </button>
      </div>
      <div className="a2-list">
        {channels.map((c) => (
          <div key={c} className="a2-item">
            <div className="top">
              <b>{c}</b>
              <a className="a2-pill" href={`https://t.me/${c.replace(/^@/, "")}`} target="_blank" rel="noreferrer">
                فتح
              </a>
              <div className="a2-spacer" style={{ flex: 1 }} />
              <button
                className="btn2 sm red"
                onClick={() => {
                  const next = channels.filter((x) => x !== c);
                  setChannels(next);
                  save(on, next);
                }}
                disabled={busy}
              >
                🗑 حذف
              </button>
            </div>
          </div>
        ))}
        {!channels.length ? <div className="a2-muted">ماكانش قنوات — البوت يخدم بلا اشتراك إجباري.</div> : null}
      </div>
      <div className="divider" style={{ height: 12 }} />
      <label className="f">
        <span>زيد قناة (@username)</span>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="@channel — أو أكثر مفصولين بفاصلة" />
      </label>
      <div className="a2-row">
        <button className="btn2 blue" onClick={addChannel} disabled={!input.trim()}>
          ➕ زيد
        </button>
        <button className="btn2 gold" onClick={() => save()} disabled={busy}>
          💾 حفظ
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────── 📝 النصوص ───────────────────────────── */
function TextsTab({ data, flash, onDone }: { data: Data; flash: (k: "ok" | "err", t: string) => void; onDone: () => void }) {
  const [s, setS] = useState(data.settings);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = (await api({
        action: "save_settings",
        settings: {
          ownerUsername: s.ownerUsername,
          supportUsername: s.supportUsername,
          welcomeText: s.welcomeText,
          rulesText: s.rulesText,
        },
      })) as { result: Outcome };
      if (!res.result.ok) throw new Error(res.result.detail);
      flash("ok", "تسجّلت النصوص");
      onDone();
    } catch (e) {
      flash("err", String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="a2-card">
      <h2>
        📝 نصوص البوت <span className="a2-hint">{`{name}`} يتبدّل باسم العضو · HTML مسموح</span>
      </h2>
      <div className="a2-grid">
        <label className="f">
          <span>يوزر المالك</span>
          <input value={s.ownerUsername} onChange={(e) => setS({ ...s, ownerUsername: e.target.value })} placeholder="FT_Owner" />
        </label>
        <label className="f">
          <span>يوزر الدعم</span>
          <input value={s.supportUsername} onChange={(e) => setS({ ...s, supportUsername: e.target.value })} placeholder="FT_Support" />
        </label>
      </div>
      <label className="f">
        <span>نص الترحيب (/start)</span>
        <textarea value={s.welcomeText || ""} onChange={(e) => setS({ ...s, welcomeText: e.target.value })} />
      </label>
      <label className="f">
        <span>نص الشروط</span>
        <textarea value={s.rulesText || ""} onChange={(e) => setS({ ...s, rulesText: e.target.value })} />
      </label>
      <button className="btn2 gold" onClick={save} disabled={busy}>
        💾 حفظ النصوص
      </button>
      <PasswordCard flash={flash} />
    </div>
  );
}

/* ───────────────────────────── 🔑 كلمة السر ───────────────────────────── */
function PasswordCard({ flash }: { flash: (k: "ok" | "err", t: string) => void }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);

  async function change() {
    if (p1.length < 6) return flash("err", "كلمة السر لازم 6 حروف على الأقل");
    if (p1 !== p2) return flash("err", "الكلمتين ماشي كيف كيف");
    setBusy(true);
    try {
      await api({ action: "change_password", newPassword: p1 });
      flash("ok", "تبدّلت كلمة السر ✅");
      setP1("");
      setP2("");
    } catch (e) {
      flash("err", String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="a2-item" style={{ marginTop: 14, borderColor: "rgba(90,169,255,0.4)" }}>
      <div className="top">
        <b>🔑 تغيير كلمة السر</b>
      </div>
      <div className="a2-grid">
        <label className="f">
          <span>كلمة السر الجديدة</span>
          <input type="password" value={p1} onChange={(e) => setP1(e.target.value)} placeholder="••••••" />
        </label>
        <label className="f">
          <span>تأكيد كلمة السر</span>
          <input type="password" value={p2} onChange={(e) => setP2(e.target.value)} placeholder="••••••" />
        </label>
      </div>
      <button className="btn2 blue" onClick={change} disabled={busy || !p1 || !p2}>
        {busy ? "…" : "💾 بدّل كلمة السر"}
      </button>
      <div className="a2-muted" style={{ marginTop: 6 }}>
        الكلمة الجديدة تتخزّن مشفّرة (scrypt) في قاعدة البيانات. الكلمة القديمة من Vercel تبقى شغّالة كاحتياط.
      </div>
    </div>
  );
}

/* ───────────────────────────── 🏆 المسابقات ───────────────────────────── */
function ContestsTab({ data, flash, onDone }: { data: Data; flash: (k: "ok" | "err", t: string) => void; onDone: () => void | Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function upload(id: string, file: File) {
    if (file.size > 1_400_000) return flash("err", "الصورة كبيرة — الحد 1.4 ميغا");
    setBusy(id);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("ما قدرناش نقراو الصورة"));
        reader.readAsDataURL(file);
      });
      await api({ action: "contest_image", id, dataUrl });
      flash("ok", "تحمّلت صورة المسابقة ✅");
      await onDone();
    } catch (e) {
      flash("err", String((e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  async function clear(id: string) {
    setBusy(id);
    try {
      await api({ action: "contest_image", id, dataUrl: "" });
      flash("ok", "تحيّدت الصورة");
      await onDone();
    } catch (e) {
      flash("err", String((e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="a2-card">
      <h2>
        🏆 المسابقات وصورها <span className="a2-hint">ارفع صورة لكل مسابقة — تظهر في البوت وفي الموقع</span>
      </h2>
      <div className="a2-list">
        {data.contests.map((c) => (
          <div key={c.id} className="a2-item">
            <div className="top">
              <img
                src={`/api/contests/${c.id}/image`}
                alt=""
                style={{ width: 64, height: 46, objectFit: "cover", borderRadius: 8, border: "1px solid var(--a2-line)" }}
              />
              <b>{c.title}</b>
              <span className={`a2-pill ${c.status === "active" ? "on" : "off"}`}>{c.status === "active" ? "مفتوحة" : c.status}</span>
              <span className="a2-pill">هدف {c.target}</span>
              <div style={{ flex: 1 }} />
              <label className="btn2 sm blue" style={{ cursor: "pointer", margin: 0 }}>
                {busy === c.id ? "…" : "🖼️ رفع صورة"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(c.id, f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <button className="btn2 sm red" onClick={() => clear(c.id)} disabled={busy === c.id}>
                حيّد
              </button>
            </div>
          </div>
        ))}
        {!data.contests.length ? <div className="a2-muted">ماكانش مسابقات.</div> : null}
      </div>
    </div>
  );
}

/* ───────────────────────────── 📊 إحصائيات ───────────────────────────── */
function StatsTab({ data, users }: { data: Data; users: UserRow[] }) {
  const [health, setHealth] = useState<{
    webhook: { url: string; pending: number; error: string | null };
    identity: { username: string; id: number | null };
  } | { webhook: { url: string; pending: number; error: string | null }; identity: { username: string; id: number | null } }[] | null>(null);

  useEffect(() => {
    fetch("/api/admin2?what=health")
      .then((r) => r.json())
      .then((j) => setHealth(j.ok ? j : null))
      .catch(() => setHealth(null));
  }, []);

  const totalPoints = users.reduce((s, u) => s + u.points, 0);

  return (
    <>
      <div className="a2-card">
        <h2>📊 إحصائيات</h2>
        <div className="a2-stats">
          <div className="a2-stat">
            <b>{data.stats.users}</b>
            <span>مستخدم</span>
          </div>
          <div className="a2-stat">
            <b>{data.stats.rewards}</b>
            <span>جائزة ({data.stats.activeRewards} مفعّلة)</span>
          </div>
          <div className="a2-stat">
            <b>{totalPoints}</b>
            <span>مجموع النقاط</span>
          </div>
          <div className="a2-stat">
            <b>{data.stats.banned}</b>
            <span>محظور</span>
          </div>
          <div className="a2-stat">
            <b>{data.requests.filter((r) => r.status === "pending").length}</b>
            <span>طلب معلّق</span>
          </div>
          <div className="a2-stat">
            <b>{data.contests.length}</b>
            <span>مسابقة</span>
          </div>
        </div>
      </div>

      <div className="a2-card">
        <h2>🔌 صحة البوت</h2>
        {health && !Array.isArray(health) ? (
          <div className="a2-list">
            <div className="a2-item">
              <div className="top">
                <b>@{health.identity?.username || "—"}</b>
                <span className="a2-pill">{health.identity?.id ?? "?"}</span>
                <span className={`a2-pill ${health.webhook.pending === 0 && !health.webhook.error ? "on" : "off"}`}>
                  {health.webhook.pending === 0 && !health.webhook.error ? "Webhook سليم" : "تحقّق من الـWebhook"}
                </span>
              </div>
              <div className="a2-muted" style={{ wordBreak: "break-all" }}>
                {health.webhook.url || "بلا webhook"}
              </div>
              <div className="a2-muted">معلّق: {health.webhook.pending} · خطأ: {health.webhook.error || "لا"}</div>
            </div>
          </div>
        ) : (
          <div className="a2-muted">…كنجيب حالة البوت</div>
        )}
      </div>

      <div className="a2-card">
        <h2>🏅 الأكثر نقاط</h2>
        <div className="a2-scroll">
          <table className="a2-table">
            <thead>
              <tr>
                <th>#</th>
                <th>المستخدم</th>
                <th>النقاط</th>
              </tr>
            </thead>
            <tbody>
              {data.top.map((t, i) => {
                const u = users.find((x) => x.id === t.userId);
                return (
                  <tr key={t.userId}>
                    <td>{i + 1}</td>
                    <td>{u ? `${u.firstName} ${u.username ? `@${u.username}` : ""}` : t.userId}</td>
                    <td>
                      <b style={{ color: "var(--a2-gold)" }}>{t.points}</b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="a2-card">
        <h2>🎫 آخر الطلبات</h2>
        <div className="a2-list">
          {data.requests.slice(0, 15).map((r) => (
            <div key={r.id} className="a2-item">
              <div className="top">
                <b>{r.rewardTitle}</b>
                <span className="a2-pill gold">{r.cost} نقطة</span>
                <span className={`a2-pill ${r.status === "pending" ? "" : r.status === "approved" ? "on" : "off"}`}>{r.status}</span>
                <span className="a2-muted">{r.userName}</span>
              </div>
            </div>
          ))}
          {!data.requests.length ? <div className="a2-muted">ماكانش طلبات.</div> : null}
        </div>
      </div>
    </>
  );
}

/* ───────────────────────────── 🧾 السجل ───────────────────────────── */
function LogTab({ log }: { log: LogRow[] }) {
  return (
    <div className="a2-card">
      <h2>
        🧾 سجل العمليات <span className="a2-hint">آخر {log.length} عملية</span>
      </h2>
      <div className="a2-log">
        {log.map((l, i) => (
          <div key={i}>
            <b>{new Date(l.at).toLocaleString("ar-DZ", { hour12: false })}</b>{" "}
            <span className={l.via === "ai" ? "ai" : ""}>[{l.via === "ai" ? "AI" : "يدوي"}]</span> {l.detail}
          </div>
        ))}
        {!log.length ? <div>ماكانش عمليات مسجّلة.</div> : null}
      </div>
    </div>
  );
}
