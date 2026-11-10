import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(process.cwd());
const MAP = [
  ['/vendor/three/', path.join(ROOT, 'toolkit/node_modules/three/')],
  ['/assets/', path.join(ROOT, 'assets/')],
  ['/src/', path.join(ROOT, 'src/')],
  ['/', path.join(ROOT, 'src/')],
];
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json',
  '.ttf':'font/ttf', '.otf':'font/otf', '.png':'image/png', '.jpg':'image/jpeg', '.css':'text/css' };
export function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, resp) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      let file = null;
      for (const [pre, dir] of MAP) { if (u.startsWith(pre)) { file = path.join(dir, u.slice(pre.length)); break; } }
      if (!file) { resp.writeHead(404); return resp.end('nf'); }
      fs.readFile(file, (e, d) => {
        if (e) { resp.writeHead(404); return resp.end('nf'); }
        resp.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*' });
        resp.end(d);
      });
    });
    s.listen(0, '127.0.0.1', () => res({ server: s, port: s.address().port }));
  });
}
