// just-read mode — distraction-free reading on subject pages. corpus.justread.v1
const KEY = 'corpus.justread.v1';

export function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
export function save(map) { try { localStorage.setItem(KEY, JSON.stringify(map)); } catch {} }

export function isOn(subject) {
    return !!load()[subject];
}
export function toggle(subject) {
    const m = load(); m[subject] = !m[subject]; save(m); return m[subject];
}
export function applyClass(on) {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('just-read', !!on);
}

if (typeof window !== 'undefined') window.__justread = { load, save, isOn, toggle, applyClass };
