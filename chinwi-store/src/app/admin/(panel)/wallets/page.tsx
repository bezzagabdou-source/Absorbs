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
  Modal,
  Spinner,
  Textarea,
  Toggle,
  apiPost,
  toast,
  useApi,
  useConfirm,
} from "@/components/ui";

type Wallet = {
  id: number;
  name: string;
  emoji: string;
  kind: string;
  account: string;
  holder: string;
  instructions: string;
  active: boolean;
  sort: number;
};

export default function WalletsPage(): React.ReactElement {
  const { data, error, loading, reload } = useApi<{ ok: boolean; wallets: Wallet[] }>("wallets");
  const [editing, setEditing] = useState<Partial<Wallet> | null>(null);
  const { confirm, node } = useConfirm();

  const save = async () => {
    if (!editing?.name?.trim() || !editing?.account?.trim()) {
      toast("الاسم والعنوان مطلوبان", "err");
      return;
    }
    try {
      const payload = {
        name: editing.name,
        emoji: editing.emoji ?? "💳",
        kind: editing.kind ?? "other",
        account: editing.account,
        holder: editing.holder ?? "",
        instructions: editing.instructions ?? "",
        active: editing.active ?? true,
        sort: Number(editing.sort ?? 99),
      };
      if (editing.id) await apiPost(`wallets/${editing.id}`, payload);
      else await apiPost("wallets", payload);
      toast("تم الحفظ ✅");
      setEditing(null);
      reload();
    } catch (err) {
      toast((err as Error).message, "err");
    }
  };

  const wallets = data?.wallets ?? [];

  return (
    <div className="space-y-4">
      {node}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-emerald-950">طرق الدفع</h1>
          <p className="mt-1 text-xs text-emerald-900/65">المحافظ والأرقام التي يحوّل إليها الزبائن — تُعرض داخل البوت بأزرار نسخ</p>
        </div>
        <Btn onClick={() => setEditing({ name: "", emoji: "💳", kind: "other", active: true, sort: 99 })}>➕ طريقة دفع</Btn>
      </div>

      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : wallets.length === 0 ? (
        <Empty icon="💳" title="لا طرق دفع" hint="أضف Binance، RedotPay، Bybit، BaridiMob…" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {wallets.map((w) => (
            <Card key={w.id} className="!p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-emerald-950">
                  {w.emoji} {w.name}
                </p>
                <Badge tone={w.active ? "emerald" : "red"}>{w.active ? "نشط" : "معطّل"}</Badge>
              </div>
              <p className="mt-3 break-all rounded-lg bg-white/65 px-2 py-1.5 font-mono text-[0.75rem] text-emerald-700" dir="ltr">
                {w.account}
              </p>
              <p className="mt-1 text-[0.66rem] text-emerald-900/55">{w.holder || "—"}</p>
              <p className="mt-2 line-clamp-2 min-h-[2rem] text-[0.66rem] text-emerald-900/55">{w.instructions}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <CopyBtn text={w.account} label="نسخ" />
                <Btn size="sm" variant="ghost" onClick={() => setEditing({ ...w })}>
                  ✏️
                </Btn>
                <Btn
                  size="sm"
                  variant="red"
                  onClick={() =>
                    confirm(`حذف طريقة الدفع «${w.name}»؟`, async () => {
                      try {
                        await apiPost(`wallets/${w.id}/delete`);
                        toast("تم الحذف");
                        reload();
                      } catch (err) {
                        toast((err as Error).message, "err");
                      }
                    })
                  }
                >
                  🗑
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? "تعديل طريقة الدفع" : "طريقة دفع جديدة"}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setEditing(null)}>
              إلغاء
            </Btn>
            <Btn onClick={save}>💾 حفظ</Btn>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[80px_1fr]">
              <Field label="إيموجي">
                <Input value={editing.emoji ?? ""} onChange={(e) => setEditing({ ...editing, emoji: e.target.value })} />
              </Field>
              <Field label="الاسم">
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Binance (USDT)" />
              </Field>
            </div>
            <Field label="العنوان / الرقم / الـ ID">
              <Input value={editing.account ?? ""} onChange={(e) => setEditing({ ...editing, account: e.target.value })} dir="ltr" placeholder="1210865168" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="اسم صاحب الحساب / التسمية">
                <Input value={editing.holder ?? ""} onChange={(e) => setEditing({ ...editing, holder: e.target.value })} placeholder="Pay ID / UID" />
              </Field>
              <Field label="الترتيب">
                <Input type="number" value={editing.sort ?? 99} onChange={(e) => setEditing({ ...editing, sort: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="تعليمات للزبون">
              <Textarea
                rows={3}
                value={editing.instructions ?? ""}
                onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
                placeholder="حوّل المبلغ عبر Binance Pay ثم أرسل صورة الإيصال"
              />
            </Field>
            <Toggle checked={editing.active ?? true} onChange={(v) => setEditing({ ...editing, active: v })} label="مفعّلة في البوت" />
          </div>
        )}
      </Modal>
    </div>
  );
}
