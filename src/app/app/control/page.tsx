"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Accessibility,
  Check,
  BrainCircuit,
  CloudDownload,
  FlaskConical,
  FolderOpen,
  Gauge,
  Globe2,
  Mic2,
  Palette,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";
import { AccentPicker, ControlSection, SegmentedRow, SelectRow, SliderRow, StatPill, ToggleRow } from "@/components/ui/controls";
import { usePrefs } from "@/lib/prefs-context";
import { ACCENTS, prefsKnobCount } from "@/lib/prefs";
import { EMOTION_PRESETS, PERSONA_VOICES, VOICE_CATALOG } from "@/lib/voice-catalog";
import { VOICE_PERSONAS } from "@/lib/voice-call";
import { ATLAS_TAGLINE, IDENTITY_ANSWERS, NEXUS_MAKER } from "@/lib/atlas-constitution";
import { cn } from "@/lib/utils";

/**
 * v18 ATLAS — مركز التحكم الضخم
 * كل مقبض في التطبيق في مكان واحد: المظهر، الصوت، الذكاء، الإنترنت، الملفات،
 * الخصوصية، الوصولية والمختبر. الإعدادات تُحفظ محليًا وتُزامَن مع الحساب.
 */

type TabId = "appearance" | "voice" | "ai" | "internet" | "files" | "privacy" | "a11y" | "lab";

const TABS: { id: TabId; label: string; icon: typeof Palette; hint: string }[] = [
  { id: "appearance", label: "المظهر", icon: Palette, hint: "السمة، اللون، الحركة، الكثافة" },
  { id: "voice", label: "الصوت والمكالمة", icon: Mic2, hint: "الصوت، السرعة، المشاعر، المقاطعة" },
  { id: "ai", label: "الذكاء", icon: BrainCircuit, hint: "التفكير، الطول، الشخصية، الذاكرة" },
  { id: "internet", label: "الإنترنت", icon: Globe2, hint: "البحث، التنزيل، المصادر" },
  { id: "files", label: "الملفات", icon: FolderOpen, hint: "المعاينة، التنزيل، ZIP، المشاركة" },
  { id: "privacy", label: "الخصوصية", icon: ShieldCheck, hint: "البيانات والمزامنة والسجلات" },
  { id: "a11y", label: "الوصولية", icon: Accessibility, hint: "التباين، الخط، الأهداف الكبيرة" },
  { id: "lab", label: "المختبر", icon: FlaskConical, hint: "ميزات تجريبية" },
];

