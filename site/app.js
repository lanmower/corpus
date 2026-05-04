// corpus — student learning hub. vanilla ESM, no bundler.
import './theme.js';
import * as srs from './srs.js';
import * as progress from './progress.js';
import { buildSearchIndex, mountPalette } from './search.js';
import { makeToggleButton } from './theme.js';

const stage = document.getElementById('stage');
const statusbarMsg = document.getElementById('statusbar-msg');
const statusbar = document.querySelector('.statusbar');
const DEBUG = new URLSearchParams(location.search).has('debug');
const log = (...a) => console.log('[corpus]', ...a);
const warn = (...a) => console.warn('[corpus]', ...a);

const FRIENDLY_GRADES = [
    { friendly: 1, smscore: 0, label: 'again', desc: "didn't know" },
    { friendly: 2, smscore: 2, label: 'hard', desc: 'got it the slow way' },
    { friendly: 3, smscore: 4, label: 'good', desc: 'recalled it' },
    { friendly: 4, smscore: 5, label: 'easy', desc: 'instant' }
];

const state = {
    manifest: null, shards: {}, route: 'home', currentSubject: null,
    cardSearch: '', cardSubjectFilter: 'all', flippedCards: new Set(),
    reviewSubjectFilter: 'all', reviewQueue: [], reviewQueueIds: [],
    reviewAgainPile: [], reviewAllCardIds: [], reviewIndex: 0,
    reviewRevealed: false, reviewSessionGraded: 0, reviewSessionStarted: 0,
    sessionFinished: false, searchPaletteApi: null
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

const ROUTES = ['today', 'subjects', 'review', 'cards', 'cases', 'stats', 'subject'];
const ROUTE_TITLES = { today: "today's plan", subjects: 'subjects', review: 'review',
    cards: 'cards', cases: 'cases', stats: 'stats', subject: 'subject' };
const ROUTE_ALIASES = { home: 'today', triage: 'cases' };
function setDocTitle(route, subject) {
    const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
    const main = subject ? cap(subject) : cap(ROUTE_TITLES[route] || route);
    document.title = `${main} · corpus`;
}
function go(route, subject) {
    if (ROUTE_ALIASES[route]) route = ROUTE_ALIASES[route];
    if (!ROUTES.includes(route)) route = 'today';
    state.route = route;
    if (subject !== undefined) state.currentSubject = subject;
    if (route === 'cards' && subject) state.cardSubjectFilter = subject;
    if (route === 'review' && subject) { state.reviewSubjectFilter = subject; resetReviewQueue(); }
    document.querySelectorAll('.navlink').forEach(a => a.classList.toggle('active', a.dataset.route === route));
    setDocTitle(route, subject);
    progress.setLast(route, subject);
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

function dueCountFor(subject) {
    const sh = state.shards[subject]; if (!sh) return 0;
    const ids = sh.cards.map(c => c.id);
    return srs.getDueCards(ids).length;
}

function totalDueAll() {
    let n = 0;
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject]; if (!sh) continue;
        n += srs.getDueCards(sh.cards.map(c => c.id)).length;
    }
    return n;
}

function updateFooter() {
    if (!statusbar || !statusbarMsg) return;
    if (!navigator.onLine) {
        statusbar.classList.remove('hidden');
        statusbarMsg.textContent = 'offline ready — your work is saved locally';
    } else {
        statusbar.classList.add('hidden');
    }
}

function render() {
    stage.innerHTML = '';
    if (!state.manifest) { stage.append(el('div', { class: 'loading' }, 'loading…')); return; }
    const r = state.route;
    const fns = { today: renderToday, subjects: renderSubjects, cards: renderCards,
        review: renderReview, cases: renderTriage, stats: renderStats, subject: renderSubject };
    (fns[r] || renderToday)();
    updateFooter();
}

function chipStat(num, lbl) {
    return el('div', { class: 'stat-chip' }, el('div', { class: 'num' }, num), el('div', { class: 'lbl' }, lbl));
}

function isFirstVisit() {
    try { return !localStorage.getItem('corpus.progress.v1') && !localStorage.getItem('corpus.guide.v1') && !localStorage.getItem('corpus.srs.states'); }
    catch { return false; }
}

