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

function caseStem(sc) {
    if (!sc) return '';
    const ex = (sc.examples && sc.examples[0]) || {};
    const stemRaw = (typeof ex === 'string' ? ex : (ex.case || ex.stem || ''));
    if (stemRaw && stemRaw.length > 20) return stemRaw.slice(0, 600);
    const desc = sc.description || '';
    const lead = desc.split(/[.!?]/)[0] || sc.name;
    return `${sc.name}. ${lead}. The patient presents to your service — you must work up and manage them. Commit your differentials, investigations, and plan as cards before requesting grading.`;
}

function safeStore() {
    try { return window.localStorage; } catch { return null; }
}
function loadSessions() {
    const ls = safeStore(); if (!ls) return {};
    try {
        const raw = ls.getItem(PERSIST_KEY);
        if (!raw) return {};
        const obj = JSON.parse(raw);
        if (obj && obj.version === SCHEMA_VERSION && obj.sessions) return obj.sessions;
        return {};
    } catch { return {}; }
}
function saveSessions() {
    const ls = safeStore(); if (!ls) return;
    try { ls.setItem(PERSIST_KEY, JSON.stringify({ version: SCHEMA_VERSION, sessions: state.sessions, savedAt: Date.now() })); }
    catch (e) { console.warn('persist failed', e); }
}
function persistActive() {
    if (!state.activeScenarioId) return;
    state.sessions[state.activeScenarioId] = state.cards.map(c => ({ id: c.id, kind: c.kind, title: c.title, body: c.body, highlighted: !!c.highlighted }));
    saveSessions();
    renderStats();
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
    clearScreen: document.getElementById('clear-screen'),
    simulate: document.getElementById('simulate'),
    submitGrading: document.getElementById('submit-grading')
};

function submitForGrading() {
    if (!currentScenario()) return;
    state.phase = 'grading';
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
    if (!navigator.gpu) {
        state.capability = 'unsupported';
        els.capDot.className = 'dot warn';
        els.capLabel.textContent = 'WebGPU unavailable';
        els.loadLLM.disabled = true;
        els.modelDetail.textContent = 'this browser does not expose navigator.gpu — try Chrome 113+ or Edge 113+. you can still use the simulate button below.';
        return;
    }
    try {
        const a = await navigator.gpu.requestAdapter();
        if (!a) throw new Error('no adapter');
        state.capability = 'webgpu';
        els.capDot.className = 'dot ok';
        els.capLabel.textContent = 'WebGPU ready';
    } catch (e) {
        state.capability = 'unsupported';
        els.capDot.className = 'dot warn';
        els.capLabel.textContent = 'no GPU adapter';
        els.loadLLM.disabled = true;
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
    if (state.subjectFilter.size === 0) return state.scenarios;
    return state.scenarios.filter(s => state.subjectFilter.has(s.subject));
}

function renderFilterBar() {
    if (!els.filterBar) return;
    els.filterBar.innerHTML = '';
    const subjects = Array.from(new Set(state.scenarios.map(s => s.subject))).sort();
    const allActive = state.subjectFilter.size === 0;
    els.filterBar.append(ce('button', {
        class: 'chip filter-chip' + (allActive ? ' active' : ''), type: 'button',
        'aria-pressed': String(allActive),
        on: { click: () => { state.subjectFilter.clear(); renderFilterBar(); renderScenarios(); } }
    }, 'all'));
    for (const subj of subjects) {
        const on = state.subjectFilter.has(subj);
        els.filterBar.append(ce('button', {
            class: 'chip filter-chip' + (on ? ' active' : ''), type: 'button',
            'aria-pressed': String(on),
            on: { click: () => { on ? state.subjectFilter.delete(subj) : state.subjectFilter.add(subj); renderFilterBar(); renderScenarios(); } }
        }, subj));
    }
}

function renderStats() {
    if (!els.statsRow) return;
    const sessions = state.sessions || {};
    const touched = Object.keys(sessions).length;
    let totalCards = 0;
    for (const id of Object.keys(sessions)) totalCards += (sessions[id] || []).length;
    els.statsRow.textContent = `// ${state.scenarios.length} scenarios · ${touched} touched · ${totalCards} cards placed`;
}

function renderScenarios() {
    els.list.innerHTML = '';
    const vis = visibleScenarios();
    const bySubject = {};
    for (const s of vis) (bySubject[s.subject] ||= []).push(s);
    if (vis.length === 0) {
        els.list.append(ce('div', { class: 'label' }, '// no scenarios match filter'));
        return;
    }
    for (const [subj, items] of Object.entries(bySubject)) {
        els.list.append(ce('div', { class: 'label', style: 'margin-top:14px' }, `// ${subj} (${items.length})`));
        for (const sc of items) {
            const hasSession = state.sessions[sc.id] && state.sessions[sc.id].length > 0;
            els.list.append(ce('div', {
                class: 'scenario-row' + (state.activeScenarioId === sc.id ? ' active' : '') + (hasSession ? ' has-session' : ''),
                data: { id: sc.id },
                role: 'button', tabindex: '0',
                'aria-pressed': String(state.activeScenarioId === sc.id),
                on: {
                    click: () => selectScenario(sc.id),
                    keydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectScenario(sc.id); } }
                }
            },
                ce('div', {}, sc.name),
                ce('div', { class: 'sub' }, `${subj}${hasSession ? ' · ●' : ''}`)
            ));
        }
    }
}

