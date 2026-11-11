import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { LEGAL } from "@/lib/legal";
import { LegalLayout } from "../privacy/page";

export const metadata: Metadata = {
  title: "Conditions d’utilisation · DZ Exchange",
  description: "Règles d’utilisation de DZ Exchange : annonces, compte, comportements interdits et responsabilité.",
  alternates: { canonical: "/terms" },
};

export default async function TermsPage() {
  const locale = await getLocale();
  return <LegalLayout locale={locale} doc={LEGAL.terms[locale]} active="terms" />;
}
