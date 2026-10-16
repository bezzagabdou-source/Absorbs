"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Crown, Menu, Moon, ShieldCheck, Sparkles, Sun, Trash2, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNexus } from "@/lib/store";
import { modelById } from "@/lib/models";
import { Sidebar, type ToolId } from "@/components/sidebar";
import { ChatArea } from "@/components/chat";
import { Composer } from "@/components/composer";
import { NexusMark } from "@/components/logo";
import { Modal, Toggle, GhostButton, PrimaryButton, Badge } from "@/components/ui";
import { useTheme, ThemeToggle } from "@/components/theme";
import { ActivationCode } from "@/components/activation-code";
import { useAuth } from "@/lib/auth-context";
import { VoiceCall } from "@/components/voice-call";
import { ImageGenerator } from "@/components/image-generator";
import { WebPreview } from "@/components/web-preview";
import { AIOrchestrator } from "@/components/ai-orchestrator";

export type ToolState = { voice: boolean; image: boolean; web: boolean; orch: boolean };

/* ── settings modal ─────────────────────────────────────────── */

const SECURITY_FEATURES = [
  "كلمات السر مشفّرة بـ scrypt (16384 تكرار + ملح فريد)",
  "جلسة HttpOnly + SameSite — لا يلمسها JavaScript إطلاقًا",
  "قفل الحساب 15 دقيقة بعد 5 محاولات دخول خاطئة",
  "تقييد معدل الطلبات لكل مستخدم (محادثة، دخول، تفعيل)",
  "توقيع RSA للرموز + تدقيق المطالب على كل طلب",
  "حذف المحادثات نهائيًا — لا نسخة احتياطية لدى الغير",
];

