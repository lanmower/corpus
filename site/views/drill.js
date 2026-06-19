// views/drill.js — the drill route: assembles a 10-card session over the weakest
// subject (due cards preferred) and hands off to the review view.
import { getStage, el, loadAllShards, loadGuideTicks, state } from '../app-context.js';
import { go } from '../router.js';
import { resetReviewQueue } from './review.js';
import * as srs from '../srs.js';
import * as drill from '../drill.js';
import { buildRows, computeWeakest } from '../verdicts.js';

export async function renderDrill() {
    getStage().append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'drill'), el('h2', {}, 'drill 10')));
    await loadAllShards();
    let d = drill.active();
    if (!d) {
        // pick weakest cluster
        const states = srs.loadStates();
        const ticks = loadGuideTicks();
        const rows = buildRows(state.manifest, state.shards, states, ticks);
        const w = computeWeakest(rows);
        const sub = w?.subject || state.manifest.subjects[0].subject;
        const sh = state.shards[sub];
        if (!sh) { getStage().append(el('p', { class: 'empty-state' }, 'study data not loaded — try again in a moment.')); return; }
        const ids = sh.cards.slice(0, 30).map(c => c.id);
        const due = srs.getDueCards(ids, states);
        const pool = (due.length >= 10 ? due : ids).slice(0, 10);
        d = drill.start(pool, sub);
    }
    state.paletteReviewSet = d.ids;
    state.reviewSubjectFilter = 'all';
    resetReviewQueue();
    state.reviewQueueIds = [...d.ids];
    state.reviewSessionStarted = d.ids.length;
    go('review');
}

