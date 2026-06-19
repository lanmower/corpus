// views/subject.js — the subject deep-dive route: mastery hero, primary review/learn
// CTA, next-section card, the chunked study guide with its TOC + filter, video/audio/
// infographics panels (with lightbox), flashcards summary, and cases. The guide reader.
import { getStage, el, icon, iconLabel, state, loadShard, loadGuideTicks, saveGuideTicks, masteryFor, dueCountFor, sectionCardCounts, slugify } from '../app-context.js';
import { go } from '../router.js';
import { resetReviewQueue } from './review.js';
import { renderCramBanner } from '../cram-banner.js';
import * as srs from '../srs.js';
import * as mastery from '../mastery.js';
import * as lastpos from '../lastpos.js';
import { buildRows, computeWeakest } from '../verdicts.js';
import { ICON } from '../icons.js';


export async function renderSubject() {
    const subj = state.currentSubject;
    if (!subj) { go('guides'); return; }
    const meta = state.manifest.subjects.find(x => x.subject === subj);

    // Cram banner on subject view
    const states = srs.loadStates();
    const ticksAll = loadGuideTicks();
    const rows = buildRows(state.manifest, state.shards, states, ticksAll);
    const weakest = computeWeakest(rows);
    const cramEl = renderCramBanner(weakest);
    if (cramEl) getStage().append(cramEl);

    getStage().append(el('div', { class: 'section-head' },
        el('span', { class: 'eyebrow' }, 'subject'), el('h2', {}, subj)));
    const subjMastery = masteryFor(subj);
    const subjDue = dueCountFor(subj);
    const subShard0 = state.shards[subj];
    const subTicks = loadGuideTicks()[subj] || {};
    const newEligibleSubj = subShard0
        ? srs.getNewEligibleCards(subShard0.cards.map(c => ({ ...c, _subject: subj })), states, { [subj]: subTicks }).length
        : 0;
    let primaryCta;
    if (subjDue > 0) {
        primaryCta = el('a', { class: 'primary-action', href: `#review/${subj}`,
            on: { click: e => { e.preventDefault(); state.reviewSubjectFilter = subj; state.cramMode = false; state.learnMode = false; resetReviewQueue(); go('review', subj); } } },
            `review ${subjDue} card${subjDue === 1 ? '' : 's'}`);
    } else if (newEligibleSubj > 0) {
        primaryCta = el('a', { class: 'primary-action', href: `#review/${subj}`,
            on: { click: e => { e.preventDefault(); state.reviewSubjectFilter = subj; state.cramMode = false; state.learnMode = true; resetReviewQueue(); go('review', subj); } } },
            `learn ${Math.min(5, newEligibleSubj)} new card${newEligibleSubj === 1 ? '' : 's'}`);
    } else {
        primaryCta = el('div', { class: 'primary-action muted' }, 'all caught up here');
    }
    getStage().append(el('div', { class: 'subject-hero' },
        el('div', { class: 'subject-hero-ring', 'aria-label': `${subjMastery}% mastered` },
            el('div', { class: 'mini-ring', style: `--p:${subjMastery}` }, `${subjMastery}%`)),
        el('div', { class: 'subject-hero-cta' },
            primaryCta,
            el('a', { class: 'cta', href: `./triage-live.html?subject=${encodeURIComponent(subj)}` }, 'open in tutor'))
    ));
    // Next thing — promoted to a clickable scroll-to-section card
    const nextSec = subShard0?.guide?.sections?.find(s => !subTicks[String(s.line)]);
    if (nextSec) getStage().append(el('div', { class: 'next-thing-card', role: 'button', tabindex: '0',
        on: {
            click: () => { const e = document.getElementById(`g-section-${nextSec.line}`); if (e) e.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
            keydown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); const e = document.getElementById(`g-section-${nextSec.line}`); if (e) e.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
        }
    },
        el('span', { class: 'eyebrow' }, 'next section'),
        el('div', { class: 'nt-title' }, nextSec.title),
        el('span', { class: 'nt-cta' }, iconLabel('arrowRight', 'read'))));
    const placeholder = el('div', { class: 'panel' },
        el('div', { class: 'skeleton', style: 'width:60%;height:14px' }),
        el('div', { class: 'skeleton', style: 'width:90%' }),
        el('div', { class: 'skeleton', style: 'width:80%' }));
    getStage().append(placeholder);
    const shard = await loadShard(subj);
    placeholder.remove();

    // Send guide shard to tutor worker for Q&A indexing (idempotent — skip if already posted)
    if (state.tutorWorker && shard.guide && !state.tutorIndexedSubjects.has(subj)) {
        state.tutorIndexedSubjects.add(subj);
        state.tutorWorker.postMessage({ cmd: 'load-guide-shard', shard: { subject: subj, guide: shard.guide } });
    }

    const due = srs.getDueCards(shard.cards.map(c => c.id), states).length;
    const ticks = loadGuideTicks()[subj] || {};
    const masteryData = mastery.subjectProgress(state.manifest, state.shards, subj);
    const m = masteryData.weighted;

    const left = el('aside', { class: 'deepdive-side' },
        el('div', { class: 'panel' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'subject'), `${m}% mastered`),
            el('div', { class: 'progress-bar' }, el('div', { class: 'progress-fill' + (m < 25 ? ' weak' : ''), style: `width:${m}%` })),
            el('div', { class: 'mastery-breakdown', style: 'margin-top:8px;font-family:var(--ff-mono);font-size:11px;color:var(--panel-text-2)' },
                `cards ${masteryData.cards.na ? '—' : masteryData.cards.pct + '%'} (${masteryData.cards.mastered}/${masteryData.cards.introduced} introduced) · sections ${masteryData.sections.pct}% · cases ${masteryData.cases.total ? masteryData.cases.pct + '%' : 'N/A'}`),
            el('div', { style: 'font-family:var(--ff-mono);font-size:11px;color:var(--panel-text-2)' }, `${shard.cards.length} cards · ${due} due`),
            el('div', { class: 'kbd-hint', style: 'margin-top:8px' }, 'press r for just-read')
        ),
        buildGuideToc(subj, shard, ticks)
    );

    const guideBodyPanel = shard.guide?.body ? el('div', { class: 'panel guide-body-panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'guide'), `${shard.guide.sections.length} sections`),
        buildChunkedGuide(subj, shard, ticks)
    ) : null;
    const cardCounts = sectionCardCounts(subj);
    const sectionsWithCards = [];
    for (const [lineStr, count] of cardCounts) {
        const sec = shard.guide?.sections?.find(s => String(s.line) === String(lineStr));
        if (sec) sectionsWithCards.push({ line: parseInt(lineStr), title: sec.title, count });
    }
    const cardsDetails = el('div', { class: 'panel cards-panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'flashcards')),
        el('div', { class: 'cards-cta-row' },
            el('span', { class: 'cards-cta-meta' }, `${shard.cards.length} cards · ${due} due`),
            el('a', { class: 'chip', href: `#review/${subj}`,
                on: { click: e => { e.preventDefault(); state.reviewSubjectFilter = subj; resetReviewQueue(); go('review', subj); } } },
                el('span', { class: 'icon-label' }, el('span', {}, due ? `review ${due} due` : 'browse cards'), icon('arrowRight')))
        ),
        sectionsWithCards.length > 0 ? el('div', { class: 'cards-section-hint' },
            el('div', { class: 'hint-label' }, 'from sections:'),
            ...sectionsWithCards.map(sec => el('button', { class: 'chip', 'aria-label': `review cards from "${sec.title}"`,
                on: { click: () => {
                    state.sectionFilter = sec.line;
                    state.reviewSubjectFilter = subj;
                    resetReviewQueue();
                    go('review', subj);
                } } }, `${sec.title} (${sec.count})`))
        ) : null
    );

    const triageScenarios = shard.triage?.scenarios || [];
    const triageVisible = triageScenarios.slice(0, 3);
    const triageHidden = triageScenarios.slice(3);
    const triagePanel = triageScenarios.length ? (() => {
        const panel = el('div', { class: 'panel cases-panel' },
            el('div', { class: 'panel-head' }, el('span', { class: 'title' }, `cases (${triageScenarios.length})`)),
            ...triageVisible.map(sc => el('div', { class: 'row' },
                el('span', { class: 'code' }, '*'),
                el('div', {}, el('div', { class: 'title' }, sc.name), el('div', { class: 'meta' }, sc.description || '')),
                el('a', { class: 'chip', href: `./triage-live.html#${encodeURIComponent(sc.id || sc.name)}` }, 'work')
            ))
        );
        if (triageHidden.length) {
            const moreRows = triageHidden.map(sc => el('div', { class: 'row triage-hidden' },
                el('span', { class: 'code' }, '*'),
                el('div', {}, el('div', { class: 'title' }, sc.name), el('div', { class: 'meta' }, sc.description || '')),
                el('a', { class: 'chip', href: `./triage-live.html#${encodeURIComponent(sc.id || sc.name)}` }, 'work')
            ));
            moreRows.forEach(r => r.style.display = 'none');
            const showBtn = el('button', { class: 'chip', style: 'margin-top:8px',
                on: { click: e => { moreRows.forEach(r => r.style.display = ''); e.target.remove(); } } },
                `show ${triageHidden.length} more`);
            panel.append(...moreRows, showBtn);
        }
        return panel;
    })() : null;
    const cardsPanel = cardsDetails;

    const infographicsPanel = buildInfographicsPanel(shard.guide?.infographics || []);
    const videoHero = buildVideoHero(shard.guide?.videos || [], subj);
    const audioPanel = buildAudioPanel(shard.guide?.audio || [], subj);
    const right = el('div', {}, videoHero, audioPanel, cardsPanel, guideBodyPanel, infographicsPanel, triagePanel);
    const wrap = el('div', { class: 'deepdive', data: { cat: meta?.cat || 'green' } }, left, right);
    getStage().append(wrap);
    mountBackToTop();
}


function buildGuideToc(subj, shard, ticks) {
    const counts = sectionCardCounts(subj);
    const sections = (shard.guide?.sections || []).filter(s => s.level === 2 || s.level === 3);
    // Group H3 children under H2 parents
    const groups = [];
    let cur = null;
    for (const s of sections) {
        if (s.level === 2) { cur = { h2: s, children: [] }; groups.push(cur); }
        else if (s.level === 3) {
            if (!cur) { cur = { h2: null, children: [] }; groups.push(cur); }
            cur.children.push(s);
        }
    }
    const totalSections = sections.length;
    const tickedTotal = sections.filter(s => ticks[String(s.line)]).length;

    const filterInput = el('input', {
        type: 'search', class: 'toc-filter', placeholder: 'filter sections…',
        'aria-label': 'filter guide sections',
        on: { input: e => applyTocFilter(panel, e.target.value) }
    });

    const renderRow = (s) => {
        const lineKey = String(s.line);
        const checked = !!ticks[lineKey];
        const n = counts.get(lineKey) || 0;
        const badgeText = n ? `(${n})` : '';
        const anchorId = `g-${slugify(s.title)}-${s.line}`;
        const row = el('div', { class: `toc-row h${s.level}` + (checked ? ' done' : ''), 'data-title': s.title.toLowerCase() },
            el('input', {
                type: 'checkbox', class: 'guide-tick',
                ...(checked ? { checked: 'checked' } : {}),
                'aria-label': `mark "${s.title}" understood`,
                on: { change: e => {
                    const all = loadGuideTicks();
                    (all[subj] = all[subj] || {})[lineKey] = e.target.checked;
                    saveGuideTicks(all);
                    row.classList.toggle('done', e.target.checked);
                    lastpos.save('subject', subj);
                    render();
                } }
            }),
            el('a', { class: 'toc-link', href: `#${anchorId}`,
                on: { click: e => {
                    e.preventDefault();
                    const target = document.getElementById(anchorId);
                    if (target) {
                        const panel = target.closest('.chunk-panel');
                        if (panel && panel.classList.contains('chunk-collapsed')) {
                            panel.classList.remove('chunk-collapsed');
                            const btn = panel.closest('.chunked-guide')?.querySelector('.chunk-expand-btn');
                            if (btn) { const remaining = panel.closest('.chunked-guide').querySelectorAll('.chunk-collapsed').length; if (!remaining) btn.remove(); }
                        }
                        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                } } }, s.title),
            badgeText ? el('span', { class: 'sec-card-badge' }, badgeText) : null,
            n > 0 ? el('button', { class: 'chip toc-review-btn', 'aria-label': `review ${n} card${n === 1 ? '' : 's'} from this section`,
                on: { click: e => {
                    e.preventDefault();
                    state.sectionFilter = s.line;
                    state.reviewSubjectFilter = subj;
                    resetReviewQueue();
                    go('review', subj);
                } } }, el('span', { class: 'icon-label' }, el('span', {}, 'review'), icon('arrowRight'))) : null
        );
        return row;
    };

    const groupEls = groups.map((g, gi) => {
        if (!g.h2) {
            return el('div', { class: 'toc-group toc-group-bare' }, ...g.children.map(renderRow));
        }
        const childRows = g.children.map(renderRow);
        const childTicked = g.children.filter(s => ticks[String(s.line)]).length;
        const h2Ticked = !!ticks[String(g.h2.line)];
        const totalKids = g.children.length;
        const progressLabel = totalKids ? `${childTicked}/${totalKids}` : (h2Ticked ? 'done' : '');
        const details = el('details', { class: 'toc-group', open: 'open' },
            el('summary', { class: 'toc-h2-summary' },
                el('span', { class: 'toc-h2-title' }, g.h2.title),
                el('span', { class: 'toc-h2-progress mono' }, progressLabel)
            ),
            renderRow(g.h2),
            ...childRows
        );
        return details;
    });

    const panel = el('div', { class: 'panel toc-panel' },
        el('div', { class: 'panel-head' },
            el('span', { class: 'title' }, 'contents'),
            el('span', { class: 'toc-progress-summary mono' }, `${tickedTotal}/${totalSections}`)),
        filterInput,
        el('div', { class: 'toc-groups' }, ...groupEls)
    );
    return panel;
}

// Build chunked guide — sections grouped with their cards. Each section has review affordances.
function buildChunkedGuide(subj, shard, ticks) {
    const counts = sectionCardCounts(subj);
    const sections = (shard.guide?.sections || []).filter(s => s.level === 2 || s.level === 3);
    if (!sections.length || !shard.guide?.body) return null;

    // Parse markdown body into sections by heading matches
    const body = shard.guide.body;
    const lines = body.split('\n');
    const sectionRanges = []; // [{line, title, level, startLine, endLine}]
    let usedSections = new Set(); // track which sections have been consumed

    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
        if (m) {
            const level = m[1].length;
            const title = m[2];
            // Find first unused section matching title+level (handles duplicate titles)
            const secLine = sections.find(s => !usedSections.has(s.line) && s.title === title && s.level === level);
            if (secLine) {
                usedSections.add(secLine.line);
                sectionRanges.push({ ...secLine, startLine: i, endLine: i });
                if (sectionRanges.length > 1) {
                    sectionRanges[sectionRanges.length - 2].endLine = i - 1;
                }
            }
        }
    }
    if (sectionRanges.length > 0) {
        sectionRanges[sectionRanges.length - 1].endLine = lines.length - 1;
    }

    // Build cards by section line
    const cardsByLine = {};
    for (const c of shard.cards) {
        if (!c.requires?.sectionLine) continue;
        const k = String(c.requires.sectionLine);
        if (!cardsByLine[k]) cardsByLine[k] = [];
        cardsByLine[k].push(c);
    }

    const INITIAL_VISIBLE = 3;
    const chunks = [];
    for (let si = 0; si < sectionRanges.length; si++) {
        const sec = sectionRanges[si];
        const lineKey = String(sec.line);
        const secCards = cardsByLine[lineKey] || [];
        const checked = !!ticks[lineKey];
        const cardCount = secCards.length;
        const anchorId = `g-${slugify(sec.title)}-${sec.line}`;

        // Build card preview chips for this section
        const cardPreviews = secCards.length > 0 
            ? el('div', { class: 'section-card-previews' },
                ...secCards.slice(0, 3).map(c => 
                    el('span', { class: 'card-preview-chip', title: c.front?.slice(0, 60), 'data-card-id': c.id },
                        c.front?.slice(0, 30) + (c.front?.length > 30 ? '…' : '')
                    )
                ),
                secCards.length > 3 ? el('span', { class: 'card-preview-more' }, `+${secCards.length - 3} more`) : null
              )
            : null;

        const secBody = el('div', { class: 'chunk-section' },
            el('h3', { id: anchorId, 'data-section-line': sec.line }, sec.title),
            cardPreviews ? el('div', { class: 'card-previews-wrapper' }, cardPreviews) : null
        );

        const chunkEl = el('div', {
            class: `chunk-panel${checked ? ' done' : ''}${si >= INITIAL_VISIBLE ? ' chunk-collapsed' : ''}`,
            data: { sectionIdx: String(si) }
        },
            el('div', { class: 'chunk-head' },
                el('span', { class: 'section-num' }, `§${sec.line}`),
                el('span', { class: 'section-title' }, sec.title),
                cardCount ? el('span', { class: 'chunk-badge' }, `${cardCount}`) : null,
                el('div', { class: 'chunk-affordances' },
                    el('button', { class: 'chip section-review-btn', data: { section: lineKey }, 'aria-label': `review ${cardCount} cards in this section` },
                        cardCount > 0 ? el('span', { class: 'icon-label' }, el('span', {}, `review ${cardCount} card${cardCount > 1 ? 's' : ''}`), icon('arrowRight')) : 'no cards yet'
                    ),
                    el('button', { class: 'chip mark-read', data: { section: lineKey }, 'aria-label': 'mark as read',
                        style: cardCount === 0 ? 'background:var(--c-mastered);color:#fff' : '' },
                        checked ? el('span', { class: 'icon-label' }, icon('check'), el('span', {}, 'read')) : 'mark read')
                )
            ),
            el('div', { class: 'chunk-body' }, secBody)
        );
        chunks.push(chunkEl);
    }

    const hiddenCount = Math.max(0, sectionRanges.length - INITIAL_VISIBLE);
    const expandBtn = hiddenCount > 0 ? el('button', { class: 'chip chunk-expand-btn', 'aria-label': `show ${hiddenCount} more sections`,
        on: { click: e => {
            const btn = e.currentTarget;
            const guide = btn.closest('.chunked-guide');
            guide.querySelectorAll('.chunk-collapsed').forEach(c => c.classList.remove('chunk-collapsed'));
            btn.remove();
        } } }, `show ${hiddenCount} more sections`) : null;

    const result = el('div', { class: 'chunked-guide', 'data-subject': subj }, ...chunks, expandBtn);
    
    // Attach event handlers after element is in DOM
    setTimeout(() => mountMiniCardHandlers(result, subj), 0);
    
    return result;
}

// Handle mini-card interactions: flip and review
function mountMiniCardHandlers(container, subject) {
    if (!container) return;
    container.querySelectorAll('.mini-flip').forEach(btn => {
        btn.addEventListener('click', e => {
            const cardEl = e.target.closest('.mini-card');
            if (cardEl) cardEl.classList.toggle('flipped');
        });
    });
container.querySelectorAll('.mini-review').forEach(btn => {
        btn.addEventListener('click', e => {
            const cardId = e.target.dataset.cardId;
            state.paletteReviewSet = [cardId];
            resetReviewQueue();
            go('review', subject);
        });
    });
    container.querySelectorAll('.section-review-all').forEach(btn => {
        btn.addEventListener('click', e => {
            const section = e.target.dataset.section;
            state.reviewSubjectFilter = subject;
            state.sectionFilter = section;
            resetReviewQueue();
            go('review', subject);
        });
    });
    container.querySelectorAll('.section-review-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const section = e.target.dataset.section;
            if (section) {
                state.reviewSubjectFilter = subject;
                state.sectionFilter = section;
                resetReviewQueue();
                go('review', subject);
            }
        });
    });
    container.querySelectorAll('.mark-read').forEach(btn => {
        btn.addEventListener('click', e => {
            const section = e.target.dataset.section;
            const all = loadGuideTicks();
            (all[subject] = all[subject] || {})[section] = true;
            saveGuideTicks(all);
            render();
        });
    });
    
    // Keyboard navigation for mini-cards
    container.querySelectorAll('.mini-card').forEach(cardEl => {
        cardEl.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                cardEl.classList.toggle('flipped');
            } else if (e.key === 'r') {
                const reviewBtn = cardEl.querySelector('.mini-review');
                if (reviewBtn) reviewBtn.click();
            }
        });
    });
}

