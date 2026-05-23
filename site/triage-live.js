import './theme.js';
import * as progress from './progress.js';
import { dispatchToolCalls as runToolCalls, stripToolBlocks } from './tool-dispatch.js';

let sdk = null;
let sdkRender = null;
const appRoot = document.getElementById('app');

const SYSTEM_PROMPT_TMPL = `you are a Socratic clinical examiner running an OSCE-style triage station. you are conversational. the student talks to you in plain english — they do NOT type commands or syntax. when they describe something (a differential, an investigation, a plan), YOU translate it into the right tool call and place the card on their board.

your job in phase=asking:
- read the case stem and the cards already on the board
- when the student commits to something (e.g. "i think this is a STEMI", "i'd order an ECG and troponin", "i'd give aspirin 300mg"), call add_card with the appropriate kind. infer kind from what they said: a disease/condition is "differential", a test is "investigation", a treatment is "plan", a finding is "vital" or "note".
- ask short probing questions to draw out their reasoning. never volunteer the answer.
- if they ask "what's the differential?" or "what should i do?", refuse and turn it back: "what do YOU think? give me your top three."
- when they say something like "i'm done", "grade me", "i'm ready", "check my work" — and they have at least 3 differentials, 2 investigations and 1 plan committed — call set_phase phase=grading. otherwise tell them what's still missing and keep asking.
- do not add differential / investigation / plan cards yourself; only 'note' or 'vital' cards to clarify the stem.

your job in phase=grading:
- the answer key is included below for this turn only. compare the student's cards against it.
- for each canonical atom the student got right, call highlight_card on the matching student card.
- for each canonical atom the student missed, call add_card kind=note with title="missed: <atom>" and a one-sentence body.
- finish with one short feedback sentence, then call set_phase phase=graded.

available tools — emit each in its own fenced block, language=tool. emit tool calls AND prose in the same turn; the prose appears in chat, the tools mutate the board:
\`\`\`tool
{"name":"add_card","args":{"id":"differ-1","kind":"differential|investigation|plan|vital|note","title":"short","body":"one or two sentences"}}
\`\`\`
\`\`\`tool
{"name":"remove_card","args":{"id":"differ-1"}}
\`\`\`
\`\`\`tool
{"name":"highlight_card","args":{"id":"differ-1"}}
\`\`\`
\`\`\`tool
{"name":"clear_screen","args":{}}
\`\`\`
\`\`\`tool
{"name":"set_phase","args":{"phase":"asking|grading|graded"}}
\`\`\`

every turn you receive a fresh snapshot — you have no chat history. work from what is on the board now.

phase: {{PHASE}}

case stem:
{{STEM}}

current board ({{N}} cards — these are the student's commitments):
{{CARDS}}
{{ANSWER_KEY}}`;

const PERSIST_KEY = 'corpus.triage.v1';
const SCHEMA_VERSION = 1;

const state = {
    manifest: null,
    scenarios: [],
    activeScenarioId: null,
    cards: [],
    cardSeq: 0,
    messages: [],
    capability: 'unknown',
    llmStatus: 'idle',
    loadStarted: false,
    pipeline: null,
    worker: null,
    workerReady: false,
    generating: false,
    streamBuffer: '',
    onProgress: null,
    subjectFilter: new Set(),
    sessions: {},
    phase: 'asking'
};
window.__triage = state;

function pickFromVariance(varObj) {
    // Variance descriptor: { mild: {...}, moderate: {...}, severe: {...} } -> pick one key.
    if (!varObj || typeof varObj !== 'object') return null;
    const keys = Object.keys(varObj);
    if (!keys.length) return null;
    // Deterministic-by-scenario pick: hash from joined keys so same scenario stems are stable.
    return keys[0];
}

function caseStem(sc) {
    if (!sc) return '';
    const ex = (sc.examples && sc.examples[0]) || {};
    const stemRaw = (typeof ex === 'string' ? ex : (ex.case || ex.stem || ''));
    if (stemRaw && stemRaw.length > 20) return stemRaw.slice(0, 600);
    const p = sc.parameters || {};
    // Numeric-vital weave (when params expose age/sex/hr/bp/...)
    const demo = [];
    if (p.age) demo.push(`${p.age}yo`);
    if (p.sex) demo.push(p.sex);
    const vitals = [];
    for (const k of ['hr', 'HR', 'bp', 'BP', 'temp', 'rr', 'spo2', 'SpO2', 'glucose']) {
        if (p[k] != null && typeof p[k] !== 'object') vitals.push(`${k.toUpperCase()} ${p[k]}`);
    }
    // Categorical descriptor weave: severity/onset/comorbidities/response -> stem clauses.
    const features = [];
    if (p.severity?.variance) features.push(`${pickFromVariance(p.severity.variance)} severity`);
    if (p.onset?.variance) features.push(`${pickFromVariance(p.onset.variance)} onset`);
    if (p.comorbidities?.variance) {
        const c = pickFromVariance(p.comorbidities.variance);
        if (c && c !== 'none') features.push(`with ${c.replace(/_/g, ' ')}`);
    }
    const desc = sc.description || '';
    const lead = desc.split(/[.!?]/)[0] || sc.name;
    let presentation;
    if (demo.length || vitals.length) {
        presentation = `A ${demo.join(' ') || 'patient'}${vitals.length ? ` with ${vitals.join(', ')}` : ''} presents to your service.`;
    } else if (features.length) {
        presentation = `A patient presents with ${features.join(', ')}.`;
    } else {
        presentation = 'The patient presents to your service.';
    }
    return `${sc.name}. ${lead}. ${presentation} Commit your differentials, investigations, and plan as cards before requesting grading.`;
}

