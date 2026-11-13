// Formulas in Markdown: pull them out before the Markdown is rendered (their _ * \ | would be mangled), put the drawn formula back after.
// Loaded by index.html as a plain script and by test/mathmd.test.js through require(). Drawing itself is KaTeX's job (katex.min.js).
(function (root) {
  const OPEN = '\uE000', CLOSE = '\uE001', C0 = '\uE002', C1 = '\uE003';

  // md -> { text, items }: every formula becomes a marker, items[i] = { tex, display, raw }
  // $$…$$ and \[…\] are formulas on their own line; $…$ and \(…\) sit inside a sentence. Code blocks and `code` are left alone.
  function extract(md) {
    const items = [], put = (tex, display, raw) => { items.push({ tex: tex.trim(), display, raw }); return OPEN + (items.length - 1) + CLOSE; };
    const chunk = (s) => {
      const codes = [];
      s = s.replace(/`[^`\n]+`/g, (m) => { codes.push(m); return C0 + (codes.length - 1) + C1; });
      const whole = (m, tex) => (/\n[ \t]*\n/.test(tex) || !tex.trim() ? m : put(tex, true, m));          // a blank line inside: not a formula
      s = s.replace(/\$\$([\s\S]+?)\$\$/g, whole).replace(/\\\[([\s\S]+?)\\\]/g, whole);
      s = s.replace(/\\\(([^\n]+?)\\\)/g, (m, tex) => put(tex, false, m));
      // $…$: no space just inside the signs and no digit right after the closing one, so "$5 and $10" stays money
      s = s.replace(/(^|[^\\$\w])\$(?![\s$])([^$\n]{1,400}?)\$(?![\d$])/g, (m, pre, tex) => (/[\s\\]$/.test(tex) ? m : pre + put(tex, false, m.slice(pre.length))));
      return s.replace(new RegExp(C0 + '(\\d+)' + C1, 'g'), (_, i) => codes[+i]);
    };
    const out = []; let buf = [], fence = false;
    const flush = () => { if (buf.length) { out.push(chunk(buf.join('\n'))); buf = []; } };
    for (const line of String(md == null ? '' : md).replace(/\r/g, '').split('\n')) {
      if (/^\s*```/.test(line)) { if (!fence) flush(); out.push(line); fence = !fence; continue; }
      if (fence) out.push(line); else buf.push(line);
    }
    flush();
    return { text: out.join('\n'), items };
  }

  // rendered HTML -> the same with every marker replaced by draw(tex, display); a marker alone in a paragraph loses the <p> around it
  function restore(html, items, draw) {
    const one = (i) => { const it = items[+i]; return it ? draw(it.tex, it.display, it.raw) : ''; };
    return String(html).replace(new RegExp('<p>\\s*' + OPEN + '(\\d+)' + CLOSE + '\\s*</p>', 'g'), (m, i) => (items[+i] && items[+i].display ? one(i) : m))
      .replace(new RegExp(OPEN + '(\\d+)' + CLOSE, 'g'), (_, i) => one(i));
  }

  // what a drawn formula was written as (for quoting it into the notes): $…$ or $$…$$
  const source = (tex, display) => (display ? '$$' + tex + '$$' : '$' + tex + '$');

  const api = { extract, restore, source };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Mathmd = api;
})(typeof self !== 'undefined' ? self : this);
