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

if (typeof window !== 'undefined') window.__late = { lateLevel, applyClass, message };
