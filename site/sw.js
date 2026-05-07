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

async function safeFetch(request) {
    try { return await fetch(request); } catch { return null; }
}

async function safeClone(r) {
    try { return r.clone(); } catch { return null; }
}

async function handle(request) {
    let cache = null;
    try { cache = await caches.open(CACHE); } catch {}
    let url;
    try { url = new URL(request.url); } catch { url = null; }

    if (url && isStaticAsset(url)) {
        if (cache) {
            const hit = await safeCacheMatch(cache, request);
            if (hit) return hit;
        }
        const r = await safeFetch(request);
        if (r && r.ok && cache) {
            const c = await safeClone(r);
            if (c) safeCachePut(cache, request, c);
        }
        if (r) return r;
        return new Response('offline', { status: 503, statusText: 'offline' });
    }

    const isVideo = url ? /\.(mp4|webm|mov|m4v)$/i.test(url.pathname) : false;
    const r = await safeFetch(request);
    if (r) {
        if (r.ok && cache && !isVideo) {
            const c = await safeClone(r);
            if (c) safeCachePut(cache, request, c);
        }
        return r;
    }
    if (cache) {
        const cached = await safeCacheMatch(cache, request);
        if (cached) return cached;
        let accept = '';
        try { accept = request.headers.get('accept') || ''; } catch {}
        if (request.mode === 'navigate' || accept.includes('text/html')) {
            const shell = (await safeCacheMatch(cache, './')) || (await safeCacheMatch(cache, './index.html'));
            if (shell) return shell;
        }
    }
    return new Response('offline', { status: 503, statusText: 'offline' });
}

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    let url;
    try { url = new URL(e.request.url); } catch { return; }
    if (url.origin !== location.origin) return;

    e.respondWith(handle(e.request).catch(() => new Response('sw-error', { status: 503, statusText: 'sw-error' })));
});
