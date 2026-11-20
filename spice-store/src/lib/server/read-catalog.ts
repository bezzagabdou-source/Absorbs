import { bundledCatalog, catalogSchema } from '@/lib/file-catalog';
// Only public catalog data lives in Git. No write credential in the application.
const source = 'https://raw.githubusercontent.com/bezzagabdou-source/Absorbs/refs/heads/arena/09b8ccc0-absorbs/spice-store/src/data/catalog.json';
export async function readCatalog() {
  if (!process.env.VERCEL) return bundledCatalog;
  try {
    const r = await fetch(source, { next: { revalidate: 60 }, signal: AbortSignal.timeout(3000) });
    if (r.ok) return catalogSchema.parse(await r.json());
  } catch { /* The deployed snapshot remains available without GitHub. */ }
  return bundledCatalog;
}
