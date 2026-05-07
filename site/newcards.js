// daily new-card cap per subject. corpus.newcards.v1
// { [YYYY-MM-DD]: { [subject]: count } }
// Companion config key corpus.newcards.cap.v1 stores the per-subject daily cap.
const COUNT_KEY = 'corpus.newcards.v1';
const CAP_KEY = 'corpus.newcards.cap.v1';
const DEFAULT_CAP = 20;

function todayISO(now = new Date()) { return now.toISOString().slice(0, 10); }

function readCounts() {
    try { return JSON.parse(localStorage.getItem(COUNT_KEY) || '{}') || {}; } catch { return {}; }
}
function writeCounts(o) { try { localStorage.setItem(COUNT_KEY, JSON.stringify(o)); } catch {} }

export function cap() {
    try {
        const v = parseInt(localStorage.getItem(CAP_KEY) || '', 10);
        if (Number.isFinite(v) && v >= 0) return v;
    } catch {}
    return DEFAULT_CAP;
}

export function setCap(n) {
    const v = Math.max(0, Math.floor(Number(n) || 0));
    try { localStorage.setItem(CAP_KEY, String(v)); } catch {}
    return v;
}

export function countToday(subject, now = new Date()) {
    const day = todayISO(now);
    const o = readCounts();
    return ((o[day] || {})[subject]) || 0;
}

export function remaining(subject, now = new Date()) {
    return Math.max(0, cap() - countToday(subject, now));
}

export function canIntroduce(subject, now = new Date()) {
    return remaining(subject, now) > 0;
}

export function bump(subject, n = 1, now = new Date()) {
    const day = todayISO(now);
    const o = readCounts();
    const bucket = (o[day] = o[day] || {});
    bucket[subject] = (bucket[subject] || 0) + n;
    // keep last 14 days for compactness
    const days = Object.keys(o).sort();
    while (days.length > 14) { delete o[days.shift()]; }
    writeCounts(o);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('corpus:newcards-changed'));
    return bucket[subject];
}

export function reset() { writeCounts({}); }

if (typeof window !== 'undefined') {
    window.__newcards = { cap, setCap, countToday, remaining, canIntroduce, bump, reset, DEFAULT_CAP };
}
