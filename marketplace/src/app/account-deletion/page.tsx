import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { LEGAL } from "@/lib/legal";
import { LegalLayout } from "../privacy/page";

export const metadata: Metadata = {
  title: "Suppression du compte · DZ Exchange",
  description: "Comment supprimer définitivement votre compte et vos données DZ Exchange.",
  alternates: { canonical: "/account-deletion" },
};

export default async function AccountDeletionPage() {
  const locale = await getLocale();
  return <LegalLayout locale={locale} doc={LEGAL.deletion[locale]} active="deletion" />;
}
