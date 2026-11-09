// The browser's markdown renderer (public/app.js): extracted and run in Node on samples and on every note in a vault.
// Usage: node test/render.test.js [vault folder to render every note from]
'use strict';
const fs = require('fs'), path = require('path');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const grab = (name) => {
  const i = src.indexOf('function ' + name + '('); let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) return src.slice(i, k + 1); }
};
const escLine = src.match(/const esc = [^\n]+/)[0];
const renderMd = new Function(escLine + '\n' + grab('inline') + '\n' + grab('renderMd') + '\nreturn renderMd;')();

const html = renderMd('# 標題\n1. 第一\n2. 第二\n   - 子項\n- [ ] 待辦\n> [!note] 提示\n> 內容 [[WireGuard]]\n\n```js\nconst a = "<b>";\n```\n| 欄A | 欄B |\n|---|---|\n| 1 | [[專案/計畫|計畫]] |\n![[pic.png]]\n![[文件.pdf]]\n<script>alert(1)</script>');
assert(/<ol>\s*<li>第一<\/li>\s*<li>第二<\/li>\s*<ul>\s*<li>子項<\/li>/.test(html), 'ordered list with nested bullet');
assert(html.includes('<li class="task">☐ 待辦</li>'), 'task item');
assert(html.includes('<blockquote class="callout">') && html.includes('<strong>提示</strong>') && html.includes('data-link="WireGuard"'), 'callout with link');
assert(html.includes('<pre><code>const a = &quot;&lt;b&gt;&quot;;</code></pre>'), 'code block escaped');
assert(html.includes('<th>欄A</th>') && html.includes('data-link="專案/計畫">計畫</a>'), 'table with aliased link');
assert(html.includes('src="/api/vault/raw?name=pic.png"'), 'image embed resolved through the vault');
assert(html.includes('data-link="文件.pdf">📎 文件.pdf'), 'non-image embed becomes a link');
assert(!html.includes('<script>') && html.includes('&lt;script&gt;'), 'raw HTML escaped');

const vault = process.argv[2];
if (vault) {
  let n = 0;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.md')) { renderMd(fs.readFileSync(p, 'utf8')); n++; } } };
  walk(vault);
  assert(n > 0, `rendered ${n} real notes without errors`);
}
