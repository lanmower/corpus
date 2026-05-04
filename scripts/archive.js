#!/usr/bin/env node
// Move all audio-transcripts and book-texts dirs to C:/medbak/<subject>/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEST = 'C:/medbak';

const SUBJECTS = ['cardiology', 'diabetes', 'endocrine', 'gastroenterology', 'geriatric', 'nephrology', 'pulmonology', 'rheumatology'];

function copyRecursive(src, dst) {
    const st = fs.statSync(src);
    if (st.isDirectory()) {
        fs.mkdirSync(dst, { recursive: true });
        let n = 0;
        for (const f of fs.readdirSync(src)) n += copyRecursive(path.join(src, f), path.join(dst, f));
        return n;
    }
    fs.copyFileSync(src, dst);
    return 1;
}

function rmRecursive(p) {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
        for (const f of fs.readdirSync(p)) rmRecursive(path.join(p, f));
        fs.rmdirSync(p);
    } else {
        fs.unlinkSync(p);
    }
}

function moveDir(src, dst) {
    if (!fs.existsSync(src)) return { moved: 0, skipped: true };
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    try {
        if (!fs.existsSync(dst)) fs.renameSync(src, dst);
        else {
            for (const f of fs.readdirSync(src)) {
                fs.renameSync(path.join(src, f), path.join(dst, f));
            }
            fs.rmdirSync(src);
        }
        return { moved: fs.readdirSync(dst).length, mode: 'rename' };
    } catch (e) {
        if (e.code !== 'EXDEV') throw e;
        // cross-device — copy + delete
        fs.mkdirSync(dst, { recursive: true });
        const n = copyRecursive(src, dst);
        rmRecursive(src);
        return { moved: n, mode: 'copy+delete' };
    }
}

function main() {
    fs.mkdirSync(DEST, { recursive: true });
    const log = [];
    for (const s of SUBJECTS) {
        for (const kind of ['audio-transcripts', 'book-texts']) {
            const src = path.join(ROOT, s, kind);
            const dst = path.join(DEST, s, kind);
            const r = moveDir(src, dst);
            log.push({ subject: s, kind, ...r, src, dst });
            console.log(`${s}/${kind}: ${r.skipped ? 'skipped (none)' : `moved ${r.moved}`} → ${dst}`);
        }
    }
    fs.writeFileSync(path.join(DEST, 'archive-manifest.json'), JSON.stringify({ generated: new Date().toISOString(), entries: log }, null, 2));
    console.log(`\narchive manifest → ${DEST}/archive-manifest.json`);
}

if (require.main === module) main();
module.exports = { main };
