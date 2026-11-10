// Splitting one input into several notes, and moving term explanations out of a note.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const S = require('../lib/split');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

// the server's parseNote, extracted from server.js so the test uses the real one
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const grab = (name) => { const i = src.indexOf('function ' + name + '('); let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) return src.slice(i, k + 1); } };
const parseNote = new Function(grab('parseNote') + '\nreturn parseNote;')();

const note = (t, extra = '') => `TITLE: ${t}\nTAGS: a, b\nEXPIRES: never\nREMIND: none\nAGENT: no\n\n## 摘要\n${t}的摘要。第二句。\n\n## 重點整理\n- ${t} 的重點內容足夠長足夠長足夠長${extra}`;

// single topic: exactly today's behaviour
const single = S.parseMulti(note('報稅'), parseNote);
assert(!single.multi && single.note.title === '報稅' && single.note.body.startsWith('## 摘要'), 'single topic -> one note, unchanged');

// three topics
const three = S.parseMulti('OVERVIEW: 今天的雜記\n=== NOTE ===\n' + note('報稅') + '\n=== NOTE ===\n' + note('旅遊') + '\n=== NOTE ===\n' + note('學 Rust'), parseNote);
assert(three.multi && three.notes.length === 3 && three.overviewTitle === '今天的雜記', '3 topics parsed with overview title');
assert(three.notes.map((n) => n.title).join() === '報稅,旅遊,學 Rust' && three.notes[1].expires === 'never', 'each topic keeps its own header');

// malformed: markers but only one valid part -> one note, markers stripped, nothing lost
const bad = S.parseMulti('OVERVIEW: x\n=== NOTE ===\n' + note('唯一') + '\n=== NOTE ===\n(壞掉的片段)', parseNote);
assert(!bad.multi && bad.note.title === '唯一' && !/=== NOTE ===|OVERVIEW/.test(bad.note.body) && bad.note.body.includes('壞掉的片段'), 'malformed split -> single note, content kept');

// cap
const many = S.parseMulti('OVERVIEW: x\n' + Array.from({ length: 9 }, (_, i) => '=== NOTE ===\n' + note('主題' + i)).join('\n'), parseNote);
assert(many.multi && many.notes.length === S.MAX_TOPICS, 'capped at ' + S.MAX_TOPICS + ' topics');

// overview
assert(S.summaryOf('## 摘要\n第一句話。第二句。\n\n## 重點\nx') === '第一句話。', 'summary = first sentence of 摘要');
const ob = S.overviewBody([{ file: '2026-11-10 報稅.md', title: '報稅', summary: 's1' }, { title: '旅遊', summary: 's2' }]);
assert(ob.includes('- [[Claude-Notes/2026-11-10 報稅|報稅]]：s1') && ob.includes('- 旅遊（還沒上傳）：s2') && ob.includes('2 個主題'), 'overview lists exact files and pending titles');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-split-'));
const f = path.join(dir, 'n.md');
fs.writeFileSync(f, '﻿---\r\ntitle: x\r\n---\r\n\r\n# 報稅\r\n\r\n## 摘要\r\n內容\r\n');
assert(S.insertBackLink(f, '2026-11-10 雜記.md', '雜記'), 'back-link inserted');
const back = fs.readFileSync(f, 'utf8');
assert(back.startsWith('﻿') && back.includes('# 報稅\r\n\r\n> 🧩 同一次輸入的總覽：[[Claude-Notes/2026-11-10 雜記|雜記]]\r\n') && !/[^\r]\n/.test(back), 'back-link under title, BOM and CRLF kept');
assert(!S.insertBackLink(f, '2026-11-10 雜記.md', '雜記'), 'back-link not duplicated');
assert(!S.insertBackLink(path.join(dir, 'gone.md'), 'x.md', 'x'), 'missing file ignored');

// term explanations
const span = 'WireGuard 是一種現代的 VPN 協定，用公開金鑰加密建立點對點通道。它的程式碼精簡，設定也比傳統 VPN 簡單很多，Tailscale 就是建立在它之上。';
const md = `---\ntitle: x\n---\n\n# 網路筆記\n\n## 摘要\n我在研究遠端連線。\n\n## 重點整理\n${span}\n\n我打算週末設定好。\n\n## 相關概念\n- [[WireGuard]]：一種 VPN 協定，用公開金鑰加密建立點對點通道的那種東西\n\n---\n\n<details><summary>Original notes</summary>\n\n原文\n\n</details>\n`;
const { start, end } = S.splittableRegion(md);
const region = md.slice(start, end);
assert(region.includes(span) && !region.includes('相關概念') && !region.includes('Original notes'), 'region excludes 相關概念 and footers');
const units = S.validTerms([
  { id: 'U1', title: 'WireGuard', summary: 'VPN 協定', body: span },
  { id: 'U2', title: '短', summary: '', body: '太短的一句。' },
  { id: 'U3', title: '改寫', summary: '', body: span.replace('現代的', '新的') },
  { id: 'U4', title: '相關概念那行', summary: '', body: '- [[WireGuard]]：一種 VPN 協定，用公開金鑰加密建立點對點通道的那種東西' },
], region);
assert(units.length === 1 && units[0].id === 'U1', 'only verbatim, substantive spans inside the region are kept');
const moved = [{ title: 'WireGuard', span, summary: 'VPN 協定', link: '[[Claude-Notes/研究/WireGuard|WireGuard]]' }];
const r1 = S.applyTermReplacements(md, moved);
assert(r1.count === 1 && r1.md.includes('VPN 協定（詳見 → [[Claude-Notes/研究/WireGuard|WireGuard]]）') && r1.md.includes('我打算週末設定好。'), 'span replaced with summary + link, rest untouched');
assert(r1.md.includes('<summary>拆出前的原文（名詞解釋）</summary>') && r1.md.split(span).length === 2, 'original span kept once, in the details block');
assert(r1.md.includes('## 相關概念\n- [[WireGuard]]：一種 VPN 協定'), '相關概念 untouched');
const r2 = S.applyTermReplacements(r1.md, moved);
assert(r2.count === 0 && r2.md === r1.md, 'rerun is a no-op');
const r3 = S.applyTermReplacements(md.replace('現代的', '新的'), moved);
assert(r3.count === 0, 'edited span (no exact match) left alone');
fs.rmSync(dir, { recursive: true, force: true });
