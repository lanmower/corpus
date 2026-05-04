// corpus observability — vanilla ESM, no bundler.
import * as srs from './srs.js';
const stage = document.getElementById('stage');
const crumb = document.getElementById('crumb');
const footerStats = document.getElementById('footer-stats');

const state = {
    manifest: null,
    shards: {},
    route: 'overview',
    currentSubject: null,
    cardSearch: '',
    cardSubjectFilter: 'all',
    flippedCards: new Set(),
    reviewSubjectFilter: 'all',
    reviewQueue: [],
    reviewIndex: 0,
    reviewRevealed: false,
    reviewSessionGraded: 0
};
window.__corpus = state;

async function fetchJson(p) {
    const r = await fetch(p);
    if (!r.ok) throw new Error(`${p}: ${r.status}`);
    return r.json();
}

async function loadManifest() {
    state.manifest = await fetchJson('./data/manifest.json');
    state.stats = state.manifest.totals;
    state.stats.totalCards = state.manifest.totals.cards;
    footerStats.textContent = `${state.manifest.totals.cards} cards · ${state.manifest.totals.atoms} atoms · ${state.manifest.totals.scenarios} scenarios`;
}

async function loadShard(subject) {
    if (state.shards[subject]) return state.shards[subject];
    const s = await fetchJson(`./data/${subject}.json`);
    state.shards[subject] = s;
    return s;
}

function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') e.className = v;
        else if (k === 'on') for (const [evt, h] of Object.entries(v)) e.addEventListener(evt, h);
        else if (k === 'data') for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
        else if (k === 'html') e.innerHTML = v;
        else e.setAttribute(k, v);
    }
    for (const c of children) {
        if (c == null) continue;
        if (Array.isArray(c)) for (const cc of c) e.append(cc instanceof Node ? cc : document.createTextNode(String(cc)));
        else e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return e;
}

function go(route, subject) {
    state.route = route;
    if (subject !== undefined) state.currentSubject = subject;
    document.querySelectorAll('.navlink').forEach(a => a.classList.toggle('active', a.dataset.route === route));
    crumb.textContent = subject ? `${route} › ${subject}` : route;
    render();
}

document.querySelectorAll('.navlink').forEach(a => {
    a.addEventListener('click', e => {
        e.preventDefault();
        go(a.dataset.route);
    });
});

function render() {
    stage.innerHTML = '';
    if (!state.manifest) { stage.append(el('div', { class: 'loading' }, 'loading…')); return; }
    const r = state.route;
    if (r === 'overview') renderOverview();
    else if (r === 'subjects') renderSubjects();
    else if (r === 'cards') renderCards();
    else if (r === 'review') renderReview();
    else if (r === 'triage') renderTriage();
    else if (r === 'stats') renderStats();
    else if (r === 'deepdive') renderDeepdive();
}

function renderOverview() {
    const m = state.manifest;
    stage.append(el('section', { class: 'hero' },
        el('h1', {}, 'medical corpus, ', el('em', {}, 'observed')),
        el('p', { class: 'lede' }, 'every lecture, every flashcard, every triage scenario the corpus has produced — surfaced, searchable, and rated for completeness. eight subjects, one observatory.'),
        el('div', { class: 'hero-stats' },
            chipStat(m.totals.cards, 'flashcards'),
            chipStat(m.totals.atoms, 'reasoning atoms'),
            chipStat(m.totals.scenarios, 'triage scenarios'),
            chipStat(m.subjects.length, 'subjects'),
            chipStat(m.totals.audio, 'lectures'),
            chipStat(m.totals.books, 'book sections'),
            chipStat(Math.round(m.totals.guideChars / 1024) + 'KB', 'study guides')
        )
    ));

    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'label' }, '// subjects'),
        el('h2', {}, 'coverage by subject')
    ));
    stage.append(buildSubjectGrid());

    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'label' }, '// signals'),
        el('h2', {}, 'how to read the rails')
    ));
    stage.append(el('div', { class: 'panel rail-green' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'green rail'), 'guide ≥ 50KB · cards ≥ 10 · scenarios ≥ 3'),
        el('div', {}, 'subject is exam-ready — full transcripts, dense flashcard deck, multi-parameter triage scenarios.')
    ));
    stage.append(el('div', { class: 'panel rail-sun' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'sun rail'), 'partial — 2 of 3 thresholds met'),
        el('div', {}, 'usable for revision but missing one pillar; check the subject page for the gap.')
    ));
    stage.append(el('div', { class: 'panel rail-flame' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'flame rail'), 'stub — under-built'),
        el('div', {}, 'attention required. open the subject page to see what is missing.')
    ));
}

