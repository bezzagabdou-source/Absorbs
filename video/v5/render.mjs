import { serve } from './src/serve.mjs';
import fs from 'node:fs';
const { chromium } = await import('./toolkit/node_modules/playwright/index.mjs');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const FPS = Number(arg('fps', '30')), TOTAL = Number(arg('total', '120.0'));
const RW = Number(arg('w', '1080')), RH = Number(arg('h', '1920'));
const frames = Math.round(TOTAL * FPS);
const filter = arg('only', null);
const from = Number(arg('from', '0')), to = Number(arg('to', String(frames)));
const want = filter ? filter.split(',').map(Number).filter(f => f >= 0 && f < frames)
                    : [...Array(Math.max(0, to - from)).keys()].map(i => i + from);
const outDir = arg('out', 'frames');
fs.mkdirSync(outDir, { recursive: true });
const { port, server } = await serve();
const b = await chromium.launch({ executablePath: '/tmp/chromium', headless: true,
  args: ['--no-sandbox','--disable-setuid-sandbox','--single-process','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--js-flags=--max-old-space-size=1500'] });
const p = await b.newPage({ viewport: { width: RW, height: RH }, deviceScaleFactor: 1 });
p.on('console', m => { const s = m.text(); if (!/THREE.WebGLRenderer|deprecat/i.test(s)) console.log('[pg]', s); });
p.on('pageerror', e => console.log('[PAGEERR]', e.message));
const t0 = Date.now();
await p.goto(`http://127.0.0.1:${port}/index.html?w=${RW}&h=${RH}`);
await p.waitForFunction('window.__ready === true', null, { timeout: 300000 });
console.log('READY in', ((Date.now() - t0) / 1000).toFixed(1), 's — frames:', want.length);
let n = 0;
for (const f of want) {
  const t = f / FPS;
  const a = Date.now();
  const d = await p.evaluate((tt) => window.renderFrame(tt), t);
  const buf = Buffer.from(d.split(',')[1], 'base64');
  fs.writeFileSync(`${outDir}/f${String(f).padStart(5, '0')}.jpg`, buf);
  n++;
  if (n % 50 === 0 || n === 1) console.log(`f${f} t=${t.toFixed(2)} ${Date.now() - a}ms total ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log('DONE', n, 'frames', ((Date.now() - t0) / 1000).toFixed(0), 's');
await b.close(); server.close();
