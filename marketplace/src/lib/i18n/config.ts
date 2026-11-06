export const locales = ["ar", "en", "fr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ar";
export const localeNames: Record<Locale, string> = { ar: "العربية", en: "English", fr: "Français" };
export const intlLocales: Record<Locale, string> = { ar: "ar-DZ", en: "en-GB", fr: "fr-DZ" };
export const isLocale = (value: unknown): value is Locale => locales.includes(value as Locale);
export const direction = (locale: Locale) => locale === "ar" ? "rtl" : "ltr";
