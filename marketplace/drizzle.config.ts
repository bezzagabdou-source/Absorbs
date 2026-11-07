import "dotenv/config";
import { defineConfig } from "drizzle-kit";
const url = process.env.DATABASE_MIGRATION_URL;
if (!url) throw new Error("DATABASE_MIGRATION_URL is required for migrations");
export default defineConfig({ dialect: "postgresql", schema: "./src/db/schema.ts", out: "./drizzle", dbCredentials: { url }, strict: true, verbose: true });
