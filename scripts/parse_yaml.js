// Minimal YAML subset parser for our SRS card files and triage scenarios.
// Avoids npm install — js-yaml is overkill for our shape.
// Handles: top-level key: value, nested mappings, list items with - id:, pipe scalars |, quoted strings.

function parseScalar(s) {
    s = s.trim();
    if (s === '') return null;
    if (s === 'null' || s === '~') return null;
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
    if (s.startsWith('"') && s.endsWith('"')) {
        return s.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    if (s.startsWith("'") && s.endsWith("'")) {
        return s.slice(1, -1).replace(/''/g, "'");
    }
    if (s.startsWith('{') && s.endsWith('}')) {
        try { return parseFlow(s); } catch { /* fall through */ }
    }
    if (s.startsWith('[') && s.endsWith(']')) {
        try { return parseFlow(s); } catch { /* fall through */ }
    }
    return s;
}

// Parse YAML flow style: inline maps {k: v, k2: {...}} and sequences [a, b, [c, d]].
// Handles arbitrary nesting and quoted strings. Unquoted scalars accept letters/digits/
// punctuation up to the next unbalanced delimiter or comma.
function parseFlow(s) {
    let i = 0;
    function skipWs() { while (i < s.length && /\s/.test(s[i])) i++; }
    function parseValue() {
        skipWs();
        const c = s[i];
        if (c === '{') return parseMap();
        if (c === '[') return parseSeq();
        if (c === '"' || c === "'") return parseQuoted();
        return parseBareScalar();
    }
    function parseMap() {
        i++; // consume {
        const o = {};
        skipWs();
        if (s[i] === '}') { i++; return o; }
        while (i < s.length) {
            skipWs();
            const key = parseKey();
            skipWs();
            if (s[i] !== ':') throw new Error('flow-map missing colon at ' + i);
            i++;
            const val = parseValue();
            o[key] = val;
            skipWs();
            if (s[i] === ',') { i++; continue; }
            if (s[i] === '}') { i++; return o; }
            throw new Error('flow-map unexpected char ' + s[i] + ' at ' + i);
        }
        throw new Error('flow-map unterminated');
    }
    function parseSeq() {
        i++; // consume [
        const a = [];
        skipWs();
        if (s[i] === ']') { i++; return a; }
        while (i < s.length) {
            a.push(parseValue());
            skipWs();
            if (s[i] === ',') { i++; continue; }
            if (s[i] === ']') { i++; return a; }
            throw new Error('flow-seq unexpected char ' + s[i] + ' at ' + i);
        }
        throw new Error('flow-seq unterminated');
    }
    function parseQuoted() {
        const q = s[i++];
        let out = '';
        while (i < s.length) {
            if (q === '"' && s[i] === '\\' && s[i + 1]) { out += s[i + 1] === 'n' ? '\n' : s[i + 1]; i += 2; continue; }
            if (q === "'" && s[i] === "'" && s[i + 1] === "'") { out += "'"; i += 2; continue; }
            if (s[i] === q) { i++; return out; }
            out += s[i++];
        }
        throw new Error('quoted-scalar unterminated');
    }
    function parseKey() {
        if (s[i] === '"' || s[i] === "'") return parseQuoted();
        let out = '';
        while (i < s.length && s[i] !== ':' && s[i] !== ',' && s[i] !== '}' && s[i] !== ']') out += s[i++];
        return out.trim();
    }
    function parseBareScalar() {
        let out = '';
        let depth = 0;
        while (i < s.length) {
            const c = s[i];
            if (depth === 0 && (c === ',' || c === '}' || c === ']')) break;
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') {
                if (depth === 0) break;
                depth--;
            }
            out += c;
            i++;
        }
        const t = out.trim();
        if (t === 'true') return true;
        if (t === 'false') return false;
        if (t === 'null' || t === '~' || t === '') return null;
        if (/^-?\d+$/.test(t)) return parseInt(t, 10);
        if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t);
        return t;
    }
    const v = parseValue();
    skipWs();
    if (i !== s.length) throw new Error('flow trailing chars at ' + i);
    return v;
}

function indent(line) {
    let i = 0;
    while (i < line.length && line[i] === ' ') i++;
    return i;
}

