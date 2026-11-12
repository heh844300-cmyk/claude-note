// Mail kinds: receipt / newsletter / normal, the receipt line (checked against the mail, sanitized), and hostile input.
'use strict';
const M = require('../lib/mail');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const eml = (lines) => Buffer.from(lines.join('\r\n'), 'utf8');

// ---------- classify ----------
const mk = (subject, text, extra = {}) => ({ subject, text, isReply: false, bulk: false, ...extra });
assert(M.classify(mk('您的訂單收據', '總金額 NT$1,280 元')) === 'receipt', 'a receipt cue in the subject and an amount in the body: receipt');
assert(M.classify(mk('Your receipt from Acme', 'Total: $12.50')) === 'receipt', 'English receipt: receipt');
assert(M.classify(mk('您的訂單收據', '感謝您的購買')) === 'mail', 'a receipt cue without any amount is a normal mail');
assert(M.classify(mk('下週開會', '預算 NT$5,000 元')) === 'mail', 'an amount without a receipt cue is a normal mail');
assert(M.classify(mk('Re: 發票問題', '金額 NT$300', { isReply: true })) === 'mail', 'a reply about a receipt is a normal mail, not a new receipt');
assert(M.classify(mk('Weekly digest', 'news', { bulk: true })) === 'newsletter', 'list headers: newsletter');
assert(M.classify(mk('Your invoice', 'Total $40', { bulk: true })) === 'receipt', 'a receipt sent through a list is still a receipt');
assert(M.classify(null) === 'mail' && M.classify({}) === 'mail', 'nothing to go on: normal mail');

// ---------- bulk flag from the headers ----------
const base = ['From: a@x.com', 'To: me@x.com', 'Subject: hi', 'Date: Fri, 13 Nov 2026 08:00:00 +0800', 'Message-ID: <1@x>', 'Content-Type: text/plain; charset=utf-8', ''];
const plain = ['Content-Type: text/plain; charset=utf-8', ''];
const hdr = (extra) => eml(['From: a@x.com', 'To: me@x.com', 'Subject: hi', 'Date: Fri, 13 Nov 2026 08:00:00 +0800', 'Message-ID: <1@x>', ...extra, 'Content-Type: text/plain; charset=utf-8', '', 'hello']);
assert(M.parseEml(hdr(['List-Unsubscribe: <mailto:u@x.com>'])).bulk === true, 'List-Unsubscribe: bulk');
assert(M.parseEml(hdr(['List-Id: <news.x.com>'])).bulk === true, 'List-Id: bulk');
assert(M.parseEml(hdr(['Precedence: bulk'])).bulk === true, 'Precedence: bulk');
assert(M.parseEml(hdr([])).bulk === false && M.parseEml(hdr(['Precedence: first-class'])).bulk === false, 'ordinary mail: not bulk');

