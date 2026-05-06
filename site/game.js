// XP, levels, badges, daily/weekly XP. corpus.game.v1
const KEY = 'corpus.game.v1';
const VERSION = 1;

export const XP = {
    card_grade_1: 10, card_grade_2: 15, card_grade_3: 20, card_grade_4: 30,
    combo_bonus: 5, block_complete: 50, section_tick: 25,
    case_graded: 75, case_passed_bonus: 25, first_time_correct: 20,
    daily_goal_hit: 100, streak_day_unit: 50, pomodoro_complete: 30
};

function todayISO() { return new Date().toISOString().slice(0, 10); }
function effectiveDateISO(now = new Date()) {
    if (now.getHours() < 6) {
        const d = new Date(now.getTime() - 6 * 3600 * 1000);
        return d.toISOString().slice(0, 10);
    }
    return now.toISOString().slice(0, 10);
}

function defaults() {
    return {
        version: VERSION, xp: 0, level: 1, badges: [],
        todayXP: 0, todayDate: effectiveDateISO(),
        weeklyXP: [0, 0, 0, 0, 0, 0, 0],
        dailyXP: new Array(60).fill(0),
        unlocks: [], suppressToasts: false,
        comboCount: 0, lastGoalHitDate: null
    };
}

export function xpForLevel(n) { return Math.round(100 * Math.pow(n, 1.5)); }
export function levelFromXP(xp) {
    let lvl = 1, need = 0;
    while (true) { const inc = xpForLevel(lvl); if (need + inc > xp) return lvl; need += inc; lvl++; if (lvl > 999) return lvl; }
}
export function xpToNext(xp) {
    const lvl = levelFromXP(xp);
    let need = 0; for (let i = 1; i < lvl; i++) need += xpForLevel(i);
    const inLvl = xp - need; const cur = xpForLevel(lvl);
    return { level: lvl, inLvl, need: cur, frac: inLvl / cur };
}

export function load() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return defaults();
        const g = JSON.parse(raw);
        if (g.version !== VERSION) return defaults();
        return rollover({ ...defaults(), ...g });
    } catch { return defaults(); }
}
export function save(g) { localStorage.setItem(KEY, JSON.stringify(g)); }

function rollover(g) {
    const today = effectiveDateISO();
    if (g.todayDate !== today) {
        const idx = (new Date().getDay());
        g.weeklyXP[idx] = 0;
        g.dailyXP = [g.todayXP, ...g.dailyXP].slice(0, 60);
        g.todayXP = 0;
        g.todayDate = today;
        g.comboCount = 0;
    }
    return g;
}

function emit(name, detail) {
    try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
}

export function awardXP(amount, reason) {
    if (!amount) return load();
    const g = load();
    g.xp += amount;
    g.todayXP += amount;
    const dow = new Date().getDay();
    g.weeklyXP[dow] = (g.weeklyXP[dow] || 0) + amount;
    g.dailyXP[0] = (g.dailyXP[0] || 0) + amount;
    const prevLvl = g.level;
    g.level = levelFromXP(g.xp);
    const leveledUp = g.level > prevLvl;
    save(g);
    emit('game:xp', { delta: amount, total: g.xp, level: g.level, leveledUp, reason });
    return g;
}

export function awardBadge(id, label, icon) {
    const g = load();
    if (g.badges.includes(id)) return g;
    g.badges.push(id);
    g.unlocks.unshift({ id, label, icon, ts: Date.now() });
    g.unlocks = g.unlocks.slice(0, 50);
    save(g);
    emit('game:badge', { id, label, icon });
    return g;
}

export function bumpCombo(score) {
    const g = load();
    if (score >= 3) g.comboCount = (g.comboCount || 0) + 1;
    else g.comboCount = 0;
    save(g);
    return g.comboCount;
}

export function getStats() { return load(); }
export function setSuppressToasts(v) { const g = load(); g.suppressToasts = !!v; save(g); return g; }
export function reset() { localStorage.removeItem(KEY); }

if (typeof window !== 'undefined') {
    window.__game = { load, save, awardXP, awardBadge, bumpCombo, getStats, xpForLevel, levelFromXP, xpToNext, setSuppressToasts, reset, XP };
}
