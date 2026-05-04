// SRS engine — SM-2 algorithm + localStorage state.
// Ported from srs-mccqe1/src/scheduler/{sm2,index}.js. Browser-only.

const STATES_KEY = 'corpus.srs.states';
const CONFIG_KEY = 'corpus.srs.config';
const DEFAULT_EXAM_DATE = '2026-06-15';

export function defaultCardState() {
    return {
        easeFactor: 2.5,
        interval: 1,
        repetitions: 0,
        dueDate: today(),
        lastScore: null
    };
}

export function calcSM2(state, score) {
    if (score < 3) return { ...state, interval: 1, repetitions: 0, easeFactor: state.easeFactor };
    const ef = Math.max(1.3, state.easeFactor + 0.1 - (5 - score) * (0.08 + (5 - score) * 0.02));
    let interval;
    if (state.repetitions === 0) interval = 1;
    else if (state.repetitions === 1) interval = 6;
    else interval = Math.round(state.interval * ef);
    return { easeFactor: ef, interval, repetitions: state.repetitions + 1 };
}

export function compressInterval(interval, effectiveDays, pendingCount) {
    if (effectiveDays <= 0) return 1;
    const pressure = Math.min(1, pendingCount / effectiveDays);
    return Math.max(1, Math.round(interval * (1 - pressure * 0.5)));
}

export function today() {
    return new Date().toISOString().slice(0, 10);
}

export function loadStates() {
    try {
        const raw = localStorage.getItem(STATES_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

export function saveStates(states) {
    localStorage.setItem(STATES_KEY, JSON.stringify(states));
}

export function loadConfig() {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        const cfg = raw ? JSON.parse(raw) : {};
        return { examDate: DEFAULT_EXAM_DATE, ...cfg };
    } catch {
        return { examDate: DEFAULT_EXAM_DATE };
    }
}

export function saveConfig(cfg) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function daysUntilExam(cfg = loadConfig()) {
    const ms = new Date(cfg.examDate) - new Date(today());
    return Math.max(0, Math.floor(ms / 86400000));
}

export function effectiveDays(cfg = loadConfig()) {
    return Math.max(1, daysUntilExam(cfg) - 14);
}

export function getDueCards(cardIds, states = loadStates()) {
    const t = today();
    return cardIds.filter(id => {
        const s = states[id] ?? defaultCardState();
        return s.dueDate <= t;
    });
}

export function getCardState(cardId, states = loadStates()) {
    return states[cardId] ?? defaultCardState();
}

export function updateCard(cardId, score, allCardIds = null) {
    const states = loadStates();
    const cfg = loadConfig();
    const state = states[cardId] ?? defaultCardState();
    const ids = allCardIds ?? Object.keys(states);
    const t = today();
    const pendingCount = ids.filter(id => (states[id] ?? defaultCardState()).dueDate <= t).length;
    const next = calcSM2(state, score);
    const compressed = compressInterval(next.interval, effectiveDays(cfg), pendingCount);
    const dueDate = new Date(Date.now() + compressed * 86400000).toISOString().slice(0, 10);
    states[cardId] = { ...next, dueDate, lastScore: score };
    saveStates(states);
    return states[cardId];
}

export function getScheduleStats(cardIds, states = loadStates()) {
    const t = today();
    const due = cardIds.filter(id => (states[id] ?? defaultCardState()).dueDate <= t).length;
    const scheduled = cardIds.filter(id => states[id] != null).length;
    const tracked = cardIds.filter(id => states[id]?.easeFactor != null);
    const avgEF = tracked.length === 0
        ? 2.5
        : tracked.reduce((s, id) => s + states[id].easeFactor, 0) / tracked.length;
    const scored = cardIds.filter(id => states[id]?.lastScore != null);
    const avgScore = scored.length === 0
        ? 0
        : scored.reduce((s, id) => s + states[id].lastScore, 0) / scored.length;
    return {
        total: cardIds.length,
        scheduled,
        due,
        avgEaseFactor: avgEF,
        avgLastScore: avgScore
    };
}

export function resetAll() {
    localStorage.removeItem(STATES_KEY);
}

// Expose for browser witness
if (typeof window !== 'undefined') {
    window.__srs = {
        defaultCardState, calcSM2, compressInterval, today,
        loadStates, saveStates, loadConfig, saveConfig,
        daysUntilExam, effectiveDays,
        getDueCards, getCardState, updateCard, getScheduleStats, resetAll
    };
}
