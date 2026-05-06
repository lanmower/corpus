#!/usr/bin/env node
// Rebuilds <subject>/study_guide.md for stub subjects with full
// transcript text + SRS atoms inline (Key Atoms section per lecture).
// No truncation. Idempotent.
const fs = require('fs');
const path = require('path');
const { parseYaml } = require('./parse_yaml.js');

const ROOT = path.resolve(__dirname, '..');

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function lsSafe(d) { try { return fs.readdirSync(d); } catch { return []; } }

function loadCards(subject) {
    const dir = path.join(ROOT, subject, 'srs-cards');
    const out = [];
    for (const f of lsSafe(dir)) {
        if (!f.endsWith('.yml') && !f.endsWith('.yaml')) continue;
        const text = readSafe(path.join(dir, f));
        if (!text) continue;
        const parsed = parseYaml(text);
        let cards = [];
        if (Array.isArray(parsed)) cards = parsed;
        else if (parsed && Array.isArray(parsed.cards)) cards = parsed.cards;
        for (const c of cards) {
            if (c && c.front) out.push({ ...c, sourceFile: f });
        }
    }
    return out;
}

function lectureKey(filename) {
    return filename.replace(/\.txt$/, '').replace(/_/g, ' ').toLowerCase();
}

function cardKey(c) {
    const src = (c.source || c.sourceFile || '').replace(/\.ya?ml$/, '').replace(/_/g, ' ').toLowerCase();
    return src;
}

function tokenSet(s) {
    return new Set((s || '').toLowerCase().split(/\s+/).filter(w => w.length > 3));
}

function bestMatchLecture(card, lectures) {
    const ck = tokenSet(cardKey(card));
    let best = null, bestScore = 0;
    for (const l of lectures) {
        const lk = tokenSet(lectureKey(l.file));
        let score = 0;
        for (const t of ck) if (lk.has(t)) score++;
        if (score > bestScore) { bestScore = score; best = l; }
    }
    return bestScore >= 2 ? best : null;
}

function buildGuide(subject) {
    const audioDir = path.join(ROOT, subject, 'audio-transcripts');
    const lectures = lsSafe(audioDir).filter(f => f.endsWith('.txt')).map(f => ({
        file: f,
        text: readSafe(path.join(audioDir, f)) || '',
        title: f.replace(/\.txt$/, '').replace(/_/g, ' ')
    }));
    const cards = loadCards(subject);
    // Group cards by best-matched lecture
    const groups = new Map();
    const orphan = [];
    for (const c of cards) {
        const m = bestMatchLecture(c, lectures);
        if (m) {
            if (!groups.has(m.file)) groups.set(m.file, []);
            groups.get(m.file).push(c);
        } else {
            orphan.push(c);
        }
    }

    const title = subject.charAt(0).toUpperCase() + subject.slice(1);
    const lines = [];
    lines.push(`# ${title} — Complete Study Guide`);
    lines.push('');
    lines.push(`**Generated:** ${new Date().toISOString().split('T')[0]}`);
    lines.push(`**Sources:** ${lectures.length} lectures, ${cards.length} SRS atoms`);
    lines.push('');
    lines.push(`> Built for 100% mastery: every lecture transcript embedded in full, every SRS atom inlined under its lecture, no truncation. Use this as the single reference for ${subject}.`);
    lines.push('');
    lines.push('## Contents');
    lines.push('');
    lectures.forEach((l, i) => lines.push(`${i + 1}. [${l.title}](#${l.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')})`));
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const l of lectures) {
        lines.push(`## ${l.title}`);
        lines.push('');
        lines.push('### Lecture Transcript');
        lines.push('');
        lines.push(l.text.trim());
        lines.push('');
        const grouped = groups.get(l.file) || [];
        if (grouped.length > 0) {
            lines.push('### Key Atoms (SRS)');
            lines.push('');
            for (const c of grouped) {
                lines.push(`**Q: ${c.front}**`);
                lines.push('');
                lines.push(`A: ${c.back || ''}`);
                if (Array.isArray(c.tags) && c.tags.length) {
                    lines.push('');
                    lines.push(`*tags: ${c.tags.join(', ')}*`);
                }
                lines.push('');
            }
        }
        lines.push('---');
        lines.push('');
    }

    if (orphan.length > 0) {
        lines.push('## Additional Atoms (unmatched to lecture)');
        lines.push('');
        for (const c of orphan) {
            lines.push(`**Q: ${c.front}**`);
            lines.push('');
            lines.push(`A: ${c.back || ''}`);
            lines.push('');
        }
        lines.push('---');
        lines.push('');
    }

    lines.push('## Mastery Checklist');
    lines.push('');
    lines.push(`- [ ] Read every lecture transcript above (${lectures.length} lectures)`);
    lines.push(`- [ ] Drill every SRS atom (${cards.length} atoms)`);
    lines.push(`- [ ] Run the triage scenarios for ${subject} until parameters are intuitive`);
    lines.push(`- [ ] Re-derive each atom's definition from memory`);
    lines.push(`- [ ] Pass clinical reasoning chains end-to-end without referring back`);
    lines.push('');

    return lines.join('\n');
}

function main(targets) {
    for (const s of targets) {
        const md = buildGuide(s);
        const subjDir = path.join(ROOT, s);
        fs.mkdirSync(subjDir, { recursive: true });
        const out = path.join(subjDir, 'study_guide.md');
        fs.writeFileSync(out, md);
        console.log(`✓ ${s}: ${md.length} chars → ${out}`);
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    main(args.length ? args : ['diabetes', 'geriatric']);
}

module.exports = { buildGuide };