function buildSubjectGrid() {
    const grid = el('div', { class: 'subject-grid' });
    for (const s of state.manifest.subjects) {
        const due = dueCountFor(s.subject);
        const m = masteryFor(s.subject);
        const card = el('div', {
            class: `subject-card rail-${s.cat}`,
            'role': 'button', 'tabindex': '0',
            'aria-label': `open ${s.subject}, ${due} cards due, ${m}% mastered`,
            data: { cat: s.cat, subject: s.subject, rating: s.rating },
            on: { click: () => go('subject', s.subject),
                  keydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('subject', s.subject); } } }
        },
            el('div', { class: 'name' }, s.subject),
            el('div', { class: 'tagline' }, `${s.cardCount} cards · ${s.scenarioCount} cases`),
            el('div', { class: 'mastery-row' },
                el('div', { class: 'mastery-bar' }, el('div', { class: 'mastery-fill', style: `width:${m}%` })),
                el('span', { class: 'mastery-pct' }, `${m}%`)
            ),
            el('div', { class: 'subject-meta' },
                due ? el('span', { class: 'due-badge' }, `${due} due`) : el('span', { class: 'all-clear' }, 'no due cards'),
                DEBUG ? el('span', { class: 'mono', style: 'font-size:10px;color:var(--panel-text-3)' }, `${s.atomCount} atoms`) : null
            )
        );
        grid.append(card);
    }
    return grid;
}

function renderSubjects() {
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, '8 subjects'), el('h2', {}, 'pick a subject')));
    stage.append(buildSubjectGrid());
}

function renderToday() {
    const p = progress.load();
    const due = totalDueAll();
    const last = p.lastSubject;
    const goalPct = Math.min(100, Math.round(p.todayGraded / p.dailyGoal * 100));

    if (isFirstVisit()) {
        stage.append(el('div', { class: 'panel rail-mascot onboarding', id: 'onboarding' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'welcome'), 'first time here'),
            el('p', {}, "this is your medical study workspace. pick a subject below to start, or press Ctrl+K to search across cards, cases, and guide sections. your progress lives in this browser — no account needed.")));
    }

    const lastCTA = last ? el('a', { class: 'cta cta-primary', href: `#subject/${last}`,
        on: { click: e => { e.preventDefault(); go('subject', last); } } },
        el('div', { class: 'cta-label' }, 'continue where you left off'),
        el('div', { class: 'cta-sub' }, last)) : null;

    stage.append(el('section', { class: 'hero' },
        el('h1', {}, 'your medical study ', el('em', {}, 'workspace')),
        el('p', { class: 'lede' }, 'flashcards, cases, and study guides for eight subjects. pick up where you left off, review what is due, or work through a case.'),
        el('div', { class: 'hero-stats' },
            chipStat(p.streak, p.streak === 1 ? 'day streak' : 'day streak'),
            chipStat(`${p.todayGraded}/${p.dailyGoal}`, 'cards today'),
            chipStat(due, 'cards due now'),
            chipStat(p.todayCases, 'cases today')
        ),
        el('div', { class: 'cta-row' },
            lastCTA,
            el('a', { class: 'cta cta-primary', href: '#review',
                on: { click: e => { e.preventDefault(); go('review'); } } },
                el('div', { class: 'cta-label' }, due ? `review ${due} due cards` : 'review cards'),
                el('div', { class: 'cta-sub' }, 'spaced repetition')),
            el('a', { class: 'cta', href: './triage-live.html' },
                el('div', { class: 'cta-label' }, 'start a case'),
                el('div', { class: 'cta-sub' }, 'work a clinical scenario with the live tutor'))
        )
    ));

    // Daily-goal progress
    stage.append(el('div', { class: 'panel rail-green' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, p.streak > 0 ? `streak ${p.streak} day${p.streak === 1 ? '' : 's'}` : 'start your streak today'),
            `${p.todayGraded} of ${p.dailyGoal} cards today`),
        el('div', { class: 'progress-bar' }, el('div', { class: 'progress-fill', style: `width:${goalPct}%` })),
        el('div', { class: 'toolbar', style: 'margin-top:14px' },
            el('label', { for: 'goal-input' }, 'daily goal:'),
            el('input', {
                id: 'goal-input', type: 'number', min: '1', max: '500', value: String(p.dailyGoal),
                'aria-label': 'daily goal', class: 'search', style: 'max-width:120px',
                on: { change: e => { progress.setGoal(parseInt(e.target.value, 10) || 30); render(); } }
            })
        )
    ));

    // Recommended cases
    const recs = [];
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject];
        if (!sh?.triage?.scenarios?.length) continue;
        const sc = sh.triage.scenarios[Math.floor(Math.random() * sh.triage.scenarios.length)];
        recs.push({ meta, sc });
        if (recs.length >= 3) break;
    }
    if (recs.length) {
        stage.append(el('div', { class: 'panel rail-mascot' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'cases to try today'), 'pick one and work it'),
            ...recs.map(({ meta, sc }) => el('div', { class: 'row' },
                el('span', { class: 'code' }, '◆'),
                el('div', {}, el('div', { class: 'title' }, sc.name), el('div', { class: 'meta' }, meta.subject)),
                el('a', { class: 'chip', href: `./triage-live.html#${encodeURIComponent(sc.id || sc.name)}` }, 'work it')
            ))));
    }

    // Subjects
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'pick a subject'),
        el('h2', {}, 'subjects')
    ));
    stage.append(buildSubjectGrid());

    // Recap
    if (p.history && p.history.length) {
        const recent = p.history.slice(-5).reverse();
        stage.append(el('div', { class: 'panel' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'recent days'), 'cards graded · cases'),
            ...recent.map(d => el('div', { class: 'row' },
                el('span', { class: 'code' }, d.date.slice(5)),
                el('div', {}, el('div', { class: 'title' }, `${d.graded} cards · ${d.cases} cases`)),
                el('span', { class: 'meta' }, '')
            ))));
    }

    if (DEBUG) {
        stage.append(el('div', { class: 'section-head' }, el('span', { class: 'eyebrow' }, 'debug · rail legend'), el('h2', {}, 'coverage rails')));
        for (const [name, txt] of [['rail-green', 'guide ≥ 50KB · cards ≥ 10 · scenarios ≥ 3'],
            ['rail-sun', 'partial — 2 of 3 thresholds met'], ['rail-flame', 'stub — under-built']]) {
            stage.append(el('div', { class: 'panel ' + name }, el('div', { class: 'panel-head' }, el('span', { class: 'title' }, name), txt)));
        }
    }
}

