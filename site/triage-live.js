const SUBJECTS = ['cardiology','diabetes','endocrine','gastroenterology','geriatric','nephrology','pulmonology','rheumatology'];
const SYSTEM_PROMPT_TMPL = `you are a clinical triage assistant. you reason out loud briefly and then act on a visual scratchpad by emitting JSON tool calls.

available tools (emit one per fenced block, language=tool):
\`\`\`tool
{"name":"add_card","args":{"id":"differ-1","kind":"differential|recommendation|warning|vital|plan|note","title":"short","body":"one or two sentences"}}
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

every turn you receive a fresh snapshot of the active scenario and the current scratchpad — you have no chat history. work from what is on screen now. when the user asks for differentials, add 3-5 differential cards. when they ask for a plan, add plan cards. always reason in 1-2 sentences before the tool blocks.

active scenario:
{{SCENARIO}}

current scratchpad ({{N}} cards):
{{CARDS}}`;

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
    onProgress: null
};
window.__triage = state;

const els = {
    capDot: document.getElementById('cap-dot'),
    capLabel: document.getElementById('cap-label'),
    list: document.getElementById('scenario-list'),
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
    simulate: document.getElementById('simulate')
};

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

function renderScenarios() {
    els.list.innerHTML = '';
    els.list.append(ce('div', { class: 'label' }, `// ${state.scenarios.length} scenarios`));
    const bySubject = {};
    for (const s of state.scenarios) (bySubject[s.subject] ||= []).push(s);
    for (const [subj, items] of Object.entries(bySubject)) {
        els.list.append(ce('div', { class: 'label', style: 'margin-top:14px' }, '// ' + subj));
        for (const sc of items) {
            els.list.append(ce('div', {
                class: 'scenario-row' + (state.activeScenarioId === sc.id ? ' active' : ''),
                data: { id: sc.id },
                on: { click: () => selectScenario(sc.id) }
            },
                ce('div', {}, sc.name),
                ce('div', { class: 'sub' }, `${sc.atoms.length} atoms · ${subj}`)
            ));
        }
    }
}

