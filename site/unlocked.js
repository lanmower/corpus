// subject-level video unlock gate. corpus.unlocked.v1
// {[subject]: {watched:bool, watchedAt:ISO}}
// Diabetes has no lecture video — auto-unlocked.
const KEY = 'corpus.unlocked.v1';
const NO_VIDEO_SUBJECTS = new Set(['diabetes']);

function readRaw() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function writeRaw(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} }

export function isAutoUnlocked(subject) { return NO_VIDEO_SUBJECTS.has(subject); }

export function isUnlocked(subject) {
    if (isAutoUnlocked(subject)) return true;
    const o = readRaw();
    return !!(o[subject] && o[subject].watched);
}

export function watchedAt(subject) {
    const o = readRaw();
    return (o[subject] && o[subject].watchedAt) || null;
}

export function markWatched(subject, when = new Date().toISOString()) {
    const o = readRaw();
    o[subject] = { watched: true, watchedAt: when };
    writeRaw(o);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('corpus:unlocked-changed'));
    return o[subject];
}

export function reset(subject) {
    const o = readRaw();
    if (subject) delete o[subject]; else writeRaw({});
    if (subject) writeRaw(o);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('corpus:unlocked-changed'));
}

export function all() {
    const o = readRaw();
    const out = {};
    for (const s of Object.keys(o)) out[s] = { ...o[s] };
    return out;
}

if (typeof window !== 'undefined') {
    window.__unlocked = { isUnlocked, isAutoUnlocked, watchedAt, markWatched, reset, all, NO_VIDEO_SUBJECTS };
}
