// dark/light theme -- corpus.theme.v1. applies before render to avoid flash.
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
    const glyphs = { light: '[ ]', dark: '[*]', auto: '[~]', contrast: '[#]' };
    const label = () => {
        const cur = getTheme();
        btn.innerHTML = '';
        const g = doc.createElement('span'); g.className = 'glyph'; g.textContent = glyphs[cur] || '[~]'; g.setAttribute('aria-hidden', 'true');
        const t = doc.createElement('span'); t.className = 'label'; t.textContent = cur;
        btn.append(g, t);
        btn.setAttribute('aria-label', `theme: ${cur} -- click to cycle`);
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

// The anentrypoint-design SDK auto-runs its own initTheme() on a microtask
// after import (`Promise.resolve().then(()=>js())`). Its theme vocabulary is
// {auto, paper, ink, thebird}; ours is {light, dark, contrast}. Because our
// values are not in its set, the SDK's normalizer resets data-theme to "auto",
// clobbering the corpus theme on every load. We reassert ours after the SDK's
// microtask, and keep a guard that re-applies if anything (the SDK density/
// theme re-init) changes data-theme away from our effective value.
if (typeof document !== 'undefined') {
    const reassert = () => {
        const want = effectiveTheme();
        if (document.documentElement.getAttribute('data-theme') !== want) {
            document.documentElement.setAttribute('data-theme', want);
        }
    };
    // After the SDK's post-import microtask (and once more on the next frame).
    Promise.resolve().then(reassert);
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(reassert);
    if (typeof MutationObserver !== 'undefined') {
        const obs = new MutationObserver(() => {
            const cur = document.documentElement.getAttribute('data-theme');
            // Only correct foreign writes (e.g. the SDK forcing "auto"/"paper"/
            // "ink"); never fight our own setTheme/applyTheme writes.
            if (cur !== effectiveTheme()) reassert();
        });
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
}

if (typeof window !== 'undefined') window.__theme = { getTheme, setTheme, cycleTheme, applyTheme, effectiveTheme };



