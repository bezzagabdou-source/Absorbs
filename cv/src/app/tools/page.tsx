import type { Metadata } from "next";
import Link from "next/link";
import { TOOLS } from "@/lib/tools";
import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = {
  title: "أدوات الكتابة والمحتوى بالدارجة والعربية — مجانًا",
  description:
    "10 أدوات جاهزة: وصف منتجات، منشورات تسويقية، ترجمة الدارجة، تلخيص، سيرة ذاتية، إيميلات، مساعد باك وأكثر. جرّب مجانًا كل يوم.",
  alternates: { canonical: "/tools" },
};

export default function ToolsIndex() {
  return (
    <PublicShell>
      <div className="py-10 text-center">
        <h1 className="text-3xl font-black text-white sm:text-4xl">
          أدوات الكتابة والمحتوى <span className="text-gradient">بالدارجة والعربية</span>
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-slate-400">
          أدوات جاهزة للتجار والطلبة وأصحاب المشاريع. اختر الأداة، املأ الحقول،
          واحصل على النتيجة في ثوانٍ — مجانًا كل يوم.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <li key={tool.id}>
              <Link
                href={`/tools/${tool.id}`}
                className="glass block h-full rounded-2xl p-5 transition hover:border-white/20"
              >
                <span className="mb-3 grid size-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-brand-300">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h2 className="text-lg font-bold text-white">{tool.name.ar}</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">
                  {tool.desc.ar}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </PublicShell>
  );
}
