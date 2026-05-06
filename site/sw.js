// corpus service worker — network-first for HTML/JS/CSS/JSON, cache-first for fonts/images.
// Cache key is injected at deploy time by .github/workflows/pages.yml replacing __BUILD_VERSION__.
// In local dev the placeholder remains, so we fall back to a per-boot dev key (forces fresh fetches).
const RAW_VERSION = '__BUILD_VERSION__';
const VERSION = RAW_VERSION.indexOf('BUILD_VERSION') >= 0 ? ('dev-' + Date.now()) : RAW_VERSION;
const CACHE = 'corpus-' + VERSION;

const SHELL = [
    './', './index.html', './manifest.webmanifest'
];

self.addEventListener('install', e => {
    e.waitUntil((async () => {
        const c = await caches.open(CACHE);
        try { await c.addAll(SHELL); } catch {}
        self.skipWaiting();
    })());
});

self.addEventListener('activate', e => {
    e.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
        await self.clients.claim();
        const cs = await self.clients.matchAll({ type: 'window' });
        for (const client of cs) {
            try { client.postMessage({ type: 'sw-activated', version: VERSION }); } catch {}
        }
    })());
});

function isStaticAsset(url) {
    return /\.(woff2?|ttf|otf|eot|png|jpe?g|gif|webp|ico)$/i.test(url.pathname);
}

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    const url = new URL(e.request.url);
    if (url.origin !== location.origin) return;

    e.respondWith((async () => {
        const cache = await caches.open(CACHE);

        if (isStaticAsset(url)) {
            const hit = await cache.match(e.request);
            if (hit) return hit;
            try {
                const r = await fetch(e.request);
                if (r.ok) cache.put(e.request, r.clone());
                return r;
            } catch {
                return new Response('offline', { status: 503 });
            }
        }

        try {
            const r = await fetch(e.request, { cache: 'no-store' });
            if (r.ok) cache.put(e.request, r.clone());
            return r;
        } catch {
            const cached = await cache.match(e.request);
            if (cached) return cached;
            if (e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html')) {
                const shell = await cache.match('./') || await cache.match('./index.html');
                if (shell) return shell;
            }
            return new Response('offline', { status: 503, statusText: 'offline' });
        }
    })());
});
