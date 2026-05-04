// Integration test — scheduler + IDs + shards + triage gate + student UX site-wide. Run: node test.js
const fs = require('fs'); const path = require('path'); const assert = require('assert'); const vm = require('vm');
const { stableCardId } = require('./scripts/build_data.js');
const ROOT = __dirname;
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); console.log('  PASS', name); pass++; } catch (e) { console.log('  FAIL', name, '-', e.message); fail++; } };
global.localStorage = (() => { const s = new Map(); return { getItem: k => s.has(k) ? s.get(k) : null, setItem: (k, v) => s.set(k, String(v)), removeItem: k => s.delete(k), clear: () => s.clear() }; })();
const SUBJECTS = ['cardiology','diabetes','endocrine','gastroenterology','geriatric','nephrology','pulmonology','rheumatology'];
const READ = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SHARDS = SUBJECTS.map(s => JSON.parse(READ(`site/data/${s}.json`)));
const MANIFEST = JSON.parse(READ('site/data/manifest.json'));
const SHARDMAP = Object.fromEntries(SUBJECTS.map((s, i) => [s, SHARDS[i]]));
(async () => {
    const srs = await import('./site/srs.js');
    const progress = await import('./site/progress.js');
    const search = await import('./site/search.js');
    console.log('# ids+shards+manifest');
    t('ids deterministic + shard uniqueness ≥1900 + manifest=Σscenarios + scenario shape', () => {
        const a = stableCardId('cardiology', 'What is CAD?', 'src1');
        assert.strictEqual(a, stableCardId('cardiology', 'What is CAD?', 'src1'));
        assert.match(stableCardId('cardiology', 'X', 'src'), /^cardiology-[0-9a-f]{10}$/);
        const all = new Set();
        for (const s of SUBJECTS) for (const c of SHARDMAP[s].cards) {
            assert.ok(c.id.startsWith(s + '-') || c.id.startsWith(s + '_'));
            assert.ok(!all.has(c.id)); all.add(c.id); assert.ok(c.front && c.front.length > 0);
        }
        assert.ok(all.size >= 1900);
        const total = SHARDS.reduce((n, sh) => n + (sh.triage?.scenarios.length || 0), 0);
        assert.strictEqual(total, MANIFEST.totals.scenarios); assert.ok(total >= 60);
        for (const sh of SHARDS) for (const sc of (sh.triage?.scenarios || [])) {
            assert.ok(sc.parameters && typeof sc.parameters === 'object' && !Array.isArray(sc.parameters));
            assert.ok(Array.isArray(sc.examples));
        }
    });
    console.log('# scheduler+persistence+stats');
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    t('SM2+learning+leech+history cap + fuzz + persist+migrate + export/import + stats + forecast', () => {
        let n = srs.calcSM2(srs.defaultCardState(), 1); assert.strictEqual(n.repetitions, 0); assert.strictEqual(n.interval, 1);
        assert.ok(srs.calcSM2(srs.defaultCardState(), 5).easeFactor > 2.5);
        assert.strictEqual(srs.calcSM2({ ...srs.defaultCardState(), repetitions: 1, interval: 1 }, 5).interval, 6);
        let s = srs.schedule(srs.defaultCardState(), 3, now, () => 0.5);
        assert.strictEqual(s.phase, 'learning'); assert.strictEqual(s.learningStep, 1);
        assert.strictEqual(srs.schedule({ ...srs.defaultCardState(), phase: 'learning', learningStep: 1 }, 4, now, () => 0.5).phase, 'review');
        s = srs.schedule({ ...srs.defaultCardState(), phase: 'review', lapses: 7 }, 0, now);
        assert.strictEqual(s.lapses, 8); assert.strictEqual(s.isLeech, true);
        let h = srs.defaultCardState();
        for (let i = 0; i < 60; i++) h = srs.schedule(h, 4, now + i * 60000, () => 0.5);
        assert.ok(h.history.length <= 50);
        assert.strictEqual(srs.fuzzInterval(1, () => 0), 1);
        const samples = []; for (let i = 0; i < 20; i++) samples.push(srs.fuzzInterval(100, Math.random));
        assert.ok(Math.min(...samples) >= 94 && Math.max(...samples) <= 106);
        global.localStorage.clear();
        global.localStorage.setItem('corpus.srs.states', JSON.stringify({ 'legacy': { easeFactor: 2.5, interval: 5, repetitions: 2, dueDate: '2026-01-01', lastScore: 4 } }));
        assert.strictEqual(srs.loadStates()['legacy'].interval, 5);
        global.localStorage.clear(); srs.saveStates({ 'x': { ...srs.defaultCardState(), interval: 13 } });
        const blob = srs.exportState(); global.localStorage.clear(); srs.importState(blob);
        assert.strictEqual(srs.loadStates()['x'].interval, 13);
        global.localStorage.clear();
        srs.saveStates({ a: { ...srs.defaultCardState(), phase: 'learning' }, b: { ...srs.defaultCardState(), phase: 'review', interval: 5 }, c: { ...srs.defaultCardState(), phase: 'review', interval: 30 } });
        const st = srs.getScheduleStats(['a', 'b', 'c', 'd']);
        assert.strictEqual(st.learning, 1); assert.strictEqual(st.young, 1); assert.strictEqual(st.mature, 1); assert.strictEqual(st.new, 1);
        assert.strictEqual(srs.getForecast([], 14).length, 14);
    });
    console.log('# triage-disclosure-gate+worker');
    const liveSrc = READ('site/triage-live.js'), liveHtml = READ('site/triage-live.html'), workerSrc = READ('site/triage-llm-worker.js');
    t('disclosure-gate (asking hides answer key, grading reveals) + worker shape + student-clean default chrome + serve isolation', () => {
        assert.match(liveSrc, /function buildSnapshot\(phase\)/);
        assert.match(liveHtml, /id="submit-grading"/);
        const sc = { id: 'x-0', subject: 'c', cat: 'green', name: 'T', description: 'd.', parameters: { hr: 110 },
            examples: [{ case: 'A 60yo w/ chest pain.', reasoning: 'CANARY_REASON', recommendation: 'CANARY_REC' }],
            atom_ids: ['a1'], atoms: [{ id: 'a1', atom: 'CanaryFront', definition: 'CANARY_DEF' }] };
        const ctx = { console, state: { activeScenarioId: 'x-0', scenarios: [sc], cards: [], phase: 'asking' } };
        const grab = re => liveSrc.match(re)[0];
        vm.createContext(ctx);
        vm.runInContext([grab(/const SYSTEM_PROMPT_TMPL = `[\s\S]*?`;/), grab(/function caseStem\(sc\) \{[\s\S]*?^\}/m), grab(/function currentScenario\(\) \{[\s\S]*?^\}/m), grab(/function buildSnapshot\(phase\) \{[\s\S]*?^\}/m)].join('\n'), ctx);
        const ask = vm.runInContext(`buildSnapshot('asking')`, ctx);
        const grade = vm.runInContext(`buildSnapshot('grading')`, ctx);
        for (const tok of ['CANARY_DEF', 'CANARY_REASON', 'CANARY_REC', 'CanaryFront']) assert.ok(!ask.includes(tok));
        assert.ok(grade.includes('CANARY_DEF') && grade.includes('CanaryFront'));
        for (const re of [/TextStreamer/, /InterruptableStoppingCriteria/, /onnx-community\/gemma-4-E2B-it-ONNX/, /Gemma4ForConditionalGeneration/, /AutoProcessor/, /use_external_data_format:\s*true/, /device:\s*'webgpu'/, /apply_chat_template/, /shader-f16/]) assert.match(workerSrc, re);
        assert.match(liveSrc, /new Worker\(['"]\.\/triage-llm-worker\.js['"],\s*\{\s*type:\s*['"]module['"]/);
        assert.match(liveSrc, /showWebgpuError/); assert.match(liveSrc, /console\.error\(['"]\[triage-live\] webgpu error/);
        assert.ok(!/falling back to simulate/.test(liveSrc));
        const css = READ('site/triage-live.css');
        assert.ok(!/WebGPU error/.test(liveHtml + css)); assert.ok(!/≈\s*2GB/.test(liveHtml + css));
        for (const friendly of [/study assistant/i, /your tutor/i, /offline/i, /pick a case/i]) assert.match(liveHtml + liveSrc, friendly);
        assert.match(liveSrc, /attempted.*streak.*last grade/);
        const serveSrc = READ('scripts/serve.js');
        assert.match(serveSrc, /cross-origin-opener-policy[^,]*same-origin/i);
        assert.match(serveSrc, /cross-origin-embedder-policy[^,]*require-corp/i);
    });
    console.log('# student-mode+a11y+theme+search+progress+print');
    const appSrc = READ('site/app.js'), styleCss = READ('site/style.css'), indexHtml = READ('site/index.html');
    t('default home shell has zero operator vocabulary + presents student CTAs', () => {
        const userText = indexHtml + '\n' + styleCss;
        for (const tok of [/\bmanifest\b/i, /\bshard\b/i, /\bsnapshot\b/i, /buildSnapshot/, /\bSM-2\b/, /easeFactor/, /\batoms?\b/i]) assert.ok(!tok.test(userText), `forbidden ${tok}`);
        for (const friendly of [/your medical study/i, /workspace/i, /streak/i, /today/i, /review/i]) assert.match(appSrc + indexHtml, friendly);
        assert.match(appSrc, /cards due now|cards today|streak/);
        assert.match(appSrc, /continue where you left off/);
        assert.match(appSrc, /start a case|live tutor|work a case/);
    });
    t('?debug reveals operator surface (raw scheduler + atom counts gated)', () => {
        assert.match(appSrc, /URLSearchParams\(location\.search\)\.has\(['"]debug['"]\)/);
        assert.match(appSrc, /DEBUG\s*\?[\s\S]{0,200}atom/);
        assert.match(appSrc, /raw scheduler|avg EF/);
        assert.match(appSrc, /id: 'srs-stats'/);
    });
    t('console telemetry uniformly prefixed [corpus]/[triage-live]/[worker-msg]/[webgpu-debug]', () => {
        for (const src of [appSrc, READ('site/srs.js'), liveSrc]) {
            const calls = src.match(/console\.(log|warn|error|info)\([^)]{0,200}/g) || [];
            for (const c of calls) {
                if (/['"]\[(corpus|triage-live|worker-msg|webgpu-debug|playwright)\]/.test(c)) continue;
                if (/console\.(error|warn)\(['"]?(persist failed|tool error|e\b|err\b)/.test(c)) continue;
                if (/console\.(error|warn)\(e\)/.test(c) || /console\.error\(err/.test(c)) continue;
                throw new Error('unprefixed: ' + c.slice(0, 80));
            }
        }
    });
    t('progress.js: streak rolls, rollover archives, 2-day-gap resets, goal+case bumps persist', () => {
        global.localStorage.clear();
        let p = progress.load();
        assert.strictEqual(p.streak, 0); assert.strictEqual(p.dailyGoal, 30);
        progress.bumpGraded(1);
        p = progress.load(); assert.strictEqual(p.streak, 1); assert.strictEqual(p.todayGraded, 1);
        const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        global.localStorage.setItem('corpus.progress.v1', JSON.stringify({ ...p, lastActiveDate: y, todayDate: y, todayGraded: 5, todayCases: 1 }));
        const p2 = progress.load();
        assert.ok(p2.history.length >= 1); assert.strictEqual(p2.todayGraded, 0);
        progress.bumpGraded(1);
        assert.strictEqual(progress.load().streak, p.streak + 1);
        // 2-day gap resets streak to 1
        const twoAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
        global.localStorage.setItem('corpus.progress.v1', JSON.stringify({ ...progress.load(), lastActiveDate: twoAgo, todayDate: new Date().toISOString().slice(0, 10), streak: 7 }));
        progress.bumpGraded(1);
        assert.strictEqual(progress.load().streak, 1);
        progress.setGoal(50); assert.strictEqual(progress.load().dailyGoal, 50);
        progress.bumpCase(2); assert.strictEqual(progress.load().todayCases, 2);
    });
    t('search index covers cards+cases+sections + multi-token search', () => {
        const idx = search.buildSearchIndex(MANIFEST, SHARDMAP);
        const cardCount = SHARDS.reduce((n, sh) => n + sh.cards.length, 0);
        const caseCount = SHARDS.reduce((n, sh) => n + (sh.triage?.scenarios.length || 0), 0);
        const sectionCount = SHARDS.reduce((n, sh) => n + (sh.guide?.sections.length || 0), 0);
        assert.strictEqual(idx.length, cardCount + caseCount + sectionCount);
        for (const k of ['card', 'case', 'section']) assert.ok(idx.some(i => i.kind === k));
        assert.ok(search.search(idx, 'heart').length > 0);
        assert.ok(search.search(idx, 'diabetes mellitus').length > 0);
    });
    t('theme persists + dark palette differs + reduced-motion + print stylesheet hides chrome', () => {
        const themeSrc = READ('site/theme.js');
        assert.match(themeSrc, /corpus\.theme\.v1/);
        assert.match(themeSrc, /setTheme/); assert.match(themeSrc, /cycleTheme/);
        assert.match(themeSrc, /prefers-color-scheme/);
        assert.match(indexHtml, /corpus\.theme\.v1/);
        assert.match(styleCss, /\[data-theme="dark"\]/);
        assert.match(styleCss, /@media \(prefers-reduced-motion: reduce\)/);
        assert.match(styleCss, /@media print/);
        const printBlock = styleCss.match(/@media print \{[\s\S]*?\n\}/);
        assert.ok(printBlock); assert.match(printBlock[0], /\.topbar[\s\S]*display:\s*none/);
        assert.match(styleCss, /\[data-theme="dark"\][\s\S]*?--paper:\s*#1A1714/);
    });
    t('a11y: focus-visible + 360+768 mobile + ≥6 aria-labels in app.js', () => {
        assert.match(styleCss, /:focus-visible\s*\{/);
        assert.match(styleCss, /@media \(max-width: 480px\)/);
        assert.match(styleCss, /@media \(max-width: 768px\)/);
        assert.ok((appSrc.match(/aria-label/g) || []).length >= 6);
    });
    t('friendly-grades + mastery + today + search + theme + bumpCase + titles + onboarding + hash-subroutes + body + sw + og + empty-state', () => {
        const swSrc = READ('site/sw.js');
        for (const re of [/FRIENDLY_GRADES/, /friendly:\s*1[\s\S]{0,40}smscore:\s*0/, /friendly:\s*4[\s\S]{0,40}smscore:\s*5/,
            /space=reveal · 1=again · 2=hard/, /corpus\.guide\.v1/, /loadGuideTicks|guide-tick/, /renderToday/, /day streak/,
            /mountSearchPalette|searchPaletteApi/, /makeToggleButton/, /setDocTitle|document\.title\s*=/, /ROUTE_TITLES/,
            /isFirstVisit|onboarding/, /route === 'cards' && subject/, /route === 'review' && subject/,
            /renderMarkdown|guide-body/, /serviceWorker\.register\(['"]\.\/sw\.js/, /navigator\.onLine|window\.addEventListener\(['"]offline/,
            /no cards match|empty-state/]) assert.match(appSrc, re);
        for (const re of [/progress\.bumpCase/, /import \* as progress/]) assert.match(liveSrc, re);
        for (const re of [/caches\.open/, /addEventListener\(['"]install/, /addEventListener\(['"]fetch/]) assert.match(swSrc, re);
        for (const re of [/og:title/, /og:description/, /og:type/, /rel="icon"/]) { assert.match(indexHtml, re); assert.match(liveHtml, re); }
        for (const re of [/\.empty-state/, /\.skeleton/, /\.dot\.offline/]) assert.match(styleCss, re);
        for (const sh of SHARDS) if (sh.guide) assert.ok(typeof sh.guide.body === 'string' && sh.guide.body.length > 100, `guide.body missing for ${sh.subject}`);
    });
    console.log(`\n${pass} pass · ${fail} fail`);
    process.exit(fail === 0 ? 0 : 1);
})();
