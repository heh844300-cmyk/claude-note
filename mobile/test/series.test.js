// Tracked notes: schedule maths, frontmatter, the main note's index, day notes, reports, and that the system
// sections survive 更新 (refresh.regions / preserve), term splitting and the Agent rewrite.
'use strict';
const S = require('../lib/series');
const refresh = require('../lib/refresh');
const split = require('../lib/split');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

// days / times
assert(S.parseDays('1-5').join() === '1,2,3,4,5' && S.parseDays('1,3,5').join() === '1,3,5' && S.parseDays('1-3,6').join() === '1,2,3,6', 'days parsed');
assert(S.formatDays([1, 2, 3, 4, 5]) === '1-5' && S.formatDays([1, 3, 5]) === '1,3,5' && S.formatDays([1, 2, 3, 6]) === '1-3,6', 'days formatted');
assert(S.daysLabel([1, 2, 3, 4, 5]) === '週一～五' && S.daysLabel([1, 3, 5]) === '週一、三、五', 'days label');
assert(S.normTime('9:05') === '09:05' && S.normTime('12：10') === '12:10' && S.normTime('25:00') === '', 'time normalised');

const inf = S.info({ series: 'true', title: '例會報告準備', series_name: '例會進度', series_days: '1-5', series_time: '12:10', series_start: '2026-11-16' }, 'a.md');
assert(inf && inf.name === '例會進度' && inf.time === '12:10' && inf.lead === 30 && inf.days.length === 5, 'info read from frontmatter');
assert(S.info({ title: 'x' }, 'x.md') === null, 'not tracked -> null');

// report window: 30 minutes before the meeting, weekdays only, not before the start date
const at = (s) => new Date(s);
assert(!S.dueReport(inf, at('2026-11-13T11:50:00')), 'before the start date: nothing');
assert(!S.dueReport(inf, at('2026-11-16T11:39:00')), '31 min before: not yet');
assert(S.dueReport(inf, at('2026-11-16T11:40:00')).date === '2026-11-16', '30 min before: due');
assert(!S.dueReport(inf, at('2026-11-16T12:10:00')), 'meeting started: skipped');
assert(!S.dueReport(inf, at('2026-11-21T11:50:00')), 'Saturday: nothing');
assert(S.prevMeetingDay(inf.days, '2026-11-16') === '2026-11-13' && S.prevMeetingDay(inf.days, '2026-11-18') === '2026-11-17', 'previous meeting day: Monday -> Friday');

// frontmatter: set, replace, remove (lists untouched)
const fm0 = '---\ntitle: "例會"\nexpires: 2026-11-20T23:59\ntags:\n  - "a"\n---\n\n# 例會\n';
const fm1 = S.setFrontmatter(fm0, { series: 'true', series_name: '例會進度', series_time: '12:10', expires: null });
assert(fm1 === '---\ntitle: "例會"\ntags:\n  - "a"\nseries: true\nseries_name: "例會進度"\nseries_time: "12:10"\n---\n\n# 例會\n', 'frontmatter set and expires removed');
assert(S.setFrontmatter(fm1, { series: null, series_name: null, series_time: null }) === '---\ntitle: "例會"\ntags:\n  - "a"\n---\n\n# 例會\n', 'frontmatter keys removed again');
assert(S.setFrontmatter('# x\n', { series: 'true' }) === '---\nseries: true\n---\n# x\n', 'frontmatter created when missing');

// main note index: newest first, before the Agent section, no duplicates
const main = '---\ntitle: x\n---\n\n# 例會\n\n## 摘要\n每天報告。\n\n## Agent 研究結果\n\n結果\n\n---\n\n<details><summary>Original notes</summary>\n\n原文\n\n</details>\n';
let m1 = S.addEntryLink(main, { target: 'Claude-Notes/2026-11-16 例會進度', label: '2026-11-16（一）', summary: '架好前後端' });
m1 = S.addEntryLink(m1, { target: 'Claude-Notes/2026-11-17 例會進度', label: '2026-11-17（二）', summary: '學索引' });
const m2 = S.addEntryLink(m1, { target: 'Claude-Notes/2026-11-17 例會進度', label: '2026-11-17（二）', summary: '又一次' });
assert(m1.includes('## 每日紀錄\n\n- [[Claude-Notes/2026-11-17 例會進度|2026-11-17（二）]]：學索引\n- [[Claude-Notes/2026-11-16 例會進度|2026-11-16（一）]]：架好前後端\n\n## Agent 研究結果'), 'index: newest first, before Agent results');
assert(m2 === m1, 'index: same day not listed twice');
const m3 = S.addEntryLink(m1, { target: 'Claude-Notes/2026-11-17 例會進度', label: '2026-11-17（二）', summary: '學索引、優化查詢' }, true);
assert(m3.includes('2026-11-17（二）]]：學索引、優化查詢\n- [[Claude-Notes/2026-11-16') && !m3.includes('：學索引\n'), 'index: replace updates the line in place');

