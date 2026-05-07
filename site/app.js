// corpus — personal med-study notebook. vanilla ESM, no bundler.
import './theme.js';
import * as srs from './srs.js';
import * as progress from './progress.js';
import * as lastpos from './lastpos.js';
import * as cram from './cram.js';
import * as justread from './justread.js';
import * as timer from './timer.js';
import * as planMod from './plan.js';
import * as mistakes from './mistakes.js';
import * as drill from './drill.js';
import * as flag from './flag.js';
import * as undo from './undo.js';
import * as late from './late.js';
import * as usercards from './usercards.js';
import * as confidence from './confidence.js';
import * as unlocked from './unlocked.js';
import * as newcards from './newcards.js';
import * as coverage from './coverage.js';
import * as schedule from './schedule.js';
import * as calendar from './calendar.js';
import * as game from './game.js';
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

// Unified gate predicate factory. A card is eligible when:
//   (a) its subject is unlocked (video watched, or auto-unlocked)
//   (b) if it's "new" (never graded), the subject is still under its daily cap
//   (c) already-graded cards always pass
function eligibleForSubject(subject, sessionUsed = 0) {
    const unl = unlocked.isUnlocked(subject);
    const capRemaining = newcards.remaining(subject);
    const sh = state.shards[subject];
    const byId = new Map((sh?.cards || []).map(c => [c.id, c]));
    const covered = coverage.coveredSections(subject);
    return (id, s) => {
        if (!srs.isNewCardForGate(s)) return true;
        if (!unl) return false;
        if (sessionUsed >= capRemaining) return false;
        const c = byId.get(id);
        if (c && c.requires && c.requires.sectionLine && !covered.has(String(c.requires.sectionLine))) return false;
        return true;
    };
}

// Map subject -> Map<sectionLine, count> of cards keyed by their `requires.sectionLine`.
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

function pickNextActionSubject(rows) {
    if (!rows || !rows.length) return null;
    const sorted = [...rows].sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0));
    return sorted[0] || null;
}

function computeNextAction(rows) {
    if (!state.manifest) return null;
    // priority 1: any subject with a video that's not yet watched
    const weakestRow = pickNextActionSubject(rows);
    const orderedSubs = [];
    if (weakestRow) orderedSubs.push(weakestRow.subject);
    for (const m of state.manifest.subjects) if (!orderedSubs.includes(m.subject)) orderedSubs.push(m.subject);

    for (const subj of orderedSubs) {
        if (unlocked.isAutoUnlocked(subj)) continue;
        if (unlocked.isUnlocked(subj)) continue;
        const sh = state.shards[subj];
        const vids = sh?.guide?.videos || [];
        if (!vids.length) continue;
        const dur = vids[0].durationMin || Math.max(1, Math.round((vids[0].sizeMB || 50) / 8));
        const counts = sectionCardCounts(subj);
        // unlocking the video doesn't directly unlock cards (sections do) — but new cards
        // from un-section-required cards become eligible too. Compute total cards in subject
        // that are currently locked behind the video gate (i.e. all new cards in subject).
        const states = srs.loadStates();
        const newCount = sh.cards.filter(c => srs.isNewCardForGate(states[c.id])).length;
        return el('div', { class: 'panel next-action rail-mascot' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'next action')),
            el('a', { class: 'next-action-link', href: `#subject/${subj}`,
                on: { click: e => { e.preventDefault(); go('subject', subj); } } },
                `▶ watch ${subj} lecture (~${dur} min, unlocks ${newCount} cards)`)
        );
    }

    // priority 2: untouched guide section that gates ≥1 card
    for (const subj of orderedSubs) {
        const sh = state.shards[subj];
        if (!sh) continue;
        const ticksAll = loadGuideTicks()[subj] || {};
        const counts = sectionCardCounts(subj);
        const sections = sh.guide?.sections || [];
        for (const s of sections) {
            const k = String(s.line);
            if (ticksAll[k]) continue;
            const n = counts.get(k) || 0;
            if (n < 1) continue;
            return el('div', { class: 'panel next-action rail-sky' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'next action')),
                el('a', { class: 'next-action-link', href: `#subject/${subj}`,
                    on: { click: e => { e.preventDefault(); go('subject', subj); } } },
                    `📖 read ${subj} · ${s.title} (unlocks ${n} card${n === 1 ? '' : 's'})`)
            );
        }
    }

    // priority 3: due cards exist — primary CTA already covers it
    const due = totalDueAll();
    if (due > 0) return null;

    // priority 4: caught up
    return el('div', { class: 'panel next-action rail-green' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'next action')),
        el('a', { class: 'next-action-link', href: '#cases',
            on: { click: e => { e.preventDefault(); go('cases'); } } },
            '✓ caught up — try a clinical case')
    );
}

