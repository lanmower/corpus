// SRS engine — SM-2+ with learning steps, leech detection, interval fuzz.
// Schema-versioned localStorage. Browser + node compatible.

import { localDayISO } from './dates.js';
import { skey } from './syllabus.js';

// Per-syllabus keys: corpus.<activeSyllabus>.srs.states / .srs.config. Resolved per
// call so the post-boot active syllabus (and a mid-session switch+reload) is honored.
const STATES_KEY = () => skey('srs.states');
const CONFIG_KEY = () => skey('srs.config');
// Default exam date is computed relative to today (not a frozen constant): a
// hardcoded date silently rots into the past, and a past default makes
// daysUntilExam clamp to 0 -> the exam-day takeover hijacks every route for a
// fresh user. ~12 weeks out is a sane default study horizon.
const DEFAULT_EXAM_HORIZON_DAYS = 84;
export const defaultExamDate = () => localDayISO(new Date(Date.now() + DEFAULT_EXAM_HORIZON_DAYS * 86400000));
const SCHEMA_VERSION = 1;
const LEARNING_STEPS_MIN = [1, 10];
const GRADUATING_INTERVAL = 1;
const LEECH_THRESHOLD = 8;
const FUZZ_RATIO = 0.05;

export function defaultCardState() {
    return {
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
        learningStep: 0,
        phase: 'learning',
        lapses: 0,
        isLeech: false,
        dueDate: today(),
        dueAt: Date.now(),
        lastScore: null,
        history: []
    };
}

export function calcSM2(state, score) {
    if (score < 3) return { ...state, interval: 1, repetitions: 0, easeFactor: Math.max(1.3, state.easeFactor - 0.15) };
    const ef = Math.max(1.3, state.easeFactor + 0.1 - (5 - score) * (0.08 + (5 - score) * 0.02));
    let interval;
    if (state.repetitions === 0) interval = 1;
    else if (state.repetitions === 1) interval = 6;
    else interval = Math.round(state.interval * ef);
    return { ...state, easeFactor: ef, interval, repetitions: state.repetitions + 1 };
}

export function fuzzInterval(days, rng = Math.random) {
    if (days < 2) return days;
    const delta = Math.round(days * FUZZ_RATIO * (rng() * 2 - 1));
    return Math.max(1, days + delta);
}

export function schedule(state, score, now = Date.now(), rng = Math.random) {
    const prev = { ...defaultCardState(), ...state };
    const history = [...(prev.history || [])];
    history.push({ ts: now, score });
    if (history.length > 50) history.splice(0, history.length - 50);

    if (score < 3) {
        const lapses = prev.phase === 'review' ? prev.lapses + 1 : prev.lapses;
        const isLeech = lapses >= LEECH_THRESHOLD;
        return {
            ...prev,
            phase: 'learning',
            learningStep: 0,
            interval: 0,
            repetitions: 0,
            lapses,
            isLeech,
            dueAt: now + LEARNING_STEPS_MIN[0] * 60000,
            dueDate: dateOf(now + LEARNING_STEPS_MIN[0] * 60000),
            lastScore: score,
            history
        };
    }

    if (prev.phase === 'learning') {
        const nextStep = prev.learningStep + 1;
        if (nextStep < LEARNING_STEPS_MIN.length) {
            const delayMin = LEARNING_STEPS_MIN[nextStep];
            return {
                ...prev,
                learningStep: nextStep,
                phase: 'learning',
                interval: 0,
                dueAt: now + delayMin * 60000,
                dueDate: dateOf(now + delayMin * 60000),
                lastScore: score,
                history
            };
        }
        const intv = fuzzInterval(GRADUATING_INTERVAL, rng);
        return {
            ...prev,
            phase: 'review',
            learningStep: 0,
            interval: intv,
            repetitions: 1,
            dueAt: now + intv * 86400000,
            dueDate: dateOf(now + intv * 86400000),
            lastScore: score,
            history
        };
    }

    const sm = calcSM2(prev, score);
    const fuzzed = Math.min(36500, fuzzInterval(sm.interval, rng));
    return {
        ...prev,
        ...sm,
        interval: fuzzed,
        phase: 'review',
        dueAt: now + fuzzed * 86400000,
        dueDate: dateOf(now + fuzzed * 86400000),
        lastScore: score,
        history
    };
}

export function compressInterval(interval, effectiveDays, pendingCount) {
    // Non-finite effectiveDays (a corrupt/unparseable examDate -> NaN) must NOT
    // slip through `<= 0` (NaN <= 0 is false): a NaN pressure poisons interval and
    // dueAt to NaN, and `NaN > now` is always false, so the card becomes
    // permanently due and never re-schedules. Treat non-finite as max pressure.
    if (!Number.isFinite(effectiveDays) || effectiveDays <= 0) return 1;
    const pressure = Math.min(1, pendingCount / effectiveDays);
    return Math.max(1, Math.round(interval * (1 - pressure * 0.5)));
}

