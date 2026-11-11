import { SettingsPage } from "@/components/marketplace/SettingsPage";
import { getTranslator } from "@/lib/i18n/server";
import { z } from "zod";
export async function generateMetadata() { return { title: (await getTranslator()).t("settings"), robots: { index: false } }; }
const sectionSchema = z.enum(["general", "security", "preferences", "notifications", "payments"]);
export default async function SettingsRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { const params = await searchParams; const parsed = sectionSchema.safeParse(Array.isArray(params.section) ? params.section[0] : params.section); return <SettingsPage key={parsed.data ?? "general"} initialSection={parsed.data ?? "general"} />; }
