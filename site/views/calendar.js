// views/calendar.js — the calendar route. Mounts the calendar component into the
// shared stage, feeding it live per-subject due counts from app-context.
import { getStage, el, dueCountsBySubject } from '../app-context.js';
import * as calendar from '../calendar.js';

export function renderCalendar() {
    getStage().append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'plan'), el('h2', {}, 'calendar')));
    const mount = el('div', { class: 'cal-mount', id: 'cal-mount' });
    getStage().append(mount);
    calendar.mount(mount, { dueCountsFn: () => dueCountsBySubject() });
}
