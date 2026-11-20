// Exercise the built server over loopback. No network services or secret logging.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import { once } from 'node:events';
const port=38479;
const secret=process.env.ADMIN_PASSWORD;
assert(secret, 'ADMIN_PASSWORD must be configured');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{stdio:['ignore','pipe','inherit'],env:{...process.env,VERCEL:'',DATABASE_URL:'',POSTGRES_URL:''}});
const exited=once(server,'exit');
try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server not ready')),15000); server.stdout.on('data',b=>{if(b.toString().includes('Ready')){clearTimeout(timer);resolve();}});server.once('exit',()=>{clearTimeout(timer);reject(Error('server stopped'));});});
  const request=(path,opts={})=>fetch(`http://127.0.0.1:${port}/api/${path}`,{...opts,redirect:'error'});
  const login=password=>request('admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
  assert.equal((await request('admin')).status,401);
  assert.equal((await login(secret+'!')).status,401);
  const r=await login(secret);assert.equal(r.status,200);
  const headers={Cookie:r.headers.get('set-cookie').split(';')[0]};
  const panel=await request('admin',{headers});assert.equal(panel.status,200);assert((await panel.json()).categories.length);
  assert.equal((await request('admin/login',{method:'DELETE',headers})).status,200);
  console.log('Admin smoke passed: unauthorized, invalid password, login, protected catalog, logout (no DB)');
} finally {server.kill('SIGTERM');await exited;}
