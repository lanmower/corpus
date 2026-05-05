// personal cards added in-app. corpus.usercards.v1
const KEY = 'corpus.usercards.v1';

export function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
export function save(arr) { try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch {} }
export function add(front, back, tags = [], subject = 'personal') {
    const arr = load();
    const id = 'user-' + Math.random().toString(36).slice(2, 10);
    const card = { id, front, back, tags, _subject: subject, _personal: true, createdAt: Date.now() };
    arr.push(card); save(arr); return card;
}
export function remove(id) { save(load().filter(c => c.id !== id)); }
export function parseLine(line) {
    const [front, back, tagStr] = line.split('|').map(s => s.trim());
    if (!front || !back) return null;
    const tags = tagStr ? tagStr.split(',').map(s => s.trim()).filter(Boolean) : [];
    return { front, back, tags };
}

if (typeof window !== 'undefined') window.__usercards = { load, save, add, remove, parseLine };
