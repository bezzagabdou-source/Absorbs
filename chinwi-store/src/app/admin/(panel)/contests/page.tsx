"use client";

import { useState } from "react";
import {
  Badge,
  Btn,
  Card,
  CopyBtn,
  Empty,
  Field,
  Input,
  Select,
  Spinner,
  Stat,
  Textarea,
  apiPost,
  dateTime,
  toast,
  useApi,
} from "@/components/ui";

type Prize = { id: number; title: string; points: number; icon: string; note: string; active: boolean; sort: number; claims?: number };
type Redemption = {
  id: number;
  user_id: string;
  prize_title: string;
  points: number;
  status: string;
  note: string | null;
  created_at: string;
  username?: string | null;
  first_name?: string | null;
};
type Referral = {
  id: number;
  inviter_id: string;
  invitee_id: string;
  points: number;
  created_at: string;
  inviter_name?: string | null;
  inviter_username?: string | null;
  invitee_name?: string | null;
  invitee_username?: string | null;
};
type Top = { tg_id: string; username: string | null; first_name: string | null; referrals_count: string; points: string };

type Response = {
  ok: boolean;
  prizes: Prize[];
  redemptions: Redemption[];
  pending: Redemption[];
  top: Top[];
  referrals: Referral[];
  stats: { referrals: number; points: number; pending: number };
};

const STATUS_LABEL: Record<string, string> = {
  pending: "⏳ معلق",
  approved: "✅ مقبول",
  rejected: "🔴 مرفوض",
};

