"use client";
import { useCallback, useEffect, useState } from "react";
import { Avatar, Copy, Empty, Field, Modal, Num, Spinner, api, fmtNum, relTime, toast } from "../ui";

type U = {
  id: number;
  name: string;
  username?: string;
  photo?: string | null;
  points: number;
  earned: number;
  spent: number;
  refs: number;
  refsActive: number;
  joinedAt: string;
  lastSeenAt: string;
  banned: boolean;
  vip: boolean;
  status: string;
  messages: number;
  streak: number;
  refCode: string;
  refBy?: number;
  link: string;
  history: { at: string; delta: number; kind: string; note: string }[];
};

export default function Users() {
  const [items, setItems] = useState<U[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("points");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<U | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await api<{ items: U[]; total: number }>(
        `/api/admin/users?q=${encodeURIComponent(q)}&sort=${sort}&filter=${filter}&page=${page}`
      );
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }, [q, sort, filter, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!sel) return;
    try {
      await api("/api/admin/users", { action, id: sel.id, ...extra });
      toast("تم التنفيذ ✅", "ok");
      await load();
      setSel(null);
      setAmount("");
      setMsg("");
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  const pages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card" style={{ padding: 14 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <input
            className="input"
            placeholder="🔍 بحث بالاسم / المعرف / @username / كود الإحالة…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            style={{ maxWidth: 340 }}
          />
          <select className="select" style={{ width: 160 }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="points">الأكثر نقاطًا</option>
            <option value="refs">الأكثر إحالات</option>
            <option value="new">الأحدث انضمامًا</option>
            <option value="active">آخر نشاط</option>
            <option value="earned">الأكثر جمعًا</option>
          </select>
          <select className="select" style={{ width: 150 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">الكل</option>
            <option value="active">نشطون</option>
            <option value="inactive">غير نشطين</option>
            <option value="refs">لديهم إحالات</option>
            <option value="vip">VIP 👑</option>
            <option value="banned">محظورون 🚫</option>
          </select>
          <div className="grow" />
          <span className="badge badge-muted">{fmtNum(total)} عضو</span>
          <a className="btn btn-ghost btn-sm" href="/api/admin/export?format=csv">⬇️ CSV</a>
          {busy && <Spinner />}
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>العضو</th>
                <th>النقاط</th>
                <th>الإحالات</th>
                <th>آخر نشاط</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="row" style={{ gap: 9 }}>
                      <Avatar src={u.photo ? `/api/avatar/${u.id}` : null} name={u.name} size="sm" />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 13 }}>
                          {u.name} {u.vip && "👑"}
                        </div>
                        <div className="muted-2" style={{ fontSize: 10.5 }}>
                          {u.username ? `@${u.username}` : `#${u.id}`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td><span className="badge badge-gold"><Num value={u.points} /></span></td>
                  <td>
                    <span className="badge badge-green">{u.refsActive}/{u.refs}</span>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{relTime(u.lastSeenAt)}</td>
                  <td>
                    {u.banned ? (
                      <span className="badge badge-red">محظور</span>
                    ) : u.status === "left" ? (
                      <span className="badge badge-muted">غادر</span>
                    ) : (
                      <span className="badge badge-green">نشط</span>
                    )}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSel(u)}>
                      إدارة
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length && !busy && <Empty text="لا يوجد أعضاء مطابقون." />}
      </div>

      <div className="row-between">
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</button>
        <span className="muted" style={{ fontSize: 12 }}>صفحة {page} من {pages}</span>
        <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>التالي</button>
      </div>

      <Modal open={Boolean(sel)} onClose={() => setSel(null)} title={`إدارة: ${sel?.name ?? ""}`} width={640}>
        {sel && (
          <div className="col" style={{ gap: 12 }}>
            <div className="card-soft row-between" style={{ padding: 12 }}>
              <div className="row" style={{ gap: 10 }}>
                <Avatar src={sel.photo ? `/api/avatar/${sel.id}` : null} name={sel.name} size="lg" />
                <div>
                  <div style={{ fontWeight: 900 }}>{sel.name} {sel.vip && "👑"}</div>
                  <div className="muted-2" style={{ fontSize: 11.5 }}>
                    🆔 {sel.id} {sel.username ? `• @${sel.username}` : ""}
                  </div>
                  <div className="muted-2" style={{ fontSize: 11 }}>
                    انضم {relTime(sel.joinedAt)} • {sel.messages} رسالة • سلسلة {sel.streak}
                  </div>
                </div>
              </div>
              <span className="badge badge-gold">{fmtNum(sel.points)} نقطة</span>
            </div>

            <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {[
                ["جمع", sel.earned],
                ["استهلك", sel.spent],
                ["إحالات", sel.refs],
              ].map(([k, v]) => (
                <div key={k as string} className="card-soft center" style={{ padding: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 17 }} className="gold">{fmtNum(v as number)}</div>
                  <div className="muted-2" style={{ fontSize: 11 }}>{k as string}</div>
                </div>
              ))}
            </div>

            <div className="row">
              <code className="grow" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>{sel.link}</code>
              <Copy text={sel.link} label="الرابط" />
            </div>

            <div className="card-soft" style={{ padding: 12 }}>
              <div className="label">تعديل النقاط</div>
              <div className="row">
                <input
                  className="input"
                  type="number"
                  placeholder="مثال: 10 أو -5"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <input className="input" placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="row wrap" style={{ marginTop: 8 }}>
                <button className="btn btn-emerald btn-sm" onClick={() => act("add", { amount: Number(amount) || 0, note })}>
                  ➕ إضافة/خصم
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => act("set", { amount: Number(amount) || 0, note })}>
                  🎯 تعيين الرصيد
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => act("reset")}>♻️ تصفير</button>
              </div>
            </div>

            <div className="card-soft" style={{ padding: 12 }}>
              <div className="label">رسالة خاصة للمستخدم</div>
              <div className="row">
                <input className="input" placeholder="نص الرسالة…" value={msg} onChange={(e) => setMsg(e.target.value)} />
                <button className="btn btn-primary btn-sm" onClick={() => act("message", { message: msg })}>إرسال</button>
              </div>
            </div>

            <div className="row wrap">
              <button className="btn btn-ghost btn-sm" onClick={() => act("vip")}>
                {sel.vip ? "👑 إزالة VIP" : "👑 منح VIP"}
              </button>
              {sel.banned ? (
                <button className="btn btn-emerald btn-sm" onClick={() => act("unban")}>✅ فك الحظر</button>
              ) : (
                <button className="btn btn-danger btn-sm" onClick={() => act("ban", { reason: "مخالفة القوانين" })}>🚫 حظر</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => act("refreshPhoto")}>🖼️ تحديث الصورة</button>
            </div>

            <div>
              <div className="label">آخر الحركات</div>
              <div className="col" style={{ gap: 5, maxHeight: 180, overflow: "auto" }}>
                {sel.history.length ? (
                  sel.history.map((h, i) => (
                    <div key={i} className="row-between card-soft" style={{ padding: "6px 10px", fontSize: 11.5 }}>
                      <span className="muted">{h.note}</span>
                      <span className={h.delta >= 0 ? "emerald" : "red"} style={{ fontWeight: 800 }}>
                        {h.delta >= 0 ? "+" : ""}{h.delta}
                      </span>
                    </div>
                  ))
                ) : (
                  <Empty text="لا توجد حركات." />
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
