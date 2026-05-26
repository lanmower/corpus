// Tutor persistence + config — single source of truth for conversation history,
// collapsed state, and tutor behavior config. All corrupt/quota cases degrade
// to safe defaults without throwing.

export const HISTORY_KEY = 'corpus.tutor.history.v1';
export const COLLAPSED_KEY = 'corpus.tutor.collapsed.v1';
export const CONFIG_KEY = 'corpus.tutor.config.v1';
export const LAST_CHECKIN_KEY = 'corpus.tutor.lastCheckin.v1';

const MAX_TURNS = 40; // panel-visible turns; worker context is capped separately at 12

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
        .slice(-12);
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
        return { ...DEFAULT_CONFIG, ...parsed };
    } catch {
        return { ...DEFAULT_CONFIG };
    }
}

export function saveConfig(config) {
    safeSet(CONFIG_KEY, JSON.stringify({ ...DEFAULT_CONFIG, ...config }));
}

// ----- daily check-in gate -----
function todayStamp() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function shouldCheckInToday() {
    return safeGet(LAST_CHECKIN_KEY) !== todayStamp();
}

export function markCheckedIn() {
    safeSet(LAST_CHECKIN_KEY, todayStamp());
}
