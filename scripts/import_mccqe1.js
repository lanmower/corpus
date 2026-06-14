#!/usr/bin/env node
// Imports the MCCQE1 syllabus from c:/dev/srs-mccqe1 into corpus's swappable
// syllabus tree at syllabus/mccqe1/. Pure transform over real source files:
//   srs-mccqe1/syllabi/mccqe1/topics.json  -> topicId -> {name, discipline}
//   srs-mccqe1/data/cards.json             -> 16k cards {question,answer,explanation,difficulty,tags,topicId}
// Emits, per discipline (a corpus "subject"):
//   syllabus/mccqe1/<subject>/srs-cards/<topicId>.yml   (build_data card shape)
//   syllabus/mccqe1/<subject>/study_guide.md            (generated FROM the cards)
//   syllabus/mccqe1/<subject>/{videos,audio-deepdive,infographics}/.gitkeep  (media later)
// Plus syllabus/mccqe1/syllabus.json and a syllabus/manifest.json registration.
//
// Idempotent: re-running regenerates the tree from source. The generated tree is
// committed so corpus builds without srs-mccqe1 present.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = process.env.MCCQE1_SRC || 'c:/dev/srs-mccqe1';
const OUT = path.join(ROOT, 'syllabus', 'mccqe1');

// CamelCase discipline -> kebab subject slug. Deterministic so re-runs are stable.
// "InfectiousDisease"->"infectious-disease", "ObGyn"->"ob-gyn", "ENT"->"ent".
function slugifyDiscipline(name) {
    return String(name)
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
}

// cards.json mixes the structured 80-topic ids (card-acs ...) with ~9k Toronto-Notes
// OCR cards whose topicId/tags are "<discipline>_<topic>" (e.g. urology_bph,
// pediatrics_cardiology, general_surgery_colorectal). The leading token is a clean
// discipline signal, so we normalize it to a canonical subject and keep the rest as
// the topic. No card is dropped: unknowns fall through tag-scan then general-medicine.
const TOKEN_TO_SUBJECT = {
    cardiology: 'cardiology', cardio: 'cardiology', card: 'cardiology',
    respirology: 'respirology', respiratory: 'respirology', resp: 'respirology', pulmonology: 'respirology',
    gastroenterology: 'gastroenterology', gi: 'gastroenterology',
    nephrology: 'nephrology', neph: 'nephrology', renal: 'nephrology',
    endocrinology: 'endocrinology', endo: 'endocrinology',
    infectious: 'infectious-disease', id: 'infectious-disease', microbiology: 'infectious-disease',
    neurology: 'neurology', neuro: 'neurology', neurosurgery: 'surgery',
    surgery: 'surgery', plastic: 'surgery', thoracic: 'surgery', vascular: 'surgery',
    orthopedic: 'orthopedics', orthopedics: 'orthopedics', ortho: 'orthopedics',
    pediatrics: 'pediatrics', peds: 'pediatrics', neonatology: 'pediatrics',
    obstetrics: 'ob-gyn', ob: 'ob-gyn', obgyn: 'ob-gyn', gynecology: 'ob-gyn', gyn: 'ob-gyn',
    psychiatry: 'psychiatry', psych: 'psychiatry',
    emergency: 'emergency-medicine', em: 'emergency-medicine', toxicology: 'emergency-medicine',
    critical: 'critical-care',
    public: 'public-health', ph: 'public-health',
    ethics: 'ethics', elom: 'ethics',
    family: 'family-medicine', fm: 'family-medicine',
    rheumatology: 'rheumatology', rheum: 'rheumatology',
    dermatology: 'dermatology', derm: 'dermatology',
    hematology: 'hematology', hem: 'hematology', oncology: 'oncology',
    ent: 'ent', oto: 'ent', otolaryngology: 'ent',
    ophthalmology: 'ophthalmology', ophth: 'ophthalmology', ophthal: 'ophthalmology',
    urology: 'urology', uro: 'urology',
    pharmacology: 'pharmacology', pharm: 'pharmacology',
    anesthesia: 'anesthesia',
    geriatrics: 'geriatrics', geriatric: 'geriatrics',
    radiology: 'medical-imaging', nuclear: 'medical-imaging', interventional: 'medical-imaging',
    palliative: 'palliative-care',
};

