// schedule engine — corpus.schedule.v1 (blocks) + corpus.schedule.config.v1 (config)
// Deterministic per (config, exam date, due-counts, weights). Re-run from same inputs → same output.
const KEY = 'corpus.schedule.v1';
const CFG_KEY = 'corpus.schedule.config.v1';
const SUBJECTS = ['cardiology','diabetes','endocrine','gastroenterology','geriatric','nephrology','pulmonology','rheumatology'];

const DEFAULT_CONFIG = {
    examDate: '2026-06-15',
    intensity: 'standard',     // light | standard | hard | cram
    chronotype: 'morning',     // morning | evening | flex
    pomodoro: 25,
    breakLen: 5,
    availability: { mon: 180, tue: 180, wed: 180, thu: 180, fri: 180, sat: 240, sun: 240 },
    weights: Object.fromEntries(SUBJECTS.map(s => [s, 1]))
};

const INTENSITY_FACTOR = { light: 0.6, standard: 1.0, hard: 1.4, cram: 1.7 };
const DOW = ['sun','mon','tue','wed','thu','fri','sat'];

export function defaultConfig() { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }

export function loadConfig() {
    try {
        const raw = localStorage.getItem(CFG_KEY);
        const cfg = raw ? JSON.parse(raw) : {};
        return {
            ...DEFAULT_CONFIG, ...cfg,
            availability: { ...DEFAULT_CONFIG.availability, ...(cfg.availability || {}) },
            weights: { ...DEFAULT_CONFIG.weights, ...(cfg.weights || {}) }
        };
    } catch { return defaultConfig(); }
}

export function saveConfig(cfg) {
    const merged = { ...loadConfig(), ...cfg };
    localStorage.setItem(CFG_KEY, JSON.stringify(merged));
    emit('config');
    return merged;
}

export function loadSchedule() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{"blocks":[],"generatedAt":0}'); }
    catch { return { blocks: [], generatedAt: 0 }; }
}

export function saveSchedule(s) { localStorage.setItem(KEY, JSON.stringify(s)); emit('schedule'); }

