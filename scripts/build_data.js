#!/usr/bin/env node
// Builds site/data/<subject>.json shards + manifest.json + rebuilds diabetes guide.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseYaml } = require('./parse_yaml.js');
// Single-owner syllabus/subject contract — import, never re-implement, so a
// layout change in syllabus.js reaches the shard build and Anki export alike
// (see scripts/syllabus.js header). safeReaddir/DEFAULT_SUBJECTS come from there too.
const { ROOT, DEFAULT_SUBJECTS, listSyllabi, readManifest, safeReaddir } = require('./syllabus.js');

function stableCardId(subject, front, source) {
    const h = crypto.createHash('sha1').update(`${front}\0${source || ''}`).digest('hex').slice(0, 10);
    return `${subject}-${h}`;
}

// Output root. Each syllabus writes its shards + manifest under DATA/<id>/ so the
// runtime can swap syllabi by changing which subtree it fetches. A top-level
// syllabi.json lists the available sets for the in-app selector.
const DATA = path.join(ROOT, 'site', 'data');

// Category palette mapping for design rails
const SUBJECT_CAT = {
    cardiology: 'mascot',
    diabetes: 'sun',
    endocrine: 'purple',
    gastroenterology: 'flame',
    geriatric: 'sky',
    nephrology: 'green',
    pulmonology: 'sun',
    rheumatology: 'purple'
};

function safeStat(p) {
    try { return fs.statSync(p); } catch { return null; }
}

