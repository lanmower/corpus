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
        try {
            const c = await caches.open(CACHE);
            try { await c.addAll(SHELL); } catch {}
        } catch {}
        try { self.skipWaiting(); } catch {}
    })());
});

self.addEventListener('activate', e => {
    e.waitUntil((async () => {
        try {
            const keys = await caches.keys();
            await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k).catch(() => null)));
        } catch {}
        try { await self.clients.claim(); } catch {}
        try {
            const cs = await self.clients.matchAll({ type: 'window' });
            for (const client of cs) {
                try { client.postMessage({ type: 'sw-activated', version: VERSION }); } catch {}
            }
        } catch {}
    })());
});

function isStaticAsset(url) {
    return /\.(woff2?|ttf|otf|eot|png|jpe?g|gif|webp|ico)$/i.test(url.pathname);
}

async function safeCachePut(cache, req, res) {
    try { await cache.put(req, res); } catch {}
}

async function safeCacheMatch(cache, req) {
    try { return await cache.match(req); } catch { return undefined; }
}

async function handle(request) {
    let cache;
    try { cache = await caches.open(CACHE); } catch { cache = null; }
    const url = new URL(request.url);

    if (isStaticAsset(url)) {
        if (cache) {
            const hit = await safeCacheMatch(cache, request);
            if (hit) return hit;
        }
        try {
            const r = await fetch(request);
            if (r && r.ok && cache) safeCachePut(cache, request, r.clone());
            return r;
        } catch {
            return new Response('offline', { status: 503, statusText: 'offline' });
        }
    }

    try {
        const r = await fetch(request);
        if (r && r.ok && cache) safeCachePut(cache, request, r.clone());
        return r;
    } catch {
        if (cache) {
            const cached = await safeCacheMatch(cache, request);
            if (cached) return cached;
            if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
                const shell = (await safeCacheMatch(cache, './')) || (await safeCacheMatch(cache, './index.html'));
                if (shell) return shell;
            }
        }
        return new Response('offline', { status: 503, statusText: 'offline' });
    }
}

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    let url;
    try { url = new URL(e.request.url); } catch { return; }
    if (url.origin !== location.origin) return;

    e.respondWith(handle(e.request).catch(() => new Response('sw-error', { status: 503, statusText: 'sw-error' })));
});
