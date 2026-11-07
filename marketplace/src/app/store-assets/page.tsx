import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Store assets",
  description: "Uptodown upload sheet: icon, featured banner and screenshots.",
  alternates: { canonical: "/store-assets" },
  robots: { index: false, follow: false },
};

type Asset = { file: string; label: string; size: string; note: string; kind: string };

const featured: Asset[] = [
  { file: "featured-1024x500.png", label: "Featured image", size: "1024 × 500", note: "Required exact size for Uptodown featured slots.", kind: "featured" },
];

const icons: Asset[] = [
  { file: "icon-512.png", label: "Icon", size: "512 × 512", note: "Uptodown asks for a minimum of 256 × 256, PNG.", kind: "icon" },
];

const shots: Asset[] = [
  { file: "s1-home.png", label: "Home", size: "1080 × 1920", note: "Hero, search and categories.", kind: "shot" },
  { file: "s2-explore.png", label: "Explore", size: "1080 × 1920", note: "Listing grid with real product photos.", kind: "shot" },
  { file: "s3-product.png", label: "Listing", size: "1080 × 1920", note: "Gallery, price, seller and offer button.", kind: "shot" },
  { file: "s4-ai.png", label: "AI assistant", size: "1080 × 1920", note: "Assistant answering a real query.", kind: "shot" },
  { file: "s5-download.png", label: "Android page", size: "1080 × 1920", note: "APK details, size, permissions and signature.", kind: "shot" },
];

function Card({ a }: { a: Asset }) {
  const jpg = a.file.replace(/\.png$/, ".jpg");
  return (
    <article className={`asset-card ${a.kind}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/store/final/${a.file}`} alt={`${a.label} — ${a.size}`} loading="lazy" />
      <div className="asset-copy">
        <h2>{a.label}</h2>
        <p className="asset-size">{a.size}</p>
        <p className="asset-note">{a.note}</p>
        <div className="asset-actions">
          <a className="button-dark" href={`/store/final/${a.file}`} download={a.file}>
            Download PNG
          </a>
          {a.kind === "shot" && (
            <a className="subtle-link" href={`/store/final/${jpg}`} download={jpg}>
              JPEG
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default function StoreAssetsPage() {
  return (
    <main className="market-container store-assets" dir="ltr" lang="en">
      <header className="store-assets-head">
        <p className="section-kicker">DZ EXCHANGE · UPTODOWN UPLOAD SHEET</p>
        <h1>Store assets</h1>
        <p className="store-assets-intro">
          Everything the Uptodown Console asks for, in upload order. Tap a file to open it, then long-press to save it
          on your phone — or use the download button on desktop. All screenshots are 1080 × 1920 (9:16) 24-bit PNG with
          no transparency, which is what the console accepts.
        </p>
      </header>

      <section>
        <h2 className="store-assets-section">1. Featured images</h2>
        <p className="store-assets-hint">Exact resolution 1024 × 500. Used in cards and themed listings.</p>
        <div className="asset-grid">{featured.map((a) => <Card key={a.file} a={a} />)}</div>
      </section>

      <section>
        <h2 className="store-assets-section">2. Icon</h2>
        <div className="asset-grid">{icons.map((a) => <Card key={a.file} a={a} />)}</div>
      </section>

      <section>
        <h2 className="store-assets-section">3. Screenshots</h2>
        <p className="store-assets-hint">Upload in this order; Uptodown lets you drag to reorder afterwards.</p>
        <div className="asset-grid">{shots.map((a) => <Card key={a.file} a={a} />)}</div>
      </section>

      <footer className="store-assets-foot">
        <p>
          App: DZ Exchange 1.1 · package <code>app.dzexchange.marketplace</code> · APK{" "}
          <a href="/download/apk">/download/apk</a>
        </p>
      </footer>
    </main>
  );
}
