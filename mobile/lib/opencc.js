// Simplified → Taiwan Traditional, following OpenCC's s2twp chain (Apache-2.0; tables in lib/opencc/, see LICENSE there):
//   1. simplified → traditional: STPhrases, then STCharacters
//   2. traditional → Taiwan usage: TWPhrases (e.g. 數據 → 資料, 軟件 → 軟體), then TWVariants (e.g. 僞 → 偽)
// Each stage is longest-phrase-first, then single characters. Pure functions; the tables are passed in as text.
'use strict';

function parseTable(text) {
  const map = new Map();
  for (const line of String(text || '').replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const tab = line.indexOf('\t');
    if (tab < 1) continue;
    const from = line.slice(0, tab);
    // several alternatives may follow; the first one is the usual choice
    const to = line.slice(tab + 1).trim().split(/\s+/)[0];
    if (to && !map.has(from)) map.set(from, to);
  }
  return map;
}

function stage(P, C) {
  let maxLen = 1;
  for (const k of P.keys()) if (k.length > maxLen) maxLen = k.length;
  return (s) => {
    let out = '';
    for (let i = 0; i < s.length;) {
      let hit = false;
      for (let n = Math.min(maxLen, s.length - i); n >= 2; n--) {
        const to = P.get(s.slice(i, i + n));
        if (to) { out += to; i += n; hit = true; break; }
      }
      if (hit) continue;
      const ch = s[i];
      out += C.get(ch) || ch;
      i++;
    }
    return out;
  };
}

function createConverter({ phrases = '', chars = '', twPhrases = '', twVariants = '' } = {}) {
  const P = parseTable(phrases), C = parseTable(chars), TP = parseTable(twPhrases), TV = parseTable(twVariants);
  const toTrad = stage(P, C);
  const toTW = stage(TP, TV);
  // without the simplified-to-traditional tables nothing can be converted: callers must not treat the text as already converted
  const ready = P.size > 0 && C.size > 0;
  return { ready, convert: (text) => toTW(toTrad(String(text || ''))), sizes: { phrases: P.size, chars: C.size, twPhrases: TP.size, twVariants: TV.size } };
}

module.exports = { createConverter, parseTable };
