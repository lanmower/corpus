// app-context.js — the dependency-free substrate the rest of the app hangs off.
// This is the bottom of the composition spine: it owns the single `state` object,
// the `el` DOM builder, the data-loading primitives, and the small cross-cutting
// helpers that every view needs. It imports leaf libraries only (srs, schedule,
// toast, clipboard, triage-store, icons) and NEVER imports a view, the router, or
// app.js — so there is no upward edge and no import cycle. Views and the router
// import their substrate from here.
import * as srs from './srs.js';
import * as schedule from './schedule.js';
import * as toast from './toast.js';
import { ICON } from './icons.js';
import { copyToClipboard } from './clipboard.js';
import { readSessions as readTriageSessions, sessionCards as triageSessionCards } from './triage-store.js';
import { skey, dataPath } from './syllabus.js';

// ---- DOM refs ----
export const appRoot = document.getElementById('app');
// `stage` is the render target. It is reassigned when the SDK render path swaps in
// a collector proxy, so it is owned here behind get/set accessors (an imported
// `let` cannot reflect a reassignment to its importers). Views render into
// getStage(); the SDK bootstrap swaps it via setStage().
let _stage = document.getElementById('stage');
export function getStage() { return _stage; }
export function setStage(node) { _stage = node; }
export const statusbar = document.querySelector('.statusbar');
export const statusbarMsg = document.getElementById('statusbar-msg');
export const DEBUG = new URLSearchParams(location.search).has('debug');
export const log = (...a) => console.log('[corpus]', ...a);
export const warn = (...a) => console.warn('[corpus]', ...a);

// ---- the single app state object ----
export const state = {
    manifest: null, shards: {}, route: 'today', currentSubject: null,
    flippedCards: new Set(),
    reviewSubjectFilter: 'all', reviewQueue: [], reviewQueueIds: [],
    reviewAgainPile: [], reviewAllCardIds: [], reviewIndex: 0,
    reviewRevealed: false, reviewSessionGraded: 0, reviewSessionStarted: 0, reviewSessionCards: [],
    sessionFinished: false, searchPaletteApi: null, reviewSessionCap: null,
    cramMode: false, learnMode: false, reviewTagFilter: new Set(),
    paletteReviewSet: null, sectionFilter: null,
    _reviewBacklog: [], lastReviewDueCount: 0,
    // Same-session dedup for the daily tutor check-in (see triggerTutorCheckin).
    tutorCheckinPosted: false,
    tutorCheckinDate: null,
    // Guide shards sent to the tutor worker for Q&A indexing; tied to tutorWorker lifetime.
    // Cleared on worker respawn so new workers aren't silently assumed to have prior shards.
    tutorIndexedSubjects: new Set()
};
window.__corpus = state;
window.__corpus.DEBUG = DEBUG;

// ---- DOM builder ----
export function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') e.className = v;
        else if (k === 'on') for (const [ev, h] of Object.entries(v)) e.addEventListener(ev, h);
        else if (k === 'data') for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
        // unsafeHtml: trusted SVG/HTML only — never pass user or LLM text here (XSS)
        else if (k === 'unsafeHtml') e.innerHTML = v;
        else if (v != null) e.setAttribute(k, v);
    }
    for (const c of kids) {
        if (c == null) continue;
        if (Array.isArray(c)) for (const cc of c) e.append(cc instanceof Node ? cc : document.createTextNode(String(cc)));
        else e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return e;
}
// Render an icon as an inline element for el()/innerHTML contexts.
export function icon(name, cls = 'i') { return el('span', { class: cls, unsafeHtml: ICON[name] || '' }); }
// Icon + text label as a small inline cluster (replaces "glyph text" strings).
export function iconLabel(name, text) { return el('span', { class: 'icon-label' }, icon(name), el('span', {}, text)); }

// ---- data loading ----
export async function fetchJson(p) { const r = await fetch(p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); }
export async function loadManifest() {
    state.manifest = await fetchJson(dataPath('manifest.json'));
    try { schedule.setSubjectList(state.manifest.subjects.map(s => s.subject)); } catch {}
}
export async function loadShard(s) { if (state.shards[s]) return state.shards[s]; state.shards[s] = await fetchJson(dataPath(`${s}.json`)); return state.shards[s]; }
export async function loadAllShards() { await Promise.all(state.manifest.subjects.map(s => loadShard(s.subject))); }

