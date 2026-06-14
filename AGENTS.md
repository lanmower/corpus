# AGENTS.md — Medical Study Corpus (D:/corpus)

> Extended knowledge in `C:/Users/user/.claude/projects/D--corpus/memory/`. Historical session changes have been exfiltrated to memory — see `historical-changes-2026-05.md`.

## Build commands

```bash
node D:/corpus/scripts/serve.js          # dev server (port 8765, COOP/COEP headers)
node D:/corpus/scripts/build_data.js     # build site/data/ shards
node D:/corpus/scripts/anki_export.js    # emit exports/corpus-anki.txt (shares scripts/syllabus.js path resolver w/ build_data.js)
node D:/corpus/scripts/anki_migrate.js   # normalize srs-cards to canonical schema
node D:/corpus/test.js                   # tests (single-file, node:assert; keep assertions terse)
```

## Architecture

- **Site root**: `D:/corpus/site/` — `index.html`, `triage-live.html`, ES modules in `*.js`, single `style.css`, service worker `sw.js`
- **App architecture (composition spine)**: `app.js` is a thin (~440-line) orchestrator (boot, SDK bootstrap, search palette, keyboard handler, render-dispatch map). It sits on a layered spine: `site/app-context.js` (substrate — the single `state` object, `el`/`icon` DOM builders, `getStage`/`setStage`, data-loading, shared helpers like `slugify`/`totalNewEligibleAll`/`dueCountsBySubject`; imports leaf libs only, never a view) <- `site/router.js` (`ROUTES`/`go`/`render`; the render fn is injected via `setRenderer` and nav side-effects via `onNav` so it never imports a view — no cycle) <- `site/views/*.js` (one module per route: `today`, `guides`, `subject`, `review`, `cases`, `stats`, `calendar`, `settings`, `mistakes`, `drill`) + `site/shortcuts.js` (keyboard-help modal leaf). `views/review.js` owns the review/grading keystone (`resetReviewQueue`/`gradeReview`/etc, imported by today/mistakes/drill/keyboard); `renderCramBanner` is exported from `today.js` and shared by `subject.js`. The mutable `stage` lives behind `getStage`/`setStage` so the SDK collector-proxy swap is observable to every view.
- **Data**: built shards in `site/data/<subject>.json` + `site/data/manifest.json` (10 subjects)
- **GUI library**: `anentrypoint-design` SDK consumed via ESM. It MUST be the latest: rebuild `c:/dev/anentrypoint-design/dist/247420.{js,css}` via `node scripts/build.mjs` FIRST (a sha compare against an un-rebuilt dist shows false drift), then copy the rebuilt bundle into `site/` — a sha mismatch after rebuild means corpus is shipping a stale bundle and must be re-copied — see memory `anentrypoint-design-integration.md`. The `.ds-247420` scope class is required on render roots.
- **Theming**: `site/theme.js` owns `data-theme` on `<html>` (`light`/`dark`/`auto`/`contrast`, key `corpus.theme.v1`). The boot-time FOUC guard inlined in `index.html`/`triage-live.html` MUST stay in lockstep with `theme.js` `effectiveTheme()` (4-value resolution; test.js asserts both). SDK-clobber-guard + raw-palette pitfall + FOUC fix: see rs-learn (recall "corpus theme SDK icon-sweep").
- **Icons**: shared `site/icons.js` (inline currentColor SVG strings) is the canonical UI icon source — no decorative Unicode glyphs in UI source (data/*.json medical arrows/thresholds are exempt content). `el()`/`ce()` accept an `html` attr; toast/context-menu render svg strings via innerHTML.
- **LLM**: Bonsai-1.7B (1-bit, q1 dtype) via transformers.js + WebGPU. Triage worker `site/triage-llm-worker.js` (triage page only); corpus tutor worker `site/tutor.js`. Both based on the official `webml-community/bonsai-webgpu` HF Space.
- **Tutor tool dispatch**: LLM emits fenced ` ```tool ` blocks; `site/tool-dispatch.js` parses them; corpus side dispatches via `window.__tutorActions`; triage side dispatches via local `TOOLS` map.
- **Triage LLM turn contract** (`site/triage-live.js`): both the tutor and triage paths re-feed the FULL prompt every turn, so the shared `triage-llm-worker.js` KV cache MUST be reset between generates — `generateLLM` posts `{type:'reset'}` before each `{type:'generate'}` or a reused populated cache double-counts the prefix and emits the same canned reply to every input. Each generate carries an incrementing `requestId` (`state._activeReqId`); the `start`/`update`/`complete`/`error` handlers drop any message whose `requestId` mismatches, so an interrupted generation's late `complete` cannot resolve the next turn. Case-data load (`loadManifestAndScenarios`) goes through ok-checked `fetchJson` and the boot IIFE renders an error+retry panel into `#scenario-list` on failure — it never stalls on the "loading cases…" placeholder.
- **Tutor conversation mode**: `site/tutor-panel.js` (chat UI) + `site/tutor.js` (Bonsai WebGPU worker) + `site/tutor-store.js` (persistence/config, `corpus.tutor.*.v1`). Load-bearing invariants (daily-syllabus empty-plan -> `SYS.dailyCaughtUp`; chat `role="log"`; settings `role="dialog"` + Tab trap; `tool-dispatch.js` no-throw warns; date-stamped check-in dedup; `saveConfig` returns its persist result; AICat ignores `header`/`empty` so controls are DOM-overlay siblings; KV resets on `state.kvSysKey`): see rs-learn (recall "corpus tutor conversation-mode detail", "corpus tutor + theming + glyph state", "AICat ignores header/empty props").
- **Persistence**: `corpus.*.v1` localStorage keys — see memory `storage-keys.md`
- **Archive (offline)**: `D:/medbak/<subject>/` — not read by build pipeline

## Critical caveats

- Client-side JS verification quirks (`node --check` parses `site/*.js` as CJS so it lies about ESM/top-level-await/worker-`self`/URL-`import` — verify in a real browser; module workers need `{type:'module'}` + COEP require-corp + CDN CORP cross-origin; `.ds-247420` scope class mandatory for SDK CSS): recall "Corpus node --check is NOT sufficient".

## Repository state

- Git identity: `lanmower` (almagestfraternite@gmail.com)
- GitHub: `https://github.com/lanmower/corpus.git` (master)
- Pages: `https://lanmower.github.io/corpus/`
- LFS: `*.mp4`, `*.m4a` via git-lfs (history retains old blobs but new clones don't fetch)

@.gm/next-step.md
