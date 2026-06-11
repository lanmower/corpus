// views/cases.js — the cases route. Lists triage scenarios per subject as inline
// widgets and links to the live tutor. Each widget renders a parameter form and an
// example-driven outcome on run. Renders into the shared stage from app-context.
import { getStage, el, loadAllShards, state } from '../app-context.js';

export async function renderTriage() {
    getStage().append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'cases'), el('h2', {}, 'work a case')));
    const placeholder = el('div', { class: 'panel' }, el('div', { class: 'skeleton', style: 'width:60%;height:14px' }));
    getStage().append(placeholder);
    await loadAllShards();
    placeholder.remove();
    getStage().append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'live tutor')),
        el('div', { style: 'font-family:var(--ff-prose);font-size:14px;color:var(--panel-text-2);margin-bottom:10px' }, 'work a case with the in-browser study assistant — supply differentials, plan, investigations, then submit for grading.'),
        el('a', { class: 'primary-action', href: './triage-live.html' }, 'open live tutor')));
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject];
        if (!sh.triage || !sh.triage.scenarios.length) continue;
        for (const sc of sh.triage.scenarios) getStage().append(buildTriageWidget(meta, sh, sc));
    }
}

export function buildTriageWidget(meta, shard, sc) {
    const params = sc.parameters && typeof sc.parameters === 'object' && !Array.isArray(sc.parameters) ? sc.parameters : {};
    const inputs = {};
    const wrap = el('div', { class: 'triage-scenario' });
    wrap.append(el('div', { class: 'panel-head' }, el('span', { class: 'title' }, sc.name), meta.subject));
    wrap.append(el('div', { class: 'description' }, sc.description || ''));
    for (const [k, v] of Object.entries(params)) {
        const desc = String(v);
        const opts = desc.split('|').map(x => x.split('—')[0].trim()).filter(Boolean).slice(0, 6);
        const ctl = opts.length > 1 && opts.length < 8
            ? el('select', { 'aria-label': k }, ...opts.map(o => el('option', { value: o }, o)))
            : el('input', { type: 'text', placeholder: desc.slice(0, 40), 'aria-label': k });
        inputs[k] = ctl;
        wrap.append(el('div', { class: 'param-row' }, el('label', {}, k), ctl));
    }
    const out = el('div', { class: 'outcome', style: 'display:none' });
    const btn = el('button', { class: 'run-btn', on: { click: () => {
        const vals = {}; for (const [k, e] of Object.entries(inputs)) vals[k] = e.value;
        const example = (sc.examples && sc.examples[0]) || {};
        out.innerHTML = '';
        out.append(el('div', { class: 'eyebrow' }, 'inputs'));
        out.append(el('pre', {}, JSON.stringify(vals, null, 2)));
        out.append(el('div', { class: 'eyebrow' }, 'reasoning'));
        out.append(el('div', {}, example.reasoning || 'confirm diagnosis -> classify severity -> first-line therapy -> reassess.'));
        out.append(el('div', { class: 'eyebrow', style: 'margin-top:8px' }, 'recommendation'));
        out.append(el('div', {}, example.recommendation || 'standard guideline-directed management.'));
        out.style.display = 'block';
    } } }, 'run case');
    wrap.append(btn, out);
    return wrap;
}
