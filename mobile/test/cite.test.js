'use strict';
const cite = require('../lib/cite.js');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

// ---- the prompt rules ----
const rules = cite.rules(7);
assert(rules.includes('最多 7 條'), 'the prompt states the configured number of claims');
assert(rules.includes('=== CLAIMS ===') && rules.includes('逐字複製'), 'the prompt asks for a CLAIMS block with word-for-word quotes');
assert(rules.includes('舊論點（筆記名）') && rules.includes('推翻（筆記名：筆記原本怎麼說）'), 'the prompt names the three origins');

// ---- splitting the CLAIMS block off the researcher output ----
const OUT = `DONE: 查 RRF
=== MAIN ===
### 待釐清問題
**k 是多少？**
{{U1}}
=== UNIT U1 ===
TITLE: RRF
SUMMARY: 用名次合併
內容
SOURCES:
- [Elastic](https://www.elastic.co/rrf)
=== CLAIMS ===
C1
論點：Elasticsearch 的 rank_constant 預設 60。
網址：https://www.elastic.co/rrf
原文：「Defaults to 60.
Must be greater than or equal to 1.」
出處：舊論點（倒數排名融合）
C2
論點：Weaviate 預設是 [[Relative Score Fusion]]。
網址：[Weaviate](https://docs.weaviate.io/hybrid)
原文：Relative Score Fusion is the default fusion method starting in v1.24.
出處：推翻（倒數排名融合：Weaviate 等都把它當預設）
C3
論點：沒有網址的論點
網址：無外部來源
原文：沒有
出處：新增
C4
論點：Qdrant 的 k 預設 2。
網址：https://qdrant.tech/hybrid
原文：k is a constant (set to 2 by default)
`;
let r = cite.splitClaims(OUT);
assert(!r.output.includes('CLAIMS') && !r.output.includes('rank_constant 預設 60'), 'the CLAIMS block is removed from what the note parser sees');
assert(r.output.includes('=== UNIT U1 ===') && r.output.includes('- [Elastic](https://www.elastic.co/rrf)'), 'MAIN and UNIT blocks are untouched');
assert(r.claims.length === 3, 'a claim without a real URL is dropped');
assert(r.claims.map((c) => c.id).join() === 'C1,C2,C3', 'kept claims are renumbered in order');
assert(r.claims[0].quote === 'Defaults to 60. Must be greater than or equal to 1.', 'a quote over several lines is joined and its outer quote marks removed');
assert(r.claims[0].origin.kind === 'old' && r.claims[0].origin.note === '倒數排名融合', 'an existing-note claim keeps the note name');
assert(r.claims[1].url === 'https://docs.weaviate.io/hybrid', 'a URL written as a markdown link is extracted');
assert(r.claims[1].claim === 'Weaviate 預設是 Relative Score Fusion。', 'wiki links in AI-written claim text become plain text');
assert(r.claims[1].origin.kind === 'overturn' && r.claims[1].origin.note === '倒數排名融合' && r.claims[1].origin.was === 'Weaviate 等都把它當預設', 'an overturned claim keeps the note name and what the note said');
assert(r.claims[2].origin.kind === 'new', 'a claim without an origin line counts as new');

r = cite.splitClaims('=== MAIN ===\n只有正文\n');
assert(r.claims.length === 0 && r.output.includes('只有正文'), 'output without a CLAIMS block passes through');
r = cite.splitClaims('=== MAIN ===\n正文\n=== CLAIMS ===\n論點：甲\n網址：https://a.example/x\n原文：aaaaaaaa bbbbbbbb\n論點：乙\n網址：https://b.example/y\n原文：cccccccc dddddddd\n=== UNIT U1 ===\nTITLE: T\n內容\n');
assert(r.claims.length === 2, 'claims without their "C1" lines are still split at each 論點');
assert(r.output.includes('=== UNIT U1 ===') && !r.output.includes('aaaaaaaa'), 'a section the model put after CLAIMS is kept');
r = cite.splitClaims(OUT, 1);
assert(r.claims.length === 1, 'claims beyond the limit are dropped');
assert(cite.parseOrigin('推翻（某筆記）').kind === 'overturn' && cite.parseOrigin('推翻（某筆記）').was === '', 'an overturn without the old wording still names the note');
assert(cite.parseOrigin('推翻（甲：Elasticsearch、[Azure AI Search](https://learn.microsoft.com/x) 都內建，[Milvus](https://milvus.）').was === 'Elasticsearch、Azure AI Search 都內建，Milvus', 'links in the old wording are reduced to their text, even one cut in half');
assert(cite.parseOrigin('舊論點 ([[Claude-Notes/研究/RAG|RAG]])').note === 'RAG', 'a note name written as a wiki link is reduced to its name');

