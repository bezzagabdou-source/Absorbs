import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { ReportForm } from "@/components/report-form";

export const metadata: Metadata = {
  title: "إبلاغ عن مشكلة",
  description: "أخبرنا بما حدث ليصلنا تقرير واضح مع معلومات تقنية تساعدنا على الإصلاح.",
  alternates: { canonical: "/report" },
};

export default function ReportPage() {
  return (
    <PublicShell>
      <div className="mx-auto mt-6 max-w-3xl rounded-3xl border border-white/10 bg-ink-900 p-6 sm:p-10">
        <h1 className="text-3xl font-black text-white">إبلاغ عن مشكلة</h1>
        <p className="mt-3 leading-loose text-slate-300">
          صف ما حدث بإيجاز. سيُفتح بريدك برسالة جاهزة إلى فريق الدعم، ويمكنك مراجعتها قبل الإرسال.
        </p>
        <ReportForm />
      </div>
    </PublicShell>
  );
}
