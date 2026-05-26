// Tutor panel - renders Chat UI and manages communication with corpus.
// Conversation-only tutor mode: persistent history, predictable status,
// stop/clear/regenerate controls, config, and mobile-friendly layout.

import { dispatchToolCalls, stripToolBlocks } from './tool-dispatch.js';
import {
    loadHistory, saveHistory, clearHistory, toWorkerHistory,
    loadCollapsed, saveCollapsed, loadConfig, saveConfig, markCheckedIn
} from './tutor-store.js';

export let tutorMessages = [];
export let tutorWorker = null;
export let panelContainer = null;
let sdk = null;
let sdkRender = null;
let isThinking = false;
let streamingBuf = '';
let isPanelCollapsed = true;
let config = { ...loadConfig() };
let modelStatus = 'idle';     // idle | loading | downloading | ready | unavailable
let modelStatusDetail = '';
let lastUserText = '';        // for regenerate
let showSettings = false;

const STARTER_PROMPTS = [
    'Plan my study session',
    'Quiz me on cardiology',
    'Explain SIADH simply',
    'What should I review first?'
];

export async function initTutorPanel() {
    // Load persisted history first so a reload restores the conversation.
    tutorMessages = loadHistory();
    isPanelCollapsed = loadCollapsed(true);

    if (!document.querySelector('link[data-ds247420]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = './247420.css';
        link.setAttribute('data-ds247420', '1');
        document.head.appendChild(link);
    }

    try {
        sdk = await import('./247420.js');
        if (typeof window !== 'undefined') window.__ds247420 = sdk;
    } catch (err) {
        console.warn('[tutor-panel] SDK ESM import failed; falling back to manual UI', err?.message || err);
    }

    if (sdk && sdk.mount) {
        renderSdkChat();
    } else {
        renderFallbackChat();
    }

    syncTheme();
    document.addEventListener('theme-changed', syncTheme);
    window.addEventListener('resize', applyResponsiveWidth);
}

function statusLabel() {
    switch (modelStatus) {
        case 'loading': return `⏳ ${modelStatusDetail || 'loading…'}`;
        case 'downloading': return `⏬ ${modelStatusDetail || 'downloading…'}`;
        case 'ready': return 'online · purring';
        case 'unavailable': return '⚠ unavailable';
        default: return 'starting…';
    }
}

function renderSdkChat() {
    if (!panelContainer) {
        panelContainer = document.createElement('div');
        panelContainer.id = 'tutor-panel';
        panelContainer.className = 'ds-247420 tutor-panel-root';
        panelContainer.appendChild(makeToggleBtn());

        const chatRoot = document.createElement('div');
        chatRoot.id = 'tutor-chat-root';
        chatRoot.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;';
        panelContainer.appendChild(chatRoot);

        // SDK-agnostic action bar (copy / regenerate) rendered as a sibling we control.
        const actionBar = document.createElement('div');
        actionBar.id = 'tutor-action-bar';
        panelContainer.appendChild(actionBar);

        document.body.appendChild(panelContainer);
    }
    applyResponsiveWidth();

    const { components: C } = sdk;
    const chatRoot = panelContainer.querySelector('#tutor-chat-root');
    if (!chatRoot) return;

    sdkRender = sdk.mount(chatRoot, () => {
        if (isPanelCollapsed) {
            return C.h('div', {
                class: 'tutor-collapsed-trigger',
                style: 'display:flex;align-items:center;justify-content:center;height:100%;cursor:pointer;',
                onClick: toggleTutorCollapse,
                title: 'Open study coach'
            }, C.h('span', { style: 'font-size:22px;color:var(--ink)' }, '🤖'));
        }

        const messages = tutorMessages.map((m, i) => ({
            role: m.role || (m.isUser ? 'user' : 'assistant'),
            text: m.text,
            parts: m.parts,
            _idx: i,
            _err: m.err === true
        }));

        if (streamingBuf) {
            messages.push({
                role: 'assistant',
                text: stripToolBlocks(streamingBuf) || streamingBuf,
                typing: true
            });
        }

        const composer = C.ChatComposer({
            placeholder: isThinking ? 'Coach is thinking…' : 'Ask me anything…',
            onSend: (text) => sendTutorMessage(text),
            disabled: isThinking
        });

        // Update the SDK-agnostic action bar imperatively (AICat has no footer slot).
        updateActionBar();

        return C.AICat({
            name: 'Study Coach',
            messages: messages,
            thinking: isThinking,
            status: statusLabel(),
            header: renderHeaderControls(C),
            empty: messages.length === 0 ? renderEmptyState(C) : undefined,
            composer: isThinking ? renderStopRow(C, composer) : composer
        });
    });
}

function renderHeaderControls(C) {
    const btn = (label, title, onClick) => C.h('button', {
        class: 'tutor-hdr-btn', title, 'aria-label': title, onClick
    }, label);
    const controls = [
        btn('⟲', 'New conversation', clearConversation),
        btn('⚙', 'Tutor settings', toggleSettings)
    ];
    if (showSettings) controls.push(renderSettings(C));
    return C.h('div', { class: 'tutor-hdr-controls' }, ...controls);
}

function renderSettings(C) {
    const row = (label, key) => C.h('label', { class: 'tutor-set-row' },
        C.h('input', {
            type: 'checkbox',
            checked: !!config[key],
            onChange: (e) => { config[key] = e.target.checked; saveConfig(config); }
        }),
        C.h('span', {}, label)
    );
    return C.h('div', { class: 'tutor-settings-pop', role: 'menu' },
        row('Daily check-in', 'proactiveCheckins'),
        row('Coach me after reviews', 'autoCoachOnReview')
    );
}

function renderEmptyState(C) {
    return C.h('div', { class: 'tutor-empty' },
        C.h('div', { class: 'tutor-empty-title' }, '👋 Hi — I’m your study coach.'),
        C.h('div', { class: 'tutor-empty-sub' }, 'Try one of these:'),
        C.h('div', { class: 'tutor-chips' },
            ...STARTER_PROMPTS.map(p => C.h('button', {
                class: 'tutor-chip', onClick: () => sendTutorMessage(p)
            }, p))
        )
    );
}

function updateActionBar() {
    const bar = panelContainer?.querySelector('#tutor-action-bar');
    if (!bar) return;
    const last = tutorMessages[tutorMessages.length - 1];
    const show = !isPanelCollapsed && !isThinking && !streamingBuf && last && last.role === 'assistant' && !last.err;
    if (!show) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
    bar.style.display = '';
    bar.className = 'tutor-msg-actions';
    bar.innerHTML = '';
    const mkBtn = (label, title, fn) => {
        const b = document.createElement('button');
        b.className = 'tutor-msg-act';
        b.textContent = label;
        b.title = title; b.setAttribute('aria-label', title);
        b.addEventListener('click', fn);
        return b;
    };
    bar.appendChild(mkBtn('⧉ copy', 'Copy answer', () => {
        try { navigator.clipboard?.writeText(last.text); showTutorToast('Copied'); }
        catch { showTutorToast('Copy failed'); }
    }));
    // Retry only when there is a real preceding user turn to regenerate from.
    if (lastRegenerableUserText()) {
        bar.appendChild(mkBtn('↻ retry', 'Regenerate answer', regenerateLast));
    }
}

function renderStopRow(C, composer) {
    return C.h('div', { class: 'tutor-composer-stop' },
        C.h('button', { class: 'tutor-stop-btn', title: 'Stop generating', onClick: stopGeneration }, '■ stop'),
        composer
    );
}

function makeToggleBtn() {
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'tutor-collapse-btn';
    toggleBtn.className = 'tutor-collapse-btn';
    toggleBtn.textContent = isPanelCollapsed ? '←' : '→';
    toggleBtn.setAttribute('aria-label', 'Toggle study coach panel');
    toggleBtn.addEventListener('click', toggleTutorCollapse);
    return toggleBtn;
}

function renderFallbackChat() {
    if (!panelContainer) {
        panelContainer = document.createElement('div');
        panelContainer.id = 'tutor-panel';
        panelContainer.className = 'tutor-panel-fallback tutor-panel-root';
        document.body.appendChild(panelContainer);
    }
    applyResponsiveWidth();

    panelContainer.innerHTML = `
        <div class="tutor-fallback-head">
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:20px;">🤖</span>
                <span style="font-weight:600;font-size:14px;">Study Coach</span>
                <span id="tutor-status-pill" class="tutor-status-pill">starting…</span>
            </div>
            <div style="display:flex;gap:4px;">
                <button id="tutor-clear-btn" class="tutor-hdr-btn" title="New conversation" aria-label="New conversation">⟲</button>
                <button id="tutor-collapse-btn" class="tutor-collapse-btn" title="Collapse panel" aria-label="Collapse panel">→</button>
            </div>
        </div>
        <div id="tutor-messages" aria-live="polite" aria-label="coaching messages" class="tutor-fallback-msgs"></div>
        <div class="tutor-fallback-composer">
            <textarea id="tutor-input" rows="1" aria-label="Ask the study coach a question"
                placeholder="Ask me anything…"></textarea>
        </div>
    `;

    const input = panelContainer.querySelector('#tutor-input');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isThinking && input.value.trim()) {
                    sendTutorMessage(input.value);
                    input.value = '';
                }
            }
        });
    }
    panelContainer.querySelector('#tutor-collapse-btn')?.addEventListener('click', toggleTutorCollapse);
    panelContainer.querySelector('#tutor-clear-btn')?.addEventListener('click', clearConversation);

    // Replay persisted history into the fallback DOM.
    if (tutorMessages.length === 0) {
        appendFallbackMessage('Welcome! I’ll help you study. Ask a question or start a review.', false);
    } else {
        for (const m of tutorMessages) appendFallbackMessage(m.text, m.role === 'user');
    }
}

