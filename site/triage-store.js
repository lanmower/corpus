// Shared reader for the triage session store (corpus.triage.v1). triage-live.js
// owns the writes; every other page (home-page case counts in app.js) reads
// through this module so the schema normalization lives in exactly one place.
export const PERSIST_KEY = 'corpus.triage.v1';
export const SCHEMA_VERSION = 1;

export function readSessions() {
    try {
        const raw = localStorage.getItem(PERSIST_KEY);
        if (!raw) return { sessions: {}, streak: 0 };
        const obj = JSON.parse(raw);
        if (obj && obj.version === SCHEMA_VERSION && obj.sessions && typeof obj.sessions === 'object' && !Array.isArray(obj.sessions)) {
            return { sessions: obj.sessions, streak: obj.streak || 0 };
        }
        return { sessions: {}, streak: 0 };
    } catch { return { sessions: {}, streak: 0 }; }
}

// Backwards-compat: sessions used to be stored as bare arrays; normalize on read.
export function sessionCards(sess) {
    if (!sess) return [];
    if (Array.isArray(sess)) return sess;
    return sess.cards || [];
}

export function sessionScore(sess) {
    if (!sess || Array.isArray(sess)) return null;
    return sess.score ?? null;
}
