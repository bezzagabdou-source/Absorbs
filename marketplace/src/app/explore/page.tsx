import { Suspense } from "react";
import { ExploreClient } from "@/components/marketplace/ExploreClient";
import { getTranslator } from "@/lib/i18n/server";
export const dynamic = "force-dynamic";
export async function generateMetadata() { return { title: (await getTranslator()).t("explore") }; }
export default function ExplorePage() { return <Suspense fallback={<div className="loading-state">…</div>}><ExploreClient /></Suspense>; }
