// highlights + notes on guide prose. corpus.notes.v1
const KEY = 'corpus.notes.v1';

export function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
export function save(n) { try { localStorage.setItem(KEY, JSON.stringify(n)); } catch {} }
export function set(subject, lineNum, payload) {
    const all = load();
    (all[subject] = all[subject] || {})[String(lineNum)] = payload;
    save(all); return all;
}
export function get(subject, lineNum) { return (load()[subject] || {})[String(lineNum)] || null; }
export function remove(subject, lineNum) { const all = load(); if (all[subject]) { delete all[subject][String(lineNum)]; save(all); } }
export function all() {
    const out = []; const all = load();
    for (const subject of Object.keys(all)) for (const ln of Object.keys(all[subject])) out.push({ subject, line: ln, ...all[subject][ln] });
    return out;
}

if (typeof window !== 'undefined') window.__notes = { load, save, set, get, remove, all };