function safeStore() {
    try { return window.localStorage; } catch { return null; }
}
function loadSessions() {
    const ls = safeStore(); if (!ls) return { sessions: {}, streak: 0 };
    try {
        const raw = ls.getItem(PERSIST_KEY);
        if (!raw) return { sessions: {}, streak: 0 };
        const obj = JSON.parse(raw);
        if (obj && obj.version === SCHEMA_VERSION) return { sessions: obj.sessions || {}, streak: obj.streak || 0 };
        return { sessions: {}, streak: 0 };
    } catch { return { sessions: {}, streak: 0 }; }
}
function saveSessions() {
    const ls = safeStore(); if (!ls) return;
    try { ls.setItem(PERSIST_KEY, JSON.stringify({ version: SCHEMA_VERSION, sessions: state.sessions, streak: state.streak || 0, savedAt: Date.now() })); }
    catch (e) { console.warn('persist failed', e); }
}
function persistActive() {
    if (!state.activeScenarioId) return;
    const prev = state.sessions[state.activeScenarioId];
    const prevScore = prev && !Array.isArray(prev) ? prev.score : (prev?.score);
    const cards = state.cards.map(c => ({ id: c.id, kind: c.kind, title: c.title, body: c.body, highlighted: !!c.highlighted }));
    state.sessions[state.activeScenarioId] = { cards, score: state.lastGrade ?? prevScore ?? null, gradedAt: state.phase === 'graded' ? Date.now() : (prev?.gradedAt ?? null) };
    saveSessions();
    renderStats();
}

// Backwards-compat: sessions used to be stored as bare arrays; normalize on read.
function sessionCards(sess) {
    if (!sess) return [];
    if (Array.isArray(sess)) return sess;
    return sess.cards || [];
}
function sessionScore(sess) {
    if (!sess || Array.isArray(sess)) return null;
    return sess.score ?? null;
}

const els = {
    capDot: document.getElementById('cap-dot'),
    capLabel: document.getElementById('cap-label'),
    list: document.getElementById('scenario-list'),
    filterBar: document.getElementById('filter-bar'),
    statsRow: document.getElementById('stats-row'),
    exportBtn: document.getElementById('export-btn'),
    importInput: document.getElementById('import-input'),
    activeScenario: document.getElementById('active-scenario'),
    scratchpad: document.getElementById('scratchpad'),
    modelStatus: document.getElementById('model-status'),
    modelDetail: document.getElementById('model-detail'),
    progress: document.getElementById('progress'),
    progressFill: document.getElementById('progress-fill'),
    progressText: document.getElementById('progress-text'),
    messages: document.getElementById('messages'),
    prompt: document.getElementById('prompt'),
    send: document.getElementById('send'),
    loadLLM: document.getElementById('load-llm'),
    clearScreen: document.getElementById('clear-screen')
};

// (removed) submitForGrading — phase transitions are now LLM-driven via the set_phase tool.

function ce(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') e.className = v;
        else if (k === 'on') for (const [n, h] of Object.entries(v)) e.addEventListener(n, h);
        else if (k === 'data') for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
        else if (v != null) e.setAttribute(k, v);
    }
    for (const k of kids) {
        if (k == null) continue;
        if (Array.isArray(k)) for (const kk of k) e.append(kk instanceof Node ? kk : document.createTextNode(String(kk)));
        else e.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return e;
}

async function checkCapability() {
    console.log('[triage-live] boot', { ua: navigator.userAgent, isolated: self.crossOriginIsolated, sab: typeof SharedArrayBuffer !== 'undefined' });
    if (DEBUG_WEBGPU) {
        debugLog('boot', { ua: navigator.userAgent, isolated: self.crossOriginIsolated, sab: typeof SharedArrayBuffer !== 'undefined' });
    }
    if (!navigator.gpu) {
        state.capability = 'unsupported';
        els.capDot.className = 'dot warn';
        els.capLabel.textContent = 'WebGPU required';
        els.loadLLM.disabled = true;
        els.modelDetail.textContent = 'this browser does not support WebGPU. open in Chrome or Edge for the live tutor. offline grading is still available.';
        console.log('[triage-live] capability: gpu absent — using offline grading only');
        return;
    }
    try {
        const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!a) throw new Error('no adapter');
        const features = Array.from(a.features || []);
        const fp16 = features.includes('shader-f16');
        let info = {};
        try { info = await a.requestAdapterInfo?.() || {}; } catch {}
        state.capability = 'webgpu';
        state.gpuInfo = { features, fp16, info };
        els.capDot.className = 'dot ok';
        els.capLabel.textContent = 'tutor loading';
        els.modelDetail.textContent = 'preparing your private tutor (~250MB once, then cached).';
        // Start the model download immediately so it's ready by the time the user picks a case.
        // The shared worker only downloads once; selectScenario's later attempt is a no-op.
        try { loadLLM(); } catch (e) { console.warn('[triage-live] eager auto-load failed', e); }
        console.log('[triage-live] adapter', { features, fp16, info });
        debugLog('adapter', { features, fp16, info: { vendor: info.vendor, architecture: info.architecture, device: info.device } });
        if (DEBUG_WEBGPU) {
            els.modelDetail.textContent = `adapter: ${info.vendor || '?'} ${info.architecture || ''} · features: ${features.length} · fp16: ${fp16}`;
        }
    } catch (e) {
        state.capability = 'unsupported';
        els.capDot.className = 'dot warn';
        els.capLabel.textContent = 'offline tutor only';
        els.loadLLM.disabled = true;
        console.warn('[triage-live] adapter-error', e);
        debugLog('adapter-error', String(e));
    }
}

async function loadManifestAndScenarios() {
    state.manifest = await fetch('./data/manifest.json').then(r => r.json());
    const all = [];
    const subjects = state.manifest.subjects.map(s => s.subject);
    await Promise.all(subjects.map(async s => {
        const sh = await fetch(`./data/${s}.json`).then(r => r.json());
        const meta = state.manifest.subjects.find(x => x.subject === s);
        if (sh.triage && Array.isArray(sh.triage.scenarios)) {
            for (let i = 0; i < sh.triage.scenarios.length; i++) {
                const sc = sh.triage.scenarios[i];
                all.push({
                    id: `${s}-${i}`,
                    subject: s,
                    cat: meta?.cat || 'green',
                    name: sc.name,
                    description: sc.description || '',
                    parameters: sc.parameters || {},
                    examples: sc.examples || [],
                    atom_ids: sc.atom_ids || [],
                    atoms: (sh.triage.atoms || []).filter(a => (sc.atom_ids || []).includes(a.id))
                });
            }
        }
    }));
    state.scenarios = all;
    renderScenarios();
}

function visibleScenarios() {
    let pool = state.scenarios;
    if (state.subjectFilter.size > 0) pool = pool.filter(s => state.subjectFilter.has(s.subject));
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        pool = pool.filter(s => (s.name || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q));
    }
    return pool;
}

