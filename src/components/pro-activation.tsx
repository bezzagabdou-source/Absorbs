"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Brain,
  Code2,
  Crown,
  Gamepad2,
  ImagePlus,
  Lightbulb,
  MessageSquarePlus,
  Headphones,
  Rocket,
  ShieldCheck,
  Sparkles,
  Users,
  Volume2,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

type Lang = "ar" | "fr" | "en";

type Feature = {
  icon: LucideIcon;
  title: Record<Lang, string>;
  desc: Record<Lang, string>;
  /** prompt sent to the chat when the user taps "try it" */
  demo: Record<Lang, string>;
  hot?: boolean;
};

export const V8_FEATURES: Feature[] = [
  {
    icon: Brain,
    hot: true,
    title: { ar: "عقل عبقري يفهم أي شيء", fr: "Un cerveau de génie", en: "A genius brain" },
    desc: {
      ar: "يفهم الدارجة والأخطاء الإملائية والجمل الناقصة ويعرف ماذا تقصد فعلًا.",
      fr: "Comprend le darija, les fautes et les phrases à moitié écrites.",
      en: "Understands slang, typos and half-finished sentences.",
    },
    demo: {
      ar: "واش راهي أحسن طريقة باش نبدا مشروع صغير بميزانية 50 ألف دج؟ عطيني خطة واضحة",
      fr: "Quelle est la meilleure façon de lancer un petit projet avec 50 000 DA ? Donne-moi un plan clair",
      en: "What's the smartest way to launch a small business with a 50,000 DZD budget? Give me a clear plan",
    },
  },
  {
    icon: Users,
    hot: true,
    title: { ar: "فريق ذكاء اصطناعي في كل مهمة صعبة", fr: "Équipe d'IA sur chaque tâche difficile", en: "An AI team on every hard task" },
    desc: {
      ar: "Claude وGemini وDeepSeek وGrok يحلّون معًا ثم تُدمج أقوى إجابة — للبرمجة والتعديل والتقارير وليس للألعاب فقط.",
      fr: "Plusieurs IA travaillent ensemble puis fusionnent la meilleure réponse.",
      en: "Several AIs work together, then the best answer is merged.",
    },
    demo: {
      ar: "اكتب لي دالة JavaScript تتحقق من رقم هاتف جزائري (05/06/07) مع اختبارات وحالات حدّية",
      fr: "Écris une fonction JavaScript qui valide un numéro algérien (05/06/07) avec des tests",
      en: "Write a JavaScript function that validates Algerian phone numbers (05/06/07) with tests and edge cases",
    },
  },
  {
    icon: Zap,
    title: { ar: "سرعة قصوى", fr: "Vitesse maximale", en: "Maximum speed" },
    desc: {
      ar: "طلبات متوازية وأول كلمة تظهر فورًا، والأسئلة العادية تُجاب في ثوانٍ.",
      fr: "Requêtes parallèles : la première phrase apparaît immédiatement.",
      en: "Parallel requests: the first words appear instantly.",
    },
    demo: { ar: "لخّص لي في 3 أسطر الفرق بين HTTP وHTTPS", fr: "Résume en 3 lignes la différence entre HTTP et HTTPS", en: "Summarise HTTP vs HTTPS in 3 lines" },
  },
  {
    icon: ShieldCheck,
    hot: true,
    title: { ar: "لا ينقطع أبدًا", fr: "Ne s'arrête jamais", en: "Never gets cut off" },
    desc: {
      ar: "اطلب شيئًا كبيرًا واخرج من التطبيق أو الموقع — يكمل السيرفر العمل ويحفظ النتيجة في سجلك.",
      fr: "Quittez l'app : le serveur termine et enregistre le résultat.",
      en: "Leave the app: the server finishes and saves the result.",
    },
    demo: {
      ar: "ابنِ لي صفحة هبوط كاملة لمتجر إلكتروني جزائري للملابس بتصميم فخم",
      fr: "Crée une landing page complète pour une boutique de vêtements algérienne",
      en: "Build a complete luxury landing page for an Algerian clothing store",
    },
  },
  {
    icon: Rocket,
    title: { ar: "مسارات بديلة تلقائية", fr: "Plans B automatiques", en: "Automatic fallback routes" },
    desc: {
      ar: "إن تعثّر محرّك يتحوّل الطلب لمحرّك آخر بصمت، وإن فشل الكل لا يُخصم رصيدك.",
      fr: "Si un moteur échoue, un autre prend le relais sans rien perdre.",
      en: "If one engine fails another takes over — nothing is lost.",
    },
    demo: { ar: "اشرح لي خوارزمية Dijkstra بمثال مرسوم بالنص", fr: "Explique l'algorithme de Dijkstra avec un exemple", en: "Explain Dijkstra's algorithm with a worked example" },
  },
  {
    icon: Sparkles,
    title: { ar: "أوضاع شخصية", fr: "Modes de personnalité", en: "Persona modes" },
    desc: {
      ar: "مبرمج، كاتب، معلّم، محلل — بضغطة واحدة يتغير أسلوب التفكير بالكامل.",
      fr: "Ingénieur, écrivain, prof, analyste — un clic.",
      en: "Engineer, writer, teacher, analyst — one tap.",
    },
    demo: { ar: "اشرح لي الاشتقاق كأنني تلميذ في الثانوية مع مثال من الباك", fr: "Explique la dérivation à un lycéen avec un exemple du BAC", en: "Explain derivatives to a high-school student with a BAC-style example" },
  },
  {
    icon: Lightbulb,
    title: { ar: "اقتراحات ذكية بعد كل رد", fr: "Suggestions intelligentes", en: "Smart follow-ups" },
    desc: {
      ar: "ثلاث أزرار جاهزة للخطوة التالية — اضغط واكمل دون كتابة.",
      fr: "Trois boutons pour la suite — sans taper.",
      en: "Three one-tap next steps after every answer.",
    },
    demo: { ar: "أعطني أفكار مشاريع رقمية ناجحة في الجزائر 2026", fr: "Donne-moi des idées de projets numériques rentables en Algérie", en: "Give me profitable digital project ideas for Algeria" },
  },
  {
    icon: Headphones,
    title: { ar: "محادثة صوتية مباشرة", fr: "Conversation vocale", en: "Live voice chat" },
    desc: {
      ar: "تكلّم فيرد عليك بصوته ثم يستمع من جديد — كأنك تتحدث مع إنسان.",
      fr: "Parlez, il répond à voix haute puis réécoute.",
      en: "Talk, it answers aloud then listens again.",
    },
    demo: { ar: "تكلّم معي عن أفضل طريقة لتعلّم البرمجة خلال 3 أشهر", fr: "Parle-moi de la meilleure façon d'apprendre à coder en 3 mois", en: "Tell me the best way to learn coding in 3 months" },
  },
  {
    icon: Volume2,
    title: { ar: "قراءة الرد صوتيًا", fr: "Lecture à voix haute", en: "Read-aloud" },
    desc: {
      ar: "زر استماع تحت كل رد بالعربية والفرنسية والإنجليزية.",
      fr: "Bouton d'écoute sous chaque réponse.",
      en: "A listen button under every answer.",
    },
    demo: { ar: "احكِ لي قصة قصيرة مشوّقة عن صحراء الجزائر", fr: "Raconte-moi une courte histoire captivante sur le Sahara algérien", en: "Tell me a short gripping story set in the Algerian Sahara" },
  },
  {
    icon: Gamepad2,
    title: { ar: "ألعاب ومواقع بآلاف الأسطر", fr: "Jeux & sites de milliers de lignes", en: "Games & sites, thousands of lines" },
    desc: {
      ar: "صانع ألعاب ومواقع بمعاينة حية وتحميل ZIP، ويكمل حتى النهاية.",
      fr: "Aperçu en direct et téléchargement ZIP.",
      en: "Live preview and ZIP download.",
    },
    demo: { ar: "اصنع لي لعبة سباق سيارات ثلاثية الأبعاد بسيطة ألعبها بالهاتف", fr: "Crée un jeu de course 3D simple jouable sur téléphone", en: "Make a simple 3D racing game playable on a phone" },
  },
  {
    icon: ImagePlus,
    title: { ar: "صور وPDF وملفات كود", fr: "Images, PDF et code", en: "Images, PDFs and code files" },
    desc: {
      ar: "أرفق ما تشاء ويقرؤه بعمق ويحلله ويصلح أخطاءه.",
      fr: "Joignez-les : il lit, analyse et corrige.",
      en: "Attach them: it reads, analyses and fixes.",
    },
    demo: { ar: "راجع لي هذا الكود وأعطني الأخطاء الأمنية: ", fr: "Fais une revue de sécurité de ce code : ", en: "Review this code for security issues: " },
  },
  {
    icon: Code2,
    title: { ar: "هندسة برمجية كاملة", fr: "Ingénierie complète", en: "Full engineering" },
    desc: {
      ar: "تعديل وإصلاح وشرح وتحويل لغات واختبارات — ملفات كاملة جاهزة للتشغيل.",
      fr: "Corrections, tests, conversions : fichiers complets.",
      en: "Fixes, tests, conversions: complete runnable files.",
    },
    demo: { ar: "حوّل هذا إلى TypeScript مع أنواع صارمة: function add(a,b){return a+b}", fr: "Convertis en TypeScript strict : function add(a,b){return a+b}", en: "Convert to strict TypeScript: function add(a,b){return a+b}" },
  },
  {
    icon: MessageSquarePlus,
    title: { ar: "ذاكرة طويلة المدى", fr: "Mémoire à long terme", en: "Long-term memory" },
    desc: {
      ar: "قل «تذكّر أن…» فيتذكّر في كل محادثة قادمة.",
      fr: "Dites « souviens-toi… » et c'est retenu.",
      en: "Say “remember…” and it sticks.",
    },
    demo: { ar: "تذكّر أنني طالب في السنة الثالثة ثانوي شعبة علوم تجريبية وأحب الفيزياء", fr: "Souviens-toi que je suis en terminale sciences expérimentales", en: "Remember that I'm a final-year science student who loves physics" },
  },
];