export function isoDate(d) { return d.toISOString().slice(0, 10); }
export function addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDate(d); }
export function daysBetween(a, b) { return Math.floor((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); }

export function dayMinutes(cfg, dateIso) {
    const dow = DOW[new Date(dateIso + 'T00:00:00Z').getUTCDay()];
    const base = cfg.availability[dow] || 0;
    return Math.round(base * (INTENSITY_FACTOR[cfg.intensity] || 1));
}

// Allocate minutes to subjects by weight (proportional, integer rounding, remainder to top weight).
export function allocateSubjects(totalMin, weights, dueCounts) {
    const subs = SUBJECTS.map(s => ({ s, w: Math.max(0, weights[s] || 0) * (1 + Math.log10(1 + (dueCounts[s] || 0))) }));
    const sumW = subs.reduce((n, x) => n + x.w, 0);
    if (sumW === 0) return [];
    const out = subs.map(x => ({ subject: x.s, min: Math.floor(totalMin * x.w / sumW) }));
    let rem = totalMin - out.reduce((n, x) => n + x.min, 0);
    out.sort((a, b) => (weights[b.subject] || 0) - (weights[a.subject] || 0));
    for (let i = 0; rem > 0 && i < out.length; i++, rem--) out[i].min++;
    return out.filter(x => x.min >= 5);
}

// Build blocks for a single day. Pomodoro-segmented per subject. Chronotype shifts start hour.
export function buildDayBlocks(cfg, dateIso, dueCounts) {
    const total = dayMinutes(cfg, dateIso);
    if (total <= 0) return [];
    const startHour = cfg.chronotype === 'morning' ? 8 : (cfg.chronotype === 'evening' ? 17 : 12);
    const allocs = allocateSubjects(total, cfg.weights, dueCounts);
    const blocks = [];
    let cur = startHour * 60;
    for (const a of allocs) {
        let left = a.min;
        while (left >= 10) {
            const len = Math.min(cfg.pomodoro || 25, left);
            blocks.push({
                id: `${dateIso}-${a.subject}-${cur}`,
                date: dateIso, subject: a.subject,
                startMin: cur, len,
                kind: left === a.min ? 'study' : 'study',
                done: false, locked: false
            });
            cur += len; left -= len;
            if (left >= 10) { blocks.push({ id: `${dateIso}-break-${cur}`, date: dateIso, subject: null, startMin: cur, len: cfg.breakLen || 5, kind: 'break', done: false, locked: false }); cur += cfg.breakLen || 5; }
        }
    }
    return blocks;
}

export function regenerate({ today = isoDate(new Date()), dueCounts = {}, horizonDays = null } = {}) {
    const cfg = loadConfig();
    const dl = daysBetween(today, cfg.examDate);
    const horizon = horizonDays != null ? horizonDays : Math.max(7, Math.min(60, dl + 1));
    const existing = loadSchedule();
    const lockedById = new Map();
    for (const b of existing.blocks) if (b.locked) lockedById.set(b.id, b);
    const out = [];
    for (let i = 0; i < horizon; i++) {
        const date = addDays(today, i);
        const day = buildDayBlocks(cfg, date, dueCounts);
        for (const b of day) {
            if (lockedById.has(b.id)) out.push(lockedById.get(b.id));
            else out.push(b);
        }
    }
    // Carry forward any locked block whose id is in the past or unmatched.
    for (const [id, b] of lockedById) if (!out.find(x => x.id === id)) out.push(b);
    const sched = { blocks: out, generatedAt: Date.now(), horizon, today };
    saveSchedule(sched);
    return sched;
}

export function getSchedule({ regenerateIfStale = true, today = isoDate(new Date()), dueCounts = {} } = {}) {
    const s = loadSchedule();
    if (regenerateIfStale && (!s.blocks.length || s.today !== today)) return regenerate({ today, dueCounts });
    return s;
}

export function blocksForDate(dateIso) { return loadSchedule().blocks.filter(b => b.date === dateIso); }

export function markBlockComplete(id, done = true) {
    const s = loadSchedule();
    const b = s.blocks.find(x => x.id === id); if (!b) return null;
    b.done = !!done; saveSchedule(s); return b;
}

export function editBlock(id, patch) {
    const s = loadSchedule();
    const b = s.blocks.find(x => x.id === id); if (!b) return null;
    Object.assign(b, patch || {}); saveSchedule(s); return b;
}

export function lockBlock(id, locked = true) {
    const s = loadSchedule();
    const b = s.blocks.find(x => x.id === id); if (!b) return null;
    b.locked = !!locked; saveSchedule(s); return b;
}

export function dayCompletion(dateIso) {
    const blocks = blocksForDate(dateIso).filter(b => b.kind === 'study');
    if (!blocks.length) return { pct: 0, done: 0, total: 0, totalMin: 0, doneMin: 0 };
    const done = blocks.filter(b => b.done);
    const totalMin = blocks.reduce((n, b) => n + b.len, 0);
    const doneMin = done.reduce((n, b) => n + b.len, 0);
    return { pct: totalMin ? Math.round(100 * doneMin / totalMin) : 0, done: done.length, total: blocks.length, totalMin, doneMin };
}

export function subjectHeat(dateIso) {
    const blocks = blocksForDate(dateIso).filter(b => b.kind === 'study');
    const map = {};
    for (const b of blocks) map[b.subject] = (map[b.subject] || 0) + b.len;
    return map;
}

let bc = null;
function channel() {
    if (bc) return bc;
    try { bc = ('BroadcastChannel' in (typeof self !== 'undefined' ? self : {})) ? new BroadcastChannel('corpus') : null; } catch { bc = null; }
    return bc;
}
function emit(reason) {
    try { channel()?.postMessage({ type: 'schedule:updated', reason, ts: Date.now() }); } catch {}
    try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('schedule:updated', { detail: { reason, ts: Date.now() } }));
        }
    } catch {}
}

export function onUpdate(handler) {
    const c = channel();
    if (c) c.addEventListener('message', e => { if (e.data?.type === 'schedule:updated') handler(e.data); });
    if (typeof window !== 'undefined') window.addEventListener('schedule:updated', e => handler(e.detail));
}

export const SUBJECT_LIST = SUBJECTS;
