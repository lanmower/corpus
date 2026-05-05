// cram-mode dismissal persistence — corpus.cram.dismissed.v1.
const KEY = 'corpus.cram.dismissed.v1';

export function isDismissed() {
    try { const raw = localStorage.getItem(KEY); if (!raw) return false;
        const d = JSON.parse(raw); return d && d.date === todayISO(); }
    catch { return false; }
}

export function dismiss() {
    try { localStorage.setItem(KEY, JSON.stringify({ date: todayISO() })); } catch {}
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

if (typeof window !== 'undefined') window.__cram = { isDismissed, dismiss };
