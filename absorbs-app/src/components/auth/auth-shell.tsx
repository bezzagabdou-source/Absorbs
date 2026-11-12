"use client";

import Link from "next/link";
import { Eye, EyeOff, Heart, MessageCircleHeart, ShieldCheck, Zap } from "lucide-react";
import { useState } from "react";

const CHIPS = [
  { icon: Heart, label: "إعجابات فورية", className: "bg-red-500/20 text-red-300 ring-red-400/25" },
  { icon: MessageCircleHeart, label: "رسائل لحظية", className: "bg-cyan-400/15 text-cyan-300 ring-cyan-300/25" },
  { icon: Zap, label: "بث مباشر", className: "bg-emerald-500/20 text-teal-200 ring-teal-300/25" },
  { icon: ShieldCheck, label: "خصوصية محكمة", className: "bg-emerald-400/15 text-emerald-300 ring-emerald-300/25" },
];

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
      {/* cinematic glows */}
      <div className="pointer-events-none absolute -top-24 start-1/4 h-72 w-72 rounded-full bg-emerald-600/25 blur-[100px]" />
      <div className="pointer-events-none absolute top-40 -end-20 h-64 w-64 rounded-full bg-emerald-600/20 blur-[90px]" />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.6rem,env(safe-area-inset-top))]">
        {/* hero brand */}
        <div className="animate-fade-up flex flex-col items-center text-center">
          <Link href="/welcome" className="group relative" aria-label="DZ CONNECT">
            <span className="absolute inset-0 scale-125 rounded-[30px] bg-emerald-600/40 blur-2xl transition group-hover:scale-150" />
            <span className="logo-mark relative h-[72px] w-[72px] rounded-[24px] text-[30px]">A</span>
          </Link>
          <p className="mt-4 text-[26px] font-black tracking-tight text-white">
            DZ CONNECT <span className="text-gradient">· تواصل بلا حدود</span>
          </p>
          <div className="no-scrollbar mt-4 flex max-w-full gap-2 overflow-x-auto pb-1">
            {CHIPS.map((chip) => (
              <span
                key={chip.label}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 backdrop-blur ${chip.className}`}
              >
                <chip.icon className="h-3.5 w-3.5" /> {chip.label}
              </span>
            ))}
          </div>
        </div>

        <div className="animate-fade-up mt-7 text-center" style={{ animationDelay: "0.05s" }}>
          <h1 className="text-[28px] font-black text-white">{title}</h1>
          {subtitle && <p className="mx-auto mt-1.5 max-w-[320px] text-[13.5px] leading-6 text-white/55">{subtitle}</p>}
        </div>

        <div className="glass-strong animate-fade-up mt-5 rounded-[30px] p-5 shadow-2xl" style={{ animationDelay: "0.1s" }}>
          {children}
        </div>

        {footer && <div className="mt-5 text-center text-sm text-white/55">{footer}</div>}
        <p className="mt-auto pt-6 text-center text-[10.5px] text-white/30">محمي بـ Supabase Auth + RLS · يعمل كتطبيق PWA على هاتفك</p>
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
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
    { label: "ضعيفة", color: "bg-red-500" },
    { label: "مقبولة", color: "bg-amber-400" },
    { label: "جيدة", color: "bg-yellow-300" },
    { label: "قوية", color: "bg-emerald-400" },
    { label: "ممتازة", color: "bg-emerald-300" },
    { label: "أسطورية", color: "bg-cyan-300" },
  ];
  return { score, ...levels[Math.min(score, levels.length - 1)] };
}
