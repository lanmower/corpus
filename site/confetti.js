// tiny canvas confetti — ~80 particles, 1.5s, no deps
const COLORS = ['#E2B83A', '#6CA0DC', '#6BB377', '#B077C0', '#FF9D70', '#FF9DC2'];
let firing = false;

function reduceMotion() {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export function fire(opts = {}) {
    if (firing) return;
    if (reduceMotion()) { flashFallback(); return; }
    firing = true;
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const N = opts.count || 80;
    const parts = [];
    for (let i = 0; i < N; i++) {
        parts.push({
            x: canvas.width / 2 + (Math.random() - 0.5) * 80,
            y: canvas.height / 2,
            vx: (Math.random() - 0.5) * 12,
            vy: -Math.random() * 14 - 4,
            r: 3 + Math.random() * 4,
            c: COLORS[i % COLORS.length],
            rot: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.3
        });
    }
    const start = performance.now();
    const dur = 1500;
    function frame(t) {
        const elapsed = t - start;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const p of parts) {
            p.vy += 0.3; p.x += p.vx; p.y += p.vy; p.rot += p.spin;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - elapsed / dur);
            ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
            ctx.restore();
        }
        if (elapsed < dur) requestAnimationFrame(frame);
        else { canvas.remove(); firing = false; }
    }
    requestAnimationFrame(frame);
}

function flashFallback() {
    const f = document.createElement('div');
    f.className = 'confetti-flash';
    f.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle,rgba(226,184,58,0.3),transparent 60%);pointer-events:none;z-index:9999';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 400);
}

if (typeof window !== 'undefined') window.__confetti = { fire };
