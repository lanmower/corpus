#!/usr/bin/env node
// Convert KittenTTS voices.npz (a ZIP of .npy float arrays, one per voice) into a
// browser-loadable JSON: { "<voice-name>": [float, ...], ... }. The npz is the
// canonical source (KittenML/kitten-tts-nano-0.1); we do not carry a third-party
// pre-converted copy that could drift. Run once; the JSON is committed and shipped.
//
//   node scripts/build_kitten_voices.js
//
// Output: site/voices.kitten.json
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');

const NPZ_URL = 'https://huggingface.co/KittenML/kitten-tts-nano-0.1/resolve/main/voices.npz';
const OUT = path.resolve(__dirname, '..', 'site', 'voices.kitten.json');

function fetchBuffer(url, redirects = 0) {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                if (redirects > 5) return reject(new Error('too many redirects'));
                res.resume();
                return resolve(fetchBuffer(res.headers.location, redirects + 1));
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

// ZIP reader via the CENTRAL DIRECTORY. numpy's savez writes ZIP entries with the
// data-descriptor flag set (sizes are zero in the local header), so the local
// headers cannot be walked by size; the central directory always carries the true
// compressed/uncompressed sizes, method, and local-header offset.
function* zipEntries(buf) {
    // Find End Of Central Directory record (sig 0x06054b50), scanning from the tail.
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('no EOCD (not a zip?)');
    const count = buf.readUInt16LE(eocd + 10);
    let cd = buf.readUInt32LE(eocd + 16); // central directory offset
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(cd) !== 0x02014b50) throw new Error('bad central dir entry');
        const method = buf.readUInt16LE(cd + 10);
        const compSize = buf.readUInt32LE(cd + 20);
        const nameLen = buf.readUInt16LE(cd + 28);
        const extraLen = buf.readUInt16LE(cd + 30);
        const commentLen = buf.readUInt16LE(cd + 32);
        const localOff = buf.readUInt32LE(cd + 42);
        const name = buf.slice(cd + 46, cd + 46 + nameLen).toString('latin1');
        // Local header at localOff: 30 fixed bytes + name + extra, then data.
        const lNameLen = buf.readUInt16LE(localOff + 26);
        const lExtraLen = buf.readUInt16LE(localOff + 28);
        const dataStart = localOff + 30 + lNameLen + lExtraLen;
        const comp = buf.slice(dataStart, dataStart + compSize);
        const data = method === 0 ? comp : zlib.inflateRawSync(comp);
        yield { name, data };
        cd += 46 + nameLen + extraLen + commentLen;
    }
}

// Parse a .npy buffer -> { dtype, shape, array:Number[] }.
function parseNpy(buf) {
    if (buf.slice(0, 6).toString('latin1') !== '\x93NUMPY') throw new Error('not a npy');
    const major = buf[6];
    let headerLen, headerStart;
    if (major === 1) { headerLen = buf.readUInt16LE(8); headerStart = 10; }
    else { headerLen = buf.readUInt32LE(8); headerStart = 12; }
    const header = buf.slice(headerStart, headerStart + headerLen).toString('latin1');
    const descr = (header.match(/'descr':\s*'([^']+)'/) || [])[1];
    const shapeStr = (header.match(/'shape':\s*\(([^)]*)\)/) || [])[1] || '';
    const shape = shapeStr.split(',').map(s => s.trim()).filter(Boolean).map(Number);
    const dataStart = headerStart + headerLen;
    const body = buf.slice(dataStart);
    const out = [];
    if (descr === '<f4') for (let o = 0; o + 4 <= body.length; o += 4) out.push(body.readFloatLE(o));
    else if (descr === '<f8') for (let o = 0; o + 8 <= body.length; o += 8) out.push(body.readDoubleLE(o));
    else throw new Error('unsupported npy dtype ' + descr);
    return { dtype: descr, shape, array: out };
}

(async () => {
    console.log('fetching', NPZ_URL);
    const npz = await fetchBuffer(NPZ_URL);
    console.log('npz bytes:', npz.length);
    const voices = {};
    for (const { name, data } of zipEntries(npz)) {
        const voice = name.replace(/\.npy$/i, '');
        const { shape, array } = parseNpy(data);
        // Style vectors are shaped [1, dim] or [dim]; flatten to a flat float list.
        voices[voice] = array;
        console.log(`  ${voice}: shape [${shape.join(',')}] -> ${array.length} floats`);
    }
    const names = Object.keys(voices);
    if (!names.length) throw new Error('no voices parsed from npz');
    fs.writeFileSync(OUT, JSON.stringify(voices));
    console.log(`wrote ${OUT}: ${names.length} voices (${names.join(', ')})`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
