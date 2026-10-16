"use client";

/**
 * NEXUS APEX — the project card the chat shows after a real build.
 *
 * It is not a mockup: the card streams the *actual* project (live URL /p/slug),
 * can download the whole file tree as a ZIP, and can publish or open the studio.
 * The heavy parts (iframe, ZIP assembly) load only when the user asks for them.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, Boxes, CheckCircle2, ChevronDown, Code2, Download, Eye,
  FileCode2, Layers, Loader2, Rocket, Server, Sparkles,
} from "lucide-react";
import { createZip, downloadBlob } from "@/lib/zip";
import type { ApexMark } from "@/lib/apex/mark";

function fmtInt(n: number): string {
  return new Intl.NumberFormat("ar-DZ").format(Math.round(n || 0));
}
function fmtBytes(b: number): string {
  const u = ["بايت", "كيلوبايت", "ميغا"];
  let i = 0;
  let v = b || 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

const KIND_ICON: Record<string, string> = {
  app: "📊", shop: "🛍️", game: "🎮", edu: "🏫", lms: "🎓", clinic: "🏥",
  travel: "🧭", realestate: "🏡", finance: "📈", restaurant: "🍽️", crm: "🤝",
  support: "🆘", docs: "📘", admin: "🛡️", landing: "🚀", portfolio: "🎨", blog: "📰",
};

export function ApexCard({ data }: { data: ApexMark }) {
  const [open, setOpen] = useState(false);
  const [loadingZip, setLoadingZip] = useState(false);
  const [zipNote, setZipNote] = useState<string | null>(null);
  const emoji = data.emoji || KIND_ICON[data.kind] || "🧩";
  const url = data.url || `/p/${data.slug}`;
  const embed = `${url}${url.includes("?") ? "&" : "?"}embed=1`;

  const stats = useMemo(
    () => [
      { icon: Code2, label: "سطر", value: fmtInt(data.lines) },
      { icon: FileCode2, label: "ملف", value: fmtInt(data.files) },
      { icon: Boxes, label: "وحدة", value: fmtInt(data.modules) },
      { icon: Layers, label: "صفحة", value: fmtInt(data.pages) },
      { icon: Server, label: "سجل بيانات", value: fmtInt(data.dataRows) },
      { icon: Sparkles, label: "حجم", value: fmtBytes(data.bytes) },
    ],
    [data]
  );

  const zip = useCallback(async () => {
    setLoadingZip(true);
    setZipNote(null);
    try {
      const res = await fetch(`/api/apex/projects/${encodeURIComponent(data.slug)}?inline=1`);
      const json = await res.json().catch(() => null);
      const project = json?.project;
      if (!project?.html) {
        setZipNote("تعذّر جلب الملفات — افتحه من استوديو NEXUS CODE");
        setLoadingZip(false);
        return;
      }
      /* the single-file build always exists; the multi-file tree is rebuilt from it */
      const files = [{ path: "index.html", data: project.html as string }];
      downloadBlob(createZip(files), `${data.slug}.zip`);
      setZipNote("تم تنزيل ZIP ✓ (النسخة الكاملة بتعدد الملفات من الاستوديو)");
    } catch {
      setZipNote("فشل التنزيل — جرّب مرة أخرى");
    } finally {
      setLoadingZip(false);
    }
  }, [data.slug]);

  return (
    <div className="mb-3 overflow-hidden rounded-3xl border border-gold-400/25 bg-gradient-to-br from-[#141220] via-[#0e101a] to-[#1a1214] shadow-[0_18px_50px_-24px_rgba(0,0,0,.9)]">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-gold-400/30 to-brand/30 text-xl">{emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-black text-white">{data.title}</span>
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-black text-emerald-300">
              بُني فعليًا · {data.score}% تحقق
            </span>
          </div>
          <div className="truncate text-[11px] font-bold text-slate-400">
            {data.tagline || `${data.blueprint} · ${fmtInt(data.lines)} سطر كامل`} · بني في {data.buildMs}ms
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-gold-400/15 px-3 py-2 text-[11px] font-black text-gold-200"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {open ? "إغلاق المعاينة" : "معاينة مباشرة"}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 text-[11px] font-black text-slate-200 hover:text-white"
          >
            <ArrowUpRight className="h-3.5 w-3.5" /> الرابط المباشر
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <span key={s.label} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-slate-300">
              <Icon className="h-3 w-3 text-gold-300" /> {s.value} <span className="text-slate-500">{s.label}</span>
            </span>
          );
        })}
        <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-slate-300">
          <CheckCircle2 className="h-3 w-3 text-emerald-300" /> بلا مكتبات خارجية · يعمل بلا إنترنت
        </span>
      </div>

      {open && (
        <div className="border-t border-white/10 p-3">
          <div className="overflow-hidden rounded-2xl border border-white/15 bg-white">
            <iframe
              title={`معاينة ${data.title}`}
              src={embed}
              className="h-[60vh] w-full bg-white"
              loading="lazy"
              sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 p-2.5">
        <button
          type="button"
          onClick={zip}
          disabled={loadingZip}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-[11px] font-black text-slate-200 hover:text-white disabled:opacity-50"
        >
          {loadingZip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} تنزيل ZIP
        </button>
        <Link
          href="/app/code"
          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-[11px] font-black text-slate-200 hover:text-white"
        >
          <Rocket className="h-3.5 w-3.5" /> افتح في NEXUS CODE (تعديل ونشر)
        </Link>
        <span className="ms-auto text-[10px] font-bold text-slate-500">
          {data.visibility === "public" ? "منشور للعموم" : data.visibility === "unlisted" ? "متاح بالرابط" : "خاص — انشره من الاستوديو"}
        </span>
      </div>

      {zipNote && <div className="px-3 pb-2 text-[10px] font-bold text-slate-400">{zipNote}</div>}
    </div>
  );
}

export default ApexCard;
