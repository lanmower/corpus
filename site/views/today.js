// views/today.js — the home/today route: primary action (review/learn), next-reading
// card, compact stats + progress, per-subject due breakdown, the daily tutor check-in
// trigger, and (under ?debug) sparkline/mastery-ring/schedule-checklist panels.
import { getStage, el, icon, iconLabel, state, loadGuideTicks, saveGuideTicks, dueCountsBySubject, casesDoneBySubject, totalDueAll, totalNewEligibleAll, totalCasesQueued, estReviewMinutes, todayPlanReviewTarget, sectionCardCounts, masteryFor, slugify, warn } from '../app-context.js';
import { go, render } from '../router.js';
import { resetReviewQueue } from './review.js';
import * as srs from '../srs.js';
import * as progress from '../progress.js';
import * as mastery from '../mastery.js';
import * as schedule from '../schedule.js';
import * as cram from '../cram.js';
import * as lastpos from '../lastpos.js';
import * as newcards from '../newcards.js';
import * as flag from '../flag.js';
import { buildRows } from '../verdicts.js';
import { localDayISO } from '../dates.js';
import { ICON } from '../icons.js';
import { setTutorContext, startDailySyllabus } from '../tutor-panel.js';
import { loadConfig as loadTutorConfig, shouldCheckInToday, markCheckedIn, todayStamp as localDateStamp } from '../tutor-store.js';

