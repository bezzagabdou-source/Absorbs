import Link from "next/link";
import { BadgeCheck, Heart, Images, MessageCircle, MessageCircleHeart, Play, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { InstallButton } from "@/components/pwa/install-button";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "مرحبًا بك" };

const FEATURES = [
  { icon: Zap, title: "حيّ لحظة بلحظة", text: "منشورات وإعجابات وتعليقات تصل فورًا بدون تحديث الصفحة" },
  { icon: MessageCircleHeart, title: "رسائل خاصة فورية", text: "ابحث بأي اسم مستخدم وابدأ محادثة خاصة تصل في نفس الثانية" },
  { icon: Images, title: "صور بجودة كاملة", text: "انشر لحظاتك بصور مضغوطة بذكاء وتُعرض بجمال على كل الشاشات" },
  { icon: ShieldCheck, title: "خصوصية محكمة", text: "صلاحيات Row Level Security: لا يرى أحد إلا ما يجب أن يراه" },
];

const STATS = [
  { value: "لحظي", label: "بث مباشر" },
  { value: "100%", label: "مجاني" },
  { value: "24/7", label: "بدون توقف" },
];

export default function WelcomePage() {
  return (
    <div className="aurora relative min-h-dvh overflow-hidden">
      {/* cinematic mesh glows */}
      <div className="pointer-events-none absolute -top-32 start-1/3 h-96 w-96 rounded-full bg-indigo-600/25 blur-[110px]" />
      <div className="pointer-events-none absolute top-1/2 -start-32 h-80 w-80 rounded-full bg-cyan-500/20 blur-[100px]" />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.4rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <span className="logo-mark h-10 w-10 rounded-2xl text-base">A</span>
            <span className="text-lg font-black tracking-tight text-slate-900">Dz connect</span>
          </span>
          <Link href="/login" className="glass rounded-full px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-slate-900/10 active:scale-95">
            تسجيل الدخول
          </Link>
        </header>

        {/* ── Hero ── */}
        <div className="stagger mt-9 text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-3.5 py-1.5 text-[11px] font-bold text-violet-100 ring-1 ring-violet-300/25">
            <Sparkles className="h-3.5 w-3.5" /> الشبكة الاجتماعية التي تُشبهك
          </p>
          <h1 className="mt-5 text-[44px] font-black leading-[1.15] text-slate-900">
            عالمك كامل…
            <span className="text-gradient block pb-1">في جيبك</span>
          </h1>
          <p className="mx-auto mt-3 max-w-[340px] text-[14.5px] leading-7 text-slate-900/60">
            انشر صورك وأفكارك، تفاعل بقلوب وتعليقات حيّة، وراسل أصدقاءك لحظيًا — بتجربة زجاجية فاخرة تُنافس أكبر المنصات.
          </p>
          <div className="mt-6 flex items-center justify-center gap-6">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-gradient text-xl font-black">{s.value}</p>
                <p className="mt-0.5 text-[10.5px] font-semibold text-slate-900/45">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Floating phone mockup ── */}
        <div className="relative mx-auto mt-9 w-[270px] shrink-0" aria-hidden>
          <div className="absolute inset-0 -z-10 scale-90 rounded-[48px] bg-gradient-to-b from-indigo-600/50 via-indigo-600/30 to-cyan-500/40 blur-2xl" />
          <div className="animate-float overflow-hidden rounded-[42px] bg-[#EEF1FD] shadow-[0_40px_90px_rgba(0,0,0,0.65)] ring-1 ring-slate-900/15">
            {/* mock status bar */}
            <div className="flex items-center justify-between px-5 pt-3 text-[8px] font-bold text-slate-900/60">
              <span>9:41</span>
              <span className="h-3.5 w-16 rounded-full media-stage ring-1 ring-slate-900/10" />
              <span>▰▰▰</span>
            </div>
            {/* mock app header */}
            <div className="flex items-center justify-between px-4 pt-2.5">
              <span className="flex items-center gap-1.5">
                <span className="logo-mark h-6 w-6 rounded-lg text-[10px]">A</span>
                <span className="text-[11px] font-black text-slate-900">Dz connect</span>
              </span>
              <MessageCircle className="h-4 w-4 text-slate-900/70" />
            </div>
            {/* mock stories */}
            <div className="mt-3 flex gap-2.5 px-4">
              {["oran", "art", "dz", "food"].map((seed, i) => (
                <span key={seed} className="flex flex-col items-center gap-1">
                  <span className="rounded-full bg-gradient-to-tr from-indigo-500 via-indigo-500 to-cyan-400 p-[1.5px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://picsum.photos/seed/dzconnect-avatar-${seed}/80/80`} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-[#0B1020]" />
                  </span>
                  <span className="h-1 w-6 rounded-full bg-slate-900/25" />
                  {i === -1}
                </span>
              ))}
            </div>
            {/* mock post */}
            <div className="mx-3 mb-3 mt-3 overflow-hidden rounded-[22px] bg-slate-900/[0.045] ring-1 ring-slate-900/[0.07]">
              <div className="flex items-center gap-2 px-3 pt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://picsum.photos/seed/dzconnect-avatar-oran/80/80" alt="" className="h-7 w-7 rounded-full object-cover" />
                <span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-900">
                    أمين بن يوسف <BadgeCheck className="h-3 w-3 fill-cyan-400 text-[#0B1020]" />
                  </span>
                  <span className="block text-[8px] text-slate-900/40">@amine.dz · قبل ساعتين</span>
                </span>
              </div>
              <p className="px-3 pt-2 text-[10px] leading-4.5 text-slate-900/80">وهران اليوم كانت تحفة 🌅 البحر والنسيم والقهوة…</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://picsum.photos/seed/dzconnect-oran/540/340" alt="" className="mt-2 h-32 w-full object-cover" />
              <div className="flex items-center gap-3 px-3 py-2.5 text-slate-900/70">
                <span className="flex items-center gap-1 text-[10px] font-bold text-red-400">
                  <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" /> 248
                </span>
                <span className="flex items-center gap-1 text-[10px] font-bold">
                  <MessageCircle className="h-3.5 w-3.5" /> 36
                </span>
                <Play className="ms-auto h-3.5 w-3.5" />
              </div>
            </div>
          </div>

          {/* floating live badges */}
          <div className="glass-strong animate-float absolute -end-14 top-16 flex items-center gap-2 rounded-2xl px-3 py-2 shadow-2xl" style={{ animationDelay: "0.8s" }}>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/25">
              <Heart className="h-3.5 w-3.5 fill-red-400 text-red-400" />
            </span>
            <span className="text-[10px] leading-3.5">
              <b className="block text-[11px] text-slate-900">إعجاب جديد</b>
              <span className="text-slate-900/50">قبل ثواني</span>
            </span>
          </div>
          <div className="glass-strong animate-float absolute -start-12 bottom-20 flex items-center gap-2 rounded-2xl px-3 py-2 shadow-2xl" style={{ animationDelay: "1.6s" }}>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400/20">
              <MessageCircleHeart className="h-3.5 w-3.5 text-cyan-600" />
            </span>
            <span className="text-[10px] leading-3.5">
              <b className="block text-[11px] text-slate-900">رسالة فورية</b>
              <span className="text-slate-900/50">وصلت الآن ⚡</span>
            </span>
          </div>
        </div>

        {/* ── Features ── */}
        <div className="stagger mt-10 grid grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass rounded-[24px] p-4">
              <f.icon className="h-6 w-6 text-violet-600" />
              <h2 className="mt-2.5 text-sm font-bold text-slate-900">{f.title}</h2>
              <p className="mt-1 text-[11.5px] leading-5 text-slate-900/50">{f.text}</p>
            </div>
          ))}
        </div>

        {/* ── CTA ── */}
        <div className="mt-8 space-y-3 pb-2 pt-2">
          <InstallButton />
          <a
            href="https://github.com/bezzagabdou-source/Absorbs/releases/download/dz-connect-v1.5.0/DZConnect.apk"
            className="glass flex items-center justify-center gap-2 rounded-full py-3.5 text-[15px] font-black text-indigo-600 transition hover:bg-slate-900/[0.07] active:scale-[0.98]"
          >
            📱 حمّل تطبيق Android مباشرة (APK)
          </a>
          <Link href="/signup" className="btn-primary flex items-center justify-center gap-2 rounded-full py-4 text-base font-black text-slate-900">
            <Heart className="h-5 w-5" /> إنشاء حساب مجاني
          </Link>
          <Link href="/login" className="glass flex items-center justify-center rounded-full py-4 text-base font-bold text-slate-900 transition hover:bg-slate-900/[0.08] active:scale-[0.99]">
            لدي حساب — تسجيل الدخول
          </Link>
          <p className="pt-1 text-center text-[11px] text-slate-900/35">بالمتابعة أنت توافق على شروط الاستخدام وسياسة الخصوصية</p>
        </div>
      </div>
    </div>
  );
}
