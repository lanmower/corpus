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
// Keep in step with WORKER_CONTEXT_TURNS in tutor-store.js (panel keeps 40 visible).
const WORKER_CONTEXT_TURNS = 16;

const state = {
    generator: null,
    ready: false,
    loadPromise: null,
    stopping: new InterruptableStoppingCriteria(),
    interrupted: false,  // worker-owned flag (transformers' #interrupted is private)
    generating: false,   // true between coaching-start and the generate promise settling
    history: [],         // [{role, content}] chat history (last WORKER_CONTEXT_TURNS)
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
                onLoadProgress(); // pulse the stall watchdog: a healthy download keeps it alive
                self.postMessage({
                    event: 'model-downloading',
                    loaded: Number(info.loaded ?? 0),
                    total: Number(info.total ?? 0),
                    progress: Number(info.progress ?? 0)
                });
            }
        }
    });

    self.postMessage({ event: 'model-loading', stage: 'optimizing (first run is slower)' });
    const warm = state.generator.tokenizer('a');
    await state.generator.model.generate({ ...warm, max_new_tokens: 1 });

    state.ready = true;
    self.postMessage({ event: 'ready' });
}

// Stall watchdog. A fixed total-load cap (the old 180s) wrongly failed a slow but
// HEALTHY download (a 1.7B model can legitimately take 10+ min on a slow link),
// surfacing "model load timed out" error turns mid-download. Instead we fail only
// when the download makes NO progress for STALL_TIMEOUT_MS — distinguishing a dead
// fetch from a slow one. Each progress event pulses the deadline forward.
const STALL_TIMEOUT_MS = 90000; // no progress for 90s = genuinely stalled
let _stallPulse = null; // called by the progress callback to reset the deadline
function onLoadProgress() { if (_stallPulse) _stallPulse(); }

// Race `promise` against a stall watchdog. The watchdog only fires after
// STALL_TIMEOUT_MS with no onLoadProgress() pulse; any progress restarts the clock.
function withStallGuard(promise, label) {
    let timer;
    const stall = new Promise((_, reject) => {
        const arm = () => {
            clearTimeout(timer);
            timer = setTimeout(() => reject(new Error(`${label} stalled (no progress for ${Math.round(STALL_TIMEOUT_MS / 1000)}s)`)), STALL_TIMEOUT_MS);
        };
        _stallPulse = arm;
        arm(); // arm immediately so a fetch that never starts still fails
    });
    return Promise.race([promise, stall]).finally(() => { clearTimeout(timer); _stallPulse = null; });
}

async function loadWithRetry() {
    try {
        return await withStallGuard(loadModelOnce(), 'model load');
    } catch (first) {
        // A WebGPU-absence error is terminal — don't retry, it won't appear.
        if (/webgpu|adapter/i.test(String(first?.message || first))) throw first;
        self.postMessage({ event: 'model-loading', stage: 'retrying download…' });
        state.ready = false;
        state.generator = null;
        return await withStallGuard(loadModelOnce(), 'model load (retry)');
    }
}

function ensureLoaded() {
    if (state.ready) return Promise.resolve();
    if (!state.loadPromise) {
        state.loadPromise = loadWithRetry().catch(err => {
            state.loadPromise = null;
            self.postMessage({ event: 'unavailable', error: String(err?.message || err) });
            throw err;
        });
    }
    return state.loadPromise;
}

// Run inference, stream tokens, return final text.
async function runChat(messages, { doneEvent = 'coaching-done', maxTokens = 320, sample = false } = {}) {
    if (!state.ready) {
        self.postMessage({ event: 'unavailable', error: 'model not ready' });
        return '';
    }
    state.stopping.reset();
    state.interrupted = false;
    state.generating = true;
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
    // Each runChat call re-tokenizes the COMPLETE messages array (system + full
    // history). Reusing a populated KV cache across these full-prompt calls is the
    // bug behind the "same canned reply to every input": transformers.js would
    // prepend the cached prefix AND re-encode the whole prompt, double-counting the
    // context so the model ignores the new user turn and emits a generic templated
    // reply. A fresh cache per generate is correct here — the cache is an intra-
    // generation accelerator, not a cross-turn store, because we always re-feed the
    // entire conversation rather than only the new tokens.
    let pastKV = new DynamicCache();
    try {
        const genOpts = {
            max_new_tokens: maxTokens,
            do_sample: sample,
            streamer,
            stopping_criteria: state.stopping,
            past_key_values: pastKV
        };
        // Sampling parameters only matter when do_sample is on (regenerate path).
        if (sample) { genOpts.temperature = 0.8; genOpts.top_p = 0.9; }
        const out = await state.generator(messages, genOpts);
        const content = out?.[0]?.generated_text?.at?.(-1)?.content ?? buf;
        const interrupted = state.interrupted === true;
        // Dispose the per-call cache once the generate settles (after, never mid-
        // generation — the stop handler only signals interruption, it never frees KV).
        pastKV?.dispose?.();
        pastKV = null;
        state.generating = false;
        self.postMessage({ event: doneEvent, message: content, interrupted });
        return content;
    } catch (e) {
        state.generating = false;
        self.postMessage({ event: 'error', error: String(e?.message || e) });
        return '';
    }
}

