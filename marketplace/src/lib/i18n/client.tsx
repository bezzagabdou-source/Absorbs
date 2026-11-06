"use client";
import { createContext, useContext, useTransition, useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { direction, type Locale } from "./config";
import { translate, type TranslationKey, type TranslationParams } from "./dictionaries";
const I18nContext = createContext<{ locale: Locale; t: (key: TranslationKey, params?: TranslationParams) => string; setLocale: (locale: Locale) => void; pending: boolean } | null>(null);
export function I18nProvider({ locale: initialLocale, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter(); const [pending, startTransition] = useTransition();
  const [locale, updateLocale] = useState(initialLocale);
  useEffect(() => { document.documentElement.lang = locale; document.documentElement.dir = direction(locale); }, [locale]);
  
  const setLocale = (next: Locale) => {
    updateLocale(next);
    document.documentElement.lang = next; document.documentElement.dir = direction(next);
    document.cookie = `dz_locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    try { localStorage.setItem("dz-language", next); } catch { /* storage disabled */ }
    startTransition(() => router.refresh());
  };
  return <I18nContext.Provider value={{ locale, pending, setLocale, t: (key, params) => translate(locale, key, params) }}>{children}</I18nContext.Provider>;
}
export function useI18n() { const context = useContext(I18nContext); if (!context) throw new Error("I18nProvider missing"); return context; }
