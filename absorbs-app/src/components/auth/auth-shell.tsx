import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="aurora relative min-h-dvh overflow-hidden">
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.75rem,env(safe-area-inset-top))]">
        <Link href="/welcome" className="flex w-fit items-center gap-2.5">
          <span className="logo-mark h-10 w-10 rounded-2xl text-base">A</span>
          <span className="text-lg font-black text-white">Absorbs</span>
        </Link>

        <div className="animate-fade-up mt-10">
          <h1 className="text-3xl font-black text-white">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-white/55">{subtitle}</p>
        </div>

        <div className="glass animate-fade-up mt-6 rounded-[30px] p-5" style={{ animationDelay: "0.08s" }}>
          {children}
        </div>

        <div className="mt-6 text-center text-sm text-white/55">{footer}</div>
      </div>
    </div>
  );
}

export function PasswordField({
  value,
  onChange,
  autoComplete,
  placeholder = "••••••••",
  label = "كلمة المرور",
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
  label?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-white/70">{label}</span>
      <span className="relative block">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          dir="ltr"
          style={{ textAlign: "left" }}
          className="input-glass w-full rounded-2xl py-3 pe-11 ps-4 text-[15px] text-white"
          required
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
          className="absolute end-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-white/45 transition hover:text-white"
        >
          {visible ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
        </button>
      </span>
    </label>
  );
}

export function strengthOf(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  const levels = [
    { label: "ضعيفة", color: "bg-rose-500" },
    { label: "مقبولة", color: "bg-amber-400" },
    { label: "جيدة", color: "bg-yellow-300" },
    { label: "قوية", color: "bg-emerald-400" },
    { label: "ممتازة", color: "bg-emerald-300" },
    { label: "أسطورية", color: "bg-cyan-300" },
  ];
  return { score, ...levels[Math.min(score, levels.length - 1)] };
}
