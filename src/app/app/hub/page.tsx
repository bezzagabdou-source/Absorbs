"use client";

/**
 * Nexus AI v12 — THE HUB.
 * The single bottom button opens this. Everything the app can do, on one calm screen.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Crown,
  Gamepad2,
  Gavel,
  History,
  ImageIcon,
  LayoutGrid,
  MessagesSquare,
  Settings,
  Telescope,
  SquarePen,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { useCredits, UserAvatar } from "@/components/app/app-shell";
import { useAuth } from "@/lib/auth-context";
import { MODELS_V12, FREE_MODELS_V12 } from "@/lib/models-v12";
import { cn } from "@/lib/utils";

interface Tile {
  href: string;
  label: string;
  sub: string;
  icon: LucideIcon;
  tone?: "accent" | "gold";
  badge?: string;
  wide?: boolean;
}

export default function HubPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useCredits();
  const isPro = profile?.plan === "pro";

  const tiles: Tile[] = [
    {
      href: "/app/council",
      label: "مجلس النماذج",
      sub: "4 نماذج يجاوبو فنفس الوقت، ونقرار واحد نهائي",
      icon: Gavel,
      tone: "gold",
      badge: "جديد",
      wide: true,
    },
    {
      href: "/app/research",
      label: "البحث العميق",
      sub: "يفتّش فالإنترنت ويعطيك مصادر مرقّمة",
      icon: Telescope,
      tone: "accent",
      badge: "جديد",
      wide: true,
    },
    { href: "/app", label: "المحادثة", sub: "الدردشة الرئيسية", icon: MessagesSquare, tone: "accent" },
    { href: "/app/studio", label: "الاستوديو", sub: "بناء مواقع وألعاب", icon: Wand2 },
    { href: "/app/tools", label: "الأدوات", sub: "أدوات جاهزة", icon: LayoutGrid },
    { href: "/app/studio/video", label: "الصور والفيديو", sub: "توليد بصري", icon: ImageIcon },
    { href: "/app/arcade", label: "الأركيد", sub: "ألعابك المولَّدة", icon: Gamepad2 },
    { href: "/app/history", label: "السجلّ", sub: "محادثاتك السابقة", icon: History },
    { href: "/app/settings", label: "الإعدادات", sub: "الحساب والمظهر", icon: Settings },
  ];

  const used = profile ? Math.max(0, profile.dailyLimit - profile.creditsLeft) : 0;
  const pct = profile && profile.dailyLimit > 0 ? Math.min(100, (used / profile.dailyLimit) * 100) : 0;

  return (
    <div className="v12-page v12-grain mx-auto w-full max-w-4xl px-4 pb-10 pt-5 sm:px-6">
      <div className="v12-sky" />

      {/* ---- identity ---- */}
      <header className="v12-in mb-6 flex items-center gap-3.5">
        <UserAvatar name={user?.displayName ?? null} photo={user?.photoURL ?? null} size={46} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold text-[var(--v12-text)]">
            {user?.displayName || user?.email?.split("@")[0] || "مرحبًا"}
          </p>
          <p className="truncate text-[12.5px] text-[var(--v12-faint)]">
            {isPro ? "عضوية Pro" : "الخطة المجانية"} · {user?.email ?? ""}
          </p>
        </div>
        {!isPro && (
          <Link href="/app/upgrade" className="v12-chip v12-chip-pro flex-none">
            <Crown className="h-3 w-3" /> ترقية
          </Link>
        )}
      </header>

      {/* ---- new chat ---- */}
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new Event("barq:new-chat"));
          router.push("/app");
        }}
        className="v12-btn v12-btn-primary v12-in mb-6 w-full !py-3.5"
      >
        <SquarePen className="h-[18px] w-[18px]" />
        محادثة جديدة
      </button>

      {/* ---- tiles ---- */}
      <div className="v12-stagger mb-6 grid grid-cols-2 gap-2.5">
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "v12-card v12-card-hover relative flex flex-col gap-2 p-4",
              t.wide && "col-span-2",
              t.tone === "gold" && "v12-ring"
            )}
            style={
              t.tone === "gold"
                ? { background: "linear-gradient(135deg,rgba(240,180,41,.13),rgba(217,119,87,.09))" }
                : undefined
            }
          >
            {t.badge && (
              <span className="v12-chip v12-chip-pro absolute end-3 top-3 !px-2 !py-0.5 !text-[10px]">
                {t.badge}
              </span>
            )}
            <t.icon
              className={cn(
                "h-[22px] w-[22px]",
                t.tone === "gold"
                  ? "text-[var(--v12-gold)]"
                  : t.tone === "accent"
                  ? "text-[var(--v12-accent-2)]"
                  : "text-[var(--v12-dim)]"
              )}
            />
            <span className="text-[15px] font-semibold leading-tight text-[var(--v12-text)]">
              {t.label}
            </span>
            <span className="text-[12px] leading-snug text-[var(--v12-faint)]">{t.sub}</span>
          </Link>
        ))}
      </div>

      {/* ---- usage ---- */}
      <section className="v12-in mb-6">
        <h2 className="v12-group-title">الاستهلاك</h2>
        <div className="v12-card p-4">
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="text-[13px] text-[var(--v12-dim)]">
              {isPro ? "بلا حدود عمليًا" : "الرسائل اليوم"}
            </span>
            <span className="text-[15px] font-bold tabular-nums text-[var(--v12-text)]">
              {profile ? (isPro ? "∞" : `${profile.creditsLeft} / ${profile.dailyLimit}`) : "—"}
            </span>
          </div>
          <div className="v12-score">
            <i style={{ width: `${isPro ? 100 : 100 - pct}%` }} />
          </div>
        </div>
      </section>

      {/* ---- models ---- */}
      <section className="v12-in">
        <h2 className="v12-group-title">النماذج المتاحة</h2>
        <div className="v12-card flex items-center gap-4 p-4">
          <div className="flex-1">
            <p className="text-[15px] font-semibold text-[var(--v12-text)]">
              {isPro ? MODELS_V12.length : FREE_MODELS_V12.length} نموذج مختار بعناية
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--v12-faint)]">
              {isPro
                ? "8 مجانية + 8 Pro. بلا قوائم طويلة، بلا نماذج ميتة."
                : "8 نماذج مجانية. رقّي لـ Pro باش تفتح 8 زيادة فيهم Claude وGrok."}
            </p>
          </div>
          <Link href="/app/upgrade" className="v12-btn v12-btn-quiet flex-none !px-4 !py-2 !text-[13px]">
            {isPro ? "التفاصيل" : "ترقية"}
          </Link>
        </div>
      </section>
    </div>
  );
}
