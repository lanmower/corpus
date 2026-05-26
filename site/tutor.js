// Corpus study tutor — real Bonsai-1.7B (1-bit) inference via transformers.js + WebGPU.
// Runs as a WebWorker. Speaks the {cmd, ...} protocol the tutor-panel expects.
//
// Based on the official Bonsai-WebGPU demo:
//   https://huggingface.co/spaces/webml-community/bonsai-webgpu
//
// Replaces the prior template-based implementation. No fake streaming, no canned
// responses. When WebGPU is unavailable we emit a clear 'unavailable' event and
// the panel surfaces a "WebGPU required" message — we do NOT pretend to be the LLM.

import {
    pipeline,
    TextStreamer,
    DynamicCache,
    InterruptableStoppingCriteria
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js';

const MODEL_ID = 'onnx-community/Bonsai-1.7B-ONNX';

const state = {
    generator: null,
    ready: false,
    loadPromise: null,
    pastKV: null,
    stopping: new InterruptableStoppingCriteria(),
    interrupted: false,  // worker-owned flag (transformers' #interrupted is private)
    history: [],         // [{role, content}] chat history (last 12 turns)
    guideIndex: []       // [{subject, title, body, level, line}]
};

const log = (...a) => self.postMessage({ event: 'log', msg: a.join(' ') });
const warn = (...a) => self.postMessage({ event: 'warn', msg: a.join(' ') });

async function loadModelOnce() {
    self.postMessage({ event: 'model-loading', stage: 'probing webgpu' });
    if (!('gpu' in navigator)) throw new Error('navigator.gpu missing — WebGPU required');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('no WebGPU adapter');

    self.postMessage({ event: 'model-loading', stage: 'downloading Bonsai-1.7B (1-bit)' });
    state.generator = await pipeline('text-generation', MODEL_ID, {
        device: 'webgpu',
        dtype: 'q1',
        progress_callback: (info) => {
            if (info?.status === 'progress_total' || info?.status === 'progress') {
                self.postMessage({
                    event: 'model-downloading',
                    loaded: Number(info.loaded ?? 0),
                    total: Number(info.total ?? 0),
                    progress: Number(info.progress ?? 0)
                });
            }
        }
    });

    self.postMessage({ event: 'model-loading', stage: 'optimizing for 1-bit execution' });
    const warm = state.generator.tokenizer('a');
    await state.generator.model.generate({ ...warm, max_new_tokens: 1 });

    state.ready = true;
    self.postMessage({ event: 'ready' });
}

function ensureLoaded() {
    if (state.ready) return Promise.resolve();
    if (!state.loadPromise) {
        state.loadPromise = loadModelOnce().catch(err => {
            state.loadPromise = null;
            self.postMessage({ event: 'unavailable', error: String(err?.message || err) });
            throw err;
        });
    }
    return state.loadPromise;
}

// Run inference, stream tokens, return final text.
async function runChat(messages, { doneEvent = 'coaching-done', maxTokens = 320 } = {}) {
    if (!state.ready) {
        self.postMessage({ event: 'unavailable', error: 'model not ready' });
        return '';
    }
    state.stopping.reset();
    state.interrupted = false;
    self.postMessage({ event: 'coaching-start' });
    let buf = '';
    const streamer = new TextStreamer(state.generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (chunk) => {
            buf += chunk;
            self.postMessage({ event: 'token', token: chunk });
        }
    });
    state.pastKV ??= new DynamicCache();
    try {
        const out = await state.generator(messages, {
            max_new_tokens: maxTokens,
            do_sample: false,
            streamer,
            stopping_criteria: state.stopping,
            past_key_values: state.pastKV
        });
        const content = out?.[0]?.generated_text?.at?.(-1)?.content ?? buf;
        const interrupted = state.interrupted === true;
        // KV cache lifecycle is owned here, after the generate promise settles —
        // never disposed mid-generation by the stop handler (avoids a use-after-free race).
        if (interrupted) { state.pastKV?.dispose?.(); state.pastKV = null; }
        self.postMessage({ event: doneEvent, message: content, interrupted });
        return content;
    } catch (e) {
        self.postMessage({ event: 'error', error: String(e?.message || e) });
        return '';
    }
}

function pushHistory(role, content) {
    state.history.push({ role, content });
    if (state.history.length > 12) state.history = state.history.slice(-12);
}

// ----- guide indexing (used to ground guide-question answers) -----
function buildGuideIndex(shard) {
    if (!shard || !shard.guide || !Array.isArray(shard.guide.sections)) return;
    const subject = shard.subject || 'unknown';
    state.guideIndex = state.guideIndex.filter(s => s.subject !== subject);
    for (const section of shard.guide.sections) {
        state.guideIndex.push({
            subject,
            title: section.title || '',
            body: section.body || section.text || '',
            level: section.level || 1,
            line: section.line || 0
        });
    }
}

