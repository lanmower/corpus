# Changelog

## 2026-06-10

### Changed
- Split two pure leaf clusters out of the 2923-line `site/app.js` god-module into their own single-focus modules along the existing composition spine: `site/markdown.js` (guide markdown renderer + disfluency/typo polish + soft-split — depends only on `icons.js`) and `site/clipboard.js` (`copyToClipboard` + execCommand fallback — depends only on `toast.js`). `app.js` now imports the two functions it actually calls; behavior is unchanged (browser-witnessed: live guide renders headings/paragraphs/lists/tutor-affordance, zero console errors), and the test suite now exercises the real modules instead of source-slicing app.js.
- Bumped the `anentrypoint-design` SDK bundle (`site/247420.{js,css}`) to v0.0.198 — corpus was shipping the stale v0.0.197 JS; the upstream responsive desk/tablet/mobile layer and ShortcutHelpDialog label render are now included. Browser-witnessed: SDK mounts with `.ds-247420` scope, zero console errors, consumed AICat/Topbar signatures unaffected.

### Fixed
- Triage auto grading-turn now routes through a single `postGenerate()` helper that resets the worker KV cache and stamps a requestId, instead of posting `{type:'generate'}` directly — the grading turn used to run against a populated cache (canned output) and accept stale replies, bypassing the documented turn contract.
- Triage capability messaging, model-download progress, and the case-load error+retry panel now flow through `state` and render in the SDK-mounted DOM the user actually sees — they previously wrote to static `#scenario-list`/`#model-detail`/`#progress` nodes that `sdk.mount()` had detached, so the WebGPU-absent guidance, the ~250MB download progress, and the offline error never reached the screen on the normal SDK path. All `els.*` writes are now null-guarded.
- `tutor-store.saveConfig` merges over the persisted config (`{...loadConfig(), ...config}`) like its `srs`/`schedule` twins, so a partial write no longer silently resets the sibling fields it omits.
- Search prose anchors (`subject#L<n>`) now use a true source-line offset scan, so a guide body with a 3-or-more newline gap no longer drifts the deep-link target off-position.
- Offline triage grade now reports its percentage over the full scenario atom count (the same denominator `set_phase` uses for the persisted grade), so the chat blurb and the grade panel no longer show conflicting scores for the 29 scenarios with more than six atoms.
- Tutor daily check-in slot is consumed only once a plan actually rendered — an empty, interrupted, or tool-only reply no longer burns the day's single proactive check-in and leaves the coach silent until the next local-midnight rollover (both the daily-syllabus walk and the session-overview greeting).
- `scripts/build_data.js` now imports the syllabus-root/subject resolver from `scripts/syllabus.js` instead of duplicating it, restoring the documented single-owner contract so a layout change reaches both the shard build and the Anki export.
- Removed the unused `ICON.play` glyph from `site/icons.js` (the lightbox uses a native `<video>` element).
- Triage live coach now resets the shared worker KV cache before each turn — it re-feeds the full prompt every turn, so a reused populated cache double-counted the prefix and produced the same canned reply to every input.
- Triage generation carries a requestId and the consumer drops replies whose requestId is stale, so an interrupted generation's late "complete" can no longer resolve the next turn.
- Triage case-data load degrades to an error + retry panel instead of stalling forever on "loading cases…" when offline or interrupted mid-download.
- Removed a dead `gpu-info` worker-message branch (never emitted) and an unused `searchSnippet` import in app.js.
- Tutor daily-syllabus walk uses a dedicated caught-up prompt when today's plan has no actionable blocks, so the coach no longer tries to "present the first step" of an empty plan.
- Chat conversation region is now `role="log"` with `aria-atomic="false"`, so assistive tech announces appended messages as a conversation log.
- Tutor settings popover is now a `role="dialog"` modal with a Tab focus trap (Escape and outside-click still close it).
- Malformed-JSON and unknown-action tool blocks now log a warning instead of being silently dropped (still no-throw).
- Daily check-in re-arms on local-date rollover, so a tab left open past midnight still fires the next day's check-in.
- `saveConfig` returns its persist result so callers can detect a quota-rejected config write.
- Collapse toggle exposes `aria-expanded` from first render (not only after the first responsive-width pass).

## 2026-05-07

### Fixed
- Link colors now use design system tokens (--ink for chrome, --link for in-prose)
- First-time visitors see a welcome message explaining the corpus
- Exam countdown now shows "X days to exam" instead of just "Xd"
- Online status shows "online" instead of "ready" for clarity

### Changed
- Added `corpus.welcome.dismissed` localStorage key for welcome message dismissal
- Improved first-time visitor experience with onboarding context