function renderCramBanner(weakest) {
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

// ---- soft resume line ----
function renderResumeLine() {
    const lp = lastpos.load(); if (!lp) return null;
    const gap = lastpos.gapDays();
    if (gap < 1) return null;
    const anchor = lp.subjectAnchor || lp.route || 'today';
    const target = lp.subjectAnchor ? `#subject/${lp.subjectAnchor}` : `#${lp.route}`;
    return el('div', { class: 'resume-line' },
        `back after ${gap}d. last: ${anchor} `,
        el('a', { href: target,
            on: { click: e => { e.preventDefault(); if (lp.subjectAnchor) go('subject', lp.subjectAnchor); else go(lp.route); } } }, iconLabel('arrowRight', 'resume'))
    );
}

// ---- first-time visitor detection ----
function isFirstTimeVisitor() {
    try {
        const p = progress.load();
        if (!p || p.todayGraded > 0) return false;
        const states = srs.loadStates();
        const hasHistory = p.history && p.history.some(h => (h.graded || 0) > 0);
        if (hasHistory) return false;
        const hasReviewed = Object.values(states).some(s => s && s.history && s.history.length > 0);
        if (hasReviewed) return false;
        return !localStorage.getItem('corpus.welcome.dismissed');
    } catch { return false; }
}

// ---- welcome panel for first-time visitors ----
function renderWelcome() {
    if (!isFirstTimeVisitor()) return null;
    return el('div', { class: 'panel', style: 'border-left: 4px solid var(--c-mastered);' },
        el('div', { class: 'panel-head' },
            el('span', { class: 'title' }, 'welcome to corpus'),
            el('button', { class: 'chip', style: 'margin-left:auto', 'aria-label': 'dismiss welcome',
                on: { click: () => { localStorage.setItem('corpus.welcome.dismissed', '1'); render(); } } }, 'got it')),
        el('div', { style: 'font-family:var(--ff-prose);line-height:1.6;font-size:15px' },
            el('p', {}, 'this is your medical study corpus — a personal notebook covering 8 subjects with spaced repetition cards, study guides, and clinical cases.'),
            el('p', {}, 'cards marked "due" use a spaced repetition algorithm (SRS) to optimize memory retention. review them daily to build mastery.'),
            el('p', {}, el('strong', {}, 'get started:'), ' review due cards, read a guide, or work through a clinical case.')
        )
    );
}

// Tutor session overview panel for SRS daily page
function renderTutorOverviewPanel(due, newCount) {
    if (!state.tutorWorker) return null;

    // Find weakest subject by progress
    let weakestSubject = null;
    let weakestPct = 101;
    for (const subj of (state.manifest?.subjects || [])) {
        try {
            const prog = mastery.subjectProgress(state.manifest, state.shards, subj.subject);
            const pct = prog?.masteredPct || 0;
            if (pct < weakestPct) {
                weakestPct = pct;
                weakestSubject = subj.subject;
            }
        } catch (err) {
            // skip on error
        }
    }

    // Days until exam from the user's configured exam date (was hardcoded to 30,
    // which made the coach's urgency advice always wrong).
    let examDaysLeft = null;
    try { examDaysLeft = srs.daysUntilExam(); } catch { examDaysLeft = null; }

    // Feed real study state to the panel so starter chips can be personalized.
    try { setTutorContext({ weakestSubject: weakestSubject || '', dueCount: due || 0, examDaysLeft }); } catch {}

    // Proactive daily check-in: only when enabled in config and not yet greeted today.
    try {
        const cfg = loadTutorConfig();
        // Decide here; the panel calls markCheckedIn() only on session-overview-done,
        // so a WebGPU-less device doesn't silently consume the daily greeting.
        // markCheckedIn is deferred to the worker reply, so guard with a session
        // flag too: re-rendering the daily page (nav back) before the reply lands
        // must not post a second session-overview and duplicate the plan in-thread.
        // Re-arm the same-session dedup flag when the local date rolls over, so a
        // tab left open past midnight still fires the next day's check-in. Must use
        // the LOCAL date (matching tutor-store's shouldCheckInToday()/todayStamp()),
        // not UTC: a UTC stamp re-arms at the wrong boundary, so a user behind UTC
        // would have the gate re-open at local midnight while this flag stayed set.
        const checkinToday = localDateStamp();
        if (state.tutorCheckinDate !== checkinToday) {
            state.tutorCheckinDate = checkinToday;
            state.tutorCheckinPosted = false;
        }
        if (cfg.proactiveCheckins && shouldCheckInToday() && !state.tutorCheckinPosted) {
            state.tutorCheckinPosted = true;
            // The daily check-in is now an INTERACTIVE syllabus walk (srs-mccqe1
            // pattern) rather than a one-shot greeting: hand the coach today's real
            // schedule blocks so it presents the plan step by step and the student
            // can drive it through the chat path.
            const today = schedule.isoDate(new Date());
            let plan = null;
            try {
                const sched = schedule.loadSchedule();
                const blocks = (sched.blocks || []).filter(b => b.date === today);
                plan = { date: today, blocks };
            } catch { plan = { date: today, blocks: [] }; }
            startDailySyllabus(plan);
        }
    } catch (err) {
        warn('tutor session overview failed', err.message);
    }

    return null;
}

// ---- compressed today ----
function renderTodayPrimary(due, newCount) {
    if (due > 0) {
        const mins = estReviewMinutes(due);
        return el('div', { class: 'today-primary' },
            el('a', { class: 'primary-action', href: '#review',
                on: { click: e => { e.preventDefault(); state.reviewSubjectFilter = 'all'; state.cramMode = false; state.learnMode = false; resetReviewQueue(); go('review'); } } },
                el('span', { class: 'pa-label' }, `review ${due} due card${due === 1 ? '' : 's'}`),
                el('span', { class: 'pa-meta' }, `~${mins} min`)));
    }
    if (newCount > 0) {
        const planTarget = todayPlanReviewTarget();
        const altMeta = planTarget > 0 ? `${newCount} ready · or just review (${planTarget})` : `${newCount} ready to introduce`;
        return el('div', { class: 'today-primary' },
            el('a', { class: 'primary-action', href: '#review',
                on: { click: e => { e.preventDefault(); state.reviewSubjectFilter = 'all'; state.cramMode = false; state.learnMode = true; resetReviewQueue(); go('review'); } } },
                el('span', { class: 'pa-label' }, `learn 5 new cards`),
                el('span', { class: 'pa-meta' }, altMeta)));
    }
    // Fresh user, no eligible cards yet — point to next unticked section
    const next = nextUntickedSubject();
    if (next) {
        return el('div', { class: 'today-primary' },
            el('a', { class: 'primary-action', href: `#subject/${next.subject}`,
                on: { click: e => { e.preventDefault(); go('subject', next.subject); } } },
                el('span', { class: 'pa-label' }, `start with ${next.subject}`),
                el('span', { class: 'pa-meta' }, next.section?.title || 'first section')));
    }
    return el('div', { class: 'today-primary' },
        el('div', { class: 'primary-action muted' }, 'all caught up · browse subjects'));
}


function nextUntickedSubject() {
    const ticksAll = loadGuideTicks();
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject]; if (!sh) continue;
        const t = ticksAll[meta.subject] || {};
        const sec = sh.guide?.sections?.find(s => !t[String(s.line)]);
        if (sec) return { subject: meta.subject, section: sec };
    }
    return null;
}

