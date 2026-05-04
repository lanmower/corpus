#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'site');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
const ISOLATION_HEADERS = {
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
    'cross-origin-resource-policy': 'cross-origin'
};
const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p === '') p = '/index.html';
    const full = path.normalize(path.join(ROOT, p));
    if (path.relative(ROOT, full).startsWith('..')) {
        res.writeHead(403, ISOLATION_HEADERS); return res.end('forbidden');
    }
    fs.readFile(full, (err, data) => {
        if (err) { res.writeHead(404, { ...ISOLATION_HEADERS, 'content-type': 'text/plain' }); return res.end('not found: ' + p); }
        const ext = path.extname(p).toLowerCase();
        res.writeHead(200, { ...ISOLATION_HEADERS, 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
        res.end(data);
    });
});
const PORT = parseInt(process.env.PORT || '8765', 10);
srv.listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} on http://127.0.0.1:${PORT} (COOP/COEP isolated)`));
setInterval(() => {}, 60000);
