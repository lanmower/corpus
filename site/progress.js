// student progress — streak, daily goal, today counters. corpus.progress.v1
const KEY = 'corpus.progress.v1';
const VERSION = 1;

function todayISO() { return new Date().toISOString().slice(0, 10); }
function dayOffset(a, b) {
    const d = (new Date(b) - new Date(a)) / 86400000;
    return Math.round(d);
}

function defaults() {
    return {
        version: VERSION, streak: 0, lastActiveDate: null,
        dailyGoal: 30, todayDate: todayISO(),
        todayGraded: 0, todayCases: 0,
        lastSubject: null, lastRoute: null,
        history: []
    };
}

export function load() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return defaults();
        const p = JSON.parse(raw);
        if (p.version !== VERSION) return defaults();
        // Day rollover
        const today = todayISO();
        if (p.todayDate !== today) {
            p.history = (p.history || []).concat([{
                date: p.todayDate, graded: p.todayGraded || 0, cases: p.todayCases || 0
            }]).slice(-60);
            p.todayDate = today;
            p.todayGraded = 0;
            p.todayCases = 0;
        }
        return { ...defaults(), ...p };
    } catch { return defaults(); }
}

export function save(p) { localStorage.setItem(KEY, JSON.stringify(p)); }

export function rollStreak(p, now = todayISO()) {
    if (!p.lastActiveDate) { p.streak = 1; p.lastActiveDate = now; return p; }
    const off = dayOffset(p.lastActiveDate, now);
    if (off === 0) return p;
    if (off === 1) p.streak += 1; else p.streak = 1;
    p.lastActiveDate = now;
    return p;
}

export function bumpGraded(n = 1) {
    const p = load();
    rollStreak(p);
    p.todayGraded = (p.todayGraded || 0) + n;
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

export function reset() { localStorage.removeItem(KEY); }

if (typeof window !== 'undefined') {
    window.__progress = { load, save, bumpGraded, bumpCase, setGoal, setLast, rollStreak, reset };
}
