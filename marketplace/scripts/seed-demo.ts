import { config } from "dotenv"; config({ path: ".env.local", quiet: true }); config({ quiet: true });
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { users, products, categories, wilayas, escrowTransactions, productViews, offers } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { sampleProducts } from "./demo-catalog";
async function main() {
  if (process.env.NODE_ENV === "production" || process.env.DEMO_MODE !== "true") throw new Error("Demo fixtures require non-production DEMO_MODE=true");
  const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL }); const db = drizzle(pool);
  try {
    const password = await hashPassword("Preview-Only-2026!");
    const [seller] = await db.insert(users).values({ email: "seller@preview.invalid", displayName: "Demo Seller", role: "seller", passwordHash: password, locale: "ar" }).onConflictDoUpdate({ target: users.email, set: { displayName: "Demo Seller" } }).returning();
    const [buyer] = await db.insert(users).values({ email: "buyer@preview.invalid", displayName: "Demo Buyer", role: "buyer", passwordHash: password, locale: "ar" }).onConflictDoUpdate({ target: users.email, set: { displayName: "Demo Buyer" } }).returning();
    const cats = await db.select().from(categories); const places = await db.select().from(wilayas);
    for (const fixture of sampleProducts) {
      const existing = await db.select({ id: products.id }).from(products).where(eq(products.title, fixture.title)).limit(1); if (existing.length) continue;
      const cat = cats.find((c) => fixture.category.toLowerCase().includes(c.slug.split("-")[0]) || (fixture.category === "Électronique" && c.slug === "electronics") || (fixture.category === "Maison" && c.slug === "home-garden") || (fixture.category === "Sports & loisirs" && c.slug === "sports-leisure")) ?? cats.find((c) => c.slug === "other")!;
      const place = places.find((w) => w.nameFr === fixture.wilaya) ?? places[0];
      const [product] = await db.insert(products).values({ sellerId: seller.id, title: fixture.title, description: fixture.description, categoryId: cat.id, wilayaId: place.id, commune: fixture.commune, priceDzd: fixture.price.toFixed(2), costDzd: (fixture.price * 0.72).toFixed(2), condition: fixture.condition === "Neuf" ? "new" : fixture.condition === "Comme neuf" ? "like_new" : "good", images: fixture.images, deliveryAvailable: fixture.delivery, escrowEligible: false, createdAt: new Date(Date.now() - sampleProducts.indexOf(fixture) * 3600000) }).returning();
      for (let day = 0; day < 30; day++) await db.insert(productViews).values({ productId: product.id, day: new Date(Date.now() - day * 86400000), count: 3 + ((day * 7 + fixture.price) % 19) });
      if (sampleProducts.indexOf(fixture) < 3) {
        await db.insert(offers).values({ productId: product.id, buyerId: buyer.id, sellerId: seller.id, amountDzd: (fixture.price * 0.9).toFixed(2), message: "Development fixture offer", createdAt: new Date(Date.now() - 86400000) });
        await db.insert(escrowTransactions).values({ productId: product.id, buyerId: buyer.id, sellerId: seller.id, amountDzd: fixture.price.toFixed(2), status: "released", paymentProvider: "development-fixture", releasedAt: new Date(Date.now() - (sampleProducts.indexOf(fixture) * 4 + 1) * 86400000) });
      }
    }
    console.log("Explicit development fixtures seeded. No real payments or verified identities.");
  } finally { await pool.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
