import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = {
  title: "سياسة الخصوصية",
  description: "كيف يجمع Nexus AI v8.4 بياناتك ويستعملها ويحميها.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PublicShell>
      <article className="glass mx-auto mt-6 max-w-3xl space-y-5 rounded-3xl p-6 leading-loose text-slate-300 sm:p-10">
        <h1 className="text-3xl font-black text-white">سياسة الخصوصية</h1>
        <p>نحترم خصوصيتك. هذه الصفحة تشرح ببساطة ما نجمعه ولماذا.</p>

        <h2 className="text-xl font-bold text-white">ما الذي نجمعه؟</h2>
        <ul className="list-disc space-y-1 ps-6">
          <li>بيانات الحساب: البريد الإلكتروني والاسم والصورة (عبر Firebase / Google).</li>
          <li>محتوى المحادثات ومخرجات الأدوات التي تُنشئها، لعرض سجلّك.</li>
          <li>عداد الاستعمال اليومي لإدارة النقاط المجانية.</li>
          <li>بيانات الدفع تعالجها Chargily Pay مباشرة، ولا نحتفظ ببيانات بطاقتك.</li>
        </ul>

        <h2 className="text-xl font-bold text-white">كيف نستعملها؟</h2>
        <p>
          لتشغيل الخدمة وتحسينها. يُرسَل نص طلبك (وأي ملفات ترفقها) إلى مزوّدي خدمات الذكاء الاصطناعي الخارجيين الذين نعتمد عليهم لتوليد الرد.
          لا نبيع بياناتك لأي طرف.
        </p>

        <h2 className="text-xl font-bold text-white">حذف بياناتك</h2>
        <p>
          يمكنك حذف أي محادثة من سجلّك. لحذف حسابك وكل بياناته راسلنا على
          البريد في أسفل الموقع.
        </p>

        <p className="text-sm text-slate-500">
          آخر تحديث: 2026. قد نحدّث هذه السياسة، وسننشر النسخة الجديدة هنا.
        </p>
      </article>
    </PublicShell>
  );
}