function renderFilterBar() {
    if (!els.filterBar) return;
    els.filterBar.innerHTML = '';
    // Search input
    const searchEl = ce('input', {
        type: 'search', class: 'case-search', placeholder: 'search cases…',
        'aria-label': 'search cases', value: state.searchQuery || '',
        on: { input: e => { state.searchQuery = e.target.value; renderScenarios(); } }
    });
    els.filterBar.append(searchEl);
    const chipsRow = ce('div', { class: 'filter-chips-row' });
    const subjects = Array.from(new Set(state.scenarios.map(s => s.subject))).sort();
    const allActive = state.subjectFilter.size === 0;
    chipsRow.append(ce('button', {
        class: 'chip filter-chip' + (allActive ? ' active' : ''), type: 'button',
        'aria-pressed': String(allActive),
        on: { click: () => { state.subjectFilter.clear(); renderFilterBar(); renderScenarios(); } }
    }, 'all'));
    for (const subj of subjects) {
        const on = state.subjectFilter.has(subj);
        chipsRow.append(ce('button', {
            class: 'chip filter-chip' + (on ? ' active' : ''), type: 'button',
            'aria-pressed': String(on),
            on: { click: () => { on ? state.subjectFilter.delete(subj) : state.subjectFilter.add(subj); renderFilterBar(); renderScenarios(); } }
        }, subj));
    }
    els.filterBar.append(chipsRow);
}

function renderStats() {
    if (!els.statsRow) return;
    const sessions = state.sessions || {};
    const attempted = Object.keys(sessions).length;
    let totalCards = 0;
    for (const id of Object.keys(sessions)) totalCards += (sessions[id] || []).length;
    const last = state.lastGrade != null ? `${state.lastGrade}%` : '—';
    const streak = state.streak || 0;
    els.statsRow.textContent = `${attempted} attempted · streak ${streak} · last grade ${last}`;
    console.log('[triage-live] stats', { totalScenarios: state.scenarios.length, attempted, totalCards, lastGrade: state.lastGrade, streak });
}

function renderScenarios() {
    els.list.innerHTML = '';
    const vis = visibleScenarios();
    const bySubject = {};
    for (const s of vis) (bySubject[s.subject] ||= []).push(s);
    if (vis.length === 0) {
        els.list.append(ce('div', { class: 'label' }, 'no cases match these filters'));
        return;
    }
    for (const [subj, items] of Object.entries(bySubject)) {
        els.list.append(ce('div', { class: 'label', style: 'margin-top:14px' }, `${subj} (${items.length})`));
        for (const sc of items) {
            const sess = state.sessions[sc.id];
            const cards = sessionCards(sess);
            const score = sessionScore(sess);
            const hasSession = cards.length > 0;
            const subParts = [subj];
            if (score != null) subParts.push(`${score}%`);
            else if (hasSession) subParts.push(`${cards.length} cards`);
            const row = ce('div', {
                class: 'scenario-row' + (state.activeScenarioId === sc.id ? ' active' : '') + (hasSession ? ' has-session' : '') + (score != null ? ' has-score' : ''),
                data: { id: sc.id },
                role: 'button', tabindex: '0',
                'aria-pressed': String(state.activeScenarioId === sc.id),
                on: {
                    click: () => selectScenario(sc.id),
                    keydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectScenario(sc.id); } }
                }
            },
                ce('div', {}, sc.name),
                ce('div', { class: 'sub' }, subParts.join(' · '))
            );
            row.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                import('./context-menu.js').then(({ showContextMenu }) => {
                    const has = !!state.sessions[sc.id];
                    showContextMenu(e.clientX, e.clientY, [
                        { icon: '▶', label: 'open this case', action: () => selectScenario(sc.id) },
                        has ? { icon: '↺', label: 'reset progress', action: () => {
                            delete state.sessions[sc.id]; saveSessions();
                            if (state.activeScenarioId === sc.id) { state.cards = []; state.lastGrade = null; state.phase = 'asking'; renderActive(); renderScratchpad(); }
                            renderScenarios(); renderStats();
                        } } : null
                    ].filter(Boolean));
                }).catch(() => {});
            });
            els.list.append(row);
        }
    }
}

function selectScenario(id) {
    const sc = state.scenarios.find(x => x.id === id);
    if (!sc) return;
    state.activeScenarioId = id;
    const saved = state.sessions[id];
    state.cards = sessionCards(saved).map(c => ({ ...c }));
    state.cardSeq = state.cards.length;
    state.messages = [];
    state.lastGrade = sessionScore(saved);
    state.phase = state.lastGrade != null ? 'graded' : 'asking';
    renderScenarios();
    renderActive();
    renderScratchpad();
    renderMessages();
    // Auto-load the LLM on first scenario select. If WebGPU is missing, this is a no-op.
    if (state.capability === 'webgpu' && !state.loadStarted) {
        loadLLM().catch(e => console.warn('[triage-live] auto-load failed', e));
    }
}

function countByKind(cards) {
    const out = {};
    for (const c of cards) out[c.kind] = (out[c.kind] || 0) + 1;
    return out;
}

// (removed) renderQuickAdd — the LLM places cards from natural-language descriptions.

function renderGradePanel(sc) {
    const score = state.lastGrade != null ? state.lastGrade : 0;
    const matched = state.cards.filter(c => c.highlighted);
    const gaps = state.cards.filter(c => c.kind === 'note' && /^missed:/i.test(c.title || ''));
    const wrap = ce('div', { class: 'grade-panel' });
    const scoreClass = score >= 80 ? 'high' : score >= 60 ? 'mid' : 'low';
    wrap.append(ce('div', { class: `grade-score ${scoreClass}` },
        ce('span', { class: 'pct' }, `${score}%`),
        ce('span', { class: 'lbl' }, score >= 80 ? 'solid' : score >= 60 ? 'getting there' : 'review needed')
    ));
    if (matched.length) wrap.append(ce('div', { class: 'grade-section' },
        ce('div', { class: 'grade-section-title' }, `you got (${matched.length})`),
        ...matched.map(c => ce('div', { class: 'grade-row hit' }, ce('span', { class: 'check' }, '✓'), ce('span', {}, c.title)))
    ));
    if (gaps.length) wrap.append(ce('div', { class: 'grade-section' },
        ce('div', { class: 'grade-section-title' }, `you missed (${gaps.length})`),
        ...gaps.map(c => ce('div', { class: 'grade-row miss' }, ce('span', { class: 'check' }, '×'),
            ce('div', {},
                ce('div', { class: 'miss-title' }, (c.title || '').replace(/^missed:\s*/i, '')),
                c.body ? ce('div', { class: 'miss-body' }, c.body) : null
            )
        ))
    ));
    wrap.append(ce('div', { class: 'grade-actions' },
        ce('button', { class: 'run-btn', on: { click: () => {
            // Try again: clear highlights, drop the tutor-added gap notes & canonical-plan card, restore asking phase
            state.cards = state.cards.filter(c => {
                if (c.kind === 'note' && /^missed:/i.test(c.title || '')) return false;
                if (typeof c.id === 'string' && (c.id.startsWith('gap-') || c.id.startsWith('key-rec-'))) return false;
                return true;
            });
            for (const c of state.cards) c.highlighted = false;
            state.phase = 'asking';
            state.lastGrade = null;
            persistActive();
            renderActive(); renderScratchpad();
        } } }, 'try again'),
        ce('button', { class: 'chip', on: { click: () => {
            const vis = visibleScenarios();
            const idx = vis.findIndex(s => s.id === sc.id);
            const next = vis[Math.min(idx + 1, vis.length - 1)];
            if (next && next.id !== sc.id) selectScenario(next.id);
        } } }, 'next case â†’')
    ));
    return wrap;
}

