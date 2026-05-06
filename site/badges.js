// badge catalog + evaluator. corpus.game.v1 stores badges array.
import * as game from './game.js';

const SUBJECTS = ['cardiology','diabetes','endocrine','gastroenterology','geriatric','nephrology','pulmonology','rheumatology'];

export const CATALOG = [
    { id: 'first_review', label: 'first review', icon: '✦', desc: 'grade your first card' },
    { id: 'cards_100', label: '100 cards', icon: '☆', desc: 'reach 100 graded cards' },
    { id: 'cards_1000', label: '1000 cards', icon: '★', desc: 'reach 1000 graded cards' },
    { id: 'streak_7', label: '7-day streak', icon: '✺', desc: '7 consecutive days' },
    { id: 'streak_30', label: '30-day streak', icon: '✹', desc: '30 consecutive days' },
    { id: 'streak_100', label: '100-day streak', icon: '✸', desc: '100 consecutive days' },
    ...SUBJECTS.map(s => ({ id: `subject_master_${s}`, label: `${s} master`, icon: '◆', desc: `master ${s}` })),
    { id: 'all_master', label: 'all subjects', icon: '✪', desc: 'master every subject' },
    { id: 'night_owl', label: 'night owl', icon: '☾', desc: 'study past 23:00' },
    { id: 'early_bird', label: 'early bird', icon: '☀', desc: 'study before 06:00' },
    { id: 'weekend_warrior', label: 'weekend warrior', icon: '⚔', desc: 'study sat+sun in one weekend' },
    { id: 'comeback', label: 'comeback', icon: '↻', desc: 'return after 7+ day gap' },
    { id: 'perfectionist', label: 'perfectionist', icon: '◎', desc: '10 cards in a row at grade 4' },
    { id: 'case_cracker', label: 'case cracker', icon: '⚖', desc: 'pass 10 cases' },
    { id: 'mistake_hunter', label: 'mistake hunter', icon: '⚐', desc: 'clear 25 mistakes' },
    { id: 'polyglot', label: 'polyglot', icon: '◈', desc: 'touch all 8 subjects in one day' },
    { id: 'marathon', label: 'marathon', icon: '⌚', desc: '120+ cards in a day' },
    { id: 'consistency', label: 'consistency', icon: '═', desc: 'hit daily goal 14 days' },
    { id: 'final_sprint', label: 'final sprint', icon: '⚡', desc: 'study within 7d of exam' },
    { id: 'note_taker', label: 'note taker', icon: '✎', desc: '20 notes' },
    { id: 'flag_collector', label: 'flag collector', icon: '⚑', desc: '15 flagged cards' },
    { id: 'tutor_graduate', label: 'tutor graduate', icon: '✓', desc: 'pass 25 cases' },
    { id: 'level_5', label: 'level 5', icon: '⓹', desc: 'reach level 5' },
    { id: 'level_10', label: 'level 10', icon: '⓾', desc: 'reach level 10' },
    { id: 'level_25', label: 'level 25', icon: '㉕', desc: 'reach level 25' },
    { id: 'level_50', label: 'level 50', icon: '㊿', desc: 'reach level 50' }
];

export function predicate(id, snap) {
    const { progress, gameState, mistakes, flag, notes, srsStates, masterySubjects, daysToExam, hourNow, comboGrade4 } = snap;
    switch (id) {
        case 'first_review': return (progress?.history?.reduce((n, h) => n + (h.graded || 0), 0) || 0) + (progress?.todayGraded || 0) >= 1;
        case 'cards_100': return totalCards(progress) >= 100;
        case 'cards_1000': return totalCards(progress) >= 1000;
        case 'streak_7': return (progress?.streak || 0) >= 7;
        case 'streak_30': return (progress?.streak || 0) >= 30;
        case 'streak_100': return (progress?.streak || 0) >= 100;
        case 'all_master': return SUBJECTS.every(s => (masterySubjects?.[s] || 0) >= 75);
        case 'night_owl': return hourNow >= 23 && (progress?.todayGraded || 0) >= 5;
        case 'early_bird': return hourNow < 6 && (progress?.todayGraded || 0) >= 5;
        case 'weekend_warrior': return weekendBoth(progress);
        case 'comeback': return (progress?.history || []).length === 0 ? false : gapDays(progress) >= 7 && (progress?.todayGraded || 0) >= 1;
        case 'perfectionist': return (comboGrade4 || 0) >= 10;
        case 'case_cracker': return (progress?.history || []).reduce((n, h) => n + (h.cases || 0), 0) + (progress?.todayCases || 0) >= 10;
        case 'mistake_hunter': return (mistakes?.cleared || 0) >= 25;
        case 'polyglot': return (snap.subjectsTouchedToday || 0) >= 8;
        case 'marathon': return (progress?.todayGraded || 0) >= 120;
        case 'consistency': return goalHitDays(progress) >= 14;
        case 'final_sprint': return daysToExam <= 7 && (progress?.todayGraded || 0) >= 1;
        case 'note_taker': return (notes?.count || 0) >= 20;
        case 'flag_collector': return (flag?.count || 0) >= 15;
        case 'tutor_graduate': return (progress?.history || []).reduce((n, h) => n + (h.cases || 0), 0) + (progress?.todayCases || 0) >= 25;
        case 'level_5': return (gameState?.level || 1) >= 5;
        case 'level_10': return (gameState?.level || 1) >= 10;
        case 'level_25': return (gameState?.level || 1) >= 25;
        case 'level_50': return (gameState?.level || 1) >= 50;
        default:
            if (id.startsWith('subject_master_')) {
                const s = id.slice('subject_master_'.length);
                return (masterySubjects?.[s] || 0) >= 75;
            }
            return false;
    }
}

function totalCards(p) {
    if (!p) return 0;
    return (p.history || []).reduce((n, h) => n + (h.graded || 0), 0) + (p.todayGraded || 0);
}
function weekendBoth(p) {
    if (!p?.history) return false;
    const dates = new Set([...(p.history.map(h => h.date)), p.todayDate]);
    for (const d of dates) {
        const dow = new Date(d + 'T00:00:00').getDay();
        if (dow === 6) {
            const next = new Date(new Date(d).getTime() + 86400000).toISOString().slice(0, 10);
            if (dates.has(next)) return true;
        }
    }
    return false;
}
function gapDays(p) {
    if (!p?.lastActiveDate) return 0;
    const last = new Date(p.lastActiveDate);
    const now = new Date(p.todayDate || new Date().toISOString().slice(0, 10));
    return Math.round((now - last) / 86400000);
}
function goalHitDays(p) {
    const goal = p?.dailyGoal || 30;
    return (p?.history || []).filter(h => (h.graded || 0) >= goal).length;
}

export function evaluateBadges(snap) {
    const g = game.load();
    const newly = [];
    for (const b of CATALOG) {
        if (g.badges.includes(b.id)) continue;
        try { if (predicate(b.id, snap)) { game.awardBadge(b.id, b.label, b.icon); newly.push(b); } } catch {}
    }
    return newly;
}

if (typeof window !== 'undefined') window.__badges = { CATALOG, predicate, evaluateBadges };