export default function ControlCenterPage() {
  const { prefs, set, reset, syncedAt } = usePrefs();
  const [tab, setTab] = useState<TabId>("appearance");
  const knobs = useMemo(() => prefsKnobCount(prefs), [prefs]);
  const p = prefs;

  const setGroup = <K extends keyof typeof prefs>(g: K, patch: Partial<(typeof prefs)[K]>) =>
    set({ [g]: patch } as Record<string, unknown>);

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-6 sm:py-10">
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-l from-[var(--nx-accent-from)]/22 via-white/[0.04] to-[var(--nx-accent-to)]/18 p-5 sm:p-7"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black tracking-widest text-[var(--nx-accent-ring)]">NEXUS ATLAS · v18</p>
            <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">مركز التحكم</h1>
            <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-slate-300">{ATLAS_TAGLINE.ar}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatPill label="مقابض متاحة" value={knobs} icon={<Gauge className="size-4" />} />
            <StatPill label="أصوات" value={VOICE_CATALOG.length} icon={<Waves className="size-4" />} />
            <StatPill
              label="المزامنة"
              value={syncedAt ? new Date(syncedAt).toLocaleTimeString("ar-DZ") : "محلي"}
              icon={<CloudDownload className="size-4" />}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={on}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-[12px] font-bold transition active:scale-95",
                  on
                    ? "border-transparent bg-gradient-to-r from-[var(--nx-accent-from)] to-[var(--nx-accent-to)] text-white shadow-lg shadow-black/25"
                    : "border-white/12 bg-white/[0.04] text-slate-300 hover:border-white/28 hover:text-white"
                )}
              >
                <Icon className="size-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">{TABS.find((t) => t.id === tab)?.hint}</p>
      </motion.header>

      <div className="grid gap-4 lg:grid-cols-2">
        {tab === "appearance" && (
          <>
            <ControlSection icon={<Palette className="size-5" />} title="السمة واللون" desc="السمة تُطبَّق فورًا على كل الشاشات.">
              <SegmentedRow
                label="السمة"
                value={p.appearance.theme}
                onChange={(v) => setGroup("appearance", { theme: v })}
                options={[
                  { id: "lumen" as never, label: "Lumen فاتح" },
                  { id: "dark", label: "Noctis داكن" },
                  { id: "midnight", label: "Midnight أسود" },
                  { id: "aurora", label: "Aurora متحرك" },
                  { id: "system", label: "مثل النظام" },
                  { id: "light", label: "فاتح دائمًا" },
                ]}
              />
              <AccentPicker value={p.appearance.accent} accents={ACCENTS} onChange={(id) => setGroup("appearance", { accent: id as never })} />
              <SegmentedRow
                label="الخلفية المتحركة"
                value={p.appearance.wallpaper}
                onChange={(v) => setGroup("appearance", { wallpaper: v })}
                options={[
                  { id: "aurora", label: "شفق" },
                  { id: "mesh", label: "شبكي" },
                  { id: "stars", label: "نجوم" },
                  { id: "none", label: "بلا" },
                ]}
              />
            </ControlSection>

            <ControlSection icon={<Sparkles className="size-5" />} title="الحركة والكثافة" desc="أطفئ الحركة إن كانت تُتعبك أو تبطئ جهازك.">
              <SegmentedRow
                label="الكثافة"
                value={p.appearance.density}
                onChange={(v) => setGroup("appearance", { density: v })}
                options={[
                  { id: "cozy", label: "مريحة" },
                  { id: "comfortable", label: "متوازنة" },
                  { id: "compact", label: "مضغوطة" },
                ]}
              />
              <SliderRow
                label="حجم الخط"
                value={p.appearance.fontScale}
                min={0.85}
                max={1.35}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => setGroup("appearance", { fontScale: v })}
              />
              <ToggleRow label="الحركات والانتقالات" desc="ظهور تدريجي، تحويم، وانتقالات الأزرار" checked={p.appearance.animations} onChange={(v) => setGroup("appearance", { animations: v })} />
              <ToggleRow label="الجسيمات والشفق" desc="الخلفية الحية خلف المحتوى" checked={p.appearance.particles} onChange={(v) => setGroup("appearance", { particles: v })} />
              <ToggleRow label="الزجاج الشفاف (Glass)" desc="بطاقات ضبابية بعمق" checked={p.appearance.glass} onChange={(v) => setGroup("appearance", { glass: v })} />
              <ToggleRow label="التوهج (Glow)" desc="هالات ضوئية حول العناصر المهمة" checked={p.appearance.glow} onChange={(v) => setGroup("appearance", { glow: v })} />
              <ToggleRow label="تقليل الحركة (نظامي)" desc="يحترم prefers-reduced-motion" checked={p.appearance.reducedMotion} onChange={(v) => setGroup("appearance", { reducedMotion: v })} />
            </ControlSection>
          </>
        )}

        {tab === "voice" && (
          <>
            <ControlSection icon={<Mic2 className="size-5" />} title="صوت المكالمة" desc={`${VOICE_CATALOG.length} صوتًا بشريًا واقعيًا من محرك Gemini + أصوات المتصفح كاحتياطي.`}>
              <SelectRow
                label="المحرك"
                value={p.voice.engine}
                onChange={(v) => setGroup("voice", { engine: v })}
                options={[
                  { id: "auto", label: "تلقائي (الأسرع المتاح)" },
                  { id: "gemini", label: "Gemini TTS (واقعي)" },
                  { id: "eleven", label: "ElevenLabs (إن وُجد المفتاح)" },
                  { id: "browser", label: "صوت المتصفح (بلا إنترنت)" },
                ]}
              />
              <VoiceGrid
                value={p.voice.voice}
                onChange={(v) => setGroup("voice", { voice: v })}
                title="الصوت الحالي"
              />
              <SegmentedRow
                label="لغة الكلام"
                value={p.voice.lang}
                onChange={(v) => setGroup("voice", { lang: v })}
                options={[
                  { id: "auto", label: "تلقائي" },
                  { id: "ar", label: "عربي/دارجة" },
                  { id: "fr", label: "Français" },
                  { id: "en", label: "English" },
                ]}
              />
              <SegmentedRow
                label="أسلوب الأداء"
                value={p.voice.style}
                onChange={(v) => setGroup("voice", { style: v })}
                options={[
                  { id: "warm", label: "ودّي" },
                  { id: "energetic", label: "حيوي" },
                  { id: "calm", label: "هادئ" },
                  { id: "professional", label: "رسمي" },
                  { id: "playful", label: "مرح" },
                  { id: "neutral", label: "محايد" },
                ]}
              />
              <SliderRow label="السرعة" value={p.voice.rate} min={0.7} max={1.4} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => setGroup("voice", { rate: v })} />
              <SliderRow label="طبقة الصوت" value={p.voice.pitch} min={0.7} max={1.4} step={0.05} onChange={(v) => setGroup("voice", { pitch: v })} />
            </ControlSection>

            <ControlSection icon={<Waves className="size-5" />} title="سلوك المكالمة" desc="مصممة لإحساس مكالمة حقيقية: يرد بسرعة ويقاطعه المستخدم متى شاء.">
              <SelectRow
                label="شخصية المكالمة"
                value={p.voice.persona}
                onChange={(v) => {
                  const pv = PERSONA_VOICES[v];
                  setGroup("voice", { persona: v, ...(pv ? { voice: pv.m } : {}) });
                }}
                options={VOICE_PERSONAS.map((x) => ({ id: x.id, label: `${x.emoji} ${x.label}` }))}
              />
              <ToggleRow label="تشغيل الصوت فورًا مع بدء الجواب" desc="بث جملة بجملة بدل انتظار الرد كاملًا" checked={p.voice.streamPlayback} onChange={(v) => setGroup("voice", { streamPlayback: v })} />
              <ToggleRow label="المقاطعة (Barge-in)" desc="إذا تكلمت يقف فورًا ويستمع لك" checked={p.voice.bargeIn} onChange={(v) => setGroup("voice", { bargeIn: v })} />
              <SliderRow label="حساسية اكتشاف الكلام" desc="أرفعها إن كان حولك ضجيج" value={p.voice.vadSensitivity} min={0} max={100} step={5} format={(v) => `${v}%`} onChange={(v) => setGroup("voice", { vadSensitivity: v })} />
              <ToggleRow label="ترجمة فورية على الشاشة" desc="نص ما يقال أثناء المكالمة" checked={p.voice.subtitles} onChange={(v) => setGroup("voice", { subtitles: v })} />
              <ToggleRow label="تحية عند بدء المكالمة" checked={p.voice.callGreeting} onChange={(v) => setGroup("voice", { callGreeting: v })} />
              <ToggleRow label="كبت الضجيج" checked={p.voice.noiseSuppression} onChange={(v) => setGroup("voice", { noiseSuppression: v })} />
              <ToggleRow label="إلغاء الصدى" checked={p.voice.echoCancellation} onChange={(v) => setGroup("voice", { echoCancellation: v })} />
              <ToggleRow label="ضبط تلقائي لمستوى الميكروفون" checked={p.voice.autoGain} onChange={(v) => setGroup("voice", { autoGain: v })} />
              <ToggleRow label="مؤثرات صوتية في الواجهة" checked={p.voice.soundFx} onChange={(v) => setGroup("voice", { soundFx: v })} />
              <ToggleRow label="قراءة الردود صوتيًا تلقائيًا في المحادثة" checked={p.voice.autoSpeak} onChange={(v) => setGroup("voice", { autoSpeak: v })} />
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                <span className="text-[13px] font-bold text-slate-100">مشاعر جاهزة</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {EMOTION_PRESETS.map((e) => (
                    <span key={e.id} className="rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300">
                      {e.ar}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-400">تُستعمل في المكالمة وفي زر «اقرأ بصوت» داخل المحادثة.</p>
              </div>
            </ControlSection>
          </>
        )}

        {tab === "ai" && (
          <>
            <ControlSection icon={<BrainCircuit className="size-5" />} title="طريقة التفكير" desc="بروتوكول ATLAS: فكّ الشيفرة ← صنّف ← خطّط ← استند ← احلّل ← تحقق ← سلّم.">
              <SegmentedRow
                label="عمق التفكير"
                value={p.ai.thinking}
                onChange={(v) => setGroup("ai", { thinking: v })}
                options={[
                  { id: "instant", label: "فوري" },
                  { id: "balanced", label: "متوازن" },
                  { id: "deep", label: "عميق" },
                  { id: "titan", label: "تيتان" },
                ]}
              />
              <SegmentedRow
                label="طول الجواب"
                value={p.ai.length}
                onChange={(v) => setGroup("ai", { length: v })}
                options={[
                  { id: "short", label: "قصير" },
                  { id: "medium", label: "متوسط" },
                  { id: "long", label: "طويل" },
                  { id: "exhaustive", label: "شامل" },
                ]}
              />
              <SegmentedRow
                label="المستوى"
                value={p.ai.tier}
                onChange={(v) => setGroup("ai", { tier: v })}
                options={[
                  { id: "auto", label: "تلقائي" },
                  { id: "free", label: "مجاني" },
                  { id: "v6", label: "Nexus 6" },
                  { id: "v8", label: "v8 الأسطوري" },
                  { id: "max", label: "MAX" },
                ]}
              />
              <SelectRow
                label="الشخصية"
                value={p.ai.persona}
                onChange={(v) => setGroup("ai", { persona: v })}
                options={[
                  { id: "genius", label: "عبقري عام" },
                  { id: "coder", label: "مهندس برمجيات" },
                  { id: "writer", label: "كاتب محترف" },
                  { id: "teacher", label: "أستاذ" },
                  { id: "analyst", label: "محلل" },
                  { id: "algerian", label: "جزائري 100%" },
                ]}
              />
              <SelectRow
                label="لغة الجواب"
                value={p.ai.language}
                onChange={(v) => setGroup("ai", { language: v })}
                options={[
                  { id: "auto", label: "مثل لغة المستخدم" },
                  { id: "darija", label: "الدارجة الجزائرية" },
                  { id: "ar", label: "العربية الفصحى" },
                  { id: "fr", label: "الفرنسية" },
                  { id: "en", label: "الإنجليزية" },
                ]}
              />
              <SliderRow label="الحرارة (الإبداع)" desc="0 = دقيق وثابت · 1 = مبدع ومتنوع" value={p.ai.temperature} min={0} max={1} step={0.05} onChange={(v) => setGroup("ai", { temperature: v })} />
              <SegmentedRow
                label="أسلوب الكود"
                value={p.ai.codeStyle}
                onChange={(v) => setGroup("ai", { codeStyle: v })}
                options={[
                  { id: "complete-file", label: "ملف كامل" },
                  { id: "diff", label: "فروقات" },
                  { id: "snippet", label: "مقتطفات" },
                ]}
              />
              <SegmentedRow
                label="مستوى الحذر"
                value={p.ai.safety}
                onChange={(v) => setGroup("ai", { safety: v })}
                options={[
                  { id: "strict", label: "صارم" },
                  { id: "balanced", label: "متوازن" },
                  { id: "relaxed", label: "مرن" },
                ]}
              />
            </ControlSection>

            <ControlSection icon={<Sparkles className="size-5" />} title="القدرات التلقائية" desc="ما يستعمله Nexus من تلقاء نفسه قبل أن يصل للنموذج.">
              <ToggleRow label="قاعدة المعرفة ATLAS" desc="يبحث في القاعدة المدمجة قبل الإنترنت (إدارات، دراسة، أعمال)" checked={p.ai.kbAuto} onChange={(v) => setGroup("ai", { kbAuto: v })} />
              <ToggleRow label="خزنة بياناتي" desc="يقتبس من ملفاتي وبياناتي المرفوعة" checked={p.ai.vaultAuto} onChange={(v) => setGroup("ai", { vaultAuto: v })} />
              <ToggleRow label="البحث في الإنترنت" desc="يبحث ويقرأ الصفحات عند الحاجة" checked={p.ai.webAuto} onChange={(v) => setGroup("ai", { webAuto: v })} />
              <ToggleRow label="الذاكرة طويلة الأمد" desc="يتذكر تفضيلاتي ومشاريعي" checked={p.ai.memoryAuto} onChange={(v) => setGroup("ai", { memoryAuto: v })} />
              <ToggleRow label="تحويل المخرجات إلى ملفات" desc="كل صفحة/لعبة/مستند يصبح ملفًا قابلًا للمعاينة والتنزيل" checked={p.ai.artifactsAuto} onChange={(v) => setGroup("ai", { artifactsAuto: v })} />
              <ToggleRow label="توليد الصور تلقائيًا" desc="يفهم «صمم لي شعارًا» ويولّد الصورة" checked={p.ai.imageAuto} onChange={(v) => setGroup("ai", { imageAuto: v })} />
              <ToggleRow label="اقتراحات المتابعة" desc="ثلاث رقائق أسفل الجواب" checked={p.ai.followUpChips} onChange={(v) => setGroup("ai", { followUpChips: v })} />
              <ToggleRow label="التحقق الذاتي قبل التسليم" desc="يعيد قراءة كوده وحساباته مرة" checked={p.ai.autoVerify} onChange={(v) => setGroup("ai", { autoVerify: v })} />
              <ToggleRow label="إظهار ملخص التفكير" desc="يظهر خطوة «يفكر» أثناء العمل" checked={p.ai.showReasoning} onChange={(v) => setGroup("ai", { showReasoning: v })} />
              <ToggleRow label="البث المباشر للجواب" checked={p.ai.streaming} onChange={(v) => setGroup("ai", { streaming: v })} />
            </ControlSection>
          </>
        )}

        {tab === "internet" && (
          <>
            <ControlSection icon={<Globe2 className="size-5" />} title="الوصول إلى الإنترنت" desc="Nexus يقدر يقرأ الصفحات، ينزّل الصور والأصوات والبيانات، ويفحصها قبل استعمالها.">
              <ToggleRow label="تفعيل الإنترنت" desc="بدونه يبقى Nexus على معرفته الداخلية فقط" checked={p.internet.enabled} onChange={(v) => setGroup("internet", { enabled: v })} />
              <SelectRow
                label="مزوّد البحث"
                value={p.internet.searchProvider}
                onChange={(v) => setGroup("internet", { searchProvider: v })}
                options={[
                  { id: "auto", label: "تلقائي (حسب المفاتيح المتوفرة)" },
                  { id: "tavily", label: "Tavily" },
                  { id: "brave", label: "Brave" },
                  { id: "serper", label: "Serper (Google)" },
                  { id: "bing", label: "Bing" },
                  { id: "duckduckgo", label: "DuckDuckGo" },
                  { id: "wikipedia", label: "Wikipedia" },
                ]}
              />
              <SliderRow label="عدد النتائج" value={p.internet.maxResults} min={3} max={12} step={1} format={(v) => String(v)} onChange={(v) => setGroup("internet", { maxResults: v })} />
              <ToggleRow label="قراءة محتوى الصفحات" desc="يفتح النتائج ويقرأها بدل الاكتفاء بالعناوين" checked={p.internet.readPages} onChange={(v) => setGroup("internet", { readPages: v })} />
              <ToggleRow label="جلب الروابط الملصقة تلقائيًا" checked={p.internet.autoFetchUrls} onChange={(v) => setGroup("internet", { autoFetchUrls: v })} />
              <ToggleRow label="تنزيل الوسائط من الإنترنت" desc="صور وأصوات وبيانات حرة الحقوق مع ذكر المصدر" checked={p.internet.downloadMedia} onChange={(v) => setGroup("internet", { downloadMedia: v })} />
              <SliderRow label="أقصى حجم تنزيل" value={p.internet.maxDownloadMb} min={1} max={50} step={1} format={(v) => `${v} MB`} onChange={(v) => setGroup("internet", { maxDownloadMb: v })} />
              <ToggleRow label="ذكر المصادر في الجواب" checked={p.internet.citeSources} onChange={(v) => setGroup("internet", { citeSources: v })} />
              <ToggleRow label="بحث آمن" checked={p.internet.safeSearch} onChange={(v) => setGroup("internet", { safeSearch: v })} />
            </ControlSection>

            <ControlSection icon={<ShieldCheck className="size-5" />} title="قوائم النطاقات" desc="اترك القائمة فارغة للسماح بكل النطاقات العامة (الحماية من SSRF تبقى مفعّلة دائمًا).">
              <DomainList label="نطاقات مسموحة" value={p.internet.allowedDomains} onChange={(v) => setGroup("internet", { allowedDomains: v })} placeholder="exemple.dz" />
              <DomainList label="نطاقات محظورة" value={p.internet.blockedDomains} onChange={(v) => setGroup("internet", { blockedDomains: v })} placeholder="spam.example" />
            </ControlSection>
          </>
        )}

        {tab === "files" && (
          <>
            <ControlSection icon={<FolderOpen className="size-5" />} title="مصنع الملفات" desc="كل مخرَج يصبح ملفًا: معاينة فورية، تنزيل، ZIP، ورابط مشاركة.">
              <ToggleRow label="معاينة تلقائية" desc="افتح المعاينة مباشرة بعد التوليد" checked={p.files.autoPreview} onChange={(v) => setGroup("files", { autoPreview: v })} />
              <ToggleRow label="حفظ النسخ في الخزنة" desc="تُحفظ تلقائيًا في «ملفاتي»" checked={p.files.saveToVault} onChange={(v) => setGroup("files", { saveToVault: v })} />
              <SegmentedRow
                label="الصيغة الافتراضية"
                value={p.files.defaultFormat}
                onChange={(v) => setGroup("files", { defaultFormat: v })}
                options={[
                  { id: "html", label: "HTML" },
                  { id: "zip", label: "ZIP" },
                  { id: "markdown", label: "Markdown" },
                  { id: "json", label: "JSON" },
                ]}
              />
              <SegmentedRow
                label="تسمية الملفات"
                value={p.files.naming}
                onChange={(v) => setGroup("files", { naming: v })}
                options={[
                  { id: "smart", label: "ذكية" },
                  { id: "title", label: "من العنوان" },
                  { id: "timestamp", label: "بالتاريخ" },
                ]}
              />
              <ToggleRow label="ضغط المشاريع متعددة الملفات في ZIP" checked={p.files.autoZipMulti} onChange={(v) => setGroup("files", { autoZipMulti: v })} />
              <ToggleRow label="روابط مشاركة عامة" desc="أي شخص عنده الرابط يقدر يعاين الملف" checked={p.files.publicLinks} onChange={(v) => setGroup("files", { publicLinks: v })} />
              <ToggleRow label="الاحتفاظ بالسجل" checked={p.files.keepHistory} onChange={(v) => setGroup("files", { keepHistory: v })} />
              <SliderRow label="أقصى عدد ملفات محفوظة" value={p.files.maxHistory} min={20} max={1000} step={20} format={(v) => String(v)} onChange={(v) => setGroup("files", { maxHistory: v })} />
              <Link href="/app/files" className="btn-primary mt-1 inline-flex w-full items-center justify-center gap-2 !rounded-2xl">
                <FolderOpen className="size-4" /> افتح خزنة الملفات
              </Link>
            </ControlSection>
          </>
        )}

        {tab === "privacy" && (
          <>
            <ControlSection icon={<ShieldCheck className="size-5" />} title="البيانات والخصوصية" desc="التحكم الكامل في ما يُحفظ وما يُرسل.">
              <ToggleRow label="مزامنة الإعدادات مع حسابي" checked={p.privacy.cloudSync} onChange={(v) => setGroup("privacy", { cloudSync: v })} />
              <ToggleRow label="حفظ المحادثات في السجل" checked={p.privacy.saveTranscripts} onChange={(v) => setGroup("privacy", { saveTranscripts: v })} />
              <ToggleRow label="قياسات الاستعمال (تحسين المنتج)" checked={p.privacy.telemetry} onChange={(v) => setGroup("privacy", { telemetry: v })} />
              <ToggleRow label="إحصائيات المكالمات الصوتية" desc="المدة والكمون والصوت المستعمل — بلا تسجيل صوتي" checked={p.privacy.analyticsVoice} onChange={(v) => setGroup("privacy", { analyticsVoice: v })} />
              <ToggleRow label="تخصيص العروض" checked={p.privacy.personalizedAds} onChange={(v) => setGroup("privacy", { personalizedAds: v })} />
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-[11.5px] leading-relaxed text-slate-300">
                لا يُخزَّن أي صوت مسجَّل: المكالمة تُحوَّل إلى نص في المتصفح، ويُسجَّل فقط اسم الصوت والمدة والكمون.
              </div>
              <Link href="/app/settings/privacy" className="btn-ghost inline-flex w-full items-center justify-center gap-2 !rounded-2xl">
                <ShieldCheck className="size-4" /> مركز الخصوصية وحذف البيانات
              </Link>
            </ControlSection>

            <ControlSection icon={<Sparkles className="size-5" />} title="الهوية" desc="ثابتة ولا تتغير بأي رسالة.">
              <div className="space-y-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-[12px] leading-relaxed text-slate-200">
                <p>{IDENTITY_ANSWERS.ar}</p>
                <p className="text-slate-400">{IDENTITY_ANSWERS.fr}</p>
                <p className="text-slate-400">{IDENTITY_ANSWERS.en}</p>
                <p className="mt-2 text-[11px] text-slate-400">
                  المطوّر: <span className="font-black text-white">{NEXUS_MAKER.name}</span> · {NEXUS_MAKER.company} · {NEXUS_MAKER.country} {NEXUS_MAKER.flag}
                </p>
              </div>
            </ControlSection>
          </>
        )}

        {tab === "a11y" && (
          <>
            <ControlSection icon={<Accessibility className="size-5" />} title="الوصولية" desc="للقراءة المريحة والاستعمال بدون عوائق.">
              <ToggleRow label="تباين أعلى" desc="نص أوضح وحدود أقوى" checked={p.a11y.highContrast} onChange={(v) => setGroup("a11y", { highContrast: v })} />
              <ToggleRow label="خط مناسب لعسر القراءة" desc="تباعد أكبر بين الحروف والأسطر" checked={p.a11y.dyslexicFont} onChange={(v) => setGroup("a11y", { dyslexicFont: v })} />
              <ToggleRow label="أهداف لمس أكبر" desc="أزرار أكبر للمس على الهاتف" checked={p.a11y.largeTargets} onChange={(v) => setGroup("a11y", { largeTargets: v })} />
              <ToggleRow label="تلميحات لقارئ الشاشة" checked={p.a11y.screenReaderHints} onChange={(v) => setGroup("a11y", { screenReaderHints: v })} />
              <ToggleRow label="ضبط تباين النص تلقائيًا" checked={p.a11y.autoContrastText} onChange={(v) => setGroup("a11y", { autoContrastText: v })} />
            </ControlSection>
          </>
        )}

        {tab === "lab" && (
          <>
            <ControlSection icon={<FlaskConical className="size-5" />} title="المختبر" desc="ميزات قوية قيد التجربة — قد تتغير.">
              <ToggleRow label="مجلس الذكاءات" desc="عدة نماذج تتداول ثم تُدمج الأجوبة" checked={p.lab.council} onChange={(v) => setGroup("lab", { council: v })} />
              <ToggleRow label="الوكيل المستقل" desc="يخطط وينفّذ أدوات متعددة الخطوات" checked={p.lab.agentMode} onChange={(v) => setGroup("lab", { agentMode: v })} />
              <ToggleRow label="صانع الألعاب الفوري SMITH" checked={p.lab.smithInstant} onChange={(v) => setGroup("lab", { smithInstant: v })} />
              <ToggleRow label="لوحة الأوامر (Ctrl+K)" checked={p.lab.commandPalette} onChange={(v) => setGroup("lab", { commandPalette: v })} />
              <ToggleRow label="عدّة العمل بلا إنترنت" desc="يخزّن قاعدة المعرفة للاستعمال أوفلاين" checked={p.lab.offlineKit} onChange={(v) => setGroup("lab", { offlineKit: v })} />
              <ToggleRow label="نماذج تجريبية" checked={p.lab.betaModels} onChange={(v) => setGroup("lab", { betaModels: v })} />
              <ToggleRow label="لوحة المطور" desc="حالة المحركات والكمون والحدود" checked={p.lab.devPanel} onChange={(v) => setGroup("lab", { devPanel: v })} />
            </ControlSection>

            <ControlSection icon={<RotateCcw className="size-5" />} title="إعادة الضبط" desc="يرجع كل المقابض إلى وضعها الافتراضي.">
              <button
                type="button"
                onClick={() => void reset()}
                className="btn-ghost inline-flex w-full items-center justify-center gap-2 !rounded-2xl border-rose-400/40 text-rose-300"
              >
                <RotateCcw className="size-4" /> إعادة كل الإعدادات
              </button>
            </ControlSection>
          </>
        )}
      </div>
    </div>
  );
}

