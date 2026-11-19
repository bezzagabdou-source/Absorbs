"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Btn,
  Card,
  Empty,
  Field,
  Input,
  Spinner,
  Textarea,
  apiPost,
  dateTime,
  toast,
  useApi,
} from "@/components/ui";

type Thread = {
  tg_id: string;
  name: string;
  username: string | null;
  text: string;
  dir: "in" | "out";
  media: string;
  created_at: string;
  count: number;
};
type ContactMsg = {
  id: number;
  dir: "in" | "out";
  name: string;
  username: string | null;
  text: string;
  media: string;
  created_at: string;
};

const MEDIA_LABEL: Record<string, string> = {
  photo: "📷 صورة",
  document: "📎 ملف",
  video: "🎬 فيديو",
  voice: "🎤 رسالة صوتية",
  audio: "🎵 صوت",
  sticker: "🏷 ملصق",
  animation: "🎞 GIF",
  video_note: "📹 فيديو دائري",
};

export default function ContactPanelPage(): React.ReactElement {
  const { data, loading, reload } = useApi<{ ok: boolean; threads: Thread[] }>("contact");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [newId, setNewId] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const msgs = useApi<{ ok: boolean; messages: ContactMsg[] }>(selected ? `contact/${selected}` : null);

  // تحديث دوري كل 8 ثوانٍ حتى تصل الرسائل الجديدة دون إعادة تحميل يدوي
  useEffect(() => {
    const id = setInterval(() => {
      reload();
      if (selected) msgs.reload();
    }, 8000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const threads = useMemo(() => {
    const rows = data?.threads ?? [];
    const t = query.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (r) =>
        String(r.tg_id).includes(t) ||
        (r.name ?? "").toLowerCase().includes(t) ||
        (r.username ?? "").toLowerCase().includes(t) ||
        (r.text ?? "").toLowerCase().includes(t),
    );
  }, [data, query]);

  // اختيار أول محادثة تلقائياً عند أول تحميل
  useEffect(() => {
    if (!selected && threads.length > 0) setSelected(String(threads[0].tg_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads.length]);

  const active = threads.find((t) => String(t.tg_id) === String(selected)) ?? null;
  const messages = msgs.data?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, selected]);

  const startManualThread = () => {
    const tg = newId.trim().replace(/^@/, "");
    if (!/^\d{5,}$/.test(tg)) {
      toast("اكتب رقم Telegram ID فقط (أرقام)", "err");
      return;
    }
    setSelected(tg);
    setNewId("");
  };

  const send = async () => {
    const text = draft.trim();
    if (!selected || !text) return;
    setSending(true);
    try {
      await apiPost("contact/send", { tg_id: Number(selected), text });
      setDraft("");
      toast("تم الإرسال — وصلت للشخص ✅");
      msgs.reload();
      reload();
    } catch (e) {
      toast(String((e as Error).message), "err");
    } finally {
      setSending(false);
    }
  };

  if (loading && !data) return <Spinner label="تحميل محادثات بوت تواصل…" />;

  return (
    <div className="fade-in space-y-4">
      {/* الرأس */}
      <div className="panel relative overflow-hidden p-5">
        <div className="absolute -left-14 -top-16 h-48 w-48 rounded-full bg-sky-300/35 blur-3xl" />
        <h1 className="relative text-2xl font-black text-emerald-950">💬 بوت تواصل — لوحة المالك</h1>
        <p className="relative mt-1 max-w-2xl text-xs font-bold text-emerald-900/60">
          كل رسالة لبوت <span className="font-black text-sky-800">@chinwicontactbot</span> تظهر هنا ومحفوظة في قاعدة البيانات.
          اختار أي شخص وابعثلو رسالة وتصلو مباشرة من البوت — الزبون يقدر يراسل المالك أي وقت.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* قائمة المحادثات */}
        <Card
          title={`📥 المحادثات (${threads.length})`}
          action={<Btn size="sm" variant="ghost" onClick={reload}>↻</Btn>}
          className="!p-0 overflow-hidden"
        >
          <div className="space-y-2 border-b border-emerald-900/10 p-3">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔎 ابحث بالاسم أو اليوزر أو الرقم…" className="text-[0.8rem]" />
            <div className="flex gap-1.5">
              <Input
                dir="ltr"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && startManualThread()}
                placeholder="رقم Telegram ID…"
                className="text-[0.8rem]"
              />
              <Btn size="sm" onClick={startManualThread} title="راسل أي شخص برقمه">➕ راسل</Btn>
            </div>
          </div>
          <div className="max-h-[62vh] overflow-y-auto p-2">
            {threads.length === 0 ? (
              <Empty icon="📭" title="لا توجد محادثات بعد" hint="أول ما يراسل الزبون البوت ستظهر المحادثة هنا" />
            ) : (
              threads.map((t) => (
                <button
                  key={t.tg_id}
                  onClick={() => setSelected(String(t.tg_id))}
                  className={`mb-1 flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-start transition ${
                    String(selected) === String(t.tg_id)
                      ? "border-emerald-400/60 bg-emerald-50 shadow-sm"
                      : "border-transparent hover:bg-white/70"
                  }`}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-emerald-400 text-base font-black text-white">
                    {(t.name || "ز").trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[0.82rem] font-black text-emerald-950">{t.name || "زبون"}</span>
                      <span className="shrink-0 text-[0.6rem] font-bold text-emerald-900/45">{dateTime(t.created_at)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[0.68rem] font-bold text-emerald-900/55">
                        {t.dir === "out" ? "أنت: " : ""}
                        {t.media ? MEDIA_LABEL[t.media] ?? "📎 ميديا" : t.text}
                      </span>
                      <Badge tone="sky">{t.count}</Badge>
                    </span>
                    {t.username ? <span dir="ltr" className="mt-0.5 block text-[0.62rem] font-bold text-sky-800/80">@{t.username}</span> : null}
                  </span>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* المحادثة المفتوحة */}
        <Card className="flex min-h-[60vh] flex-col !p-0 overflow-hidden">
          {!selected ? (
            <div className="grid flex-1 place-items-center p-8">
              <Empty icon="💬" title="اختار محادثة من القائمة" hint="أو راسل أي شخص برقم الـ Telegram ID تاعه" />
            </div>
          ) : (
            <>
              {/* رأس المحادثة */}
              <div className="flex items-center gap-3 border-b border-emerald-900/10 bg-white/60 px-4 py-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-base font-black text-white">
                  {(active?.name || "ز").trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-emerald-950">
                    {active?.name || "زبون"}
                    {active?.username ? <span className="text-[0.7rem] font-bold text-sky-800"> @{active.username}</span> : null}
                  </p>
                  <p className="text-[0.62rem] font-bold text-emerald-900/45">
                    <span dir="ltr" className="font-mono">tg_id: {selected}</span>
                    {" • "}الرد يوصله من @chinwicontactbot
                  </p>
                </div>
                <a
                  href={`tg://user?id=${selected}`}
                  className="btn btn-ghost shrink-0 px-3 py-1.5 text-[0.72rem]"
                  title="افتح المحادثة معاه في تيليجرام"
                >
                  ↗ تيليجرام
                </a>
              </div>

              {/* الفقاعات */}
              <div className="flex min-h-[16rem] flex-1 flex-col gap-2 overflow-y-auto bg-gradient-to-b from-sky-50/40 to-emerald-50/40 p-4" style={{ maxHeight: "60dvh" }}>
                {messages.length === 0 ? (
                  <div className="grid flex-1 place-items-center py-10 text-center">
                    <div>
                      <p className="text-3xl">👋</p>
                      <p className="mt-2 text-sm font-black text-emerald-950">لا توجد رسائل بعد</p>
                      <p className="mt-1 text-[0.7rem] font-bold text-emerald-900/55">اكتب أول رسالة تحت — توصله فوراً من البوت (إلى كان هذا الشخص بدا البوت)</p>
                    </div>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`flex ${m.dir === "out" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[82%] rounded-2xl px-3 py-2 text-[0.8rem] leading-relaxed shadow-sm ${
                          m.dir === "out"
                            ? "rounded-br-md bg-gradient-to-l from-emerald-500 to-teal-500 text-white"
                            : "rounded-bl-md border border-emerald-900/10 bg-white text-emerald-950"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.text || (m.media ? MEDIA_LABEL[m.media] ?? "📎 ميديا" : "…")}</p>
                        {m.media && m.text ? <p className="mt-0.5 text-[0.65rem] opacity-80">{MEDIA_LABEL[m.media] ?? m.media}</p> : null}
                        <p className={`mt-1 text-[0.58rem] font-bold ${m.dir === "out" ? "text-emerald-100/90" : "text-emerald-900/45"}`}>
                          {m.dir === "out" ? "المالك • " : `${m.name || "الزبون"} • `}{dateTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* مربع الإرسال */}
              <div className="border-t border-emerald-900/10 bg-white/70 p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    rows={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder="اكتب ردك… (Enter للإرسال — Shift+Enter سطر جديد)"
                    className="min-h-[44px] flex-1 resize-none !text-sm"
                  />
                  <Btn onClick={() => void send()} disabled={sending || !draft.trim()} className="h-11 px-4">
                    {sending ? "…" : "إرسال 📤"}
                  </Btn>
                </div>
                <p className="mt-1.5 text-center text-[0.6rem] font-bold text-emerald-900/40">
                  الرسالة توصل للشخص من «بوت تواصل» — إلى ما بدا البوت بعد، تيليجرام يرفض الإرسال ويظهرلك السبب هنا
                </p>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