function renderActive() {
    els.activeScenario.innerHTML = '';
    const sc = currentScenario();
    if (!sc) {
        els.activeScenario.append(
            ce('div', { class: 'panel-head' }, ce('span', { class: 'title' }, 'select a case.'), ce('span', { class: 'meta' }, 'choose one from the list')),
            ce('div', { class: 'muted' }, 'pick a case on the left. talk to your tutor in plain english — they place cards and grade when you ask.')
        );
        els.activeScenario.className = 'active-scenario panel';
        return;
    }
    els.activeScenario.className = 'active-scenario panel rail-' + sc.cat;
    const stem = caseStem(sc);
    const counts = countByKind(state.cards);
    const checklist = [
        { kind: 'differential', label: 'differentials', target: 3 },
        { kind: 'investigation', label: 'investigations', target: 2 },
        { kind: 'plan', label: 'plan', target: 1 }
    ];
    const checklistEl = ce('div', { class: 'checklist' },
        ...checklist.map(item => ce('div', { class: 'checklist-row' + ((counts[item.kind] || 0) >= item.target ? ' done' : '') },
            ce('span', { class: 'tick' }, (counts[item.kind] || 0) >= item.target ? '●' : '◇'),
            ce('span', {}, `${item.label}: ${counts[item.kind] || 0} / ${item.target}`)
        ))
    );
    const totalNeeded = checklist.reduce((a, b) => a + b.target, 0);
    const totalGot = checklist.reduce((a, b) => a + Math.min(b.target, counts[b.kind] || 0), 0);
    const ready = totalGot >= totalNeeded;
    const phaseLabel = state.phase === 'asking' ? 'working' : state.phase === 'grading' ? 'grading' : state.phase === 'graded' ? 'graded' : state.phase;
    els.activeScenario.append(
        ce('div', { class: 'panel-head' }, ce('span', { class: 'title' }, sc.name), ce('span', { class: 'meta' }, `${sc.subject} · ${phaseLabel}`)),
        ce('div', { class: 'stem' }, stem),
    );
    if (state.phase === 'graded') {
        els.activeScenario.append(renderGradePanel(sc));
    } else {
        // Conversational suggestion chips — each sends a natural-language message to the tutor.
        // The LLM decides whether to add a card, ask a follow-up, or transition phase.
        const askChip = (text, label) => ce('button', {
            class: 'chip', type: 'button',
            on: { click: () => { els.prompt.value = text; els.prompt.focus(); } }
        }, label);
        const gradeChip = ce('button', {
            class: 'run-btn' + (ready ? '' : ' disabled'),
            on: { click: () => {
                els.prompt.value = "i'm ready — grade my work.";
                send(false);
            } },
            ...(ready ? {} : { disabled: 'true' })
        }, ready ? "i'm ready — grade me" : `add ${totalNeeded - totalGot} more, then ask to be graded`);
        els.activeScenario.append(
            ce('div', { class: 'stem-hint' }, 'tell the tutor your differentials, investigations, and plan in your own words. they will place the cards for you and grade when you ask.'),
            checklistEl,
            ce('div', { class: 'suggestion-chips' },
                askChip('what additional history would help?', 'ask for more history'),
                askChip('give me a hint without spoiling the answer.', 'request a hint'),
                gradeChip
            )
        );
    }
}

function currentScenario() {
    return state.scenarios.find(x => x.id === state.activeScenarioId) || null;
}

function renderScratchpad() {
    els.scratchpad.innerHTML = '';
    if (state.cards.length === 0) {
        els.scratchpad.append(ce('div', { class: 'scratchpad-empty' }, 'your board is empty — tell the tutor your first differential.'));
        return;
    }
    for (const c of state.cards) {
        const card = ce('div', {
            class: 'scratch-card' + (c.highlighted ? ' highlighted' : ''),
            data: { id: c.id, kind: c.kind }
        },
            ce('button', { class: 'closer', on: { click: () => removeCard(c.id) }, 'aria-label': 'remove card' }, '×'),
            ce('div', { class: 'kind' }, c.kind),
            ce('div', { class: 'title' }, c.title),
            ce('div', { class: 'body' }, c.body || '')
        );
        // Right-click on a scratchpad card → context menu (LLM-aware actions)
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            import('./context-menu.js').then(({ showContextMenu }) => {
                showContextMenu(e.clientX, e.clientY, [
                    { icon: '🗑', label: 'remove card', action: () => removeCard(c.id) },
                    { icon: '✨', label: c.highlighted ? 'unhighlight' : 'highlight', action: () => TOOLS.highlight_card({ id: c.id }) },
                    { type: 'divider' },
                    { icon: '💬', label: 'ask tutor why this matters', action: () => {
                        els.prompt.value = `why is "${c.title}" relevant in this case?`;
                        els.prompt.focus();
                    } },
                    { icon: '🔄', label: 'reword this card', action: () => {
                        els.prompt.value = `reword my "${c.kind}" card titled "${c.title}" more precisely.`;
                        els.prompt.focus();
                    } }
                ]);
            }).catch(() => {});
        });
        els.scratchpad.append(card);
    }
}