const GOLD = ["#fff1b8", "#fde68a", "#fbbf24", "#f59e0b"];
const CYAN = ["#67e8f9", "#22d3ee", "#9fd0ff", "#4da3ff"];

/** Gold + electric-blue spark explosion. Pure canvas, ~220 particles, stops by itself. */
function SparkCanvas({ burst }: { burst: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
      cv.style.width = "100%";
      cv.style.height = "100%";
    };
    resize();
    window.addEventListener("resize", resize);

    type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; c: string; bolt: boolean };
    const ps: P[] = [];
    const cx = cv.width / 2;
    const cy = cv.height * 0.34;
    const spawn = (n: number, power: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (Math.random() * 0.9 + 0.25) * power * dpr;
        const pal = Math.random() < 0.62 ? GOLD : CYAN;
        ps.push({
          x: cx,
          y: cy,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0,
          max: 60 + Math.random() * 90,
          r: (Math.random() * 2.2 + 0.8) * dpr,
          c: pal[(Math.random() * pal.length) | 0],
          bolt: Math.random() < 0.12,
        });
      }
    };
    spawn(170, 13);
    spawn(60, 5);
    let frame = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = "lighter";
      if (frame === 30) spawn(70, 8);
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life++;
        p.vx *= 0.975;
        p.vy = p.vy * 0.975 + 0.06 * dpr;
        p.x += p.vx;
        p.y += p.vy;
        const k = 1 - p.life / p.max;
        if (k <= 0) {
          ps.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, k);
        ctx.fillStyle = p.c;
        ctx.strokeStyle = p.c;
        if (p.bolt) {
          ctx.lineWidth = p.r * 0.8;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 3.2, p.y - p.vy * 3.2);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (0.5 + k), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (ps.length > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [burst]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}

