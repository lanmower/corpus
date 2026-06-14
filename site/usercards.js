// personal cards added in-app. corpus.usercards.v1
import { skey } from './syllabus.js';
const KEY = () => skey('usercards.v1');

export function load() { try { return JSON.parse(localStorage.getItem(KEY()) || '[]'); } catch { return []; } }
// Returns true on persist success. User-authored cards are the one store whose
// loss cannot be recomputed, so a quota failure must surface (storage-full
// banner) and callers must not confirm a card that won't survive reload.
export function save(arr) {
    try { localStorage.setItem(KEY(), JSON.stringify(arr)); return true; }
    catch (e) {
        try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('corpus:storage-full', { detail: { source: 'usercards', error: String(e) } })); } catch {}
        return false;
    }
}
export function add(front, back, tags = [], subject = 'personal') {
    const arr = load();
    const id = 'user-' + Math.random().toString(36).slice(2, 10);
    const card = { id, front, back, tags, _subject: subject, _personal: true, createdAt: Date.now() };
    arr.push(card);
    return save(arr) ? card : null;
}
export function remove(id) { save(load().filter(c => c.id !== id)); }
export function parseLine(line) {
    const [front, back, tagStr] = line.split('|').map(s => s.trim());
    if (!front || !back) return null;
    const tags = tagStr ? tagStr.split(',').map(s => s.trim()).filter(Boolean) : [];
    return { front, back, tags };
}

if (typeof window !== 'undefined') window.__usercards = { load, save, add, remove, parseLine };



