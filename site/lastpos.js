// last-position memory — corpus.lastpos.v1.
const KEY = 'corpus.lastpos.v1';

export function load() {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
}

export function save(route, subjectAnchor) {
    try { localStorage.setItem(KEY, JSON.stringify({ route, subjectAnchor: subjectAnchor || null, ts: Date.now() })); }
    catch {}
}

export function gapDays(now = Date.now()) {
    const lp = load(); if (!lp || !lp.ts) return 0;
    return Math.floor((now - lp.ts) / 86400000);
}

if (typeof window !== 'undefined') window.__lastpos = { load, save, gapDays };
