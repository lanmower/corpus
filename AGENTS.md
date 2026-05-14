# AGENTS.md — Medical Study Corpus (D:/corpus)

> Extended knowledge extracted to `C:/Users/user/.claude/projects/D--corpus/memory/` (design-system, modules-api, storage-keys, build-pipeline, srs-algorithm, triage-system, ia-nav, test-discipline).

## Session Changes (2026-05-12)

**Scheduler subject toggles**: `site/schedule.js` exports `setSubjectList(list)`; `app.js` seeds SUBJECTS from manifest at runtime. `corpus.schedule.config.v1` grows an `enabled` map (default true per subject). `allocateSubjects(weights, dueCounts, daysToExam, enabled)` skips subjects where `enabled[s] === false` — cram mode targets a chosen subset. Settings UI `renderScheduleConfigPanel` adds on/off chip per subject beside the weight slider; disabled rows grey out and the slider is disabled.

**Paediatrics + paediatrics-neonatal added**: `syllabus/cmed4-2026/syllabus.json` now lists 10 subjects (was 8). Both new dirs have srs-cards, study_guide.md, triage_scenarios.yml, infographics, videos, audio-deepdive. `manifest.json` has `videoCount`/`audioCount` for all 10. Build pipeline auto-picks them up.

**Media compression**: `scripts/compress_media.js` batches ffmpeg — audio → Opus 48k VBR mono (voip profile); video → AV1 350k + Opus 48k mono in `.webm`. Idempotent (skips if compressed sibling exists). `--replace` deletes originals. Preflight checks for libaom-av1 + libopus.

**build_data.js**: Accepts `.opus` audio and `.webm` video. New `preferCompressed(files, ext)` helper dedupes when both source and compressed siblings exist (drops the uncompressed). Audio regex includes opus; video regex includes webm + mkv.

**Repo size**: Original `.m4a`/`.mp4` sources removed from HEAD's working tree; compressed assets shipped instead (~500MB vs 2.6GB). LFS history retains old blobs but new clones won't fetch them. Squash commit `c17a990` force-pushed to `origin/master`.

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