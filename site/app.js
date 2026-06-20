// corpus — personal med-study notebook. vanilla ESM, no bundler.
import './theme.js';
import * as srs from './srs.js';
import * as progress from './progress.js';
import * as cram from './cram.js';
import * as justread from './justread.js';
import * as timer from './timer.js';
import * as mistakes from './mistakes.js';
import * as drill from './drill.js';
import * as flag from './flag.js';
import * as undo from './undo.js';
import * as late from './late.js';
import * as schedule from './schedule.js';
import * as calendar from './calendar.js';
import * as toast from './toast.js';
import { buildSearchIndex, mountPalette } from './search.js';
import { makeToggleButton } from './theme.js';
import { initTutorPanel, wireWorkerToPanel, syncTutorFromStorage, setDailyPlanProvider, sendTutorMessage, setTutorContext, startDailySyllabus } from './tutor-panel.js';
import { state, el, icon, iconLabel, appRoot, DEBUG, log, warn, loadManifest, loadAllShards, loadGuideTicks, dueCountsBySubject, updateFooter, getStage, setStage, fetchJson } from './app-context.js';
import { initSyllabi } from './syllabus.js';
import { go, onNav, setRenderer } from './router.js';
import { renderStats } from './views/stats.js';
import { renderCalendar } from './views/calendar.js';
import { renderSettings } from './views/settings.js';
import { renderTriage } from './views/cases.js';
import { renderReview, resetReviewQueue, gradeReview, undoLastGrade, skipReview, FRIENDLY_GRADES, showStorageFullBanner } from './views/review.js';
import { renderMistakes } from './views/mistakes.js';
import { renderDrill } from './views/drill.js';
import { renderGuides } from './views/guides.js';
import { renderToday } from './views/today.js';
import { renderSubject } from './views/subject.js';
import { openShortcutsModal, closeShortcutsModal } from './shortcuts.js';

const ROUTE_FNS = { today: renderToday, calendar: renderCalendar, guides: renderGuides,
    review: renderReview, cases: renderTriage, stats: renderStats, subject: renderSubject,
    settings: renderSettings, mistakes: renderMistakes, drill: renderDrill };

let sdk = null;
let sdkRender = null;

// Review-filter reset is the one app-specific side effect of a nav; register it
// as a router onNav hook so the router stays free of view/queue concerns.
onNav((route, subject) => {
    if (route === 'review' && subject) { state.reviewSubjectFilter = subject; resetReviewQueue(); }
});

let __rendering = false;
function render() {
    if (sdkRender) {
        sdkRender();
    } else {
        __rendering = true;
        try {
            window.__lastRenderTs = Date.now();
            if (getStage()) getStage().innerHTML = '';
            if (!state.manifest) { if (getStage()) getStage().append(el('div', { class: 'loading' }, 'loading…')); return; }
            const r = state.route;
            // day-of-exam minimal mode — only mistakes + farewell. Gated on the
            // exam date being exactly today (not daysUntilExam===0, which also
            // matches any past/default date and would hijack every route).
            if (srs.isExamDay() && r !== 'mistakes' && r !== 'settings') {
                renderExamDay(); updateFooter(); return;
            }
            (ROUTE_FNS[r] || renderToday)();
            updateFooter();
        } finally { __rendering = false; }
    }
}
// Wire the router's injected renderer to app.js's render so go()/router.render()
// drive the real render-dispatch map (still owned here until views are extracted).
setRenderer(render);

// ---- shell-prompt status line ----

// ---- cram banner ----