// Build a one-line study-state suffix for the chat system prompt. Returns '' when
// there is nothing useful to say, so the prompt stays clean for a cold start.
function buildStudyContextLine(ctx) {
    if (!ctx || typeof ctx !== 'object') return '';
    const bits = [];
    // Surface the "caught up" state explicitly. Like srs-mccqe1's dashboard, a
    // zero-due day is a real signal (the student is on track) — going silent here
    // left the coach unable to acknowledge progress or pivot to weak-area drilling.
    const due = Number(ctx.dueCount);
    if (due > 0) bits.push(`${due} cards due for review`);
    else if (Number.isFinite(due)) bits.push('no cards due right now (caught up on reviews)');
    if (ctx.weakestSubject) bits.push(`weakest subject is ${ctx.weakestSubject}`);
    if (ctx.examDaysLeft != null && ctx.examDaysLeft !== '') bits.push(`${ctx.examDaysLeft} days until their exam`);
    if (!bits.length) return '';
    return `\n\ncurrent study state (use it to personalize, do not recite it verbatim): the student has ${bits.join(', ')}.`;
}

// Turn today's schedule blocks into a compact ordered plan summary for the daily
// coach. Each study block becomes one line: subject + what's planned (reviews /
// new / sections / cases), skipping zero counts. Completed blocks are marked so
// the coach resumes mid-day rather than re-proposing finished work. Returns a
// caught-up note when there are no actionable blocks.
function buildDailyPlanLine(plan) {
    const blocks = Array.isArray(plan?.blocks) ? plan.blocks : [];
    const lines = [];
    for (const b of blocks) {
        if (!b || b.kind === 'break' || !b.subject) continue;
        const parts = [];
        const review = Number(b.plannedReview) || 0;
        const fresh = Number(b.plannedNew) || 0;
        const sections = Array.isArray(b.plannedSections) ? b.plannedSections.length : (Number(b.plannedSections) || 0);
        const cases = Array.isArray(b.plannedCases) ? b.plannedCases.length : (Number(b.plannedCases) || 0);
        if (review) parts.push(`${review} review${review === 1 ? '' : 's'}`);
        if (fresh) parts.push(`${fresh} new`);
        if (sections) parts.push(`${sections} guide section${sections === 1 ? '' : 's'}`);
        if (cases) parts.push(`${cases} case${cases === 1 ? '' : 's'}`);
        if (!parts.length) continue;
        const doneFlag = b.done ? ' [done]' : '';
        lines.push(`- ${b.subject}: ${parts.join(', ')}${doneFlag}`);
    }
    if (!lines.length) return '(nothing scheduled — the student is caught up; suggest weak-area drilling or a light review)';
    return lines.join('\n');
}

