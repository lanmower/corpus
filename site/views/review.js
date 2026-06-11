// views/review.js — the review/learn/cram route and its grading controller. Owns
// the review queue lifecycle (resetReviewQueue), the card renderer (renderReview),
// grading (gradeReview), undo (undoLastGrade), skip (skipReview), and suspend.
// The most state-coupled view: it reads/writes the review-* fields of the shared
// state from app-context and drives navigation through the router. External
// consumers (today/subject/mistakes/drill/keyboard) import its few public verbs.
import { getStage, el, iconLabel, state, loadShard, loadGuideTicks, exportSessionCards, DEBUG, slugify, totalNewEligibleAll, warn } from '../app-context.js';
import { go } from '../router.js';
import * as srs from '../srs.js';
import * as usercards from '../usercards.js';
import * as newcards from '../newcards.js';
import * as progress from '../progress.js';
import * as flag from '../flag.js';
import * as mistakes from '../mistakes.js';
import * as undo from '../undo.js';
import { renderMarkdown } from '../markdown.js';
import { ICON } from '../icons.js';
import { sendTutorMessage } from '../tutor-panel.js';
import { loadConfig as loadTutorConfig } from '../tutor-store.js';

export const FRIENDLY_GRADES = [
    { friendly: 1, smscore: 0, label: 'again', desc: "didn't know" },
    { friendly: 2, smscore: 3, label: 'hard', desc: 'slow recall' },
    { friendly: 3, smscore: 4, label: 'good', desc: 'recalled' },
    { friendly: 4, smscore: 5, label: 'easy', desc: 'instant' }
];

