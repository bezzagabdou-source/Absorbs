import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "سياسة الخصوصية — Dz connect",
  description: "كيف تجمع منصة وتطبيق Dz connect بياناتك وتستخدمها وتحميها.",
};

const UPDATED = "11 نوفمبر 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="glass rounded-[28px] p-6 sm:p-8">
        <p className="text-xs font-bold text-emerald-600">Dz connect</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">سياسة الخصوصية</h1>
        <p className="mt-1 text-sm text-slate-900/50">آخر تحديث: {UPDATED}</p>

        <div className="mt-6 space-y-6 text-[15px] leading-8 text-slate-900/80">
          <section>
            <h2 className="font-black text-slate-900">1. البيانات التي نجمعها</h2>
            <ul className="list-disc space-y-1 ps-5">
              <li><b>بيانات الحساب:</b> البريد الإلكتروني، اسم المستخدم، الاسم المعروض، الصورة الشخصية والسيرة الذاتية التي تضيفها.</li>
              <li><b>المحتوى الذي تنشره:</b> المنشورات، الصور والفيديوهات، القصص، التعليقات، الإعجابات، والرسائل داخل المنصة.</li>
              <li><b>بيانات تقنية:</b> نوع الجهاز والمتصفح، وسجلات أخطاء أساسية لازمة لتشغيل الخدمة وحمايتها.</li>
              <li><b>محادثات Dz connect ai:</b> النصوص التي ترسلها للمساعد تُعالج لتوليد الرد ولا تُباع لأي طرف ثالث.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-black text-slate-900">2. كيف نستخدم بياناتك</h2>
            <p>لتشغيل حسابك وعرض المحتوى، وتمكين التواصل بين المستخدمين، وتحسين المنشورات عبر Dz connect ai عند طلبك، وحماية المنصة من الإساءة والاحتيال، وإرسال إشعارات متعلقة بحسابك. لا نبيع بياناتك الشخصية ولا نستخدمها للإعلانات المستهدفة.</p>
          </section>

          <section>
            <h2 className="font-black text-slate-900">3. التخزين والأمان</h2>
            <p>تُخزَّن البيانات لدى Supabase (قاعدة بيانات وقائع تخزين ملفات) وتُقدَّم الخدمة عبر Vercel. كلمات المرور مشفّرة ولا تصلنا بصيغتها الأصلية أبدًا. جميع الاتصالات عبر HTTPS، وتحمي قواعد Row Level Security كل جدول بحيث لا يرى أي مستخدم إلا ما يحق له رؤيته.</p>
          </section>

          <section>
            <h2 className="font-black text-slate-900">4. المشاركة مع أطراف ثالثة</h2>
            <p>نعتمد على مزوّدي بنية تحتية فقط: Supabase (قاعدة البيانات والتخزين والمصادقة)، Vercel (الاستضافة)، ومزوّد ذكاء اصطناعي لمعالجة طلبات Dz connect ai. لا نشارك بياناتك لأغراض تسويقية.</p>
          </section>

          <section>
            <h2 className="font-black text-slate-900">5. الاحتفاظ والحذف</h2>
            <p>نحتفظ ببياناتك طوال مدة نشاط حسابك. عند حذف الحساب تُحذف بياناتك الشخصية ومحتواك نهائيًا من قواعد البيانات، وقد تبقى نسخ احتياطية تقنية حتى 30 يومًا قبل إتلافها تلقائيًا. يمكنك طلب الحذف من داخل التطبيق (حسابي ← حذف حسابي نهائيًا) أو عبر صفحة <Link href="/delete-account" className="font-bold text-sky-600 underline">حذف الحساب</Link>.</p>
          </section>

          <section>
            <h2 className="font-black text-slate-900">6. الأطفال</h2>
            <p>المنصة موجّهة لمن هم في سن 13 عامًا أو أكثر، ولا نجمع عمدًا بيانات أطفال دون هذا السن؛ عند اكتشاف حساب مخالف يُحذف فورًا.</p>
          </section>

          <section>
            <h2 className="font-black text-slate-900">7. حقوقك</h2>
            <p>يمكنك في أي وقت: تعديل ملفك الشخصي، تنزيل بياناتك بمراسلتنا، حظر أي مستخدم، الإبلاغ عن أي محتوى، وحذف حسابك نهائيًا. للتواصل بشأن الخصوصية: عبر صفحة المشروع الرسمية على GitHub أو من داخل التطبيق.</p>
          </section>

          <section>
            <h2 className="font-black text-slate-900">8. تغييرات السياسة</h2>
            <p>قد نحدّث هذه السياسة عند إضافة ميزات جديدة؛ سنعرض التحديثات على هذه الصفحة مع تاريخها، واستمرارك في الاستخدام يعني قبولها.</p>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <Link href="/terms" className="chip-sky rounded-full px-4 py-2 font-bold">شروط الاستخدام</Link>
          <Link href="/delete-account" className="chip-amber rounded-full px-4 py-2 font-bold">حذف الحساب</Link>
          <Link href="/welcome" className="chip-mint rounded-full px-4 py-2 font-bold">العودة للرئيسية</Link>
        </div>
      </div>
    </main>
  );
}