// Normalize a raw topicId/tag to a canonical subject slug, or null if no signal.
function subjectFromToken(raw) {
    const norm = String(raw || '').toLowerCase().replace(/[_\s]+/g, '-');
    if (!norm) return null;
    const parts = norm.split('-');
    const lead = parts[0];
    // multi-token specials where the leading token alone is ambiguous.
    if (lead === 'medical') {
        if (parts[1] === 'genetics') return 'medical-genetics';
        if (parts[1] === 'imaging') return 'medical-imaging';
        return null;
    }
    if (lead === 'general') return parts[1] ? 'surgery' : null; // "general" alone = misc, classify by tags
    return TOKEN_TO_SUBJECT[lead] || null;
}

const META_TAG = /^(toronto-notes|pages?-|page-)/i;

// Classify a card -> {subject, topicKey, topicName}. topicById is the structured set.
function classifyCard(c, topicById) {
    const known = topicById[c.topicId];
    if (known) return { subject: known.subject, topicKey: c.topicId, topicName: known.name };
    // try the orphan topicId itself
    let subject = subjectFromToken(c.topicId);
    if (!subject) {
        // scan tags (first meaningful tag usually names the domain)
        for (const t of (Array.isArray(c.tags) ? c.tags : [])) {
            if (META_TAG.test(String(t))) continue;
            const s = subjectFromToken(t);
            if (s) { subject = s; break; }
        }
    }
    if (!subject) subject = 'general-medicine';
    const topicKey = String(c.topicId || 'misc').toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '');
    const topicName = topicKey.replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
    return { subject, topicKey: topicKey || 'misc', topicName: topicName || 'Misc' };
}

// numeric difficulty 1-5 -> corpus difficulty string (loadCards expects a string).
function difficultyLabel(d) {
    const n = Number(d) || 3;
    if (n <= 2) return 'easy';
    if (n >= 4) return 'hard';
    return 'medium';
}

// Double-quoted YAML scalar that parse_yaml.js round-trips: it decodes \\, \" and
// \n inside double quotes, so we escape exactly those and flatten tabs.
function dq(s) {
    return '"' + String(s == null ? '' : s)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r/g, '')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, ' ') + '"';
}

