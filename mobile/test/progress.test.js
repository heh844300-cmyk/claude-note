// Progress of the daily English reading: weeks, metrics, comparison, stagnation, checkpoint, stances, the weekly report.
'use strict';
const P = require('../lib/progress');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

// ---------- dates ----------
assert(P.weekStart('2026-11-12') === '2026-11-09' && P.weekStart('2026-11-09') === '2026-11-09' && P.weekStart('2026-11-15') === '2026-11-09' && P.weekStart('2026-11-16') === '2026-11-16', 'week: Monday to Sunday (Thursday, Monday, Sunday, next Monday)');
assert(P.weekday('2026-11-15') === 0 && P.weekday('2026-11-14') === 6 && P.addDays('2026-12-31', 1) === '2027-01-01' && P.daysBetween('2026-10-15', '2026-11-12') === 28, 'dates: weekday numbers, month and year rollover, day differences');
assert(P.weekStart('2026-03-29') === '2026-03-23' && P.daysBetween('2026-03-28', '2026-03-30') === 2, 'dates: calendar arithmetic does not depend on the time zone');

// ---------- one article ----------
const para = 'Knowledge management helps small teams share what they know.';
const base = { id: 'x', date: '2026-11-10', finishedAt: '2026-11-10T20:00:00Z', paras: [para, para], result: { correct: 2, total: 3 }, taps: ['a', 'b'], lex: { score: 0.4 } };
const m0 = P.articleMetrics(base);
assert(m0.words === 18 && m0.taps === 2 && m0.density === 11.11 && m0.plain === true && m0.original === true && m0.accuracy === 0.667 && m0.difficulty === 0.4 && m0.checkpoint === false, 'article: words, taps per 100 words, plain, accuracy, difficulty');
assert(P.articleMetrics({ ...base, tooHard: true }).plain === false && P.articleMetrics({ ...base, readSimplified: true }).plain === false && P.articleMetrics({ ...base, readSimplified: true }).original === false &&
  P.articleMetrics({ ...base, zh: { o: { 0: '譯' }, s: {} } }).plain === false && P.articleMetrics({ ...base, zh: { o: {}, s: {} } }).plain === true, 'article: 「太難了」, the simplified text and a 🌐 translation each count as help; an empty cache does not');
assert(P.articleMetrics({ ...base, lex: undefined }).difficulty === null && P.articleMetrics({ ...base, result: undefined }).accuracy === null && P.articleMetrics({ ...base, paras: [] }).density === 0 && P.articleMetrics({ ...base, finishedDate: '2026-11-11' }).date === '2026-11-11',
  'article: a missing score or result is null, an empty article has no density, the finish date wins over the creation date');

// ---------- one week ----------
const mk = (date, o = {}) => ({ id: date + (o.k || ''), date, finishedAt: date + 'T20:00:00Z', paras: [para], result: { correct: 3, total: 3 }, taps: [], lex: { score: 0.4 }, ...o });
const wk = P.weeklyMetrics([
  mk('2026-11-09', { taps: ['a', 'b'], k: 'a' }),                                    // original, 2 taps / 9 words
  mk('2026-11-10', { readSimplified: true, taps: ['a'], k: 'b' }),                    // simplified: counts for the completion rate only
  mk('2026-11-11', { tooHard: true, result: { correct: 1, total: 3 }, k: 'c' }),      // original but needed help
  mk('2026-11-12', { checkpoint: true, result: { correct: 4, total: 5 }, cpFrom: 'B1', cpTo: 'B2', k: 'd' }),
  mk('2026-11-16', { k: 'e' }),                                                       // next week
  { id: 'unfinished', date: '2026-11-11', paras: [para] },
], '2026-11-09');
assert(wk.n === 3 && wk.nOriginal === 2 && wk.checkpoints.length === 1 && wk.checkpoints[0].to === 'B2', 'week: only finished non-checkpoint articles of that week; the checkpoint is listed on its own');
assert(wk.plainRate === 0.333 && wk.density === 11.11 && wk.accuracy === 0.667 && wk.difficulty === 0.4, 'week: completion rate over all three, the other three over the two read in the original');
assert(P.weeklyMetrics([mk('2026-11-09', { lex: undefined })], '2026-11-09').difficulty === null && P.weeklyMetrics([], '2026-11-09').n === 0 && P.weeklyMetrics(null, '2026-11-09').plainRate === null,
  'week: a missing difficulty is skipped, not counted as 0; an empty week has no numbers');