// LOCAL day keys: due dates roll at local midnight, in step with the schedule
// day-keys and the daily counters (a UTC key makes a 1-day card graded just
// after local midnight reappear as due in the same session).
export function today() { return localDayISO(); }
function dateOf(ms) { return localDayISO(new Date(ms)); }

function migrate(payload) {
    if (!payload || typeof payload !== 'object') return { version: SCHEMA_VERSION, states: {} };
    if (payload.version === SCHEMA_VERSION) return payload;
    // A version we don't recognise (a backup from a NEWER schema) must be rejected,
    // not silently re-stamped as the current version - restamping would relabel
    // possibly-incompatible card states. null/absent is the only known older shape.
    if (payload.version != null && payload.version !== SCHEMA_VERSION) {
        throw new Error(`srs: unsupported schema version ${payload.version} (this build supports ${SCHEMA_VERSION})`);
    }
    if (payload.version == null && typeof payload === 'object') {
        const states = {};
        for (const [id, s] of Object.entries(payload)) {
            if (s && typeof s === 'object' && s.easeFactor != null) {
                states[id] = { ...defaultCardState(), ...s, phase: 'review' };
            }
        }
        return { version: SCHEMA_VERSION, states };
    }
    return payload;
}

export function loadStates() {
    try {
        const raw = localStorage.getItem(STATES_KEY());
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        const migrated = migrate(parsed);
        if (parsed.version !== SCHEMA_VERSION) localStorage.setItem(STATES_KEY(), JSON.stringify(migrated));
        return migrated.states || {};
    } catch (e) {
        // An unsupported (newer) schema is rejected by migrate() to protect the
        // backup from being relabeled. We still return {} so callers never crash,
        // but signal it so the reset isn't silent - the stored payload is left
        // untouched (the throw happens before any setItem), so the data is safe.
        if (e && /unsupported schema version/.test(String(e.message)) && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('corpus:storage-incompatible', { detail: { source: 'srs', error: String(e.message) } }));
        }
        return {};
    }
}

export function saveStates(states) {
    try {
        localStorage.setItem(STATES_KEY(), JSON.stringify({ version: SCHEMA_VERSION, states }));
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('corpus:srs-changed'));
    } catch (e) {
        const quota = e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message)));
        if (quota && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('corpus:storage-full', { detail: { source: 'srs', error: String(e) } }));
        else throw e;
    }
}

export function suspendCard(cardId, suspended = true) {
    const states = loadStates();
    const s = states[cardId] ?? defaultCardState();
    states[cardId] = { ...s, suspended: !!suspended };
    saveStates(states);
    return states[cardId];
}

export function isSuspended(cardId, states = loadStates()) {
    return !!(states[cardId] && states[cardId].suspended);
}

export function exportState() {
    return JSON.stringify({ version: SCHEMA_VERSION, states: loadStates(), config: loadConfig(), exportedAt: new Date().toISOString() }, null, 2);
}

export function importState(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    const migrated = migrate(parsed);
    if (migrated.states) saveStates(migrated.states);
    if (parsed.config) saveConfig(parsed.config);
    return Object.keys(migrated.states || {}).length;
}

export function loadConfig() {
    try {
        const raw = localStorage.getItem(CONFIG_KEY());
        const cfg = raw ? JSON.parse(raw) : {};
        const out = { examDate: defaultExamDate(), sessionGoal: 30, ...cfg };
        // A hand-edited / legacy / unparseable examDate would make new Date() an
        // Invalid Date and cascade NaN through the whole SM-2 schedule. Fall back
        // to the default rather than persist a poison value downstream.
        if (!Number.isFinite(new Date(out.examDate).getTime())) out.examDate = defaultExamDate();
        return out;
    } catch { return { examDate: defaultExamDate(), sessionGoal: 30 }; }
}

export function saveConfig(cfg) {
    // Merge over the persisted config so a partial write (e.g. saveConfig({ sessionGoal })
    // from a future settings control) cannot silently wipe the other field. Without this,
    // the full-overwrite contract was an undocumented caller obligation every call site
    // had to honour by re-spreading loadConfig() — exactly the misuse a confused
    // maintainer would hit. loadConfig() already normalises a poison examDate.
    const merged = { ...loadConfig(), ...cfg };
    // Mirror saveStates' quota guard: a full quota degrades to the storage-full
    // banner instead of throwing an uncaught error out of an exam-date / goal edit.
    try {
        localStorage.setItem(CONFIG_KEY(), JSON.stringify(merged));
    } catch (e) {
        const quota = e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message)));
        if (quota && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('corpus:storage-full', { detail: { source: 'srs', error: String(e) } }));
        else throw e;
    }
}

export function daysUntilExam(cfg = loadConfig()) {
    const ms = new Date(cfg.examDate) - new Date(today());
    return Math.max(0, Math.floor(ms / 86400000));
}

