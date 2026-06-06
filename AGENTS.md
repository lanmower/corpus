# AGENTS.md — Medical Study Corpus (D:/corpus)

> Extended knowledge in `C:/Users/user/.claude/projects/D--corpus/memory/`. Historical session changes have been exfiltrated to memory — see `historical-changes-2026-05.md`.

## Build commands

```bash
node D:/corpus/scripts/serve.js          # dev server (port 8765, COOP/COEP headers)
node D:/corpus/scripts/build_data.js     # build site/data/ shards
node D:/corpus/scripts/anki_export.js    # emit exports/corpus-anki.txt
node D:/corpus/scripts/anki_migrate.js   # normalize srs-cards to canonical schema
node D:/corpus/test.js                   # tests (200-line cap)
```

## Architecture

- **Site root**: `D:/corpus/site/` — `index.html`, `triage-live.html`, ES modules in `*.js`, single `style.css`, service worker `sw.js`
- **Data**: built shards in `site/data/<subject>.json` + `site/data/manifest.json` (10 subjects)
- **GUI library**: `anentrypoint-design` SDK (currently v0.0.196, bundled byte-identical from `c:/dev/anentrypoint-design/dist/247420.{js,css}`) consumed via ESM — see memory `anentrypoint-design-integration.md`. The `.ds-247420` scope class is required on render roots.
- **Theming**: `site/theme.js` owns `data-theme` on `<html>` (values `light`/`dark`/`auto`/`contrast`, persisted to `corpus.theme.v1`). The SDK auto-runs its own `initTheme()` on a post-import microtask (`Promise.resolve().then(js())`); its theme vocabulary is `{auto,paper,ink,thebird}`, so it does NOT recognize corpus's `light`/`dark`/`contrast` and **resets `data-theme` to `auto`**, clobbering the corpus theme. `theme.js` defends against this by reasserting `effectiveTheme()` after the SDK microtask + rAF AND a `MutationObserver` on `<html>` `data-theme`. **`style.css` themes via the SEMANTIC SDK tokens only** (`--fg`/`--bg`/`--panel-*`) — never raw palette tokens (`--ink` is always dark, `--paper` always light; the SDK never re-themes those). Corpus's `[data-theme="dark"]`/`[data-theme="contrast"]` blocks are scoped `.ds-247420[data-theme=...]` (matched SDK specificity, loaded after so it wins) and redefine the semantic tokens.
- **LLM**: Bonsai-1.7B (1-bit, q1 dtype) via transformers.js + WebGPU. Shared worker `site/llm-worker.js`; corpus tutor worker `site/tutor.js`. Both based on the official `webml-community/bonsai-webgpu` HF Space.
- **Tutor tool dispatch**: LLM emits fenced ` ```tool ` blocks; `site/tool-dispatch.js` parses them; corpus side dispatches via `window.__tutorActions`; triage side dispatches via local `TOOLS` map.
- **Tutor conversation mode**: `site/tutor-panel.js` (chat UI) + `site/tutor.js` (worker) + `site/tutor-store.js` (persistence/config). Panel defaults **collapsed**, persists history to `corpus.tutor.history.v1`, seeds the worker on wire-up (`seed-history` cmd) so its LLM context matches the visible thread. Worker context cap is `WORKER_CONTEXT_TURNS` (16), shared between `tutor-store.js` and `tutor.js`; panel keeps 40 visible turns — an intentional visible-vs-context tradeoff (documented in `tutor-store.js`). All chat routes through one `user-message` path (no guide-question regex) — the model decides whether to answer or emit a tool. Worker cmds: `init`, `seed-history`, `reset-history` (interrupts first if generating), `stop` (interrupts + rebuilds KV), `generate-coaching`, `session-overview`, `guide-question` (now pushes worker history), `triage-hint`, `user-message` (accepts `sample` for regenerate variety). **Model is lazy-loaded**: no eager `init` at boot — `preloadTutorModel()` fires on first panel open / first send, and the status pill (`tutor-status-pill`, idle label "tap to start") reflects load progress. **KV cache resets on system-prompt change** (`state.kvSysKey`) so coach/session/guide/triage/chat prompts don't poison each other. Load has a 180s timeout + one retry (`withTimeout`/`loadWithRetry`). **AICat (the SDK chat component) ignores `header`/`empty` props** — header controls (status pill, new-conversation ⟲, settings ⚙) render as a DOM overlay `#tutor-hdr-controls`, starter chips as `#tutor-empty-slot`, copy/retry as `#tutor-action-bar` (all imperative siblings we control). Settings popover has a panel-width slider + outside-click/Escape dismissal. Daily check-in (`session-overview`, gated by `config.proactiveCheckins`, fed real `srs.daysUntilExam()`) renders the full plan **into the thread**, not a truncated toast. A client-side `THINKING_TIMEOUT_MS` watchdog resets stuck `isThinking`; toasts reuse one `role=status` node; streaming renders are rAF-batched with stick-to-bottom autoscroll; interrupted replies store a metadata flag (UI marker only, never baked into persisted text); multi-tab history syncs via the `storage` event (`syncTutorFromStorage`).
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
