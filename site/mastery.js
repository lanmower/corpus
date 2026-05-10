// overall + per-subject progress. weighted: 0.4 cards + 0.3 sections + 0.2 cases + 0.1 mistakes
import * as srs from './srs.js';

const SUBJECTS = ['cardiology','diabetes','endocrine','gastroenterology','geriatric','nephrology','pulmonology','rheumatology'];

function loadGuideTicks() {
    try { return JSON.parse(localStorage.getItem('corpus.guide.v1') || '{}'); } catch { return {}; }
}
function loadTriage() {
    try { return JSON.parse(localStorage.getItem('corpus.triage.v1') || '{}'); } catch { return {}; }
}
function loadMistakes() {
    try { return JSON.parse(localStorage.getItem('corpus.mistakes.v1') || '[]'); } catch { return []; }
}

function cardMastered(state) {
    if (!state) return false;
    return (state.lastScore >= 4) && ((state.interval || 0) >= 21);
}

function cardReady(state) {
    if (!state) return false;
    // Ready if mastered OR not due (will become due soon)
    return cardMastered(state) || (!state.dueAt || state.dueAt <= Date.now() + 3 * 86400000);
}

function casePassed(session) {
    if (!session) return false;
    if (typeof session.score === 'number') return session.score >= 0.8;
    if (session.graded) return true;
    return false;
}

export function overallProgress(manifest, shards) {
    return computeFromCards(manifest, shards, null);
}

export function subjectProgress(manifest, shards, subject) {
    return computeFromCards(manifest, shards, subject);
}

// Compute readiness-adjusted mastery score
function computeFromCards(manifest, shards, only) {
    const states = srs.loadStates();
    const ticks = loadGuideTicks();
    const triage = loadTriage();
    const mistakes = loadMistakes();
    let cardsTotal = 0, cardsMast = 0, cardsDue = 0, cardsIntroduced = 0;
    let secTotal = 0, secTicked = 0;
    let caseTotal = 0, casePass = 0;
    let mTotal = 0, mClear = 0;
    const now = Date.now();
    const subjects = only ? [only] : SUBJECTS;
    for (const s of subjects) {
        const sh = shards[s]; if (!sh) continue;
        for (const c of (sh.cards || [])) {
            cardsTotal++;
            const st = states[c.id];
            const introduced = !!(st && st.history && st.history.length > 0);
            if (introduced) cardsIntroduced++;
            if (introduced && cardMastered(st)) cardsMast++;
            if (introduced && st.dueAt && st.dueAt <= now) cardsDue++;
        }
        const secs = sh.guide?.sections || [];
        secTotal += secs.length;
        const tk = ticks[s] || {};
        for (const sec of secs) if (tk[String(sec.line)]) secTicked++;
        const scenarios = sh.triage?.scenarios || [];
        for (const sc of scenarios) {
            caseTotal++;
            const sid = sc.id || sc.name;
            const sess = (triage.sessions || {})[sid];
            if (casePassed(sess)) casePass++;
        }
    }
    const recent = mistakes.filter(m => !only || m.subject === only);
    mTotal = recent.length;
    for (const m of recent) {
        const st = states[m.cardId];
        if (st && (st.lastScore || 0) >= 3) mClear++;
    }
    // Use introduced cards as denominator when ≥3 introduced; otherwise N/A (don't penalize fresh users).
    const cardDenom = cardsIntroduced >= 3 ? cardsIntroduced : 0;
    const cards = pct(cardsMast, cardDenom);
    const sections = pct(secTicked, secTotal);
    const cases = pct(casePass, caseTotal);
    const mDone = pct(mClear, mTotal);
    // Weighted score: cards weight only counts when there are enough introduced cards.
    const wCards = cardDenom > 0 ? 0.4 : 0;
    const wSections = 0.3 + (cardDenom > 0 ? 0 : 0.2);
    const wCases = 0.2;
    const wMistakes = 0.1 + (cardDenom > 0 ? 0 : 0.2);
    const weighted = Math.round(wCards * cards.pct + wSections * sections.pct + wCases * cases.pct + wMistakes * mDone.pct);
    return {
        cards: { ...cards, mastered: cardsMast, introduced: cardsIntroduced, total: cardsTotal, due: cardsDue, na: cardDenom === 0 },
        sections: { ...sections, ticked: secTicked, total: secTotal },
        cases: { ...cases, passed: casePass, total: caseTotal },
        mistakes: { ...mDone, cleared: mClear, total: mTotal },
        weighted
    };
}

function pct(num, den) { return { pct: den ? Math.round(100 * num / den) : 0 }; }

export function forecastTo100(manifest, shards) {
    const cur = overallProgress(manifest, shards).weighted;
    if (cur >= 100) return new Date().toISOString().slice(0, 10);
    let prog;
    try { prog = JSON.parse(localStorage.getItem('corpus.progress.v1') || '{}'); } catch { return null; }
    const hist = (prog.history || []).slice(-7);
    if (hist.length < 2) return null;
    const totalGraded = hist.reduce((n, h) => n + (h.graded || 0), 0);
    if (totalGraded <= 0) return null;
    const ratePerDay = totalGraded / hist.length / 50;
    if (ratePerDay <= 0) return null;
    const days = Math.ceil((100 - cur) / ratePerDay);
    const eta = new Date(Date.now() + days * 86400000);
    return eta.toISOString().slice(0, 10);
}

if (typeof window !== 'undefined') window.__mastery = { overallProgress, subjectProgress, forecastTo100 };
