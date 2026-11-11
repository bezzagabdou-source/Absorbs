"use client";
import { useI18n } from "@/lib/i18n/client";
export default function Loading() { const { t } = useI18n(); return <div className="loading-state page-loading" role="status"><span className="spinner" />{t("loading")}</div>; }
