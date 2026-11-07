import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/marketplace/Icon";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/dictionaries";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Politique de confidentialité · DZ Exchange",
  description: "Comment DZ Exchange collecte, utilise et protège vos données personnelles.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

export default async function PrivacyPage() {
  const locale = await getLocale();
  const doc = LEGAL.privacy[locale];
  return <LegalLayout locale={locale} doc={doc} active="privacy" />;
}

export function LegalLayout({ doc, active, locale }: { doc: { title: string; intro: string; updated: string; sections: { heading: string; body: string[] }[] }; active: "privacy" | "terms" | "deletion"; locale: "ar" | "en" | "fr" }) {
  return <main className="market-container legal-page">
    <nav className="legal-nav" aria-label={LEGAL.labels[locale].legal}>
      <Link className={active === "privacy" ? "active" : ""} href="/privacy">{LEGAL.labels[locale].privacy}</Link>
      <Link className={active === "terms" ? "active" : ""} href="/terms">{LEGAL.labels[locale].terms}</Link>
      <Link className={active === "deletion" ? "active" : ""} href="/account-deletion">{LEGAL.labels[locale].deletion}</Link>
      <Link href="/app">{LEGAL.labels[locale].app}</Link>
    </nav>
    <article className="legal-card">
      <p className="section-kicker">DZ EXCHANGE · {LEGAL.labels[locale].legal}</p>
      <h1>{doc.title}</h1>
      <p className="legal-updated"><Icon name="info" size={14} />{doc.updated}</p>
      <p className="legal-intro">{doc.intro}</p>
      {doc.sections.map((section, index) => <section key={section.heading}>
        <h2>{index + 1}. {section.heading}</h2>
        {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </section>)}
      <footer className="legal-footer">
        <p>{LEGAL.labels[locale].contact}: <a href="mailto:support@dzexchange.app">support@dzexchange.app</a></p>
        <p><Link href="/">{LEGAL.labels[locale].back}</Link></p>
      </footer>
    </article>
  </main>;
}

export type LegalReactNode = ReactNode;
