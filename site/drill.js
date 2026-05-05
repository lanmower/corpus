// drill 10 — quick blast session. corpus.drill.v1
const KEY = 'corpus.drill.v1';

export function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
export function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }
export function clear() { try { localStorage.removeItem(KEY); } catch {} }
export function start(cardIds, subject) {
    const d = { ids: cardIds.slice(0, 10), index: 0, subject, startedAt: Date.now() };
    save(d); return d;
}
export function advance() { const d = load(); if (!d) return null; d.index++; if (d.index >= d.ids.length) { clear(); return null; } save(d); return d; }
export function active() { const d = load(); return d && d.index < d.ids.length ? d : null; }

if (typeof window !== 'undefined') window.__drill = { load, save, clear, start, advance, active };
