// dark/light theme — corpus.theme.v1. applies before render to avoid flash.
const KEY = 'corpus.theme.v1';
const VALID = ['light', 'dark', 'auto', 'contrast'];

export function getTheme() {
    try { const v = localStorage.getItem(KEY); return VALID.includes(v) ? v : 'auto'; }
    catch { return 'auto'; }
}

export function effectiveTheme(t = getTheme()) {
    if (t === 'auto') {
        const contrast = typeof matchMedia !== 'undefined' && matchMedia('(prefers-contrast: more)').matches;
        if (contrast) return 'contrast';
        const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
        return dark ? 'dark' : 'light';
    }
    return t;
}

export function applyTheme(t = getTheme()) {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', effectiveTheme(t));
}

export function setTheme(t) {
    if (!VALID.includes(t)) t = 'auto';
    try { localStorage.setItem(KEY, t); } catch {}
    applyTheme(t);
    return t;
}

export function cycleTheme() {
    const cur = getTheme();
    const order = { light: 'dark', dark: 'contrast', contrast: 'auto', auto: 'light' };
    const next = order[cur] || 'light';
    return setTheme(next);
}

export function makeToggleButton(doc = document) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    const glyphs = { light: '☀', dark: '☾', auto: '◐', contrast: '◑' };
    const label = () => {
        const cur = getTheme();
        btn.innerHTML = '';
        const g = doc.createElement('span'); g.className = 'glyph'; g.textContent = glyphs[cur] || '◐'; g.setAttribute('aria-hidden', 'true');
        const t = doc.createElement('span'); t.className = 'label'; t.textContent = cur;
        btn.append(g, t);
        btn.setAttribute('aria-label', `theme: ${cur} — click to cycle`);
        btn.title = `theme: ${cur} (click to cycle)`;
    };
    label();
    btn.addEventListener('click', () => { cycleTheme(); label(); });
    if (typeof matchMedia !== 'undefined') {
        try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme()); } catch {}
    }
    return btn;
}

// Apply immediately on import to avoid FOUC
if (typeof document !== 'undefined') applyTheme();

if (typeof window !== 'undefined') window.__theme = { getTheme, setTheme, cycleTheme, applyTheme, effectiveTheme };