let gPrefixTs = 0;
document.addEventListener('keydown', e => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openShortcutsModal(); return; }
    // g-prefix vim nav
    if (Date.now() - gPrefixTs < 1500) {
        const map = { h: 'today', r: 'review', s: 'stats', g: 'guides', m: 'mistakes', t: 'today' };
        const dest = map[e.key];
        if (dest) { e.preventDefault(); gPrefixTs = 0; go(dest); return; }
        gPrefixTs = 0;
    }
    if (e.key === 'g' && !e.ctrlKey && !e.metaKey) { gPrefixTs = Date.now(); return; }
    // global keys
    if (e.key === 't' && !e.ctrlKey && !e.metaKey && state.route !== 'review') {
        e.preventDefault(); state.timerApi?.toggleVis(); return;
    }
    if (e.key === 'u' && !e.ctrlKey && !e.metaKey && undo.peek()) { e.preventDefault(); undoLastGrade(); return; }
    if (e.key === 'Escape') {
        if (document.body.classList.contains('just-read') && state.route === 'subject') {
            justread.toggle(state.currentSubject);
            justread.applyClass(false);
            return;
        }
        closeShortcutsModal(); return;
    }
    if ((e.key === 'r' || e.key === 'R') && state.route === 'subject' && state.currentSubject) {
        e.preventDefault();
        const on = justread.toggle(state.currentSubject);
        justread.applyClass(on);
        return;
    }
    if (state.route !== 'review') return;
    if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (!state.reviewRevealed && state.reviewQueue?.length) { state.reviewRevealed = true; renderReview(); }
    } else if (e.key === 's' || e.key === 'S') {
        if (state.reviewQueue?.length) { e.preventDefault(); skipReview(); }
    } else if (e.key === 'f' || e.key === 'F') {
        const card = state.reviewQueue?.[state.reviewIndex];
        if (card) { e.preventDefault(); flag.toggle(card.id); renderReview(); }
    } else if (state.reviewRevealed) {
        const card = state.reviewQueue?.[state.reviewIndex];
        if (!card) return;
        if (DEBUG && /^[0-5]$/.test(e.key)) { e.preventDefault(); gradeReview(card.id, parseInt(e.key, 10)); }
        else if (!DEBUG && /^[1-4]$/.test(e.key)) {
            e.preventDefault();
            const g = FRIENDLY_GRADES.find(x => x.friendly === parseInt(e.key, 10));
            if (g) gradeReview(card.id, g.smscore);
        }
    }
});