function nextUntickedSection() {
    const ticksAll = loadGuideTicks();
    const lp = lastpos.load();
    if (lp?.subjectAnchor) {
        const sh = state.shards[lp.subjectAnchor];
        if (sh) {
            const t = ticksAll[lp.subjectAnchor] || {};
            const sec = sh.guide?.sections?.find(s => (s.level === 2 || s.level === 3) && !t[String(s.line)]);
            if (sec) return { subject: lp.subjectAnchor, section: sec };
        }
    }
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject]; if (!sh) continue;
        const t = ticksAll[meta.subject] || {};
        const sec = sh.guide?.sections?.find(s => (s.level === 2 || s.level === 3) && !t[String(s.line)]);
        if (sec) return { subject: meta.subject, section: sec };
    }
    return null;
}

function renderNextReadingCard(next) {
    if (!next) return null;
    const subj = next.subject;
    const sec = next.section;
    const ticks = loadGuideTicks()[subj] || {};
    const tickedCount = Object.keys(ticks).filter(k => ticks[k]).length;
    const isFirstRead = tickedCount === 0;
    const totalSections = (state.shards[subj]?.guide?.sections || []).filter(s => s.level === 2 || s.level === 3).length;
    const progressLabel = totalSections ? `${tickedCount}/${totalSections} sections` : '';

    return el('div', { class: 'panel next-reading-panel', role: 'region', 'aria-label': isFirstRead ? 'start reading' : 'continue reading' },
        el('div', { class: 'panel-head' },
            el('span', { class: 'title' }, isFirstRead ? 'start reading' : 'continue reading'),
            el('span', { class: 'meta' }, `${subj} \u00b7 ${progressLabel}`)),
        el('div', { class: 'next-reading-body' },
            el('div', { class: 'nr-subject' }, subj),
            el('div', { class: 'nr-section' }, sec.title)),
        el('div', { class: 'next-reading-actions' },
            el('a', { class: 'chip primary-action', href: `#subject/${subj}`,
                on: { click: e => {
                    e.preventDefault();
                    go('subject', subj);
                    const anchorId = `g-${slugify(sec.title)}-${sec.line}`;
                    const pollStart = Date.now();
                    const poll = () => {
                        const target = document.getElementById(anchorId);
                        if (target) {
                            const panel = target.closest('.chunk-panel');
                            if (panel && panel.classList.contains('chunk-collapsed')) {
                                panel.classList.remove('chunk-collapsed');
                            }
                            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        } else if (Date.now() - pollStart < 3000) {
                            setTimeout(poll, 150);
                        }
                    };
                    setTimeout(poll, 300);
                } } }, iconLabel('arrowRight', 'read')),
            el('button', { class: 'chip',
                on: { click: () => {
                    const all = loadGuideTicks();
                    (all[subj] = all[subj] || {})[String(sec.line)] = true;
                    saveGuideTicks(all);
                    render();
                } } }, 'mark read')));
}

