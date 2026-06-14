#!/usr/bin/env node
// Emits exports/corpus-anki.txt — Anki-importable TSV.
// Format: guid<TAB>noteType<TAB>deck<TAB>Front<TAB>Back<TAB>tags
// Anki File > Import > select tsv, map columns, set "GUID" + deck + tags.
// True .apkg requires sqlite + media bundling (out of scope).
const fs = require('fs');
const path = require('path');
const { parseYaml } = require('./parse_yaml.js');
const { ROOT, DEFAULT_SUBJECTS, resolveSyllabus, safeReaddir } = require('./syllabus.js');

const SYLLABUS = resolveSyllabus();
const SUBJ_ROOT = SYLLABUS.root;
const SUBJECTS = SYLLABUS.subjects || DEFAULT_SUBJECTS;

function tsvEscape(s) {
    return String(s == null ? '' : s).replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
}

function main() {
    const out = ['#separator:tab', '#html:true', '#guid column:1', '#notetype column:2', '#deck column:3', '#tags column:6'];
    let count = 0;
    for (const s of SUBJECTS) {
        const dir = path.join(SUBJ_ROOT, s, 'srs-cards');
        for (const f of safeReaddir(dir).filter(x => /\.ya?ml$/.test(x))) {
            const parsed = parseYaml(fs.readFileSync(path.join(dir, f), 'utf8'));
            if (!parsed || !Array.isArray(parsed.notes)) continue;
            for (const n of parsed.notes) {
                const front = n.fields?.Front || n.fields?.Text || '';
                const back = n.fields?.Back || n.fields?.Extra || '';
                const tags = (n.tags || []).join(' ');
                out.push([n.guid, n.noteType, n.deck, front, back, tags].map(tsvEscape).join('\t'));
                count++;
            }
        }
    }
    const exportsDir = path.join(ROOT, 'exports');
    fs.mkdirSync(exportsDir, { recursive: true });
    // Per-syllabus filename so exporting one syllabus never clobbers another's TSV.
    // Only the Anki `notes` shape is exportable; syllabi authored as `cards` (mccqe1)
    // emit 0 notes here by design.
    const sid = SYLLABUS.id || 'cmed4-2026';
    const file = path.join(exportsDir, `corpus-anki-${sid}.txt`);
    fs.writeFileSync(file, out.join('\n') + '\n');
    console.log(`wrote ${file} — ${count} notes, ${out.length} lines`);
}

if (require.main === module) main();
module.exports = { main };