function selectScenario(id) {
    const sc = state.scenarios.find(x => x.id === id);
    if (!sc) return;
    state.activeScenarioId = id;
    const saved = state.sessions[id] || [];
    state.cards = saved.map(c => ({ ...c }));
    state.cardSeq = state.cards.length;
    state.messages = [];
    state.phase = 'asking';
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

function renderActive() {
    els.activeScenario.innerHTML = '';
    const sc = currentScenario();
    if (!sc) {
        els.activeScenario.append(
            ce('div', { class: 'panel-head' }, ce('span', { class: 'title' }, 'no scenario selected'), ce('span', { class: 'meta' }, 'pick one from the left')),
            ce('div', { class: 'muted' }, 'this is your scratchpad — the assistant places differentials, recommendations, vitals, plans, and warnings as cards here. each turn it sees only the current screen, not the chat history.')
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
    const gradeBtn = ce('button', {
        class: 'run-btn' + (ready ? '' : ' disabled'),
        on: { click: () => {
            state.phase = 'grading';
            renderActive();
            els.prompt.value = 'grade my work';
            send(true).then(() => renderActive());
        } },
        ...(ready ? {} : { disabled: 'true' })
    }, state.phase === 'graded' ? 'graded — pick another scenario' : 'submit for grading');
    els.activeScenario.append(
        ce('div', { class: 'panel-head' }, ce('span', { class: 'title' }, sc.name), ce('span', { class: 'meta' }, `${sc.subject} · phase: ${state.phase}`)),
        ce('div', { class: 'muted', style: 'font-size:14px;line-height:1.55;margin-bottom:12px' }, stem),
        ce('div', { class: 'muted small', style: 'font-family:var(--ff-mono);font-size:11px;color:var(--panel-text-3);margin-bottom:6px' }, '// commit your work as cards — atoms revealed only after grading'),
        checklistEl,
        gradeBtn
    );
}

function currentScenario() {
    return state.scenarios.find(x => x.id === state.activeScenarioId) || null;
}

function renderScratchpad() {
    els.scratchpad.innerHTML = '';
    if (state.cards.length === 0) {
        els.scratchpad.append(ce('div', { class: 'scratchpad-empty' }, 'scratchpad empty — ask the assistant to plot differentials, suggest a workup, or flag warnings'));
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

function removeCard(id) { TOOLS.remove_card({ id }); }

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

function spawnWorker() {
    if (state.worker) return state.worker;
    try {
        state.worker = new Worker('./triage-llm-worker.js', { type: 'module' });
        state.worker.addEventListener('message', onWorkerMessage);
        state.worker.addEventListener('error', e => {
            state.llmStatus = 'error';
            els.modelStatus.textContent = 'worker error';
            els.progressText.textContent = 'worker failed: ' + (e.message || 'unknown') + ' — use simulate instead';
            els.loadLLM.disabled = false;
            state.loadStarted = false;
            state.worker = null;
        });
    } catch (e) {
        state.worker = null;
        throw e;
    }
    return state.worker;
}

function onWorkerMessage(e) {
    const m = e.data || {};
    if (m.status === 'loading') {
        els.progressText.textContent = `loading ${m.stage}…`;
    } else if (m.status === 'progress') {
        const p = m.payload || {};
        const pct = p.progress != null ? Math.round(p.progress) : 0;
        els.progressFill.style.width = pct + '%';
        if (p.file) els.progressText.textContent = `${p.status || ''} ${p.file} — ${pct}%`;
    } else if (m.status === 'ready') {
        state.workerReady = true;
        state.llmStatus = 'ready';
        els.modelStatus.textContent = 'ready';
        els.progressFill.style.width = '100%';
        els.progressText.textContent = 'cached locally — ready';
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
        const last = state.messages[state.messages.length - 1];
        const msg = `(worker error) ${m.error}`;
        if (last && last.role === 'assistant' && !last.content) last.content = msg;
        else state.messages.push({ role: 'assistant', content: msg });
        renderMessages();
        if (state._afterGenerate) { const cb = state._afterGenerate; state._afterGenerate = null; cb(); }
    }
}

async function loadLLM() {
    if (state.loadStarted) return;
    state.loadStarted = true;
    state.llmStatus = 'loading';
    els.modelStatus.textContent = 'loading…';
    els.loadLLM.disabled = true;
    els.progress.hidden = false;
    els.progressText.textContent = 'spawning worker…';
    try {
        const w = spawnWorker();
        if (!w) throw new Error('worker unavailable');
        w.postMessage({ type: 'load' });
    } catch (e) {
        state.llmStatus = 'error';
        els.modelStatus.textContent = 'error';
        els.progressText.textContent = 'failed: ' + e.message + ' — use simulate instead';
        els.loadLLM.disabled = false;
        state.loadStarted = false;
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

function pruneMessages() {
    if (state.messages.length > 2) state.messages = state.messages.slice(-2);
}

async function send(useSim = false) {
    const txt = els.prompt.value.trim();
    if (!txt) return;
    if (!currentScenario()) {
        state.messages.push({ role: 'system', content: 'pick a scenario first.' });
        renderMessages();
        return;
    }
    els.prompt.value = '';
    state.messages = [{ role: 'user', content: txt }];
    renderMessages();
    const useLLM = !useSim && state.worker && state.workerReady;
    if (useLLM) {
        try { await generateLLM(txt); }
        catch (e) {
            const reply = `(error) ${e.message} — falling back to simulate.\n\n` + simulateAssistant(txt);
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
    pruneMessages();
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
        blocks.push(`\n— ${hits}/${atoms.length} canonical atoms matched (${score}%). ${misses ? 'gaps added as note cards above.' : 'good cover.'}`);
        state.phase = 'graded';
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
if (els.submitGrading) els.submitGrading.addEventListener('click', submitForGrading);
els.simulate.addEventListener('click', () => send(true));
els.loadLLM.addEventListener('click', loadLLM);
els.clearScreen.addEventListener('click', () => TOOLS.clear_screen());
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
    state.sessions = loadSessions();
    await checkCapability();
    await loadManifestAndScenarios();
    renderFilterBar();
    renderStats();
    renderActive();
    renderScratchpad();
})();