export function renderToday() {
    const p = progress.load();
    const due = totalDueAll();
    const newEl = totalNewEligibleAll();
    const newCount = newEl.total;

    // Welcome message for first-time visitors
    const welcomeEl = renderWelcome();
    if (welcomeEl) getStage().append(welcomeEl);

    const resumeEl = renderResumeLine();
    if (resumeEl) getStage().append(resumeEl);

    // Trigger tutor session overview (displays in tutor panel)
    renderTutorOverviewPanel(due, newCount);

    // Primary action — the ONE thing to do now
    getStage().append(renderTodayPrimary(due, newCount));

    // Next reading recommendation — always visible so user knows what to read next
    const nextRead = nextUntickedSection();
    if (nextRead) getStage().append(renderNextReadingCard(nextRead));

    // Compact stats strip
    const goal = p.dailyGoal || 30;
    const reviewed = p.todayGraded || 0;
    const progressPct = Math.min(100, Math.round(100 * reviewed / goal));
    getStage().append(el('div', { class: 'today-stats' },
        el('div', { class: 'today-stat' }, el('span', { class: 'num' }, String(p.streak || 0)), el('span', { class: 'lbl' }, 'streak')),
        el('div', { class: 'today-stat' }, el('span', { class: 'num' }, `${reviewed}/${goal}`), el('span', { class: 'lbl' }, 'today')),
        el('div', { class: 'today-stat' }, el('span', { class: 'num' }, String(due)), el('span', { class: 'lbl' }, 'due')),
        el('div', { class: 'today-stat' }, el('span', { class: 'num' }, String(newCount)), el('span', { class: 'lbl' }, 'new')),
    ));

    getStage().append(el('div', { class: 'today-progress' },
        el('div', { class: 'today-progress-bar' },
            el('div', { class: 'today-progress-fill', style: `width:${progressPct}%` })),
        el('div', { class: 'today-progress-label' }, `${reviewed} / ${goal} reviewed today`)
    ));

    // Subject-by-subject due breakdown (permanently visible)
    if (due > 0) {
        const dueCounts = dueCountsBySubject();
        const subjectRows = state.manifest.subjects
            .filter(m => (dueCounts[m.subject] || 0) > 0)
            .map(m => {
                const n = dueCounts[m.subject];
                return el('div', { class: 'today-subject-row' },
                    el('span', { class: 'today-subject-name' }, m.subject),
                    el('span', { class: 'today-subject-due' }, `${n} due`),
                    el('button', { class: 'chip', 'aria-label': `review ${m.subject}`,
                        on: { click: () => { state.reviewSubjectFilter = m.subject; resetReviewQueue(); go('review'); } } }, 'review')
                );
            });
        if (subjectRows.length) getStage().append(el('div', { class: 'today-subject-list' }, ...subjectRows));
    }

    // Debug panels only with ?debug param
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('debug')) {
        const states = srs.loadStates();
        const ticks = loadGuideTicks();
        const rows = buildRows(state.manifest, state.shards, states, ticks);
        const cases = totalCasesQueued();
        const mins = estReviewMinutes(due);
        getStage().append(el('p', { class: 'summary-line' },
            'today: ', el('span', { class: 'num' }, String(due)), ' due cards · ',
            el('span', { class: 'num' }, String(cases)), ' cases queued · ~',
            el('span', { class: 'num' }, String(mins)), ' min est.'));
        const flagCount = flag.count();
        const chipRow = el('div', { class: 'today-chips' },
            el('a', { class: 'chip', href: '#drill',
                on: { click: e => { e.preventDefault(); go('drill'); } } }, 'drill 10'),
            flagCount ? el('a', { class: 'chip', href: '#review',
                on: { click: e => { e.preventDefault(); state.paletteReviewSet = flag.ids(); resetReviewQueue(); go('review'); } } },
                `${flagCount} flagged`) : null,
            el('a', { class: 'chip', href: '#mistakes',
                on: { click: e => { e.preventDefault(); go('mistakes'); } } }, 'mistakes'),
            el('div', { class: 'sparkline-wrap', 'aria-label': '7-day activity' }, renderSparkline(p.history))
        );
        getStage().append(chipRow);

        const checklist = renderScheduleChecklist(rows);
        if (checklist) getStage().append(checklist);
        getStage().append(renderMasteryRing());

        // Recommended cases + 5-day recap
        const recs = [];
        for (const meta of state.manifest.subjects) {
            const sh = state.shards[meta.subject];
            if (!sh?.triage?.scenarios?.length) continue;
            const sc = sh.triage.scenarios[0];
            recs.push({ meta, sc });
            if (recs.length >= 3) break;
        }
        if (recs.length) {
            getStage().append(el('div', { class: 'panel' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'debug · recommended cases')),
                ...recs.map(({ meta, sc }) => el('div', { class: 'row' },
                    el('span', { class: 'code' }, meta.subject.slice(0, 4)),
                    el('div', {}, el('div', { class: 'title' }, sc.name)),
                    el('a', { class: 'chip', href: `./triage-live.html#${encodeURIComponent(sc.id || sc.name)}` }, 'work')
                ))));
        }
        if (p.history && p.history.length) {
            const recent = p.history.slice(-5).reverse();
            getStage().append(el('div', { class: 'panel' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'debug · last 5 days')),
                ...recent.map(d => el('div', { class: 'row' },
                    el('span', { class: 'code' }, d.date.slice(5)),
                    el('div', {}, el('div', { class: 'title' }, `${d.graded} cards · ${d.cases} cases`)),
                    el('span', { class: 'meta' }, '')
                ))));
        }
        getStage().append(el('div', { class: 'panel rail-flame' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'debug · rail legend')),
            el('div', {}, 'rails neutralized — color reserved for due/mastered/missed/weak meaning')));
    }
}

