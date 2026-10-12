"use client";

/**
 * NEXUS OTP FIELD · v18
 * ──────────────────────────────────────────────────────────────────────────
 * A big, unmistakable place to type a code. Built for real phones:
 *   • one box per digit, 64 px tall on desktop / 58 px on mobile, 30 px digits
 *   • numeric keypad on mobile, `autocomplete="one-time-code"` (iOS fills it)
 *   • paste the whole code anywhere — it distributes across the boxes
 *   • auto-advance, backspace returns, arrow keys move, Enter submits
 *   • shake + red ring on error, green ring on success, spinner while checking
 *   • fully keyboard accessible, one aria-label per box, RTL-safe (digits stay LTR)
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type OtpState = "idle" | "checking" | "error" | "done";

export interface OtpInputProps {
  /** number of digits — 6 by default */
  length?: number;
  value?: string;
  onChange?: (value: string) => void;
  /** fired when every box is filled (and after each edit that completes it) */
  onComplete?: (value: string) => void;
  state?: OtpState;
  disabled?: boolean;
  autoFocus?: boolean;
  /** "numeric" (default) or "alphanumeric" (activation codes with letters) */
  mode?: "numeric" | "alphanumeric";
  size?: "md" | "lg" | "xl";
  label?: string;
  hint?: string | null;
  error?: string | null | undefined;
  /** show a monospace / letter-spaced look — nice for promo codes */
  className?: string;
  "aria-describedby"?: string;
}