function appendFallbackMessage(text, isUser) {
    const messagesContainer = panelContainer?.querySelector('#tutor-messages');
    if (!messagesContainer) return;
    const stick = isAtBottom(messagesContainer);
    const msg = document.createElement('div');
    msg.className = isUser ? 'tutor-msg tutor-msg-user' : 'tutor-msg tutor-msg-bot';
    msg.textContent = text;
    messagesContainer.appendChild(msg);
    if (stick) messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function isAtBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}

// ----- width / responsive -----
function applyResponsiveWidth() {
    if (!panelContainer) return;
    const mobile = window.matchMedia('(max-width: 640px)').matches;
    const chatRoot = panelContainer.querySelector('#tutor-chat-root');
    const toggleBtn = panelContainer.querySelector('#tutor-collapse-btn');

    if (isPanelCollapsed) {
        panelContainer.classList.add('tutor-collapsed');
        panelContainer.classList.remove('tutor-mobile-overlay');
        panelContainer.style.width = '52px';
        if (chatRoot) chatRoot.style.display = 'none';
        if (toggleBtn) toggleBtn.textContent = mobile ? '🤖' : '←';
    } else {
        panelContainer.classList.remove('tutor-collapsed');
        if (chatRoot) chatRoot.style.display = '';
        if (toggleBtn) toggleBtn.textContent = '→';
        if (mobile) {
            panelContainer.classList.add('tutor-mobile-overlay');
            panelContainer.style.width = '100%';
        } else {
            panelContainer.classList.remove('tutor-mobile-overlay');
            panelContainer.style.width = (config.panelWidth || 30) + '%';
        }
    }
}

