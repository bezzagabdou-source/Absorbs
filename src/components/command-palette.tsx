"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, MessagesSquare, LayoutGrid, Wand2, History, Crown, Settings, Sun, Headphones, CornerDownLeft, Clapperboard, FileText, Code2, Palette,
  type LucideIcon,
} from "lucide-react";
import { MAX_ENGINE_CONFIG } from "@/lib/max-engine";
import { applyTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type Cmd = { id: string; label: string; hint?: string; icon: LucideIcon | null; emoji?: string; run: () => void };

/** Ctrl/⌘ + K — jump anywhere, switch theme, start a MAX build. Also opens via the "barq:palette" event. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("barq:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("barq:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const cmds = useMemo<Cmd[]>(() => {
    const go = (href: string) => () => router.push(href);
    const prefill = (text: string) => () => {
      try {
        sessionStorage.setItem("barq_prefill", JSON.stringify({ text, tier: "max" }));
      } catch {
        /* private mode */
      }
      router.push("/app");
      setTimeout(() => window.dispatchEvent(new Event("barq:prefill")), 350);
    };
    const agent = (id: string) => () => {
      try {
        sessionStorage.setItem("nexus_open_mode", id);
      } catch {
        /* private mode */
      }
      router.push("/app");
      setTimeout(() => window.dispatchEvent(new Event("nexus:open-mode")), 350);
    };
    return [
      {
        id: "voice",
        label: "مكالمة صوتية مع Nexus AI v8.4",
        hint: "تكلّم فيرد بصوته",
        icon: Headphones,
        run: () => {
          router.push("/app");
          setTimeout(() => window.dispatchEvent(new Event("barq:voice-call")), 450);
        },
      },
      { id: "video", label: "استوديو الفيديو", hint: "أنشئ مقطعًا حقيقيًا", icon: Clapperboard, run: go("/app/studio/video") },
      { id: "workspace", label: "مساحة الملفات", hint: "PDF وكود وروابط", icon: FileText, run: go("/app/workspace") },
      { id: "agent-coder", label: "وكيل المبرمج", hint: "كود كامل", icon: Code2, run: agent("agent_coder") },
      { id: "agent-design", label: "وكيل المصمّم", hint: "واجهة جاهزة", icon: Palette, run: agent("agent_design") },
      { id: "agent-copy", label: "وكيل الكاتب الإعلاني", hint: "نصوص تبيع", icon: Wand2, run: agent("agent_copy") },
      { id: "agent-data", label: "وكيل محلّل البيانات", hint: "تحليل ورسوم", icon: LayoutGrid, run: agent("agent_data") },
      { id: "chat", label: "المحادثة", icon: MessagesSquare, run: go("/app") },
      { id: "tools", label: "الأدوات", icon: LayoutGrid, run: go("/app/tools") },
      { id: "studio", label: "الاستوديو", icon: Wand2, run: go("/app/studio") },
      { id: "history", label: "السجل", icon: History, run: go("/app/history") },
      { id: "upgrade", label: "V8 PRO GOLD", hint: "الترقية", icon: Crown, run: go("/app/upgrade") },
      { id: "settings", label: "الإعدادات", icon: Settings, run: go("/app/settings") },
      {
        id: "theme",
        label: "مظهر Lumen الفاتح",
        icon: Sun,
        run: () => applyTheme("lumen"),
      },
      ...MAX_ENGINE_CONFIG.starters.map((s) => ({
        id: `max-${s.label}`,
        label: `MAX · ${s.label}`,
        hint: "ابدأ بناء ضخم",
        icon: null,
        emoji: s.emoji,
        run: prefill(s.text),
      })),
    ];
  }, [router]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? cmds.filter((c) => `${c.label} ${c.hint ?? ""}`.toLowerCase().includes(s)) : cmds;
  }, [cmds, q]);

  useEffect(() => setIdx(0), [q]);

  if (!open) return null;

  const exec = (c?: Cmd) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/55 px-3 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="بحث سريع"
    >
      <div className="glass-deep w-full max-w-lg overflow-hidden rounded-3xl shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3">
          <Search className="h-4.5 w-4.5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                exec(list[idx]);
              }
            }}
            placeholder="ابحث عن صفحة أو أمر…"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-slate-500"
          />
          <kbd className="hidden rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] text-slate-400 sm:block" dir="ltr">Ctrl K</kbd>
        </div>
        <ul className="scroll-y max-h-[55vh] p-2" role="listbox">
          {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">لا نتائج</li>}
          {list.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === idx}>
              <button
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={() => exec(c)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm font-bold transition",
                  i === idx ? "bg-brand-500/20 text-[#fff]" : "text-slate-300"
                )}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.06]">
                  {c.icon ? <c.icon className="h-4 w-4" /> : <span aria-hidden>{c.emoji}</span>}
                </span>
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                {c.hint && <span className="shrink-0 text-[11px] font-medium text-slate-500">{c.hint}</span>}
                {i === idx && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

