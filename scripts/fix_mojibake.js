#!/usr/bin/env node
// One-off fixer for UTF-8 mojibake in site/ files.
// Mojibake = original UTF-8, decoded as Latin-1, re-encoded as UTF-8.
// We undo by reading file as UTF-8, finding the misinterpreted byte sequences, replacing with the real codepoint.
//
// Patterns defined via String.fromCharCode of the actual byte sequence so this script file
// can itself be safely UTF-8 without ambiguity.

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.argv[2] || process.cwd();

// Build a [mojibake, intended] pair from the byte sequence as seen in the file.
// e.g. middle dot (U+00B7) → UTF-8 bytes C2 B7. Mis-decoded as Latin-1 → "Â·" (U+00C2 U+00B7).
function bytes(...codes) { return String.fromCharCode(...codes); }

const fixes = [
    // 2-byte UTF-8 sequences (U+0080–U+07FF) mis-decoded as Latin-1
    [bytes(0xC2, 0xB7), '·'],   // Â· → ·  middle dot
    [bytes(0xC3, 0x97), '×'],   // Ã— → ×  multiplication
    [bytes(0xC3, 0xB7), '÷'],   // Ã÷ → ÷  division

    // 3-byte UTF-8 sequences (U+0800–U+FFFF) mis-decoded as Latin-1 → "â€X" or similar
    [bytes(0xE2, 0x80, 0xA6), '…'].map((s, i) => i ? s : reMojify(s))[0] || null,
];

// Above approach is brittle. Simpler: directly enumerate via fromCharCode of the corrupted code points.
const FIXES = [
    // each entry: [bad string as it currently sits in the file (Latin-1 → UTF-8 corruption), intended unicode]
    [String.fromCharCode(0xC3, 0x83, 0xC2, 0x97), '×'],         // not a real case
];

// Actually the cleanest implementation: each mojibake form starts with one of
// 0xC2 0xC3 0xE2 (the Latin-1 decoding of the first byte of the original UTF-8 sequence).
// Read the file as a Buffer, build a transform table over byte sequences, write back.

function reMojify() { /* unused */ }

