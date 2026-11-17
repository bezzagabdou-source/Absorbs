"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ───────────────────────── شبكة ───────────────────────── */

export type ApiError = { error?: string; ok?: boolean };

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    if (typeof window !== "undefined" && !location.pathname.startsWith("/admin/login")) {
      location.href = "/admin/login";
    }
    throw new Error("انتهت الجلسة — سجّل الدخول من جديد");
  }
  const json = (await res.json().catch(() => ({}))) as T & ApiError;
  if (!res.ok || json.ok === false) throw new Error(json.error || `خطأ ${res.status}`);
  return json;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, { cache: "no-store" });
  return handle<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, {
    method: "POST",
    headers: body instanceof FormData ? undefined : { "content-type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
  });
  return handle<T>(res);
}

export function useApi<T>(path: string | null): {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    setLoading(true);
    setError(null);
    apiGet<T>(path)
      .then((d) => {
        if (alive && mounted.current) setData(d);
      })
      .catch((e: Error) => {
        if (alive && mounted.current) setError(e.message);
      })
      .finally(() => {
        if (alive && mounted.current) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, tick]);

  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}

/* ───────────────────────── تنبيهات ───────────────────────── */

type ToastItem = { id: number; message: string; type: "ok" | "err" };

export function toast(message: string, type: "ok" | "err" = "ok"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("chinwi-toast", { detail: { message, type } }));
}

export function Toaster(): React.ReactElement {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; type: "ok" | "err" }>).detail;
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev, { id, message: detail.message, type: detail.type }]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 4200);
    };
    window.addEventListener("chinwi-toast", onToast);
    return () => window.removeEventListener("chinwi-toast", onToast);
  }, []);
  return (
    <div className="fixed bottom-5 left-1/2 z-[100] flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`fade-in rounded-xl border px-4 py-3 text-sm font-bold shadow-2xl backdrop-blur ${
            item.type === "ok"
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
              : "border-red-500/40 bg-red-500/15 text-red-200"
          }`}
        >
          {item.type === "ok" ? "✅ " : "⚠️ "}
          {item.message}
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── مكوّنات ───────────────────────── */

export function Spinner({ label }: { label?: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-center gap-3 py-14 text-sm text-slate-400">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
      {label ?? "جاري التحميل…"}
    </div>
  );
}

export function Card({
  children,
  className = "",
  title,
  subtitle,
  action,
}: {
  children?: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
}): React.ReactElement {
  return (
    <section className={`panel p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-extrabold text-white">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "emerald",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: string;
  tone?: "emerald" | "red" | "sky" | "amber" | "violet";
}): React.ReactElement {
  const tones: Record<string, string> = {
    emerald: "from-emerald-500/20 to-emerald-500/0 text-emerald-300 border-emerald-500/25",
    red: "from-red-500/20 to-red-500/0 text-red-300 border-red-500/25",
    sky: "from-sky-500/20 to-sky-500/0 text-sky-300 border-sky-500/25",
    amber: "from-amber-500/20 to-amber-500/0 text-amber-300 border-amber-500/25",
    violet: "from-violet-500/20 to-violet-500/0 text-violet-300 border-violet-500/25",
  };
  return (
    <div className={`panel panel-hover relative overflow-hidden p-4`}>
      <div className={`absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${tones[tone]} opacity-40`} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[0.72rem] font-bold tracking-wide text-slate-400">{label}</p>
          <p className="mt-1.5 text-2xl font-black text-white">{value}</p>
          {hint && <p className="mt-1 text-[0.7rem] text-slate-500">{hint}</p>}
        </div>
        {icon && <span className="text-2xl opacity-90">{icon}</span>}
      </div>
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = "green",
  size = "md",
  disabled,
  type = "button",
  className = "",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "green" | "red" | "ghost";
  size?: "sm" | "md";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}): React.ReactElement {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant} ${size === "sm" ? "px-2.5 py-1.5 text-xs" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "emerald" | "red" | "amber" | "slate" | "sky" | "violet";
}): React.ReactElement {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    red: "bg-red-500/15 text-red-300 border-red-500/30",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    slate: "bg-white/5 text-slate-300 border-white/10",
    sky: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  };
  return <span className={`chip ${tones[tone]}`}>{children}</span>;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}): React.ReactElement {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[0.7rem] text-slate-500">{hint}</p>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>): React.ReactElement {
  return <input {...props} className={`field ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>): React.ReactElement {
  return <textarea {...props} className={`field ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>): React.ReactElement {
  return <select {...props} className={`field ${props.className ?? ""}`} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-right transition hover:border-emerald-500/30"
    >
      <span>
        <span className="block text-sm font-bold text-slate-100">{label}</span>
        {hint && <span className="block text-[0.7rem] text-slate-500">{hint}</span>}
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-emerald-500" : "bg-slate-700"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? "right-0.5" : "right-[1.4rem]"
          }`}
        />
      </span>
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}): React.ReactElement | null {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6">
      <div className={`panel fade-in my-6 w-full ${wide ? "max-w-4xl" : "max-w-xl"} p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-white">{title}</h3>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white">
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto pl-1">{children}</div>
        {footer && <div className="mt-4 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon = "🗂", title, hint }: { icon?: string; title: string; hint?: string }): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="text-4xl opacity-60">{icon}</span>
      <p className="text-sm font-bold text-slate-300">{title}</p>
      {hint && <p className="max-w-sm text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function CopyBtn({ text, label = "نسخ" }: { text: string; label?: string }): React.ReactElement {
  const [done, setDone] = useState(false);
  return (
    <Btn
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          toast("تعذّر النسخ", "err");
        }
      }}
    >
      {done ? "✅ تم" : `📋 ${label}`}
    </Btn>
  );
}