// ---- guide ticks + mastery helpers ----
export function loadGuideTicks() {
    try { return JSON.parse(localStorage.getItem(skey('guide.v1')) || '{}'); } catch { return {}; }
}
export function saveGuideTicks(t) { localStorage.setItem(skey('guide.v1'), JSON.stringify(t)); }
export function masteryFor(subject) {
    const ticks = loadGuideTicks()[subject] || {};
    const total = state.shards[subject]?.guide?.sections?.length || 0;
    if (!total) return 0;
    return Math.round((Object.values(ticks).filter(Boolean).length / total) * 100);
}

// Map subject -> Map<sectionLine, count> of cards keyed by their `requires.sectionLine`.
export function sectionCardCounts(subject) {
    const sh = state.shards[subject];
    const m = new Map();
    if (!sh) return m;
    for (const c of sh.cards) {
        if (!c.requires || !c.requires.sectionLine) continue;
        const k = String(c.requires.sectionLine);
        m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
}

export function exportSessionCards(cards) {
    if (!cards || cards.length === 0) { toast.show('No cards to export'); return; }
    const lines = [];
    for (const card of cards) {
        const front = (card.front || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
        const back = (card.back || '').replace(/\t/g, ' ').replace(/\n/g, ' ');
        const subject = card._subject || 'unknown';
        const section = card.requires?.sectionLine || '';
        lines.push([front, back, subject, section].join('\t'));
    }
    copyToClipboard(lines.join('\n'),
        `Copied ${cards.length} card${cards.length === 1 ? '' : 's'} to clipboard`,
        'Failed to copy to clipboard');
}

// ---- due/queue counters ----
export function dueCountFor(subject) {
    const sh = state.shards[subject]; if (!sh) return 0;
    const ids = sh.cards.map(c => c.id);
    return srs.getDueCards(ids, srs.loadStates()).length;
}
export function totalDueAll(states = srs.loadStates()) {
    let n = 0;
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject]; if (!sh) continue;
        n += srs.getDueCards(sh.cards.map(c => c.id), states).length;
    }
    return n;
}
export function dueCountsBySubject(states = srs.loadStates()) {
    const out = {};
    if (!state.manifest) return out;
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject];
        out[meta.subject] = sh ? srs.getDueCards(sh.cards.map(c => c.id), states).length : 0;
    }
    return out;
}
export function totalCasesQueued() {
    let n = 0;
    const { sessions } = readTriageSessions();
    for (const id of Object.keys(sessions)) {
        if (triageSessionCards(sessions[id]).length > 0) n++;
    }
    return n;
}

// Build the schedule extras' casesDone map keyed by SUBJECT.
export function casesDoneBySubject() {
    const out = {};
    try {
        const done = new Set(Object.keys(readTriageSessions().sessions));
        if (!done.size) return out;
        for (const [subj, sh] of Object.entries(state.shards || {})) {
            for (const sc of sh?.triage?.scenarios || []) {
                const id = sc.id || sc.name;
                if (done.has(id)) (out[subj] = out[subj] || new Set()).add(id);
            }
        }
    } catch {}
    return out;
}

export function estReviewMinutes(due) { return Math.max(1, Math.round(due * 0.4)); }

// Anchor-id slug for guide sections (shared by today nav, the guide builders, and
// the review->guide section link).
export function slugify(t) { return String(t).toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, ''); }

// Count of new-but-eligible cards across all subjects (today's "learn new" gate
// and review's caught-up recommendation both read this).
export function totalNewEligibleAll(states = srs.loadStates()) {
    const ticksAll = loadGuideTicks();
    const out = {};
    let total = 0;
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject]; if (!sh) continue;
        const cards = sh.cards.map(c => ({ ...c, _subject: meta.subject }));
        const n = srs.getNewEligibleCards(cards, states, ticksAll).length;
        out[meta.subject] = n; total += n;
    }
    return { total, bySubject: out };
}

// Sum plannedReview+plannedNew across today's study blocks.
export function todayPlanReviewTarget() {
    try {
        const today = schedule.isoDate(new Date());
        const sched = schedule.loadSchedule();
        const blocks = (sched.blocks || []).filter(b => b.date === today && b.kind === 'study');
        let n = 0;
        for (const b of blocks) n += (b.plannedReview || 0) + (b.plannedNew || 0);
        return n;
    } catch { return 0; }
}

// ---- footer offline indicator ----
export function updateFooter() {
    if (!statusbar || !statusbarMsg) return;
    if (!navigator.onLine) {
        statusbar.classList.remove('hidden');
        statusbarMsg.textContent = 'offline - saved locally';
    } else {
        statusbar.classList.add('hidden');
    }
}
