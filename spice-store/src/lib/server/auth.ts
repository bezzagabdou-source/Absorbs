import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
export const SESSION_COOKIE='asil_admin_session';
export const sessionSeconds=60*60*4;
const equal=(a:string,b:string)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
export const verifyPassword=(password:string)=>!!process.env.ADMIN_PASSWORD && equal(password,process.env.ADMIN_PASSWORD);
function sign(body:string) {return createHmac('sha256',process.env.ADMIN_PASSWORD!).update('asil-session-v1:'+body).digest('base64url');}
export function createSession(){const body=`${Math.floor(Date.now()/1000)+sessionSeconds}.${randomBytes(24).toString('hex')}`;return `${body}.${sign(body)}`;}
export function authenticated(request:NextRequest){
  const value=request.cookies.get(SESSION_COOKIE)?.value || '';
  if(!process.env.ADMIN_PASSWORD || !/^\d{10}\.[a-f0-9]{48}\.[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const [expiry,nonce,mac]=value.split('.');
  return Number(expiry)>Date.now()/1000 && equal(mac,sign(`${expiry}.${nonce}`));
}
