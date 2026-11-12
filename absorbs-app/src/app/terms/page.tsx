import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "شروط الاستخدام وقواعد المجتمع — Dz connect",
  description: "شروط استخدام منصة Dz connect وقواعد المحتوى والسلوك والإشراف.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="glass rounded-[28px] p-6 sm:p-8">
        <p className="text-xs font-bold text-emerald-600">Dz connect</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">شروط الاستخدام وقواعد المجتمع</h1>
        <p className="mt-1 text-sm text-slate-900/50">بإنشاء حساب أو نشر أي محتوى على Dz connect أنت توافق على هذه الشروط كاملة.</p>

        <div className="mt-6 space-y-6 text-[15px] leading-8 text-slate-900/80">
          <section>
            <h2 className="font-black text-slate-900">1. الحساب والأهلية</h2>
            <p>يجب أن يكون عمرك 13 عامًا أو أكثر. أنت مسؤول عن نشاط حسابك وعن سرية كلمة المرور. يُمنع انتحال شخصية الآخرين أو إنشاء حسابات وهمية للاحتيال.</p>
          </section>

          <section>
            <h2 className="font-black text-slate-900">2. المحتوى المحظور نهائيًا</h2>
            <ul className="list-disc space-y-1 ps-5">
              <li>المحتوى الجنسي أو الإباحي، وأي محتوى يمسّ القاصرين بأي شكل — يُحذف فورًا ويُبلَّغ عنه للجهات المختصة عند الاقتضاء.</li>
              <li>خطاب الكراهية والتحريض على العنف أو التمييز ضد الأفراد أو الجماعات.</li>
              <li>التحرّش، التنمّر، التهديد، أو نشر بيانات شخصية للآخرين دون إذنهم.</li>
              <li>الاحتيال، البريد المزعج، الروابط الخبيثة، والمعلومات المضلّلة الخطيرة.</li>
              <li>المحتوى الذي ينتهك حقوق الملكية الفكرية للآخرين.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-black text-slate-900">3. الإشراف والإبلاغ والحظر</h2>
            <p>توفر المنصة داخل كل منشور وفي كل ملف شخصي أدوات للإبلاغ عن المحتوى والمستخدمين، وأداة لحظر أي مستخدم فورًا. يراجع فريق الإشراف البلاغات ويتخذ الإجراءات المناسبة: إزالة المحتوى، تحذير صاحبه، تعليق الحساب، أو حذفه نهائيًا عند التكرار أو الجسامة. يمكنك أيضًا الإبلاغ عن ردود Dz connect ai غير اللائقة من داخل المحادثة.</p>
          </section>

          <section>
            <h2 className="font-black text-slate-900">4. المحتوى المولّد بالذكاء الاصطناعي</h2>
            <p>Dz connect ai مساعد كتابي؛ أنت مسؤول عن مراجعة ما يولّده قبل نشره. يُمنع استعماله لإنتاج محتوى محظور بموجب القسم 2، وتُحفظ البلاغات لتحسين أنظمة السلامة.</p>
          </section>

          <section>
            <h2 className="font-black text-slate-900">5. محتواك وترخيصه</h2>
            <p>تبقى ملكية محتواك لك. بنشره تمنحنا ترخيصًا تقنيًا لعرضه وتوزيعه داخل المنصة فقط، وينتهي هذا الترخيص بحذف المحتوى أو الحساب.</p>
          </section>

          <section>
            <h2 className="font-black text-slate-900">6. إنهاء الخدمة</h2>
            <p>يمكنك حذف حسابك في أي وقت من داخل التطبيق أو الموقع. يمكننا تعليق أو حذف الحسابات المخالفة لهذه الشروط دون إشعار مسبق عند الضرورة لحماية المستخدمين.</p>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <Link href="/privacy" className="chip-sky rounded-full px-4 py-2 font-bold">سياسة الخصوصية</Link>
          <Link href="/delete-account" className="chip-amber rounded-full px-4 py-2 font-bold">حذف الحساب</Link>
          <Link href="/welcome" className="chip-mint rounded-full px-4 py-2 font-bold">العودة للرئيسية</Link>
        </div>
      </div>
    </main>
  );
}
