// Single owner of the syllabus-root / subject-list contract.
// Both build_data.js and anki_export.js resolve card/triage/guide paths through
// here, so a layout change (flat ROOT -> syllabus/<id>/) updates one place and
// every consumer follows. Previously anki_export.js hardcoded the pre-syllabus
// flat layout and drifted into an ENOENT crash on the documented command.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Subjects in the flat-layout fallback. Kept complete (includes the two
// paediatrics subjects) so a fallback never silently drops a subject.
const DEFAULT_SUBJECTS = [
    'cardiology', 'diabetes', 'endocrine', 'gastroenterology', 'geriatric',
    'nephrology', 'paediatrics', 'paediatrics-neonatal', 'pulmonology', 'rheumatology',
];

function resolveSyllabus() {
    const envSel = process.env.CORPUS_SYLLABUS;
    const manifestPath = path.join(ROOT, 'syllabus', 'manifest.json');
    let def = 'cmed4-2026';
    try {
        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (m && m.default) def = m.default;
    } catch {}
    const id = envSel || def;
    const dir = path.join(ROOT, 'syllabus', id);
    if (!fs.existsSync(dir)) {
        console.error(`! syllabus '${id}' not found at ${dir}; falling back to flat ROOT layout`);
        return { id: null, root: ROOT, subjects: null };
    }
    let subjects = null;
    try {
        const sJson = JSON.parse(fs.readFileSync(path.join(dir, 'syllabus.json'), 'utf8'));
        if (Array.isArray(sJson.subjects)) subjects = sJson.subjects;
    } catch {}
    return { id, root: dir, subjects };
}

// readdir that degrades to [] per-subject instead of throwing the whole run.
// A subject added without an srs-cards directory yields a partial export, never
// a hard crash.
function safeReaddir(dir) {
    try { return fs.readdirSync(dir); } catch { return []; }
}

module.exports = { ROOT, DEFAULT_SUBJECTS, resolveSyllabus, safeReaddir };