export async function renderReview() {
    getStage().innerHTML = '';
    const placeholderContainer = el('div', { class: 'panel is-loading' });
    const placeholder = el('div', { class: 'skeleton', style: 'width:60%;height:14px' });
    placeholderContainer.append(placeholder);
    placeholderContainer.append(el('div', { class: 'loading-text' },
        el('div', { class: 'loading-spinner' }), el('span', {}, 'loading cards...')));
    getStage().append(placeholderContainer);
    const subjects = state.reviewSubjectFilter === 'all' ? state.manifest.subjects.map(s => s.subject) : [state.reviewSubjectFilter];
    await Promise.all(subjects.map(s => loadShard(s)));
    placeholderContainer.remove();

    const allCards = [];
    for (const s of subjects) {
        const sh = state.shards[s]; if (!sh) continue;
        for (const c of sh.cards) allCards.push({ ...c, _subject: s });
    }
    // merge personal user cards (when filter is all or matches)
    for (const uc of usercards.load()) {
        if (state.reviewSubjectFilter === 'all' || state.reviewSubjectFilter === uc._subject) allCards.push(uc);
    }
    const cardIds = allCards.map(c => c.id);
    state.reviewAllCardIds = cardIds;

    if (!state.reviewQueueIds || state.reviewQueueIds.length === 0) {
        const states = srs.loadStates();
        let pool = cardIds;
        if (state.paletteReviewSet && state.paletteReviewSet.length) pool = pool.filter(id => state.paletteReviewSet.includes(id));
        if (state.reviewTagFilter.size > 0) {
            const cardById = Object.fromEntries(allCards.map(c => [c.id, c]));
            pool = pool.filter(id => {
                const tags = cardById[id]?.tags || [];
                for (const t of tags) if (state.reviewTagFilter.has(t)) return true;
                return false;
            });
        }
        // Section filter - show only cards from a specific section
        if (state.sectionFilter) {
            pool = pool.filter(id => {
                const card = allCards.find(c => c.id === id);
                return card && String(card.requires?.sectionLine) === String(state.sectionFilter);
            });
        }
        const cardById = Object.fromEntries(allCards.map(c => [c.id, c]));
        const ticksAll = loadGuideTicks();
        let dueIds;
        if (state.learnMode) {
            const pickable = pool.map(id => cardById[id]).filter(Boolean);
            const newElig = srs.getNewEligibleCards(pickable, states, ticksAll);
            const remainingBySubj = {};
            const learnLimit = 5;
            const picked = [];
            for (const c of newElig) {
                if (picked.length >= learnLimit) break;
                const subj = c._subject;
                if ((remainingBySubj[subj] ?? newcards.remaining(subj)) <= 0) continue;
                picked.push(c.id);
                remainingBySubj[subj] = (remainingBySubj[subj] ?? newcards.remaining(subj)) - 1;
            }
            dueIds = picked;
        } else if (state.cramMode) {
            dueIds = pool;
        } else {
            dueIds = srs.getDueCards(pool, states);
        }
        const sorted = dueIds.map(id => ({ id, dueAt: states[id]?.dueAt ?? 0, subject: cardById[id]._subject })).sort((a, b) => a.dueAt - b.dueAt);
        const bySubj = {};
        for (const x of sorted) (bySubj[x.subject] ||= []).push(x.id);
        const interleaved = []; let any = true;
        while (any) { any = false; for (const k of Object.keys(bySubj)) { if (bySubj[k].length) { interleaved.push(bySubj[k].shift()); any = true; } } }
        // Apply session cap (again-pile is exempt — added later)
        const p0 = progress.load();
        const totalDue = interleaved.length;
        if (!state.cramMode && state.reviewSessionCap === null) {
            state.reviewSessionCap = Math.min(totalDue, p0.dailyGoal || 30, 50);
        }
        const cap = (state.cramMode || state.learnMode) ? null : state.reviewSessionCap;
        state.reviewQueueIds = cap != null ? interleaved.slice(0, cap) : interleaved;
        state._reviewBacklog = cap != null ? Math.max(0, totalDue - state.reviewQueueIds.length) : 0;
        state.reviewIndex = 0; state.reviewAgainPile = [];
        state.reviewSessionStarted = state.reviewQueueIds.length;
        state.sessionFinished = false;
    }
    state.reviewQueue = state.reviewQueueIds.map(id => allCards.find(c => c.id === id)).filter(Boolean);
    if (state.reviewIndex >= state.reviewQueue.length) state.reviewIndex = 0;

    const p = progress.load();
    const total = state.reviewQueue.length;
    const goal = p.dailyGoal || 30;
    const sessionTotal = state.reviewSessionStarted || total;
    const idxOneBased = Math.min(state.reviewSessionGraded + 1, sessionTotal);
    const toGoal = Math.max(0, goal - p.todayGraded);

    getStage().append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, state.learnMode ? 'learn' : 'review'),
        el('h2', {}, state.cramMode ? 'cram' : (state.learnMode ? 'learn new' : 'review'))));

    // tiny progress line — REQUIRED feature 3
    getStage().append(el('div', { class: 'review-progress' },
        el('span', { class: 'num' }, `${idxOneBased} of ${total || sessionTotal}`),
        ' · ',
        el('span', { class: 'goal' }, `${toGoal} to daily goal`)
    ));

    const chips = el('div', { class: 'filter-chips', role: 'group', 'aria-label': 'subject filter' },
        el('button', { class: 'chip' + (state.reviewSubjectFilter === 'all' ? ' active' : ''),
            on: { click: () => { state.reviewSubjectFilter = 'all'; clearStickyFilters(); resetReviewQueue(); renderReview(); } } }, 'all'),
        ...state.manifest.subjects.map(s => el('button', { class: 'chip' + (state.reviewSubjectFilter === s.subject ? ' active' : ''),
            on: { click: () => { state.reviewSubjectFilter = s.subject; clearStickyFilters(); resetReviewQueue(); renderReview(); } } }, s.subject))
    );
    const cramBtn = el('button', { class: 'chip' + (state.cramMode ? ' active' : ''),
        'aria-label': 'toggle cram mode', 'aria-pressed': String(!!state.cramMode),
        on: { click: () => { state.cramMode = !state.cramMode; renderReview(); } } },
        state.cramMode ? 'cram on' : 'cram off');
    const allTags = collectReviewTags(allCards);
    const tagChips = allTags.length ? el('div', { class: 'filter-chips tag-chips', role: 'group', 'aria-label': 'tag filter' },
        ...allTags.slice(0, 12).map(t => el('button', {
            class: 'chip' + (state.reviewTagFilter.has(t) ? ' active' : ''),
            'aria-pressed': String(state.reviewTagFilter.has(t)),
            on: { click: () => { if (state.reviewTagFilter.has(t)) state.reviewTagFilter.delete(t); else state.reviewTagFilter.add(t); clearStickyFilters(); resetReviewQueue(); renderReview(); } } }, '#' + t))
    ) : null;
    // Session-size picker (shown when due >= 10, not in cram mode)
    const totalDueForPicker = (state.reviewSessionStarted || 0) + (state._reviewBacklog || 0);
    if (!state.cramMode && totalDueForPicker >= 10 && state.reviewSessionGraded === 0) {
        const caps = [10, 20, 50, null];
        const capLabels = { 10: '10', 20: '20', 50: '50', null: 'all' };
        const pickerChips = caps.map(c => el('button', {
            class: 'chip' + (state.reviewSessionCap === c ? ' active' : ''),
            'aria-label': `session size ${c ?? 'all'}`,
            on: { click: () => { state.reviewSessionCap = c; resetReviewQueue(); renderReview(); } }
        }, capLabels[c]));
        getStage().append(el('div', { class: 'session-picker' },
            el('span', { class: 'session-picker-label' }, 'session:'),
            ...pickerChips
        ));
    }

    getStage().append(el('div', { class: 'toolbar' }, chips, cramBtn), tagChips);

    if (state.reviewQueue.length === 0) {
        if (state.reviewAgainPile.length > 0) {
            state.reviewQueueIds = state.reviewAgainPile;
            state.reviewAgainPile = []; state.reviewIndex = 0;
            renderReview(); return;
        }
        const reviewed = state.reviewSessionGraded;
        if (reviewed > 0 && !state.sessionFinished) {
            state.sessionFinished = true;
            const backlog = state._reviewBacklog || 0;
            const wasLearn = state.learnMode;
            // Smart recommendation: check if reviewing a specific subject or filter
            const subj = state.reviewSubjectFilter !== 'all' ? state.reviewSubjectFilter : null;
            const untickedCount = subj
                ? (() => {
                    const ticks = loadGuideTicks()[subj] || {};
                    const shard = state.shards[subj];
                    const totalSections = (shard?.guide?.sections || []).filter(s => s.level === 2 || s.level === 3).length;
                    const tickedCount = Object.keys(ticks).length;
                    return Math.max(0, totalSections - tickedCount);
                })()
                : null;
            getStage().append(el('div', { class: 'panel' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, wasLearn ? 'learning done' : 'session done')),
                el('p', {}, wasLearn
                    ? `${reviewed} new card${reviewed === 1 ? '' : 's'} introduced · they'll come back for review tomorrow.`
                    : `${reviewed} card${reviewed === 1 ? '' : 's'} reviewed · streak ${p.streak}.`),
                backlog > 0 ? el('p', { class: 'meta' }, `${backlog} more in backlog`) : null,
                el('div', { class: 'toolbar' },
                    el('a', { class: 'chip primary-action', href: '#review', on: { click: e => { e.preventDefault(); state.reviewSessionGraded = 0; state.reviewSessionCards = []; state.sessionFinished = false; state.reviewSessionCap = null; renderReview(); } } }, wasLearn ? 'learn more' : 'review more'),
                    el('button', { class: 'chip', on: { click: e => { e.preventDefault(); exportSessionCards(state.reviewSessionCards.slice()); } } }, 'export cards'),
                    untickedCount > 0 ? el('a', { class: 'chip', href: `#subject/${subj}`, on: { click: e => { e.preventDefault(); go('subject', subj); } } }, `read ${subj} guide`) : null,
                    el('a', { class: 'chip', href: '#today', on: { click: e => { e.preventDefault(); state.learnMode = false; go('today'); } } }, 'back to today')
                )));
        } else {
            const onlyNew = !state.cramMode && !state.learnMode && totalNewEligibleAll().total > 0;
            const untickedCount = state.manifest.subjects.reduce((sum, s) => {
                const ticks = loadGuideTicks()[s.subject] || {};
                const shard = state.shards[s.subject];
                const totalSections = (shard?.guide?.sections || []).filter(s => s.level === 2 || s.level === 3).length;
                const tickedCount = Object.keys(ticks).length;
                return sum + Math.max(0, totalSections - tickedCount);
            }, 0);
            getStage().append(el('div', { class: 'panel' },
                el('div', { class: 'panel-head' }, el('span', { class: 'title' }, state.learnMode ? 'no new cards eligible' : 'all caught up')),
                el('div', {}, state.learnMode
                    ? 'tick more guide sections to introduce more cards.'
                    : (onlyNew ? 'no cards due — try learning new ones.' : (untickedCount > 0 ? `read a guide section to unlock more cards. ${untickedCount} section${untickedCount === 1 ? '' : 's'} available.` : 'all material covered.'))),
                el('div', { class: 'toolbar' },
                    onlyNew ? el('a', { class: 'chip', href: '#review',
                        on: { click: e => { e.preventDefault(); state.learnMode = true; resetReviewQueue(); renderReview(); } } }, 'learn new') : null,
                    untickedCount > 0 ? el('a', { class: 'chip primary-action', href: '#guides',
                        on: { click: e => { e.preventDefault(); go('guides'); } } }, 'read guide') : null,
                    el('a', { class: 'chip', href: '#today', on: { click: e => { e.preventDefault(); go('today'); } } }, 'back to today')
                )));
        }
        return;
    }

