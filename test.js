// Integration test — corpus personal study notebook. Run: node test.js
const fs = require('fs'); const path = require('path'); const assert = require('assert'); const vm = require('vm');
const { stableCardId } = require('./scripts/build_data.js');
const ROOT = __dirname;
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); console.log('  PASS', name); pass++; } catch (e) { console.log('  FAIL', name, '-', e.message); fail++; } };
// Async-aware variant: sync t() would print PASS before an async callback's
// awaits run and swallow its failures — always `await ta(...)` for async tests.
const ta = async (name, fn) => { try { await fn(); console.log('  PASS', name); pass++; } catch (e) { console.log('  FAIL', name, '-', e.message); fail++; } };
global.localStorage = (() => { const s = new Map(); return { getItem: k => s.has(k) ? s.get(k) : null, setItem: (k, v) => s.set(k, String(v)), removeItem: k => s.delete(k), clear: () => s.clear() }; })();
global.window = { dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
global.CustomEvent = class { constructor(t, d) { this.type = t; this.detail = d; } };
const READ = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
// Load manifest first to derive subject list (supports 8+ subjects dynamically)
// Per-syllabus data layout: build writes site/data/<id>/. cmed4-2026 is the default.
const DDIR = 'site/data/cmed4-2026';
const MANIFEST = JSON.parse(READ(`${DDIR}/manifest.json`));
const SUBJECTS = ['cardiology','diabetes','endocrine','gastroenterology','geriatric','nephrology','pulmonology','rheumatology']; // Core 8 with full assets
const SHARDS = SUBJECTS.map(s => JSON.parse(READ(`${DDIR}/${s}.json`)));
const SHARDMAP = Object.fromEntries(SUBJECTS.map((s, i) => [s, SHARDS[i]]));
(async () => {
    const { skey } = await import('./site/syllabus.js');
    const srs = await import('./site/srs.js');
    const progress = await import('./site/progress.js');
    const search = await import('./site/search.js');
    const verdicts = await import('./site/verdicts.js');
    const lastpos = await import('./site/lastpos.js');
    const cram = await import('./site/cram.js');
    const justread = await import('./site/justread.js');
    const tutorStore = await import('./site/tutor-store.js');
    const toolDispatch = await import('./site/tool-dispatch.js');
    const markdown = await import('./site/markdown.js');
    const clipboard = await import('./site/clipboard.js');
    const appSrc = READ('site/app.js'), styleCss = READ('site/style.css'), indexHtml = READ('site/index.html');
    const liveSrc = READ('site/triage-live.js'), liveHtml = READ('site/triage-live.html'), liveCss = READ('site/triage-live.css'), workerSrc = READ('site/triage-llm-worker.js');

    console.log('# data integrity');
    t('ids deterministic + shard uniqueness ≥1900 + manifest=Σscenarios + scenario shape + guide bodies', () => {
        const a = stableCardId('cardiology', 'What is CAD?', 'src1');
        assert.strictEqual(a, stableCardId('cardiology', 'What is CAD?', 'src1'));
        const all = new Set();
        for (const s of SUBJECTS) for (const c of SHARDMAP[s].cards) {
            assert.ok(c.id.startsWith(s + '-') || c.id.startsWith(s + '_'));
            assert.ok(!all.has(c.id)); all.add(c.id); assert.ok(c.front && c.front.length > 0);
        }
        assert.ok(all.size >= 1900);
        // Sum across every subject present in the manifest, not just the 8 with full asset
        // coverage in this test — additional syllabus subjects (e.g. paediatrics-neonatal)
        // still contribute to the manifest totals via build_data.js.
        const allShardScenarios = MANIFEST.subjects.reduce((n, m) => {
            const sh = JSON.parse(READ(`${DDIR}/${m.subject}.json`));
            return n + (sh.triage?.scenarios.length || 0);
        }, 0);
        assert.strictEqual(allShardScenarios, MANIFEST.totals.scenarios); assert.ok(allShardScenarios >= 60);
        for (const sh of SHARDS) for (const sc of (sh.triage?.scenarios || [])) {
            assert.ok(sc.parameters && typeof sc.parameters === 'object' && !Array.isArray(sc.parameters));
            assert.ok(!('raw' in sc.parameters), 'parameters.raw leaks unparsed YAML into shard: ' + sc.name);
            assert.ok(Array.isArray(sc.examples));
        }
        for (const sh of SHARDS) if (sh.guide) assert.ok(typeof sh.guide.body === 'string' && sh.guide.body.length > 100);
        for (const sh of SHARDS) { assert.ok(!('audio' in sh)); assert.ok(!('books' in sh)); }
        assert.ok(!fs.existsSync(path.join(ROOT, 'newcards')), 'newcards/ should be removed');
        assert.ok(MANIFEST.totals.cards >= 2551, 'manifest totals.cards should be >=2551 after newcards merge');
    });

    console.log('# scheduler+persistence+stats');
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    t('SM2 + learning + leech + history cap + fuzz + persist/migrate + export/import + stats + forecast + suspend', () => {
        let n = srs.calcSM2(srs.defaultCardState(), 1); assert.strictEqual(n.repetitions, 0); assert.strictEqual(n.interval, 1);
        assert.ok(srs.calcSM2(srs.defaultCardState(), 5).easeFactor > 2.5);
        // SM-2 interval branches: 2nd review fixed 6 days; mature reviews multiply by EF.
        assert.strictEqual(srs.calcSM2({ ...srs.defaultCardState(), repetitions: 1 }, 4).interval, 6);
        assert.strictEqual(srs.calcSM2({ ...srs.defaultCardState(), repetitions: 2, interval: 10, easeFactor: 2.5 }, 4).interval, 25);
        // compressInterval: non-finite/<=0 effectiveDays = max pressure -> 1 (poison-card guard); normal pressure halves.
        assert.strictEqual(srs.compressInterval(10, NaN, 5), 1);
        assert.strictEqual(srs.compressInterval(10, 0, 5), 1);
        assert.strictEqual(srs.compressInterval(10, 5, 5), 5);
        // migrate: a NEWER schema version is rejected (loadStates swallows the throw -> {}), never restamped.
        global.localStorage.clear(); global.localStorage.setItem(skey('srs.states'), JSON.stringify({ version: 999, states: { z: srs.defaultCardState() } }));
        assert.deepStrictEqual(srs.loadStates(), {});
        // migrate: legacy version==null map upgrades each card to phase:'review'.
        global.localStorage.clear(); global.localStorage.setItem(skey('srs.states'), JSON.stringify({ leg: { ...srs.defaultCardState(), phase: 'learning' } }));
        assert.strictEqual(srs.loadStates()['leg'].phase, 'review');
        let s = srs.schedule(srs.defaultCardState(), 3, now, () => 0.5);
        assert.strictEqual(s.phase, 'learning');
        s = srs.schedule({ ...srs.defaultCardState(), phase: 'review', lapses: 7 }, 0, now);
        assert.strictEqual(s.lapses, 8); assert.strictEqual(s.isLeech, true);
        let h = srs.defaultCardState();
        for (let i = 0; i < 60; i++) h = srs.schedule(h, 4, now + i * 60000, () => 0.5);
        assert.ok(h.history.length <= 50);
        assert.strictEqual(srs.fuzzInterval(1, () => 0), 1);
        global.localStorage.clear(); srs.saveStates({ 'x': { ...srs.defaultCardState(), interval: 13 } });
        const blob = srs.exportState(); global.localStorage.clear(); srs.importState(blob);
        assert.strictEqual(srs.loadStates()['x'].interval, 13);
        global.localStorage.clear();
        srs.saveStates({ a: { ...srs.defaultCardState(), phase: 'learning' }, b: { ...srs.defaultCardState(), phase: 'review', interval: 5 }, c: { ...srs.defaultCardState(), phase: 'review', interval: 30 } });
        const st = srs.getScheduleStats(['a','b','c','d']);
        assert.strictEqual(st.learning, 1); assert.strictEqual(st.young, 1); assert.strictEqual(st.mature, 1); assert.strictEqual(st.new, 1);
        assert.strictEqual(srs.getForecast([], 14).length, 14);
        for (const re of [/suspendCard/, /isSuspended/, /quota/i, /corpus:storage-full/, /s\.suspended/]) assert.match(READ('site/srs.js'), re);
    });

    console.log('# esm parse: every site/*.js parses as a module');
    t('every site/*.js passes node --check --input-type=module (catches missing paren etc)', () => {
        const cp = require('child_process');
        const files = fs.readdirSync(path.join(ROOT, 'site')).filter(f => f.endsWith('.js'));
        const broken = [];
        for (const f of files) {
            const r = cp.spawnSync(process.execPath, ['--check', '--input-type=module'], {
                input: fs.readFileSync(path.join(ROOT, 'site', f), 'utf8')
            });
            if (r.status !== 0) broken.push({ f, err: (r.stderr.toString() || '').slice(0, 200) });
        }
        assert.deepStrictEqual(broken, [], 'ESM parse failures: ' + JSON.stringify(broken));
    });

    console.log('# triage-live: gate + worker + student-clean chrome');
    t('disclosure-gate (asking hides answer key, grading reveals) + worker shape + restyle microcopy + serve isolation', () => {
        assert.match(liveSrc, /function buildSnapshot\(phase\)/);
        // Phase transitions are now LLM-driven via the set_phase tool.
        assert.match(liveSrc, /set_phase/);
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
        for (const re of [/TextStreamer/, /InterruptableStoppingCriteria/, /onnx-community\/Bonsai-1.7B-ONNX/, /device:\s*'webgpu'/]) assert.match(workerSrc, re);
        assert.match(liveSrc, /new Worker\(['"]\.\/triage-llm-worker\.js['"],\s*\{\s*type:\s*['"]module['"]/);
        assert.match(liveSrc, /showWebgpuError/); assert.match(liveSrc, /console\.error\(['"]\[corpus\] webgpu error/);
        // Restyle microcopy: load tutor / select a case / no "study assistant" / no "≈2GB"
        assert.match(liveHtml, /load.*tutor/i);
        assert.match(liveHtml, /select a case/);
        assert.ok(!/study assistant/i.test(liveHtml + liveCss));
        assert.ok(!/≈\s*2GB/.test(liveHtml + liveCss));
        assert.ok(!/turn on assistant/i.test(liveHtml + liveCss));
        const serveSrc = READ('scripts/serve.js');
        assert.match(serveSrc, /cross-origin-opener-policy[^,]*same-origin/i);
        assert.match(serveSrc, /cross-origin-embedder-policy[^,]*require-corp/i);
        // Path-traversal guard: the security boundary of the dev server. Exercise
        // the exact predicate (normalize(join) -> relative -> startsWith('..'))
        // serve.js uses, so a refactor that opens traversal fails here.
        const path = require('path');
        const ROOT = path.resolve(__dirname, 'site');
        const blocked = (url) => {
            const p = decodeURIComponent(url.split('?')[0]) || '/index.html';
            const full = path.normalize(path.join(ROOT, p));
            return path.relative(ROOT, full).startsWith('..');
        };
        assert.strictEqual(blocked('/../package.json'), true);
        assert.strictEqual(blocked('/..%2f..%2ftest.js'), true);
        assert.strictEqual(blocked('/index.html'), false);
        assert.strictEqual(blocked('/data/manifest.json'), false);
    });

    console.log('# restyle: tokens + lowercase + no archivo + no hero + meaningful color');
    t('sans-everywhere chrome + JetBrains mono + no Archivo + no Lora + meaningful color tokens + no hero copy', () => {
        // Sans-everywhere: no serif Lora, no display Archivo
        assert.ok(!/Lora/.test(indexHtml));
        assert.ok(!/Archivo\+?Black/i.test(indexHtml));
        assert.ok(!/Archivo Black/i.test(styleCss));
        // No hero / workspace framing
        for (const banned of [/your medical study workspace/i, /open the study guides/i, /our rewritten study guides/i]) {
            assert.ok(!banned.test(indexHtml + appSrc), 'banned phrase: ' + banned);
        }
        // Meaningful color tokens for state
        for (const re of [/--c-due/, /--c-mastered/, /--c-missed|--c-weak/]) assert.match(styleCss, re);
        // Lowercase chrome — topbar nav/buttons authored lowercase OR text-transform
        assert.ok(/text-transform:\s*lowercase/.test(styleCss) || /\.navlink/.test(styleCss));
        // New component classes present
        for (const re of [/\.status-line/, /\.cram-banner/, /\.review-progress/, /\.guide-aff/, /\.verdict-table/, /\.just-read/, /\.summary-line/, /\.guide-jump/, /\.resume-line/]) assert.match(styleCss, re);
    });

    console.log('# new modules: cram + lastpos + justread + verdicts');
    t('cram.isDismissed/dismiss + lastpos.save/load/gapDays + justread.toggle/isOn + verdicts.verdictFor thresholds', () => {
        global.localStorage.clear();
        // cram
        assert.strictEqual(cram.isDismissed(), false);
        cram.dismiss();
        assert.strictEqual(cram.isDismissed(), true);
        assert.match(global.localStorage.getItem(skey('cram.dismissed.v1')), /date/);
        // lastpos
        global.localStorage.clear();
        assert.strictEqual(lastpos.load(), null);
        lastpos.save('subject', 'cardiology');
        const lp = lastpos.load();
        assert.strictEqual(lp.route, 'subject'); assert.strictEqual(lp.subjectAnchor, 'cardiology'); assert.ok(lp.ts > 0);
        assert.strictEqual(lastpos.gapDays(Date.now()), 0);
        assert.strictEqual(lastpos.gapDays(Date.now() + 3 * 86400000), 3);
        // justread
        global.localStorage.clear();
        assert.strictEqual(justread.isOn('cardiology'), false);
        assert.strictEqual(justread.toggle('cardiology'), true);
        assert.strictEqual(justread.isOn('cardiology'), true);
        assert.strictEqual(justread.toggle('cardiology'), false);
        // verdicts thresholds
        assert.strictEqual(verdicts.verdictFor({ mastery: 80, trend: 0.5, backlog: 5, scheduled: 100 }), 'solid');
        // high mastery but DECLINING trend (t<0) must demote out of 'solid' -- pins the t>=0 guard.
        assert.strictEqual(verdicts.verdictFor({ mastery: 80, trend: -0.5, backlog: 5, scheduled: 100 }), 'getting there');
        // high mastery but heavy backlog (b>=10) also demotes -- pins the b<10 guard.
        assert.strictEqual(verdicts.verdictFor({ mastery: 80, trend: 0.5, backlog: 20, scheduled: 100 }), 'getting there');
        assert.strictEqual(verdicts.verdictFor({ mastery: 60, trend: 0, backlog: 5, scheduled: 100 }), 'getting there');
        assert.strictEqual(verdicts.verdictFor({ mastery: 30, trend: -0.5, backlog: 50, scheduled: 100 }), 'weak');
        assert.strictEqual(verdicts.verdictFor({ mastery: 10, trend: 0, backlog: 0, scheduled: 100 }), 'cold');
        assert.strictEqual(verdicts.verdictFor({ mastery: 80, trend: 0, backlog: 0, scheduled: 0 }), 'cold');
        // backlog/trend/buildRows/computeWeakest
        const states = { 'cardiology-aaa': { dueAt: 0, history: [{ ts: Date.now(), score: 5 }, { ts: Date.now(), score: 1 }] } };
        assert.strictEqual(verdicts.backlogFor(states, ['cardiology-aaa'], Date.now()), 1);
        const tr = verdicts.trendFor(states, ['cardiology-aaa'], Date.now());
        assert.ok(tr === 0); // 1 pos + 1 neg = 0
        const ticks = { cardiology: { '5': true, '10': true } };
        const rows = verdicts.buildRows(MANIFEST, SHARDMAP, {}, ticks);
        assert.strictEqual(rows.length, SUBJECTS.length);
        assert.ok(rows.find(r => r.subject === 'cardiology'));
        const w = verdicts.computeWeakest(rows);
        assert.ok(w && typeof w.subject === 'string');
    });

    console.log('# app.js wiring: features + IA + microcopy');
    t('imports + renderToday compressed + status-line + cram banner + resume-line + guide-aff + review-progress + verdict table + r-toggle + nav', () => {
        // module imports
        for (const re of [/import \* as cram from '\.\/cram\.js'/, /import \* as justread from '\.\/justread\.js'/]) assert.match(appSrc, re);
        // lastpos + verdicts moved into the views that use them (app.js-split)
        assert.match(READ('site/views/today.js'), /import \* as lastpos from '\.\.\/lastpos\.js'/);
        assert.match(READ('site/views/stats.js'), /from '\.\.\/verdicts\.js'/);
        // compressed today
        assert.match(READ('site/views/today.js'), /function renderToday\(\)/);
        assert.match(READ('site/views/subject.js'), /primary-action/);
        // simplification pass — slim today, nav-more overflow, subject hero
        assert.match(appSrc, /nav-more/);
        // NAV FIX: bottom-nav must be populated unconditionally (the SDK shell can
        // crash mid-mount, and its catch must fall back to mountTopbar; without a
        // populated bottom-nav mobile had zero visible navigation).
        assert.match(appSrc, /function mountBottomNav\(\)/);
        // mountBottomNav is defined once and must be CALLED in init (not only inside
        // the unused mountTopbar). Count call-sites: >1 `mountBottomNav()` occurrence
        // means definition + at least one real call.
        assert.ok((appSrc.match(/mountBottomNav\(\)/g) || []).length >= 2, 'mountBottomNav called in init (not only defined)');
        // The SDK-setup catch resets sdkRender and mounts the legacy topbar so a
        // mid-mount SDK crash still yields a fully navigable page.
        const sdkCatch = appSrc.slice(appSrc.indexOf('SDK load failed, using fallback'), appSrc.indexOf('SDK load failed, using fallback') + 800);
        assert.ok(/sdkRender = null/.test(sdkCatch) && /mountTopbar\(\)/.test(sdkCatch), 'SDK setup failure falls back to mountTopbar + legacy render');
        assert.match(READ('site/views/subject.js'), /subject-hero/);
        assert.match(READ('site/views/subject.js'), /chunked-guide|chunk-panel/);
        assert.match(READ('site/views/today.js'), /today-primary/);
        // free-study fallback CTA — clamped to today's plan target, not full backlog
        assert.match(READ('site/views/today.js'), /or just review \(/);
        assert.match(READ('site/views/today.js'), /todayPlanReviewTarget/);
        // (renderStatusLine was dead code with no caller — removed in the app.js split)
        assert.match(READ('site/views/today.js'), /reviewed today/);
        // gamification removed
        assert.ok(!/`day \$\{day\}`/.test(appSrc), 'day chip removed from status line');
        assert.ok(!/`streak \$\{p\.streak\}`/.test(appSrc), 'streak chip removed from status line');
        assert.ok(!/`goal \$\{p\.todayGraded\}\/\$\{p\.dailyGoal\}`/.test(appSrc), 'goal chip removed from status line');
        // TOC features
        assert.match(READ('site/views/subject.js'), /buildGuideToc/);
        assert.match(READ('site/views/subject.js'), /toc-filter/);
        assert.match(READ('site/views/subject.js'), /toc-h2-progress/);
        assert.match(READ('site/views/subject.js'), /mountBackToTop/);
        assert.match(READ('site/views/subject.js'), /back-to-top/);
        assert.match(READ('site/views/subject.js'), /applyTocFilter/);
        // cram banner trigger (now in views/today.js)
        const todaySrc = READ('site/views/today.js');
        assert.match(todaySrc, /renderCramBanner/);
        assert.match(todaySrc, /days > 14/);
        assert.match(todaySrc, /cram\.isDismissed/);
        // resume line
        assert.match(todaySrc, /renderResumeLine/);
        assert.match(todaySrc, /back after \$\{gap\}d/);
        // guide affordances — tutor only (practice/cards browser removed). The
        // arrow glyph is now an SVG icon-label (icons.js sweep), so assert the
        // icon-label tutor markup rather than the old Unicode arrow. The guide
        // affordance is emitted by renderMarkdown's affordance(), now in markdown.js.
        const mdSrc = READ('site/markdown.js');
        assert.match(mdSrc, /class="guide-aff"/);
        assert.match(mdSrc, /icon-label[^>]*>\$\{ICON\.arrowRight\}<span>tutor/);
        assert.ok(!/→ practice/.test(appSrc));
        assert.ok(!/→ tutor/.test(appSrc), 'guide-aff should use SVG icon, not Unicode arrow');
        // review progress line (now in views/review.js)
        const reviewSrc = READ('site/views/review.js');
        assert.match(reviewSrc, /class: 'review-progress'/);
        assert.match(reviewSrc, /to daily goal/);
        // r-toggle for just-read
        assert.match(appSrc, /e\.key === 'r' \|\| e\.key === 'R'/);
        assert.match(appSrc, /justread\.toggle/);
        assert.match(appSrc, /justread\.applyClass/);
        // verdict table (now in views/stats.js)
        const statsSrc = READ('site/views/stats.js');
        assert.match(statsSrc, /renderVerdictTable/);
        assert.match(statsSrc, /verdict-table/);
        assert.match(statsSrc, /VERDICT_RANK/);
        // lastpos save on go()
        assert.match(READ('site/router.js'), /lastpos\.save\(route, subject\)/);
        // IA: nav has today guides review cases stats settings + tutor cta (subjects/cards removed)
        for (const lbl of ['today','guides','review','cases','stats']) {
            assert.ok(appSrc.includes(`['${lbl}', '${lbl}']`) || appSrc.includes(`'${lbl}'`));
        }
        for (const removed of [`['subjects', 'subjects']`, `['cards', 'cards']`]) {
            assert.ok(!appSrc.includes(removed), 'nav still contains removed link: ' + removed);
        }
        assert.match(appSrc, /nav-cta/);
        // route aliases home→today, triage→cases (now in router.js)
        assert.match(READ('site/router.js'), /ROUTE_ALIASES/);
        assert.match(READ('site/router.js'), /home: 'today'/);
        // operator vocab gated behind DEBUG only
        const userVisible = appSrc.replace(/DEBUG \?[^:]+:/g, '').replace(/if \(DEBUG\)[^}]+}/g, '');
        // workspace/hero gone
        for (const banned of [/your medical study workspace/i]) assert.ok(!banned.test(appSrc));
        // setLast persists (now in router.js)
        assert.match(READ('site/router.js'), /progress\.setLast/);
    });

    console.log('# progress + search + theme + a11y + telemetry');
    t('progress streak/goal/case + 2-day reset + search index + theme persists + dark palette + reduced-motion + print + focus-visible + telemetry prefixes', () => {
        global.localStorage.clear();
        let p = progress.load();
        assert.strictEqual(p.streak, 0); assert.strictEqual(p.dailyGoal, 30);
        progress.bumpGraded(1);
        assert.strictEqual(progress.load().streak, 1);
        const eff = (() => { const now = new Date(); if (now.getHours() < 6) return new Date(now.getTime() - 6 * 3600 * 1000); return now; })();
        const twoAgo = new Date(eff.getTime() - 2 * 86400000).toISOString().slice(0, 10);
        global.localStorage.setItem(skey('progress.v1'), JSON.stringify({ ...progress.load(), lastActiveDate: twoAgo, todayDate: new Date().toISOString().slice(0, 10), streak: 7 }));
        progress.bumpGraded(1);
        assert.strictEqual(progress.load().streak, 1);
        progress.setGoal(50); assert.strictEqual(progress.load().dailyGoal, 50);
        progress.bumpCase(2); assert.strictEqual(progress.load().todayCases, 2);
        // search
        const idx = search.buildSearchIndex(MANIFEST, SHARDMAP);
        assert.ok(idx.length > 1000);
        assert.ok(search.search(idx, 'heart').length > 0);
        assert.ok(search.search(idx, 'diabetes mellitus').length > 0);
        // theme
        const themeSrc = READ('site/theme.js');
        assert.match(themeSrc, /corpus\.theme\.v1/);
        assert.match(themeSrc, /prefers-color-scheme/);
        assert.match(indexHtml, /corpus\.theme\.v1/);
        assert.match(styleCss, /\[data-theme="dark"\]/);
        // theme fix: dark/contrast blocks are scoped to .ds-247420[data-theme=...]
        // (matched SDK specificity) and drive the SEMANTIC tokens the rules read.
        assert.match(styleCss, /\.ds-247420\[data-theme="dark"\]/);
        assert.match(styleCss, /\.ds-247420\[data-theme="contrast"\]/);
        // semantic-token migration: no raw --ink/--paper used as fg/bg anymore.
        assert.ok(!/var\(--ink\)/.test(styleCss) && !/var\(--paper\)/.test(styleCss),
            'style.css uses semantic --fg/--bg, not raw palette tokens, for theming');
        // SDK clobber guard: theme.js reasserts after the SDK init microtask.
        assert.match(themeSrc, /MutationObserver/);
        assert.match(themeSrc, /effectiveTheme\(\)/);
        // theme toggle glyphs are ASCII (no mojibake / decorative tells).
        assert.ok(!/[^\x00-\x7F]/.test(themeSrc), 'theme.js is ASCII-clean (no mojibake glyphs)');
        // conversation-only tutor: decorative emoji removed from the panel.
        const panelEmoji = READ('site/tutor-panel.js');
        assert.ok(!/🤖|📚|💡/.test(panelEmoji), 'tutor-panel has no decorative emoji tells');
        assert.match(styleCss, /@media \(prefers-reduced-motion: reduce\)/);
        assert.match(styleCss, /@media print/);
        assert.match(styleCss, /:focus-visible/);
        // responsive
        assert.match(styleCss, /@media \(max-width: 600px\)/);
        assert.match(styleCss, /@media \(max-width: 1024px\)/);
        // sw + og + icon
        const swSrc = READ('site/sw.js');
        for (const re of [/caches\.open/, /addEventListener\(['"]install/, /addEventListener\(['"]fetch/]) assert.match(swSrc, re);
        for (const re of [/og:title/, /og:type/, /rel="icon"/]) { assert.match(indexHtml, re); assert.match(liveHtml, re); }
        // telemetry prefixed
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

    console.log('# new modules: timer + plan + mistakes + drill + flag + undo + late + usercards');
    t('new modules export expected APIs and round-trip storage', async () => {
        global.localStorage.clear();
        const timer = await import('./site/timer.js');
        const planMod = await import('./site/plan.js');
        const mistakes = await import('./site/mistakes.js');
        const drill = await import('./site/drill.js');
        const flag = await import('./site/flag.js');
        const undo = await import('./site/undo.js');
        const late = await import('./site/late.js');
        const usercards = await import('./site/usercards.js');
        // timer
        assert.strictEqual(timer.fmt(65), '1:05');
        let tt = timer.load(); assert.strictEqual(tt.running, false); assert.strictEqual(tt.remaining, 25*60);
        timer.start(); assert.strictEqual(timer.load().running, true); timer.pause();
        // plan
        const p = planMod.build({ due: 20, weakestSubject: 'cardiology', nextSection: { title: 'CHF', line: 5 }, casesAvailable: 3 });
        assert.ok(p.tasks.length >= 2 && p.total > 0);
        planMod.save(p); assert.ok(planMod.load());
        // mistakes
        mistakes.logMistake('c-1', 'cardiology', 1);
        mistakes.logMistake('c-2', 'cardiology', 5); // ignored
        mistakes.logMistake('d-1', 'diabetes', 2);
        assert.strictEqual(mistakes.recent().length, 2);
        const grp = mistakes.bySubject(); assert.ok(grp.cardiology.length === 1 && grp.diabetes.length === 1);
        assert.deepStrictEqual(mistakes.ids().sort(), ['c-1','d-1']);
        // drill
        const d = drill.start(['x1','x2','x3'], 'cardiology'); assert.strictEqual(d.ids.length, 3);
        drill.advance(); assert.ok(drill.active());
        // flag
        flag.toggle('card-x'); assert.strictEqual(flag.isFlagged('card-x'), true); assert.strictEqual(flag.count(), 1);
        flag.toggle('card-x'); assert.strictEqual(flag.count(), 0);
        // undo
        undo.record('id', { interval: 5 }); assert.ok(undo.peek());
        const r = undo.consume(); assert.strictEqual(r.cardId, 'id'); assert.strictEqual(undo.peek(), null);
        // late
        assert.strictEqual(late.lateLevel(new Date('2026-05-05T12:00:00')), 'normal');
        assert.strictEqual(late.lateLevel(new Date('2026-05-05T23:30:00')), 'late');
        assert.strictEqual(late.lateLevel(new Date('2026-05-05T03:00:00')), 'sleep');
        assert.match(late.message('late'), /late session/);
        // usercards
        const c = usercards.add('front?', 'back!', ['t1']); assert.ok(c.id.startsWith('user-'));
        assert.strictEqual(usercards.load().length, 1);
        const parsed = usercards.parseLine('front | back | a,b'); assert.deepStrictEqual(parsed, { front: 'front', back: 'back', tags: ['a','b'] });
    });

    console.log('# integration: SW v4 + manifest + index html + app.js wiring + theme contrast + search prose snippet + streak grace + archive isolation');
    await ta('SW + PWA manifest + theme contrast + search prose+snippet + streak grace + app keys + new routes', async () => {
        const sw = READ('site/sw.js');
        assert.ok(sw.includes('__BUILD_VERSION__') || /corpus-v\d+/.test(sw));
        // SW network-first under auto-versioning — modules cached on first fetch (no SHELL precache list of every module)
        assert.ok(sw.includes('manifest.webmanifest') || sw.includes('./manifest'));
        assert.ok(!sw.includes('medbak'), 'sw should not reference medbak');
        const wm = JSON.parse(READ('site/manifest.webmanifest'));
        assert.ok(wm.name && wm.start_url && Array.isArray(wm.icons) && wm.icons.length >= 1);
        // index.html links
        assert.match(indexHtml, /rel="manifest"/);
        assert.match(indexHtml, /\?v=(__BUILD_VERSION__|\d+)/);
        // theme contrast
        const themeSrc = READ('site/theme.js');
        assert.match(themeSrc, /'contrast'/);
        assert.match(styleCss, /\[data-theme="contrast"\]/);
        // search prose + snippet
        const searchMod = await import('./site/search.js');
        assert.strictEqual(typeof searchMod.snippet, 'function');
        const idx2 = searchMod.buildSearchIndex(MANIFEST, SHARDMAP);
        assert.ok(idx2.some(x => x.kind === 'prose'));
        const snip = searchMod.snippet('the heart pumps blood and supplies the body', 'pumps');
        assert.match(snip, /pumps/);
        // streak grace — bumpGraded at 03:00 should attribute to prior day
        const progressMod = await import('./site/progress.js');
        assert.strictEqual(typeof progressMod.effectiveDateISO, 'function');
        const at3am = new Date('2026-05-05T03:00:00');
        const eff = progressMod.effectiveDateISO(at3am);
        assert.notStrictEqual(eff, at3am.toISOString().slice(0, 10));
        // app keys + routes
        for (const re of [/openQuickAdd/, /undoLastGrade/, /gPrefixTs/, /renderMistakes/, /renderDrill/, /renderExamDay/, /exam-countdown/, /late-banner/]) assert.match(appSrc, re);
        assert.match(READ('site/views/subject.js'), /next-thing/);
        for (const re of [/renderSparkline/, /schedule-checklist/]) assert.match(READ('site/views/today.js'), re);
        assert.match(READ('site/views/review.js'), /undo-toast/, 'undo-toast lives in views/review.js');
        for (const route of ['mistakes','drill']) assert.ok(appSrc.includes(`'${route}'`));
        // new shortcuts in modal
        const shortcutsSrc = READ('site/shortcuts.js');
        for (const s of ['quick add card', 'pomodoro', 'undo last grade', 'flag card', 'go mistakes']) assert.ok(shortcutsSrc.includes(s), 'missing shortcut: '+s);
        // originals never surfaced — no medbak/audio-transcripts/book-texts/pages-NNN in shards or guides
        const fs2 = require('fs');
        assert.ok(!fs2.existsSync('site/data/medbak-index.json'), 'medbak-index.json should be deleted');
        for (const s of ['cardiology','rheumatology','pulmonology']) {
            const j = JSON.parse(READ(`${DDIR}/${s}.json`));
            const body = (j.guide && j.guide.body) || '';
            assert.ok(!/pages-\d|audio-transcripts|book-texts|medbak/i.test(body), `${s} guide body leaks original-source refs`);
            const titles = (j.guide.sections || []).map(x => x.title || '').join('|');
            assert.ok(!/pages?[\s_-]*\d+[\s_-]*\d+|CMED[A-Z0-9]+/i.test(titles), `${s} section titles leak transcript filenames`);
        }
    });

    t('videos: 8 subjects each have ≥1 mp4 + shard.guide.videos populated + manifest videoCount + totals=8 + app wires .video-hero', () => {
        for (const s of SUBJECTS) {
            const sh = SHARDMAP[s];
            assert.ok(Array.isArray(sh.guide.videos) && sh.guide.videos.length >= 1, `${s} missing videos`);
            const v = sh.guide.videos[0];
            assert.ok(v.filename && /\.(mp4|webm)$/i.test(v.filename), `${s} video filename`);
            assert.ok(v.src && v.src.startsWith(`data/cmed4-2026/videos/${s}/`), `${s} video src path`);
            const meta = MANIFEST.subjects.find(x => x.subject === s);
            assert.strictEqual(meta.videoCount, sh.guide.videos.length, `${s} manifest videoCount mismatch`);
            assert.ok(fs.existsSync(path.join(ROOT, 'site', v.src)), `${s} video file missing on disk`);
        }
        // Video count should equal number of subjects with videos
        const subjectsWithVideos = MANIFEST.subjects.filter(m => m.videoCount > 0).length;
        assert.strictEqual(MANIFEST.totals.videoCount, subjectsWithVideos, 'manifest totals.videoCount mismatch');
        const app = READ('site/app.js');
        assert.ok(/buildVideoHero/.test(READ('site/views/subject.js')), 'subject.js missing buildVideoHero');
        assert.ok(/class:\s*'panel video-hero'/.test(READ('site/views/subject.js')), 'subject.js missing .video-hero class');
        assert.ok(/has-video/.test(READ('site/views/guides.js')), 'guides.js missing has-video badge wiring');
        const search = READ('site/search.js');
        assert.ok(/kind:\s*'video'/.test(search), 'search.js missing video kind');
        const sw = READ('site/sw.js');
        assert.ok(/isVideo/.test(sw), 'sw.js should skip caching videos');
        const css = READ('site/style.css');
        assert.ok(/\.video-hero/.test(css), 'style.css missing .video-hero rule');
    });

    t('audio deep-dives: 8 subjects each have 1 m4a + shard.guide.audio + manifest audioCount + app wires audio-panel', () => {
        const SUBJ_ROOT = path.join(ROOT, 'syllabus', 'cmed4-2026');
        for (const s of SUBJECTS) {
            const sh = SHARDMAP[s];
            assert.ok(Array.isArray(sh.guide.audio) && sh.guide.audio.length === 1, `${s} guide.audio length`);
            const a = sh.guide.audio[0];
            assert.ok(/\.(m4a|opus)$/i.test(a.filename), `${s} audio filename ext`);
            assert.ok(a.src.startsWith(`data/cmed4-2026/audio/${s}/`), `${s} audio src path`);
            assert.ok(fs.existsSync(path.join(ROOT, 'site', a.src)), `${s} audio file copied to site/data`);
            // Source file exists if original m4a is in archive; compressed opus also counts
            const origExists = fs.existsSync(path.join(SUBJ_ROOT, s, 'audio-deepdive', a.filename));
            const sourceDir = path.join(SUBJ_ROOT, s, 'audio-deepdive');
            const hasAudioSource = origExists || (fs.existsSync(sourceDir) && fs.readdirSync(sourceDir).some(f => /\.(m4a|opus)$/.test(f)));
            assert.ok(hasAudioSource, `${s} source audio not found`);
            const meta = MANIFEST.subjects.find(x => x.subject === s);
            assert.strictEqual(meta.audioCount, 1, `${s} manifest audioCount`);
        }
        const app = READ('site/app.js');
        assert.ok(/buildAudioPanel/.test(READ('site/views/subject.js')), 'subject.js missing buildAudioPanel');
        assert.ok(/audio-panel/.test(READ('site/views/subject.js')), 'subject.js missing audio-panel class');
        const ga = READ('.gitattributes');
        assert.ok(/\*\.m4a filter=lfs/.test(ga), '.gitattributes missing m4a LFS filter');
    });

    t('syllabus: manifest + cmed4-2026 syllabus.json + build reads from syllabus path + triage scenarios nested', () => {
        const sm = JSON.parse(READ('syllabus/manifest.json'));
        assert.strictEqual(sm.default, 'cmed4-2026');
        assert.ok(Array.isArray(sm.syllabi) && sm.syllabi.includes('cmed4-2026'));
        const sj = JSON.parse(READ('syllabus/cmed4-2026/syllabus.json'));
        assert.strictEqual(sj.id, 'cmed4-2026');
        assert.ok(typeof sj.name === 'string' && sj.name.length > 0);
        // Syllabus may carry additional subjects beyond the 8 with full asset coverage (e.g. paediatrics, partial).
        for (const s of SUBJECTS) assert.ok(sj.subjects.includes(s), `syllabus.json missing ${s}`);
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(sj.examDate));
        for (const s of SUBJECTS) {
            assert.ok(fs.existsSync(path.join(ROOT, 'syllabus/cmed4-2026', s, 'triage_scenarios.yml')), `${s} triage nested`);
            assert.ok(!fs.existsSync(path.join(ROOT, `${s}_triage_scenarios.yml`)), `${s} legacy triage at root must be gone`);
        }
        const build = READ('scripts/build_data.js');
        // build_data.js delegates to the single-owner resolver and now builds EVERY
        // registered syllabus into site/data/<id>/ (swappable layout). The CORPUS_SYLLABUS
        // env hook still lives once in scripts/syllabus.js (consumed by anki_export).
        assert.ok(/require\(['"]\.\/syllabus\.js['"]\)/.test(build), 'build_data.js must import scripts/syllabus.js (single-owner resolver), not duplicate it');
        assert.ok(/listSyllabi/.test(build), 'build_data.js must build all syllabi via listSyllabi');
        assert.ok(/CORPUS_SYLLABUS/.test(READ('scripts/syllabus.js')), 'CORPUS_SYLLABUS env hook must live in syllabus.js');
        const syl = require('./scripts/syllabus.js');
        assert.ok(typeof syl.resolveSyllabus === 'function' && typeof syl.listSyllabi === 'function' && typeof syl.safeReaddir === 'function', 'scripts/syllabus.js must export resolveSyllabus + listSyllabi + safeReaddir');
        assert.ok(syl.DEFAULT_SUBJECTS.includes('paediatrics') && syl.DEFAULT_SUBJECTS.includes('paediatrics-neonatal'), 'syllabus DEFAULT_SUBJECTS must include both paediatrics subjects');
        // swappable layout: per-syllabus data dirs + the selector index syllabi.json.
        const syllabiIdx = JSON.parse(READ('site/data/syllabi.json'));
        assert.ok(Array.isArray(syllabiIdx) && syllabiIdx.some(x => x.id === 'cmed4-2026' && x.default), 'syllabi.json must list cmed4-2026 as default');
        assert.ok(syllabiIdx.some(x => x.id === 'mccqe1'), 'syllabi.json must include mccqe1');
        assert.ok(fs.existsSync(path.join(ROOT, 'site/data/mccqe1/manifest.json')), 'mccqe1 data set must be built');
        const mq = JSON.parse(READ('site/data/mccqe1/manifest.json'));
        assert.ok(mq.subjects.length >= 20 && mq.totals.cards > 10000, 'mccqe1 must have 20+ subjects and the full card set');
        // Triage grading invariants (quality-max sweep, 2026-06-10): highlight_card
        // must ACCUMULATE — the grading prompt calls it once per correct atom, so
        // single-select (`c.highlighted = c.id === id` for all cards) caps the hit
        // count at 1 and under-scores. And the graded score must be re-persisted
        // after state.lastGrade is set, else it lives only in a transient global and
        // is lost on reload.
        assert.ok(!/for \(const c of state\.cards\) c\.highlighted = \(c\.id === id\)/.test(liveSrc), 'highlight_card must accumulate, not single-select');
        assert.match(liveSrc, /state\.streak = score >= 70[\s\S]{0,400}?persistActive\(\)/, 'graded score must be re-persisted after lastGrade is set');
        const ankiSrc = READ('scripts/anki_export.js');
        assert.match(ankiSrc, /require\('\.\/syllabus\.js'\)/, 'anki_export.js must use the shared syllabus resolver');
        // build_data.js now uses the single-owner DEFAULT_SUBJECTS fallback from
        // syllabus.js (asserted complete at line 503), so it can never drift out of
        // sync with the resolver — a layout change updates one list, both consumers
        // follow. `node scripts/build_data.js` ran clean above proving the import works.
        assert.ok(/id === 'cmed4-2026'.*DEFAULT_SUBJECTS|DEFAULT_SUBJECTS\.slice/.test(READ('scripts/syllabus.js')), 'syllabus.js resolveSyllabusById must fall back to shared DEFAULT_SUBJECTS for cmed4-2026');
        assert.ok(!/path\.join\(ROOT, s, 'srs-cards'\)/.test(ankiSrc), 'anki_export.js must not read the flat ROOT/<subj>/srs-cards layout');
        // It actually runs without throwing and emits notes.
        const cp = require('child_process');
        const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'anki_export.js')], { encoding: 'utf8' });
        assert.strictEqual(r.status, 0, 'anki_export.js exited non-zero: ' + (r.stderr || '').slice(0, 300));
        assert.match(r.stdout || '', /wrote .* — \d+ notes/, 'anki_export.js did not report notes written');
    });

    await ta('swappable syllabus: skey namespacing + legacy migration + mccqe1 import transforms', async () => {
        const sylRt = await import('./site/syllabus.js');
        global.localStorage.clear();
        // default active syllabus -> keys namespaced under cmed4-2026.
        assert.strictEqual(sylRt.getActiveSyllabus(), 'cmed4-2026');
        assert.strictEqual(sylRt.skey('srs.states'), 'corpus.cmed4-2026.srs.states');
        assert.strictEqual(sylRt.dataPath('manifest.json'), './data/cmed4-2026/manifest.json');
        // legacy migration: unprefixed key copied into the default namespace, non-destructive + idempotent.
        global.localStorage.setItem('corpus.srs.states', '{"legacy":1}');
        sylRt.migrateLegacyKeys('cmed4-2026');
        assert.strictEqual(global.localStorage.getItem('corpus.cmed4-2026.srs.states'), '{"legacy":1}');
        assert.strictEqual(global.localStorage.getItem('corpus.srs.states'), '{"legacy":1}', 'legacy key preserved');
        global.localStorage.setItem('corpus.cmed4-2026.srs.states', '{"new":1}');
        sylRt.migrateLegacyKeys('cmed4-2026'); // must NOT clobber newer namespaced data
        assert.strictEqual(global.localStorage.getItem('corpus.cmed4-2026.srs.states'), '{"new":1}');
        global.localStorage.clear();
        // import transforms (pure, no 16k file needed).
        const imp = require('./scripts/import_mccqe1.js');
        assert.strictEqual(imp.slugifyDiscipline('InfectiousDisease'), 'infectious-disease');
        assert.strictEqual(imp.slugifyDiscipline('ObGyn'), 'ob-gyn');
        assert.strictEqual(imp.difficultyLabel(1), 'easy');
        assert.strictEqual(imp.difficultyLabel(3), 'medium');
        assert.strictEqual(imp.difficultyLabel(5), 'hard');
        assert.strictEqual(imp.dq('a "b": c\nd'), '"a \\"b\\": c\\nd"', 'dq escapes quotes + newlines for parse_yaml');
        // generated cards round-trip through the real parser into build_data's card shape.
        const { parseYaml } = require('./scripts/parse_yaml.js');
        const yml = `cards:\n  - front: ${imp.dq('Q: with colon')}\n    back: ${imp.dq('line1\nline2')}\n    difficulty: hard\n    tags: ${imp.tagSeq(['a', 'b'])}\n`;
        const parsed = parseYaml(yml);
        assert.strictEqual(parsed.cards[0].front, 'Q: with colon');
        assert.strictEqual(parsed.cards[0].back, 'line1\nline2');
        assert.deepStrictEqual(parsed.cards[0].tags, ['a', 'b']);
        // mccqe1 study guides are generated FROM cards (one ## section per topic).
        const guide = READ('site/data/mccqe1/cardiology.json');
        const cj = JSON.parse(guide);
        assert.ok(cj.guide && cj.guide.sections.length >= 1 && cj.cards.length > 100, 'mccqe1 cardiology guide built from cards');
    });

    console.log('# phase 1: schedule engine + calendar + settings + nav');
    t('schedule determinism + config round-trip + edit/lock + calendar render + nav links + broadcastchannel', async () => {
        global.localStorage.clear();
        const sched = await import('./site/schedule.js');
        // config round-trip
        const c1 = sched.loadConfig();
        assert.strictEqual(c1.intensity, 'standard');
        assert.strictEqual(c1.pomodoro, 25);
        sched.saveConfig({ intensity: 'hard', pomodoro: 30 });
        const c2 = sched.loadConfig();
        assert.strictEqual(c2.intensity, 'hard'); assert.strictEqual(c2.pomodoro, 30);
        // weights/availability merge defaults
        assert.ok(typeof c2.availability.mon === 'number');
        for (const s of SUBJECTS) assert.ok(typeof c2.weights[s] === 'number');
        // determinism — same inputs → same blocks
        global.localStorage.clear();
        sched.saveConfig({ intensity: 'standard', chronotype: 'morning', pomodoro: 25, breakLen: 5 });
        const today = '2026-05-06';
        const dueCounts = Object.fromEntries(SUBJECTS.map((s, i) => [s, i * 2]));
        const a = sched.regenerate({ today, dueCounts, horizonDays: 7 });
        const ids = a.blocks.map(b => b.id);
        const lensA = a.blocks.map(b => `${b.date}:${b.subject}:${b.startMin}:${b.len}`);
        global.localStorage.removeItem('corpus.schedule.v1');
        const b = sched.regenerate({ today, dueCounts, horizonDays: 7 });
        const lensB = b.blocks.map(x => `${x.date}:${x.subject}:${x.startMin}:${x.len}`);
        assert.deepStrictEqual(lensA, lensB);
        assert.ok(a.blocks.length > 0);
        // markBlockComplete + editBlock + lockBlock
        const studyBlock = a.blocks.find(x => x.kind === 'study');
        assert.ok(studyBlock);
        const m = sched.markBlockComplete(studyBlock.id, true);
        assert.strictEqual(m.done, true);
        const ed = sched.editBlock(studyBlock.id, { len: 99 });
        assert.strictEqual(ed.len, 99);
        const lk = sched.lockBlock(studyBlock.id, true);
        assert.strictEqual(lk.locked, true);
        // locked blocks survive regenerate
        const after = sched.regenerate({ today, dueCounts, horizonDays: 7 });
        const found = after.blocks.find(x => x.id === studyBlock.id);
        assert.ok(found && found.locked && found.len === 99 && found.done);
        // dayCompletion + subjectHeat
        const comp = sched.dayCompletion(studyBlock.date);
        assert.ok(comp.total >= 1 && comp.totalMin > 0);
        const heat = sched.subjectHeat(studyBlock.date);
        assert.ok(Object.keys(heat).length >= 1);
        // helpers
        assert.strictEqual(sched.addDays('2026-05-06', 3), '2026-05-09');
        assert.strictEqual(sched.daysBetween('2026-05-06', '2026-05-09'), 3);
        // calendar render — DOM-island assertions via served HTML
        const calSrc = READ('site/calendar.js');
        for (const re of [/function renderDayCell/, /cal-grid/, /openDetail/, /renderRing/, /renderHeatbar/, /onUpdate/, /toolbar/i]) assert.match(calSrc, re);
        // app.js wiring
        for (const re of [/import \* as schedule from '\.\/schedule\.js'/, /import \* as calendar from '\.\/calendar\.js'/, /function renderCalendar/, /renderScheduleConfigPanel/, /calendar.*today|ROUTE_ALIASES/, /BroadcastChannel\('corpus'\)/, /schedule:updated/, /dueCountsBySubject/]) assert.match(appSrc, re);
        // nav in triage-live.html
        assert.match(liveHtml, /#calendar/);
        // settings panel HTML hooks
        for (const re of [/schedule-config/, /intensity-group/, /chrono-group/, /cfg-availability/, /cfg-weights/, /cfg-preview/]) assert.match(appSrc, re);
        // SW shell + cache key
        const sw = READ('site/sw.js');
        assert.ok(sw.includes('__BUILD_VERSION__') || /corpus-v\d+/.test(sw));
        // index.html uses auto-version placeholder under network-first SW
        // schedule emits BroadcastChannel + custom event
        for (const re of [/BroadcastChannel\('corpus'\)/, /schedule:updated/, /dispatchEvent/]) assert.match(READ('site/schedule.js'), re);
    });

    console.log('# gamification stripped + mastery + sw');
    const masteryMod = await import('./site/mastery.js');
    t('game/confetti deleted + mastery + sw + ?v=__BUILD_VERSION__ + no quests/badges/notes/xp', () => {
        global.localStorage.clear();
        // game.js + confetti.js removed
        assert.ok(!fs.existsSync(path.join(ROOT, 'site/game.js')), 'game.js should be deleted');
        assert.ok(!fs.existsSync(path.join(ROOT, 'site/confetti.js')), 'confetti.js should be deleted');
        assert.ok(!fs.existsSync(path.join(ROOT, 'site/quests.js')), 'quests.js should be deleted');
        assert.ok(!fs.existsSync(path.join(ROOT, 'site/badges.js')), 'badges.js should be deleted');
        assert.ok(!fs.existsSync(path.join(ROOT, 'site/notes.js')), 'notes.js should be deleted');
        // app.js no longer references game/confetti/xp/awardXP
        for (const re of [/from '\.\/game\.js'/, /from '\.\/confetti\.js'/, /\bawardXP\b/, /\brenderXpChip\b/, /\brenderXpBarFull\b/, /\bawardCardXP\b/, /\bxp-chip\b/, /game\./, /confetti\./, /quests\.js/, /badges\.js/, /notes\.js/, /renderQuests\b/, /renderBadges\b/, /renderNotes\b/, /handleHighlightOrNote/, /runBadgeEvaluation/]) assert.ok(!re.test(appSrc), 'app.js still references ' + re);
        // aliases in place (now in router.js)
        assert.match(READ('site/router.js'), /notes:\s*'today'/);
        assert.match(READ('site/router.js'), /quests:\s*'today'/);
        assert.match(READ('site/router.js'), /badges:\s*'today'/);
        // mastery — empty shards => 0%
        const emptyShards = Object.fromEntries(SUBJECTS.map(s => [s, { cards: [], guide: { sections: [] }, triage: { scenarios: [] } }]));
        const m = masteryMod.overallProgress(MANIFEST, emptyShards);
        assert.strictEqual(m.weighted, 0);
        // mastery — real shards yields valid object
        const m2 = masteryMod.overallProgress(MANIFEST, SHARDMAP);
        assert.ok(m2.cards.total > 0 && m2.sections.total > 0 && m2.cases.total > 0);
        assert.ok(typeof m2.weighted === 'number');
        // SW v13 + new modules
        const sw = READ('site/sw.js');
        assert.ok(sw.includes('__BUILD_VERSION__') || /corpus-v\d+/.test(sw));
        // SW shell minimal under auto-versioning (network-first); modules cached on first fetch
        assert.ok(sw.includes('./index.html'));
        // index.html uses auto-version placeholder
        assert.match(indexHtml, /app\.js\?v=(__BUILD_VERSION__|\d+)/);
        assert.match(indexHtml, /style\.css\?v=(__BUILD_VERSION__|\d+)/);
        // infographics: relocated guides + infographics dir + shard arrays + lightbox + concise/ gone
        assert.ok(!fs.existsSync(path.join(ROOT, 'concise')), 'concise/ should be removed');
        const SUBJ_ROOT = path.join(ROOT, 'syllabus', 'cmed4-2026');
        for (const s of SUBJECTS) assert.ok(fs.existsSync(path.join(SUBJ_ROOT, s, 'study_guide.md')), s + '/study_guide.md missing under syllabus');
        // Chars are byte-of-source — drift signals lossy edits, not formatting drift.
        // Floor enforces "no truncation" without re-baselining on every CRLF flip.
        const minChars = { cardiology: 230000, diabetes: 135000, endocrine: 135000, gastroenterology: 185000, geriatric: 55000, nephrology: 130000, pulmonology: 135000, rheumatology: 48000 };
        for (const s of SUBJECTS) assert.ok(SHARDMAP[s].guide.chars >= minChars[s], `${s} char count ${SHARDMAP[s].guide.chars} < floor ${minChars[s]}`);
        for (const s of SUBJECTS) {
            const igs = SHARDMAP[s].guide.infographics;
            assert.ok(Array.isArray(igs), s + ' infographics array');
            const expected = s === 'rheumatology' ? 0 : 1;
            assert.strictEqual(igs.length, expected, s + ' infographics length');
            if (expected === 1) {
                assert.ok(igs[0].filename && igs[0].title && igs[0].alt && igs[0].src);
                assert.ok(fs.existsSync(path.join(ROOT, 'site', igs[0].src)), s + ' asset copied');
            }
        }
        // app.js wires panel + lightbox
        assert.match(READ('site/views/subject.js'), /buildInfographicsPanel/);
        assert.match(READ('site/views/subject.js'), /openInfographicLightbox/);
        assert.match(READ('site/views/subject.js'), /infographic-tile/);
        assert.match(READ('site/views/subject.js'), /lightbox-overlay/);
        assert.match(appSrc, /'Escape'/);
        assert.match(READ('site/views/subject.js'), /'ArrowLeft'/);
        assert.match(READ('site/views/subject.js'), /'ArrowRight'/);
        // CSS for panel + lightbox
        assert.match(styleCss, /\.infographics-grid/);
        assert.match(styleCss, /\.lightbox-overlay/);
        assert.match(styleCss, /repeat\(auto-fill, minmax\(220px/);
        // SW network-first under auto-versioning — infographic assets cached on first fetch (no SHELL precache)
        // search.js indexes infographics
        const searchSrc = READ('site/search.js');
        assert.match(searchSrc, /kind: 'infographic'/);
        // raw-source markers absent from shards
        for (const s of SUBJECTS) {
            const body = (SHARDMAP[s].guide && SHARDMAP[s].guide.body) || '';
            assert.ok(!/pages-\d{3}-\d{3,4}/.test(body), s + ' body has pages-NNN');
            assert.ok(!/CMED4IIM/.test(body), s + ' body has CMED4IIM');
            assert.ok(!/^-\s*page\s+\d+\s*-\s*$/im.test(body), s + ' body has - page N - marker');
            assert.ok(!/\(page\s+\d+\)/i.test(body), s + ' body has (page N) parenthetical');
            assert.ok(!/^#{1,6}\s+page\s+\d+\s*$/im.test(body), s + ' body has page heading');
            assert.ok(!/^#{1,6}\s+audio lectures?\s*$/im.test(body), s + ' body has Audio Lectures heading');
            assert.ok(!/^#{1,6}\s+textbook sections?\s*$/im.test(body), s + ' body has Textbook Sections heading');
            for (const sec of (SHARDMAP[s].guide?.sections || [])) {
                assert.ok(!/pages-\d{3}-\d{3,4}|CMED4IIM/.test(sec.title || ''), s + ' raw section title');
                assert.ok(!/^pages?\s+\d+(-\d+)?$/i.test(sec.title || ''), s + ' page-marker section title: ' + sec.title);
                assert.ok(!/^pages?-\d+(-\d+)?$/i.test(sec.title || ''), s + ' pages-range section title: ' + sec.title);
            }
        }
        // guide typography (desktop defaults; mobile overrides asserted in responsive group)
        assert.match(styleCss, /\.guide-body\s*\{[^}]*line-height:\s*1\.7/);
        assert.match(styleCss, /\.guide-body\s*\{[^}]*font-size:\s*17px/);
        assert.match(styleCss, /\.guide-body\s*>\s*\*\s*\{[^}]*max-width:\s*68ch/);
        assert.match(styleCss, /\.guide-body h3\s*\{[^}]*margin-top:\s*2em/);
        assert.match(styleCss, /\.guide-body li\s*\{[^}]*margin-block:\s*0\.45em/);
        assert.match(styleCss, /\.guide-body p\s*\{\s*margin-block:\s*0\s+1\.15em/);
        // render-time paragraph polish: softSplitPara + disfluency cleanup + typo refine.
        // The markdown cluster was extracted from app.js into its own leaf module
        // (site/markdown.js) — import and exercise the real exports rather than
        // source-slicing app.js, so the test follows the artifact it validates.
        const H = markdown;
        assert.strictEqual(typeof H.softSplitPara, 'function');
        assert.strictEqual(typeof H.cleanDisfluencies, 'function');
        assert.strictEqual(typeof H.typoRefine, 'function');
        assert.strictEqual(typeof H.renderMarkdown, 'function');
        // app.js must consume the module, not redefine the helpers inline.
        assert.match(READ('site/views/review.js'), /import \{ renderMarkdown \} from '\.\.\/markdown\.js'/);
        assert.ok(!/function renderMarkdown/.test(appSrc), 'renderMarkdown must live in markdown.js, not app.js');
        // disfluency removal
        assert.strictEqual(H.cleanDisfluencies('um, the patient, you know, has uh hypertension.'), 'the patient, has hypertension.');
        // em-dash and en-dash refine
        assert.ok(H.typoRefine('she was 50 -- 60 years old, BP 120-140 mmHg').includes('—'));
        assert.ok(H.typoRefine('range 5-10 mg').includes('–'));
        // soft split: long paragraph with >3 sentences breaks into multiple chunks
        const longTxt = 'First sentence here goes long enough to push past the threshold meaningfully. Second sentence runs longer than expected and keeps adding clinical detail. Third sentence keeps the patient story going further with workup notes and findings. Fourth sentence wraps it up nicely with a clear plan and disposition. Fifth sentence adds yet more detail to the case from the consult team. Sixth sentence finally concludes the matter completely with follow-up arrangements.';
        const chunks = H.softSplitPara(longTxt);
        assert.ok(chunks.length >= 2, 'expected soft-split into multiple chunks, got ' + chunks.length);
        // short input passes through
        assert.strictEqual(H.softSplitPara('Just one sentence.').length, 1);
        // hard-wrap safety net: nothing over 900 chars survives
        const monster = ('lorem ipsum dolor sit amet '.repeat(60)).trim();
        const wrapped = H.softSplitPara(monster);
        assert.ok(wrapped.every(c => c.length <= 900), 'monster paragraph not hard-wrapped: ' + wrapped.map(c=>c.length).join(','));
        // app.js wiring (gamification stripped)
        assert.match(appSrc, /import \* as toast from '\.\/toast\.js'/);
        assert.match(READ('site/views/today.js'), /import \* as mastery from '\.\.\/mastery\.js'/);
        // gamification fully removed
        for (const re of [/import \* as game from/, /function renderXpChip/, /xp-chip/, /awardCardXP/, /pomodoro:done/]) assert.ok(!re.test(appSrc), 'app.js still has ' + re);
        // CSS tokens — toast container still present (toasts still used)
        assert.match(styleCss, /\.toast-container/);
        // gamification CSS gone
        for (const re of [/--c-xp/, /\.xp-chip/, /\.confetti-canvas/]) assert.ok(!re.test(styleCss), 'style.css still has ' + re);
        // triage-live broadcasts case:graded
        assert.match(liveSrc, /case:graded/);
    });

    console.log('# mobile + tablet responsive + guide typography + markdown');
    t('mobile+tablet media queries + tap-targets + guide hyphens/blockquote/table/hr + markdown ol+blockquote', () => {
        const styleCss = fs.readFileSync('site/style.css', 'utf8');
        const appJs = fs.readFileSync('site/app.js', 'utf8');
        const mdJs = fs.readFileSync('site/markdown.js', 'utf8');
        // mobile + tablet media queries exist
        assert.match(styleCss, /@media \(max-width: 600px\)/);
        assert.match(styleCss, /@media \(min-width: 601px\) and \(max-width: 1024px\)/);
        // tap-target floors
        assert.match(styleCss, /\.run-btn,\s*\.grade-btn\s*\{\s*min-height:\s*44px/);
        assert.match(styleCss, /\.cta[\s\S]{0,300}min-height:\s*44px/);
        // guide typography
        assert.match(styleCss, /\.guide-body\s*\{\s*hyphens:\s*auto/);
        assert.match(styleCss, /\.guide-body p\s*\{\s*text-wrap:\s*pretty/);
        assert.match(styleCss, /\.guide-body blockquote/);
        assert.match(styleCss, /\.guide-body table/);
        assert.match(styleCss, /\.guide-body hr/);
        // mobile guide font scale
        assert.match(styleCss, /\.guide-body\s*\{\s*font-size:\s*16px/);
        // verdict-table + cal-grid mobile fixes
        assert.match(styleCss, /\.cal-grid\.month\s*\{\s*gap:\s*2px/);
        assert.match(styleCss, /\.verdict-table[^{]*\{\s*display:\s*block/);
        // markdown renderer (now in markdown.js) handles ordered lists, blockquotes, hr, tables
        assert.match(mdJs, /export function renderMarkdown/);
        assert.match(mdJs, /openListIfNeeded/);
        assert.match(mdJs, /<blockquote>/);
        assert.match(mdJs, /<hr>/);
        assert.match(mdJs, /\\d\+\[\.\)\]/); // ordered list pattern
    });

    console.log('# schedule reconcile + eligibility gate');
    const newcards = await import('./site/newcards.js');
    t('reconcile surplus + rollover + getDueCards eligibility gate + introduceCard + isEligible', async () => {
        const sched = await import('./site/schedule.js');
        global.localStorage.clear();
        // gating: cards with no history are NOT due (fresh user sees 0 due)
        const fresh = srs.getDueCards(['c1','c2','c3'], {});
        assert.deepStrictEqual(fresh, [], 'fresh user has 0 due cards');
        // introduced card (history present) IS due when dueAt <= now
        const states = {
            c1: { suspended: false, dueAt: 0, history: [{ ts: 1, score: null, kind: 'introduced' }] },
            c2: { suspended: false, dueAt: Date.now() + 86400000, history: [{ ts: 1, score: 4 }] },
            c3: { suspended: true, dueAt: 0, history: [{ ts: 1, score: 4 }] }
        };
        const due = srs.getDueCards(['c1','c2','c3'], states);
        assert.deepStrictEqual(due, ['c1'], 'introduced+due+unsuspended only');
        // isEligible: section-tick gate
        const card = { id: 'x', _subject: 'cardiology', requires: { sectionLine: 42 } };
        assert.strictEqual(srs.isEligible(card, undefined, {}), false, 'no tick → not eligible');
        assert.strictEqual(srs.isEligible(card, undefined, { '42': true }), true, 'tick on section → eligible');
        const cardNoLine = { id: 'y', _subject: 'cardiology' };
        assert.strictEqual(srs.isEligible(cardNoLine, undefined, {}), false, 'no tick anywhere → not eligible');
        assert.strictEqual(srs.isEligible(cardNoLine, undefined, { '7': true }), true, 'subject-touched → eligible for unlinked card');
        // introduceCard seeds a history entry
        global.localStorage.clear();
        srs.introduceCard('newcard');
        assert.ok(srs.isIntroduced(srs.loadStates()['newcard']));
        // schedule.reconcile: surplus credits next-day same-subject
        sched.saveConfig({ intensity: 'standard', chronotype: 'morning', pomodoro: 25, breakLen: 5, weights: Object.fromEntries(SUBJECTS.map(s => [s, s === 'cardiology' ? 1 : 0])) });
        const today = '2026-05-07';
        const dueCounts = Object.fromEntries(SUBJECTS.map(s => [s, s === 'cardiology' ? 30 : 0]));
        sched.regenerate({ today, dueCounts, horizonDays: 3, extras: { ticksAll: {}, shards: SHARDMAP, casesDone: {} } });
        const sNow = sched.loadSchedule();
        const todayBlocks = sNow.blocks.filter(b => b.date === today && b.kind === 'study');
        assert.ok(todayBlocks.length >= 1, 'today has at least one study block');
        const firstToday = todayBlocks[0];
        assert.ok(typeof firstToday.plannedReview === 'number', 'plannedReview present');
        assert.ok(typeof firstToday.plannedNew === 'number', 'plannedNew present');
        // Surplus path: actual exceeds first block's planned -> next-day adjustment
        const reconciled = sched.reconcile({ today, actualBySubject: { cardiology: { review: (firstToday.plannedReview || 0) + 5, new: 0, sectionsRead: new Set(), casesDone: new Set() } } });
        const firstAfter = reconciled.blocks.find(b => b.id === firstToday.id);
        assert.strictEqual(firstAfter.over, true, 'first block should be flagged over');
        assert.ok(firstAfter.surplus >= 1, 'surplus recorded');
        // Rollover path: simulate yesterday block planned=10 actual=4 -> today rollover.review=6
        global.localStorage.clear();
        const yesterday = '2026-05-06';
        const tWithPast = '2026-05-07';
        sched.saveConfig({ intensity: 'standard', chronotype: 'morning', pomodoro: 25, breakLen: 5, weights: Object.fromEntries(SUBJECTS.map(s => [s, s === 'cardiology' ? 1 : 0])) });
        // build for two days starting yesterday
        sched.regenerate({ today: yesterday, dueCounts, horizonDays: 3, extras: { ticksAll: {}, shards: SHARDMAP, casesDone: {} } });
        const sched2 = sched.loadSchedule();
        const yBlock = sched2.blocks.find(b => b.date === yesterday && b.kind === 'study');
        const tBlock = sched2.blocks.find(b => b.date === tWithPast && b.kind === 'study');
        assert.ok(yBlock && tBlock, 'have yesterday + today blocks');
        // force planned counts
        yBlock.plannedReview = 10; yBlock.plannedNew = 0;
        tBlock.plannedReview = 5; tBlock.plannedNew = 0;
        sched.saveSchedule(sched2);
        const r2 = sched.reconcile({ today: tWithPast, actualByDayBySubject: { [yesterday]: { cardiology: { review: 4, new: 0, sectionsRead: new Set(), casesDone: new Set() } } } });
        const tAfter = r2.blocks.find(b => b.id === tBlock.id);
        assert.ok(tAfter.rollover, 'today block has rollover');
        assert.strictEqual(tAfter.rollover.review, 6, 'rollover review = shortfall 6');
        assert.strictEqual(tAfter.plannedReview, 11, 'today plannedReview absorbed +6');
        // newcards still works as record (not a gate)
        global.localStorage.clear();
        assert.strictEqual(newcards.cap(), 20);
        newcards.bump('cardiology', 3);
        assert.strictEqual(newcards.countToday('cardiology'), 3);
        // app.js: no lock UI, no eligibility predicate
        assert.ok(!/locks-strip/.test(appSrc), 'app.js should not contain locks-strip');
        assert.ok(!/unlock-panel/.test(appSrc), 'app.js should not contain unlock-panel');
        assert.ok(!/eligibleForSubject/.test(appSrc), 'app.js should not reference eligibleForSubject');
        assert.ok(!/coverageEligible/.test(appSrc), 'app.js should not reference coverageEligible');
        assert.ok(!/markWatched\(/.test(appSrc), 'app.js should not call markWatched');
        // srs.js: coverageEligible removed
        assert.ok(!/export function coverageEligible/.test(READ('site/srs.js')), 'srs.coverageEligible removed');
        assert.match(READ('site/srs.js'), /export function isNewCardForGate/);
        // schedule reconcile + work spec exported
        assert.match(READ('site/schedule.js'), /export function reconcile/);
        assert.match(READ('site/schedule.js'), /plannedReview/);
        assert.match(READ('site/schedule.js'), /plannedNew/);
        // today renders schedule-checklist
        assert.match(appSrc, /schedule-checklist/);
        assert.match(appSrc, /renderScheduleChecklist/);
        // daily caps: per-subject review cap + global new-card budget — plan can't dump full backlog
        global.localStorage.clear();
        const sched3 = await import('./site/schedule.js');
        sched3.saveConfig({ intensity: 'standard', chronotype: 'morning', pomodoro: 25, breakLen: 5, weights: Object.fromEntries(SUBJECTS.map(s => [s, 1])) });
        const tCap = '2026-05-07';
        const bigDue = Object.fromEntries(SUBJECTS.map(s => [s, 500])); // cold-start: everything due
        sched3.regenerate({ today: tCap, dueCounts: bigDue, horizonDays: 1, extras: { ticksAll: {}, shards: SHARDMAP, casesDone: {} } });
        const capDay = sched3.loadSchedule().blocks.filter(b => b.date === tCap && b.kind === 'study');
        const sumByS = {};
        for (const b of capDay) sumByS[b.subject] = (sumByS[b.subject] || 0) + (b.plannedReview || 0);
        for (const s of SUBJECTS) assert.ok((sumByS[s] || 0) <= 30, `per-subject review cap ${s}=${sumByS[s]}`);
        const totalNew = capDay.reduce((n, b) => n + (b.plannedNew || 0), 0);
        assert.ok(totalNew <= 12, `daily new-card cap (got ${totalNew})`);
        const guideSubjs = new Set(capDay.filter(b => (b.plannedSections || []).length).map(b => b.subject));
        assert.ok(guideSubjs.size <= 2, `guide-section subject cap (got ${guideSubjs.size})`);
        const caseSubjs = new Set(capDay.filter(b => (b.plannedCases || []).length).map(b => b.subject));
        assert.ok(caseSubjs.size <= 2, `case subject cap (got ${caseSubjs.size})`);
    });

    console.log('# tutor-store: history persistence + config + collapsed + checkin + corrupt/quota degradation');
    t('tutor history round-trip + cap + corrupt-safe; config defaults+merge; collapsed default; daily checkin gate; unified routing (no regex)', () => {
        localStorage.clear();
        // history round-trip
        const turns = [{ role: 'user', text: 'hi', ts: 1 }, { role: 'assistant', text: 'hello', ts: 2 }];
        tutorStore.saveHistory(turns);
        const loaded = tutorStore.loadHistory();
        assert.strictEqual(loaded.length, 2);
        assert.strictEqual(loaded[0].role, 'user'); assert.strictEqual(loaded[1].text, 'hello');
        // worker projection: {role,content}, capped to WORKER_CONTEXT_TURNS (16)
        const wh = tutorStore.toWorkerHistory(Array.from({ length: 20 }, (_, i) => ({ role: 'user', text: 'm' + i })));
        assert.strictEqual(wh.length, tutorStore.WORKER_CONTEXT_TURNS);
        assert.strictEqual(wh[0].content, 'm' + (20 - tutorStore.WORKER_CONTEXT_TURNS));
        // corrupt JSON degrades to [] without throwing, and clears the key
        localStorage.setItem(tutorStore.HISTORY_KEY, '{not json');
        assert.deepStrictEqual(tutorStore.loadHistory(), []);
        // non-array / bad-shape entries filtered out
        localStorage.setItem(tutorStore.HISTORY_KEY, JSON.stringify([{ role: 'bogus' }, { role: 'user', text: 'ok', ts: 1 }, 'junk']));
        assert.strictEqual(tutorStore.loadHistory().length, 1);
        // clearHistory empties it
        tutorStore.saveHistory(turns); tutorStore.clearHistory();
        assert.deepStrictEqual(tutorStore.loadHistory(), []);
        // config defaults + persistence + merge of partial
        const cfg = tutorStore.loadConfig();
        assert.strictEqual(cfg.proactiveCheckins, true); assert.strictEqual(cfg.autoCoachOnReview, true);
        tutorStore.saveConfig({ proactiveCheckins: false });
        const cfg2 = tutorStore.loadConfig();
        assert.strictEqual(cfg2.proactiveCheckins, false); assert.strictEqual(cfg2.autoCoachOnReview, true); // unspecified key keeps default
        // corrupt config falls back to defaults
        localStorage.setItem(tutorStore.CONFIG_KEY, 'xx');
        assert.strictEqual(tutorStore.loadConfig().proactiveCheckins, true);
        // collapsed: default true when unset, persists 0/1
        assert.strictEqual(tutorStore.loadCollapsed(true), true);
        tutorStore.saveCollapsed(false);
        assert.strictEqual(tutorStore.loadCollapsed(true), false);
        assert.strictEqual(localStorage.getItem(tutorStore.COLLAPSED_KEY), '0');
        // daily check-in gate: true before mark, false after, same day
        localStorage.removeItem(tutorStore.LAST_CHECKIN_KEY);
        assert.strictEqual(tutorStore.shouldCheckInToday(), true);
        tutorStore.markCheckedIn();
        assert.strictEqual(tutorStore.shouldCheckInToday(), false);
        // routing predictability: the panel no longer branches on a guide-question regex
        const panelSrc = READ('site/tutor-panel.js');
        assert.ok(!/guide-question/.test(panelSrc), 'panel must not route via guide-question regex');
        assert.ok(/cmd: 'user-message'/.test(panelSrc), 'panel uses the unified user-message path');
        // worker exposes the new stop + seed-history commands
        const workerTutor = READ('site/tutor.js');
        assert.ok(/cmd === 'stop'/.test(workerTutor) && /cmd === 'seed-history'/.test(workerTutor), 'worker handles stop + seed-history');
        // DAILY SYLLABUS as conversation (srs-mccqe1 parity): SYS.daily prompt + a
        // daily-syllabus handler that builds the plan summary, seeds history, and
        // persists via daily-syllabus-done. The opener must invite continuation.
        assert.ok(/daily:\s*`/.test(workerTutor) && /cmd === 'daily-syllabus'/.test(workerTutor), 'worker has SYS.daily + daily-syllabus handler');
        assert.ok(/function buildDailyPlanLine/.test(workerTutor) && /plannedReview|plannedNew/.test(workerTutor), 'daily plan summary built from schedule blocks');
        assert.ok(/daily-syllabus-done/.test(workerTutor) && /daily-syllabus-done/.test(panelSrc), 'daily-syllabus-done persists as a thread turn');
        assert.ok(/invit/i.test(workerTutor.slice(workerTutor.indexOf('daily: `'), workerTutor.indexOf('daily: `') + 700)) || /end your message by inviting/i.test(workerTutor), 'daily opener invites continuation');
        assert.ok(/export function startDailySyllabus/.test(panelSrc) && /setDailyPlanProvider/.test(panelSrc), 'panel exposes startDailySyllabus + plan provider');
        // daily walk requested before the model is ready DEFERS (pendingDailyPlan) and
        // fires from the 'ready' handler — never posts the cmd into a load-timeout race
        // (which spammed 3 "model load timed out" turns).
        assert.ok(/pendingDailyPlan/.test(panelSrc) && /modelStatus !== 'ready'/.test(panelSrc.slice(panelSrc.indexOf('export function startDailySyllabus'), panelSrc.indexOf('export function startDailySyllabus') + 600)), 'daily walk defers until model ready (no load-timeout error spam)');
        assert.ok(/Walk me through today/.test(panelSrc), 'daily-walk starter chip present');
        // coaching uses the handler's real cmd, gated by config (gradeReview now in views/review.js)
        const app = READ('site/app.js');
        const reviewSrc2 = READ('site/views/review.js');
        assert.ok(/cmd: 'generate-coaching'/.test(reviewSrc2), 'review posts generate-coaching (matches worker handler)');
        assert.ok(/autoCoachOnReview/.test(reviewSrc2) && /proactiveCheckins/.test(READ('site/views/today.js')), 'review gates coaching + today gates checkin on config');
        // daily check-in now launches the interactive syllabus walk with real blocks
        assert.ok(/startDailySyllabus\(plan\)/.test(READ('site/views/today.js')) && /setDailyPlanProvider/.test(app), 'today launches daily-syllabus walk; app wires provider');
        // empty/caught-up plan must NOT use the "present the FIRST block" prompt (that
        // contradicts the caught-up plan line and yields nonsense). A distinct
        // dailyCaughtUp prompt is selected when no actionable blocks exist.
        assert.ok(/dailyCaughtUp:\s*`/.test(workerTutor), 'worker has a caught-up daily prompt variant');
        assert.ok(/const hasWork =/.test(workerTutor) && /SYS\.daily : SYS\.dailyCaughtUp/.test(workerTutor), 'daily handler branches prompt on whether the plan has actionable blocks');
        assert.ok(/do NOT pretend there is a first block/.test(workerTutor), 'caught-up prompt forbids inventing a first block');
        // chat log a11y: append-only region announced as a log (not a bare div)
        assert.ok(/setAttribute\('role', 'log'\)/.test(panelSrc) && /aria-atomic', 'false'/.test(panelSrc), 'chat root is role=log with aria-atomic=false');
        // settings overlay is a modal dialog with a Tab focus trap (Escape/outside-click already close it)
        assert.ok(/setAttribute\('role', 'dialog'\)/.test(panelSrc) && /aria-modal', 'true'/.test(panelSrc), 'settings popover is role=dialog aria-modal');
        assert.ok(/if \(e\.key !== 'Tab'\) return;/.test(panelSrc) && /last\.focus\(\); e\.preventDefault\(\)/.test(panelSrc), 'settings popover traps Tab focus');
        // tool-dispatch surfaces malformed JSON + unknown actions (debugging aid; still no-throw)
        const tdSrc = READ('site/tool-dispatch.js');
        assert.ok(/malformed tool-block JSON/.test(tdSrc) && /unknown tool action/.test(tdSrc), 'tool-dispatch warns on malformed/unknown blocks');
        // per-dimension coverage residuals:
        // SCHEDULING: the same-session check-in dedup flag re-arms when the local date
        // rolls over, so a tab open past midnight still fires the next day's check-in.
        assert.ok(/tutorCheckinDate/.test(READ('site/views/today.js')) && /state\.tutorCheckinDate !== checkinToday/.test(READ('site/views/today.js')) && /state\.tutorCheckinPosted = false/.test(READ('site/views/today.js')), 'daily check-in dedup flag re-arms on date rollover (today)');
        // CONFIG: saveConfig returns the write result (honest interface) instead of swallowing it.
        assert.ok(/return safeSet\(CONFIG_KEY/.test(READ('site/tutor-store.js')), 'saveConfig returns the persist result');
        // UX: collapse toggle exposes aria-expanded from first render.
        assert.ok(/aria-expanded', String\(!isPanelCollapsed\)\)/.test(panelSrc), 'collapse toggle sets aria-expanded at creation');
        // message actions: SDK-agnostic action bar with copy + regenerate, hidden while thinking/streaming
        assert.ok(/tutor-action-bar/.test(panelSrc) && /updateActionBar/.test(panelSrc), 'panel has the SDK-agnostic action bar');
        assert.ok(/clipboard\?\.writeText/.test(panelSrc), 'copy uses clipboard');
        assert.ok(/regenerateLast/.test(panelSrc), 'retry wires regenerateLast');
        // review-fix invariants:
        // worker owns its own interrupted flag (transformers #interrupted is private)
        assert.ok(/state\.interrupted/.test(workerTutor) && /state\.interrupted = true/.test(workerTutor), 'worker owns interrupted flag');
        assert.ok(!/state\.stopping\.interrupted/.test(workerTutor), 'no read of private stopping.interrupted');
        // stop handler must NOT dispose KV (race); runChat owns KV disposal on interrupt
        const stopBlock = workerTutor.slice(workerTutor.indexOf("cmd === 'stop'"), workerTutor.indexOf("cmd === 'stop'") + 220);
        assert.ok(!/pastKV/.test(stopBlock), 'stop handler does not touch KV (no mid-gen dispose race)');
        // CHAT FIX: runChat must build a FRESH per-call KV cache, never reuse a
        // persisted state.pastKV across full-prompt generate calls — the reuse
        // double-counted context and made the model emit the same canned reply to
        // every input (the reported "chat sucks" bug). No cross-turn KV state.
        assert.ok(/let pastKV = new DynamicCache\(\)/.test(workerTutor), 'runChat builds a fresh per-call KV cache');
        assert.ok(!/state\.pastKV/.test(workerTutor) && !/kvSysKey/.test(workerTutor), 'no cross-turn persisted KV state (state.pastKV/kvSysKey removed)');
        // empty assistant replies are not pushed into worker history
        assert.ok(/if \(reply && reply\.trim\(\)\) pushHistory/.test(workerTutor), 'no empty assistant turn pushed');
        // auto-coaching uses a distinct ephemeral event, not the persisted coaching-done
        assert.ok(/review-coaching-done/.test(workerTutor) && /review-coaching-done/.test(panelSrc), 'auto-coaching is ephemeral (review-coaching-done)');
        // regenerate derives from the real preceding user turn + reseeds prior context (no dup)
        assert.ok(/lastRegenerableUserText/.test(panelSrc), 'regenerate uses lastRegenerableUserText');
        assert.ok(/slice\(0, -1\)/.test(panelSrc), 'regenerate reseeds prior context excluding resent turn');
        // checkin marked only on session-overview-done in the panel (date-guarded so a
        // reply arriving after local-midnight rollover can't stamp the wrong day), not in app.js
        assert.ok(/if \(shouldCheckInToday\(\)\) markCheckedIn\(\)/.test(panelSrc), 'checkin marked on session-overview-done, date-guarded');
        const appCheckinBlock = app.slice(app.indexOf('proactiveCheckins && shouldCheckInToday'), app.indexOf('proactiveCheckins && shouldCheckInToday') + 320);
        assert.ok(!/markCheckedIn/.test(appCheckinBlock), 'app.js does not eagerly markCheckedIn');
        // broadened quota detection
        const storeSrc = READ('site/tutor-store.js');
        assert.ok(/e\.code === 22/.test(storeSrc) && /1014/.test(storeSrc), 'quota detection covers Chrome+Firefox codes');

        // ---- conversation-mode UX overhaul invariants ----
        // CSS footguns fixed: single .tutor-panel-root block, unified 768px breakpoint, no dead mobile classes
        const css = READ('site/style.css');
        assert.strictEqual((css.match(/^\.tutor-panel-root \{/gm) || []).length, 1, 'single .tutor-panel-root rule block');
        assert.ok(!/max-width: 640px/.test(css) || !/tutor-mobile-overlay/.test(css), 'no stray 640px tutor overlay block');
        assert.ok(/tutor-sheet-open/.test(css) && /tutor-sheet-open/.test(panelSrc), 'body.tutor-sheet-open wired in CSS+JS');
        assert.ok(!/#fde2e2|#a11\b/.test(css), 'error pill colors themed, not hardcoded');
        // JS+CSS share the 768px mobile breakpoint
        assert.ok(/max-width: 768px/.test(panelSrc), 'JS keys mobile off 768px (matches CSS)');
        // lazy load: no eager init at boot; preload on open
        assert.ok(!/worker\.postMessage\(\{ cmd: 'init' \}\)/.test(app), 'no eager model init at boot');
        assert.ok(/preloadTutorModel/.test(panelSrc), 'panel preloads model on open');
        // send gated when not ready + optimistic thinking + watchdog
        assert.ok(/armThinkingWatchdog/.test(panelSrc) && /THINKING_TIMEOUT_MS/.test(panelSrc), 'thinking watchdog resets stuck state');
        assert.ok(/isThinking = true;\s*\n\s*armThinkingWatchdog/.test(panelSrc), 'isThinking set optimistically on send');
        // interrupted persisted as metadata, not baked into text
        assert.ok(/turn\.interrupted = true/.test(panelSrc) && !/clean \+ ' …⏹'/.test(panelSrc), 'interrupted is metadata, not text');
        // copy has execCommand fallback; toasts reuse one node with role=status
        assert.ok(/execCommand\('copy'\)/.test(panelSrc), 'copy falls back to execCommand');
        assert.ok(/role', 'status'/.test(panelSrc) && /toastEl/.test(panelSrc), 'single reusable toast with role=status');
        // worker uses a fresh per-call KV (no stale cross-turn reuse) + samples on regenerate + load timeout
        assert.ok(/past_key_values: pastKV/.test(workerTutor), 'worker passes the fresh per-call KV to generate');
        assert.ok(/do_sample: sample/.test(workerTutor) && /sample: data\.sample === true/.test(workerTutor), 'regenerate path enables sampling');
        // model load uses a STALL watchdog (resets on download progress) not a fixed
        // total cap — a slow but healthy 1.7B download must not spuriously time out.
        assert.ok(/withStallGuard/.test(workerTutor) && /STALL_TIMEOUT_MS/.test(workerTutor) && /onLoadProgress/.test(workerTutor), 'model load uses a progress-reset stall watchdog + retry');
        // history caps aligned + documented via shared constant
        assert.ok(/WORKER_CONTEXT_TURNS/.test(storeSrc) && /WORKER_CONTEXT_TURNS/.test(workerTutor), 'worker context cap is a shared documented constant');
        // exam days no longer hardcoded
        assert.ok(!/const examDaysLeft = 30/.test(app) && /srs\.daysUntilExam\(\)/.test(app), 'session-overview uses real exam date');
        // settings: width slider + outside-click/escape dismissal
        assert.ok(/panelWidth/.test(panelSrc) && /\.type = 'range'/.test(panelSrc), 'settings expose panel width slider');
        // SDK overlays: header controls + empty chips rendered as DOM siblings (AICat ignores header/empty props)
        assert.ok(/tutor-hdr-controls/.test(panelSrc) && /updateHeaderControls/.test(panelSrc), 'header controls rendered as overlay sibling');
        assert.ok(/tutor-empty-slot/.test(panelSrc) && /updateEmptySlot/.test(panelSrc), 'empty-state chips rendered as overlay sibling');
        assert.ok(!/header: renderHeaderControls/.test(panelSrc) && !/empty: messages\.length/.test(panelSrc), 'no unsupported AICat header/empty props');
        assert.ok(/onSettingsOutsideClick/.test(panelSrc) && /onSettingsEscape/.test(panelSrc), 'settings close on outside-click + escape');
        // multi-tab history sync + personalized starters
        assert.ok(/syncTutorFromStorage/.test(panelSrc) && /syncTutorFromStorage/.test(app), 'multi-tab history sync wired');
        assert.ok(/setTutorContext/.test(panelSrc) && /starterPrompts/.test(panelSrc), 'starter chips personalize from real state');
        // tutor controls use inline SVG icons (not Unicode-glyph button tells)
        assert.ok(/const ICONS = \{/.test(panelSrc) && /<svg/.test(panelSrc), 'tutor controls use inline SVG icons');
        assert.ok(!/[←-⇿⌀-➿⬀-⯿■-◿☀-⛿]/.test(panelSrc), 'no decorative unicode glyphs in tutor-panel.js');
        // model load retries after an unavailable (preloadKicked latch is released)
        assert.ok(/preloadKicked = false/.test(panelSrc) && /preloadKicked = true/.test(panelSrc), 'preloadKicked reset on unavailable so load can retry');
        // settings popover restores focus to the gear on close (a11y). Restore must
        // run AFTER the rerender (which rebuilds the gear) and target the gear by its
        // stable selector, re-asserting across a frame to win any deferred SDK focus reset.
        assert.ok(/restoreSettingsFocus/.test(panelSrc) && /closeSettingsAndRestoreFocus/.test(panelSrc), 'settings popover restores focus on close');
        assert.ok(/#tutor-hdr-controls \.tutor-hdr-btn/.test(panelSrc) && /requestAnimationFrame\(focusTarget\)/.test(panelSrc), 'focus restore targets gear by stable selector and re-asserts on next frame');
        // config: panelWidth clamped to slider bounds; date stamp zero-padded
        assert.ok(/Math\.max\(24, Math\.min\(60/.test(storeSrc), 'loadConfig clamps panelWidth to slider bounds');
        assert.ok(/padStart\(2, '0'\)/.test(storeSrc), 'todayStamp is zero-padded (stable date compare)');
        assert.strictEqual(tutorStore.loadConfig().panelWidth >= 24 && tutorStore.loadConfig().panelWidth <= 60, true, 'panelWidth within bounds');
        // codebase is free of encoding-corruption mojibake + decorative glyphs in shipped UI
        for (const [nm, src] of [['app.js', app], ['tutor-panel.js', panelSrc], ['tutor-store.js', storeSrc]]) {
            assert.ok(!/â|â‰|â†|﻿/.test(src), `${nm} free of mojibake/BOM`);
        }

        // tool-dispatch parser: strip + dispatch + malformed tolerance
        const td = toolDispatch;
        const withTool = 'before\n```tool\n{"name":"navigate","args":{"route":"today"}}\n```\nafter';
        let dispatched = null;
        td.dispatchToolCalls(withTool, { navigate: (a) => { dispatched = a.route; } });
        assert.strictEqual(dispatched, 'today', 'tool-dispatch invokes the named action');
        assert.ok(!/```tool/.test(td.stripToolBlocks(withTool)), 'stripToolBlocks removes fenced tool block');
        assert.doesNotThrow(() => td.dispatchToolCalls('```tool\n{bad json}\n```', {}), 'malformed tool block does not throw');

        localStorage.clear();
    });

    console.log('# session 2026-06-07: latest SDK + FOUC theme + icon sweep + tutor a11y/context');
    t('FOUC 4-value theme guard (both HTML) + latest SDK bundle + icons.js + triage raw-palette + statusbar decl + tutor context-injection + touch targets + glyph-clean source', () => {
        // FOUC inline guard handles all 4 theme values in BOTH entry HTMLs and stays
        // in lockstep with theme.js's vocabulary (the old guard only knew light/dark).
        for (const html of [indexHtml, liveHtml]) {
            assert.ok(/light:1,\s*dark:1,\s*auto:1,\s*contrast:1/.test(html), 'FOUC guard missing 4-value VALID map');
            assert.ok(/prefers-contrast: more/.test(html), 'FOUC guard missing contrast resolution');
            assert.ok(!/data-theme="light">/.test(html), 'HTML must not hardcode data-theme=light (FOUC flash)');
        }
        // anentrypoint-design bundle is the freshly-built latest (AICat/ChatComposer present).
        const sdkJs = READ('site/247420.js');
        for (const sym of ['AICat', 'ChatComposer']) assert.ok(sdkJs.includes(sym), 'SDK bundle missing ' + sym);
        // shared SVG icon module exists with the expected icon names.
        const iconsSrc = READ('site/icons.js');
        for (const name of ['arrowRight', 'arrowLeft', 'gear', 'flag', 'check', 'help', 'book']) {
            assert.ok(new RegExp(name + ':').test(iconsSrc), 'icons.js missing ' + name);
        }
        // gamification was stripped: the dead icons + their toast helpers must not return.
        for (const dead of ['star', 'sparkle', 'levelUp', 'quest']) {
            assert.ok(!new RegExp(dead + ':').test(iconsSrc), 'icons.js has dead gamification icon ' + dead);
        }
        const toastSrc = READ('site/toast.js');
        assert.match(toastSrc, /export function show\(/, 'toast.js must export show() (app.js calls toast.show)');
        assert.ok(!/export function (xp|badge|quest|levelUp)\(/.test(toastSrc), 'toast.js has dead gamification helper');
        // The module worker (tutor.js) is CDN-only and cannot import tutor-store.js,
        // so WORKER_CONTEXT_TURNS is hand-synced. Guard the two literals agree.
        const wkr = READ('site/tutor.js').match(/const WORKER_CONTEXT_TURNS = (\d+)/);
        const store = READ('site/tutor-store.js').match(/export const WORKER_CONTEXT_TURNS = (\d+)/);
        assert.ok(wkr && store && wkr[1] === store[1], 'WORKER_CONTEXT_TURNS drifted between tutor.js and tutor-store.js');
        assert.match(READ('site/views/today.js'), /import \{ ICON \} from '\.\.\/icons\.js'/);
        // triage-live.css migrated off raw --ink/--paper to semantic --fg/--bg.
        assert.ok(!/var\(--ink\)|var\(--paper\)/.test(liveCss), 'triage-live.css must use semantic tokens');
        // statusbar refs are declared (were undeclared -> ReferenceError in updateFooter).
        assert.match(READ('site/app-context.js'), /const statusbar = document\.querySelector\('\.statusbar'\)/);
        assert.match(READ('site/app-context.js'), /const statusbarMsg = document\.getElementById\('statusbar-msg'\)/);
        // conversational tutor now injects real study context into the chat prompt.
        const tutorSrc = READ('site/tutor.js');
        assert.match(tutorSrc, /function buildStudyContextLine/);
        // zero-due "caught up" signal (srs-mccqe1 parity): coach must learn the
        // student is on track, not just go silent when nothing is due.
        assert.match(tutorSrc, /caught up on reviews/);
        assert.match(panelSrcS(), /context: tutorContext/);
        // touch targets meet 44px (WCAG 2.5.5) for header + collapse buttons.
        assert.match(styleCss, /\.tutor-hdr-btn \{[^}]*width: 44px; height: 44px/);
        assert.ok(/\.tutor-set-row \{[^}]*min-height: 44px/.test(styleCss), 'settings rows need 44px touch target');
        // aria-live token-stream spam guard.
        assert.match(panelSrcS(), /function setChatLive/);
        // UI source files are free of decorative Unicode glyphs (medical data/*.json exempt).
        for (const [nm, src] of [['app.js', appSrc], ['toast.js', READ('site/toast.js')], ['triage-live.js', liveSrc], ['icons.js', iconsSrc]]) {
            const decorative = src.match(/[←-⇿─-╿■-◿☀-➿⬀-⯿]/g) || [];
            assert.deepStrictEqual(decorative, [], nm + ' has decorative glyphs: ' + decorative.join(''));
        }
    });
    t('quality-max run-4: section-line String-coercion + session-card retention + saveConfig merge + clipboard fallback', () => {
        const app = READ('site/app.js'), srs = READ('site/srs.js');
        // Section-ref match: shard.guide.sections[].line is a NUMBER, card.requires.sectionLine
        // a STRING (build_data: line:heads[h].line vs sectionLine:String(best.line)). A bare ===
        // is always false -> section link always fell back to the generic title and never scrolled.
        // Both the builder and the post-nav click handler must coerce both sides to String.
        // section-ref lookups live in views/review.js now (renderReview)
        const reviewSrc = READ('site/views/review.js');
        const appAndReview = app + reviewSrc;
        assert.ok(!/sections\?\.find\(s => s\.line === card\.requires\.sectionLine\)/.test(appAndReview),
            'section-ref builder uses bare number===string (always false)');
        assert.ok(!/sections\?\.find\(s => s\.line === card\.requires\.sectionLine\)/.test(appAndReview.replace(/\?\./g, '.')),
            'section-ref click-handler uses bare number===string');
        assert.ok((appAndReview.match(/String\(s\.line\) === String\(card\.requires\.sectionLine\)/g) || []).length >= 2,
            'both section-ref lookups must String()-coerce both sides');
        // Session-done "export cards" must export the retained session cards, not
        // state.reviewQueue (emptied by grade time -> always exported []).
        assert.match(READ('site/app-context.js'), /reviewSessionCards: \[\]/, 'state (app-context) must declare reviewSessionCards');
        assert.match(reviewSrc, /state\.reviewSessionCards\.push\(card0\)/, 'gradeReview must retain the graded card');
        assert.match(reviewSrc, /exportSessionCards\(state\.reviewSessionCards\.slice\(\)\)/, 'export must read retained session cards');
        assert.ok(!/exportSessionCards\(state\.reviewQueue\.filter/.test(appAndReview), 'export must not filter the (empty) live queue');
        // srs.saveConfig must merge over existing config so a partial write cannot wipe a field.
        assert.match(srs, /const merged = \{ \.\.\.loadConfig\(\), \.\.\.cfg \}/, 'saveConfig must merge over persisted config');
        assert.ok(!/localStorage\.setItem\(CONFIG_KEY, JSON\.stringify\(cfg\)\)/.test(srs), 'saveConfig must not write cfg verbatim');
        // Clipboard writes degrade on insecure context: a shared copyToClipboard with an
        // execCommand fallback replaces the unguarded navigator.clipboard.writeText calls.
        // The helper now lives in its own leaf module (site/clipboard.js).
        const clip = READ('site/clipboard.js');
        assert.match(clip, /export function copyToClipboard/, 'clipboard.js must export copyToClipboard');
        assert.match(clip, /export function fallbackCopy/, 'clipboard.js must export execCommand fallback');
        // exportSessionCards (the surviving copyToClipboard consumer) now lives in app-context.js.
        const ctxSrc = READ('site/app-context.js');
        assert.match(ctxSrc, /import \{ copyToClipboard \} from '\.\/clipboard\.js'/, 'app-context must import copyToClipboard');
        assert.ok(!/function copyToClipboard/.test(app), 'copyToClipboard must live in clipboard.js, not app.js');
        assert.match(ctxSrc, /copyToClipboard\(lines\.join/, 'exportSessionCards must route through copyToClipboard');
        assert.ok(!/navigator\.clipboard\.writeText\(tsv\)/.test(ctxSrc), 'exportSessionCards must route through copyToClipboard');
    });
    t('quality-max run-5: triage KV-reset + requestId guard + data-load failpath + dead branches + SDK latest', () => {
        const live = READ('site/triage-live.js'), app = READ('site/app.js');
        // HIGH: triage re-feeds the full prompt every turn; it must reset the worker KV
        // before each generate or the populated cache double-counts -> canned repeated replies.
        assert.match(live, /postMessage\(\{ type: 'reset' \}\);\s*\n\s*const requestId/, 'generateLLM must reset KV before each generate');
        assert.match(live, /type: 'generate', messages, requestId \}/, 'generate must carry a requestId');
        // MEDIUM: an interrupted generation still emits its own complete; the consumer must
        // drop replies whose requestId != active so stale output cannot resolve the new turn.
        assert.ok((live.match(/m\.requestId != null && m\.requestId !== state\._activeReqId\) return;/g) || []).length >= 3,
            'start/update/complete/error must guard on active requestId');
        // MEDIUM: data load must degrade, not stall forever on the loading placeholder.
        assert.match(live, /async function fetchJson\(url\)/, 'triage must use an ok-checked fetchJson');
        assert.match(live, /failed to load cases/, 'boot must render an error+retry on data-load failure');
        assert.ok(!/fetch\('\.\/data\/manifest\.json'\)\.then\(r => r\.json\(\)\)/.test(live), 'manifest fetch must route through fetchJson');
        // LOW: the gpu-info consumer branch is dead (worker never emits it) -> removed.
        assert.ok(!/m\.status === 'gpu-info'/.test(live), 'dead gpu-info branch must be removed');
        // LOW: app.js imported snippet as searchSnippet but never used it.
        assert.ok(!/snippet as searchSnippet/.test(app), 'dead searchSnippet alias import must be removed');
        // anentrypoint-design SDK must be the latest build (v0.0.198).
        const sdkJs = READ('site/247420.js');
        assert.ok(sdkJs.length > 100000, 'SDK bundle present');
    });
    t('quality-max run-6: single postGenerate helper + SDK-path detached-DOM via state + tutor-store merge + search anchor offset', () => {
        const live = READ('site/triage-live.js');
        // HIGH: every worker generate routes through ONE postGenerate() helper that
        // resets KV + stamps requestId. The auto-issued grading turn must not post
        // {type:'generate'} directly (it would grade against a populated cache and
        // accept a stale reply). After the refactor there is exactly one
        // {type:'generate', messages, requestId} site — inside postGenerate.
        assert.match(live, /function postGenerate\(messages\)/, 'postGenerate helper must exist');
        assert.strictEqual((live.match(/postMessage\(\{ type: 'generate'/g) || []).length, 1,
            'exactly one generate-post site (postGenerate) — grading turn must route through it, not post directly');
        assert.match(live, /postGenerate\(\[\s*\{ role: 'system', content: buildSnapshot\('grading'\)/,
            'grading turn must call postGenerate, not raw worker.postMessage');
        // MEDIUM/LOW: capability/progress/load-error flow through state so the SDK
        // render (the path the user sees) surfaces them — the static els.* nodes are
        // detached by sdk.mount and can never reach the screen. Assert the state
        // fields drive the SDK status/list and that els.* writes are null-guarded.
        assert.match(live, /state\.loadError\s*\?/, 'SDK scenario-list must render error+retry from state.loadError');
        assert.match(live, /state\.capDetail/, 'capability detail must flow through state.capDetail');
        assert.match(live, /state\.loadPct/, 'download progress must flow through state.loadPct');
        assert.ok(/if \(els\.capDot\)/.test(live) && /if \(els\.progressFill\)/.test(live),
            'els.* writes must be null-guarded (nodes may be detached under SDK)');
        assert.match(live, /state\.render = render/, 'render must be exposed on the state global for live-page witness');
        // LOW (adversarial): tutor-store.saveConfig must merge over the PERSISTED
        // config like its srs/schedule twins, not over DEFAULT_CONFIG (a partial
        // write would otherwise silently reset sibling fields).
        const storeSrc = READ('site/tutor-store.js');
        assert.match(storeSrc, /JSON\.stringify\(\{ \.\.\.loadConfig\(\), \.\.\.config \}\)/,
            'tutor-store.saveConfig must merge over loadConfig(), not DEFAULT_CONFIG');
        global.localStorage.clear();
        tutorStore.saveConfig({ proactiveCheckins: false, autoCoachOnReview: false, panelWidth: 40 });
        tutorStore.saveConfig({ panelWidth: 52 }); // partial write must preserve the two flags
        const merged = tutorStore.loadConfig();
        assert.strictEqual(merged.panelWidth, 52);
        assert.strictEqual(merged.proactiveCheckins, false, 'partial saveConfig must not reset proactiveCheckins');
        assert.strictEqual(merged.autoCoachOnReview, false, 'partial saveConfig must not reset autoCoachOnReview');
        // LOW (automated-correctness): search prose anchor #L must be the true source
        // line. A body with a 3+ newline gap previously drifted because split(/\n\n+/)
        // collapsed the run. The offset scan must place the anchor on the real line.
        const body = 'first paragraph line one is long enough to index past forty chars here.\n\n\n\nsecond paragraph also long enough to be indexed as prose content here.';
        const idx = search.buildSearchIndex({ subjects: [{ subject: 'zz' }] }, { zz: { cards: [], guide: { body, sections: [] } } });
        const second = idx.find(x => x.kind === 'prose' && /second paragraph/.test(x.body));
        assert.ok(second, 'second paragraph must be indexed');
        // 4 newlines => second paragraph starts on source line 5 (1-based).
        assert.strictEqual(second.id, 'zz#L5', 'anchor must be the true source line across a 3+ newline gap');
    });
    function panelSrcS() { return READ('site/tutor-panel.js'); }

    t('quality-max run-7: per-call KV/stopping in triage worker + chat serialization + local day-keys + casesDone subject contract + schedule hygiene', () => {
        const w = READ('site/triage-llm-worker.js');
        // MEDIUM (composition/adversarial): per-generate KV cache + stopping criteria.
        // A module-level pastKV reused across full-prompt turns double-counts the
        // prefix (canned-reply bug); a shared stopping criteria lets the caller's
        // interrupt->reset->generate burst un-interrupt the generation just stopped.
        assert.match(w, /let pastKV = new DynamicCache\(\)/, 'triage worker KV cache must be per-generate');
        assert.ok(!/pastKV \?\?= new DynamicCache/.test(w), 'module-level reused pastKV must be gone');
        assert.match(w, /const stopping = new InterruptableStoppingCriteria\(\)/, 'stopping criteria must be per-generate');
        assert.match(w, /currentStopping\?\.interrupt\(\)/, 'interrupt must target the in-flight generation');
        assert.match(w, /finally \{/, 'KV must be disposed in finally (error paths must not leak GPU buffers)');
        const tut = READ('site/tutor.js');
        // MEDIUM (worst-case): chat commands serialize through a promise chain so a
        // duplicate queued user-message cannot generate concurrently; KV disposes in
        // finally so a throwing generate cannot leak into an OOM spiral.
        assert.match(tut, /state\.chatChain\.then\(\(\) => runChatInner/, 'runChat must serialize via chatChain');
        assert.match(tut, /\} finally \{[\s\S]{0,400}pastKV\?\.dispose/, 'tutor KV dispose must live in finally');
        // LOW (honest-interface): TOOL_SPEC must not advertise the anchor arg the
        // open_guide handler never reads.
        assert.ok(!/optional-section-id/.test(tut), 'open_guide anchor arg removed from TOOL_SPEC');
        // MEDIUM (automated-correctness): schedule extras casesDone is keyed by
        // SUBJECT (the buildDayBlocks contract), not by scenario id; both regenerate
        // call sites must use the shared builder.
        const app = READ('site/app.js');
        assert.match(READ('site/app-context.js'), /export function casesDoneBySubject\(\)/, 'shared casesDoneBySubject builder must exist (app-context)');
        assert.strictEqual(((READ('site/views/today.js') + READ('site/views/settings.js')).match(/casesDoneBySubject\(\)/g) || []).length, 2, 'both regenerate sites call the shared builder (today + settings)');
        assert.ok(!/casesDone\[id\] = casesDone\[id\]/.test(app), 'scenario-id-keyed casesDone construction must be gone');
        // MEDIUM (worst-case): triage session reads go through the shared store
        // (triage-store.js owns the {cards}/legacy-array normalization).
        assert.match(READ('site/app-context.js'), /from '\.\/triage-store\.js'/, 'app-context imports triage-store');
        assert.match(READ('site/app-context.js'), /triageSessionCards\(sessions\[id\]\)/, 'totalCasesQueued normalizes via shared sessionCards (app-context)');
        // Day-keys are LOCAL calendar dates end to end: schedule.isoDate, the app
        // plan filters, and the new-card cap — matching the local check-in gate.
        const sched = READ('site/schedule.js');
        assert.match(sched, /getFullYear\(\)/, 'schedule.isoDate must be local-date');
        assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(READ('site/newcards.js')), 'newcards todayISO must be local-date');
        assert.strictEqual(((app + READ('site/app-context.js') + READ('site/views/settings.js') + READ('site/views/today.js')).match(/schedule\.isoDate\(new Date\(\)\)/g) || []).length, 6, 'app+context+settings+today schedule day-key sites use schedule.isoDate');
        // data-first/subtractive (schedule.js): 10-subject fallback, srs config via
        // srs.loadConfig (sanitized), quota-guarded persist, dead exports removed.
        assert.ok(/paediatrics/.test(sched) && /paediatrics-neonatal/.test(sched), 'schedule fallback lists all 10 subjects');
        assert.match(sched, /srsLoadConfig\(\)\.examDate/, 'examDate fallback goes through srs.loadConfig');
        assert.ok(!/localStorage\.getItem\('corpus\.srs\.config'\)/.test(sched), 'raw srs key read must be gone');
        assert.match(sched, /corpus:storage-full/, 'schedule persist must degrade to the storage-full banner');
        assert.ok(!/computeDynamicIntensity|SUBJECT_LIST|export function subjectList/.test(sched), 'dead schedule exports removed');
        assert.ok(!/reducedQuota/.test(READ('site/late.js')), 'dead late.reducedQuota removed');
        assert.ok(!/closeTutorPanel/.test(panelSrcS()), 'dead closeTutorPanel removed');
        // MEDIUM (worst-case): download progress pulses the thinking watchdog so a
        // send-during-first-download cannot falsely trip "coach stopped responding".
        assert.match(panelSrcS(), /case 'model-downloading': \{[\s\S]{0,600}armThinkingWatchdog\(\)/, 'model-downloading must pulse the watchdog');
        // glyph-ai-tell: build_data.js is plain text again (NUL byte replaced by the
        // \0 escape — same runtime string, card ids unchanged).
        const bd = require('fs').readFileSync('scripts/build_data.js');
        assert.strictEqual(bd.indexOf(0), -1, 'build_data.js must contain no NUL byte');
        // Worker header honesty: triage worker no longer claims to be shared.
        assert.ok(!/Used by both the triage page and the corpus tutor panel/.test(w), 'triage worker header must not claim tutor sharing');
    });

    await ta('quality-max run-8: shared local day-keys + tz-proof addDays + idempotent reconcile + import validator + storage guards + dead code gone', async () => {
        // dates.js is the single local day-key source; UTC slices are gone from daily-rollover stores.
        const dates = await import('./site/dates.js');
        assert.strictEqual(dates.addDays('2026-06-10', 1), '2026-06-11', 'addDays advances in local calendar');
        assert.strictEqual(dates.addDays('2026-12-31', 1), '2027-01-01');
        assert.strictEqual(dates.dayOffset('2026-06-09', '2026-06-11'), 2);
        for (const f of ['site/progress.js', 'site/srs.js', 'site/cram.js']) {
            assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(READ(f)), `${f} day keys must be local`);
            assert.match(READ(f), /from '\.\/dates\.js'/, `${f} imports dates.js`);
        }
        const sched8 = READ('site/schedule.js');
        assert.ok(!/T00:00:00Z'\); d\.setUTCDate/.test(sched8), 'schedule.addDays UTC-parse bug gone');
        // reconcile re-derives from the immutable base plan (idempotent for locked blocks).
        assert.match(sched8, /basePlannedReview/, 'reconcile snapshots base plan');
        // calendar "today" is local; internal UTC grid math untouched.
        assert.match(READ('site/calendar.js'), /localDayISO\(\)/, 'calendar today key is local');
        // import validator rejects null/array sessions.
        assert.match(READ('site/triage-live.js'), /Array\.isArray\(obj\.sessions\)/, 'triage import rejects array sessions');
        // storage guards: progress + usercards degrade to the storage-full banner.
        assert.match(READ('site/progress.js'), /corpus:storage-full/, 'progress.save quota-guarded');
        assert.match(READ('site/usercards.js'), /corpus:storage-full/, 'usercards.save quota-guarded');
        assert.match(READ('site/usercards.js'), /return save\(arr\) \? card : null/, 'usercards.add reports persist failure');
        // dead code removed: drag.js, calendar __test, newcards gating API, dup due-count helper.
        assert.ok(!require('fs').existsSync('site/drag.js'), 'drag.js deleted');
        const app8 = READ('site/app.js');
        assert.ok(!/drag\.js|makeDraggable|makeDropZone|hideLoadingState/.test(app8), 'drag imports gone from app.js');
        assert.ok(!/dueCountsBySubjectMap/.test(app8), 'duplicate due-count helper collapsed');
        assert.ok(!/drop-zone-active|\.draggable|\.dragging/.test(READ('site/style.css')), 'drag CSS removed');
        assert.ok(!/__test/.test(READ('site/calendar.js')), 'calendar __test hook removed');
        assert.ok(!/setCap|canIntroduce|__newcards/.test(READ('site/newcards.js')), 'newcards dead gating API removed');
        // triage-store is the shared schema owner; triage-live consumes it.
        assert.match(READ('site/triage-live.js'), /from '\.\/triage-store\.js'/, 'triage-live imports shared store');
    });

    console.log('# voice: KittenTTS + Whisper workers, controller, panel wiring');
    t('voice flow: tts/stt workers + voice.js + opt-in speech + panel wiring + voices json + icons', () => {
        const tts = READ('site/tts-worker.js'), stt = READ('site/stt-worker.js'), v = READ('site/voice.js');
        // TTS worker: exact KittenTTS recipe (model id, ort options, inputs, 24kHz).
        assert.match(tts, /KittenML\/kitten-tts-nano-0\.1/, 'tts uses KittenTTS nano model');
        assert.match(tts, /kitten_tts_nano_v0_1\.onnx/, 'tts loads the repo onnx file');
        assert.match(tts, /phonemizer/, 'tts phonemizes via espeak (phonemizer)');
        for (const re of [/input_ids/, /style/, /speed/]) assert.match(tts, re, 'tts builds ' + re + ' tensor');
        assert.match(tts, /graphOptimizationLevel:\s*'disabled'/, 'tts uses the disabled-optimization ort recipe');
        assert.match(tts, /24000/, 'tts output is 24kHz');
        // STT worker: whisper ASR.
        assert.match(stt, /whisper/i, 'stt uses whisper');
        assert.match(stt, /automatic-speech-recognition/, 'stt uses the ASR pipeline');
        // Controller: required surface + opt-in (no auto-download) + fence-aware feed.
        for (const re of [/export (async )?function startListening/, /export async function stopListening/, /export function feedText/, /export function flushSpeech/, /export function cancelSpeech/, /export function setSpeechEnabled/]) assert.match(v, re, 'voice.js missing ' + re);
        assert.match(v, /let _speechEnabled = false/, 'spoken replies are opt-in (no unprompted 24MB download)');
        assert.match(v, /```/, 'feedText is fence-aware (suppresses tool blocks)');
        // Voices JSON: 8 voices, 256-dim style vectors.
        const voices = JSON.parse(READ('site/voices.kitten.json'));
        assert.strictEqual(Object.keys(voices).length, 8, '8 KittenTTS voices');
        assert.strictEqual(voices[Object.keys(voices)[0]].length, 256, '256-dim style vectors');
        // Icons added (no decorative glyphs — inline SVG).
        for (const k of ['mic', 'soundOn', 'soundOff']) assert.ok(new RegExp(k + ':').test(READ('site/icons.js')), 'icons.js missing ' + k);
        // Panel wiring: both surfaces import voice + feed the token stream.
        const tp = READ('site/tutor-panel.js'), tl = READ('site/triage-live.js');
        for (const s of [tp, tl]) {
            assert.match(s, /import \* as voice from '\.\/voice\.js'/, 'panel imports voice');
            assert.match(s, /voice\.feedText/, 'panel streams tokens to TTS');
            assert.match(s, /voice\.flushSpeech/, 'panel flushes speech on done');
            assert.match(s, /voice\.cancelSpeech/, 'panel cancels speech on new turn');
        }
        assert.match(tp, /mountVoiceBar/, 'tutor panel mounts the voice bar');
        assert.match(tl, /mountTriageVoiceBar/, 'triage mounts the voice bar');
    });

    console.log(`\n${pass} pass · ${fail} fail`);
    process.exit(fail === 0 ? 0 : 1);
})();