function selectScenario(id) {
    const sc = state.scenarios.find(x => x.id === id);
    if (!sc) return;
    state.activeScenarioId = id;
    state.cards = [];
    state.messages = [];
    renderScenarios();
    renderActive();
    renderScratchpad();
    renderMessages();
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
    els.activeScenario.append(
        ce('div', { class: 'panel-head' }, ce('span', { class: 'title' }, sc.name), ce('span', { class: 'meta' }, sc.subject)),
        ce('div', { class: 'muted' }, sc.description),
        Object.keys(sc.parameters).length ? ce('dl', { class: 'params' },
            ...Object.entries(sc.parameters).flatMap(([k, v]) => [
                ce('dt', {}, k),
                ce('dd', {}, String(v).slice(0, 160))
            ])
        ) : null,
        sc.atoms.length ? ce('div', { class: 'muted', style: 'margin-top:10px;font-family:var(--ff-mono);font-size:11px' }, `// ${sc.atoms.length} reasoning atoms attached`) : null
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

const CARD_KINDS = new Set(['differential', 'recommendation', 'warning', 'vital', 'plan', 'note']);

const TOOLS = {
    add_card({ id, kind, title, body }) {
        if (!CARD_KINDS.has(kind)) kind = 'note';
        if (!id) id = `${kind}-${++state.cardSeq}`;
        const exists = state.cards.find(c => c.id === id);
        if (exists) Object.assign(exists, { kind, title, body });
        else state.cards.push({ id, kind, title: title || '', body: body || '', highlighted: false });
        renderScratchpad();
        return { ok: true, id };
    },
    remove_card({ id }) {
        const i = state.cards.findIndex(c => c.id === id);
        if (i < 0) return { ok: false, error: 'not found' };
        state.cards.splice(i, 1);
        renderScratchpad();
        return { ok: true };
    },
    highlight_card({ id }) {
        for (const c of state.cards) c.highlighted = (c.id === id);
        renderScratchpad();
        return { ok: true };
    },
    clear_screen() {
        state.cards = [];
        renderScratchpad();
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

function buildSnapshot() {
    const sc = currentScenario();
    const scenarioText = sc ? `${sc.name} (${sc.subject})\n${sc.description}\nparameters: ${JSON.stringify(sc.parameters)}\natoms:\n${sc.atoms.slice(0, 10).map(a => `- ${a.atom}: ${(a.definition || '').slice(0, 220)}`).join('\n')}` : 'none — pick a scenario from the left first';
    const cardsText = state.cards.length === 0
        ? '(empty)'
        : state.cards.map(c => `- [${c.id}] ${c.kind}: ${c.title} — ${c.body}`).join('\n');
    return SYSTEM_PROMPT_TMPL
        .replace('{{SCENARIO}}', scenarioText)
        .replace('{{N}}', state.cards.length)
        .replace('{{CARDS}}', cardsText);
}
state.buildSnapshot = buildSnapshot;

async function loadLLM() {
    if (state.loadStarted) return;
    state.loadStarted = true;
    state.llmStatus = 'loading';
    els.modelStatus.textContent = 'loading…';
    els.loadLLM.disabled = true;
    els.progress.hidden = false;
    els.progressText.textContent = 'fetching transformers.js';
    try {
        const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0/dist/transformers.min.js');
        const { pipeline, env } = mod;
        env.allowLocalModels = false;
        els.progressText.textContent = 'downloading model (≈2GB) — first time only';
        const onProgress = (p) => {
            const pct = p && p.progress != null ? Math.round(p.progress) : 0;
            els.progressFill.style.width = pct + '%';
            if (p && p.file) els.progressText.textContent = `${p.status || ''} ${p.file} — ${pct}%`;
        };
        state.pipeline = await pipeline('text-generation', 'onnx-community/gemma-4-e2b-it-ONNX', {
            device: 'webgpu',
            progress_callback: onProgress
        });
        state.llmStatus = 'ready';
        els.modelStatus.textContent = 'ready';
        els.progressFill.style.width = '100%';
        els.progressText.textContent = 'cached locally — ready';
    } catch (e) {
        state.llmStatus = 'error';
        els.modelStatus.textContent = 'error';
        els.progressText.textContent = 'failed: ' + e.message + ' — use simulate instead';
        els.loadLLM.disabled = false;
        state.loadStarted = false;
    }
}

async function generateLLM(userText) {
    if (!state.pipeline) throw new Error('LLM not loaded');
    const sys = buildSnapshot();
    const messages = [
        { role: 'system', content: sys },
        { role: 'user', content: userText }
    ];
    const out = await state.pipeline(messages, { max_new_tokens: 384, temperature: 0.7, return_full_text: false });
    const text = Array.isArray(out) ? (out[0].generated_text?.at?.(-1)?.content || out[0].generated_text || '') : String(out);
    return typeof text === 'string' ? text : JSON.stringify(text);
}
state.generateLLM = generateLLM;

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
    let reply;
    try {
        reply = useSim || !state.pipeline
            ? simulateAssistant(txt)
            : await generateLLM(txt);
    } catch (e) {
        reply = `(error) ${e.message}`;
    }
    state.messages = [{ role: 'user', content: txt }, { role: 'assistant', content: reply }];
    pruneMessages();
    renderMessages();
    dispatchToolCalls(reply);
}

function simulateAssistant(userText) {
    const sc = currentScenario();
    if (!sc) return 'pick a scenario first.';
    const t = userText.toLowerCase();
    const blocks = [];
    if (t.includes('clear')) {
        return 'clearing the board.\n```tool\n{"name":"clear_screen","args":{}}\n```';
    }
    if (t.includes('different') || t.includes('ddx') || t.includes('plot')) {
        const atoms = sc.atoms.slice(0, 4);
        blocks.push(`based on the active scenario "${sc.name}" and ${state.cards.length} cards already on screen, here are the differentials i'd consider first:`);
        atoms.forEach((a, i) => {
            blocks.push('```tool\n' + JSON.stringify({ name: 'add_card', args: { id: `differ-${Date.now()}-${i}`, kind: 'differential', title: a.atom.slice(0, 60), body: (a.definition || '').slice(0, 220) } }) + '\n```');
        });
        return blocks.join('\n');
    }
    if (t.includes('plan') || t.includes('manage') || t.includes('treat')) {
        const ex = sc.examples[0] || {};
        return `recommended plan based on the scenario:\n\n` +
            '```tool\n' + JSON.stringify({ name: 'add_card', args: { id: `plan-${Date.now()}`, kind: 'plan', title: 'first-line plan', body: ex.recommendation || 'guideline-directed therapy.' } }) + '\n```\n' +
            '```tool\n' + JSON.stringify({ name: 'add_card', args: { id: `note-${Date.now()}`, kind: 'note', title: 'reasoning', body: ex.reasoning || sc.description } }) + '\n```';
    }
    if (t.includes('vital') || t.includes('observ')) {
        return 'pinning the vitals i would track:\n' +
            '```tool\n' + JSON.stringify({ name: 'add_card', args: { id: `vital-hr-${Date.now()}`, kind: 'vital', title: 'heart rate', body: '60–100 bpm; flag tachycardia >100 or bradycardia <60' } }) + '\n```\n' +
            '```tool\n' + JSON.stringify({ name: 'add_card', args: { id: `vital-bp-${Date.now()}`, kind: 'vital', title: 'blood pressure', body: 'target SBP 100-130; MAP ≥65 in shock' } }) + '\n```\n' +
            '```tool\n' + JSON.stringify({ name: 'add_card', args: { id: `vital-spo2-${Date.now()}`, kind: 'vital', title: 'spO2', body: '≥94% room air; titrate O2 to 88–92% in COPD' } }) + '\n```';
    }
    if (t.includes('warn') || t.includes('danger') || t.includes('red flag')) {
        return 'red flags to watch:\n' +
            '```tool\n' + JSON.stringify({ name: 'add_card', args: { id: `warn-${Date.now()}`, kind: 'warning', title: 'critical signs', body: 'altered mental status, sustained hypotension, rising lactate — escalate' } }) + '\n```';
    }
    return `i can plot differentials, draft a plan, list vitals, or flag warnings for "${sc.name}". try: "plot differentials" or "draft plan".`;
}
state.simulateAssistant = simulateAssistant;

els.send.addEventListener('click', () => send(false));
els.simulate.addEventListener('click', () => send(true));
els.loadLLM.addEventListener('click', loadLLM);
els.clearScreen.addEventListener('click', () => TOOLS.clear_screen());
els.prompt.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(false); }
});

(async () => {
    await checkCapability();
    await loadManifestAndScenarios();
    renderActive();
    renderScratchpad();
})();
