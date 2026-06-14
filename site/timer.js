// pomodoro timer — 25/5, persists, no chimes. corpus.timer.v1
const KEY = 'corpus.timer.v1';
const WORK = 25 * 60, BREAK_ = 5 * 60;

function defaults() { return { mode: 'work', remaining: WORK, running: false, startedAt: null, pausedAt: null }; }

export function load() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return defaults();
        const t = JSON.parse(raw);
        // startedAt is the single owner of elapsed time: remaining is derived
        // from wall-clock here, never decremented independently elsewhere.
        // Rollover is left to the caller (tick) so the done event/vibrate fire.
        if (t.running && t.startedAt) {
            const elapsed = Math.floor((Date.now() - t.startedAt) / 1000);
            t.remaining = Math.max(0, t.remaining - elapsed);
            t.startedAt = Date.now();
        }
        return { ...defaults(), ...t };
    } catch { return defaults(); }
}
export function save(t) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch {} }
export function start() { const t = load(); t.running = true; t.startedAt = Date.now(); save(t); return t; }
export function pause() { const t = load(); t.running = false; save(t); return t; }
export function reset() { const t = defaults(); save(t); return t; }
export function toggle() { const t = load(); return t.running ? pause() : start(); }
export function fmt(s) { const m = Math.floor(s / 60), r = s % 60; return `${m}:${String(r).padStart(2, '0')}`; }

export function mount(doc) {
    if (doc.getElementById('pomo')) return;
    const el = doc.createElement('div');
    el.id = 'pomo';
    el.className = 'pomo hidden';
    el.setAttribute('role', 'timer');
    el.setAttribute('aria-label', 'pomodoro timer');
    el.innerHTML = `<span class="pomo-mode" id="pomo-mode">work</span><span class="pomo-time" id="pomo-time">25:00</span><button class="chip" id="pomo-toggle">start</button><button class="chip" id="pomo-reset" aria-label="reset">reset</button><button class="chip" id="pomo-close" aria-label="close">close</button>`;
    doc.body.appendChild(el);
    const mode = el.querySelector('#pomo-mode'), time = el.querySelector('#pomo-time'),
        tog = el.querySelector('#pomo-toggle'), rs = el.querySelector('#pomo-reset'), cl = el.querySelector('#pomo-close');
    function tick() {
        const t = load();
        mode.textContent = t.mode;
        time.textContent = fmt(t.remaining);
        tog.textContent = t.running ? 'pause' : 'start';
        if (t.running) {
            if (t.remaining <= 0) {
                const wasWork = t.mode === 'work';
                t.mode = wasWork ? 'break' : 'work';
                t.remaining = t.mode === 'work' ? WORK : BREAK_;
                t.running = false; save(t);
                time.textContent = fmt(t.remaining); mode.textContent = t.mode; tog.textContent = 'start';
                if (navigator.vibrate) navigator.vibrate(200);
                if (wasWork) { try { window.dispatchEvent(new CustomEvent('pomodoro:done')); } catch {} }
            }
            // No per-second persist: load() reconstructs `remaining` from the
            // wall-clock startedAt, so the running tick needs no write. We persist
            // only on state transitions (start/pause/reset) and on rollover above.
            // This avoids a 1 Hz synchronous localStorage write that, via app.js's
            // storage listener, drives a full-route re-render in every other tab.
        }
    }
    // Only run the 1 Hz tick while the panel is visible. The panel mounts hidden,
    // so the clock/IO cost is paid only when the user actually has it open; on
    // re-show, load() reconstructs `remaining` from wall-clock so no time is lost.
    let timerId = null;
    function startTicking() { if (!timerId) { timerId = setInterval(tick, 1000); } tick(); }
    function stopTicking() { if (timerId) { clearInterval(timerId); timerId = null; } }
    tog.addEventListener('click', () => { toggle(); tick(); });
    rs.addEventListener('click', () => { reset(); tick(); });
    cl.addEventListener('click', () => { el.classList.add('hidden'); stopTicking(); });
    const show = () => { el.classList.remove('hidden'); startTicking(); };
    const hide = () => { el.classList.add('hidden'); stopTicking(); };
    return { show, hide,
        toggleVis: () => { el.classList.toggle('hidden'); el.classList.contains('hidden') ? stopTicking() : startTicking(); } };
}

if (typeof window !== 'undefined') window.__timer = { load, save, start, pause, reset, toggle, fmt };



