"use client";

import { useEffect } from "react";
import {
  Brain,
  GraduationCap,
  Globe,
  ImagePlus,
  Lock,
  PanelRight,
  Paperclip,
  Play,
  Sparkles,
  Volume2,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatModeId } from "@/lib/chat-modes";

export type ToolMenuId = "image" | "upload" | "personal" | ChatModeId;

interface ToolEntry {
  id: ToolMenuId;
  title: string;
  sub: string;
  icon: LucideIcon;
}

const ENTRIES: readonly ToolEntry[] = [
  { id: "image", title: "إنشاء صور", sub: "صور واقعية جدًا بأقوى نماذج الصور", icon: ImagePlus },
  { id: "video", title: "الفيديوهات", sub: "مشاهد متحركة بالكود مع صوت وتحكم", icon: Play },
  { id: "music", title: "موسيقى", sub: "مقطوعات مولّدة تُشغَّل وتُحمَّل", icon: Volume2 },
  { id: "canvas", title: "Canvas", sub: "الترميز أو الكتابة أو إنشاء الشرائح", icon: PanelRight },
  { id: "research", title: "Deep Research", sub: "تقارير مفصّلة بمحاور وأدلة", icon: Globe },
  { id: "guided", title: "التعلّم الموجّه", sub: "شرح خطوة بخطوة مع تمارين", icon: GraduationCap },
  { id: "upload", title: "خيارات تحميل إضافية", sub: "صور وملفات PDF وكود", icon: Paperclip },
  { id: "personal", title: "الذكاء المخصّص", sub: "الذاكرة والسياق الخاصان بك", icon: Brain },
];

interface ToolsMenuProps {
  open: boolean;
  onClose: () => void;
  isPro: boolean;
  activeMode: ChatModeId | null;
  onSelect: (id: ToolMenuId) => void;
}

/** Bottom sheet with every creation tool. Free accounts see the lock and are sent to the upgrade page by the caller. */
export function ToolsMenu({ open, onClose, isPro, activeMode, onSelect }: ToolsMenuProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="أدوات الإنشاء"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-900 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 className="text-base font-black text-white">أدوات الإنشاء</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="grid h-10 w-10 place-items-center rounded-full text-slate-300 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="px-2 pb-2">
          {ENTRIES.map((e) => {
            const Icon = e.icon;
            const locked = !isPro && e.id !== "upload";
            const active = activeMode !== null && e.id === activeMode;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelect(e.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex min-h-16 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start transition active:scale-[0.99]",
                    active ? "bg-brand-500/15 ring-1 ring-brand-500/50" : "hover:bg-white/5"
                  )}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-800 text-brand-300">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold text-white">{e.title}</span>
                    <span className="block text-sm leading-snug text-slate-400">{e.sub}</span>
                  </span>
                  {locked ? (
                    <Lock className="h-4 w-4 shrink-0 text-slate-500" aria-label="Pro" />
                  ) : e.id === "personal" ? (
                    <Sparkles className="h-4 w-4 shrink-0 text-gold-400" aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
