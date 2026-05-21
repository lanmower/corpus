// Tutor panel - renders Chat UI and manages communication with corpus

import { dispatchToolCalls, stripToolBlocks } from './tool-dispatch.js';

export let tutorMessages = [];
export let tutorWorker = null;
export let panelContainer = null;
let isPanelCollapsed = false;

export async function initTutorPanel() {
    // Load anentrypoint-design CSS (scope class .ds-247420 is required for it to apply).
    if (!document.querySelector('link[data-ds247420]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/anentrypoint-design@latest/dist/247420.css';
        link.setAttribute('data-ds247420', '1');
        document.head.appendChild(link);
    }
    // Try to load the SDK as a real ES module (the SDK is ESM-only — older code that
    // loaded it as a classic script expecting window globals always failed).
    let sdk = null;
    try {
        sdk = await import(/* @vite-ignore */ 'https://unpkg.com/anentrypoint-design@latest/dist/247420.js');
    } catch (err) {
        console.warn('[tutor-panel] SDK ESM import failed; using fallback UI', err?.message || err);
    }
    // Always render the fallback (hand-rolled) chat — it's the resilient default and the
    // SDK Chat would need more wiring to match our streaming protocol. We attach the
    // .ds-247420 scope so SDK CSS tokens style chips, buttons, focus rings if loaded.
    renderFallbackChat();
    if (panelContainer && !panelContainer.classList.contains('ds-247420')) {
        panelContainer.classList.add('ds-247420');
    }
    // Sync theme
    syncTheme();
    document.addEventListener('theme-changed', syncTheme);
    // Expose SDK to debug surface so other modules can adopt components incrementally
    if (sdk && typeof window !== 'undefined') window.__ds247420 = sdk;
}

function renderFallbackChat() {
    if (!panelContainer) {
        panelContainer = document.createElement('div');
        panelContainer.id = 'tutor-panel';
        panelContainer.className = 'tutor-panel-fallback';
        panelContainer.style.cssText = `
            position: fixed;
            right: 0;
            top: 0;
            width: 30%;
            height: 100vh;
            background: var(--paper);
            border-left: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            z-index: 100;
            font-family: var(--ff-body);
            transition: width 0.3s ease;
        `;
        document.body.appendChild(panelContainer);
    }

    const collapseBtnHtml = `<button id="tutor-collapse-btn" style="
        background: none;
        border: none;
        color: var(--ink);
        cursor: pointer;
        font-size: 16px;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 4px;
    " title="Collapse panel">→</button>`;

    panelContainer.innerHTML = `
        <div style="padding: 12px; border-bottom: 1px solid var(--border); background: var(--panel-2); display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 20px;">🤖</span>
                <span style="font-weight: 600; font-size: 14px;">Study Coach</span>
            </div>
            ${collapseBtnHtml}
        </div>
        <div id="tutor-messages" aria-live="polite" aria-label="coaching messages" style="flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
            <div style="padding: 8px; background: var(--panel-2); border-radius: 4px; font-size: 13px;">
                Welcome! I'll help you study more effectively. Start reviewing cards or ask me questions.
            </div>
        </div>
        <div style="padding: 12px; border-top: 1px solid var(--border);">
            <input id="tutor-input" type="text" placeholder="Ask me anything..." style="
                width: 100%;
                padding: 8px 12px;
                border: 1px solid var(--border);
                border-radius: 4px;
                font-family: var(--ff-body);
                font-size: 13px;
                background: var(--paper);
                color: var(--ink);
            ">
        </div>
    `;

    const input = panelContainer.querySelector('#tutor-input');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendTutorMessage(input.value);
                input.value = '';
            }
        });
    }

    const collapseBtn = panelContainer.querySelector('#tutor-collapse-btn');
    if (collapseBtn) {
        collapseBtn.addEventListener('click', toggleTutorCollapse);
    }
}

function toggleTutorCollapse() {
    if (!panelContainer) return;
    isPanelCollapsed = !isPanelCollapsed;

    if (isPanelCollapsed) {
        panelContainer.style.width = '60px';
        const collapseBtn = panelContainer.querySelector('#tutor-collapse-btn');
        if (collapseBtn) collapseBtn.textContent = '←';
        const messagesDiv = panelContainer.querySelector('#tutor-messages');
        if (messagesDiv) messagesDiv.parentElement.style.display = 'none';
        const inputDiv = panelContainer.querySelector('#tutor-input');
        if (inputDiv) inputDiv.parentElement.style.display = 'none';
    } else {
        panelContainer.style.width = '30%';
        const collapseBtn = panelContainer.querySelector('#tutor-collapse-btn');
        if (collapseBtn) collapseBtn.textContent = '→';
        const messagesDiv = panelContainer.querySelector('#tutor-messages');
        if (messagesDiv) messagesDiv.parentElement.style.display = '';
        const inputDiv = panelContainer.querySelector('#tutor-input');
        if (inputDiv) inputDiv.parentElement.style.display = '';
    }
}

function syncTheme() {
    if (!panelContainer) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
                   window.matchMedia('(prefers-color-scheme: dark)').matches;
    panelContainer.style.background = `var(--paper)`;
    panelContainer.style.color = `var(--ink)`;
}

