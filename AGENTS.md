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

Unwitnessed gap (carry-forward): physical browser click-event wiring on `site/triage-live.html` was not witnessed in the session that built it — `exec:browser` could not bind port 9225 in that environment. Node-side coverage is complete (HTML/JS/CSS served, `PERSIST_KEY`/`persistActive`/j-k handlers present, 68/68 scenarios over HTTP, tool-dispatch + localStorage round-trip simulated, rheumatology schema-fix verified). Re-witness from a normal browser env: load the page, click a scenario, press j/k, send a chat message, confirm localStorage persistence and DOM updates fire.

## Student UX Conversion (2026-05-04)

`site/triage-live.{html,js,css}` was converted from operator/observability surface to a student learning UI. Default render now contains zero occurrences of `atom`, `snapshot`, `manifest`, `WebGPU`, `≈2GB`, `spawning worker`, or `crossOriginIsolated` in user-visible chrome (witnessed against served HTML+CSS).

- **Gating**: `?debug=webgpu` (already gated `#webgpu-debug` panel) now also gates the technical model-bay detail line (adapter/dtype/feature-count). Default users see friendly text only.
- **Console-only**: capability boot, adapter info, worker postMessages, stats, errors all route to `console.log`/`console.error` with `[triage-live]` prefix. The chat surface gets student-friendly equivalents — "loading study assistant…", "your tutor is ready", "couldn't load the in-browser tutor — switching to offline mode", "tutor went offline".
- **Terminology**: "atom" → "topic" / "key topics matched"; "snapshot" → buildSnapshot stays in code (not visible); "scratchpad" → "board"; "scenario" mostly retained but hint copy reads "case"; "phase: asking" → "working the case"; "graded — pick another scenario" → "graded — pick another case"; grading footer "N/M canonical atoms matched" → "N of M key topics matched".
- **Stats row**: was `// 68 scenarios · K touched · M cards placed`. Now `N attempted · streak M · last grade X%`. Grading flow updates `state.lastGrade` and `state.streak` (≥70% → +1, else reset).
- **Buttons**: `load LLM (≈2GB)` → `turn on assistant`; `simulate (no LLM)` → `use offline tutor`; `clear screen` → `clear board`. Capability label "WebGPU ready"/"WebGPU unavailable" → "tutor available"/"offline tutor only".
- **Typography**: case stem now `font-size:17px; line-height:1.6; font-weight:500` against `var(--ink)` (was 14px muted). Panel head title bumped to 18px/700.
- **Empty states**: messages `:empty::before` "// no turns yet — assistant has fresh memory each turn" → "your tutor will reply here."; scratchpad-empty "// scratchpad empty — ask the assistant to plot differentials…" → "your board is empty — type 'add differential: …' …"; default active panel "no scenario selected" → "pick a case to begin".
- **Test gate**: `test.js` group `triage-live surfaces gpu errors via console + spawns worker (type=module) + debug panel + student-clean default UX` asserts (a) `console.error('[triage-live] webgpu error` exists, (b) `WebGPU error`/`≈2GB` strings absent from default chrome (HTML+CSS), (c) student-friendly strings present (`study assistant`, `your tutor`, `offline`, `pick a case`), (d) stats use `attempted/streak/last grade` shape. test.js is 199 lines (under 200 cap). 12/12 pass.
- **Browser witness**: `exec:browser` and `playwriter` could not launch a Chromium in this environment (no Chrome instance with debugging enabled). Verification was via served-HTTP byte witnessing of `triage-live.html`/`.css`/`.js`, plus `vm`-evaluated `buildSnapshot` over a synthesized scenario. Carry-forward: in a normal Chrome env, load `?debug=webgpu`, confirm `#webgpu-debug` pane appears AND `#model-detail` shows `adapter: …` line; load without `?debug`, confirm DOM contains none of the operator tokens.