function chipStat(num, lbl) {
    return el('div', { class: 'stat-chip' },
        el('div', { class: 'num' }, num),
        el('div', { class: 'lbl' }, lbl)
    );
}

function buildSubjectGrid() {
    const grid = el('div', { class: 'subject-grid' });
    for (const s of state.manifest.subjects) {
        const score = ratingScore(s.rating);
        const card = el('div', {
            class: `subject-card rail-${s.cat}`,
            data: { cat: s.cat, subject: s.subject, rating: s.rating },
            on: { click: () => go('deepdive', s.subject) }
        },
            el('div', { class: 'name' }, s.subject),
            el('div', { class: 'tagline' }, `${s.cardCount} cards · ${s.scenarioCount} scenarios · ${s.audioCount} lectures`),
            el('div', { class: 'coverage-bar' },
                el('div', { class: `coverage-fill ${s.rating}`, style: `width: ${score}%;` })
            ),
            el('div', { class: 'metrics' },
                el('div', { class: 'm' }, el('span', {}, 'guide'), el('span', { class: 'num' }, Math.round(s.guideChars / 1024) + 'KB')),
                el('div', { class: 'm' }, el('span', {}, 'atoms'), el('span', { class: 'num' }, s.atomCount)),
                el('div', { class: 'm' }, el('span', {}, 'audio'), el('span', { class: 'num' }, s.audioCount)),
                el('div', { class: 'm' }, el('span', {}, 'books'), el('span', { class: 'num' }, s.bookCount))
            )
        );
        grid.append(card);
    }
    return grid;
}

function ratingScore(r) { return r === 'complete' ? 100 : (r === 'partial' ? 66 : 33); }

function renderSubjects() {
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'label' }, '// 8 subjects'),
        el('h2', {}, 'pick a subject to drill into')
    ));
    stage.append(buildSubjectGrid());
}