export function Bars({
  data,
  height = 120,
  currency = "دج",
}: {
  data: { day: string; revenue: number; orders: number; users: number }[];
  height?: number;
  currency?: string;
}): React.ReactElement {
  const max = Math.max(1, ...data.map((d) => d.revenue));
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max(3, Math.round((d.revenue / max) * height));
          return (
            <div key={`${d.day}-${i}`} className="group relative flex flex-1 flex-col items-center justify-end">
              <div className="pointer-events-none absolute -top-8 z-10 hidden whitespace-nowrap rounded-md border border-white/10 bg-black/90 px-2 py-1 text-[0.65rem] text-emerald-300 group-hover:block">
                {d.revenue.toLocaleString("en-US")} {currency} · {d.orders} طلب
              </div>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-emerald-600/30 to-emerald-400 transition-all group-hover:to-emerald-300"
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[0.62rem] text-slate-500">
        <span>{data[0]?.day?.slice(5)}</span>
        <span>آخر 14 يوم</span>
        <span>{data.at(-1)?.day?.slice(5)}</span>
      </div>
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder = "بحث…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}): React.ReactElement {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => onChange(local), 350);
    return () => clearTimeout(t);
  }, [local, onChange]);
  return (
    <div className="relative">
      <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder={placeholder} className="pr-9" />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">🔎</span>
    </div>
  );
}

export function useNow(interval = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

export function relative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const d = Math.floor(h / 24);
  return `قبل ${d} يوم`;
}

export function useDebounced<T>(value: T, delay = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function money(value: number | string | null | undefined, currency = "دج"): string {
  const n = Number(value ?? 0);
  const rounded = Math.round(n * 100) / 100;
  return `${rounded.toLocaleString("en-US")} ${currency}`;
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-DZ", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function useConfirm(): {
  confirm: (message: string, action: () => void) => void;
  node: React.ReactElement | null;
} {
  const [state, setState] = useState<{ message: string; action: () => void } | null>(null);
  const confirm = useCallback((message: string, action: () => void) => setState({ message, action }), []);
  const node = useMemo(
    () =>
      state ? (
        <Modal
          open
          onClose={() => setState(null)}
          title="تأكيد العملية"
          footer={
            <>
              <Btn variant="ghost" onClick={() => setState(null)}>
                إلغاء
              </Btn>
              <Btn
                variant="red"
                onClick={() => {
                  state.action();
                  setState(null);
                }}
              >
                نعم، نفّذ
              </Btn>
            </>
          }
        >
          <p className="text-sm text-slate-300">{state.message}</p>
        </Modal>
      ) : null,
    [state],
  );
  return { confirm, node };
}
