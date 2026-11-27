// Serves the built app (app/src/main/assets) at http://localhost:8765 for the tests. Usage: node qa/serve.js
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const WEB = path.join(__dirname, '..', 'web');
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]); if (p === '/') p = '/index.html';
  for (const base of [ROOT, WEB]) { const f = path.join(base, p); if (f.startsWith(base) && fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); return fs.createReadStream(f).pipe(res) } }
  if (p === '/webver.txt') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(String(Math.floor(Date.now() / 1000))) }
  res.writeHead(404); res.end('not found');
}).listen(8765, () => console.log('serving app at http://localhost:8765'));