function renderMessages() {
    els.messages.innerHTML = '';
    for (const m of state.messages) {
        els.messages.append(ce('div', { class: `msg ${m.role}` },
            ce('div', { class: 'role' }, m.role),
            ce('div', {}, m.content.length > 600 ? m.content.slice(0, 600) + '…' : m.content)
        ));
    }
    els.messages.scrollTop = els.messages.scrollHeight;
}

const CARD_KINDS = new Set(['differential', 'recommendation', 'warning', 'vital', 'plan', 'note', 'investigation']);

const TOOLS = {
    add_card({ id, kind, title, body }) {
        if (!CARD_KINDS.has(kind)) kind = 'note';
        if (!id) id = `${kind}-${++state.cardSeq}`;
        const exists = state.cards.find(c => c.id === id);
        if (exists) Object.assign(exists, { kind, title, body });
        else state.cards.push({ id, kind, title: title || '', body: body || '', highlighted: false });
        renderScratchpad(); persistActive();
        return { ok: true, id };
    },
    remove_card({ id }) {
        const i = state.cards.findIndex(c => c.id === id);
        if (i < 0) return { ok: false, error: 'not found' };
        state.cards.splice(i, 1);
        renderScratchpad(); persistActive();
        return { ok: true };
    },
    highlight_card({ id }) {
        for (const c of state.cards) c.highlighted = (c.id === id);
        renderScratchpad(); persistActive();
        return { ok: true };
    },
    clear_screen() {
        state.cards = [];
        renderScratchpad(); persistActive();
        return { ok: true };
    },
    set_phase({ phase }) {
        if (!['asking', 'grading', 'graded'].includes(phase)) return { ok: false, error: 'bad phase' };
        const prev = state.phase;
        state.phase = phase;
        persistActive(); renderActive();
        if (phase === 'graded' && prev !== 'graded') {
            // Compute a score from highlighted vs missed-note cards.
            const sc = currentScenario();
            const atomCount = (sc?.atoms || []).length || 0;
            const hits = state.cards.filter(c => c.highlighted).length;
            const score = atomCount ? Math.round(100 * hits / atomCount) : 0;
            state.lastGrade = score;
            state.streak = score >= 70 ? (state.streak || 0) + 1 : 0;
            try {
                const ch = ('BroadcastChannel' in self) ? new BroadcastChannel('corpus') : null;
                ch?.postMessage({ type: 'case:graded', score: score / 100, scenarioId: sc?.id || sc?.name });
                ch?.close();
            } catch {}
            saveSessions(); renderStats(); renderActive();
        }
        if (phase === 'grading') {
            // Re-issue generation with answer-key snapshot so the LLM can grade.
            // Caller's current generation is the "asking" turn; we trigger a follow-up grading turn.
            setTimeout(() => {
                if (state.workerReady && !state.generating) {
                    const sys = buildSnapshot('grading');
                    state.generating = true;
                    state.worker?.postMessage({ type: 'generate', messages: [
                        { role: 'system', content: sys },
                        { role: 'user', content: 'grade the board now using the answer key above. emit highlight_card and add_card tools per the system prompt, then set_phase phase=graded.' }
                    ] });
                }
            }, 50);
        }
        return { ok: true };
    }
};

// Tool dispatch lives in ./tool-dispatch.js (runToolCalls). Exposed on state for debugging.
state.dispatchToolCalls = (text) => runToolCalls(text, TOOLS);

function removeCard(id) {
    const idx = state.cards.findIndex(c => c.id === id);
    if (idx < 0) return;
    const removed = { ...state.cards[idx], _idx: idx };
    TOOLS.remove_card({ id });
    // Show undo toast
    const old = document.getElementById('triage-undo'); if (old) old.remove();
    const toast = document.createElement('div');
    toast.id = 'triage-undo';
    toast.className = 'triage-undo';
    toast.innerHTML = `<span>card removed</span> <button class="chip" type="button">undo</button>`;
    toast.querySelector('button').addEventListener('click', () => {
        state.cards.splice(Math.min(removed._idx, state.cards.length), 0, { id: removed.id, kind: removed.kind, title: removed.title, body: removed.body, highlighted: !!removed.highlighted });
        persistActive(); renderScratchpad();
        toast.remove();
    });
    document.body.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
}

function buildSnapshot(phase) {
    phase = phase || state.phase || 'asking';
    const sc = currentScenario();
    const stem = sc ? caseStem(sc) : 'none — pick a scenario from the left first';
    const cardsText = state.cards.length === 0
        ? '(empty — student has not committed any cards yet)'
        : state.cards.map(c => `- [${c.id}] ${c.kind}: ${c.title} — ${c.body}`).join('\n');
    let answerKey = '';
    if (sc && phase === 'grading') {
        const atoms = (sc.atoms || []).slice(0, 8).map(a => `- ${a.atom}: ${(a.definition || '').slice(0, 200)}`).join('\n');
        const ex = (sc.examples && sc.examples[0]) || {};
        answerKey = `\n\n=== ANSWER KEY (do not paraphrase verbatim — use to grade) ===\ncanonical atoms:\n${atoms}\nrecommended plan: ${ex.recommendation || '(not specified)'}\nreasoning: ${ex.reasoning || '(not specified)'}`;
    }
    return SYSTEM_PROMPT_TMPL
        .replace('{{PHASE}}', phase)
        .replace('{{STEM}}', stem)
        .replace('{{N}}', state.cards.length)
        .replace('{{CARDS}}', cardsText)
        .replace('{{ANSWER_KEY}}', answerKey);
}
state.buildSnapshot = buildSnapshot;

const DEBUG_WEBGPU = new URLSearchParams(location.search).has('debug') && location.search.includes('webgpu');
state.debugWebgpu = DEBUG_WEBGPU;

function debugPanel() {
    let p = document.getElementById('webgpu-debug');
    if (!p) {
        p = document.createElement('pre');
        p.id = 'webgpu-debug';
        p.style.cssText = 'position:fixed;right:8px;bottom:8px;max-width:520px;max-height:60vh;overflow:auto;background:#0b0b0b;color:#9ef;border:1px solid #345;padding:10px;font:11px/1.4 ui-monospace,monospace;z-index:9999;border-radius:6px;white-space:pre-wrap;word-break:break-word';
        document.body.appendChild(p);
    }
    return p;
}
function debugLog(label, payload) {
    if (!DEBUG_WEBGPU) return;
    const p = debugPanel();
    const line = `[${new Date().toISOString().slice(11,19)}] ${label} ${typeof payload==='string'?payload:JSON.stringify(payload)}\n`;
    p.textContent += line;
    p.scrollTop = p.scrollHeight;
    console.log('[webgpu-debug]', label, payload);
}
state.debugLog = debugLog;

