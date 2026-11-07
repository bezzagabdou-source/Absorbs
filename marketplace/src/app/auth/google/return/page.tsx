import type { Metadata } from "next";
import Link from "next/link";
import { AppReturn } from "@/components/marketplace/AppReturn";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Retour à l’application · DZ Exchange",
  robots: { index: false, follow: false },
};

/**
 * Sends the freshly minted single-use code back to the Android app.
 * The code is in the URL, is valid for 120 seconds and can be redeemed once.
 */
export default async function GoogleReturnPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  if (!code || !/^[A-Za-z0-9_-]{43}$/.test(code)) {
    return (
      <main className="market-container legal-page">
        <div className="legal-card">
          <h1>Lien incomplet</h1>
          <p className="legal-intro">Ce lien de connexion a expiré. Ouvrez DZ Exchange et relancez la connexion Google.</p>
          <Link className="button-outline" href="/app">Télécharger l’application</Link>
        </div>
      </main>
    );
  }
  return (
    <main className="market-container legal-page">
      <div className="legal-card auth-card">
        <p className="section-kicker">DZ EXCHANGE</p>
        <h1>Connexion réussie</h1>
        <p className="legal-intro">Retour à l’application en cours… Si rien ne se passe, appuyez sur le bouton ci-dessous.</p>
        <AppReturn code={code} />
      </div>
    </main>
  );
}
