// formulas in Markdown: found before rendering, put back after
const M = require('../public/mathmd.js');
function assert(c, m) { if (c) console.log('ok  ', m); else { console.log('FAIL', m); process.exitCode = 1; } }
// in the order they stand in the text (formulas on their own line are collected first)
const texs = (md) => { const e = M.extract(md); return [...e.text.matchAll(/\uE000(\d+)\uE001/g)].map((m) => e.items[+m[1]]).map((x) => (x.display ? 'D:' : 'I:') + x.tex); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

assert(same(texs('時間是 $$T_{串流} = \\frac{L}{\\min(R_1, R_2, \\cdots)}$$'), ['D:T_{串流} = \\frac{L}{\\min(R_1, R_2, \\cdots)}']), 'a $$…$$ formula with Chinese subscripts is found whole');
assert(same(texs('速率 $R = 8$ bits，再乘 $x_1 * x_2$。'), ['I:R = 8', 'I:x_1 * x_2']), 'two $…$ formulas in one sentence');
assert(same(texs('$$\n\\int_0^1 x^2\\,dx\n= \\frac{1}{3}\n$$'), ['D:\\int_0^1 x^2\\,dx\n= \\frac{1}{3}']), 'a formula over several lines');
assert(same(texs('寫成 \\(a^2+b^2\\) 或 \\[ E = mc^2 \\]'), ['I:a^2+b^2', 'D:E = mc^2']), '\\(…\\) and \\[…\\] are formulas too');

assert(texs('一杯 $5 和一份 $10 的套餐').length === 0, 'two prices in a sentence are not a formula');
assert(texs('從 $5到$10 都有').length === 0, 'prices without spaces are not a formula');
assert(texs('花了 US$5 和 NT$120').length === 0, 'a currency sign after letters is not a formula');
assert(texs('只有一個 $ 符號').length === 0, 'a lone dollar sign is left alone');
assert(texs('$$\n\n空行\n\n$$').length === 0 && texs('$$ $$').length === 0, 'empty or broken-up $$ is not a formula');
assert(texs('變數 `$x$` 和 `a $$b$$ c`').length === 0, 'inline code is left alone');
const fenced = '前面 $a$\n```bash\necho $HOME $PATH\nx=$$\n```\n後面 $b$';
assert(same(texs(fenced), ['I:a', 'I:b']) && M.extract(fenced).text.includes('echo $HOME $PATH\nx=$$'), 'a fenced code block is left alone, formulas around it are found');
assert(M.extract('沒有公式的 **文字** 和 [[連結|別名]]').text === '沒有公式的 **文字** 和 [[連結|別名]]', 'text without formulas is unchanged');
assert(M.extract(null).text === '' && M.extract('a\r\nb').text === 'a\nb', 'empty input and CRLF are fine');

const ex = M.extract('| 欄 | 式 |\n|---|---|\n| a | $x|y$ |');
assert(ex.items.length === 1 && !/\$/.test(ex.text) && ex.text.split('\n')[2].split('|').length === 4, 'a | inside a formula no longer splits the table cell');
assert(!/[_*\\]/.test(M.extract('$a_1 * b_2 \\cdot c$').text), 'nothing of the formula is left for Markdown to mangle');

const draw = (tex, d) => (d ? '<div>[' + tex + ']</div>' : '<span>[' + tex + ']</span>');
const e2 = M.extract('式子 $a$\n\n$$b$$');
const html = e2.text.split('\n\n').map((p) => '<p>' + p + '</p>').join('\n');
assert(M.restore(html, e2.items, draw) === '<p>式子 <span>[a]</span></p>\n<div>[b]</div>', 'drawn formulas go back in place; one on its own line is not left inside a paragraph');
assert(M.restore('<p>x \uE0009\uE001</p>', [], draw) === '<p>x </p>', 'a marker without a formula disappears instead of showing');
assert(e2.items.find((x) => x.tex === 'b').raw === '$$b$$' && e2.items.find((x) => x.tex === 'a').raw === '$a$', 'the original writing is kept for when the formula cannot be drawn');
assert(M.source('a', false) === '$a$' && M.source('b', true) === '$$b$$', 'a formula is quoted back as it is written in Markdown');
