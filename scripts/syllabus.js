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

function readManifest() {
    const manifestPath = path.join(ROOT, 'syllabus', 'manifest.json');
    try {
        const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        return {
            default: m.default || 'cmed4-2026',
            syllabi: Array.isArray(m.syllabi) && m.syllabi.length ? m.syllabi : ['cmed4-2026'],
        };
    } catch {
        return { default: 'cmed4-2026', syllabi: ['cmed4-2026'] };
    }
}

// Resolve one syllabus id -> { id, root, subjects, label } or null if absent.
// subjects come from syllabus/<id>/syllabus.json; cmed4-2026 (authored before that
// file existed) falls back to DEFAULT_SUBJECTS so it resolves identically.
function resolveSyllabusById(id) {
    const dir = path.join(ROOT, 'syllabus', id);
    if (!fs.existsSync(dir)) return null;
    let subjects = null, label = id;
    try {
        const sJson = JSON.parse(fs.readFileSync(path.join(dir, 'syllabus.json'), 'utf8'));
        if (Array.isArray(sJson.subjects)) subjects = sJson.subjects;
        if (sJson.label) label = sJson.label;
    } catch {}
    if (!subjects) subjects = (id === 'cmed4-2026') ? DEFAULT_SUBJECTS.slice() : [];
    return { id, root: dir, subjects, label };
}

// Every registered syllabus, in manifest order, each carrying a `default` flag.
function listSyllabi() {
    const m = readManifest();
    return m.syllabi
        .map(id => resolveSyllabusById(id))
        .filter(Boolean)
        .map(s => ({ ...s, default: s.id === m.default }));
}

// The single active syllabus for build-time consumers that select one (anki export):
// CORPUS_SYLLABUS env, else manifest default. Falls back to flat ROOT layout only if
// the selected id has no directory (pre-syllabus repos).
function resolveSyllabus() {
    const m = readManifest();
    const id = process.env.CORPUS_SYLLABUS || m.default;
    const resolved = resolveSyllabusById(id);
    if (!resolved) {
        console.error(`! syllabus '${id}' not found; falling back to flat ROOT layout`);
        return { id: null, root: ROOT, subjects: null };
    }
    return resolved;
}

// readdir that degrades to [] per-subject instead of throwing the whole run.
// A subject added without an srs-cards directory yields a partial export, never
// a hard crash.
function safeReaddir(dir) {
    try { return fs.readdirSync(dir); } catch { return []; }
}

module.exports = { ROOT, DEFAULT_SUBJECTS, resolveSyllabus, resolveSyllabusById, listSyllabi, readManifest, safeReaddir };