function readFileSafe(p) {
    try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function loadCards(subject, ctx) {
    const dir = path.join(ctx.root, subject, 'srs-cards');
    const out = [];
    for (const f of safeReaddir(dir)) {
        if (!f.endsWith('.yml') && !f.endsWith('.yaml')) continue;
        const text = readFileSafe(path.join(dir, f));
        if (!text) continue;
        try {
            const parsed = parseYaml(text);
            let cards = [];
            if (parsed && Array.isArray(parsed.notes)) {
                cards = parsed.notes.map(n => {
                    const fields = n.fields || {};
                    const front = fields.Front || fields.Text || '';
                    const back = fields.Back || fields.Extra || '';
                    const tags = Array.isArray(n.tags) ? n.tags : [];
                    const diffTag = tags.find(t => typeof t === 'string' && t.startsWith('difficulty:'));
                    const srcTag = tags.find(t => typeof t === 'string' && t.startsWith('source:'));
                    const userTags = tags.filter(t => typeof t === 'string' && !t.startsWith('difficulty:') && !t.startsWith('source:') && !t.startsWith('subject:'));
                    return {
                        id: n.guid,
                        front, back,
                        tags: userTags,
                        difficulty: diffTag ? diffTag.slice(11) : 'medium',
                        source: srcTag ? srcTag.slice(7).replace(/_/g, ' ') : null,
                        _guid: n.guid,
                        _deck: n.deck,
                        _noteType: n.noteType
                    };
                });
            }
            else if (Array.isArray(parsed)) cards = parsed;
            else if (parsed && Array.isArray(parsed.cards)) cards = parsed.cards;
            else if (parsed && Array.isArray(parsed.atoms)) cards = parsed.atoms.map(a => ({ id: a.id, front: a.atom, back: a.definition, tags: a.tags, source: a.card_source }));
            for (const c of cards) {
                if (!c || !c.front) continue;
                const front = String(c.front).trim();
                const back = String(c.back || '').trim();
                if (!front) continue;
                const source = c.source || f.replace(/\.ya?ml$/, '');
                // YAML-local IDs collide across files within a subject (e.g. card-01,
                // 1, 2, ...). Always derive a stable hash from front+source for global
                // uniqueness; only respect explicit IDs that already include the subject prefix.
                const explicit = c.id != null ? String(c.id) : '';
                const id = explicit.startsWith(subject + '-') || explicit.startsWith(subject + '_')
                    ? explicit
                    : stableCardId(subject, front, source);
                out.push({
                    id,
                    front,
                    back,
                    tags: Array.isArray(c.tags) ? c.tags : [],
                    difficulty: c.difficulty || 'medium',
                    source,
                    sourceFile: f
                });
            }
        } catch (e) {
            console.error(`  ! parse failed for ${subject}/${f}:`, e.message);
        }
    }
    return out;
}

function coerceParameters(p) {
    if (p && typeof p === 'object' && !Array.isArray(p)) return p;
    if (typeof p === 'string' && p.trim()) return { description: p };
    return {};
}

function normalizeScenario(sc, idx) {
    if (!sc || typeof sc !== 'object') return null;
    const name = sc.name || sc.title || `scenario-${idx + 1}`;
    const description = sc.description || sc.type || '';
    const parameters = coerceParameters(sc.parameters);
    let examples = [];
    if (Array.isArray(sc.examples)) {
        examples = sc.examples.map(ex => ({
            case: ex.case || ex.variant || ex.scenario || '',
            reasoning: ex.reasoning || ex.diagnosis || '',
            recommendation: ex.recommendation || ex.action || ex.management || ''
        }));
    } else if (Array.isArray(sc.scenarios)) {
        examples = sc.scenarios.map(v => ({
            case: v.variant || v.case || '',
            reasoning: v.diagnosis || v.reasoning || (v.score != null ? `score=${v.score}` : ''),
            recommendation: v.action || v.recommendation || ''
        }));
    }
    return {
        name: String(name),
        description: String(description || ''),
        parameters,
        examples,
        atom_ids: Array.isArray(sc.atom_ids) ? sc.atom_ids : []
    };
}

function loadTriage(subject, ctx) {
    const nested = path.join(ctx.root, subject, 'triage_scenarios.yml');
    const legacy = path.join(ctx.root, `${subject}_triage_scenarios.yml`);
    const f = safeStat(nested) ? nested : legacy;
    const text = readFileSafe(f);
    if (!text) return null;
    try {
        const parsed = parseYaml(text);
        const rawScenarios = parsed.scenarios || [];
        const scenarios = rawScenarios.map((s, i) => normalizeScenario(s, i)).filter(Boolean);
        return {
            metadata: parsed.metadata || {},
            atoms: parsed.atoms || [],
            scenarios,
            atomCount: (parsed.atoms || []).length,
            scenarioCount: scenarios.length
        };
    } catch (e) {
        console.error(`  ! triage parse failed for ${subject}:`, e.message);
        return null;
    }
}

function loadGuide(subject, ctx) {
    const f = path.join(ctx.root, subject, 'study_guide.md');
    const text = readFileSafe(f);
    if (!text) return null;
    const lines = text.split(/\r?\n/);
    // Collect heading positions first, then attach each section's prose body as
    // the lines between its heading and the next heading. The tutor worker
    // (tutor.js buildGuideIndex) grounds answers in section.body, so a body-less
    // section silently degrades guide retrieval to title-only matching — the
    // producer must supply the body the consumer's `section.body` interface
    // promises. Skipped page-marker headings still bound the prior body.
    const heads = [];
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+(.+)$/);
        if (!m) continue;
        const title = m[2].trim();
        const skip = /^pages?\s+\d+(-\d+)?$/i.test(title) || /^pages?-\d+(-\d+)?$/i.test(title);
        heads.push({ level: m[1].length, title, line: i, skip });
    }
    const sections = [];
    for (let h = 0; h < heads.length; h++) {
        if (heads[h].skip) continue;
        const start = heads[h].line + 1;
        const end = h + 1 < heads.length ? heads[h + 1].line : lines.length;
        const body = lines.slice(start, end).join('\n').trim();
        sections.push({ level: heads[h].level, title: heads[h].title, line: heads[h].line, body });
    }
    return {
        chars: text.length,
        lines: lines.length,
        sections: sections.slice(0, 50),
        firstParagraph: text.split('\n\n').slice(2, 4).join('\n\n').slice(0, 600),
        body: text,
        infographics: loadInfographics(subject, ctx),
        videos: loadVideos(subject, ctx),
        audio: loadAudio(subject, ctx)
    };
}

function preferCompressed(files, compressedExt) {
    const bases = new Set(files.filter(f => path.extname(f).toLowerCase() === compressedExt).map(f => f.replace(/\.[^.]+$/, '')));
    return files.filter(f => path.extname(f).toLowerCase() === compressedExt || !bases.has(f.replace(/\.[^.]+$/, '')));
}

