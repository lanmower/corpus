// corpus — personal med-study notebook. vanilla ESM, no bundler.
import './theme.js';
import * as srs from './srs.js';
import * as progress from './progress.js';
import * as lastpos from './lastpos.js';
import * as cram from './cram.js';
import * as justread from './justread.js';
import * as timer from './timer.js';
import * as mistakes from './mistakes.js';
import * as drill from './drill.js';
import * as flag from './flag.js';
import * as undo from './undo.js';
import * as late from './late.js';
import * as usercards from './usercards.js';
import * as confidence from './confidence.js';
import * as newcards from './newcards.js';
import * as schedule from './schedule.js';
import * as calendar from './calendar.js';
import * as mastery from './mastery.js';
import * as toast from './toast.js';
import { buildRows, computeWeakest, VERDICT_RANK } from './verdicts.js';
import { buildSearchIndex, mountPalette, snippet as searchSnippet } from './search.js';
import { makeToggleButton } from './theme.js';

const stage = document.getElementById('stage');
const statusbarMsg = document.getElementById('statusbar-msg');
const statusbar = document.querySelector('.statusbar');
const DEBUG = new URLSearchParams(location.search).has('debug');
const log = (...a) => console.log('[corpus]', ...a);
const warn = (...a) => console.warn('[corpus]', ...a);

const FRIENDLY_GRADES = [
    { friendly: 1, smscore: 0, label: 'again', desc: "didn't know" },
    { friendly: 2, smscore: 2, label: 'hard', desc: 'slow recall' },
    { friendly: 3, smscore: 4, label: 'good', desc: 'recalled' },
    { friendly: 4, smscore: 5, label: 'easy', desc: 'instant' }
];

const state = {
    manifest: null, shards: {}, route: 'today', currentSubject: null,
    flippedCards: new Set(),
    reviewSubjectFilter: 'all', reviewQueue: [], reviewQueueIds: [],
    reviewAgainPile: [], reviewAllCardIds: [], reviewIndex: 0,
    reviewRevealed: false, reviewSessionGraded: 0, reviewSessionStarted: 0,
    sessionFinished: false, searchPaletteApi: null,
    cramMode: false, reviewTagFilter: new Set(),
    paletteReviewSet: null
};
window.__corpus = state;
window.__corpus.DEBUG = DEBUG;

async function fetchJson(p) { const r = await fetch(p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); }
async function loadManifest() { state.manifest = await fetchJson('./data/manifest.json'); }
async function loadShard(s) { if (state.shards[s]) return state.shards[s]; state.shards[s] = await fetchJson(`./data/${s}.json`); return state.shards[s]; }
async function loadAllShards() { await Promise.all(state.manifest.subjects.map(s => loadShard(s.subject))); }

function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') e.className = v;
        else if (k === 'on') for (const [ev, h] of Object.entries(v)) e.addEventListener(ev, h);
        else if (k === 'data') for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
        else if (k === 'html') e.innerHTML = v;
        else if (v != null) e.setAttribute(k, v);
    }
    for (const c of kids) {
        if (c == null) continue;
        if (Array.isArray(c)) for (const cc of c) e.append(cc instanceof Node ? cc : document.createTextNode(String(cc)));
        else e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return e;
}

const ROUTES = ['today', 'calendar', 'guides', 'review', 'cases', 'stats', 'subject', 'settings', 'mistakes', 'drill'];
const ROUTE_TITLES = { today: 'today', calendar: 'calendar', guides: 'guides', review: 'review',
    cases: 'cases', stats: 'stats', subject: 'subject', settings: 'settings',
    mistakes: 'mistakes', drill: 'drill' };
const ROUTE_ALIASES = { home: 'today', triage: 'cases', subjects: 'guides', cards: 'review',
    notes: 'today', quests: 'today', badges: 'today' };

function setDocTitle(route, subject) {
    const main = subject ? subject : (ROUTE_TITLES[route] || route);
    document.title = `${main} · corpus`;
}

function go(route, subject) {
    if (ROUTE_ALIASES[route]) route = ROUTE_ALIASES[route];
    if (!ROUTES.includes(route)) route = 'today';
    state.route = route;
    if (subject !== undefined) state.currentSubject = subject;
    if (route === 'review' && subject) { state.reviewSubjectFilter = subject; resetReviewQueue(); }
    document.querySelectorAll('.navlink').forEach(a => a.classList.toggle('active', a.dataset.route === route));
    setDocTitle(route, subject);
    progress.setLast(route, subject);
    lastpos.save(route, subject);
    // apply just-read on subject change
    if (route === 'subject' && subject) justread.applyClass(justread.isOn(subject));
    else justread.applyClass(false);
    render();
}

function loadGuideTicks() {
    try { return JSON.parse(localStorage.getItem('corpus.guide.v1') || '{}'); } catch { return {}; }
}
function saveGuideTicks(t) { localStorage.setItem('corpus.guide.v1', JSON.stringify(t)); }
function masteryFor(subject) {
    const ticks = loadGuideTicks()[subject] || {};
    const total = state.shards[subject]?.guide?.sections?.length || 0;
    if (!total) return 0;
    return Math.round((Object.values(ticks).filter(Boolean).length / total) * 100);
}

// Map subject -> Map<sectionLine, count> of cards keyed by their `requires.sectionLine`.
// Informational only — used to label sections with their card count, no gating.
function sectionCardCounts(subject) {
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

function dueCountFor(subject) {
    const sh = state.shards[subject]; if (!sh) return 0;
    const ids = sh.cards.map(c => c.id);
    return srs.getDueCards(ids, srs.loadStates()).length;
}

function totalDueAll() {
    let n = 0;
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject]; if (!sh) continue;
        n += srs.getDueCards(sh.cards.map(c => c.id), srs.loadStates()).length;
    }
    return n;
}

function dueCountsBySubjectMap() {
    const out = {};
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject];
        out[meta.subject] = sh ? srs.getDueCards(sh.cards.map(c => c.id), srs.loadStates()).length : 0;
    }
    return out;
}

function totalCasesQueued() {
    // Cases queued = scenarios in weakest subject + any unfinished sessions
    let n = 0;
    try {
        const persisted = JSON.parse(localStorage.getItem('corpus.triage.v1') || '{}');
        const sessions = persisted.sessions || {};
        for (const id of Object.keys(sessions)) if ((sessions[id] || []).length > 0) n++;
    } catch {}
    return n;
}

function estReviewMinutes(due) { return Math.max(1, Math.round(due * 0.4)); }

// Sum plannedReview across today's study blocks — represents what the plan asks for today,
// not the full backlog. Falls back to 0 when no schedule has been generated yet.
function todayPlanReviewTarget() {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const sched = schedule.loadSchedule();
        const blocks = (sched.blocks || []).filter(b => b.date === today && b.kind === 'study');
        let n = 0;
        for (const b of blocks) n += (b.plannedReview || 0) + (b.plannedNew || 0);
        return n;
    } catch { return 0; }
}

function updateFooter() {
    if (!statusbar || !statusbarMsg) return;
    if (!navigator.onLine) {
        statusbar.classList.remove('hidden');
        statusbarMsg.textContent = 'offline · saved locally';
    } else {
        statusbar.classList.add('hidden');
    }
}

let __rendering = false;
function render() {
    __rendering = true;
    try {
        stage.innerHTML = '';
        if (!state.manifest) { stage.append(el('div', { class: 'loading' }, 'loading…')); return; }
        const r = state.route;
        // day-of-exam minimal mode — only mistakes + farewell
        const days = srs.daysUntilExam();
        if (days === 0 && r !== 'mistakes' && r !== 'settings') {
            renderExamDay(); updateFooter(); return;
        }
        const fns = { today: renderToday, calendar: renderCalendar, guides: renderGuides,
            review: renderReview, cases: renderTriage, stats: renderStats, subject: renderSubject,
            settings: renderSettings, mistakes: renderMistakes, drill: renderDrill };
        (fns[r] || renderToday)();
        updateFooter();
    } finally { __rendering = false; }
}

// ---- shell-prompt status line ----
function renderStatusLine(p, due) {
    const date = new Date().toISOString().slice(0, 10);
    const reviewed = p.todayGraded || 0;
    return el('div', { class: 'status-line', role: 'status', 'aria-label': 'study status' },
        el('span', { class: 'date' }, date),
        el('span', { class: 'sep' }, '·'),
        el('span', { class: 'due' }, `${due} due`),
        el('span', { class: 'sep' }, '·'),
        el('span', {}, `${reviewed} reviewed today`)
    );
}

// ---- cram banner ----
function renderCramBanner(weakest) {
    const days = srs.daysUntilExam();
    if (days > 14) return null;
    if (cram.isDismissed()) return null;
    const w = weakest;
    const sh = w ? state.shards[w.subject] : null;
    const recs = sh?.triage?.scenarios?.slice(0, 2) || [];
    return el('div', { class: 'cram-banner', role: 'alert' },
        el('span', { class: 'label' }, `exam in ${days} day${days === 1 ? '' : 's'}`),
        el('span', {}, '·'),
        el('span', {}, `weakest: ${w ? w.subject : '—'}`),
        el('span', {}, '·'),
        el('span', {}, 'focus there'),
        ...recs.map((sc, i) => el('a', { class: 'chip', href: `./triage-live.html#${encodeURIComponent(sc.id || sc.name || (w.subject + '-' + i))}` }, sc.name)),
        el('button', { class: 'dismiss', 'aria-label': 'dismiss',
            on: { click: e => { e.target.closest('.cram-banner').remove(); cram.dismiss(); } } }, 'dismiss')
    );
}

// ---- soft resume line ----
function renderResumeLine() {
    const lp = lastpos.load(); if (!lp) return null;
    const gap = lastpos.gapDays();
    if (gap < 1) return null;
    const anchor = lp.subjectAnchor || lp.route || 'today';
    const target = lp.subjectAnchor ? `#subject/${lp.subjectAnchor}` : `#${lp.route}`;
    return el('div', { class: 'resume-line' },
        `back after ${gap}d. last: ${anchor} `,
        el('a', { href: target,
            on: { click: e => { e.preventDefault(); if (lp.subjectAnchor) go('subject', lp.subjectAnchor); else go(lp.route); } } }, '→ resume')
    );
}

// ---- first-time visitor detection ----
function isFirstTimeVisitor() {
    try {
        const p = progress.load();
        if (!p || p.todayGraded > 0) return false;
        const states = srs.loadStates();
        const hasHistory = p.history && p.history.some(h => (h.graded || 0) > 0);
        if (hasHistory) return false;
        const hasReviewed = Object.values(states).some(s => s && s.history && s.history.length > 0);
        if (hasReviewed) return false;
        return !localStorage.getItem('corpus.welcome.dismissed');
    } catch { return false; }
}

// ---- welcome panel for first-time visitors ----
function renderWelcome() {
    if (!isFirstTimeVisitor()) return null;
    return el('div', { class: 'panel', style: 'border-left: 4px solid var(--c-mastered);' },
        el('div', { class: 'panel-head' },
            el('span', { class: 'title' }, 'welcome to corpus'),
            el('button', { class: 'chip', style: 'margin-left:auto', 'aria-label': 'dismiss welcome',
                on: { click: () => { localStorage.setItem('corpus.welcome.dismissed', '1'); render(); } } }, 'got it')),
        el('div', { style: 'font-family:var(--ff-prose);line-height:1.6;font-size:15px' },
            el('p', {}, 'this is your medical study corpus — a personal notebook covering 8 subjects with spaced repetition cards, study guides, and clinical cases.'),
            el('p', {}, 'cards marked "due" use a spaced repetition algorithm (SRS) to optimize memory retention. review them daily to build mastery.'),
            el('p', {}, el('strong', {}, 'get started:'), ' review due cards, read a guide, or work through a clinical case.')
        )
    );
}

