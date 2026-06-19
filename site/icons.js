// Shared inline-SVG icon set. currentColor-themed (inherits text color, so they
// theme for free under light/dark/contrast), crisp at any DPI, and free of the
// Unicode-glyph tells that decorative characters carry. Each entry is an <svg>
// string sized to the surrounding em-box; callers inject via innerHTML / template.
//
// Mirrors the ICONS map in tutor-panel.js (kept separate so the worker-free app
// modules don't pull in the tutor panel). Add new icons here, not inline.

const svg = (body, w = 14, h = 14) =>
    `<svg viewBox="0 0 16 16" width="${w}" height="${h}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
    // right arrow — "go / resume / continue"
    arrowRight: svg('<path d="M3 8h10"/><path d="M9 4l4 4-4 4"/>'),
    // left arrow — "back"
    arrowLeft: svg('<path d="M13 8H3"/><path d="M7 4L3 8l4 4"/>'),
    // up arrow — "back to top"
    arrowUp: svg('<path d="M8 13V3"/><path d="M4 7l4-4 4 4"/>'),
    // check — "read / done"
    check: svg('<path d="M3 8.5l3.2 3.2L13 5"/>'),
    // hollow circle — "not done"
    circle: svg('<circle cx="8" cy="8" r="5.2"/>'),
    // filled tick dot — triage "placed enough"
    dot: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="5"/></svg>',
    // diamond outline — triage "not yet"
    diamond: svg('<path d="M8 2.5 13.5 8 8 13.5 2.5 8 8 2.5Z"/>'),
    // filled flag — "flagged"
    flag: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><path d="M4 14V3"/><path d="M4 3.5h7.5l-1.5 2.5 1.5 2.5H4Z"/></svg>',
    // hollow flag — "not flagged"
    flagOutline: svg('<path d="M4 14V3"/><path d="M4 3.5h7.5l-1.5 2.5 1.5 2.5H4Z"/>'),
    // gear — "settings"
    gear: svg('<circle cx="8" cy="8" r="2.2"/><path d="M8 1.4v1.6M8 13v1.6M3.1 3.1l1.1 1.1M11.8 11.8l1.1 1.1M1.4 8h1.6M13 8h1.6M3.1 12.9l1.1-1.1M11.8 4.2l1.1-1.1"/>', 14, 14),
    // question mark in a circle — "ask the tutor"
    help: svg('<circle cx="8" cy="8" r="6"/><path d="M6.3 6.2a1.7 1.7 0 0 1 3.3.5c0 1.1-1.6 1.4-1.6 2.5"/><path d="M8 11.4h.01"/>'),
    // open book — "open subject guide"
    book: svg('<path d="M8 4v9"/><path d="M8 4C6.5 3 4 3 2.5 3.5v8C4 11 6.5 11 8 12c1.5-1 4-1 5.5-.5v-8C12 3 9.5 3 8 4Z"/>'),
    // x — "close / dismiss"
    close: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
    // skip-forward — "skip card"
    skip: svg('<path d="M4 4l5 4-5 4z"/><path d="M11.5 4v8"/>'),
    // microphone — "hold to talk" (push-to-talk voice input)
    mic: svg('<rect x="6" y="2" width="4" height="7" rx="2"/><path d="M4 8a4 4 0 0 0 8 0"/><path d="M8 12v2.5"/>'),
    // speaker with waves — "voice replies on"
    soundOn: svg('<path d="M3 6.5v3h2L8 12V4L5 6.5H3Z"/><path d="M10.5 6a2.5 2.5 0 0 1 0 4"/><path d="M12.2 4.4a5 5 0 0 1 0 7.2"/>'),
    // speaker muted — "voice replies off"
    soundOff: svg('<path d="M3 6.5v3h2L8 12V4L5 6.5H3Z"/><path d="M11 6.5l3 3M14 6.5l-3 3"/>'),
    // circular-arrow — "new conversation" (tutor panel)
    new: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.5 2.5V5H11"/></svg>',
    // overlapping-squares — "copy"
    copy: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.3"/><path d="M10.5 5.5V3.8A1.3 1.3 0 0 0 9.2 2.5H3.8A1.3 1.3 0 0 0 2.5 3.8v5.4a1.3 1.3 0 0 0 1.3 1.3h1.7"/></svg>',
    // counter-clockwise arrow — "retry / regenerate"
    retry: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 8a5.5 5.5 0 1 1 1.6 3.9"/><path d="M2.5 13.5V11H5"/></svg>',
    // filled square — "stop generation"
    stop: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="1.4"/></svg>',
    // chevron pointing left — "collapse panel"
    chevronLeft: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>',
    // chevron pointing right — "expand panel"
    chevronRight: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>',
    // rotating arc — "loading / thinking"
    spinner: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" class="tutor-spin"><path d="M8 2a6 6 0 1 0 6 6" opacity="0.9"/></svg>',
    // triangle with exclamation — "warning / unavailable"
    warn: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.2 14.5 13.5H1.5L8 2.2Z"/><path d="M8 6.5v3M8 11.5v.01"/></svg>'
};
