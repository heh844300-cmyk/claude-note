'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const L = require('../lib/library.js');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'cnvault-'));
const notes = path.join(vault, 'Claude-Notes');
fs.mkdirSync(path.join(notes, '研究'), { recursive: true });
fs.mkdirSync(path.join(vault, '.trash'));
const orig = path.join(notes, '原筆記.md');
fs.writeFileSync(orig, '---\ntitle: x\ngenerated_by: claude-note\n---\n\n# x\n');
fs.writeFileSync(path.join(vault, '我的 Tailscale.md'), '\uFEFF# 我的筆記\r\n自己寫的內容\r\n');
fs.writeFileSync(path.join(notes, '研究', 'WireGuard.md'), '---\ntitle: WireGuard\ngenerated_by: claude-agent\nrelated:\n  - "[[Claude-Notes/別篇|別篇]]"\ntags:\n  - claude-research\n---\n\n# WireGuard\n內容\n');
fs.writeFileSync(path.join(notes, '研究', 'Nat 穿透.md'), '---\ngenerated_by: claude-agent\n---\n# old\n');
fs.writeFileSync(path.join(vault, '.trash', 'x.md'), 'trash');
fs.writeFileSync(path.join(vault, 'airw-index.md'), 'airw');

const out = `DONE: 做完的事
=== MAIN ===
### 待釐清問題
**Tailscale 是什麼？**
{{U1}}
**問題二**
{{U2}}
**問題三**
這要你自己決定。{{U9}}
=== UNIT U1 ===
TITLE: Tailscale
SUMMARY: 把裝置連成私人網路的工具。
TAGS: 網路, VPN
### 原理
用 WireGuard。
SOURCES:
- [官網](https://tailscale.com)
=== UNIT U2 ===
TITLE: 個人方案上限
SUMMARY: 個人方案可以免費使用。
細節內容
=== UNIT U3 ===
TITLE: NAT 穿透
SUMMARY: 讓兩台在 NAT 後面的裝置直接連線。
內容 C
=== UNIT U4 ===
TITLE: WireGuard
SUMMARY: 一種 VPN 協定。
內容 D
=== UNIT U5 ===
TITLE: 壞目標
SUMMARY: s5
內容 E
=== UNIT U6 ===
TITLE: CON
SUMMARY: s6
內容 F
`;
const p = L.parseResearch(out);
assert(p.done.length === 1 && p.done[0] === '做完的事', 'DONE parsed');
assert(p.units.length === 6, 'six units parsed');
assert(p.units[0].sources.includes('tailscale.com') && !p.units[0].body.includes('SOURCES'), 'sources split');
assert(p.units[0].tags.join() === '網路,VPN', 'tags');

const plan = L.parsePlan('blah [{"id":"U1","action":"new","name":"Tailscale","related":["我的 Tailscale.md","../etc.md"]},' +
  '{"id":"U2","action":"append","target":"我的 Tailscale.md"},{"id":"U3","action":"new","name":"NAT 穿透"},' +
  '{"id":"U4","action":"link","target":"Claude-Notes/研究/WireGuard.md"},{"id":"U5","action":"append","target":".trash/x.md"},' +
  '{"id":"U6","action":"new","name":"CON"},{"id":"U99","action":"new","name":"x"}] tail', p.units);
assert(plan && plan.size === 6, 'plan parsed, unknown id dropped');

// validation
assert(L.resolveTarget(vault, '../x.md', orig) === null, 'reject ..');
assert(L.resolveTarget(vault, '.trash/x.md', orig) === null, 'reject .trash');
assert(L.resolveTarget(vault, 'airw-index.md', orig) === null, 'reject airw');
assert(L.resolveTarget(vault, 'Claude-Notes/原筆記.md', orig) === null, 'reject original');
assert(L.resolveTarget(vault, 'C:/Windows/win.ini', orig) === null, 'reject absolute');
assert(L.resolveTarget(vault, '我的 Tailscale.md', orig) !== null, 'accept user note');
assert(L.safeName('a/b:c*?') === 'a b c', 'sanitize name');
assert(L.safeName('NUL') === null, 'reserved name');

