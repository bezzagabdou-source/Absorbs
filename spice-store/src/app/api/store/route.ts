import { readCatalog } from '@/lib/server/read-catalog';
export async function GET() { return Response.json(await readCatalog(), {headers:{'Cache-Control':'no-store'}}); }
