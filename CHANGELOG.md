# Changelog

## 2026-06-10

### Changed
- Bumped the `anentrypoint-design` SDK bundle (`site/247420.{js,css}`) to v0.0.198 — corpus was shipping the stale v0.0.197 JS; the upstream responsive desk/tablet/mobile layer and ShortcutHelpDialog label render are now included. Browser-witnessed: SDK mounts with `.ds-247420` scope, zero console errors, consumed AICat/Topbar signatures unaffected.

### Fixed
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
