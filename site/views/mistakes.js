// views/mistakes.js — the mistake-log route. Lists recently missed cards grouped
// by subject with quick links to review them or open the card.
import { getStage, el, icon, loadAllShards, state } from '../app-context.js';
import { go, render } from '../router.js';
import { resetReviewQueue } from './review.js';
import * as mistakes from '../mistakes.js';
import { confirmModal } from '../modal.js';

export async function renderMistakes() {
    getStage().append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'mistakes'), el('h2', {}, 'mistake log')));
    await loadAllShards();
    const recent = mistakes.recent(50);
    if (!recent.length) {
        getStage().append(el('div', { class: 'empty-state' },
            el('div', { class: 'empty-title' }, 'no mistakes logged yet'),
            el('div', { class: 'empty-sub' }, 'cards graded again or hard show up here.')));
        return;
    }
    const cardById = {};
    for (const meta of state.manifest.subjects) for (const c of (state.shards[meta.subject]?.cards || [])) cardById[c.id] = { ...c, _subject: meta.subject };
    const grp = mistakes.bySubject(50);
    getStage().append(el('div', { class: 'toolbar' },
        el('button', { class: 'chip', 'aria-label': 'review mistakes',
            on: { click: () => { state.paletteReviewSet = mistakes.ids(); resetReviewQueue(); go('review'); } } }, el('span', { class: 'icon-label' }, el('span', {}, `review all ${recent.length}`), icon('arrowRight'))),
        el('button', { class: 'chip', on: { click: async () => { if (await confirmModal('clear mistake log?')) { mistakes.clear(); render(); } } } }, 'clear')));
    for (const subject of Object.keys(grp).sort()) {
        const arr = grp[subject];
        getStage().append(el('div', { class: 'panel' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, subject), `${arr.length}`),
            ...arr.map(m => {
                const c = cardById[m.cardId];
                return el('div', { class: 'row' },
                    el('span', { class: 'code' }, ['', 'again', 'hard'][m.score] || String(m.score)),
                    el('div', {}, el('div', { class: 'title' }, c ? c.front.slice(0, 100) : m.cardId),
                        el('div', { class: 'meta' }, new Date(m.ts).toLocaleString())),
                    c ? el('a', { class: 'chip', href: `#card/${c.id}`, on: { click: e => { e.preventDefault(); go('card', c.id); } } }, 'open') : null);
            })));
    }
}

