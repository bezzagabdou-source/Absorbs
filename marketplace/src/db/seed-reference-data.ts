import { config } from "dotenv";
config({ path: ".env.local", quiet: true }); config({ quiet: true });
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { categories, wilayas as wilayaTable } from "@/db/schema";
import { wilayas } from "@/lib/wilayas";
export const categoryRows = [
  { slug: "electronics", nameEn: "Electronics", nameFr: "Électronique", nameAr: "إلكترونيات", icon: "devices", sortOrder: 1 },
  { slug: "vehicles", nameEn: "Vehicles", nameFr: "Véhicules", nameAr: "مركبات", icon: "car", sortOrder: 2 },
  { slug: "home-garden", nameEn: "Home & garden", nameFr: "Maison & jardin", nameAr: "المنزل والحديقة", icon: "home", sortOrder: 3 },
  { slug: "real-estate", nameEn: "Real estate", nameFr: "Immobilier", nameAr: "عقارات", icon: "building", sortOrder: 4 },
  { slug: "fashion", nameEn: "Fashion", nameFr: "Mode", nameAr: "أزياء", icon: "shirt", sortOrder: 5 },
  { slug: "sports-leisure", nameEn: "Sports & leisure", nameFr: "Sports & loisirs", nameAr: "رياضة وترفيه", icon: "sparkles", sortOrder: 6 },
  { slug: "services", nameEn: "Services", nameFr: "Services", nameAr: "خدمات", icon: "briefcase", sortOrder: 7 },
  { slug: "other", nameEn: "Other", nameFr: "Autres", nameAr: "أخرى", icon: "grid", sortOrder: 8 },
];
export async function seedReferenceData() {
  const url = process.env.DATABASE_MIGRATION_URL; if (!url) throw new Error("DATABASE_MIGRATION_URL required");
  const schema = process.env.DB_SCHEMA || "public"; if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid DB_SCHEMA"); const pool = new Pool({ connectionString: url, options: `-c search_path=${schema},public` });
  try { await drizzle(pool).transaction(async (tx) => { await tx.insert(wilayaTable).values(wilayas.map(([code, name, nameAr]) => ({ code, nameEn: name, nameFr: name, nameAr }))).onConflictDoNothing(); await tx.insert(categories).values(categoryRows).onConflictDoNothing(); }); } finally { await pool.end(); }
}
if (process.argv[1]?.endsWith("seed-reference-data.ts")) seedReferenceData().then(() => console.log("58 wilayas and 8 categories seeded")).catch((error) => { console.error(error); process.exitCode = 1; });