function applyTocFilter(panel, q) {
    const needle = String(q || '').trim().toLowerCase();
    const rows = panel.querySelectorAll('.toc-row');
    rows.forEach(r => {
        const title = r.getAttribute('data-title') || '';
        const match = !needle || title.includes(needle);
        r.style.display = match ? '' : 'none';
    });
    // hide groups with no visible children + non-matching h2
    panel.querySelectorAll('.toc-group').forEach(g => {
        const visible = Array.from(g.querySelectorAll('.toc-row')).some(r => r.style.display !== 'none');
        g.style.display = visible ? '' : 'none';
        if (needle && visible && g.tagName === 'DETAILS') g.setAttribute('open', 'open');
    });
}

function mountBackToTop() {
    let btn = document.getElementById('back-to-top');
    if (!btn) {
        btn = el('button', { id: 'back-to-top', class: 'back-to-top hidden',
            'aria-label': 'back to top',
            on: { click: () => window.scrollTo({ top: 0, behavior: 'smooth' }) } }, iconLabel('arrowUp', 'top'));
        document.body.appendChild(btn);
    }
    const onScroll = () => {
        if (window.scrollY > 400) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    };
    window.removeEventListener('scroll', window.__backToTopHandler || (() => {}));
    window.__backToTopHandler = onScroll;
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
}