function toggleTutorCollapse() {
    if (!panelContainer) return;
    isPanelCollapsed = !isPanelCollapsed;
    saveCollapsed(isPanelCollapsed);
    applyResponsiveWidth();
    if (sdkRender) sdkRender();
}

function toggleSettings() {
    showSettings = !showSettings;
    if (sdkRender) sdkRender();
}

function syncTheme() {
    if (!panelContainer) return;
    if (sdkRender) sdkRender();
}

// ----- conversation control -----
function persist() {
    saveHistory(tutorMessages);
}

export function clearConversation() {
    tutorMessages = [];
    streamingBuf = '';
    clearHistory();
    if (tutorWorker) tutorWorker.postMessage({ cmd: 'reset-history' });
    if (sdkRender) sdkRender();
    else {
        const m = panelContainer?.querySelector('#tutor-messages');
        if (m) m.innerHTML = '';
        appendFallbackMessage('New conversation started. Ask me anything.', false);
    }
}

function stopGeneration() {
    if (tutorWorker) tutorWorker.postMessage({ cmd: 'stop' });
}

// Regenerate only makes sense when the last turn is an assistant reply preceded by a
// real user turn. Derive the prompt from that user turn (not a stale module variable),
// drop the trailing assistant turn from BOTH panel and worker, and resend cleanly so
// the worker does not end up with a duplicated user turn.
export function lastRegenerableUserText() {
    const n = tutorMessages.length;
    if (n < 2) return null;
    if (tutorMessages[n - 1].role !== 'assistant') return null;
    if (tutorMessages[n - 2].role !== 'user') return null;
    return tutorMessages[n - 2].text;
}

export function regenerateLast() {
    if (isThinking) return;
    const userText = lastRegenerableUserText();
    if (!userText) return;
    // Drop trailing assistant turn from the panel. Reseed the worker to the thread
    // up to BEFORE the user turn we're about to resend, so user-message adds it exactly
    // once (no duplicate user turn in context).
    tutorMessages.pop();
    persist();
    if (tutorWorker) {
        const priorContext = tutorMessages.slice(0, -1); // exclude the user turn being resent
        tutorWorker.postMessage({ cmd: 'reset-history' });
        tutorWorker.postMessage({ cmd: 'seed-history', history: toWorkerHistory(priorContext) });
    }
    sendTutorMessage(userText, { isRegenerate: true });
}

export function addTutorMessage(text, isUser = false, opts = {}) {
    const turn = { text, role: isUser ? 'user' : 'assistant', ts: Date.now() };
    if (opts.err) turn.err = true;
    tutorMessages.push(turn);
    persist();
    if (sdkRender) sdkRender();
    else appendFallbackMessage(text, isUser);
}