function renderSparkline(history, days = 7) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const counts = {};
    for (const h of (history || [])) counts[h.date] = h.graded || 0;
    const todayKey = localDayISO();
    const todayP = progress.load();
    counts[todayKey] = (counts[todayKey] || 0) + (todayP.todayGraded || 0);
    const cells = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86400000);
        cells.push(counts[localDayISO(d)] || 0);
    }
    const max = Math.max(1, ...cells);
    const W = 80, H = 24, gap = 2, cw = (W - gap * (days - 1)) / days;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H));
    svg.setAttribute('class', 'sparkline'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `7-day grading sparkline, max ${max}`);
    cells.forEach((c, i) => {
        const h = Math.round((c / max) * H);
        const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        r.setAttribute('x', String(i * (cw + gap))); r.setAttribute('y', String(H - h));
        r.setAttribute('width', String(cw)); r.setAttribute('height', String(Math.max(1, h)));
        r.setAttribute('fill', 'currentColor'); r.setAttribute('opacity', c === 0 ? '0.15' : '0.7');
        svg.appendChild(r);
    });
    return svg;
}

function renderMasteryRing() {
    const m = mastery.overallProgress(state.manifest, state.shards);
    const r = 48, c = 2 * Math.PI * r;
    const off = c * (1 - m.weighted / 100);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'mastery-ring'); svg.setAttribute('viewBox', '0 0 120 120');
    svg.setAttribute('width', '120'); svg.setAttribute('height', '120');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `overall mastery ${m.weighted}%`);
    const bg = document.createElementNS(svgNS, 'circle');
    bg.setAttribute('cx', '60'); bg.setAttribute('cy', '60'); bg.setAttribute('r', String(r));
    bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', 'var(--panel-3)'); bg.setAttribute('stroke-width', '10');
    svg.appendChild(bg);
    const fg = document.createElementNS(svgNS, 'circle');
    fg.setAttribute('cx', '60'); fg.setAttribute('cy', '60'); fg.setAttribute('r', String(r));
    fg.setAttribute('fill', 'none'); fg.setAttribute('stroke', 'var(--c-mastered, #6BB377)'); fg.setAttribute('stroke-width', '10');
    fg.setAttribute('stroke-dasharray', String(c)); fg.setAttribute('stroke-dashoffset', String(off));
    fg.setAttribute('stroke-linecap', 'round'); fg.setAttribute('transform', 'rotate(-90 60 60)');
    svg.appendChild(fg);
    const txt = document.createElementNS(svgNS, 'text');
    txt.setAttribute('x', '60'); txt.setAttribute('y', '66'); txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('font-size', '24'); txt.setAttribute('font-weight', '700'); txt.setAttribute('fill', 'currentColor');
    txt.textContent = `${m.weighted}%`;
    svg.appendChild(txt);
    const wrap = el('div', { class: 'panel mastery-ring-panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'overall mastery')),
        el('div', { class: 'mastery-ring-row' }, svg,
            el('div', { class: 'mastery-quad' },
                el('div', { class: 'quad-row' }, el('span', {}, 'cards'), el('span', { class: 'mono' }, `${m.cards.pct}% (${m.cards.mastered}/${m.cards.total}, ${m.cards.due} due)`)),
                el('div', { class: 'quad-row' }, el('span', {}, 'sections'), el('span', { class: 'mono' }, `${m.sections.pct}% (${m.sections.ticked}/${m.sections.total})`)),
                el('div', { class: 'quad-row' }, el('span', {}, 'cases'), el('span', { class: 'mono' }, `${m.cases.pct}% (${m.cases.passed}/${m.cases.total})`)),
                el('div', { class: 'quad-row' }, el('span', {}, 'mistakes'), el('span', { class: 'mono' }, `${m.mistakes.pct}% (${m.mistakes.cleared}/${m.mistakes.total})`))
            ))
    );
    return wrap;
}