/** A grid of every curated voice with its mood + language strengths. */
function VoiceGrid({ value, onChange, title }: { value: string; onChange: (v: string) => void; title: string }) {
  const [gender, setGender] = useState<"any" | "m" | "f">("any");
  const list = VOICE_CATALOG.filter((v) => gender === "any" || v.gender === gender);
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-slate-100">{title}</span>
        <div className="flex gap-1.5">
          {(["any", "f", "m"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              className={cn(
                "rounded-lg border px-2 py-1 text-[10.5px] font-bold transition",
                gender === g ? "border-transparent bg-white/18 text-white" : "border-white/12 text-slate-300 hover:text-white"
              )}
            >
              {g === "any" ? "الكل" : g === "f" ? "نسائي" : "رجالي"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 grid max-h-72 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
        {list.map((v) => {
          const on = value === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange(v.id)}
              aria-pressed={on}
              className={cn(
                "flex items-start gap-2 rounded-xl border px-2.5 py-2 text-right transition active:scale-[0.98]",
                on ? "border-transparent bg-gradient-to-l from-[var(--nx-accent-from)]/35 to-[var(--nx-accent-to)]/25 text-white" : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"
              )}
            >
              <span className="text-base leading-none">{v.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-bold">{v.name.ar}</span>
                <span className="mt-0.5 block truncate text-[10px] text-slate-400">{v.best.ar}</span>
                <span className="mt-1 flex items-center gap-1 text-[9.5px] text-slate-400" dir="ltr">
                  AR {dots(v.arabic)} · FR {dots(v.french)} · EN {dots(v.english)}
                </span>
              </span>
              {on && <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-300" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function dots(n: number) {
  return "●".repeat(Math.max(0, Math.min(5, n))) + "○".repeat(Math.max(0, 5 - Math.min(5, n)));
}

function DomainList({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <span className="text-[13px] font-bold text-slate-100">{label}</span>
      <div className="mt-2 flex gap-2">
        <input
          className="input-base !h-9 flex-1 !rounded-xl !text-xs"
          dir="ltr"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onChange([...value, draft.trim().toLowerCase()].slice(0, 60));
              setDraft("");
            }
          }}
        />
        <button
          type="button"
          className="btn-ghost !h-9 !rounded-xl !px-3 !text-xs"
          onClick={() => {
            if (!draft.trim()) return;
            onChange([...value, draft.trim().toLowerCase()].slice(0, 60));
            setDraft("");
          }}
        >
          إضافة
        </button>
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((d) => (
            <span key={d} className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-white/[0.05] px-2 py-1 font-mono text-[10.5px] text-slate-300" dir="ltr">
              {d}
              <button type="button" aria-label={`حذف ${d}`} className="text-slate-500 hover:text-rose-400" onClick={() => onChange(value.filter((x) => x !== d))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
