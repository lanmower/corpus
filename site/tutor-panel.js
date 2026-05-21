// Tutor panel - renders Chat UI and manages communication with corpus

export let tutorMessages = [];
export let tutorWorker = null;
export let panelContainer = null;

export async function initTutorPanel() {
    try {
        // Load anentrypoint-design SDK from CDN
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/anentrypoint-design@latest/dist/247420.js';
        script.onload = async () => {
            const { mount, h } = window['247420'] || window.__anentrypoint || {};
            if (!mount || !h) {
                console.warn('[tutor-panel] anentrypoint-design SDK not available');
                return;
            }

            // Create panel container
            panelContainer = document.createElement('div');
            panelContainer.id = 'tutor-panel';
            panelContainer.className = 'tutor-panel ds-247420';
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
                overflow: hidden;
            `;
            document.body.appendChild(panelContainer);

            // Mount Chat component
            const ChatComponent = window['247420']?.Chat || window.__anentrypoint?.Chat;
            if (ChatComponent) {
                mount(panelContainer, () => {
                    return h('div', { style: 'height: 100%; display: flex; flex-direction: column;' },
                        h('div', { style: 'padding: 12px; border-bottom: 1px solid var(--border); background: var(--panel-2);' },
                            h('span', { style: 'font-weight: 600; font-size: 14px;' }, '🤖 Study Coach')
                        ),
                        h('div', { style: 'flex: 1; overflow-y: auto; padding: 12px;' },
                            h('div', { id: 'tutor-messages', style: 'display: flex; flex-direction: column; gap: 8px;' })
                        ),
                        h('div', { style: 'padding: 12px; border-top: 1px solid var(--border);' },
                            h('input', {
                                id: 'tutor-input',
                                type: 'text',
                                placeholder: 'Ask me anything...',
                                style: `
                                    width: 100%;
                                    padding: 8px 12px;
                                    border: 1px solid var(--border);
                                    border-radius: 4px;
                                    font-family: var(--ff-body);
                                    font-size: 13px;
                                    background: var(--paper);
                                    color: var(--ink);
                                `,
                                onkeydown: (e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        sendTutorMessage(e.target.value);
                                        e.target.value = '';
                                    }
                                }
                            })
                        )
                    );
                });
            } else {
                // Fallback: simple chat UI if SDK components unavailable
                renderFallbackChat();
            }

            // Sync theme
            syncTheme();
            document.addEventListener('theme-changed', syncTheme);
        };
        document.head.appendChild(script);
    } catch (err) {
        console.warn('[tutor-panel] Failed to initialize:', err);
        renderFallbackChat();
    }
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
        `;
        document.body.appendChild(panelContainer);
    }

    panelContainer.innerHTML = `
        <div style="padding: 12px; border-bottom: 1px solid var(--border); background: var(--panel-2);">
            <span style="font-weight: 600; font-size: 14px;">🤖 Study Coach</span>
        </div>
        <div id="tutor-messages" style="flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
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

export function sendTutorMessage(text) {
    if (!text.trim() || !tutorWorker) return;
    addTutorMessage(text, true);
    tutorWorker.postMessage({ cmd: 'user-message', text });
}

export function wireWorkerToPanel(worker) {
    tutorWorker = worker;

    worker.addEventListener('message', (e) => {
        const { event, token, message, error } = e.data;

        switch (event) {
            case 'log':
                console.log('[tutor]', e.data.msg);
                break;

            case 'coaching-start':
                addTutorMessage('💭 Thinking...', false);
                break;

            case 'token':
                // Update last message with streaming token
                const msgs = document.getElementById('tutor-messages');
                if (msgs) {
                    const lastMsg = msgs.lastElementChild;
                    if (lastMsg) {
                        lastMsg.textContent += token;
                    }
                }
                break;

            case 'coaching-done':
                addTutorMessage(message, false);
                break;

            case 'error':
                addTutorMessage(`❌ Error: ${error || e.data.msg}`, false);
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
