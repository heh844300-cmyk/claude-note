// Answering a note's 待釐清問題 / 🙋 to-dos, written back as "💬 我的回答：" sub-items.
'use strict';
const A = require('../lib/answers');
const L = require('../lib/library');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const md = '﻿---\r\ntitle: x\r\n---\r\n\r\n# 比對\r\n\r\n## 待辦事項\r\n- [ ] 確認系統內容\r\n- [x] 整理框架\r\n- [ ] 自己決定的事\r\n- [ ] 普通待辦\r\n\r\n## 待釐清問題\r\n- 系統是什麼？\r\n- 比對哪個版本？\r\n  - 💬 我的回答：原書版本\r\n\r\n## 相關概念\r\n- [[PARA]]：說明\r\n\r\n## Agent 研究結果\r\n\r\n### 待辦事項\r\n- 🙋 需要你｜確認系統內容：只有你知道\r\n- 🙋 需要你｜自己決定的事：原因\r\n\r\n---\r\n\r\n<details><summary>Original notes</summary>\r\n\r\n- 不是問題\r\n\r\n</details>\r\n';
const items = A.listItems(md);
assert(items.map((x) => x.kind + ':' + x.text).join('|') === 'q:系統是什麼？|q:比對哪個版本？|t:確認系統內容|t:自己決定的事', 'questions + 🙋 to-dos only (not 相關概念 / footer / plain to-dos)');
assert(items[1].answer === '原書版本' && items[0].answer === '', 'existing answer read');

const r = A.applyAnswers(md, [
  { line: items[0].line, raw: items[0].raw, answer: '就是 [[Claude Note]]\n第二行' },
  { line: items[1].line, raw: items[1].raw, answer: '' },
  { line: items[2].line, raw: items[2].raw, answer: '我的筆記系統，見 [[Claude Note]]' },
]);
assert(r.changed === 3 && !r.stale.length, 'three changes');
assert(r.md.startsWith('﻿') && !/[^\r]\n/.test(r.md), 'BOM and CRLF kept');
assert(r.md.includes('\r\n- 系統是什麼？\r\n  - 💬 我的回答：就是 [[Claude Note]] 第二行\r\n- 比對哪個版本？\r\n\r\n'), 'answer added under the question (one line), empty answer removed');
assert(r.md.includes('\r\n- [ ] 確認系統內容\r\n  - 💬 我的回答：我的筆記系統，見 [[Claude Note]]\r\n- [x] 整理框架'), 'answer under the to-do');
const again = A.listItems(r.md);
assert(again.find((x) => x.text === '系統是什麼？').answer.startsWith('就是') && !again.find((x) => x.text === '比對哪個版本？').answer, 'round trip');
const upd = A.applyAnswers(r.md, [{ line: again[0].line, raw: again[0].raw, answer: '改過的回答' }]);
assert(upd.md.includes('- 系統是什麼？\r\n  - 💬 我的回答：改過的回答\r\n- 比對') && upd.md.split('💬').length === r.md.split('💬').length, 'editing replaces, never duplicates');
assert(A.applyAnswers(md, [{ line: items[0].line, raw: '- 別的', answer: 'x' }]).stale.length === 1, 'stale line refused');
assert(A.answerLinks(r.md).join() === 'Claude Note', 'links in answers, deduped');
const hand = md.replace('- 系統是什麼？\r\n', '- 系統是什麼？\r\n  * 💬 我的回答: 手寫的\r\n');
assert(A.listItems(hand)[0].answer === '手寫的', 'answer typed by hand in Obsidian (other bullet / colon) is read');

// renderMain: a unit used twice -> second time only a pointer; a note listed once in 這次整理到的筆記
const units = [{ id: 'U1', title: 'BASB', summary: 'BASB 摘要。', body: 'x' }];
const res = new Map([['U1', { action: 'append', rel: 'Claude-Notes/研究/BASB.md' }]]);
const out = L.renderMain('答案：{{U1}}\n再一次：{{U1}}', units, res).text;
assert(out.split('BASB 摘要。').length === 2 && out.includes('再一次：[[Claude-Notes/研究/BASB|BASB]]'), 'unit text rendered once');
const two = L.renderMain('{{U1}} {{U2}}', [...units, { id: 'U2', title: 'B2', summary: 's', body: 'y' }],
  new Map([['U1', { action: 'append', rel: 'Claude-Notes/研究/BASB.md' }], ['U2', { action: 'link', rel: 'Claude-Notes/研究/BASB.md' }]]));
assert(two.text.split('研究/BASB|').length === 4 && !two.text.includes('🔗') && two.counts.link === 0, 'same note not listed as both ➕ and 🔗');