// ---- compressed today ----
function renderToday() {
    const p = progress.load();
    const due = totalDueAll();
    const cases = totalCasesQueued();
    const mins = estReviewMinutes(due);

    // Welcome message for first-time visitors
    const welcomeEl = renderWelcome();
    if (welcomeEl) stage.append(welcomeEl);

    // Compute weakest subject for cram banner
    const states = srs.loadStates();
    const ticks = loadGuideTicks();
    const rows = buildRows(state.manifest, state.shards, states, ticks);
    const weakest = computeWeakest(rows);

    const cramEl = renderCramBanner(weakest);
    if (cramEl) stage.append(cramEl);

    const resumeEl = renderResumeLine();
    if (resumeEl) stage.append(resumeEl);

    stage.append(renderStatusLine(p, due));

    const checklist = renderScheduleChecklist(rows);
    if (checklist) stage.append(checklist);

    // Free-study fallback — review whatever's due, clamped to today's plan target.
    const planTarget = todayPlanReviewTarget();
    const offerN = planTarget > 0 ? Math.min(planTarget, due) : Math.min(due, 60);
    const offerMin = estReviewMinutes(offerN);
    stage.append(el('div', { class: 'today-primary' },
        el('a', { class: 'primary-action', href: '#review',
            on: { click: e => { e.preventDefault(); state.reviewSubjectFilter = 'all'; resetReviewQueue(); go('review'); } } },
            due ? `or just review (${offerN}) · ~${offerMin} min` : 'no cards due — browse guides'),
        (due > offerN) ? el('div', { class: 'meta', style: 'margin-top:4px;font-size:12px;color:var(--panel-text-2)' },
            `backlog: ${due} cards across all subjects`) : null
    ));

    stage.append(renderMasteryRing());

    if (DEBUG) {
        stage.append(el('p', { class: 'summary-line' },
            'today: ', el('span', { class: 'num' }, String(due)), ' due cards · ',
            el('span', { class: 'num' }, String(cases)), ' cases queued · ~',
            el('span', { class: 'num' }, String(mins)), ' min est.'));
        const flagCount = flag.count();
        const chipRow = el('div', { class: 'today-chips' },
            el('a', { class: 'chip', href: '#drill',
                on: { click: e => { e.preventDefault(); go('drill'); } } }, 'drill 10'),
            flagCount ? el('a', { class: 'chip', href: '#review',
                on: { click: e => { e.preventDefault(); state.paletteReviewSet = flag.ids(); resetReviewQueue(); go('review'); } } },
                `${flagCount} flagged`) : null,
            el('a', { class: 'chip', href: '#mistakes',
                on: { click: e => { e.preventDefault(); go('mistakes'); } } }, 'mistakes'),
            el('div', { class: 'sparkline-wrap', 'aria-label': '7-day activity' }, renderSparkline(p.history))
        );
        stage.append(chipRow);

        // Recommended cases + 5-day recap behind ?debug
        const recs = [];
        for (const meta of state.manifest.subjects) {
            const sh = state.shards[meta.subject];
            if (!sh?.triage?.scenarios?.length) continue;
            const sc = sh.triage.scenarios[0];
            recs.push({ meta, sc });
            if (recs.length >= 3) break;
        }
        if (recs.length) {
            stage.append(el('div', { class: 'panel' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'debug · recommended cases')),
                ...recs.map(({ meta, sc }) => el('div', { class: 'row' },
                    el('span', { class: 'code' }, meta.subject.slice(0, 4)),
                    el('div', {}, el('div', { class: 'title' }, sc.name)),
                    el('a', { class: 'chip', href: `./triage-live.html#${encodeURIComponent(sc.id || sc.name)}` }, 'work')
                ))));
        }
        if (p.history && p.history.length) {
            const recent = p.history.slice(-5).reverse();
            stage.append(el('div', { class: 'panel' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'debug · last 5 days')),
                ...recent.map(d => el('div', { class: 'row' },
                    el('span', { class: 'code' }, d.date.slice(5)),
                    el('div', {}, el('div', { class: 'title' }, `${d.graded} cards · ${d.cases} cases`)),
                    el('span', { class: 'meta' }, '')
                ))));
        }
        stage.append(el('div', { class: 'panel rail-flame' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'debug · rail legend')),
            el('div', {}, 'rails neutralized — color reserved for due/mastered/missed/weak meaning')));
    }
}

function renderGuides() {
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'guides'), el('h2', {}, 'study guides')));
    const grid = el('div', { class: 'subject-grid' });
    for (const meta of state.manifest.subjects) {
        const m = masteryFor(meta.subject);
        const sections = meta.guideSections || 0;
        const hasVideo = (meta.videoCount || 0) > 0;
        const taglineParts = [`${sections} sections`];
        if (hasVideo) taglineParts.push('▶ video');
        grid.append(el('div', {
            class: 'subject-card' + (hasVideo ? ' has-video' : ''), role: 'button', tabindex: '0',
            'aria-label': `${meta.subject} guide, ${m}% understood${hasVideo ? ', includes video' : ''}`,
            data: { subject: meta.subject },
            on: { click: () => go('subject', meta.subject),
                  keydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('subject', meta.subject); } } }
        },
            el('div', { class: 'name' }, meta.subject),
            el('div', { class: 'tagline' }, taglineParts.join(' · ')),
            el('div', { class: 'mastery-row' },
                el('div', { class: 'mastery-bar' }, el('div', { class: 'mastery-fill' + (m < 25 ? ' weak' : ''), style: `width:${m}%` })),
                el('span', { class: 'mastery-pct' }, `${m}%`)
            )
        ));
    }
    stage.append(grid);
}

async function renderSubject() {
    const subj = state.currentSubject;
    if (!subj) { go('guides'); return; }
    const meta = state.manifest.subjects.find(x => x.subject === subj);

    // Cram banner on subject view
    const states = srs.loadStates();
    const ticksAll = loadGuideTicks();
    const rows = buildRows(state.manifest, state.shards, states, ticksAll);
    const weakest = computeWeakest(rows);
    const cramEl = renderCramBanner(weakest);
    if (cramEl) stage.append(cramEl);

    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'subject'), el('h2', {}, subj)));
    const subjMastery = masteryFor(subj);
    const subjDue = dueCountFor(subj);
    stage.append(el('div', { class: 'subject-hero' },
        el('div', { class: 'subject-hero-ring', 'aria-label': `${subjMastery}% mastered` },
            el('div', { class: 'mini-ring', style: `--p:${subjMastery}` }, `${subjMastery}%`)),
        el('div', { class: 'subject-hero-cta' },
            el('a', { class: 'primary-action', href: `#review/${subj}`,
                on: { click: e => { e.preventDefault(); state.reviewSubjectFilter = subj; go('review', subj); } } },
                subjDue ? `review ${subjDue} card${subjDue === 1 ? '' : 's'}` : 'no cards due'),
            el('a', { class: 'cta', href: `./triage-live.html?subject=${encodeURIComponent(subj)}` }, 'open in tutor'))
    ));
    // Next thing
    const subTicks = loadGuideTicks()[subj] || {};
    const subShard0 = state.shards[subj];
    const nextSec = subShard0?.guide?.sections?.find(s => !subTicks[String(s.line)]);
    if (nextSec) stage.append(el('div', { class: 'next-thing' },
        el('span', { class: 'eyebrow' }, 'next:'), ' ', el('span', {}, nextSec.title)));
    const placeholder = el('div', { class: 'panel' },
        el('div', { class: 'skeleton', style: 'width:60%;height:14px' }),
        el('div', { class: 'skeleton', style: 'width:90%' }),
        el('div', { class: 'skeleton', style: 'width:80%' }));
    stage.append(placeholder);
    const shard = await loadShard(subj);
    placeholder.remove();

    const due = srs.getDueCards(shard.cards.map(c => c.id), srs.loadStates()).length;
    const m = masteryFor(subj);
    const ticks = loadGuideTicks()[subj] || {};

    const left = el('aside', { class: 'deepdive-side' },
        el('div', { class: 'panel' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'subject'), `${m}% mastered`),
            el('div', { class: 'progress-bar' }, el('div', { class: 'progress-fill' + (m < 25 ? ' weak' : ''), style: `width:${m}%` })),
            el('div', { style: 'margin-top:8px;font-family:var(--ff-mono);font-size:11px;color:var(--panel-text-2)' }, `${shard.cards.length} cards · ${due} due`),
            el('div', { style: 'font-family:var(--ff-mono);font-size:11px;color:var(--panel-text-2)' }, `${shard.triage?.scenarioCount || 0} cases`),
            el('div', { class: 'kbd-hint', style: 'margin-top:8px' }, 'press r for just-read')
        ),
        buildGuideToc(subj, shard, ticks)
    );

    const guideBodyPanel = shard.guide?.body ? el('div', { class: 'panel guide-body-panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'guide'), `${shard.guide.sections.length} sections`),
        el('div', { class: 'guide-body markdown', html: renderMarkdown(shard.guide.body, subj) })
    ) : null;
    const cardsDetails = el('details', { class: 'panel cards-panel collapsible' },
        el('summary', { class: 'panel-head' }, el('span', { class: 'title' }, `flashcards (${shard.cards.length})`)),
        ...shard.cards.slice(0, 20).map(c => buildFlashcard(c))
    );
    if (shard.cards.length > 20) {
        cardsDetails.append(el('div', { style: 'margin-top:10px' },
            el('a', { href: '#review', class: 'chip', on: { click: e => { e.preventDefault(); state.reviewSubjectFilter = subj; go('review', subj); } } }, `review all ${shard.cards.length} →`)));
    }

    const triagePanel = shard.triage && shard.triage.scenarios.length ? el('details', { class: 'panel cases-panel collapsible' },
        el('summary', { class: 'panel-head' }, el('span', { class: 'title' }, `cases (${shard.triage.scenarios.length})`)),
        ...shard.triage.scenarios.slice(0, 8).map(sc => el('div', { class: 'row' },
            el('span', { class: 'code' }, '◆'),
            el('div', {}, el('div', { class: 'title' }, sc.name), el('div', { class: 'meta' }, sc.description || '')),
            el('a', { class: 'chip', href: `./triage-live.html#${encodeURIComponent(sc.id || sc.name)}` }, 'work')
        ))) : null;
    const cardsPanel = cardsDetails;

    const infographicsPanel = buildInfographicsPanel(shard.guide?.infographics || []);
    const videoHero = buildVideoHero(shard.guide?.videos || [], subj);
    const audioPanel = buildAudioPanel(shard.guide?.audio || [], subj);
    const right = el('div', {}, videoHero, audioPanel, cardsPanel, guideBodyPanel, infographicsPanel, triagePanel);
    const wrap = el('div', { class: 'deepdive', data: { cat: meta?.cat || 'green' } }, left, right);
    stage.append(wrap);
    mountBackToTop();
}

function slugify(t) { return String(t).toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, ''); }