// ---------- the receipt line ----------
const mail = { text: '感謝購買。商品：藍牙耳機。總計 NT$1,280 元。信用卡 4111 1111 1111 1111', subject: '訂單收據', from: { name: '小店', address: 'shop@x.com' } };
let r = M.parseReceipt('商家：小店\n金額：NT$1,280\n用途：藍牙耳機', mail);
assert(r.merchant === '小店' && r.amount === 'NT$1,280' && r.purpose === '藍牙耳機', 'the three lines are read');
r = M.parseReceipt('商家：小店\n金額：NT$9,999\n用途：藍牙耳機', mail);
assert(r.amount === 'NT$1,280', 'an amount that is not in the mail is replaced by the one the mail has');
r = M.parseReceipt('', mail);
assert(r.merchant === '小店' && r.amount === 'NT$1,280' && r.purpose === '訂單收據', 'no AI answer: sender, the first amount in the mail and the subject');
r = M.parseReceipt('商家：x\n金額：未知\n用途：y', { text: '沒有金額', subject: 's', from: { name: '', address: 'a@b.c' } });
assert(r.amount === '未確認', 'no amount anywhere: marked as not confirmed, never guessed');
r = M.parseReceipt('商家：a | b\n[[惡意]] - [ ] 做事 📅 2026-12-01\n金額：NT$1,280\n用途：x | y [連結](http://evil.example) 📅 2026-12-01 - [ ] todo', mail);
const row = M.receiptRow(r, '2026-11-13', 'https://mail.google.com/mail/#search/rfc822msgid%3Aabc');
assert(row.split('\n').length === 1 && row.split('|').length === 7, 'pipes and newlines in a field cannot add cells or lines (' + row.split('|').length + ' parts)');
assert(!/\[ \]|📅|\[\[|evil/.test(row.replace(/\(https:\/\/mail\.google\.com[^)]*\)/, '')), 'a to-do, a date mark, a wiki link or a web link in a field does not reach the row');
assert(M.receiptRow({ merchant: 'a'.repeat(200), amount: '1', purpose: 'p' }, '2026-11-13', '').length < 140, 'long fields are cut');

// ---------- a row from a draft the user may have edited ----------
const fallback = { merchant: '小店', amount: 'NT$1,280', purpose: '耳機' };
const good = '| 2026-11-13 | 小店 | NT$1,280 | 耳機 | [在 Gmail 開啟](https://mail.google.com/mail/#search/x) |';
assert(M.checkRow(good, fallback, '2026-11-13', '') === good, 'a well-formed row is kept as it is');
assert(M.checkRow('# 一篇筆記\n\n- [ ] 做事', fallback, '2026-11-13', '').startsWith('| 2026-11-13 | 小店 |'), 'a whole note in place of a row: the row is rebuilt from the fields');
assert(M.checkRow('| a | b | c |', fallback, '2026-11-13', '').split('|').length === 7, 'a row with the wrong number of cells: rebuilt');
assert(!/evil/.test(M.checkRow('| 2026-11-13 | x | 1 | y | [點我](http://evil.example) |', fallback, '2026-11-13', '')), 'a row with a link to somewhere else: rebuilt without it');
assert(!/📅|\[ \]/.test(M.checkRow('| 2026-11-13 | x 📅 2026-12-01 | 1 | y | |', fallback, '2026-11-13', '')), 'a row with a date mark: rebuilt without it');
assert(M.checkRow('line one\nline two', fallback, '2026-11-13', '').split('\n').length === 1, 'whatever comes in, one line comes out');

// ---------- the shared note ----------
const head = M.RECEIPT_NOTE_HEAD('2026-11-13T08:00');
assert(head.startsWith('---\n') && head.includes('generated_by: claude-note') && head.includes('| 日期 | 商家 | 金額 | 用途 | 原信 |') && head.endsWith('|---|---|---|---|---|\n'), 'the note starts with front matter and a table header, ready for rows');
assert(!/- \[[ x]\]|📅/.test(head), 'the shared note has no to-do or date mark (a system file must not show up in the task list)');

// ---------- the prompt ----------
const p = M.RECEIPT_PROMPT('素材');
assert(/忽略/.test(p) && /商家：/.test(p) && /金額：/.test(p) && /用途：/.test(p) && /信用卡號/.test(p), 'the prompt treats the mail as data, asks for three lines, and says not to copy card numbers');

// ---------- the secretary's triage line ----------
assert(M.triageOf('## 摘要\n分流：要回覆\n教授問你能不能出席。') === '要回覆', 'triage: the line in the summary is read');
assert(M.triageOf('## 摘要\n分流:只需知道') === '只需知道' && M.triageOf('分流： 可以忽略 ') === '可以忽略', 'triage: a half-width colon and spaces are fine');
assert(M.triageOf('分流：非常重要') === '' && M.triageOf('分流：要回覆，立刻！') === '' && M.triageOf('沒有這一行') === '' && M.triageOf('') === '' && M.triageOf(null) === '', 'triage: only the three known words count, anything else is no triage');
assert(M.TRIAGE.length === 3 && /分流：要回覆/.test(M.MAIL_RULES('now')), 'triage: the mail rules ask for the line');
