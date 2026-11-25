"use client";

import { useState } from "react";
import {
  Badge,
  Btn,
  Card,
  Empty,
  Field,
  Input,
  Spinner,
  apiPost,
  toast,
  useApi,
  useConfirm,
} from "@/components/ui";

type Channel = { id: number; chat: string; title: string; url: string; active: boolean; sort: number };

export default function ChannelsPage(): React.ReactElement {
  const { data, error, loading, reload } = useApi<{ ok: boolean; channels: Channel[] }>("channels");
  const [chat, setChat] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, node } = useConfirm();

  const add = async () => {
    if (!chat.trim()) return;
    setBusy(true);
    try {
      await apiPost("channels", { chat: chat.trim(), title: title.trim(), active: true });
      toast("تمت إضافة القناة ✅ — تأكد أن البوت مشرف فيها");
      setChat("");
      setTitle("");
      reload();
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const test = async (channel: Channel) => {
    try {
      const res = await apiPost<{ ok: boolean; info?: { title?: string } }>(`channels/${channel.id}/test`, { chat: channel.chat });
      toast(res.ok ? `✅ البوت يرى القناة: ${res.info?.title ?? channel.chat}` : "❌ البوت لا يستطيع رؤية القناة — أضفه كمشرف", res.ok ? "ok" : "err");
    } catch (err) {
      toast((err as Error).message, "err");
    }
  };

  const channels = data?.channels ?? [];

  return (
    <div className="space-y-4">
      {node}
      <div>
        <h1 className="text-2xl font-black text-emerald-950">قنوات الاشتراك الإجباري</h1>
        <p className="mt-1 text-xs text-emerald-900/65">
          لا يستطيع الزبون استخدام البوت قبل الاشتراك في هذه القنوات — يجب أن يكون البوت <b className="text-amber-600">مشرفاً</b> في كل قناة ليتمكن من التحقق.
        </p>
      </div>

      <Card title="➕ إضافة قناة" subtitle="اكتب @username أو رابط القناة">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="معرّف القناة">
            <Input value={chat} onChange={(e) => setChat(e.target.value)} placeholder="@ft_H_N_O" dir="ltr" />
          </Field>
          <Field label="الاسم الظاهر (اختياري)">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="قناة ft_H_N_O" />
          </Field>
          <div className="flex items-end">
            <Btn onClick={add} disabled={busy || !chat.trim()}>
              إضافة
            </Btn>
          </div>
        </div>
      </Card>

      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : channels.length === 0 ? (
        <Empty icon="🔒" title="لا قنوات مضافة" hint="أضف قناتك لتفعيل الاشتراك الإجباري" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {channels.map((c) => (
            <Card key={c.id} className="!p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-emerald-950">{c.title || c.chat}</p>
                  <a href={c.url} target="_blank" className="block truncate text-[0.7rem] text-emerald-600 hover:underline" dir="ltr">
                    {c.url}
                  </a>
                </div>
                <Badge tone={c.active ? "emerald" : "red"}>{c.active ? "إجباري" : "معطّل"}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Btn size="sm" variant="ghost" onClick={() => test(c)}>
                  🔍 اختبار
                </Btn>
                <Btn
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await apiPost(`channels/${c.id}`, { active: !c.active });
                    reload();
                  }}
                >
                  {c.active ? "🔴 تعطيل" : "🟢 تفعيل"}
                </Btn>
                <Btn
                  size="sm"
                  variant="red"
                  onClick={() =>
                    confirm(`حذف القناة «${c.title || c.chat}» من قائمة الاشتراك؟`, async () => {
                      await apiPost(`channels/${c.id}/delete`);
                      toast("تم الحذف");
                      reload();
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

      <Card title="ℹ️ كيف أضيف البوت مشرفاً؟">
        <ol className="list-inside list-decimal space-y-1 text-xs leading-6 text-emerald-900/65">
          <li>افتح القناة → إدارة القناة → المشرفون.</li>
          <li>أضف البوت (@{data ? "bot" : "bot"}) وامنحه صلاحية «إضافة مشرفين» أو أي صلاحية قراءة.</li>
          <li>ارجع هنا واضغط «اختبار» للتأكد.</li>
          <li>إذا تعذّر التحقق (البوت غير مشرف) سيسمح البوت للزبائن بالدخول تلقائياً حتى لا تخسر زبائنك.</li>
        </ol>
      </Card>
    </div>
  );
}
