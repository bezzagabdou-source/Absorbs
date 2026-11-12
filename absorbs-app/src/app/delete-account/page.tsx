import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "حذف الحساب والبيانات — Dz connect",
  description: "اطلب حذف حساب Dz connect وجميع بياناتك نهائيًا — من داخل التطبيق أو من هذه الصفحة.",
};

export default function DeleteAccountPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="glass rounded-[28px] p-6 sm:p-8">
        <p className="text-xs font-bold text-emerald-600">Dz connect</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">حذف الحساب والبيانات</h1>
        <p className="mt-2 text-[15px] leading-8 text-slate-900/70">
          يمكنك حذف حسابك نهائيًا في أي وقت. الحذف فوري من داخل التطبيق والموقع، ولا يمكن التراجع عنه.
        </p>

        <div className="mt-6 space-y-6 text-[15px] leading-8 text-slate-900/80">
          <section>
            <h2 className="font-black text-slate-900">الطريقة الأسرع — من داخل التطبيق</h2>
            <ol className="list-decimal space-y-1 ps-5">
              <li>افتح Dz connect وسجّل الدخول.</li>
              <li>اذهب إلى تبويب «حسابي» ← «حذف حسابي نهائيًا» (أو من الموقع: الملف الشخصي ← مركز الأمان ← حذف الحساب).</li>
              <li>أكّد الحذف — يُحذف الحساب مباشرة وتُسجَّل خروجك من كل الأجهزة.</li>
            </ol>
          </section>

          <section>
            <h2 className="font-black text-slate-900">ماذا يُحذف؟</h2>
            <ul className="list-disc space-y-1 ps-5">
              <li>ملفك الشخصي (الاسم، الصورة، السيرة) وبيانات تسجيل الدخول.</li>
              <li>منشوراتك وصورك وفيديوهاتك وقصصك وتعليقاتك وإعجاباتك.</li>
              <li>رسائلك ومحادثاتك ونقاطك وعضويات المجموعات.</li>
            </ul>
            <p className="mt-2">قد تبقى نسخ احتياطية تقنية مشفّرة لمدة أقصاها 30 يومًا ثم تُتلف تلقائيًا، ولا تُستخدم لأي غرض آخر.</p>
          </section>

          <section>
            <h2 className="font-black text-slate-900">لا تستطيع تسجيل الدخول؟</h2>
            <p>
              أرسل طلب حذف من البريد المسجّل في حسابك عبر صفحة المشروع الرسمية{" "}
              <a className="font-bold text-sky-600 underline" href="https://github.com/bezzagabdou-source/Absorbs/issues" target="_blank" rel="noreferrer">
                على GitHub
              </a>{" "}
              مع ذكر اسم المستخدم (@username)، وسننفّذ الحذف خلال 7 أيام عمل كحد أقصى بعد التحقق من ملكية الحساب.
            </p>
          </section>
        </div>

        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <Link href="/privacy" className="chip-sky rounded-full px-4 py-2 font-bold">سياسة الخصوصية</Link>
          <Link href="/terms" className="chip-mint rounded-full px-4 py-2 font-bold">شروط الاستخدام</Link>
          <Link href="/welcome" className="chip-amber rounded-full px-4 py-2 font-bold">العودة للرئيسية</Link>
        </div>
      </div>
    </main>
  );
}