export function showTutorToast(message, duration = 3000) {
    if (!panelContainer) return;
    const toast = document.createElement('div');
    toast.className = 'tutor-toast';
    toast.textContent = message;
    panelContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

export function sendTutorMessage(text, opts = {}) {
    if (!text || !text.trim() || !tutorWorker || isThinking) return;
    if (modelStatus === 'unavailable') {
        showTutorToast('Tutor unavailable — WebGPU required (Chrome/Edge).');
        return;
    }
    if (!opts.isRegenerate) addTutorMessage(text, true);
    lastUserText = text;
    // Unified routing: the model decides whether to answer or emit a tool block.
    tutorWorker.postMessage({ cmd: 'user-message', text });
}

function dispatchAndStrip(message) {
    if (!message) return '';
    const actions = (typeof window !== 'undefined' && window.__tutorActions) || {};
    try { dispatchToolCalls(message, actions); }
    catch (e) { console.warn('[tutor-panel] tool dispatch error', e); }
    return stripToolBlocks(message) || message;
}

function setStatus(status, detail = '') {
    modelStatus = status;
    modelStatusDetail = detail;
    const pill = panelContainer?.querySelector('#tutor-status-pill');
    if (pill) { pill.textContent = statusLabel(); pill.dataset.status = status; }
    if (sdkRender) sdkRender();
}

export function wireWorkerToPanel(worker) {
    tutorWorker = worker;

    // Seed the worker with persisted history so its LLM context matches the panel.
    if (tutorMessages.length) {
        worker.postMessage({ cmd: 'seed-history', history: toWorkerHistory(tutorMessages) });
    }

    worker.addEventListener('message', (e) => {
        const { event, token, message, error, stage, progress, loaded, total, interrupted } = e.data || {};

        switch (event) {
            case 'log': console.log('[tutor]', e.data.msg); break;
            case 'warn': console.warn('[tutor]', e.data.msg); break;

            case 'model-loading':
                setStatus('loading', stage || 'loading tutor…');
                break;

            case 'model-downloading': {
                const pct = total ? Math.round((loaded / total) * 100) : Math.round(progress || 0);
                setStatus('downloading', `Bonsai-1.7B ${pct}%`);
                break;
            }

            case 'ready':
                isThinking = false;
                setStatus('ready');
                break;

            case 'unavailable':
                isThinking = false;
                setStatus('unavailable', error || 'WebGPU required');
                addTutorMessage(`Tutor unavailable — ${error || 'WebGPU required. Open in Chrome or Edge.'}`, false, { err: true });
                break;

            case 'coaching-start':
                isThinking = true;
                streamingBuf = '';
                if (sdkRender) sdkRender();
                break;

            case 'token':
                if (token != null) {
                    streamingBuf += token;
                    if (sdkRender) sdkRender();
                }
                break;

            // Conversational reply to a user message — the ONLY path that persists a
            // thread turn AND is worker-synced. (guide-answer-done is also a direct
            // user question, so it persists too.)
            case 'coaching-done':
            case 'guide-answer-done': {
                isThinking = false;
                const clean = dispatchAndStrip(message);
                streamingBuf = '';
                if (clean && clean.trim()) {
                    addTutorMessage(interrupted ? clean + ' …⏹' : clean, false);
                } else if (interrupted) {
                    showTutorToast('Stopped.');
                    if (sdkRender) sdkRender();
                }
                if (event === 'guide-answer-done') showTutorToast('📚 guide answer ready');
                break;
            }

            // Ephemeral coaching/overview/hints: NOT a persisted conversation turn and
            // NOT in worker history (no preceding user turn). Mirror to the inline slot
            // and show a transient note instead of polluting the thread + reload seed.
            case 'review-coaching-done':
            case 'session-overview-done':
            case 'triage-hint-done': {
                isThinking = false;
                const clean = dispatchAndStrip(message);
                streamingBuf = '';
                if (event === 'review-coaching-done') {
                    const inline = document.getElementById('tutor-card-coaching');
                    if (inline) inline.textContent = clean;
                }
                if (event === 'session-overview-done') {
                    // Daily greeting: consume the check-in slot only once it actually rendered.
                    markCheckedIn();
                    if (clean && clean.trim()) showTutorToast('👋 ' + clean.slice(0, 120), 6000);
                }
                if (event === 'triage-hint-done' && clean) showTutorToast('💡 ' + clean.slice(0, 120), 6000);
                break;
            }

            case 'error':
                isThinking = false;
                streamingBuf = '';
                addTutorMessage(`Something went wrong: ${error || e.data.msg}. Tap to retry.`, false, { err: true });
                break;
        }
    });
}

export function closeTutorPanel() {
    if (panelContainer) {
        panelContainer.remove();
        panelContainer = null;
    }
}
