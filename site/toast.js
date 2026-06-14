// toast container — bottom-right, max 3 visible, auto-dismiss 3s
const CONTAINER_ID = 'toast-container';
const MAX = 3;
const DURATION = 3000;

function ensureContainer() {
    let c = document.getElementById(CONTAINER_ID);
    if (!c) {
        c = document.createElement('div');
        c.id = CONTAINER_ID;
        c.className = 'toast-container';
        c.setAttribute('aria-live', 'polite');
        document.body.appendChild(c);
    }
    return c;
}

function push(kind, text, icon) {
    const c = ensureContainer();
    while (c.children.length >= MAX) c.firstChild.remove();
    const t = document.createElement('div');
    t.className = `toast toast-${kind}`;
    t.setAttribute('role', 'status');
    if (icon) {
        const i = document.createElement('span'); i.className = 'toast-icon';
        // SVG icon strings are trusted static markup; render as markup. A bare
        // string (legacy / custom badge label) still renders as safe text.
        if (typeof icon === 'string' && icon.trimStart().startsWith('<svg')) i.innerHTML = icon;
        else i.textContent = icon;
        t.appendChild(i);
    }
    const m = document.createElement('span'); m.className = 'toast-msg'; m.textContent = text; t.appendChild(m);
    c.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, DURATION);
    return t;
}

// Generic notification. `show` is the canonical name (app.js calls toast.show).
export function show(text) { return push('info', text, ''); }

if (typeof window !== 'undefined') window.__toast = { show };



