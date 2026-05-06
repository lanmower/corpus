# AGENTS.md — Medical Study Corpus (D:/corpus)

## Corpus Structure & Archive Status

**Effective 2026-05-04** (archive relocated 2026-05-05): D:/corpus is the root of a medical study corpus for CMED4IIM1/IIM2 covering 8 subjects: cardiology, diabetes, endocrine, gastroenterology, geriatric, nephrology, pulmonology, rheumatology.

Each subject originally had three subdirectories:
- `audio-transcripts/` — **moved to D:/medbak/<subject>/audio-transcripts/** (offline archive, 2026-05-05 moved from C:/medbak)
- `book-texts/` — **moved to D:/medbak/<subject>/book-texts/** (offline archive, 2026-05-05 moved from C:/medbak)
- `srs-cards/` — **remains at D:/corpus/<subject>/srs-cards/**

Only srs-cards remain at the corpus root; all original source materials live at `D:/medbak/<subject>/` along with `D:/medbak/archive-manifest.json` (records every moved file). The build pipeline no longer reads from medbak — `scripts/build_data.js` ingests `srs-cards/` + `concise/<subject>_study_guide.md` + `<subject>_triage_scenarios.yml` only. `loadAudio`/`loadBooks` removed; shards no longer carry `audio[]`/`books[]` arrays; manifest no longer carries `audioCount`/`bookCount`.

## Generated Artifacts

Per-subject files at D:/corpus root:
- `*_triage_scenarios.yml` (all 8 subjects) — parameterized clinical triage scenarios extracted from SRS cards
- `concise/<subject>_study_guide.md` (all 8 subjects) — **the rewritten study guides; 934KB total prose across 202 sections; the featured top-level artifact of the site** (see "Study Guides Featured" below)

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

Totals across all 8 subjects (post-archive-relocation 2026-05-05):
- **1958 SRS cards**
- **901 reasoning atoms**
- **68 triage scenarios**
- **202 study-guide sections** across **934 KB** of rewritten prose
- **56 audio lectures + 135 book sections** archived offline at `D:/medbak/<subject>/` (no longer surfaced in shards or UI)

## Study Guides Featured (2026-05-05 IA pass)

The eight rewritten study guides at `concise/<subject>_study_guide.md` are the primary artifact of the site. Three new surfaces:

- **`#guides` route** — top-nav link between `today` and `subjects`. `renderGuides()` emits a hero ("our rewritten study guides") plus a grid of 8 large guide cards (subject, section count, KB size, ~min read, mastery%, "open guide →" chip). Below the grid: totals panel summing sections, KB, cards, scenarios.
- **Featured-guides panel on `#today`** — `.featured-guides` panel (rail-purple) with a `.guide-mini-grid` of all 8 subjects (name, section count, mastery%, mini progress bar). Headline copy: "our rewritten study guides".
- **`#subject/<name>` deepdive reordered** — `.guide-body-panel` (rail-coloured) with full rendered markdown is now the FIRST panel in the right column, before flashcards and cases. Panel head reads "complete study guide · N sections · KB · ~min read". Sidebar TOC retains the "tick what you understand" checkboxes (panel head renamed "guide sections").
- **CTA on home hero**: primary CTA "open the study guides" routes to `#guides` (replaced the previous "review N due cards" as primary).
- **Lede copy updated**: "eight rewritten study guides, plus flashcards and clinical cases bound to the same prose".

## Repository State

- Git identity: `lanmower` (almagestfraternite@gmail.com)
- GitHub remote: `https://github.com/lanmower/corpus.git` (origin)
- Current branch: master
- Main branch: master
- GitHub Pages: deploys from `master` via `.github/workflows/pages.yml` to `https://lanmower.github.io/corpus/`

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


## Personal-tool restyle + study-flow pass (2026-05-05)

This pass dropped the marketing-style framing in favour of a personal study notebook. Witnessed live via fresh-context browser at `http://127.0.0.1:8765/`.

**Design tokens** — `site/style.css` `:root`:
- Type: `--ff-prose` (Lora, humanist serif), `--ff-ui` (system-ui sans), `--ff-mono` (JetBrains Mono). Archivo Black removed; `--ff-display` retired (the token name persists in legacy code paths but no longer loads a display face).
- Color reserved for **meaning**: `--c-due`, `--c-mastered`, `--c-missed`, `--c-weak`. Decorative `rail-{green|purple|mascot|sun|flame|sky}` neutralised — they no longer drop a coloured stripe; the classnames remain inert for back-compat.
- Chrome lowercased site-wide — `text-transform: lowercase` on `.navlink`, `.eyebrow`, `.chip`, `.panel-head .title`. Authored copy is already lowercase.

**New modules** (all module-script ESM, registered on `window.__<name>`):
- `site/cram.js` — `corpus.cram.dismissed.v1`. `isDismissed()` / `dismiss()`. Same-day persistence; rolls over at midnight.
- `site/lastpos.js` — `corpus.lastpos.v1` = `{route, subjectAnchor, ts}`. Written on every `go()` and on guide-section-tick. `gapDays(now)` returns whole days since last visit.
- `site/justread.js` — `corpus.justread.v1` = `{[subject]: bool}`. `toggle(subject)` flips and returns new value; `applyClass(on)` toggles `document.body.classList.just-read`.
- `site/verdicts.js` — pure functions. `verdictFor({mastery, trend, backlog, scheduled})` → `'solid' | 'getting there' | 'weak' | 'cold'`. Thresholds: `scheduled===0 || mastery<25 → cold`; `mastery>=75 && trend>=0 && backlog<10 → solid`; `mastery>=50 → getting there`; `mastery>=25 → weak`. Helpers: `trendFor(states, ids, now)` (last-7d score balance ∈ [-1, +1]), `backlogFor`, `buildRows(manifest, shards, states, ticks)`, `computeWeakest(rows)`.

**Seven study-flow features** (all wired, all witnessed):
1. **Compressed `#today`** — single `.status-line` (`day N · M due · streak K · goal X/Y` mono), single `.summary-line` (`today: N due cards · M cases queued · ~X min est.`), one primary CTA `.primary-action` (`review (N)` or `review`), 8-row `.guide-jump` list (subject · sections · mastery%). Recommended cases + 5-day recap moved behind `?debug`.
2. **Inline guide affordances** — `renderMarkdown(md, subject)` emits `<span class="guide-aff"><a data-aff="tutor">→ tutor</a><a data-aff="practice">→ practice</a></span>` next to every `h2` and `h3` in guide bodies. tutor href = `./triage-live.html?topic=<encoded>&subject=<x>`, practice href = `#cards/<subject>?tag=<heading-token>`. Witnessed: 22 affordances on cardiology guide.
3. **Review queue progress** — `.review-progress` line above the active card: `<idxOneBased> of <total> · <toGoal> to daily goal`. No celebration animation on grade — instant next-card render. Witnessed: `1 of 542 · 30 to daily goal`.
4. **Cram banner** — `renderCramBanner(weakest)` returns null unless `srs.daysUntilExam() <= 14` AND `!cram.isDismissed()`. Renders on `#today` AND `#subject/<x>`. Shows `exam in N days · weakest: <subject> · focus there` plus 2 case chips from the weakest subject and a `dismiss` button. Witness: `localStorage.corpus.srs.config = {examDate: '2026-05-14'}` → banner appears with cardiology = weakest.
5. **Last-position memory** — `lastpos.save(route, subject)` fires on every `go()` and on guide-tick. `renderResumeLine()` on `#today` shows `back after Nd. last: <anchor> → resume` when `gapDays >= 1`.
6. **Just-read mode** — `r` key on `#subject/<x>` toggles `document.body.classList.just-read`; persisted per subject at `corpus.justread.v1`. Hint `press r for just-read` rendered in the deepdive sidebar. `Esc` also exits. Style hides `.deepdive-side`, `.cards-panel`, `.cases-panel`, shrinks topbar.
7. **Exam-ready verdicts** — `#stats` renders `.verdict-table` with columns `subject | mastery | trend | backlog | verdict`. Sortable by clicking header or via the `sort:` dropdown; default sort = `VERDICT_RANK` (cold → solid). Witness: 8 rows on initial load, all `cold` until states accumulate.

**IA + nav**:
- Nav: `today | guides | subjects | review | cards | cases | stats | settings` + `tutor` (`.nav-cta`).
- `ROUTE_ALIASES = { home: 'today', triage: 'cases' }` keeps old fragment URLs working.
- Topbar lowercase chrome; brand-glyph `·_`.

**Microcopy sweep** (triage-live):
- `load tutor` (was `turn on assistant`)
- `offline mode` (was `use offline tutor`)
- `select a case.` (was `pick a case to begin`)
- `tutor` (was `study assistant`)
- No `≈2GB` text in user-visible chrome.

**test.js** (262 lines, 7/7 green): data integrity · scheduler+persistence · triage-live gate+worker+restyle · restyle tokens · new modules (cram/lastpos/justread/verdicts thresholds) · app.js wiring · progress+search+theme+a11y+telemetry.

**Browser witness 2026-05-05** (fresh `browser.newContext()` to bypass the previous session's SW cache):
- `#today`: status-line `day 0·1432 due·streak 0·goal 0/30`, summary `today: 1432 due cards · 0 cases queued · ~573 min est.`, primary `review (1432)`, 8 guide-jump rows, no `workspace` text.
- `#subject/cardiology`: 22 guide-affordance spans rendered, `press r for just-read` hint visible, `r` flips `.just-read` on/off cleanly.
- `#review`: `1 of 542 · 30 to daily goal` line above first card.
- `#stats`: 8-row verdict table.
- Cram: `localStorage.corpus.srs.config = {examDate: '2026-05-14'}` → banner `exam in 9 days · weakest: cardiology · focus there` + 2 case chips + dismiss.

**Known rough edges (next session)**:
- `renderStats` previously had a duplicated `buildRows` call; cleaned. Verdict trend column will read `0` for all subjects until users actually grade cards (no historic data on first load) — cosmetic.
- The cram banner deduplicates against `cram.isDismissed()` per-day; a user who dismisses on day 1 won't re-see it until midnight rollover. Acceptable.
- `renderHome` route name removed; `#home` aliases to `#today`. Old bookmarks still work.
- The previous session's service worker (`corpus-v2`) caches stale HTML aggressively — first-visit users on the deployed site may need a hard reload. SW cache key was not bumped this pass; if persistent, bump `corpus-v3` next pass.

## Study-flow expansion (2026-05-05, post personal-tool restyle)

10 new modules + integrations land for the 4th-year-med-student persona heading into a 41-day exam runway.

### New modules
- `site/timer.js` â pomodoro 25/5, persists `corpus.timer.v1`. Floating bottom-right widget. `t` key toggles visibility.
- `site/plan.js` â daily plan builder. `corpus.plan.v1`. Inputs: due count, weakest subject, next un-ticked guide section, cases-available. Output: `{tasks:[{kind,min,label,href}], total}`.
- `site/mistakes.js` â log of every grade â¤2. `corpus.mistakes.v1` capped at 200. `recent(50)` reverse-chrono, `bySubject(50)` grouped, `ids()` for re-review queue.
- `site/drill.js` â 10-card mini-session. `corpus.drill.v1`. Picks weakest cluster's due cards (falls back to first 10 cards). `#drill` route bridges to `#review` with the queue prefilled.
- `site/flag.js` â flag for later. `corpus.flagged.v1` (Set serialized as array). `f` key in review toggles. Today chip shows count when â¥1.
- `site/undo.js` â 5s undo ring of 1. Records prevState before grade; `u` key consumes and restores. Toast `#undo-toast` shown for 5s after every grade.
- `site/notes.js` â highlights + notes on guide prose. `corpus.notes.v1 = {[subject]:{[lineNum]:{text,hl?,note?}}}`. `h`/`n` keys with selected text on `#subject/<x>`. `#notes` route lists all.
- `site/late.js` â clock-only late-night detection. 23:00â02:00 â `body.late-night` (filter:brightness 0.85). 02:00â05:00 â `body.really-late` (filter:brightness 0.7 sepia). Banner reads "late session â keep it short" / "past 2am â you should sleep."
- `site/usercards.js` â personal cards. `corpus.usercards.v1`. `+` opens one-line composer parsed as `front | back | tag1,tag2`. Merged into review queue with `(personal)` badge.
- `site/confidence.js` â 1â5 per guide section. `corpus.confidence.v1`. `avgFor(subject)` for verdict weighting.

### New routes
- `#mistakes` â last 50 mistakes grouped by subject, bulk "review all" button (loads `mistakes.ids()` into review queue), clear-log button.
- `#notes` â flat list of every highlight + note across subjects, jump-to-subject.
- `#drill` â bridge route; computes weakest cluster, calls `drill.start`, redirects to `#review` with prefilled queue.

### Topbar
- Added `mistakes` + `notes` navlinks.
- New `.exam-countdown` badge (`41d`) â clicks â `#settings`.

### Keymap (full)
- `?` shortcuts modal Â· `Esc` close
- `Ctrl+K` search palette
- `r` just-read (subject) Â· `t` pomodoro toggle Â· `+` quick add Â· `u` undo last grade
- `h` highlight selected text (subject) Â· `n` note on selected text (subject)
- `f` flag card (review) Â· `space` reveal Â· `1â4` grade Â· `s` skip
- g-prefix nav: `g h` today, `g r` review, `g s` stats, `g c` cards, `g m` mistakes, `g n` notes
- live tutor: `j`/`k` next/prev case, `/` focus, `Ctrl+Enter` send

### Storage keys (cumulative)
`corpus.theme.v1`, `corpus.progress.v1`, `corpus.srs.states`, `corpus.srs.config`, `corpus.guide.v1`, `corpus.cram.dismissed.v1`, `corpus.lastpos.v1`, `corpus.justread.v1`, `corpus.triage.v1`, `corpus.timer.v1`, `corpus.plan.v1`, `corpus.mistakes.v1`, `corpus.drill.v1`, `corpus.flagged.v1`, `corpus.notes.v1`, `corpus.usercards.v1`, `corpus.confidence.v1`.

### Streak grace
`progress.rollStreak` now uses `effectiveDateISO(now)` â between 0:00 and 6:00 local, the day attributes back to the prior calendar date so post-midnight study doesn't reset a streak. Default behavior past 6:00 unchanged.

### Day-of-exam mode
When `srs.daysUntilExam() === 0` and the route isn't `#mistakes` or `#settings`, `render()` short-circuits to `renderExamDay` â minimal panel with "good luck. trust your prep." + chip-links to mistakes and settings. Auto-recovers next day.

### Today screen additions
- `.daily-plan` panel (~60 min budget): minutes-per-task labels, click-through to the relevant route.
- `.today-chips`: drill-10, flagged-count (when â¥1), mistakes, plus inline 7-day SVG sparkline.
- 0-byte SVG generation (currentColor fill, opacity-coded) â works in dark/light/contrast.

### Stats screen additions
- `this week vs last` panel: `last7 - prior7` from `progress.history`, sign-coded delta.

### Subject view additions
- `.next-thing` line: first un-ticked section title.
- `.tag-cloud` panel: top 20 tags by count, font-size proportional to log2(n), pills click to `#cards/<subject>?tag=â¦`.

### Theme
Added `'contrast'` option. `cycleTheme` order: light â dark â contrast â auto â light. `prefers-contrast: more` auto-selects contrast in `auto` mode. `[data-theme="contrast"]` is pure black/white with no shadows; prints clean.

### Search palette
`buildSearchIndex` now emits a `prose` kind for every guide-body paragraph â¥40 chars (excluding headings). `snippet(body, query, radius=60)` returns `Â±60`-char windows around the first matching token with ellipsis affordances.

### PWA
- `site/manifest.webmanifest` with SVG-data-URI icons (192 + 512 maskable). `<link rel="manifest">` in index.html. Installs as desktop/mobile app.
- SW cache key bumped to `corpus-v4` (2026-05-05 archive-isolation pass dropped the medbak index). SHELL precaches all 10 new modules + `manifest.webmanifest`. The site never reads from `D:/medbak`; originals stay archive-only.
- `site/index.html` script tags carry `?v=3` for cache-busting deployed users.

### Originals are archive-only (2026-05-05)
The site surfaces the rewritten artifacts and nothing else: `concise/<subject>_study_guide.md`, `<subject>/srs-cards/`, `<subject>_triage_scenarios.yml`. Heading lines and TOC links in the rewritten guides were sanitized this pass to strip transcript-source filename suffixes (`_pages-NNN-NNN`, ` - CMED4IIMx - 2026`, "Lectures & Audio Transcripts"). `site/data/medbak-index.json` and `scripts/build_medbak_index.js` were deleted; no UI hook references the medbak archive. Card-level `sourceFile` / `source` fields persist in shards but are gated behind `?debug` and never feed the search index.

### Triage-live
- New `copy as md` button in composer-row. Builds Markdown from active scenario name + description + scratchpad cards (kind, title, body), copies via `navigator.clipboard.writeText`. Console-logs char count with `[triage-live]` prefix.

### Tests
`test.js` extended to 353 lines, 9 groups, 9/9 green. New groups:
- `new modules: timer + plan + mistakes + drill + flag + undo + notes + late + usercards + confidence` â round-trips storage for all 10 modules, asserts API surface.
- `integration: SW v3 + manifest + index html + app.js wiring + theme contrast + search prose snippet + streak grace` â gates the SHELL contents, manifest.webmanifest schema, theme-contrast block, prose+snippet emission, effectiveDateISO post-midnight grace, and presence of every new app.js identifier (`openQuickAdd`, `undoLastGrade`, `gPrefixTs`, `renderMistakes`, `renderExamDay`, `renderSparkline`, `daily-plan`, `tag-cloud`, `next-thing`, `exam-countdown`, etc.) plus the medbak-index.json on disk.

### Browser witness
Witnessed in fresh incognito context against `node scripts/serve.js` on 8765:
- Home: 11 navlinks (today/guides/subjects/review/cards/cases/stats/mistakes/notes/settings/tutor), `.exam-countdown` reads `41d`, `.daily-plan` renders 3 tasks, today-chips include drill-10 + mistakes, sparkline SVG mounted, `#pomo` floating widget mounted, zero pageerrors.
- Keys: `+` opens `#quickadd-modal`; `Enter` on a `front | back | tag` line writes `corpus.usercards.v1` (count=1). `t` toggles `#pomo` `.hidden`. `?` opens `#shortcuts-modal` with all new entries. `g m` navigates to `#mistakes` (title="mistakes Â· corpus", h2="mistake log"). `g r` to review. Logging a mistake via `window.__mistakes.logMistake` then navigating to `#mistakes` shows the row.
- Subject route: `.next-thing` reads "next: Cardiology â Complete Study Guide", `.tag-cloud` panel mounts.
- Stats route: `this week vs last` panel mounts.

Witness gaps (carry-forward â non-blocking):
- Pomodoro timer 1-second countdown ticking through a full minute and break-mode flip not witnessed against wall-clock; logic is unit-tested via load/save/start/pause and `fmt`.
- `h`/`n` highlight-on-selection with a real text-range; only the storage round-trip is tested.
- `u` undo of a real grade SM-2 reversal with the 5-second window expiry; module unit-tested.
- Late-night CSS filter under faked system clock past 23:00; CSS rules + `late.lateLevel` unit-tested.
- Day-of-exam minimal mode under `daysUntilExam===0`; render branch present and reachable, not witnessed under faked exam-date.
- Offline reload via `page.context().setOffline(true)` â SW shape verified at install/fetch by source, not load-cycle witnessed.
- PWA install prompt on a real Chrome instance â manifest.webmanifest present and validated by JSON-parse + key check; install UI not exercised.

### What was rewritten / kept
Kept: `srs.js`, `verdicts.js`, `cram.js`, `lastpos.js`, `justread.js`, `progress.js` (small additions), `theme.js` (small additions), `search.js` (extended), all data shards.
Rewrote: `sw.js` (cache key + SHELL list), `index.html` (manifest link + ?v=3).
Added: 10 new modules in `site/`, `site/manifest.webmanifest`, `site/data/medbak-index.json`, `scripts/build_medbak_index.js`.

## IA simplification (2026-05-06)

The student-facing site no longer surfaces `subjects` (plural index) or `cards` (browser). Review covers practice, the per-subject deepdive at `#subject/<name>` covers everything you'd reach from the subject index plus the full guide body inline.

- **Topbar nav** (both `index.html` and `triage-live.html`): `today | guides | review | cases | stats | mistakes | notes` + `settings` + `tutor` (CTA).
- **Routes removed**: `#subjects`, `#cards`, `#cards/<subject>`, `#cards/<subject>?tag=…`, `#card/<id>`. Functions removed: `renderSubjects`, `renderCards`, `renderCardList`, `renderCardFocus`. State fields removed: `cardSearch`, `cardSubjectFilter`, `cardTagFilter`, `focusCardId`.
- **Route aliases extended** in `ROUTE_ALIASES`: `subjects → guides`, `cards → review`, plus the existing `home → today`, `triage → cases`. Old bookmarks still resolve.
- **Guide affordances**: the inline `class="guide-aff"` span next to each `h2`/`h3` now emits only `→ tutor`. The `→ practice` link (which used to deep-link into `#cards/<subject>?tag=…`) is gone.
- **Tag-cloud panel removed** from the subject deepdive (it was the last surviving consumer of the cards browser).
- **Subject deepdive `cards-panel`**: the "all N →" chip now reads `review all N →` and routes to `#review` filtered by subject instead of the cards browser.
- **Search palette**: card hits open `#subject/<name>` instead of the cards filter; section + prose hits already routed to the deepdive.
- **Keymap**: `g c` (`go cards`) replaced with `g g` (`go guides`); shortcuts modal updated.
- **SW cache key**: `corpus-v6 → corpus-v7`. `index.html` cache-busters: `style.css?v=5 → ?v=6`, `app.js?v=5 → ?v=6`. Test gate updated (`/corpus-v7/`, `/\?v=6/`).
- **test.js**: 9/9 green. Asserts (a) nav contains `today guides review cases stats` and NOT `['subjects','subjects']` / `['cards','cards']`; (b) `→ practice` is absent from `app.js`; (c) cache key + `?v=6`.
- **Witness**: served `index.html` ships `app.js?v=6` + `style.css?v=6`; `triage-live.html` nav lists today/guides/review/cases/stats/tutor (no subjects/cards); `sw.js` first lines show `CACHE = 'corpus-v7'`; `grep` for `renderSubjects|renderCards|renderCardList|renderCardFocus` against the served `app.js` returns 0 matches; the served `app.js` `mountTopbar` `links` array starts `[['today', 'today'], ['guides', 'guides'], …]`. Live browser witness was attempted via `exec:browser` and failed to bind port 9226 in this session env (carry-forward — re-witness from a normal browser env: load `/`, confirm nav has no `subjects`/`cards`, hit `#guides` and `#subject/cardiology`, run a review session).
