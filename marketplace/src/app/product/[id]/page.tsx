import { notFound } from "next/navigation";
import { ProductDetails } from "@/components/marketplace/ProductDetails";
import { getProduct } from "@/features/catalog/queries";
import { withActor } from "@/db";
import { priceHistory } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const product = await getProduct(id); return { title: product?.title ?? "DZ Exchange", description: product?.description.slice(0, 160) }; }
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const product = await getProduct(id); if (!product) notFound(); const history = await withActor(null, (tx) => tx.select({ price: priceHistory.priceDzd, date: priceHistory.capturedAt }).from(priceHistory).where(eq(priceHistory.productId, id)).orderBy(asc(priceHistory.capturedAt)).limit(30)); return <ProductDetails product={product} history={history.map((p) => ({ price: Number(p.price), date: p.date.toISOString() }))} />; }
