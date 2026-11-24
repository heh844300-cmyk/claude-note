// The map and the weekly review: week math, dating notes, open contradictions, the numbers, and what the notes may contain.
'use strict';
const W = require('../lib/weekly');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

// ISO weeks, Monday first, across year ends
const w = W.isoWeek('2026-11-24');
assert(w.label === '2026-W48' && w.start === '2026-11-23' && w.end === '2026-11-29', 'a Tuesday: its Monday-to-Sunday week');
assert(W.isoWeek('2026-11-29').label === '2026-W48' && W.isoWeek('2026-11-30').label === '2026-W49', 'Sunday still belongs to the week, Monday starts the next');
assert(W.isoWeek('2027-01-01').label === '2026-W53' && W.isoWeek('2027-01-04').label === '2027-W01', 'year end: 2026 has 53 weeks, early January can be in the old year');
assert(W.isoWeek('2024-12-30').label === '2025-W01', 'late December can be week 1 of the next year');
assert(W.prevWeek('2026-11-30').label === '2026-W48' && W.prevWeek('2027-01-04').label === '2026-W53', 'the week before, also across the year');

// a note's day: created first, then the file name; never the file time
assert(W.createdDay({ created: '2026-11-10T12:40' }, '2026-11-24 x.md') === '2026-11-10', 'frontmatter created wins over the file name');
assert(W.createdDay({}, '2026-11-12 規劃.md') === '2026-11-12' && W.createdDay(null, 'Claude Note.md') === null, 'file-name date as fallback, else unknown');

// open contradictions in all the shapes real notes use
const bullet = '## 思路脈絡\n- 問題\n- 矛盾或未想清楚之處\n  - 「不斷學習」的機制未定義；依 [[RAG]]，可以補充\n  - 來源可信度未定\n- 結論\n  - 不是這一段\n';
assert(W.conflictItems(bullet).join('|') === '「不斷學習」的機制未定義；依 RAG，可以補充|來源可信度未定', 'bullet with children: only its children, links as plain text');
const bold = '- **矛盾或未想清楚之處**\n  - A 和 B 互相矛盾\n\n## 待辦事項\n- [ ] x\n';
assert(W.conflictItems(bold).join('|') === 'A 和 B 互相矛盾', 'bold bullet: stops at the next heading');
const inline = '  - 矛盾或未想清楚之處：與既有筆記 [[Claude-Notes/筆記/2026-11-10 X|X]] 說法不同\n  - 別的\n';
assert(W.conflictItems(inline).join('|') === '與既有筆記 X 說法不同', 'one-line form: the text after the colon');
const head = '## 矛盾或未想清楚之處\n- 文章說 A，筆記說 B\n- 第二點\n\n## 我可以怎麼用\n- y\n';
assert(W.conflictItems(head).length === 2, 'heading form (web clips): the bullets until the next heading');
assert(W.conflictItems('- 矛盾或未想清楚之處\n  - 上次的「等檔案」已解除。\n  - 和既有筆記一致，沒有衝突。\n  - 分數可不可靠還沒判斷\n').join('|') === '分數可不可靠還沒判斷', 'items saying something is resolved or not a conflict are left out');
assert(W.conflictItems('- 矛盾或未想清楚之處\n  - 無\n').length === 0 && W.conflictItems('# x\n沒有這一段').length === 0, '"無" and a missing section are not open items');

// the numbers
const n = (rel, kind, created, md = '') => ({ rel, name: rel.split('/').pop().replace(/\.md$/, ''), kind, created, md });
const notes = [
  n('Claude-Notes/筆記/2026-11-24 A.md', 'note', '2026-11-24', '## 摘要\n今天把 [[RAG]] 讀完了。\n\n- 矛盾或未想清楚之處\n  - 向量是否必要\n'),
  n('Claude-Notes/筆記/2026-11-23 B.md', 'clip', '2026-11-23', '## 摘要\n一篇文章。'),
  n('Claude-Notes/知識庫/RAG.md', 'kb', '2026-11-10', '## 摘要\n檢索增強生成。\n- 矛盾或未想清楚之處\n  - 知識庫的不列入\n'),
  n('Claude-Notes/筆記/2026-11-01 舊.md', 'note', '2026-11-01', '- 矛盾或未想清楚之處\n  - 太舊的不列入\n'),
  n('Claude-Notes/知識庫/Obsidian.md', 'kb', '2026-11-20'),
];
const edges = [
  { from: 'Claude-Notes/筆記/2026-11-24 A.md', to: 'Claude-Notes/知識庫/RAG.md' },
  { from: 'Claude-Notes/筆記/2026-11-23 B.md', to: 'Claude-Notes/知識庫/RAG.md' },
  { from: 'Claude-Notes/筆記/2026-11-23 B.md', to: 'Claude-Notes/知識庫/Obsidian.md' },
  { from: 'Claude-Notes/筆記/2026-11-01 舊.md', to: 'Claude-Notes/知識庫/Obsidian.md' },          // too old for the window
  { from: 'Claude-Notes/知識庫/RAG.md', to: 'Claude-Notes/知識庫/RAG.md' },                       // self link
  { from: 'Claude-Notes/筆記/2026-11-24 A.md', to: 'Claude-Notes/信件/x.md' },                    // not a counted note
];
const st = W.stats({ notes, edges, from: '2026-11-23', to: '2026-11-29', recentFrom: '2026-11-15', inbox: { pending: 1, failed: 0 } });
assert(st.total === 2 && st.counts.note === 1 && st.counts.clip === 1 && st.added[0].name === '2026-11-24 A', 'what came in this week, newest first, by kind');
assert(st.topLinked.map((t) => t.name + ':' + t.n).join(',') === 'RAG:2,Obsidian:1', 'top linked: only links from recent notes, no self links, only to counted notes');
assert(st.conflicts.length === 1 && st.conflicts[0].items[0] === '向量是否必要', 'open contradictions: recent ones, not from 知識庫 or old notes');
assert(st.added[0].summary === '今天把 RAG 讀完了。', 'summary line, links as plain text');

