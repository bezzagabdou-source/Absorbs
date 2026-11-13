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
  points: { perJoin: number; perActivated: number; shopIntro: string; enabled: boolean };
  settings: {
    ownerUsername: string;
    supportUsername: string;
    welcomeText?: string;
    rulesText?: string;
    requiredChannels: string[];
    requireJoin: boolean;
    aiEnabled: boolean;
    maintenanceMode?: boolean;
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
  { id: "settings", label: "⚙️ الإعدادات" },
  { id: "contests", label: "🏆 المسابقات" },
  { id: "diag", label: "🩺 الإحالات والإيموجي" },
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
      {tab === "message" ? <MessageTab users={users} flash={flash} audience={data.stats.users} /> : null}
      {tab === "gate" ? <GateTab data={data} flash={flash} onDone={loadAll} /> : null}
      {tab === "texts" ? <TextsTab data={data} flash={flash} onDone={loadAll} /> : null}
      {tab === "settings" ? <SettingsTab data={data} flash={flash} onDone={loadAll} /> : null}
      {tab === "contests" ? <ContestsTab data={data} flash={flash} onDone={loadAll} /> : null}
      {tab === "diag" ? <DiagTab flash={flash} /> : null}
      {tab === "stats" ? <StatsTab data={data} users={users} /> : null}
      {tab === "log" ? <LogTab log={log} /> : null}

      {toast ? <div className={`a2-toast ${toast.kind}`}>{toast.text}</div> : null}
      <div style={{ display: "none" }}>{busy ? "…" : ""}</div>
    </>
  );
}

/* ─────────────────────── 🩺 الإحالات + 🎭 الإيموجي ─────────────────────── */
type RefCause = { code: string; title: string; fix: string; count?: number };
type RefCheck = {
  ok: boolean;
  group: { chatId: string; title: string } | null;
  botInGroup: string;
  canInvite: string;
  totals: Record<string, number>;
  causes: RefCause[];
  hint: string;
};
type JoinRow = { at: number; joinerName: string; ownerId: string; reason: string; counted: boolean };

type Recount = {
  scanned: number;
  wouldCredit: number;
  credited: number;
  skipped: number;
  perJoin: number;
  applied: boolean;
  notes: string[];
  inviters: { userId: string; name: string; referrals: number; paid: number; addPoints: number; balance: number }[];
};

