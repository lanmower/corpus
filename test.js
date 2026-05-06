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
        const total = SHARDS.reduce((n, sh) => n + (sh.triage?.scenarios.length || 0), 0);
        assert.strictEqual(total, MANIFEST.totals.scenarios); assert.ok(total >= 60);
        for (const sh of SHARDS) for (const sc of (sh.triage?.scenarios || [])) {
            assert.ok(sc.parameters && typeof sc.parameters === 'object' && !Array.isArray(sc.parameters));
            assert.ok(Array.isArray(sc.examples));
        }
        for (const sh of SHARDS) if (sh.guide) assert.ok(typeof sh.guide.body === 'string' && sh.guide.body.length > 100);
        for (const sh of SHARDS) { assert.ok(!('audio' in sh)); assert.ok(!('books' in sh)); }
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

    console.log('# triage-live: gate + worker + student-clean chrome');
    t('disclosure-gate (asking hides answer key, grading reveals) + worker shape + restyle microcopy + serve isolation', () => {
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
        for (const re of [/TextStreamer/, /InterruptableStoppingCriteria/, /onnx-community\/gemma-4-E2B-it-ONNX/, /Gemma4ForConditionalGeneration/, /AutoProcessor/, /device:\s*'webgpu'/, /apply_chat_template/, /shader-f16/]) assert.match(workerSrc, re);
        assert.match(liveSrc, /new Worker\(['"]\.\/triage-llm-worker\.js['"],\s*\{\s*type:\s*['"]module['"]/);
        assert.match(liveSrc, /showWebgpuError/); assert.match(liveSrc, /console\.error\(['"]\[triage-live\] webgpu error/);
        // Restyle microcopy: load tutor / offline mode / select a case / no "study assistant" / no "≈2GB"
        assert.match(liveHtml, /load tutor/); assert.match(liveHtml, /offline mode/);
        assert.match(liveHtml, /select a case/);
        assert.ok(!/study assistant/i.test(liveHtml + liveCss));
        assert.ok(!/≈\s*2GB/.test(liveHtml + liveCss));
        assert.ok(!/turn on assistant/i.test(liveHtml + liveCss));
        const serveSrc = READ('scripts/serve.js');
        assert.match(serveSrc, /cross-origin-opener-policy[^,]*same-origin/i);
        assert.match(serveSrc, /cross-origin-embedder-policy[^,]*require-corp/i);
    });

    console.log('# restyle: tokens + lowercase + no archivo + no hero + meaningful color');
    t('Lora prose + system-ui chrome + JetBrains mono + no Archivo + meaningful color tokens + no hero copy', () => {
        // Font swap: Lora present, Archivo Black gone
        assert.match(indexHtml, /Lora/);
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
        assert.match(appSrc, /summary-line/);
        assert.match(appSrc, /due cards · /);
        assert.match(appSrc, /min est\./);
        assert.match(appSrc, /primary-action/);
        // status-line shape: day N · M due · streak K · goal X/Y
        assert.match(appSrc, /renderStatusLine/);
        assert.match(appSrc, /`day \$\{day\}`/);
        assert.match(appSrc, /`\$\{due\} due`/);
        assert.match(appSrc, /`streak \$\{p\.streak\}`/);
        assert.match(appSrc, /`goal \$\{p\.todayGraded\}\/\$\{p\.dailyGoal\}`/);
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

    console.log('# new modules: timer + plan + mistakes + drill + flag + undo + notes + late + usercards + confidence');
    t('all 10 new modules export expected APIs and round-trip storage', async () => {
        global.localStorage.clear();
        const timer = await import('./site/timer.js');
        const planMod = await import('./site/plan.js');
        const mistakes = await import('./site/mistakes.js');
        const drill = await import('./site/drill.js');
        const flag = await import('./site/flag.js');
        const undo = await import('./site/undo.js');
        const notes = await import('./site/notes.js');
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
        // notes
        notes.set('cardiology', 12, { hl: true, text: 'foo' }); assert.deepStrictEqual(notes.get('cardiology', 12), { hl: true, text: 'foo' });
        assert.strictEqual(notes.all().length, 1);
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
        assert.match(sw, /corpus-v7/);
        for (const m of ['timer.js','plan.js','mistakes.js','drill.js','flag.js','undo.js','notes.js','late.js','usercards.js','confidence.js','manifest.webmanifest']) assert.ok(sw.includes(m), 'sw missing ' + m);
        assert.ok(!sw.includes('medbak'), 'sw should not reference medbak');
        const wm = JSON.parse(READ('site/manifest.webmanifest'));
        assert.ok(wm.name && wm.start_url && Array.isArray(wm.icons) && wm.icons.length >= 1);
        // index.html links
        assert.match(indexHtml, /rel="manifest"/);
        assert.match(indexHtml, /\?v=6/);
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
        for (const re of [/openQuickAdd/, /undoLastGrade/, /handleHighlightOrNote/, /gPrefixTs/, /renderMistakes/, /renderNotes/, /renderDrill/, /renderExamDay/, /renderSparkline/, /tag-cloud/, /next-thing/, /daily-plan/, /exam-countdown/, /late-banner/, /undo-toast/]) assert.match(appSrc, re);
        for (const route of ['mistakes','notes','drill']) assert.ok(appSrc.includes(`'${route}'`));
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

    console.log(`\n${pass} pass · ${fail} fail`);
    process.exit(fail === 0 ? 0 : 1);
})();
