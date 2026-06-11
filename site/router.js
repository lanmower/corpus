// router.js — route table + navigation. Owns the route vocabulary, the doc-title
// rule, and go(): the single entry point that mutates state.route and triggers a
// render. It imports app-context (state) and the leaf bookkeeping libs only; the
// actual render function is INJECTED via setRenderer() so the router has no static
// dependency on the views or the render-dispatch map (no router->views->router
// cycle). App-specific side effects of a nav (e.g. resetting the review queue) are
// registered as onNav hooks rather than hard-coded here.
import { state } from './app-context.js';
import * as progress from './progress.js';
import * as lastpos from './lastpos.js';
import * as justread from './justread.js';

export const ROUTES = ['today', 'guides', 'review', 'cases', 'stats', 'subject', 'settings', 'calendar', 'mistakes', 'drill'];
const ROUTE_TITLES = { today: 'today', guides: 'subjects', review: 'review',
    cases: 'cases', stats: 'stats', subject: 'subject', settings: 'settings',
    calendar: 'calendar', mistakes: 'mistakes', drill: 'drill' };
const ROUTE_ALIASES = { home: 'today', triage: 'cases', subjects: 'guides', cards: 'review',
    notes: 'today', quests: 'today', badges: 'today' };

let _render = () => {};
const _navHooks = [];
export function setRenderer(fn) { _render = fn; }
export function render() { _render(); }
// Register a side effect to run on every nav, after route/subject are set and
// before render. Receives (route, subject).
export function onNav(fn) { _navHooks.push(fn); }

export function setDocTitle(route, subject) {
    const main = subject ? subject : (ROUTE_TITLES[route] || route);
    document.title = `${main} · corpus`;
}

export function go(route, subject) {
    if (ROUTE_ALIASES[route]) route = ROUTE_ALIASES[route];
    if (!ROUTES.includes(route)) route = 'today';
    state.route = route;
    if (subject !== undefined) state.currentSubject = subject;
    for (const h of _navHooks) { try { h(route, subject); } catch {} }
    document.querySelectorAll('.navlink').forEach(a => a.classList.toggle('active', a.dataset.route === route));
    setDocTitle(route, subject);
    progress.setLast(route, subject);
    lastpos.save(route, subject);
    // apply just-read on subject change
    if (route === 'subject' && subject) justread.applyClass(justread.isOn(subject));
    else justread.applyClass(false);
    _render();
}