function buildGuideToc(subj, shard, ticks) {
    const counts = sectionCardCounts(subj);
    const sections = (shard.guide?.sections || []).filter(s => s.level === 2 || s.level === 3);
    // Group H3 children under H2 parents
    const groups = [];
    let cur = null;
    for (const s of sections) {
        if (s.level === 2) { cur = { h2: s, children: [] }; groups.push(cur); }
        else if (s.level === 3) {
            if (!cur) { cur = { h2: null, children: [] }; groups.push(cur); }
            cur.children.push(s);
        }
    }
    const totalSections = sections.length;
    const tickedTotal = sections.filter(s => ticks[String(s.line)]).length;

    const filterInput = el('input', {
        type: 'search', class: 'toc-filter', placeholder: 'filter sections…',
        'aria-label': 'filter guide sections',
        on: { input: e => applyTocFilter(panel, e.target.value) }
    });

    const renderRow = (s) => {
        const lineKey = String(s.line);
        const checked = !!ticks[lineKey];
        const n = counts.get(lineKey) || 0;
        const badgeText = n ? `(${n})` : '';
        const anchorId = `g-${slugify(s.title)}-${s.line}`;
        const row = el('div', { class: `toc-row h${s.level}` + (checked ? ' done' : ''), 'data-title': s.title.toLowerCase() },
            el('input', {
                type: 'checkbox', class: 'guide-tick',
                ...(checked ? { checked: 'checked' } : {}),
                'aria-label': `mark "${s.title}" understood`,
                on: { change: e => {
                    const all = loadGuideTicks();
                    (all[subj] = all[subj] || {})[lineKey] = e.target.checked;
                    saveGuideTicks(all);
                    row.classList.toggle('done', e.target.checked);
                    lastpos.save('subject', subj);
                    render();
                } }
            }),
            el('a', { class: 'toc-link', href: `#${anchorId}`,
                on: { click: e => {
                    e.preventDefault();
                    const target = document.getElementById(anchorId);
                    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } } }, s.title),
            badgeText ? el('span', { class: 'sec-card-badge' }, badgeText) : null
        );
        return row;
    };

    const groupEls = groups.map((g, gi) => {
        if (!g.h2) {
            return el('div', { class: 'toc-group toc-group-bare' }, ...g.children.map(renderRow));
        }
        const childRows = g.children.map(renderRow);
        const childTicked = g.children.filter(s => ticks[String(s.line)]).length;
        const h2Ticked = !!ticks[String(g.h2.line)];
        const totalKids = g.children.length;
        const progressLabel = totalKids ? `${childTicked}/${totalKids}` : (h2Ticked ? 'done' : '');
        const details = el('details', { class: 'toc-group', open: 'open' },
            el('summary', { class: 'toc-h2-summary' },
                el('span', { class: 'toc-h2-title' }, g.h2.title),
                el('span', { class: 'toc-h2-progress mono' }, progressLabel)
            ),
            renderRow(g.h2),
            ...childRows
        );
        return details;
    });

    const panel = el('div', { class: 'panel toc-panel' },
        el('div', { class: 'panel-head' },
            el('span', { class: 'title' }, 'contents'),
            el('span', { class: 'toc-progress-summary mono' }, `${tickedTotal}/${totalSections}`)),
        filterInput,
        el('div', { class: 'toc-groups' }, ...groupEls)
    );
    return panel;
}

function applyTocFilter(panel, q) {
    const needle = String(q || '').trim().toLowerCase();
    const rows = panel.querySelectorAll('.toc-row');
    rows.forEach(r => {
        const title = r.getAttribute('data-title') || '';
        const match = !needle || title.includes(needle);
        r.style.display = match ? '' : 'none';
    });
    // hide groups with no visible children + non-matching h2
    panel.querySelectorAll('.toc-group').forEach(g => {
        const visible = Array.from(g.querySelectorAll('.toc-row')).some(r => r.style.display !== 'none');
        g.style.display = visible ? '' : 'none';
        if (needle && visible && g.tagName === 'DETAILS') g.setAttribute('open', 'open');
    });
}

function mountBackToTop() {
    let btn = document.getElementById('back-to-top');
    if (!btn) {
        btn = el('button', { id: 'back-to-top', class: 'back-to-top hidden',
            'aria-label': 'back to top',
            on: { click: () => window.scrollTo({ top: 0, behavior: 'smooth' }) } }, '↑ top');
        document.body.appendChild(btn);
    }
    const onScroll = () => {
        if (window.scrollY > 400) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    };
    window.removeEventListener('scroll', window.__backToTopHandler || (() => {}));
    window.__backToTopHandler = onScroll;
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
}

function buildVideoHero(videos, subj) {
    if (!Array.isArray(videos) || videos.length === 0) return null;
    const v = videos[0];
    const sub = v.title || 'lecture video';
    const meta = [v.durationMin ? `${v.durationMin} min` : null, v.sizeMB ? `${v.sizeMB} MB` : null].filter(Boolean).join(' · ');
    const source = v.url || v.src;
    const vidEl = el('video', { controls: 'controls', preload: 'metadata', playsinline: 'playsinline', src: source });
    return el('div', { class: 'panel video-hero', 'data-video-id': v.filename },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'watch first'), meta),
        el('div', { class: 'video-hero-frame' }, vidEl),
        el('div', { class: 'video-hero-caption' }, sub)
    );
}

function buildAudioPanel(items, subj) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const a = items[0];
    const meta = a.sizeMB ? `${a.sizeMB} MB` : '';
    const audioEl = el('audio', { controls: 'controls', preload: 'metadata', src: a.src });
    return el('div', { class: 'panel audio-panel', 'data-audio-id': a.filename },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'deep dive (audio)'), meta),
        el('div', { class: 'audio-frame' }, audioEl),
        el('div', { class: 'audio-caption' }, a.title || 'audio deep dive')
    );
}

