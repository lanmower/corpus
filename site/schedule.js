// schedule engine — corpus.schedule.v1 (blocks) + corpus.schedule.config.v1 (config)
// Deterministic per (config, exam date, due-counts, weights). Re-run from same inputs → same output.
const KEY = 'corpus.schedule.v1';
const CFG_KEY = 'corpus.schedule.config.v1';
let SUBJECTS = ['cardiology','diabetes','endocrine','gastroenterology','geriatric','nephrology','pulmonology','rheumatology'];

export function setSubjectList(list) {
    if (Array.isArray(list) && list.length) SUBJECTS = list.slice();
}

const DEFAULT_CONFIG = {
    examDate: '2026-06-15',
    intensity: 'standard',     // light | standard | hard | cram
    chronotype: 'morning',     // morning | evening | flex
    pomodoro: 25,
    breakLen: 5,
    availability: { mon: 180, tue: 180, wed: 180, thu: 180, fri: 180, sat: 240, sun: 240 },
    weights: {},
    enabled: {}
};

function fillSubjectMaps(cfg) {
    const w = { ...cfg.weights };
    const en = { ...cfg.enabled };
    for (const s of SUBJECTS) {
        if (w[s] == null) w[s] = 1;
        if (en[s] == null) en[s] = true;
    }
    return { ...cfg, weights: w, enabled: en };
}

const INTENSITY_FACTOR = { light: 0.6, standard: 1.0, hard: 1.4, cram: 1.7 };
const DOW = ['sun','mon','tue','wed','thu','fri','sat'];
// Daily budget caps — keep "today's plan" a single-day slice, not full backlog.
const PER_SUBJECT_DAILY_REVIEW_CAP = 30;   // scaled by intensity
const DAILY_NEW_CAP = 12;                  // total new cards/day across all subjects, scaled by intensity
const MIN_PER_REVIEW = 0.4;                // estimator: minutes per card review
const MAX_GUIDE_SECTIONS_PER_DAY = 2;
const MAX_CASES_PER_DAY = 2;

export function defaultConfig() { return fillSubjectMaps(JSON.parse(JSON.stringify(DEFAULT_CONFIG))); }

