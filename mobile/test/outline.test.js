// Outline suggestions from new materials: chapter ids, locks, parsing, applying, supplementary lessons.
'use strict';
const O = require('../lib/outline');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const ch = (n, title, extra) => ({ n, title, points: ['p' + n], source: '', status: 'todo', ...extra });
const topic = () => ({ title: '網路', chapters: [ch(1, '網路初探', { status: 'done' }), ch(2, '實體層'), ch(5, '資料鏈結層'), ch(3, '網路層')],
  levels: { 3: { level: 3 } }, wrong: [], rules: '' });

// ids: never reused, orphaned lesson files count too
const t = topic();
assert(O.usedMax(t) === 5 && O.usedMax(t, [7]) === 7, 'highest used id includes orphaned lesson files');
const a = O.idAllocator(t, [7]);
assert(a.next() === 8 && a.next() === 9 && t.nextChapter === 10, 'new ids go past every used id');
t.chapters = t.chapters.filter((c) => c.n !== 5);  // chapter 5 merged away
assert(O.idAllocator(t).next() === 10, 'an id removed by a merge is not handed out again');

// locks: anything pointing at a chapter
const t2 = { ...topic(), wrong: [{ chapter: 2 }] };
t2.chapters[2].note = '資料鏈結層.md';
const lk = O.lockedIds(t2, [3]);
assert(lk.has(1) && lk.has(2) && lk.has(5) && lk.has(3) && lk.size === 4, 'locked: done, wrong answer, linked note, lesson file / level');
assert(O.lockedIds(topic()).size === 2 && !O.lockedIds(topic()).has(2), 'untouched chapters stay free');

// prompt
const p = O.reviewPrompt(topic(), { locked: O.lockedIds(topic()), materialsText: '--- 講義.txt\nVLAN', newNames: ['講義.txt'], all: false });
assert(p.includes('[代號 5] 第3章「資料鏈結層」') && p.includes('[代號 1] 第1章「網路初探」（🔒 已上過）') && p.includes('講義.txt') && p.includes('一律忽略') && p.includes('=== CHANGE ==='), 'prompt lists ids, positions, locks, materials and the data note');
assert(O.reviewPrompt({ ...topic(), rules: '每章不超過 3 個重點' }, { locked: new Set(), all: true }).includes('每章不超過 3 個重點'), 'topic rules in the prompt');

// parsing
const out = `好的。
=== CHANGE ===
TYPE: ADD
CHAPTER: 5
TITLE: 第4章：VLAN 與交換器
POINTS: VLAN 標籤；Trunk
SOURCE: 講義 p.30
REASON: 教材新增
=== CHANGE ===
TYPE: POINTS
CHAPTER: 代號 1
POINTS: 網路拓撲；頻寬延遲積
=== CHANGE ===
TYPE: EDIT
CHAPTER: 1
TITLE: 網路概論
=== CHANGE ===
TYPE: MOVE
CHAPTER: 3
AFTER: 0
=== CHANGE ===
TYPE: MERGE
CHAPTER: 2
INTO: 5
=== CHANGE ===
TYPE: CONFLICT
CHAPTER: 3
OLD: IPv4 位址 64 位元
NEW: IPv4 位址 32 位元
SOURCE: 課本 2.1
=== CHANGE ===
TYPE: SHRUG
CHAPTER: 1`;
const parsed = O.parseSuggestions(out);
assert(parsed.length === 6 && parsed[0].title === 'VLAN 與交換器' && parsed[0].chapter === 5 && parsed[0].points.join() === 'VLAN 標籤,Trunk' && parsed[1].chapter === 1, 'blocks parsed; "第4章" prefix and "代號" stripped; unknown types dropped');
assert(parsed[3].after === 0 && parsed[4].into === 5 && parsed[5].new === 'IPv4 位址 32 位元', 'MOVE / MERGE / CONFLICT fields');
assert(O.parseSuggestions('NONE').length === 0 && O.parseSuggestions('').length === 0, 'NONE / empty -> no suggestions');
let k = 0;
const items = O.toItems(parsed, topic().chapters, O.lockedIds(topic()), () => 'o' + ++k);
assert(items[4].labels[2] === '實體層' && items[4].labels[5] === '資料鏈結層' && items[0].labels[5] === '資料鏈結層', 'items keep the titles of the chapters they name');
assert(items[2].blocked.includes('已經上過') && items[3].blocked.includes('已經上過') && !items[0].blocked && !items[1].blocked && !items[4].blocked && !items[5].blocked, 'studied chapters: rename / move refused, points and conflicts allowed');

