import { z } from "zod";

export const localeSchema = z.enum(["ar", "en", "fr"]);
export const uuidSchema = z.uuid();
export const conditionSchema = z.enum(["new", "like_new", "good", "fair", "for_parts"]);
export const sortSchema = z.enum(["relevance", "newest", "price_asc", "price_desc"]);
export const moneySchema = z.number().finite().positive().max(999999999999).multipleOf(0.01);
export const uploadedMediaPathSchema = z.string().regex(/^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
export const imageSchema = z.string().max(2048).refine((value) => {
  if (uploadedMediaPathSchema.safeParse(value).success) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}, "HTTPS image URL or uploaded media path required");
const emptyToUndefined = (value: unknown) => value === "" || value === null ? undefined : value;
export const listingFiltersSchema = z.object({
  q: z.string().trim().max(100).default(""),
  ids: z.preprocess(emptyToUndefined, z.string().max(4000).transform((value) => value.split(",")).pipe(z.array(uuidSchema).min(1).max(48)).optional()),
  wilaya: z.preprocess(emptyToUndefined, z.string().regex(/^(0[1-9]|[1-4][0-9]|5[0-8])$/).optional()),
  category: z.preprocess(emptyToUndefined, z.string().regex(/^[a-z0-9-]{1,120}$/).optional()),
  condition: z.preprocess(emptyToUndefined, conditionSchema.optional()),
  minPrice: z.preprocess(emptyToUndefined, z.coerce.number().finite().min(0).max(999999999999).optional()),
  maxPrice: z.preprocess(emptyToUndefined, z.coerce.number().finite().positive().max(999999999999).optional()),
  delivery: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  escrow: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  sort: sortSchema.default("relevance"),
  cursor: z.preprocess(emptyToUndefined, z.string().max(500).optional()),
  limit: z.coerce.number().int().min(1).max(48).default(24),
}).strict().refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, { path: ["minPrice"], message: "price_range" });
export type ListingFilters = z.infer<typeof listingFiltersSchema>;
export const listingInputSchema = z.object({
  title: z.string().trim().min(5).max(180), description: z.string().trim().min(20).max(5000),
  priceDzd: moneySchema, costDzd: z.preprocess(emptyToUndefined, z.number().finite().min(0).max(999999999999).multipleOf(0.01).optional()),
  categoryId: uuidSchema, wilayaCode: z.string().regex(/^(0[1-9]|[1-4][0-9]|5[0-8])$/),
  commune: z.string().trim().min(2).max(120), condition: conditionSchema,
  images: z.array(imageSchema).min(1).max(8), deliveryAvailable: z.boolean(),
}).strict();
export const listingUpdateSchema = listingInputSchema.partial().extend({ status: z.enum(["active", "archived", "sold"]).optional() }).strict();
export const offerInputSchema = z.object({ productId: uuidSchema, amountDzd: moneySchema, message: z.string().trim().max(500).default(""), requestKey: uuidSchema }).strict();
export const offerUpdateSchema = z.object({ status: z.enum(["accepted", "rejected", "countered", "withdrawn"]), counterAmountDzd: moneySchema.optional() }).strict().refine((v) => v.status !== "countered" || v.counterAmountDzd !== undefined, { path: ["counterAmountDzd"], message: "required" });
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2048).refine((v) => { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && !u.port; }),
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{86,88}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22,24}$/) }).strict(),
  locale: localeSchema,
}).strict();
export const preferencesSchema = z.object({ offers: z.boolean(), listings: z.boolean(), push: z.boolean() }).strict();
export const credentialsSchema = z.object({ email: z.email().max(320).transform((v) => v.toLowerCase()), password: z.string().min(12).max(128) }).strict();
export const registerSchema = credentialsSchema.extend({ displayName: z.string().trim().min(2).max(120), role: z.enum(["buyer", "seller"]).default("buyer"), locale: localeSchema.default("fr") }).strict();
export const savedSearchSchema = z.object({ query: z.string().trim().max(100).default(""), wilaya: z.string().regex(/^(0[1-9]|[1-4][0-9]|5[0-8])$/).optional(), category: uuidSchema.optional(), maxPrice: moneySchema.optional() }).strict();
export const idSchema = z.object({ id: uuidSchema }).strict();
export const dashboardQuerySchema = z.object({ days: z.coerce.number().int().refine((v) => [7, 30, 90].includes(v)).default(30) }).strict();
export const notificationUpdateSchema = z.object({ ids: z.array(uuidSchema).min(1).max(100).optional(), all: z.boolean().default(false) }).strict();
export const messageInputSchema = z.object({ body: z.string().trim().min(1).max(4000) }).strict();
export function parseQuery<T>(schema: z.ZodType<T>, params: URLSearchParams): T {
  return schema.parse(Object.fromEntries(params.entries())) as T;
}
