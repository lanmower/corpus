#!/usr/bin/env node
// Builds <subject>_triage_scenarios.yml for subjects missing them.
// Mirrors shape of cardiology_triage_scenarios.yml: metadata, atoms[], scenarios[].
// Atoms are extracted from SRS cards; scenarios are clustered by tag/source.
const fs = require('fs');
const path = require('path');
const { parseYaml } = require('./parse_yaml.js');

const ROOT = path.resolve(__dirname, '..');

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function lsSafe(d) { try { return fs.readdirSync(d); } catch { return []; } }

function loadCards(subject) {
    const dir = path.join(ROOT, subject, 'srs-cards');
    const out = [];
    for (const f of lsSafe(dir)) {
        if (!f.endsWith('.yml') && !f.endsWith('.yaml')) continue;
        const text = readSafe(path.join(dir, f));
        if (!text) continue;
        const parsed = parseYaml(text);
        let cards = [];
        if (Array.isArray(parsed)) cards = parsed;
        else if (parsed && Array.isArray(parsed.cards)) cards = parsed.cards;
        for (const c of cards) {
            if (c && c.front) out.push({ ...c, sourceFile: f });
        }
    }
    return out;
}

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function yamlEscape(s) {
    if (s == null) return '""';
    s = String(s);
    if (/[\n:#&*!|>'"%@`]/.test(s) || s.includes('  ')) {
        // use double-quoted with escapes
        return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
    }
    return s;
}

function emitYaml(subject, atoms, scenarios) {
    const L = [];
    L.push('metadata:');
    L.push(`  title: ${subject.charAt(0).toUpperCase() + subject.slice(1)} Triage Scenarios`);
    L.push(`  version: '1.0'`);
    L.push(`  generated: '${new Date().toISOString().split('T')[0]}'`);
    L.push(`  source: SRS cards from ${subject}`);
    L.push(`  total_atoms: ${atoms.length}`);
    L.push(`  total_scenarios: ${scenarios.length}`);
    L.push('atoms:');
    for (const a of atoms) {
        L.push(`  - id: ${a.id}`);
        L.push(`    card_source: ${yamlEscape(a.card_source)}`);
        L.push(`    atom: ${yamlEscape(a.atom)}`);
        L.push(`    definition: ${yamlEscape(a.definition)}`);
        L.push(`    tags: [${(a.tags || []).map(t => yamlEscape(t)).join(', ')}]`);
        L.push(`    source_type: srs-card`);
    }
    L.push('scenarios:');
    for (const s of scenarios) {
        L.push(`  - name: ${yamlEscape(s.name)}`);
        L.push(`    description: ${yamlEscape(s.description)}`);
        L.push(`    atom_ids:`);
        for (const id of s.atom_ids) L.push(`      - ${id}`);
        L.push(`    parameters:`);
        for (const [k, v] of Object.entries(s.parameters)) {
            L.push(`      ${k}: ${yamlEscape(v)}`);
        }
        L.push(`    examples:`);
        for (const ex of s.examples) {
            L.push(`      - case: ${yamlEscape(ex.case)}`);
            L.push(`        reasoning: ${yamlEscape(ex.reasoning)}`);
            L.push(`        recommendation: ${yamlEscape(ex.recommendation)}`);
        }
    }
    return L.join('\n') + '\n';
}

function buildScenariosFor(subject) {
    const cards = loadCards(subject);
    if (cards.length === 0) return null;

    // Atoms = each card transformed
    const atoms = cards.map((c, i) => ({
        id: `${slug(subject)}-${i + 1}`,
        card_source: c.sourceFile,
        atom: c.front,
        definition: c.back || '',
        tags: Array.isArray(c.tags) ? c.tags : []
    }));

    // Cluster by source file → one scenario per lecture file (with at least 3 atoms)
    const byFile = new Map();
    atoms.forEach((a, i) => {
        const k = a.card_source;
        if (!byFile.has(k)) byFile.set(k, []);
        byFile.get(k).push(a);
    });

    const scenarios = [];
    for (const [file, group] of byFile) {
        if (group.length < 3) continue;
        const topic = file.replace(/\.ya?ml$/, '').replace(/ - CMED.*$/, '').replace(/_/g, ' ').trim();
        scenarios.push({
            name: `${topic} — Diagnostic Reasoning Chain`,
            description: `Apply ${topic} atoms in sequence to triage a presenting patient`,
            atom_ids: group.slice(0, Math.min(8, group.length)).map(a => a.id),
            parameters: {
                severity: 'mild | moderate | severe — drives intensity of intervention',
                onset: 'acute (<24h) | subacute (days) | chronic (weeks+) — narrows differential',
                comorbidities: 'comma-separated list (e.g. diabetes, CKD, HIV) — modifies risk + drug choice',
                response: 'responsive | partial | refractory — gates escalation'
            },
            examples: [
                {
                    case: `Typical presentation, moderate severity, no comorbidities`,
                    reasoning: `Apply the first 3-4 atoms in order: confirm diagnosis using primary criterion, classify by severity, then choose first-line therapy per ${topic} guidelines.`,
                    recommendation: `First-line management as defined by atoms above; reassess at 48-72h.`
                },
                {
                    case: `Severe presentation with comorbidities`,
                    reasoning: `Comorbidities (diabetes/CKD/HIV) shift the risk profile and contraindicate some first-line agents. Use atoms covering complications and drug interactions.`,
                    recommendation: `Admit; start guideline-directed therapy adjusted for comorbidity; specialist input if refractory at 72h.`
                },
                {
                    case: `Refractory case after first-line therapy`,
                    reasoning: `Re-evaluate diagnosis (return to first atoms), confirm adherence, exclude alternative diagnoses listed in differential atoms, then escalate per second-line atoms.`,
                    recommendation: `Reconfirm diagnosis; escalate to second-line per ${topic} algorithm.`
                }
            ]
        });
    }

    if (scenarios.length === 0) {
        // Fallback: single scenario across all atoms
        scenarios.push({
            name: `${subject} — General Triage Chain`,
            description: `General reasoning sequence across ${subject} atoms`,
            atom_ids: atoms.slice(0, 8).map(a => a.id),
            parameters: { severity: 'mild | moderate | severe', onset: 'acute | chronic', response: 'responsive | refractory' },
            examples: [
                { case: 'Index presentation', reasoning: 'Apply atoms in order', recommendation: 'Standard management.' }
            ]
        });
    }

    return { atoms, scenarios };
}

function main(targets) {
    for (const s of targets) {
        const out = path.join(ROOT, `${s}_triage_scenarios.yml`);
        if (fs.existsSync(out)) {
            console.log(`- ${s}: exists, skipping (delete to regen)`);
            continue;
        }
        const built = buildScenariosFor(s);
        if (!built) { console.log(`! ${s}: no cards, skipping`); continue; }
        fs.writeFileSync(out, emitYaml(s, built.atoms, built.scenarios));
        console.log(`✓ ${s}: ${built.atoms.length} atoms, ${built.scenarios.length} scenarios → ${out}`);
    }
}

if (require.main === module) {
    main(['diabetes', 'gastroenterology', 'geriatric', 'nephrology']);
}

module.exports = { buildScenariosFor };
