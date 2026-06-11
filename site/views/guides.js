// views/guides.js — the guides route: a grid of subject cards showing per-subject
// guide section counts, video badge, and mastery. Links into the subject reader.
import { getStage, el, masteryFor, state } from '../app-context.js';
import { go } from '../router.js';

export function renderGuides() {
    getStage().append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'guides'), el('h2', {}, 'study guides')));
    const grid = el('div', { class: 'subject-grid' });
    for (const meta of state.manifest.subjects) {
        const m = masteryFor(meta.subject);
        const sections = meta.guideSections || 0;
        const hasVideo = (meta.videoCount || 0) > 0;
        const taglineParts = [`${sections} sections`];
        if (hasVideo) taglineParts.push('video');
        grid.append(el('div', {
            class: 'subject-card' + (hasVideo ? ' has-video' : ''), role: 'button', tabindex: '0',
            'aria-label': `${meta.subject} guide, ${m}% understood${hasVideo ? ', includes video' : ''}`,
            data: { subject: meta.subject },
            on: { click: () => go('subject', meta.subject),
                  keydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('subject', meta.subject); } } }
        },
            el('div', { class: 'name' }, meta.subject),
            el('div', { class: 'tagline' }, taglineParts.join(' · ')),
            el('div', { class: 'mastery-row' },
                el('div', { class: 'mastery-bar' }, el('div', { class: 'mastery-fill' + (m < 25 ? ' weak' : ''), style: `width:${m}%` })),
                el('span', { class: 'mastery-pct' }, `${m}%`)
            )
        ));
    }
    getStage().append(grid);
}