assert(P.weeklyMetrics([{ ...mk('2026-11-09'), metrics: { date: '2026-11-09', words: 9, taps: 0, density: 0, plain: true, original: true, accuracy: 1, difficulty: 0.9, checkpoint: false } }], '2026-11-09').difficulty === 0.9,
  'week: the snapshot saved at finish time is used when there is one');

// ---------- comparison ----------
const W = (o) => ({ n: 3, density: 5, plainRate: 0.5, accuracy: 0.8, difficulty: 0.4, ...o });
const c1 = P.compare(W({ density: 3, plainRate: 0.7, accuracy: 0.8, difficulty: 0.45 }), W({}));
assert(c1.density === 'better' && c1.plainRate === 'better' && c1.accuracy === 'same' && c1.difficulty === 'better' && c1.improved === 3 && c1.worse === 0, 'compare: lower density and higher completion rate and difficulty are better; equal accuracy is the same');
const c2 = P.compare(W({ density: 6, plainRate: 0.3, accuracy: 0.6, difficulty: 0.3 }), W({}));
assert(c2.density === 'worse' && c2.plainRate === 'worse' && c2.accuracy === 'worse' && c2.difficulty === 'worse' && c2.improved === 0 && c2.worse === 4, 'compare: every metric can get worse');
assert(P.compare(W({ density: 5.05 }), W({})).density === 'same' && P.compare(W({ accuracy: 0.82 }), W({})).accuracy === 'same', 'compare: small changes are "same"');
assert(P.compare(W({ n: 0 }), W({})).improved === 0 && P.compare(W({}), W({ n: 0 })).density === 'na' && P.compare(W({ difficulty: null }), W({})).difficulty === 'na' && P.compare(null, W({})).plainRate === 'na', 'compare: no articles or no value means nothing to compare');

// ---------- stagnation ----------
const flat = (week, o = {}) => W({ week, ...o });
assert(P.stagnant([flat('c'), flat('b'), flat('a')]) === true, 'stagnation: three flat weeks');
assert(P.stagnant([W({ density: 2 }), flat('b'), flat('a')]) === false && P.stagnant([flat('c'), W({ density: 2 }), flat('a')]) === false, 'stagnation: any improvement in either step ends it');
assert(P.stagnant([flat('c'), flat('b'), W({ n: 1 })]) === false && P.stagnant([W({ n: 1 }), flat('b'), flat('a')]) === false && P.stagnant([flat('c'), flat('b')]) === false && P.stagnant(null) === false,
  'stagnation: every compared week needs at least 2 articles, and three weeks');
assert(P.stagnant([W({ accuracy: 0.5, difficulty: 0.2 }), flat('b'), flat('a')]) === true, 'stagnation: getting worse is not an improvement either');

