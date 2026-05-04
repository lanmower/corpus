# corpus — your medical study workspace

A local, private, browser-only study workspace for eight medical subjects: cardiology, diabetes, endocrine, gastroenterology, geriatric, nephrology, pulmonology, rheumatology.

1958 flashcards, 68 clinical cases with a Socratic tutor, eight study guides, spaced-repetition review with SM-2 scheduling, and a global search palette. No account, no server-side state, no telemetry — everything is in your browser.

## Run it

```bash
node scripts/serve.js
# → http://127.0.0.1:8765
```

The dev server adds COOP/COEP headers so the WebGPU LLM in the live tutor (`triage-live.html`) can use SharedArrayBuffer.

A service worker caches the shell + manifest + shards on first visit, so once you've loaded the site you can review on the train.

## What you get

- **today** (the landing) — workspace hero, streak / daily goal / due-card / cases-today chips, three CTAs (continue where you left off · review N due · start a case), recommended cases, subject grid, recent-days recap.
- **subject** — full study-guide prose with section checkboxes, mastery bar, flashcards, and case list per subject.
- **review** — spaced repetition with friendly four-grade buttons (`again · hard · good · easy`); end-of-session summary and back-to-today CTA.
- **cards** — full card explorer with search and subject filter.
- **cases** — parameterized triage scenarios; the live tutor runs Gemma-4 E2B in WebGPU as a Socratic study assistant.
- **stats** — health bands (healthy / needs attention / not yet seen), 14-day forecast, exam-date setting, export/import.
- **Ctrl+K / ⌘K** — global palette across cards, cases, and guide sections.
- **dark/light/auto** — theme toggle in the topbar; remembered.
- **print** — every page prints cleanly; flashcard backs always shown.

Append `?debug` to any URL for the operator surface (raw scheduler stats, EF averages, atom counts).

## Where your progress lives

Five `localStorage` keys, all under your control:

| Key | What it holds |
| --- | --- |
| `corpus.srs.states` | Per-card SM-2 state (ease, interval, due date, history) |
| `corpus.srs.config` | Exam date |
| `corpus.progress.v1` | Streak, daily goal, today's counters, last-60-days history |
| `corpus.guide.v1` | Per-subject "I understand this" ticks on guide sections |
| `corpus.theme.v1` | `light` · `dark` · `auto` |

Stats → settings → **export your data** downloads a JSON snapshot. **import data** restores it.

## Streak policy

- Each day you grade at least one card or work at least one case, the streak rolls forward.
- Two consecutive active days → streak goes up by 1.
- One missed day resets the streak to 1 the next time you study (no grace day).
- The streak is local-time, computed against your browser's `toISOString()` date.

## Build steps

The site is buildless in the browser — vanilla ESM, no bundler. Two scripts populate `site/data/`:

```bash
node scripts/build_data.js       # rebuilds shards + manifest from corpus YAML/markdown
node scripts/build_guides.js     # regenerates concise/<subject>_study_guide.md
```

## Tests

```bash
node test.js
```

One integration test under 200 lines covering deterministic IDs, scheduler invariants, persistence, the triage disclosure gate, student-mode chrome, theme/print/a11y, search index, progress streak math, service worker, and per-route titles.

## License

Personal study workspace. SRS card content authored by the corpus owner; transcript/book artifacts archived to `C:/medbak/<subject>/` are not redistributed.
