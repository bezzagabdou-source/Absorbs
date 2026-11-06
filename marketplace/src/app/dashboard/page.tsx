import { Suspense } from "react";
import { DashboardPage } from "@/components/marketplace/DashboardPage";
import { getTranslator } from "@/lib/i18n/server";
export async function generateMetadata() { return { title: (await getTranslator()).t("dashboard"), robots: { index: false } }; }
export default function DashboardRoute() { return <Suspense fallback={<div className="loading-state">…</div>}><DashboardPage /></Suspense>; }
