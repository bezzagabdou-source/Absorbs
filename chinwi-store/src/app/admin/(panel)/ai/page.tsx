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
  update_category: "🗂 تعديل قسم",
  delete_category: "🗑 حذف قسم",
  update_setting: "⚙️ تعديل إعداد",
  ban_user: "🔨 حظر مستخدم",
  unban_user: "🔓 فك حظر",
  set_order_status: "🧾 تغيير حالة طلب",
  delete_order: "🗑 حذف طلب",
  broadcast: "📢 إذاعة للجميع",
  send_message: "📩 رسالة خاصة",
  update_wallet: "💳 تعديل محفظة",
  create_wallet: "💳 إنشاء محفظة",
  delete_wallet: "🗑 حذف محفظة",
  create_channel: "📡 إضافة قناة اشتراك",
  update_channel: "✏️ تعديل قناة",
  delete_channel: "🗑 حذف قناة",
  create_coupon: "🎟 إنشاء كود خصم",
  delete_coupon: "🗑 حذف كود",
  add_faq: "❓ إضافة سؤال شائع",
  add_task: "🗒 إضافة مهمة",
  lock_bot: "🔒 قفل/فتح البوت",
  maintenance: "🛠 وضع الصيانة",
  bulk_price: "💸 تعديل أسعار قسم",
  add_points: "⭐ إضافة/خصم نقاط",
  create_prize: "🎁 إضافة جائزة",
  update_prize: "✏️ تعديل جائزة",
  delete_prize: "🗑 حذف جائزة",
  decide_redemption: "🎁 قرار طلب جائزة",
  reset_stats: "📉 تصفير الإحصائيات",
  toggle_product: "⏸ تفعيل/تعطيل منتج",
};