// True only when the configured exam date is exactly today. daysUntilExam clamps
// past dates to 0, so `daysUntilExam() === 0` also matches any PAST date and would
// pin the exam-day takeover on forever; compare the calendar day instead.
export function isExamDay(cfg = loadConfig()) {
    return localDayISO(new Date(cfg.examDate)) === today();
}

export function effectiveDays(cfg = loadConfig()) { return Math.max(1, daysUntilExam(cfg) - 14); }

export function isNewCardForGate(state) {
    if (!state) return true;
    return (state.repetitions === 0 || state.repetitions == null) && (state.lastScore == null);
}

export function getDueCards(cardIds, states = loadStates()) {
    const now = Date.now();
    return cardIds.filter(id => {
        const s = states[id];
        if (!s) return false;
        if (s.suspended) return false;
        if (!(s.history && s.history.length > 0)) return false;
        if ((s.dueAt ?? 0) > now) return false;
        return true;
    });
}

export function isIntroduced(state) {
    return !!(state && state.history && state.history.length > 0);
}

export function isEligible(card, state, ticksForSubject) {
    if (isIntroduced(state)) return true;
    const ticks = ticksForSubject || {};
    const line = card?.requires?.sectionLine;
    if (line != null) return !!ticks[String(line)];
    return Object.values(ticks).some(v => v === true);
}

export function getNewEligibleCards(cards, states = loadStates(), ticksAll = {}) {
    return cards.filter(c => {
        if (isIntroduced(states[c.id])) return false;
        return isEligible(c, states[c.id], ticksAll[c._subject] || {});
    });
}

export function introduceCard(cardId, now = Date.now()) {
    const states = loadStates();
    const prev = states[cardId];
    if (isIntroduced(prev)) return prev;
    const seed = { ...defaultCardState(), dueAt: now, dueDate: dateOf(now), history: [{ ts: now, score: null, kind: 'introduced' }] };
    states[cardId] = seed;
    saveStates(states);
    return seed;
}

export function getCardState(cardId, states = loadStates()) {
    return states[cardId] ?? defaultCardState();
}

export function updateCard(cardId, score, allCardIds = null) {
    const states = loadStates();
    const cfg = loadConfig();
    const state = states[cardId] ?? defaultCardState();
    const ids = allCardIds ?? Object.keys(states);
    const now = Date.now();
    const pendingCount = ids.filter(id => ((states[id] ?? defaultCardState()).dueAt ?? 0) <= now).length;
    const next = schedule(state, score, now);
    if (next.phase === 'review' && next.interval > 0) {
        const compressed = compressInterval(next.interval, effectiveDays(cfg), pendingCount);
        if (compressed !== next.interval) {
            next.interval = compressed;
            next.dueAt = now + compressed * 86400000;
            next.dueDate = dateOf(next.dueAt);
        }
    }
    // Merge-write: re-read fresh state immediately before save to reduce the
    // two-tab clobber window from the full review interval to near-zero.
    const fresh = loadStates();
    fresh[cardId] = next;
    saveStates(fresh);
    return next;
}

export function getScheduleStats(cardIds, states = loadStates()) {
    const now = Date.now();
    let due = 0, scheduled = 0, learning = 0, young = 0, mature = 0, leech = 0;
    let efSum = 0, efCount = 0, scoreSum = 0, scoreCount = 0;
    for (const id of cardIds) {
        const s = states[id];
        if (!s) continue;
        scheduled++;
        if ((s.dueAt ?? 0) <= now) due++;
        if (s.phase === 'learning') learning++;
        else if (s.interval < 21) young++;
        else mature++;
        if (s.isLeech) leech++;
        if (s.easeFactor != null) { efSum += s.easeFactor; efCount++; }
        if (s.lastScore != null) { scoreSum += s.lastScore; scoreCount++; }
    }
    return {
        total: cardIds.length, scheduled, due, learning, young, mature, leech,
        new: cardIds.length - scheduled,
        avgEaseFactor: efCount ? efSum / efCount : 2.5,
        avgLastScore: scoreCount ? scoreSum / scoreCount : 0
    };
}

export function getForecast(cardIds, days = 14, states = loadStates()) {
    const now = Date.now();
    const buckets = Array.from({ length: days }, (_, i) => ({ day: i, date: dateOf(now + i * 86400000), count: 0 }));
    for (const id of cardIds) {
        const s = states[id];
        if (!s || !s.dueAt) continue;
        const offset = Math.floor((s.dueAt - now) / 86400000);
        if (offset >= 0 && offset < days) buckets[offset].count++;
    }
    return buckets;
}

export function resetAll() { localStorage.removeItem(STATES_KEY()); }

if (typeof window !== 'undefined') {
    window.__srs = {
        defaultCardState, calcSM2, schedule, fuzzInterval, compressInterval, today,
        loadStates, saveStates, loadConfig, saveConfig, exportState, importState,
        daysUntilExam, isExamDay, effectiveDays, getDueCards, getCardState, updateCard,
        getScheduleStats, getForecast, resetAll, suspendCard, isSuspended, isNewCardForGate, SCHEMA_VERSION
    };
}



