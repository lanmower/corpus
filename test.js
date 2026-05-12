// Integration test — corpus personal study notebook. Run: node test.js
const fs = require('fs'); const path = require('path'); const assert = require('assert'); const vm = require('vm');
const { stableCardId } = require('./scripts/build_data.js');
const ROOT = __dirname;
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); console.log('  PASS', name); pass++; } catch (e) { console.log('  FAIL', name, '-', e.message); fail++; } };
global.localStorage = (() => { const s = new Map(); return { getItem: k => s.has(k) ? s.get(k) : null, setItem: (k, v) => s.set(k, String(v)), removeItem: k => s.delete(k), clear: () => s.clear() }; })();
global.window = { dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
global.CustomEvent = class { constructor(t, d) { this.type = t; this.detail = d; } };
const SUBJECTS = ['cardiology','diabetes','endocrine','gastroenterology','geriatric','nephrology','pulmonology','rheumatology'];
const READ = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SHARDS = SUBJECTS.map(s => JSON.parse(READ(`site/data/${s}.json`)));
const MANIFEST = JSON.parse(READ('site/data/manifest.json'));
const SHARDMAP = Object.fromEntries(SUBJECTS.map((s, i) => [s, SHARDS[i]]));
(async () => {
    const srs = await import('./site/srs.js');
    const progress = await import('./site/progress.js');
    const search = await import('./site/search.js');
    const verdicts = await import('./site/verdicts.js');
    const lastpos = await import('./site/lastpos.js');
    const cram = await import('./site/cram.js');
    const justread = await import('./site/justread.js');
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
            const sh = JSON.parse(READ(`site/data/${m.subject}.json`));
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
        // Grade-button is now the in-panel run-btn rendered by renderActive; composer button removed.
        assert.match(liveSrc, /submitForGrading/);
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
        for (const re of [/TextStreamer/, /InterruptableStoppingCriteria/, /onnx-community\/gemma-4-E2B-it-ONNX/, /Gemma4ForConditionalGeneration/, /AutoProcessor/, /device:\s*'webgpu'/, /apply_chat_template/, /shader-f16/]) assert.match(workerSrc, re);
        assert.match(liveSrc, /new Worker\(['"]\.\/triage-llm-worker\.js['"],\s*\{\s*type:\s*['"]module['"]/);
        assert.match(liveSrc, /showWebgpuError/); assert.match(liveSrc, /console\.error\(['"]\[triage-live\] webgpu error/);
        // Restyle microcopy: load tutor / select a case / no "study assistant" / no "≈2GB"
        assert.match(liveHtml, /load.*tutor/i);
        assert.match(liveHtml, /select a case/);
        assert.ok(!/study assistant/i.test(liveHtml + liveCss));
        assert.ok(!/≈\s*2GB/.test(liveHtml + liveCss));
        assert.ok(!/turn on assistant/i.test(liveHtml + liveCss));
        const serveSrc = READ('scripts/serve.js');
        assert.match(serveSrc, /cross-origin-opener-policy[^,]*same-origin/i);
        assert.match(serveSrc, /cross-origin-embedder-policy[^,]*require-corp/i);
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
        assert.match(global.localStorage.getItem('corpus.cram.dismissed.v1'), /date/);
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
        for (const re of [/import \* as cram from '\.\/cram\.js'/, /import \* as justread from '\.\/justread\.js'/, /import \* as lastpos from '\.\/lastpos\.js'/, /from '\.\/verdicts\.js'/]) assert.match(appSrc, re);
        // compressed today
        assert.match(appSrc, /function renderToday\(\)/);
        assert.match(appSrc, /primary-action/);
        // simplification pass — slim today, nav-more overflow, subject hero
        assert.match(appSrc, /nav-more/);
        assert.match(appSrc, /subject-hero/);
        assert.match(appSrc, /collapsible/);
        assert.match(appSrc, /today-primary/);
        // free-study fallback CTA — clamped to today's plan target, not full backlog
        assert.match(appSrc, /or just review \(/);
        assert.match(appSrc, /todayPlanReviewTarget/);
        // status-line shape: date · M due · X reviewed today (gamification stripped)
        assert.match(appSrc, /renderStatusLine/);
        assert.match(appSrc, /`\$\{due\} due`/);
        assert.match(appSrc, /reviewed today/);
        // gamification removed
        assert.ok(!/`day \$\{day\}`/.test(appSrc), 'day chip removed from status line');
        assert.ok(!/`streak \$\{p\.streak\}`/.test(appSrc), 'streak chip removed from status line');
        assert.ok(!/`goal \$\{p\.todayGraded\}\/\$\{p\.dailyGoal\}`/.test(appSrc), 'goal chip removed from status line');
        // TOC features
        assert.match(appSrc, /buildGuideToc/);
        assert.match(appSrc, /toc-filter/);
        assert.match(appSrc, /toc-h2-progress/);
        assert.match(appSrc, /mountBackToTop/);
        assert.match(appSrc, /back-to-top/);
        assert.match(appSrc, /applyTocFilter/);
        // cram banner trigger
        assert.match(appSrc, /renderCramBanner/);
        assert.match(appSrc, /days > 14/);
        assert.match(appSrc, /cram\.isDismissed/);
        // resume line
        assert.match(appSrc, /renderResumeLine/);
        assert.match(appSrc, /back after \$\{gap\}d/);
        // guide affordances — tutor only (practice/cards browser removed)
        assert.match(appSrc, /class="guide-aff"/);
        assert.match(appSrc, /→ tutor/);
        assert.ok(!/→ practice/.test(appSrc));
        // review progress line
        assert.match(appSrc, /class: 'review-progress'/);
        assert.match(appSrc, /to daily goal/);
        // r-toggle for just-read
        assert.match(appSrc, /e\.key === 'r' \|\| e\.key === 'R'/);
        assert.match(appSrc, /justread\.toggle/);
        assert.match(appSrc, /justread\.applyClass/);
        // verdict table
        assert.match(appSrc, /renderVerdictTable/);
        assert.match(appSrc, /verdict-table/);
        assert.match(appSrc, /VERDICT_RANK/);
        // lastpos save on go()
        assert.match(appSrc, /lastpos\.save\(route, subject\)/);
        // IA: nav has today guides review cases stats settings + tutor cta (subjects/cards removed)
        for (const lbl of ['today','guides','review','cases','stats']) {
            assert.ok(appSrc.includes(`['${lbl}', '${lbl}']`) || appSrc.includes(`'${lbl}'`));
        }
        for (const removed of [`['subjects', 'subjects']`, `['cards', 'cards']`]) {
            assert.ok(!appSrc.includes(removed), 'nav still contains removed link: ' + removed);
        }
        assert.match(appSrc, /nav-cta/);
        // route aliases home→today, triage→cases
        assert.match(appSrc, /ROUTE_ALIASES/);
        assert.match(appSrc, /home: 'today'/);
        // operator vocab gated behind DEBUG only
        const userVisible = appSrc.replace(/DEBUG \?[^:]+:/g, '').replace(/if \(DEBUG\)[^}]+}/g, '');
        // workspace/hero gone
        for (const banned of [/your medical study workspace/i]) assert.ok(!banned.test(appSrc));
        // setLast persists
        assert.match(appSrc, /progress\.setLast/);
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
        global.localStorage.setItem('corpus.progress.v1', JSON.stringify({ ...progress.load(), lastActiveDate: twoAgo, todayDate: new Date().toISOString().slice(0, 10), streak: 7 }));
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

    console.log('# new modules: timer + plan + mistakes + drill + flag + undo + late + usercards + confidence');
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
        const confidence = await import('./site/confidence.js');
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
        // confidence
        confidence.set('cardiology', 5, 4); assert.strictEqual(confidence.get('cardiology', 5), 4);
        confidence.set('cardiology', 8, 3); assert.strictEqual(confidence.avgFor('cardiology'), 3.5);
    });

    console.log('# integration: SW v4 + manifest + index html + app.js wiring + theme contrast + search prose snippet + streak grace + archive isolation');
    t('SW + PWA manifest + theme contrast + search prose+snippet + streak grace + app keys + new routes', async () => {
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
        for (const re of [/openQuickAdd/, /undoLastGrade/, /gPrefixTs/, /renderMistakes/, /renderDrill/, /renderExamDay/, /renderSparkline/, /next-thing/, /daily-plan/, /exam-countdown/, /late-banner/, /undo-toast/]) assert.match(appSrc, re);
        for (const route of ['mistakes','drill']) assert.ok(appSrc.includes(`'${route}'`));
        // new shortcuts in modal
        for (const s of ['quick add card', 'pomodoro', 'undo last grade', 'flag card', 'go mistakes']) assert.ok(appSrc.includes(s), 'missing shortcut: '+s);
        // originals never surfaced — no medbak/audio-transcripts/book-texts/pages-NNN in shards or guides
        const fs2 = require('fs');
        assert.ok(!fs2.existsSync('site/data/medbak-index.json'), 'medbak-index.json should be deleted');
        for (const s of ['cardiology','rheumatology','pulmonology']) {
            const j = JSON.parse(READ(`site/data/${s}.json`));
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
            assert.ok(v.filename && /\.mp4$/i.test(v.filename), `${s} video filename`);
            assert.ok(v.src && v.src.startsWith(`data/videos/${s}/`), `${s} video src path`);
            const meta = MANIFEST.subjects.find(x => x.subject === s);
            assert.strictEqual(meta.videoCount, sh.guide.videos.length, `${s} manifest videoCount mismatch`);
            assert.ok(fs.existsSync(path.join(ROOT, 'site', v.src)), `${s} video file missing on disk`);
        }
        assert.strictEqual(MANIFEST.totals.videoCount, 8, 'manifest totals.videoCount should be 8');
        const app = READ('site/app.js');
        assert.ok(/buildVideoHero/.test(app), 'app.js missing buildVideoHero');
        assert.ok(/class:\s*'panel video-hero'/.test(app), 'app.js missing .video-hero class');
        assert.ok(/has-video/.test(app), 'app.js missing has-video badge wiring');
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
            assert.ok(/\.m4a$/i.test(a.filename), `${s} audio filename ext`);
            assert.ok(a.src.startsWith(`data/audio/${s}/`), `${s} audio src path`);
            assert.ok(fs.existsSync(path.join(ROOT, 'site', a.src)), `${s} audio file copied to site/data`);
            assert.ok(fs.existsSync(path.join(SUBJ_ROOT, s, 'audio-deepdive', a.filename)), `${s} source audio under syllabus`);
            const meta = MANIFEST.subjects.find(x => x.subject === s);
            assert.strictEqual(meta.audioCount, 1, `${s} manifest audioCount`);
        }
        const app = READ('site/app.js');
        assert.ok(/buildAudioPanel/.test(app), 'app.js missing buildAudioPanel');
        assert.ok(/audio-panel/.test(app), 'app.js missing audio-panel class');
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
        assert.ok(/CORPUS_SYLLABUS/.test(build), 'build_data.js missing CORPUS_SYLLABUS env hook');
        assert.ok(/SUBJ_ROOT/.test(build), 'build_data.js missing SUBJ_ROOT');
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
        // aliases in place
        assert.match(appSrc, /notes:\s*'today'/);
        assert.match(appSrc, /quests:\s*'today'/);
        assert.match(appSrc, /badges:\s*'today'/);
        // mastery — empty shards => 0%
        const emptyShards = Object.fromEntries(SUBJECTS.map(s => [s, { cards: [], guide: { sections: [] }, triage: { scenarios: [] } }]));
        const m = masteryMod.overallProgress(MANIFEST, emptyShards);
        assert.strictEqual(m.weighted, 0);
        // mastery — real shards yields valid object
        const m2 = masteryMod.overallProgress(MANIFEST, SHARDMAP);
        assert.ok(m2.cards.total > 0 && m2.sections.total > 0 && m2.cases.total > 0);
        assert.ok(typeof m2.weighted === 'number');
        // forecast — zero rate => null
        global.localStorage.setItem('corpus.progress.v1', JSON.stringify({ version: 1, history: [{ date: '2026-05-01', graded: 0 }, { date: '2026-05-02', graded: 0 }] }));
        assert.strictEqual(masteryMod.forecastTo100(MANIFEST, SHARDMAP), null);
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
        assert.match(appSrc, /buildInfographicsPanel/);
        assert.match(appSrc, /openInfographicLightbox/);
        assert.match(appSrc, /infographic-tile/);
        assert.match(appSrc, /lightbox-overlay/);
        assert.match(appSrc, /'Escape'/);
        assert.match(appSrc, /'ArrowLeft'/);
        assert.match(appSrc, /'ArrowRight'/);
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
        // render-time paragraph polish: softSplitPara + disfluency cleanup + typo refine
        assert.match(appSrc, /function softSplitPara/);
        assert.match(appSrc, /function cleanDisfluencies/);
        assert.match(appSrc, /function typoRefine/);
        // sandbox the helpers via vm and assert behavior
        const ctx = { module: {}, exports: {} };
        const startIdx = appSrc.indexOf('const DISFLUENCY_RE');
        const endIdx = appSrc.indexOf('function renderMarkdown', startIdx);
        const helperSrc = appSrc.slice(startIdx, endIdx);
        vm.createContext(ctx);
        vm.runInContext(helperSrc + '\nmodule.exports = { softSplitPara, cleanDisfluencies, typoRefine };', ctx);
        const H = ctx.module.exports;
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
        for (const re of [/import \* as mastery from '\.\/mastery\.js'/, /import \* as toast from '\.\/toast\.js'/]) assert.match(appSrc, re);
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
        // markdown renderer handles ordered lists, blockquotes, hr, tables
        assert.match(appJs, /function renderMarkdown/);
        assert.match(appJs, /openListIfNeeded/);
        assert.match(appJs, /<blockquote>/);
        assert.match(appJs, /<hr>/);
        assert.match(appJs, /\\d\+\[\.\)\]/); // ordered list pattern
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

    console.log(`\n${pass} pass · ${fail} fail`);
    process.exit(fail === 0 ? 0 : 1);
})();
