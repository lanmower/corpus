// student progress -- streak, daily goal, today counters. corpus.progress.v1
import { localDayISO, dayOffset } from './dates.js';
import { skey } from './syllabus.js';
const KEY = () => skey('progress.v1');
const VERSION = 1;

function todayISO() { return localDayISO(); }
// Streak grace: 0:00--6:00 counts for the prior LOCAL calendar day. Subtract
// the grace window, then key on local components — mixing local getHours with
// a UTC date string breaks the guarantee for any user off UTC.
function effectiveDateISO(now = new Date()) {
    if (now.getHours() < 6) {
        return localDayISO(new Date(now.getTime() - 6 * 3600 * 1000));
    }
    return localDayISO(now);
}

function defaults() {
    return {
        version: VERSION, streak: 0, lastActiveDate: null,
        dailyGoal: 30, todayDate: todayISO(),
        todayGraded: 0, todayCases: 0,
        lastSubject: null, lastRoute: null,
        lastReviewedAt: null,
        history: [], gradedBySubject: {}, sessions: []
    };
}

export function load() {
    try {
        const raw = localStorage.getItem(KEY());
        if (!raw) return defaults();
        const p = JSON.parse(raw);
        // Migrate forward, never silently discard: streak/history/gradedBySubject
        // are authored only here and are not recomputable from other stores
        // (mirrors srs.migrate). A strictly-newer blob is from a future build we
        // cannot interpret — fall back to defaults rather than corrupt it. Any
        // older/unversioned shape is merged forward by the `{...defaults(), ...p}`
        // spread below, preserving every field the user accumulated.
        if (typeof p.version === 'number' && p.version > VERSION) return defaults();
        // Day rollover
        const today = todayISO();
        if (p.todayDate !== today) {
            p.history = (p.history || []).concat([{
                date: p.todayDate, graded: p.todayGraded || 0, cases: p.todayCases || 0
            }]).slice(-60);
            p.sessions = (p.sessions || []).filter(s => s.date !== today);
            p.todayDate = today;
            p.todayGraded = 0;
            p.todayCases = 0;
            p.gradedBySubject = {};
        }
        return { ...defaults(), ...p };
    } catch { return defaults(); }
}

// Quota-guarded: a setItem throw must degrade to the storage-full banner, not
// escape into the grading/case-completion flow (same contract as srs/schedule).
export function save(p) {
    try { localStorage.setItem(KEY(), JSON.stringify(p)); }
    catch (e) {
        try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('corpus:storage-full', { detail: { source: 'progress', error: String(e) } })); } catch {}
    }
}

export { effectiveDateISO };
export function rollStreak(p, now = effectiveDateISO()) {
    if (!p.lastActiveDate) { p.streak = 1; p.lastActiveDate = now; return p; }
    const off = dayOffset(p.lastActiveDate, now);
    if (off === 0) return p;
    if (off === 1) p.streak += 1; else p.streak = 1;
    p.lastActiveDate = now;
    return p;
}

export function bumpGraded(n = 1, subject = null) {
    const p = load();
    rollStreak(p);
    p.todayGraded = (p.todayGraded || 0) + n;
    p.lastReviewedAt = Date.now();
    if (subject) {
        p.gradedBySubject = p.gradedBySubject || {};
        p.gradedBySubject[subject] = (p.gradedBySubject[subject] || 0) + n;
    }
    save(p);
    return p;
}

export function bumpCase(n = 1) {
    const p = load();
    rollStreak(p);
    p.todayCases = (p.todayCases || 0) + n;
    save(p);
    return p;
}

export function setGoal(g) { const p = load(); p.dailyGoal = Math.max(1, g | 0); save(p); return p; }
export function setLast(route, subject) {
    const p = load();
    p.lastRoute = route;
    if (subject) p.lastSubject = subject;
    save(p); return p;
}

export function reset() { localStorage.removeItem(KEY()); }

if (typeof window !== 'undefined') {
    window.__progress = { load, save, bumpGraded, bumpCase, setGoal, setLast, rollStreak, reset };
}



