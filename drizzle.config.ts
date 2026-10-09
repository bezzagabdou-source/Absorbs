import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schemaFilter: ["public", "barq"],
  schema: "./src/db/schema.ts",
  dbCredentials: {
    // Read from your environment — never a hard-coded local URL.
    url:
      process.env.DATABASE_URL ??
      process.env.POSTGRES_URL ??
      process.env.POSTGRES_URL_NON_POOLING ??
      "",
  },
});
