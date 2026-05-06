// calendar — month/week grid renderer for the schedule engine. DOM-island re-render on schedule:updated.
import * as schedule from './schedule.js';

const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const DOW_LABELS = ['sun','mon','tue','wed','thu','fri','sat'];

function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') e.className = v;
        else if (k === 'on') for (const [ev, h] of Object.entries(v)) e.addEventListener(ev, h);
        else if (k === 'data') for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
        else if (v != null) e.setAttribute(k, v);
    }
    for (const c of kids) {
        if (c == null) continue;
        if (Array.isArray(c)) for (const cc of c) e.append(cc instanceof Node ? cc : document.createTextNode(String(cc)));
        else e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return e;
}

const state = { mode: 'month', anchor: null, mountEl: null, dueCountsFn: () => ({}) };

function isoDate(d) { return d.toISOString().slice(0, 10); }
function parseIso(iso) { return new Date(iso + 'T00:00:00Z'); }

function monthGridDays(anchorIso) {
    const a = parseIso(anchorIso);
    const first = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1));
    const startDow = first.getUTCDay();
    const start = new Date(first); start.setUTCDate(first.getUTCDate() - startDow);
    const out = [];
    for (let i = 0; i < 42; i++) { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); out.push(isoDate(d)); }
    return out;
}

function weekDays(anchorIso) {
    const a = parseIso(anchorIso);
    const dow = a.getUTCDay();
    const start = new Date(a); start.setUTCDate(a.getUTCDate() - dow);
    const out = [];
    for (let i = 0; i < 7; i++) { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); out.push(isoDate(d)); }
    return out;
}

function renderRing(pct) {
    const r = 8, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 22 22'); svg.setAttribute('class', 'ring');
    svg.setAttribute('width', '22'); svg.setAttribute('height', '22'); svg.setAttribute('aria-hidden', 'true');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bg.setAttribute('cx', '11'); bg.setAttribute('cy', '11'); bg.setAttribute('r', String(r));
    bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', 'currentColor'); bg.setAttribute('stroke-opacity', '0.18'); bg.setAttribute('stroke-width', '3');
    const fg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    fg.setAttribute('cx', '11'); fg.setAttribute('cy', '11'); fg.setAttribute('r', String(r));
    fg.setAttribute('fill', 'none'); fg.setAttribute('stroke', 'currentColor'); fg.setAttribute('stroke-width', '3');
    fg.setAttribute('stroke-dasharray', String(c)); fg.setAttribute('stroke-dashoffset', String(off));
    fg.setAttribute('transform', 'rotate(-90 11 11)'); fg.setAttribute('stroke-linecap', 'round');
    svg.appendChild(bg); svg.appendChild(fg);
    return svg;
}

function renderHeatbar(heat) {
    const total = Object.values(heat).reduce((n, x) => n + x, 0);
    const wrap = el('div', { class: 'cal-heat', 'aria-hidden': 'true' });
    if (!total) return wrap;
    for (const [subject, mins] of Object.entries(heat)) {
        wrap.append(el('span', { class: `cal-heat-seg subj-${subject}`, style: `flex:${mins} 0 0; width:${(mins / total) * 100}%`, title: `${subject}: ${mins}m` }));
    }
    return wrap;
}

function renderDayCell(dateIso, opts = {}) {
    const today = isoDate(new Date());
    const blocks = schedule.blocksForDate(dateIso);
    const studyBlocks = blocks.filter(b => b.kind === 'study');
    const comp = schedule.dayCompletion(dateIso);
    const heat = schedule.subjectHeat(dateIso);
    const totalMin = studyBlocks.reduce((n, b) => n + b.len, 0);
    const cls = ['cal-day'];
    if (dateIso === today) cls.push('today');
    if (opts.dim) cls.push('dim');
    if (!studyBlocks.length) cls.push('empty');
    const d = parseIso(dateIso).getUTCDate();
    return el('button', {
        class: cls.join(' '), type: 'button', 'data-date': dateIso,
        'aria-label': `${dateIso} — ${comp.done}/${comp.total} blocks done, ${totalMin}m total`,
        on: { click: () => openDetail(dateIso) }
    },
        el('div', { class: 'cal-day-head' },
            el('span', { class: 'cal-num' }, String(d)),
            renderRing(comp.pct)
        ),
        el('div', { class: 'cal-day-meta' }, totalMin ? `${totalMin}m` : ''),
        renderHeatbar(heat)
    );
}