function parseYaml(text) {
    const rawLines = text.split('\n');
    const lines = [];
    for (let i = 0; i < rawLines.length; i++) {
        const l = rawLines[i];
        const trimmed = l.trim();
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        lines.push({ indent: indent(l), text: l, trimmed });
    }

    let pos = 0;

    function parseBlock(baseIndent) {
        // Decide list vs map based on first non-empty line at >= baseIndent
        if (pos >= lines.length) return null;
        const first = lines[pos];
        if (first.indent < baseIndent) return null;
        if (first.trimmed.startsWith('- ') || first.trimmed === '-') {
            return parseList(first.indent);
        }
        return parseMap(first.indent);
    }

    function parseMap(mapIndent) {
        const obj = {};
        while (pos < lines.length) {
            const l = lines[pos];
            if (l.indent < mapIndent) break;
            if (l.indent > mapIndent) { pos++; continue; }
            const t = l.trimmed;
            if (t.startsWith('- ')) break;
            const colonIdx = findKeyColon(t);
            if (colonIdx < 0) { pos++; continue; }
            const key = t.slice(0, colonIdx).trim();
            const rest = t.slice(colonIdx + 1).trim();
            pos++;
            if (rest === '|' || rest === '|-' || rest === '>' || rest === '>-') {
                obj[key] = readBlockScalar(mapIndent, rest);
            } else if (rest === '') {
                // nested
                if (pos < lines.length && lines[pos].indent > mapIndent) {
                    obj[key] = parseBlock(lines[pos].indent);
                } else {
                    obj[key] = null;
                }
            } else {
                obj[key] = parseScalar(rest);
            }
        }
        return obj;
    }

    function parseList(listIndent) {
        const arr = [];
        while (pos < lines.length) {
            const l = lines[pos];
            if (l.indent < listIndent) break;
            if (l.indent > listIndent) { pos++; continue; }
            const t = l.trimmed;
            if (!t.startsWith('-')) break;
            const after = t.slice(1).replace(/^ +/, '');
            // strip leading anchor like &ref_0 if present at start of item
            // pattern: "- &ref_0" then map starts next line
            pos++;
            if (after === '' || /^&\w+$/.test(after)) {
                // map under this item
                if (pos < lines.length && lines[pos].indent > listIndent) {
                    arr.push(parseBlock(lines[pos].indent));
                } else {
                    arr.push(null);
                }
            } else if (after.startsWith('&')) {
                // anchor on same line — strip it
                const stripped = after.replace(/^&\w+\s*/, '');
                if (stripped === '') {
                    if (pos < lines.length && lines[pos].indent > listIndent) {
                        arr.push(parseBlock(lines[pos].indent));
                    } else { arr.push(null); }
                } else if (findKeyColon(stripped) >= 0) {
                    // inline first key of map; reparse synthetically
                    pos--;
                    lines[pos] = { indent: listIndent + 2, text: '  ' + stripped, trimmed: stripped };
                    arr.push(parseMap(listIndent + 2));
                } else {
                    arr.push(parseScalar(stripped));
                }
            } else if (findKeyColon(after) >= 0) {
                // inline first key of map; reparse by treating after as a child line
                // back up and synthesize child line at listIndent+2
                pos--;
                lines[pos] = { indent: listIndent + 2, text: '  ' + after, trimmed: after };
                arr.push(parseMap(listIndent + 2));
            } else if (after.startsWith('*')) {
                // alias reference — record as marker; resolution happens later
                arr.push({ __alias: after.slice(1).trim() });
            } else {
                arr.push(parseScalar(after));
            }
        }
        return arr;
    }

    function readBlockScalar(parentIndent, marker) {
        const out = [];
        let blockIndent = -1;
        while (pos < lines.length) {
            const l = lines[pos];
            if (l.indent <= parentIndent) break;
            if (blockIndent < 0) blockIndent = l.indent;
            out.push(l.text.slice(blockIndent));
            pos++;
        }
        return out.join('\n').replace(/\n+$/, '');
    }

    function findKeyColon(s) {
        // find first ':' that is followed by space or end-of-line, ignoring inside quotes
        let inS = false, inD = false;
        for (let i = 0; i < s.length; i++) {
            const c = s[i];
            if (c === '"' && !inS) inD = !inD;
            else if (c === "'" && !inD) inS = !inS;
            else if (c === ':' && !inS && !inD) {
                if (i === s.length - 1 || s[i + 1] === ' ') return i;
            }
        }
        return -1;
    }

    return parseBlock(0);
}

module.exports = { parseYaml };