async function renderDeepdive() {
    const subj = state.currentSubject;
    if (!subj) { go('subjects'); return; }
    const meta = state.manifest.subjects.find(x => x.subject === subj);
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'label' }, `// ${subj}`),
        el('h2', {}, subj)
    ));
    const placeholder = el('div', { class: 'loading' }, 'loading shard…');
    stage.append(placeholder);
    const shard = await loadShard(subj);
    placeholder.remove();

    const left = el('aside', { class: 'deepdive-side' },
        el('div', { class: 'panel rail-' + (meta?.cat || 'green') },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'shard'), meta?.rating || ''),
            el('div', {}, `${shard.cards.length} cards`), el('br'),
            el('div', {}, `${shard.audio.length} lectures`), el('br'),
            el('div', {}, `${shard.books.length} book sections`), el('br'),
            el('div', {}, `${shard.triage?.scenarioCount || 0} triage scenarios`),
        ),
        el('div', { class: 'panel' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'sections'), 'study guide'),
            ...(shard.guide?.sections || []).slice(0, 30).map(s =>
                el('div', { class: `guide-section h${s.level}` }, s.title)
            )
        )
    );

    const cardsPanel = el('div', { class: 'panel rail-' + (meta?.cat || 'green') },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'flashcards'), `${shard.cards.length} total · click to flip`),
        ...shard.cards.slice(0, 20).map(c => buildFlashcard(c, meta?.cat || 'green'))
    );
    if (shard.cards.length > 20) {
        cardsPanel.append(el('div', { class: 'panel-head', style: 'margin-top:16px' },
            el('a', { href: '#cards', class: 'chip', on: { click: e => { e.preventDefault(); state.cardSubjectFilter = subj; go('cards'); } } }, `see all ${shard.cards.length} →`)
        ));
    }

    const triagePanel = shard.triage && shard.triage.scenarios.length ? el('div', { class: 'panel rail-' + (meta?.cat || 'green') },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'triage scenarios'), `${shard.triage.scenarios.length}`),
        ...shard.triage.scenarios.slice(0, 5).map(sc => el('div', { class: 'row' },
            el('span', { class: 'code' }, '◆'),
            el('div', {}, el('div', { class: 'title' }, sc.name), el('div', { class: 'meta' }, sc.description || '')),
            el('span', { class: 'meta' }, `${sc.atom_ids?.length || 0} atoms`)
        ))
    ) : null;

    const audioPanel = shard.audio.length ? el('div', { class: 'panel rail-sky' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'audio lectures'), `archived to /medbak`),
        ...shard.audio.map((a, i) => el('div', { class: 'row' },
            el('span', { class: 'code' }, String(i + 1).padStart(2, '0')),
            el('div', { class: 'title' }, a.name),
            el('span', { class: 'meta' }, Math.round(a.size / 1024) + 'KB')
        ))
    ) : null;

    const booksPanel = shard.books.length ? el('div', { class: 'panel rail-sky' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'book sections'), `archived to /medbak`),
        ...shard.books.slice(0, 30).map((b, i) => el('div', { class: 'row' },
            el('span', { class: 'code' }, String(i + 1).padStart(2, '0')),
            el('div', { class: 'title' }, b.name),
            el('span', { class: 'meta' }, Math.round(b.size / 1024) + 'KB')
        ))
    ) : null;

    const right = el('div', {}, cardsPanel, triagePanel, audioPanel, booksPanel);
    const wrap = el('div', { class: 'deepdive', data: { cat: meta?.cat || 'green' } }, left, right);
    stage.append(wrap);
}

function buildFlashcard(c, cat) {
    const id = c.id;
    const card = el('div', {
        class: `flashcard rail-${cat}`,
        data: { cardId: id },
        on: { click: () => {
            if (state.flippedCards.has(id)) state.flippedCards.delete(id); else state.flippedCards.add(id);
            card.classList.toggle('flipped');
        } }
    },
        el('div', { class: 'meta-line' }, el('span', {}, c.id || ''), el('span', {}, c.difficulty || 'medium')),
        el('div', { class: 'front' }, c.front),
        el('div', { class: 'back' }, c.back || ''),
        c.tags && c.tags.length ? el('div', { class: 'tags' }, ...c.tags.slice(0, 6).map(t => el('span', { class: 'tag' }, t))) : null
    );
    if (state.flippedCards.has(id)) card.classList.add('flipped');
    return card;
}

async function renderCards() {
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'label' }, '// flashcards'),
        el('h2', {}, 'card explorer')
    ));
    const search = el('input', {
        class: 'search', type: 'text', placeholder: 'search front + back…',
        value: state.cardSearch,
        on: { input: e => { state.cardSearch = e.target.value; renderCardList(); } }
    });
    const chips = el('div', { class: 'filter-chips' },
        el('button', {
            class: 'chip' + (state.cardSubjectFilter === 'all' ? ' active' : ''),
            on: { click: () => { state.cardSubjectFilter = 'all'; renderCardList(); } }
        }, 'all'),
        ...state.manifest.subjects.map(s => el('button', {
            class: 'chip' + (state.cardSubjectFilter === s.subject ? ' active' : ''),
            on: { click: () => { state.cardSubjectFilter = s.subject; renderCardList(); } }
        }, s.subject))
    );
    stage.append(el('div', { class: 'toolbar' }, search, chips));
    const list = el('div', { id: 'cards-list', class: 'panel' });
    stage.append(list);

    // Load all shards needed
    const subjects = state.cardSubjectFilter === 'all'
        ? state.manifest.subjects.map(s => s.subject)
        : [state.cardSubjectFilter];
    await Promise.all(subjects.map(s => loadShard(s)));
    renderCardList();
}