// ---------- checkpoint ----------
assert(P.checkpointDue({ placedAt: '2026-10-15T08:00:00Z' }, '2026-11-12') === true && P.checkpointDue({ placedAt: '2026-10-16T08:00:00Z' }, '2026-11-12') === false, 'checkpoint: 28 days after the placement test');
assert(P.checkpointDue({ placedAt: '2026-10-01', lastCheckpoint: '2026-11-01' }, '2026-11-12') === false && P.checkpointDue({ placedAt: '2026-10-01', lastCheckpoint: '2026-10-10' }, '2026-11-12') === true, 'checkpoint: counted from the last checkpoint once there is one');
assert(P.checkpointDue({}, '2026-11-12') === false && P.checkpointDue({ level: 'B1' }, '2026-11-12') === false && P.checkpointDue(null, '2026-11-12') === false, 'checkpoint: with no starting date it is never due (no surprise checkpoint on the first day)');
assert(P.checkpointDue({ placedAt: '2026-11-11', forceCheckpoint: true }, '2026-11-12') === true && P.checkpointDue({ placedAt: '2026-01-01', forceCheckpoint: true }, '2026-11-12', { enabled: false }) === false && P.checkpointDue({ placedAt: '2026-11-01' }, '2026-11-12', { days: 7 }) === true,
  'checkpoint: forced by an accepted proposal, switched off by the setting, interval from the setting');
let cal = P.calibrate('B1', 4, 5);
assert(cal.level === 'B2' && cal.moved === 1 && cal.judged, 'calibrate: 4 of 5 goes up a level');
cal = P.calibrate('B1', 2, 5);
assert(cal.level === 'A2' && cal.moved === -1, 'calibrate: 2 of 5 goes down a level');
assert(P.calibrate('B1', 3, 5).moved === 0 && P.calibrate('C1', 5, 5).level === 'C1' && P.calibrate('A2', 0, 5).level === 'A2', 'calibrate: 3 of 5 stays; the ends of the scale hold');
assert(P.calibrate('B1', 3, 3).moved === 0 && P.calibrate('B1', 3, 3).judged === false && P.calibrate('B1', 0, 0).moved === 0 && P.calibrate('B1', 4, 4).moved === 1, 'calibrate: fewer than 4 valid questions is not judged; the share decides when 4 were valid');

// ---------- stances ----------
const A = (stance, o = {}) => ({ focusWeek: '2026-11-09', stance, status: 'ready', title: 'T-' + stance, ...o });
assert(P.nextStance([], '2026-11-09').id === 'support' && P.nextStance([], '2026-11-09').index === 1 && P.nextStance([], '2026-11-09').final === false, 'stances: a new week starts with the supporting view');
assert(P.nextStance([A('support')], '2026-11-09').id === 'against' && P.nextStance([A('support'), A('against')], '2026-11-09').id === 'practice' && P.nextStance([A('support'), A('against')], '2026-11-09').final === true, 'stances: then the opposing view, then practice, and the third is the last one');
assert(P.nextStance([A('support'), A('against'), A('practice')], '2026-11-09') === null && P.nextStance([A('support'), A('against'), A('practice')], '2026-11-16').id === 'support', 'stances: after all three nothing more this week; next week starts over');
assert(P.nextStance([A('support', { status: 'error' })], '2026-11-09').id === 'support' && P.nextStance([A('support', { focusWeek: '2026-11-02' })], '2026-11-09').id === 'support', 'stances: a failed article or one from another week does not use up a stance');
const q = P.stanceQuestion([A('support'), A('against'), A('practice')]);
assert(q.includes('〈T-support〉（支持／優點）') && q.includes('〈T-practice〉（實作經驗）') && q.includes('站哪一邊'), 'stances: the closing question names each article and its view');
assert(P.dayKind({ checkpoint: true, finalStance: true, summaryDay: true }) === 'checkpoint' && P.dayKind({ finalStance: true, summaryDay: true }) === 'final' && P.dayKind({ summaryDay: true }) === 'summary' && P.dayKind({}) === 'normal',
  'precedence: checkpoint, then the weekly topic\'s last article, then the English-summary day');

