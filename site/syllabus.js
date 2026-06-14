// Runtime swappable-syllabus resolver — the bottom leaf the data loaders and the
// per-syllabus storage modules hang off. It owns:
//   - the active syllabus id (corpus.syllabus.v1, global; default from data/syllabi.json)
//   - dataPath(rel): which data subtree to fetch  -> ./data/<active>/<rel>
//   - skey(suffix): per-syllabus localStorage key  -> corpus.<active>.<suffix>
// Switching syllabus reloads the page, so the active id is fixed for a page's life;
// it is cached in a module variable and only changes via setActiveSyllabus (+reload).
//
// Theme, timer, tutor.* and the selector key itself stay GLOBAL (not namespaced):
// they are app-level prefs, not per-syllabus study progress.

const ACTIVE_KEY = 'corpus.syllabus.v1';

// Every per-syllabus storage suffix (the part after "corpus."). The migration below
// copies each legacy unprefixed key into the default syllabus's namespace once, so a
// student who studied before swappable syllabi keeps their progress under cmed4-2026.
export const PER_SYLLABUS_SUFFIXES = [
    'srs.states', 'srs.config', 'progress.v1', 'guide.v1',
    'schedule.v1', 'schedule.config.v1', 'triage.v1', 'mistakes.v1',
    'usercards.v1', 'newcards.v1', 'newcards.cap.v1', 'lastpos.v1',
    'drill.v1', 'flagged.v1', 'justread.v1', 'cram.dismissed.v1',
];

let _active = null;
let _default = 'cmed4-2026';
let _list = null;

function readStored() { try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; } }

export function getActiveSyllabus() {
    if (_active) return _active;
    _active = readStored() || _default;
    return _active;
}

export function setActiveSyllabus(id) {
    try { localStorage.setItem(ACTIVE_KEY, id); } catch {}
    _active = id;
}

// data subtree for the active syllabus. rel is e.g. 'manifest.json' or 'cardiology.json'.
export function dataPath(rel) { return `./data/${getActiveSyllabus()}/${rel}`; }

// per-syllabus localStorage key. suffix is the part after "corpus." (e.g. 'srs.states').
export function skey(suffix) { return `corpus.${getActiveSyllabus()}.${suffix}`; }

export function listSyllabi() {
    return _list || [{ id: getActiveSyllabus(), label: getActiveSyllabus(), default: true }];
}

// One-time, idempotent: copy legacy unprefixed per-syllabus keys into the default
// syllabus namespace. Non-destructive (legacy keys are left in place) and only copies
// when the namespaced target is absent, so it never clobbers newer per-syllabus data.
export function migrateLegacyKeys(defaultId) {
    for (const suffix of PER_SYLLABUS_SUFFIXES) {
        const legacy = `corpus.${suffix}`;
        const target = `corpus.${defaultId}.${suffix}`;
        try {
            if (localStorage.getItem(target) == null) {
                const v = localStorage.getItem(legacy);
                if (v != null) localStorage.setItem(target, v);
            }
        } catch {}
    }
}

// Boot: fetch data/syllabi.json to learn the available sets + the default, validate the
// persisted active id, then migrate legacy keys into the default namespace. Must run
// before any data fetch or per-syllabus storage access. fetchJson is injected to avoid
// a hard dependency edge. Degrades to a single default syllabus if syllabi.json is absent.
export async function initSyllabi(fetchJson) {
    try {
        const list = await fetchJson('./data/syllabi.json');
        if (Array.isArray(list) && list.length) {
            _list = list;
            const def = list.find(s => s.default) || list[0];
            if (def && def.id) _default = def.id;
        }
    } catch {
        _list = [{ id: _default, label: _default, default: true }];
    }
    // reset an unknown persisted selection (e.g. a removed syllabus) to the default.
    const stored = readStored();
    if (stored && _list && !_list.some(s => s.id === stored)) {
        setActiveSyllabus(_default);
    }
    _active = readStored() || _default;
    migrateLegacyKeys(_default);
    return _active;
}
