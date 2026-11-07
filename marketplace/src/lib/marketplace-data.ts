export type ProductCondition = "new" | "like_new" | "good" | "fair" | "for_parts";
export type LocalizedText = { ar: string; en: string; fr: string };
export type MarketProduct = {
  id: string; sellerId: string; title: string; description: string;
  categoryId: string | null; category: LocalizedText | null; categorySlug: string | null;
  price: number; condition: ProductCondition; wilayaCode: string | null;
  wilaya: LocalizedText | null; commune: string; image: string; images: string[];
  sellerName: string; sellerVerified: boolean; trustTier: 0 | 1 | 2 | 3;
  delivery: boolean; escrow: boolean; postedAt: string; viewCount: number;
};
export type CategoryOption = { id: string; slug: string; name: LocalizedText; icon: string; count: number };
export type WilayaOption = { id: string; code: string; name: LocalizedText };
export type ReferenceData = { categories: CategoryOption[]; wilayas: WilayaOption[] };
export type ListingPage = { items: MarketProduct[]; total: number; nextCursor: string | null; source: "database" };
export type ApiErrorBody = { error: { code: string; fields?: Record<string, string[]> } };
export { wilayas } from "./wilayas";
