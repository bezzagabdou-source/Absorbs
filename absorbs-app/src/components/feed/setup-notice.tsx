import Link from "next/link";
import { DatabaseZap, ExternalLink } from "lucide-react";

/** Shown when Supabase answers "table/function does not exist" (schema.sql not executed yet). */
export function SetupNotice() {
  return (
    <div className="glass animate-fade-up rounded-[28px] border-amber-300/20 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
          <DatabaseZap className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-bold text-amber-100">خطوة واحدة تفصلك عن التشغيل الكامل</h2>
          <p className="mt-1 text-sm leading-6 text-white/65">
            قاعدة البيانات متصلة، لكن الجداول غير منشأة بعد. نفّذ ملف{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12px] text-amber-200" dir="ltr">
              supabase/schema.sql
            </code>{" "}
            مرة واحدة من لوحة Supabase (SQL Editor → لصق → Run) وستعمل المنشورات والإعجابات والرسائل لحظيًا.
          </p>
          <Link
            href="https://supabase.com/dashboard/project/mcgnmjnzibjtjazcmwkd/sql/new"
            target="_blank"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-4 py-2 text-sm font-bold text-amber-200 ring-1 ring-amber-300/25 transition hover:bg-amber-400/25"
          >
            فتح SQL Editor <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
