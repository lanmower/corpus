#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', 'site');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p === '') p = '/index.html';
    const full = path.normalize(path.join(ROOT, p));
    if (path.relative(ROOT, full).startsWith('..')) {
        res.writeHead(403); return res.end('forbidden');
    }
    fs.readFile(full, (err, data) => {
        if (err) { res.writeHead(404, {'content-type':'text/plain'}); return res.end('not found: ' + p); }
        const ext = path.extname(p).toLowerCase();
        res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
        res.end(data);
    });
});
const PORT = parseInt(process.env.PORT || '8765', 10);
srv.listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}`));
setInterval(() => {}, 60000);
