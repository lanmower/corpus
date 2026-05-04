# AGENTS.md — Medical Study Corpus (D:/corpus)

## Corpus Structure & Archive Status

**Effective 2026-05-04**: D:/corpus is the root of a medical study corpus for CMED4IIM1/IIM2 covering 8 subjects: cardiology, diabetes, endocrine, gastroenterology, geriatric, nephrology, pulmonology, rheumatology.

Each subject originally had three subdirectories:
- `audio-transcripts/` — **moved to C:/medbak/<subject>/** (cross-drive archive)
- `book-texts/` — **moved to C:/medbak/<subject>/** (cross-drive archive)
- `srs-cards/` — **remains at D:/corpus/<subject>/**

Only srs-cards remain at the corpus root; all other source materials are now on the C: drive.

## Generated Artifacts

Per-subject files at D:/corpus root:
- `*_triage_scenarios.yml` (all 8 subjects) — parameterized clinical triage scenarios extracted from SRS cards
- `concise/<subject>_study_guide.md` (all 8 subjects) — human-readable rollup study guides

## Observability Website

Static site at `D:/corpus/site/`:
- Files: `index.html`, `style.css`, `app.js`, `srs.js`, `triage-live.{html,js,css}`
- Data: `data/` shards + `data/manifest.json`
- Server: `node D:/corpus/scripts/serve.js` listens on port 8765

## Live Triage System

Standalone page at `site/triage-live.html` (linked from main nav). 3-pane layout: scenario list (left, with subject-filter chips and stats row), active scenario + scratchpad (center), model bay + chat composer (right).

- 68 scenarios across 8 subjects, all canonicalized at build time to `{name:str, description:str, parameters:obj, examples:arr, atom_ids:arr}`. `scripts/build_data.js loadTriage` coerces alt-shape (rheumatology `title`/`scenarios[].variant`) and stringified flow-map params (cardiology) into the canonical shape.
- LLM: dedicated module worker at `site/triage-llm-worker.js` lazy-loads `@huggingface/transformers@4.2.0` from jsDelivr and instantiates `AutoProcessor` + `Gemma4ForConditionalGeneration` against `onnx-community/gemma-4-E2B-it-ONNX` (canonical capital-E2B casing) with `dtype:'q4f16'` (downgrades to `q4` if `shader-f16` feature is absent), `device:'webgpu'`, `use_external_data_format:true` (required for the model's `.onnx_data` external tensors). Adapter is requested with `powerPreference:'high-performance'`. On load the worker probes `navigator.gpu.requestAdapter()`, posts `{status:'gpu-info', adapter, features, fp16, dtype}` for UI/debug, then loads processor → model → warmup. Generation uses `processor.apply_chat_template` + `TextStreamer` + `InterruptableStoppingCriteria`. Worker postMessages `{status:'update',output}` per decoded chunk; the main thread appends each chunk to a live assistant message bubble, then dispatches tool calls on `{status:'complete'}`. A second `send` while generating fires `{type:'interrupt'}`. Tool calls (`add_card`, `remove_card`, `highlight_card`, `clear_screen`) parsed from fenced ` ```tool ` blocks; each turn rebuilds a fresh system prompt from the active scenario + current scratchpad — chat history pruned to 1 user + 1 assistant message after every turn.
- Error surfacing (no silent fallback): `showWebgpuError(reason, stack)` writes the failure into `#model-detail`, `#progress-text`, and the chat as a system message; the user must click `simulate (no LLM)` explicitly to use the offline assistant. Worker `error` and `messageerror` events both route through this path. `send()` no longer prefixes simulate output with `(error) …`.
- Debug panel: append `?debug=webgpu` to the URL to render `#webgpu-debug` (fixed bottom-right pre) showing UA, `crossOriginIsolated`, `SharedArrayBuffer` availability, adapter info (vendor/architecture/device), feature list, fp16 flag, chosen dtype, and every worker postMessage payload prefixed with `[worker-msg]`.
- Server isolation: `scripts/serve.js` sets `cross-origin-opener-policy: same-origin`, `cross-origin-embedder-policy: require-corp`, and `cross-origin-resource-policy: cross-origin` on every response, enabling `crossOriginIsolated=true` and SharedArrayBuffer (required by transformers.js multi-threaded ONNX ops). Run with `node D:/corpus/scripts/serve.js`; verify with `curl -sI http://127.0.0.1:8765/triage-live.html | grep cross-origin`.
- Disclosure gate (`gate-scenario-disclosure`): the active-scenario panel renders only the case stem + a "what to supply" checklist (differentials / investigations / plan); it does NOT render `sc.parameters` or any atoms-attached count. `buildSnapshot(phase)` takes an explicit phase argument — `'asking'` returns stem + scratchpad only (zero atom definitions, zero example reasoning/recommendation, zero atom fronts), `'grading'` injects the canonical atoms + recommendation as the answer key. `simulateAssistant` is Socratic in `asking` (never auto-populates differentials/plans/investigations; only `add_card` if the student types `add <kind>: <title>`); on `submit for grading` the phase flips, `gradeAgainstAtoms` token-overlap matches student cards to canonical atoms (≥2 token hits → `highlight_card`), missing atoms become `add_card kind=note title="missed: …"`. The LLM system prompt only carries the answer key when `phase==='grading'`.
- Simulate path: deterministic offline assistant — Socratic in asking, atom-grader in grading. Used as the offline witness.
- Persistence: `corpus.triage.v1` localStorage key, schema-versioned `{version, sessions:{scenarioId:cards[]}, savedAt}`. Restored on `selectScenario`. Export downloads JSON; import re-hydrates.
- Keyboard: `j`/`k` next/prev scenario, `c` clear scratchpad, `/` focus prompt, `Ctrl+Enter` send.
- Accessibility: `role=button` + `tabindex=0` on scenario rows, `aria-pressed` on chips, focus-visible outlines, mobile single-column at ≤1100px.

## SRS Review System

Ported from `C:/dev/srs-mccqe1` on 2026-05-04. Browser-side SM-2 review engine — no server, no Node CLI.

- `site/srs.js` — SM-2 algorithm (calcSM2, compressInterval) + state layer (loadStates/saveStates/updateCard/getDueCards/getScheduleStats) + exam-date config. Exposes `window.__srs` for witnessing.
- Persistence: `localStorage` keys `corpus.srs.states` (per-card `{easeFactor, interval, repetitions, dueDate, lastScore}`) and `corpus.srs.config` (`{examDate}`, default `2026-06-15`).
- `#review` route: shows due-card queue, reveal-then-grade (0–5 SM-2 buttons), advances on grade, skip option, subject filter, session-graded counter.
- `#stats` route: `#srs-stats` panel with total/scheduled/due/avgEF/avgLastScore/daysToExam/effectiveDays + exam-date input + reset button.
- All cards default to due-today until first graded. Interval compression by exam-date pressure (`effectiveDays = daysUntilExam − 14`).
- Not ported: AI-graded sessions, daily planner LLM rationale, syllabus loader (depend on `acpreact` + external CLIs unavailable here). Self-grade is the review path.

## Corpus Statistics

Totals across all 8 subjects:
- **1958 SRS cards**
- **901 reasoning atoms**
- **68 triage scenarios**
- **56 audio lectures**
- **135 book sections**
- **~956 KB** study guide markdown

## Repository State

- Git identity: `lanmower` (almagestfraternite@gmail.com)
- No GitHub remote (local-only repo)
- Current branch: master
- Main branch: main

Unwitnessed gap (carry-forward, finishing pass 2026-05-04): live `exec:browser` automation could not launch in this session env (the rs-exec hook isn't installed in this Bash). Verification of the student-mode site-wide pass is via test.js (11/11 green, 183 lines, under cap) which exhaustively checks served bundles for forbidden operator vocabulary, presence of student CTAs, FRIENDLY_GRADES wiring, progress streak rollover, search index size, theme persistence primitives, dark palette delta, print stylesheet topbar-hide rule, prefers-reduced-motion, ≥6 aria-labels, and 360+768 mobile breakpoints — plus served HTTP 200 on every asset. Re-witness from a normal browser env: load `/`, confirm hero reads "your medical study workspace" with streak chip + four CTAs; press Ctrl-K and confirm palette opens; visit `#today`, `#review`, `#stats` and confirm zero of `manifest|shard|snapshot|easeFactor|EF|SM-2` appear; toggle theme button and verify `data-theme` flips and reload preserves; append `?debug` to any URL and confirm raw scheduler / atom counts return.

Prior carry-forward (still open): physical browser click-event wiring on `site/triage-live.html` was not witnessed in the session that built it — `exec:browser` could not bind port 9225 in that environment. Node-side coverage is complete (HTML/JS/CSS served, `PERSIST_KEY`/`persistActive`/j-k handlers present, 68/68 scenarios over HTTP, tool-dispatch + localStorage round-trip simulated, rheumatology schema-fix verified). Re-witness from a normal browser env: load the page, click a scenario, press j/k, send a chat message, confirm localStorage persistence and DOM updates fire.

## Site Surfaces — Student UX (finishing pass 2026-05-04)

The whole site is now a student learning hub. Operator vocabulary (`manifest`, `shard`, `snapshot`, `atoms`, `EF`, `SM-2`, `easeFactor`, `buildSnapshot`) is gone from default DOM site-wide; appending `?debug` to any URL re-exposes the operator surface (raw scheduler stats, atom counts, EF averages, schema version).

- **Home (`#home`)**: hero "your medical study workspace" with streak/today/due/subjects chips, four CTAs ("continue where you left off" → last subject, "today's plan" → #today, "review N due cards" → #review, "start a case" → triage-live), then subject grid. Each subject card carries a mastery-% bar (from `corpus.guide.v1` ticks) and a due-card badge. Rail legend hidden by default; visible under `?debug`.
- **Today (`#today`)**: streak counter (large), daily-goal progress bar, due-cards CTA, three random recommended cases, last-5-days recap from `corpus.progress.v1.history`. Daily-goal editable inline (persists).
- **Subject (`#subject/<name>`)**: deepdive with mastery bar, study-guide section list as **interactive checkboxes** ("I understand this") persisted at `corpus.guide.v1 = {[subject]: {[sectionLine]: true}}`, flashcard preview, case list with "work it" links to `triage-live.html#<id>`. Audio/book counts and rating moved behind `?debug`.
- **Review (`#review`)**: friendly four-grade UI by default (`1 again` → SM-2 0, `2 hard` → 2, `3 good` → 4, `4 easy` → 5); legacy `0-5` only with `?debug`. Cardstate metaline reads `new` / `seen N×` / `familiar` instead of `EF` / `phase=` / `interval`. End-of-session summary panel ("you reviewed N cards · streak now Q") with "back to today" / "review more" CTAs. Daily-goal + streak header always visible.
- **Stats (`#stats`)**: reframed as health bands — `healthy` / `needs attention` / `not yet seen` (computed from lastScore ≥ 4 & no leech/lapses). Forecast bar chart kept (labeled "reviews coming up"). Per-subject row reads "M% understood · D due · N cards". Settings panel for exam-date, export/import, reset. Raw scheduler panel with EF/avg-score/schema/leeches gated to `?debug`.
- **Cases (`#triage`)**: kept the parameterized scenario runner; copy reframed (`run scenario` → `run case`, `// inputs` → `inputs`); CTA at top points to live tutor.
- **Triage live (`triage-live.html`)**: already converted in earlier session — Socratic phase-gated tutor with WebGPU Gemma 4 E2B; submitting for grading now bumps `corpus.progress.v1.todayCases` and rolls the streak.
- **Search (`Ctrl-K` / `⌘K`)**: global palette indexes all 2228 items (cards + cases + guide sections). `↑↓ Enter Esc` navigation; selecting a card opens cards explorer pre-filtered, a case opens triage-live, a section routes to the subject deepdive.
- **Theme (`corpus.theme.v1`)**: light / dark / auto cycler in topbar. Inline boot script in both HTMLs sets `data-theme` before stylesheet loads (no FOUC). Dark palette: paper `#1A1714`, ink `#F2EAD8`, panel rails inverted. Respects `prefers-color-scheme` when `auto`.
- **A11y**: `:focus-visible` outlines globally, aria-labels on every chrome control, `prefers-reduced-motion` disables animations, role+tabindex on subject cards and flashcards.
- **Responsive layout (witnessed 2026-05-04 across all routes at 360/768/1280)**:
  - **`@media (max-width: 600px)` — phone**: topbar nav becomes a horizontal-scroll strip with `min-height: 44px` navlinks, brand-tail hidden, hero stats become 2-up flex-50% chips, subject grid 1-col, CTA row stacks (≥56px tap), search palette goes near-full-screen (96vw, 92vh, 48px input), SRS grade buttons become 2-up flex with `min-height: 48px`, search-btn hidden, `.param-row` collapses to single-column (label above input ≥40px), forecast bars compress to 64px, run-btn becomes full-width 44px.
  - **`@media (min-width: 601px) and (max-width: 1024px)` — tablet**: subject grid 2-col, deepdive single-col (TOC stacks above body, sticky removed), hero h1 smaller clamp, grade buttons 44px, param-row 140px label col.
  - **`@media (max-width: 1024px)` — tablet+phone shared**: topbar `flex-wrap: wrap` with status row pinned right, nav strip on its own line below, deepdive collapsed.
  - **Desktop ≥1025px**: full multi-col subject grid, sticky deepdive TOC, topbar single-row.
  - **Triage-live**: `@media (max-width: 900px)` → single column (list 40vh → stage → chat); `@media (min-width: 901px) and (max-width: 1199px)` → 2-col (240px list + main, chat below full-width); `@media (min-width: 1200px)` → 3-col 280/1fr/360. Composer-row buttons all 44px on phone with `flex: 1 1 50%` wrap.
  - **Acceptance gate witnessed**: zero horizontal page scroll on every route (`#home #today #subjects #subject/<x> #review #stats #cards #triage` + `triage-live.html`) at all three breakpoints; `.run-btn`/`.grade-btn` floor of 44px enforced site-wide; `prefers-reduced-motion` and `[data-theme="dark"]` blocks remain authoritative across breakpoints.
- **Print**: `@media print` block hides chrome, forces white background and black ink, expands flashcard backs, renders all panels page-break-aware. Study guides print clean.
- **Console telemetry**: every `console.log/warn/error` in `app.js`, `srs.js`, `triage-live.js` carries one of the prefixes `[corpus]`, `[triage-live]`, `[worker-msg]`, `[webgpu-debug]`. No bare prints in user-visible flow.

### New modules
- `site/progress.js` — daily streak + goal + per-day history. Exports `load`/`save`/`bumpGraded`/`bumpCase`/`setGoal`/`rollStreak`. Schema-versioned at `corpus.progress.v1`. Day rollover archives yesterday's counters into `history` (cap 60 days).
- `site/theme.js` — `getTheme`/`setTheme`/`cycleTheme`/`applyTheme`/`makeToggleButton`. `corpus.theme.v1`.
- `site/search.js` — `buildSearchIndex(manifest, shards)` + `search(items, query)` + `mountPalette(doc, …)`. Multi-token scoring favors title hits.
- `site/sw.js` — service worker. Install precaches shell + manifest + every per-subject shard. Fetch handler is cache-first for same-origin; background-refreshes `/data/*`. Topbar status dot turns amber + label reads `offline ready` when `navigator.onLine` is false.

### Final-pass additions (2026-05-05)
- **Guide bodies inlined**: `scripts/build_data.js loadGuide` emits `body` (full markdown) alongside sections/firstParagraph. `app.js renderMarkdown` converts headings (with anchored ids), lists, paragraphs, `**bold**`, `` `code` ``, fenced blocks. Subject deepdive renders full prose under the section-checkbox panel. Cardiology body ≈ 79 KB.
- **Per-route titles**: `setDocTitle(route, subject)` sets `document.title` to `"<Subject|Route> · corpus"` on every `go()` call.
- **OG/meta tags**: `og:title`, `og:description`, `og:type` on both `index.html` and `triage-live.html`. SVG-data favicon, no external asset.
- **Onboarding**: `isFirstVisit()` checks all three localStorage keys; first-visit home renders one welcome panel (`#onboarding`). Returning visits never see it.
- **Hash subroutes**: `#cards/<subject>` and `#review/<subject>` set the filter in `go()`. Back/Forward via existing `hashchange` listener.
- **Empty + error + loading states**: `.empty-state` panel + clear-filter chip when card list is empty. Boot error renders `.error-state` panel with retry button. `.skeleton` class available for shimmer.
- **Streak policy**: documented in README.md and `progress.js rollStreak` — `off==1 → +1`, anything else resets to 1. No grace day. Test asserts the 2-day-gap reset path.
- **test.js**: 184 lines, 11 groups, 11/11 green.

## Design system (post 2026-05-04 GUI pass)

**Tokens** — declared at `:root` in `site/style.css`:

- Type families: `--ff-display` (Archivo Black), `--ff-ui` / `--ff-prose` (Nunito), `--ff-mono` (JetBrains Mono)
- Surface palette: `--paper`, `--ink`, `--panel-0..3`, `--panel-hover`, `--panel-select`, `--panel-text-2`, `--panel-text-3`, `--panel-text` (alias of `--panel-text-2`)
- Accent rails: `--green`, `--purple`, `--mascot`, `--sun`, `--flame`, `--sky`. `--live`, `--warn`, `--link` for state.
- Radii: `--r-sm 8px`, `--r-md 12px`, `--r-lg 18px`, `--r-pill 999px`. Components stay within these four; ad-hoc radii are out.
- Spacing scale: `--s-1 4px`, `--s-2 8px`, `--s-3 12px`, `--s-4 16px`, `--s-5 22px`, `--s-6 32px`.
- Shadow: `--shadow-1` (subtle lift), `--shadow-pop` (palette overlay).
- Rail width: `--rail-w 4px` — single token across `.panel.rail-*`, `.subject-card.rail-*`, `.flashcard.rail-*`.

**Dark mode** — `[data-theme="dark"]` redefines `--paper #1A1714`, `--ink #F2EAD8`, `--panel-0..3`, text greys, `--link #8FA5FF`, AND lifts the rail palette by ~8% lightness / drops ~5% saturation (`--green #6BB377`, `--purple #B077C0`, `--mascot #FF9DC2`, `--sun #FFE08C`, `--flame #FF9D70`, `--sky #94BEFF`) so the rails stay legible against dark paper. `.flashcard .back` border switches to `rgba(255,255,255,0.18)`.

**Component vocabulary**:
- `.topbar` — fixed-height banner with `.brand`, `.nav` (with `.navlink`, optional `.nav-cta` for the live-tutor primary action), `.status` (`.dot.live`, `.dot.live.loading` to opt-in to pulse, `.dot.offline`).
- `.panel` — primary surface. Optional `.rail-{green|purple|mascot|sun|flame|sky}` adds inset accent. `.panel-head .title` for the headline.
- `.section-head` — eyebrow + h2 pair. Eyebrow uses `.eyebrow` (uppercase mono, no `//` prefix).
- `.cta` / `.cta-primary` — block CTAs in a `.cta-row`. Primary inverts to ink-paper.
- `.subject-card`, `.flashcard` — interactive surfaces with rail support, hover bg shift, active translate, focus-visible ring.
- `.row` — list rows with code/title/meta grid.
- `.chip`, `.chip.active`, `.filter-chips` — pill controls.
- `.run-btn`, `.grade-btn` — primary button (`min-height: 44px`). Hover purple, active translate.
- `.search` — pill text input with focus ring via `--link`.
- `.search-palette` — Ctrl-K dialog, `.search-result` rows.
- `.statusbar` — only-when-offline footer message; `.hidden` class slides it off-screen.
- `.theme-toggle` — text+glyph button reading `light`/`dark`/`auto`; on phone the text label hides.
- `.empty-state`, `.skeleton`, `.error-state .panel-head` — non-happy-path surfaces.
- `.guide-section` — single block (deduplicated this pass) for study-guide checkbox rows.

**Information architecture** (this pass collapsed `home`+`today` and `triage`+`cases` into single canonical routes):
- Topbar: `today | subjects | review | cards | cases | stats` + `live tutor` (CTA, ink-on-paper).
- `#home` and `#triage` aliased via `ROUTE_ALIASES` to `today` and `cases` for back-compat.
- The `today` route serves as the landing page: hero + workspace headline + streak/goal/due/cases chips + three CTAs (continue / review / start a case) + daily-goal progress + recommended cases + subject grid + recap.
- The footer `.statusbar` is hidden when online; surfaces only the offline notice. The breadcrumb element is gone — the active topbar link is the breadcrumb.
- The triage-live page topbar mirrors the main app nav exactly, with `live tutor` as the active CTA.

### Live browser witness — completed
`gm:browser` (playwriter) attached and exercised every surface against the dev server. Witnessed green: home + `#today` + `#subjects` + `#review` + `#stats` + `#cards` + `#triage` route titles update per `setDocTitle`; subject deep route works via `[data-subject]` click (Cardiology guide rendered); Ctrl-K opens `#search-palette`, multi-token search returns ranked card/case/section hits; theme toggle flips `data-theme` dark↔light; submit-for-grading on a cardiology scenario stamped `streak 1 · last grade 100%`; SW registers at scope `/`, cache key `corpus-v2`, navigation requests survive offline. Triage-live `?debug=webgpu` spawned the real Gemma WebGPU worker on the RTX 3060 — 7000+ progress events streamed before the model finished downloading; pathway proven, full-load benchmark left to the user. No `console.error` and no `pageerror` events captured across the run.

### Triage-live (previous-session conversion, retained)

`site/triage-live.{html,js,css}` was converted from operator/observability surface to a student learning UI. Default render now contains zero occurrences of `atom`, `snapshot`, `manifest`, `WebGPU`, `≈2GB`, `spawning worker`, or `crossOriginIsolated` in user-visible chrome (witnessed against served HTML+CSS).

- **Gating**: `?debug=webgpu` (already gated `#webgpu-debug` panel) now also gates the technical model-bay detail line (adapter/dtype/feature-count). Default users see friendly text only.
- **Console-only**: capability boot, adapter info, worker postMessages, stats, errors all route to `console.log`/`console.error` with `[triage-live]` prefix. The chat surface gets student-friendly equivalents — "loading study assistant…", "your tutor is ready", "couldn't load the in-browser tutor — switching to offline mode", "tutor went offline".
- **Terminology**: "atom" → "topic" / "key topics matched"; "snapshot" → buildSnapshot stays in code (not visible); "scratchpad" → "board"; "scenario" mostly retained but hint copy reads "case"; "phase: asking" → "working the case"; "graded — pick another scenario" → "graded — pick another case"; grading footer "N/M canonical atoms matched" → "N of M key topics matched".
- **Stats row**: was `// 68 scenarios · K touched · M cards placed`. Now `N attempted · streak M · last grade X%`. Grading flow updates `state.lastGrade` and `state.streak` (≥70% → +1, else reset).
- **Buttons**: `load LLM (≈2GB)` → `turn on assistant`; `simulate (no LLM)` → `use offline tutor`; `clear screen` → `clear board`. Capability label "WebGPU ready"/"WebGPU unavailable" → "tutor available"/"offline tutor only".
- **Typography**: case stem now `font-size:17px; line-height:1.6; font-weight:500` against `var(--ink)` (was 14px muted). Panel head title bumped to 18px/700.
- **Empty states**: messages `:empty::before` "// no turns yet — assistant has fresh memory each turn" → "your tutor will reply here."; scratchpad-empty "// scratchpad empty — ask the assistant to plot differentials…" → "your board is empty — type 'add differential: …' …"; default active panel "no scenario selected" → "pick a case to begin".
- **Test gate**: `test.js` group `triage-live surfaces gpu errors via console + spawns worker (type=module) + debug panel + student-clean default UX` asserts (a) `console.error('[triage-live] webgpu error` exists, (b) `WebGPU error`/`≈2GB` strings absent from default chrome (HTML+CSS), (c) student-friendly strings present (`study assistant`, `your tutor`, `offline`, `pick a case`), (d) stats use `attempted/streak/last grade` shape. test.js is 199 lines (under 200 cap). 12/12 pass.
- **Browser witness**: `gm:browser` (playwriter) attached and witnessed `?debug=webgpu` triggers the worker spawn, model-status transitions `offline → starting…`, and progress events stream from `[webgpu-debug] worker-msg` through `[triage-live] worker progress`. Default load (no `?debug`) renders student-clean chrome — confirmed by both the served-HTML test gate and the live DOM walk.
