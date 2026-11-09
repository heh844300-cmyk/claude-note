'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const L = require('../lib/library.js');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'cnfill-'));
const w = (rel, s, ageMs = 0) => { const p = path.join(vault, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); if (ageMs) { const t = new Date(Date.now() - ageMs); fs.utimesSync(p, t, t); } return p; };
w('Claude-Notes/A.md', '---\ntitle: A\n---\n# A\n## 摘要\n關於 VPN 的筆記。\n\n## 相關概念\n- [[WireGuard]]：加密協定\n- [[Tailscale|TS]]：工具\n- [[Claude-Notes/研究/NAT 穿透|NAT 穿透]]\n- ![[pic.png]]\n- [[多因素驗證#標題]]\n');
w('Claude-Notes/研究/NAT 穿透.md', '# NAT\n內容 [[WireGuard]]');
w('Tailscale.md', '', 5 * 60000);          // empty, linked, old -> fill
w('多因素驗證.md', '  \n', 5 * 60000);      // whitespace only, linked via heading link -> fill
w('剛點的.md', '', 10000);                  // empty but too new
w('Claude-Notes/B.md', '[[剛點的]]');
w('未命名.md', '', 5 * 60000);              // empty, nobody links -> not touched
w('自己寫.md', '我自己寫的', 5 * 60000);
w('.trash/WireGuard.md', '');               // ignored folder
w('airw-index.md', '[[幽靈]]');             // ignored file

const sc = L.scanVault(vault);
assert(!sc.files.some((f) => f.includes('.trash') || f.endsWith('airw-index.md')), 'excluded .trash and airw-index');
const gray = L.grayNames(sc);
console.log('gray:', gray);
assert(gray.includes('WireGuard') && gray.includes('Tailscale') && gray.includes('多因素驗證') && gray.includes('剛點的'), 'gray names include missing + empty');
assert(!gray.includes('NAT 穿透') && !gray.includes('pic.png') && !gray.includes('幽靈'), 'existing / images / ignored not gray');
const cands = L.emptyLinkedNotes(sc, 60000).map((c) => c.name).sort();
console.log('candidates:', cands);
assert(cands.join() === ['Tailscale', '多因素驗證'].sort().join(), 'only old, empty, linked notes are candidates');
const ctx = L.linkContext(vault, sc, 'Tailscale');
assert(ctx.length === 1 && ctx[0].rel === 'Claude-Notes/A.md' && ctx[0].summary.includes('VPN') && ctx[0].line.includes('[[Tailscale|TS]]'), 'context: title, summary, line');
assert(L.resolveTarget(vault, 'Tailscale.md', null) === null, 'empty note is not a valid link/append target');
assert(L.resolveTarget(vault, '自己寫.md', null) !== null, 'non-empty user note still valid');
const md = L.fillNoteMarkdown({ name: 'Tailscale', unit: { summary: 's', tags: ['網路'], body: '### 通用說明\nx [[WireGuard]]', sources: '- [a](https://a)' }, contexts: ctx, model: 'sonnet', created: 'c', stamp: 's' });
assert(md.includes('generated_by: claude-agent') && md.includes('"[[Claude-Notes/A|A]]"') && md.includes('## 來源') && md.includes('[[WireGuard]]'), 'fill note markdown');
const lp = L.librarianPrompt([{ id: 'U1', title: 't', summary: 's', body: 'b' }], 'x.md', gray);
assert(lp.includes('WireGuard') && lp.includes('一字不差'), 'librarian prompt carries gray names');
const rd = path.join(vault, 'Claude-Notes', '研究');
w('Claude-Notes/研究/Tailscale Serve 與 Funnel 差異.md', 'x'); w('Claude-Notes/研究/Tailscale Serve 與 Funnel 運作原理.md', 'x'); w('Claude-Notes/研究/Tailscale Funnel.md', 'x');
const rf = L.relatedResearch(vault, rd, 'Tailscale Funnel');
assert(rf.length === 2 && rf.every((r) => r.includes('Serve 與 Funnel')), 'relatedResearch: all words match, self excluded: ' + rf.join(' | '));
assert(L.relatedResearch(vault, rd, 'WireGuard').length === 0, 'relatedResearch: no false match');
assert(L.relatedResearch(vault, rd, 'Tailscale').length === 3, 'relatedResearch: broad name matches all Tailscale notes');
const md2 = L.fillNoteMarkdown({ name: 'Tailscale Funnel', unit: { summary: 's', tags: [], body: 'b', sources: '- [a](https://a)' }, contexts: [], model: 'm', created: 'c', stamp: 's', research: rf });
assert(md2.indexOf('## 相關研究') > md2.indexOf('## 內容') && md2.indexOf('## 相關研究') < md2.indexOf('## 來源') && md2.includes('[[Claude-Notes/研究/Tailscale Serve 與 Funnel 差異|Tailscale Serve 與 Funnel 差異]]'), 'related section placed between 內容 and 來源');
fs.rmSync(vault, { recursive: true, force: true });
