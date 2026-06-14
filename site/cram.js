// cram-mode dismissal persistence -- corpus.cram.dismissed.v1.
import { localDayISO } from './dates.js';
import { skey } from './syllabus.js';
const KEY = () => skey('cram.dismissed.v1');

export function isDismissed() {
    try { const raw = localStorage.getItem(KEY()); if (!raw) return false;
        const d = JSON.parse(raw); return d && d.date === todayISO(); }
    catch { return false; }
}

export function dismiss() {
    try { localStorage.setItem(KEY(), JSON.stringify({ date: todayISO() })); } catch {}
}

function todayISO() { return localDayISO(); }

if (typeof window !== 'undefined') window.__cram = { isDismissed, dismiss };