function loadAudio(subject, ctx) {
    const dir = path.join(ctx.root, subject, 'audio-deepdive');
    const out = [];
    if (!safeStat(dir)) return out;
    const destDir = path.join(ctx.dataDir, 'audio', subject);
    const files = preferCompressed(safeReaddir(dir), '.opus');
    for (const f of files) {
        if (!/\.(m4a|mp3|wav|ogg|aac|opus)$/i.test(f)) continue;
        const src = path.join(dir, f);
        const stat = safeStat(src);
        if (!stat) continue;
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(src, path.join(destDir, f));
        out.push({
            filename: f,
            title: `${subject} deep dive`,
            src: `data/${ctx.id}/audio/${subject}/${f}`,
            sizeMB: +(stat.size / (1024 * 1024)).toFixed(1)
        });
    }
    return out;
}

function loadVideos(subject, ctx) {
    const dir = path.join(ctx.root, subject, 'videos');
    const out = [];
    if (!safeStat(dir)) return out;
    const manifestPath = path.join(ctx.root, subject, 'videos.json');
    let manifest = [];
    const mtext = readFileSafe(manifestPath);
    if (mtext) { try { manifest = JSON.parse(mtext); } catch {} }
    const byName = Object.fromEntries((manifest || []).map(m => [m.filename, m]));
    const destDir = path.join(ctx.dataDir, 'videos', subject);
    const files = preferCompressed(safeReaddir(dir), '.webm');
    for (const f of files) {
        if (!/\.(mp4|webm|mov|m4v|mkv)$/i.test(f)) continue;
        const src = path.join(dir, f);
        const stat = safeStat(src);
        if (!stat) continue;
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(src, path.join(destDir, f));
        const meta = byName[f] || {};
        const base = f.replace(/\.[^.]+$/, '');
        out.push({
            filename: f,
            title: meta.title || base.replace(/_/g, ' '),
            src: `data/${ctx.id}/videos/${subject}/${f}`,
            sizeMB: meta.sizeMB || +(stat.size / (1024 * 1024)).toFixed(1),
            durationMin: meta.durationMin || null,
            url: meta.url || null
        });
    }
    return out;
}

function loadInfographics(subject, ctx) {
    const dir = path.join(ctx.root, subject, 'infographics');
    const out = [];
    const destDir = path.join(ctx.dataDir, 'infographics', subject);
    for (const f of safeReaddir(dir)) {
        if (!/\.(png|jpe?g|svg|webp)$/i.test(f)) continue;
        const src = path.join(dir, f);
        if (!safeStat(src)) continue;
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(src, path.join(destDir, f));
        const base = f.replace(/\.[^.]+$/, '');
        const title = `${subject} — ${base}`;
        out.push({
            filename: f,
            title,
            alt: `${subject} infographic: ${base}`,
            src: `data/${ctx.id}/infographics/${subject}/${f}`
        });
    }
    return out;
}

const STOPWORDS = new Set(('a the and of or in on at to for with by is are was were be this that it its as not no yes which what').split(' '));

function tokenize(s) {
    const out = [];
    for (const w of String(s || '').toLowerCase().split(/\W+/)) {
        if (w.length < 3) continue;
        if (STOPWORDS.has(w)) continue;
        out.push(w);
    }
    return out;
}

function attachRequires(cards, sections, subject) {
    if (!Array.isArray(sections) || !sections.length) return;
    const secTokens = sections.map(s => ({ line: s.line, title: s.title, set: new Set(tokenize(s.title)) }));
    for (const c of cards) {
        const cardTokens = tokenize(`${c.front} ${c.back || ''}`);
        if (!cardTokens.length) continue;
        let best = null, bestN = 0;
        for (const sec of secTokens) {
            if (!sec.set.size) continue;
            let n = 0;
            for (const t of cardTokens) if (sec.set.has(t)) n++;
            if (n > bestN) { bestN = n; best = sec; }
        }
        if (best && bestN >= 1) c.requires = { subject, sectionLine: String(best.line) };
    }
}

// Deterministic design-rail color for subjects not in the curated cmed4 palette
// (e.g. the ~31 mccqe1 disciplines) so they are not all the same green.
const CAT_PALETTE = ['mascot', 'sun', 'purple', 'flame', 'sky', 'green'];
function catFor(subject) {
    if (SUBJECT_CAT[subject]) return SUBJECT_CAT[subject];
    let h = 0;
    for (let i = 0; i < subject.length; i++) h = (h * 31 + subject.charCodeAt(i)) >>> 0;
    return CAT_PALETTE[h % CAT_PALETTE.length];
}