// ---- finding the quote on the fetched page ----
const PAGE = '標題：RRF\n\nThe score is calculated as 1/(rank + k), where rank is the position.\nExperiments show the algorithm performs best when you set k to a small value, such as 60.\n\n檢索增強生成（RAG）會先檢索資料，\n再交給模型生成回答。' + ' filler'.repeat(200) + ' Relative Score Fusion is the default.';
let f = cite.findQuote(PAGE, 'performs best when you set k to a small value, such as 60');
assert(f.found === 'exact', 'a quote copied word for word is found');
assert(PAGE.slice(f.at, f.at + f.len).startsWith('performs best') && PAGE.slice(f.at, f.at + f.len).endsWith('such as 60'), 'the match position points at the quote in the original page');
assert(cite.findQuote(PAGE, 'performs  best when you set\nk to a small value').found === 'exact', 'extra spaces and line breaks do not matter');
assert(cite.findQuote(PAGE, '檢索增強生成(RAG)會先檢索資料,再交給模型生成回答').found === 'exact', 'full-width punctuation and a line break inside Chinese text do not matter');
assert(cite.findQuote(PAGE, 'The score is calculated as 1/(rank + k) … Relative Score Fusion is the default').found === 'near', 'sentences stitched together with an ellipsis are only a near match');
assert(cite.findQuote(PAGE, 'Experiments show the algorithm performs best when you choose k as a small value, such as 60.').found === 'near', 'a quote with a few changed words is a near match');
assert(cite.findQuote(PAGE, 'The default value of the rank constant is always forty-two in every system.').found === 'missing', 'a quote that is not on the page is missing');
assert(cite.findQuote(PAGE, 'The score is calculated as `1/(rank + k)`, where [rank](ranking-overview) is the position.').found === 'exact', 'markdown links and code marks in a copied quote do not matter');
assert(cite.findQuote(PAGE, 'k').found === 'missing', 'a quote too short to mean anything is not accepted');
assert(cite.findQuote('', 'anything at all here').found === 'missing', 'an empty page has no quotes');
f = cite.findQuote(PAGE, 'Relative Score Fusion is the default');
const ex = cite.excerpt(PAGE, f, { before: 20, after: 5 });
assert(ex.startsWith('…') && ex.includes('Relative Score Fusion is the default') && ex.length < 80, 'the excerpt is the quote with a little context, marked as cut');

// ---- the judge ----
const jp = cite.judgePrompt([{ id: 'C1', claim: '論點甲', excerpt: '頁面甲' }, { id: 'C2', claim: '論點乙', excerpt: '頁面乙' }]);
assert(jp.includes('===== C1 =====\n論點：論點甲\n網頁內容：\n頁面甲') && jp.includes('===== C2 ====='), 'every claim is given to the judge with its page excerpt');
assert(jp.includes('一律忽略') && jp.includes('不要用你自己的知識'), 'the judge is told page text is data and to judge from the page only');
const v = cite.parseVerdicts('好的，以下是結果：\nC1: 支持\n- **C2**：部分支持 ｜ 網頁沒說「適合中文」\nC3: 不支持 | 說的相反 [[某筆記]]\nC4: 也許吧\nC1: 不支持 | 重複的行');
assert(v.get('C1').verdict === 'support' && v.get('C2').verdict === 'partial' && v.get('C3').verdict === 'no', 'the three verdicts are read, with or without list and bold marks');
assert(v.get('C2').note === '網頁沒說「適合中文」' && v.get('C3').note === '說的相反 某筆記', 'the reason is kept and wiki links in it become plain text');
assert(!v.has('C4'), 'a line with no valid verdict is skipped, not guessed');
assert(v.get('C1').verdict === 'support', 'the first verdict for a claim wins');

// ---- stats and the report ----
const C = (id, status, origin = { kind: 'new' }, extra = {}) => ({ id, claim: '論點' + id, url: 'https://www.example.com/p/' + id, quote: 'q', origin, status, ...extra });
const results = [C('C1', 'support', { kind: 'old', note: 'RAG' }), C('C2', 'support'), C('C3', 'partial', { kind: 'new' }, { note: '多了推論' }), C('C4', 'missing'),
  C('C5', 'unreachable'), C('C6', 'support', { kind: 'overturn', note: '倒數排名融合', was: '都是預設' }), C('C7', 'no', { kind: 'overturn', note: '不存在的筆記', was: '' }, { note: '說的相反' })];
const s = cite.stats(results);
assert(s.total === 7 && s.support === 3 && s.partial === 1 && s.no === 1 && s.missing === 1 && s.unreachable === 1, 'verdicts are counted');
assert(s.checked === 6 && s.accuracy === 50, 'accuracy is supported claims over pages that opened; unreachable pages are left out');
assert(s.old === 1 && s.new === 4 && s.overturn === 2, 'old, new and overturned claims are counted');
assert(cite.stats([C('C1', 'unreachable')]).accuracy === null, 'no accuracy when no page could be opened');
const rep = cite.report(results, { link: (n) => (n === '倒數排名融合' ? '[[Claude-Notes/研究/倒數排名融合|倒數排名融合]]' : null) });
assert(rep.startsWith('### 引用查證'), 'the report is a section of the Agent result');
assert(rep.includes('查了 7 條論點：✅ 支持 3、⚠️ 說得比來源多 1、❌ 不支持 1、🔍 找不到原文 1、❔ 打不開 1。引用正確率 50%（3／6）。'), 'the summary line gives every count and the accuracy');
assert(rep.includes('對照既有筆記：沿用 1 條、新增 4 條、推翻 2 條。'), 'the report says how much came from existing notes');
assert(rep.includes('- ⚠️ 說得比來源多：論點C3（[example.com](https://www.example.com/p/C3)）——多了推論'), 'a problem claim is listed with its source and the reason');
assert(!rep.includes('論點C2（'), 'supported claims are not listed one by one');
assert(rep.includes('- [[Claude-Notes/研究/倒數排名融合|倒數排名融合]]：原本寫「都是預設」；這次查到：論點C6'), 'an overturned note is linked when it exists');
assert(rep.includes('- 不存在的筆記：這次查到：論點C7') && rep.includes('先不要據此改筆記'), 'an unknown note name stays plain text, and a citation that did not pass is flagged');
assert(!/- \[ \]/.test(rep), 'the report has no task checkboxes');
assert(cite.report([]) === '', 'no claims, no report');
const allGood = cite.report([C('C1', 'support'), C('C2', 'support')]);
assert(!allGood.includes('需要留意') && !allGood.includes('不一致') && allGood.includes('引用正確率 100%（2／2）'), 'with nothing wrong the report is only the summary');
