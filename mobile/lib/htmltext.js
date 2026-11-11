// HTML teaching material -> readable text (Markdown-ish), no dependencies.
// Handles: the page's charset (UTF-8, Big5 and others via TextDecoder, e.g. Word "save as web page" in Big5),
// scripts / styles / comments / Word (mso) junk, headings, lists, tables, line breaks, links, entities.
'use strict';

// bytes -> string, honouring a BOM, <meta charset> / http-equiv, then UTF-8 with a Big5 fallback
function decode(buf) {
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return buf.slice(3).toString('utf8');
  if (buf[0] === 0xFF && buf[1] === 0xFE) return new TextDecoder('utf-16le').decode(buf.slice(2));
  if (buf[0] === 0xFE && buf[1] === 0xFF) return new TextDecoder('utf-16be').decode(buf.slice(2));
  const head = buf.slice(0, 4096).toString('latin1');
  const m = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i);
  const label = m ? m[1].toLowerCase() : '';
  if (label && !/^utf-?8$/.test(label)) { try { return new TextDecoder(label).decode(buf); } catch {} }
  const utf = new TextDecoder('utf-8').decode(buf);
  if (label) return utf;
  // no charset declared: if UTF-8 gives many replacement characters, it is probably Big5
  const bad = (utf.match(/�/g) || []).length;
  if (bad > 3 && bad > utf.length / 200) { try { const b5 = new TextDecoder('big5').decode(buf); if ((b5.match(/�/g) || []).length < bad) return b5; } catch {} }
  return utf;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ', middot: '·', bull: '•', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', times: '×', divide: '÷', deg: '°', plusmn: '±', le: '≤', ge: '≥', ne: '≠', rarr: '→', larr: '←', uarr: '↑', darr: '↓' };
const entities = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return all; } }
  return Object.prototype.hasOwnProperty.call(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : all;
});
const inline = (s) => entities(s.replace(/<[^>]+>/g, '')).replace(/[ \t \r\n]+/g, ' ').trim();

function toText(html) {
  let s = String(html || '');
  const title = inline((s.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[if[\s\S]*?<!\[endif\]>/gi, '')
    .replace(/<(script|style|head|noscript|template|svg|xml|o:p)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(script|style|o:p)\b[^>]*\/?>/gi, ' ');
  // tables -> Markdown tables (cells flattened to one line)
  s = s.replace(/<table\b[\s\S]*?<\/table>/gi, (t) => {
    const rows = [...t.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => inline(c[1]).replace(/\|/g, '｜'))).filter((r) => r.some(Boolean));
    if (!rows.length) return '\n';
    const w = Math.max(...rows.map((r) => r.length));
    const line = (r) => '| ' + Array.from({ length: w }, (_, i) => r[i] || '').join(' | ') + ' |';
    return '\n\n' + [line(rows[0]), '|' + ' --- |'.repeat(w), ...rows.slice(1).map(line)].join('\n') + '\n\n';
  });
  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, t) => `\n\n${'#'.repeat(+n)} ${inline(t)}\n\n`)
    .replace(/<li\b[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '')
    .replace(/<a\b[^>]*href\s*=\s*["']?(https?:[^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi, (_, u, t) => { const x = inline(t); return x && x !== u ? `[${x}](${u})` : u; })
    .replace(/<img\b[^>]*alt\s*=\s*["']([^"']+)["'][^>]*>/gi, ' （圖：$1） ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|section|article|header|footer|main|ul|ol|dl|dt|dd|blockquote|pre|tr|table|hr|h[1-6]|center|form|fieldset)\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '');
  s = entities(s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return (title && !s.startsWith('# ') && !s.includes(title) ? `# ${title}\n\n` : '') + s;
}

module.exports = { decode, toText };
