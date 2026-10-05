import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = {
  title: "المساعدة والإنعاش",
  description: "حلول سريعة لأشهر المشاكل: الرد البطيء، الدخول، المحادثات، التثبيت على الهاتف.",
  alternates: { canonical: "/help" },
};

const FIXES: { q: string; steps: string[] }[] = [
  {
    q: "المساعد لا يرد أو يتوقف في منتصف الإجابة",
    steps: [
      "افتح صفحة نشاط النظام وتأكد أن حالة الذكاء الاصطناعي «يعمل».",
      "أعد إرسال الرسالة نفسها؛ الطلبات الطويلة تُستأنف تلقائيًا من حيث توقفت.",
      "إن استمر الخلل، قسّم الطلب إلى جزأين أو اذكر اسم الملف الذي تريد إكماله.",
    ],
  },
  {
    q: "لا أستطيع تسجيل الدخول",
    steps: [
      "تأكد من اتصال الإنترنت ثم أعد تحميل الصفحة.",
      "جرّب طريقة الدخول التي أنشأت بها الحساب (Google أو البريد).",
      "افتح الموقع في نافذة عادية بدل الخاصة، وعطّل مانع الإعلانات لهذا الموقع.",
    ],
  },
  {
    q: "اختفت محادثة أو ذاكرة سابقة",
    steps: [
      "تحقق من سجلّ المحادثات داخل التطبيق، فهو يحفظ كل محادثة مرتبطة بحسابك.",
      "افتح الذاكرة والسياق لمراجعة ما يحفظه المساعد عنك أو تعديله.",
      "تأكد أنك مسجّل بالحساب نفسه الذي استعملته سابقًا.",
    ],
  },
  {
    q: "الواجهة بطيئة أو تبدو مكسورة على الهاتف",
    steps: [
      "أغلق التطبيق تمامًا ثم افتحه من جديد لتحميل آخر نسخة.",
      "امسح بيانات الموقع من إعدادات المتصفح ثم سجّل الدخول مجددًا.",
      "إن كان مثبّتًا كتطبيق، احذفه وثبّته من جديد من المتصفح.",
    ],
  },
];

export default function HelpPage() {
  return (
    <PublicShell>
      <article className="mx-auto mt-6 max-w-3xl space-y-5">
        <header className="rounded-3xl border border-white/10 bg-ink-900 p-6 sm:p-10">
          <h1 className="text-3xl font-black text-white">المساعدة والإنعاش</h1>
          <p className="mt-3 leading-loose text-slate-300">
            إذا تعطّل شيء، جرّب الحلول أدناه بالترتيب. معظم المشاكل تُحل في أقل من دقيقة.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/activity" className="btn-primary !px-4 !py-2 text-sm">
              فحص حالة النظام
            </Link>
            <Link href="/report" className="btn-ghost !px-4 !py-2 text-sm">
              إبلاغ عن مشكلة
            </Link>
          </div>
        </header>

        {FIXES.map((f) => (
          <section key={f.q} className="rounded-3xl border border-white/10 bg-ink-900 p-6 sm:p-8">
            <h2 className="text-lg font-bold text-white">{f.q}</h2>
            <ol className="mt-3 list-decimal space-y-2 ps-6 leading-loose text-slate-300">
              {f.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ))}

        <p className="px-2 text-sm leading-loose text-slate-400">
          لم تجد حلًا؟ راسلنا على{" "}
          <a href="mailto:contact@barq-ai.com" className="text-brand-300 underline underline-offset-4">
            contact@barq-ai.com
          </a>{" "}
          وأرفق وصفًا للمشكلة.
        </p>
      </article>
    </PublicShell>
  );
}
