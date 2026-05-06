// global search palette — Ctrl-K. indexes cards + scenarios + guide sections.
export function buildSearchIndex(manifest, shards) {
    const items = [];
    for (const meta of manifest.subjects) {
        const sh = shards[meta.subject];
        if (!sh) continue;
        for (const c of sh.cards) items.push({
            kind: 'card', subject: meta.subject, id: c.id,
            title: c.front, body: c.back || '', tags: c.tags || []
        });
        if (sh.triage && sh.triage.scenarios) for (const s of sh.triage.scenarios) items.push({
            kind: 'case', subject: meta.subject, id: s.id || s.name,
            title: s.name, body: s.description || ''
        });
        if (sh.guide && sh.guide.sections) for (const sec of sh.guide.sections) items.push({
            kind: 'section', subject: meta.subject, id: `${meta.subject}#${sec.line}`,
            title: sec.title, body: '', level: sec.level
        });
        if (sh.guide && Array.isArray(sh.guide.infographics)) for (const ig of sh.guide.infographics) items.push({
            kind: 'infographic', subject: meta.subject, id: `${meta.subject}/${ig.filename}`,
            title: ig.title, body: ig.alt || ''
        });
        if (sh.guide && sh.guide.body) {
            const body = sh.guide.body;
            const paras = body.split(/\n\n+/);
            let lineCounter = 0;
            for (const p of paras) {
                const lines = p.split('\n').length;
                lineCounter += lines + 1;
                const trimmed = p.trim();
                if (trimmed.length < 40) continue;
                if (/^#{1,6}\s/.test(trimmed)) continue;
                items.push({
                    kind: 'prose', subject: meta.subject,
                    id: `${meta.subject}#L${lineCounter}`,
                    title: trimmed.slice(0, 80) + (trimmed.length > 80 ? '…' : ''),
                    body: trimmed
                });
            }
        }
    }
    return items;
}

export function snippet(body, query, radius = 60) {
    if (!body || !query) return '';
    const tok = query.trim().toLowerCase().split(/\s+/)[0];
    if (!tok) return body.slice(0, radius * 2);
    const i = body.toLowerCase().indexOf(tok);
    if (i < 0) return body.slice(0, radius * 2);
    const s = Math.max(0, i - radius), e = Math.min(body.length, i + tok.length + radius);
    return (s > 0 ? '…' : '') + body.slice(s, e) + (e < body.length ? '…' : '');
}

export function search(items, q, limit = 30) {
    const t = q.trim().toLowerCase();
    if (!t) return items.slice(0, limit);
    const tokens = t.split(/\s+/).filter(Boolean);
    const scored = [];
    for (const it of items) {
        const hay = (it.title + ' ' + it.body + ' ' + it.subject).toLowerCase();
        let score = 0, matched = true;
        for (const tok of tokens) {
            const i = hay.indexOf(tok);
            if (i < 0) { matched = false; break; }
            score += 1 + (it.title.toLowerCase().includes(tok) ? 3 : 0) + (i < 20 ? 1 : 0);
        }
        if (matched) scored.push({ it, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(x => x.it);
}

export function mountPalette(doc, openSelector, getItems, onSelect) {
    let el = doc.getElementById('search-palette');
    if (!el) {
        el = doc.createElement('div');
        el.id = 'search-palette';
        el.className = 'search-palette hidden';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'global search');
        el.innerHTML = `
            <div class="search-palette-inner">
                <input id="search-palette-input" type="text" placeholder="search cards, cases, sections…" aria-label="search">
                <ul id="search-palette-list" role="listbox"></ul>
                <div class="search-palette-hint">↑↓ navigate · enter open · esc close</div>
            </div>`;
        doc.body.appendChild(el);
    }
    const input = el.querySelector('#search-palette-input');
    const list = el.querySelector('#search-palette-list');
    let active = 0;
    let results = [];

    const close = () => { el.classList.add('hidden'); input.value = ''; };
    const open = () => {
        el.classList.remove('hidden');
        results = getItems().slice(0, 30);
        render();
        setTimeout(() => input.focus(), 10);
    };
    const render = () => {
        list.innerHTML = '';
        results.forEach((it, i) => {
            const li = doc.createElement('li');
            li.className = 'search-result' + (i === active ? ' active' : '');
            li.setAttribute('role', 'option');
            li.innerHTML = `<span class="kind kind-${it.kind}">${it.kind}</span><span class="t">${escapeHtml(it.title.slice(0, 80))}</span><span class="sub">${it.subject}</span>`;
            li.addEventListener('click', () => { onSelect(it); close(); });
            list.appendChild(li);
        });
    };
    input.addEventListener('input', () => {
        const items = getItems();
        results = search(items, input.value);
        active = 0;
        render();
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(results.length - 1, active + 1); render(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (results[active]) { onSelect(results[active]); close(); } }
    });
    el.addEventListener('click', e => { if (e.target === el) close(); });

    doc.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            if (el.classList.contains('hidden')) open(); else close();
        }
    });
    return { open, close };
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

if (typeof window !== 'undefined') window.__search = { buildSearchIndex, search, snippet };