/**
 * The legendary "Barq 8 Pro activated" experience.
 * Shown after a code is redeemed / payment succeeds / on demand from the upgrade page.
 */
export function ProActivation({ open, onClose, fresh = true }: { open: boolean; onClose: () => void; fresh?: boolean }) {
  const { locale } = useI18n();
  const lang: Lang = locale === "fr" ? "fr" : locale === "ar" ? "ar" : "en";
  const router = useRouter();
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState(0);
  const [burst, setBurst] = useState(0);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setStage(0);
    setBurst((b) => b + 1);
    const t1 = setTimeout(() => setStage(1), reduce ? 100 : 1500);
    const t2 = setTimeout(() => setStage(2), reduce ? 200 : 3300);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, reduce]);

  const L = useCallback((o: Record<Lang, string>) => o[lang], [lang]);
  const tr = useMemo(
    () => ({
      activated: { ar: "تم التفعيل بنجاح", fr: "Activation réussie", en: "Activated successfully" },
      welcome: { ar: "أهلًا بك في النسخة الأسطورية", fr: "Bienvenue dans la version légendaire", en: "Welcome to the legendary version" },
      sub: {
        ar: "هذه مميزاتك الجديدة — اضغط «جرّبها» على أي ميزة لتشاهدها تعمل فورًا.",
        fr: "Voici vos nouveaux pouvoirs — touchez « Essayer » pour les voir en action.",
        en: "Here are your new powers — tap “Try it” on any feature to see it work instantly.",
      },
      reveal: { ar: "اكتشف الميزات", fr: "Découvrir les fonctions", en: "Explore features" },
      tryIt: { ar: "جرّبها", fr: "Essayer", en: "Try it" },
      start: { ar: "ابدأ مع برق 8 Pro", fr: "Commencer avec Barq 8 Pro", en: "Start with Barq 8 Pro" },
      close: { ar: "إغلاق", fr: "Fermer", en: "Close" },
      badge: { ar: "الأسرع · الأذكى · لا ينقطع", fr: "Plus rapide · Plus intelligent · Sans coupure", en: "Fastest · Smartest · Never cut off" },
    }),
    []
  );

  const tryFeature = (f: Feature) => {
    onClose();
    router.push(`/app?q=${encodeURIComponent(L(f.demo))}`);
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="pro-activation"
          role="dialog"
          aria-modal="true"
          aria-label="Barq 8 Pro"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          className="fixed inset-0 z-[9999] overflow-y-auto overscroll-contain bg-[#04030c] text-white"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* ---------- animated backdrop ---------- */}
          <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
            <div className="v8-aurora v8-aurora-a" />
            <div className="v8-aurora v8-aurora-b" />
            <div className="v8-aurora v8-aurora-c" />
            <div className="v8-grid" />
            <div className="v8-vignette" />
          </div>
          {!reduce && <SparkCanvas burst={burst} />}

          {/* flash on open */}
          {!reduce && (
            <motion.div
              aria-hidden
              initial={{ opacity: 0.95 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
              className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_34%,#fff8d6,transparent_60%)]"
            />
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label={L(tr.close)}
            className="fixed end-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/40 text-slate-200 backdrop-blur transition active:scale-90 hover:bg-white/10"
            style={{ top: "max(1rem, env(safe-area-inset-top))" }}
          >
            <X className="h-5 w-5" />
          </button>

          <div className="relative z-10 mx-auto flex min-h-full w-full max-w-5xl flex-col items-center px-4 pb-32 pt-[14vh] sm:px-6">
            {/* ---------- crown with rings ---------- */}
            <div className="relative mb-7 grid h-44 w-44 place-items-center sm:h-52 sm:w-52">
              <span className="v8-ring v8-ring-1" aria-hidden />
              <span className="v8-ring v8-ring-2" aria-hidden />
              <span className="v8-ring v8-ring-3" aria-hidden />
              <span className="gold-halo" aria-hidden />
              <motion.span
                initial={reduce ? false : { scale: 0, rotate: -140, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 140, damping: 13, delay: 0.15 }}
                className="pro-shine relative grid h-28 w-28 place-items-center rounded-[2rem] bg-gradient-to-br from-gold-200 via-gold-400 to-gold-600 text-[#2a1700] shadow-[0_30px_80px_-10px_rgba(251,191,36,0.9),inset_0_3px_0_rgba(255,255,255,0.75)] sm:h-32 sm:w-32"
              >
                <Crown className="h-14 w-14 sm:h-16 sm:w-16" strokeWidth={2.2} />
              </motion.span>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  aria-hidden
                  className="sparkle"
                  style={{
                    top: `${10 + ((i * 37) % 70)}%`,
                    insetInlineStart: `${(i * 23) % 90}%`,
                    animationDelay: `${i * 0.45}s`,
                  }}
                />
              ))}
            </div>

            {/* ---------- title ---------- */}
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mb-2 inline-flex items-center gap-2 rounded-full border border-gold-400/40 bg-gold-400/10 px-4 py-1.5 text-xs font-black text-gold-300"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {fresh ? L(tr.activated) : L(tr.badge)}
            </motion.p>

            <h1 dir="ltr" className="v8-title text-center font-display text-5xl font-black leading-none tracking-tight sm:text-7xl">
              {"BARQ".split("").map((ch, i) => (
                <motion.span
                  key={`b${i}`}
                  initial={reduce ? false : { opacity: 0, y: 40, filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ delay: 0.6 + i * 0.09, type: "spring", stiffness: 160, damping: 16 }}
                  className="gold-text inline-block"
                >
                  {ch}
                </motion.span>
              ))}
              <motion.span
                initial={reduce ? false : { opacity: 0, scale: 0.2, rotate: -30 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ delay: 1.05, type: "spring", stiffness: 200, damping: 12 }}
                className="mx-3 inline-block bg-gradient-to-br from-aqua-300 to-brand-500 bg-clip-text text-transparent"
              >
                8
              </motion.span>
              <motion.span
                initial={reduce ? false : { opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.2 }}
                className="inline-block rounded-2xl bg-gradient-to-br from-gold-200 via-gold-400 to-gold-600 px-3 py-1 text-[0.55em] align-middle text-[#2a1700]"
              >
                PRO
              </motion.span>
            </h1>

            <AnimatePresence>
              {stage >= 1 && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-5 max-w-xl text-center"
                >
                  <p className="text-xl font-black text-white sm:text-2xl">{L(tr.welcome)}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300 sm:text-base">{L(tr.sub)}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ---------- feature cards ---------- */}
            <AnimatePresence>
              {stage >= 2 && (
                <motion.ul
                  initial="hidden"
                  animate="show"
                  variants={{ show: { transition: { staggerChildren: 0.07 } } }}
                  className="mt-10 grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {V8_FEATURES.map((f) => {
                    const Icon = f.icon;
                    return (
                      <motion.li
                        key={f.title.en}
                        variants={{
                          hidden: { opacity: 0, y: 26, scale: 0.96 },
                          show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 180, damping: 18 } },
                        }}
                        className={`v8-card group relative flex flex-col rounded-3xl p-4 ${f.hot ? "v8-card-hot" : ""}`}
                      >
                        {f.hot && (
                          <span className="absolute -top-2.5 end-4 rounded-full bg-gradient-to-r from-gold-200 to-gold-500 px-2.5 py-0.5 text-[10px] font-black text-[#2a1700] shadow-[0_6px_16px_-6px_rgba(251,191,36,0.9)]">
                            NEW
                          </span>
                        )}
                        <div className="flex items-start gap-3">
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-gold-300/30 to-brand-500/30 text-gold-200 ring-1 ring-gold-400/40 transition group-hover:scale-110">
                            <Icon className="h-5.5 w-5.5" />
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-[15px] font-black leading-snug text-white">{L(f.title)}</h3>
                            <p className="mt-1 text-[12.5px] leading-relaxed text-slate-300">{L(f.desc)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => tryFeature(f)}
                          className="mt-3 inline-flex items-center justify-center gap-1.5 self-start rounded-full border border-gold-400/40 bg-gold-400/10 px-4 py-1.5 text-xs font-black text-gold-200 transition active:scale-95 hover:bg-gold-400/20"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          {L(tr.tryIt)}
                        </button>
                      </motion.li>
                    );
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>

          {/* ---------- sticky CTA ---------- */}
          <AnimatePresence>
            {stage >= 1 && (
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                className="fixed inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-[#04030c] via-[#04030c]/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10"
              >
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push("/app");
                  }}
                  className="btn-gold w-full max-w-md py-3.5 text-base"
                >
                  <Rocket className="h-5 w-5" />
                  {L(tr.start)}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