// Inline flow sequence of simple tag tokens. Strip commas/brackets/quotes from
// tokens so the flow parser never sees an unbalanced delimiter.
function tagSeq(tags) {
    const clean = (Array.isArray(tags) ? tags : [])
        .map(t => String(t).replace(/[\[\]{},"']/g, '').trim())
        .filter(Boolean);
    return '[' + clean.join(', ') + ']';
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function main() {
    const topicsPath = path.join(SRC, 'syllabi', 'mccqe1', 'topics.json');
    const cardsPath = path.join(SRC, 'data', 'cards.json');
    if (!fs.existsSync(topicsPath) || !fs.existsSync(cardsPath)) {
        console.error(`! source not found under ${SRC} (need syllabi/mccqe1/topics.json + data/cards.json)`);
        process.exit(1);
    }
    const topics = readJson(topicsPath);
    const cardsRaw = readJson(cardsPath);
    const cards = Array.isArray(cardsRaw) ? cardsRaw : (cardsRaw.cards || []);

    // topicId -> {name, discipline, subject} for the structured 80-topic set.
    // subjectLabel: canonical subject slug -> human label (from the discipline names).
    const topicById = {};
    const subjectLabel = {};
    const subjectOrder = [];
    const seenSubject = new Set();
    function noteSubject(subject, label) {
        if (!seenSubject.has(subject)) { seenSubject.add(subject); subjectOrder.push(subject); }
        if (label && !subjectLabel[subject]) subjectLabel[subject] = label;
    }
    for (const t of topics) {
        const subject = slugifyDiscipline(t.discipline);
        topicById[t.id] = { name: t.name, discipline: t.discipline, subject };
        noteSubject(subject, t.discipline);
    }

    // Group EVERY card: subject -> topicKey -> [cards]; preserve appearance order.
    const bySubject = {};
    for (const c of cards) {
        const { subject, topicKey, topicName } = classifyCard(c, topicById);
        noteSubject(subject, null);
        const subj = (bySubject[subject] = bySubject[subject] || { topics: {}, names: {}, order: [] });
        if (!subj.topics[topicKey]) { subj.topics[topicKey] = []; subj.names[topicKey] = topicName; subj.order.push(topicKey); }
        subj.topics[topicKey].push(c);
    }

    // Clean output dir for the card/guide content (idempotent regenerate).
    fs.rmSync(OUT, { recursive: true, force: true });

    let totalCards = 0;
    const builtSubjects = [];
    for (const subject of subjectOrder) {
        const sg = bySubject[subject];
        if (!sg) continue;
        const discipline = subjectLabel[subject] || subject.replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
        const subjDir = path.join(OUT, subject);
        const cardsDir = path.join(subjDir, 'srs-cards');
        fs.mkdirSync(cardsDir, { recursive: true });
        for (const dir of ['videos', 'audio-deepdive', 'infographics']) {
            const d = path.join(subjDir, dir);
            fs.mkdirSync(d, { recursive: true });
            fs.writeFileSync(path.join(d, '.gitkeep'), '');
        }

        const guideParts = [`# ${discipline}\n`];
        for (const topicKey of sg.order) {
            const tcards = sg.topics[topicKey];
            const topicName = sg.names[topicKey];

            // one srs-cards yml per topic, in build_data's {cards:[...]} shape.
            const lines = [`# ${topicName} (${discipline}) - generated from srs-mccqe1`, 'cards:'];
            for (const c of tcards) {
                const back = c.explanation ? `${c.answer}\n\n${c.explanation}` : String(c.answer || '');
                lines.push(`  - front: ${dq(c.question)}`);
                lines.push(`    back: ${dq(back)}`);
                lines.push(`    difficulty: ${difficultyLabel(c.difficulty)}`);
                lines.push(`    tags: ${tagSeq(c.tags)}`);
            }
            fs.writeFileSync(path.join(cardsDir, `${topicKey}.yml`), lines.join('\n') + '\n');
            totalCards += tcards.length;

            // study guide: one section per topic, card Q/A + explanation as prose body.
            const body = [`## ${topicName}\n`];
            for (const c of tcards) {
                body.push(`**Q:** ${c.question}\n`);
                body.push(`**A:** ${c.answer}\n`);
                if (c.explanation) body.push(`${c.explanation}\n`);
            }
            guideParts.push(body.join('\n'));
        }
        fs.writeFileSync(path.join(subjDir, 'study_guide.md'), guideParts.join('\n') + '\n');
        builtSubjects.push(subject);
        console.log(`[ok] ${subject}: ${Object.keys(sg.topics).length} topics, ${sg.order.reduce((n, t) => n + sg.topics[t].length, 0)} cards`);
    }

    // syllabus.json (subjects in clinical first-appearance order) + manifest registration.
    fs.writeFileSync(path.join(OUT, 'syllabus.json'),
        JSON.stringify({ id: 'mccqe1', label: 'MCCQE1', subjects: builtSubjects }, null, 2) + '\n');

    const manifestPath = path.join(ROOT, 'syllabus', 'manifest.json');
    let manifest = { default: 'cmed4-2026', syllabi: ['cmed4-2026'] };
    try { manifest = readJson(manifestPath); } catch {}
    if (!manifest.syllabi.includes('mccqe1')) manifest.syllabi.push('mccqe1');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

    console.log(`\nimported ${builtSubjects.length} subjects, ${totalCards} cards into ${OUT}`);
}

if (require.main === module) main();
module.exports = { slugifyDiscipline, difficultyLabel, dq, tagSeq };
