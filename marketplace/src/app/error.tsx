"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/marketplace/Icon";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { const { t } = useI18n(); return <main className="offline-page market-container"><span><Icon name="refresh" size={28} /></span><h1>{t("errorTitle")}</h1><p>{t("errorHint")}</p><button onClick={reset} className="button-dark">{t("retry")}</button><Link href="/">{t("backHome")}</Link></main>; }