function showWebgpuError(reason, stack) {
    state.llmStatus = 'error';
    els.modelStatus.textContent = 'offline';
    els.modelDetail.textContent = "couldn't load the live tutor — offline grading is still available, but conversational coaching needs WebGPU.";
    els.progress.hidden = false;
    els.progressFill.style.width = '0%';
    els.progressText.textContent = 'using offline grading';
    els.loadLLM.disabled = false;
    state.loadStarted = false;
    state.messages.push({ role: 'system', content: "the live tutor isn't available. you can still get an offline grade — type 'grade me' when you've added your cards." });
    renderMessages();
    console.error('[corpus] webgpu error', reason, stack);
    debugLog('error', { reason, stack });
}
state.showWebgpuError = showWebgpuError;

function spawnWorker() {
    if (state.worker) return state.worker;
    try {
        state.worker = new Worker('./triage-llm-worker.js', { type: 'module' });
        state.worker.addEventListener('message', onWorkerMessage);
        state.worker.addEventListener('error', e => {
            const reason = e.message || `${e.filename || 'worker'}:${e.lineno || '?'}`;
            showWebgpuError(reason, '');
            state.worker = null;
        });
        state.worker.addEventListener('messageerror', e => {
            showWebgpuError('worker messageerror — module/MIME mismatch?', String(e));
        });
    } catch (e) {
        state.worker = null;
        throw e;
    }
    return state.worker;
}

function onWorkerMessage(e) {
    const m = e.data || {};
    console.log('[triage-live] worker', m.status, m);
    debugLog('worker-msg', m);
    if (m.status === 'gpu-info') {
        if (DEBUG_WEBGPU) {
            els.modelDetail.textContent = `adapter: ${m.adapter?.vendor || '?'} ${m.adapter?.architecture || ''} · features: ${m.features.length} · fp16: ${m.fp16} · dtype: ${m.dtype}`;
        } else {
            els.modelDetail.textContent = 'preparing your private tutor — this happens once.';
        }
        return;
    }
    if (m.status === 'loading') {
        els.progressText.textContent = 'loading tutor…';
    } else if (m.status === 'progress') {
        const p = m.payload || {};
        const pct = p.progress != null ? Math.round(p.progress) : 0;
        els.progressFill.style.width = pct + '%';
        els.progressText.textContent = `loading tutor… ${pct}%`;
    } else if (m.status === 'ready') {
        state.workerReady = true;
        state.llmStatus = 'ready';
        els.modelStatus.textContent = 'ready';
        els.progressFill.style.width = '100%';
        els.progressText.textContent = 'tutor ready';
        els.modelDetail.textContent = 'your private tutor is loaded and ready.';
    } else if (m.status === 'start') {
        state.streamBuffer = '';
        const last = state.messages[state.messages.length - 1];
        if (!last || last.role !== 'assistant') state.messages.push({ role: 'assistant', content: '' });
        renderMessages();
    } else if (m.status === 'update') {
        state.streamBuffer += m.output || '';
        const last = state.messages[state.messages.length - 1];
        // While streaming, show prose with tool blocks hidden so the chat stays readable.
        if (last && last.role === 'assistant') last.content = stripToolBlocks(state.streamBuffer) || state.streamBuffer;
        renderMessages();
    } else if (m.status === 'complete') {
        const text = m.output || state.streamBuffer;
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === 'assistant') last.content = stripToolBlocks(text);
        state.generating = false;
        renderMessages();
        runToolCalls(text, TOOLS);
        if (state.phase === 'graded') renderActive();
        if (state._afterGenerate) { const cb = state._afterGenerate; state._afterGenerate = null; cb(); }
    } else if (m.status === 'error') {
        state.generating = false;
        showWebgpuError(m.error || 'unknown worker error', m.stack || '');
        if (state._afterGenerate) { const cb = state._afterGenerate; state._afterGenerate = null; cb(); }
    }
}

async function loadLLM() {
    if (state.loadStarted) return;
    state.loadStarted = true;
    state.llmStatus = 'loading';
    els.modelStatus.textContent = 'starting…';
    els.loadLLM.disabled = true;
    els.progress.hidden = false;
    els.progressText.textContent = 'loading tutor…';
    console.log('[triage-live] starting tutor');
    try {
        const w = spawnWorker();
        if (!w) throw new Error('worker unavailable');
        w.postMessage({ type: 'load' });
    } catch (e) {
        state.llmStatus = 'error';
        els.modelStatus.textContent = 'offline';
        els.progressText.textContent = 'using offline tutor';
        els.loadLLM.disabled = false;
        state.loadStarted = false;
        console.error('[triage-live] tutor load failed', e);
    }
}

function generateLLM(userText) {
    if (!state.worker || !state.workerReady) throw new Error('LLM not loaded');
    const sys = buildSnapshot(state.phase);
    const messages = [
        { role: 'system', content: sys },
        { role: 'user', content: userText }
    ];
    if (state.generating) state.worker.postMessage({ type: 'interrupt' });
    state.generating = true;
    state.worker.postMessage({ type: 'generate', messages });
    return new Promise(resolve => { state._afterGenerate = resolve; });
}
state.generateLLM = generateLLM;
state.spawnWorker = spawnWorker;

async function send(forceSim = false) {
    const txt = els.prompt.value.trim();
    if (!txt) return;
    if (!currentScenario()) {
        state.messages.push({ role: 'system', content: 'pick a scenario first.' });
        renderMessages();
        return;
    }
    els.prompt.value = '';
    state.messages.push({ role: 'user', content: txt });
    renderMessages();
    const useLLM = !forceSim && state.worker && state.workerReady;
    if (useLLM) {
        try { await generateLLM(txt); }
        catch (e) {
            showWebgpuError(e.message || String(e), e.stack || '');
            const reply = simulateAssistant(txt);
            state.messages.push({ role: 'assistant', content: reply });
            renderMessages();
            runToolCalls(reply, TOOLS);
        }
    } else {
        let reply;
        try { reply = simulateAssistant(txt); }
        catch (e) { reply = `(error) ${e.message}`; }
        state.messages.push({ role: 'assistant', content: reply });
        renderMessages();
        runToolCalls(reply, TOOLS);
    }
    // Cap history at 20 messages so DOM doesn't bloat.
    if (state.messages.length > 20) state.messages = state.messages.slice(-20);
    renderMessages();
}

