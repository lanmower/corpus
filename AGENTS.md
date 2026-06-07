# AGENTS.md — Medical Study Corpus (D:/corpus)

> Extended knowledge in `C:/Users/user/.claude/projects/D--corpus/memory/`. Historical session changes have been exfiltrated to memory — see `historical-changes-2026-05.md`.

## Build commands

```bash
node D:/corpus/scripts/serve.js          # dev server (port 8765, COOP/COEP headers)
node D:/corpus/scripts/build_data.js     # build site/data/ shards
node D:/corpus/scripts/anki_export.js    # emit exports/corpus-anki.txt
node D:/corpus/scripts/anki_migrate.js   # normalize srs-cards to canonical schema
node D:/corpus/test.js                   # tests (single-file, node:assert; keep assertions terse)
```

## Architecture

- **Site root**: `D:/corpus/site/` — `index.html`, `triage-live.html`, ES modules in `*.js`, single `style.css`, service worker `sw.js`
- **Data**: built shards in `site/data/<subject>.json` + `site/data/manifest.json` (10 subjects)
- **GUI library**: `anentrypoint-design` SDK (latest, rebuilt byte-identical from `c:/dev/anentrypoint-design/dist/247420.{js,css}` via `node scripts/build.mjs`; copy into `site/` after a rebuild — corpus shipped a stale bundle until 2026-06-07) consumed via ESM — see memory `anentrypoint-design-integration.md`. The `.ds-247420` scope class is required on render roots.
- **Theming**: `site/theme.js` owns `data-theme` on `<html>` (`light`/`dark`/`auto`/`contrast`, key `corpus.theme.v1`). The boot-time FOUC guard inlined in `index.html`/`triage-live.html` MUST stay in lockstep with `theme.js` `effectiveTheme()` (4-value resolution; test.js asserts both). SDK-clobber-guard + raw-palette pitfall + FOUC fix: see rs-learn (recall "corpus theme SDK icon-sweep").
- **Icons**: shared `site/icons.js` (inline currentColor SVG strings) is the canonical UI icon source — no decorative Unicode glyphs in UI source (data/*.json medical arrows/thresholds are exempt content). `el()`/`ce()` accept an `html` attr; toast/context-menu render svg strings via innerHTML.
- **LLM**: Bonsai-1.7B (1-bit, q1 dtype) via transformers.js + WebGPU. Shared worker `site/llm-worker.js`; corpus tutor worker `site/tutor.js`. Both based on the official `webml-community/bonsai-webgpu` HF Space.
- **Tutor tool dispatch**: LLM emits fenced ` ```tool ` blocks; `site/tool-dispatch.js` parses them; corpus side dispatches via `window.__tutorActions`; triage side dispatches via local `TOOLS` map.
- **Tutor conversation mode**: `site/tutor-panel.js` (chat UI) + `site/tutor.js` (Bonsai WebGPU worker) + `site/tutor-store.js` (persistence/config, `corpus.tutor.*.v1`). Panel defaults collapsed; worker context cap `WORKER_CONTEXT_TURNS`=16 (shared) vs 40 visible turns; model lazy-loaded via `preloadTutorModel()`; KV resets on system-prompt change (`state.kvSysKey`). AICat ignores `header`/`empty` props so controls render as DOM-overlay siblings (`#tutor-hdr-controls` w/ inline-SVG icons, `#tutor-empty-slot`, `#tutor-action-bar`). Full worker-cmd protocol, watchdog, multi-tab sync, daily check-in, SVG-icon + a11y + scheduling-guard details: see rs-learn (recall "corpus tutor + theming + glyph state" and "AICat ignores header/empty props").
- **Persistence**: `corpus.*.v1` localStorage keys — see memory `storage-keys.md`
- **Archive (offline)**: `D:/medbak/<subject>/` — not read by build pipeline

## Critical caveats

- `node --check` on `site/*.js` is NOT sufficient: it parses as CJS, so ESM `export`, top-level `await`, worker-scope `self`, and `import` from URL all give false positives/negatives. Always verify in a real browser (headless Chrome works).
- Workers must be spawned `{type: 'module'}` to use `import`. The shared `llm-worker.js` and `tutor.js` both require this.
- Cross-origin module workers need `Cross-Origin-Embedder-Policy: require-corp` (the dev server sets this) + the CDN must serve `Cross-Origin-Resource-Policy: cross-origin` (jsdelivr does).
- The `.ds-247420` scope class on the render root is mandatory for anentrypoint-design CSS — without it, all rules fail (no UA fallback).

## Repository state

- Git identity: `lanmower` (almagestfraternite@gmail.com)
- GitHub: `https://github.com/lanmower/corpus.git` (master)
- Pages: `https://lanmower.github.io/corpus/`
- LFS: `*.mp4`, `*.m4a` via git-lfs (history retains old blobs but new clones don't fetch)
