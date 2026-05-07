// Read-side coverage API: unifies guide-section ticks + video unlock state.
// - section ticks live in localStorage 'corpus.guide.v1' = {[subject]:{[lineStr]:bool}}
// - video unlock state is delegated to unlocked.js (single source of truth)
import * as unlocked from './unlocked.js';

const GUIDE_KEY = 'corpus.guide.v1';

function readTicks() {
    try { return JSON.parse(localStorage.getItem(GUIDE_KEY) || '{}') || {}; } catch { return {}; }
}
function writeTicks(o) { try { localStorage.setItem(GUIDE_KEY, JSON.stringify(o)); } catch {} }

export function isVideoCovered(subject) { return unlocked.isUnlocked(subject); }

export function isSectionCovered(subject, line) {
    const t = readTicks()[subject] || {};
    return t[String(line)] === true;
}

export function coveredSections(subject) {
    const t = readTicks()[subject] || {};
    const out = new Set();
    for (const [k, v] of Object.entries(t)) if (v === true) out.add(String(k));
    return out;
}

export function subjectHasAnyCoverage(subject) {
    if (isVideoCovered(subject)) return true;
    return coveredSections(subject).size > 0;
}

export function markSectionRead(subject, line) {
    const all = readTicks();
    (all[subject] = all[subject] || {})[String(line)] = true;
    writeTicks(all);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('corpus:coverage-changed'));
}

export function markVideoWatched(subject, when) { return unlocked.markWatched(subject, when); }

if (typeof window !== 'undefined') {
    window.__coverage = {
        isVideoCovered, isSectionCovered, coveredSections,
        subjectHasAnyCoverage, markSectionRead, markVideoWatched
    };
}