const card = state.reviewQueue[state.reviewIndex];
    const cardState = srs.getCardState(card.id);
    const seen = (cardState.history || []).length;
    const friendlyMeta = seen === 0 ? 'new' : (seen < 3 ? `seen ${seen}x` : 'familiar');
 const isFlag = flag.isFlagged(card.id);
 
     // Section reference link for bidirectional navigation
    const sectionRef = (() => {
        if (!card.requires?.sectionLine) return null;
        const shard = state.shards[card._subject];
        const sec = shard?.guide?.sections?.find(s => String(s.line) === String(card.requires.sectionLine));
        const sectionTitle = sec?.title || 'guide section';
        return el('a', {
            class: 'section-link',
            href: `#subject/${card._subject}`,
            'data-section': card.requires.sectionLine,
            title: `View: ${sectionTitle}`,
            on: { click: e => {
                e.preventDefault();
                state.reviewSubjectFilter = card._subject;
                state.sectionFilter = null;
                resetReviewQueue();
                go('subject', card._subject);
                setTimeout(() => {
                    const shard = state.shards[card._subject];
                    if (!shard) return;
                    const sec = shard.guide?.sections?.find(s => String(s.line) === String(card.requires.sectionLine));
                    if (sec) {
                        const anchorId = `g-${slugify(sec.title)}-${sec.line}`;
                        const el = document.getElementById(anchorId);
                        if (el) {
                            const panel = el.closest('.chunk-panel');
                            if (panel && panel.classList.contains('chunk-collapsed')) {
                                panel.classList.remove('chunk-collapsed');
                            }
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                }, 150);
            }}
        }, iconLabel('arrowLeft', sectionTitle));
    })();
    
    // Subject-level back link - always show for easy navigation
    const backToSubjectLink = state.reviewSubjectFilter !== 'all' 
        ? el('a', {
            class: 'section-link',
            href: `#subject/${state.reviewSubjectFilter}`,
            on: { click: e => {
                e.preventDefault();
                resetReviewQueue();
                go('subject', state.reviewSubjectFilter);
            }}
        }, iconLabel('arrowLeft', state.reviewSubjectFilter))
        : el('a', { class: 'section-link', href: '#guides',
            on: { click: e => { e.preventDefault(); resetReviewQueue(); go('guides'); } } }, iconLabel('arrowLeft', 'subjects'));
    
    // Link to review all cards for this subject
    const allCardsLink = el('a', {
        class: 'section-link',
        href: `#review/${card._subject}`,
        on: { click: e => {
            e.preventDefault();
            state.reviewSubjectFilter = card._subject;
            state.sectionFilter = null;
            resetReviewQueue();
            go('review', card._subject);
        }}
    }, 'review subject');
     
 const reviewCard = el('div', {
        class: 'flashcard' + (state.reviewRevealed ? ' flipped' : '') + (isFlag ? ' flagged' : ''), id: 'review-card'
    },
        el('div', { class: 'review-nav' },
            el('div', { class: 'review-nav-left' }, backToSubjectLink),
            el('div', { class: 'review-nav-right' }, sectionRef || allCardsLink)
        ),
        el('div', { class: 'meta-line' },
            el('span', {}, `${card._subject} · ${state.reviewIndex + 1}/${total}` + (card._personal ? ' (personal)' : '') + (isFlag ? ' · flagged' : '')),
            el('span', {}, friendlyMeta),
            sectionRef ? el('span', { class: 'section-ref' }, `section ${card.requires?.sectionLine || '—'}`) : null,
            DEBUG ? el('span', {}, `EF ${cardState.easeFactor.toFixed(2)} · ${cardState.phase} · ${cardState.interval}d`) : null
        ),
        el('div', { class: 'front' }, card.front),
        el('div', { class: 'back markdown', html: renderMarkdown(card.back || '') }),
        DEBUG ? el('div', { class: 'card-source' }, `source: ${card.source || card.sourceFile || ''}`) : null,
        card.tags && card.tags.length ? el('div', { class: 'tags' }, ...card.tags.slice(0, 6).map(t => el('span', { class: 'tag' }, t))) : null
    );
    getStage().append(reviewCard);

    // Inline tutor coaching slot — the tutor LLM can render brief hints here mid-review
    // (rendered by tutor-panel.js when it receives coaching-done with target=inline).
    getStage().append(el('div', { id: 'tutor-card-coaching', class: 'tutor-inline-coach', 'aria-live': 'polite' }));

    // Right-click on the card -> context menu with quick actions
    reviewCard.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        import('../context-menu.js').then(({ showContextMenu }) => {
            const items = [
                { icon: isFlag ? ICON.flag : ICON.flagOutline, label: isFlag ? 'unflag card' : 'flag card', shortcut: 'f',
                  action: () => { flag.toggle(card.id); renderReview(); } },
                { icon: ICON.skip, label: 'skip card', shortcut: 's', action: () => skipReview() },
                { type: 'divider' },
                { icon: ICON.help, label: 'ask tutor about this', action: () => {
                    // Route through sendTutorMessage so the panel records the user
                    // turn too — posting straight to the worker recorded only the
                    // assistant reply and diverged worker/panel history (single
                    // source of truth = the panel's thread).
                    sendTutorMessage(`explain the concept behind this card: "${card.front}" — answer is: ${card.back}`);
                } },
                { icon: ICON.book, label: 'open subject guide', action: () => { location.hash = `#guides/${card._subject}`; } }
            ];
            showContextMenu(e.clientX, e.clientY, items);
        }).catch(() => {});
    });


    const actions = el('div', { class: 'toolbar review-actions', id: 'review-actions' });
    if (!state.reviewRevealed) {
        actions.append(el('button', { class: 'chip active', id: 'review-reveal',
            'aria-label': 'reveal answer', on: { click: () => { state.reviewRevealed = true; renderReview(); } } }, 'reveal (space)'));
    } else {
        const grades = DEBUG
            ? [0, 1, 2, 3, 4, 5].map(s => ({ key: String(s), score: s, label: ['again', 'wrong', 'hard wrong', 'hard right', 'good', 'perfect'][s] }))
            : FRIENDLY_GRADES.map(g => ({ key: String(g.friendly), score: g.smscore, label: g.label }));
        const previewInterval = (score) => {
            if (state.cramMode) return '';
            const next = srs.schedule(cardState, score);
            if (next.phase === 'learning') {
                const minLeft = Math.round((next.dueAt - Date.now()) / 60000);
                return minLeft < 60 ? `${minLeft}m` : `${Math.round(minLeft / 60)}h`;
            }
            const d = next.interval || 0;
            return d < 1 ? '<1d' : `${d}d`;
        };
        for (const g of grades) {
            const preview = previewInterval(g.score);
            const btnLabel = preview ? `${g.key} ${g.label} · ${preview}` : `${g.key} ${g.label}`;
            actions.append(el('button', { class: 'chip grade-btn', data: { score: String(g.score) }, id: `grade-${g.score}`,
                'aria-label': `grade ${g.label}${preview ? ', next in ' + preview : ''}`,
                on: { click: () => gradeReview(card.id, g.score) } }, btnLabel));
        }
        actions.append(el('button', { class: 'chip', id: 'review-skip', 'aria-label': 'skip',
            on: { click: () => skipReview() } }, 'skip (s)'));
        actions.append(el('button', { class: 'chip', id: 'review-suspend', 'aria-label': 'suspend card',
            on: { click: () => { if (confirm('suspend this card?')) suspendCurrentReview(); } } }, 'suspend'));
    }
    getStage().append(actions);
    const hint = DEBUG
        ? 'space=reveal · 0-5=grade · s=skip · 0 sends to revisit'
        : 'space=reveal · 1=again · 2=hard · 3=good · 4=easy · s=skip';
    getStage().append(el('div', { class: 'kbd-hint' }, hint));

    state.lastReviewDueCount = state.reviewQueue.length;
}

