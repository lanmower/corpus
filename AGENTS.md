# AGENTS.md — Medical Study Corpus (D:/corpus)

> Extended knowledge extracted to `C:/Users/user/.claude/projects/D--corpus/memory/` (design-system, modules-api, storage-keys, build-pipeline, srs-algorithm, triage-system, ia-nav, test-discipline).

## Session Changes (2026-05-08)

**Daily quota system unified**: Study target derives from schedule plan with `gradedBySubject` tracking in `progress.v1`. Late-session quota via `reducedQuota(base, level, isAhead)` — if ahead of schedule (`isAhead`), maintain full pace.

**Schedule lazy regeneration**: `getSchedule({regenerateIfStale})` only rebuilds when date changes. Plan stored in `corpus.schedule.v1` with `corpus.schedule.config.v1` for config.

**Readiness-adjusted mastery**: `mastery.js` computes weighted score (cards 40% + sections 30% + cases 20% + mistakes 10%) with exam-pressure adjustment when due backlog exceeds threshold.

## Build Commands

```bash
node D:/corpus/scripts/serve.js          # dev server (port 8765, COOP/COEP headers)
node D:/corpus/scripts/build_data.js     # build site/data/ shards
node D:/corpus/scripts/anki_export.js    # emit exports/corpus-anki.txt
node D:/corpus/scripts/anki_migrate.js   # normalize srs-cards to canonical schema
node D:/corpus/test.js                   # test (200-line cap, 16/16 green)
```

## Site Modules

`app.js` · `srs.js` · `schedule.js` · `mastery.js` · `progress.js` · `newcards.js` · `style.css` · `index.html` · `sw.js`

New: `mastery.js` (readiness-adjusted score), `schedule.js` (deterministic daily planning with reconcile), `timer.js`, `toast.js`, `verdicts.js`, `calendar.js`, `confidence.js`, `late.js`.

Deleted (gamification stripped): `game.js`, `confetti.js`, `quests.js`, `badges.js`, `notes.js`.

## Non-Obvious Caveats

- `node --check` on site/*.js passes even when the browser throws `SyntaxError` on load: browser parses files as ESM/module-worker while node --check parses as CJS script. Use a live browser witness (plugkit `exec --lang browser`) to catch real parse failures — node syntax-check is not sufficient.
- The exec-spool `in/browser/N.js` dispatch reports "plugkit not found in PATH". Route browser execution via `in/bash/N.sh` calling `node <absolute plugkit path> exec --lang browser --session <name> --timeout-ms <ms> '<JS>'` (sessionId required). Plugkit lives under `C:/Users/user/.claude/plugins/cache/gm-cc/gm/<hash>/bin/plugkit.js`.

## Repository State

- Git identity: `lanmower` (almagestfraternite@gmail.com)
- GitHub: `https://github.com/lanmower/corpus.git` (master)
- Pages: `https://lanmower.github.io/corpus/`
- LFS: `*.mp4`, `*.m4a` via git-lfs