function tokenize(s) { return new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) || []); }
function overlap(a, b) {
    let n = 0;
    for (const t of a) if (b.has(t)) n++;
    return n;
}

// Last-resort fallback when the live LLM tutor isn't available yet (or the browser can't run it).
// Tells the truth about WHY it's offline — distinguishes "WebGPU missing" from "model still loading".
function simulateAssistant(userText) {
    const sc = currentScenario();
    if (!sc) return 'pick a scenario first.';
    if (state.phase !== 'grading' && !/\b(grade|score|check)\b/i.test(userText || '')) {
        if (state.capability === 'unsupported') {
            return "the live tutor needs WebGPU (Chrome or Edge). i can still grade your board offline against the answer key — type 'grade me' when you're ready.";
        }
        if (state.llmStatus === 'loading' || state.loadStarted) {
            return "the live tutor is still loading (~250 MB on first use, then cached). i'll be ready in a moment — keep noting your differentials and i'll join in. or type 'grade me' to score offline now.";
        }
        if (state.llmStatus === 'error') {
            return "couldn't start the live tutor on this device. i can still grade your board offline — type 'grade me' when you're ready.";
        }
        // capability=webgpu but worker never spawned (auto-load race). Kick it off now.
        if (state.capability === 'webgpu' && !state.loadStarted) {
            try { loadLLM(); } catch (e) { console.warn('[triage-live] late auto-load failed', e); }
            return "starting your private tutor now — give it a moment to load (~250 MB once, then cached). type 'grade me' if you'd rather score offline.";
        }
        return "the live tutor isn't ready yet. type 'grade me' to score offline, or wait a moment and try again.";
    }
    // Offline grading path — token-overlap against atoms.
    const studentTokens = state.cards.map(c => ({ c, tok: tokenize(`${c.title} ${c.body}`) }));
    const blocks = [`grading your ${state.cards.length} cards offline against "${sc.name}".`];
    let hits = 0, misses = 0;
    const atoms = (sc.atoms || []).slice(0, 6);
    const matchedStudentIds = new Set();
    for (const a of atoms) {
        const aTok = tokenize(`${a.atom} ${a.definition || ''}`);
        let best = null, bestScore = 0;
        for (const sCard of studentTokens) {
            if (matchedStudentIds.has(sCard.c.id)) continue;
            const s = overlap(aTok, sCard.tok);
            if (s > bestScore) { bestScore = s; best = sCard; }
        }
        if (best && bestScore >= 2) {
            matchedStudentIds.add(best.c.id);
            hits++;
            blocks.push('```tool\n' + JSON.stringify({ name: 'highlight_card', args: { id: best.c.id } }) + '\n```');
        } else {
            misses++;
            blocks.push('```tool\n' + JSON.stringify({ name: 'add_card', args: { id: `gap-${Date.now()}-${misses}`, kind: 'note', title: `missed: ${a.atom.slice(0, 50)}`, body: (a.definition || '').slice(0, 200) } }) + '\n```');
        }
    }
    const score = atoms.length ? Math.round(100 * hits / atoms.length) : 0;
    blocks.push('```tool\n' + JSON.stringify({ name: 'set_phase', args: { phase: 'graded' } }) + '\n```');
    blocks.push(`\noffline grade: ${hits} of ${atoms.length} key topics (${score}%). gaps shown on board.`);
    return blocks.join('\n');
}
state.simulateAssistant = simulateAssistant;

els.send.addEventListener('click', () => send(false));
els.loadLLM.addEventListener('click', loadLLM);
els.clearScreen.addEventListener('click', () => TOOLS.clear_screen());
const copyMdBtn = document.getElementById('copy-md');
if (copyMdBtn) copyMdBtn.addEventListener('click', () => {
    const sc = currentScenario();
    const lines = [];
    lines.push('# ' + (sc?.name || 'case'));
    if (sc?.description) lines.push('', sc.description);
    lines.push('', '## board', '');
    for (const c of (state.cards || [])) lines.push(`- **${c.kind || 'note'}**: ${c.title || ''}` + (c.body ? `\n  ${c.body}` : ''));
    const md = lines.join('\n');
    navigator.clipboard?.writeText(md).then(() => {
        copyMdBtn.textContent = 'copied!'; setTimeout(() => { copyMdBtn.textContent = 'copy as md'; }, 1500);
    }).catch(() => { copyMdBtn.textContent = 'failed'; setTimeout(() => { copyMdBtn.textContent = 'copy as md'; }, 1500); });
    console.log('[triage-live] copied board as md', md.length, 'chars');
});
els.prompt.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(false); }
});