export default function ContestsPage(): React.ReactElement {
  const { data, error, loading, reload } = useApi<Response>("contests");
  const [form, setForm] = useState({ title: "", points: "25", icon: "🎁", note: "", sort: "10" });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [editPoints, setEditPoints] = useState("");

  const create = async () => {
    if (!form.title.trim()) return toast("اكتب اسم الجائزة", "err");
    setBusy(true);
    try {
      await apiPost("prizes", {
        title: form.title.trim(),
        points: Number(form.points || 0),
        icon: form.icon || "🎁",
        note: form.note.trim(),
        sort: Number(form.sort || 99),
      });
      toast("تمت إضافة الجائزة 🎁");
      setForm({ title: "", points: "25", icon: "🎁", note: "", sort: "10" });
      reload();
    } catch (e) {
      toast(String((e as Error).message), "err");
    } finally {
      setBusy(false);
    }
  };

  const togglePrize = async (p: Prize) => {
    await apiPost(`prizes/${p.id}`, { active: !p.active }).catch(() => null);
    toast(p.active ? "أُخفيت الجائزة" : "أُعيد تفعيل الجائزة");
    reload();
  };
  const removePrize = async (p: Prize) => {
    await apiPost(`prizes/${p.id}/delete`).catch(() => null);
    toast("تم حذف الجائزة");
    reload();
  };
  const savePoints = async (p: Prize) => {
    if (!editPoints.trim()) return setEditing(null);
    await apiPost(`prizes/${p.id}`, { points: Number(editPoints) }).catch(() => null);
    toast("تم تحديث النقاط");
    setEditing(null);
    reload();
  };
  const decide = async (r: Redemption, action: "approve" | "reject") => {
    try {
      await apiPost(`redemptions/${r.id}`, { action });
      toast(action === "approve" ? "تمت الموافقة وإرسال إشعار للزبون 🎉" : "تم الرفض وإعادة النقاط للزبون");
      reload();
    } catch (e) {
      toast(String((e as Error).message), "err");
    }
  };

  if (loading && !data) return <Spinner label="تحميل المسابقات…" />;

  const pending = data?.pending ?? [];
  const referrals = data?.referrals ?? [];

  return (
    <div className="fade-in space-y-4">
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -left-14 -top-16 h-48 w-48 rounded-full bg-violet-300/35 blur-3xl" />
        <h1 className="relative text-2xl font-black text-emerald-950">🎉 المسابقات والإحالات</h1>
        <p className="relative mt-1 max-w-2xl text-xs font-bold text-emerald-900/60">
          كل شخص يدخل البوت من رابط إحالة يُحتسب <span className="font-black text-violet-800">+1 نقطة</span> لصاحب الرابط.
          الجوائز تُستبدل بالنقاط وتحتاج موافقتك قبل التسليم.
        </p>
      </div>

      {error ? <p className="text-center text-sm text-rose-600">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="إجمالي الإحالات" value={data?.stats.referrals ?? 0} icon="🔗" tone="violet" />
        <Stat label="نقاط موزعة" value={data?.stats.points ?? 0} icon="⭐️" tone="amber" />
        <Stat label="طلبات معلقة" value={data?.stats.pending ?? 0} icon="📩" tone="sky" />
      </div>

      {/* طلبات الاستبدال المعلقة */}
      <Card
        title={`📩 طلبات الاستبدال المعلقة (${pending.length})`}
        action={<Btn size="sm" variant="ghost" onClick={reload}>↻</Btn>}
      >
        {pending.length === 0 ? (
          <Empty icon="✅" title="لا توجد طلبات معلقة" hint="كل الطلبات تمت معالجتها" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>الجائزة</th>
                  <th>الزبون</th>
                  <th>النقاط</th>
                  <th>التاريخ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id}>
                    <td className="font-bold">🎁 {r.prize_title}</td>
                    <td>
                      {r.first_name || "زبون"}
                      {r.username ? <span className="text-emerald-900/55"> @{r.username}</span> : null}
                      <span className="ms-1 font-mono text-[0.62rem] text-emerald-900/45">{r.user_id}</span>
                    </td>
                    <td className="font-black text-violet-800">⭐️ {r.points}</td>
                    <td className="text-[0.72rem] text-emerald-900/60">{dateTime(r.created_at)}</td>
                    <td>
                      <div className="flex gap-1.5">
                        <Btn size="sm" onClick={() => decide(r, "approve")}>✅ تسليم</Btn>
                        <Btn size="sm" variant="red" onClick={() => decide(r, "reject")}>🔴 رفض</Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        {/* الجوائز */}
        <Card title="🎁 الجوائز والنقاط">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="الجائزة">
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="10 فليكسي" />
              </Field>
              <Field label="النقاط المطلوبة">
                <Input type="number" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} placeholder="25" />
              </Field>
              <Field label="الإيموجي">
                <Input dir="ltr" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="🎁" />
              </Field>
              <Field label="الترتيب (الأصغر أولاً)">
                <Input type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value })} placeholder="10" />
              </Field>
            </div>
            <Field label="ملاحظة (اختياري)">
              <Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="يُرسل بعد الموافقة" />
            </Field>
            <Btn className="w-full" onClick={create} disabled={busy}>
              {busy ? "…" : "➕ إضافة الجائزة"}
            </Btn>
          </div>

          <div className="mt-4 space-y-2">
            {(data?.prizes ?? []).map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                  p.active ? "border-emerald-900/10 bg-white/70" : "border-slate-300/40 bg-slate-100/60 opacity-60"
                }`}
              >
                <span className="text-xl">{p.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-emerald-950">{p.title}</p>
                  <p className="text-[0.65rem] text-emerald-900/55">
                    {p.claims ?? 0} طلب مستبدل{p.note ? ` • ${p.note}` : ""}
                  </p>
                </div>
                {editing === p.id ? (
                  <span className="flex items-center gap-1">
                    <Input
                      type="number"
                      autoFocus
                      className="w-20"
                      value={editPoints}
                      onChange={(e) => setEditPoints(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && savePoints(p)}
                    />
                    <Btn size="sm" onClick={() => savePoints(p)}>✔</Btn>
                  </span>
                ) : (
                  <button
                    className="rounded-lg bg-violet-500/15 px-2 py-1 text-xs font-black text-violet-900 transition hover:bg-violet-500/25"
                    onClick={() => {
                      setEditing(p.id);
                      setEditPoints(String(p.points));
                    }}
                    title="اضغط لتعديل النقاط"
                  >
                    ⭐️ {p.points}
                  </button>
                )}
                <Btn size="sm" variant="ghost" onClick={() => togglePrize(p)} title={p.active ? "إخفاء" : "إظهار"}>
                  {p.active ? "🙈" : "👁"}
                </Btn>
                <Btn size="sm" variant="red" onClick={() => removePrize(p)} title="حذف">
                  🗑
                </Btn>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          {/* المتصدرون */}
          <Card title="🥇 المتصدرون">
            {(data?.top ?? []).length === 0 ? (
              <Empty icon="🏁" title="لا إحالات بعد" hint="شارك رابط المسابقة مع زبائنك" />
            ) : (
              <ol className="space-y-1.5">
                {(data?.top ?? []).map((t, i) => (
                  <li
                    key={t.tg_id}
                    className="flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-50/60 px-3 py-2 text-sm"
                  >
                    <span className="text-lg">{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`}</span>
                    <span className="min-w-0 flex-1 truncate font-bold text-emerald-950">
                      {t.first_name || "زبون"} {t.username ? <span className="text-[0.7rem] text-emerald-900/55">@{t.username}</span> : null}
                    </span>
                    <span className="text-xs font-black text-amber-800">{t.referrals_count} إحالة</span>
                    <span className="text-xs font-black text-violet-800">⭐️ {t.points}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {/* سجل الإحالات الكامل */}
          <Card
            title={`🔗 الإحالات — من جاء من رابط من؟ (${referrals.length})`}
            action={<CopyBtn text={referrals.map((r) => r.inviter_id + " -> " + r.invitee_id).join("\n")} label="نسخ الكل" />}
          >
            {referrals.length === 0 ? (
              <Empty icon="🔗" title="لا إحالات مسجلة" hint="ستظهر هنا كل شخص دخل من رابط إحالة مع صاحبه" />
            ) : (
              <div className="max-h-[28rem] overflow-y-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>دخل من</th>
                      <th>أرسله</th>
                      <th>نقاط</th>
                      <th>التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <span className="font-bold text-emerald-950">{r.invitee_name || "زبون"}</span>
                          {r.invitee_username ? <span className="text-[0.68rem] text-emerald-900/55"> @{r.invitee_username}</span> : null}
                          <span className="ms-1 font-mono text-[0.6rem] text-emerald-900/45">{r.invitee_id}</span>
                        </td>
                        <td>
                          <span className="font-bold text-violet-900">{r.inviter_name || "—"}</span>
                          {r.inviter_username ? <span className="text-[0.68rem] text-violet-800/70"> @{r.inviter_username}</span> : null}
                          <span className="ms-1 font-mono text-[0.6rem] text-violet-800/50">{r.inviter_id}</span>
                        </td>
                        <td className="font-black text-violet-800">+{r.points}</td>
                        <td className="text-[0.68rem] text-emerald-900/60">{dateTime(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* سجل الطلبات الأخيرة */}
      <Card title="📜 آخر طلبات الاستبدال">
        {(data?.redemptions ?? []).length === 0 ? (
          <Empty icon="🎁" title="لا طلبات استبدال بعد" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>الجائزة</th>
                  <th>الزبون</th>
                  <th>النقاط</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {(data?.redemptions ?? []).slice(0, 20).map((r) => (
                  <tr key={r.id}>
                    <td className="font-bold">🎁 {r.prize_title}</td>
                    <td>
                      {r.first_name || "زبون"}
                      {r.username ? <span className="text-emerald-900/55"> @{r.username}</span> : null}
                    </td>
                    <td className="font-black text-violet-800">⭐️ {r.points}</td>
                    <td>
                      <Badge tone={r.status === "approved" ? "emerald" : r.status === "rejected" ? "red" : "amber"}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td className="text-[0.68rem] text-emerald-900/60">{dateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
