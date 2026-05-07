# corpus — your medical study workspace

A local, private, browser-only study workspace for eight medical subjects: cardiology, diabetes, endocrine, gastroenterology, geriatric, nephrology, pulmonology, rheumatology.

2551 flashcards, 68 clinical cases with a Socratic WebGPU tutor, eight rewritten study guides (~934 KB of prose), spaced-repetition review with SM-2, a schedule-driven daily plan that reconciles ahead/behind work, and a global search palette. No account, no server-side state, no telemetry — everything is in your browser.

## Run it

```bash
node scripts/serve.js
# → http://127.0.0.1:8765
```

The dev server adds COOP/COEP headers so the WebGPU LLM in the live tutor (`triage-live.html`) can use SharedArrayBuffer.

A service worker caches the shell + manifest + shards on first visit, so once you've loaded the site you can review on the train. The PWA manifest (`site/manifest.webmanifest`) lets you install corpus as a desktop or mobile app.

## What you get

- **today** (the landing) — workspace hero, status line (`YYYY-MM-DD · M due · X reviewed today`), today's schedule checklist with click-through to each block, daily-plan summary, recommended cases, subject grid, last-7-days sparkline.
- **guides** — eight rewritten study guides in a grid, each card showing section count, KB size, ~min read, mastery%.
- **subject** — full study-guide prose with section checkboxes, mastery bar, infographics, audio deep-dive, lecture video (where present), flashcards, case list.
- **review** — spaced repetition with friendly four-grade buttons (`again · hard · good · easy`); review-progress line, end-of-session summary, undo last grade with `u`.
- **cases** — parameterized triage scenarios; the live tutor runs Gemma-4 E2B in WebGPU as a Socratic study assistant with a phase-gated disclosure (Socratic in `asking`, atom-grader in `grading`).
- **stats** — exam-readiness verdict table per subject (cold / weak / getting there / solid), 14-day forecast, this-week vs last, exam-date setting, export/import.
- **calendar** — month grid; click a day to see its blocks and minutes.
- **mistakes** — last 50 cards graded ≤2, grouped by subject, "review all" bridges into the review queue.
- **settings** — schedule config (block size, daily caps, regenerate from current due counts), exam date, export/import, reset.
- **Ctrl+K / ⌘K** — global palette across cards, cases, guide sections, and guide prose.
- **dark / light / contrast / auto** — theme toggle in the topbar; remembered.
- **print** — every page prints cleanly; flashcard backs always shown.

Append `?debug` to any URL for the operator surface (raw scheduler stats, EF averages, atom counts, schema versions). `?debug=webgpu` on triage-live exposes the worker telemetry panel.

## Schedule-driven SRS

The daily plan isn't a fixed queue — it's a reconciliation. Each morning `schedule.regenerate({ dueCounts })` lays out study blocks against your configured time budget. As you work through the day, `schedule.reconcile({ actualBySubject })` watches what you actually did. Anything you fell short on rolls into tomorrow with a `↻ rolled over` note; anything you got ahead on credits forward with `✓ ahead by N`. There are no gates — every subject and section is reachable any time. The schedule is a recommendation, not a lock.

## Where your progress lives

Seventeen `localStorage` keys under `corpus.*`, all under your control. A few of the load-bearing ones:

| Key | What it holds |
| --- | --- |
| `corpus.srs.states` | Per-card SM-2 state (ease, interval, due timestamp, history) |
| `corpus.srs.config` | Exam date |
| `corpus.schedule.v1` | Today's blocks + reconciliation surplus/rollover |
| `corpus.progress.v1` | Streak, daily goal, today's counters, last-60-days history |
| `corpus.guide.v1` | Per-subject "I understand this" ticks on guide sections |
| `corpus.theme.v1` | `light` · `dark` · `contrast` · `auto` |
| `corpus.mistakes.v1` | Last 200 mistakes for the mistake log |
| `corpus.flagged.v1` | Cards flagged with `f` for later |
| `corpus.usercards.v1` | Personal cards added with `+` |

Stats → settings → **export your data** downloads a JSON snapshot. **import data** restores it.

## Streak policy

- Each day you grade at least one card or work at least one case, the streak rolls forward.
- Two consecutive active days → streak goes up by 1.
- One missed day resets the streak to 1 the next time you study (no grace day).
- Post-midnight grace: study between 0:00 and 6:00 attributes back to the prior calendar date so a late session doesn't reset a streak.

## Build steps

The site is buildless in the browser — vanilla ESM, no bundler. Three scripts populate `site/data/`:

```bash
node scripts/build_data.js       # rebuilds shards + manifest from corpus YAML/markdown
node scripts/build_guides.js     # regenerates <subject>/study_guide.md
node scripts/build_triage.js     # regenerates per-subject triage scenarios
```

Source materials (audio transcripts, book texts) are archived offline at `D:/medbak/<subject>/`; the site reads only the rewritten artifacts: `<subject>/study_guide.md`, `<subject>/srs-cards/`, `<subject>/infographics/`, `<subject>/audio-deepdive/`, `<subject>/videos/`, `<subject>_triage_scenarios.yml`.

## Tests

```bash
node test.js
```

One integration test under 200 lines, real data, real system — covers data integrity, scheduler invariants, schedule reconcile, persistence, triage disclosure gate, student-mode chrome, theme/print/a11y, search index, progress streak math, service worker shell, and PWA manifest.

## License

Personal study workspace. SRS card content authored by the corpus owner; transcript and book artifacts archived at `D:/medbak/<subject>/` are not redistributed.
