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
- **GUI library**: `anentrypoint-design` SDK consumed via ESM — see memory `anentrypoint-design-integration.md`. The `.ds-247420` scope class is required on render roots.
- **LLM**: Bonsai-1.7B (1-bit, q1 dtype) via transformers.js + WebGPU. Shared worker `site/llm-worker.js`; corpus tutor worker `site/tutor.js`. Both based on the official `webml-community/bonsai-webgpu` HF Space.
- **Tutor tool dispatch**: LLM emits fenced ` ```tool ` blocks; `site/tool-dispatch.js` parses them; corpus side dispatches via `window.__tutorActions`; triage side dispatches via local `TOOLS` map.
- **Tutor conversation mode**: `site/tutor-panel.js` (chat UI) + `site/tutor.js` (worker) + `site/tutor-store.js` (persistence/config). Panel defaults **collapsed**, persists history to `corpus.tutor.history.v1`, seeds the worker on wire-up (`seed-history` cmd) so its 12-turn LLM context matches the visible thread. All chat routes through one `user-message` path (no guide-question regex) — the model decides whether to answer or emit a tool. Worker cmds: `init`, `seed-history`, `reset-history`, `stop` (interrupts + rebuilds KV), `generate-coaching`, `session-overview`, `guide-question`, `triage-hint`, `user-message`. Panel header has new-conversation (⟲) + settings (⚙) controls; per-answer copy/retry via the SDK-agnostic `#tutor-action-bar`; status pill reflects model load state.
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