async function renderSubject() {
    const subj = state.currentSubject;
    if (!subj) { go('subjects'); return; }
    const meta = state.manifest.subjects.find(x => x.subject === subj);
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'subject'), el('h2', {style:'text-transform:capitalize'}, subj)));
    const placeholder = el('div', { class: 'loading' }, 'loading…');
    stage.append(placeholder);
    const shard = await loadShard(subj);
    placeholder.remove();

    const due = srs.getDueCards(shard.cards.map(c => c.id)).length;
    const m = masteryFor(subj);
    const ticks = loadGuideTicks()[subj] || {};

    const left = el('aside', { class: 'deepdive-side' },
        el('div', { class: 'panel rail-' + (meta?.cat || 'green') },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'this subject'), `${m}% mastered`),
            el('div', { class: 'progress-bar' }, el('div', { class: 'progress-fill', style: `width:${m}%` })),
            el('div', { style: 'margin-top:10px' }, `${shard.cards.length} cards · ${due} due`),
            el('div', {}, `${shard.triage?.scenarioCount || 0} cases`),
            DEBUG ? el('div', { class: 'mono', style: 'font-size:11px;color:var(--panel-text-3);margin-top:6px' },
                `${shard.audio.length} lectures · ${shard.books.length} book sections · rating ${meta?.rating}`) : null
        ),
        el('div', { class: 'panel' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'study guide'), 'tick what you understand'),
            ...(shard.guide?.sections || []).slice(0, 50).map(s => {
                const lineKey = String(s.line);
                const checked = !!ticks[lineKey];
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
                            render();
                        } }
                    }),
                    el('span', {}, s.title)
                );
                return row;
            })
        )
    );

    const guideBodyPanel = shard.guide?.body ? el('div', { class: 'panel guide-body-panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'study guide — full text'), `${shard.guide.lines} lines`),
        el('div', { class: 'guide-body markdown', html: renderMarkdown(shard.guide.body) })
    ) : null;
    const cardsPanel = el('div', { class: 'panel rail-' + (meta?.cat || 'green') },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'flashcards'), `${shard.cards.length} total · click to flip`),
        ...shard.cards.slice(0, 20).map(c => buildFlashcard(c, meta?.cat || 'green'))
    );
    if (shard.cards.length > 20) {
        cardsPanel.append(el('div', { class: 'panel-head', style: 'margin-top:16px' },
            el('a', { href: '#cards', class: 'chip', on: { click: e => { e.preventDefault(); state.cardSubjectFilter = subj; go('cards'); } } }, `see all ${shard.cards.length} →`)));
    }

    const triagePanel = shard.triage && shard.triage.scenarios.length ? el('div', { class: 'panel rail-' + (meta?.cat || 'green') },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'cases'), `${shard.triage.scenarios.length}`),
        ...shard.triage.scenarios.slice(0, 8).map(sc => el('div', { class: 'row' },
            el('span', { class: 'code' }, '◆'),
            el('div', {}, el('div', { class: 'title' }, sc.name), el('div', { class: 'meta' }, sc.description || '')),
            el('a', { class: 'chip', href: `./triage-live.html#${encodeURIComponent(sc.id || sc.name)}` }, 'work it')
        ))) : null;

    const right = el('div', {}, guideBodyPanel, cardsPanel, triagePanel);
    const wrap = el('div', { class: 'deepdive', data: { cat: meta?.cat || 'green' } }, left, right);
    stage.append(wrap);
}

