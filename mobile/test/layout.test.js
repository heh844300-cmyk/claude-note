// Folder layout: user notes in 筆記/, concept notes in 知識庫/; migrating an older vault (top-level notes, 研究/).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const Y = require('../lib/layout');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const moved = new Set(['2026-11-10 報稅', 'claude note']);
const rw = (md) => Y.rewriteLinks(md, 'Claude-Notes', moved);

// link forms
assert(rw('[[Claude-Notes/研究/Tailscale|Tailscale]]').md === '[[Claude-Notes/知識庫/Tailscale|Tailscale]]', 'full research path with alias -> 知識庫');
assert(rw('見 [[研究/AI Agent|AI Agent]]').md === '見 [[知識庫/AI Agent|AI Agent]]', 'partial research path -> 知識庫');
assert(rw('[[Claude-Notes/2026-11-10 報稅|報稅]]').md === '[[Claude-Notes/筆記/2026-11-10 報稅|報稅]]', 'moved top-level note -> 筆記/');
assert(rw('[[Claude-Notes/2026-11-10 報稅.md#重點整理|x]]').md === '[[Claude-Notes/筆記/2026-11-10 報稅.md#重點整理|x]]', 'heading and .md kept');
assert(rw('![[claude-notes/Claude Note]]').md === '![[claude-notes/筆記/Claude Note]]', 'embed, case-insensitive folder and name');
assert(rw('[x](Claude-Notes/2026-11-10%20報稅.md)').md === '[x](Claude-Notes/%E7%AD%86%E8%A8%98/2026-11-10%20%E5%A0%B1%E7%A8%85.md)', 'markdown link with %20 rewritten and re-encoded');
assert(rw('[x](Claude-Notes/研究/A.md)').md === '[x](Claude-Notes/知識庫/A.md)', 'unencoded markdown link stays unencoded');
const untouched = '[[Claude-Notes/學習/微積分/大綱]] [[Claude-Notes/信件/某信]] [[Claude-Notes/別篇]] [[報稅]] [web](https://x.com/Claude-Notes/研究/a) [[研究方法]]';
const u = rw(untouched);
assert(u.n === 0 && u.md === untouched, 'other folders, notes not moved, bare names, URLs and 研究方法 untouched');
const crlf = '﻿# a\r\n[[Claude-Notes/研究/X]]\r\n';
assert(rw(crlf).md === '﻿# a\r\n[[Claude-Notes/知識庫/X]]\r\n', 'BOM and CRLF kept');
assert(Y.upgradeId('研究/X.md') === '知識庫/X.md' && Y.upgradeId('X.md') === 'X.md' && Y.upgradeId('研究方法.md') === '研究方法.md', 'old note id upgraded, others unchanged');

// migrating a whole vault
const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'cnlayout-'));
const data = path.join(vault, '..', path.basename(vault) + '-data');
const w = (rel, s) => { const p = path.join(vault, ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'utf8'); };
const r = (rel) => fs.readFileSync(path.join(vault, ...rel.split('/')), 'utf8');
const has = (rel) => fs.existsSync(path.join(vault, ...rel.split('/')));
w('Claude-Notes/2026-11-10 報稅.md', '﻿# 報稅\r\n見 [[Claude-Notes/研究/扣除額|扣除額]]\r\n');
w('Claude-Notes/Claude Note.md', '# Claude Note\n');
w('Claude-Notes/衝突.md', '# 舊的\n');
w('Claude-Notes/筆記/衝突.md', '# 已經在筆記裡\n');
w('Claude-Notes/研究/扣除額.md', '# 扣除額\n出自 [[Claude-Notes/2026-11-10 報稅|報稅]]，另見 [[Claude-Notes/衝突]]\n');
w('Claude-Notes/學習/微積分/大綱.md', '# 大綱\n[[Claude-Notes/研究/極限]]\n');
w('Claude-Notes/信件/某信.md', '# 信\n[[Claude-Notes/Claude Note]]\n');
w('待辦總覽.md', '- [[Claude-Notes/2026-11-10 報稅]]\n');
w('Claude-Notes/attachments/a.png', 'png');
w('.trash/舊.md', '[[Claude-Notes/研究/扣除額]]');
fs.mkdirSync(data, { recursive: true });
fs.writeFileSync(path.join(data, 'agent-jobs.json'), JSON.stringify([{ id: 'a', kind: 'fill', note: '研究/極限.md', src: 'Claude-Notes/研究/極限.md' }, { id: 'b', note: '2026-11-10 報稅.md' }]));
const now = new Date(2026, 10, 24, 9, 5);
const sum = Y.migrate({ vault, folder: 'Claude-Notes', dataRoot: data, now });

