// e2e/serve.js — статический сервер для e2e-тестов. Без зависимостей: только node:http.
// Игре сервер не нужен (она открывается двойным кликом), но Service Worker и
// Web Workers в браузере работают только по http(s).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.E2E_PORT || 4173);
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = path.normalize(path.join(ROOT, url === '/' ? '/index.html' : url));
    if (!file.startsWith(ROOT) || file.includes(`${path.sep}node_modules${path.sep}`)) {
        res.writeHead(403); return res.end('forbidden');
    }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
    });
}).listen(PORT, '127.0.0.1', () => console.log(`e2e server: http://127.0.0.1:${PORT}/`));