function renderMarkdown(md) {
    if (!md) return '';
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = md.split('\n');
    const out = [];
    let inList = false, inCode = false, para = [];
    const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
    const flushList = () => { if (inList) { out.push('</ul>'); inList = false; } };
    function inline(s) {
        s = esc(s);
        s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
        s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        return s;
    }
    function slug(t) { return t.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, ''); }
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^```/.test(line)) { flushPara(); flushList(); inCode = !inCode; out.push(inCode ? '<pre><code>' : '</code></pre>'); continue; }
        if (inCode) { out.push(esc(line)); continue; }
        const h = line.match(/^(#{1,6})\s+(.+)$/);
        if (h) { flushPara(); flushList(); const id = `g-${slug(h[2])}-${i}`; out.push(`<h${h[1].length} id="${id}">${inline(h[2])}</h${h[1].length}>`); continue; }
        const li = line.match(/^[-*]\s+(.+)$/);
        if (li) { flushPara(); if (!inList) { out.push('<ul>'); inList = true; } out.push('<li>' + inline(li[1]) + '</li>'); continue; }
        if (line.trim() === '') { flushPara(); flushList(); continue; }
        para.push(line);
    }
    flushPara(); flushList(); if (inCode) out.push('</code></pre>');
    return out.join('\n');
}

function buildFlashcard(c, cat) {
    const id = c.id;
    const card = el('div', {
        class: `flashcard rail-${cat}`,
        'role': 'button', 'tabindex': '0', 'aria-label': `flashcard: ${c.front?.slice(0, 60) || ''}`,
        data: { cardId: id },
        on: {
            click: () => { if (state.flippedCards.has(id)) state.flippedCards.delete(id); else state.flippedCards.add(id); card.classList.toggle('flipped'); },
            keydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } }
        }
    },
        DEBUG ? el('div', { class: 'meta-line' }, el('span', {}, c.id || ''), el('span', {}, c.difficulty || 'medium')) : null,
        el('div', { class: 'front' }, c.front),
        el('div', { class: 'flip-hint' }, 'click to flip'),
        el('div', { class: 'back' }, c.back || ''),
        c.tags && c.tags.length ? el('div', { class: 'tags' }, ...c.tags.slice(0, 6).map(t => el('span', { class: 'tag' }, t))) : null
    );
    if (state.flippedCards.has(id)) card.classList.add('flipped');
    return card;
}

async function renderCards() {
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'flashcards'), el('h2', {}, 'card explorer')));
    const search = el('input', {
        class: 'search', type: 'text', placeholder: 'search front + back…', value: state.cardSearch,
        'aria-label': 'search cards',
        on: { input: e => { state.cardSearch = e.target.value; renderCardList(); } }
    });
    const chips = el('div', { class: 'filter-chips', role: 'group', 'aria-label': 'subject filter' },
        el('button', { class: 'chip' + (state.cardSubjectFilter === 'all' ? ' active' : ''),
            on: { click: () => { state.cardSubjectFilter = 'all'; renderCardList(); } } }, 'all'),
        ...state.manifest.subjects.map(s => el('button', {
            class: 'chip' + (state.cardSubjectFilter === s.subject ? ' active' : ''),
            on: { click: () => { state.cardSubjectFilter = s.subject; renderCardList(); } } }, s.subject))
    );
    stage.append(el('div', { class: 'toolbar' }, search, chips));
    const list = el('div', { id: 'cards-list', class: 'panel' });
    stage.append(list);

    const subjects = state.cardSubjectFilter === 'all' ? state.manifest.subjects.map(s => s.subject) : [state.cardSubjectFilter];
    await Promise.all(subjects.map(s => loadShard(s)));
    renderCardList();
}

function renderCardList() {
    const list = document.getElementById('cards-list');
    if (!list) return;
    list.innerHTML = '';
    const subjects = state.cardSubjectFilter === 'all' ? state.manifest.subjects.map(s => s.subject) : [state.cardSubjectFilter];
    let all = [];
    for (const s of subjects) {
        const sh = state.shards[s]; if (!sh) continue;
        const meta = state.manifest.subjects.find(x => x.subject === s);
        for (const c of sh.cards) all.push({ ...c, _subject: s, _cat: meta?.cat });
    }
    const q = state.cardSearch.trim().toLowerCase();
    if (q) all = all.filter(c => (c.front + ' ' + (c.back || '')).toLowerCase().includes(q));
    const cap = state.cardsShowAll ? all.length : 100;
    const clipped = all.length > cap;
    list.append(el('div', { class: 'panel-head' },
        el('span', { class: 'title' }, `${all.length} cards`),
        q ? `matching "${q}"` : (clipped ? `showing first ${cap} of ${all.length} — refine search to narrow` : 'all shown')));
    if (clipped && all.length < 1000) {
        list.append(el('div', { class: 'toolbar', style: 'margin-bottom:8px' },
            el('button', { class: 'chip', 'aria-label': 'show all matching cards',
                on: { click: () => { state.cardsShowAll = true; renderCardList(); } } }, `load all ${all.length}`)));
    }
    if (all.length === 0) {
        list.append(el('div', { class: 'empty-state' },
            el('div', { class: 'empty-title' }, 'no cards match'),
            el('div', { class: 'empty-sub' }, q ? `nothing matches "${q}". try a different query, or clear the filter.` : 'no cards available for this filter.'),
            el('button', { class: 'chip', on: { click: () => { state.cardSearch = ''; state.cardSubjectFilter = 'all';
                const inp = document.querySelector('.search'); if (inp) inp.value = ''; renderCardList(); } } }, 'clear filter')));
    }
    for (const c of all.slice(0, cap)) list.append(buildFlashcard(c, c._cat || 'green'));
    state.lastFilteredCount = all.length;
}

async function renderTriage() {
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'cases'), el('h2', {}, 'work a case')));
    const placeholder = el('div', { class: 'loading' }, 'loading…');
    stage.append(placeholder);
    await loadAllShards();
    placeholder.remove();
    stage.append(el('div', { class: 'panel rail-mascot' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'live tutor mode'), 'recommended'),
        el('div', {}, "open the live tutor to work a case with an in-browser study assistant — supply differentials, plan, investigations, then submit for grading."),
        el('a', { class: 'cta cta-primary', href: './triage-live.html' }, el('div', { class: 'cta-label' }, 'open live tutor'))));
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject];
        if (!sh.triage || !sh.triage.scenarios.length) continue;
        for (const sc of sh.triage.scenarios) stage.append(buildTriageWidget(meta, sh, sc));
    }
}

function buildTriageWidget(meta, shard, sc) {
    const params = sc.parameters && typeof sc.parameters === 'object' && !Array.isArray(sc.parameters) ? sc.parameters : {};
    const inputs = {};
    const wrap = el('div', { class: `triage-scenario rail-${meta.cat}` });
    wrap.style.boxShadow = `inset 4px 0 0 var(--${meta.cat})`;
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
        out.append(el('div', {}, example.reasoning || 'apply key topics in order: confirm diagnosis → classify severity → first-line therapy → reassess.'));
        out.append(el('div', { class: 'eyebrow', style: 'margin-top:10px' }, 'recommendation'));
        out.append(el('div', {}, example.recommendation || 'Standard guideline-directed management.'));
        out.style.display = 'block';
    } } }, 'run case');
    wrap.append(btn, out);
    return wrap;
}

async function renderReview() {
    stage.innerHTML = '';
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'review'), el('h2', {}, 'review your cards')));
    const placeholder = el('div', { class: 'loading' }, 'loading…');
    stage.append(placeholder);
    const subjects = state.reviewSubjectFilter === 'all' ? state.manifest.subjects.map(s => s.subject) : [state.reviewSubjectFilter];
    await Promise.all(subjects.map(s => loadShard(s)));
    placeholder.remove();

    const allCards = [];
    for (const s of subjects) {
        const sh = state.shards[s]; if (!sh) continue;
        const meta = state.manifest.subjects.find(x => x.subject === s);
        for (const c of sh.cards) allCards.push({ ...c, _subject: s, _cat: meta?.cat || 'green' });
    }
    const cardIds = allCards.map(c => c.id);
    state.reviewAllCardIds = cardIds;

    if (!state.reviewQueueIds || state.reviewQueueIds.length === 0) {
        const states = srs.loadStates();
        const dueIds = srs.getDueCards(cardIds, states);
        const cardById = Object.fromEntries(allCards.map(c => [c.id, c]));
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
    const progressPct = Math.min(100, Math.round(state.reviewSessionGraded / goal * 100));

    const chips = el('div', { class: 'filter-chips', role: 'group', 'aria-label': 'subject filter' },
        el('button', { class: 'chip' + (state.reviewSubjectFilter === 'all' ? ' active' : ''),
            on: { click: () => { state.reviewSubjectFilter = 'all'; resetReviewQueue(); renderReview(); } } }, 'all'),
        ...state.manifest.subjects.map(s => el('button', { class: 'chip' + (state.reviewSubjectFilter === s.subject ? ' active' : ''),
            on: { click: () => { state.reviewSubjectFilter = s.subject; resetReviewQueue(); renderReview(); } } }, s.subject))
    );
    const head = el('div', { class: 'panel rail-green' },
        el('div', { class: 'panel-head' },
            el('span', { class: 'title' }, `streak ${p.streak}`),
            `${p.todayGraded}/${goal} today · ${total} due${state.reviewAgainPile.length ? ` · ${state.reviewAgainPile.length} to revisit` : ''}`),
        el('div', { class: 'progress-bar' }, el('div', { class: 'progress-fill', style: `width:${progressPct}%` }))
    );
    stage.append(el('div', { class: 'toolbar' }, chips), head);

    if (state.reviewQueue.length === 0) {
        if (state.reviewAgainPile.length > 0) {
            state.reviewQueueIds = state.reviewAgainPile;
            state.reviewAgainPile = []; state.reviewIndex = 0;
            renderReview(); return;
        }
        // End-of-session summary
        const reviewed = state.reviewSessionGraded;
        const started = state.reviewSessionStarted;
        if (reviewed > 0 && !state.sessionFinished) {
            state.sessionFinished = true;
            stage.append(el('div', { class: 'panel rail-green' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'session complete'), 'great work'),
                el('p', {}, `you reviewed ${reviewed} card${reviewed === 1 ? '' : 's'}. streak now ${p.streak}.`),
                el('div', { class: 'cta-row' },
                    el('a', { class: 'chip', href: '#today', on: { click: e => { e.preventDefault(); go('today'); } } }, 'back to today'),
                    el('a', { class: 'chip', href: '#review', on: { click: e => { e.preventDefault(); state.reviewSessionGraded = 0; state.sessionFinished = false; renderReview(); } } }, 'review more')
                )));
        } else {
            stage.append(el('div', { class: 'panel rail-sky' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'all caught up'), 'no cards due'),
                el('div', {}, 'every scheduled card is in the future. add new cards by browsing a subject, or wait for tomorrow.')));
        }
        return;
    }

    const card = state.reviewQueue[state.reviewIndex];
    const cardState = srs.getCardState(card.id);
    const seen = (cardState.history || []).length;
    const friendlyMeta = seen === 0 ? 'new' : (seen < 3 ? `seen ${seen}×` : 'familiar');
    const reviewCard = el('div', {
        class: `flashcard rail-${card._cat}` + (state.reviewRevealed ? ' flipped' : ''), id: 'review-card'
    },
        el('div', { class: 'meta-line' },
            el('span', {}, `${card._subject} · ${state.reviewIndex + 1}/${total}`),
            el('span', {}, friendlyMeta),
            DEBUG ? el('span', {}, `EF ${cardState.easeFactor.toFixed(2)} · ${cardState.phase} · ${cardState.interval}d`) : null
        ),
        el('div', { class: 'front' }, card.front),
        el('div', { class: 'back' }, card.back || ''),
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
    }
    stage.append(actions);
    const hint = DEBUG
        ? 'space=reveal · 0-5=grade · s=skip · 0 sends to revisit pile'
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
    srs.updateCard(cardId, score, state.reviewAllCardIds || []);
    state.reviewSessionGraded++;
    progress.bumpGraded(1);
    if (score === 0) state.reviewAgainPile.push(cardId);
    state.reviewQueueIds.splice(state.reviewIndex, 1);
    if (state.reviewIndex >= state.reviewQueueIds.length) state.reviewIndex = 0;
    state.reviewRevealed = false;
    renderReview();
}

document.addEventListener('keydown', e => {
    if (state.route !== 'review') return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (!state.reviewRevealed && state.reviewQueue?.length) { state.reviewRevealed = true; renderReview(); }
    } else if (e.key === 's' || e.key === 'S') {
        if (state.reviewQueue?.length) { e.preventDefault(); skipReview(); }
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

function renderStats() {
    const m = state.manifest;
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'stats'), el('h2', {}, 'how you are doing')));
    renderHealthBands();
    if (DEBUG) renderDebugStats(m);
}

async function renderHealthBands() {
    await loadAllShards();
    const cardIds = [];
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject]; if (!sh) continue;
        for (const c of sh.cards) cardIds.push(c.id);
    }
    const states = srs.loadStates();
    const stats = srs.getScheduleStats(cardIds, states);
    const forecast = srs.getForecast(cardIds, 14, states);
    const p = progress.load();

    // Health bands
    let healthy = 0, attention = 0, untouched = 0;
    for (const id of cardIds) {
        const s = states[id];
        if (!s) { untouched++; continue; }
        const goodScore = (s.lastScore ?? 0) >= 4;
        const noLeech = !s.isLeech && (s.lapses || 0) < 3;
        if (goodScore && noLeech) healthy++; else attention++;
    }

    stage.append(el('div', { class: 'panel rail-green' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'your study health'), 'across all subjects'),
        el('div', { class: 'hero-stats' },
            chipStat(p.streak, 'day streak'),
            chipStat(stats.scheduled, 'cards started'),
            chipStat(healthy, 'healthy'),
            chipStat(attention, 'needs attention'),
            chipStat(untouched, 'not yet seen'),
            chipStat(stats.due, 'due now')
        )));

    const maxF = Math.max(1, ...forecast.map(b => b.count));
    const forecastEl = el('div', { class: 'forecast' },
        ...forecast.map(b => el('div', { class: 'forecast-day', title: `${b.date}: ${b.count}` },
            el('div', { class: 'forecast-bar', style: `height:${Math.round(b.count / maxF * 60) + 2}px` }),
            el('div', { class: 'forecast-label' }, String(b.day))
        )));
    stage.append(el('div', { class: 'panel rail-purple' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'reviews coming up'), '14-day forecast'),
        forecastEl));

    // Per-subject student bands
    stage.append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'per subject')),
        ...state.manifest.subjects.map(s => {
            const m = masteryFor(s.subject);
            const due = dueCountFor(s.subject);
            return el('div', { class: 'row' },
                el('span', { class: 'code' }, s.subject.slice(0, 4)),
                el('div', {}, el('div', { class: 'title' }, s.subject),
                    el('div', { class: 'meta' }, `${m}% understood · ${due} due · ${s.cardCount} cards`)),
                el('span', { class: 'meta' }, due > 0 ? 'review' : (m >= 70 ? 'healthy' : 'in progress'))
            );
        })));

    const cfg = srs.loadConfig();
    const examInput = el('input', { type: 'date', value: cfg.examDate, class: 'search', style: 'max-width:200px',
        'aria-label': 'exam date',
        on: { change: e => { srs.saveConfig({ ...cfg, examDate: e.target.value }); render(); } } });
    const exportBtn = el('button', { class: 'chip', 'aria-label': 'export your data',
        on: { click: () => {
            const blob = new Blob([srs.exportState()], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `corpus-srs-${srs.today()}.json`; a.click(); URL.revokeObjectURL(a.href);
        } } }, 'export your data');
    const importInput = el('input', { type: 'file', accept: '.json', style: 'display:none',
        on: { change: async e => {
            const f = e.target.files?.[0]; if (!f) return;
            const text = await f.text();
            try { const n = srs.importState(text); alert(`imported ${n} cards`); render(); }
            catch (err) { alert('import failed: ' + err.message); }
        } } });
    const importBtn = el('button', { class: 'chip', 'aria-label': 'import data',
        on: { click: () => importInput.click() } }, 'import data');
    const resetBtn = el('button', { class: 'chip', 'aria-label': 'reset progress',
        on: { click: () => { if (confirm('Reset all review progress?')) { srs.resetAll(); state.reviewSessionGraded = 0; render(); } } } }, 'reset progress');
    stage.append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'settings')),
        el('div', { class: 'toolbar' },
            el('label', { for: 'exam-date' }, 'exam date:'), examInput, exportBtn, importBtn, importInput, resetBtn)));
}

function renderDebugStats(m) {
    const cardIds = [];
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject]; if (!sh) continue;
        for (const c of sh.cards) cardIds.push(c.id);
    }
    const stats = srs.getScheduleStats(cardIds);
    const days = srs.daysUntilExam();
    const eff = srs.effectiveDays();
    stage.append(el('div', { class: 'panel rail-flame', id: 'srs-stats' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'debug · raw scheduler'),
            `schema v${srs.SCHEMA_VERSION || 1} · localStorage corpus.srs.states`),
        el('div', { class: 'hero-stats' },
            chipStat(stats.total, 'total cards'),
            chipStat(stats.new, 'new'),
            chipStat(stats.learning, 'learning'),
            chipStat(stats.young, 'young (<21d)'),
            chipStat(stats.mature, 'mature (≥21d)'),
            chipStat(stats.leech, 'leeches'),
            chipStat(stats.avgEaseFactor.toFixed(2), 'avg EF'),
            chipStat(stats.avgLastScore.toFixed(2), 'avg last score'),
            chipStat(days, 'days to exam'),
            chipStat(eff, 'effective days'),
            chipStat(m.totals.atoms, 'atoms'),
            chipStat(m.totals.scenarios, 'scenarios')
        )));
}

function mountTopbar() {
    const nav = document.querySelector('.nav');
    nav.innerHTML = '';
    const links = [['today', 'today'], ['subjects', 'subjects'],
        ['review', 'review'], ['cards', 'cards'], ['cases', 'cases'], ['stats', 'stats']];
    for (const [route, label] of links) {
        nav.append(el('a', { href: `#${route}`, class: 'navlink', data: { route },
            on: { click: e => { e.preventDefault(); go(route); } } }, label));
    }
    nav.append(el('a', { href: './triage-live.html', class: 'navlink nav-cta' }, 'live tutor'));
    const right = document.querySelector('header.topbar .status');
    const searchBtn = el('button', { class: 'chip search-btn', 'aria-label': 'open search (Ctrl+K)', title: 'search (Ctrl+K)',
        on: { click: () => state.searchPaletteApi?.open() } }, 'search ⌘K');
    right.parentElement.insertBefore(searchBtn, right);
    right.parentElement.insertBefore(makeToggleButton(document), right);
}

