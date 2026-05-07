// daily plan — 60-90min budget. corpus.plan.v1
// Locked subjects (no video watched) emit watch + read tasks instead of review.
const KEY = 'corpus.plan.v1';

function todayISO() { return new Date().toISOString().slice(0, 10); }

export function build({ due, weakestSubject, nextSection, casesAvailable, unlocked, lockedSubjects }) {
    const lockedList = Array.isArray(lockedSubjects) ? lockedSubjects.filter(Boolean) : [];
    const weakestLocked = weakestSubject && unlocked && unlocked[weakestSubject] === false;
    const tasks = [];

    if (weakestLocked) {
        tasks.push({ kind: 'watch', min: 25, label: `watch ${weakestSubject} lecture · then unlock cards`, href: `#subject/${weakestSubject}` });
        tasks.push({ kind: 'read', min: 20, label: `read ${weakestSubject} guide`, href: `#subject/${weakestSubject}` });
    } else {
        const reviewMin = Math.min(40, Math.max(10, Math.round(due * 0.4)));
        const guideMin = nextSection ? 20 : 0;
        const caseMin = casesAvailable > 0 ? 15 : 0;
        if (reviewMin) tasks.push({ kind: 'review', min: reviewMin, label: `${reviewMin} min review (${due} due)`, href: '#review' });
        if (guideMin && nextSection && weakestSubject) tasks.push({ kind: 'guide', min: guideMin, label: `${guideMin} min ${weakestSubject}: ${nextSection.title}`, href: `#subject/${weakestSubject}` });
        if (caseMin && weakestSubject) tasks.push({ kind: 'case', min: caseMin, label: `1 case (${weakestSubject})`, href: './triage-live.html' });
    }

    // Add a tail "unlock these" hint when other subjects remain locked.
    const otherLocked = lockedList.filter(s => s !== weakestSubject);
    if (otherLocked.length) {
        tasks.push({ kind: 'unlock', min: 0, label: `${otherLocked.length} subject${otherLocked.length === 1 ? '' : 's'} locked — watch lecture to unlock`, href: '#guides' });
    }

    const total = tasks.reduce((n, t) => n + (t.min || 0), 0);
    return { date: todayISO(), tasks, total };
}

export function load() {
    try { const p = JSON.parse(localStorage.getItem(KEY) || 'null'); if (p && p.date === todayISO()) return p; return null; }
    catch { return null; }
}
export function save(plan) { try { localStorage.setItem(KEY, JSON.stringify(plan)); } catch {} }
export function complete(kind) { const p = load(); if (!p) return; (p.completed = p.completed || []).push(kind); save(p); }

if (typeof window !== 'undefined') window.__plan = { build, load, save, complete };