function buildVideoHero(videos, subj) {
    if (!Array.isArray(videos) || videos.length === 0) return null;
    const v = videos[0];
    const sub = v.title || 'lecture video';
    const meta = [v.durationMin ? `${v.durationMin} min` : null, v.sizeMB ? `${v.sizeMB} MB` : null].filter(Boolean).join(' · ');
    const source = v.url || v.src;
    const vidEl = el('video', { controls: 'controls', preload: 'metadata', playsinline: 'playsinline', src: source });
    return el('div', { class: 'panel video-hero', 'data-video-id': v.filename },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'watch first'), meta),
        el('div', { class: 'video-hero-frame' }, vidEl),
        el('div', { class: 'video-hero-caption' }, sub)
    );
}

function buildAudioPanel(items, subj) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const a = items[0];
    const meta = a.sizeMB ? `${a.sizeMB} MB` : '';
    const audioEl = el('audio', { controls: 'controls', preload: 'metadata', src: a.src });
    return el('div', { class: 'panel audio-panel', 'data-audio-id': a.filename },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'deep dive (audio)'), meta),
        el('div', { class: 'audio-frame' }, audioEl),
        el('div', { class: 'audio-caption' }, a.title || 'audio deep dive')
    );
}

function buildInfographicsPanel(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const grid = el('div', { class: 'infographics-grid' });
    items.forEach((ig, idx) => {
        const tile = el('button', {
            class: 'infographic-tile',
            type: 'button',
            'aria-label': ig.alt,
            on: { click: () => openInfographicLightbox(items, idx) }
        },
            el('img', { src: ig.src, alt: ig.alt, loading: 'lazy' }),
            el('div', { class: 'infographic-caption' }, ig.title)
        );
        grid.append(tile);
    });
    return el('div', { class: 'panel infographics-panel' },
        el('div', { class: 'panel-head' }, el('span', { class: 'title' }, 'infographics'), `${items.length}`),
        grid
    );
}

