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
- Files: `index.html`, `style.css`, `app.js`, `srs.js`
- Data: `data/` shards + `data/manifest.json`
- Server: `node D:/corpus/scripts/serve.js` listens on port 8765

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
