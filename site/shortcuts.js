// shortcuts.js — the keyboard-shortcuts help modal. Shared by the settings view
// (a "shortcuts" button) and the global '?' keydown handler in app.js, so it lives
// in its own leaf module rather than either consumer.
import { el } from './app-context.js';

const SHORTCUTS = [
    ['ctrl+k', 'open search'],
    ['?', 'show this help'],
    ['esc', 'close modals · exit just-read'],
    ['r', 'just-read mode (subject)'],
    ['t', 'pomodoro timer toggle'],
    ['+', 'quick add card'],
    ['u', 'undo last grade'],
    ['f', 'flag card (review)'],
    ['g h', 'go home (today)'],
    ['g r', 'go review'],
    ['g s', 'go stats'],
    ['g g', 'go guides'],
    ['g m', 'go mistakes'],
    ['space', 'reveal answer (review)'],
    ['1–4', 'grade card (review)'],
    ['s', 'skip card (review)'],
    ['enter / space', 'flip mini-card (guide)'],
    ['r', 'review mini-card (guide)'],
    ['j / k', 'next / prev case (live tutor)'],
    ['/', 'focus reply (live tutor)'],
    ['ctrl+enter', 'send (live tutor)']
];

export function openShortcutsModal() {
    let m = document.getElementById('shortcuts-modal');
    if (m) { m.classList.remove('hidden'); return; }
    m = el('div', { id: 'shortcuts-modal', class: 'shortcuts-modal', role: 'dialog', 'aria-label': 'shortcuts' });
    const inner = el('div', { class: 'shortcuts-inner' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'shortcuts'), el('button', { class: 'chip', 'aria-label': 'close',
            on: { click: () => m.classList.add('hidden') } }, 'close')),
        el('table', { class: 'shortcuts-table' },
            el('tbody', {}, ...SHORTCUTS.map(([k, d]) => el('tr', {}, el('td', { class: 'kbd' }, k), el('td', {}, d))))
        ));
    m.append(inner);
    m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
    document.body.appendChild(m);
}

export function closeShortcutsModal() {
    const m = document.getElementById('shortcuts-modal'); if (m) m.classList.add('hidden');
}