function dueCountFor(subject) {
    const sh = state.shards[subject]; if (!sh) return 0;
    const ids = sh.cards.map(c => c.id);
    return srs.getDueCards(ids, srs.loadStates(), eligibleForSubject(subject)).length;
}

function totalDueAll() {
    let n = 0;
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject]; if (!sh) continue;
        n += srs.getDueCards(sh.cards.map(c => c.id), srs.loadStates(), eligibleForSubject(meta.subject)).length;
    }
    return n;
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

function updateFooter() {
    if (!statusbar || !statusbarMsg) return;
    if (!navigator.onLine) {
        statusbar.classList.remove('hidden');
        statusbarMsg.textContent = 'offline · saved locally';
    } else {
        statusbar.classList.add('hidden');
    }
}

function render() {
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
}

// ---- shell-prompt status line ----
function renderStatusLine(p, due) {
    const day = p.streak || 0;
    return el('div', { class: 'status-line', role: 'status', 'aria-label': 'study status' },
        el('span', {}, `day ${day}`),
        el('span', { class: 'sep' }, '·'),
        el('span', { class: 'due' }, `${due} due`),
        el('span', { class: 'sep' }, '·'),
        el('span', { class: 'streak' }, `streak ${p.streak}`),
        el('span', { class: 'sep' }, '·'),
        el('span', {}, `goal ${p.todayGraded}/${p.dailyGoal}`)
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

// ---- compressed today ----
function renderToday() {
    const p = progress.load();
    const due = totalDueAll();
    const cases = totalCasesQueued();
    const mins = estReviewMinutes(due);

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

    // Locked-subjects strip — actionable nudge.
    {
        const locked = state.manifest.subjects
            .map(m => m.subject)
            .filter(s => !unlocked.isUnlocked(s));
        if (locked.length) {
            const strip = el('div', { class: 'locks-strip', role: 'note' },
                el('span', { class: 'eyebrow' }, '🔒 locked'),
                ' ',
                el('span', {}, `${locked.length} subject${locked.length === 1 ? '' : 's'}: `),
                ...locked.map((s, i) => el('a', { class: 'chip', href: `#subject/${s}`,
                    on: { click: e => { e.preventDefault(); go('subject', s); } } }, s + (i < locked.length - 1 ? '' : '')))
            );
            stage.append(strip);
        }
    }

    // Slim today: status, primary CTA, schedule strip, mastery ring

    // Primary CTA — outcome-oriented
    stage.append(el('div', { class: 'today-primary' },
        el('a', { class: 'primary-action', href: '#review',
            on: { click: e => { e.preventDefault(); go('review'); } } },
            due ? `study ${due} card${due === 1 ? '' : 's'} · ~${mins} min` : 'no cards due — browse guides')
    ));

    const next = computeNextAction(rows);
    if (next) stage.append(next);

    const tl = renderTimelineStrip(); if (tl) stage.append(tl);
    stage.append(renderMasteryRing());

    if (DEBUG) {
        stage.append(renderXpBarFull());
        stage.append(el('p', { class: 'summary-line' },
            'today: ', el('span', { class: 'num' }, String(due)), ' due cards · ',
            el('span', { class: 'num' }, String(cases)), ' cases queued · ~',
            el('span', { class: 'num' }, String(mins)), ' min est.'));
        const ticksAll = loadGuideTicks();
        const wsh = weakest ? state.shards[weakest.subject] : null;
        const tw = weakest ? (ticksAll[weakest.subject] || {}) : {};
        const nextSection = wsh?.guide?.sections?.find(s => !tw[String(s.line)]) || null;
        const unlMap = {}; const lockedList = [];
        for (const meta of state.manifest.subjects) {
            const u = unlocked.isUnlocked(meta.subject);
            unlMap[meta.subject] = u;
            if (!u) lockedList.push(meta.subject);
        }
        const planObj = planMod.build({ due, weakestSubject: weakest?.subject, nextSection,
            casesAvailable: wsh?.triage?.scenarios?.length || 0,
            unlocked: unlMap, lockedSubjects: lockedList });
        if (planObj.tasks.length) {
            const planEl = el('div', { class: 'panel daily-plan' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, "debug · today's plan"), `~${planObj.total} min`),
                ...planObj.tasks.map(t => el('a', { class: 'plan-task', href: t.href,
                    on: { click: e => { if (t.href.startsWith('#')) { e.preventDefault(); go(t.href.slice(1).split('/')[0], t.href.split('/')[1]); } } } },
                    el('span', { class: 'plan-min' }, `${t.min}m`),
                    el('span', { class: 'plan-label' }, t.label))));
            stage.append(planEl);
        }
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
        const isLocked = !unlocked.isUnlocked(meta.subject);
        const taglineParts = [`${sections} sections`];
        if (hasVideo) taglineParts.push('▶ video');
        if (isLocked) taglineParts.push('🔒 locked');
        grid.append(el('div', {
            class: 'subject-card' + (hasVideo ? ' has-video' : '') + (isLocked ? ' locked' : ''), role: 'button', tabindex: '0',
            'aria-label': `${meta.subject} guide, ${m}% understood${hasVideo ? ', includes video' : ''}${isLocked ? ', cards locked until lecture watched' : ''}`,
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
    // Unlock gate panel — visible whenever subject is locked OR has a video.
    {
        const auto = unlocked.isAutoUnlocked(subj);
        const unl = unlocked.isUnlocked(subj);
        const wAt = unlocked.watchedAt(subj);
        const hasVid = (meta?.videoCount || 0) > 0;
        if (auto) {
            stage.append(el('div', { class: 'panel unlock-panel auto' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'unlocked'), 'no lecture video — open'),
                el('div', { class: 'meta' }, 'all new cards available immediately.')));
        } else if (!unl) {
            const btn = el('button', { class: 'primary-action unlock-btn',
                on: { click: () => { unlocked.markWatched(subj); render(); } } },
                'I watched the lecture — unlock cards');
            stage.append(el('div', { class: 'panel unlock-panel locked' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, '🔒 locked'), 'watch the lecture, then unlock'),
                el('div', { class: 'meta' }, hasVid ? 'new cards stay hidden in review until you confirm you watched the lecture.' : 'no video on file — toggle below to unlock.'),
                btn));
        } else {
            const dayCap = newcards.cap();
            const countT = newcards.countToday(subj);
            const rem = newcards.remaining(subj);
            stage.append(el('div', { class: 'panel unlock-panel unlocked' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, '✓ unlocked'), wAt ? `since ${wAt.slice(0, 10)}` : ''),
                el('div', { class: 'meta' }, `today: ${countT}/${dayCap} new · ${rem} remaining`),
                el('button', { class: 'chip', on: { click: () => { if (confirm('relock this subject? cards introduced today still count.')) { unlocked.reset(subj); render(); } } } }, 'relock')));
        }
    }

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

    const due = srs.getDueCards(shard.cards.map(c => c.id), srs.loadStates(), eligibleForSubject(subj)).length;
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
        el('div', { class: 'panel' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'sections')),
            ...(() => {
                const counts = sectionCardCounts(subj);
                return (shard.guide?.sections || []).slice(0, 50).map(s => {
                    const lineKey = String(s.line);
                    const checked = !!ticks[lineKey];
                    const n = counts.get(lineKey) || 0;
                    const badgeText = n
                        ? (checked ? `(${n} card${n === 1 ? '' : 's'} · ready)` : `(${n} card${n === 1 ? '' : 's'} · 🔒)`)
                        : '';
                    const row = el('label', { class: `guide-section h${s.level}` + (checked ? ' done' : '') },
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
                                if (e.target.checked) {
                                    game.awardXP(game.XP.section_tick, 'section');
                                }
                                render();
                            } }
                        }),
                        el('span', {}, s.title),
                        badgeText ? el('span', { class: 'sec-card-badge' }, ' ', badgeText) : null
                    );
                    return row;
                });
            })()
        )
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
    const right = el('div', {}, videoHero, guideBodyPanel, infographicsPanel, cardsPanel, triagePanel);
    const wrap = el('div', { class: 'deepdive', data: { cat: meta?.cat || 'green' } }, left, right);
    stage.append(wrap);
}

