import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTool, TOOLS } from "@/lib/tools";
import { PublicShell } from "@/components/public-shell";
import { siteUrl } from "@/lib/site";

type Props = { params: Promise<{ tool: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOLS.map((t) => ({ tool: t.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tool: id } = await params;
  const tool = getTool(id);
  if (!tool) return {};
  const title = `${tool.name.ar} — أداة مجانية بالدارجة والعربية`;
  const description = `${tool.desc.ar}. أداة مجانية بالدارجة والعربية والفرنسية من برق — جرّبها الآن بدون بطاقة.`;
  return {
    title,
    description,
    alternates: { canonical: `/tools/${tool.id}` },
    openGraph: { title, description, type: "website", locale: "ar_DZ" },
  };
}

const STEPS = [
  "أنشئ حسابًا مجانيًا في ثوانٍ (إيميل أو Google).",
  "املأ حقول الأداة بما تحتاجه، وبالدارجة إن أردت.",
  "اضغط توليد، واحصل على النتيجة جاهزة للنسخ والاستعمال.",
];

export default async function ToolPublicPage({ params }: Props) {
  const { tool: id } = await params;
  const tool = getTool(id) ?? notFound();

  const Icon = tool.icon;
  const others = TOOLS.filter((t) => t.id !== tool.id).slice(0, 6);
  const base = siteUrl();

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: `${tool.name.ar} — برق`,
        description: tool.desc.ar,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, Android, iOS",
        inLanguage: ["ar", "fr", "en"],
        url: `${base}/tools/${tool.id}`,
        offers: { "@type": "Offer", price: "0", priceCurrency: "DZD" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "الرئيسية", item: `${base}/` },
          { "@type": "ListItem", position: 2, name: "الأدوات", item: `${base}/tools` },
          {
            "@type": "ListItem",
            position: 3,
            name: tool.name.ar,
            item: `${base}/tools/${tool.id}`,
          },
        ],
      },
    ],
  };

  return (
    <PublicShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }}
      />
      <nav aria-label="breadcrumb" className="py-4 text-sm text-slate-500">
        <Link href="/" className="hover:text-slate-300">الرئيسية</Link>
        {" / "}
        <Link href="/tools" className="hover:text-slate-300">الأدوات</Link>
        {" / "}
        <span className="text-slate-300">{tool.name.ar}</span>
      </nav>

      <section className="glass rounded-3xl p-6 sm:p-10">
        <span className="mb-4 grid size-14 place-items-center rounded-2xl border border-white/10 bg-white/5 text-brand-300">
          <Icon className="size-7" aria-hidden />
        </span>
        <h1 className="text-3xl font-black text-white sm:text-4xl">
          {tool.name.ar} <span className="text-gradient">بالدارجة والعربية</span>
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-slate-300">
          {tool.desc.ar}. تعمل بالدارجة والعربية والفرنسية، ومجانية كل يوم.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/signup" className="btn-primary">جرّب الأداة مجانًا</Link>
          <Link href="/tools" className="btn-ghost">كل الأدوات</Link>
        </div>
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="glass rounded-2xl p-6">
          <h2 className="mb-3 text-xl font-bold text-white">كيف تعمل؟</h2>
          <ol className="list-decimal space-y-2 ps-5 text-slate-300">
            {STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
        <div className="glass rounded-2xl p-6">
          <h2 className="mb-3 text-xl font-bold text-white">ماذا تدخل؟</h2>
          <ul className="space-y-2 text-slate-300">
            {tool.fields.map((f) => (
              <li key={f.key} className="flex items-start gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-aqua-400" />
                <span>
                  {f.label.ar}
                  {f.required ? "" : " (اختياري)"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-xl font-bold text-white">أدوات أخرى</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((o) => (
            <li key={o.id}>
              <Link
                href={`/tools/${o.id}`}
                className="glass block rounded-xl p-4 text-slate-200 transition hover:border-white/20"
              >
                <span className="font-semibold">{o.name.ar}</span>
                <span className="mt-1 block text-sm text-slate-400">{o.desc.ar}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PublicShell>
  );
}
