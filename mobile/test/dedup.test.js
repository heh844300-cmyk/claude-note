// Duplicate knowledge nodes: finding pairs, validating the AI's answer, rewriting links, merging content.
'use strict';
const D = require('../lib/dedup');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

// links: every form points at the kept note, the visible text stays
const md = '見 [[PARA方法]]、[[Claude-Notes/研究/PARA方法|整理法]]、[[PARA方法#組織]] 與 ![[para方法]]；不動 [[PARA]] 和 [[PARA方法論]]。\nrelated:\n  - "[[Claude-Notes/研究/PARA方法|PARA方法]]"\n';
const r = D.rewriteLinks(md, 'PARA方法', 'Claude-Notes/研究/PARA');
assert(r.n === 5, 'five links rewritten: ' + r.n);
assert(r.md.includes('[[Claude-Notes/研究/PARA|PARA方法]]、[[Claude-Notes/研究/PARA|整理法]]、[[Claude-Notes/研究/PARA#組織|PARA方法]] 與 ![[Claude-Notes/研究/PARA|para方法]]'), 'path, alias, heading, embed handled; text kept');
assert(r.md.includes('不動 [[PARA]] 和 [[PARA方法論]]') && r.md.includes('"[[Claude-Notes/研究/PARA|PARA方法]]"'), 'other names untouched; frontmatter related rewritten');
assert(D.rewriteLinks('CODE 框架 [[CODE 框架]]', 'CODE 框架', 'Claude-Notes/研究/CODE方法').md === 'CODE 框架 [[Claude-Notes/研究/CODE方法|CODE 框架]]', 'gray link with a space; plain text untouched');

// aliases
const a1 = D.addAlias('---\ntitle: "PARA"\ntags:\n  - x\n---\n\n# PARA\n', 'PARA方法');
assert(a1.includes('tags:\n  - x\naliases:\n  - "PARA方法"\n---'), 'alias list created');
assert(D.addAlias(a1, 'PARA方法') === a1 && D.addAlias(a1, '整理法').includes('aliases:\n  - "整理法"\n  - "PARA方法"'), 'no duplicate alias; another one added');

// content to merge: pointer notes only bring their "跟你筆記的關係"
const pointer = '---\ntitle: x\n---\n\n# PARA方法\n\n> 🔎 Agent 補寫\n\n## 摘要\n與 [[PARA]] 是同一個概念。PARA 是…\n\n## 內容\n### 通用說明\n同一件事。\n### 跟你筆記的關係\n在 CODE方法 裡是組織步驟。\n';
assert(D.pointerTarget(pointer) === 'PARA' && D.contentToMerge(pointer) === '在 CODE方法 裡是組織步驟。', 'pointer note: target found, only its relation part merged');
const full = '---\ntitle: x\n---\n\n# 第二大腦\n\n## 摘要\n外部記憶。\n\n## 內容\n細節\n';
assert(D.contentToMerge(full).startsWith('### 摘要\n外部記憶。') && !D.contentToMerge(full).includes('# 第二大腦'), 'full note: body merged with headings demoted');

// candidates + AI answer validation
const inv = { notes: [{ name: 'PARA', summary: 's' }, { name: 'PARA方法', summary: '與 [[PARA]] 是同一個概念', pointer: 'PARA' }, { name: 'CODE方法', summary: 's' }, { name: 'Tailscale Serve', summary: 's' }, { name: 'Tailscale Funnel', summary: 's' }],
  gray: [{ name: 'CODE 框架', refs: 2 }, { name: '第二大腦', refs: 1 }] };
const lex = D.lexicalPairs(inv);
assert(lex.some((p) => p.keep === 'PARA' && p.dup === 'PARA方法' && p.kind === 'note') && lex.some((p) => p.keep === 'CODE方法' && p.dup === 'CODE 框架' && p.kind === 'gray'), 'name matches: PARA方法→PARA, gray CODE 框架→CODE方法');
assert(!lex.some((p) => /Tailscale/.test(p.dup)), 'Serve / Funnel not paired by name');
const ok = D.parsePairs('好的：[{"keep":"PARA","dup":"PARA方法","reason":"同"},{"keep":"不存在","dup":"PARA"},{"keep":"PARA","dup":"PARA"},{"keep":"CODE方法","dup":"code 框架"},{"keep":"CODE方法","dup":"亂寫的名稱"},{"keep":"PARA","dup":"PARA方法"}]', inv);
assert(ok.length === 2 && ok[0].kind === 'note' && ok[1].kind === 'gray' && ok[1].dup === 'CODE 框架' && ok[1].refs === 2, 'unknown / self / invented / repeated pairs dropped');
assert(D.parsePairs('沒有 JSON', inv) === null && D.parsePairs('[]', inv).length === 0, 'unreadable -> null, empty -> []');
const p = D.prompt(inv, lex, [{ keep: 'Tailscale Serve', dup: 'Tailscale Funnel' }]);
assert(p.includes('- PARA方法：') && p.includes('- CODE 框架') && p.includes('已經被使用者否決的配對 =====\n- Tailscale Funnel → Tailscale Serve'), 'prompt lists notes, gray links, hints and dismissed pairs');
const cut = D.parsePairs('[{"keep":"PARA","dup":"PARA方法","reason":"同"},{"keep":"CODE方法","dup":"CODE 框架","reason":"含"引號"壞掉"},{"keep":"CODE方法","dup":"CODE 框架","reason":"好的"},{"keep":"PA', inv);
assert(cut && cut.length === 2 && cut[1].reason === '好的', 'broken / cut-off JSON: the readable objects are kept');
assert(D.parsePairs('[{"keep":"PARA","dup":"PARA方法","reason":"不確定"}]', inv).length === 0, 'pairs the AI is unsure about are dropped');
assert(D.parsePairs('[{"keep":"PARA","dup":"PARA方法","reason":"CODE 是 BASB 的核心流程，但為不同層級"},{"keep":"PARA","dup":"PARA 方法","reason":"同一個架構的不同寫法"}]', { ...inv, gray: [...inv.gray, { name: 'PARA 方法', refs: 1 }] }).map((p) => p.dup).join() === 'PARA 方法', '"different level" dropped, "different spelling" kept');
