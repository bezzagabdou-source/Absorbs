"use client";

import { ChevronDown, Cpu, Plus, Send, Square } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn, Spinner } from "./ui";

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  sending,
  disabled,
  modelLabel,
  onOpenModels,
  onNewSession,
  focusSignal = 0,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => Promise<boolean>;
  onStop: () => void;
  busy: boolean;
  sending: boolean;
  disabled?: boolean;
  modelLabel: string;
  onOpenModels: () => void;
  onNewSession: () => void;
  focusSignal?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focusSignal) return;
    const element = textareaRef.current;
    if (!element) return;
    element.focus();
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [focusSignal]);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const submit = async () => {
    const text = value.trim();
    if (!text || sending || busy || disabled) return;
    const ok = await onSend(text);
    if (ok) {
      onChange("");
      requestAnimationFrame(() => {
        resize();
        textareaRef.current?.focus();
      });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const canSend = value.trim().length > 0 && !sending && !disabled;

  return (
    <div className="shrink-0 border-t border-white/[0.06] bg-[#08090d]/95 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-3xl px-3 pb-[max(env(safe-area-inset-bottom),0.7rem)] pt-2 sm:px-6">
        <div className="flex items-end gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onNewSession}
            aria-label="محادثة جديدة"
            title="محادثة جديدة"
            className="mb-0.5 hidden size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-400 transition hover:bg-white/[0.07] hover:text-white sm:inline-flex"
          >
            <Plus className="size-4" />
          </button>

          <div
            className={cn(
              "min-w-0 flex-1 rounded-2xl border bg-white/[0.03] transition",
              focused
                ? "border-cyan-400/30 bg-white/[0.045] shadow-[0_0_0_3px_rgba(34,211,238,0.06)]"
                : "border-white/10",
            )}
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => {
                onChange(event.target.value);
                resize();
              }}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              rows={1}
              dir="auto"
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={20_000}
              placeholder={disabled ? "السيرفر غير متصل…" : "اكتب رسالة إلى OpenCode…"}
              aria-label="رسالة إلى OpenCode"
              className="block max-h-40 min-h-[42px] w-full resize-none bg-transparent px-3 pt-2.5 text-[16px] leading-6 text-slate-100 placeholder:text-slate-600 focus:outline-none sm:text-[13.5px]"
            />
            <div className="flex items-center gap-1 px-1.5 pb-1.5">
              <button
                type="button"
                onClick={onOpenModels}
                className="inline-flex min-w-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[10.5px] text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200"
                title="تغيير النموذج"
              >
                <Cpu className="size-3 shrink-0 text-cyan-400/70" />
                <span className="max-w-[42vw] truncate sm:max-w-[240px]">{modelLabel}</span>
                <ChevronDown className="size-2.5 shrink-0" />
              </button>
              <span className="ms-auto hidden text-[9.5px] text-slate-600 sm:inline">
                Enter للإرسال · Shift+Enter لسطر جديد
              </span>
              {value.length > 0 && (
                <span
                  className={cn(
                    "font-mono text-[9px] tabular-nums",
                    value.length > 18_000 ? "text-rose-400" : "text-slate-600",
                  )}
                >
                  {value.length.toLocaleString("en-US")}
                </span>
              )}
            </div>
          </div>

          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="إيقاف التوليد"
              title="إيقاف التوليد"
              className="mb-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-rose-400/25 bg-rose-500/15 text-rose-300 transition hover:bg-rose-500/25"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSend}
              aria-label="إرسال"
              title="إرسال"
              className={cn(
                "mb-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#e8946f] to-[#c4623f] text-white shadow-lg shadow-orange-950/25 transition",
                "hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none",
              )}
            >
              {sending ? <Spinner className="size-4" /> : <Send className="size-4 -scale-x-100" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
