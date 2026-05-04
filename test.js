// Integration test — scheduler + IDs + persistence + shard integrity.
// Plain assertions, real data, real system. Run: node test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { stableCardId } = require('./scripts/build_data.js');

const ROOT = __dirname;
let pass = 0, fail = 0;
const t = (name, fn) => {
    try { fn(); console.log('  PASS', name); pass++; }
    catch (e) { console.log('  FAIL', name, '-', e.message); fail++; }
};

// ── shim browser globals so srs.js loads as ESM in node ──
global.localStorage = (() => {
    const store = new Map();
    return {
        getItem: k => store.has(k) ? store.get(k) : null,
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k),
        clear: () => store.clear(),
        get _store() { return store; }
    };
})();

(async () => {
    const srs = await import('./site/srs.js');

    console.log('# stable-card-ids');
    t('IDs are deterministic across calls', () => {
        const a = stableCardId('cardiology', 'What is CAD?', 'src1');
        const b = stableCardId('cardiology', 'What is CAD?', 'src1');
        assert.strictEqual(a, b);
    });
    t('different fronts yield different IDs', () => {
        const a = stableCardId('cardiology', 'What is CAD?', 'src1');
        const b = stableCardId('cardiology', 'What is MI?', 'src1');
        assert.notStrictEqual(a, b);
    });
    t('ID format is subject-<10hex>', () => {
        const id = stableCardId('cardiology', 'X', 'src');
        assert.match(id, /^cardiology-[0-9a-f]{10}$/);
    });
    t('shards have all-unique IDs across corpus', () => {
        const all = new Set();
        const subjects = ['cardiology','diabetes','endocrine','gastroenterology','geriatric','nephrology','pulmonology','rheumatology'];
        for (const s of subjects) {
            const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/data', `${s}.json`), 'utf8'));
            for (const c of data.cards) {
                assert.ok(c.id.startsWith(s + '-') || c.id.startsWith(s + '_'), `bad prefix: ${c.id}`);
                assert.ok(!all.has(c.id), `duplicate id: ${c.id}`);
                all.add(c.id);
                assert.ok(c.front && c.front.length > 0, 'empty front');
            }
        }
        assert.ok(all.size >= 1900, `expected ≥1900 cards, got ${all.size}`);
    });

    console.log('# scheduler-sm2');
    t('calcSM2 grade <3 resets repetitions to 0', () => {
        const next = srs.calcSM2(srs.defaultCardState(), 1);
        assert.strictEqual(next.repetitions, 0);
        assert.strictEqual(next.interval, 1);
    });
    t('calcSM2 grade=5 first rep → interval=1', () => {
        const next = srs.calcSM2(srs.defaultCardState(), 5);
        assert.strictEqual(next.repetitions, 1);
        assert.strictEqual(next.interval, 1);
    });
    t('calcSM2 grade=5 second rep → interval=6', () => {
        const next = srs.calcSM2({ ...srs.defaultCardState(), repetitions: 1, interval: 1 }, 5);
        assert.strictEqual(next.interval, 6);
    });
    t('calcSM2 grade=5 raises easeFactor', () => {
        const next = srs.calcSM2(srs.defaultCardState(), 5);
        assert.ok(next.easeFactor > 2.5);
    });
    t('calcSM2 easeFactor floor 1.3', () => {
        const next = srs.calcSM2({ ...srs.defaultCardState(), easeFactor: 1.3 }, 3);
        assert.ok(next.easeFactor >= 1.3);
    });

    console.log('# scheduler-learning-steps');
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    t('new card grade=3 → still learning step 1, ~10min due', () => {
        const s = srs.schedule(srs.defaultCardState(), 3, now, () => 0.5);
        assert.strictEqual(s.phase, 'learning');
        assert.strictEqual(s.learningStep, 1);
        assert.ok(s.dueAt - now <= 11 * 60000 && s.dueAt - now >= 9 * 60000);
    });
    t('learning step 1 + grade=4 → graduates to review', () => {
        const start = { ...srs.defaultCardState(), phase: 'learning', learningStep: 1 };
        const s = srs.schedule(start, 4, now, () => 0.5);
        assert.strictEqual(s.phase, 'review');
        assert.ok(s.interval >= 1);
    });
    t('review-phase grade<3 increments lapses', () => {
        const start = { ...srs.defaultCardState(), phase: 'review', repetitions: 5, interval: 30, lapses: 0 };
        const s = srs.schedule(start, 1, now);
        assert.strictEqual(s.lapses, 1);
        assert.strictEqual(s.phase, 'learning');
    });
    t('leech flag fires at 8 lapses', () => {
        const start = { ...srs.defaultCardState(), phase: 'review', lapses: 7 };
        const s = srs.schedule(start, 0, now);
        assert.strictEqual(s.lapses, 8);
        assert.strictEqual(s.isLeech, true);
    });
    t('history accumulates with capped length', () => {
        let s = srs.defaultCardState();
        for (let i = 0; i < 60; i++) s = srs.schedule(s, 4, now + i * 60000, () => 0.5);
        assert.ok(s.history.length <= 50, `len=${s.history.length}`);
    });

    console.log('# scheduler-fuzz');
    t('fuzzInterval keeps short intervals exact', () => {
        assert.strictEqual(srs.fuzzInterval(1, () => 0), 1);
    });
    t('fuzzInterval applies ±5% on longer intervals', () => {
        const samples = [];
        for (let i = 0; i < 20; i++) samples.push(srs.fuzzInterval(100, Math.random));
        const min = Math.min(...samples), max = Math.max(...samples);
        assert.ok(min >= 94 && max <= 106, `fuzz out of band: ${min}-${max}`);
    });

    console.log('# persistence');
    t('save → load roundtrip preserves states', () => {
        global.localStorage.clear();
        const states = { 'card-1': { ...srs.defaultCardState(), interval: 7 } };
        srs.saveStates(states);
        const loaded = srs.loadStates();
        assert.strictEqual(loaded['card-1'].interval, 7);
    });
    t('legacy v0 payload migrates to v1', () => {
        global.localStorage.clear();
        // v0 = bare {id: state} map without {version, states}
        global.localStorage.setItem('corpus.srs.states', JSON.stringify({
            'legacy-card': { easeFactor: 2.5, interval: 5, repetitions: 2, dueDate: '2026-01-01', lastScore: 4 }
        }));
        const loaded = srs.loadStates();
        assert.ok(loaded['legacy-card']);
        assert.strictEqual(loaded['legacy-card'].interval, 5);
        // re-save normalizes
        const raw = global.localStorage.getItem('corpus.srs.states');
        assert.ok(raw.includes('"version"'));
    });
    t('export → import roundtrip', () => {
        global.localStorage.clear();
        srs.saveStates({ 'x': { ...srs.defaultCardState(), interval: 13 } });
        const blob = srs.exportState();
        global.localStorage.clear();
        srs.importState(blob);
        assert.strictEqual(srs.loadStates()['x'].interval, 13);
    });

    console.log('# stats');
    t('getScheduleStats buckets by phase/interval', () => {
        global.localStorage.clear();
        const states = {
            a: { ...srs.defaultCardState(), phase: 'learning' },
            b: { ...srs.defaultCardState(), phase: 'review', interval: 5 },
            c: { ...srs.defaultCardState(), phase: 'review', interval: 30 }
        };
        srs.saveStates(states);
        const st = srs.getScheduleStats(['a','b','c','d']);
        assert.strictEqual(st.learning, 1);
        assert.strictEqual(st.young, 1);
        assert.strictEqual(st.mature, 1);
        assert.strictEqual(st.new, 1);
    });
    t('getForecast returns N day buckets', () => {
        const fc = srs.getForecast([], 14);
        assert.strictEqual(fc.length, 14);
    });

    console.log(`\n${pass} pass · ${fail} fail`);
    process.exit(fail === 0 ? 0 : 1);
})();