function renderCardList() {
    const list = document.getElementById('cards-list');
    if (!list) return;
    list.innerHTML = '';
    const subjects = state.cardSubjectFilter === 'all'
        ? state.manifest.subjects.map(s => s.subject)
        : [state.cardSubjectFilter];
    let all = [];
    for (const s of subjects) {
        const sh = state.shards[s];
        if (!sh) continue;
        const meta = state.manifest.subjects.find(x => x.subject === s);
        for (const c of sh.cards) all.push({ ...c, _subject: s, _cat: meta?.cat });
    }
    const q = state.cardSearch.trim().toLowerCase();
    if (q) all = all.filter(c => (c.front + ' ' + (c.back || '')).toLowerCase().includes(q));
    list.append(el('div', { class: 'panel-head' },
        el('span', { class: 'title' }, `${all.length} cards`),
        q ? `matching "${q}"` : 'showing first 100'
    ));
    for (const c of all.slice(0, 100)) {
        list.append(buildFlashcard(c, c._cat || 'green'));
    }
    // Make the count queryable from page.evaluate
    state.lastFilteredCount = all.length;
}

async function renderTriage() {
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'label' }, '// triage runner'),
        el('h2', {}, 'reason through scenarios')
    ));
    const placeholder = el('div', { class: 'loading' }, 'loading…');
    stage.append(placeholder);
    await Promise.all(state.manifest.subjects.map(s => loadShard(s.subject)));
    placeholder.remove();
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject];
        if (!sh.triage || !sh.triage.scenarios.length) continue;
        for (const sc of sh.triage.scenarios) {
            stage.append(buildTriageWidget(meta, sh, sc));
        }
    }
}

function buildTriageWidget(meta, shard, sc) {
    const params = sc.parameters && typeof sc.parameters === 'object' && !Array.isArray(sc.parameters) ? sc.parameters : {};
    const inputs = {};
    const wrap = el('div', { class: `triage-scenario` });
    wrap.classList.add(`rail-${meta.cat}`);
    wrap.style.boxShadow = `inset 4px 0 0 var(--${meta.cat})`;
    wrap.append(el('div', { class: 'panel-head' }, el('span', { class: 'title' }, sc.name), meta.subject));
    wrap.append(el('div', { class: 'description' }, sc.description || ''));
    for (const [k, v] of Object.entries(params)) {
        const desc = String(v);
        const opts = desc.split('|').map(x => x.split('—')[0].trim()).filter(Boolean).slice(0, 6);
        const select = opts.length > 1 && opts.length < 8
            ? el('select', {}, ...opts.map(o => el('option', { value: o }, o)))
            : el('input', { type: 'text', placeholder: desc.slice(0, 40) });
        inputs[k] = select;
        wrap.append(el('div', { class: 'param-row' }, el('label', {}, k), select));
    }
    const out = el('div', { class: 'outcome', style: 'display:none' });
    const btn = el('button', {
        class: 'run-btn', on: { click: () => {
            const vals = {};
            for (const [k, e] of Object.entries(inputs)) vals[k] = e.value;
            const example = (sc.examples && sc.examples[0]) || {};
            out.innerHTML = '';
            out.append(el('div', { class: 'label' }, '// inputs'));
            out.append(el('pre', {}, JSON.stringify(vals, null, 2)));
            out.append(el('div', { class: 'label' }, '// reasoning'));
            out.append(el('div', {}, example.reasoning || 'apply atoms in order: confirm diagnosis → classify severity → first-line therapy → reassess at 48-72h.'));
            out.append(el('div', { class: 'label', style: 'margin-top:10px' }, '// recommendation'));
            out.append(el('div', {}, example.recommendation || 'Standard guideline-directed management.'));
            out.style.display = 'block';
        } }
    }, 'run scenario');
    wrap.append(btn, out);
    return wrap;
}

