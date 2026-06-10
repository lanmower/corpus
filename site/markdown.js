// Guide markdown rendering — a pure leaf module: text in, HTML/strings out.
// No app state, no DOM mutation, no cross-call back into app.js. Extracted from
// app.js so the renderer is a single-focus unit testable in isolation (it was a
// hub in the old god-module). Depends only on the shared icon source.
import { ICON } from './icons.js';

// Filler words a spoken-transcript study guide accumulates; stripped at render.
export const DISFLUENCY_RE = /\b(?:um+|uh+|er+m?|y'?know|you know|sort of|kind of|basically|i mean)\b[,]?\s*/gi;

export function cleanDisfluencies(s) {
    return s.replace(DISFLUENCY_RE, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}

export function typoRefine(s) {
    s = s.replace(/(\s)--(\s)/g, '$1—$2');           // " -- " em-dash
    s = s.replace(/(\d)\s*-\s*(\d)/g, '$1–$2');       // numeric range en-dash
    s = s.replace(/\b(Mr|Mrs|Ms|Dr|Prof|St)\.\s+/g, '$1. '); // honorific nbsp
    s = s.replace(/(\d)\s+(mg|mcg|ng|kg|g|mL|L|mmol|mEq|IU|U|bpm|mmHg|mm|cm)\b/g, '$1 $2');
    return s;
}

// soft-split: paragraphs with >3 sentences AND >400 chars get broken into 2-3 sentence chunks.
export function softSplitPara(text) {
    text = cleanDisfluencies(text);
    text = typoRefine(text);
    if (text.length <= 400) return [text];
    let sentences = text.match(/[^.!?]+[.!?]+(?:["')\]]+)?(?:\s|$)|[^.!?]+$/g);
    // fallback: punctuation-poor transcripts — split on " so "/" and "/" but "/" because " plus comma joints.
    if (!sentences || sentences.length <= 3) {
        if (text.length <= 700) return [text];
        const seams = text.split(/(\s+(?:so|and|but|because|however|therefore|then|while|whereas)\s+)/i);
        if (seams.length <= 3) sentences = text.match(/[^,]+,\s*/g) || [text];
        else { sentences = []; for (let k = 0; k < seams.length; k += 2) sentences.push((seams[k] || '') + (seams[k+1] || '')); }
        if (sentences.length <= 2) sentences = [text];
    }
    const chunks = [];
    let buf = [], bufLen = 0;
    for (const sent of sentences) {
        buf.push(sent.trim());
        bufLen += sent.length;
        if (buf.length >= 2 && bufLen >= 220) { chunks.push(buf.join(' ')); buf = []; bufLen = 0; }
    }
    if (buf.length) {
        if (chunks.length && buf.join(' ').length < 80) chunks[chunks.length - 1] += ' ' + buf.join(' ');
        else chunks.push(buf.join(' '));
    }
    // final safety net: hard-wrap any chunk still over 900 chars on word boundaries near 500-char marks
    const out = [];
    for (const c of chunks) {
        if (c.length <= 900) { out.push(c); continue; }
        let rest = c;
        while (rest.length > 900) {
            let cut = rest.lastIndexOf(' ', 600);
            if (cut < 300) cut = 600;
            out.push(rest.slice(0, cut).trim());
            rest = rest.slice(cut).trim();
        }
        if (rest) out.push(rest);
    }
    return out;
}

export function renderMarkdown(md, subject) {
    if (!md) return '';
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = md.split('\n');
    const out = [];
    let listStack = [];
    let inCode = false, inQuote = false, para = [];
    const flushPara = () => { if (para.length) { for (const chunk of softSplitPara(para.join(' '))) out.push('<p>' + inline(chunk) + '</p>'); para = []; } };
    const flushList = () => { while (listStack.length) out.push('</' + listStack.pop() + '>'); };
    const flushQuote = () => { if (inQuote) { out.push('</blockquote>'); inQuote = false; } };
    const flushAll = () => { flushPara(); flushList(); flushQuote(); };
    function inline(s) {
        s = esc(s);
        s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
        s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
        s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        return s;
    }
    function slug(t) { return t.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, ''); }
    function affordance(headingText) {
        if (!subject) return '';
        const topic = encodeURIComponent(headingText);
        return `<span class="guide-aff"><a href="./triage-live.html?topic=${topic}&subject=${subject}" data-aff="tutor"><span class="icon-label">${ICON.arrowRight}<span>tutor</span></span></a></span>`;
    }
    function openListIfNeeded(tag) {
        if (listStack[listStack.length - 1] !== tag) {
            flushList();
            out.push('<' + tag + '>');
            listStack.push(tag);
        }
    }
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^```/.test(line)) { flushAll(); inCode = !inCode; out.push(inCode ? '<pre><code>' : '</code></pre>'); continue; }
        if (inCode) { out.push(esc(line)); continue; }
        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushAll(); out.push('<hr>'); continue; }
        const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
        if (h) {
            flushAll();
            const id = `g-${slug(h[2])}-${i}`;
            const level = h[1].length;
            const aff = (level === 2 || level === 3) ? affordance(h[2]) : '';
            out.push(`<h${level} id="${id}">${inline(h[2])}${aff}</h${level}>`);
            continue;
        }
        const bq = line.match(/^>\s?(.*)$/);
        if (bq) {
            flushPara(); flushList();
            if (!inQuote) { out.push('<blockquote>'); inQuote = true; }
            out.push('<p>' + inline(bq[1]) + '</p>');
            continue;
        }
        if (inQuote && line.trim() === '') { flushQuote(); continue; }
        const ul = line.match(/^\s*[-*+]\s+(.+)$/);
        const ol = line.match(/^\s*\d+[.)]\s+(.+)$/);
        if (ul) { flushPara(); flushQuote(); openListIfNeeded('ul'); out.push('<li>' + inline(ul[1]) + '</li>'); continue; }
        if (ol) { flushPara(); flushQuote(); openListIfNeeded('ol'); out.push('<li>' + inline(ol[1]) + '</li>'); continue; }
        if (line.trim() === '') { flushAll(); continue; }
        flushList();
        para.push(line);
    }
    flushAll(); if (inCode) out.push('</code></pre>');
    return out.join('\n');
}
