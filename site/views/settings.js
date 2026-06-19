// views/settings.js — the settings route: exam date, daily goal, cram toggle,
// theme, data import/export (incl. Anki .txt), the study-schedule config panel
// (intensity/chronotype/pomodoro/availability/per-subject weighting + tomorrow
// preview), and the help/shortcuts entry. Imports its substrate from app-context,
// navigation/render from the router, and the shared shortcuts modal.
import { getStage, el, state, loadGuideTicks, dueCountsBySubject, casesDoneBySubject } from '../app-context.js';
import { render } from '../router.js';
import * as srs from '../srs.js';
import * as schedule from '../schedule.js';
import * as progress from '../progress.js';
import { makeToggleButton } from '../theme.js';
import { openShortcutsModal } from '../shortcuts.js';
import { dataPath, listSyllabi, getActiveSyllabus, setActiveSyllabus } from '../syllabus.js';
import { confirmModal } from '../modal.js';

function debounce(fn, ms) { let h = null; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; }

export function renderScheduleConfigPanel() {
    const cfg = schedule.loadConfig();
    const examDays = srs.daysUntilExam();
    const panel = el('div', { class: 'panel settings-section schedule-config' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'study schedule'),
            el('span', { class: 'meta exam-count' }, `${examDays}d to exam`))
    );

    // intensity
    const intensities = ['light', 'standard', 'hard', 'cram'];
    const intensityRow = el('div', { class: 'cfg-row' }, el('label', {}, 'intensity'),
        el('div', { class: 'btn-group intensity-group' },
            ...intensities.map(v => el('button', {
                class: 'chip' + (cfg.intensity === v ? ' active' : ''), 'aria-pressed': String(cfg.intensity === v),
                on: { click: () => { schedule.saveConfig({ intensity: v }); regenAndPreview(); render(); } }
            }, v))));
    panel.append(intensityRow);

    // chronotype
    const chronos = ['morning', 'evening', 'flex'];
    const chronoRow = el('div', { class: 'cfg-row' }, el('label', {}, 'chronotype'),
        el('div', { class: 'btn-group chrono-group' },
            ...chronos.map(v => el('button', {
                class: 'chip' + (cfg.chronotype === v ? ' active' : ''), 'aria-pressed': String(cfg.chronotype === v),
                on: { click: () => { schedule.saveConfig({ chronotype: v }); regenAndPreview(); render(); } }
            }, v))));
    panel.append(chronoRow);

    // pomodoro + break sliders
    const pomoSpan = el('span', { class: 'mono cfg-val' }, `${cfg.pomodoro}m`);
    const savePomoDebounced = debounce((v) => { schedule.saveConfig({ pomodoro: v }); regenAndPreview(); }, 200);
    const pomoRow = el('div', { class: 'cfg-row' }, el('label', {}, 'pomodoro'),
        el('input', { type: 'range', min: '15', max: '60', step: '5', value: String(cfg.pomodoro),
            'aria-label': 'pomodoro length',
            on: { input: e => { const v = parseInt(e.target.value, 10); pomoSpan.textContent = `${v}m`; savePomoDebounced(v); } } }),
        pomoSpan);
    panel.append(pomoRow);
    const brkSpan = el('span', { class: 'mono cfg-val' }, `${cfg.breakLen}m`);
    const saveBrkDebounced = debounce((v) => { schedule.saveConfig({ breakLen: v }); regenAndPreview(); }, 200);
    const brkRow = el('div', { class: 'cfg-row' }, el('label', {}, 'break'),
        el('input', { type: 'range', min: '3', max: '20', step: '1', value: String(cfg.breakLen),
            'aria-label': 'break length',
            on: { input: e => { const v = parseInt(e.target.value, 10); brkSpan.textContent = `${v}m`; saveBrkDebounced(v); } } }),
        brkSpan);
    panel.append(brkRow);

    // availability — 7 rows
    const availPanel = el('div', { class: 'cfg-availability' }, el('div', { class: 'cfg-sublabel' }, 'availability (minutes/day)'));
    const dows = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    for (const d of dows) {
        const availSpan = el('span', { class: 'mono cfg-val' }, `${cfg.availability[d] || 0}m`);
        const saveAvailDebounced = debounce((v) => {
            const av = { ...schedule.loadConfig().availability, [d]: v };
            schedule.saveConfig({ availability: av }); regenAndPreview();
        }, 200);
        availPanel.append(el('div', { class: 'cfg-row dow-row' },
            el('label', {}, d),
            el('input', { type: 'range', min: '0', max: '480', step: '15', value: String(cfg.availability[d] || 0),
                'aria-label': `${d} availability`,
                on: { input: e => { const v = parseInt(e.target.value, 10); availSpan.textContent = `${v}m`; saveAvailDebounced(v); } } }),
            availSpan));
    }
    panel.append(availPanel);

    // subject weighting — toggle + slider per subject
    const weightPanel = el('div', { class: 'cfg-weights' },
        el('div', { class: 'cfg-sublabel' }, 'subjects (toggle off to cram a subset)'));
    for (const meta of state.manifest.subjects) {
        const sub = meta.subject;
        const isOn = cfg.enabled[sub] !== false;
        const toggle = el('button', {
            class: 'chip subject-toggle' + (isOn ? ' active' : ''),
            'aria-pressed': String(isOn),
            title: isOn ? 'enabled — click to disable' : 'disabled — click to enable',
            on: { click: () => {
                const en = { ...schedule.loadConfig().enabled, [sub]: !isOn };
                schedule.saveConfig({ enabled: en }); regenAndPreview(); render();
            } }
        }, isOn ? 'on' : 'off');
        const slider = el('input', { type: 'range', min: '0', max: '3', step: '0.1',
            value: String(cfg.weights[sub] ?? 1),
            disabled: isOn ? null : 'disabled',
            'aria-label': `${sub} weight`,
            on: { input: debounce(e => {
                const w = { ...schedule.loadConfig().weights, [sub]: parseFloat(e.target.value) };
                schedule.saveConfig({ weights: w }); regenAndPreview();
            }, 200) } });
        weightPanel.append(el('div', { class: 'cfg-row weight-row' + (isOn ? '' : ' disabled') },
            toggle,
            el('label', {}, sub),
            slider,
            el('span', { class: 'mono cfg-val' }, String(cfg.weights[sub] ?? 1))));
    }
    panel.append(weightPanel);

    // regenerate button + preview
    const previewWrap = el('div', { class: 'cfg-preview', 'aria-live': 'polite' });
    const regenBtn = el('button', { class: 'run-btn',
        on: { click: () => { regenAndPreview(); } } }, 'regenerate');
    panel.append(el('div', { class: 'cfg-row regen-row' }, regenBtn, el('span', { class: 'muted' }, 'tomorrow preview:')));
    panel.append(previewWrap);

    function refreshPreview() {
        const tomorrow = schedule.addDays(schedule.isoDate(new Date()), 1);
        const sched = schedule.getSchedule({ dueCounts: dueCountsBySubject() });
        const blocks = sched.blocks.filter(b => b.date === tomorrow);
        previewWrap.innerHTML = '';
        if (!blocks.length) { previewWrap.append(el('div', { class: 'muted' }, 'no blocks scheduled tomorrow.')); return; }
        for (const b of blocks) {
            const h = Math.floor(b.startMin / 60), m = b.startMin % 60;
            const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            previewWrap.append(el('div', { class: 'preview-block' + (b.kind === 'break' ? ' brk' : '') },
                el('span', { class: 'mono' }, t),
                el('span', {}, b.kind === 'break' ? 'break' : b.subject),
                el('span', { class: 'mono' }, `${b.len}m`)));
        }
    }

    function regenAndPreview() {
        const ticksAll = loadGuideTicks();
        const casesDone = casesDoneBySubject();
        schedule.regenerate({
            dueCounts: dueCountsBySubject(),
            extras: { ticksAll, shards: state.shards, casesDone }
        });
        refreshPreview();
    }

    refreshPreview();
    return panel;
}