async function renderReview() {
    stage.innerHTML = '';
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'label' }, '// SRS review'),
        el('h2', {}, 'spaced repetition')
    ));
    const placeholder = el('div', { class: 'loading' }, 'loading shards…');
    stage.append(placeholder);
    const subjects = state.reviewSubjectFilter === 'all'
        ? state.manifest.subjects.map(s => s.subject)
        : [state.reviewSubjectFilter];
    await Promise.all(subjects.map(s => loadShard(s)));
    placeholder.remove();

    const allCards = [];
    for (const s of subjects) {
        const sh = state.shards[s];
        if (!sh) continue;
        const meta = state.manifest.subjects.find(x => x.subject === s);
        for (const c of sh.cards) allCards.push({ ...c, _subject: s, _cat: meta?.cat || 'green' });
    }
    const cardIds = allCards.map(c => c.id);
    const dueIds = new Set(srs.getDueCards(cardIds));
    state.reviewQueue = allCards.filter(c => dueIds.has(c.id));
    if (state.reviewIndex >= state.reviewQueue.length) state.reviewIndex = 0;

    const cfg = srs.loadConfig();
    const stats = srs.getScheduleStats(cardIds);
    const days = srs.daysUntilExam(cfg);

    const chips = el('div', { class: 'filter-chips' },
        el('button', {
            class: 'chip' + (state.reviewSubjectFilter === 'all' ? ' active' : ''),
            on: { click: () => { state.reviewSubjectFilter = 'all'; state.reviewIndex = 0; state.reviewRevealed = false; renderReview(); } }
        }, 'all'),
        ...state.manifest.subjects.map(s => el('button', {
            class: 'chip' + (state.reviewSubjectFilter === s.subject ? ' active' : ''),
            on: { click: () => { state.reviewSubjectFilter = s.subject; state.reviewIndex = 0; state.reviewRevealed = false; renderReview(); } }
        }, s.subject))
    );

    const head = el('div', { class: 'panel rail-green' },
        el('div', { class: 'panel-head' },
            el('span', { class: 'title' }, 'session'),
            `${state.reviewQueue.length} due · ${stats.scheduled} scheduled · exam in ${days}d · graded this session: ${state.reviewSessionGraded}`
        )
    );
    stage.append(el('div', { class: 'toolbar' }, chips), head);

    if (state.reviewQueue.length === 0) {
        stage.append(el('div', { class: 'panel rail-sky' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'all caught up'), 'no cards due'),
            el('div', {}, 'every scheduled card is in the future. add new cards to the queue by reviewing a subject in cards explorer, or wait for tomorrow.')
        ));
        return;
    }

    const card = state.reviewQueue[state.reviewIndex];
    const cardState = srs.getCardState(card.id);
    const reviewCard = el('div', {
        class: `flashcard rail-${card._cat}` + (state.reviewRevealed ? ' flipped' : '')
    },
        el('div', { class: 'meta-line' },
            el('span', {}, `${card._subject} · ${state.reviewIndex + 1}/${state.reviewQueue.length}`),
            el('span', {}, `EF ${cardState.easeFactor.toFixed(2)} · rep ${cardState.repetitions}`)
        ),
        el('div', { class: 'front' }, card.front),
        el('div', { class: 'back' }, card.back || ''),
        card.tags && card.tags.length ? el('div', { class: 'tags' }, ...card.tags.slice(0, 6).map(t => el('span', { class: 'tag' }, t))) : null
    );
    stage.append(reviewCard);

    const actions = el('div', { class: 'toolbar', id: 'review-actions' });
    if (!state.reviewRevealed) {
        actions.append(el('button', {
            class: 'chip active', id: 'review-reveal',
            on: { click: () => { state.reviewRevealed = true; renderReview(); } }
        }, 'reveal answer'));
    } else {
        const labels = ['0 blackout', '1 wrong', '2 hard wrong', '3 hard right', '4 good', '5 perfect'];
        for (let score = 0; score <= 5; score++) {
            actions.append(el('button', {
                class: 'chip', data: { score: String(score) }, id: `grade-${score}`,
                on: { click: () => gradeReview(card.id, score, cardIds) }
            }, labels[score]));
        }
        actions.append(el('button', {
            class: 'chip', id: 'review-skip',
            on: { click: () => { state.reviewIndex = (state.reviewIndex + 1) % state.reviewQueue.length; state.reviewRevealed = false; renderReview(); } }
        }, 'skip'));
    }
    stage.append(actions);

    state.lastReviewDueCount = state.reviewQueue.length;
}