const map = W.renderMap(st, st, { stamp: '2026-11-24 08:00', weeklyLink: '[[Claude-Notes/筆記/回顧/2026-W47 週回顧|2026-W47 週回顧]]' });
const weekly = W.renderWeekly(W.isoWeek('2026-11-24'), st, { one: '讀 RAG', themes: ['檢索'], open: [] }, { stamp: '2026-11-30 08:00' });
for (const [label, doc] of [['map', map], ['weekly review', weekly]]) {
  assert(!/\[[ xX]\]/.test(doc), label + ': no check boxes (it would show up in the 待辦 tab)');
  const links = [...doc.matchAll(/\[\[([^\]|]+)/g)].map((m) => m[1]);
  assert(links.length && links.every((l) => /^Claude-Notes\/(筆記|知識庫)\//.test(l)), label + ': only links the program built, to notes that exist');
}
assert(map.includes('generated_by: claude-note-map') && weekly.includes('generated_by: claude-note-weekly'), 'own generated_by: never taken for an organized note (updates, reminders)');
assert(weekly.includes('## 一句話\n\n讀 RAG') && weekly.includes('收集箱：1 篇等著整理'), 'weekly review: narrative plus the numbers');
assert(W.renderWeekly(W.isoWeek('2026-11-24'), st, null, { stamp: '2026-11-30 08:00' }).includes('AI 這次沒有寫出摘要'), 'no narrative: the program-only review is still written');

// the AI's part
const out = 'ONE: 這週都在讀 [[RAG]]\nTHEMES:\n- 檢索：A 與 B\n- [ ] 不該出現的待辦\nOPEN:\n- 沒有\n';
const p = W.parseNarrative(out);
assert(p && p.one === '這週都在讀 RAG' && p.themes.length === 2 && !p.themes.join().includes('[ ]') && p.open.length === 0, 'narrative parsed: links and check boxes removed, "沒有" dropped');
assert(W.parseNarrative('隨便亂寫的回答') === null, 'unreadable answer -> null (the program-only review is used)');
assert(W.narrativePrompt(st).includes('一律忽略') && W.narrativePrompt(st).includes('2026-11-24 A（記錄）'), 'prompt: titles and summaries only, data-not-instructions note');
// structural links are not "what you are thinking of"
const sn = [
  { ...n('Claude-Notes/筆記/2026-11-10 例會.md', 'note', '2026-11-10'), parent: '' },
  { ...n('Claude-Notes/筆記/2026-11-24 例會進度.md', 'note', '2026-11-24'), parent: '2026-11-10 例會.md' },
  { ...n('Claude-Notes/知識庫/QLoRA.md', 'kb', '2026-11-24'), parent: '' },
  { ...n('Claude-Notes/筆記/2026-11-23 C.md', 'note', '2026-11-23'), parent: '' },
];
const se = [
  { from: 'Claude-Notes/筆記/2026-11-24 例會進度.md', to: 'Claude-Notes/筆記/2026-11-10 例會.md' },     // day note -> its main note
  { from: 'Claude-Notes/知識庫/QLoRA.md', to: 'Claude-Notes/筆記/2026-11-23 C.md' },                    // 出自 [[…]]
  { from: 'Claude-Notes/筆記/2026-11-24 例會進度.md', to: 'Claude-Notes/知識庫/QLoRA.md' },             // a real link
];
const ss = W.stats({ notes: sn, edges: se, from: '2026-11-23', to: '2026-11-29', recentFrom: '2026-11-15' });
assert(ss.topLinked.map((t) => t.name).join() === 'QLoRA', 'top linked: day-note back-links and 知識庫 provenance links do not count');
const empty = W.stats({ notes: [], edges: [], from: '2026-11-16', to: '2026-11-22', recentFrom: '2026-10-24' });
assert(W.pushText(W.isoWeek('2026-11-16'), empty, null).title.includes('沒有新增') && W.pushText(W.isoWeek('2026-11-16'), empty, null).body === '排程正常運作中', 'nothing happened: still one push, saying the schedule runs');
