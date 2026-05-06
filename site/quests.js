// daily + weekly quests. corpus.quests.v1
import * as game from './game.js';

const KEY = 'corpus.quests.v1';
const HIST_KEY = 'corpus.quests.history.v1';
const VERSION = 1;
const DAILY_REWARD = 200;
const WEEKLY_REWARD = 1000;

export const DAILY_TEMPLATES = [
    { id: 'review-50-cards', label: 'review 50 cards', target: 50, kind: 'card_count' },
    { id: 'tick-3-sections', label: 'tick 3 guide sections', target: 3, kind: 'section_count' },
    { id: 'complete-1-case', label: 'complete 1 case', target: 1, kind: 'case_count' },
    { id: 'finish-4-pomodoros', label: 'finish 4 pomodoros', target: 4, kind: 'pomo_count' },
    { id: 'review-weakest-30min', label: 'review weakest subject 30 min', target: 30, kind: 'weakest_minutes' },
    { id: 'clear-5-mistakes', label: 'clear 5 mistakes', target: 5, kind: 'mistakes_cleared' },
    { id: 'place-3-flags', label: 'place 3 flags', target: 3, kind: 'flag_added' },
    { id: 'log-2-notes', label: 'log 2 notes', target: 2, kind: 'note_added' },
    { id: 'drill-10', label: 'finish a 10-card drill', target: 10, kind: 'drill_cards' },
    { id: 'polyglot-touch-3', label: 'touch 3 subjects today', target: 3, kind: 'subjects_touched' },
    { id: 'master-1-streak-3', label: 'master 1 card to grade-4 streak of 3', target: 3, kind: 'master_streak' },
    { id: 'finish-3-blocks', label: 'finish 3 schedule blocks', target: 3, kind: 'blocks_done' },
    { id: 'review-30-weakest', label: 'review 30 cards of weakest subject', target: 30, kind: 'weakest_cards' },
    { id: 'complete-day-100', label: '100% of today\'s schedule', target: 100, kind: 'schedule_pct' }
];

export const WEEKLY_TEMPLATES = [
    { id: 'schedule-100-week', label: '100% schedule completion this week', target: 7, kind: 'schedule_full_days' },
    { id: 'master-one-subject', label: 'master one subject (≥75%)', target: 1, kind: 'subject_75' },
    { id: 'clear-20-mistakes', label: 'clear 20 mistakes', target: 20, kind: 'mistakes_cleared' },
    { id: 'review-7-days-straight', label: 'review 7 days straight', target: 7, kind: 'review_days' },
    { id: 'complete-50-blocks', label: 'finish 50 schedule blocks', target: 50, kind: 'blocks_done' },
    { id: 'all-subjects-touched', label: 'touch all 8 subjects', target: 8, kind: 'subjects_touched_week' },
    { id: '5-cases-70', label: '5 cases above 70%', target: 5, kind: 'cases_passed' },
    { id: 'pomo-2-daily-7d', label: '2 pomodoros daily for 7d', target: 7, kind: 'pomo_streak' }
];

function todayISO() { return new Date().toISOString().slice(0, 10); }
function isoWeek(d = new Date()) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const wn = Math.ceil((((t - y) / 86400000) + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(wn).padStart(2, '0')}`;
}

function defaults() {
    return { version: VERSION, daily: [], weekly: null, dailyAssignedISO: null, weeklyAssignedWeek: null };
}

export function load() {
    try { const raw = localStorage.getItem(KEY); if (!raw) return defaults();
        const q = JSON.parse(raw); if (q.version !== VERSION) return defaults();
        return { ...defaults(), ...q };
    } catch { return defaults(); }
}
export function save(q) { localStorage.setItem(KEY, JSON.stringify(q)); }

export function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; }
}
function saveHistory(h) { localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(-200))); }

function shuffleSeed(arr, seedStr) {
    let h = 0; for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        h = (h * 1103515245 + 12345) >>> 0;
        const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function rollDaily(dateISO = todayISO()) {
    const q = load();
    if (q.dailyAssignedISO === dateISO && q.daily.length) return q;
    const picked = shuffleSeed(DAILY_TEMPLATES, dateISO).slice(0, 3).map(t => ({
        id: t.id, label: t.label, target: t.target, kind: t.kind, progress: 0, claimed: false
    }));
    q.daily = picked; q.dailyAssignedISO = dateISO;
    save(q); return q;
}

export function rollWeekly(now = new Date()) {
    const q = load();
    const wk = isoWeek(now);
    if (q.weeklyAssignedWeek === wk && q.weekly) return q;
    const picked = shuffleSeed(WEEKLY_TEMPLATES, wk)[0];
    q.weekly = { id: picked.id, label: picked.label, target: picked.target, kind: picked.kind, progress: 0, claimed: false };
    q.weeklyAssignedWeek = wk;
    save(q); return q;
}

export function ensureCurrent() { rollDaily(); rollWeekly(); return load(); }

export function progressOn(eventName, payload = {}) {
    const q = ensureCurrent();
    const map = {
        'srs:graded': ['card_count', 'weakest_cards', 'mistakes_cleared', 'master_streak'],
        'section:ticked': ['section_count'],
        'case:graded': ['case_count', 'cases_passed'],
        'pomodoro:done': ['pomo_count', 'pomo_streak'],
        'flag:added': ['flag_added'],
        'note:added': ['note_added'],
        'drill:complete': ['drill_cards'],
        'block:done': ['blocks_done'],
        'subject:touched': ['subjects_touched', 'subjects_touched_week'],
        'schedule:full': ['schedule_pct', 'schedule_full_days', 'review_days'],
        'subject:mastered': ['subject_75']
    };
    const kinds = map[eventName] || [];
    for (const item of [...q.daily, q.weekly].filter(Boolean)) {
        if (item.claimed) continue;
        if (!kinds.includes(item.kind)) continue;
        const inc = payload.amount || 1;
        item.progress = Math.min(item.target, (item.progress || 0) + inc);
    }
    save(q);
    return q;
}

export function claim(id) {
    const q = ensureCurrent();
    let item = q.daily.find(x => x.id === id) || (q.weekly && q.weekly.id === id ? q.weekly : null);
    if (!item || item.claimed || item.progress < item.target) return null;
    const reward = q.daily.includes(item) ? DAILY_REWARD : WEEKLY_REWARD;
    item.claimed = true;
    save(q);
    game.awardXP(reward, `quest:${id}`);
    const hist = loadHistory();
    hist.push({ id, label: item.label, reward, ts: Date.now() });
    saveHistory(hist);
    try { window.dispatchEvent(new CustomEvent('quest:completed', { detail: { id, label: item.label, reward } })); } catch {}
    return { id, reward };
}

export function reset() { localStorage.removeItem(KEY); localStorage.removeItem(HIST_KEY); }

if (typeof window !== 'undefined') window.__quests = { load, ensureCurrent, rollDaily, rollWeekly, progressOn, claim, loadHistory, reset, DAILY_TEMPLATES, WEEKLY_TEMPLATES };