function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [theme, setTheme] = useTheme();
  const { conversations, clearAll } = useNexus();
  const { profile, signOut, user, updateProfile } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("DZ");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setName(profile?.name ?? "");
    setPhone(profile?.phone ?? "");
    setCountry(profile?.country ?? "DZ");
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim(), country });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    await clearAll();
    setConfirming(false);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="الإعدادات" subtitle="خصّص تجربتك في Nexus">
      <div className="flex flex-col gap-2">
        {/* account */}
        <div className="glass flex items-center justify-between gap-3 rounded-2xl p-4">
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-bold" dir="ltr">
              {profile?.email ?? user?.email ?? "—"}
            </div>
            <div className="text-[11.5px] text-(--ink-3)">
              {profile?.paidPro ? "خطة Pro نشطة" : profile?.trial ? "تجربة مجانية 7 أيام — كل المحركات مفتوحة" : "الخطة المجانية"}
            </div>
            {profile?.name && (
              <div className="mt-0.5 text-[11.5px] text-(--ink-2)">
                {profile.name}
                {profile.phone ? ` · ${profile.phone}` : ""}
                {profile.country ? ` · ${profile.country}` : ""}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <GhostButton className="px-3! py-1.5! text-xs!" onClick={startEdit}>
              تعديل
            </GhostButton>
            <GhostButton className="px-3! py-1.5! text-xs!" onClick={() => void signOut()}>
              خروج
            </GhostButton>
          </div>
        </div>

        {/* profile editor */}
        {editing && (
          <div className="glass flex flex-col gap-2 rounded-2xl p-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="الاسم الكامل"
              className="glass rounded-xl px-3 py-2 text-[13px] outline-none"
            />
            <div className="flex gap-2">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="الهاتف (اختياري)"
                className="glass min-w-0 flex-1 rounded-xl px-3 py-2 text-[13px] outline-none"
              />
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="دولة"
                maxLength={2}
                className="glass w-16 rounded-xl px-3 py-2 text-center text-[13px] outline-none"
                dir="ltr"
              />
            </div>
            <div className="flex justify-end gap-1.5">
              <GhostButton className="px-3! py-1.5! text-xs!" onClick={() => setEditing(false)}>
                إلغاء
              </GhostButton>
              <PrimaryButton className="px-4! py-1.5! text-xs!" loading={saving} onClick={() => void save()}>
                حفظ
              </PrimaryButton>
            </div>
          </div>
        )}

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
          <Toggle label="المظهر الداكن" checked={theme === "dark"} onChange={(v) => setTheme(v ? "dark" : "light")} />
        </div>

        {/* security */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="size-4.5" />
            </span>
            <div className="text-[13.5px] font-bold">الأمان</div>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {SECURITY_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-(--ink-2)">
                <Check className="mt-0.5 size-3 shrink-0 text-emerald-400" strokeWidth={3} />
                {f}
              </li>
            ))}
          </ul>
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
                onClick={() => void clear()}
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
    features: ["30 رسالة يوميًا", "محرك Nexus Core", "محفوظات آمنة"],
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
  const [focusCode, setFocusCode] = useState(false);

  const pick = (i: number) => {
    setPicked(i);
    setFocusCode(true);
    requestAnimationFrame(() => {
      document.getElementById("activation-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ارتقِ إلى Nexus Pro"
      subtitle="افتح كل المحركات وارفع كل الحدود — التفعيل بكود سري"
      wide
    >
      <div className="mb-4" id="activation-box">
        <div className={cn("rounded-2xl transition-shadow", focusCode && "ring-2 ring-(--gold)/60 ring-offset-2 ring-offset-transparent")}>
          <ActivationCode />
        </div>
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
              onClick={() => pick(i)}
              className={cn(
                "press relative cursor-pointer rounded-2xl p-4 text-start transition-shadow",
                pro ? "glass-2 hairline" : "glass hover-lift",
                picked === i && "shadow-[var(--glow-a)]"
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
                <span className={cn("text-[24px] font-black tracking-tight", pro && "text-gradient")}>{t.price}</span>
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
          {picked === null ? "اختر باقة ثم فعّل بكود التفعيل" : `اخترت ${TIERS[picked].name} — أدخل كود التفعيل أعلاه`}
        </span>
        <PrimaryButton icon={<Crown className="size-4" />} onClick={onClose} disabled={picked === null}>
          {picked === null ? "اختر باقة" : "تم الاختيار"}
        </PrimaryButton>
      </div>
    </Modal>
  );
}

/* ── header ─────────────────────────────────────────────────── */

function Header({ onOpenUpgrade }: { onOpenUpgrade: () => void }) {
  const { sidebarOpen, setSidebarOpen, activeId, conversations, model } = useNexus();
  const active = conversations.find((c) => c.id === activeId);
  const m = modelById(model);

  return (
    <header className="relative z-30 flex h-15 shrink-0 items-center gap-2 px-3 sm:px-5">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={sidebarOpen ? "إغلاق القائمة" : "فتح القائمة"}
        aria-expanded={sidebarOpen}
        className="glass hover-lift press grid size-10 cursor-pointer place-items-center rounded-xl text-(--ink-2) hover:text-(--ink) lg:hidden"
      >
        {sidebarOpen ? <X className="size-[18px]" /> : <Menu className="size-[18px]" />}
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

/* ── shell ─────────────────────────────────────────────────── */

export function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [tools, setTools] = useState<ToolState>({ voice: false, image: false, web: false, orch: false });

  const openTool = (t: ToolId) => setTools((p) => ({ ...p, [t]: true }));
  const closeTool = (t: ToolId) => setTools((p) => ({ ...p, [t]: false }));

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} onOpenUpgrade={() => setUpgradeOpen(true)} onOpenTool={openTool} />

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
            <Composer onOpenTool={openTool} />
            <p className="mt-2 text-center text-[10.5px] text-(--ink-3)">
              Nexus قد يخطئ أحيانًا — راجع المعلومات المهمّة قبل اعتمادها.
            </p>
          </div>
        </div>
      </main>

      {/* tool windows (rendered at the top level so nothing can hide them) */}
      {tools.voice && <VoiceCall onClose={() => closeTool("voice")} />}
      {tools.image && <ImageGenerator isOpen={tools.image} onClose={() => closeTool("image")} />}
      {tools.web && <WebPreview isOpen={tools.web} onClose={() => closeTool("web")} />}
      {tools.orch && <AIOrchestrator onClose={() => closeTool("orch")} />}

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