export function resetReviewQueue() {
    state.reviewQueueIds = []; state.reviewIndex = 0;
    state.reviewRevealed = false; state.reviewAgainPile = [];
    state.reviewSessionGraded = 0; state.sessionFinished = false;
    state.reviewSessionCap = null; state._reviewBacklog = 0;
    state.reviewSessionCards = [];
}

// Drop the sticky narrowing filters (flagged/mistake/drill set + section).
// resetReviewQueue() must NOT do this — several entry points set these filters
// immediately before calling it. Only the "broaden the queue" controls (subject
// + tag chips) clear them, so the user has an in-toolbar escape from a narrowed
// session back to the full due pool instead of a silently-empty queue.
function clearStickyFilters() {
    state.paletteReviewSet = null;
    state.sectionFilter = null;
}

function exitLearnMode() {
    state.learnMode = false;
    resetReviewQueue();
}

export function skipReview() {
    if (!state.reviewQueue.length) return;
    state.reviewIndex = (state.reviewIndex + 1) % state.reviewQueue.length;
    state.reviewRevealed = false; renderReview();
}

export function gradeReview(cardId, score) {
    const prev = srs.getCardState(cardId);
    const wasNew = srs.isNewCardForGate(prev);
    const card0 = state.reviewQueue?.[state.reviewIndex];
    if (!state.cramMode) srs.updateCard(cardId, score, state.reviewAllCardIds || []);
    if (!state.cramMode && wasNew && card0?._subject) newcards.bump(card0._subject, 1);
    state.reviewSessionGraded++;
    // Retain the graded card so the session-done "export cards" button has a real
    // queue: state.reviewQueue is empty by the time the done screen renders (each
    // graded id is spliced out of reviewQueueIds), so filtering it always yielded [].
    if (card0) state.reviewSessionCards.push(card0);
    if (!state.cramMode) progress.bumpGradedSubject(card0?._subject || null, 1);
    if (score === 0) state.reviewAgainPile.push(cardId);
    // Mistake log
    const card = state.reviewQueue?.[state.reviewIndex];
    if (score <= 2 && card) mistakes.logMistake(cardId, card._subject, score);
    // Undo record
    undo.record(cardId, prev);
    showUndoToast();

    // Send to tutor for coaching (non-blocking). Gated by config; uses the
    // worker's actual handler cmd ('generate-coaching', tutor.js:196).
    if (state.tutorWorker && card0 && loadTutorConfig().autoCoachOnReview) {
        try {
            state.tutorWorker.postMessage({
                cmd: 'generate-coaching',
                front: card0.front,
                back: card0.back,
                subject: card0._subject,
                grade: score
            });
        } catch (err) {
            // Non-blocking: tutor errors don't crash review flow
            warn('tutor coaching failed', err.message);
        }
    }

    state.reviewQueueIds.splice(state.reviewIndex, 1);
    if (state.reviewIndex >= state.reviewQueueIds.length) state.reviewIndex = 0;
    state.reviewRevealed = false;
    renderReview();
}

