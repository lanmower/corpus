// Integration test — scheduler + IDs + persistence + shard integrity + triage gate.
// Plain assertions, real data, real system. Run: node test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const { stableCardId } = require('./scripts/build_data.js');

const ROOT = __dirname;
let pass = 0, fail = 0;
const t = (name, fn) => {
    try { fn(); console.log('  PASS', name); pass++; }
    catch (e) { console.log('  FAIL', name, '-', e.message); fail++; }
};

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

const SUBJECTS = ['cardiology','diabetes','endocrine','gastroenterology','geriatric','nephrology','pulmonology','rheumatology'];

(async () => {
    const srs = await import('./site/srs.js');

    console.log('# ids+shards');
    t('stableCardId deterministic + format + cross-shard uniqueness', () => {
        const a = stableCardId('cardiology', 'What is CAD?', 'src1');
        assert.strictEqual(a, stableCardId('cardiology', 'What is CAD?', 'src1'));
        assert.notStrictEqual(a, stableCardId('cardiology', 'What is MI?', 'src1'));
        assert.match(stableCardId('cardiology', 'X', 'src'), /^cardiology-[0-9a-f]{10}$/);
        const all = new Set();
        for (const s of SUBJECTS) {
            const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/data', `${s}.json`), 'utf8'));
            for (const c of data.cards) {
                assert.ok(c.id.startsWith(s + '-') || c.id.startsWith(s + '_'), `bad prefix: ${c.id}`);
                assert.ok(!all.has(c.id), `duplicate id: ${c.id}`);
                all.add(c.id);
                assert.ok(c.front && c.front.length > 0, 'empty front');
            }
        }
        assert.ok(all.size >= 1900, `≥1900 cards expected, got ${all.size}`);
    });

    console.log('# scheduler');
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    t('SM2 grade<3 resets, grade=5 step+ease, ease floor 1.3', () => {
        let n = srs.calcSM2(srs.defaultCardState(), 1);
        assert.strictEqual(n.repetitions, 0); assert.strictEqual(n.interval, 1);
        n = srs.calcSM2(srs.defaultCardState(), 5);
        assert.strictEqual(n.repetitions, 1); assert.strictEqual(n.interval, 1);
        assert.ok(n.easeFactor > 2.5);
        n = srs.calcSM2({ ...srs.defaultCardState(), repetitions: 1, interval: 1 }, 5);
        assert.strictEqual(n.interval, 6);
        n = srs.calcSM2({ ...srs.defaultCardState(), easeFactor: 1.3 }, 3);
        assert.ok(n.easeFactor >= 1.3);
    });
    t('learning steps + leech + lapses + history cap', () => {
        let s = srs.schedule(srs.defaultCardState(), 3, now, () => 0.5);
        assert.strictEqual(s.phase, 'learning'); assert.strictEqual(s.learningStep, 1);
        assert.ok(s.dueAt - now <= 11 * 60000 && s.dueAt - now >= 9 * 60000);
        s = srs.schedule({ ...srs.defaultCardState(), phase: 'learning', learningStep: 1 }, 4, now, () => 0.5);
        assert.strictEqual(s.phase, 'review'); assert.ok(s.interval >= 1);
        s = srs.schedule({ ...srs.defaultCardState(), phase: 'review', repetitions: 5, interval: 30, lapses: 0 }, 1, now);
        assert.strictEqual(s.lapses, 1); assert.strictEqual(s.phase, 'learning');
        s = srs.schedule({ ...srs.defaultCardState(), phase: 'review', lapses: 7 }, 0, now);
        assert.strictEqual(s.lapses, 8); assert.strictEqual(s.isLeech, true);
        let h = srs.defaultCardState();
        for (let i = 0; i < 60; i++) h = srs.schedule(h, 4, now + i * 60000, () => 0.5);
        assert.ok(h.history.length <= 50);
    });
    t('fuzzInterval short=exact + long=±5%', () => {
        assert.strictEqual(srs.fuzzInterval(1, () => 0), 1);
        const samples = []; for (let i = 0; i < 20; i++) samples.push(srs.fuzzInterval(100, Math.random));
        assert.ok(Math.min(...samples) >= 94 && Math.max(...samples) <= 106);
    });

    console.log('# persistence+stats');
    t('save/load + v0 migration + export/import + schedule stats + forecast', () => {
        global.localStorage.clear();
        srs.saveStates({ 'card-1': { ...srs.defaultCardState(), interval: 7 } });
        assert.strictEqual(srs.loadStates()['card-1'].interval, 7);
        global.localStorage.clear();
        global.localStorage.setItem('corpus.srs.states', JSON.stringify({
            'legacy-card': { easeFactor: 2.5, interval: 5, repetitions: 2, dueDate: '2026-01-01', lastScore: 4 }
        }));
        assert.strictEqual(srs.loadStates()['legacy-card'].interval, 5);
        assert.ok(global.localStorage.getItem('corpus.srs.states').includes('"version"'));
        global.localStorage.clear();
        srs.saveStates({ 'x': { ...srs.defaultCardState(), interval: 13 } });
        const blob = srs.exportState();
        global.localStorage.clear();
        srs.importState(blob);
        assert.strictEqual(srs.loadStates()['x'].interval, 13);
        global.localStorage.clear();
        srs.saveStates({
            a: { ...srs.defaultCardState(), phase: 'learning' },
            b: { ...srs.defaultCardState(), phase: 'review', interval: 5 },
            c: { ...srs.defaultCardState(), phase: 'review', interval: 30 }
        });
        const st = srs.getScheduleStats(['a','b','c','d']);
        assert.strictEqual(st.learning, 1); assert.strictEqual(st.young, 1);
        assert.strictEqual(st.mature, 1); assert.strictEqual(st.new, 1);
        assert.strictEqual(srs.getForecast([], 14).length, 14);
    });

    console.log('# triage-shape+manifest');
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'site/data/manifest.json'), 'utf8'));
    const allTriage = SUBJECTS.map(s => JSON.parse(fs.readFileSync(path.join(ROOT, 'site/data', `${s}.json`), 'utf8')).triage || { scenarios: [] });
    t('manifest=sum ≥60 + every scenario {name,parameters:obj,examples:arr}', () => {
        const total = allTriage.reduce((n, t) => n + t.scenarios.length, 0);
        assert.strictEqual(total, manifest.totals.scenarios);
        assert.ok(total >= 60);
        for (const tg of allTriage) for (const sc of tg.scenarios) {
            assert.strictEqual(typeof sc.name, 'string');
            assert.ok(sc.parameters && typeof sc.parameters === 'object' && !Array.isArray(sc.parameters));
            assert.ok(Array.isArray(sc.examples));
        }
    });

    console.log('# triage-disclosure-gate');
    const liveSrc = fs.readFileSync(path.join(ROOT, 'site/triage-live.js'), 'utf8');
    const liveHtml = fs.readFileSync(path.join(ROOT, 'site/triage-live.html'), 'utf8');
    t('source gates: buildSnapshot(phase) + renderActive clean + button + list-row clean', () => {
        assert.match(liveSrc, /function buildSnapshot\(phase\)/);
        const block = liveSrc.split('function renderActive')[1].split('\nfunction ')[0];
        assert.ok(!/class: 'params'/.test(block) && !/atoms attached/.test(block) && !/sc\.parameters/.test(block));
        assert.ok(!/sc\.atoms\.length\}\s*atoms/.test(liveSrc));
        assert.match(liveHtml, /id="submit-grading"/);
    });
    t('buildSnapshot: asking hides atoms+reasoning, grading reveals them', () => {
        const sc = { id: 'x-0', subject: 'c', cat: 'green', name: 'T', description: 'd.',
            parameters: { hr: 110 }, examples: [{ case: 'A 60yo w/ chest pain.', reasoning: 'CANARY_REASON', recommendation: 'CANARY_REC' }],
            atom_ids: ['a1'], atoms: [{ id: 'a1', atom: 'CanaryFront', definition: 'CANARY_DEF' }] };
        const ctx = { console, state: { activeScenarioId: 'x-0', scenarios: [sc], cards: [], phase: 'asking' } };
        const grab = re => liveSrc.match(re)[0];
        vm.createContext(ctx);
        vm.runInContext([grab(/const SYSTEM_PROMPT_TMPL = `[\s\S]*?`;/), grab(/function caseStem\(sc\) \{[\s\S]*?^\}/m), grab(/function currentScenario\(\) \{[\s\S]*?^\}/m), grab(/function buildSnapshot\(phase\) \{[\s\S]*?^\}/m)].join('\n'), ctx);
        const ask = vm.runInContext(`buildSnapshot('asking')`, ctx);
        const grade = vm.runInContext(`buildSnapshot('grading')`, ctx);
        for (const tok of ['CANARY_DEF', 'CANARY_REASON', 'CANARY_REC', 'CanaryFront']) assert.ok(!ask.includes(tok), `asking leaked ${tok}`);
        assert.ok(grade.includes('CANARY_DEF') && grade.includes('CanaryFront'));
        assert.ok(grade.includes('CANARY_REC') || grade.includes('CANARY_REASON'));
    });
    console.log('# triage-llm-worker');
    const workerSrc = fs.readFileSync(path.join(ROOT, 'site/triage-llm-worker.js'), 'utf8');
    t('worker imports streaming primitives + correct model + posts streamed updates', () => {
        assert.match(workerSrc, /TextStreamer/);
        assert.match(workerSrc, /InterruptableStoppingCriteria/);
        assert.match(workerSrc, /onnx-community\/gemma-4-E2B-it-ONNX/);
        assert.match(workerSrc, /Gemma4ForConditionalGeneration/);
        assert.match(workerSrc, /AutoProcessor/);
        assert.match(workerSrc, /use_external_data_format:\s*true/);
        assert.match(workerSrc, /device:\s*'webgpu'/);
        assert.match(workerSrc, /status:\s*'update'/);
        assert.match(workerSrc, /apply_chat_template/);
        assert.match(workerSrc, /shader-f16/);
        assert.match(workerSrc, /@huggingface\/transformers@4\./);
    });
    t('triage-live surfaces webgpu errors + spawns worker (type=module) + debug panel', () => {
        assert.match(liveSrc, /new Worker\(['"]\.\/triage-llm-worker\.js['"],\s*\{\s*type:\s*['"]module['"]/);
        assert.match(liveSrc, /workerReady/);
        assert.match(liveSrc, /showWebgpuError/);
        assert.match(liveSrc, /WebGPU error/);
        assert.match(liveSrc, /DEBUG_WEBGPU/);
        assert.match(liveSrc, /webgpu-debug/);
        assert.match(liveSrc, /onWorkerMessage/);
        assert.match(liveSrc, /'interrupt'/);
        assert.ok(!/falling back to simulate/.test(liveSrc), 'silent simulate fallback must be removed');
    });
    t('serve.js sets COOP/COEP isolation headers', () => {
        const serveSrc = fs.readFileSync(path.join(ROOT, 'scripts/serve.js'), 'utf8');
        assert.match(serveSrc, /cross-origin-opener-policy[^,]*same-origin/i);
        assert.match(serveSrc, /cross-origin-embedder-policy[^,]*require-corp/i);
        assert.match(serveSrc, /cross-origin-resource-policy/i);
    });

    t('simulateAssistant asking branch never auto-emits differential add_card', () => {
        const sim = liveSrc.split('function simulateAssistant')[1].split('\nstate.simulateAssistant')[0];
        const askingPart = sim.split("state.phase === 'grading'")[1].split('return blocks.join')[1] || sim;
        assert.ok(!(/add_card[\s\S]*?kind.{0,4}.differential/.test(askingPart) && !/m\[1\]\.toLowerCase\(\)/.test(askingPart)));
    });

    console.log(`\n${pass} pass · ${fail} fail`);
    process.exit(fail === 0 ? 0 : 1);
})();
