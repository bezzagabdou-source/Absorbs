"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Btn,
  Card,
  CopyBtn,
  Empty,
  Input,
  Modal,
  SearchBox,
  Spinner,
  Textarea,
  apiGet,
  apiPost,
  dateTime,
  money,
  toast,
  useApi,
  useConfirm,
} from "@/components/ui";

type Order = {
  id: number;
  code: string;
  user_id: string;
  username: string | null;
  first_name: string | null;
  kind: string;
  product_id: number | null;
  product_name: string;
  quantity: number;
  amount: string;
  currency: string;
  rate: string | null;
  usd_amount: string | null;
  status: string;
  payment_method: string | null;
  receipt_file_id: string | null;
  details: Record<string, string> | null;
  note: string | null;
  admin_note: string | null;
  created_at: string;
};

type ListResponse = { ok: boolean; rows: Order[]; total: number; page: number; limit: number };

const STATUS_META: Record<string, { label: string; tone: "amber" | "emerald" | "red" | "slate" | "sky" }> = {
  pending_payment: { label: "⏳ بانتظار الدفع", tone: "amber" },
  awaiting_review: { label: "🟡 قيد التحقق", tone: "amber" },
  approved: { label: "🟢 مقبول", tone: "emerald" },
  delivered: { label: "✅ تم التسليم", tone: "emerald" },
  rejected: { label: "🔴 مرفوض", tone: "red" },
  cancelled: { label: "⚪️ ملغى", tone: "slate" },
};

const TABS = [
  { key: "all", label: "الكل" },
  { key: "review", label: "🟡 قيد التحقق" },
  { key: "pending_payment", label: "⏳ بانتظار الدفع" },
  { key: "delivered", label: "✅ مسلّمة" },
  { key: "rejected", label: "🔴 مرفوضة" },
];

