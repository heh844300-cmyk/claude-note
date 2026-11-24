// Related-note retrieval: finds the user's existing notes for a piece of text; respects excluded folders.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { createVault } = require('../lib/vault');
const { createRelated, terms } = require('../lib/related');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-rel-'));
const w = (rel, s) => { const f = path.join(dir, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
w('Claude-Notes/Claude Note.md', '---\ntitle: Claude Note\n---\n# Claude Note\n\n## 摘要\n我的筆記系統，AI 整理筆記並放進研究資料夾。\n\n## 組織\n研究/ 資料夾與總覽筆記。\n');
w('Claude-Notes/知識庫/CODE方法.md', '# CODE方法\n\n## 摘要\nCODE 是擷取、組織、提煉、表達四步驟。\n');
w('Claude-Notes/2026-11-01 煮咖啡.md', '# 煮咖啡\n\n## 摘要\n今天的筆記：手沖咖啡的水溫與研磨度，目前覺得筆記很好用。\n');
w('私人/日記.md', '# 日記\n\nClaude note 和 CODE 的擷取 組織 提煉 表達，我的私人想法。\n');
w('Claude-Notes/空白.md', '');
w('.trash/舊的 CODE.md', '# 舊的 CODE 擷取 組織 提煉 表達\n');
w('待辦總覽.md', '# 待辦總覽 Claude note CODE 擷取\n');

const CFG = { vault: dir, vaultExclude: ['私人'] };
const R = createRelated({ vault: createVault({ CFG }) });
const text = 'Claude note與BABS的比較依據CODE的定義\n目前C(擷取)：只靠我自己隨手寫的筆記\nO(組織):只用關聯圖\nD(提煉):agent做完了\nE(表達):完全沒有';
const t = terms(text);
assert(t.has('code') && t.has('claude') && t.has('擷取') && !t.has('note與babs'), 'Latin words split from CJK; CJK bigrams');
const hits = R.find(text);
const rels = hits.map((h) => h.rel);
assert(rels[0] === 'Claude-Notes/Claude Note.md' && rels[1] === 'Claude-Notes/知識庫/CODE方法.md', 'note named in the text first, then topic overlap: ' + rels.join(' | '));
assert(!rels.some((r) => r.startsWith('私人/') || r.includes('.trash') || r.includes('待辦總覽') || r.includes('空白')), 'excluded folder, trash, 待辦總覽 and empty notes never returned');
assert(!rels.includes('Claude-Notes/2026-11-01 煮咖啡.md'), 'note sharing only common words (筆記、目前) is filtered out');
assert(!R.find(text, { exclude: ['Claude-Notes/Claude Note.md'] }).some((h) => h.rel === 'Claude-Notes/Claude Note.md'), 'exclude (the note itself) works');
const { block } = R.contextBlock(text);
assert(block.includes('[[Claude-Notes/Claude Note|Claude Note]]') && block.includes('摘要：我的筆記系統') && block.includes('知識庫/ 資料夾裡已有的名詞筆記 ---\nCODE方法'), 'context block: exact links, summary, research names');
assert(!block.includes('私人想法'), 'excluded content never in the block');
assert(R.find('').length === 0 && R.find('完全不相關的內容 xyzzy').length === 0, 'nothing for unrelated text');
fs.rmSync(dir, { recursive: true, force: true });