function buildShard(subject, ctx) {
    const cards = loadCards(subject, ctx);
    const guide = loadGuide(subject, ctx);
    if (guide && guide.sections) attachRequires(cards, guide.sections, subject);
    return {
        subject,
        cat: catFor(subject),
        cards,
        triage: loadTriage(subject, ctx),
        guide
    };
}

function ratingFor(shard) {
    // Coverage rating for design rail color
    const hasGuide = shard.guide && shard.guide.chars > 50000;
    const hasCards = shard.cards.length >= 10;
    const hasTriage = shard.triage && shard.triage.scenarioCount >= 4;
    const score = (hasGuide ? 1 : 0) + (hasCards ? 1 : 0) + (hasTriage ? 1 : 0);
    if (score === 3) return 'complete';   // green
    if (score === 2) return 'partial';    // sun
    return 'stub';                         // flame
}

// Build one syllabus into DATA/<id>/: per-subject shard + manifest.json.
function buildSyllabus(syl) {
    const dataDir = path.join(DATA, syl.id);
    const ctx = { id: syl.id, root: syl.root, dataDir };
    fs.mkdirSync(dataDir, { recursive: true });
    const manifest = {
        generated: new Date().toISOString(),
        syllabus: syl.id,
        label: syl.label || syl.id,
        subjects: [],
        totals: { cards: 0, scenarios: 0, atoms: 0, guideChars: 0, guideSections: 0, videoCount: 0, audioCount: 0 }
    };
    for (const s of syl.subjects) {
        const shard = buildShard(s, ctx);
        fs.writeFileSync(path.join(dataDir, `${s}.json`), JSON.stringify(shard, null, 2));
        const rating = ratingFor(shard);
        manifest.subjects.push({
            subject: s,
            cat: shard.cat,
            rating,
            cardCount: shard.cards.length,
            scenarioCount: shard.triage ? shard.triage.scenarioCount : 0,
            atomCount: shard.triage ? shard.triage.atomCount : 0,
            guideChars: shard.guide ? shard.guide.chars : 0,
            guideLines: shard.guide ? shard.guide.lines : 0,
            guideSections: shard.guide ? shard.guide.sections.length : 0,
            videoCount: shard.guide && Array.isArray(shard.guide.videos) ? shard.guide.videos.length : 0,
            audioCount: shard.guide && Array.isArray(shard.guide.audio) ? shard.guide.audio.length : 0
        });
        manifest.totals.cards += shard.cards.length;
        manifest.totals.scenarios += shard.triage ? shard.triage.scenarioCount : 0;
        manifest.totals.atoms += shard.triage ? shard.triage.atomCount : 0;
        manifest.totals.guideChars += shard.guide ? shard.guide.chars : 0;
        manifest.totals.guideSections += shard.guide ? shard.guide.sections.length : 0;
        manifest.totals.videoCount += shard.guide && Array.isArray(shard.guide.videos) ? shard.guide.videos.length : 0;
        manifest.totals.audioCount += shard.guide && Array.isArray(shard.guide.audio) ? shard.guide.audio.length : 0;
        console.log(`  [ok] ${syl.id}/${s}: ${shard.cards.length} cards, ${shard.triage?.scenarioCount || 0} scenarios, guide=${rating} (${shard.guide?.sections?.length || 0} sections)`);
    }
    fs.writeFileSync(path.join(dataDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return manifest.totals;
}

function main() {
    fs.mkdirSync(DATA, { recursive: true });
    const syllabi = listSyllabi();
    const def = readManifest().default;
    for (const syl of syllabi) {
        console.log(`# syllabus ${syl.id} (${syl.subjects.length} subjects)${syl.id === def ? ' [default]' : ''}`);
        const totals = buildSyllabus(syl);
        console.log(`  totals: ${totals.cards} cards, ${totals.scenarios} scenarios, ${totals.guideSections} sections, ${(totals.guideChars / 1024).toFixed(0)}KB guides`);
    }
    // Top-level index the in-app selector reads to populate the syllabus picker.
    const index = syllabi.map(s => ({ id: s.id, label: s.label || s.id, default: s.id === def }));
    fs.writeFileSync(path.join(DATA, 'syllabi.json'), JSON.stringify(index, null, 2));
    console.log(`\nwrote site/data/syllabi.json: ${index.map(s => s.id).join(', ')}`);
}

if (require.main === module) main();

module.exports = { buildShard, buildSyllabus, catFor, SUBJECT_CAT, stableCardId };