const SIZES: Record<NonNullable<OtpInputProps["size"]>, { box: string; text: string; gap: string }> = {
  md: { box: "h-12 w-11 sm:h-13 sm:w-12", text: "text-xl", gap: "gap-2" },
  lg: { box: "h-16 w-13 sm:h-[72px] sm:w-14", text: "text-[28px] sm:text-[32px]", gap: "gap-2.5 sm:gap-3" },
  xl: { box: "h-[72px] w-14 sm:h-20 sm:w-16", text: "text-[32px] sm:text-[40px]", gap: "gap-3" },
};

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  state = "idle",
  disabled = false,
  autoFocus = false,
  mode = "numeric",
  size = "lg",
  label,
  hint,
  error,
  className,
  ...aria
}: OtpInputProps) {
  const [internal, setInternal] = useState("");
  const digits = (value ?? internal).replace(/\s/g, "").slice(0, length);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const group = useRef<HTMLDivElement>(null);
  const id = useId();

  const set = useCallback(
    (next: string) => {
      if (value === undefined) setInternal(next);
      onChange?.(next);
      if (next.length === length) onComplete?.(next);
    },
    [length, onChange, onComplete, value]
  );

  const focusAt = useCallback(
    (i: number) => {
      const el = refs.current[Math.max(0, Math.min(length - 1, i))];
      el?.focus();
      el?.select();
    },
    [length]
  );

  useLayoutEffect(() => {
    if (autoFocus) focusAt(Math.min(digits.length, length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  const pattern = mode === "numeric" ? /\d/ : /[a-zA-Z0-9]/;
  const clean = useCallback(
    (raw: string) => (mode === "numeric" ? raw.replace(/\D/g, "") : raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()),
    [mode]
  );

  const handleChange = (i: number, raw: string) => {
    const chars = clean(raw);
    if (!chars) return;
    if (chars.length > 1) {
      // a fast paste inside a single box
      const merged = clean(digits + chars).slice(0, length);
      set(merged);
      focusAt(Math.min(merged.length, length - 1));
      return;
    }
    if (!pattern.test(chars)) return;
    const arr = digits.padEnd(length, " ").split("");
    arr[i] = chars;
    const next = arr.join("").replace(/\s+$/, "");
    set(next);
    if (i < length - 1) focusAt(i + 1);
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = clean(e.clipboardData.getData("text") ?? "");
    if (!text) return;
    e.preventDefault();
    const next = text.slice(0, length);
    set(next);
    focusAt(Math.min(next.length, length - 1));
  };

  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) {
        const arr = digits.split("");
        arr.splice(i, 1);
        set(arr.join(""));
      } else if (i > 0) {
        const arr = digits.split("");
        arr.splice(i - 1, 1);
        set(arr.join(""));
        focusAt(i - 1);
      }
      return;
    }
    if (e.key === "ArrowLeft" || (e.key === "ArrowRight" )) {
      e.preventDefault();
      focusAt(i + (e.key === "ArrowRight" ? 1 : -1));
      return;
    }
    if (e.key === "Delete") {
      e.preventDefault();
      const arr = digits.split("");
      arr.splice(i, 1);
      set(arr.join(""));
    }
  };

  const s = SIZES[size];
  const stateRing =
    state === "error"
      ? "border-rose-400/70 bg-rose-500/10 text-rose-600"
      : state === "done"
        ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-600"
        : "border-[var(--nx-line)] bg-[var(--nx-surface-2)] text-[var(--nx-text)]";
  const shake = state === "error" ? "animate-[nx-shake_.4s_ease]" : "";

  return (
    <div className={cn("w-full", className)} {...aria}>
      {label && (
        <label htmlFor={`${id}-0`} className="mb-2.5 block text-[13px] font-bold text-[var(--nx-text-soft)]">
          {label}
        </label>
      )}
      <div
        ref={group}
        dir="ltr"
        className={cn("flex items-center justify-center", s.gap, shake)}
        role="group"
        aria-label={label ?? "code"}
      >
        {Array.from({ length }).map((_, i) => {
          const ch = digits[i] ?? "";
          return (
            <input
              key={i}
              id={`${id}-${i}`}
              ref={(el) => {
                refs.current[i] = el;
              }}
              value={ch}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKey(i, e)}
              onPaste={handlePaste}
              onFocus={(e) => e.currentTarget.select()}
              disabled={disabled || state === "checking"}
              inputMode={mode === "numeric" ? "numeric" : "text"}
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={1}
              aria-label={`${label ?? "code"} — ${i + 1} من ${length}`}
              className={cn(
                "nx-otp rounded-2xl border text-center font-black tabular-nums",
                "caret-transparent outline-none transition-all duration-150",
                "focus:border-[var(--nx-accent)] focus:shadow-[0_0_0_4px_var(--nx-accent-soft)]",
                "disabled:cursor-not-allowed disabled:opacity-60",
                s.box,
                s.text,
                stateRing,
                !ch && "text-[var(--nx-muted)]"
              )}
            />
          );
        })}
        {state === "checking" && (
          <Loader2 className="ms-2 h-5 w-5 animate-spin text-[var(--nx-accent)]" aria-hidden />
        )}
        {state === "done" && <Check className="ms-2 h-6 w-6 text-emerald-400" aria-hidden />}
      </div>
      {(error || hint) && (
        <p
          className={cn(
            "mt-3 text-center text-[12.5px] font-semibold",
            error ? "text-rose-500" : "text-[var(--nx-muted)]"
          )}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * A ready-made "enter the code we just emailed you" panel: the big field,
 * a live countdown, a resend button and the state machine around them.
 * ────────────────────────────────────────────────────────────────────────── */

export function useCountdown(seconds: number, running: boolean) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (!running) return;
    setLeft(seconds);
    const id = window.setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [seconds, running]);
  const mm = Math.floor(left / 60);
  const ss = left % 60;
  return {
    left,
    label: `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`,
    done: left <= 0,
  };
}

export function OtpPanel({
  email,
  length = 6,
  mode = "numeric",
  title,
  subtitle,
  onVerify,
  onResend,
  onCancel,
  cooldown = 60,
}: {
  email: string;
  length?: number;
  mode?: "numeric" | "alphanumeric";
  title: string;
  subtitle?: string;
  onVerify: (code: string) => Promise<{ ok: boolean; error?: string }>;
  onResend: () => Promise<{ ok: boolean; error?: string }>;
  onCancel?: () => void;
  cooldown?: number;
}) {
  const [code, setCode] = useState("");
  const [state, setState] = useState<OtpState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(0);
  const cd = useCountdown(cooldown, sent > 0);
  const busy = state === "checking";

  const submit = async (v: string) => {
    if (busy || v.length !== length) return;
    setState("checking");
    setError(null);
    const r = await onVerify(v).catch(() => ({ ok: false, error: "تعذّر التحقق، حاول مرة أخرى" }));
    if (r.ok) {
      setState("done");
      setError(null);
    } else {
      setState("error");
      setError(r.error ?? "الرمز غير صحيح");
      setCode("");
    }
  };

  const resend = async () => {
    if (!cd.done && sent > 0) return;
    setError(null);
    setState("idle");
    setCode("");
    const r = await onResend().catch(() => ({ ok: false, error: "تعذّر الإرسال" }));
    setSent((n) => n + 1);
    if (!r.ok) setError(r.error ?? "تعذّر إرسال الرمز");
  };

  const hint = useMemo(() => {
    if (state === "error") return null;
    if (code.length && code.length < length) return `باقي ${length - code.length} أرقام`;
    return `أعد الإرسال بعد ${cd.label}`;
  }, [cd.label, code.length, length, state]);

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-[var(--nx-accent-line)] bg-[var(--nx-accent-soft)]">
          <ShieldCheck className="h-7 w-7 text-[var(--nx-accent)]" />
        </span>
        <h2 className="text-2xl font-black text-[var(--nx-text)]">{title}</h2>
        <p className="max-w-sm text-[13.5px] leading-relaxed text-[var(--nx-muted)]">
          {subtitle ?? (
            <>
              أرسلنا رمزاً من 6 أرقام إلى <b className="text-[var(--nx-text)]">{email}</b>
              <br />
              أدخله هنا لتأكيد أن هذا البريد لك.
            </>
          )}
        </p>
      </div>

      <OtpInput
        length={length}
        mode={mode}
        value={code}
        state={state}
        error={error}
        hint={hint}
        autoFocus
        onChange={(v) => {
          setCode(v);
          if (error) {
            setError(null);
            setState("idle");
          }
        }}
        onComplete={(v) => void submit(v)}
      />

      <div className="mt-7 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => void submit(code)}
          disabled={busy || code.length !== length}
          className="nx-btn nx-btn-primary nx-btn-lg w-full disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
          تأكيد الرمز
        </button>
        <div className="flex items-center gap-3 text-[13px]">
          <button
            type="button"
            onClick={() => void resend()}
            disabled={!cd.done && sent > 0}
            className="font-bold text-[var(--nx-accent)] transition hover:opacity-80 disabled:opacity-40"
          >
            أعد إرسال الرمز
          </button>
          {onCancel && (
            <>
              <span className="text-slate-600">·</span>
              <button type="button" onClick={onCancel} className="font-bold text-[var(--nx-muted)] transition hover:text-[var(--nx-text)]">
                تخطّي الآن
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
