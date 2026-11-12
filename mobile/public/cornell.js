// Cornell notes kept as one plain string (the server and the organizer still see a single "notes" text).
// Loaded by index.html as a plain script and by test/cornell.test.js through require().
(function (root) {
  const HEAD = { cues: '## 🔑 線索', notes: '## ✏️ 筆記', sum: '## 📝 總結' };
  const KEY = { 線索: 'cues', 筆記: 'notes', 總結: 'sum' };
  // lenient on the emoji (variation selectors differ between keyboards), strict on the word
  const headOf = (line) => { const m = /^##\s*(?:[^\s\w#一-鿿]+\s*)?(線索|筆記|總結)\s*$/.exec(line.trim()); return m ? KEY[m[1]] : null; };

  // text -> { cues, notes, sum }; text without any section heading is all "notes", untouched
  function parse(text) {
    const s = String(text || ''), out = { cues: [], notes: [], sum: [] };
    const lines = s.split(/\r?\n/);
    if (!lines.some((l) => headOf(l))) return { cues: '', notes: s, sum: '' };
    let cur = 'notes';
    for (const l of lines) { const h = headOf(l); if (h) cur = h; else out[cur].push(l); }
    const join = (a) => a.join('\n').trim();
    return { cues: join(out.cues), notes: join(out.notes), sum: join(out.sum) };
  }

  // only the notes section used -> the plain text itself, so notes written without cues stay as they were
  function serialize(p) {
    const cues = String(p.cues || '').trim(), sum = String(p.sum || '').trim(), notes = String(p.notes || '');
    if (!cues && !sum) return notes;
    return [['cues', cues], ['notes', notes.trim()], ['sum', sum]].filter(([, v]) => v).map(([k, v]) => HEAD[k] + '\n' + v).join('\n\n') + '\n';
  }

  // selected text -> one Markdown quote block (blank lines dropped, long selections cut)
  function quote(text, max = 600) {
    let s = String(text || '').replace(/\r/g, '').trim();
    if (s.length > max) s = s.slice(0, max).trimEnd() + '…';
    return s.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => '> ' + l).join('\n');
  }
  // selected text -> one cue line
  function cue(text, max = 120) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max).trimEnd() + '…' : s;
  }
  // add a block after what is already written, separated by `gap` line breaks
  function append(cur, add, gap = 2) {
    const a = String(cur || '').replace(/\s+$/, '');
    return (a ? a + '\n'.repeat(gap) : '') + add + '\n';
  }

  const api = { HEAD, parse, serialize, quote, cue, append };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Cornell = api;
})(typeof self !== 'undefined' ? self : this);
