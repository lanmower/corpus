// mistake log — every grade ≤2. corpus.mistakes.v1
const KEY = 'corpus.mistakes.v1';
const CAP = 200;

export function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function save(arr) { try { localStorage.setItem(KEY, JSON.stringify(arr.slice(-CAP))); } catch {} }
export function logMistake(cardId, subject, score) {
    if (score > 2) return;
    const arr = load();
    arr.push({ cardId, subject, score, ts: Date.now() });
    save(arr);
}
export function recent(n = 50) { return load().slice(-n).reverse(); }
export function bySubject(n = 50) {
    const out = {};
    for (const m of recent(n)) (out[m.subject] = out[m.subject] || []).push(m);
    return out;
}
export function clear() { try { localStorage.removeItem(KEY); } catch {} }
export function ids() { return [...new Set(load().map(m => m.cardId))]; }

if (typeof window !== 'undefined') window.__mistakes = { load, logMistake, recent, bySubject, clear, ids };
