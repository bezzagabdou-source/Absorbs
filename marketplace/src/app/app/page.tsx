import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/marketplace/Icon";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/dictionaries";
import { readApkInfo } from "@/lib/server/apk";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DZ Exchange pour Android · Télécharger l’APK officiel",
  description: "Téléchargez l’application Android officielle de DZ Exchange : achetez et vendez partout en Algérie, avec notifications et pages plus rapides.",
  alternates: { canonical: "/app" },
  openGraph: { title: "DZ Exchange pour Android", description: "L’application officielle du marché algérien DZ Exchange.", images: ["/icons/icon-512.png"] },
};

export default async function DownloadPage() {
  const locale = await getLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const apk = await readApkInfo();
  const size = apk ? `${Math.max(1, Math.round(apk.bytes / 1024))} KB` : "—";
  // Real captures shipped with the site (store/screenshots, 1080×1920).
  const shots = ["s1-home", "s2-explore", "s3-product", "s4-ai", "s5-download"];
  return <main className="market-container download-page">
    <section className="download-hero">
      <div className="download-copy">
        <p className="section-kicker">ANDROID · {apk?.versionName ?? "1.1"}</p>
        <h1>{t("appTitle")}</h1>
        <p className="download-lead">{t("appDescription")}</p>
        <Link className="button-dark download-button" href="/download/apk"><Icon name="download" size={18} />{t("appDownload")}</Link>
        <p className="download-note"><Icon name="shieldCheck" size={15} />{t("appInstallHint")}</p>
        <ul className="download-facts">
          <li><span>{t("appVersion")}</span><b>{apk?.versionName ?? "—"}</b></li>
          <li><span>{t("appSize")}</span><b>{size}</b></li>
          <li><span>{t("appUpdated")}</span><b>{apk ? new Date(`${apk.updated}T00:00:00Z`).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" }) : "—"}</b></li>
          <li><span>{t("appPermissions")}</span><b>{t("appPermissionsValue")}</b></li>
        </ul>
        <p className="download-checksum"><span>{t("appChecksum")}</span><code dir="ltr">{apk?.sha256 ?? "—"}</code></p>
      </div>
      <div className="download-visual">
        <div className="phone-frame">
          {/* eslint-disable-next-line @next/next/no-img-element -- static store screenshot */}
          <img src={`/store/screenshots/${shots[0]}.png`} alt={t("appTitle")} width={1080} height={1920} />
        </div>
      </div>
    </section>
    <section className="download-gallery">
      <h2>{t("appTitle")}</h2>
      <div className="download-shots">
        {shots.slice(1).map((shot, index) => (
          // eslint-disable-next-line @next/next/no-img-element -- static store screenshots
          <img key={shot} src={`/store/screenshots/${shot}.png`} alt={`${t("appTitle")} ${index + 2}`} width={1080} height={1920} loading="lazy" />
        ))}
      </div>
    </section>
    <section className="download-legal">
      <h2>{t("appLegal")}</h2>
      <div>
        <Link href="/privacy">{t("privacyPolicy")}</Link>
        <Link href="/terms">{t("termsOfUse")}</Link>
        <Link href="/account-deletion">{t("deleteAccount")}</Link>
      </div>
    </section>
  </main>;
}