export default function OrdersPage(): React.ReactElement {
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ order: Order; user: Record<string, unknown> | null } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, node } = useConfirm();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("status")) setStatus(params.get("status") as string);
    if (params.get("focus")) setFocusId(Number(params.get("focus")));
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams({ status, kind, page: String(page), limit: "20" });
    if (search.trim()) p.set("search", search.trim());
    return `orders?${p.toString()}`;
  }, [status, kind, page, search]);

  const { data, error, loading, reload } = useApi<ListResponse>(query);

  const openDetail = async (id: number) => {
    try {
      const res = await apiGet<{ order: Order; user: Record<string, unknown> | null }>(`orders/${id}`);
      setDetail(res);
      setNote(res.order.admin_note ?? "");
    } catch (err) {
      toast((err as Error).message, "err");
    }
  };

  useEffect(() => {
    if (focusId) {
      openDetail(focusId);
      setFocusId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  const setOrderStatus = async (id: number, next: string) => {
    setBusy(true);
    try {
      await apiPost(`orders/${id}`, { status: next, adminNote: note || undefined });
      toast("تم تحديث الطلب وإعلام الزبون");
      setDetail(null);
      reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const removeOrder = (id: number) => {
    confirm("سيتم حذف الطلب نهائياً من قاعدة البيانات. متابعة؟", async () => {
      try {
        await apiPost(`orders/${id}/delete`);
        toast("تم حذف الطلب");
        setDetail(null);
        reload();
      } catch (err) {
        toast((err as Error).message, "err");
      }
    });
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (data?.limit ?? 20)));

  return (
    <div className="space-y-4">
      {node}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">الطلبات</h1>
          <p className="mt-1 text-xs text-slate-400">
            {total.toLocaleString("en-US")} طلب — راجع الإيصالات، اقبل أو ارفض، وتابع التسليم
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/api/admin/export/orders" className="btn btn-ghost text-xs">
            ⬇️ تصدير CSV
          </a>
          <Btn variant="ghost" onClick={reload}>
            🔄 تحديث
          </Btn>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setStatus(t.key);
                setPage(1);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                status === t.key
                  ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/25"
                  : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="mr-auto flex gap-2">
            <select
              className="field w-auto py-1.5 text-xs"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">كل الأنواع</option>
              <option value="product">منتجات</option>
              <option value="usd">بيع دولار</option>
            </select>
            <div className="w-56">
              <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="كود، منتج، مستخدم…" />
            </div>
          </div>
        </div>

        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <p className="py-6 text-center text-sm text-red-300">{error}</p>
        ) : rows.length === 0 ? (
          <Empty icon="🧾" title="لا طلبات في هذا التصنيف" hint="جرّب تغيير الفلتر أو البحث بكود الطلب" />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>الكود</th>
                  <th>الزبون</th>
                  <th>المنتج</th>
                  <th>المبلغ</th>
                  <th>الدفع</th>
                  <th>الحالة</th>
                  <th>التاريخ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const meta = STATUS_META[o.status] ?? { label: o.status, tone: "slate" as const };
                  return (
                    <tr key={o.id}>
                      <td>
                        <button
                          onClick={() => openDetail(o.id)}
                          className="font-mono text-[0.72rem] font-bold text-emerald-300 hover:underline"
                        >
                          {o.code}
                        </button>
                        {o.kind === "usd" && <Badge tone="violet">💵 USD</Badge>}
                      </td>
                      <td className="text-xs text-slate-300">
                        {o.username ? `@${o.username}` : o.first_name || "—"}
                        <span className="block text-[0.6rem] text-slate-600">{o.user_id}</span>
                      </td>
                      <td className="max-w-[12rem] truncate text-xs text-slate-200">
                        {o.product_name}
                        {o.kind === "usd" && o.usd_amount ? ` (${o.usd_amount}$)` : ""}
                      </td>
                      <td className="whitespace-nowrap text-xs font-black text-white">{money(o.amount, o.currency)}</td>
                      <td className="text-[0.68rem] text-slate-400">{o.payment_method ?? "—"}</td>
                      <td>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className="whitespace-nowrap text-[0.65rem] text-slate-500">{dateTime(o.created_at)}</td>
                      <td>
                        <div className="flex gap-1">
                          <Btn size="sm" variant="ghost" onClick={() => openDetail(o.id)}>
                            👁
                          </Btn>
                          {o.status === "awaiting_review" && (
                            <Btn size="sm" onClick={() => setOrderStatus(o.id, "delivered")}>
                              ✅
                            </Btn>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← السابق
            </Btn>
            <span className="text-xs text-slate-400">
              {page} / {pages}
            </span>
            <Btn variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              التالي →
            </Btn>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={`تفاصيل الطلب ${detail?.order.code ?? ""}`}
        wide
        footer={
          detail && (
            <>
              {detail.order.status !== "delivered" && (
                <Btn onClick={() => setOrderStatus(detail.order.id, "delivered")} disabled={busy}>
                  ✅ قبول وتسليم
                </Btn>
              )}
              {detail.order.status !== "rejected" && (
                <Btn variant="red" onClick={() => setOrderStatus(detail.order.id, "rejected")} disabled={busy}>
                  ❌ رفض الطلب
                </Btn>
              )}
              <Btn variant="ghost" onClick={() => removeOrder(detail.order.id)}>
                🗑 حذف
              </Btn>
            </>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={(STATUS_META[detail.order.status]?.tone ?? "slate") as "amber"}>
                {STATUS_META[detail.order.status]?.label ?? detail.order.status}
              </Badge>
              <CopyBtn text={detail.order.code} label="كود الطلب" />
              <span className="text-xs text-slate-500">{dateTime(detail.order.created_at)}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/8 bg-black/30 p-3">
                <p className="text-[0.7rem] text-slate-500">المنتج</p>
                <p className="text-sm font-bold text-white">{detail.order.product_name}</p>
                <p className="mt-1 text-xs text-emerald-400">
                  {money(detail.order.amount, detail.order.currency)}
                  {detail.order.kind === "usd" && detail.order.usd_amount
                    ? ` • ${detail.order.usd_amount}$ × ${detail.order.rate}`
                    : ""}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/30 p-3">
                <p className="text-[0.7rem] text-slate-500">الزبون</p>
                <p className="text-sm font-bold text-white">
                  {detail.order.username ? `@${detail.order.username}` : detail.order.first_name ?? "—"}
                </p>
                <p className="text-xs text-slate-500">{detail.order.user_id}</p>
                <div className="mt-2 flex gap-1">
                  <CopyBtn text={detail.order.user_id} label="ID" />
                  <a className="btn btn-ghost px-2 py-1 text-xs" href={`tg://user?id=${detail.order.user_id}`}>
                    💬 محادثة
                  </a>
                </div>
              </div>
            </div>

            {detail.order.details && Object.keys(detail.order.details).length > 0 && (
              <div className="rounded-xl border border-white/8 bg-black/30 p-3">
                <p className="mb-2 text-[0.7rem] text-slate-500">بيانات الزبون</p>
                <ul className="space-y-1">
                  {Object.entries(detail.order.details).map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-400">{k}</span>
                      <span className="flex items-center gap-1 font-mono text-emerald-300">
                        {String(v)} <CopyBtn text={String(v)} label="" />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-2 text-[0.7rem] text-slate-500">إيصال الدفع</p>
              {detail.order.receipt_file_id ? (
                <a href={`/api/receipt/${detail.order.id}`} target="_blank">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/receipt/${detail.order.id}`}
                    alt="الإيصال"
                    className="max-h-96 w-full rounded-xl border border-white/10 object-contain"
                  />
                </a>
              ) : (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">لا يوجد إيصال مرفق بعد.</p>
              )}
            </div>

            <div>
              <label className="label">ملاحظة للزبون (تُرسل مع القبول/الرفض)</label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: تم التفعيل، شكراً لثقتك" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
