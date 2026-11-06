"use client";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { MarketplaceHeader } from "./MarketplaceHeader";
import { MarketplaceProvider, useMarketplace } from "./marketplace-provider";
import { MobileDock } from "./MobileDock";
import { I18nProvider, useI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import type { ReferenceData } from "@/lib/marketplace-data";
function ToastViewport() { const { toast } = useMarketplace(); return toast ? <div className="toast-viewport" role="status"><span><Icon name="check" size={15} /></span>{toast}</div> : null; }
function Content({ children }: { children: ReactNode }) { const { t } = useI18n(); const { demo } = useMarketplace(); return <>{demo && <div className="demo-banner"><Icon name="info" size={13} />{t("demoMode")}</div>}<a className="skip-link" href="#main-content">{t("skipToContent")}</a><MarketplaceHeader /><div className="app-main" id="main-content" tabIndex={-1}>{children}</div><MobileDock /><ToastViewport /></>; }
export function MarketplaceShell({ children, locale, reference }: { children: ReactNode; locale: Locale; reference: ReferenceData }) { return <I18nProvider locale={locale}><MarketplaceProvider reference={reference}><Content>{children}</Content></MarketplaceProvider></I18nProvider>; }
