import { describe, expect, it } from "vitest";
import { dictionaries, translate } from "@/lib/i18n/dictionaries";
import { direction, locales } from "@/lib/i18n/config";
import { formatPrice } from "@/lib/format";
describe("complete locale contracts", () => {
  it("has identical nonempty keys in Arabic, English and French", () => { const keys = Object.keys(dictionaries.en).sort(); for (const locale of locales) { expect(Object.keys(dictionaries[locale]).sort()).toEqual(keys); for (const value of Object.values(dictionaries[locale])) expect(value.trim().length).toBeGreaterThan(0); } });
  it("preserves interpolation in every locale", () => { for (const locale of locales) for (const [key, value] of Object.entries(dictionaries.en)) { expect([...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()).toEqual([...dictionaries[locale][key as keyof typeof dictionaries.en].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()); } });
  it("sets direction and formats DZD without hardcoded French", () => { expect(direction("ar")).toBe("rtl"); expect(direction("en")).toBe("ltr"); expect(direction("fr")).toBe("ltr"); expect(translate("ar", "listingsCount", { count: 3 })).toBe("3 إعلان"); expect(formatPrice(1200, "ar")).toContain("د.ج"); expect(formatPrice(1200, "en")).toContain("DZD"); });
});