assert(has('Claude-Notes/知識庫/扣除額.md') && !has('Claude-Notes/研究'), '研究/ renamed to 知識庫/');
assert(has('Claude-Notes/筆記/2026-11-10 報稅.md') && has('Claude-Notes/筆記/Claude Note.md') && !has('Claude-Notes/2026-11-10 報稅.md'), 'top-level notes moved into 筆記/');
assert(r('Claude-Notes/衝突.md') === '# 舊的\n' && r('Claude-Notes/筆記/衝突.md') === '# 已經在筆記裡\n' && sum.skipped.includes('衝突.md'), 'name already taken in 筆記/: both files left as they are');
assert(has('Claude-Notes/attachments/a.png') && has('Claude-Notes/學習/微積分/大綱.md'), 'attachments and 學習/ stay in place');
assert(r('Claude-Notes/筆記/2026-11-10 報稅.md') === '﻿# 報稅\r\n見 [[Claude-Notes/知識庫/扣除額|扣除額]]\r\n', 'links in a moved note rewritten, BOM and CRLF kept');
assert(r('Claude-Notes/知識庫/扣除額.md') === '# 扣除額\n出自 [[Claude-Notes/筆記/2026-11-10 報稅|報稅]]，另見 [[Claude-Notes/衝突]]\n', 'link to a moved note rewritten, link to the skipped one kept');
assert(r('Claude-Notes/學習/微積分/大綱.md').includes('[[Claude-Notes/知識庫/極限]]') && r('Claude-Notes/信件/某信.md').includes('[[Claude-Notes/筆記/Claude Note]]') && r('待辦總覽.md').includes('[[Claude-Notes/筆記/2026-11-10 報稅]]'), 'links in 學習/, 信件/ and the vault root rewritten');
assert(r('.trash/舊.md') === '[[Claude-Notes/研究/扣除額]]', '.trash is not touched');
const bk = path.join(vault, '.trash', '版面調整前 2026-11-24 09-05');
assert(fs.readFileSync(path.join(bk, 'Claude-Notes', '筆記', '2026-11-10 報稅.md'), 'utf8') === '﻿# 報稅\r\n見 [[Claude-Notes/研究/扣除額|扣除額]]\r\n' && fs.existsSync(path.join(bk, '待辦總覽.md')), 'every rewritten file backed up with its old bytes');
assert(sum.files === 5 && sum.links === 5, 'counts: ' + sum.files + ' files, ' + sum.links + ' links');
const jobs = JSON.parse(fs.readFileSync(path.join(data, 'agent-jobs.json'), 'utf8'));
assert(jobs[0].note === '知識庫/極限.md' && jobs[0].src === 'Claude-Notes/知識庫/極限.md' && jobs[1].note === '2026-11-10 報稅.md', 'Agent job ids and source paths upgraded');

// second start: the marker stops it
w('Claude-Notes/研究/新.md', '# 新\n');
assert(Y.migrate({ vault, folder: 'Claude-Notes', dataRoot: data, now }) === null && has('Claude-Notes/研究/新.md'), 'marker present: nothing runs again');

// crash after the moves (no marker): a rerun still fixes the links
const v2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cnlayout2-')), d2 = v2 + '-data';
fs.mkdirSync(path.join(v2, 'Claude-Notes', '筆記'), { recursive: true }); fs.mkdirSync(path.join(v2, 'Claude-Notes', '知識庫'), { recursive: true });
fs.writeFileSync(path.join(v2, 'Claude-Notes', '筆記', 'A.md'), '[[Claude-Notes/B]]');
fs.writeFileSync(path.join(v2, 'Claude-Notes', '筆記', 'B.md'), '[[Claude-Notes/研究/C]]');
const s2 = Y.migrate({ vault: v2, folder: 'Claude-Notes', dataRoot: d2, now });
assert(fs.readFileSync(path.join(v2, 'Claude-Notes', '筆記', 'A.md'), 'utf8') === '[[Claude-Notes/筆記/B]]' && fs.readFileSync(path.join(v2, 'Claude-Notes', '筆記', 'B.md'), 'utf8') === '[[Claude-Notes/知識庫/C]]' && s2.notes === 0, 'rerun after a crash: files already moved, links still fixed');

// a brand-new install: nothing to move, the marker is written
const v3 = fs.mkdtempSync(path.join(os.tmpdir(), 'cnlayout3-')), d3 = v3 + '-data';
const s3 = Y.migrate({ vault: v3, folder: 'Claude-Notes', dataRoot: d3, now });
assert(s3.notes === 0 && s3.files === 0 && fs.existsSync(path.join(d3, 'layout.json')), 'empty vault: nothing moved, marker written');

for (const d of [vault, data, v2, d2, v3, d3]) fs.rmSync(d, { recursive: true, force: true });
