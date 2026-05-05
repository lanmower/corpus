// verdicts — per-subject solid|getting there|weak|cold + weakest-subject computation.
// trend: blends mastery% with last-7-days grade trend (avg score delta).
// All pure functions — no localStorage access here, callers pass state.

export const VERDICT_RANK = { 'solid': 0, 'getting there': 1, 'weak': 2, 'cold': 3 };

export function verdictFor({ mastery, trend, backlog, scheduled }) {
    const m = Number(mastery) || 0;
    const t = Number(trend) || 0;
    const b = Number(backlog) || 0;
    const sc = Number(scheduled) || 0;
    if (sc === 0 || m < 25) return 'cold';
    if (m >= 75 && t >= 0 && b < 10) return 'solid';
    if (m >= 50) return 'getting there';
    if (m >= 25) return 'weak';
    return 'cold';
}

// 7-day trend: average lastScore among cards reviewed in last 7d, mapped to [-1, +1]
// score >= 4 contributes +, <= 2 contributes -
export function trendFor(states, cardIds, nowMs = Date.now()) {
    let pos = 0, neg = 0;
    const cutoff = nowMs - 7 * 86400000;
    for (const id of cardIds) {
        const s = states[id]; if (!s || !s.history) continue;
        for (const h of s.history) {
            if ((h.ts || 0) < cutoff) continue;
            if (h.score >= 4) pos++;
            else if (h.score <= 2) neg++;
        }
    }
    const total = pos + neg;
    if (!total) return 0;
    return Math.round(((pos - neg) / total) * 100) / 100;
}

export function backlogFor(states, cardIds, nowMs = Date.now()) {
    let n = 0;
    for (const id of cardIds) {
        const s = states[id]; if (!s) continue;
        if (s.suspended) continue;
        if ((s.dueAt || 0) <= nowMs) n++;
    }
    return n;
}

// per-subject row: {subject, mastery, trend, backlog, scheduled, verdict}
export function buildRows(manifest, shards, states, ticksBySubject) {
    const rows = [];
    const now = Date.now();
    for (const meta of manifest.subjects) {
        const sh = shards[meta.subject]; if (!sh) continue;
        const cardIds = sh.cards.map(c => c.id);
        const total = sh.guide?.sections?.length || 0;
        const ticks = ticksBySubject[meta.subject] || {};
        const ticked = Object.values(ticks).filter(Boolean).length;
        const mastery = total ? Math.round(ticked / total * 100) : 0;
        const trend = trendFor(states, cardIds, now);
        const backlog = backlogFor(states, cardIds, now);
        const scheduled = cardIds.filter(id => states[id]).length;
        const verdict = verdictFor({ mastery, trend, backlog, scheduled });
        rows.push({ subject: meta.subject, mastery, trend, backlog, scheduled, verdict, cardCount: cardIds.length });
    }
    return rows;
}

// weakest = composite score: lower mastery and lower trend = weaker. Scheduled<5 → cold pile, push forward.
export function computeWeakest(rows) {
    if (!rows.length) return null;
    const scored = rows.map(r => {
        const masteryFloor = r.scheduled === 0 ? 0 : r.mastery;
        const composite = masteryFloor + r.trend * 25;
        return { ...r, composite };
    }).sort((a, b) => a.composite - b.composite);
    return scored[0];
}

if (typeof window !== 'undefined') window.__verdicts = { verdictFor, trendFor, backlogFor, buildRows, computeWeakest, VERDICT_RANK };
