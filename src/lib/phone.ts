/**
 * Phone helpers for SMS sign-in (client-safe, no secrets).
 * Firebase Phone Auth needs E.164 numbers (+<country><number>).
 */
export interface PhoneCountry {
  code: string; // dial prefix, e.g. "+213"
  flag: string;
  name: string;
}

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { code: "+213", flag: "🇩🇿", name: "الجزائر" },
  { code: "+212", flag: "🇲🇦", name: "المغرب" },
  { code: "+216", flag: "🇹🇳", name: "تونس" },
  { code: "+218", flag: "🇱🇾", name: "ليبيا" },
  { code: "+20", flag: "🇪🇬", name: "مصر" },
  { code: "+966", flag: "🇸🇦", name: "السعودية" },
  { code: "+971", flag: "🇦🇪", name: "الإمارات" },
  { code: "+33", flag: "🇫🇷", name: "فرنسا" },
  { code: "+1", flag: "🇺🇸", name: "USA / CA" },
];

const E164 = /^\+\d{8,15}$/;

/**
 * Turns what the user typed into E.164:
 *   0550 12 34 56  + +213  → +213550123456   (leading 0 of the local format is dropped)
 *   00213 550123456        → +213550123456
 *   +33 6 12 34 56 78      → +33612345678
 * Returns null when the result cannot be a real number.
 */
export function toE164(country: string, raw: string): string | null {
  const d = raw.trim().replace(/[\s\-().]/g, "");
  if (!d) return null;
  let candidate: string;
  if (d.startsWith("+")) candidate = d;
  else if (d.startsWith("00")) candidate = `+${d.slice(2)}`;
  else candidate = `${country}${d.replace(/^0/, "")}`;
  return E164.test(candidate) ? candidate : null;
}
