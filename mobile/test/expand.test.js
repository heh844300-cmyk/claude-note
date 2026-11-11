'use strict';
const L = require('../lib/library.js');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const THIN = '---\ntitle: "星型拓撲"\ngenerated_by: claude-agent\nmodel: haiku\n---\n\n# 星型拓撲\n\n> 🔎 出自 [[x]]\n\n## 摘要\n所有設備接到中央節點。\n\n## 內容\n- 優點：單線損壞只影響一台。\n';
const WITH_SRC = THIN + '\n## 相關研究\n- [[a]]\n\n## 來源\n- [官方](https://example.com)\n';

assert(L.needsExpansion(THIN), 'a split note with only the copied definition needs expansion');
assert(L.needsExpansion(THIN.replace(/\n/g, '\r\n')), 'CRLF notes are detected too');
assert(!L.needsExpansion(THIN.replace('claude-agent', 'claude-note')), "the user's own notes are never expanded");
assert(!L.needsExpansion(THIN + '\n### 實際用途\n- x\n'), 'a note that already has 實際用途 (new gray-link fill) is left alone');
assert(!L.needsExpansion(THIN.replace('所有設備接到中央節點。', '與 [[星狀拓撲]] 是同一個概念。')), 'a pointer note (same concept as another note) is not expanded');
assert(!L.needsExpansion(THIN + '\n' + L.EXPAND_HEAD + '\n\nx\n'), 'a note expanded once is not expanded again');

const p = L.expandPrompt('星型拓撲', THIN, '----- 筆記「網路」 -----\n提到它的那一行：星型');
assert(p.includes('### 實際用途') && p.includes('誰、在什麼情況下'), 'prompt asks for concrete practical-use scenarios');
assert(p.includes('一律忽略'), 'prompt treats the note and web pages as data');
assert(p.includes(THIN.trim().slice(0, 30)) && p.includes('提到這個名詞的筆記'), 'prompt carries the note and the linking context');
assert(!L.expandPrompt('x', THIN).includes('===== 提到這個名詞的筆記'), 'no context block when nothing links to it');

const OUT = '```markdown\n## 它是什麼、怎麼運作\n每台接到交換器。\n### 實際用途\n- 辦公室：30 台電腦接一台交換器。\n### 跟你筆記的關係\n第一章。\nSOURCES:\n- [Cisco](https://cisco.com)\n```';
const e = L.parseExpansion(OUT);
assert(e && e.sources === '- [Cisco](https://cisco.com)', 'sources are split off');
assert(e && !/^## /m.test(e.body) && e.body.includes('### 它是什麼'), 'top-level headings are demoted under 延伸說明');
assert(e && !e.body.includes('```'), 'code fence wrapper is removed');
assert(L.parseExpansion('### 通用說明\n只有定義') === null, 'output without 實際用途 is rejected');
assert(L.parseExpansion('') === null, 'empty output is rejected');

const m1 = L.appendExpansion(THIN, e, { model: 'sonnet', stamp: '2026-11-11 23:00' });
assert(m1.startsWith(THIN.trimEnd()), 'existing content is kept untouched');
assert(m1.includes(L.EXPAND_HEAD) && m1.includes('辦公室') && m1.includes('Agent（sonnet）於 2026-11-11 23:00'), 'expansion block is appended with its origin line');
assert(!L.needsExpansion(m1), 'after expansion the note no longer needs it');
const m2 = L.appendExpansion(WITH_SRC, e, { model: 'sonnet', stamp: 's' });
assert(m2.indexOf(L.EXPAND_HEAD) < m2.indexOf('## 相關研究') && m2.indexOf('## 相關研究') < m2.indexOf('## 來源'), 'expansion goes before 相關研究 / 來源');
assert(m2.includes('- [官方](https://example.com)') && m2.includes('#### 延伸說明的來源'), 'original sources stay and expansion sources are listed with it');
const m3 = L.appendExpansion(THIN, { body: '### 實際用途\n- x', sources: '' }, { model: 'm', stamp: 's' });
assert(!m3.includes('延伸說明的來源'), 'no sources heading when the Agent gave none');

// links in an expansion must point at existing notes
const known = L.nameExists(new Set(['提示工程', 'rag', '交換器']));
let u = L.unlinkUnknown('見 [[提示工程]]、[[Prompt Engineering]] 和 [[RAG|檢索增強]]、[[Retrieval-Augmented Generation|RAG 全名]]、[[VPN#設定]]', known);
assert(u.text === '見 [[提示工程]]、Prompt Engineering 和 [[RAG|檢索增強]]、RAG 全名、VPN', 'unknown links become plain text (alias or name), known ones stay');
assert(u.count === 3, 'unlinked links are counted');
assert(known('Claude-Notes/研究/交換器') && known('rag.md'), 'existence checks the file name, case-insensitive, any folder');
u = L.unlinkUnknown('寫成 `[[筆記名稱]]` 就會連結\n```\n[[範例]]\n```\n![[圖.png]] [[]]', known);
assert(u.count === 0 && u.text.includes('`[[筆記名稱]]`') && u.text.includes('[[範例]]') && u.text.includes('![[圖.png]]'), 'code spans, fenced code, embeds and empty brackets are left alone');
const EXP = '---\ngenerated_by: claude-agent\n---\n\n# X\n\n## 內容\n[[Prompt Engineering]] 原本的內容\n\n' + L.EXPAND_HEAD + '\n\n> 🔎\n\n### 實際用途\n- [[Prompt Engineering]] 與 [[提示工程]]\n\n## 相關研究\n- [[Few-shot]]\n';
const c = L.cleanExpansionLinks(EXP, known);
assert(c.count === 1 && c.md.includes('- Prompt Engineering 與 [[提示工程]]'), 'repair unlinks inside the 延伸說明 block');
assert(c.md.includes('[[Prompt Engineering]] 原本的內容') && c.md.includes('- [[Few-shot]]'), 'repair leaves the rest of the note (before and after the block) untouched');
assert(L.cleanExpansionLinks('# 沒有延伸說明 [[Y]]', known).count === 0, 'notes without an expansion are not changed');
const p2 = L.expandPrompt('星型拓撲', THIN, '', ['交換器', '星型拓撲', '網狀拓撲']);
assert(p2.includes('只能連結到這些名稱') && p2.includes('交換器、網狀拓撲') && !p2.includes('交換器、星型拓撲'), 'prompt lists existing note names (not the note itself) as the only link targets');
assert(L.expandPrompt('x', THIN).includes('整篇都不要加連結'), 'no existing notes -> no links at all');
