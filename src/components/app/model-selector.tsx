"use client";

/**
 * Nexus AI v12 — the model picker.
 *
 * Exactly 16 models: 8 free, 8 Pro. No raw provider dump, no duplicates.
 * Every row states what the model is for and how fast it is, so the choice is
 * informed instead of a guess.
 */
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Crown, Lock, Sparkles } from "lucide-react";
import type { ModelOption, ModelSelection } from "@/lib/model-access";
import {
  FREE_MODELS_V12,
  PRO_MODELS_V12,
  SPEED_META,
  fromSelection,
  saveModelKey,
  toSelection,
  type Model12,
} from "@/lib/models-v12";
import { cn } from "@/lib/utils";

export interface OrModel {
  id: string;
  name: string;
  free: boolean;
}

function Bars({ m }: { m: Model12 }) {
  const meta = SPEED_META[m.speed];
  return (
    <span
      className="v12-bars flex-none"
      data-on={meta.bars}
      style={{ color: meta.tone }}
      title={`${meta.label} — ${meta.note}`}
    >
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function Row({
  m,
  active,
  locked,
  onPick,
}: {
  m: Model12;
  active: boolean;
  locked: boolean;
  onPick: () => void;
}) {
  const meta = SPEED_META[m.speed];
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex w-full items-start gap-3 px-3.5 py-2.5 text-start transition",
        active ? "bg-[rgba(217,119,87,0.14)]" : "hover:bg-white/[0.06]",
        locked && "opacity-60"
      )}
    >
      <span className="mt-0.5 flex-none">
        {active ? (
          <Check className="h-4 w-4 text-[var(--v12-accent-2)]" />
        ) : locked ? (
          <Lock className="h-4 w-4 text-[var(--v12-faint)]" />
        ) : (
          <span className="block h-4 w-4 rounded-full border border-white/15" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-semibold text-[var(--v12-text)]">
            {m.label}
          </span>
          {m.flagship && <Sparkles className="h-3 w-3 flex-none text-[var(--v12-gold)]" />}
        </span>
        <span className="mt-0.5 block truncate text-[11.5px] leading-snug text-[var(--v12-faint)]">
          {m.blurb}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-medium" style={{ color: meta.tone }}>
            {meta.label}
          </span>
          <span className="text-[10px] text-[var(--v12-faint)]">· {m.ctxK}k سياق</span>
        </span>
      </span>

      <Bars m={m} />
    </button>
  );
}

export function ModelSelector({
  value,
  isPro,
  onChange,
  onLocked,
}: {
  value: ModelSelection;
  isPro: boolean;
  /** kept for call-site compatibility — v12 no longer shows the raw catalog */
  orModels?: OrModel[];
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

  const current = fromSelection(value) ?? FREE_MODELS_V12[0];

  const pick = (m: Model12) => {
    if (m.plan === "pro" && !isPro) {
      onLocked({ provider: m.provider, id: m.model, label: m.label, hint: m.blurb });
      return;
    }
    saveModelKey(m.key);
    onChange(toSelection(m));
    setOpen(false);
  };

  return (
    <div ref={box} className="relative min-w-0 shrink">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-auto min-w-0 max-w-[88px] shrink items-center gap-1.5 rounded-full sm:max-w-[150px] lg:max-w-[210px] border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[12.5px] font-medium text-[var(--v12-text)] transition hover:bg-white/[0.09]"
      >
        <Bars m={current} />
        <span className="hidden truncate xs:inline sm:inline">{current.label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 flex-none transition", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className="v12-card v12-in absolute bottom-full z-50 mb-2 max-h-[62vh] w-[330px] overflow-y-auto"
          style={{ insetInlineStart: 0 }}
        >
          <div className="sticky top-0 z-10 bg-[rgba(26,25,30,0.94)] px-3.5 py-2.5 backdrop-blur">
            <p className="text-[11px] font-bold tracking-wide text-[var(--v12-faint)]">
              مجاني — {FREE_MODELS_V12.length} نماذج
            </p>
          </div>
          {FREE_MODELS_V12.map((m) => (
            <Row
              key={m.key}
              m={m}
              active={m.key === current.key}
              locked={false}
              onPick={() => pick(m)}
            />
          ))}

          <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-[rgba(26,25,30,0.94)] px-3.5 py-2.5 backdrop-blur">
            <Crown className="h-3 w-3 text-[var(--v12-gold)]" />
            <p className="text-[11px] font-bold tracking-wide text-[var(--v12-faint)]">
              Pro — {PRO_MODELS_V12.length} نماذج
            </p>
            {!isPro && (
              <span className="v12-chip v12-chip-pro ms-auto !px-2 !py-0.5 !text-[9.5px]">مقفولة</span>
            )}
          </div>
          {PRO_MODELS_V12.map((m) => (
            <Row
              key={m.key}
              m={m}
              active={m.key === current.key}
              locked={!isPro}
              onPick={() => pick(m)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
