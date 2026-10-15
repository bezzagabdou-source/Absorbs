"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Crown, Menu, Moon, Sparkles, Sun, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNexus } from "@/lib/store";
import { modelById } from "@/lib/models";
import { Sidebar } from "@/components/sidebar";
import { ChatArea } from "@/components/chat";
import { Composer } from "@/components/composer";
import { NexusMark } from "@/components/logo";
import { Modal, Toggle, GhostButton, PrimaryButton, Badge } from "@/components/ui";
import { useTheme } from "@/components/theme";
import { ActivationCode } from "@/components/activation-code";
import { useAuth } from "@/lib/auth-context";
import { ThemeToggle } from "@/components/theme";

/* ── settings modal ─────────────────────────────────────────── */

function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [theme, setTheme] = useTheme();
  const { conversations, deleteConversation } = useNexus();
  const { profile, signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);

  const clearAll = async () => {
    for (const c of conversations) await deleteConversation(c.id);
    setConfirming(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="الإعدادات" subtitle="خصّص تجربتك في Nexus">
      <div className="flex flex-col gap-2">
        {/* account */}
        <div className="glass flex items-center justify-between gap-3 rounded-2xl p-4">
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-bold" dir="ltr">{profile?.email ?? "—"}</div>
            <div className="text-[11.5px] text-(--ink-3)">
              {profile?.paidPro ? "خطة Pro نشطة" : profile?.trial ? "تجربة مجانية — كل المحركات مفتوحة" : "الخطة المجانية"}
            </div>
          </div>
          <GhostButton className="px-3! py-1.5! text-xs!" onClick={() => void signOut()}>
            تسجيل الخروج
          </GhostButton>
        </div>
        {/* theme */}
        <div className="glass flex items-center justify-between gap-3 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-(--accent)/12 text-(--accent)">
              {theme === "dark" ? <Moon className="size-4.5" /> : <Sun className="size-4.5" />}
            </span>
            <div>
              <div className="text-[13.5px] font-bold">المظهر</div>
              <div className="text-[11.5px] text-(--ink-3)">
                {theme === "dark" ? "ليلي — فضاء عميق" : "نهاري — بورسلين فاتح"}
              </div>
            </div>
          </div>
          <Toggle
            label="المظهر الداكن"
            checked={theme === "dark"}
            onChange={(v) => setTheme(v ? "dark" : "light")}
          />
        </div>

        {/* data */}
        <div className="glass flex items-center justify-between gap-3 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-red-500/10 text-red-400">
              <Trash2 className="size-4.5" />
            </span>
            <div>
              <div className="text-[13.5px] font-bold">مسح السجل</div>
              <div className="text-[11.5px] text-(--ink-3)">
                حذف جميع المحادثات ({conversations.length}) نهائيًا
              </div>
            </div>
          </div>
          {confirming ? (
            <div className="flex items-center gap-1.5">
              <GhostButton className="px-3! py-1.5! text-xs!" onClick={() => setConfirming(false)}>
                إلغاء
              </GhostButton>
              <button
                onClick={clearAll}
                className="press cursor-pointer rounded-2xl bg-red-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500/90"
              >
                تأكيد
              </button>
            </div>
          ) : (
            <GhostButton className="px-3! py-1.5! text-xs! text-red-400!" onClick={() => setConfirming(true)}>
              مسح الكل
            </GhostButton>
          )}
        </div>

        {/* about */}
        <div className="glass mt-1 flex items-center gap-3 rounded-2xl p-4">
          <NexusMark size={40} />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-bold" dir="ltr">
              Nexus AI <span className="text-(--accent)">v20</span>
            </div>
            <div className="text-[11.5px] leading-relaxed text-(--ink-3)">
              واجهة ذكاء اصطناعي من الجيل الجديد — سريعة، أنيقة، وخاصّة.
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ── upgrade modal ──────────────────────────────────────────── */

const TIERS = [
  {
    name: "Free",
    price: "0",
    caption: "للبداية والاستكشاف",
    features: ["30 رسالة يوميًا", "محرك Nexus Core", "محفوظات محلية آمنة"],
    tone: "plain" as const,
  },
  {
    name: "Pro",
    price: "1,200",
    caption: "الخيار الأذكى للمحترفين",
    features: ["رسائل غير محدودة", "كل المحركات + Apex", "أولوية في السرعة", "دعم الأولوية"],
    tone: "gold" as const,
  },
  {
    name: "Max",
    price: "2,900",
    caption: "قوة مطلقة للفرق",
    features: ["كل مزايا Pro", "جلسات تعاونية", "وصول API كامل"],
    tone: "plain" as const,
  },
];

function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ارتقِ إلى Nexus Pro"
      subtitle="افتح كل المحركات وارفع كل الحدود — بأسعار محلية وبسيطة"
      wide
    >
      <div className="mb-4">
        <ActivationCode />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TIERS.map((t, i) => {
          const pro = t.tone === "gold";
          return (
            <motion.button
              key={t.name}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => setPicked(i)}
              className={cn(
                "press relative cursor-pointer rounded-2xl p-4 text-start transition-shadow",
                pro ? "glass-2 hairline" : "glass hover-lift",
                picked === i && "shadow-[var(--glow-a)]",
              )}
            >
              {pro && (
                <span className="absolute -top-2.5 start-4">
                  <Badge tone="gold">
                    <Crown className="size-3" /> الأكثر اختيارًا
                  </Badge>
                </span>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-extrabold tracking-tight" dir="ltr">
                  {t.name}
                </span>
                {picked === i ? (
                  <span className="grid size-5 place-items-center rounded-full bg-(--accent) text-white">
                    <Check className="size-3" strokeWidth={3.5} />
                  </span>
                ) : (
                  <span className="grid size-5 place-items-center rounded-full border border-(--line-2)" />
                )}
              </div>
              <div className="mt-2 flex items-baseline gap-1" dir="ltr">
                <span className={cn("text-[24px] font-black tracking-tight", pro && "text-gradient")}>
                  {t.price}
                </span>
                <span className="text-[11px] text-(--ink-3)">DZD/شهر</span>
              </div>
              <div className="text-[11px] text-(--ink-3)">{t.caption}</div>
              <ul className="mt-3 flex flex-col gap-1.5 border-t border-(--line) pt-3">
                {t.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[11.5px] text-(--ink-2)">
                    <span className={cn("grid size-4 place-items-center rounded-full", pro ? "bg-(--gold)/15 text-(--gold)" : "bg-(--accent)/12 text-(--accent)")}>
                      <Check className="size-2.5" strokeWidth={3.5} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </motion.button>
          );
        })}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[11px] text-(--ink-3)">
          <Zap className="size-3.5 text-(--gold)" />
          إلغاء في أي وقت — دون التزام
        </span>
        <PrimaryButton
          icon={<Crown className="size-4" />}
          onClick={onClose}
          disabled={picked === null}
        >
          {picked === null ? "اختر باقة" : `تفعيل ${TIERS[picked].name}`}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

/* ── header ─────────────────────────────────────────────────── */

function Header({ onOpenUpgrade }: { onOpenUpgrade: () => void }) {
  const { setSidebarOpen, activeId, conversations, model } = useNexus();
  const active = conversations.find((c) => c.id === activeId);
  const m = modelById(model);

  return (
    <header className="relative z-30 flex h-15 shrink-0 items-center gap-2 px-3 sm:px-5">
      <button
        onClick={() => setSidebarOpen(true)}
        aria-label="فتح القائمة"
        className="glass hover-lift press grid size-10 cursor-pointer place-items-center rounded-xl text-(--ink-2) hover:text-(--ink) lg:hidden"
      >
        <Menu className="size-[18px]" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="glass hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold text-(--accent) sm:flex" dir="ltr">
          <Sparkles className="size-3.5" />
          {m.name}
        </span>
        <AnimateTitle key={active?.id ?? "home"} title={active?.title ?? "مساعد Nexus الذكي"} />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenUpgrade}
          className="press hidden cursor-pointer items-center gap-1.5 rounded-full border border-(--gold)/30 bg-(--gold)/10 px-3.5 py-2 text-[12px] font-bold text-(--gold) transition-colors hover:bg-(--gold)/18 sm:flex"
        >
          <Crown className="size-3.5" />
          <span dir="ltr">Pro</span>
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}

function AnimateTitle({ title }: { title: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="min-w-0 truncate text-[13.5px] font-semibold text-(--ink-2)"
      dir="auto"
    >
      {title}
    </motion.span>
  );
}

/* ── shell ──────────────────────────────────────────────────── */

export function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} onOpenUpgrade={() => setUpgradeOpen(true)} />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <Header onOpenUpgrade={() => setUpgradeOpen(true)} />

        <ChatArea />

        {/* floating composer */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-3 sm:px-6 sm:pb-5">
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-36"
            style={{ background: "linear-gradient(to top, var(--bg-0) 25%, transparent)" }}
            aria-hidden
          />
          <div className="pointer-events-auto relative mx-auto w-full max-w-3xl">
            <Composer />
            <p className="mt-2 text-center text-[10.5px] text-(--ink-3)">
              Nexus قد يخطئ أحيانًا — راجع المعلومات المهمّة قبل اعتمادها.
            </p>
          </div>
        </div>
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
