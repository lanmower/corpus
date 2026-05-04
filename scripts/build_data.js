#!/usr/bin/env node
// Builds site/data/<subject>.json shards + manifest.json + rebuilds diabetes guide.
const fs = require('fs');
const path = require('path');
const { parseYaml } = require('./parse_yaml.js');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'site', 'data');
const CONCISE = path.join(ROOT, 'concise');

const SUBJECTS = [
    'cardiology', 'diabetes', 'endocrine', 'gastroenterology',
    'geriatric', 'nephrology', 'pulmonology', 'rheumatology'
];

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

function safeReaddir(dir) {
    try { return fs.readdirSync(dir); } catch { return []; }
}

function safeStat(p) {
    try { return fs.statSync(p); } catch { return null; }
}

function readFileSafe(p) {
    try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function loadCards(subject) {
    const dir = path.join(ROOT, subject, 'srs-cards');
    const out = [];
    for (const f of safeReaddir(dir)) {
        if (!f.endsWith('.yml') && !f.endsWith('.yaml')) continue;
        const text = readFileSafe(path.join(dir, f));
        if (!text) continue;
        try {
            const parsed = parseYaml(text);
            let cards = [];
            if (Array.isArray(parsed)) cards = parsed;
            else if (parsed && Array.isArray(parsed.cards)) cards = parsed.cards;
            else if (parsed && Array.isArray(parsed.atoms)) cards = parsed.atoms.map(a => ({ id: a.id, front: a.atom, back: a.definition, tags: a.tags, source: a.card_source }));
            for (const c of cards) {
                if (!c || !c.front) continue;
                out.push({
                    id: c.id || `${subject}-${out.length}`,
                    front: c.front,
                    back: c.back || '',
                    tags: Array.isArray(c.tags) ? c.tags : [],
                    difficulty: c.difficulty || 'medium',
                    source: c.source || f.replace(/\.ya?ml$/, ''),
                    sourceFile: f
                });
            }
        } catch (e) {
            console.error(`  ! parse failed for ${subject}/${f}:`, e.message);
        }
    }
    return out;
}

function loadTriage(subject) {
    const f = path.join(ROOT, `${subject}_triage_scenarios.yml`);
    const text = readFileSafe(f);
    if (!text) return null;
    try {
        const parsed = parseYaml(text);
        // Resolve __alias references in scenarios.atoms
        const atomById = {};
        for (const a of (parsed.atoms || [])) {
            if (a && a.id) atomById[a.id] = a;
        }
        return {
            metadata: parsed.metadata || {},
            atoms: parsed.atoms || [],
            scenarios: parsed.scenarios || [],
            atomCount: (parsed.atoms || []).length,
            scenarioCount: (parsed.scenarios || []).length
        };
    } catch (e) {
        console.error(`  ! triage parse failed for ${subject}:`, e.message);
        return null;
    }
}

function loadGuide(subject) {
    const f = path.join(CONCISE, `${subject}_study_guide.md`);
    const text = readFileSafe(f);
    if (!text) return null;
    const lines = text.split('\n');
    // Extract section headings (## and ###)
    const sections = [];
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+(.+)$/);
        if (m) sections.push({ level: m[1].length, title: m[2].trim(), line: i });
    }
    return {
        chars: text.length,
        lines: lines.length,
        sections: sections.slice(0, 50),
        firstParagraph: text.split('\n\n').slice(2, 4).join('\n\n').slice(0, 600)
    };
}

function loadAudio(subject) {
    // Source: prefer archive at C:/medbak, fall back to in-tree
    const archive = path.join('C:/medbak', subject, 'audio-transcripts');
    const local = path.join(ROOT, subject, 'audio-transcripts');
    const dir = safeStat(archive) ? archive : local;
    const out = [];
    for (const f of safeReaddir(dir)) {
        if (!f.endsWith('.txt')) continue;
        const full = path.join(dir, f);
        const st = safeStat(full);
        out.push({ name: f.replace(/\.txt$/, ''), file: f, size: st ? st.size : 0, archive_path: full });
    }
    return out;
}

function loadBooks(subject) {
    const archive = path.join('C:/medbak', subject, 'book-texts');
    const local = path.join(ROOT, subject, 'book-texts');
    const dir = safeStat(archive) ? archive : local;
    const out = [];
    function walk(d, rel) {
        for (const f of safeReaddir(d)) {
            const full = path.join(d, f);
            const st = safeStat(full);
            if (!st) continue;
            if (st.isDirectory()) walk(full, path.join(rel, f));
            else if (f.endsWith('.txt')) out.push({ name: f.replace(/\.txt$/, ''), file: path.join(rel, f), size: st.size, archive_path: full });
        }
    }
    if (safeStat(dir)) walk(dir, '');
    return out;
}

function buildShard(subject) {
    return {
        subject,
        cat: SUBJECT_CAT[subject] || 'green',
        cards: loadCards(subject),
        triage: loadTriage(subject),
        guide: loadGuide(subject),
        audio: loadAudio(subject),
        books: loadBooks(subject)
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

function main() {
    fs.mkdirSync(DATA, { recursive: true });
    const manifest = {
        generated: new Date().toISOString(),
        subjects: [],
        totals: { cards: 0, scenarios: 0, atoms: 0, audio: 0, books: 0, guideChars: 0 }
    };
    for (const s of SUBJECTS) {
        const shard = buildShard(s);
        const file = path.join(DATA, `${s}.json`);
        fs.writeFileSync(file, JSON.stringify(shard, null, 2));
        const rating = ratingFor(shard);
        manifest.subjects.push({
            subject: s,
            cat: shard.cat,
            rating,
            cardCount: shard.cards.length,
            scenarioCount: shard.triage ? shard.triage.scenarioCount : 0,
            atomCount: shard.triage ? shard.triage.atomCount : 0,
            audioCount: shard.audio.length,
            bookCount: shard.books.length,
            guideChars: shard.guide ? shard.guide.chars : 0,
            guideLines: shard.guide ? shard.guide.lines : 0
        });
        manifest.totals.cards += shard.cards.length;
        manifest.totals.scenarios += shard.triage ? shard.triage.scenarioCount : 0;
        manifest.totals.atoms += shard.triage ? shard.triage.atomCount : 0;
        manifest.totals.audio += shard.audio.length;
        manifest.totals.books += shard.books.length;
        manifest.totals.guideChars += shard.guide ? shard.guide.chars : 0;
        console.log(`✓ ${s}: ${shard.cards.length} cards, ${shard.triage?.scenarioCount || 0} scenarios, ${shard.audio.length} audio, ${shard.books.length} books, guide=${rating}`);
    }
    fs.writeFileSync(path.join(DATA, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(`\nTotals: ${manifest.totals.cards} cards, ${manifest.totals.scenarios} scenarios, ${manifest.totals.atoms} atoms, ${manifest.totals.audio} audio, ${manifest.totals.books} books`);
}

if (require.main === module) main();

module.exports = { buildShard, SUBJECTS, SUBJECT_CAT };
