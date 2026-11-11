"use client";
import { useI18n } from "@/lib/i18n/client";
import { locales, localeNames } from "@/lib/i18n/config";
import { Icon } from "./Icon";
export function LanguageSwitcher({ expanded = false }: { expanded?: boolean }) {
  const { locale, setLocale, t, pending } = useI18n();
  if (expanded) return <div className="language-options">{locales.map((item) => <button key={item} type="button" lang={item} dir="auto" aria-pressed={locale === item} className={locale === item ? "selected" : ""} onClick={() => setLocale(item)}><Icon name="language" size={17} /><b>{localeNames[item]}</b>{locale === item && <Icon name="check" size={14} />}</button>)}</div>;
  return <label className="language-compact"><Icon name="globe" size={17} /><span className="visually-hidden">{t("language")}</span><select aria-label={t("language")} value={locale} disabled={pending} onChange={(event) => setLocale(event.target.value as typeof locale)}>{locales.map((item) => <option key={item} value={item}>{localeNames[item]}</option>)}</select></label>;
}
