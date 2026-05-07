# AGENTS.md — Medical Study Corpus (D:/corpus)

> Extended knowledge extracted to `C:/Users/user/.claude/projects/D--corpus/memory/` (design-system, modules-api, storage-keys, build-pipeline, srs-algorithm, triage-system, ia-nav, test-discipline).

## Corpus Structure

D:/corpus is the root of a medical study corpus for CMED4IIM1/IIM2 covering 8 subjects: cardiology, diabetes, endocrine, gastroenterology, geriatric, nephrology, pulmonology, rheumatology.

Active directories per subject:
- `<subject>/srs-cards/` — canonical YAML flashcards (see Anki schema below)
- `<subject>/study_guide.md` — rewritten study guide (featured site artifact)
- `<subject>/infographics/*.png` — infographic gallery
- `<subject>/videos/*.mp4` + `<subject>/videos.json` — lecture videos (git-lfs)
- `<subject>_triage_scenarios.yml` — clinical triage scenarios

Archived (offline, not read by build): `D:/medbak/<subject>/audio-transcripts/` and `D:/medbak/<subject>/book-texts/`.

## Statistics
- 2551 SRS cards · 901 reasoning atoms · 68 triage scenarios · 202 study-guide sections · 934 KB prose

## Build Commands
```bash
node D:/corpus/scripts/serve.js          # dev server on port 8765 (COOP/COEP headers)
node D:/corpus/scripts/build_data.js     # build site/data/ shards from srs-cards + guides + triage
node D:/corpus/scripts/anki_export.js   # emit exports/corpus-anki.txt (TSV, Anki-importable)
node D:/corpus/scripts/anki_migrate.js  # one-shot: normalize srs-cards to canonical schema
node D:/corpus/test.js                   # run tests (200-line cap, 16/16 green as of 2026-05-07)
```

## Anki Canonical Schema (all srs-cards/*.yml)
```yaml
deck: "Corpus::<Subject>::<Topic>"
notes:
  - guid: <16-char sha1 of subject+front+back>
    noteType: Basic           # or Cloze when {{c1::...}} present
    deck: "Corpus::<Subject>::<Topic>"
    fields:
      Front: "..."
      Back: "..."
    tags: ["userTag", "subject:<subject>", "difficulty:<medium>", "source:<src>"]
```

## Site Modules (site/)
`app.js` · `srs.js` · `style.css` · `index.html` · `sw.js` · `manifest.webmanifest`
`triage-live.html` · `triage-live.js` · `triage-live.css` · `triage-llm-worker.js`
`theme.js` · `progress.js` · `search.js` · `toast.js` · `verdicts.js`
`cram.js` · `lastpos.js` · `justread.js` · `timer.js` · `plan.js`
`mistakes.js` · `drill.js` · `flag.js` · `undo.js` · `usercards.js`
`confidence.js` · `late.js`

Deleted (gamification stripped 2026-05-07): `game.js`, `confetti.js`
Deleted (quests/badges/notes 2026-05-06): `quests.js`, `badges.js`, `notes.js`

## localStorage Keys
`corpus.theme.v1` · `corpus.progress.v1` · `corpus.srs.states` · `corpus.srs.config`
`corpus.guide.v1` · `corpus.cram.dismissed.v1` · `corpus.lastpos.v1` · `corpus.justread.v1`
`corpus.triage.v1` · `corpus.timer.v1` · `corpus.plan.v1` · `corpus.mistakes.v1`
`corpus.drill.v1` · `corpus.flagged.v1` · `corpus.usercards.v1` · `corpus.confidence.v1`

## Topbar Nav & Routes
Nav: `today | guides | review | cases | stats | mistakes | settings | tutor`
ROUTE_ALIASES: `home→today`, `triage→cases`, `subjects→guides`, `cards→review`, `quests/badges/notes→today`

## Repository State
- Git identity: `lanmower` (almagestfraternite@gmail.com)
- GitHub remote: `https://github.com/lanmower/corpus.git` (origin)
- Branch: master (main)
- GitHub Pages: `https://lanmower.github.io/corpus/` via `.github/workflows/pages.yml`
- SW cache key: auto-versioned (`__BUILD_VERSION__` replaced at deploy; local = `dev-<Date.now()>`)
- LFS: `*.mp4` tracked via git-lfs; Pages workflow runs `git lfs pull` before build