function fmtTime(min) { const h = Math.floor(min / 60), m = min % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

function openDetail(dateIso) {
    let m = document.getElementById('cal-detail');
    if (m) m.remove();
    const blocks = schedule.blocksForDate(dateIso);
    m = el('div', { id: 'cal-detail', class: 'cal-detail-modal', role: 'dialog', 'aria-label': `${dateIso} schedule` });
    const inner = el('div', { class: 'cal-detail-inner' },
        el('div', { class: 'panel-head' },
            el('span', { class: 'title' }, dateIso),
            el('button', { class: 'chip', 'aria-label': 'close', on: { click: () => m.remove() } }, 'close')
        ),
        blocks.length === 0 ? el('div', { class: 'muted' }, 'no blocks scheduled.') :
            el('div', { class: 'cal-timeline' }, ...blocks.map(b => renderTimelineRow(b)))
    );
    m.append(inner);
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
}

function renderTimelineRow(b) {
    const t1 = fmtTime(b.startMin), t2 = fmtTime(b.startMin + b.len);
    return el('div', { class: 'cal-row' + (b.done ? ' done' : '') + (b.locked ? ' locked' : '') + (b.kind === 'break' ? ' brk' : ''), 'data-id': b.id },
        el('span', { class: 'cal-time mono' }, `${t1}–${t2}`),
        el('span', { class: 'cal-subj' }, b.kind === 'break' ? 'break' : b.subject),
        el('span', { class: 'cal-len mono' }, `${b.len}m`),
        el('div', { class: 'cal-actions' },
            el('button', { class: 'chip', 'aria-pressed': String(!!b.done),
                on: { click: () => { schedule.markBlockComplete(b.id, !b.done); openDetail(b.date); } } }, b.done ? 'done' : 'mark done'),
            el('button', { class: 'chip', 'aria-pressed': String(!!b.locked),
                on: { click: () => { schedule.lockBlock(b.id, !b.locked); openDetail(b.date); } } }, b.locked ? 'locked' : 'lock')
        )
    );
}

function renderToolbar(onRegen) {
    return el('div', { class: 'cal-toolbar' },
        el('button', { class: 'chip', on: { click: () => { state.anchor = isoDate(new Date()); rerender(); } } }, 'today'),
        el('button', { class: 'chip', on: { click: () => shift(-1) } }, '←'),
        el('button', { class: 'chip', on: { click: () => shift(1) } }, '→'),
        el('button', { class: 'chip' + (state.mode === 'month' ? ' active' : ''),
            on: { click: () => { state.mode = 'month'; rerender(); } } }, 'month'),
        el('button', { class: 'chip' + (state.mode === 'week' ? ' active' : ''),
            on: { click: () => { state.mode = 'week'; rerender(); } } }, 'week'),
        el('button', { class: 'chip', on: { click: () => { onRegen?.(); } } }, 'regenerate')
    );
}

function shift(n) {
    const d = parseIso(state.anchor);
    if (state.mode === 'month') d.setUTCMonth(d.getUTCMonth() + n);
    else d.setUTCDate(d.getUTCDate() + n * 7);
    state.anchor = isoDate(d); rerender();
}

function renderMonth() {
    const a = parseIso(state.anchor);
    const days = monthGridDays(state.anchor);
    const head = el('div', { class: 'cal-title' }, `${MONTH_NAMES[a.getUTCMonth()]} ${a.getUTCFullYear()}`);
    const dowRow = el('div', { class: 'cal-dow' }, ...DOW_LABELS.map(l => el('span', {}, l)));
    const grid = el('div', { class: 'cal-grid month' });
    for (const d of days) grid.append(renderDayCell(d, { dim: parseIso(d).getUTCMonth() !== a.getUTCMonth() }));
    return el('div', {}, head, dowRow, grid);
}

function renderWeek() {
    const days = weekDays(state.anchor);
    const head = el('div', { class: 'cal-title' }, `week of ${days[0]}`);
    const dowRow = el('div', { class: 'cal-dow' }, ...DOW_LABELS.map(l => el('span', {}, l)));
    const grid = el('div', { class: 'cal-grid week' });
    for (const d of days) grid.append(renderDayCell(d));
    return el('div', {}, head, dowRow, grid);
}

function rerender() {
    if (!state.mountEl) return;
    state.mountEl.innerHTML = '';
    state.mountEl.append(renderToolbar(() => {
        const dueCounts = state.dueCountsFn();
        schedule.regenerate({ today: isoDate(new Date()), dueCounts });
    }));
    state.mountEl.append(state.mode === 'month' ? renderMonth() : renderWeek());
}

export function mount(parent, { dueCountsFn } = {}) {
    state.anchor = isoDate(new Date());
    state.mountEl = parent;
    if (dueCountsFn) state.dueCountsFn = dueCountsFn;
    // ensure schedule exists
    schedule.getSchedule({ today: isoDate(new Date()), dueCounts: state.dueCountsFn() });
    schedule.onUpdate(() => rerender());
    rerender();
    return { rerender };
}

export const __test = { monthGridDays, weekDays, renderDayCell, renderTimelineRow };
