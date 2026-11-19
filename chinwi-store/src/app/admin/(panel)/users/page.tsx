"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Badge,
  Btn,
  Card,
  CopyBtn,
  Empty,
  Modal,
  SearchBox,
  Spinner,
  Textarea,
  apiPost,
  dateTime,
  money,
  relative,
  toast,
  useApi,
  useConfirm,
} from "@/components/ui";

type User = {
  tg_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_admin: boolean;
  is_owner: boolean;
  is_blocked: boolean;
  avatar_file_id: string | null;
  orders_count: number;
  total_spent: string;
  notes: string | null;
  ban_reason: string | null;
  created_at: string;
  last_seen_at: string;
  points?: number;
  referrals_count?: number;
  inviter_id?: string | null;
  inviter_name?: string | null;
  inviter_username?: string | null;
};

type Response = { ok: boolean; rows: User[]; total: number; page: number; limit: number };

type Order = { id: number; code: string; product_name: string; amount: string; status: string; created_at: string };

const FILTERS = [
  { key: "all", label: "الكل" },
  { key: "active", label: "🟢 نشط 24س" },
  { key: "buyers", label: "💰 مشترون" },
  { key: "blocked", label: "🔴 محظورون" },
  { key: "admins", label: "🛡 إداريون" },
];

export default function UsersPage(): React.ReactElement {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<{ user: User; text: string } | null>(null);
  const [detail, setDetail] = useState<{ user: User; orders: Order[] } | null>(null);
  const [note, setNote] = useState("");
  const { confirm, node } = useConfirm();

  const query = useMemo(() => {
    const p = new URLSearchParams({ filter, page: String(page), limit: "24" });
    if (search.trim()) p.set("search", search.trim());
    return `users?${p.toString()}`;
  }, [filter, page, search]);

  const { data, error, loading, reload } = useApi<Response>(query);

  const action = async (tgId: string, body: Record<string, unknown>, successText: string) => {
    try {
      await apiPost(`users/${tgId}`, body);
      toast(successText);
      reload();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  };

  const openDetail = async (user: User) => {
    try {
      const res = await (await fetch(`/api/admin/users/${user.tg_id}`, { cache: "no-store" })).json();
      setDetail({ user: res.user, orders: res.orders ?? [] });
      setNote(res.user?.notes ?? "");
    } catch {
      toast("تعذّر تحميل بيانات المستخدم", "err");
    }
  };

  const rows = data?.rows ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.limit ?? 24)));

  return (
    <div className="space-y-4">
      {node}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-emerald-950">المستخدمون</h1>
          <p className="mt-1 text-xs text-emerald-900/65">
            {(data?.total ?? 0).toLocaleString("en-US")} حساب — صورهم، نشاطهم، طلباتهم وحظرهم
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/api/admin/export/users" className="btn btn-ghost text-xs">
            ⬇️ تصدير CSV
          </a>
          <Btn variant="ghost" onClick={reload}>
            🔄 تحديث
          </Btn>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setFilter(f.key);
                setPage(1);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                filter === f.key
                  ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/25"
                  : "border border-emerald-900/10 bg-white/70 text-emerald-900/85 hover:bg-white/85"
              }`}
            >
              {f.label}
            </button>
          ))}
          <div className="mr-auto w-64">
            <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="اسم، يوزر أو ID…" />
          </div>
        </div>

        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <p className="py-6 text-center text-sm text-rose-600">{error}</p>
        ) : rows.length === 0 ? (
          <Empty icon="👥" title="لا مستخدمين مطابقين" />
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((u) => (
              <div key={u.tg_id} className="rounded-xl border border-emerald-900/10 bg-white/55 p-3 transition hover:border-emerald-500/30">
                <div className="flex items-center gap-3">
                  <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-emerald-900/10 bg-black/50 text-sm">
                    {u.avatar_file_id ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={`/api/avatar/${u.tg_id}`} alt="" className="h-full w-full object-cover" />
                    ) : (
                      "👤"
                    )}
                    <span
                      className={`absolute bottom-0 left-0 h-3 w-3 rounded-full border-2 border-[#0b1118] ${
                        u.is_blocked ? "bg-red-500" : "bg-emerald-400"
                      }`}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-emerald-950">
                      {u.first_name || "بدون اسم"} {u.last_name ?? ""}
                    </p>
                    <p className="truncate text-[0.68rem] text-emerald-900/55">
                      {u.username ? `@${u.username}` : `ID ${u.tg_id}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {u.is_owner && <Badge tone="amber">👑 مالك</Badge>}
                    {!u.is_owner && u.is_admin && <Badge tone="violet">🛡 إداري</Badge>}
                    {u.is_blocked && <Badge tone="red">محظور</Badge>}
                  </div>
                </div>

                {u.inviter_id ? (
                  <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-500/10 px-2 py-1.5 text-[0.65rem] text-violet-900">
                    <span>🔗</span>
                    <span className="font-bold">دخل من إحالة</span>
                    <span className="truncate font-black">{u.inviter_name || "—"}{u.inviter_username ? ` (@${u.inviter_username})` : ""}</span>
                    <span className="ms-auto shrink-0 font-mono text-[0.58rem] text-violet-700/70">ID {u.inviter_id}</span>
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-3 gap-1 text-center">
                  <div className="rounded-lg bg-white/70 py-1.5">
                    <p className="text-[0.6rem] text-emerald-900/55">طلبات</p>
                    <p className="text-xs font-black text-emerald-950">{u.orders_count}</p>
                  </div>
                  <div className="rounded-lg bg-white/70 py-1.5">
                    <p className="text-[0.6rem] text-emerald-900/55">أنفق</p>
                    <p className="text-xs font-black text-emerald-600">{money(u.total_spent)}</p>
                  </div>
                  <div className="rounded-lg bg-white/70 py-1.5">
                    <p className="text-[0.6rem] text-emerald-900/55">آخر ظهور</p>
                    <p className="text-[0.65rem] font-bold text-emerald-900/85">{relative(u.last_seen_at)}</p>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Btn size="sm" variant="ghost" onClick={() => openDetail(u)}>
                    👁 تفاصيل
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setMessage({ user: u, text: "" })}>
                    💬 رسالة
                  </Btn>
                  {u.is_blocked ? (
                    <Btn size="sm" onClick={() => action(u.tg_id, { action: "unban" }, "تم إلغاء الحظر")}>
                      🔓 فك الحظر
                    </Btn>
                  ) : (
                    <Btn
                      size="sm"
                      variant="red"
                      onClick={() =>
                        confirm(`سيتم حظر ${u.first_name ?? u.tg_id} من استخدام البوت. متابعة؟`, () =>
                          action(u.tg_id, { action: "ban" }, "تم حظر المستخدم"),
                        )
                      }
                    >
                      🔨 حظر
                    </Btn>
                  )}
                  {!u.is_owner && (
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        action(u.tg_id, { action: u.is_admin ? "unadmin" : "admin" }, u.is_admin ? "أُزيلت الإدارة" : "تمت الترقية لإداري")
                      }
                    >
                      {u.is_admin ? "⬇️ إزالة إدارة" : "⬆️ ترقية"}
                    </Btn>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← السابق
            </Btn>
            <span className="text-xs text-emerald-900/65">
              {page} / {pages}
            </span>
            <Btn variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              التالي →
            </Btn>
          </div>
        )}
      </Card>

      {/* إرسال رسالة */}
      <Modal
        open={Boolean(message)}
        onClose={() => setMessage(null)}
        title="إرسال رسالة للمستخدم"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setMessage(null)}>
              إلغاء
            </Btn>
            <Btn
              onClick={async () => {
                if (!message?.text.trim()) return;
                try {
                  await apiPost(`users/${message.user.tg_id}`, { action: "message", text: message.text });
                  toast("تم إرسال الرسالة ✅");
                  setMessage(null);
                } catch (err) {
                  toast((err as Error).message, "err");
                }
              }}
            >
              📤 إرسال
            </Btn>
          </>
        }
      >
        <p className="mb-2 text-xs text-emerald-900/65">
          إلى: <b className="text-emerald-950">{message?.user.first_name ?? message?.user.tg_id}</b> — يدعم HTML (&lt;b&gt;، &lt;i&gt;، &lt;code&gt;)
        </p>
        <Textarea
          rows={5}
          value={message?.text ?? ""}
          onChange={(e) => setMessage((m) => (m ? { ...m, text: e.target.value } : m))}
          placeholder="اكتب رسالتك هنا…"
        />
      </Modal>

      {/* تفاصيل المستخدم */}
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="ملف المستخدم" wide>
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full border border-emerald-900/10 bg-white/65 text-2xl">
                {detail.user.avatar_file_id ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={`/api/avatar/${detail.user.tg_id}`} alt="" className="h-full w-full object-cover" />
                ) : (
                  "👤"
                )}
              </span>
              <div>
                <p className="text-lg font-black text-emerald-950">{detail.user.first_name ?? "بدون اسم"}</p>
                <p className="text-xs text-emerald-900/65">
                  {detail.user.username ? `@${detail.user.username}` : "—"} • ID {detail.user.tg_id}
                </p>
                <div className="mt-1 flex gap-1">
                  <CopyBtn text={detail.user.tg_id} label="ID" />
                  <a href={`tg://user?id=${detail.user.tg_id}`} className="btn btn-ghost px-2 py-1 text-xs">
                    💬 محادثة
                  </a>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { k: "الطلبات", v: detail.user.orders_count },
                { k: "إجمالي الشراء", v: money(detail.user.total_spent) },
                { k: "انضم", v: dateTime(detail.user.created_at) },
                { k: "آخر ظهور", v: relative(detail.user.last_seen_at) },
              ].map((x) => (
                <div key={x.k} className="rounded-xl bg-white/70 p-2.5 text-center">
                  <p className="text-[0.62rem] text-emerald-900/55">{x.k}</p>
                  <p className="text-xs font-bold text-emerald-950">{String(x.v)}</p>
                </div>
              ))}
            </div>

            <div>
              <label className="label">ملاحظات داخلية</label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظات لا يراها الزبون" />
              <div className="mt-2">
                <Btn
                  size="sm"
                  onClick={async () => {
                    await action(detail.user.tg_id, { action: "note", text: note }, "تم حفظ الملاحظة");
                  }}
                >
                  💾 حفظ
                </Btn>
              </div>
            </div>

            <div>
              <p className="label">طلباته</p>
              {detail.orders.length ? (
                <div className="space-y-1">
                  {detail.orders.map((o) => (
                    <Link
                      key={o.id}
                      href={`/admin/orders?focus=${o.id}`}
                      className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2 text-xs hover:bg-white/85"
                    >
                      <span className="font-mono text-emerald-700">{o.code}</span>
                      <span className="truncate px-2 text-emerald-900/85">{o.product_name}</span>
                      <span className="font-bold text-emerald-950">{money(o.amount)}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-emerald-900/55">لا طلبات.</p>
              )}
            </div>

            <div className="border-t border-emerald-900/10 pt-3">
              <Btn
                variant="red"
                size="sm"
                onClick={() =>
                  confirm("سيتم حذف المستخدم نهائياً من قاعدة البيانات. متابعة؟", async () => {
                    try {
                      await apiPost(`users/${detail.user.tg_id}/delete`);
                      toast("تم حذف المستخدم");
                      setDetail(null);
                      reload();
                    } catch (err) {
                      toast((err as Error).message, "err");
                    }
                  })
                }
              >
                🗑 حذف الحساب
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