function buildVideoHero(videos, subj) {
    if (!Array.isArray(videos) || videos.length === 0) return null;
    const v = videos[0];
    const sub = v.title || 'lecture video';
    const meta = [v.durationMin ? `${v.durationMin} min` : null, v.sizeMB ? `${v.sizeMB} MB` : null].filter(Boolean).join(' · ');
    const source = v.url || v.src;
    const vidEl = el('video', { controls: 'controls', preload: 'metadata', playsinline: 'playsinline', src: source });
    if (subj && !unlocked.isUnlocked(subj)) {
        let armed = false;
        vidEl.addEventListener('timeupdate', () => {
            if (armed) return;
            if ((vidEl.currentTime || 0) >= 30) {
                armed = true;
                unlocked.markWatched(subj);
                toast.info(`${subj} unlocked — cards now in review`);
                render();
            }
        });
    }
    return el('div', { class: 'panel video-hero', 'data-video-id': v.filename },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'watch first'), meta),
        el('div', { class: 'video-hero-frame' }, vidEl),
        el('div', { class: 'video-hero-caption' }, sub)
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
function renderMarkdown(md, subject) {
    if (!md) return '';
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = md.split('\n');
    const out = [];
    let listStack = [];
    let inCode = false, inQuote = false, para = [];
    const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
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
        const cardByIdEarly = Object.fromEntries(allCards.map(c => [c.id, c]));
        const subjEligibleR = {};
        const reviewEligible = (id, s) => {
            const c = cardByIdEarly[id]; if (!c) return true;
            const subj = c._subject || c.subject; if (!subj) return true;
            const fn = subjEligibleR[subj] || (subjEligibleR[subj] = eligibleForSubject(subj));
            return fn(id, s);
        };
        const dueIdsRaw = state.cramMode ? pool : srs.getDueCards(pool, states, reviewEligible);
        const cardById = Object.fromEntries(allCards.map(c => [c.id, c]));
        // Unlock gate + per-subject daily new-card cap. Apply only to "new" cards
        // (repetitions===0 && lastScore==null). Already-graded cards bypass.
        const introducedThisSession = {};
        const dueIds = [];
        for (const id of dueIdsRaw) {
            const c = cardById[id]; if (!c) continue;
            const subj = c._subject || c.subject;
            const cs = states[id];
            const isNew = srs.isNewCardForGate(cs);
            if (!isNew) { dueIds.push(id); continue; }
            if (!unlocked.isUnlocked(subj)) continue; // locked subject — drop new cards
            const introToday = newcards.countToday(subj);
            const usedThisSess = introducedThisSession[subj] || 0;
            if (introToday + usedThisSess >= newcards.cap()) continue;
            introducedThisSession[subj] = usedThisSess + 1;
            dueIds.push(id);
        }
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
    // Gamification — XP, combo, badges, quests
    awardCardXP(score, card);
    // Undo record
    undo.record(cardId, prev);
    showUndoToast();
    state.reviewQueueIds.splice(state.reviewIndex, 1);
    if (state.reviewIndex >= state.reviewQueueIds.length) state.reviewIndex = 0;
    state.reviewRevealed = false;
    renderReview();
}

