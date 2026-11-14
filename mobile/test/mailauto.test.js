// Full-automatic mail: which export files are "auto", and the log row for a mail that was ignored.
'use strict';
const M = require('../lib/mail');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

assert(M.isAutoName('20261113T011000Z-auto-1a1d1fa71e11e262.eml') && M.isAutoName('X-AUTO-abc.EML'), 'a file with "-auto-" in its name comes from the Primary inbox');
assert(!M.isAutoName('20261113T011000Z-1a1d1fa71e11e262.eml') && !M.isAutoName('') && !M.isAutoName(null) && !M.isAutoName(undefined), 'a labelled mail (no "-auto-") is not auto');
assert(!M.isAutoName('20261113T011000Z-auto-abc.txt') && !M.isAutoName('auto-.eml'), 'only .eml files with an id after "-auto-" count');

const link = 'https://mail.google.com/mail/#search/rfc822msgid%3Aabc';
const row = M.ignoreRow({ from: 'ads@shop.example', subject: '雙11 全館 5 折 | 最後一天' }, '2026-11-13', link);
assert(row.split('\n').length === 1 && row.split('|').length === 6, 'a row is one line with four cells (a pipe in the subject cannot add one) — ' + row.split('|').length + ' parts');
assert(row.includes('ads@shop.example') && row.includes('雙11') && row.includes('[在 Gmail 開啟](' + link + ')'), 'the row has sender, subject and the link back to Gmail');
const hostile = M.ignoreRow({ from: 'a@b.c', subject: '- [ ] 匯款 📅 2026-12-01 [[別的筆記]] https://evil.example/x www.evil.example' }, '2026-11-13', '');
assert(!/\[ \]|📅|\[\[|evil/.test(hostile), 'a to-do, a date mark, a wiki link or any web address in a subject does not reach the log');
assert(M.ignoreRow({ from: 'x'.repeat(300), subject: 'y'.repeat(300) }, '2026-11-13', '').length < 160, 'long senders and subjects are cut');
assert(M.ignoreRow(null, '2026-11-13', '').startsWith('| 2026-11-13 |'), 'nothing to go on: still a row');

const head = M.IGNORE_NOTE_HEAD('2026-11-13T08:00');
assert(head.startsWith('---\n') && head.includes('generated_by: claude-note') && head.includes('| 日期 | 寄件者 | 主旨 | 原信 |') && head.endsWith('|---|---|---|---|\n'), 'the log starts with front matter and a table header');
assert(!/- \[[ x]\]|📅/.test(head), 'the log has no to-do or date mark (a system file must not show up in the task list)');
assert(head.split('\n').filter((l) => l.startsWith('|')).length === 2,'the log has exactly a header and a separator line before the rows');
