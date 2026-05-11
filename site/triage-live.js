import './theme.js';
import * as progress from './progress.js';
const SUBJECTS = ['cardiology','diabetes','endocrine','gastroenterology','geriatric','nephrology','pulmonology','rheumatology'];
const SYSTEM_PROMPT_TMPL = `you are a Socratic clinical examiner. the student is being tested. you do NOT give them the answer.

your job in phase=asking:
- read the case stem and the cards the student has already placed
- ask probing questions that force the student to commit a differential / investigation / plan in their own words
- if the student tries to ask "what is the differential?" or "what's the plan?", refuse — turn the question back: "what do YOU think? add three cards with your top differentials and i will grade them."
- you may add a 'note' card to clarify the case stem (e.g. extra history) but you must NOT add differential / recommendation / plan / vital cards yourself in this phase. let the student supply them.

your job in phase=grading:
- compare the student's cards against the answer key (provided in this prompt only when grading)
- for each canonical atom the student got right, emit highlight_card on the matching student card
- for each canonical atom the student missed, emit add_card kind=note with title="missed: <atom>" so the gap is visible
- finish with one short feedback sentence

available tools (emit one per fenced block, language=tool):
\`\`\`tool
{"name":"add_card","args":{"id":"note-1","kind":"differential|recommendation|warning|vital|plan|note","title":"short","body":"one or two sentences"}}
\`\`\`
\`\`\`tool
{"name":"remove_card","args":{"id":"note-1"}}
\`\`\`
\`\`\`tool
{"name":"highlight_card","args":{"id":"differ-1"}}
\`\`\`
\`\`\`tool
{"name":"clear_screen","args":{}}
\`\`\`

every turn you receive a fresh snapshot — you have no chat history. work from what is on screen now.

phase: {{PHASE}}

case stem:
{{STEM}}

current scratchpad ({{N}} cards — these are the student's commitments):
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

function submitForGrading() {
    if (!currentScenario()) return;
    state.phase = 'grading';
    progress.bumpCase(1);
    renderActive();
    els.prompt.value = 'grade my work';
    send(true).then(() => renderActive());
}
state.submitForGrading = submitForGrading;

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
        els.capDot.className = 'dot ok';
        els.capLabel.textContent = 'tutor ready (offline)';
        els.loadLLM.disabled = true;
        els.modelDetail.textContent = 'using built-in offline tutor — no setup needed. type or use the buttons to add cards, then submit for grading.';
        console.log('[triage-live] capability: gpu absent — using simulator');
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
        els.capLabel.textContent = 'tutor ready';
        els.modelDetail.textContent = 'offline tutor active. for an experimental LLM tutor (~250MB download), click "load tutor" below.';
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
    await Promise.all(SUBJECTS.map(async s => {
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
            els.list.append(ce('div', {
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
            ));
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
}

function countByKind(cards) {
    const out = {};
    for (const c of cards) out[c.kind] = (out[c.kind] || 0) + 1;
    return out;
}

function renderQuickAdd() {
    const kinds = [
        { kind: 'differential', label: '+ differential', placeholder: 'e.g. acute coronary syndrome' },
        { kind: 'investigation', label: '+ investigation', placeholder: 'e.g. ECG, troponin' },
        { kind: 'plan', label: '+ plan', placeholder: 'e.g. aspirin 300mg, GTN, oxygen' }
    ];
    const wrap = ce('div', { class: 'quick-add' });
    for (const k of kinds) {
        let input;
        const commit = () => {
            const v = input.value.trim();
            if (!v) return;
            const title = v.slice(0, 80);
            const body = v.length > 80 ? v.slice(80) : '';
            TOOLS.add_card({ id: `student-${k.kind}-${Date.now()}`, kind: k.kind, title, body });
            input.value = '';
            renderActive();
        };
        input = ce('input', {
            type: 'text', class: 'qa-input', placeholder: k.placeholder,
            'aria-label': `add ${k.kind}`,
            on: { keydown: e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } } }
        });
        wrap.append(ce('div', { class: 'qa-row' },
            ce('label', { class: 'qa-label' }, k.label),
            input,
            ce('button', { class: 'chip qa-go', on: { click: commit } }, 'add')
        ));
    }
    return wrap;
}

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
        } } }, 'next case →')
    ));
    return wrap;
}

function renderActive() {
    els.activeScenario.innerHTML = '';
    const sc = currentScenario();
    if (!sc) {
        els.activeScenario.append(
            ce('div', { class: 'panel-head' }, ce('span', { class: 'title' }, 'select a case.'), ce('span', { class: 'meta' }, 'choose one from the list')),
            ce('div', { class: 'muted' }, 'write differentials, investigations, plan as cards. submit for grading.')
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
            ce('span', { class: 'tick' }, (counts[item.kind] || 0) >= item.target ? '●' : '○'),
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
        const gradeBtn = ce('button', {
            class: 'run-btn' + (ready ? '' : ' disabled'),
            on: { click: () => {
                state.phase = 'grading';
                renderActive();
                els.prompt.value = 'grade my work';
                send(true).then(() => renderActive());
            } },
            ...(ready ? {} : { disabled: 'true' })
        }, ready ? 'submit for grading' : `add ${totalNeeded - totalGot} more to submit`);
        els.activeScenario.append(
            ce('div', { class: 'stem-hint' }, 'add cards via the buttons below or type "add differential: …" in the chat. answer key stays hidden until you submit.'),
            checklistEl,
            renderQuickAdd(),
            gradeBtn
        );
    }
}

function currentScenario() {
    return state.scenarios.find(x => x.id === state.activeScenarioId) || null;
}

function renderScratchpad() {
    els.scratchpad.innerHTML = '';
    if (state.cards.length === 0) {
        els.scratchpad.append(ce('div', { class: 'scratchpad-empty' }, '(empty) — type "add differential: …", "add investigation: …", or "add plan: …"'));
        return;
    }
    for (const c of state.cards) {
        els.scratchpad.append(ce('div', {
            class: 'scratch-card' + (c.highlighted ? ' highlighted' : ''),
            data: { id: c.id, kind: c.kind }
        },
            ce('button', { class: 'closer', on: { click: () => removeCard(c.id) } }, '×'),
            ce('div', { class: 'kind' }, c.kind),
            ce('div', { class: 'title' }, c.title),
            ce('div', { class: 'body' }, c.body || '')
        ));
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
    }
};

function dispatchToolCalls(text) {
    const re = /```tool\s*\n([\s\S]*?)\n```/g;
    let m, count = 0;
    while ((m = re.exec(text))) {
        let parsed;
        try { parsed = JSON.parse(m[1].trim()); } catch { continue; }
        const fn = TOOLS[parsed.name];
        if (!fn) continue;
        try { fn(parsed.args || {}); count++; } catch (e) { console.error('tool error', e); }
    }
    return count;
}
state.dispatchToolCalls = dispatchToolCalls;

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
    els.modelDetail.textContent = 'couldn’t load the in-browser tutor — switching to offline mode.';
    els.progress.hidden = false;
    els.progressFill.style.width = '0%';
    els.progressText.textContent = 'using offline tutor';
    els.loadLLM.disabled = false;
    state.loadStarted = false;
    state.messages.push({ role: 'system', content: 'your tutor is in offline mode — you can still work cases.' });
    renderMessages();
    console.error('[triage-live] webgpu error', reason, stack);
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
        if (last && last.role === 'assistant') last.content = state.streamBuffer;
        renderMessages();
    } else if (m.status === 'complete') {
        const text = m.output || state.streamBuffer;
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === 'assistant') last.content = text;
        state.generating = false;
        renderMessages();
        dispatchToolCalls(text);
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
            state.messages.push({ role: 'system', content: 'tutor offline — using simulator.' });
            renderMessages();
            const reply = simulateAssistant(txt);
            state.messages.push({ role: 'assistant', content: reply });
            renderMessages();
            dispatchToolCalls(reply);
        }
    } else {
        let reply;
        try { reply = simulateAssistant(txt); }
        catch (e) { reply = `(error) ${e.message}`; }
        state.messages.push({ role: 'assistant', content: reply });
        renderMessages();
        dispatchToolCalls(reply);
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

function simulateAssistant(userText) {
    const sc = currentScenario();
    if (!sc) return 'pick a scenario first.';
    const t = userText.toLowerCase();
    if (t.includes('clear')) {
        return 'clearing the board.\n```tool\n{"name":"clear_screen","args":{}}\n```';
    }

    if (state.phase === 'grading') {
        const studentTokens = state.cards.map(c => ({ c, tok: tokenize(`${c.title} ${c.body}`) }));
        const blocks = [`grading your ${state.cards.length} cards against the answer key for "${sc.name}".`];
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
        const ex = (sc.examples && sc.examples[0]) || {};
        if (ex.recommendation) {
            blocks.push('```tool\n' + JSON.stringify({ name: 'add_card', args: { id: `key-rec-${Date.now()}`, kind: 'recommendation', title: 'canonical plan', body: ex.recommendation.slice(0, 240) } }) + '\n```');
        }
        const score = atoms.length ? Math.round(100 * hits / atoms.length) : 0;
        blocks.push(`\n— ${hits} of ${atoms.length} key topics matched (${score}%). ${misses ? 'gaps shown as notes on your board.' : 'good coverage.'}`);
        state.lastGrade = score;
        state.streak = score >= 70 ? (state.streak || 0) + 1 : 0;
        state.phase = 'graded';
        persistActive();
        saveSessions();
        renderStats();
        try {
            const ch = ('BroadcastChannel' in self) ? new BroadcastChannel('corpus') : null;
            ch?.postMessage({ type: 'case:graded', score: score / 100, scenarioId: sc.id || sc.name });
            ch?.close();
        } catch {}
        return blocks.join('\n');
    }

    // asking phase — Socratic only, never reveal atoms
    const counts = countByKind(state.cards);
    const totalCommit = (counts.differential || 0) + (counts.investigation || 0) + (counts.plan || 0);
    if (t.match(/what (is|are|should)|tell me|give me|hint|answer|differential|plan|treat|manage|investig/) && totalCommit < 3) {
        return `i won't hand you the answer — you're being examined. read the case stem, then add YOUR best three differentials, two investigations, and one plan as cards (use the + button on the scratchpad or the chat — say "add differential: <your guess>"). i'll grade them when you submit.`;
    }
    const m = t.match(/^add\s+(differential|investigation|plan|vital|warning|note)\s*[:\-]?\s*(.+)$/i);
    if (m) {
        const kind = m[1].toLowerCase();
        const title = m[2].trim().slice(0, 60);
        return `recording your ${kind}: "${title}". what is your reasoning?\n` +
            '```tool\n' + JSON.stringify({ name: 'add_card', args: { id: `student-${kind}-${Date.now()}`, kind, title, body: '(your commitment — add reasoning by editing or asking me)' } }) + '\n```';
    }
    if (totalCommit === 0) {
        return `case stem is on the left. what are the top three differentials YOU would consider here? type "add differential: <your guess>" three times, then add two investigations and a plan, then submit for grading.`;
    }
    if ((counts.differential || 0) < 3) {
        return `you have ${counts.differential || 0} of 3 differentials. what else could explain this presentation? add the next one with "add differential: <name>".`;
    }
    if ((counts.investigation || 0) < 2) {
        return `differentials look in place. what investigations would discriminate between them? add with "add investigation: <test>".`;
    }
    if ((counts.plan || 0) < 1) {
        return `now commit your plan with "add plan: <first-line therapy>". then click submit for grading.`;
    }
    return `you have committed ${counts.differential || 0} differentials, ${counts.investigation || 0} investigations, ${counts.plan || 0} plan. click "submit for grading" when ready — i won't reveal the answer key until you do.`;
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
    else if (e.key === 'c') { e.preventDefault(); TOOLS.clear_screen(); }
    else if (e.key === '/') { e.preventDefault(); els.prompt.focus(); }
});

(async () => {
    const loaded = loadSessions();
    state.sessions = loaded.sessions;
    state.streak = loaded.streak;
    await checkCapability();
    await loadManifestAndScenarios();
    renderFilterBar();
    renderStats();
    renderActive();
    renderScratchpad();
})();