function buildInfographicsPanel(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const grid = el('div', { class: 'infographics-grid' });
    items.forEach((ig, idx) => {
        const tile = el('button', {
            class: 'infographic-tile',
            type: 'button',
            'aria-label': ig.alt,
            on: { click: () => openInfographicLightbox(items, idx) }
        },
            el('img', { src: ig.src, alt: ig.alt, loading: 'lazy' }),
            el('div', { class: 'infographic-caption' }, ig.title)
        );
        grid.append(tile);
    });
    return el('div', { class: 'panel infographics-panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'infographics'), `${items.length}`),
        grid
    );
}

function openInfographicLightbox(items, startIdx) {
    let idx = startIdx;
    const existing = document.getElementById('infographic-lightbox');
    if (existing) existing.remove();
    const imgEl = el('img', { class: 'lightbox-img', src: items[idx].src, alt: items[idx].alt });
    const caption = el('div', { class: 'lightbox-caption' }, items[idx].title);
    const close = el('button', { class: 'lightbox-close', type: 'button', 'aria-label': 'close' }, '×');
    const prev = el('button', { class: 'lightbox-prev', type: 'button', 'aria-label': 'previous' }, '‹');
    const next = el('button', { class: 'lightbox-next', type: 'button', 'aria-label': 'next' }, '›');
    const stage = el('div', { class: 'lightbox-stage' }, imgEl, caption);
    const overlay = el('div', { id: 'infographic-lightbox', class: 'lightbox-overlay', role: 'dialog', 'aria-modal': 'true' }, close, prev, stage, next);
    function show(i) {
        idx = (i + items.length) % items.length;
        imgEl.src = items[idx].src;
        imgEl.alt = items[idx].alt;
        caption.textContent = items[idx].title;
    }
    function shut() {
        document.removeEventListener('keydown', onKey);
        overlay.remove();
    }
    function onKey(e) {
        if (e.key === 'Escape') shut();
        else if (e.key === 'ArrowLeft') show(idx - 1);
        else if (e.key === 'ArrowRight') show(idx + 1);
        else if (e.key === 'Tab') { e.preventDefault(); close.focus(); }
    }
    close.addEventListener('click', shut);
    prev.addEventListener('click', () => show(idx - 1));
    next.addEventListener('click', () => show(idx + 1));
    overlay.addEventListener('click', e => { if (e.target === overlay) shut(); });
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    close.focus();
}

// ---- markdown with guide affordances ----
// disfluency tokens removed at render time (source files untouched). conservative.
const DISFLUENCY_RE = /\b(?:um+|uh+|er+m?|y'?know|you know|sort of|kind of|basically|i mean)\b[,]?\s*/gi;
function cleanDisfluencies(s) {
    return s.replace(DISFLUENCY_RE, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}
function typoRefine(s) {
    s = s.replace(/(\s)--(\s)/g, '$1—$2');           // " -- " em-dash
    s = s.replace(/(\d)\s*-\s*(\d)/g, '$1–$2');       // numeric range en-dash
    s = s.replace(/\b(Mr|Mrs|Ms|Dr|Prof|St)\.\s+/g, '$1. '); // honorific nbsp
    s = s.replace(/(\d)\s+(mg|mcg|ng|kg|g|mL|L|mmol|mEq|IU|U|bpm|mmHg|mm|cm)\b/g, '$1 $2');
    return s;
}
// soft-split: paragraphs with >3 sentences AND >400 chars get broken into 2-3 sentence chunks.
function softSplitPara(text) {
    text = cleanDisfluencies(text);
    text = typoRefine(text);
    if (text.length <= 400) return [text];
    let sentences = text.match(/[^.!?]+[.!?]+(?:["')\]]+)?(?:\s|$)|[^.!?]+$/g);
    // fallback: punctuation-poor transcripts — split on " so "/" and "/" but "/" because " plus comma joints.
    if (!sentences || sentences.length <= 3) {
        if (text.length <= 700) return [text];
        const seams = text.split(/(\s+(?:so|and|but|because|however|therefore|then|while|whereas)\s+)/i);
        if (seams.length <= 3) sentences = text.match(/[^,]+,\s*/g) || [text];
        else { sentences = []; for (let k = 0; k < seams.length; k += 2) sentences.push((seams[k] || '') + (seams[k+1] || '')); }
        if (sentences.length <= 2) sentences = [text];
    }
    const chunks = [];
    let buf = [], bufLen = 0;
    for (const sent of sentences) {
        buf.push(sent.trim());
        bufLen += sent.length;
        if (buf.length >= 2 && bufLen >= 220) { chunks.push(buf.join(' ')); buf = []; bufLen = 0; }
    }
    if (buf.length) {
        if (chunks.length && buf.join(' ').length < 80) chunks[chunks.length - 1] += ' ' + buf.join(' ');
        else chunks.push(buf.join(' '));
    }
    // final safety net: hard-wrap any chunk still over 900 chars on word boundaries near 500-char marks
    const out = [];
    for (const c of chunks) {
        if (c.length <= 900) { out.push(c); continue; }
        let rest = c;
        while (rest.length > 900) {
            let cut = rest.lastIndexOf(' ', 600);
            if (cut < 300) cut = 600;
            out.push(rest.slice(0, cut).trim());
            rest = rest.slice(cut).trim();
        }
        if (rest) out.push(rest);
    }
    return out;
}

function renderMarkdown(md, subject) {
    if (!md) return '';
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = md.split('\n');
    const out = [];
    let listStack = [];
    let inCode = false, inQuote = false, para = [];
    const flushPara = () => { if (para.length) { for (const chunk of softSplitPara(para.join(' '))) out.push('<p>' + inline(chunk) + '</p>'); para = []; } };
    const flushList = () => { while (listStack.length) out.push('</' + listStack.pop() + '>'); };
    const flushQuote = () => { if (inQuote) { out.push('</blockquote>'); inQuote = false; } };
    const flushAll = () => { flushPara(); flushList(); flushQuote(); };
    function inline(s) {
        s = esc(s);
        s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
        s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
        s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        return s;
    }
    function slug(t) { return t.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, ''); }
    function affordance(headingText) {
        if (!subject) return '';
        const topic = encodeURIComponent(headingText);
        return `<span class="guide-aff"><a href="./triage-live.html?topic=${topic}&subject=${subject}" data-aff="tutor">→ tutor</a></span>`;
    }
    function openListIfNeeded(tag) {
        if (listStack[listStack.length - 1] !== tag) {
            flushList();
            out.push('<' + tag + '>');
            listStack.push(tag);
        }
    }
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^```/.test(line)) { flushAll(); inCode = !inCode; out.push(inCode ? '<pre><code>' : '</code></pre>'); continue; }
        if (inCode) { out.push(esc(line)); continue; }
        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushAll(); out.push('<hr>'); continue; }
        const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
        if (h) {
            flushAll();
            const id = `g-${slug(h[2])}-${i}`;
            const level = h[1].length;
            const aff = (level === 2 || level === 3) ? affordance(h[2]) : '';
            out.push(`<h${level} id="${id}">${inline(h[2])}${aff}</h${level}>`);
            continue;
        }
        const bq = line.match(/^>\s?(.*)$/);
        if (bq) {
            flushPara(); flushList();
            if (!inQuote) { out.push('<blockquote>'); inQuote = true; }
            out.push('<p>' + inline(bq[1]) + '</p>');
            continue;
        }
        if (inQuote && line.trim() === '') { flushQuote(); continue; }
        const ul = line.match(/^\s*[-*+]\s+(.+)$/);
        const ol = line.match(/^\s*\d+[.)]\s+(.+)$/);
        if (ul) { flushPara(); flushQuote(); openListIfNeeded('ul'); out.push('<li>' + inline(ul[1]) + '</li>'); continue; }
        if (ol) { flushPara(); flushQuote(); openListIfNeeded('ol'); out.push('<li>' + inline(ol[1]) + '</li>'); continue; }
        if (line.trim() === '') { flushAll(); continue; }
        flushList();
        para.push(line);
    }
    flushAll(); if (inCode) out.push('</code></pre>');
    return out.join('\n');
}

function buildFlashcard(c) {
    const id = c.id;
    const back = c.back || '';
    const long = back.length > 300;
    const card = el('div', {
        class: 'flashcard' + (long ? ' long' : ''),
        role: 'button', tabindex: '0', 'aria-label': `card: ${c.front?.slice(0, 60) || ''}`,
        data: { cardId: id },
        on: {
            click: () => { if (state.flippedCards.has(id)) state.flippedCards.delete(id); else state.flippedCards.add(id); card.classList.toggle('flipped'); },
            keydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } }
        }
    },
        DEBUG ? el('div', { class: 'meta-line' }, el('span', {}, c.id || ''), el('span', {}, c.difficulty || 'medium')) : null,
        el('div', { class: 'front' }, c.front),
        el('div', { class: 'flip-hint' }, 'click to flip'),
        el('div', { class: 'back markdown', html: renderMarkdown(back) }),
        c.tags && c.tags.length ? el('div', { class: 'tags' }, ...c.tags.slice(0, 6).map(t => el('span', { class: 'tag' }, t))) : null
    );
    if (state.flippedCards.has(id)) card.classList.add('flipped');
    return card;
}

async function renderTriage() {
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'cases'), el('h2', {}, 'work a case')));
    const placeholder = el('div', { class: 'panel' }, el('div', { class: 'skeleton', style: 'width:60%;height:14px' }));
    stage.append(placeholder);
    await loadAllShards();
    placeholder.remove();
    stage.append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'live tutor')),
        el('div', { style: 'font-family:var(--ff-prose);font-size:14px;color:var(--panel-text-2);margin-bottom:10px' }, 'work a case with the in-browser study assistant — supply differentials, plan, investigations, then submit for grading.'),
        el('a', { class: 'primary-action', href: './triage-live.html' }, 'open live tutor')));
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject];
        if (!sh.triage || !sh.triage.scenarios.length) continue;
        for (const sc of sh.triage.scenarios) stage.append(buildTriageWidget(meta, sh, sc));
    }
}

function buildTriageWidget(meta, shard, sc) {
    const params = sc.parameters && typeof sc.parameters === 'object' && !Array.isArray(sc.parameters) ? sc.parameters : {};
    const inputs = {};
    const wrap = el('div', { class: 'triage-scenario' });
    wrap.append(el('div', { class: 'panel-head' }, el('span', { class: 'title' }, sc.name), meta.subject));
    wrap.append(el('div', { class: 'description' }, sc.description || ''));
    for (const [k, v] of Object.entries(params)) {
        const desc = String(v);
        const opts = desc.split('|').map(x => x.split('—')[0].trim()).filter(Boolean).slice(0, 6);
        const ctl = opts.length > 1 && opts.length < 8
            ? el('select', { 'aria-label': k }, ...opts.map(o => el('option', { value: o }, o)))
            : el('input', { type: 'text', placeholder: desc.slice(0, 40), 'aria-label': k });
        inputs[k] = ctl;
        wrap.append(el('div', { class: 'param-row' }, el('label', {}, k), ctl));
    }
    const out = el('div', { class: 'outcome', style: 'display:none' });
    const btn = el('button', { class: 'run-btn', on: { click: () => {
        const vals = {}; for (const [k, e] of Object.entries(inputs)) vals[k] = e.value;
        const example = (sc.examples && sc.examples[0]) || {};
        out.innerHTML = '';
        out.append(el('div', { class: 'eyebrow' }, 'inputs'));
        out.append(el('pre', {}, JSON.stringify(vals, null, 2)));
        out.append(el('div', { class: 'eyebrow' }, 'reasoning'));
        out.append(el('div', {}, example.reasoning || 'confirm diagnosis → classify severity → first-line therapy → reassess.'));
        out.append(el('div', { class: 'eyebrow', style: 'margin-top:8px' }, 'recommendation'));
        out.append(el('div', {}, example.recommendation || 'standard guideline-directed management.'));
        out.style.display = 'block';
    } } }, 'run case');
    wrap.append(btn, out);
    return wrap;
}

async function renderReview() {
    stage.innerHTML = '';
    const placeholder = el('div', { class: 'panel' }, el('div', { class: 'skeleton', style: 'width:60%;height:14px' }));
    stage.append(placeholder);
    const subjects = state.reviewSubjectFilter === 'all' ? state.manifest.subjects.map(s => s.subject) : [state.reviewSubjectFilter];
    await Promise.all(subjects.map(s => loadShard(s)));
    placeholder.remove();

    const allCards = [];
    for (const s of subjects) {
        const sh = state.shards[s]; if (!sh) continue;
        for (const c of sh.cards) allCards.push({ ...c, _subject: s });
    }
    // merge personal user cards (when filter is all or matches)
    for (const uc of usercards.load()) {
        if (state.reviewSubjectFilter === 'all' || state.reviewSubjectFilter === uc._subject) allCards.push(uc);
    }
    const cardIds = allCards.map(c => c.id);
    state.reviewAllCardIds = cardIds;

    if (!state.reviewQueueIds || state.reviewQueueIds.length === 0) {
        const states = srs.loadStates();
        let pool = cardIds;
        if (state.paletteReviewSet && state.paletteReviewSet.length) pool = pool.filter(id => state.paletteReviewSet.includes(id));
        if (state.reviewTagFilter.size > 0) {
            const cardById = Object.fromEntries(allCards.map(c => [c.id, c]));
            pool = pool.filter(id => {
                const tags = cardById[id]?.tags || [];
                for (const t of tags) if (state.reviewTagFilter.has(t)) return true;
                return false;
            });
        }
        const cardById = Object.fromEntries(allCards.map(c => [c.id, c]));
        const dueIds = state.cramMode ? pool : srs.getDueCards(pool, states);
        const sorted = dueIds.map(id => ({ id, dueAt: states[id]?.dueAt ?? 0, subject: cardById[id]._subject })).sort((a, b) => a.dueAt - b.dueAt);
        const bySubj = {};
        for (const x of sorted) (bySubj[x.subject] ||= []).push(x.id);
        const interleaved = []; let any = true;
        while (any) { any = false; for (const k of Object.keys(bySubj)) { if (bySubj[k].length) { interleaved.push(bySubj[k].shift()); any = true; } } }
        state.reviewQueueIds = interleaved;
        state.reviewIndex = 0; state.reviewAgainPile = [];
        state.reviewSessionStarted = interleaved.length;
        state.sessionFinished = false;
    }
    state.reviewQueue = state.reviewQueueIds.map(id => allCards.find(c => c.id === id)).filter(Boolean);
    if (state.reviewIndex >= state.reviewQueue.length) state.reviewIndex = 0;

    const p = progress.load();
    const total = state.reviewQueue.length;
    const goal = p.dailyGoal || 30;
    const sessionTotal = state.reviewSessionStarted || total;
    const idxOneBased = Math.min(state.reviewSessionGraded + 1, sessionTotal);
    const toGoal = Math.max(0, goal - p.todayGraded);

    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'review'), el('h2', {}, state.cramMode ? 'cram' : 'review')));

    // tiny progress line — REQUIRED feature 3
    stage.append(el('div', { class: 'review-progress' },
        el('span', { class: 'num' }, `${idxOneBased} of ${total || sessionTotal}`),
        ' · ',
        el('span', { class: 'goal' }, `${toGoal} to daily goal`)
    ));

    const chips = el('div', { class: 'filter-chips', role: 'group', 'aria-label': 'subject filter' },
        el('button', { class: 'chip' + (state.reviewSubjectFilter === 'all' ? ' active' : ''),
            on: { click: () => { state.reviewSubjectFilter = 'all'; resetReviewQueue(); renderReview(); } } }, 'all'),
        ...state.manifest.subjects.map(s => el('button', { class: 'chip' + (state.reviewSubjectFilter === s.subject ? ' active' : ''),
            on: { click: () => { state.reviewSubjectFilter = s.subject; resetReviewQueue(); renderReview(); } } }, s.subject))
    );
    const cramBtn = el('button', { class: 'chip' + (state.cramMode ? ' active' : ''),
        'aria-label': 'toggle cram mode', 'aria-pressed': String(!!state.cramMode),
        on: { click: () => { state.cramMode = !state.cramMode; renderReview(); } } },
        state.cramMode ? 'cram on' : 'cram off');
    const allTags = collectReviewTags(allCards);
    const tagChips = allTags.length ? el('div', { class: 'filter-chips tag-chips', role: 'group', 'aria-label': 'tag filter' },
        ...allTags.slice(0, 12).map(t => el('button', {
            class: 'chip' + (state.reviewTagFilter.has(t) ? ' active' : ''),
            'aria-pressed': String(state.reviewTagFilter.has(t)),
            on: { click: () => { if (state.reviewTagFilter.has(t)) state.reviewTagFilter.delete(t); else state.reviewTagFilter.add(t); resetReviewQueue(); renderReview(); } } }, '#' + t))
    ) : null;
    stage.append(el('div', { class: 'toolbar' }, chips, cramBtn), tagChips);

    if (state.reviewQueue.length === 0) {
        if (state.reviewAgainPile.length > 0) {
            state.reviewQueueIds = state.reviewAgainPile;
            state.reviewAgainPile = []; state.reviewIndex = 0;
            renderReview(); return;
        }
        const reviewed = state.reviewSessionGraded;
        if (reviewed > 0 && !state.sessionFinished) {
            state.sessionFinished = true;
            stage.append(el('div', { class: 'panel' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'session done')),
                el('p', {}, `${reviewed} card${reviewed === 1 ? '' : 's'} reviewed · streak ${p.streak}.`),
                el('div', { class: 'toolbar' },
                    el('a', { class: 'chip', href: '#today', on: { click: e => { e.preventDefault(); go('today'); } } }, 'today'),
                    el('a', { class: 'chip', href: '#review', on: { click: e => { e.preventDefault(); state.reviewSessionGraded = 0; state.sessionFinished = false; renderReview(); } } }, 'review more')
                )));
        } else {
            stage.append(el('div', { class: 'panel' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'all caught up')),
                el('div', {}, 'no cards due. browse a subject or wait.')));
        }
        return;
    }

    const card = state.reviewQueue[state.reviewIndex];
    const cardState = srs.getCardState(card.id);
    const seen = (cardState.history || []).length;
    const friendlyMeta = seen === 0 ? 'new' : (seen < 3 ? `seen ${seen}×` : 'familiar');
    const isFlag = flag.isFlagged(card.id);
    const reviewCard = el('div', {
        class: 'flashcard' + (state.reviewRevealed ? ' flipped' : '') + (isFlag ? ' flagged' : ''), id: 'review-card'
    },
        el('div', { class: 'meta-line' },
            el('span', {}, `${card._subject} · ${state.reviewIndex + 1}/${total}` + (card._personal ? ' (personal)' : '') + (isFlag ? ' · flagged' : '')),
            el('span', {}, friendlyMeta),
            DEBUG ? el('span', {}, `EF ${cardState.easeFactor.toFixed(2)} · ${cardState.phase} · ${cardState.interval}d`) : null
        ),
        el('div', { class: 'front' }, card.front),
        el('div', { class: 'back markdown', html: renderMarkdown(card.back || '') }),
        DEBUG ? el('div', { class: 'card-source' }, `source: ${card.source || card.sourceFile || ''}`) : null,
        card.tags && card.tags.length ? el('div', { class: 'tags' }, ...card.tags.slice(0, 6).map(t => el('span', { class: 'tag' }, t))) : null
    );
    stage.append(reviewCard);

    const actions = el('div', { class: 'toolbar review-actions', id: 'review-actions' });
    if (!state.reviewRevealed) {
        actions.append(el('button', { class: 'chip active', id: 'review-reveal',
            'aria-label': 'reveal answer', on: { click: () => { state.reviewRevealed = true; renderReview(); } } }, 'reveal (space)'));
    } else {
        const grades = DEBUG
            ? [0, 1, 2, 3, 4, 5].map(s => ({ key: String(s), score: s, label: ['again', 'wrong', 'hard wrong', 'hard right', 'good', 'perfect'][s] }))
            : FRIENDLY_GRADES.map(g => ({ key: String(g.friendly), score: g.smscore, label: g.label }));
        for (const g of grades) {
            actions.append(el('button', { class: 'chip grade-btn', data: { score: String(g.score) }, id: `grade-${g.score}`,
                'aria-label': `grade ${g.label}`, on: { click: () => gradeReview(card.id, g.score) } }, `${g.key} ${g.label}`));
        }
        actions.append(el('button', { class: 'chip', id: 'review-skip', 'aria-label': 'skip',
            on: { click: () => skipReview() } }, 'skip (s)'));
        actions.append(el('button', { class: 'chip', id: 'review-suspend', 'aria-label': 'suspend card',
            on: { click: () => { if (confirm('suspend this card?')) suspendCurrentReview(); } } }, 'suspend'));
    }
    stage.append(actions);
    const hint = DEBUG
        ? 'space=reveal · 0-5=grade · s=skip · 0 sends to revisit'
        : 'space=reveal · 1=again · 2=hard · 3=good · 4=easy · s=skip';
    stage.append(el('div', { class: 'kbd-hint' }, hint));

    state.lastReviewDueCount = state.reviewQueue.length;
}

function resetReviewQueue() {
    state.reviewQueueIds = []; state.reviewIndex = 0;
    state.reviewRevealed = false; state.reviewAgainPile = [];
    state.reviewSessionGraded = 0; state.sessionFinished = false;
}

function skipReview() {
    if (!state.reviewQueue.length) return;
    state.reviewIndex = (state.reviewIndex + 1) % state.reviewQueue.length;
    state.reviewRevealed = false; renderReview();
}

function gradeReview(cardId, score) {
    const prev = srs.getCardState(cardId);
    const wasNew = srs.isNewCardForGate(prev);
    const card0 = state.reviewQueue?.[state.reviewIndex];
    if (!state.cramMode) srs.updateCard(cardId, score, state.reviewAllCardIds || []);
    if (!state.cramMode && wasNew && card0?._subject) newcards.bump(card0._subject, 1);
    state.reviewSessionGraded++;
    if (!state.cramMode) progress.bumpGraded(1);
    if (score === 0) state.reviewAgainPile.push(cardId);
    // Mistake log
    const card = state.reviewQueue?.[state.reviewIndex];
    if (score <= 2 && card) mistakes.logMistake(cardId, card._subject, score);
    // Undo record
    undo.record(cardId, prev);
    showUndoToast();
    state.reviewQueueIds.splice(state.reviewIndex, 1);
    if (state.reviewIndex >= state.reviewQueueIds.length) state.reviewIndex = 0;
    state.reviewRevealed = false;
    renderReview();
}

function showUndoToast() {
    const old = document.getElementById('undo-toast'); if (old) old.remove();
    const t = el('div', { id: 'undo-toast', class: 'undo-toast', role: 'status' },
        el('span', {}, 'graded · '),
        el('button', { class: 'chip', 'aria-label': 'undo grade',
            on: { click: () => undoLastGrade() } }, 'undo (u)'));
    document.body.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 5000);
}
function undoLastGrade() {
    const r = undo.consume(); if (!r) return;
    const states = srs.loadStates();
    states[r.cardId] = r.prevState;
    srs.saveStates(states);
    const t = document.getElementById('undo-toast'); if (t) t.remove();
    if (state.route === 'review') renderReview();
}

function suspendCurrentReview() {
    const card = state.reviewQueue?.[state.reviewIndex];
    if (!card) return;
    srs.suspendCard(card.id, true);
    state.reviewQueueIds.splice(state.reviewIndex, 1);
    if (state.reviewIndex >= state.reviewQueueIds.length) state.reviewIndex = 0;
    state.reviewRevealed = false;
    renderReview();
}

let gPrefixTs = 0;
document.addEventListener('keydown', e => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openShortcutsModal(); return; }
    // g-prefix vim nav
    if (Date.now() - gPrefixTs < 1500) {
        const map = { h: 'today', r: 'review', s: 'stats', g: 'guides', m: 'mistakes', t: 'today' };
        const dest = map[e.key];
        if (dest) { e.preventDefault(); gPrefixTs = 0; go(dest); return; }
        gPrefixTs = 0;
    }
    if (e.key === 'g' && !e.ctrlKey && !e.metaKey) { gPrefixTs = Date.now(); return; }
    // global keys
    if (e.key === 't' && !e.ctrlKey && !e.metaKey && state.route !== 'review') {
        e.preventDefault(); state.timerApi?.toggleVis(); return;
    }
    if (e.key === '+' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openQuickAdd(); return; }
    if (e.key === 'u' && !e.ctrlKey && !e.metaKey && undo.peek()) { e.preventDefault(); undoLastGrade(); return; }
    if (e.key === 'Escape') {
        if (document.body.classList.contains('just-read') && state.route === 'subject') {
            justread.toggle(state.currentSubject);
            justread.applyClass(false);
            return;
        }
        closeShortcutsModal(); return;
    }
    if ((e.key === 'r' || e.key === 'R') && state.route === 'subject' && state.currentSubject) {
        e.preventDefault();
        const on = justread.toggle(state.currentSubject);
        justread.applyClass(on);
        return;
    }
    if (state.route !== 'review') return;
    if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (!state.reviewRevealed && state.reviewQueue?.length) { state.reviewRevealed = true; renderReview(); }
    } else if (e.key === 's' || e.key === 'S') {
        if (state.reviewQueue?.length) { e.preventDefault(); skipReview(); }
    } else if (e.key === 'f' || e.key === 'F') {
        const card = state.reviewQueue?.[state.reviewIndex];
        if (card) { e.preventDefault(); flag.toggle(card.id); renderReview(); }
    } else if (state.reviewRevealed) {
        const card = state.reviewQueue?.[state.reviewIndex];
        if (!card) return;
        if (DEBUG && /^[0-5]$/.test(e.key)) { e.preventDefault(); gradeReview(card.id, parseInt(e.key, 10)); }
        else if (!DEBUG && /^[1-4]$/.test(e.key)) {
            e.preventDefault();
            const g = FRIENDLY_GRADES.find(x => x.friendly === parseInt(e.key, 10));
            if (g) gradeReview(card.id, g.smscore);
        }
    }
});

async function renderStats() {
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'stats'), el('h2', {}, 'stats')));
    await loadAllShards();
    const states = srs.loadStates();
    const ticks = loadGuideTicks();
    const rows = buildRows(state.manifest, state.shards, states, ticks);
    renderVerdictTable(rows);

    const cardIds = [];
    const idSubject = {};
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject]; if (!sh) continue;
        for (const c of sh.cards) { cardIds.push(c.id); idSubject[c.id] = meta.subject; }
    }
    const stats = srs.getScheduleStats(cardIds, states);
    const forecast = srs.getForecast(cardIds, 14, states);
    const p = progress.load();

    stage.append(el('div', { class: 'panel heatmap-panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'study days'), 'last 9 weeks'),
        renderHeatmap(p.history || [])));

    const maxF = Math.max(1, ...forecast.map(b => b.count));
    const forecastEl = el('div', { class: 'forecast' },
        ...forecast.map(b => el('div', { class: 'forecast-day', title: `${b.date}: ${b.count}` },
            el('div', { class: 'forecast-bar', style: `height:${Math.round(b.count / maxF * 50) + 2}px` }),
            el('div', { class: 'forecast-label' }, String(b.day))
        )));
    stage.append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'reviews coming up'), '14d'),
        forecastEl));

    // week-over-week diff
    const hist = p.history || [];
    const last7 = hist.slice(-7).reduce((a, h) => a + (h.graded || 0), 0) + (p.todayGraded || 0);
    const prior7 = hist.slice(-14, -7).reduce((a, h) => a + (h.graded || 0), 0);
    const delta = last7 - prior7;
    stage.append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'this week vs last')),
        el('div', { style: 'font-family:var(--ff-mono);font-size:13px' },
            `${last7} cards this week · ${prior7} prior · `,
            el('span', { class: 'trend ' + (delta >= 0 ? 'up' : 'down') }, delta >= 0 ? `+${delta}` : String(delta)))));

    if (DEBUG) renderDebugStats(state.manifest, stats);
}

function renderVerdictTable(rows) {
    let sortKey = state.verdictSort || 'verdict';
    function applySort(rs) {
        const sorters = {
            verdict: (a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict],
            subject: (a, b) => a.subject.localeCompare(b.subject),
            mastery: (a, b) => b.mastery - a.mastery,
            trend: (a, b) => b.trend - a.trend,
            backlog: (a, b) => b.backlog - a.backlog
        };
        return [...rs].sort(sorters[sortKey] || sorters.verdict);
    }
    const wrap = el('div', { class: 'panel' });
    wrap.append(el('div', { class: 'panel-head' },
        el('span', { class: 'title' }, 'exam-ready'),
        el('span', {}, 'click a column to sort')
    ));
    const sortSel = el('select', { class: 'search', style: 'max-width:160px',
        'aria-label': 'sort by',
        on: { change: e => { state.verdictSort = e.target.value; renderStats(); } } },
        ...['verdict', 'subject', 'mastery', 'trend', 'backlog'].map(k => el('option', { value: k, ...(k === sortKey ? { selected: 'selected' } : {}) }, `sort: ${k}`))
    );
    wrap.append(el('div', { class: 'toolbar' }, sortSel));
    const sorted = applySort(rows);
    const tbl = el('table', { class: 'verdict-table' },
        el('thead', {}, el('tr', {},
            ...['subject', 'mastery', 'trend', 'backlog', 'verdict'].map(k =>
                el('th', { on: { click: () => { state.verdictSort = k; renderStats(); } } }, k))
        )),
        el('tbody', {}, ...sorted.map(r => el('tr', {},
            el('td', { class: 'subject' }, r.subject),
            el('td', { class: 'mastery' }, `${r.mastery}%`),
            el('td', { class: 'trend ' + (r.trend > 0 ? 'up' : (r.trend < 0 ? 'down' : '')) }, r.trend > 0 ? `+${r.trend}` : String(r.trend)),
            el('td', { class: 'backlog' }, String(r.backlog)),
            el('td', { class: 'verdict ' + r.verdict.replace(/\s/g, '') }, r.verdict)
        )))
    );
    wrap.append(el('div', { class: 'table-scroll' }, tbl));
    stage.append(wrap);
}

function renderDebugStats(m, stats) {
    const days = srs.daysUntilExam();
    const eff = srs.effectiveDays();
    stage.append(el('div', { class: 'panel', id: 'srs-stats' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'debug · raw scheduler'),
            `schema v${srs.SCHEMA_VERSION || 1} · localStorage corpus.srs.states`),
        el('div', { style: 'font-family:var(--ff-mono);font-size:11px;color:var(--panel-text-2);line-height:1.6' },
            `total ${stats.total} · new ${stats.new} · learning ${stats.learning} · young ${stats.young} · mature ${stats.mature} · leech ${stats.leech} · avg EF ${stats.avgEaseFactor.toFixed(2)} · avg last score ${stats.avgLastScore.toFixed(2)} · days to exam ${days} · effective days ${eff} · atoms ${m.totals.atoms} · scenarios ${m.totals.scenarios}`)));
}

function collectReviewTags(allCards) {
    const counts = {};
    for (const c of allCards) for (const t of (c.tags || [])) counts[t] = (counts[t] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(x => x[0]);
}

function renderHeatmap(history) {
    const today = new Date(); today.setHours(0,0,0,0);
    const days = 63;
    const counts = {};
    for (const h of (history || [])) counts[h.date] = (h.graded || 0);
    const cells = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        const k = d.toISOString().slice(0, 10);
        cells.push({ date: k, count: counts[k] || 0 });
    }
    const max = Math.max(1, ...cells.map(c => c.count));
    const cellSize = 11, gap = 2, cols = 9;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'heatmap');
    svg.setAttribute('width', String(cols * (cellSize + gap)));
    svg.setAttribute('height', String(7 * (cellSize + gap)));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'study days heatmap, last 63 days');
    cells.forEach((c, i) => {
        const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const col = Math.floor(i / 7), row = i % 7;
        r.setAttribute('x', String(col * (cellSize + gap)));
        r.setAttribute('y', String(row * (cellSize + gap)));
        r.setAttribute('width', String(cellSize));
        r.setAttribute('height', String(cellSize));
        r.setAttribute('rx', '2');
        const intensity = c.count === 0 ? 0 : Math.min(1, c.count / max);
        const alpha = c.count === 0 ? 0.10 : 0.25 + intensity * 0.75;
        r.setAttribute('fill', `rgba(47,122,62,${alpha})`);
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${c.date}: ${c.count} cards`;
        r.appendChild(title);
        svg.appendChild(r);
    });
    return svg;
}

function dueCountsBySubject() {
    const out = {};
    if (!state.manifest) return out;
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject];
        if (!sh) { out[meta.subject] = 0; continue; }
        out[meta.subject] = srs.getDueCards(sh.cards.map(c => c.id), srs.loadStates()).length;
    }
    return out;
}

function renderCalendar() {
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'plan'), el('h2', {}, 'calendar')));
    const mount = el('div', { class: 'cal-mount', id: 'cal-mount' });
    stage.append(mount);
    calendar.mount(mount, { dueCountsFn: () => dueCountsBySubject() });
}

