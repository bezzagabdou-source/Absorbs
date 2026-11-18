export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) return;
  try {
    const { bootstrap } = await import("./lib/bootstrap");
    const result = await bootstrap().catch((err) => ({ error: String(err) }));
    if (result && "error" in result && result.error) {
      console.warn("[instrumentation] bootstrap:", result.error);
    }
  } catch (err) {
    console.warn("[instrumentation] skipped:", err);
  }
}
