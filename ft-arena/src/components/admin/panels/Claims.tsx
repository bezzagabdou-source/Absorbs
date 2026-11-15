"use client";
import { useCallback, useEffect, useState } from "react";
import { Empty, Spinner, api, fmtNum, relTime, toast } from "../ui";

type C = {
  id: string;
  code: string;
  userId: number;
  userName: string;
  rewardTitle: string;
  cost: number;
  status: string;
  createdAt: string;
  decidedAt?: string;
  adminNote?: string;
};

const ST: Record<string, { label: string; cls: string }> = {
  pending: { label: "⏳ معلّق", cls: "badge-gold" },
  approved: { label: "✅ مقبول", cls: "badge-green" },
  delivered: { label: "📦 مسلَّم", cls: "badge-blue" },
  rejected: { label: "❌ مرفوض", cls: "badge-red" },
};

export default function Claims({ onChange }: { onChange?: () => void }) {
  const [list, setList] = useState<C[]>([]);
  const [status, setStatus] = useState("pending");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ claims: C[]; counts: Record<string, number> }>(`/api/admin/claims?status=${status}`);
      setList(r.claims);
      setCounts(r.counts);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }, [status]);
  useEffect(() => void load(), [load]);

  async function act(c: C, action: "approve" | "reject" | "deliver", noteArg?: string) {
    setBusy(c.id);
    try {
      await api("/api/admin/claims", { id: c.id, action, note: noteArg ?? undefined });
      toast(action === "reject" ? "تم الرفض وإرجاع النقاط" : "تم ✅", "ok");
      await load();
      onChange?.();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card row-between wrap" style={{ padding: 14 }}>
        <div className="row wrap">
          {["pending", "approved", "delivered", "rejected", "all"].map((s) => (
            <button key={s} className={`pill ${status === s ? "active" : ""}`} onClick={() => setStatus(s)}>
              {s === "all" ? "الكل" : ST[s].label} {counts[s] ? `(${counts[s]})` : ""}
            </button>
          ))}
        </div>
        <a className="btn btn-ghost btn-sm" href="/api/admin/export?format=json">⬇️ نسخة احتياطية</a>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>الرمز</th>
                <th>العضو</th>
                <th>الجائزة</th>
                <th>النقاط</th>
                <th>الوقت</th>
                <th>الحالة</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><code className="gold" style={{ fontSize: 12 }}>{c.code}</code></td>
                  <td>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{c.userName}</div>
                    <div className="muted-2" style={{ fontSize: 10.5 }}>#{c.userId}</div>
                  </td>
                  <td style={{ fontSize: 12.5 }}>{c.rewardTitle}</td>
                  <td><span className="badge badge-gold">{fmtNum(c.cost)}</span></td>
                  <td className="muted-2" style={{ fontSize: 11.5 }}>{relTime(c.createdAt)}</td>
                  <td><span className={`badge ${ST[c.status]?.cls ?? "badge-muted"}`}>{ST[c.status]?.label ?? c.status}</span></td>
                  <td>
                    <div className="row" style={{ gap: 5 }}>
                      {c.status === "pending" && (
                        <>
                          <button className="btn btn-emerald btn-sm" disabled={busy === c.id} onClick={() => act(c, "approve")}>
                            {busy === c.id ? <Spinner /> : "موافقة"}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              const n = prompt("سبب الرفض (سيصل للمستخدم) — اتركه فارغًا للاسترداد التلقائي:");
                              if (n !== null) void act(c, "reject", n);
                            }}
                          >
                            رفض
                          </button>
                        </>
                      )}
                      {(c.status === "approved" || c.status === "pending") && (
                        <button className="btn btn-primary btn-sm" disabled={busy === c.id} onClick={() => act(c, "deliver")}>
                          تسليم
                        </button>
                      )}
                      {(c.status === "delivered" || c.status === "rejected") && (
                        <span className="muted-2" style={{ fontSize: 11 }}>{c.decidedAt ? relTime(c.decidedAt) : "—"}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && <Empty text="لا توجد طلبات في هذا التصنيف." />}
      </div>
    </div>
  );
}
