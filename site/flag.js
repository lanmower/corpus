// flag for later — corpus.flagged.v1
const KEY = 'corpus.flagged.v1';

export function load() { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); } }
export function save(s) { try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch {} }
export function toggle(id) { const s = load(); if (s.has(id)) s.delete(id); else s.add(id); save(s); return s.has(id); }
export function isFlagged(id) { return load().has(id); }
export function ids() { return [...load()]; }
export function count() { return load().size; }
export function clear() { try { localStorage.removeItem(KEY); } catch {} }

if (typeof window !== 'undefined') window.__flag = { load, save, toggle, isFlagged, ids, count, clear };
