// late-night detection. zero storage — pure clock check.
export function lateLevel(now = new Date()) {
    const h = now.getHours();
    if (h >= 2 && h < 5) return 'sleep';
    if (h >= 23 || h < 2) return 'late';
    return 'normal';
}
export function applyClass(doc, level) {
    doc.body.classList.remove('late-night', 'really-late');
    if (level === 'late') doc.body.classList.add('late-night');
    else if (level === 'sleep') doc.body.classList.add('really-late');
}
export function message(level) {
    if (level === 'sleep') return 'past 2am — you should sleep.';
    if (level === 'late') return 'late session — keep it short.';
    return null;
}
// Reduced study quota for late sessions — but if ahead (has surplus), maintain full pace
export function reducedQuota(base, level, isAhead = false) {
    // If ahead with surplus, maintain full pace to stay ahead
    if (isAhead) return base;
    if (level === 'sleep') return Math.max(1, Math.floor(base * 0.5));
    if (level === 'late') return Math.max(1, Math.floor(base * 0.7));
    return base;
}

if (typeof window !== 'undefined') window.__late = { lateLevel, applyClass, message };