function DiagTab({ flash }: { flash: (k: "ok" | "err", t: string) => void }) {
  const [busy, setBusy] = useState("");
  const [check, setCheck] = useState<RefCheck | null>(null);
  const [recent, setRecent] = useState<JoinRow[]>([]);
  const [packs, setPacks] = useState<Record<string, string[]>>({});
  const [emojiCount, setEmojiCount] = useState(0);
  const [packName, setPackName] = useState("");
  const [recount, setRecount] = useState<Recount | null>(null);

  async function runRecount(apply: boolean) {
    setBusy("recount");
    try {
      const r = await fetch(`/api/admin2?what=referrals_recount${apply ? "&apply=1" : ""}`, {
        credentials: "same-origin",
      }).then((x) => x.json());
      if (r.ok) {
        const res = r.recount as Recount;
        setRecount(res);
        if (apply) {
          flash("ok", `♻️ توّا توجّهت النقاط: ${res.credited} ضيف → ${res.inviters.length} صاحوب روابط (+${res.perJoin} نقطة لكل ضيف)`);
          setCheck(null);
        } else {
          flash(
            "ok",
            res.wouldCredit
              ? `♻️ لقينا ${res.wouldCredit} إحالة ما حوسبتش (من ${res.scanned}) — اضغط «طبّق» باش ترجع النقاط`
              : "♻️ ما كاينة حتى إحالة ضايعة — كلشي محسوب",
          );
        }
      } else flash("err", String(r.error || "فشل"));
    } catch {
      flash("err", "تعذّر الاتصال");
    }
    setBusy("");
  }

  async function checkReferrals() {
    setBusy("check");
    try {
      const r = await fetch("/api/admin2?what=referrals", { credentials: "same-origin" }).then((x) => x.json());
      if (r.ok) {
        setCheck(r.check as RefCheck);
        setRecent((r.recent || []) as JoinRow[]);
        flash("ok", r.check.ok ? "✅ كلشي مزيان — الإحالات شغالين" : `⚠️ ${r.check.causes?.length || 0} مشكل موجود`);
      } else flash("err", String(r.error || "فشل الفحص"));
    } catch {
      flash("err", "تعذّر الاتصال");
    }
    setBusy("");
  }
  async function fixReferrals() {
    setBusy("fix");
    try {
      const r = await fetch("/api/admin2?what=referrals_fix", { credentials: "same-origin" }).then((x) => x.json());
      if (r.ok) {
        setCheck(r.check as RefCheck);
        const f = r.fixed?.fixed ?? 0;
        const notes: string[] = r.fixed?.notes || [];
        flash("ok", `🔧 الإصلاح: ${f} ضيف جديدة ${notes.length ? "— " + notes.join(" • ") : ""}`);
      } else flash("err", String(r.error || "فشل الإصلاح"));
    } catch {
      flash("err", "تعذّر الاتصال");
    }
    setBusy("");
  }
  const [stk, setStk] = useState<{ kind: string; ready: boolean; sets: { name: string; title: string; total: number; animated: boolean; ok: boolean }[] }[]>([]);
  const [stkJson, setStkJson] = useState("");
  async function publishStickers() {
    setBusy("publish");
    try {
      const r = await api({ action: "stickers_publish", apply: true });
      const up = Number((r.publish as { uploaded?: number } | undefined)?.uploaded ?? 0);
      flash("ok", `🚀 ${up} ملصق متحرك مرفوع ومربوط بالبوت — بان فكل الشاشات`);
      void loadStickers();
    } catch (e) {
      flash("err", String((e as Error)?.message || "الرفع ما تمشاش"));
    }
    setBusy("");
  }
  async function loadStickers() {
    try {
      const r = await fetch("/api/admin2?what=stickers", { credentials: "same-origin" }).then((x) => x.json());
      if (r.ok) setStk((r.sets || []) as typeof stk);
    } catch {
      /* لا شيء */
    }
  }
  async function saveStickers() {
    setBusy("sticker");
    try {
      const sets = stkJson.trim() ? JSON.parse(stkJson) : {};
      const r = await api({ action: "stickers_save", sets });
      const rf = (r.refresh || {}) as { ready?: number; of?: number };
      flash("ok", `🎭 تمّ الحفظ — ${rf.ready ?? 0}/${rf.of ?? 5} أصناف جاهزة`);
      void loadStickers();
    } catch (e) {
      flash("err", String((e as Error)?.message || "JSON غالط"));
    }
    setBusy("");
  }
  async function refreshStickers() {
    setBusy("sticker");
    try {
      const r = await api({ action: "stickers_refresh" });
      const rf = (r.refresh || {}) as { ready?: number; of?: number };
      flash("ok", `🔄 ${rf.ready ?? 0}/${rf.of ?? 5} صنف جاهز`);
      void loadStickers();
    } finally {
      setBusy("");
    }
  }
  async function loadEmoji() {
    try {
      const r = await fetch("/api/admin2?what=emojis", { credentials: "same-origin" }).then((x) => x.json());
      if (r.ok) {
        setPacks((r.map || {}) as Record<string, string[]>);
        setEmojiCount(Number(r.count) || 0);
      }
    } catch {
      /* لا شيء */
    }
  }
  useEffect(() => {
    void checkReferrals();
    void loadEmoji();
    void loadStickers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function addEmojiPack() {
    const pack = packName.trim().replace(/^@/, "");
    if (!pack) return flash("err", "سمّي الحزمة أولا");
    setBusy("emoji");
    try {
      const r = await api({ action: "emoji_add", pack });
      setPackName("");
      flash("ok", `🎭 ${pack}: ${r.message || "تزادت"}`);
      void loadEmoji();
    } catch (e) {
      flash("err", String((e as Error)?.message || "فشلت الإضافة"));
    }
    setBusy("");
  }

  return (
    <div className="a2-col" style={{ display: "grid", gap: 14 }}>
      <div className="a2-card">
        <h3>🩺 فحص الإحالات</h3>
        <p style={{ opacity: 0.75, fontSize: 13, margin: "4px 0 10px" }}>
          {check
            ? check.ok
              ? "كل شي مزيان: الروابط، المجموعة، والمسابقة النشطة خدامين."
              : check.hint || "كاين مشكل — شوف الأسباب تحت."
            : "كنجيبو التشخيص…"}
        </p>
        <div className="a2-row" style={{ gap: 8, marginBottom: 10 }}>
          <button className="btn2 sm" onClick={() => void checkReferrals()} disabled={busy === "check"}>
            ↻ إعادة الفحص
          </button>
          <button className="btn2 sm gold" onClick={() => void fixReferrals()} disabled={busy === "fix"}>
            🔧 إصلاح تلقائي (استرجاع الضيوف الضايعة)
          </button>
          <button className="btn2 sm blue" onClick={() => void runRecount(false)} disabled={busy === "recount"}>
            ♻️ فحص نقاط الإحالات
          </button>
          {recount && recount.wouldCredit > 0 ? (
            <button className="btn2 sm green" onClick={() => void runRecount(true)} disabled={busy === "recount"}>
              ✅ طبّق (+{recount.wouldCredit * recount.perJoin} نقطة)
            </button>
          ) : null}
        </div>
        {recount ? (
          <div className="a2-card" style={{ marginTop: 0, marginBottom: 10 }}>
            <h2>
              ♻️ إعادة حساب النقاط{" "}
              <span className="a2-hint">
                {recount.scanned} إحالة مقروءة · {recount.wouldCredit} ما محسوبةش · {recount.skipped} عندها نقاط من
                قبل · +{recount.perJoin} نقطة/ضيف
              </span>
            </h2>
            {recount.notes?.length ? <div className="a2-hint" style={{ marginBottom: 8 }}>{recount.notes.join(" • ")}</div> : null}
            {recount.inviters?.length ? (
              <div className="a2-scroll">
                <table className="a2-table">
                  <thead>
                    <tr>
                      <th>صاحب الرابط</th>
                      <th>الضيوف</th>
                      <th>محسوب من قبل</th>
                      <th>{recount.applied ? "النقاط المضافة" : "النقاط المستحقة"}</th>
                      <th>الرصيد {recount.applied ? "دابا" : "قبل"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recount.inviters.map((r) => (
                      <tr key={r.userId}>
                        <td>
                          {r.name} <span className="a2-muted" style={{ fontFamily: "monospace" }}>{r.userId}</span>
                        </td>
                        <td>{r.referrals}</td>
                        <td>{r.paid}</td>
                        <td>
                          <b style={{ color: "var(--a2-gold)" }}>{r.addPoints ? `+${r.addPoints}` : "—"}</b>
                        </td>
                        <td>{r.balance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="a2-hint">ما لقيناش أحالات تستاهل النقاط.</div>
            )}
          </div>
        ) : null}
        {check ? (
          <>
            <div className="a2-row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              <span className={`a2-pill ${check.ok ? "on" : "off"}`}>
                {check.ok ? "✅ سليم" : "⚠️ يحتاج تدخل"}
              </span>
              <span className="a2-pill">👥 {check.group ? check.group.chatId : "بلا مجموعة"}</span>
              <span className="a2-pill">🤖 {check.botInGroup}</span>
              <span className="a2-pill">✉️ دعوة: {check.canInvite}</span>
              {Object.entries(check.totals || {}).map(([k, v]) => (
                <span key={k} className="a2-pill">
                  {k}: {v}
                </span>
              ))}
            </div>
            {check.causes?.length ? (
              <ul style={{ margin: 0, paddingRight: 18, fontSize: 13, display: "grid", gap: 6 }}>
                {check.causes.map((c) => (
                  <li key={c.code}>
                    <b>{c.title}</b>
                    <br />
                    <span style={{ opacity: 0.75 }}>🔧 {c.fix}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 13 }}>ما كاين حتى مشكل 🎉</p>
            )}
            {recent.length ? (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer", fontSize: 13 }}>🧾 آخر محاولات الدخول ({recent.length})</summary>
                <ul style={{ margin: "6px 0 0", paddingRight: 18, fontSize: 12, opacity: 0.85 }}>
                  {recent.slice(0, 15).map((j, i) => (
                    <li key={i}>
                      {j.counted ? "✅" : "❌"} {j.joinerName} — {j.reason}
                      {j.ownerId ? ` ← ${j.ownerId}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="a2-card">
        <h3>🎭 الإيموجي المتحرك والملصقات</h3>
        <p style={{ opacity: 0.75, fontSize: 13, margin: "4px 0 10px" }}>
          {emojiCount} إيموجي محمّل في {Object.keys(packs).length} حزمة. زيد حزمة جديدة مباشرة — بلا أوامر في المينيوم.
        </p>
        <div className="a2-row" style={{ gap: 8, marginBottom: 10 }}>
          <input
            value={packName}
            onChange={(e) => setPackName(e.target.value)}
            placeholder="اسم الحزمة (مثال: CuteAnimatedEmoji)"
            style={{ flex: 1, minWidth: 180 }}
          />
          <button className="btn2 sm gold" onClick={() => void addEmojiPack()} disabled={busy === "emoji"}>
            ➕ زيد الحزمة
          </button>
        </div>
        {Object.keys(packs).length ? (
          <div className="a2-row" style={{ flexWrap: "wrap", gap: 6 }}>
            {Object.entries(packs).map(([name, ids]) => (
              <span key={name} className="a2-pill on">
                {name}: {ids.length}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, opacity: 0.7 }}>ما كاين حتى حزمة مسجّلة بعد.</p>
        )}
      </div>

      <div className="a2-card">
        <h3>🎭 الملصقات المتحرّكة (حيّة، بلا إعدادات)</h3>
        <p style={{ opacity: 0.75, fontSize: 13, margin: "4px 0 10px" }}>
          البوت كيصيفط ملصق فكل شاشة (الترحيب، المميزات، المتجر، الخدمات، الربح). اختار النشرات اللي عجباتك —
          سميها غير الاسم ديال t.me/addstickers/&lt;name&gt;.
        </p>
        <div className="a2-row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {stk.map((g) => (
            <span key={g.kind} className={`a2-pill ${g.ready ? "on" : ""}`}>
              {g.kind}: {g.sets.filter((x) => x.ok).length ? `${g.sets.find((x) => x.ok)?.title || g.sets[0]?.name} (${g.sets.find((x) => x.ok)?.total || 0})` : "ماكاين"}
            </span>
          ))}
        </div>
        <textarea
          value={stkJson}
          onChange={(e) => setStkJson(e.target.value)}
          rows={3}
          placeholder={'{"welcome":["pug","happy_duck"],"more":["Like"],"win":["Confetti"]}'}
          style={{ width: "100%", fontFamily: "ui-monospace,monospace", fontSize: 12, marginBottom: 8 }}
        />
        <div className="a2-row" style={{ gap: 8 }}>
          <button className="btn2 sm gold" onClick={() => void saveStickers()} disabled={busy === "sticker"}>
            💾 حفظ النشرات
          </button>
          <button className="btn2 sm" onClick={() => void refreshStickers()} disabled={busy === "sticker"}>
            🔄 أنعش
          </button>
          <a className="btn2 sm" href="/api/admin2?what=stickers_test" target="_blank" rel="noopener">
            🎬 جرّب الملصقات الآن
          </a>
          <button className="btn2 sm gold" onClick={() => void publishStickers()} disabled={busy === "publish"}>
            🚀 ارفع الملصقات للبوت
          </button>
          <a className="btn2 sm" href="/api/stickers/gallery" target="_blank" rel="noopener">
            🖼 معرض الملصقات
          </a>
        </div>
      </div>
    </div>
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
      const raw = (await fetch("/api/admin2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "ai", prompt: p }),
      }).then((r) => r.json().catch(() => ({})))) as Record<string, unknown>;
      const res = {
        say: String(raw.say || raw.error || "تم."),
        actions: (raw.actions as AiRun["actions"]) || [],
        results: (raw.results as Outcome[]) || [],
        refused: (raw.refused as string[]) || [],
      } as AiRun;
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
      <div className="a2-muted" style={{ margin: "10px 0 6px" }}>📚 مكتبة الأوامر — اضغط على أي وحدة وتنفّذ:</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {LIBRARY.flatMap((g) => g.examples.map((ex) => (
          <button
            key={ex}
            type="button"
            className="btn2"
            style={{ fontSize: 12, padding: "6px 9px" }}
            disabled={busy}
            onClick={() => send(ex)}
            title={g.group}
          >
            {ex}
          </button>
        )))}
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
        ✅ FT AI يخدم دايماً: يفهم الدارجة، يجاوبك، وينفّذ حتى إذا النموذج السحابي طايح (خطة محلية). ولا رفض — كل طلب يترجم لأقرب عملية.
      </div>
    </div>
  );
}

/* ───────────────────────────── 🎁 الجوائز ───────────────────────────── */
const LIBRARY = [
  { group: "🎁 الجوائز", examples: ["زيد جائزة كونت بيس 3 بـ 300 نقطة في قسم الحسابات", "بدّل سعر كونت بيس 1 لـ 250 نقطة", "حيّد جائزة دب"] },
  { group: "⭐️ النقاط", examples: ["زيد 100 نقطة للمستخدم 8273714178", "نقّص 50 نقطة من 8273714178"] },
  { group: "👥 المستخدمين", examples: ["احظر 123456789", "فك الحظر على 123456789", "شحال من مستخدم عندنا؟"] },
  { group: "📢 الرسائل", examples: ["بثّ: غدوة مسابقة جديدة 🎉"] },
  { group: "⚙️ الإعدادات", examples: ["ضع البوت في صيانة", "طفي الصيانة", "زيد قناة @mychannel", "بدّل نص الترحيب: مرحبا بيك"] },
];

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
  const [full, setFull] = useState<UserRow[] | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);

  async function loadEveryone() {
    setLoadingAll(true);
    try {
      const r = await fetch("/api/admin2?what=users&all=1").then((x) => x.json());
      if (r?.ok === false) throw new Error(String(r.error || "خطأ"));
      setFull((r.users || []) as UserRow[]);
      flash("ok", `حمّلنا ${((r.users || []) as UserRow[]).length} مستخدم — كلشي من إنشاء البوت`);
    } catch (e) {
      flash("err", String((e as Error).message));
    } finally {
      setLoadingAll(false);
    }
  }

  const source = full || users;
  const rows = source.filter((u) => {
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

  async function bump(userId: string, delta: number) {
    setBusy(`set_points:${userId}`);
    try {
      const res = (await api({ action: "run", op: "set_points", userId, delta })) as { result: Outcome };
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
        👥 المستخدمين{" "}
        <span className="a2-hint">
          {source.length} معروضة{full ? "" : " (الأحدث)"} · {rows.length} مطابقة
        </span>
      </h2>
      <div className="a2-row" style={{ marginBottom: 10 }}>
        <button className="btn2 sm" onClick={loadEveryone} disabled={loadingAll}>
          {loadingAll ? "…كنحمّل الكل" : full ? "↻ تحديث الكل" : "👥 كل المستخدمين منذ الإنشاء"}
        </button>
        {full ? (
          <button className="btn2 sm" onClick={() => setFull(null)}>
            رجوع للأحدث
          </button>
        ) : null}
      </div>
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
                    <button className="btn2 sm green" disabled={busy === `set_points:${u.id}`} onClick={() => bump(u.id, 5)}>
                      +5
                    </button>
                    <button className="btn2 sm green" disabled={busy === `set_points:${u.id}`} onClick={() => bump(u.id, 20)}>
                      +20
                    </button>
                    <button className="btn2 sm red" disabled={busy === `set_points:${u.id}`} onClick={() => bump(u.id, -5)}>
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
type BcView = {
  total: number;
  cursor: number;
  remaining: number;
  pct: number;
  sent: number;
  failed: number;
  blocked: number;
  skipped: number;
  finished: boolean;
  stopped: boolean;
  running: boolean;
  lastError: string;
  preview: string;
};

function MessageTab({
  users,
  flash,
  audience,
}: {
  users: UserRow[];
  flash: (k: "ok" | "err", t: string) => void;
  audience?: number;
}) {
  const [target, setTarget] = useState("all");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<string>("");
  const [bc, setBc] = useState<BcView | null>(null);
  const [reach, setReach] = useState<number | null>(null);
  const [pushing, setPushing] = useState(false);

  async function refreshBc(): Promise<BcView | null> {
    try {
      const r = await fetch("/api/admin2?what=broadcast").then((x) => x.json());
      if (typeof r?.audience === "number") setReach(r.audience);
      if (r?.broadcast) {
        setBc(r.broadcast as BcView);
        return r.broadcast as BcView;
      }
    } catch {
      /* اللوحة ما تزال تخدم */
    }
    return null;
  }

  useEffect(() => {
    refreshBc();
  }, []);

  const wait = (ms: number) => new Promise<void>((res) => window.setTimeout(res, ms));

  /* 📢 كلينا كملنا الدفعة — نكمّلو الدفعات الباقية وحدة بوحدة */
  async function finishBroadcast() {
    setPushing(true);
    try {
      for (let i = 0; i < 300; i++) {
        const r = (await api({ action: "broadcast_tick" })) as { broadcast?: BcView };
        const v = (r.broadcast || null) as BcView | null;
        if (v) setBc(v);
        if (!v || v.finished || v.stopped || v.remaining <= 0) {
          if (v?.finished) flash("ok", `✅ البثّ وصل لـ ${v.sent} مستخدم (من ${v.total})`);
          break;
        }
        await wait(500);
      }
    } catch (e) {
      flash("err", String((e as Error).message));
    } finally {
      setPushing(false);
    }
  }

  async function send() {
    if (!text.trim()) return;
    if (target === "all") {
      const n = bc?.total || audience || users.length;
      if (!window.confirm(`تحب تبعث هاد الرسالة لجميع المستخدمين (${n}) منذ إنشاء البوت؟`)) return;
      setBusy(true);
      setOut("");
      try {
        const r = (await api({ action: "broadcast_start", text })) as { broadcast?: BcView };
        setBc((r.broadcast || null) as BcView | null);
        setText("");
        setBusy(false);
        await finishBroadcast();
      } catch (e) {
        flash("err", String((e as Error).message));
        setBusy(false);
      }
      return;
    }
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

  async function stopBc() {
    setPushing(true);
    try {
      const r = (await api({ action: "broadcast_stop" })) as { broadcast?: BcView };
      if (r.broadcast) setBc(r.broadcast as BcView);
      flash("ok", "وقّفنا البثّ");
    } catch (e) {
      flash("err", String((e as Error).message));
    } finally {
      setPushing(false);
    }
  }

  const running = Boolean(bc && bc.running);

  return (
    <div className="a2-card">
      <h2>
        ✉️ رسالة لمستخدم / بثّ للجميع{" "}
        <span className="a2-hint">HTML مسموح: &lt;b&gt; &lt;i&gt; &lt;a&gt;</span>
      </h2>

      {/* 📢 البثّ الجماعي — لجميع المستخدمين منذ إنشاء البوت */}
      <div className="a2-grid" style={{ marginBottom: 12 }}>
        <div>
          <div className="a2-hint" style={{ marginBottom: 6 }}>
            📢 البثّ الجماعي كيمشي لكل من بدأ البوت — <b>{reach ?? bc?.total ?? audience ?? users.length}</b>{" "}
            مستخدم (دفعات آمنة ~8 رسائل/ثانية، ما كينسان حتى واحد، واللي حظر البوت كيتسجّل).
          </div>
          {bc ? (
            <>
              <div className="progress" style={{ marginBottom: 6 }}>
                <div style={{ width: `${Math.max(2, Math.min(100, bc.pct))}%` }} />
              </div>
              <div className="a2-row" style={{ flexWrap: "wrap" }}>
                <span className={`a2-pill ${bc.finished ? "on" : "gold"}`}>
                  {bc.finished ? "✓ مكمّل" : bc.stopped ? "⏸ موقّف" : "…كنبعث"} {bc.pct}%
                </span>
                <span className="a2-pill on">وصل: {bc.sent}</span>
                <span className="a2-pill off"> فشل: {bc.failed}</span>
                <span className="a2-pill off">🚫 حظر البوت: {bc.blocked}</span>
                <span className="a2-pill off">محظور من اللوحة: {bc.skipped}</span>
                <span className="a2-pill off">باقي: {bc.remaining}</span>
              </div>
              {bc.lastError ? <div className="a2-hint" style={{ marginTop: 6 }}>آخر خطأ: {bc.lastError}</div> : null}
            </>
          ) : (
            <div className="a2-hint">ماكا حتى بثّ شغّال دابا.</div>
          )}
          <div className="a2-row" style={{ marginTop: 8 }}>
            {running && !pushing ? (
              <button className="btn2 sm gold" onClick={finishBroadcast}>
                ▶️ كمّل البثّ ({bc?.remaining ?? 0} باقي)
              </button>
            ) : null}
            {running && pushing ? (
              <button className="btn2 sm" onClick={refreshBc}>
                ↻ حدّث التقدم
              </button>
            ) : null}
            {running ? (
              <button className="btn2 sm red" onClick={stopBc} disabled={pushing && false}>
                ⏹ وقّف
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <label className="f">
        <span>المرسل إليه</span>
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="all">📢 الجميع — كل المستخدمين ({bc?.total ?? audience ?? users.length})</option>
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
        <button className="btn2 gold" onClick={send} disabled={busy || pushing || !text.trim()}>
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

/* ───────────────────────────── ⚙️ الإعدادات ───────────────────────────── */
function SettingsTab({ data, flash, onDone }: { data: Data; flash: (k: "ok" | "err", t: string) => void; onDone: () => void }) {
  const [maint, setMaint] = useState(Boolean(data.settings.maintenanceMode));
  const [busy, setBusy] = useState(false);

  async function saveMaint(next: boolean) {
    setBusy(true);
    try {
      await api({ action: "save_settings", settings: { maintenanceMode: next } });
      setMaint(next);
      flash("ok", next ? "شعّلت وضع الصيانة 🛠️" : "طفّيت وضع الصيانة — البوت رجع يخدم ✅");
      onDone();
    } catch (e) {
      flash("err", String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="a2-card">
      <h2>⚙️ إعدادات البوت</h2>
      <div className="a2-item" style={{ marginBottom: 14 }}>
        <div className="top">
          <b>🛠️ وضع الصيانة</b>
          <span className={`a2-pill ${maint ? "off" : "on"}`}>{maint ? "شاعل — البوت يعتذر" : "مطفي — البوت يخدم"}</span>
        </div>
        <div className="a2-row">
          <button className="btn2 red" onClick={() => saveMaint(true)} disabled={busy || maint}>
            🛠️ شعّل الصيانة
          </button>
          <button className="btn2 blue" onClick={() => saveMaint(false)} disabled={busy || !maint}>
            ✅ طفي الصيانة
          </button>
        </div>
        <div className="a2-muted" style={{ marginTop: 6 }}>
          في الصيانة: الزبون يلقى رسالة اعتذار لطيفة + زر مراسلتك. أنت والأدمن تبقاو تخدمو عادي.
        </div>
      </div>
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
