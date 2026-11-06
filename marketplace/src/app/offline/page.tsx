import Link from "next/link";
import { Icon } from "@/components/marketplace/Icon";
import { getTranslator } from "@/lib/i18n/server";
export default async function OfflinePage() { const { t } = await getTranslator(); return <main className="offline-page market-container"><span><Icon name="wifi" size={28} /></span><p className="section-kicker">{t("offlineMode")}</p><h1>{t("offlineTitle")}</h1><p>{t("offlineHint")}</p><Link href="/explore" className="button-dark">{t("retry")}<Icon name="refresh" size={16} /></Link></main>; }