function debounce(fn, ms) { let h = null; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; }

function renderScheduleConfigPanel() {
    const cfg = schedule.loadConfig();
    const examDays = srs.daysUntilExam();
    const panel = el('div', { class: 'panel settings-section schedule-config' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'study schedule'),
            el('span', { class: 'meta exam-count' }, `${examDays}d to exam`))
    );

    // intensity
    const intensities = ['light', 'standard', 'hard', 'cram'];
    const intensityRow = el('div', { class: 'cfg-row' }, el('label', {}, 'intensity'),
        el('div', { class: 'btn-group intensity-group' },
            ...intensities.map(v => el('button', {
                class: 'chip' + (cfg.intensity === v ? ' active' : ''), 'aria-pressed': String(cfg.intensity === v),
                on: { click: () => { schedule.saveConfig({ intensity: v }); regenAndPreview(); render(); } }
            }, v))));
    panel.append(intensityRow);

    // chronotype
    const chronos = ['morning', 'evening', 'flex'];
    const chronoRow = el('div', { class: 'cfg-row' }, el('label', {}, 'chronotype'),
        el('div', { class: 'btn-group chrono-group' },
            ...chronos.map(v => el('button', {
                class: 'chip' + (cfg.chronotype === v ? ' active' : ''), 'aria-pressed': String(cfg.chronotype === v),
                on: { click: () => { schedule.saveConfig({ chronotype: v }); regenAndPreview(); render(); } }
            }, v))));
    panel.append(chronoRow);

    // pomodoro + break sliders
    const pomoRow = el('div', { class: 'cfg-row' }, el('label', {}, 'pomodoro'),
        el('input', { type: 'range', min: '15', max: '60', step: '5', value: String(cfg.pomodoro),
            'aria-label': 'pomodoro length',
            on: { input: debounce(e => { schedule.saveConfig({ pomodoro: parseInt(e.target.value, 10) }); regenAndPreview(); }, 200) } }),
        el('span', { class: 'mono cfg-val' }, `${cfg.pomodoro}m`));
    panel.append(pomoRow);
    const brkRow = el('div', { class: 'cfg-row' }, el('label', {}, 'break'),
        el('input', { type: 'range', min: '3', max: '20', step: '1', value: String(cfg.breakLen),
            'aria-label': 'break length',
            on: { input: debounce(e => { schedule.saveConfig({ breakLen: parseInt(e.target.value, 10) }); regenAndPreview(); }, 200) } }),
        el('span', { class: 'mono cfg-val' }, `${cfg.breakLen}m`));
    panel.append(brkRow);

    // availability — 7 rows
    const availPanel = el('div', { class: 'cfg-availability' }, el('div', { class: 'cfg-sublabel' }, 'availability (minutes/day)'));
    const dows = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    for (const d of dows) {
        availPanel.append(el('div', { class: 'cfg-row dow-row' },
            el('label', {}, d),
            el('input', { type: 'range', min: '0', max: '480', step: '15', value: String(cfg.availability[d] || 0),
                'aria-label': `${d} availability`,
                on: { input: debounce(e => {
                    const av = { ...schedule.loadConfig().availability, [d]: parseInt(e.target.value, 10) };
                    schedule.saveConfig({ availability: av }); regenAndPreview();
                }, 200) } }),
            el('span', { class: 'mono cfg-val' }, `${cfg.availability[d] || 0}m`)));
    }
    panel.append(availPanel);

    // subject weighting — 8 sliders
    const weightPanel = el('div', { class: 'cfg-weights' }, el('div', { class: 'cfg-sublabel' }, 'subject weighting'));
    for (const meta of state.manifest.subjects) {
        const sub = meta.subject;
        weightPanel.append(el('div', { class: 'cfg-row weight-row' },
            el('label', {}, sub),
            el('input', { type: 'range', min: '0', max: '3', step: '0.1', value: String(cfg.weights[sub] ?? 1),
                'aria-label': `${sub} weight`,
                on: { input: debounce(e => {
                    const w = { ...schedule.loadConfig().weights, [sub]: parseFloat(e.target.value) };
                    schedule.saveConfig({ weights: w }); regenAndPreview();
                }, 200) } }),
            el('span', { class: 'mono cfg-val' }, String(cfg.weights[sub] ?? 1))));
    }
    panel.append(weightPanel);

    // regenerate button + preview
    const previewWrap = el('div', { class: 'cfg-preview', 'aria-live': 'polite' });
    const regenBtn = el('button', { class: 'run-btn',
        on: { click: () => { schedule.regenerate({ dueCounts: dueCountsBySubject() }); refreshPreview(); } } }, 'regenerate');
    panel.append(el('div', { class: 'cfg-row regen-row' }, regenBtn, el('span', { class: 'muted' }, 'tomorrow preview:')));
    panel.append(previewWrap);

    function refreshPreview() {
        const tomorrow = schedule.addDays(schedule.isoDate(new Date()), 1);
        const sched = schedule.getSchedule({ dueCounts: dueCountsBySubject() });
        const blocks = sched.blocks.filter(b => b.date === tomorrow);
        previewWrap.innerHTML = '';
        if (!blocks.length) { previewWrap.append(el('div', { class: 'muted' }, 'no blocks scheduled tomorrow.')); return; }
        for (const b of blocks) {
            const h = Math.floor(b.startMin / 60), m = b.startMin % 60;
            const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            previewWrap.append(el('div', { class: 'preview-block' + (b.kind === 'break' ? ' brk' : '') },
                el('span', { class: 'mono' }, t),
                el('span', {}, b.kind === 'break' ? 'break' : b.subject),
                el('span', { class: 'mono' }, `${b.len}m`)));
        }
    }

    function regenAndPreview() {
        schedule.regenerate({ dueCounts: dueCountsBySubject() });
        refreshPreview();
    }

    refreshPreview();
    return panel;
}

