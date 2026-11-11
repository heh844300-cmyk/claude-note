// HTML teaching material -> text: charsets (UTF-8, Big5), structure, junk removal.
'use strict';
const H = require('../lib/htmltext');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const page = `<!doctype html><html><head><meta charset="utf-8"><title>第三章 交易</title><style>.x{color:red}</style><script>alert('x')</script></head>
<body><!-- 註解 --><h1>第三章 交易</h1><p>ACID 指&nbsp;<b>原子性</b>、一致性、隔離性、持久性。</p>
<ul><li>原子性：全有或全無</li><li>隔離性：彼此&lt;不干擾&gt;</li></ul>
<table><tr><th>等級</th><th>髒讀</th></tr><tr><td>Read Uncommitted</td><td>會</td></tr><tr><td>Serializable</td><td>不會</td></tr></table>
<p>參考 <a href="https://example.com/acid">ACID 說明</a><br>第二行 &#x2192; &#8805;</p><img src="a.png" alt="交易流程圖"></body></html>`;
const t = H.toText(H.decode(Buffer.from(page, 'utf8')));
assert(t.startsWith('# 第三章 交易') && t.split('第三章 交易').length === 2, 'title once (as the h1)');
assert(t.includes('ACID 指 原子性、一致性') && t.includes('- 原子性：全有或全無') && t.includes('彼此<不干擾>'), 'paragraphs, list items, entities');
assert(t.includes('| 等級 | 髒讀 |\n| --- | --- |\n| Read Uncommitted | 會 |'), 'table -> Markdown table');
assert(t.includes('[ACID 說明](https://example.com/acid)') && t.includes('第二行 → ≥') && t.includes('（圖：交易流程圖）'), 'links, numeric entities, image alt text');
assert(!/alert|color:red|註解|<|>{2}/.test(t.replace(/彼此<不干擾>/, '')), 'scripts, styles, comments and tags gone');

// Big5 (e.g. Word "save as web page"), declared and undeclared
const big5 = (s) => { // encode with a tiny table: enough characters for the test
  const map = { '資': [0xB8, 0xEA], '料': [0xAE, 0xC6], '庫': [0xAE, 0x77], '正': [0xA5, 0xBF], '規': [0xB3, 0x57], '化': [0xA4, 0xC6] };
  const out = []; for (const ch of s) { if (map[ch]) out.push(...map[ch]); else out.push(...Buffer.from(ch, 'latin1')); } return Buffer.from(out);
};
const declared = Buffer.concat([Buffer.from('<html><head><meta http-equiv="Content-Type" content="text/html; charset=big5"></head><body><p>', 'latin1'), big5('資料庫正規化'), Buffer.from('</p></body></html>', 'latin1')]);
assert(H.toText(H.decode(declared)) === '資料庫正規化', 'Big5 declared in <meta http-equiv>');
const undeclared = Buffer.concat([Buffer.from('<html><body><p>', 'latin1'), big5('資料庫正規化資料庫正規化資料庫正規化'), Buffer.from('</p></body></html>', 'latin1')]);
assert(H.toText(H.decode(undeclared)) === '資料庫正規化資料庫正規化資料庫正規化', 'Big5 without a declaration is detected');
assert(H.toText(H.decode(Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('<p>中文</p>')]))) === '中文', 'UTF-8 BOM');

// Word-exported junk
const word = '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><!--[if gte mso 9]><xml><o:DocumentProperties>x</o:DocumentProperties></xml><![endif]--></head><body><p class=MsoNormal>重點一<o:p></o:p></p><![if !supportLists]><span>1.</span><![endif]><p>重點二</p></body></html>';
assert(H.toText(word) === '重點一\n\n重點二', 'Word (mso) markup removed');
