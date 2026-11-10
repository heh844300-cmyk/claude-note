// Updating an existing note: only the body region changes; ticks, dates, answers and split links survive the rewrite.
'use strict';
const R = require('../lib/refresh');
const S = require('../lib/split');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const head = '﻿---\r\ntitle: 測試\r\ngenerated_by: claude-note\r\n---\r\n\r\n# 測試\r\n\r\n> 🧩 同一次輸入的總覽：[[Claude-Notes/x|x]]\r\n';
const body = '\r\n## 摘要\r\n舊摘要。\r\n\r\n## 重點整理\r\n- WireGuard 協定。（詳見 → [[Claude-Notes/研究/WireGuard|WireGuard]]）\r\n\r\n## 待辦事項\r\n- [x] 已完成的事 ✅ 2026-11-09\r\n- [ ] 有期限的事 📅 2026-11-20\r\n- [ ] 普通的事\r\n\r\n## 待釐清問題\r\n- 這是什麼？\r\n  - 💬 我的回答：就是 [[Claude Note]]\r\n';
const tail = '\r\n## Agent 研究結果\r\n\r\n舊的 Agent 內容\r\n\r\n---\r\n\r\n<details><summary>Original notes</summary>\r\n\r\n原文內容\r\n\r\n</details>\r\n';
const raw = head + body + tail;

const r = R.regions(R.readKeep(raw).md);
assert(r.head.endsWith('> 🧩 同一次輸入的總覽：[[Claude-Notes/x|x]]') && r.body.includes('## 摘要') && !r.body.includes('Agent') && r.tail.startsWith('\n## Agent 研究結果'), 'regions: back-link in head, Agent + footer in tail');
assert(R.originalText(raw) === '原文內容', 'original text read from the footer');

// an AI rewrite that dropped the tick, the 📅 and the answer, and reworded nothing else
const ai = '## 摘要\n新摘要。\n\n## 重點整理\n- WireGuard 協定。（詳見 → [[Claude-Notes/研究/WireGuard|WireGuard]]）\n\n## 待辦事項\n- [ ] 已完成的事\n- [ ] 有期限的事\n- [ ] 普通的事\n\n## 待釐清問題\n- 這是什麼？\n';
const p = R.preserve(R.regions(R.readKeep(raw).md).body, ai);
assert(p.body.includes('- [x] 已完成的事 ✅ 2026-11-09') && p.body.includes('- [ ] 有期限的事 📅 2026-11-20'), 'tick + ✅ and 📅 restored');
assert(p.body.includes('- 這是什麼？\n  - 💬 我的回答：就是 [[Claude Note]]') && !p.warnings.length, 'answer re-inserted under its question, no warnings');
const lost = R.preserve(R.regions(R.readKeep(raw).md).body, '## 摘要\n全部改掉了\n\n## 相關概念\n- [[X]]\n');
assert(/## 待辦事項\n- \[x\] 已完成的事 ✅ 2026-11-09\n- \[ \] 有期限的事 📅 2026-11-20\n/.test(lost.body), 'dropped tick / dated to-do put back (section re-created): ' + JSON.stringify(lost.body));
assert(/## 待釐清問題\n- 這是什麼？\n  - 💬 我的回答：就是 \[\[Claude Note\]\]/.test(lost.body) && lost.body.indexOf('## 待釐清問題') < lost.body.indexOf('## 相關概念'), 'dropped answered question put back with its answer, before 相關概念');
assert(lost.warnings.filter((w) => w.startsWith('ℹ️')).length === 3 && lost.warnings.filter((w) => !w.startsWith('ℹ️')).length === 1 && lost.warnings.some((w) => w.includes('WireGuard')), 'restorations reported as info; only the split link is a real warning');
const lost2 = R.preserve(lost.body, '## 摘要\nx\n');
assert(lost2.body.includes('- [x] 已完成的事') && lost2.body.includes('💬 我的回答：就是'), 'second pass (upload merge) is lossless too');

const out = R.replaceBody(raw, p.body);
assert(out.startsWith(head) && out.endsWith(tail) && out.includes('新摘要。') && !out.includes('舊摘要') && !/[^\r]\n/.test(out), 'only the body changed; head, Agent section, footer, BOM, CRLF kept');
assert(R.bodyHash(raw) !== R.bodyHash(out) && R.bodyHash(raw) === R.bodyHash(raw.replace('舊的 Agent 內容', '新的 Agent 內容')), 'hash covers the body only (Agent section changes do not conflict)');
const ticked = raw.replace('- [ ] 普通的事', '- [x] 普通的事 ✅ 2026-11-10').replace('  - 💬 我的回答：就是 [[Claude Note]]\r\n', '');
assert(R.bodyHash(raw) === R.bodyHash(ticked), 'ticking / answering after the draft is not a conflict');
const merged = R.preserve(R.regions(R.readKeep(ticked).md).body, p.body).body;
assert(merged.includes('- [x] 普通的事 ✅ 2026-11-10') && merged.includes('💬 我的回答：就是'), 'a tick made after the draft is merged at upload');

// term split after an update is idempotent
const units = S.validTerms([{ id: 'U1', title: 'WireGuard', body: '- WireGuard 協定。（詳見 → [[Claude-Notes/研究/WireGuard|WireGuard]]）' }], p.body);
assert(units.length === 0, 'already-split line is never split again');
const md1 = '# t\n\n## 重點\nX 是一種東西，用來做事。\n\n<details><summary>拆出前的原文（名詞解釋）</summary>\n\n**Y**\n\nY 是舊的。\n\n</details>\n';
const a = S.applyTermReplacements(md1, [{ title: 'X', span: 'X 是一種東西，用來做事。', summary: 'X 摘要。', link: '[[X]]' }]);
assert(a.md.split('拆出前的原文').length === 2 && a.md.includes('Y 是舊的。\n\n---\n\n**X**\n\nX 是一種東西'), 'second split adds to the same 拆出前的原文 block');
const withDone = '\n## 摘要\nx\n\n## 已釐清\n- ✅ 問題一\n  - 💬 我的回答：答\n  - 結論：好\n\n## 相關概念\n- [[A]]\n';
const pd = R.preserve(withDone, '## 摘要\ny\n\n## 相關概念\n- [[A]]\n');
assert(pd.body.includes('## 已釐清\n- ✅ 問題一\n  - 💬 我的回答：答\n  - 結論：好\n\n## 相關概念'), '已釐清 section dropped by the AI is put back');
assert(S.splittableRegion('# t\n\n## 重點\nA\n\n## 已釐清\n- ✅ q\n').end < '# t\n\n## 重點\nA\n\n## 已釐清'.length, '已釐清 is never term-split');
