"use client";
import Link from "next/link";
import { Icon } from "./Icon";
import { useMarketplace } from "./marketplace-provider";
import { useI18n } from "@/lib/i18n/client";
import { conditionLabel, formatDate, formatPrice, initials } from "@/lib/format";
import type { MarketProduct } from "@/lib/marketplace-data";
export function ProductCard({ product, index = 0 }: { product: MarketProduct; index?: number }) {
  const { isFavorite, toggleFavorite, notify } = useMarketplace(); const { t, locale } = useI18n(); const favorite = isFavorite(product.id);
  return <article data-testid="product-card" className="product-card" style={{ animationDelay: `${index * 35}ms` }}>
    <Link className="product-card-image" href={`/product/${product.id}`} style={product.image ? { backgroundImage: `url("${product.image}")` } : undefined} aria-label={t("viewListing", { title: product.title })}>{!product.image && <span className="image-placeholder"><Icon name="camera" size={32} /></span>}<span className="image-condition">{conditionLabel(product.condition, locale)}</span></Link>
    <button className={`favorite-button ${favorite ? "is-favorite" : ""}`} onClick={() => { toggleFavorite(product.id); notify(t(favorite ? "favoriteRemoved" : "favoriteAdded")); }} aria-label={t(favorite ? "favoriteRemove" : "favoriteAdd")} aria-pressed={favorite}><Icon name="heart" size={18} /></button>
    <div className="product-card-copy"><div className="product-card-meta"><span>{product.category?.[locale] ?? t("other")}</span><span className="posted-time">{formatDate(product.postedAt, locale, { day: "numeric", month: "short" })}</span></div><Link className="product-card-title" href={`/product/${product.id}`}>{product.title}</Link><div className="product-price-row"><strong>{formatPrice(product.price, locale)}</strong></div><div className="product-card-bottom"><span className="product-location"><Icon name="pin" size={13} />{product.commune}{product.wilaya ? `, ${product.wilaya[locale]}` : ""}</span><span className={`seller-mini ${product.sellerVerified ? "verified" : ""}`} title={t(product.sellerVerified ? "verifiedSeller" : "unverifiedSeller")}><span>{initials(product.sellerName)}</span>{product.sellerVerified && <Icon name="verified" size={12} />}</span></div><div className="product-assurances">{product.delivery && <span><Icon name="truck" size={12} />{t("delivery")}</span>}{product.escrow && <span><Icon name="shieldCheck" size={12} />{t("escrow")}</span>}</div></div>
  </article>;
}
