// 1-5 confidence per guide section. corpus.confidence.v1
const KEY = 'corpus.confidence.v1';

export function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
export function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {} }
export function set(subject, lineNum, score) {
    const all = load();
    (all[subject] = all[subject] || {})[String(lineNum)] = Math.max(1, Math.min(5, score | 0));
    save(all); return all;
}
export function get(subject, lineNum) { return (load()[subject] || {})[String(lineNum)] || 0; }
export function avgFor(subject) {
    const m = load()[subject] || {}; const v = Object.values(m);
    if (!v.length) return 0;
    return v.reduce((a, b) => a + b, 0) / v.length;
}

if (typeof window !== 'undefined') window.__confidence = { load, save, set, get, avgFor };
