// corpus offline cache — precaches shell + manifest + shards on install.
const CACHE = 'corpus-v2';
const SHELL = [
    './', './index.html', './style.css', './app.js', './progress.js', './theme.js', './search.js', './srs.js',
    './triage-live.html', './triage-live.css', './triage-live.js',
    './data/manifest.json'
];

self.addEventListener('install', e => {
    e.waitUntil((async () => {
        const c = await caches.open(CACHE);
        await c.addAll(SHELL);
        try {
            const m = await (await fetch('./data/manifest.json')).json();
            const shards = m.subjects.map(s => `./data/${s.subject}.json`);
            await c.addAll(shards);
        } catch (e) { /* network may be unavailable on install; runtime fetch will populate */ }
        self.skipWaiting();
    })());
});

self.addEventListener('activate', e => {
    e.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
        self.clients.claim();
    })());
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    if (url.origin !== location.origin) return;
    e.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(e.request);
        if (cached) {
            // Refresh in background for shards/manifest
            if (/\/data\//.test(url.pathname)) {
                fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); }).catch(() => {});
            }
            return cached;
        }
        try {
            const r = await fetch(e.request);
            if (r.ok && (url.pathname.endsWith('.json') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html'))) {
                cache.put(e.request, r.clone());
            }
            return r;
        } catch (err) {
            if (e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html')) {
                const shell = await cache.match('./') || await cache.match('./index.html');
                if (shell) return shell;
            }
            return new Response('offline', { status: 503, statusText: 'offline' });
        }
    })());
});
