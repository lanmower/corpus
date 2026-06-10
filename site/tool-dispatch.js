// Parse fenced ```tool blocks from LLM output and dispatch them.
// Tool block format:
//   ```tool
//   {"name":"add_card","args":{...}}
//   ```
//
// Usage:
//   import { parseToolCalls, dispatchToolCalls } from './tool-dispatch.js';
//   const calls = parseToolCalls(text);            // -> [{name, args}, ...]
//   const n = dispatchToolCalls(text, TOOLS);      // executes against TOOLS map, returns count

const TOOL_RE = /```tool\s*\n([\s\S]*?)\n```/g;

export function parseToolCalls(text) {
    const out = [];
    if (typeof text !== 'string') return out;
    let m;
    TOOL_RE.lastIndex = 0;
    while ((m = TOOL_RE.exec(text))) {
        let parsed;
        try { parsed = JSON.parse(m[1].trim()); }
        catch { console.warn('[tool-dispatch] malformed tool-block JSON, skipped:', m[1].slice(0, 120)); continue; }
        if (parsed && typeof parsed.name === 'string') out.push(parsed);
    }
    return out;
}

export function dispatchToolCalls(text, tools) {
    const calls = parseToolCalls(text);
    let count = 0;
    for (const call of calls) {
        const fn = tools[call.name];
        if (typeof fn !== 'function') { console.warn('[tool-dispatch] unknown tool action, skipped:', call.name); continue; }
        try { fn(call.args || {}); count++; }
        catch (e) { console.error('[tool-dispatch] error in', call.name, e); }
    }
    return count;
}

// Strip tool blocks from text so the chat UI shows only prose.
export function stripToolBlocks(text) {
    if (typeof text !== 'string') return '';
    return text.replace(TOOL_RE, '').trim();
}
