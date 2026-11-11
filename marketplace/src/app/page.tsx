import { HomeMarketplace } from "@/components/marketplace/HomeMarketplace";
import { searchListings } from "@/features/catalog/queries";
import { listingFiltersSchema } from "@/lib/validation/schemas";
import type { ListingPage } from "@/lib/marketplace-data";
export const dynamic = "force-dynamic";
export default async function HomePage() { let data: ListingPage | null = null; let error = false; try { data = await searchListings(listingFiltersSchema.parse({ sort: "newest", limit: 8 })); } catch { error = true; } return <HomeMarketplace data={data} error={error} />; }
