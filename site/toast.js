// toast container — bottom-right, max 3 visible, auto-dismiss 3s
import { ICON } from './icons.js';

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

export function xp(delta, reason) { return push('xp', `+${delta} xp${reason ? ' - ' + reason.replace(/_/g, ' ') : ''}`, ICON.sparkle); }
export function badge(label, icon) { return push('badge', `badge: ${label}`, icon || ICON.star); }
export function quest(label, reward) { return push('quest', `quest done: ${label} (+${reward || 0})`, ICON.quest); }
export function levelUp(level) { return push('level', `level up - lv ${level}`, ICON.levelUp); }
export function info(text) { return push('info', text, ''); }

let bound = false;
export function bind() {
    if (bound || typeof window === 'undefined') return;
    bound = true;
}

if (typeof window !== 'undefined') window.__toast = { xp, badge, quest, levelUp, info, bind };



