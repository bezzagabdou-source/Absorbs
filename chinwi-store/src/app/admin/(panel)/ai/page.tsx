"use client";

import { useEffect, useRef, useState } from "react";
import { ANIMATED_EMOJIS, ANIMATED_EMOJI_CSS } from "@/lib/animated-emoji";
import {
  Badge,
  Btn,
  Card,
  Empty,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
  apiGet,
  apiPost,
  money,
  toast,
  useApi,
} from "@/components/ui";

type Message = {
  role: "user" | "assistant";
  content: string;
  actions?: AiAction[];
  provider?: string;
  results?: { type: string; ok: boolean; result: string }[];
};

type AiAction = { type: string; [key: string]: unknown };

type ProviderStatus = { groq: boolean; gemini: boolean; openrouter: boolean };

type Extracted = { name: string; price: number | null; price_label?: string | null; category?: string; description?: string };

const ACTION_LABEL: Record<string, string> = {
  create_product: "➕ إنشاء منتج",
  update_product: "✏️ تعديل منتج",
  delete_product: "🗑 حذف منتج",
  create_category: "🗂 إنشاء قسم",
  update_setting: "⚙️ تعديل إعداد",
  ban_user: "🔨 حظر مستخدم",
  unban_user: "🔓 فك حظر",
  set_order_status: "🧾 تغيير حالة طلب",
  broadcast: "📢 إذاعة",
  update_wallet: "💳 تعديل محفظة",
  create_coupon: "🎟 إنشاء كود خصم",
  add_faq: "❓ إضافة سؤال شائع",
  add_task: "🗒 إضافة مهمة",
  lock_bot: "🔒 قفل/فتح البوت",
  bulk_price: "💸 تعديل أسعار قسم",
};

