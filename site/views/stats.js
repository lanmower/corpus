// views/stats.js — the stats route. Exam-ready verdict table, study-day heatmap,
// 14-day forecast, week-over-week diff, and (in ?debug) the raw scheduler dump.
// Renders into the shared stage from app-context and navigates via the router.
import { getStage, el, loadAllShards, loadGuideTicks, state, DEBUG } from '../app-context.js';
import { go } from '../router.js';
import * as srs from '../srs.js';
import * as progress from '../progress.js';
import { buildRows, VERDICT_RANK } from '../verdicts.js';
import { localDayISO } from '../dates.js';

export async function renderStats() {
    // The verdict-table sort controls re-invoke renderStats() directly (bypassing
    // app.js render(), which is what normally clears the stage), so clear here too
    // — otherwise each sort appends a second full copy of the page beneath the first.
    getStage().innerHTML = '';
    getStage().append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'stats'), el('h2', {}, 'stats')));
    getStage().append(el('div', { class: 'toolbar stats-deeplinks' },
        el('a', { class: 'chip', href: '#mistakes', on: { click: e => { e.preventDefault(); go('mistakes'); } } }, 'mistakes'),
        el('a', { class: 'chip', href: '#drill', on: { click: e => { e.preventDefault(); go('drill'); } } }, 'drill 10'),
        el('a', { class: 'chip', href: '#calendar', on: { click: e => { e.preventDefault(); go('calendar'); } } }, 'calendar')
    ));
    await loadAllShards();
    const states = srs.loadStates();
    const ticks = loadGuideTicks();
    const rows = buildRows(state.manifest, state.shards, states, ticks);
    renderVerdictTable(rows);

    const cardIds = [];
    const idSubject = {};
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject]; if (!sh) continue;
        for (const c of sh.cards) { cardIds.push(c.id); idSubject[c.id] = meta.subject; }
    }
    const stats = srs.getScheduleStats(cardIds, states);
    const forecast = srs.getForecast(cardIds, 14, states);
    const p = progress.load();

    getStage().append(el('div', { class: 'panel heatmap-panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'study days'), 'last 9 weeks'),
        renderHeatmap(p.history || [])));

    const maxF = Math.max(1, ...forecast.map(b => b.count));
    const forecastEl = el('div', { class: 'forecast' },
        ...forecast.map(b => el('div', { class: 'forecast-day', title: `${b.date}: ${b.count}` },
            el('div', { class: 'forecast-bar', style: `height:${Math.round(b.count / maxF * 50) + 2}px` }),
            el('div', { class: 'forecast-label' }, String(b.day))
        )));
    getStage().append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'reviews coming up'), '14d'),
        forecastEl));

    // week-over-week diff
    const hist = p.history || [];
    const last7 = hist.slice(-7).reduce((a, h) => a + (h.graded || 0), 0) + (p.todayGraded || 0);
    const prior7 = hist.slice(-14, -7).reduce((a, h) => a + (h.graded || 0), 0);
    const delta = last7 - prior7;
    getStage().append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'this week vs last')),
        el('div', { style: 'font-family:var(--ff-mono);font-size:13px' },
            `${last7} cards this week · ${prior7} prior · `,
            el('span', { class: 'trend ' + (delta >= 0 ? 'up' : 'down') }, delta >= 0 ? `+${delta}` : String(delta)))));

    if (DEBUG) renderDebugStats(state.manifest, stats);
}

