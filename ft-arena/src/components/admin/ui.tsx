"use client";
import { useEffect, useState } from "react";

/* ───────────── Toasts ───────────── */
type Toast = { id: number; msg: string; kind: "ok" | "err" | "info" };
let pushToast: ((t: Omit<Toast, "id">) => void) | null = null;
export const toast = (msg: string, kind: Toast["kind"] = "info") => pushToast?.({ msg, kind });

export function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    pushToast = (t) => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { ...t, id }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3800);
    };
    return () => {
      pushToast = null;
    };
  }, []);
  return (
    <div className="toast-wrap">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind === "ok" ? "ok" : t.kind === "err" ? "err" : ""}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ───────────── API helper ───────────── */
export async function api<T = unknown>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 401) {
    location.reload();
    throw new Error("انتهت الجلسة");
  }
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

/* ───────────── primitives ───────────── */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Toggle({
  on,
  onChange,
  label,
  desc,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <div className="card-soft row-between" style={{ padding: "12px 14px", marginBottom: 9 }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 13.5 }}>{label}</div>
        {desc && <div className="muted-2" style={{ fontSize: 11.5, marginTop: 2 }}>{desc}</div>}
      </div>
      <button
        type="button"
        className="toggle"
        data-on={on}
        aria-label={label}
        onClick={() => onChange(!on)}
      />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={width ? { width: `min(${width}px, 100%)` } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="إغلاق">✕</button>
        </div>
        {children}
        {footer && <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Avatar({ src, name, size = "md" }: { src?: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  const cls = size === "sm" ? "avatar avatar-sm" : size === "lg" ? "avatar avatar-lg" : "avatar";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={cls} src={src} alt={name} loading="lazy" />;
  }
  return <div className={cls}>{initial}</div>;
}

export function Num({ value }: { value: number }) {
  return <>{new Intl.NumberFormat("en-US").format(value ?? 0)}</>;
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

export function Spinner() {
  return <span className="spinner" />;
}

export function Copy({ text, label = "نسخ" }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast("تم النسخ ✅", "ok");
        } catch {
          toast("تعذّر النسخ", "err");
        }
      }}
    >
      📋 {label}
    </button>
  );
}

export function relTime(iso: string): string {
  const diff = Date.now() - +new Date(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 30) return `قبل ${d} يوم`;
  return new Date(iso).toLocaleDateString("ar-DZ");
}

export function fmtNum(n: number) {
  return new Intl.NumberFormat("en-US", { notation: n > 99999 ? "compact" : "standard" }).format(n ?? 0);
}