async function renderSettings() {
    stage.append(el('div', { class: 'section-head' }, el('span', { class: 'eyebrow' }, 'settings'), el('h2', {}, 'settings')));
    const cfg = srs.loadConfig();
    const p = progress.load();
    const examInput = el('input', { type: 'date', value: cfg.examDate, class: 'search', style: 'max-width:200px',
        'aria-label': 'exam date', on: { change: e => { srs.saveConfig({ ...cfg, examDate: e.target.value }); render(); } } });
    const goalInput = el('input', { type: 'number', min: '1', max: '500', value: String(p.dailyGoal), class: 'search',
        style: 'max-width:120px', 'aria-label': 'daily goal',
        on: { change: e => { progress.setGoal(parseInt(e.target.value, 10) || 30); render(); } } });
    const cramBtn = el('button', { class: 'chip' + (state.cramMode ? ' active' : ''),
        'aria-label': 'cram mode', 'aria-pressed': String(!!state.cramMode),
        on: { click: () => { state.cramMode = !state.cramMode; render(); } } }, state.cramMode ? 'cram on' : 'cram off');
    const exportBtn = el('button', { class: 'chip', 'aria-label': 'export data',
        on: { click: () => {
            const blob = new Blob([srs.exportState()], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `corpus-srs-${srs.today()}.json`; a.click(); URL.revokeObjectURL(a.href);
        } } }, 'export');
    const importInput = el('input', { type: 'file', accept: '.json', style: 'display:none',
        on: { change: async e => {
            const f = e.target.files?.[0]; if (!f) return;
            if (!confirm('import overwrites current progress. continue?')) return;
            const text = await f.text();
            try { const n = srs.importState(text); alert(`imported ${n} cards`); render(); }
            catch (err) { alert('import failed: ' + err.message); }
        } } });
    const importBtn = el('button', { class: 'chip', 'aria-label': 'import',
        on: { click: () => importInput.click() } }, 'import');
    const resetBtn = el('button', { class: 'chip', 'aria-label': 'reset',
        on: { click: () => { if (confirm('reset all progress?')) { srs.resetAll(); state.reviewSessionGraded = 0; render(); } } } }, 'reset');
    const ankiBtn = el('button', { class: 'chip', 'aria-label': 'export to Anki',
        on: { click: async () => {
            const lines = ['#separator:tab', '#html:true', '#guid column:1', '#notetype column:2', '#deck column:3', '#tags column:6'];
            try {
                const mf = await fetch('data/manifest.json').then(r => r.json());
                for (const s of mf.subjects) {
                    const sh = await fetch(`data/${s.subject}.json`).then(r => r.json());
                    for (const c of sh.cards) {
                        const deck = c._deck || `Corpus::${s.subject}::${c.source || 'general'}`;
                        const noteType = c._noteType || 'Basic';
                        const tags = [...(c.tags || []), `subject:${s.subject}`, `difficulty:${c.difficulty || 'medium'}`].join(' ');
                        const front = String(c.front || '').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
                        const back = String(c.back || '').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
                        lines.push([c._guid || c.id, noteType, deck, front, back, tags].join('\t'));
                    }
                }
                const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/tab-separated-values' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                a.download = `corpus-anki-${srs.today()}.txt`; a.click(); URL.revokeObjectURL(a.href);
            } catch (e) { alert('anki export failed: ' + e.message); }
        } } }, 'export to Anki (.txt)');
    const shortcutsBtn = el('button', { class: 'chip', 'aria-label': 'shortcuts',
        on: { click: () => openShortcutsModal() } }, 'shortcuts');
    stage.append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'study')),
        el('div', { class: 'toolbar' }, el('label', { for: 'exam-date' }, 'exam:'), examInput,
            el('label', {}, 'goal:'), goalInput, cramBtn)));
    stage.append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'theme')),
        el('div', { class: 'toolbar' }, makeToggleButton(document))));
    stage.append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'data')),
        el('div', { class: 'toolbar' }, exportBtn, importBtn, importInput, ankiBtn, resetBtn)));
    stage.append(renderScheduleConfigPanel());
    stage.append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'help')),
        el('div', { class: 'toolbar' }, shortcutsBtn,
            el('a', { class: 'chip', href: '?debug', 'aria-label': 'enable debug' }, 'debug mode'))));
}

