import { Suspense } from "react";
import { ChatWorkspace } from "@/components/marketplace/ChatWorkspace";
import { getTranslator } from "@/lib/i18n/server";
export async function generateMetadata() { return { title: (await getTranslator()).t("messages"), robots: { index: false } }; }
export default function ChatPage() { return <Suspense fallback={<div className="loading-state">…</div>}><ChatWorkspace /></Suspense>; }
