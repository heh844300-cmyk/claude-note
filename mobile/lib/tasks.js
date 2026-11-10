// Every "- [ ]" checkbox in the vault, in one list. Uses the Obsidian Tasks plugin conventions so both views agree:
// "📅 YYYY-MM-DD" = due date, "✅ YYYY-MM-DD" = done date. Writing only flips one checkbox line (and its ✅ date).
'use strict';

const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]\s+(.*)$/;
const DUE_RE = /📅\s*(\d{4}-\d{2}-\d{2})/;
const DONE_RE = /\s*✅\s*\d{4}-\d{2}-\d{2}/;

// tasks of one note: { line (0-based), raw (the whole line), text, done, due, doneAt, heading }
function parseTasks(md) {
  const lines = String(md || '').replace(/^﻿/, '').split(/\r?\n/);
  const out = [];
  let fence = false, heading = '', inFm = lines[0] === '---';
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (inFm) { if (i > 0 && l === '---') inFm = false; continue; }
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
    if (fence) continue;
    const h = l.match(/^#{1,6}\s+(.*)$/);
    if (h) { heading = h[1].trim(); continue; }
    const m = l.match(TASK_RE);
    if (!m || !m[3].trim()) continue;
    const text = m[3].trim();
    out.push({ line: i, raw: l, text, done: m[2] !== ' ', due: (text.match(DUE_RE) || [])[1] || null,
      doneAt: (text.match(/✅\s*(\d{4}-\d{2}-\d{2})/) || [])[1] || null, heading });
  }
  return out;
}

// flip one task. `raw` must still equal the line (else the note changed meanwhile -> null). Keeps BOM and line endings.
function toggleTask(md, line, raw, done, today) {
  const bom = md.startsWith('﻿');
  const body = bom ? md.slice(1) : md;
  const nl = body.includes('\r\n') ? '\r\n' : '\n';
  const lines = body.split(/\r?\n/);
  if (!Number.isInteger(line) || line < 0 || line >= lines.length || lines[line] !== raw) return null;
  const m = raw.match(TASK_RE);
  if (!m) return null;
  let text = m[3].replace(DONE_RE, '').replace(/\s+$/, '');
  if (done) text += ` ✅ ${today}`;
  lines[line] = `${m[1]}[${done ? 'x' : ' '}] ${text}`;
  return { md: (bom ? '﻿' : '') + lines.join(nl), raw: lines[line] };
}

// display text: without the date markers (they are shown separately)
const cleanText = (t) => t.replace(/\s*(📅|✅|⏳|🛫|➕)\s*\d{4}-\d{2}-\d{2}/g, '').trim();

module.exports = { parseTasks, toggleTask, cleanText };