function gradeReview(cardId, score, cardIds) {
    srs.updateCard(cardId, score, cardIds);
    state.reviewSessionGraded++;
    state.reviewQueue.splice(state.reviewIndex, 1);
    if (state.reviewIndex >= state.reviewQueue.length) state.reviewIndex = 0;
    state.reviewRevealed = false;
    renderReview();
}

function renderStats() {
    const m = state.manifest;
    stage.append(el('div', { class: 'section-head' },
        el('span', { class: 'label' }, '// observability'),
        el('h2', {}, 'corpus stats')
    ));
    stage.append(el('div', { class: 'panel rail-green' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'totals'), 'across all subjects'),
        el('div', { class: 'hero-stats' },
            chipStat(m.totals.cards, 'flashcards'),
            chipStat(m.totals.atoms, 'reasoning atoms'),
            chipStat(m.totals.scenarios, 'triage scenarios'),
            chipStat(m.totals.audio, 'audio lectures'),
            chipStat(m.totals.books, 'book sections'),
            chipStat(Math.round(m.totals.guideChars / 1024) + 'KB', 'guide volume')
        )
    ));
    const tbl = el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'per subject')),
        ...m.subjects.map(s => el('div', { class: `row`, data: { cat: s.cat } },
            el('span', { class: 'code' }, s.subject.slice(0, 4)),
            el('div', {},
                el('div', { class: 'title' }, s.subject + ' '),
                el('div', { class: 'meta' }, `${s.cardCount} cards · ${s.scenarioCount} scenarios · ${s.atomCount} atoms · ${s.audioCount} audio · ${s.bookCount} books`)
            ),
            el('span', { class: 'meta' }, s.rating)
        ))
    );
    stage.append(tbl);
    renderSrsStats();
}

async function renderSrsStats() {
    await Promise.all(state.manifest.subjects.map(s => loadShard(s.subject)));
    const cardIds = [];
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject];
        if (!sh) continue;
        for (const c of sh.cards) cardIds.push(c.id);
    }
    const stats = srs.getScheduleStats(cardIds);
    const cfg = srs.loadConfig();
    const days = srs.daysUntilExam(cfg);
    const eff = srs.effectiveDays(cfg);
    const examInput = el('input', {
        type: 'date', value: cfg.examDate, class: 'search', style: 'max-width:200px',
        on: { change: e => { srs.saveConfig({ ...cfg, examDate: e.target.value }); render(); } }
    });
    const resetBtn = el('button', {
        class: 'chip',
        on: { click: () => { if (confirm('Reset all SRS state?')) { srs.resetAll(); state.reviewSessionGraded = 0; render(); } } }
    }, 'reset SRS state');
    stage.append(el('div', { class: 'panel rail-purple', id: 'srs-stats' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'SRS scheduling'), `localStorage corpus.srs.states`),
        el('div', { class: 'hero-stats' },
            chipStat(stats.total, 'total cards'),
            chipStat(stats.scheduled, 'scheduled'),
            chipStat(stats.due, 'due today'),
            chipStat(stats.avgEaseFactor.toFixed(2), 'avg easeFactor'),
            chipStat(stats.avgLastScore.toFixed(2), 'avg last score'),
            chipStat(days, 'days to exam'),
            chipStat(eff, 'effective days')
        ),
        el('div', { class: 'toolbar', style: 'margin-top:12px' },
            el('label', { style: 'margin-right:8px' }, 'exam date:'), examInput, resetBtn
        )
    ));
}

(async () => {
    try {
        await loadManifest();
        // Hash-based init
        const hash = location.hash.replace('#', '') || 'overview';
        go(hash);
    } catch (e) {
        stage.innerHTML = '';
        stage.append(el('div', { class: 'panel rail-flame' }, 'failed to load: ' + e.message));
        console.error(e);
    }
})();

window.addEventListener('hashchange', () => {
    const r = location.hash.replace('#', '') || 'overview';
    go(r);
});
