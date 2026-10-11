import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = {
  title: "شروط الاستخدام",
  description: "شروط استخدام خدمة Nexus AI v8.4.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <PublicShell>
      <article className="glass mx-auto mt-6 max-w-3xl space-y-5 rounded-3xl p-6 leading-loose text-slate-300 sm:p-10">
        <h1 className="text-3xl font-black text-white">شروط الاستخدام</h1>
        <p>باستعمالك Nexus AI v8.4 فإنك توافق على الشروط التالية.</p>

        <h2 className="text-xl font-bold text-white">الاستعمال المقبول</h2>
        <ul className="list-disc space-y-1 ps-6">
          <li>لا تستعمل الخدمة في محتوى غير قانوني أو مسيء أو مضلّل.</li>
          <li>لا تحاول تجاوز حدود الاستعمال أو إساءة استغلال الخدمة.</li>
        </ul>

        <h2 className="text-xl font-bold text-white">مخرجات الذكاء الاصطناعي</h2>
        <p>
          قد تحتوي الردود على أخطاء. راجعها قبل الاعتماد عليها، خصوصًا في
          المواضيع القانونية والطبية والمالية.
        </p>

        <h2 className="text-xl font-bold text-white">الاشتراك والدفع</h2>
        <p>
          يمنحك اشتراك Pro حدًا يوميًا أعلى طوال مدته. يتم الدفع عبر Chargily
          Pay، وتُفعَّل الترقية تلقائيًا بعد تأكيد الدفع.
        </p>

        <h2 className="text-xl font-bold text-white">إخلاء المسؤولية</h2>
        <p>تُقدَّم الخدمة كما هي، وقد نغيّر الميزات أو الأسعار مع إشعار مسبق.</p>
      </article>
    </PublicShell>
  );
}
