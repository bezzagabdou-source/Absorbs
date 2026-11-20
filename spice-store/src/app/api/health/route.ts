import { bundledCatalog } from '@/lib/file-catalog';
export function GET() { return Response.json({ok: true, storage:'catalog-file', products:bundledCatalog.products.length}); }
