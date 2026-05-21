// Tutor panel - renders Chat UI and manages communication with corpus

import { dispatchToolCalls, stripToolBlocks } from './tool-dispatch.js';

export let tutorMessages = [];
export let tutorWorker = null;
export let panelContainer = null;
let sdk = null;
let sdkRender = null;
let isThinking = false;
let streamingBuf = '';
let isPanelCollapsed = false;

export async function initTutorPanel() {
    // Load local anentrypoint-design CSS.
    if (!document.querySelector('link[data-ds247420]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = './247420.css';
        link.setAttribute('data-ds247420', '1');
        document.head.appendChild(link);
    }
    
    // Load the SDK as a real ES module from local path.
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

    // Sync theme
    syncTheme();
    document.addEventListener('theme-changed', syncTheme);
}

function renderSdkChat() {
    if (!panelContainer) {
        panelContainer = document.createElement('div');
        panelContainer.id = 'tutor-panel';
        panelContainer.className = 'ds-247420 tutor-panel-root';
        panelContainer.style.cssText = `
            position: fixed;
            right: 0;
            top: 0;
            width: 30%;
            height: 100vh;
            z-index: 100;
            transition: width 0.3s ease;
            border-left: 1px solid var(--border);
            background: var(--paper);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        // Collapse toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'tutor-collapse-btn';
        toggleBtn.className = 'tutor-collapse-btn';
        toggleBtn.textContent = '→';
        toggleBtn.addEventListener('click', toggleTutorCollapse);
        panelContainer.appendChild(toggleBtn);

        // Chat content container
        const chatRoot = document.createElement('div');
        chatRoot.id = 'tutor-chat-root';
        chatRoot.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;';
        panelContainer.appendChild(chatRoot);

        document.body.appendChild(panelContainer);
    }

    const { components: C } = sdk;
    const chatRoot = panelContainer.querySelector('#tutor-chat-root');
    if (!chatRoot) return;

    sdkRender = sdk.mount(chatRoot, () => {
        if (isPanelCollapsed) {
            return C.h('div', { 
                class: 'tutor-collapsed-trigger',
                style: 'display:flex;align-items:center;justify-content:center;height:100%;cursor:pointer;',
                onClick: toggleTutorCollapse
            }, C.h('span', { style: 'font-size:20px;color:var(--ink)' }, '🤖'));
        }

        const messages = tutorMessages.map(m => ({
            role: m.role || (m.isUser ? 'user' : 'assistant'),
            text: m.text,
            parts: m.parts
        }));

        if (streamingBuf) {
            messages.push({
                role: 'assistant',
                text: stripToolBlocks(streamingBuf) || streamingBuf,
                typing: true
            });
        }

        return C.AICat({
            name: 'Study Coach',
            messages: messages,
            thinking: isThinking,
            status: isThinking ? 'thinking...' : 'online · purring',
            composer: C.ChatComposer({
                placeholder: 'Ask me anything...',
                onSend: (text) => sendTutorMessage(text),
                disabled: isThinking
            })
        });
    });
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

    const toggleBtn = panelContainer.querySelector('#tutor-collapse-btn');
    const chatRoot = panelContainer.querySelector('#tutor-chat-root');

    if (isPanelCollapsed) {
        panelContainer.style.width = '48px';
        if (toggleBtn) toggleBtn.textContent = '←';
        if (chatRoot) chatRoot.style.display = 'none';
    } else {
        panelContainer.style.width = '30%';
        if (toggleBtn) toggleBtn.textContent = '→';
        if (chatRoot) chatRoot.style.display = '';
    }
    if (sdkRender) sdkRender();
}

function syncTheme() {
    if (!panelContainer) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
                   window.matchMedia('(prefers-color-scheme: dark)').matches;
    panelContainer.style.background = `var(--paper)`;
    panelContainer.style.color = `var(--ink)`;
    if (sdkRender) sdkRender();
}

export function addTutorMessage(text, isUser = false) {
    tutorMessages.push({ text, role: isUser ? 'user' : 'assistant' });
    if (sdkRender) {
        sdkRender();
    } else {
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
                isThinking = true;
                addTutorMessage(`⏳ ${stage || 'loading tutor…'}`, false);
                break;

            case 'model-downloading': {
                const pct = total ? Math.round((loaded / total) * 100) : Math.round(progress || 0);
                if (sdkRender) {
                    // Update the last message if it's a progress message
                    const last = tutorMessages[tutorMessages.length - 1];
                    if (last && last.text.includes('downloading')) {
                        last.text = `⏳ downloading Bonsai-1.7B… ${pct}%`;
                    } else {
                        tutorMessages.push({ text: `⏳ downloading Bonsai-1.7B… ${pct}%`, role: 'assistant' });
                    }
                    sdkRender();
                } else {
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
                }
                break;
            }

            case 'ready':
                isThinking = false;
                addTutorMessage('✓ tutor ready — ask me anything about your study material.', false);
                break;

            case 'unavailable':
                isThinking = false;
                addTutorMessage(`tutor unavailable — ${error || 'WebGPU required. Open in Chrome or Edge.'}`, false);
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
                    else {
                        // Fallback logic for streaming would be here, but we prefer SDK
                    }
                }
                break;

            case 'coaching-done':
            case 'session-overview-done':
            case 'guide-answer-done':
            case 'triage-hint-done': {
                isThinking = false;
                const clean = dispatchAndStrip(message);
                streamingBuf = '';
                addTutorMessage(clean, false);
                
                // Mirror coaching into the inline SRS slot when present
                if (event === 'coaching-done') {
                    const inline = document.getElementById('tutor-card-coaching');
                    if (inline) inline.textContent = clean;
                }
                if (event === 'guide-answer-done') showTutorToast('📚 guide answer ready');
                if (event === 'triage-hint-done') showTutorToast('💡 hint provided');
                break;
            }

            case 'error':
                isThinking = false;
                addTutorMessage(`error: ${error || e.data.msg}`, false);
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