function pushHistory(role, content) {
    state.history.push({ role, content });
    if (state.history.length > WORKER_CONTEXT_TURNS) {
        state.history = state.history.slice(-WORKER_CONTEXT_TURNS);
    }
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
    chat: `you are the user's medical-study tutor. you are conversational, concise, and grounded in the user's actual study material. when the user asks you to do something on the page (open a guide, start a review, navigate), emit a fenced tool block as described below. otherwise answer in 1-4 sentences.`,
    // Interactive daily-syllabus coach. Walks the student through today's planned
    // blocks one at a time as a conversation (mirrors srs-mccqe1's session loop:
    // present the next item, let the student respond, adapt, advance). The plan is
    // provided in the user turn; the coach proposes the FIRST step and always ends
    // by inviting a reply so the dialogue continues, and drives the page with tool
    // blocks when the student is ready to act.
    daily: `you are the user's medical-study coach running today's study plan as a conversation. you are given today's planned blocks (subjects in order, each with how many reviews / new cards / guide sections / cases are planned) and the student's study state. greet briefly (suit the time of day), then present the FIRST block concretely (subject + what's planned for it). do NOT dump the whole plan as a list — surface one step at a time. ALWAYS end your message by inviting the student's reply (e.g. "ready to start cardiology? say go, or tell me what you'd rather do first"). when the student agrees to start, emit the matching tool block to drive the page. keep each message to 2-4 sentences. warm, specific, no filler.`,
    // Caught-up variant: there are no scheduled blocks today. Do NOT invent or
    // "present the first block" — there is none. Acknowledge they are caught up and
    // offer one optional light next step (weak-area drill or a short review),
    // inviting a reply. 2-3 sentences, warm, no filler.
    dailyCaughtUp: `you are the user's medical-study coach. today's plan is empty — the student is caught up with no scheduled reviews, new cards, guide sections, or cases. do NOT pretend there is a first block to start; there isn't. congratulate them briefly (suit the time of day), then offer ONE optional light next step — drilling their weakest subject or a short refresher — and invite them to choose or rest. if they agree to drill or review, emit the matching tool block to drive the page. keep it to 2-3 sentences. warm, specific, no filler.`
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
            // Interrupt an in-flight generation before clearing so the runChat
            // promise settles cleanly (it owns + disposes its own per-call KV cache).
            if (state.generating && state.interrupted === false) {
                state.interrupted = true;
                state.stopping.interrupt();
            }
            state.history = [];
            return;
        }
        if (cmd === 'seed-history') {
            // Replay persisted turns into the worker so the LLM context matches
            // what the user sees on the page (single source of truth = panel).
            const turns = Array.isArray(data.history) ? data.history : [];
            state.history = turns
                .filter(t => t && (t.role === 'user' || t.role === 'assistant') && t.content)
                .slice(-WORKER_CONTEXT_TURNS);
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

        // Interactive daily syllabus: present today's plan as a conversation the
        // student can drive. Unlike session-overview (a one-shot ephemeral greeting),
        // this seeds the worker history so the follow-up chat path continues the
        // walk coherently (the panel persists it as a real thread turn).
        if (cmd === 'daily-syllabus') {
            const blocks = Array.isArray(data.plan?.blocks) ? data.plan.blocks : [];
            const hasWork = blocks.some(b => b && b.kind !== 'break' && b.subject &&
                ((Number(b.plannedReview) || 0) || (Number(b.plannedNew) || 0) ||
                 (Array.isArray(b.plannedSections) ? b.plannedSections.length : (Number(b.plannedSections) || 0)) ||
                 (Array.isArray(b.plannedCases) ? b.plannedCases.length : (Number(b.plannedCases) || 0))));
            const planLine = buildDailyPlanLine(data.plan);
            const ctxLine = buildStudyContextLine(data.context);
            const user = `today's plan:\n${planLine}${ctxLine}\nlocal hour: ${new Date().getHours()}\n\nstart walking me through today.`;
            // When there are no actionable blocks the "present the FIRST block"
            // instruction in SYS.daily contradicts the caught-up plan line, so the
            // model produces nonsense. Swap to the caught-up prompt in that case.
            const sysDaily = hasWork ? SYS.daily : SYS.dailyCaughtUp;
            // Seed the conversation so subsequent chat turns continue the syllabus
            // walk (the model sees the opener as the prior assistant turn).
            pushHistory('user', "let's start today's plan");
            const reply = await runChat([{ role: 'system', content: sysDaily }, { role: 'user', content: user }],
                { doneEvent: 'daily-syllabus-done', maxTokens: 240 });
            if (reply && reply.trim()) pushHistory('assistant', reply);
            return;
        }

        if (cmd === 'guide-question') {
            const question = data.question || '';
            const sections = searchGuideIndex(question, 3);
            const ctx = sections.length
                ? sections.map((s, i) => `[${i + 1}] ${s.subject} — ${s.title}\n${(s.body || '').slice(0, 600)}`).join('\n\n')
                : '(no matching guide sections were indexed yet — answer from general clinical knowledge but say so)';
            const user = `question: ${question}\n\nguide sections you may use:\n${ctx}`;
            // A guide answer is a real conversational turn the panel persists, so
            // keep the worker's history in step (the panel renders it as a thread
            // turn via guide-answer-done). Push the user question and the reply so
            // the two sides do not diverge on reload/regenerate.
            pushHistory('user', question);
            const reply = await runChat([{ role: 'system', content: SYS.guide }, { role: 'user', content: user }],
                { doneEvent: 'guide-answer-done', maxTokens: 320 });
            if (reply && reply.trim()) pushHistory('assistant', reply);
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
            // Inject the user's real study state so the conversational tutor can
            // personalize (SYS.chat promises grounding but the chat path used to
            // send no context). Kept to one terse line; omitted entirely when empty.
            const ctxLine = buildStudyContextLine(data.context);
            const sysWithTools = `${SYS.chat}${ctxLine}\n\n${TOOL_SPEC}`;
            const messages = [{ role: 'system', content: sysWithTools }, ...state.history];
            // Regenerate enables sampling so a retry on identical context actually
            // varies (greedy decoding would reproduce the same reply verbatim).
            const reply = await runChat(messages, {
                doneEvent: 'coaching-done', maxTokens: 300, sample: data.sample === true
            });
            // Don't pollute context with an empty assistant turn (e.g. immediate stop or error).
            if (reply && reply.trim()) pushHistory('assistant', reply);
            return;
        }

        warn('unknown cmd', cmd);
    } catch (err) {
        self.postMessage({ event: 'error', error: String(err?.message || err) });
    }
});