export default function AiPage(): React.ReactElement {
  const [tab, setTab] = useState<"chat" | "vision">("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  const { data: cats } = useApi<{ categories: { id: number; name: string; emoji: string }[] }>("categories");

  useEffect(() => {
    apiGet<{ providers: ProviderStatus; suggestions: string[] }>("ai/status")
      .then((res) => {
        setProviders(res.providers);
        setSuggestions(res.suggestions ?? []);
      })
      .catch(() => {});
    apiGet<{ rows: { role: string; content: string; actions: AiAction[] | null; provider: string | null }[] }>("ai/history")
      .then((res) => {
        setMessages(
          (res.rows ?? []).map((r) => ({
            role: r.role === "assistant" ? "assistant" : "user",
            content: r.content,
            actions: r.actions ?? [],
            provider: r.provider ?? undefined,
          })),
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text?: string) => {
    const body = (text ?? input).trim();
    if ((!body && !image) || busy) return;
    const attached = image;
    setInput("");
    setImage(null);
    setMessages((prev) => [...prev, { role: "user", content: attached ? `📷 ${body || "حلّل هذه الصورة"}` : body }]);
    setBusy(true);
    try {
      const res = await apiPost<{ reply: string; actions: AiAction[]; provider: string }>("ai/chat", {
        text: body,
        image: attached ?? undefined,
        history: messages.map((m) => ({ role: m.role, content: m.content })).slice(-8),
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply, actions: res.actions, provider: res.provider }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ ${(err as Error).message}` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const apply = async (index: number, actions: AiAction[]) => {
    try {
      const res = await apiPost<{ results: { type: string; ok: boolean; result: string }[] }>("ai/apply", { actions });
      setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, results: res.results } : m)));
      toast("تم تنفيذ العمليات ✅");
    } catch (err) {
      toast((err as Error).message, "err");
    }
  };

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: ANIMATED_EMOJI_CSS }} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-1 text-2xl">
            {ANIMATED_EMOJIS.filter((e) => ["fire", "bolt", "gem", "rocket"].includes(e.id)).map((e) => (
              <span key={e.id} dangerouslySetInnerHTML={{ __html: e.html }} />
            ))}
          </div>
          <h1 className="mt-1 text-2xl font-black text-emerald-950">🧠 المساعد الذكي</h1>
          <p className="mt-1 text-xs text-emerald-900/65">
            يتحدث معك، يحلّل متجرك، يحلّل الصور، وينفّذ أي عملية (إضافة منتجات، تعديل أسعار، حظر، إذاعة…)
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {providers &&
            Object.entries(providers).map(([key, on]) => (
              <Badge key={key} tone={on ? "emerald" : "amber"}>
                {key === "groq" ? "⚡️ Groq" : key === "gemini" ? "💎 Gemini" : "🌐 OpenRouter"} {on ? "متصل" : "غير مربوط"}
              </Badge>
            ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab("chat")}
          className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === "chat" ? "bg-emerald-500 text-black" : "border border-emerald-900/10 bg-white/70 text-emerald-900/85"}`}
        >
          💬 المحادثة
        </button>
        <button
          onClick={() => setTab("vision")}
          className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === "vision" ? "bg-emerald-500 text-black" : "border border-emerald-900/10 bg-white/70 text-emerald-900/85"}`}
        >
          🖼 تحليل صورة أسعار
        </button>
        <Btn
          variant="ghost"
          className="mr-auto"
          onClick={async () => {
            await apiPost("ai/clear");
            setMessages([]);
            toast("تم تفريغ المحادثة");
          }}
        >
          🧹 تفريغ
        </Btn>
      </div>

      {tab === "chat" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          <Card className="flex min-h-[32rem] flex-col !p-0">
            <div className="flex items-center justify-between border-b border-emerald-900/10 px-4 py-3">
              <p className="text-sm font-black text-emerald-950">شينوي AI</p>
              <span className="flex items-center gap-1.5 text-[0.68rem] text-emerald-600">
                <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-emerald-400" /> يعمل الآن
              </span>
            </div>

            <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "52vh" }}>
              {messages.length === 0 && (
                <div className="py-10 text-center">
                  <p className="text-4xl">🧠</p>
                  <p className="mt-2 text-sm font-bold text-emerald-950">مرحباً بك، أنا شينوي AI</p>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-6 text-emerald-900/65">
                    اطلب مني أي شيء: «أضف منتج … بسعر …»، «رفّع أسعار فري فاير 5%»، «كم مبيعاتي اليوم؟»,
                    «احظر المستخدم 123»، «اكتب إذاعة عن العرض الجديد»…
                  </p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-7 ${
                      m.role === "user"
                        ? "rounded-tr-sm border border-emerald-500/25 bg-emerald-500/10 text-emerald-50"
                        : "rounded-tl-sm border border-emerald-900/10 bg-white/70 text-emerald-900"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.provider && <p className="mt-1 text-[0.6rem] text-emerald-900/55">via {m.provider}</p>}

                    {m.actions && m.actions.length > 0 && !m.results && (
                      <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5">
                        <p className="text-[0.7rem] font-bold text-amber-200">⚡️ عمليات جاهزة للتنفيذ:</p>
                        <ul className="mt-1 space-y-0.5">
                          {m.actions.map((a, idx) => (
                            <li key={idx} className="text-[0.68rem] text-amber-100/90">
                              {ACTION_LABEL[a.type] ?? a.type} — <span dir="ltr">{JSON.stringify(a).slice(0, 120)}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 flex gap-1.5">
                          <Btn size="sm" onClick={() => apply(i, m.actions ?? [])}>
                            ✅ تنفيذ
                          </Btn>
                          <Btn
                            size="sm"
                            variant="ghost"
                            onClick={() => setMessages((prev) => prev.map((x, idx) => (idx === i ? { ...x, actions: [] } : x)))}
                          >
                            تجاهل
                          </Btn>
                        </div>
                      </div>
                    )}

                    {m.results && (
                      <ul className="mt-2 space-y-1 rounded-xl border border-emerald-900/10 bg-white/60 p-2.5">
                        {m.results.map((r, idx) => (
                          <li key={idx} className={`text-[0.68rem] ${r.ok ? "text-emerald-700" : "text-rose-600"}`}>
                            {r.ok ? "✅" : "❌"} {r.result}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-end">
                  <div className="rounded-2xl border border-emerald-900/10 bg-white/70 px-3 py-2 text-xs text-emerald-900/65">
                    يفكّر… <span className="animate-pulse">●●●</span>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-emerald-900/10 p-3">
              {image && (
                <div className="mb-2 flex items-center gap-2 rounded-2xl bg-white/70 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt="مرفق" className="h-14 w-14 rounded-xl object-cover" />
                  <span className="flex-1 text-[0.7rem] font-bold text-emerald-900/60">صورة مرفقة — سيفهمها الذكاء الاصطناعي</span>
                  <button onClick={() => setImage(null)} className="icon-btn h-8 w-8 text-xs" type="button">
                    ✕
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <label className="icon-btn h-10 w-10 cursor-pointer text-lg" title="إرفاق صورة">
                  📷
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 6 * 1024 * 1024) return toast("الصورة أكبر من 6MB", "err");
                      const reader = new FileReader();
                      reader.onload = () => setImage(String(reader.result));
                      reader.readAsDataURL(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                <Textarea
                  rows={2}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="اكتب طلبك… (Enter للإرسال، Shift+Enter لسطر جديد)"
                />
                <Btn onClick={() => send()} disabled={busy || (!input.trim() && !image)} className="h-10">
                  {busy ? "…" : "إرسال ➤"}
                </Btn>
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            <Card title="💡 اقتراحات">
              <div className="flex flex-col gap-1.5">
                {(suggestions.length ? suggestions : ["كم مبيعاتي اليوم؟"]).map((sug) => (
                  <button
                    key={sug}
                    onClick={() => send(sug)}
                    className="rounded-lg border border-emerald-900/10 bg-white/55 px-3 py-2 text-right text-[0.72rem] text-emerald-900/85 transition hover:border-emerald-500/40 hover:text-emerald-700"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </Card>
            <Card title="🛡 الصلاحيات">
              <ul className="space-y-1.5 text-[0.7rem] leading-6 text-emerald-900/65">
                <li>✅ إضافة/تعديل/حذف منتجات وأقسام</li>
                <li>✅ تعديل الأسعار والإعدادات</li>
                <li>✅ حظر/فك حظر المستخدمين</li>
                <li>✅ تغيير حالة الطلبات</li>
                <li>✅ إرسال إذاعة لكل الزبائن</li>
                <li>🔒 كل عملية تُسجَّل في السجلات</li>
              </ul>
            </Card>
          </div>
        </div>
      ) : (
        <VisionPanel categories={cats?.categories ?? []} />
      )}
    </div>
  );
}

function VisionPanel({ categories }: { categories: { id: number; name: string; emoji: string }[] }): React.ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Extracted[]>([]);
  const [note, setNote] = useState("");
  const [provider, setProvider] = useState("");
  const [importing, setImporting] = useState(false);
  const [mediaId, setMediaId] = useState<number | null>(null);

  const analyze = async (f: File) => {
    setBusy(true);
    setRows([]);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await apiPost<{ products: Extracted[]; note?: string; provider: string; mediaId: number }>("ai/vision", form);
      setRows(res.products ?? []);
      setNote(res.note ?? "");
      setProvider(res.provider);
      setMediaId(res.mediaId ?? null);
      toast(`تم استخراج ${res.products?.length ?? 0} منتج ✅`);
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setImporting(true);
    try {
      const res = await apiPost<{ created: number }>("products/import", {
        items: rows.map((r) => ({
          name: r.name,
          price: r.price,
          price_label: r.price_label ?? (r.price ? null : "تواصل مع المالك"),
          description: r.description ?? "",
          category: r.category ?? "",
        })),
      });
      toast(`تم استيراد ${res.created} منتج 🎉`);
      setRows([]);
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="🖼 ارفع صورة قائمة الأسعار" subtitle="Gemini يقرأ الصورة ويستخرج المنتجات والأسعار تلقائياً">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 bg-white/60 px-4 py-10 text-center transition hover:border-emerald-500/50">
          <span className="text-4xl">📤</span>
          <span className="text-sm font-bold text-emerald-900">{file ? file.name : "اضغط لاختيار صورة"}</span>
          <span className="text-[0.7rem] text-emerald-900/55">PNG / JPG — حتى 6 ميغابايت</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setFile(f);
              setPreview(URL.createObjectURL(f));
              analyze(f);
            }}
          />
        </label>

        {preview && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={preview} alt="معاينة" className="mt-3 max-h-72 w-full rounded-xl border border-emerald-900/10 object-contain" />
        )}

        {busy && <Spinner label="الذكاء الاصطناعي يقرأ الصورة…" />}

        {note && <p className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-[0.7rem] text-emerald-200">💡 {note}</p>}
        {provider && <p className="mt-1 text-[0.62rem] text-emerald-900/55">مزوّد التحليل: {provider}</p>}
      </Card>

      <Card
        title="📦 المنتجات المستخرجة"
        subtitle={`${rows.length} منتج — عدّل الأسعار والأقسام قبل الاستيراد`}
        action={
          rows.length > 0 && (
            <Btn onClick={doImport} disabled={importing}>
              {importing ? "…" : "⬇️ استيراد الكل"}
            </Btn>
          )
        }
      >
        {rows.length === 0 ? (
          <Empty icon="🖼" title="لا نتائج بعد" hint="ارفع صورة قائمة أسعار (مثل صور المتجر) وسيتم استخراج كل المنتجات" />
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="rounded-xl border border-emerald-900/10 bg-white/55 p-2.5">
                <div className="grid gap-1.5 sm:grid-cols-[1.5fr_0.7fr_1fr_auto]">
                  <Input
                    value={r.name}
                    onChange={(e) => setRows((prev) => prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))}
                    placeholder="اسم المنتج"
                  />
                  <Input
                    type="number"
                    value={r.price ?? ""}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((x, idx) => (idx === i ? { ...x, price: e.target.value === "" ? null : Number(e.target.value) } : x)),
                      )
                    }
                    placeholder="السعر"
                  />
                  <Select
                    value={r.category ?? ""}
                    onChange={(e) => setRows((prev) => prev.map((x, idx) => (idx === i ? { ...x, category: e.target.value } : x)))}
                  >
                    <option value="">القسم…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.emoji} {c.name}
                      </option>
                    ))}
                  </Select>
                  <Btn
                    size="sm"
                    variant="red"
                    onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    🗑
                  </Btn>
                </div>
                <p className="mt-1 text-[0.65rem] text-emerald-900/55">
                  {r.price ? money(r.price) : "السعر غير محدد → «تواصل مع المالك»"}
                  {r.description ? ` • ${r.description}` : ""}
                </p>
              </div>
            ))}
            {mediaId && (
              <p className="text-[0.62rem] text-emerald-900/45">
                يمكنك استخدام الصورة المرفوعة كصورة منتج: <code dir="ltr">/api/media/{mediaId}</code>
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

/* حالة الحقل التي لا تُستخدم لكن نُبقيها للتوثيق */
void Field;