// applying
let nid = 20;
const r = O.applySuggestions(topic().chapters, items, { locked: O.lockedIds(topic()), newId: () => nid++ });
assert(r.chapters.map((c) => c.n).join() === '1,5,20,3' && r.chapters[2].title === 'VLAN 與交換器' && r.chapters[2].status === 'todo', 'ADD placed after its chapter with a new id; MERGE removed chapter 2');
assert(r.chapters[0].points.join() === 'p1,網路拓撲,頻寬延遲積' && r.chapters[0].fresh.join() === '網路拓撲,頻寬延遲積' && r.chapters[0].title === '網路初探', 'studied chapter gains points marked fresh, title kept');
assert(r.chapters[1].points.join() === 'p5,p2' && !r.chapters[1].fresh, 'merged points land in the target (not studied: nothing to supplement)');
assert(r.chapters[3].points.some((x) => x.includes('32 位元') && x.includes('64 位元')) && r.chapters[3].fresh.length === 1 && r.chapters[3].source === '課本 2.1', 'conflict recorded on a studied chapter, marked fresh');
assert(r.applied.join() === 'o1,o2,o5,o6' && r.skipped.map((x) => x.id).join() === 'o3,o4' && r.changes.length === 4 && r.changes[0] === '新增章節「VLAN 與交換器」', 'applied / skipped / change log');
assert(topic().chapters[0].points.length === 1, 'input chapters not mutated');

// locks re-checked when applying: the chapter was started after the review
const late = O.applySuggestions(topic().chapters, [{ id: 'x', type: 'EDIT', chapter: 2, title: '新標題', points: [] }], { locked: new Set([2]), newId: () => 99 });
assert(late.applied.length === 0 && late.skipped[0].reason.includes('已經上過') && late.chapters[1].title === '實體層', 'a chapter studied since the review is not renamed');
const gone = O.applySuggestions(topic().chapters, [{ id: 'y', type: 'POINTS', chapter: 9, points: ['x'] }], { locked: new Set(), newId: () => 99 });
assert(gone.skipped[0].reason.includes('不在大綱'), 'suggestion for a removed chapter is skipped');
const first = O.applySuggestions(topic().chapters, [{ id: 'z', type: 'ADD', chapter: 0, title: '導論', points: [] }, { id: 'w', type: 'ADD', chapter: null, title: '網路初探', points: [] }], { locked: new Set(), newId: () => 30 });
assert(first.chapters[0].n === 30 && first.skipped[0].reason.includes('同名'), 'ADD at the front; duplicate title refused');
const dupPts = O.applySuggestions(topic().chapters, [{ id: 'q', type: 'POINTS', chapter: 2, points: ['P2'] }], { locked: new Set(), newId: () => 1 });
assert(dupPts.skipped[0].reason.includes('已經在大綱'), 'points already there are not added twice');

// history capped
let log = [];
for (let i = 0; i < 60; i++) log = O.logEntry(log, { at: String(i), changes: ['x'] });
assert(log.length === O.LOG_MAX && log[0].at === '10', 'adjustment log keeps the newest entries');

// supplementary lesson
const sc = { ...topic().chapters[0], fresh: ['網路拓撲', '新教材的說法：A（原本：B）'] };
const sp = O.supplementPrompt({ ...topic(), chapters: [sc] }, sc, { lesson: '原本的內容', materialsText: '教材', web: false });
assert(sp.includes('- 網路拓撲') && sp.includes('原本的內容') && sp.includes('不要重講') && sp.includes('一律忽略') && sp.includes('第 1 章「網路初探」'), 'supplement prompt: only the new points, with the old lesson');
