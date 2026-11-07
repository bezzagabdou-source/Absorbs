import { z } from "zod";
import { localeSchema } from "@/lib/validation/schemas";
export const aiAssistInputSchema = z.object({
  mode: z.enum(["listing", "search", "safety"]),
  prompt: z.string().trim().min(3).max(1200),
  locale: localeSchema,
  category: z.string().trim().max(120).optional(),
  condition: z.enum(["new", "like_new", "good", "fair", "for_parts"]).optional(),
}).strict();
export const aiAssistOutputSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().min(20).max(5000).optional(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
  advice: z.string().trim().min(1).max(3000),
}).strict();
export const aiAssistOutputWithSourceSchema = aiAssistOutputSchema.extend({ source: z.enum(["ai", "offline"]), provider: z.string().max(80).optional() }).strict();
export type AiAssistInput = z.infer<typeof aiAssistInputSchema>;
export type AiAssistOutput = z.infer<typeof aiAssistOutputSchema>;