export default function AiPage(): React.ReactElement {
  const [tab, setTab] = useState<"chat" | "vision" | "engineer">("chat");
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
        <button
          onClick={() => setTab("engineer")}
          className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === "engineer" ? "bg-emerald-500 text-black" : "border border-emerald-900/10 bg-white/70 text-emerald-900/85"}`}
        >
          👨‍💻 المهندس AI
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
              <p className="text-sm font-black text-emerald-950">شينوي AI v2 — المالك الثاني 🧠</p>
              <span className="flex items-center gap-1.5 text-[0.68rem] text-emerald-600">
                <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-emerald-400" /> ينفّذ كل شيء داخل البوت
              </span>
            </div>

            <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "52vh" }}>
              {messages.length === 0 && (
                <div className="py-10 text-center">
                  <p className="text-4xl">🧠</p>
                  <p className="mt-2 text-sm font-bold text-emerald-950">مرحباً بك، أنا شينوي AI v2 — مالك ثانٍ داخل بوتك</p>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-6 text-emerald-900/65">
                    أنا أملك نفس صلاحياتك تقريباً: أضيف وأعدّل وأحذف المنتجات والأقسام والمحافظ والقنوات والجوائز،
                    أوافق على الطلبات والجوائز أو أرفضها، أحظر وأفك الحظر، أمنح وأخصم النقاط، أنفّذ الإذاعات،
                    أنشئ أكواد الخصم، أُصفّر الإحصائيات — <b>أي أمر يصدر عنك يتنفذ فوراً بدون زر «تنفيذ»</b>.
                    جرّب: «أضف منتج 1080 جوهرة بسعر 3050 في فري فاير» · «وافق على الطلب 12» · «أضف جائزة 50 دج ب 100 نقطة» · «صفر الإحصائيات» · «أعط فلان 25 نقطة» · «ارفع أسعار تيك توك 5%»
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
      ) : tab === "vision" ? (
        <VisionPanel categories={cats?.categories ?? []} />
      ) : (
        <EngineerPanel />
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

/* ───────────────────────── 👨‍💻 المهندس AI ───────────────────────── */

type CodeEntry = { path: string; lines: number; bytes: number };
type EngineerPlanFile = { path: string; action: "modify" | "create"; content: string };
type EngineerPlan = {
  ok: boolean;
  summary?: string;
  plan?: string[];
  risk?: "low" | "medium" | "high";
  risk_notes?: string;
  files?: EngineerPlanFile[];
  chosen?: string[];
  provider?: string;
  dropped?: string[];
  error?: string;
  clarify?: string | null;
};
type EngineerApply = { ok: boolean; branch?: string; pr_number?: number; pr_url?: string; commit_sha?: string; error?: string; need_token?: boolean };
type EngineerStatus = { ok: boolean; github_token: boolean; repo: string; base_branch: string };
type FileDiff = { start: number; removed: string[]; added: string[] };

const RISK_TONE: Record<string, { label: string; cls: string }> = {
  low: { label: "خطر منخفض", cls: "bg-emerald-500/15 text-emerald-800 border-emerald-500/30" },
  medium: { label: "خطر متوسط", cls: "bg-amber-500/15 text-amber-800 border-amber-500/30" },
  high: { label: "خطر عالي — راجع بعينك", cls: "bg-rose-500/15 text-rose-800 border-rose-500/30" },
};

function computeDiff(oldText: string | undefined, newText: string): FileDiff {
  const oldLines = (oldText ?? "").split("\n");
  const newLines = newText.split("\n");
  let start = 0;
  while (start < Math.min(oldLines.length, newLines.length) && oldLines[start] === newLines[start]) start++;
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  return { start, removed: oldLines.slice(start, oldEnd), added: newLines.slice(start, newEnd) };
}

const CODE_CHIPS = [
  "ضيف زر جديد في صفحة الطلبات يفتح تفاصيل الطلب",
  "صلّح عرض الأسعار في صفحة المنتج يكون أكبر وأوضح",
  "أضف حقل ملاحظة داخل شاشة إتمام الطلب",
  "غيّر نص الترحيب في بداية البوت لحاجة جذابة",
];

function EngineerPanel(): React.ReactElement {
  const [manifest, setManifest] = useState<CodeEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [status, setStatus] = useState<EngineerStatus | null>(null);
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<EngineerPlan | null>(null);
  const [oldFiles, setOldFiles] = useState<Record<string, string>>({});
  const [apply, setApply] = useState<EngineerApply | null>(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    apiGet<{ ok: boolean; manifest: CodeEntry[] }>("ai-code?action=list")
      .then((res) => setManifest(res.manifest ?? []))
      .catch(() => setManifest([]));
    apiGet<EngineerStatus>("ai-code?action=status")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    if (!previewPath) return;
    setPreview("…");
    apiGet<{ ok: boolean; content: string }>(`ai-code?action=file&path=${encodeURIComponent(previewPath)}`)
      .then((res) => setPreview(res.content ?? ""))
      .catch(() => setPreview("تعذّرت قراءة الملف"));
  }, [previewPath]);

  const runPlan = async () => {
    const req = request.trim();
    if (req.length < 4) {
      toast("اكتب طلبك بتفاصيل أكثر");
      return;
    }
    setBusy(true);
    setPlan(null);
    setApply(null);
    setOldFiles({});
    try {
      const res = await apiPost<EngineerPlan>("ai-code", { action: "plan", request: req });
      setPlan(res);
      if (res.ok && res.files) {
        const entries = await Promise.all(
          res.files.map(async (f) => {
            try {
              const old = await apiGet<{ ok: boolean; content: string }>(`ai-code?action=file&path=${encodeURIComponent(f.path)}`);
              return [f.path, old.content ?? ""] as const;
            } catch {
              return [f.path, ""] as const;
            }
          }),
        );
        setOldFiles(Object.fromEntries(entries));
      }
    } catch (err) {
      setPlan({ ok: false, error: String(err).replace(/^Error:\s*/, "") });
    } finally {
      setBusy(false);
    }
  };

  const runApply = async () => {
    if (!plan?.ok || !plan.files?.length) return;
    setBusy(true);
    try {
      const res = await apiPost<EngineerApply>("ai-code", {
        action: "apply",
        title: (plan.summary || request.trim()).slice(0, 80),
        body: request.trim(),
        files: plan.files,
      });
      setApply(res);
      if (res.ok) toast("تم إنشاء فرع + Pull Request 🎉");
    } catch (err) {
      setApply({ ok: false, error: String(err).replace(/^Error:\s*/, "") });
    } finally {
      setBusy(false);
    }
  };

  const runMerge = async () => {
    if (!apply?.pr_number) return;
    if (!window.confirm(`ادمج PR #${apply.pr_number} في الفرع الإنتاج (main)؟ Vercel سيعيد البناء تلقائياً — راجع الفروق قبل التأكيد!`)) return;
    setMerging(true);
    try {
      const res = await apiPost<{ ok: boolean; error?: string }>("ai-code", { action: "merge", number: apply.pr_number });
      if (res.ok) toast("✅ تم الدمج — الإنتاج سيتحدث بعد انتهاء بناء Vercel");
      else toast(`❌ ${res.error ?? "فشل الدمج"}`);
    } catch (err) {
      toast(`❌ ${String(err)}`);
    } finally {
      setMerging(false);
    }
  };

  const filtered = (manifest ?? []).filter((f) => !query.trim() || f.path.toLowerCase().includes(query.trim().toLowerCase()));
  const totalKb = manifest ? Math.round(manifest.reduce((sum, f) => sum + f.bytes, 0) / 1024) : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-[0.72rem] font-bold text-amber-900">
          <span>⚠️</span>
          <span>
            المهندس AI يقرأ <b>كود البوت كاملاً</b> ويبرمجه — التعديلات تصل كفرع + Pull Request على GitHub، ولا تُنشر للإنتاج إلا بعد دمجك أنت.
          </span>
        </div>

        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-black text-emerald-950">👨‍💻 إلى المهندس: شنو حاب تدير في البوت؟</p>
              <p className="mt-0.5 text-[0.68rem] text-emerald-900/60">اكتب بأي صياغة — يفهم، يحلّل الملفات الحقيقية، ثم يكتب الكود كامل.</p>
            </div>
            <div className="flex gap-1.5">
              <Badge tone={status?.github_token ? "emerald" : "amber"}>{status?.github_token ? "🔑 GitHub مربوط" : "🔑 GITHUB_TOKEN ناقص"}</Badge>
              <Badge tone="slate">{manifest?.length ?? "…"} ملف · {totalKb}KB</Badge>
            </div>
          </div>
          <Textarea
            className="mt-3 min-h-24"
            placeholder="مثال: «ضيف صفحة جديدة في اللوحة تعرض أرباحي لكل منتج مع زر تصدير Excel»…"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CODE_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => setRequest(chip)}
                className="rounded-full border border-emerald-900/10 bg-emerald-500/5 px-2.5 py-1 text-[0.65rem] font-bold text-emerald-900/80 hover:bg-emerald-500/10"
              >
                {chip}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Btn onClick={runPlan} disabled={busy} className="gap-2">
              {busy ? <Spinner /> : "🧠"} حلّل وبرمج
            </Btn>
            {busy && <span className="text-[0.7rem] text-emerald-900/60">يقرأ الكود ويكتب الحل… (قد يأخذ حتى دقيقة)</span>}
          </div>
        </Card>

        {plan && !plan.ok && (
          <Card className="border-rose-500/30 bg-rose-500/5 p-4">
            <p className="text-sm font-black text-rose-800">تعذّرت البرمجة</p>
            {plan.clarify ? (
              <p className="mt-1 text-xs text-rose-900/90">سؤال التوضيح: {plan.clarify}</p>
            ) : (
              <p className="mt-1 text-xs text-rose-900/90">{plan.error}</p>
            )}
          </Card>
        )}

        {plan?.ok && (
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-emerald-950">📋 خطة التغيير</p>
              {plan.risk && <span className={`rounded-full border px-2.5 py-0.5 text-[0.68rem] font-black ${RISK_TONE[plan.risk]?.cls}`}>{RISK_TONE[plan.risk]?.label}</span>}
              {plan.provider && <span className="text-[0.62rem] text-emerald-900/50">via {plan.provider}</span>}
            </div>
            <p className="mt-2 text-xs font-bold leading-6 text-emerald-950/90">{plan.summary}</p>
            {plan.plan && plan.plan.length > 0 && (
              <ol className="mt-2 list-decimal space-y-1 pr-5 text-[0.72rem] leading-6 text-emerald-950/90">
                {plan.plan.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            )}
            {plan.risk_notes && <p className="mt-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[0.68rem] leading-6 text-amber-900">⚠️ {plan.risk_notes}</p>}
            {plan.dropped && plan.dropped.length > 0 && <p className="mt-1 text-[0.65rem] text-rose-700">ملفات رُفضت أمنياً: {plan.dropped.join("، ")}</p>}

            <p className="mt-3 text-[0.72rem] font-black text-emerald-950">📦 الملفات ({plan.files?.length ?? 0}):</p>
            <div className="mt-1.5 space-y-2">
              {plan.files?.map((f) => {
                const diff = computeDiff(oldFiles[f.path], f.content);
                return (
                  <details key={f.path} className="rounded-xl border border-emerald-900/10 bg-white/60">
                    <summary className="cursor-pointer select-none px-3 py-2 text-[0.7rem] font-bold text-emerald-950">
                      <span dir="ltr" className="font-mono">{f.action === "create" ? "➕" : "✏️"} {f.path}</span>
                      <span className="mr-2 text-[0.62rem] font-black"><span className="text-emerald-700">+{diff.added.length}</span> / <span className="text-rose-600">-{diff.removed.length}</span></span>
                    </summary>
                    <div dir="ltr" className="max-h-80 overflow-auto border-t border-emerald-900/10 p-2 font-mono text-[0.65rem] leading-5">
                      {diff.removed.slice(0, 150).map((line, i) => (
                        <div key={`r${i}`} className="whitespace-pre-wrap bg-rose-500/10 text-rose-800">- {line}</div>
                      ))}
                      {diff.added.slice(0, 200).map((line, i) => (
                        <div key={`a${i}`} className="whitespace-pre-wrap bg-emerald-500/10 text-emerald-900">+ {line}</div>
                      ))}
                      {diff.added.length > 200 && <div className="text-emerald-900/60">… و{diff.added.length - 200} سطر آخر</div>}
                    </div>
                  </details>
                );
              })}
            </div>

            {!apply?.ok && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Btn onClick={runApply} disabled={busy} className="gap-2">
                  {busy ? <Spinner /> : "🚀"} طبّق: فرع + Pull Request
                </Btn>
                <span className="text-[0.62rem] text-emerald-900/55">يفتح PR على GitHub — ولا شيء يتغير في الإنتاج قبل دمجك</span>
              </div>
            )}
          </Card>
        )}

        {apply && !apply.ok && (
          <Card className="border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm font-black text-amber-900">التطبيق لم يكتمل</p>
            <p className="mt-1 text-[0.72rem] leading-6 text-amber-900/90">{apply.error}</p>
            {apply.need_token && (
              <ol className="mt-2 list-decimal space-y-1 pr-5 text-[0.7rem] leading-6 text-amber-900">
                <li>افتح github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate token</li>
                <li>Repository: <b>bezzagabdou-source/Absorbs</b> فقط · Permissions: <b>Contents: Read &amp; Write</b> و <b>Pull requests: Read &amp; Write</b></li>
                <li>Vercel → مشروع <b>chinwi-store</b> → Settings → Environment Variables → أضف متغير باسم <b dir="ltr">GITHUB_TOKEN</b> (Production+Preview) ثم أعد النشر</li>
                <li>⚠️ التوكن ما يدخلش للشات ولا للكود — يبقى سرّي في Vercel فقط</li>
              </ol>
            )}
          </Card>
        )}

        {apply?.ok && (
          <Card className="border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-sm font-black text-emerald-900">✅ التعديل صار فرع + PR رقم #{apply.pr_number}</p>
            <p dir="ltr" className="mt-1 font-mono text-[0.65rem] text-emerald-900/70">{apply.branch} · {apply.commit_sha?.slice(0, 8)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {apply.pr_url && (
                <a href={apply.pr_url} target="_blank" rel="noreferrer" className="rounded-xl border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-[0.72rem] font-black text-emerald-800 hover:bg-emerald-600/20">
                  🔍 افتح الـ PR وراجع
                </a>
              )}
              <Btn variant="ghost" onClick={runMerge} disabled={merging} className="gap-2">
                {merging ? <Spinner /> : "🔀"} ادمج الـPR للإنتاج الآن
              </Btn>
            </div>
            <p className="mt-2 text-[0.62rem] leading-5 text-emerald-900/60">الدمج يعيد بناء Vercel تلقائياً (الفرع main مربوط بالإنتاج). لو ما حدثش خلال دقائق، أعد النشر من لوحة Vercel.</p>
          </Card>
        )}
      </div>

      <Card className="flex max-h-[46rem] flex-col p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.75rem] font-black text-emerald-950">🗂 ملفات البوت</p>
          <span className="text-[0.62rem] text-emerald-900/50">{filtered.length}/{manifest?.length ?? 0}</span>
        </div>
        <Input dir="ltr" className="mt-2 text-left text-[0.72rem]" placeholder="ابحث عن ملف… (search)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {filtered.map((f) => (
            <button
              key={f.path}
              onClick={() => setPreviewPath(f.path)}
              className={`block w-full rounded-lg px-2 py-1.5 text-right font-mono text-[0.62rem] leading-5 hover:bg-emerald-500/5 ${previewPath === f.path ? "bg-emerald-500/10 font-black text-emerald-900" : "text-emerald-950/80"}`}
            >
              <span dir="ltr" className="block truncate">{f.path}</span>
              <span className="text-[0.55rem] text-emerald-900/45">{f.lines} سطر · {(f.bytes / 1024).toFixed(1)}KB</span>
            </button>
          ))}
          {manifest && filtered.length === 0 && <Empty title="لا توجد ملفات مطابقة" />}
        </div>
        {previewPath && (
          <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-emerald-900/10 pt-2">
            <p dir="ltr" className="truncate text-[0.62rem] font-black text-emerald-900/70">{previewPath}</p>
            <pre dir="ltr" className="mt-1 max-h-64 flex-1 overflow-auto rounded-xl bg-slate-950 p-2 text-left font-mono text-[0.6rem] leading-4 text-emerald-100/90">{preview}</pre>
          </div>
        )}
      </Card>
    </div>
  );
}