const SHORTCUTS = [
    ['ctrl+k', 'open search'],
    ['?', 'show this help'],
    ['esc', 'close modals · exit just-read'],
    ['r', 'just-read mode (subject)'],
    ['t', 'pomodoro timer toggle'],
    ['+', 'quick add card'],
    ['u', 'undo last grade'],
    ['f', 'flag card (review)'],
    ['g h', 'go home (today)'],
    ['g r', 'go review'],
    ['g s', 'go stats'],
    ['g g', 'go guides'],
    ['g m', 'go mistakes'],
    ['space', 'reveal answer (review)'],
    ['1–4', 'grade card (review)'],
    ['s', 'skip card (review)'],
    ['j / k', 'next / prev case (live tutor)'],
    ['/', 'focus reply (live tutor)'],
    ['ctrl+enter', 'send (live tutor)']
];
function openShortcutsModal() {
    let m = document.getElementById('shortcuts-modal');
    if (m) { m.classList.remove('hidden'); return; }
    m = el('div', { id: 'shortcuts-modal', class: 'shortcuts-modal', role: 'dialog', 'aria-label': 'shortcuts' });
    const inner = el('div', { class: 'shortcuts-inner' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'shortcuts'), el('button', { class: 'chip', 'aria-label': 'close',
            on: { click: () => m.classList.add('hidden') } }, 'close')),
        el('table', { class: 'shortcuts-table' },
            el('tbody', {}, ...SHORTCUTS.map(([k, d]) => el('tr', {}, el('td', { class: 'kbd' }, k), el('td', {}, d))))
        ));
    m.append(inner);
    m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
    document.body.appendChild(m);
}
function closeShortcutsModal() {
    const m = document.getElementById('shortcuts-modal'); if (m) m.classList.add('hidden');
}

function showStorageFullBanner() {
    if (document.getElementById('storage-full-banner')) return;
    const b = el('div', { id: 'storage-full-banner', class: 'storage-full-banner', role: 'alert' },
        el('span', {}, 'browser storage full. export, then reset to free space.'),
        el('button', { class: 'chip', on: { click: () => go('settings') } }, 'settings'),
        el('button', { class: 'chip', 'aria-label': 'dismiss', on: { click: () => b.remove() } }, 'dismiss'));
    document.body.appendChild(b);
}

function renderExamDay() {
    stage.innerHTML = '';
    stage.append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'exam day')),
        el('p', { style: 'font-family:var(--ff-prose);font-size:18px;line-height:1.6' }, 'good luck. trust your prep.'),
        el('div', { class: 'toolbar', style: 'margin-top:14px' },
            el('a', { class: 'chip', href: '#mistakes', on: { click: e => { e.preventDefault(); go('mistakes'); } } }, 'mistakes'),
            el('a', { class: 'chip', href: '#settings', on: { click: e => { e.preventDefault(); go('settings'); } } }, 'settings'))));
}

async function renderMistakes() {
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'mistakes'), el('h2', {}, 'mistake log')));
    await loadAllShards();
    const recent = mistakes.recent(50);
    if (!recent.length) {
        stage.append(el('div', { class: 'empty-state' },
            el('div', { class: 'empty-title' }, 'no mistakes logged yet'),
            el('div', { class: 'empty-sub' }, 'cards graded again or hard show up here.')));
        return;
    }
    const cardById = {};
    for (const meta of state.manifest.subjects) for (const c of (state.shards[meta.subject]?.cards || [])) cardById[c.id] = { ...c, _subject: meta.subject };
    const grp = mistakes.bySubject(50);
    stage.append(el('div', { class: 'toolbar' },
        el('button', { class: 'chip', 'aria-label': 'review mistakes',
            on: { click: () => { state.paletteReviewSet = mistakes.ids(); resetReviewQueue(); go('review'); } } }, `review all ${recent.length} →`),
        el('button', { class: 'chip', on: { click: () => { if (confirm('clear mistake log?')) { mistakes.clear(); render(); } } } }, 'clear')));
    for (const subject of Object.keys(grp).sort()) {
        const arr = grp[subject];
        stage.append(el('div', { class: 'panel' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, subject), `${arr.length}`),
            ...arr.map(m => {
                const c = cardById[m.cardId];
                return el('div', { class: 'row' },
                    el('span', { class: 'code' }, ['', 'again', 'hard'][m.score] || String(m.score)),
                    el('div', {}, el('div', { class: 'title' }, c ? c.front.slice(0, 100) : m.cardId),
                        el('div', { class: 'meta' }, new Date(m.ts).toLocaleString())),
                    c ? el('a', { class: 'chip', href: `#card/${c.id}`, on: { click: e => { e.preventDefault(); go('card', c.id); } } }, 'open') : null);
            })));
    }
}

async function renderDrill() {
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'drill'), el('h2', {}, 'drill 10')));
    await loadAllShards();
    let d = drill.active();
    if (!d) {
        // pick weakest cluster
        const states = srs.loadStates();
        const ticks = loadGuideTicks();
        const rows = buildRows(state.manifest, state.shards, states, ticks);
        const w = computeWeakest(rows);
        const sub = w?.subject || state.manifest.subjects[0].subject;
        const sh = state.shards[sub];
        const ids = sh.cards.slice(0, 30).map(c => c.id);
        const due = srs.getDueCards(ids, states);
        const pool = (due.length >= 10 ? due : ids).slice(0, 10);
        d = drill.start(pool, sub);
    }
    state.paletteReviewSet = d.ids;
    state.reviewSubjectFilter = 'all';
    resetReviewQueue();
    state.reviewQueueIds = [...d.ids];
    state.reviewSessionStarted = d.ids.length;
    go('review');
}

function openQuickAdd() {
    if (document.getElementById('quickadd-modal')) return;
    const m = el('div', { id: 'quickadd-modal', class: 'shortcuts-modal', role: 'dialog', 'aria-label': 'add card' });
    const input = el('input', { type: 'text', class: 'search', placeholder: 'front | back | tag1,tag2',
        style: 'width:100%;font-size:15px', 'aria-label': 'card text' });
    const inner = el('div', { class: 'shortcuts-inner', style: 'min-width:480px' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'quick add'),
            el('button', { class: 'chip', on: { click: () => m.remove() } }, 'close')),
        input,
        el('div', { class: 'kbd-hint', style: 'margin-top:8px' }, 'enter to save · esc to cancel'));
    m.append(inner);
    document.body.appendChild(m);
    setTimeout(() => input.focus(), 10);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const parsed = usercards.parseLine(input.value);
            if (parsed) { usercards.add(parsed.front, parsed.back, parsed.tags); m.remove(); render(); }
            else { input.style.borderColor = 'var(--c-due, red)'; }
        } else if (e.key === 'Escape') m.remove();
    });
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
}

function renderSparkline(history, days = 7) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const counts = {};
    for (const h of (history || [])) counts[h.date] = h.graded || 0;
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayP = progress.load();
    counts[todayKey] = (counts[todayKey] || 0) + (todayP.todayGraded || 0);
    const cells = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        cells.push(counts[d.toISOString().slice(0, 10)] || 0);
    }
    const max = Math.max(1, ...cells);
    const W = 80, H = 24, gap = 2, cw = (W - gap * (days - 1)) / days;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H));
    svg.setAttribute('class', 'sparkline'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `7-day grading sparkline, max ${max}`);
    cells.forEach((c, i) => {
        const h = Math.round((c / max) * H);
        const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        r.setAttribute('x', String(i * (cw + gap))); r.setAttribute('y', String(H - h));
        r.setAttribute('width', String(cw)); r.setAttribute('height', String(Math.max(1, h)));
        r.setAttribute('fill', 'currentColor'); r.setAttribute('opacity', c === 0 ? '0.15' : '0.7');
        svg.appendChild(r);
    });
    return svg;
}

function renderMasteryRing() {
    const m = mastery.overallProgress(state.manifest, state.shards);
    const r = 48, c = 2 * Math.PI * r;
    const off = c * (1 - m.weighted / 100);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'mastery-ring'); svg.setAttribute('viewBox', '0 0 120 120');
    svg.setAttribute('width', '120'); svg.setAttribute('height', '120');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `overall mastery ${m.weighted}%`);
    const bg = document.createElementNS(svgNS, 'circle');
    bg.setAttribute('cx', '60'); bg.setAttribute('cy', '60'); bg.setAttribute('r', String(r));
    bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', 'var(--panel-3)'); bg.setAttribute('stroke-width', '10');
    svg.appendChild(bg);
    const fg = document.createElementNS(svgNS, 'circle');
    fg.setAttribute('cx', '60'); fg.setAttribute('cy', '60'); fg.setAttribute('r', String(r));
    fg.setAttribute('fill', 'none'); fg.setAttribute('stroke', 'var(--c-mastered, #6BB377)'); fg.setAttribute('stroke-width', '10');
    fg.setAttribute('stroke-dasharray', String(c)); fg.setAttribute('stroke-dashoffset', String(off));
    fg.setAttribute('stroke-linecap', 'round'); fg.setAttribute('transform', 'rotate(-90 60 60)');
    svg.appendChild(fg);
    const txt = document.createElementNS(svgNS, 'text');
    txt.setAttribute('x', '60'); txt.setAttribute('y', '66'); txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('font-size', '24'); txt.setAttribute('font-weight', '700'); txt.setAttribute('fill', 'currentColor');
    txt.textContent = `${m.weighted}%`;
    svg.appendChild(txt);
    const wrap = el('div', { class: 'panel mastery-ring-panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'overall mastery')),
        el('div', { class: 'mastery-ring-row' }, svg,
            el('div', { class: 'mastery-quad' },
                el('div', { class: 'quad-row' }, el('span', {}, 'cards'), el('span', { class: 'mono' }, `${m.cards.pct}% (${m.cards.mastered}/${m.cards.total})`)),
                el('div', { class: 'quad-row' }, el('span', {}, 'sections'), el('span', { class: 'mono' }, `${m.sections.pct}% (${m.sections.ticked}/${m.sections.total})`)),
                el('div', { class: 'quad-row' }, el('span', {}, 'cases'), el('span', { class: 'mono' }, `${m.cases.pct}% (${m.cases.passed}/${m.cases.total})`)),
                el('div', { class: 'quad-row' }, el('span', {}, 'mistakes'), el('span', { class: 'mono' }, `${m.mistakes.pct}% (${m.mistakes.cleared}/${m.mistakes.total})`))
            ))
    );
    return wrap;
}

