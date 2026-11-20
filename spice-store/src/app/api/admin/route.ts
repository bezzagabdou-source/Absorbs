import type {NextRequest} from 'next/server';
import {authenticated} from '@/lib/server/auth';
import {readCatalog} from '@/lib/server/read-catalog';
export async function GET(req:NextRequest){
  if (!authenticated(req)) return Response.json({error:'يرجى تسجيل الدخول.'},{status:401});
  return Response.json(await readCatalog(),{headers:{'Cache-Control':'private, no-store'}});
}