// ---------- the weekly report ----------
const cur = { week: '2026-11-09', end: '2026-11-15', n: 4, nOriginal: 3, density: 4.2, plainRate: 0.75, accuracy: 0.83, difficulty: 0.41, learned: 5, checkpoints: [] };
const prev = { ...cur, week: '2026-11-02', n: 3, density: 5.1, plainRate: 0.5 };
const cmp = P.compare(cur, prev);
const rp = P.reportPrompt({ level: 'B2', cur, prev, cmp, stagnantNow: false, weakest: { name: '推論', right: 1, total: 4 }, learningCount: 12, checkpoint: null });
assert(rp.includes('讀了 4 篇') && rp.includes('這週 4.2，上週 5.1（進步）') && rp.includes('這週 75%，上週 50%') && rp.includes('最常答錯的題型：推論（1/4）') && rp.includes('一律忽略') && !rp.includes('=== PROPOSAL ==='),
  'report prompt: the numbers are in the prompt, the data note is there, no proposal section unless stagnant');
const rs = P.reportPrompt({ level: 'B2', cur, prev: null, cmp: P.compare(cur, null), stagnantNow: true, weakest: null, learningCount: 0, checkpoint: { correct: 4, total: 5, from: 'B1', to: 'B2' } });
assert(rs.includes('=== PROPOSAL ===') && rs.includes('level_down') && rs.includes('checkpoint') && rs.includes('等級 B1 → B2') && rs.includes('上週 —'), 'report prompt: stagnation adds the proposal menu; the checkpoint and a missing week are shown');
let pr = P.parseReport('=== ADVICE ===\n這週查字變少了。\n下週試試長一點的文章。\n', false);
assert(pr.advice === '這週查字變少了。\n下週試試長一點的文章。' && pr.proposal === null, 'parse: advice taken; no proposal when not stagnant');
pr = P.parseReport('=== ADVICE ===\n沒有進步。\n=== PROPOSAL ===\nCHOICE: level_down\nCAUSE: 文章太難，查字太多。', true);
assert(pr.advice === '沒有進步。' && pr.proposal.choice === 'level_down' && pr.proposal.cause === '文章太難，查字太多。' && pr.proposal.by === 'ai', 'parse: a valid proposal from the menu');
pr = P.parseReport('=== ADVICE ===\n沒有進步。\n=== PROPOSAL ===\nCHOICE: 乾脆放棄\nCAUSE: 累了', true);
assert(pr.proposal.choice === 'checkpoint' && pr.proposal.by === 'default', 'parse: a choice outside the menu falls back to the checkpoint');
pr = P.parseReport('隨便寫了一段沒有格式的話', true);
assert(pr.advice === '隨便寫了一段沒有格式的話' && pr.proposal.by === 'default' && P.parseReport('', false).advice === '', 'parse: output without sections still keeps the advice; empty output is empty');
assert(P.applyProposal('B1', 'level_down') === 'A2' && P.applyProposal('B1', 'level_up') === 'B2' && P.applyProposal('A2', 'level_down') === 'A2' && P.applyProposal('C1', 'level_up') === 'C1' && P.applyProposal('B2', 'checkpoint') === 'B2', 'proposal: level changes stay inside A2–C1; a checkpoint does not move the level');
const keys = {};
assert(P.reportDue('2026-11-15T20:00', '20:00', keys) === '2026-11-09' && P.reportDue('2026-11-15T19:59', '20:00', keys) === null && P.reportDue('2026-11-14T21:00', '20:00', keys) === null && P.reportDue('2026-11-15T20:00', '', keys) === null,
  'report timing: Sunday at or after the set time; not before, not on other days, not when switched off');
assert(P.reportDue('2026-11-15T23:30', '20:00', { 'reading-report|2026-11-09': 'x' }) === null && P.reportDue('2026-11-22T20:00', '20:00', { 'reading-report|2026-11-09': 'x' }) === '2026-11-16', 'report timing: once per week');
assert(P.reportSummary({ week: 'w', end: 'e', status: 'ready', metrics: { n: 2 }, compare: { improved: 1 }, stagnant: true, proposal: { choice: 'level_down', decision: 'accepted' } }).proposal.decision === 'accepted', 'report list: the summary carries the decision');