function renderVerdictTable(rows) {
    let sortKey = state.verdictSort || 'verdict';
    function applySort(rs) {
        const sorters = {
            verdict: (a, b) => VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict],
            subject: (a, b) => a.subject.localeCompare(b.subject),
            mastery: (a, b) => b.mastery - a.mastery,
            trend: (a, b) => b.trend - a.trend,
            backlog: (a, b) => b.backlog - a.backlog
        };
        return [...rs].sort(sorters[sortKey] || sorters.verdict);
    }
    const wrap = el('div', { class: 'panel' });
    wrap.append(el('div', { class: 'panel-head' },
        el('span', { class: 'title' }, 'exam-ready'),
        el('span', {}, 'click a column to sort')
    ));
    const sortSel = el('select', { class: 'search', style: 'max-width:160px',
        'aria-label': 'sort by',
        on: { change: e => { state.verdictSort = e.target.value; renderStats(); } } },
        ...['verdict', 'subject', 'mastery', 'trend', 'backlog'].map(k => el('option', { value: k, ...(k === sortKey ? { selected: 'selected' } : {}) }, `sort: ${k}`))
    );
    wrap.append(el('div', { class: 'toolbar' }, sortSel));
    const sorted = applySort(rows);
    const tbl = el('table', { class: 'verdict-table' },
        el('thead', {}, el('tr', {},
            ...['subject', 'mastery', 'trend', 'backlog', 'verdict'].map(k =>
                el('th', { on: { click: () => { state.verdictSort = k; renderStats(); } } }, k))
        )),
        el('tbody', {}, ...sorted.map(r => el('tr', {},
            el('td', { class: 'subject' }, r.subject),
            el('td', { class: 'mastery' }, `${r.mastery}%`),
            el('td', { class: 'trend ' + (r.trend > 0 ? 'up' : (r.trend < 0 ? 'down' : '')) }, r.trend > 0 ? `+${r.trend}` : String(r.trend)),
            el('td', { class: 'backlog' }, String(r.backlog)),
            el('td', { class: 'verdict ' + r.verdict.replace(/\s/g, '') }, r.verdict)
        )))
    );
    wrap.append(el('div', { class: 'table-scroll' }, tbl));
    getStage().append(wrap);
}

function renderDebugStats(m, stats) {
    const days = srs.daysUntilExam();
    const eff = srs.effectiveDays();
    getStage().append(el('div', { class: 'panel', id: 'srs-stats' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'debug · raw scheduler'),
            `schema v${srs.SCHEMA_VERSION || 1} · localStorage corpus.srs.states`),
        el('div', { style: 'font-family:var(--ff-mono);font-size:11px;color:var(--panel-text-2);line-height:1.6' },
            `total ${stats.total} · new ${stats.new} · learning ${stats.learning} · young ${stats.young} · mature ${stats.mature} · leech ${stats.leech} · avg EF ${stats.avgEaseFactor.toFixed(2)} · avg last score ${stats.avgLastScore.toFixed(2)} · days to exam ${days} · effective days ${eff} · atoms ${m.totals.atoms} · scenarios ${m.totals.scenarios}`)));
}

export function renderHeatmap(history) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = 63;
    const counts = {};
    for (const h of (history || [])) counts[h.date] = (h.graded || 0);
    const cells = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        const k = localDayISO(d);
        cells.push({ date: k, count: counts[k] || 0 });
    }
    const max = Math.max(1, ...cells.map(c => c.count));
    const cellSize = 11, gap = 2, cols = 9;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'heatmap');
    svg.setAttribute('width', String(cols * (cellSize + gap)));
    svg.setAttribute('height', String(7 * (cellSize + gap)));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'study days heatmap, last 63 days');
    cells.forEach((c, i) => {
        const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const col = Math.floor(i / 7), row = i % 7;
        r.setAttribute('x', String(col * (cellSize + gap)));
        r.setAttribute('y', String(row * (cellSize + gap)));
        r.setAttribute('width', String(cellSize));
        r.setAttribute('height', String(cellSize));
        r.setAttribute('rx', '2');
        const intensity = c.count === 0 ? 0 : Math.min(1, c.count / max);
        const alpha = c.count === 0 ? 0.10 : 0.25 + intensity * 0.75;
        r.setAttribute('fill', `rgba(47,122,62,${alpha})`);
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${c.date}: ${c.count} cards`;
        r.appendChild(title);
        svg.appendChild(r);
    });
    return svg;
}
