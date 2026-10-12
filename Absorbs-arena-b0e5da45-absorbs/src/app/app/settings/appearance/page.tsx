"use client";

/**
 * v18 ATLAS — appearance.
 * Accent · light/dark · density · type scale · wide mode · motion.
 * Every switch here is a data attribute on <html>; the design layer in
 * globals.css turns it into real CSS variables, so the change is instant.
 */

import { Monitor, Palette, RotateCcw, Rows3, Type, Maximize2, Zap } from "lucide-react";
import { SettingsFrame } from "@/components/settings-ui";
import {
  ACCENTS,
  SegRow,
  ToggleRow,
  useAppearanceSafe,
  type AccentId,
  type DensityId,
  type ScaleId,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";

const DENSITIES: { id: DensityId; label: string }[] = [
  { id: "compact", label: "مدمج" },
  { id: "default", label: "عادي" },
  { id: "cozy", label: "مريح" },
];

const SCALES: { id: ScaleId; label: string }[] = [
  { id: "sm", label: "صغير" },
  { id: "md", label: "عادي" },
  { id: "lg", label: "كبير" },
  { id: "xl", label: "كبير جداً" },
];

const MODES: { id: "lumen" | "midnight"; label: string }[] = [
  { id: "lumen", label: "فاتح" },
  { id: "midnight", label: "ليلي" },
];

export default function AppearancePage() {
  const { ap, set, reset } = useAppearanceSafe();

  return (
    <SettingsFrame title="المظهر والتصميم">
      <p className="text-sm text-slate-400">
        نظام تصميم ATLAS: لون واحد يقود كل الأزرار والبطاقات، وكثافة ومساحة شاشة تختارها أنت.
        كل تغيير يُطبّق فوراً ويُحفظ على هذا الجهاز.
      </p>

      {/* accent */}
      <div className="glass rounded-2xl p-5">
        <p className="nx-section-title mb-4">
          <Palette className="h-4 w-4" /> لون الهوية
        </p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => set({ accent: a.id as AccentId })}
              aria-pressed={ap.accent === a.id}
              className={cn(
                "group flex flex-col items-center gap-2 rounded-2xl border p-3 transition",
                ap.accent === a.id
                  ? "border-[var(--nx-accent)] bg-[var(--nx-accent-soft)]"
                  : "border-[var(--nx-line)] hover:border-[var(--nx-accent-line)]"
              )}
            >
              <span
                className="h-10 w-10 rounded-full shadow-[0_8px_20px_-8px_rgba(0,0,0,0.5)] transition group-hover:scale-105"
                style={{ background: a.swatch }}
              />
              <span className="text-[12px] font-bold text-[var(--nx-text-soft)]">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* mode */}
      <div className="glass rounded-2xl p-5">
        <SegRow
          label="وضع العرض"
          hint="فاتح نهاري أو ليلي مريح للعين"
          value={ap.mode}
          options={MODES}
          onChange={(v) => set({ mode: v })}
        />
      </div>

      {/* layout */}
      <div className="glass space-y-5 rounded-2xl p-5">
        <p className="nx-section-title">
          <Rows3 className="h-4 w-4" /> المساحة والترتيب
        </p>
        <SegRow
          label="كثافة العناصر"
          hint="مُدمج يعرض محتوى أكثر، مريح يعطي كل بطاقة مساحتها"
          value={ap.density}
          options={DENSITIES}
          onChange={(v) => set({ density: v })}
        />
        <hr className="nx-sep" />
        <SegRow
          label="حجم الخط"
          hint="حجم الخط الأساسي في كل التطبيق"
          value={ap.scale}
          options={SCALES}
          onChange={(v) => set({ scale: v })}
        />
        <hr className="nx-sep" />
        <ToggleRow
          label="الشاشة العريضة"
          hint="استعمال كامل عرض الشاشة حتى 1800 بكسل"
          value={ap.wide}
          onChange={(v) => set({ wide: v })}
        />
      </div>

      {/* motion */}
      <div className="glass rounded-2xl p-5">
        <SegRow
          label="الحركة والانتقالات"
          hint="أوقفها لتوفير البطارية وتقليل الحركة"
          value={ap.motion ? "on" : "off"}
          options={[
            { id: "on", label: "مفعّلة" },
            { id: "off", label: "موقوفة" },
          ]}
          onChange={(v) => set({ motion: v === "on" })}
        />
      </div>

      {/* live preview */}
      <div className="nx-panel p-5">
        <p className="nx-section-title mb-4">
          <Zap className="h-4 w-4" /> معاينة حيّة
        </p>
        <div className="nx-bento">
          <div className="nx-card nx-card-hover p-4">
            <p className="nx-stat-value">1,284</p>
            <p className="nx-stat-label">نقطة خبرة</p>
          </div>
          <div className="nx-card nx-card-hover p-4">
            <p className="nx-stat-value">32</p>
            <p className="nx-stat-label">نموذج جاهز</p>
          </div>
          <div className="nx-card nx-card-hover p-4">
            <p className="nx-stat-value">12</p>
            <p className="nx-stat-label">قالب لعبة</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className="nx-btn nx-btn-primary">
            <Maximize2 className="h-4 w-4" /> زر أساسي
          </button>
          <button type="button" className="nx-btn nx-btn-soft">
            زر ثانوي
          </button>
          <button type="button" className="nx-btn nx-btn-ghost">
            <Monitor className="h-4 w-4" /> زر شبحي
          </button>
          <span className="nx-chip nx-chip-accent">شريحة ملوّنة</span>
          <span className="nx-chip nx-chip-gold">ذهبية</span>
        </div>
      </div>

      <button
        type="button"
        onClick={reset}
        className="nx-btn nx-btn-ghost w-full"
      >
        <RotateCcw className="h-4 w-4" />
        إرجاع المظهر الافتراضي
      </button>
    </SettingsFrame>
  );
}