export function addTutorMessage(text, isUser = false) {
    const messagesContainer = document.getElementById('tutor-messages');
    if (!messagesContainer) return;

    const msg = document.createElement('div');
    msg.style.cssText = `
        padding: 8px 12px;
        background: ${isUser ? 'var(--panel-2)' : 'var(--accent-tint)'};
        border-radius: 4px;
        font-size: 13px;
        line-height: 1.5;
        word-wrap: break-word;
    `;
    msg.textContent = text;
    messagesContainer.appendChild(msg);
    messagesContainer.parentElement.scrollTop = messagesContainer.parentElement.scrollHeight;
}

export function showTutorToast(message, duration = 3000) {
    if (!panelContainer) return;

    const toast = document.createElement('div');
    toast.style.cssText = `
        position: absolute;
        bottom: 16px;
        right: 16px;
        background: var(--accent);
        color: var(--accent-text);
        padding: 12px 16px;
        border-radius: 4px;
        font-size: 13px;
        z-index: 1001;
        animation: slideIn 0.3s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    `;
    toast.textContent = message;
    panelContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

export function sendTutorMessage(text) {
    if (!text.trim() || !tutorWorker) return;
    addTutorMessage(text, true);

    // Detect guide questions (start with keywords or question marks)
    const isGuideQuestion = /^(what|explain|tell|help|understand|how|why|define)\s+/i.test(text) ||
                            text.includes('?') ||
                            /^(about|on)\s+/i.test(text);

    if (isGuideQuestion) {
        tutorWorker.postMessage({ cmd: 'guide-question', question: text });
    } else {
        tutorWorker.postMessage({ cmd: 'user-message', text });
    }
}

// Dispatch any fenced ```tool blocks the LLM emitted; return prose-only text for display.
function dispatchAndStrip(message) {
    if (!message) return '';
    const actions = (typeof window !== 'undefined' && window.__tutorActions) || {};
    try { dispatchToolCalls(message, actions); }
    catch (e) { console.warn('[tutor-panel] tool dispatch error', e); }
    return stripToolBlocks(message) || message;
}

export function wireWorkerToPanel(worker) {
    tutorWorker = worker;
    let streamingMsg = null;
    let streamingBuf = '';

    worker.addEventListener('message', (e) => {
        const { event, token, message, error, stage, progress, loaded, total } = e.data || {};

        switch (event) {
            case 'log':
                console.log('[tutor]', e.data.msg);
                break;

            case 'warn':
                console.warn('[tutor]', e.data.msg);
                break;

            case 'model-loading':
                addTutorMessage(`⏳ ${stage || 'loading tutor…'}`, false);
                break;

            case 'model-downloading': {
                const pct = total ? Math.round((loaded / total) * 100) : Math.round(progress || 0);
                const msgs = document.getElementById('tutor-messages');
                const last = msgs?.lastElementChild;
                if (last && last.dataset.kind === 'progress') {
                    last.textContent = `⏳ downloading Bonsai-1.7B… ${pct}%`;
                } else {
                    const div = document.createElement('div');
                    div.dataset.kind = 'progress';
                    div.style.cssText = 'padding:8px 12px;background:var(--panel-2);border-radius:4px;font-size:13px;font-family:var(--ff-mono);';
                    div.textContent = `⏳ downloading Bonsai-1.7B… ${pct}%`;
                    msgs?.appendChild(div);
                    if (msgs?.parentElement) msgs.parentElement.scrollTop = msgs.parentElement.scrollHeight;
                }
                break;
            }

            case 'ready':
                addTutorMessage('✓ tutor ready — ask me anything about your study material.', false);
                break;

            case 'unavailable':
                addTutorMessage(`tutor unavailable — ${error || 'WebGPU required. Open in Chrome or Edge.'}`, false);
                break;

            case 'coaching-start':
                // Start a fresh assistant bubble that tokens will stream into.
                streamingBuf = '';
                streamingMsg = document.createElement('div');
                streamingMsg.style.cssText = `
                    padding: 8px 12px;
                    background: var(--accent-tint);
                    border-radius: 4px;
                    font-size: 13px;
                    line-height: 1.5;
                    word-wrap: break-word;
                `;
                streamingMsg.textContent = '';
                document.getElementById('tutor-messages')?.appendChild(streamingMsg);
                break;

            case 'token':
                if (streamingMsg && token != null) {
                    streamingBuf += token;
                    // Hide tool blocks from the live view while streaming.
                    streamingMsg.textContent = stripToolBlocks(streamingBuf) || streamingBuf;
                    const msgs = document.getElementById('tutor-messages');
                    if (msgs?.parentElement) msgs.parentElement.scrollTop = msgs.parentElement.scrollHeight;
                }
                break;

            case 'coaching-done':
            case 'session-overview-done':
            case 'guide-answer-done':
            case 'triage-hint-done': {
                const clean = dispatchAndStrip(message);
                if (streamingMsg) {
                    streamingMsg.textContent = clean;
                    streamingMsg = null;
                    streamingBuf = '';
                } else {
                    addTutorMessage(clean, false);
                }
                // Mirror coaching into the inline SRS slot when present (so the user
                // sees the tutor's comment on the review card without looking sideways).
                if (event === 'coaching-done') {
                    const inline = document.getElementById('tutor-card-coaching');
                    if (inline) inline.textContent = clean;
                }
                if (event === 'guide-answer-done') showTutorToast('📚 guide answer ready');
                if (event === 'triage-hint-done') showTutorToast('💡 hint provided');
                break;
            }

            case 'error':
                addTutorMessage(`error: ${error || e.data.msg}`, false);
                streamingMsg = null;
                streamingBuf = '';
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
