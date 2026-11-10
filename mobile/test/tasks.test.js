// To-do list: parsing checkboxes across a note, and ticking one line safely.
'use strict';
const T = require('../lib/tasks');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const md = '﻿---\r\ntitle: x\r\ntags:\r\n  - [ ] not a task in frontmatter\r\n---\r\n\r\n# 標題\r\n\r\n## 待辦事項\r\n- [ ] 繳交報告 📅 2026-11-20\r\n  - [x] 子項目 ✅ 2026-11-09\r\n* [ ] 買牛奶\r\n1. [ ] 編號項目\r\n- [ ]\r\n\r\n```\r\n- [ ] 程式碼裡的不算\r\n```\r\n';
const ts = T.parseTasks(md);
assert(ts.length === 4, 'four tasks (frontmatter, code block and empty box skipped)');
assert(ts[0].text === '繳交報告 📅 2026-11-20' && ts[0].due === '2026-11-20' && !ts[0].done && ts[0].heading === '待辦事項', 'due date + heading');
assert(ts[1].done && ts[1].doneAt === '2026-11-09', 'done task with done date');
assert(T.cleanText(ts[0].text) === '繳交報告', 'display text drops date markers');

const r = T.toggleTask(md, ts[0].line, ts[0].raw, true, '2026-11-10');
assert(r && r.md.startsWith('﻿') && r.md.includes('\r\n- [x] 繳交報告 📅 2026-11-20 ✅ 2026-11-10\r\n') && !/[^\r]\n/.test(r.md), 'tick adds ✅ date, keeps BOM and CRLF');
assert(r.md.replace('- [x] 繳交報告 📅 2026-11-20 ✅ 2026-11-10', '- [ ] 繳交報告 📅 2026-11-20') === md, 'nothing else changed');
const back = T.toggleTask(r.md, ts[0].line, r.raw, false, '2026-11-10');
assert(back && back.md === md, 'untick restores the original line');
const sub = T.toggleTask(md, ts[1].line, ts[1].raw, false, '2026-11-10');
assert(sub && sub.md.includes('\r\n  - [ ] 子項目\r\n'), 'untick keeps indent, drops ✅');
assert(T.toggleTask(md, ts[0].line, '- [ ] 別的內容', true, '2026-11-10') === null, 'stale line refused');
assert(T.toggleTask(md, 999, ts[0].raw, true, '2026-11-10') === null, 'bad line refused');
assert(T.toggleTask(md, 0, '﻿---', true, '2026-11-10') === null, 'non-task line refused');