function searchGuideIndex(query, k = 3) {
    if (!query) return [];
    const terms = String(query).toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (!terms.length) return [];
    const scored = [];
    for (const section of state.guideIndex) {
        const hay = (section.title + ' ' + section.body).toLowerCase();
        let score = 0;
        for (const t of terms) {
            if (section.title.toLowerCase().includes(t)) score += 5;
            if (hay.includes(t)) score += 1;
        }
        if (score > 0) scored.push({ section, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map(x => x.section);
}

// ----- system prompts per handler -----
const SYS = {
    coach: `you are a brief, specific medical-study coach. the student just reviewed a flashcard. given the card and the grade they gave it (0=blackout, 4=perfect), respond in 2-3 sentences: acknowledge the grade, reinforce the key concept from the card answer, and give one concrete next step. be warm but not flowery. no filler.`,
    session: `you are planning today's medical-study session. given the user's due-card count, new-card budget, weakest subject, and days until exam, write a short personalized plan (3-4 sentences). lead with a greeting suited to the time of day. end with one specific action.`,
    guide: `you are answering a medical-study question using the user's own study guide. ground your answer in the provided guide sections; do NOT invent information not in the sections. cite the section titles you used. keep it under 6 sentences.`,
    triage: `you are giving a Socratic hint on a triage scenario. given the case description and the cards the student has already placed, give ONE short hint that nudges them toward the next clinical reasoning step. do NOT reveal the diagnosis or the canonical plan.`,
    chat: `you are the user's medical-study tutor. you are conversational, concise, and grounded in the user's actual study material. when the user asks you to do something on the page (open a guide, start a review, navigate), emit a fenced tool block as described below. otherwise answer in 1-4 sentences.`
};

const TOOL_SPEC = `available page-control tools — emit each in its own fenced block, language=tool:
\`\`\`tool
{"name":"navigate","args":{"route":"today|calendar|guides|review|cases|stats"}}
\`\`\`
\`\`\`tool
{"name":"open_guide","args":{"subject":"cardiology","anchor":"optional-section-id"}}
\`\`\`
\`\`\`tool
{"name":"start_session","args":{"subject":"cardiology"}}
\`\`\``;

// ----- message handlers -----
self.addEventListener('message', async (e) => {
    const data = e.data || {};
    const cmd = data.cmd;
    try {
        if (cmd === 'init' || cmd === 'load-model') {
            await ensureLoaded();
            return;
        }
        if (cmd === 'load-guide-shard') {
            buildGuideIndex(data.shard);
            return;
        }
        if (cmd === 'card-loaded') {
            // No-op — kept for protocol compat.
            return;
        }
        if (cmd === 'reset-history') {
            state.history = [];
            state.pastKV?.dispose?.();
            state.pastKV = null;
            return;
        }
        if (cmd === 'seed-history') {
            // Replay persisted turns into the worker so the LLM context matches
            // what the user sees on the page (single source of truth = panel).
            const turns = Array.isArray(data.history) ? data.history : [];
            state.history = turns
                .filter(t => t && (t.role === 'user' || t.role === 'assistant') && t.content)
                .slice(-12);
            // A fresh KV cache must accompany a reseeded history.
            state.pastKV?.dispose?.();
            state.pastKV = null;
            return;
        }
        if (cmd === 'stop') {
            // Only signal interruption. The KV cache is owned by runChat and disposed
            // there after the generate promise settles — never freed mid-generation.
            state.interrupted = true;
            state.stopping.interrupt();
            return;
        }

        // All chat-driven commands need the model.
        await ensureLoaded();

        if (cmd === 'generate-coaching') {
            const { front = '', back = '', grade, subject = '' } = data;
            const user = `subject: ${subject}\ncard front: ${front}\ncard back: ${back}\ngrade given: ${grade} (0=blackout, 4=perfect)\n\ngive me coaching for this review.`;
            await runChat([{ role: 'system', content: SYS.coach }, { role: 'user', content: user }],
                { doneEvent: 'review-coaching-done', maxTokens: 220 });
            return;
        }

        if (cmd === 'session-overview') {
            const { dueCount = 0, newCount = 0, weakestSubject = '', examDaysLeft = null } = data;
            const user = `due cards: ${dueCount}\nnew cards available: ${newCount}\nweakest subject: ${weakestSubject || 'unknown'}\ndays until exam: ${examDaysLeft != null ? examDaysLeft : 'unknown'}\nlocal hour: ${new Date().getHours()}\n\nplan my session.`;
            await runChat([{ role: 'system', content: SYS.session }, { role: 'user', content: user }],
                { doneEvent: 'session-overview-done', maxTokens: 220 });
            return;
        }

        if (cmd === 'guide-question') {
            const question = data.question || '';
            const sections = searchGuideIndex(question, 3);
            const ctx = sections.length
                ? sections.map((s, i) => `[${i + 1}] ${s.subject} — ${s.title}\n${(s.body || '').slice(0, 600)}`).join('\n\n')
                : '(no matching guide sections were indexed yet — answer from general clinical knowledge but say so)';
            const user = `question: ${question}\n\nguide sections you may use:\n${ctx}`;
            await runChat([{ role: 'system', content: SYS.guide }, { role: 'user', content: user }],
                { doneEvent: 'guide-answer-done', maxTokens: 320 });
            return;
        }

        if (cmd === 'triage-hint') {
            const { scenarioId = '', caseDescription = '', cardPlaced = [] } = data;
            const cards = Array.isArray(cardPlaced) && cardPlaced.length
                ? cardPlaced.map(c => `- ${c.kind || 'note'}: ${c.title || ''}`).join('\n')
                : '(none yet)';
            const user = `scenario: ${scenarioId}\ncase: ${caseDescription}\nstudent has placed:\n${cards}\n\ngive one Socratic hint.`;
            await runChat([{ role: 'system', content: SYS.triage }, { role: 'user', content: user }],
                { doneEvent: 'triage-hint-done', maxTokens: 120 });
            return;
        }

        if (cmd === 'user-message') {
            const text = data.text || '';
            pushHistory('user', text);
            const sysWithTools = `${SYS.chat}\n\n${TOOL_SPEC}`;
            const messages = [{ role: 'system', content: sysWithTools }, ...state.history];
            const reply = await runChat(messages, { doneEvent: 'coaching-done', maxTokens: 300 });
            // Don't pollute context with an empty assistant turn (e.g. immediate stop or error).
            if (reply && reply.trim()) pushHistory('assistant', reply);
            return;
        }

        warn('unknown cmd', cmd);
    } catch (err) {
        self.postMessage({ event: 'error', error: String(err?.message || err) });
    }
});
