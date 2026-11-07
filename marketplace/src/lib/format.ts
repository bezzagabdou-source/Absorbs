import { intlLocales, type Locale } from "./i18n/config";
import { translate } from "./i18n/dictionaries";
export function formatPrice(price: number, locale: Locale = "fr") { return new Intl.NumberFormat(intlLocales[locale], { style: "currency", currency: "DZD", maximumFractionDigits: price % 1 ? 2 : 0 }).format(price); }
export function formatDate(value: string | Date, locale: Locale = "fr", options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) { return new Intl.DateTimeFormat(intlLocales[locale], options).format(new Date(value)); }
export function formatNumber(value: number, locale: Locale = "fr") { return new Intl.NumberFormat(intlLocales[locale]).format(value); }
export function conditionLabel(condition: string, locale: Locale) { return translate(locale, condition as "new"); }
export function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
