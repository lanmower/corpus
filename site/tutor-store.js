// Tutor persistence + config — single source of truth for conversation history,
// collapsed state, and tutor behavior config. All corrupt/quota cases degrade
// to safe defaults without throwing.

export const HISTORY_KEY = 'corpus.tutor.history.v1';
export const COLLAPSED_KEY = 'corpus.tutor.collapsed.v1';
export const CONFIG_KEY = 'corpus.tutor.config.v1';
export const LAST_CHECKIN_KEY = 'corpus.tutor.lastCheckin.v1';

// Panel keeps up to MAX_TURNS visible/persisted turns. The worker's LLM context
// is capped separately (WORKER_CONTEXT_TURNS in tutor.js) for cost — so on reload
// the model "remembers" fewer turns than the user can scroll back to. This is an
// intentional tradeoff: visible history is cheap, model context is not.
const MAX_TURNS = 40;
export const WORKER_CONTEXT_TURNS = 16; // shared with tutor.js / toWorkerHistory

export const DEFAULT_CONFIG = {
    proactiveCheckins: true,
    autoCoachOnReview: true,
    panelWidth: 30 // percent on desktop
};

function safeGet(key) {
    try { return localStorage.getItem(key); }
    catch { return null; }
}

function safeSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        // QuotaExceededError or storage disabled — signal the app's banner.
        // Cover Chrome (QuotaExceededError, code 22), Firefox (NS_ERROR_DOM_QUOTA_REACHED,
        // code 1014), and Safari quota names.
        const isQuota = e && (e.code === 22 || e.code === 1014 ||
            /quota|NS_ERROR_DOM_QUOTA/i.test(String(e.name || e)));
        if (isQuota && typeof window !== 'undefined') {
            try { window.dispatchEvent(new CustomEvent('corpus:storage-full')); } catch {}
        }
        return false;
    }
}

// ----- conversation history -----
// A turn is { role:'user'|'assistant', text:string, ts:number }.
export function loadHistory() {
    const raw = safeGet(HISTORY_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(t => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
            .map(t => {
                // Keep only the known turn shape; carry UI-only flags forward.
                const turn = { role: t.role, text: t.text, ts: t.ts };
                if (t.err === true) turn.err = true;
                if (t.interrupted === true) turn.interrupted = true;
                return turn;
            })
            .slice(-MAX_TURNS);
    } catch {
        // Corrupt JSON: drop it, do not throw.
        try { localStorage.removeItem(HISTORY_KEY); } catch {}
        return [];
    }
}

export function saveHistory(turns) {
    const trimmed = (Array.isArray(turns) ? turns : []).slice(-MAX_TURNS);
    let payload = JSON.stringify(trimmed);
    if (!safeSet(HISTORY_KEY, payload)) {
        // On quota failure, retry with a harder trim.
        const hard = trimmed.slice(-10);
        safeSet(HISTORY_KEY, JSON.stringify(hard));
    }
}

export function clearHistory() {
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
}

// Project panel turns into the {role, content} shape the worker seeds from.
export function toWorkerHistory(turns) {
    return (Array.isArray(turns) ? turns : [])
        .filter(t => t && t.text)
        .map(t => ({ role: t.role, content: t.text }))
        .slice(-WORKER_CONTEXT_TURNS);
}

// ----- collapsed state -----
export function loadCollapsed(defaultCollapsed = true) {
    const raw = safeGet(COLLAPSED_KEY);
    if (raw === null) return defaultCollapsed;
    return raw === '1';
}

export function saveCollapsed(collapsed) {
    safeSet(COLLAPSED_KEY, collapsed ? '1' : '0');
}

// ----- config -----
export function loadConfig() {
    const raw = safeGet(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_CONFIG };
        const merged = { ...DEFAULT_CONFIG, ...parsed };
        // Clamp panelWidth to the slider's bounds (24..60) so a hand-edited or
        // legacy value can't silently desync the slider thumb from the saved value.
        const w = Number(merged.panelWidth);
        merged.panelWidth = Number.isFinite(w) ? Math.max(24, Math.min(60, w)) : DEFAULT_CONFIG.panelWidth;
        return merged;
    } catch {
        return { ...DEFAULT_CONFIG };
    }
}

export function saveConfig(config) {
    safeSet(CONFIG_KEY, JSON.stringify({ ...DEFAULT_CONFIG, ...config }));
}

// ----- daily check-in gate -----
function todayStamp() {
    // Zero-padded local date (YYYY-MM-DD). Local — not UTC — so the "new day"
    // rolls over at the user's local midnight, matching how they perceive "today".
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

export function shouldCheckInToday() {
    return safeGet(LAST_CHECKIN_KEY) !== todayStamp();
}

export function markCheckedIn() {
    safeSet(LAST_CHECKIN_KEY, todayStamp());
}
