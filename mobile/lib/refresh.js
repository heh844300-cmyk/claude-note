// Updating an existing note with the current rules: only its body region is rewritten.
// Kept byte-for-byte: frontmatter, "# title", the "> 🧩" overview back-link, Agent results, photos, Original notes, other footers.
// What the user did inside the body (ticks, ✅/📅 dates, 💬 answers, links from earlier term splits) is enforced in code,
// not left to the AI: restored when possible, otherwise reported as a warning on the draft.
'use strict';
const crypto = require('crypto');
const tasks = require('./tasks');
const answers = require('./answers');

const norm = (s) => String(s || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
const END_RES = [/\n## Agent 研究結果[ \t]*\n/, /\n## 附件照片[ \t]*\n/, /\n---\n\n<details>/, /\n<details>/];

// split a note (LF, no BOM) into head | body | tail
function regions(md) {
  const t = md.match(/^# .*$/m);
  let start = t ? t.index + t[0].length : (md.match(/^---\n[\s\S]*?\n---\n/) || [''])[0].length;
  // keep "> 🧩 …" back-link lines (and the blank lines around them) in the head
  const after = md.slice(start).match(/^(\s*\n>\s*🧩[^\n]*)+/);
  if (after) start += after[0].length;
  const rest = md.slice(start);
  const end = Math.min(...END_RES.map((re) => { const i = rest.search(re); return i >= 0 ? start + i : md.length; }));
  return { head: md.slice(0, start), body: md.slice(start, end), tail: md.slice(end) };
}

const readKeep = (raw) => { const bom = raw.startsWith('﻿'); const s = bom ? raw.slice(1) : raw; return { md: s.replace(/\r\n/g, '\n'), bom, crlf: s.includes('\r\n') }; };
const writeKeep = (md, k) => (k.bom ? '﻿' : '') + (k.crlf ? md.replace(/\n/g, '\r\n') : md);
// hash of the body, ignoring tick state / ✅ dates and 💬 answers (those are merged at upload, not conflicts)
const bodyHash = (raw) => crypto.createHash('sha256').update(regions(readKeep(raw).md).body
  .replace(/\[[xX]\]/g, '[ ]').replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/g, '').replace(/^\s+[-*+]\s+💬\s*我的回答[:：].*$\n?/gm, '').trim()).digest('hex');
const originalText = (raw) => (readKeep(raw).md.match(/<details><summary>Original notes<\/summary>\n\n([\s\S]*?)\n\n<\/details>/) || [])[1] || '';

// add lines at the end of "## name" (created before 相關概念 / at the end when missing)
function appendToSection(body, name, add) {
  const ls = body.split('\n');
  let s = ls.findIndex((l) => new RegExp('^##\\s*' + name + '\\s*$').test(l));
  if (s < 0) {
    let at = ls.findIndex((l) => /^##\s*相關概念\s*$/.test(l)); if (at < 0) at = ls.length;
    ls.splice(at, 0, '## ' + name, ...add, '');
    return ls.join('\n');
  }
  let e = s + 1; while (e < ls.length && !/^##?\s/.test(ls[e])) e++;
  while (e > s + 1 && !ls[e - 1].trim()) e--;
  ls.splice(e, 0, ...add);
  return ls.join('\n');
}

// make the new body keep what the user did in the old one. Lossless for ticks and answers: what the AI dropped is
// put back at the end of its section (and reported); only things that cannot be placed become warnings.
// Returns { body, warnings }
function preserve(oldBody, newBody) {
  const warnings = [];
  const backTodo = [];
  const lines = String(newBody || '').replace(/\r\n/g, '\n').split('\n');
  const findTask = (text) => lines.findIndex((l) => { const m = l.match(/^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]\s+(.*)$/); return m && norm(tasks.cleanText(m[3])) === norm(tasks.cleanText(text)); });
  for (const t of tasks.parseTasks(oldBody)) {
    const i = findTask(t.text);
    if (t.done) {
      if (i >= 0) lines[i] = lines[i].replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[[ xX]\]\s+.*$/, (_, lead) => `${lead}[x] ${t.text}`);   // ✅ / 📅 kept as they were
      else { backTodo.push(t.raw.trim()); warnings.push('ℹ️ 已補回 AI 拿掉的已完成待辦：' + tasks.cleanText(t.text)); }
    } else if (t.due) {
      if (i >= 0 && !/📅/.test(lines[i])) lines[i] = lines[i].replace(/\s*$/, ` 📅 ${t.due}`);
      else if (i < 0) { backTodo.push(t.raw.trim()); warnings.push('ℹ️ 已補回 AI 拿掉的有期限待辦：' + tasks.cleanText(t.text)); }
    }
  }
  let body = lines.join('\n');
  if (backTodo.length) body = appendToSection(body, '待辦事項', backTodo);
  // 💬 answers: re-insert under the same question / to-do; otherwise warn
  const have = (a) => body.includes('💬 我的回答：' + a) || body.includes('💬 我的回答:' + a);
  const missing = [];
  for (const it of answers.listItems(oldBody).filter((x) => x.answer)) {
    if (have(it.answer)) continue;
    const locate = () => { const bl = body.split('\n'); const line = bl.findIndex((l) => /^[-*+]\s+/.test(l) && norm(tasks.cleanText(l.replace(/^[-*+]\s+(\[[ xX]\]\s+)?/, ''))) === norm(tasks.cleanText(it.text))); return { bl, line }; };
    let { bl, line } = locate();
    if (line < 0) {                                          // the AI dropped the question / to-do itself: put it back
      body = appendToSection(body, it.kind === 'q' ? '待釐清問題' : '待辦事項', [it.raw.trim()]);
      warnings.push('ℹ️ 已補回 AI 拿掉的' + (it.kind === 'q' ? '問題' : '待辦') + '（連同你的回答）：' + it.text);
      ({ bl, line } = locate());
    }
    if (line >= 0) body = answers.applyAnswers(body, [{ line, raw: bl[line], answer: it.answer }]).md;
    else missing.push(it);
  }
  for (const it of missing) warnings.push(`你的回答沒有地方放（原題：${it.text}）：${it.answer}`);
  // links left by an earlier term split
  for (const m of oldBody.matchAll(/（詳見 → (\[\[[^\]]+\]\])）/g)) {
    const target = m[1].replace(/\|.*\]\]$/, '');
    if (!body.includes(target.replace(/\]\]$/, ''))) warnings.push('先前拆出的名詞連結不見了：' + m[1]);
  }
  return { body, warnings };
}

// replace the body region of `raw` with newBody (keeps BOM / CRLF and everything outside the body)
function replaceBody(raw, newBody) {
  const k = readKeep(raw);
  const r = regions(k.md);
  const body = '\n\n' + String(newBody).replace(/\r\n/g, '\n').trim() + '\n';
  return writeKeep(r.head + body + r.tail.replace(/^\n*/, r.tail ? '\n' : ''), k);
}

module.exports = { regions, bodyHash, originalText, preserve, replaceBody, readKeep };
