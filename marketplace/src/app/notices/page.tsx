import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Composants tiers et notices · DZ Exchange",
  description: "Licences open source des composants utilisés par l’application DZ Exchange et le site web.",
  alternates: { canonical: "/notices" },
  robots: { index: true, follow: true },
};

/**
 * Third-party notices / NOTICE file for the Uptodown listing.
 *
 * Apache-2.0 §4(d) requires the NOTICE of every Apache-licensed component to travel
 * with the distribution, so those are reproduced verbatim here. Every licence below
 * was read from the installed package metadata, not assumed.
 */
type Component = { name: string; version: string; license: string; copyright: string; url: string; notice?: boolean };

const web: Component[] = [
  { name: "Next.js", version: "16.4.5", license: "MIT", copyright: "© Vercel, Inc.", url: "https://github.com/vercel/next.js" },
  { name: "React", version: "19.2.6", license: "MIT", copyright: "© Meta Platforms, Inc. and affiliates", url: "https://github.com/facebook/react" },
  { name: "React DOM", version: "19.2.6", license: "MIT", copyright: "© Meta Platforms, Inc. and affiliates", url: "https://github.com/facebook/react" },
  { name: "Drizzle ORM", version: "0.45.2", license: "Apache-2.0", copyright: "© Drizzle Team", url: "https://github.com/drizzle-team/drizzle-orm", notice: true },
  { name: "node-postgres (pg)", version: "8.20.0", license: "MIT", copyright: "© 2010-2017 Brian Carlson", url: "https://github.com/brianc/node-postgres" },
  { name: "Zod", version: "4.6.7", license: "MIT", copyright: "© Colin McDonnell", url: "https://github.com/colinhacks/zod" },
  { name: "Firebase JavaScript SDK", version: "12.19.0", license: "Apache-2.0", copyright: "© Google LLC", url: "https://github.com/firebase/firebase-js-sdk", notice: true },
  { name: "Motion (framer-motion)", version: "14.9.1", license: "MIT", copyright: "© Framer B.V.", url: "https://github.com/motiondivision/motion" },
  { name: "Recharts", version: "3.10.1", license: "MIT", copyright: "© Recharts Group", url: "https://github.com/recharts/recharts" },
  { name: "Dexie.js", version: "4.4.7", license: "Apache-2.0", copyright: "© 2014-2017 David Fahlander", url: "https://github.com/dexie/Dexie.js", notice: true },
  { name: "sharp", version: "0.35.5", license: "Apache-2.0", copyright: "© Lovell Fuller and contributors", url: "https://github.com/lovell/sharp", notice: true },
  { name: "web-push", version: "3.6.7", license: "MPL-2.0", copyright: "© 2013-2024 Marco Castelluccio and contributors", url: "https://github.com/web-push-libs/web-push" },
  { name: "dotenv", version: "17.3.1", license: "BSD-2-Clause", copyright: "© 2015 Scott Motte", url: "https://github.com/motdotla/dotenv" },
  { name: "server-only", version: "0.0.1", license: "MIT", copyright: "© Vercel, Inc.", url: "https://github.com/vercel/server-only" },
];

/**
 * Deliberately empty: the Android shell is plain Java compiled against the platform
 * `android.jar` stub, and no third-party library, jar, AAR or font file is packaged
 * into the APK. The Android framework itself lives on the device and is never
 * redistributed by us, so no framework licence has to travel with the download.
 */
const android: Component[] = [];

function Row({ item }: { item: Component }) {
  // `data-label` lets the stylesheet turn each row into a self-describing card on
  // narrow screens, where a five-column table would otherwise be unreadable.
  return (
    <tr>
      <td data-label="Composant"><code>{item.name}</code></td>
      <td data-label="Version"><code>{item.version}</code></td>
      <td data-label="Licence">{item.license}</td>
      <td data-label="Copyright">{item.copyright}</td>
      <td data-label="Source"><a href={item.url} dir="ltr" rel="noreferrer noopener" target="_blank">code source</a></td>
    </tr>
  );
}