function renderExamDay() {
    getStage().innerHTML = '';
    getStage().append(el('div', { class: 'panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'exam day')),
        el('p', { style: 'font-family:var(--ff-prose);font-size:18px;line-height:1.6' }, 'good luck. trust your prep.'),
        el('div', { class: 'toolbar', style: 'margin-top:14px' },
            el('a', { class: 'chip', href: '#mistakes', on: { click: e => { e.preventDefault(); go('mistakes'); } } }, 'mistakes'),
            el('a', { class: 'chip', href: '#settings', on: { click: e => { e.preventDefault(); go('settings'); } } }, 'settings'))));
}



function mountTopbar() {
    const nav = document.querySelector('.nav');
    nav.innerHTML = '';
    // Simplified primary nav - fewer items for clarity
    const primary = [['today', 'home'], ['guides', 'subjects'], ['review', 'cards'], ['stats', 'progress']];
    for (const [route, label] of primary) {
        nav.append(el('a', { href: `#${route}`, class: 'navlink', data: { route },
            on: { click: e => { e.preventDefault(); go(route); } } }, label));
    }
    // Secondary actions in dropdown
    const moreMenu = el('div', { class: 'nav-more-menu', hidden: '' },
        el('a', { href: '#cases', class: 'nav-more-item', on: { click: e => { e.preventDefault(); moreMenu.hidden = true; go('cases'); } } }, 'clinical cases'),
        el('a', { href: '#calendar', class: 'nav-more-item', on: { click: e => { e.preventDefault(); moreMenu.hidden = true; go('calendar'); } } }, 'study plan'),
        el('a', { href: '#mistakes', class: 'nav-more-item', on: { click: e => { e.preventDefault(); moreMenu.hidden = true; go('mistakes'); } } }, 'mistakes'),
        el('a', { href: '#drill', class: 'nav-more-item', on: { click: e => { e.preventDefault(); moreMenu.hidden = true; go('drill'); } } }, 'drill 10'));
    const moreBtn = el('button', { class: 'navlink nav-more', 'aria-label': 'more', 'aria-haspopup': 'menu',
        on: { click: e => { e.preventDefault(); moreMenu.hidden = !moreMenu.hidden; } } }, 'more');
    nav.append(moreBtn, moreMenu);
    // Tutor CTA - clear visual distinction
    nav.append(el('a', { href: './triage-live.html', class: 'navlink nav-cta', 'aria-label': 'open tutor' }, iconLabel('arrowRight', 'tutor')));
    
    // Right side: countdown + quick actions
    const right = document.querySelector('header.topbar .status');
    const days = srs.daysUntilExam();
    const countdown = el('a', { class: 'exam-countdown', href: '#settings',
        title: 'days to exam — click to edit', 'aria-label': `${days} days to exam`,
        on: { click: e => { e.preventDefault(); go('settings'); } } }, `${days}d to exam`);
    right.parentElement.insertBefore(countdown, right);
    // ASCII label (was a decorative command-key glyph that mismatched the ctrl+k
    // aria-label and reads wrong on non-Mac platforms).
    const searchBtn = el('button', { class: 'chip search-btn', 'aria-label': 'search (ctrl+k)', title: 'search (ctrl+k)',
        on: { click: () => state.searchPaletteApi?.open() } }, 'ctrl+k');
    right.parentElement.insertBefore(searchBtn, right);
    right.parentElement.insertBefore(makeToggleButton(document), right);
    const settingsBtn = el('a', { href: '#settings', class: 'chip', 'aria-label': 'settings',
        on: { click: e => { e.preventDefault(); go('settings'); } } }, icon('gear'));
    right.parentElement.insertBefore(settingsBtn, right);
}

// The top .nav is display:none on mobile; the .bottom-nav element exists in the
// HTML but was never populated, leaving mobile with NO reachable navigation.
// Fill it with the same primary routes so navigation is always visible on mobile.
// data-route lets the route-change handler (toggling .navlink.active) light the
// current tab automatically — no separate active-state wiring needed.
function mountBottomNav() {
    const bnav = document.querySelector('.bottom-nav');
    if (!bnav) return;
    bnav.innerHTML = '';
    const items = [['today', 'home'], ['guides', 'subjects'], ['review', 'cards'], ['stats', 'progress'], ['settings', 'more']];
    for (const [route, label] of items) {
        bnav.append(el('a', { href: `#${route}`, class: 'navlink', data: { route },
            on: { click: e => { e.preventDefault(); go(route); } } }, label));
    }
}

function mountSearchPalette() {
    // The index is O(corpus) to build (~2551 cards + 934KB prose). It is static
    // for a given set of loaded shards, so memoize and rebuild only when more
    // shards have loaded — never per keystroke.
    let _idx = null, _idxKey = '';
    const getItems = () => {
        const key = Object.keys(state.shards || {}).sort().join(',');
        if (_idx && key === _idxKey) return _idx;
        _idx = buildSearchIndex(state.manifest, state.shards);
        _idxKey = key;
        return _idx;
    };
    state.searchPaletteApi = mountPalette(document, '#search-palette',
        getItems,
        (item) => {
            if (item.kind === 'card') { go('subject', item.subject); }
            else if (item.kind === 'case') { location.href = `./triage-live.html#${encodeURIComponent(item.id)}`; }
            else if (item.kind === 'section') { go('subject', item.subject); }
            else if (item.kind === 'prose') { go('subject', item.subject); }
            else if (item.kind === 'infographic') { go('subject', item.subject); }
            else if (item.kind === 'video') {
                go('subject', item.subject);
                setTimeout(() => { const v = document.querySelector('.video-hero'); if (v) v.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200);
            }
        });
}


function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js').then(reg => log('sw registered', reg.scope))
        .catch(e => warn('sw register failed', e.message));
}

function setupSdkApp() {
    const { components: C } = sdk;
    
    sdkRender = sdk.mount(appRoot, () => {
        const navItems = [
            ['today', '#today'],
            ['subjects', '#guides'],
            ['review', '#review'],
            ['cases', '#cases'],
            ['stats', '#stats']
        ];

        const r = state.route;
        const currentLabel = navItems.find(i => i[1].slice(1) === r)?.[0] || r;

        const mainContent = document.createElement('div');
        mainContent.className = 'stage';
        
        // This is a bit of a hack to bridge the legacy imperative renderers 
        // with the new reactive SDK mount.
        const stageProxy = {
            get innerHTML() { return mainContent.innerHTML; },
            set innerHTML(v) { if (v === '') mainContent.innerHTML = ''; else mainContent.innerHTML = v; },
            append: (...args) => mainContent.append(...args),
            appendChild: (arg) => mainContent.appendChild(arg),
            querySelector: (s) => mainContent.querySelector(s),
            querySelectorAll: (s) => mainContent.querySelectorAll(s),
            dataset: {},
            classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
            style: {}
        };
        
        // Swap the shared stage for a collector proxy while the sub-renderers run,
        // then restore. setStage is the single owner so the swap is observable to
        // every view that reads getStage().
        const originalStage = getStage();
        setStage(stageProxy);

        try {
            (ROUTE_FNS[r] || renderToday)();
        } finally {
            setStage(originalStage);
        }

        return C.AppShell({
            topbar: C.Topbar({
                brand: 'corpus',
                leaf: state.currentSubject || '',
                items: navItems,
                active: currentLabel,
                onNav: (label) => {
                    const item = navItems.find(i => i[0] === label);
                    if (item) go(item[1].slice(1));
                }
            }),
            main: mainContent,
            status: C.Status({
                left: [C.h('span', { class: 'mono' }, !navigator.onLine ? 'offline · saved locally' : 'ready')],
                right: [C.h('span', { class: 'mono' }, `v${window.__BUILD_VERSION__ || '0.1.0'}`)]
            })
        });
    });
}

(async () => {
    try {
        // Resolve the active syllabus + migrate legacy keys BEFORE any data fetch or
        // per-syllabus storage access, so loaders hit ./data/<active>/ and skey() is correct.
        await initSyllabi(fetchJson);
        await loadManifest();
        await loadAllShards();

        try {
            sdk = await import('./247420.js');
            if (sdk && sdk.mount) {
                setupSdkApp();
            }
        } catch (e) {
            console.warn('[corpus] SDK load failed, using fallback', e);
            // setupSdkApp threw mid-mount (e.g. an SDK hyperscript error). Without a
            // real fallback the page kept the static empty header and rendered NO
            // navigation at all. Reset to the legacy imperative path: clear any
            // half-set sdkRender so render() uses the stage path, and populate the
            // raw topbar nav that the SDK shell would otherwise have owned.
            sdkRender = null;
            try { mountTopbar(); } catch (e2) { console.warn('[corpus] mountTopbar failed', e2); }
        }

        // Initialize schedule
        const today = schedule.isoDate(new Date());
        const sched = schedule.loadSchedule();
        if (!sched.blocks.length || sched.today !== today) {
            schedule.getSchedule({ today, dueCounts: dueCountsBySubject(), ticksAll: loadGuideTicks() });
        }
        // Bottom-nav must mount regardless of the SDK vs fallback render path —
        // the SDK AppShell renders its own topbar (the raw .nav/.bottom-nav from
        // index.html are NOT used by it), so without this mobile had zero visible
        // navigation. The .bottom-nav element is a sibling of #app and survives the
        // SDK mount; populate it once here, on both paths.
        mountBottomNav();
        // Give the tutor panel a way to fetch today's real schedule plan so its
        // "Walk me through today" chip can launch the interactive daily-syllabus walk.
        setDailyPlanProvider(() => {
            const today = schedule.isoDate(new Date());
            try {
                const sched = schedule.loadSchedule();
                return { date: today, blocks: (sched.blocks || []).filter(b => b.date === today) };
            } catch { return { date: today, blocks: [] }; }
        });
        mountSearchPalette();
        state.timerApi = timer.mount(document);
        const lvl = late.lateLevel(); late.applyClass(document, lvl);
        if (lvl !== 'normal') {
            const m = late.message(lvl);
            if (m) { const banner = el('div', { class: 'late-banner', role: 'status' }, m); document.body.appendChild(banner); }
        }
        registerSW();
        window.addEventListener('storage', e => {
            if (__rendering) return;
            // Tutor history written by another tab: re-sync the panel's in-memory
            // thread so the two tabs don't diverge / clobber each other.
            if (e.key === 'corpus.tutor.history.v1') { try { syncTutorFromStorage(); } catch {} return; }
            if (e.key && /^corpus\./.test(e.key)) render();
        });
        
        // Initialize Bonsai-1.7B tutor
        try {
            initTutorPanel().catch(err => warn('tutor initialization failed', err.message));
            const worker = new Worker('./tutor.js', { type: 'module' });
            wireWorkerToPanel(worker);
            state.tutorWorker = worker;
            // Lazy-load the 1-bit model: the heavy download only starts when the
            // user actually opens the coach (or sends a message / triggers a
            // check-in), not on every page load. preloadTutorModel() is the panel's
            // idempotent trigger; the daily check-in path also calls init on demand.
        } catch (err) {
            warn('tutor worker spawn failed', err.message);
        }

        // Expose page-control actions for LLM tool dispatch.
        window.__tutorActions = {
            sendTutorMessage(msg) { sendTutorMessage(msg); },
            setTutorContext(ctx) { setTutorContext(ctx); },
            startDailySyllabus(plan) { startDailySyllabus(plan); },
            navigate(args) {
                const route = String(args?.route || '').replace(/^#/, '');
                if (!route) return;
                go(route);
            },
            open_guide(args) {
                const subject = String(args?.subject || '').toLowerCase();
                if (!subject) return;
                go('subject', subject);
            },
            start_session(args) {
                const subject = String(args?.subject || '').toLowerCase();
                go('review', subject || 'all');
            }
        };

        window.addEventListener('corpus:storage-full', () => showStorageFullBanner());
        const hash = location.hash.replace('#', '') || 'today';
        const [routeRaw, sub] = hash.split('/');
        const route = routeRaw.split('?')[0];
        go(route, sub ? sub.split('?')[0] : undefined);
    } catch (e) {
        if (getStage()) {
            getStage().innerHTML = '';
            getStage().append(el('div', { class: 'panel error-state' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'failed to load')),
                el('div', {}, e.message),
                el('button', { class: 'chip', on: { click: () => location.reload() } }, 'retry')));
        }
        warn('boot error', e);
    }
})();

window.addEventListener('hashchange', () => {
    const hash = location.hash.replace('#', '') || 'today';
    const [routeRaw, sub] = hash.split('/');
    const route = routeRaw.split('?')[0];
    go(route, sub ? sub.split('?')[0] : undefined);
});
