import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { ActivityPanel } from "@/components/activity-panel";

export const metadata: Metadata = {
  title: "نشاط النظام والسرعة",
  description: "حالة الذكاء الاصطناعي وزمن الاستجابة واتصالك الحالي.",
  alternates: { canonical: "/activity" },
};

export default function ActivityPage() {
  return (
    <PublicShell>
      <div className="mx-auto mt-6 max-w-3xl rounded-3xl border border-white/10 bg-ink-900 p-6 sm:p-10">
        <h1 className="text-3xl font-black text-white">نشاط النظام والسرعة</h1>
        <p className="mt-3 leading-loose text-slate-300">
          فحص مباشر يُحدَّث كل 30 ثانية. القياسات تُجرى من جهازك إلى خادمنا.
        </p>
        <ActivityPanel />
      </div>
    </PublicShell>
  );
}