if (els.exportBtn) els.exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ version: SCHEMA_VERSION, sessions: state.sessions, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `corpus-triage-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
});
if (els.importInput) els.importInput.addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
        const obj = JSON.parse(await f.text());
        if (obj.version !== SCHEMA_VERSION || typeof obj.sessions !== 'object') throw new Error('bad schema');
        state.sessions = obj.sessions;
        saveSessions();
        if (state.activeScenarioId) selectScenario(state.activeScenarioId);
        renderScenarios(); renderStats();
    } catch (err) { alert('import failed: ' + err.message); }
    e.target.value = '';
});

document.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    const vis = visibleScenarios();
    if (vis.length === 0) return;
    const idx = vis.findIndex(s => s.id === state.activeScenarioId);
    if (e.key === 'j') { e.preventDefault(); selectScenario(vis[Math.min(idx + 1, vis.length - 1)].id); }
    else if (e.key === 'k') { e.preventDefault(); selectScenario(vis[Math.max(idx - 1, 0)].id); }
    else if (e.key === '/') { e.preventDefault(); els.prompt.focus(); }
});

function render() {
    if (sdkRender) {
        sdkRender();
    } else {
        renderFilterBar();
        renderStats();
        renderActive();
        renderScratchpad();
        renderMessages();
    }
}

async function setupSdkApp() {
    const { components: C } = sdk;
    
    sdkRender = sdk.mount(appRoot, () => {
        const navItems = [
            ['today', './index.html#today'],
            ['subjects', './index.html#guides'],
            ['review', './index.html#review'],
            ['cases', './index.html#cases'],
            ['stats', './index.html#stats'],
            ['tutor', './triage-live.html']
        ];

        const sc = currentScenario();
        
        // Sidebar content
        const sidebar = C.h('div', { class: 'triage-side' },
            C.h('div', { class: 'filter-bar' },
                C.h('input', {
                    type: 'search', class: 'case-search', placeholder: 'search cases…',
                    value: state.searchQuery || '',
                    onInput: e => { state.searchQuery = e.target.value; render(); }
                }),
                C.h('div', { class: 'filter-chips-row' },
                    C.Btn({ 
                        variant: state.subjectFilter.size === 0 ? 'primary' : 'ghost',
                        onClick: () => { state.subjectFilter.clear(); render(); },
                        children: 'all'
                    }),
                    ...Array.from(new Set(state.scenarios.map(s => s.subject))).sort().map(subj => 
                        C.Btn({
                            variant: state.subjectFilter.has(subj) ? 'primary' : 'ghost',
                            onClick: () => { state.subjectFilter.has(subj) ? state.subjectFilter.delete(subj) : state.subjectFilter.add(subj); render(); },
                            children: subj
                        })
                    )
                )
            ),
            C.h('div', { class: 'stats-row' }, 
                `${Object.keys(state.sessions).length} attempted · streak ${state.streak || 0} · last grade ${state.lastGrade != null ? state.lastGrade + '%' : '—'}`
            ),
            C.h('div', { id: 'scenario-list' },
                ...visibleScenarios().map(s => {
                    const sess = state.sessions[s.id];
                    const cards = sessionCards(sess);
                    const score = sessionScore(sess);
                    const hasSession = cards.length > 0;
                    return C.Row({
                        state: state.activeScenarioId === s.id ? 'active' : 'default',
                        onClick: () => selectScenario(s.id),
                        children: [
                            C.h('div', {}, s.name),
                            C.h('div', { class: 'sub' }, score != null ? `${s.subject} · ${score}%` : (hasSession ? `${s.subject} · ${cards.length} cards` : s.subject))
                        ]
                    });
                })
            )
        );

        // Main content
        const mainContent = C.h('div', { class: 'triage-shell' },
            C.h('section', { class: 'triage-stage' },
                !sc ? C.h('div', { class: 'active-scenario panel' },
                    C.h('div', { class: 'panel-head' }, C.h('span', { class: 'title' }, 'select a case.')),
                    C.h('div', { class: 'muted' }, 'pick a case on the left to start.')
                ) : [
                    C.h('div', { class: `active-scenario panel rail-${sc.cat}` },
                        C.h('div', { class: 'panel-head' }, 
                            C.h('span', { class: 'title' }, sc.name),
                            C.h('span', { class: 'meta' }, `${sc.subject} · ${state.phase}`)
                        ),
                        C.h('div', { class: 'stem' }, caseStem(sc)),
                        state.phase === 'graded' ? renderGradePanel(sc) : [
                            C.h('div', { class: 'checklist' },
                                ...[
                                    { kind: 'differential', label: 'differentials', target: 3 },
                                    { kind: 'investigation', label: 'investigations', target: 2 },
                                    { kind: 'plan', label: 'plan', target: 1 }
                                ].map(item => {
                                    const count = countByKind(state.cards)[item.kind] || 0;
                                    const done = count >= item.target;
                                    return C.h('div', { class: `checklist-row${done ? ' done' : ''}` },
                                        C.h('span', { class: 'tick' }, done ? '●' : '◇'),
                                        C.h('span', {}, `${item.label}: ${count} / ${item.target}`)
                                    );
                                })
                            ),
                            C.h('div', { class: 'suggestion-chips' },
                                C.Btn({ variant: 'ghost', onClick: () => { els.prompt.value = 'what additional history would help?'; els.prompt.focus(); }, children: 'ask for more history' }),
                                C.Btn({ variant: 'ghost', onClick: () => { els.prompt.value = 'give me a hint without spoiling the answer.'; els.prompt.focus(); }, children: 'request a hint' }),
                                C.Btn({ 
                                    variant: 'primary', 
                                    onClick: () => { els.prompt.value = "i'm ready — grade my work."; send(false); },
                                    children: "i'm ready — grade me"
                                })
                            )
                        ]
                    ),
                    C.h('div', { class: 'scratchpad' },
                        state.cards.length === 0 ? C.h('div', { class: 'scratchpad-empty' }, 'your board is empty') :
                        state.cards.map(c => C.h('div', { class: `scratch-card${c.highlighted ? ' highlighted' : ''}` },
                            C.h('button', { class: 'closer', onClick: () => removeCard(c.id) }, '×'),
                            C.h('div', { class: 'kind' }, c.kind),
                            C.h('div', { class: 'title' }, c.title),
                            C.h('div', { class: 'body' }, c.body || '')
                        ))
                    )
                ]
            ),
            C.h('aside', { class: 'triage-chat' },
                C.AICat({
                    name: 'Clinical Tutor',
                    messages: state.messages.map(m => ({
                        role: m.role === 'system' ? 'assistant' : m.role,
                        text: m.content,
                        typing: m.role === 'assistant' && state.generating
                    })),
                    thinking: state.generating,
                    status: state.llmStatus === 'ready' ? 'online · ready' : (state.llmStatus === 'loading' ? 'loading…' : 'offline'),
                    composer: C.ChatComposer({
                        placeholder: 'talk to your tutor…',
                        onSend: (text) => { els.prompt.value = text; send(false); },
                        disabled: state.generating || !sc
                    })
                })
            )
        );

        return C.AppShell({
            topbar: C.Topbar({
                brand: 'corpus',
                leaf: 'tutor',
                items: navItems,
                active: 'tutor',
                onNav: (label) => {
                    const item = navItems.find(i => i[0] === label);
                    if (item) location.href = item[1];
                }
            }),
            side: sidebar,
            main: mainContent,
            status: C.Status({
                left: [C.h('span', { class: 'mono' }, state.capability === 'webgpu' ? 'WebGPU active' : 'WebGPU required')],
                right: [C.h('span', { class: 'mono' }, `v${window.__BUILD_VERSION__ || '0.1.0'}`)]
            })
        });
    });
}

(async () => {
    const loaded = loadSessions();
    state.sessions = loaded.sessions;
    state.streak = loaded.streak;
    
    try {
        sdk = await import('./247420.js');
        if (sdk && sdk.mount) {
            setupSdkApp();
        }
    } catch (e) {
        console.warn('[corpus] SDK load failed', e);
    }

    await checkCapability();
    await loadManifestAndScenarios();
    render();
})();



