// undo last grade -- 5s window. in-memory ring of 1.
let last = null;
let timer = null;

// gradedSubject is the subject whose daily tally was bumped (always set when a card
// was graded); newSubject is set only for a NEW card (for the new-card cap reversal).
// They are distinct so undoLastGrade can symmetrically reverse BOTH counters.
export function record(cardId, prevState, newSubject, gradedSubject) { last = { cardId, prevState, newSubject: newSubject || null, gradedSubject: gradedSubject || null, ts: Date.now() }; if (timer) clearTimeout(timer); timer = setTimeout(() => { last = null; timer = null; }, 5000); }
export function peek() { return last; }
export function consume() { const r = last; last = null; if (timer) { clearTimeout(timer); timer = null; } return r; }
export function clear() { last = null; if (timer) clearTimeout(timer); timer = null; }

if (typeof window !== 'undefined') window.__undo = { record, peek, consume, clear };