function openInfographicLightbox(items, startIdx) {
    let idx = startIdx;
    const existing = document.getElementById('infographic-lightbox');
    if (existing) existing.remove();
    const imgEl = el('img', { class: 'lightbox-img', src: items[idx].src, alt: items[idx].alt });
    const caption = el('div', { class: 'lightbox-caption' }, items[idx].title);
    const close = el('button', { class: 'lightbox-close', type: 'button', 'aria-label': 'close', unsafeHtml: ICON.close });
    const prev = el('button', { class: 'lightbox-prev', type: 'button', 'aria-label': 'previous', unsafeHtml: ICON.arrowLeft });
    const next = el('button', { class: 'lightbox-next', type: 'button', 'aria-label': 'next', unsafeHtml: ICON.arrowRight });
    const lbStage = el('div', { class: 'lightbox-stage' }, imgEl, caption);
    const overlay = el('div', { id: 'infographic-lightbox', class: 'lightbox-overlay', role: 'dialog', 'aria-modal': 'true' }, close, prev, lbStage, next);
    function show(i) {
        idx = (i + items.length) % items.length;
        imgEl.src = items[idx].src;
        imgEl.alt = items[idx].alt;
        caption.textContent = items[idx].title;
    }
    function shut() {
        document.removeEventListener('keydown', onKey);
        overlay.remove();
    }
    function onKey(e) {
        if (e.key === 'Escape') shut();
        else if (e.key === 'ArrowLeft') show(idx - 1);
        else if (e.key === 'ArrowRight') show(idx + 1);
        else if (e.key === 'Tab') { e.preventDefault(); close.focus(); }
    }
    close.addEventListener('click', shut);
    prev.addEventListener('click', () => show(idx - 1));
    next.addEventListener('click', () => show(idx + 1));
    overlay.addEventListener('click', e => { if (e.target === overlay) shut(); });
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    close.focus();
}
