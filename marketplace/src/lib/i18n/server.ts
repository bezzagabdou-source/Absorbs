import "server-only";
import { cookies } from "next/headers";
import { defaultLocale, isLocale, type Locale } from "./config";
import { translate, type TranslationParams } from "./dictionaries";
export async function getLocale(): Promise<Locale> { const value = (await cookies()).get("dz_locale")?.value; return isLocale(value) ? value : defaultLocale; }
export async function getTranslator() { const locale = await getLocale(); return { locale, t: (key: Parameters<typeof translate>[1], params?: TranslationParams) => translate(locale, key, params) }; }
