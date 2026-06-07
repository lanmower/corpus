// Tutor panel - renders Chat UI and manages communication with corpus.
// Conversation-only tutor mode: persistent history, predictable status,
// stop/clear/regenerate controls, config, and mobile-friendly layout.

import { dispatchToolCalls, stripToolBlocks } from './tool-dispatch.js';
import {
    loadHistory, saveHistory, clearHistory, toWorkerHistory,
    loadCollapsed, saveCollapsed, loadConfig, saveConfig, markCheckedIn, shouldCheckInToday
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
let thinkingWatchdog = null;  // resets isThinking if the worker goes silent

// If the worker crashes mid-generation it emits no done/error event, leaving
// isThinking stuck true and the composer permanently disabled. Arm a watchdog
// on each send/start and clear it on any terminal event.
const THINKING_TIMEOUT_MS = 90000;
function armThinkingWatchdog() {
    clearTimeout(thinkingWatchdog);
    thinkingWatchdog = setTimeout(() => {
        if (!isThinking) return;
        isThinking = false;
        streamingBuf = '';
        showTutorToast('The coach stopped responding — please try again.');
        if (sdkRender) sdkRender();
    }, THINKING_TIMEOUT_MS);
}
function clearThinkingWatchdog() {
    clearTimeout(thinkingWatchdog);
    thinkingWatchdog = null;
}

// rAF-batch streaming renders: a full AICat vdom rebuild on every single token
// is janky on long threads. Coalesce bursts of tokens into one render per frame.
let streamRenderQueued = false;
function scheduleStreamRender() {
    if (streamRenderQueued) return;
    streamRenderQueued = true;
    const raf = (typeof requestAnimationFrame === 'function')
        ? requestAnimationFrame
        : (cb) => setTimeout(cb, 16);
    raf(() => {
        streamRenderQueued = false;
        if (sdkRender) sdkRender();
        keepScrolledToBottom();
    });
}

// Keep the chat pinned to the latest message while streaming, mirroring the
// fallback path's stick-to-bottom behaviour for the SDK thread.
function keepScrolledToBottom() {
    if (isPanelCollapsed) return; // chatRoot is display:none when collapsed — nothing to scroll
    const root = panelContainer?.querySelector('#tutor-chat-root');
    if (!root) return;
    const scroller = root.querySelector('.chat-thread') || root.querySelector('[class*="thread"]') || root;
    if (!scroller) return;
    const stuck = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    if (stuck) scroller.scrollTop = scroller.scrollHeight;
}

// Inline SVG icons (crisp at any DPI, theme-colored via currentColor) — replace
// the Unicode-glyph button labels that read as machine-shaped tells. Each returns
// an <svg> string sized to the em-box; stroke uses currentColor so theming is free.
const ICONS = {
    // circular-arrow "new conversation"
    new: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.5 2.5V5H11"/></svg>',
    // gear "settings"
    settings: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.4v1.6M8 13v1.6M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M1.4 8h1.6M13 8h1.6M3.1 12.9l1.1-1.1M11.8 4.2l1.1-1.1"/></svg>',
    // overlapping-squares "copy"
    copy: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.3"/><path d="M10.5 5.5V3.8A1.3 1.3 0 0 0 9.2 2.5H3.8A1.3 1.3 0 0 0 2.5 3.8v5.4a1.3 1.3 0 0 0 1.3 1.3h1.7"/></svg>',
    // refresh "retry"
    retry: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 1 1.6 3.9"/><path d="M2.5 13.5V11H5"/></svg>',
    // filled square "stop"
    stop: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="1.4"/></svg>',
    // collapse/expand chevrons
    chevronLeft: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>',
    chevronRight: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>',
    // spinner-dot for loading / warning triangle for unavailable (status pill)
    spinner: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" class="tutor-spin"><path d="M8 2a6 6 0 1 0 6 6" opacity="0.9"/></svg>',
    warn: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.2 14.5 13.5H1.5L8 2.2Z"/><path d="M8 6.5v3M8 11.5v.01"/></svg>'
};

const STARTER_PROMPTS = [
    'Plan my study session',
    'Quiz me on cardiology',
    'Explain SIADH simply',
    'What should I review first?'
];

// Real study state, set by the app so starter chips can be personalized.
let tutorContext = { weakestSubject: '', dueCount: 0 };
export function setTutorContext(ctx = {}) {
    tutorContext = { ...tutorContext, ...ctx };
}

function starterPrompts() {
    const chips = [];
    if (tutorContext.dueCount > 0) chips.push(`Plan my ${tutorContext.dueCount} due cards`);
    else chips.push('Plan my study session');
    if (tutorContext.weakestSubject) chips.push(`Quiz me on ${tutorContext.weakestSubject}`);
    else chips.push('Quiz me on cardiology');
    chips.push('What should I review first?');
    chips.push('Explain a tricky concept');
    return chips;
}

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

// Plain-text status (used for the AICat `status` prop and aria). The pill DOM
// adds an icon separately via statusIcon().
function statusLabel() {
    switch (modelStatus) {
        case 'loading': return modelStatusDetail || 'loading…';
        case 'downloading': return modelStatusDetail || 'downloading…';
        case 'ready': return 'ready';
        case 'unavailable': return 'unavailable';
        default: return 'tap to start';
    }
}

function statusIcon() {
    switch (modelStatus) {
        case 'loading':
        case 'downloading': return ICONS.spinner;
        case 'unavailable': return ICONS.warn;
        default: return '';
    }
}

// Render the status pill's content (icon + label) into a given element.
function paintPill(pill) {
    if (!pill) return;
    pill.setAttribute('data-status', modelStatus);
    const ic = statusIcon();
    pill.innerHTML = (ic ? `<span class="tutor-pill-ic">${ic}</span>` : '') +
        `<span class="tutor-pill-label"></span>`;
    pill.querySelector('.tutor-pill-label').textContent = statusLabel();
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
        // Announce streamed/added messages to assistive tech (the SDK thread has
        // no live region of its own; the fallback path uses aria-live too).
        chatRoot.setAttribute('aria-live', 'polite');
        chatRoot.setAttribute('aria-label', 'Study coach conversation');
        panelContainer.appendChild(chatRoot);

        // SDK-agnostic header controls (status pill, new-conversation, settings).
        // AICat(Dt) ignores a `header` prop, so we render these as an overlay we
        // control, positioned over the AICat chat-head.
        const hdr = document.createElement('div');
        hdr.id = 'tutor-hdr-controls';
        panelContainer.appendChild(hdr);

        // SDK-agnostic action bar (copy / regenerate) rendered as a sibling we control.
        const actionBar = document.createElement('div');
        actionBar.id = 'tutor-action-bar';
        panelContainer.appendChild(actionBar);

        // Empty-state starter chips (AICat ignores an `empty` prop) — overlay slot.
        const emptySlot = document.createElement('div');
        emptySlot.id = 'tutor-empty-slot';
        panelContainer.appendChild(emptySlot);

        // Whole collapsed strip is a click target to expand (the toggle button
        // is small; the 52px strip / mobile peek should also open the coach).
        panelContainer.addEventListener('click', (e) => {
            if (isPanelCollapsed && !e.target.closest('#tutor-collapse-btn')) {
                toggleTutorCollapse();
            }
        });

        document.body.appendChild(panelContainer);
    }
    applyResponsiveWidth();

    const { components: C } = sdk;
    const chatRoot = panelContainer.querySelector('#tutor-chat-root');
    if (!chatRoot) return;

    sdkRender = sdk.mount(chatRoot, () => {
        // When collapsed, chatRoot is display:none — the always-present toggle
        // button (rendered outside chatRoot) is the open affordance, so render
        // nothing here to avoid building dead vdom on every collapse.
        if (isPanelCollapsed) return C.h('div', {});

        const messages = tutorMessages.map((m, i) => ({
            role: m.role || (m.isUser ? 'user' : 'assistant'),
            // Render the stop marker only in the UI; it is never stored in m.text.
            text: m.interrupted ? `${m.text} …[stopped]` : m.text,
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

        // AICat ignores header/footer/empty props — update our own overlays.
        updateActionBar();
        updateHeaderControls();
        updateEmptySlot(messages.length === 0);

        return C.AICat({
            name: 'Study Coach',
            messages: messages,
            thinking: isThinking,
            status: statusLabel(),
            composer: isThinking ? renderStopRow(C, composer) : composer
        });
    });
}

// Imperative header overlay (status pill + new-conversation + settings), since
// AICat(Dt) does not render a `header` prop.
function updateHeaderControls() {
    const host = panelContainer?.querySelector('#tutor-hdr-controls');
    if (!host) return;
    host.style.display = isPanelCollapsed ? 'none' : '';
    if (isPanelCollapsed) { host.innerHTML = ''; host.dataset.built = '0'; return; }

    // The pill text/status changes on every streaming token; the buttons and the
    // (possibly open) settings popover do NOT. Rebuilding host.innerHTML on every
    // render would destroy an open popover and steal slider focus mid-drag. So:
    // build the static structure once, then update only the pill in place. Rebuild
    // the popover sub-tree only when showSettings toggles.
    const built = host.dataset.built === '1';
    const popOpen = !!host.querySelector('.tutor-settings-pop');
    if (built && popOpen === showSettings) {
        paintPill(host.querySelector('.tutor-status-pill'));
        return;
    }

    host.innerHTML = '';
    const pill = document.createElement('span');
    pill.className = 'tutor-status-pill';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    paintPill(pill);
    host.appendChild(pill);
    const mk = (svg, title, fn) => {
        const b = document.createElement('button');
        b.className = 'tutor-hdr-btn';
        b.innerHTML = svg; b.title = title; b.setAttribute('aria-label', title);
        b.addEventListener('click', fn);
        return b;
    };
    host.appendChild(mk(ICONS.new, 'New conversation', clearConversation));
    host.appendChild(mk(ICONS.settings, 'Tutor settings', toggleSettings));
    if (showSettings) host.appendChild(buildSettingsPopover());
    host.dataset.built = '1';
}

// Empty-state starter chips overlay (AICat ignores an `empty` prop).
function updateEmptySlot(isEmpty) {
    const slot = panelContainer?.querySelector('#tutor-empty-slot');
    if (!slot) return;
    if (!isEmpty || isPanelCollapsed) {
        if (slot.dataset.shown === '1') { slot.style.display = 'none'; slot.innerHTML = ''; slot.dataset.shown = '0'; }
        return;
    }
    // Already showing the chips — skip the full rebuild to avoid per-render flicker/churn.
    if (slot.dataset.shown === '1') return;
    slot.dataset.shown = '1';
    slot.style.display = '';
    slot.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'tutor-empty-title';
    title.textContent = "Hi -- I'm your study coach.";
    const sub = document.createElement('div');
    sub.className = 'tutor-empty-sub';
    sub.textContent = 'Try one of these:';
    const chips = document.createElement('div');
    chips.className = 'tutor-chips';
    for (const p of starterPrompts()) {
        const c = document.createElement('button');
        c.className = 'tutor-chip';
        c.textContent = p;
        c.addEventListener('click', () => sendTutorMessage(p));
        chips.appendChild(c);
    }
    slot.append(title, sub, chips);
}

// DOM (not vdom) settings popover — lives inside the imperative header overlay.
function buildSettingsPopover() {
    const pop = document.createElement('div');
    pop.className = 'tutor-settings-pop';
    pop.setAttribute('role', 'group');
    pop.setAttribute('aria-label', 'Tutor settings');
    const toggleRow = (label, key) => {
        const row = document.createElement('label');
        row.className = 'tutor-set-row';
        row.setAttribute('role', 'checkbox');
        row.setAttribute('aria-checked', String(!!config[key]));
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!config[key];
        cb.addEventListener('change', () => {
            config[key] = cb.checked;
            saveConfig(config);
            row.setAttribute('aria-checked', String(cb.checked));
        });
        const span = document.createElement('span');
        span.textContent = label;
        row.append(cb, span);
        return row;
    };
    const widthRow = document.createElement('label');
    widthRow.className = 'tutor-set-row tutor-set-width';
    const wlabel = document.createElement('span');
    wlabel.textContent = 'Panel width';
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '24'; slider.max = '60'; slider.step = '2';
    slider.value = String(config.panelWidth || 30);
    slider.setAttribute('aria-label', 'Panel width percent');
    const val = document.createElement('span');
    val.className = 'tutor-set-val';
    val.textContent = `${config.panelWidth || 30}%`;
    slider.addEventListener('input', () => {
        config.panelWidth = Number(slider.value) || 30;
        saveConfig(config);
        val.textContent = `${config.panelWidth}%`;
        applyResponsiveWidth();
    });
    widthRow.append(wlabel, slider, val);
    pop.append(
        toggleRow('Daily check-in', 'proactiveCheckins'),
        toggleRow('Coach me after reviews', 'autoCoachOnReview'),
        widthRow
    );
    return pop;
}

function updateActionBar() {
    const bar = panelContainer?.querySelector('#tutor-action-bar');
    if (!bar) return;
    const last = tutorMessages[tutorMessages.length - 1];
    const idle = !isPanelCollapsed && !isThinking && !streamingBuf && last && last.role === 'assistant';
    if (!idle) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
    bar.style.display = '';
    bar.className = 'tutor-msg-actions';
    bar.innerHTML = '';
    const mkBtn = (svg, label, title, fn) => {
        const b = document.createElement('button');
        b.className = 'tutor-msg-act';
        b.innerHTML = `${svg}<span>${label}</span>`;
        b.title = title; b.setAttribute('aria-label', title);
        b.addEventListener('click', fn);
        return b;
    };
    // Copy is meaningless on an error turn; only offer retry there.
    if (!last.err) bar.appendChild(mkBtn(ICONS.copy, 'copy', 'Copy answer', () => copyText(last.text)));
    // Retry whenever there is a real preceding user turn to resend — including
    // after an error turn, so "use retry below" is a real affordance.
    if (lastRegenerableUserText()) {
        bar.appendChild(mkBtn(ICONS.retry, 'retry', 'Regenerate answer', regenerateLast));
    }
}

function renderStopRow(C, composer) {
    return C.h('div', { class: 'tutor-composer-stop' },
        C.h('button', { class: 'tutor-stop-btn', title: 'Stop generating', 'aria-label': 'Stop generating', onClick: stopGeneration }, 'stop'),
        composer
    );
}

function makeToggleBtn() {
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'tutor-collapse-btn';
    toggleBtn.className = 'tutor-collapse-btn';
    toggleBtn.innerHTML = isPanelCollapsed ? ICONS.chevronLeft : ICONS.chevronRight;
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
                <span style="font-weight:600;font-size:14px;">Study Coach</span>
                <span id="tutor-status-pill" class="tutor-status-pill">starting…</span>
            </div>
            <div style="display:flex;gap:4px;">
                <button id="tutor-clear-btn" class="tutor-hdr-btn" title="New conversation" aria-label="New conversation">${ICONS.new}</button>
                <button id="tutor-collapse-btn" class="tutor-collapse-btn" title="Collapse panel" aria-label="Collapse panel">${ICONS.chevronRight}</button>
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
        appendFallbackMessage('Hi -- I\'m your study coach. Ask a question, or try "What should I review first?"', false);
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
// Single breakpoint shared with style.css (≤768px = mobile bottom sheet).
const MOBILE_BP = '(max-width: 768px)';

function applyResponsiveWidth() {
    if (!panelContainer) return;
    const mobile = window.matchMedia(MOBILE_BP).matches;
    const chatRoot = panelContainer.querySelector('#tutor-chat-root');
    const toggleBtn = panelContainer.querySelector('#tutor-collapse-btn');

    panelContainer.classList.toggle('tutor-collapsed', isPanelCollapsed);

    if (mobile) {
        // Mobile: CSS owns width/height (bottom sheet). Never set inline width —
        // it would fight the !important sheet rules and the height transition.
        panelContainer.style.width = '';
        document.body.classList.toggle('tutor-sheet-open', !isPanelCollapsed);
    } else {
        // Desktop: collapsed strip vs configured width. Clear the body class.
        document.body.classList.remove('tutor-sheet-open');
        panelContainer.style.width = isPanelCollapsed ? '52px' : ((config.panelWidth || 30) + '%');
    }

    // The chat body is hidden when collapsed via the .tutor-collapsed class in CSS
    // (display toggle deferred so the width/height transition can animate).
    if (chatRoot) chatRoot.style.display = isPanelCollapsed ? 'none' : '';

    if (toggleBtn) {
        if (isPanelCollapsed && mobile) {
            toggleBtn.innerHTML = '<span class="tutor-collapse-label">Coach</span>';
        } else {
            toggleBtn.innerHTML = isPanelCollapsed ? ICONS.chevronLeft : ICONS.chevronRight;
        }
        toggleBtn.setAttribute('aria-expanded', String(!isPanelCollapsed));
        toggleBtn.setAttribute('aria-label', isPanelCollapsed ? 'Open study coach' : 'Collapse study coach');
    }
}

function toggleTutorCollapse() {
    if (!panelContainer) return;
    isPanelCollapsed = !isPanelCollapsed;
    saveCollapsed(isPanelCollapsed);
    applyResponsiveWidth();
    // Opening the coach is the moment to start loading the model (lazy load),
    // so the first message doesn't pay the full download with no feedback.
    if (!isPanelCollapsed) preloadTutorModel();
    if (sdkRender) sdkRender();
}

// Idempotent model preload — kicks the worker's load and reflects it in the pill.
let preloadKicked = false;
export function preloadTutorModel() {
    if (preloadKicked || !tutorWorker) return;
    if (modelStatus === 'ready' || modelStatus === 'unavailable') return;
    preloadKicked = true;
    setStatus('loading', 'starting the coach…');
    tutorWorker.postMessage({ cmd: 'init' });
}

let settingsPriorFocus = null;
function toggleSettings() {
    showSettings = !showSettings;
    if (showSettings) {
        // Remember what had focus so we can restore it when the popover closes
        // (keyboard users shouldn't be dumped at the top of the document).
        settingsPriorFocus = document.activeElement;
        // Close on outside-click or Escape. Registered on the next tick so the
        // click that opened the popover doesn't immediately close it.
        setTimeout(() => {
            document.addEventListener('click', onSettingsOutsideClick, true);
            document.addEventListener('keydown', onSettingsEscape, true);
            // Move focus into the popover for keyboard users.
            panelContainer?.querySelector('.tutor-settings-pop input')?.focus();
        }, 0);
    } else {
        removeSettingsDismissHandlers();
        restoreSettingsFocus();
    }
    if (sdkRender) sdkRender();
}

function restoreSettingsFocus() {
    const gear = panelContainer?.querySelectorAll('.tutor-hdr-btn');
    const target = (settingsPriorFocus && settingsPriorFocus.isConnected)
        ? settingsPriorFocus
        : (gear && gear[gear.length - 1]);
    settingsPriorFocus = null;
    try { target?.focus(); } catch {}
}

function removeSettingsDismissHandlers() {
    document.removeEventListener('click', onSettingsOutsideClick, true);
    document.removeEventListener('keydown', onSettingsEscape, true);
}

function onSettingsOutsideClick(e) {
    const pop = panelContainer?.querySelector('.tutor-settings-pop');
    const gear = e.target.closest?.('.tutor-hdr-btn');
    if (pop && !pop.contains(e.target) && !gear) {
        showSettings = false;
        removeSettingsDismissHandlers();
        restoreSettingsFocus();
        if (sdkRender) sdkRender();
    }
}

function onSettingsEscape(e) {
    if (e.key === 'Escape') {
        showSettings = false;
        removeSettingsDismissHandlers();
        restoreSettingsFocus();
        if (sdkRender) sdkRender();
    }
}

function syncTheme() {
    // Theme is entirely CSS-variable driven, so a theme change needs no rerender
    // of the chat vdom. (Previously this re-ran the full AICat build on every
    // theme-changed event, compounding the per-token render cost.)
}

// ----- conversation control -----
function persist() {
    saveHistory(tutorMessages);
}

export function clearConversation() {
    tutorMessages = [];
    streamingBuf = '';
    clearHistory();
    if (tutorWorker) {
        // Interrupt any in-flight generation before resetting so the worker's
        // KV cache is disposed by runChat after the generate settles, never
        // mid-generate (the use-after-free guard). The worker also self-guards.
        if (isThinking) tutorWorker.postMessage({ cmd: 'stop' });
        tutorWorker.postMessage({ cmd: 'reset-history' });
    }
    isThinking = false;
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
    if (opts.interrupted) turn.interrupted = true;
    tutorMessages.push(turn);
    persist();
    if (sdkRender) { sdkRender(); keepScrolledToBottom(); }
    else appendFallbackMessage(text, isUser);
}

// Copy with a real async path: clipboard API rejects asynchronously (the sync
// try/catch never catches it) and is undefined on insecure contexts, so we await
// it and fall back to execCommand before reporting success.
async function copyText(text) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            showTutorToast('Copied');
            return;
        }
    } catch { /* fall through to execCommand */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        showTutorToast(ok ? 'Copied' : 'Copy failed');
    } catch {
        showTutorToast('Copy failed');
    }
}

let toastEl = null;
let toastTimer = null;
let toastRemoveTimer = null;
// Single reusable toast element: rapid-fire toasts (repeated errors, copy, stop)
// reuse one node instead of stacking unbounded overlapping divs at the same spot.
export function showTutorToast(message, duration = 3000) {
    if (!panelContainer) return;
    if (!toastEl || !toastEl.isConnected) {
        toastEl = document.createElement('div');
        toastEl.className = 'tutor-toast';
        toastEl.setAttribute('role', 'status');
        toastEl.setAttribute('aria-live', 'polite');
        panelContainer.appendChild(toastEl);
    }
    clearTimeout(toastTimer);
    clearTimeout(toastRemoveTimer);
    toastEl.textContent = message;
    toastEl.style.opacity = '1';
    toastTimer = setTimeout(() => {
        if (!toastEl) return;
        toastEl.style.opacity = '0';
        toastRemoveTimer = setTimeout(() => { toastEl?.remove(); toastEl = null; }, 300);
    }, duration);
}

export function sendTutorMessage(text, opts = {}) {
    if (!text || !text.trim() || !tutorWorker || isThinking) return;
    if (modelStatus === 'unavailable') {
        showTutorToast('Tutor unavailable — WebGPU required (Chrome/Edge).');
        return;
    }
    preloadTutorModel(); // ensure the model is loading even if send precedes open
    if (!opts.isRegenerate) addTutorMessage(text, true);
    lastUserText = text;
    // Set thinking optimistically *now*, before the worker's coaching-start —
    // otherwise during the model-load window (status loading/downloading) the
    // isThinking guard is still false and rapid sends would queue duplicate
    // user-messages with no spinner. The worker processes in order; the first
    // coaching-start just confirms what we already reflect.
    isThinking = true;
    armThinkingWatchdog();
    if (modelStatus !== 'ready') {
        // First use while the model is still loading: tell the user the reply
        // will follow once the model finishes, so the UI does not look frozen.
        showTutorToast('Loading the coach — your first reply may take a moment…', 4000);
    }
    if (sdkRender) sdkRender();
    // Unified routing: the model decides whether to answer or emit a tool block.
    // Regenerate requests sampling so the retry varies (see runChat sample flag).
    tutorWorker.postMessage({ cmd: 'user-message', text, sample: opts.isRegenerate === true });
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
    paintPill(panelContainer?.querySelector('#tutor-status-pill'));
    paintPill(panelContainer?.querySelector('.tutor-status-pill'));
    if (sdkRender) sdkRender();
}

export function wireWorkerToPanel(worker) {
    tutorWorker = worker;

    // Seed the worker with persisted history so its LLM context matches the panel.
    if (tutorMessages.length) {
        worker.postMessage({ cmd: 'seed-history', history: toWorkerHistory(tutorMessages) });
    }

    // If the user had the coach open from a previous visit, start loading now so
    // it is ready by the time they type (the open-trigger already fired pre-wire).
    if (!isPanelCollapsed) preloadTutorModel();

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

            case 'unavailable': {
                isThinking = false;
                clearThinkingWatchdog();
                // Allow a later open/send to re-attempt the load. Without this the
                // module-scoped preloadKicked latch stays true forever, so a retry
                // (e.g. after the user enables WebGPU and reopens) never fires.
                preloadKicked = false;
                setStatus('unavailable', error || 'WebGPU required');
                // Don't spam the thread with duplicate availability errors on repeated
                // sends — surface once, then only a transient toast thereafter.
                const last = tutorMessages[tutorMessages.length - 1];
                const alreadyShown = last && last.err && /unavailable/i.test(last.text);
                if (!alreadyShown) {
                    addTutorMessage(`Tutor unavailable — ${error || 'WebGPU required. Open in Chrome or Edge.'}`, false, { err: true });
                } else {
                    showTutorToast('Tutor unavailable — WebGPU required.');
                }
                break;
            }

            case 'coaching-start':
                isThinking = true;
                armThinkingWatchdog();
                streamingBuf = '';
                if (sdkRender) sdkRender();
                break;

            case 'token':
                if (token != null) {
                    streamingBuf += token;
                    armThinkingWatchdog(); // streaming progress = worker alive
                    scheduleStreamRender();
                }
                break;

            // Conversational reply to a user message — the ONLY path that persists a
            // thread turn AND is worker-synced. (guide-answer-done is also a direct
            // user question, so it persists too.)
            case 'coaching-done':
            case 'guide-answer-done': {
                isThinking = false;
                clearThinkingWatchdog();
                const clean = dispatchAndStrip(message);
                streamingBuf = '';
                if (clean && clean.trim()) {
                    // Persist interrupted as metadata, not baked into the text —
                    // so the marker never reloads into the thread or feeds back
                    // into the model's context on reseed.
                    addTutorMessage(clean, false, { interrupted: interrupted === true });
                } else if (interrupted) {
                    showTutorToast('Stopped.');
                    if (sdkRender) sdkRender();
                }
                if (event === 'guide-answer-done') showTutorToast('Guide answer ready');
                break;
            }

            // Ephemeral coaching/overview/hints: NOT a persisted conversation turn and
            // NOT in worker history (no preceding user turn). Mirror to the inline slot
            // and show a transient note instead of polluting the thread + reload seed.
            case 'review-coaching-done':
            case 'session-overview-done':
            case 'triage-hint-done': {
                isThinking = false;
                clearThinkingWatchdog();
                const clean = dispatchAndStrip(message);
                streamingBuf = '';
                if (event === 'review-coaching-done') {
                    const inline = document.getElementById('tutor-card-coaching');
                    if (inline) inline.textContent = clean;
                }
                if (event === 'session-overview-done') {
                    // Daily greeting: consume the check-in slot only once it actually
                    // rendered. Guard against a reply that arrives after a local-midnight
                    // rollover stamping the wrong (prior) day as checked-in.
                    if (shouldCheckInToday()) markCheckedIn();
                    // Render the full personalized plan into the thread (it used to be a
                    // truncated 6s toast that was discarded). A short toast nudges the
                    // user to open the panel if it's collapsed.
                    if (clean && clean.trim()) {
                        addTutorMessage(clean, false);
                        if (isPanelCollapsed) showTutorToast('Your study coach has a plan for today', 6000);
                    }
                }
                if (event === 'triage-hint-done' && clean) showTutorToast('Hint: ' + clean.slice(0, 120), 6000);
                break;
            }

            case 'error':
                isThinking = false;
                clearThinkingWatchdog();
                streamingBuf = '';
                addTutorMessage(`Something went wrong: ${error || e.data.msg}. Use retry below.`, false, { err: true });
                break;
        }
    });
}

// Re-sync the in-memory thread from storage (another tab wrote history).
// Guard against clobbering a live generation in this tab.
export function syncTutorFromStorage() {
    if (isThinking || streamingBuf) return;
    const fresh = loadHistory();
    // Only adopt if it actually differs, to avoid needless rerenders.
    if (JSON.stringify(fresh) === JSON.stringify(tutorMessages)) return;
    tutorMessages = fresh;
    if (tutorWorker) {
        tutorWorker.postMessage({ cmd: 'reset-history' });
        tutorWorker.postMessage({ cmd: 'seed-history', history: toWorkerHistory(tutorMessages) });
    }
    if (sdkRender) sdkRender();
}

export function closeTutorPanel() {
    if (panelContainer) {
        panelContainer.remove();
        panelContainer = null;
    }
}
