// The user's answers to a note's 待釐清問題 and to the to-dos the Agent marked "🙋 需要你".
// An answer is an indented sub-item right under its question / to-do:   "  - 💬 我的回答：..."
// The same marker typed by hand in Obsidian works exactly the same way.
'use strict';

const MARK = '💬 我的回答：';
const ANSWER_RE = /^\s+[-*+]\s+💬\s*我的回答[:：]\s*(.*)$/;
const ITEM_RE = /^([-*+])\s+(?!\[[ xX]\]\s)(.+)$/;        // top-level bullet, not a checkbox
const TODO_RE = /^([-*+])\s+\[ \]\s+(.+)$/;               // top-level unchecked to-do

const norm = (s) => String(s || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();

// [from, to) line range of "## <name>" (until the next "## " or the Agent / footer section)
function section(lines, name) {
  const s = lines.findIndex((l) => new RegExp('^##\\s*' + name + '\\s*$').test(l));
  if (s < 0) return null;
  let e = s + 1;
  while (e < lines.length && !/^##?\s/.test(lines[e]) && !/^---\s*$/.test(lines[e]) && !/^<details>/.test(lines[e])) e++;
  return [s + 1, e];
}

// answer lines directly under item line i (only indented lines belong to the item)
function answerAt(lines, i) {
  for (let k = i + 1; k < lines.length && /^\s+\S/.test(lines[k]); k++) { const m = lines[k].match(ANSWER_RE); if (m) return { line: k, text: m[1].trim() }; }
  return null;
}

// what can be answered: every question, plus the unchecked to-dos the last Agent run said need the user (or that already have an answer)
function listItems(md) {
  const lines = String(md || '').replace(/^﻿/, '').split(/\r?\n/);
  const out = [];
  const agent = (() => { const r = section(lines, 'Agent 研究結果'); return r ? lines.slice(r[0], r[1]).join('\n') : ''; })();
  // "🙋 需要你｜<to-do text>：…" lines; compared without spaces / punctuation (the Agent may swap ，for , etc.)
  const needYou = [...agent.matchAll(/🙋\s*需要你\s*[｜|]\s*(.+)/g)].map((m) => norm(m[1]));
  const q = section(lines, '待釐清問題');
  if (q) for (let i = q[0]; i < q[1]; i++) {
    const m = lines[i].match(ITEM_RE);
    if (m) { const a = answerAt(lines, i); out.push({ kind: 'q', line: i, raw: lines[i], text: m[2].trim(), answer: a ? a.text : '' }); }
  }
  const t = section(lines, '待辦事項');
  if (t) for (let i = t[0]; i < t[1]; i++) {
    const m = lines[i].match(TODO_RE);
    if (!m) continue;
    const text = m[2].trim(), a = answerAt(lines, i);
    const needsYou = !!norm(text) && needYou.some((s) => s.startsWith(norm(text)));
    if (needsYou || a) out.push({ kind: 't', line: i, raw: lines[i], text, answer: a ? a.text : '', needsYou });
  }
  return out;
}

// write answers: [{ line, raw, answer }]. Each item line must still be unchanged (else it is skipped and reported).
// An empty answer removes an existing one. Keeps BOM and line endings.
function applyAnswers(md, answers) {
  const bom = md.startsWith('﻿');
  const body = bom ? md.slice(1) : md;
  const nl = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(/\r?\n/);
  let changed = 0; const stale = [];
  // bottom-up, so line numbers of earlier items stay valid
  for (const a of [...answers].sort((x, y) => y.line - x.line)) {
    if (!Number.isInteger(a.line) || lines[a.line] !== a.raw) { stale.push(a.raw); continue; }
    const text = String(a.answer || '').replace(/\s*\r?\n\s*/g, ' ').trim().slice(0, 4000);
    const cur = answerAt(lines, a.line);
    const indent = '  ' + (a.raw.match(/^\s*/)[0]);
    if (cur && cur.text === text) continue;
    if (cur && text) lines[cur.line] = `${indent}- ${MARK}${text}`;
    else if (cur) lines.splice(cur.line, 1);
    else if (text) lines.splice(a.line + 1, 0, `${indent}- ${MARK}${text}`);
    else continue;
    changed++;
  }
  return { md: (bom ? '﻿' : '') + lines.join(nl), changed, stale };
}

// [[links]] written inside the answers (the Agent cannot read the vault, so the server attaches those notes)
function answerLinks(md, max = 3) {
  const names = [];
  for (const it of listItems(md)) for (const m of it.answer.matchAll(/\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const n = m[1].trim(); if (n && !names.includes(n)) names.push(n);
  }
  return names.slice(0, max);
}

module.exports = { MARK, listItems, applyAnswers, answerLinks };