function awardCardXP(score, card) {
    const friendly = score <= 0 ? 1 : (score <= 2 ? 2 : (score <= 4 ? 3 : 4));
    const amt = game.XP['card_grade_' + friendly] || 10;
    game.awardXP(amt, 'card_grade');
    const combo = game.bumpCombo(score);
    if (combo >= 3) game.awardXP(game.XP.combo_bonus, 'combo');
    // daily-goal-hit one-shot
    const p = progress.load();
    if (p.todayGraded >= (p.dailyGoal || 30)) {
        const g = game.load();
        if (g.lastGoalHitDate !== p.todayDate) {
            game.awardXP(game.XP.daily_goal_hit, 'daily_goal');
            const g2 = game.load(); g2.lastGoalHitDate = p.todayDate; game.save(g2);
        }
    }
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
    const subjEligible = {};
    for (const meta of state.manifest.subjects) subjEligible[meta.subject] = eligibleForSubject(meta.subject);
    const allEligible = (id, s) => {
        const subj = idSubject[id]; if (!subj) return true;
        return subjEligible[subj](id, s);
    };
    const stats = srs.getScheduleStats(cardIds, states, allEligible);
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
        out[meta.subject] = srs.getDueCards(sh.cards.map(c => c.id), srs.loadStates(), eligibleForSubject(meta.subject)).length;
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
    // Phase 2: gamification settings
    const gState = game.load();
    const suppressInput = el('input', { type: 'checkbox', id: 'suppress-toasts',
        ...(gState.suppressToasts ? { checked: 'checked' } : {}),
        on: { change: e => game.setSuppressToasts(e.target.checked) } });
    const resetGameBtn = el('button', { class: 'chip', 'aria-label': 'reset gamification',
        on: { click: () => { if (confirm('reset XP?')) { game.reset(); render(); } } } }, 'reset gamification');
    stage.append(el('div', { class: 'panel settings-section gamification' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'gamification')),
        el('div', { class: 'toolbar' },
            el('label', { for: 'suppress-toasts' }, suppressInput, ' suppress toasts'),
            resetGameBtn)));
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
        const due = srs.getDueCards(ids, states, eligibleForSubject(sub));
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