export async function renderSettings() {
    getStage().append(el('div', { class: 'section-head' }, el('span', { class: 'eyebrow' }, 'settings'), el('h2', {}, 'settings')));
    const cfg = srs.loadConfig();
    const schedCfg = schedule.loadConfig();
    const p = progress.load();
    const examInput = el('input', { type: 'date', value: cfg.examDate, class: 'search', style: 'max-width:200px',
        'aria-label': 'exam date', on: { change: e => {
            const newDate = e.target.value;
            srs.saveConfig({ ...cfg, examDate: newDate });
            schedule.saveConfig({ ...schedCfg, examDate: newDate });
            render();
        } } });
    const goalInput = el('input', { type: 'number', min: '1', max: '500', value: String(p.dailyGoal), class: 'search',
        style: 'max-width:120px', 'aria-label': 'daily goal',
        on: { change: e => { progress.setGoal(parseInt(e.target.value, 10) || 30); render(); } } });
    const cramBtn = el('button', { class: 'chip' + (state.cramMode ? ' active' : ''),
        'aria-label': 'cram mode', 'aria-pressed': String(!!state.cramMode),
        on: { click: () => { state.cramMode = !state.cramMode; render(); } } }, state.cramMode ? 'cram on' : 'cram off');
    const exportBtn = el('button', { class: 'chip', 'aria-label': 'export data',
        on: { click: () => {
            const blob = new Blob([srs.exportState()], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `corpus-srs-${srs.today()}.json`; a.click(); URL.revokeObjectURL(a.href);
        } } }, 'export');
    const importInput = el('input', { type: 'file', accept: '.json', style: 'display:none',
        on: { change: async e => {
            const f = e.target.files?.[0]; if (!f) return;
            if (!await confirmModal('import overwrites current progress. continue?')) return;
            const text = await f.text();
            try { const n = srs.importState(text); alert(`imported ${n} cards`); render(); }
            catch (err) { alert('import failed: ' + err.message); }
        } } });
    const importBtn = el('button', { class: 'chip', 'aria-label': 'import',
        on: { click: () => importInput.click() } }, 'import');
    const resetBtn = el('button', { class: 'chip', 'aria-label': 'reset',
        on: { click: async () => { if (await confirmModal('reset all progress?')) { srs.resetAll(); state.reviewSessionGraded = 0; render(); } } } }, 'reset');
    const ankiBtn = el('button', { class: 'chip', 'aria-label': 'export to Anki',
        on: { click: async () => {
            const lines = ['#separator:tab', '#html:true', '#guid column:1', '#notetype column:2', '#deck column:3', '#tags column:6'];
            try {
                const mf = await fetch(dataPath('manifest.json')).then(r => r.json());
                for (const s of mf.subjects) {
                    const sh = await fetch(dataPath(`${s.subject}.json`)).then(r => r.json());
                    for (const c of sh.cards) {
                        const deck = c._deck || `Corpus::${s.subject}::${c.source || 'general'}`;
                        const noteType = c._noteType || 'Basic';
                        const tags = [...(c.tags || []), `subject:${s.subject}`, `difficulty:${c.difficulty || 'medium'}`].join(' ');
                        const front = String(c.front || '').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
                        const back = String(c.back || '').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
                        lines.push([c._guid || c.id, noteType, deck, front, back, tags].join('\t'));
                    }
                }
                const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/tab-separated-values' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                a.download = `corpus-anki-${srs.today()}.txt`; a.click(); URL.revokeObjectURL(a.href);
            } catch (e) { alert('anki export failed: ' + e.message); }
        } } }, 'export to Anki (.txt)');
    const shortcutsBtn = el('button', { class: 'chip', 'aria-label': 'shortcuts',
        on: { click: () => openShortcutsModal() } }, 'shortcuts');
    // syllabus selector — switching reloads the app onto the chosen data set; all
    // study progress is namespaced per syllabus so the two never mix.
    const syllabi = listSyllabi();
    if (syllabi.length > 1) {
        const active = getActiveSyllabus();
        const sel = el('select', { class: 'syllabus-select', 'aria-label': 'active syllabus' },
            ...syllabi.map(s => el('option', { value: s.id, ...(s.id === active ? { selected: '' } : {}) }, s.label || s.id)));
        sel.addEventListener('change', async () => {
            const id = sel.value;
            if (id === getActiveSyllabus()) return;
            if (!await confirmModal(`Switch to "${syllabi.find(s => s.id === id)?.label || id}"? Your ${active} progress is kept and restored when you switch back.`)) {
                sel.value = getActiveSyllabus();
                return;
            }
            setActiveSyllabus(id);
            location.reload();
        });
        getStage().append(el('div', { class: 'panel' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'syllabus')),
            el('div', { class: 'toolbar' }, el('label', { for: 'syllabus-select' }, 'active:'), sel)));
    }
    getStage().append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'study')),
        el('div', { class: 'toolbar' }, el('label', { for: 'exam-date' }, 'exam:'), examInput,
            el('label', {}, 'goal:'), goalInput, cramBtn)));
    getStage().append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'theme')),
        el('div', { class: 'toolbar' }, makeToggleButton(document))));
    getStage().append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'data')),
        el('div', { class: 'toolbar' }, exportBtn, importBtn, importInput, ankiBtn, resetBtn)));
    getStage().append(renderScheduleConfigPanel());
    getStage().append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'help')),
        el('div', { class: 'toolbar' }, shortcutsBtn,
            el('a', { class: 'chip', href: '?debug', 'aria-label': 'enable debug' }, 'debug mode'))));
}