// Today's plan: schedule-driven checklist. Schedule is recommendation, not gate.
// Reconciles actuals (newcards.bumps + grade history + section ticks + cases) and
// surfaces rollover/surplus as informational text.
function renderScheduleChecklist(rows) {
    if (!state.manifest) return null;
    const today = schedule.isoDate(new Date());
    const dueCounts = dueCountsBySubject();
    // Build extras for plannedSections / plannedCases
    const ticksAll = loadGuideTicks();
    const casesDone = casesDoneBySubject();
    // Regenerate plan with current eligibility-gated due counts and tick state.
    // Eligibility changes (ticking sections, introducing cards) shift what should be planned.
    const dueCountsForPlan = {};
    const states0 = srs.loadStates();
    for (const meta of state.manifest.subjects) {
        const sh = state.shards[meta.subject];
        dueCountsForPlan[meta.subject] = sh ? srs.getDueCards(sh.cards.map(c => c.id), states0).length : 0;
    }
    const shardsForExtras = state.shards;
    schedule.regenerate({ today, dueCounts: dueCountsForPlan, extras: { ticksAll, shards: shardsForExtras, casesDone } });
    const sched = schedule.loadSchedule();
    // Build actuals from tracked data
    const p = progress.load();
    const states = srs.loadStates();
    const actualBySubject = {};
    for (const meta of state.manifest.subjects) {
        const subj = meta.subject;
        const gradedSubject = p.gradedBySubject?.[subj] || 0;
        actualBySubject[subj] = {
            review: gradedSubject, new: newcards.countToday(subj),
            sectionsRead: new Set(Object.keys(ticksAll[subj] || {}).filter(k => ticksAll[subj][k])),
            casesDone: new Set()
        };
    }
    const schedReconciled = schedule.reconcile({ today, actualBySubject });
    const blocks = schedReconciled.blocks.filter(b => b.date === today && b.kind === 'study');
    if (!blocks.length) return null;
    const panel = el('div', { class: 'panel schedule-checklist' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, "today's plan"),
            el('a', { class: 'chip', href: '#calendar', on: { click: e => { e.preventDefault(); go('calendar'); } } }, el('span', { class: 'icon-label' }, el('span', {}, 'calendar'), icon('arrowRight'))))
    );
    let totalShortReview = 0, totalShortNew = 0, totalSurplus = 0;
    for (const b of blocks) {
        if (b.rollover) { totalShortReview += b.rollover.review || 0; totalShortNew += b.rollover.new || 0; }
        if (b.over) totalSurplus += b.surplus || 0;
        const items = [];
        const subjTicks = ticksAll[b.subject] || {};
        const subjHasTicks = Object.values(subjTicks).some(v => v === true);
        if (b.plannedReview > 0 && subjHasTicks) items.push({
            kind: 'review', done: b.completedReview >= b.plannedReview,
            label: `review ${b.plannedReview} ${b.subject} card${b.plannedReview === 1 ? '' : 's'} (${b.completedReview}/${b.plannedReview})`,
            click: () => { state.reviewSubjectFilter = b.subject; state.cramMode = false; state.learnMode = false; resetReviewQueue(); go('review', b.subject); }
        });
        if (b.plannedNew > 0 && subjHasTicks) items.push({
            kind: 'new', done: b.completedNew >= b.plannedNew,
            label: `introduce ${b.plannedNew} new ${b.subject} card${b.plannedNew === 1 ? '' : 's'} (${b.completedNew}/${b.plannedNew})`,
            click: () => { state.reviewSubjectFilter = b.subject; state.cramMode = false; state.learnMode = true; resetReviewQueue(); go('review', b.subject); }
        });
        for (const line of (b.plannedSections || [])) {
            const sh = state.shards[b.subject];
            const sec = sh?.guide?.sections?.find(s => String(s.line) === String(line));
            const sTitle = sec?.title || `section ${line}`;
            items.push({
                kind: 'read', done: b.completedSections.includes(line),
                label: `read ${b.subject} · ${sTitle}`,
                click: () => {
                    go('subject', b.subject);
                    setTimeout(() => {
                        const e = document.getElementById(`g-section-${line}`);
                        if (e) e.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 120);
                }
            });
        }
        for (const cid of (b.plannedCases || [])) {
            const sh = state.shards[b.subject];
            const sc = sh?.triage?.scenarios?.find(x => (x.id || x.name) === cid);
            const cTitle = sc?.name || cid;
            items.push({
                kind: 'case', done: b.completedCases.includes(cid),
                label: `work case · ${cTitle}`,
                href: `./triage-live.html#${encodeURIComponent(cid)}`
            });
        }
        for (const it of items) {
            const row = el('div', { class: `checklist-row${it.done ? ' done' : ''} kind-${it.kind}` },
                el('span', { class: 'check', html: it.done ? ICON.check : ICON.circle }),
                it.href
                    ? el('a', { href: it.href, class: 'cl-label' }, it.label)
                    : el('a', { href: '#', class: 'cl-label', on: { click: e => { e.preventDefault(); it.click && it.click(); } } }, it.label)
            );
            panel.append(row);
        }
    }
    if (totalShortReview || totalShortNew) {
        panel.append(el('div', { class: 'rollover-note' },
            `Rolled over from earlier: ${totalShortReview} review${totalShortReview === 1 ? '' : 's'}` +
            (totalShortNew ? ` · ${totalShortNew} new card${totalShortNew === 1 ? '' : 's'}` : '')));
    } else if (totalSurplus > 0) {
        panel.append(el('div', { class: 'surplus-note' }, `Ahead by ${totalSurplus} — credited to tomorrow`));
    }
    return panel;
}
