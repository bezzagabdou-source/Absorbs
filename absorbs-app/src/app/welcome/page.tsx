import Link from "next/link";
import { Heart, Images, MessageCircleHeart, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { InstallButton } from "@/components/pwa/install-button";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "مرحبًا بك" };

const FEATURES = [
  { icon: Zap, title: "حيّ لحظة بلحظة", text: "منشورات وإعجابات وتعليقات تصل فورًا بدون تحديث الصفحة" },
  { icon: MessageCircleHeart, title: "رسائل خاصة فورية", text: "ابحث بأي اسم مستخدم وابدأ محادثة خاصة تصل في نفس الثانية" },
  { icon: Images, title: "صور بجودة كاملة", text: "انشر لحظاتك بصور مضغوطة بذكاء وتُعرض بجمال على كل الشاشات" },
  { icon: ShieldCheck, title: "خصوصية محكمة", text: "صلاحيات Row Level Security: لا يرى أحد إلا ما يجب أن يراه" },
];

export default function WelcomePage() {
  return (
    <div className="aurora relative min-h-dvh overflow-hidden">
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <span className="logo-mark h-10 w-10 rounded-2xl text-base">A</span>
            <span className="text-lg font-black text-white">Absorbs</span>
          </span>
          <Link href="/login" className="glass rounded-full px-4 py-2 text-sm font-bold text-white transition hover:bg-white/10">
            تسجيل الدخول
          </Link>
        </header>

        <div className="stagger mt-12">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/15 px-3 py-1.5 text-xs font-bold text-fuchsia-200 ring-1 ring-fuchsia-400/25">
            <Sparkles className="h-3.5 w-3.5" /> شبكتك الاجتماعية… كما يجب أن تكون
          </p>
          <h1 className="mt-5 text-[42px] font-black leading-[1.2] text-white">
            تواصل، شارك،
            <span className="text-gradient block">وتألّق كل يوم</span>
          </h1>
          <p className="mt-4 text-[15px] leading-8 text-white/60">
            انشر صورك وأفكارك، تفاعل بإعجابات وتعليقات حيّة، وراسل أصدقاءك لحظيًا — كل ذلك بواجهة زجاجية داكنة فاخرة تعمل كتطبيق مثبت على هاتفك.
          </p>
        </div>

        <div className="stagger mt-8 grid grid-cols-2 gap-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass rounded-[24px] p-4">
              <f.icon className="h-6 w-6 text-violet-300" />
              <h2 className="mt-2.5 text-sm font-bold text-white">{f.title}</h2>
              <p className="mt-1 text-[11.5px] leading-5 text-white/50">{f.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-auto space-y-3 pt-10">
          <InstallButton />
          <Link href="/signup" className="btn-primary flex items-center justify-center gap-2 rounded-full py-4 text-base font-black text-white">
            <Heart className="h-5 w-5" /> إنشاء حساب مجاني
          </Link>
          <Link href="/login" className="glass flex items-center justify-center rounded-full py-4 text-base font-bold text-white transition hover:bg-white/[0.08]">
            لدي حساب — تسجيل الدخول
          </Link>
          <p className="pt-1 text-center text-[11px] text-white/35">بالمتابعة أنت توافق على شروط الاستخدام وسياسة الخصوصية</p>
        </div>
      </div>
    </div>
  );
}