// Today's plan: schedule-driven checklist. Schedule is recommendation, not gate.
// Reconciles actuals (newcards.bumps + grade history + section ticks + cases) and
// surfaces rollover/surplus as informational text.
function renderScheduleChecklist(rows) {
    if (!state.manifest) return null;
    const today = new Date().toISOString().slice(0, 10);
    const dueCounts = dueCountsBySubjectMap();
    // Build extras for plannedSections / plannedCases
    const ticksAll = loadGuideTicks();
    const casesDone = {};
    try {
        const triage = JSON.parse(localStorage.getItem('corpus.triage.v1') || '{}');
        const sessions = triage.sessions || {};
        for (const id of Object.keys(sessions)) (casesDone[id] = casesDone[id] || new Set()).add(id);
    } catch {}
    schedule.regenerate({ today, dueCounts, extras: { ticksAll, shards: state.shards, casesDone } });
    // Build actuals — review/new from today's progress + newcards counts; sections = today's ticks (we don't track per-day, so pass full ticks set)
    const p = progress.load();
    const states = srs.loadStates();
    const actualBySubject = {};
    for (const meta of state.manifest.subjects) {
        const subj = meta.subject;
        actualBySubject[subj] = {
            review: 0, new: newcards.countToday(subj),
            sectionsRead: new Set(Object.keys(ticksAll[subj] || {}).filter(k => ticksAll[subj][k])),
            casesDone: new Set()
        };
    }
    // Distribute today's grades proportionally — best-effort approximation
    const todayGraded = p.todayGraded || 0;
    if (todayGraded > 0) {
        const totalDue = Object.values(dueCounts).reduce((n, x) => n + x, 0) || 1;
        for (const meta of state.manifest.subjects) {
            const subj = meta.subject;
            const share = (dueCounts[subj] || 0) / totalDue;
            actualBySubject[subj].review = Math.round(todayGraded * share);
        }
    }
    const sched = schedule.reconcile({ today, actualBySubject });
    const blocks = sched.blocks.filter(b => b.date === today && b.kind === 'study');
    if (!blocks.length) return null;
    const panel = el('div', { class: 'panel schedule-checklist' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, "today's plan"),
            el('a', { class: 'chip', href: '#calendar', on: { click: e => { e.preventDefault(); go('calendar'); } } }, 'calendar →'))
    );
    let totalShortReview = 0, totalShortNew = 0, totalSurplus = 0;
    for (const b of blocks) {
        if (b.rollover) { totalShortReview += b.rollover.review || 0; totalShortNew += b.rollover.new || 0; }
        if (b.over) totalSurplus += b.surplus || 0;
        const items = [];
        if (b.plannedReview > 0) items.push({
            kind: 'review', done: b.completedReview >= b.plannedReview,
            label: `review ${b.plannedReview} ${b.subject} card${b.plannedReview === 1 ? '' : 's'} (${b.completedReview}/${b.plannedReview})`,
            click: () => { state.reviewSubjectFilter = b.subject; resetReviewQueue(); go('review', b.subject); }
        });
        if (b.plannedNew > 0) items.push({
            kind: 'new', done: b.completedNew >= b.plannedNew,
            label: `introduce ${b.plannedNew} new ${b.subject} card${b.plannedNew === 1 ? '' : 's'} (${b.completedNew}/${b.plannedNew})`,
            click: () => { state.reviewSubjectFilter = b.subject; resetReviewQueue(); go('review', b.subject); }
        });
        for (const line of (b.plannedSections || [])) {
            const sh = state.shards[b.subject];
            const sec = sh?.guide?.sections?.find(s => String(s.line) === String(line));
            const sTitle = sec?.title || `section ${line}`;
            items.push({
                kind: 'read', done: b.completedSections.includes(line),
                label: `read ${b.subject} · ${sTitle}`,
                click: () => go('subject', b.subject)
            });
        }
        for (const cid of (b.plannedCases || [])) {
            const sh = state.shards[b.subject];
            const sc = sh?.triage?.scenarios?.find(x => (x.id || x.name) === cid);
            const cTitle = sc?.name || cid;
            items.push({
                kind: 'case', done: b.completedCases.includes(cid),
                label: `work case · ${cTitle}`,
                href: `./triage-live.html#${encodeURIComponent(cid)}`
            });
        }
        for (const it of items) {
            const row = el('div', { class: `checklist-row${it.done ? ' done' : ''} kind-${it.kind}` },
                el('span', { class: 'check' }, it.done ? '✓' : '○'),
                it.href
                    ? el('a', { href: it.href, class: 'cl-label' }, it.label)
                    : el('a', { href: '#', class: 'cl-label', on: { click: e => { e.preventDefault(); it.click && it.click(); } } }, it.label)
            );
            panel.append(row);
        }
    }
    if (totalShortReview || totalShortNew) {
        panel.append(el('div', { class: 'rollover-note' },
            `Rolled over from earlier: ${totalShortReview} review${totalShortReview === 1 ? '' : 's'}` +
            (totalShortNew ? ` · ${totalShortNew} new card${totalShortNew === 1 ? '' : 's'}` : '')));
    } else if (totalSurplus > 0) {
        panel.append(el('div', { class: 'surplus-note' }, `Ahead by ${totalSurplus} — credited to tomorrow`));
    }
    return panel;
}

function mountTopbar() {
    const nav = document.querySelector('.nav');
    nav.innerHTML = '';
    const primary = [['today', 'today'], ['guides', 'guides'], ['review', 'review']];
    for (const [route, label] of primary) {
        nav.append(el('a', { href: `#${route}`, class: 'navlink', data: { route },
            on: { click: e => { e.preventDefault(); go(route); } } }, label));
    }
    const moreWrap = el('div', { class: 'nav-more' });
    const moreBtn = el('button', { class: 'navlink nav-more-btn', type: 'button',
        'aria-haspopup': 'menu', 'aria-expanded': 'false' }, 'more ▾');
    const moreMenu = el('div', { class: 'nav-more-menu hidden', role: 'menu' });
    const secondary = [['cases', 'cases'], ['calendar', 'calendar'], ['stats', 'stats'],
        ['mistakes', 'mistakes'], ['settings', 'settings']];
    for (const [route, label] of secondary) {
        moreMenu.append(el('a', { href: `#${route}`, class: 'navlink nav-more-item',
            data: { route }, role: 'menuitem',
            on: { click: e => { e.preventDefault(); moreMenu.classList.add('hidden');
                moreBtn.setAttribute('aria-expanded', 'false'); go(route); } } }, label));
    }
    moreBtn.addEventListener('click', () => {
        const open = moreMenu.classList.toggle('hidden');
        moreBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
    document.addEventListener('click', e => {
        if (!moreWrap.contains(e.target)) {
            moreMenu.classList.add('hidden');
            moreBtn.setAttribute('aria-expanded', 'false');
        }
    });
    moreWrap.append(moreBtn, moreMenu);
    nav.append(moreWrap);
    nav.append(el('a', { href: './triage-live.html', class: 'navlink nav-cta' }, 'tutor'));
    const right = document.querySelector('header.topbar .status');
    const days = srs.daysUntilExam();
    const countdown = el('a', { class: 'exam-countdown', href: '#settings',
        title: 'days to exam — click to edit', 'aria-label': `${days} days to exam`,
        on: { click: e => { e.preventDefault(); go('settings'); } } }, days + "d to exam");
    right.parentElement.insertBefore(countdown, right);
    const searchBtn = el('button', { class: 'chip search-btn', 'aria-label': 'search (ctrl+k)', title: 'search (ctrl+k)',
        on: { click: () => state.searchPaletteApi?.open() } }, 'search ⌘k');
    right.parentElement.insertBefore(searchBtn, right);
    right.parentElement.insertBefore(makeToggleButton(document), right);
}

function mountSearchPalette() {
    state.searchPaletteApi = mountPalette(document, '#search-palette',
        () => buildSearchIndex(state.manifest, state.shards),
        (item) => {
            if (item.kind === 'card') { go('subject', item.subject); }
            else if (item.kind === 'case') { location.href = `./triage-live.html#${encodeURIComponent(item.id)}`; }
            else if (item.kind === 'section') { go('subject', item.subject); }
            else if (item.kind === 'prose') { go('subject', item.subject); }
            else if (item.kind === 'infographic') { go('subject', item.subject); }
            else if (item.kind === 'video') {
                go('subject', item.subject);
                setTimeout(() => { const v = document.querySelector('.video-hero'); if (v) v.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200);
            }
        });
}

function updateOnlineStatus() {
    const dot = document.querySelector('.status .dot');
    const lbl = document.getElementById('status-label');
    if (!dot || !lbl) return;
    dot.classList.remove('loading');
    if (navigator.onLine) { dot.classList.remove('offline'); dot.classList.add('live'); lbl.textContent = 'online'; }
    else { dot.classList.remove('live'); dot.classList.add('offline'); lbl.textContent = 'offline'; }
}

function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js').then(reg => log('sw registered', reg.scope))
        .catch(e => warn('sw register failed', e.message));
}

(async () => {
    try {
        const dot = document.querySelector('.status .dot'); if (dot) dot.classList.add('loading');
        const lbl = document.getElementById('status-label'); if (lbl) lbl.textContent = 'loading…';
        mountTopbar();
        await loadManifest();
        await loadAllShards();
        mountSearchPalette();
        state.timerApi = timer.mount(document);
        const lvl = late.lateLevel(); late.applyClass(document, lvl);
        if (lvl !== 'normal') {
            const m = late.message(lvl);
            if (m) { const banner = el('div', { class: 'late-banner', role: 'status' }, m); document.body.appendChild(banner); }
        }
        registerSW();
        toast.bind();
        updateOnlineStatus();
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        window.addEventListener('storage', e => {
            if (__rendering) return;
            if (e.key && /^corpus\./.test(e.key)) render();
        });
        try {
            const ch = new BroadcastChannel('corpus');
            ch.addEventListener('message', e => {
                if (e.data?.type === 'schedule:updated') {
                    if (__rendering) return;
                    if (state.route === 'calendar') {
                        // calendar self-updates via schedule.onUpdate; nothing to do
                    } else if (state.route === 'settings') {
                        render();
                    }
                }
            });
            state.broadcastChannel = ch;
        } catch (e) { warn('broadcast channel unavailable', e.message); }
        window.addEventListener('corpus:storage-full', () => showStorageFullBanner());
        const hash = location.hash.replace('#', '') || 'today';
        const [routeRaw, sub] = hash.split('/');
        const route = routeRaw.split('?')[0];
        go(route, sub ? sub.split('?')[0] : undefined);
        log('ready', { subjects: state.manifest.subjects.length });
    } catch (e) {
        stage.innerHTML = '';
        stage.append(el('div', { class: 'panel error-state' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'failed to load')),
            el('div', {}, e.message),
            el('button', { class: 'chip', on: { click: () => location.reload() } }, 'retry')));
        warn('boot error', e);
    }
})();

window.addEventListener('hashchange', () => {
    const hash = location.hash.replace('#', '') || 'today';
    const [routeRaw, sub] = hash.split('/');
    const route = routeRaw.split('?')[0];
    go(route, sub ? sub.split('?')[0] : undefined);
});