// the index is outside what 更新 and term splitting touch, and survives an Agent rewrite
const r = refresh.regions(m1);
assert(!r.body.includes('每日紀錄') && r.tail.startsWith('\n## 每日紀錄'), '更新: index is in the tail, not the body');
assert(!m1.slice(split.splittableRegion(m1).start, split.splittableRegion(m1).end).includes('每日紀錄'), 'term split: index not in the splittable region');
const agentRewrite = (md) => md.replace(/\n## Agent 研究結果\n[\s\S]*?(?=\n## |\n---\n\n<details>|\n<details>|$)/, '\n');
assert(agentRewrite(m1).includes('## 每日紀錄\n\n- [[Claude-Notes/2026-11-17'), 'Agent rewrite keeps the index');
const replaced = refresh.replaceBody(m1, '## 摘要\n新的摘要。');
assert(replaced.includes('新的摘要') && replaced.includes('- [[Claude-Notes/2026-11-16 例會進度|2026-11-16（一）]]'), '更新 upload keeps the index');

// day notes: created with the back-link, a later input appended, the report on top (replaced, not duplicated)
let day = S.dayNote({ title: '2026-11-17 例會進度', created: '2026-11-17T20:00', mainFile: '2026-11-10 例會.md', mainLink: 'Claude-Notes/2026-11-10 例會', mainTitle: '例會', tags: ['工作'], model: 'haiku' });
assert(day.includes('series_of: "2026-11-10 例會.md"') && day.includes('# 2026-11-17 例會進度\n\n> 📌 接續 [[Claude-Notes/2026-11-10 例會|例會]]'), 'day note: frontmatter + back-link');
day += '\n## 摘要\n學索引。\n\n## 待辦事項\n- [ ] 建索引\n\n---\n\n<details><summary>Original notes</summary>\n\n今天學索引\n\n</details>\n';
const day2 = S.appendToDay(day, '## 摘要\n又優化查詢。\n\n### 細節\nx', '21:30', '\n<details><summary>Original notes（21:30）</summary>\n\n又優化\n\n</details>\n');
assert(day2.includes('## 補充（21:30）\n\n### 摘要\n又優化查詢。\n\n#### 細節') && day2.indexOf('補充（21:30）') < day2.indexOf('<details><summary>Original notes</summary>') && day2.trim().endsWith('</details>') && day2.includes('Original notes（21:30）'), 'same day: appended under 補充, headings demoted, footer kept last');
const rep1 = S.upsertReport(day2, '### 已完成\n- 架好');
const rep2 = S.upsertReport(rep1, '### 已完成\n- 新的');
assert(rep1.indexOf('## 例會報告') > rep1.indexOf('> 📌') && rep1.indexOf('## 例會報告') < rep1.indexOf('## 摘要'), 'report placed right after the back-link');
assert(rep2.includes('- 新的') && !rep2.includes('- 架好') && rep2.split('## 例會報告').length === 2 && rep2.includes('## 摘要\n學索引'), 'report replaced, rest untouched');
assert(refresh.regions(day).head.includes('> 📌 接續'), 'the back-link stays in the head on 更新');

// what the AI sees
const t = S.noteText(rep2, 5000);
assert(!t.includes('series_of') && !t.includes('<details>') && !t.includes('📌') && !t.includes('例會報告') && !t.includes('- 新的') && t.includes('學索引') && t.includes('補充（21:30）'), 'note text: no frontmatter / footer / back-link / old report');
assert(!S.noteText(m1, 5000).includes('每日紀錄') && !S.noteText(m1, 5000).includes('Agent 研究結果'), 'note text: main note without index and Agent results');
const blk = S.organizerBlock([{ info: inf, md: m1, entries: [{ date: '2026-11-17', md: day }] }], null);
assert(blk.includes('SERIES: <主筆記標題') && blk.includes('主筆記：例會報告準備（週一～五 12:10）') && blk.includes('2026-11-17（二）的紀錄'), 'organizer block: asks for SERIES, lists main note and entries');
assert(S.organizerBlock([{ info: inf, md: m1, entries: [] }], '例會報告準備').includes('使用者指定') && !S.organizerBlock([{ info: inf, md: m1, entries: [] }], '例會報告準備').includes('SERIES:'), 'organizer block: fixed series needs no SERIES line');
assert(S.organizerBlock([], null) === '', 'no tracked notes -> nothing added');

const pr = S.reportPrompt({ info: inf, mainMd: m1, entries: [{ date: '2026-11-17', md: day }], today: '2026-11-18', prev: '2026-11-17' });
assert(pr.includes('今天是 2026-11-18（星期三）') && pr.includes('上一次例會是 2026-11-17（星期二）') && pr.includes('2026-11-17（星期二）的紀錄'), 'report prompt: dates and entries');
const pp = S.parseReport('```\nSHORT: 架好前後端，今天學索引\n### 已完成\n- 架好\n### 接下來要做什麼\n- 建索引\n```');
assert(pp && pp.short === '架好前後端，今天學索引' && pp.body.startsWith('### 已完成') && !pp.body.includes('SHORT'), 'report parsed');
assert(S.parseReport('抱歉我無法') === null, 'unusable answer -> null');
assert(S.fallbackReport([{ date: '2026-11-17', md: day }], ['建索引']).includes('- 2026-11-17：學索引。') , 'fallback report from the notes');
