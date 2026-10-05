"use client";

import { Check } from "lucide-react";
import { LOCALES, LOCALE_NAMES, useI18n } from "@/lib/i18n";
import { SettingsFrame } from "@/components/settings-ui";
import { cn } from "@/lib/utils";

export default function LanguagePage() {
  const { locale, setLocale, t } = useI18n();
  return (
    <SettingsFrame title={t.common.language}>
      <p className="text-sm text-slate-400">اللغة الأساسية للواجهة والردود. تُحفظ على هذا الجهاز.</p>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          dir={l === "ar" ? "rtl" : "ltr"}
          className={cn(
            "glass flex w-full items-center justify-between rounded-2xl p-5 text-start text-base font-black transition",
            locale === l ? "border-brand-400/60 bg-brand-500/15 text-white" : "text-slate-300 hover:border-white/25"
          )}
        >
          {LOCALE_NAMES[l]}
          {locale === l && <Check className="h-5 w-5 text-brand-300" />}
        </button>
      ))}
    </SettingsFrame>
  );
}
