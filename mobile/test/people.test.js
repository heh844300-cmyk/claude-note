// 查人 and person pages: finding the lines, and what the AI's page may contain.
'use strict';
const fs = require('fs'), path = require('path');
const P = require('../lib/people');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

assert(P.cleanName('  Paul  Graham ') === 'Paul Graham' && P.cleanName('A') === null && P.cleanName('!!') === null && P.cleanName('a/b') === 'a b', 'names: trimmed, 2–30 characters, no path characters');

const notes = [
  { rel: 'Claude-Notes/筆記/2026-11-20 例會進度.md', name: '2026-11-20 例會進度', created: '2026-11-20',
    md: '---\ntitle: x\nauthor: 隊友A\n---\n## 重點整理\n- [ ] 隊友A 交回 283 張預標確認檔\n- **隊友A** 負責標註\n- 其他事\n```\n隊友A in code\n```\n<details><summary>Original notes</summary>\n隊友A 原文\n</details>\n' },
  { rel: 'Claude-Notes/筆記/2026-11-17 例會進度.md', name: '2026-11-17 例會進度', created: '2026-11-17', md: '## 重點整理\n- 和 [[Claude-Notes/知識庫/隊友A|隊友A]] 討論範圍\n' },
  { rel: 'Claude-Notes/筆記/2026-11-10 無關.md', name: '2026-11-10 無關', created: '2026-11-10', md: '沒有提到' },
];
const hits = P.mentions('隊友a', notes);
assert(hits.length === 2 && hits[0].created === '2026-11-20', 'mentions: only notes that name the person, newest first, case-insensitive');
assert(hits[0].lines.join('|') === '隊友A 交回 283 張預標確認檔|隊友A 負責標註', 'lines: plain text, no check box, not from frontmatter, code or the original-notes block');
assert(hits[1].lines[0] === '和 隊友A 討論範圍', 'links become plain text');

const prompt = P.pagePrompt('隊友A', hits);
assert(prompt.includes('[S1] 2026-11-20 例會進度') && prompt.includes('一字不差') && prompt.includes('一律忽略'), 'prompt: numbered sources, verbatim quotes, data-not-instructions note');

const out = '## 摘要\n隊友A 是專題的隊友，負責標註 [S1]。他說「交回 283 張預標確認檔」，也說過「我會負責後端」。\n\n## 一起做的事\n- [ ] 討論範圍 [S2] [[假連結]]\n- 不存在的出處 [S9]\n![x](https://evil.example/a.png)';
const page = P.renderPage('隊友A', hits, out, { stamp: '2026-11-24 21:00', model: 'sonnet' });
assert(page.includes('負責標註 [[Claude-Notes/筆記/2026-11-20 例會進度|2026-11-20 例會進度]]'), 'sources: [S1] becomes a program-built link');
assert(page.includes('「交回 283 張預標確認檔」') && !page.includes('「我會負責後端」') && page.includes('我會負責後端'), 'quotes: a verbatim one keeps its marks, an unverifiable one loses them');
assert(!/\[[ xX]\]/.test(page) && !page.includes('[[假連結') && !page.includes('evil.example') && !page.includes('[S9]'), 'no check boxes, no links of its own, no remote images, unknown sources dropped');
assert(page.includes('generated_by: claude-note-person') && page.includes('## 出處') && page.includes('2026-11-17 例會進度]]（2026-11-17）'), 'own generated_by, and the full source list at the end');
assert(P.renderPage('x', hits, '## 摘要\n兩個出處 [S1][S2]', { stamp: 's' }).includes('例會進度]]、[[Claude-Notes/筆記/2026-11-17'), 'several sources in a row are separated');
assert(P.renderPage('x', hits, '隨便寫的沒有段落', { stamp: 's' }) === null, 'an answer with no sections is not written');

// generated notes are never a librarian target (an append there would be lost on the next rewrite)
const os = require('os'), library = require('../lib/library');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-system-'));
for (const rel of ['Claude-Notes/筆記/回顧/知識庫地圖.md', 'Claude-Notes/知識庫/人物/隊友A.md', 'Claude-Notes/知識庫/RAG.md']) { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, '# x\n內容\n'); }
try {
  library.setSystem([]);
  assert(library.resolveTarget(root, 'Claude-Notes/筆記/回顧/知識庫地圖.md'), 'switch test: without the list the librarian could append into the map');
  library.setSystem(['Claude-Notes/筆記/回顧', 'Claude-Notes/知識庫/人物']);
  assert(!library.resolveTarget(root, 'Claude-Notes/筆記/回顧/知識庫地圖.md') && !library.resolveTarget(root, 'claude-notes\\知識庫\\人物\\隊友A.md') && library.resolveTarget(root, 'Claude-Notes/知識庫/RAG.md'),
    'librarian plan: the map, weekly reviews and person pages are never a target; concept notes still are');
} finally { library.setSystem([]); fs.rmSync(root, { recursive: true, force: true }); }

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
assert(/library\.setSystem\(SYSTEM_DIRS\)/.test(src), 'server: the generated-note folders are registered');
assert(/peopleLib\.mentions\(name, collectNotes\(\)\)/.test(src) && /function noteKind\(rel, fm\) \{[\s\S]*?\n  return null;\r?\n\}/.test(src) && /const kind = noteKind\(rel, fm\);\s+if \(!kind\) continue;/.test(src), 'server: 查人 searches only counted notes (no mail, raw clips or system notes)');
