"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, Clapperboard, Code2, FileText, ImageOff, Crown, Gamepad2, LayoutTemplate, Palette, PenTool, Smartphone, Trash2, Wand2 } from "lucide-react";
import { useCredits } from "@/components/app/app-shell";
import { GamePreview } from "@/components/game-preview";
import { useAuth } from "@/lib/auth-context";

type Item = { id: string; title: string; html: string };

const CREATE = [
  { id: "landing-builder", label: "صفحة هبوط", Icon: LayoutTemplate },
  { id: "ui-designer", label: "واجهة تطبيق", Icon: Smartphone },
  { id: "wallpaper-designer", label: "خلفية متحركة", Icon: Palette },
  { id: "logo-designer", label: "شعار", Icon: PenTool },
  { id: "game-builder", label: "لعبة", Icon: Gamepad2 },
] as const;

export default function StudioPage() {
  const { profile } = useCredits();
  const isPro = profile?.plan === "pro";
  const { authFetch } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await authFetch("/api/projects");
        let list: Item[] = r.ok ? ((await r.json()) as { projects: Item[] }).projects : [];
        // one-time move of the old on-device gallery into the database
        if (r.ok && list.length === 0) {
          try {
            const old: { title: string; html: string }[] = JSON.parse(localStorage.getItem("barq_gallery") ?? "[]");
            for (const o of old.slice(0, 12)) {
              await authFetch("/api/projects", { method: "POST", body: JSON.stringify({ title: o.title, html: o.html }) });
            }
            if (old.length) {
              localStorage.removeItem("barq_gallery");
              const r2 = await authFetch("/api/projects");
              if (r2.ok) list = ((await r2.json()) as { projects: Item[] }).projects;
            }
          } catch {
            /* nothing to move */
          }
        }
        if (alive) setItems(list);
      } catch {
        /* offline */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authFetch]);

  const remove = async (id: string) => {
    setItems((l) => l.filter((i) => i.id !== id));
    if (open?.id === id) setOpen(null);
    await authFetch(`/api/projects?id=${id}`, { method: "DELETE" }).catch(() => undefined);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-3xl font-black text-white sm:text-4xl">
            <Wand2 className="h-8 w-8 text-gold-400" />
            الاستوديو
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
            اصنع صفحات وواجهات وألعابًا وخلفيات وشعارات، جرّبها على الهاتف والحاسوب، واحفظ أفضلها هنا.
          </p>
        </div>
        <Link href="/app/studio/build" className="btn-primary px-5 py-2.5 text-sm">
          <Code2 className="h-4 w-4" />
          محرك البناء الحي
        </Link>
        {!isPro && (
          <Link href="/app/upgrade" className="btn-primary px-5 py-2.5 text-sm">
            <Crown className="h-4 w-4" />
            فعّل Pro
          </Link>
        )}
      </header>

      <Link
        href="/app/arcade"
        className="gold-border group relative mb-6 flex min-w-0 items-center gap-4 overflow-hidden rounded-3xl p-5 transition active:scale-[0.99]"
      >
        <span className="pro-shine grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-gold-200 via-gold-400 to-gold-600 text-[#2a1700]">
          <Gamepad2 className="h-7 w-7" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="gold-text block text-lg font-black">الأركيد: عاصفة Nexus</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-300">
            لعبة كاملة بمراحل وزعماء وقوى خاصة. العبها الآن وحطّم رقمك القياسي.
          </span>
        </span>
        <ChevronLeft className="h-5 w-5 shrink-0 text-gold-300 transition group-hover:-translate-x-1" />
      </Link>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Link href="/app/studio/video" className="neo-panel group flex items-center gap-4 rounded-3xl p-5 transition active:scale-[0.99]">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500/40 to-gold-300/25 text-gold-300">
            <Clapperboard className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-black text-white">استوديو الفيديو</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">مقاطع حقيقية بنموذج فيديو مع تحسين الوصف</span>
          </span>
          <ChevronLeft className="h-5 w-5 shrink-0 text-gold-300 transition group-hover:-translate-x-1" />
        </Link>
        <Link href="/app/workspace" className="neo-panel group flex items-center gap-4 rounded-3xl p-5 transition active:scale-[0.99]">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500/40 to-gold-300/25 text-gold-300">
            <FileText className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-black text-white">مساحة الملفات</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">اسأل عن PDF وكود وصور وروابط معًا</span>
          </span>
          <ChevronLeft className="h-5 w-5 shrink-0 text-gold-300 transition group-hover:-translate-x-1" />
        </Link>
      </div>

      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {CREATE.map(({ id, label, Icon }) => (
          <Link
            key={id}
            href={`/app/tools/${id}`}
            className="pro-card group flex flex-col items-center gap-3 rounded-2xl p-5 text-center"
          >
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand-500/35 to-gold-300/25 text-gold-300 transition group-hover:scale-110">
              <Icon className="h-6 w-6" />
            </span>
            <span className="text-sm font-black text-white">{label}</span>
          </Link>
        ))}
        <div
          aria-disabled="true"
          className="flex cursor-not-allowed flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-5 text-center opacity-80"
        >
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/[0.06] text-slate-400">
            <ImageOff className="h-6 w-6" />
          </span>
          <span className="text-sm font-black text-white">مولّد الصور</span>
          <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[11px] font-bold text-orange-300">غير متوفر حاليًا</span>
        </div>
      </div>

      <h2 className="mb-4 text-sm font-black text-slate-300">أعمالي المحفوظة ({items.length})</h2>
      {loading ? (
        <div className="shimmer-line h-40 rounded-2xl" />
      ) : items.length === 0 ? (
        <p className="glass rounded-2xl p-8 text-center text-sm text-slate-400">
          لا توجد أعمال بعد. أنشئ شيئًا ثم اضغط «حفظ» فوق المعاينة.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div key={it.id} className="glass overflow-hidden rounded-2xl">
              <button type="button" onClick={() => setOpen(it)} className="relative block h-40 w-full overflow-hidden bg-black text-start">
                <iframe
                  title={it.title}
                  srcDoc={it.html}
                  sandbox=""
                  tabIndex={-1}
                  className="pointer-events-none h-[640px] w-[1280px] origin-top-left scale-[0.3] rtl:origin-top-right"
                />
              </button>
              <div className="flex items-center justify-between gap-2 p-3">
                <p className="truncate text-sm font-black text-white">{it.title}</p>
                <button type="button" aria-label="حذف" onClick={() => void remove(it.id)} className="text-slate-500 hover:text-rose-300">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-8">
          <GamePreview html={open.html} height={560} />
        </div>
      )}
    </div>
  );
}
