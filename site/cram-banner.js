// cram-banner.js — shared widget: exam-countdown + weakest-subject chip.
// Extracted from views/today.js so sibling views can import it without
// creating a lateral view-to-view dependency.
import { el, state } from './app-context.js';
import * as srs from './srs.js';
import * as cram from './cram.js';

export function renderCramBanner(weakest) {
    const days = srs.daysUntilExam();
    if (days > 14) return null;
    if (cram.isDismissed()) return null;
    const w = weakest;
    const sh = w ? state.shards[w.subject] : null;
    const recs = sh?.triage?.scenarios?.slice(0, 2) || [];
    return el('div', { class: 'cram-banner', role: 'alert' },
        el('span', { class: 'label' }, `exam in ${days} day${days === 1 ? '' : 's'}`),
        el('span', {}, '·'),
        el('span', {}, `weakest: ${w ? w.subject : '—'}`),
        el('span', {}, '·'),
        el('span', {}, 'focus there'),
        ...recs.map((sc, i) => el('a', { class: 'chip', href: `./triage-live.html#${encodeURIComponent(sc.id || sc.name || (w.subject + '-' + i))}` }, sc.name)),
        el('button', { class: 'dismiss', 'aria-label': 'dismiss',
            on: { click: e => { e.target.closest('.cram-banner').remove(); cram.dismiss(); } } }, 'dismiss')
    );
}
