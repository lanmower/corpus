#!/usr/bin/env node
// Compress all syllabus audio (Opus 48k mono) + video (AV1 350k + Opus 48k mono).
// Idempotent: skips if compressed sibling already exists and is non-empty.
// Originals preserved. Pass --replace to delete originals after success.
const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SYLLABUS = path.join(ROOT, 'syllabus');
const REPLACE = process.argv.includes('--replace');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);

const AUDIO_EXT = /\.(m4a|mp3|wav|aac|ogg)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|mkv)$/i;

function preflight() {
    try {
        const enc = execSync('ffmpeg -hide_banner -encoders 2>&1', { encoding: 'utf8' });
        const okOpus = /libopus/i.test(enc);
        const okAV1 = /libaom-av1/i.test(enc);
        if (!okOpus || !okAV1) {
            console.error('! Missing encoders. libopus=' + okOpus + ' libaom-av1=' + okAV1);
            console.error('  Install ffmpeg with libaom + libopus (e.g. gyan.dev "essentials" build on Windows).');
            process.exit(2);
        }
    } catch (e) {
        console.error('! ffmpeg not on PATH:', e.message.split('\n')[0]);
        process.exit(2);
    }
}

function walk(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out); else out.push(p);
    }
    return out;
}

function sizeMB(p) { try { return fs.statSync(p).size / (1024 * 1024); } catch { return 0; } }

function ffmpegAudio(src, dst) {
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', src,
        '-c:a', 'libopus', '-b:a', '48k', '-vbr', 'on', '-ac', '1',
        '-application', 'voip', '-vn', dst];
    return spawnSync('ffmpeg', args, { stdio: 'inherit' });
}

function ffmpegVideo(src, dst) {
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', src,
        '-c:v', 'libaom-av1', '-b:v', '350k', '-cpu-used', '6', '-row-mt', '1',
        '-tile-columns', '2', '-tile-rows', '1', '-g', '240',
        '-c:a', 'libopus', '-b:a', '48k', '-ac', '1', '-application', 'voip',
        '-pix_fmt', 'yuv420p', dst];
    return spawnSync('ffmpeg', args, { stdio: 'inherit' });
}

function compressFile(src, kind) {
    const ext = kind === 'audio' ? '.opus' : '.webm';
    const dst = src.replace(/\.[^.]+$/, ext);
    if (path.extname(src).toLowerCase() === ext) return { src, status: 'native' };
    if (fs.existsSync(dst) && sizeMB(dst) > 0.01) return { src, dst, status: 'skip', srcMB: sizeMB(src), dstMB: sizeMB(dst) };
    const subj = path.relative(SYLLABUS, src).split(path.sep)[1] || '?';
    if (ONLY.length && !ONLY.includes(subj)) return { src, status: 'filtered' };
    console.log(`[${kind}] ${path.basename(src)} (${sizeMB(src).toFixed(1)}MB) → ${path.basename(dst)} ...`);
    const r = (kind === 'audio' ? ffmpegAudio : ffmpegVideo)(src, dst);
    if (r.status !== 0) { try { fs.unlinkSync(dst); } catch {} return { src, dst, status: 'fail', code: r.status }; }
    const out = { src, dst, status: 'ok', srcMB: sizeMB(src), dstMB: sizeMB(dst) };
    console.log(`  → ${out.dstMB.toFixed(1)}MB (${(100 * out.dstMB / out.srcMB).toFixed(0)}%)`);
    if (REPLACE) fs.unlinkSync(src);
    return out;
}

function main() {
    preflight();
    const all = walk(SYLLABUS);
    const audio = all.filter(p => AUDIO_EXT.test(p) && /audio-deepdive/.test(p));
    const video = all.filter(p => VIDEO_EXT.test(p) && /[\\/]videos[\\/]/.test(p));
    console.log(`Found ${audio.length} audio + ${video.length} video files. replace=${REPLACE}${ONLY.length ? ' only=' + ONLY.join(',') : ''}`);
    const results = [];
    for (const a of audio) results.push(compressFile(a, 'audio'));
    for (const v of video) results.push(compressFile(v, 'video'));
    const ok = results.filter(r => r.status === 'ok');
    const skip = results.filter(r => r.status === 'skip');
    const fail = results.filter(r => r.status === 'fail');
    const srcSum = ok.reduce((n, r) => n + r.srcMB, 0);
    const dstSum = ok.reduce((n, r) => n + r.dstMB, 0);
    console.log(`\nDone. ok=${ok.length} skip=${skip.length} fail=${fail.length}`);
    if (ok.length) console.log(`  Compressed: ${srcSum.toFixed(0)}MB → ${dstSum.toFixed(0)}MB (${(100 * dstSum / srcSum).toFixed(0)}%)`);
    if (fail.length) { console.error('Failures:'); fail.forEach(f => console.error('  ' + f.src + ' code=' + f.code)); process.exit(1); }
}

main();
