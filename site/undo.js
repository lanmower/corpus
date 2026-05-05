// undo last grade — 5s window. in-memory ring of 1.
let last = null;
let timer = null;

export function record(cardId, prevState) { last = { cardId, prevState, ts: Date.now() }; if (timer) clearTimeout(timer); timer = setTimeout(() => { last = null; timer = null; }, 5000); }
export function peek() { return last; }
export function consume() { const r = last; last = null; if (timer) { clearTimeout(timer); timer = null; } return r; }
export function clear() { last = null; if (timer) clearTimeout(timer); timer = null; }

if (typeof window !== 'undefined') window.__undo = { record, peek, consume, clear };