function renderXpChip() {
    const g = game.load();
    const info = game.xpToNext(g.xp);
    const frac = Math.round(info.frac * 100);
    return el('a', { id: 'xp-chip', class: 'xp-chip', href: '#stats',
        'aria-label': `level ${info.level}, ${info.inLvl} of ${info.need} xp`,
        on: { click: e => { e.preventDefault(); go('stats'); } } },
        el('span', { class: 'xp-lvl' }, `Lv ${info.level}`),
        el('span', { class: 'xp-bar' }, el('span', { class: 'xp-fill', style: `width:${frac}%` })),
        el('span', { class: 'xp-num mono' }, `${info.inLvl}/${info.need}`)
    );
}

function renderXpBarFull() {
    const g = game.load();
    const info = game.xpToNext(g.xp);
    return el('div', { class: 'xp-bar-full panel' },
        el('div', { class: 'xp-bar-head' },
            el('span', { class: 'xp-bar-lvl' }, `level ${info.level}`),
            el('span', { class: 'xp-bar-num mono' }, `${info.inLvl} / ${info.need} xp · total ${g.xp}`)),
        el('div', { class: 'xp-bar-track' }, el('div', { class: 'xp-bar-fill', style: `width:${Math.round(info.frac*100)}%` }))
    );
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

function renderTimelineStrip() {
    const today = new Date().toISOString().slice(0, 10);
    const dueCounts = {};
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject]; if (!sh) continue;
        dueCounts[meta.subject] = srs.getDueCards(sh.cards.map(c => c.id), srs.loadStates(), eligibleForSubject(meta.subject)).length;
    }
    const sched = schedule.getSchedule({ today, dueCounts });
    const blocks = sched.blocks.filter(b => b.date === today);
    if (!blocks.length) return null;
    const panel = el('div', { class: 'panel timeline-strip-panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, "today's schedule"),
            el('a', { class: 'chip', href: '#calendar', on: { click: e => { e.preventDefault(); go('calendar'); } } }, 'calendar →'))
    );
    const next = blocks.find(b => !b.done && b.kind === 'study');
    if (next) panel.append(el('a', { class: 'primary-action', href: '#review',
        on: { click: e => { e.preventDefault(); if (next.subject) { state.reviewSubjectFilter = next.subject; resetReviewQueue(); } go('review', next.subject); } } },
        `start next block · ${next.subject || 'study'} (${next.len}m)`));
    const strip = el('div', { class: 'timeline-strip' });
    for (const b of blocks) {
        const hh = String(Math.floor(b.startMin / 60)).padStart(2, '0');
        const mm = String(b.startMin % 60).padStart(2, '0');
        strip.append(el('div', { class: `timeline-block kind-${b.kind}` + (b.done ? ' done' : '') },
            el('span', { class: 'tl-time mono' }, `${hh}:${mm}`),
            el('span', { class: 'tl-label' }, b.kind === 'break' ? 'break' : (b.subject || 'study')),
            el('span', { class: 'tl-len mono' }, `${b.len}m`),
            b.kind === 'study' ? el('button', { class: 'chip',
                on: { click: () => { schedule.markBlockComplete(b.id, !b.done); if (!b.done) { game.awardXP(game.XP.block_complete + Math.round(b.len/5), 'block'); } render(); } } },
                b.done ? '✓' : 'mark') : null
        ));
    }
    panel.append(strip);
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
    const xpChip = renderXpChip();
    right.parentElement.insertBefore(xpChip, right);
    if (typeof window !== 'undefined') {
        window.addEventListener('game:xp', () => {
            const newChip = renderXpChip();
            const old = document.getElementById('xp-chip');
            if (old && old.parentElement) old.parentElement.replaceChild(newChip, old);
        });
    }
    const days = srs.daysUntilExam();
    const countdown = el('a', { class: 'exam-countdown', href: '#settings',
        title: 'days to exam — click to edit', 'aria-label': `${days} days to exam`,
        on: { click: e => { e.preventDefault(); go('settings'); } } }, `${days}d`);
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
    if (navigator.onLine) { dot.classList.remove('offline'); dot.classList.add('live'); lbl.textContent = 'ready'; }
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
        window.addEventListener('pomodoro:done', () => {
            game.awardXP(game.XP.pomodoro_complete, 'pomodoro');
        });
        updateOnlineStatus();
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        window.addEventListener('storage', e => {
            if (e.key && /^corpus\./.test(e.key)) render();
        });
        try {
            const ch = new BroadcastChannel('corpus');
            ch.addEventListener('message', e => {
                if (e.data?.type === 'schedule:updated') {
                    if (state.route === 'calendar') {
                        // calendar self-updates via schedule.onUpdate; nothing to do
                    } else if (state.route === 'today' || state.route === 'settings') {
                        render();
                    }
                } else if (e.data?.type === 'case:graded') {
                    const score = e.data.score || 0;
                    game.awardXP(game.XP.case_graded + (score >= 0.7 ? game.XP.case_passed_bonus : 0), 'case');
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