const BYTE_FIXES = [
    // Each: { from: Buffer of the mojibake byte sequence,
    //         to:   Buffer of the correct UTF-8 byte sequence }
    // Mojibake byte sequence = (real codepoint encoded as UTF-8 → those bytes treated as Latin-1 → re-encoded as UTF-8)

    // Middle dot · U+00B7 → UTF-8 [C2 B7] → Latin-1 chars "Â·" → re-UTF-8 [C3 82 C2 B7]
    { from: Buffer.from([0xC3, 0x82, 0xC2, 0xB7]), to: Buffer.from('·', 'utf8') },
    // Multiplication × U+00D7 → UTF-8 [C3 97] → Latin-1 "Ã—" → re-UTF-8 [C3 83, C2 97]? actually "Ã—" is U+00C3 U+2014 mojibake variant.
    // Simpler: U+00D7 [C3 97] → Latin-1 [Ã (C3)] [— (97 not printable, but in Windows-1252 it's an em-dash U+2014)] → re-UTF-8 [C3 83, E2 80 94]
    { from: Buffer.from([0xC3, 0x83, 0xE2, 0x80, 0x94]), to: Buffer.from('×', 'utf8') },
    // Ellipsis … U+2026 → UTF-8 [E2 80 A6] → Latin-1 "â€¦" → re-UTF-8 [C3 A2, E2 82 AC, C2 A6]
    { from: Buffer.from([0xC3, 0xA2, 0xE2, 0x82, 0xAC, 0xC2, 0xA6]), to: Buffer.from('…', 'utf8') },
    // En dash – U+2013 [E2 80 93] → Latin-1 "â€"" → re-UTF-8 [C3 A2, E2 82 AC, E2 80 9C]? actually 93 in Windows-1252 = U+201C "left double quote"
    { from: Buffer.from([0xC3, 0xA2, 0xE2, 0x82, 0xAC, 0xE2, 0x80, 0x9C]), to: Buffer.from('–', 'utf8') },
    // Em dash — U+2014 [E2 80 94] → Latin-1 "â€"" → Win1252 94 = U+201D "right double quote" → re-UTF-8 [C3 A2, E2 82 AC, E2 80 9D]
    { from: Buffer.from([0xC3, 0xA2, 0xE2, 0x82, 0xAC, 0xE2, 0x80, 0x9D]), to: Buffer.from('—', 'utf8') },
    // Check ✓ U+2713 [E2 9C 93] → Latin-1 "âœ"" → Win1252 93 = U+201C → re-UTF-8 [C3 A2, C5, 93, E2 80 9C]? Win1252 9C = U+0153, 93 = U+201C → so re-UTF-8 [C3 A2, C5 93, E2 80 9C]
    { from: Buffer.from([0xC3, 0xA2, 0xC5, 0x93, 0xE2, 0x80, 0x9C]), to: Buffer.from('✓', 'utf8') },
    // Black 4-pt star ✦ U+2726 [E2 9C A6] → "âœ¦" → Win1252 9C = U+0153, A6 = U+00A6 → re-UTF-8 [C3 A2, C5 93, C2 A6]
    { from: Buffer.from([0xC3, 0xA2, 0xC5, 0x93, 0xC2, 0xA6]), to: Buffer.from('✦', 'utf8') },
    // Black star ★ U+2605 [E2 98 85] → "â˜…" → Win1252 98 = U+02DC, 85 = U+2026 → re-UTF-8 [C3 A2, CB 9C, E2 80 A6]
    { from: Buffer.from([0xC3, 0xA2, 0xCB, 0x9C, 0xE2, 0x80, 0xA6]), to: Buffer.from('★', 'utf8') },
    // White diamond ◇ U+25C7 [E2 97 87] → "â—‡" → Win1252 97 = U+2014, 87 = U+2021 → re-UTF-8 [C3 A2, E2 80 94, E2 80 A1]
    { from: Buffer.from([0xC3, 0xA2, 0xE2, 0x80, 0x94, 0xE2, 0x80, 0xA1]), to: Buffer.from('◇', 'utf8') },
    // Black circle ● U+25CF [E2 97 8F] → "â—" → Win1252 97 = U+2014, 8F = nothing (control) → re-UTF-8 [C3 A2, E2 80 94, ?]
    // Skip — too ambiguous without seeing actual file bytes
    // Upwards arrow ⇪ U+21EA [E2 87 AA] → "â‡ª" → Win1252 87 = U+2021, AA = U+00AA → re-UTF-8 [C3 A2, E2 80 A1, C2 AA]
    { from: Buffer.from([0xC3, 0xA2, 0xE2, 0x80, 0xA1, 0xC2, 0xAA]), to: Buffer.from('⇪', 'utf8') },
    // Right triangle ▸ U+25B8 [E2 96 B8] → "â–¸" → Win1252 96 = U+2013, B8 = U+00B8 → re-UTF-8 [C3 A2, E2 80 93, C2 B8]
    { from: Buffer.from([0xC3, 0xA2, 0xE2, 0x80, 0x93, 0xC2, 0xB8]), to: Buffer.from('▸', 'utf8') },
];

function bufIndexOf(haystack, needle, fromIndex = 0) {
    return haystack.indexOf(needle, fromIndex);
}

function applyFixes(buf) {
    let count = 0;
    let result = buf;
    for (const { from, to } of BYTE_FIXES) {
        const parts = [];
        let last = 0;
        let idx;
        while ((idx = bufIndexOf(result, from, last)) !== -1) {
            parts.push(result.subarray(last, idx));
            parts.push(to);
            last = idx + from.length;
            count++;
        }
        if (parts.length) {
            parts.push(result.subarray(last));
            result = Buffer.concat(parts);
        }
    }
    return { buf: result, count };
}

const files = [
    'site/search.js',
    'site/timer.js',
    'site/toast.js',
    'site/triage-live.js',
    'site/schedule.js',
    'site/style.css',
    'site/app.js',
    'site/srs.js',
    'site/triage-live.html',
    'site/index.html',
    'site/triage-live.css',
];

let total = 0;
for (const rel of files) {
    const path = join(repoRoot, rel);
    let buf;
    try { buf = readFileSync(path); } catch (e) { console.warn(`skip ${rel}: ${e.message}`); continue; }
    const { buf: out, count } = applyFixes(buf);
    if (count > 0) {
        writeFileSync(path, out);
        console.log(`${rel}: ${count} replacements`);
        total += count;
    }
}
console.log(`\ntotal: ${total} mojibake replacements`);
