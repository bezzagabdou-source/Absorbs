"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Lock } from "lucide-react";
import {
  MODEL_CATALOG,
  PROVIDER_LABEL,
  isProProvider,
  type ModelOption,
  type ModelSelection,
  type ProviderId,
} from "@/lib/model-access";

export interface OrModel {
  id: string;
  name: string;
  free: boolean;
}

const ORDER: ProviderId[] = ["gemini", "huggingface", "grok", "openrouter"];

function ProBadge() {
  return (
    <span className="rounded-md bg-gradient-to-r from-amber-300 to-brand-400 px-1.5 py-[1px] text-[9px] font-black leading-4 tracking-wide text-ink-950">
      PRO
    </span>
  );
}

/**
 * Model dropdown for the chat composer.
 * Free accounts see a PRO badge next to Grok and OpenRouter; tapping one calls onLocked (upgrade modal).
 */
export function ModelSelector({
  value,
  isPro,
  orModels,
  onChange,
  onLocked,
}: {
  value: ModelSelection;
  isPro: boolean;
  /** full OpenRouter catalog (Pro only, loaded by the chat screen) */
  orModels: OrModel[];
  onChange: (s: ModelSelection) => void;
  onLocked: (o: ModelOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const curated = useMemo(() => new Set(MODEL_CATALOG.map((m) => `${m.provider}:${m.id}`)), []);
  const extra = useMemo(
    () => (isPro ? orModels.filter((m) => !curated.has(`openrouter:${m.id}`)) : []),
    [isPro, orModels, curated]
  );

  const current =
    MODEL_CATALOG.find((m) => m.provider === value.provider && m.id === (value.model ?? "auto")) ??
    (value.provider === "openrouter" && value.model
      ? { provider: "openrouter" as const, id: value.model, label: orModels.find((m) => m.id === value.model)?.name ?? value.model }
      : MODEL_CATALOG[0]);

  const pick = (o: ModelOption) => {
    if (!isPro && isProProvider(o.provider)) {
      setOpen(false);
      onLocked(o);
      return;
    }
    onChange({ provider: o.provider, model: o.id });
    setOpen(false);
  };

  const isActive = (o: { provider: ProviderId; id: string }) =>
    value.provider === o.provider && (value.model ?? "auto") === o.id;

  return (
    <div ref={box} className="relative shrink-0" dir="ltr">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="AI model"
        title="AI model"
        className="flex h-8 max-w-[132px] items-center gap-1 rounded-full border border-white/12 px-2.5 text-[11px] font-bold text-slate-300 outline-none transition hover:bg-white/8 focus-visible:border-aqua-300"
      >
        <span className="truncate">{current.label}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full start-0 z-50 mb-2 max-h-[min(70vh,26rem)] w-72 overflow-y-auto rounded-2xl border border-white/12 bg-ink-900 p-1.5 shadow-2xl shadow-black/50"
        >
          {ORDER.map((p) => {
            const items = MODEL_CATALOG.filter((m) => m.provider === p);
            const locked = !isPro && isProProvider(p);
            return (
              <div key={p} className="py-1">
                <div className="flex items-center gap-2 px-2.5 pb-1 pt-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <span>{PROVIDER_LABEL[p]}</span>
                  {locked && <ProBadge />}
                </div>
                {items.map((m) => (
                  <button
                    key={`${m.provider}:${m.id}`}
                    type="button"
                    role="option"
                    aria-selected={isActive(m)}
                    onClick={() => pick(m)}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-start text-[13px] transition hover:bg-white/8 ${
                      isActive(m) ? "bg-white/8 text-slate-50" : "text-slate-300"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate font-bold">{m.label}</span>
                    {m.hint && <span className="shrink-0 text-[10px] text-slate-500">{m.hint}</span>}
                    {locked ? <Lock className="h-3.5 w-3.5 shrink-0 text-amber-300" /> : isActive(m) ? <Check className="h-3.5 w-3.5 shrink-0 text-brand-300" /> : null}
                  </button>
                ))}
                {p === "openrouter" && extra.length > 0 && (
                  <details className="mt-0.5">
                    <summary className="cursor-pointer list-none rounded-xl px-2.5 py-2 text-[12px] font-bold text-aqua-300 hover:bg-white/8">
                      All OpenRouter models ({extra.length})
                    </summary>
                    <div className="max-h-56 overflow-y-auto">
                      {extra.map((m) => {
                        const o = { provider: "openrouter" as const, id: m.id, label: m.name };
                        return (
                          <button
                            key={m.id}
                            type="button"
                            role="option"
                            aria-selected={isActive(o)}
                            onClick={() => pick(o)}
                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-[12px] hover:bg-white/8 ${
                              isActive(o) ? "text-slate-50" : "text-slate-400"
                            }`}
                          >
                            <span className="min-w-0 flex-1 truncate">{m.name}</span>
                            {m.free && <span className="text-[10px] text-emerald-300">free</span>}
                          </button>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