(async () => {
  const logs = [];
  const res = await L.applyPlan({ vault, notesDir: notes, origAbs: orig, units: p.units, plan, model: 'sonnet', created: '2026-11-12T10:00', stamp: '2026-11-12 10:00', log: (...a) => logs.push(a.join(' ')) });
  const act = Object.fromEntries([...res].map(([k, v]) => [k, v.action + (v.rel ? ' ' + v.rel : '')]));
  console.log(act);
  assert(act.U1 === 'new Claude-Notes/研究/Tailscale.md', 'U1 new note');
  assert(act.U2 === 'append 我的 Tailscale.md', 'U2 appended to user note');
  assert(act.U3 === 'append Claude-Notes/研究/Nat 穿透.md', 'U3 case-insensitive existing -> append');
  assert(act.U4 === 'link Claude-Notes/研究/WireGuard.md', 'U4 link');
  assert(act.U5 === 'inline', 'U5 bad target -> inline');
  assert(act.U6 === 'new Claude-Notes/研究/CON.md' || act.U6 === 'inline', 'U6 reserved name handled: ' + act.U6);

  const t = fs.readFileSync(path.join(notes, '研究', 'Tailscale.md'), 'utf8');
  assert(t.includes('generated_by: claude-agent') && t.includes('"[[Claude-Notes/原筆記|原筆記]]"') && t.includes('[[我的 Tailscale|我的 Tailscale]]'), 'new note frontmatter + related');
  assert(t.includes('## 摘要') && t.includes('## 來源') && t.indexOf('## 摘要') < t.indexOf('## 內容'), 'new note structure');
  const u = fs.readFileSync(path.join(vault, '我的 Tailscale.md'), 'utf8');
  assert(u.startsWith('\uFEFF# 我的筆記\r\n自己寫的內容\r\n'), 'user note original text untouched, BOM kept');
  assert(u.includes('## 🔎 Agent 補充（2026-11-12 10:00，出自 [[Claude-Notes/原筆記|原筆記]]）\r\n') && !u.includes('related:'), 'user note: marked block, CRLF, no frontmatter change');
  const w = fs.readFileSync(path.join(notes, '研究', 'WireGuard.md'), 'utf8');
  assert(w.includes('  - "[[Claude-Notes/別篇|別篇]]"\n  - "[[Claude-Notes/原筆記|原筆記]]"'), 'link: related list extended');
  const n = fs.readFileSync(path.join(notes, '研究', 'Nat 穿透.md'), 'utf8');
  assert(n.includes('## 補充（2026-11-12 10:00') && n.includes('related:'), 'append to agent note: plain heading + related');
  assert(fs.readFileSync(path.join(vault, '.trash', 'x.md'), 'utf8') === 'trash', 'trash untouched');

  const r = L.renderMain(p.main, p.units, res);
  console.log('----\n' + r.text + '\n----', r.counts);
  assert(!r.text.includes('{{'), 'no placeholders left');
  assert(r.text.includes('（詳見研究筆記 → [[Claude-Notes/研究/Tailscale|Tailscale]]）'), 'summary + link');
  assert(r.text.includes('### 其他整理'), 'unreferenced units appended');
  assert(r.text.includes('### 這次整理到的筆記'), 'summary list');

  // guard 1: rerun from the same original -> no duplicate append, becomes link
  const before = fs.readFileSync(path.join(vault, '我的 Tailscale.md'), 'utf8');
  const plan2 = L.parsePlan('[{"id":"U2","action":"append","target":"我的 Tailscale.md"},{"id":"U1","action":"append","target":"Claude-Notes/研究/Tailscale.md"},{"id":"U3","action":"new","name":"nat 穿透"}]', p.units);
  const res3 = await L.applyPlan({ vault, notesDir: notes, origAbs: orig, units: p.units.slice(0, 3), plan: plan2, model: 'sonnet', created: 'x', stamp: 'y', log: () => {} });
  assert(res3.get('U2').action === 'link' && fs.readFileSync(path.join(vault, '我的 Tailscale.md'), 'utf8') === before, 'rerun: user note not appended twice');
  assert(res3.get('U1').action === 'link', 'rerun: own research note -> link');
  assert(res3.get('U3').action === 'link', 'rerun: new on existing (already from orig) -> link');
  // guard 2: append target with expires -> new research note instead
  fs.writeFileSync(path.join(notes, '短期.md'), '---\ntitle: 短期\ngenerated_by: claude-note\nexpires: 2026-11-20T23:59\n---\n\n# 短期\n');
  const plan3 = L.parsePlan('[{"id":"U5","action":"append","target":"Claude-Notes/短期.md"}]', p.units);
  const res4 = await L.applyPlan({ vault, notesDir: notes, origAbs: orig, units: [p.units[4]], plan: plan3, model: 'sonnet', created: 'x', stamp: 'y', log: () => {} });
  assert(res4.get('U5').action === 'new' && res4.get('U5').rel === 'Claude-Notes/研究/壞目標.md', 'expiring target -> new note');
  assert(!fs.readFileSync(path.join(notes, '短期.md'), 'utf8').includes('補充'), 'expiring note untouched');
  assert(fs.readFileSync(path.join(notes, '研究', '壞目標.md'), 'utf8').includes('[[Claude-Notes/短期|短期]]'), 'new note links to the expiring note');
  // guard 2 + existing research note with expires: no infinite loop
  fs.writeFileSync(path.join(notes, '研究', '循環.md'), '---\ngenerated_by: claude-agent\nexpires: 2026-11-20\n---\n# x\n');
  const plan4 = L.parsePlan('[{"id":"U6","action":"new","name":"循環"}]', p.units);
  const res5 = await L.applyPlan({ vault, notesDir: notes, origAbs: orig, units: [p.units[5]], plan: plan4, model: 'sonnet', created: 'x', stamp: 'y', log: () => {} });
  assert(res5.get('U6').action === 'link', 'expiring existing research note -> link, no loop');

  // fallbacks
  const fb = L.parseResearch('### 待釐清問題\n純文字答案');
  assert(fb.units.length === 0 && fb.main.includes('純文字答案'), 'no-marker output -> main');
  const res2 = await L.applyPlan({ vault, notesDir: notes, origAbs: orig, units: p.units.slice(0, 1), plan: null, model: 'sonnet', created: 'x', stamp: 'x', log: () => {} });
  assert(res2.get('U1').action === 'inline', 'no plan -> inline');
  assert(L.parsePlan('not json', p.units) === null, 'bad json -> null');
  fs.rmSync(vault, { recursive: true, force: true });
})();