function showUndoToast() {
    const old = document.getElementById('undo-toast'); if (old) old.remove();
    const t = el('div', { id: 'undo-toast', class: 'undo-toast', role: 'status' },
        el('span', {}, 'graded · '),
        el('button', { class: 'chip', 'aria-label': 'undo grade',
            on: { click: () => undoLastGrade() } }, 'undo (u)'));
    document.body.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 5000);
}
export function undoLastGrade() {
    const r = undo.consume(); if (!r) return;
    const states = srs.loadStates();
    states[r.cardId] = r.prevState;
    srs.saveStates(states);
    const t = document.getElementById('undo-toast'); if (t) t.remove();
    if (state.route === 'review') renderReview();
}

function suspendCurrentReview() {
    const card = state.reviewQueue?.[state.reviewIndex];
    if (!card) return;
    srs.suspendCard(card.id, true);
    state.reviewQueueIds.splice(state.reviewIndex, 1);
    if (state.reviewIndex >= state.reviewQueueIds.length) state.reviewIndex = 0;
    state.reviewRevealed = false;
    renderReview();
}

function collectReviewTags(allCards) {
    const counts = {};
    for (const c of allCards) for (const t of (c.tags || [])) counts[t] = (counts[t] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(x => x[0]);
}



function showStorageFullBanner() {
    if (document.getElementById('storage-full-banner')) return;
    const b = el('div', { id: 'storage-full-banner', class: 'storage-full-banner', role: 'alert' },
        el('span', {}, 'browser storage full. export, then reset to free space.'),
        el('button', { class: 'chip', on: { click: () => go('settings') } }, 'settings'),
        el('button', { class: 'chip', 'aria-label': 'dismiss', on: { click: () => b.remove() } }, 'dismiss'));
    document.body.appendChild(b);
}