export default function NoticesPage() {
  return (
    <main className="market-container legal-page" dir="ltr" lang="fr">
      <nav className="legal-nav" aria-label="Informations légales">
        <Link href="/privacy">Confidentialité</Link>
        <Link href="/terms">Conditions</Link>
        <Link href="/license">Licence</Link>
        <Link className="active" href="/notices">Composants tiers</Link>
        <Link href="/account-deletion">Suppression du compte</Link>
        <Link href="/app">Application Android</Link>
      </nav>

      <article className="legal-card">
        <p className="section-kicker">DZ EXCHANGE · NOTICE</p>
        <h1>Composants tiers et notices</h1>
        <p className="legal-updated">Dernière mise à jour : 7 novembre 2026</p>
        <p className="legal-intro">
          L’application Android et le site web DZ Exchange intègrent des logiciels libres. Chaque composant reste
          régi par sa propre licence ; la liste ci-dessous indique le titulaire des droits et le dépôt d’origine.
          Les notices imposées par la licence Apache 2.0, article 4(d), des composants du site web sont reproduites à
          la fin de cette page.
        </p>

        <section>
          <h2>1. Site web</h2>
          <div className="notice-scroll">
            <table className="notice-table">
              <thead><tr><th>Composant</th><th>Version</th><th>Licence</th><th>Copyright</th><th>Source</th></tr></thead>
              <tbody>{web.map((item) => <Row key={item.name} item={item} />)}</tbody>
            </table>
          </div>
        </section>

        <section>
          <h2>2. Application Android</h2>
          <p>
            L’APK distribué est écrit uniquement en Java et ne contient <strong>aucune bibliothèque tierce</strong> :
            ni bibliothèque AndroidX, ni SDK Kotlin, ni SDK Google Play Services, ni fichier de police. Le fichier
            <code>android.jar</code> utilisé lors de la compilation n’est qu’une interface de référence du framework :
            il n’est pas embarqué dans l’APK. Le framework Android est fourni par le système d’exploitation de
            l’appareil et n’est pas redistribué par l’éditeur.
          </p>
          <p>
            En conséquence, l’APK ne contient aucun logiciel soumis à une licence tierce et aucune notice n’a à
            l’accompagner. Les composants listés à la section 1 concernent exclusivement le site web.
          </p>
        </section>

        <section>
          <h2>3. Textes de licence</h2>
          <p>
            Les textes intégraux sont disponibles aux adresses officielles suivantes :
          </p>
          <ul>
            <li><a href="https://www.apache.org/licenses/LICENSE-2.0" rel="noreferrer noopener" target="_blank" dir="ltr">Apache License 2.0</a></li>
            <li><a href="https://opensource.org/license/mit" rel="noreferrer noopener" target="_blank" dir="ltr">MIT License</a></li>
            <li><a href="https://opensource.org/license/bsd-2-clause" rel="noreferrer noopener" target="_blank" dir="ltr">BSD 2-Clause License</a></li>
            <li><a href="https://www.mozilla.org/MPL/2.0/" rel="noreferrer noopener" target="_blank" dir="ltr">Mozilla Public License 2.0</a></li>
          </ul>
        </section>

        <section>
          <h2>4. Notices Apache 2.0 reproduites</h2>
          <p>Les notices fournies par les composants Apache 2.0 distribués sont reproduites ici, sans modification.</p>
          <pre className="legal-pre">{`Dexie.js

Copyright (c) 2014-2017 David Fahlander

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`}</pre>
          <pre className="legal-pre">{`Drizzle ORM
Copyright 2019-present Drizzle Team

Firebase JavaScript SDK
Copyright 2017 Google LLC

sharp
Copyright 2013 Lovell Fuller and others.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`}</pre>
        </section>

        <section>
          <h2>5. Marques</h2>
          <p>
            Android, Google Play, Firebase et Google sont des marques de Google LLC. Les autres noms de produits
            et sociétés cités sont des marques de leurs détenteurs respectifs et sont utilisés à titre
            d’identification uniquement.
          </p>
        </section>

        <section>
          <h2>6. Contact</h2>
          <p>Pour toute question relative à ces licences : <a href="mailto:support@dzexchange.app">support@dzexchange.app</a>.</p>
        </section>

        <footer className="legal-footer">
          <p className="legal-links">
            <Link href="/license">Licence du logiciel</Link> · <Link href="/privacy">Confidentialité</Link> · <Link href="/terms">Conditions d’utilisation</Link>
          </p>
          <p><Link href="/">Retour au marché</Link></p>
        </footer>
      </article>
    </main>
  );
}
