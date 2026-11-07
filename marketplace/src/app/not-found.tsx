"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { Icon } from "@/components/marketplace/Icon";
export default function NotFound() { const { t } = useI18n(); return <main className="offline-page market-container"><span><Icon name="search" size={28} /></span><h1>{t("notFoundTitle")}</h1><p>{t("notFoundHint")}</p><Link href="/" className="button-dark">{t("backHome")}<Icon name="arrow" className="directional" size={16} /></Link></main>; }