function mountSearchPalette() {
    state.searchPaletteApi = mountPalette(document, '#search-palette',
        () => {
            const idx = buildSearchIndex(state.manifest, state.shards);
            return idx;
        },
        (item) => {
            if (item.kind === 'card') { state.cardSearch = item.title.slice(0, 40); state.cardSubjectFilter = item.subject; go('cards'); }
            else if (item.kind === 'case') { location.href = `./triage-live.html#${encodeURIComponent(item.id)}`; }
            else if (item.kind === 'section') { go('subject', item.subject); }
        });
}

function updateOnlineStatus() {
    const dot = document.querySelector('.status .dot');
    const lbl = document.getElementById('status-label');
    if (!dot || !lbl) return;
    dot.classList.remove('loading');
    if (navigator.onLine) { dot.classList.remove('offline'); dot.classList.add('live'); lbl.textContent = 'ready'; }
    else { dot.classList.remove('live'); dot.classList.add('offline'); lbl.textContent = 'offline ready'; }
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
        registerSW();
        updateOnlineStatus();
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        const hash = location.hash.replace('#', '') || 'today';
        const [route, sub] = hash.split('/');
        go(route, sub);
        log('ready', { subjects: state.manifest.subjects.length });
    } catch (e) {
        stage.innerHTML = '';
        stage.append(el('div', { class: 'panel rail-flame error-state' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'failed to load'), 'try refresh'),
            el('div', {}, e.message),
            el('button', { class: 'chip', on: { click: () => location.reload() } }, 'retry')));
        warn('boot error', e);
    }
})();

window.addEventListener('hashchange', () => {
    const hash = location.hash.replace('#', '') || 'today';
    const [route, sub] = hash.split('/');
    go(route, sub);
});
