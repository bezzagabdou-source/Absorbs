import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Licence du logiciel · DZ Exchange",
  description: "Licence propriétaire du logiciel DZ Exchange (application Android et site web).",
  alternates: { canonical: "/license" },
  robots: { index: true, follow: true },
};

/**
 * Licence text for the Uptodown listing ("License Text URL").
 *
 * DZ Exchange is proprietary: the application's own code is not distributed under
 * an open-source licence. The open-source components it embeds keep their own
 * licences, which are listed on /notices.
 */
const UPDATED = "7 novembre 2026";

export default function LicensePage() {
  return (
    <main className="market-container legal-page" dir="ltr" lang="fr">
      <nav className="legal-nav" aria-label="Informations légales">
        <Link href="/privacy">Confidentialité</Link>
        <Link href="/terms">Conditions</Link>
        <Link className="active" href="/license">Licence</Link>
        <Link href="/notices">Composants tiers</Link>
        <Link href="/account-deletion">Suppression du compte</Link>
        <Link href="/app">Application Android</Link>
      </nav>

      <article className="legal-card">
        <p className="section-kicker">DZ EXCHANGE · INFORMATIONS LÉGALES</p>
        <h1>Licence du logiciel</h1>
        <p className="legal-updated">Dernière mise à jour : {UPDATED}</p>
        <p className="legal-intro">
          Le logiciel DZ Exchange — application Android (paquet <code>app.dzexchange.marketplace</code>) et site web
          <span dir="ltr"> https://marketplace-fixed.vercel.app</span> — est distribué sous licence propriétaire.
          Il n’est pas publié sous licence open source.
        </p>

        <section>
          <h2>1. Titulaire des droits</h2>
          <p>
            DZ Exchange, Alger, Algérie. Contact : <a href="mailto:support@dzexchange.app">support@dzexchange.app</a>.
          </p>
          <p>© 2026 DZ Exchange. Tous droits réservés.</p>
        </section>

        <section>
          <h2>2. Droit d’usage accordé</h2>
          <p>
            L’éditeur vous accorde un droit personnel, limité, non exclusif, non transférable et révocable
            d’installer et d’utiliser l’application sur les appareils que vous possédez ou contrôlez, pour votre
            usage privé et non commercial, conformément aux conditions d’utilisation publiées sur
            <Link href="/terms"> la page des conditions</Link>.
          </p>
        </section>

        <section>
          <h2>3. Utilisations interdites</h2>
          <p>
            Sont interdits sans autorisation écrite préalable de l’éditeur : la reproduction, la distribution, la
            vente, la location ou le prêt de l’application ; sa décompilation, son désassemblage ou son ingénierie
            inverse, sauf dans les cas où la loi l’autorise expressément ; la modification, l’adaptation ou la
            création d’œuvres dérivées ; le retrait ou la dissimulation des mentions de droits d’auteur,
            des marques et des mentions légales ; l’usage des marques, du logo ou de l’identité visuelle DZ Exchange.
          </p>
        </section>

        <section>
          <h2>4. Contenu publié par les utilisateurs</h2>
          <p>
            Les annonces, photos et messages que vous publiez restent votre propriété. En les publiant, vous
            accordez à DZ Exchange une licence mondiale, non exclusive et gratuite de les héberger, reproduire,
            adapter techniquement (miniatures, formats d’image) et afficher dans le cadre du service, pendant la
            durée de leur publication.
          </p>
        </section>

        <section>
          <h2>5. Composants tiers</h2>
          <p>
            L’application intègre des bibliothèques open source, chacune régie par sa propre licence (MIT,
            Apache 2.0, BSD, ISC, MPL 2.0). La liste complète, les titulaires de droits et les textes applicables
            figurent sur <Link href="/notices">la page des mentions des composants tiers</Link>. Ces licences
            prévalent sur la présente licence pour les éléments concernés.
          </p>
        </section>

        <section>
          <h2>6. Marques et services tiers</h2>
          <p>
            « Google », « Google Play », « Firebase » et « Android » sont des marques de Google LLC. DZ Exchange
            n’est ni affilié à Google LLC ni approuvé par cette société. Uptodown est une marque de ses
            propriétaires respectifs.
          </p>
        </section>

        <section>
          <h2>7. Absence de garantie et responsabilité</h2>
          <p>
            Le logiciel est fourni « en l’état », sans garantie d’aucune sorte, expresse ou implicite, y compris
            les garanties de qualité marchande, d’adéquation à un usage particulier et d’absence de contrefaçon.
            Dans les limites permises par la loi algérienne, l’éditeur ne peut être tenu responsable des dommages
            indirects résultant de l’usage du logiciel.
          </p>
        </section>

        <section>
          <h2>8. Durée et résiliation</h2>
          <p>
            La licence prend fin si vous cessez d’utiliser l’application, si vous supprimez votre compte ou en cas
            de violation des présentes conditions. À la fin de la licence, vous devez désinstaller l’application.
          </p>
        </section>

        <section>
          <h2>9. Droit applicable</h2>
          <p>
            La présente licence est régie par le droit algérien. Tout litige relève des tribunaux compétents
            d’Alger, sous réserve des règles impératives protégeant les consommateurs.
          </p>
        </section>

        <section>
          <h2>10. Contact</h2>
          <p>
            Pour toute demande de licence, de partenariat, de presse ou de signalement :
            <a href="mailto:support@dzexchange.app"> support@dzexchange.app</a>.
          </p>
        </section>

        <footer className="legal-footer">
          <p className="legal-links">
            <Link href="/notices">Mentions des composants tiers</Link> · <Link href="/privacy">Confidentialité</Link> · <Link href="/terms">Conditions d’utilisation</Link>
          </p>
          <p><Link href="/">Retour au marché</Link></p>
        </footer>
      </article>
    </main>
  );
}