export function loadConfig() {
    try {
        const raw = localStorage.getItem(CFG_KEY);
        const cfg = raw ? JSON.parse(raw) : {};
        // Priority: schedule config examDate > SRS config examDate > default
        let examDate = cfg.examDate;
        if (!examDate) {
            try {
                const srsCfg = JSON.parse(localStorage.getItem('corpus.srs.config') || '{}');
                examDate = srsCfg.examDate;
            } catch {}
        }
        return fillSubjectMaps({
            ...DEFAULT_CONFIG, ...cfg, examDate,
            availability: { ...DEFAULT_CONFIG.availability, ...(cfg.availability || {}) },
            weights: { ...(cfg.weights || {}) },
            enabled: { ...(cfg.enabled || {}) }
        });
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
// Daily quota scales inversely with days-to-exam: more time = lower daily pace for same backlog.
export function allocateSubjects(totalMin, weights, dueCounts, daysToExam = 30, enabled = null) {
    const subs = SUBJECTS.map(s => {
        const isOn = enabled ? enabled[s] !== false : true;
        const w = isOn ? Math.max(0, weights[s] || 0) * (1 + Math.log10(1 + (dueCounts[s] || 0))) : 0;
        return { s, w };
    });
    const sumW = subs.reduce((n, x) => n + x.w, 0);
    if (sumW === 0) return [];
    // Pace factor: <1 when exam far (spread work thinner), 1 at default, >1 when exam near (cram)
    const paceFactor = Math.max(0.5, Math.min(2, 30 / Math.max(7, daysToExam)));
    const out = subs.map(x => ({ subject: x.s, min: Math.floor(totalMin * x.w / sumW * paceFactor) }));
    let rem = totalMin - out.reduce((n, x) => n + x.min, 0);
    out.sort((a, b) => (weights[b.subject] || 0) - (weights[a.subject] || 0));
    for (let i = 0; rem > 0 && i < out.length; i++, rem--) out[i].min++;
    return out.filter(x => x.min >= 5);
}

// Build blocks for a single day. Pomodoro-segmented per subject. Chronotype shifts start hour.
// Each study block carries a work spec: plannedReview/plannedNew/plannedSections/plannedCases.
// extras: { ticksAll: {[subj]:{[line]:bool}}, shards: {[subj]:{cards,guide,triage}}, casesDone: {[subj]:Set}, daysToExam: number }
export function buildDayBlocks(cfg, dateIso, dueCounts, extras = {}) {
    const total = dayMinutes(cfg, dateIso);
    if (total <= 0) return [];
    const startHour = cfg.chronotype === 'morning' ? 8 : (cfg.chronotype === 'evening' ? 17 : 12);
    const daysToExam = extras.daysToExam || daysBetween(new Date().toISOString().slice(0, 10), cfg.examDate);
    const allocs = allocateSubjects(total, cfg.weights, dueCounts, daysToExam, cfg.enabled);
    const intensityMul = INTENSITY_FACTOR[cfg.intensity] || 1;
    // Per-subject daily review cap: base × intensity, but never more than what's actually due.
    const reviewCap = Math.max(1, Math.round(PER_SUBJECT_DAILY_REVIEW_CAP * intensityMul));
    // Filter subjects: only schedule reviews for subjects where student has ticked at least one guide section
    // This ensures material is studied before reviewing cards
    const ticksAll = extras.ticksAll || {};
    const studiedSubjects = new Set(
        Object.keys(ticksAll).filter(subj => {
            const ticks = ticksAll[subj] || {};
            return Object.values(ticks).some(v => v === true);
        })
    );
    const dailyReviewBySubj = {};
    for (const a of allocs) {
        // Only plan reviews for subjects that have been studied (at least one section ticked).
        // Fresh users (no ticks) get 0 reviews — they should learn first.
        const hasStudied = studiedSubjects.has(a.subject);
        dailyReviewBySubj[a.subject] = hasStudied ? Math.min(reviewCap, dueCounts[a.subject] || 0) : 0;
    }
    // Total daily new-card budget — allocate proportionally to top subjects only.
    const newBudget = Math.max(0, Math.round(DAILY_NEW_CAP * intensityMul));
    const sortedAllocs = [...allocs].sort((x, y) => y.min - x.min);
    const newBySubj = {};
    if (newBudget > 0 && sortedAllocs.length) {
        // Only seed new cards for subjects the student has actually started studying.
        const studiedAllocs = sortedAllocs.filter(a => studiedSubjects.has(a.subject));
        const topN = Math.min(3, studiedAllocs.length);
        if (topN > 0) {
            const base = Math.floor(newBudget / topN);
            let rem = newBudget - base * topN;
            for (let i = 0; i < topN; i++) {
                newBySubj[studiedAllocs[i].subject] = base + (rem > 0 ? 1 : 0);
                if (rem > 0) rem--;
            }
        }
    }
    // Guide sections + cases: only the top 2 subjects (by allocation) get one each per day.
    const guideSubjects = new Set(sortedAllocs.slice(0, MAX_GUIDE_SECTIONS_PER_DAY).map(x => x.subject));
    const caseSubjects = new Set(sortedAllocs.slice(0, MAX_CASES_PER_DAY).map(x => x.subject));
    const blocks = [];
    let cur = startHour * 60;
    const subjFirstSeen = {};
    const reviewLeftBySubj = { ...dailyReviewBySubj };
    for (const a of allocs) {
        let left = a.min;
        let firstBlockForSubj = true;
        while (left >= 10) {
            const len = Math.min(cfg.pomodoro || 25, left);
            const subjShareOfTotal = a.min > 0 ? len / a.min : 0;
            // Cap reviews per block by both (a) capacity at MIN_PER_REVIEW and (b) remaining daily cap.
            const blockCapacity = Math.max(0, Math.floor(len / MIN_PER_REVIEW));
            const proportional = Math.round((dailyReviewBySubj[a.subject] || 0) * subjShareOfTotal);
            const plannedReview = Math.max(0, Math.min(blockCapacity, proportional, reviewLeftBySubj[a.subject] || 0));
            reviewLeftBySubj[a.subject] = Math.max(0, (reviewLeftBySubj[a.subject] || 0) - plannedReview);
            const plannedNew = firstBlockForSubj ? (newBySubj[a.subject] || 0) : 0;
            let plannedSections = [];
            let plannedCases = [];
            if (firstBlockForSubj) {
                const sh = (extras.shards || {})[a.subject];
                const ticks = ((extras.ticksAll || {})[a.subject]) || {};
                if (guideSubjects.has(a.subject) && sh && sh.guide && Array.isArray(sh.guide.sections)) {
                    const next = sh.guide.sections.find(s => !ticks[String(s.line)]);
                    if (next) plannedSections = [String(next.line)];
                }
                const done = (extras.casesDone || {})[a.subject] || new Set();
                if (caseSubjects.has(a.subject) && sh && sh.triage && Array.isArray(sh.triage.scenarios)) {
                    const nextCase = sh.triage.scenarios.find(sc => !done.has(sc.id || sc.name));
                    if (nextCase) plannedCases = [nextCase.id || nextCase.name];
                }
                subjFirstSeen[a.subject] = true;
            }
            blocks.push({
                id: `${dateIso}-${a.subject}-${cur}`,
                date: dateIso, subject: a.subject,
                startMin: cur, len, kind: 'study',
                done: false, locked: false,
                plannedReview, plannedNew, plannedSections, plannedCases,
                completedReview: 0, completedNew: 0,
                completedSections: [], completedCases: [],
                rollover: null, over: false, surplus: 0
            });
            cur += len; left -= len; firstBlockForSubj = false;
            if (left >= 10) { blocks.push({ id: `${dateIso}-break-${cur}`, date: dateIso, subject: null, startMin: cur, len: cfg.breakLen || 5, kind: 'break', done: false, locked: false }); cur += cfg.breakLen || 5; }
        }
    }
    return blocks;
}

export function regenerate({ today = isoDate(new Date()), dueCounts = {}, horizonDays = null, extras = {} } = {}) {
    const cfg = loadConfig();
    const dl = daysBetween(today, cfg.examDate);
    const horizon = horizonDays != null ? horizonDays : Math.max(7, Math.min(60, dl + 1));
    // Pass daysToExam in extras for pace-aware allocation
    const fullExtras = { ...extras, daysToExam: dl };
    const existing = loadSchedule();
    const lockedById = new Map();
    for (const b of existing.blocks) if (b.locked) lockedById.set(b.id, b);
    const out = [];
    for (let i = 0; i < horizon; i++) {
        const date = addDays(today, i);
        const day = buildDayBlocks(cfg, date, dueCounts, fullExtras);
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

export function getSchedule({ regenerateIfStale = true, today = isoDate(new Date()), dueCounts = {}, ticksAll = {} } = {}) {
    const s = loadSchedule();
    if (regenerateIfStale && (!s.blocks.length || s.today !== today)) {
        // Build extras with available data, including daysToExam for pace-aware allocation
        const cfg = loadConfig();
        const daysToExam = daysBetween(today, cfg.examDate);
        const extras = { dueCounts, daysToExam, ticksAll };
        return regenerate({ today, dueCounts, extras });
    }
    return s;
}

// Dynamic intensity based on recent progress rate
export function computeDynamicIntensity(cfg, weeklyGradedAvg) {
    const baseIntensity = INTENSITY_FACTOR[cfg.intensity] || 1;
    if (weeklyGradedAvg < 10) return baseIntensity * 0.8;
    if (weeklyGradedAvg < 30) return baseIntensity * 1.0;
    if (weeklyGradedAvg > 100) return baseIntensity * 1.15;
    return baseIntensity;
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

// Reconcile a schedule against actual student work.
// inputs:
//   today: ISO date. Past blocks that fell short roll their shortfall into today's first
//     block of the same subject as `rollover:{review,new}`.
//   actualBySubject: { [subject]: { review, new, sectionsRead:Set<line>, casesDone:Set<id> } }
//     aggregated across the schedule's date range. Caller may pre-aggregate or pass per-day.
//   actualByDayBySubject (optional): { [date]:{ [subject]:{review,new,sectionsRead,casesDone} } }
//     for finer-grained reconciliation. When omitted, all actuals are treated as today's.
// Mutates blocks: sets completed*, done, over, surplus, rollover. Saves and returns the schedule.
export function reconcile({ today = isoDate(new Date()), actualByDayBySubject = null, actualBySubject = {} } = {}) {
    const s = loadSchedule();
    const blocks = s.blocks;
    // index per (date, subject) -> first study block
    const firstStudy = {};
    for (const b of blocks) {
        if (b.kind !== 'study') continue;
        const k = `${b.date}|${b.subject}`;
        if (!firstStudy[k]) firstStudy[k] = b;
    }
    // helper to fetch actuals for a (date, subject)
    const actFor = (date, subj) => {
        if (actualByDayBySubject && actualByDayBySubject[date] && actualByDayBySubject[date][subj]) return actualByDayBySubject[date][subj];
        if (date === today && actualBySubject[subj]) return actualBySubject[subj];
        return { review: 0, new: 0, sectionsRead: new Set(), casesDone: new Set() };
    };
    // First pass: distribute actuals across blocks of the same (date,subject) in order.
    // Same-day blocks for a subject share a pool; consume planned slots in order.
    const remaining = {};
    for (const b of blocks) {
        if (b.kind !== 'study') continue;
        const k = `${b.date}|${b.subject}`;
        if (!remaining[k]) {
            const a = actFor(b.date, b.subject);
            remaining[k] = {
                review: a.review || 0, new: a.new || 0,
                sectionsRead: new Set(a.sectionsRead || []),
                casesDone: new Set(a.casesDone || [])
            };
        }
        const pool = remaining[k];
        const r = Math.min(b.plannedReview || 0, pool.review);
        const n = Math.min(b.plannedNew || 0, pool.new);
        b.completedReview = r; b.completedNew = n;
        pool.review -= r; pool.new -= n;
        b.completedSections = (b.plannedSections || []).filter(line => pool.sectionsRead.has(String(line)));
        b.completedCases = (b.plannedCases || []).filter(id => pool.casesDone.has(id));
        b.done = (b.completedReview >= (b.plannedReview || 0))
              && (b.completedNew >= (b.plannedNew || 0))
              && (b.completedSections.length >= (b.plannedSections || []).length)
              && (b.completedCases.length >= (b.plannedCases || []).length);
    }
    // Second pass: leftover surplus credits next-day block of same subject (subtract planned).
    // Past-day shortfalls roll into today's first block of same subject as rollover.
    for (const b of blocks) {
        if (b.kind !== 'study') continue;
        const k = `${b.date}|${b.subject}`;
        const pool = remaining[k]; if (!pool) continue;
        if (pool.review > 0 || pool.new > 0) {
            b.over = true; b.surplus = pool.review + pool.new;
            // credit next-day same-subject first block
            const next = firstStudy[`${addDays(b.date, 1)}|${b.subject}`];
            if (next) {
                next.plannedReview = Math.max(0, (next.plannedReview || 0) - pool.review);
                next.plannedNew = Math.max(0, (next.plannedNew || 0) - pool.new);
            }
            pool.review = 0; pool.new = 0;
        }
    }
    // Past-day shortfalls -> today rollover
    const todayKey = today;
    for (const b of blocks) {
        if (b.kind !== 'study') continue;
        if (b.date >= todayKey) continue;
        const shortR = Math.max(0, (b.plannedReview || 0) - (b.completedReview || 0));
        const shortN = Math.max(0, (b.plannedNew || 0) - (b.completedNew || 0));
        if (!shortR && !shortN) continue;
        const target = firstStudy[`${todayKey}|${b.subject}`];
        if (!target) continue;
        const ro = target.rollover || { review: 0, new: 0 };
        ro.review += shortR; ro.new += shortN;
        target.rollover = ro;
        target.plannedReview = (target.plannedReview || 0) + shortR;
        target.plannedNew = (target.plannedNew || 0) + shortN;
    }
    saveSchedule(s);
    return s;
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

export function subjectList() { return SUBJECTS.slice(); }
export const SUBJECT_LIST = SUBJECTS;
