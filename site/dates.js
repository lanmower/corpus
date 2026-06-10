// Shared LOCAL day-key helpers. Every daily rollover in the app (schedule,
// new-card cap, check-in gate, streak, today counters, srs due dates) must key
// on the LOCAL calendar date: a UTC key rolls the day at the wrong hour for any
// user not on UTC (east of UTC gets yesterday's plan after local midnight; west
// of UTC gets tomorrow's stamp before the day ends).

export function localDayISO(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Local-calendar arithmetic: parse and re-format in the SAME calendar, so the
// result advances exactly n days in every timezone (a UTC-midnight parse fed to
// a local formatter returns the same day for any user west of UTC).
export function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    return localDayISO(new Date(y, m - 1, d + n));
}

// Whole-day offset between two YYYY-MM-DD keys (UTC parse on both sides keeps
// the difference exact and DST-proof).
export function dayOffset(a, b) {
    return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}
