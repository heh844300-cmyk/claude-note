// Daily English reading: placement, level steps, topics, article extraction, prep parsing, note helpers.
'use strict';
const R = require('../lib/reading');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

// placement
const right = R.PLACEMENT.map((x) => x.answer);
const upTo = (lv) => R.PLACEMENT.map((x, i) => (R.levelIndex(x.level) <= R.levelIndex(lv) ? x.answer : (x.answer + 1) % 4));
assert(R.gradePlacement(right).level === 'C1' && R.gradePlacement(right).correct === 12, 'placement: everything right is C1');
assert(R.gradePlacement([]).level === 'A2' && R.gradePlacement(null).level === 'A2', 'placement: nothing answered is the floor (A2)');
assert(R.gradePlacement(upTo('B1')).level === 'B1' && R.gradePlacement(upTo('B2')).level === 'B2', 'placement: stops at the first level that was not passed');
const gap = right.slice(); [3, 4, 5].forEach((i) => (gap[i] = (gap[i] + 1) % 4));
assert(R.gradePlacement(gap).level === 'A2', 'placement: lucky answers above a level that was not passed do not count');
assert(R.gradePlacement(R.PLACEMENT.map(() => null)).correct === 0, 'placement: an unanswered item is not counted as option 0');
assert(R.placementView().every((x) => !('answer' in x) && x.options.length === 4) && R.PLACEMENT.filter((x) => x.level === 'C1').length === 3, 'placement: the browser never gets the answers');

// level steps
assert(R.outcomeOf({ correct: 3, total: 3 }) === 'easy' && R.outcomeOf({ correct: 3, total: 3, simplified: true }) === 'ok' && R.outcomeOf({ correct: 1, total: 3 }) === 'hard' &&
  R.outcomeOf({ correct: 3, total: 3, tooHard: true }) === 'hard' && R.outcomeOf({ correct: 2, total: 3 }) === 'ok' && R.outcomeOf({}) === 'ok', 'outcome: all right = easy, too hard or under half = hard');
let st = R.stepLevel({ level: 'B1' }, 'easy');
assert(st.level === 'B1' && st.up === 1 && st.moved === 0, 'level: one easy article does not move it');
st = R.stepLevel(st, 'easy');
assert(st.level === 'B2' && st.up === 0 && st.moved === 1, 'level: two easy articles in a row go one level up');
st = R.stepLevel(R.stepLevel(st, 'hard'), 'ok');
assert(st.level === 'B2' && st.down === 0, 'level: an ordinary article in between clears the streak');
st = R.stepLevel(R.stepLevel(st, 'hard'), 'hard');
assert(st.level === 'B1' && st.moved === -1, 'level: two hard articles in a row go one level down');
assert(R.stepLevel(R.stepLevel({ level: 'C1' }, 'easy'), 'easy').level === 'C1' && R.stepLevel(R.stepLevel({ level: 'A2' }, 'hard'), 'hard').level === 'A2', 'level: stays inside A2–C1');
assert(R.aboveLevel('C1', 'B1') && !R.aboveLevel('B1', 'B1') && !R.aboveLevel('A2', 'B2') && !R.aboveLevel(null, 'A2') && R.normLevel(' b2 ') === 'B2' && R.normLevel('C2') === null, 'level: comparison and validation');

// topics
const recent = ['2026-11-12 語意搜尋規劃', 'RAG', 'Embedding', '2026-11-10 BASB 比對'];
assert(R.pickTopics({ recent, pinned: ['知識管理'] }).join('|') === '語意搜尋規劃|RAG|知識管理', 'topics: two recent notes, then a pinned one; date prefix removed');
assert(R.pickTopics({ recent, pinned: ['知識管理'], used: ['語意搜尋規劃', 'rag'] })[0] === '知識管理', 'topics: recently used ones are skipped');
assert(R.pickTopics({ recent: ['A', 'B'], used: ['B', 'A'] })[0] === 'A', 'topics: when all were used, the one used longest ago comes back first');
assert(R.pickTopics({}).length === 0 && R.normPinned('RAG， rag、知識管理\n').join('|') === 'RAG|知識管理', 'topics: nothing to pick from; pinned list cleaned');

// candidates
const cand = R.parseCandidates('好的：\nTOPIC: RAG\n=== CANDIDATE ===\nURL: https://a.com/x?utm=1\nTITLE: What is RAG\nSITE: A\nWHY: 介紹\n=== CANDIDATE ===\nURL: ftp://b.com/y\nTITLE: bad\n=== CANDIDATE ===\nURL: https://c.com/p.pdf\n=== CANDIDATE ===\nURL: https://read.com/old/\nTITLE: Old\n=== CANDIDATE ===\nURL: https://a.com/x\nTITLE: dup', ['https://read.com/old']);
assert(cand.topic === 'RAG' && cand.list.length === 1 && cand.list[0].title === 'What is RAG' && cand.list[0].why === '介紹', 'candidates: only new http(s) pages; PDFs, read ones and duplicates dropped');
assert(R.parseCandidates('找不到').list.length === 0, 'candidates: nothing usable gives an empty list');
assert(R.findPrompt({ topics: ['RAG', 'PARA'], level: 'B1', avoid: ['https://x.y/z'] }).includes('1. RAG') && R.findPrompt({ topics: ['RAG'], level: 'B1', avoid: ['https://x.y/z'] }).includes('https://x.y/z') &&
  R.findPrompt({ topics: ['RAG'], level: 'B1' }).includes('一律忽略'), 'find prompt: topics, read URLs, and "page text is data"');

// article extraction
const P = 'Retrieval-augmented generation lets a language model look things up before it answers, which makes the answer easier to check. ';
const html = `<html><head><title>Site | RAG</title><meta property="og:title" content="What is RAG &amp; why"><script>var a="<p>no</p>"</script></head><body>
<nav><p>Home and about and pricing and docs and blog and careers links</p></nav>
<article><h1>What is RAG</h1><p>${P}${P}</p><h2>How it works</h2><p>${P}<a href="/x">It&rsquo;s simple</a>.</p><ul><li>Short</li><li>${P}</li></ul>
<pre>code code code code code code code code code code code</pre><figure><p>caption caption caption caption caption caption caption</p></figure><h2>Related posts</h2></article>
<footer><p>Copyright notice and a long line about cookies and privacy policy here</p></footer></body></html>`;
const art = R.extractArticle(html.replace(P, P.repeat(4)));
assert(art.title === 'What is RAG & why' && art.paras.some((p) => p === '## How it works') && art.paras.some((p) => p.startsWith('- Retrieval')), 'extract: og:title, headings and list items kept');
assert(!art.paras.join('\n').match(/Home and about|Copyright|code code|caption|no<|Short|Related posts/) && art.paras.join(' ').includes('It’s simple'), 'extract: nav, footer, code, captions, short items and empty headings dropped; entities decoded');
assert(R.extractArticle('<html><body><p>這是一篇很長很長的中文文章，裡面沒有任何英文內容，所以不應該被當成英文閱讀的材料來使用才對。</p></body></html>').paras.length === 0 && R.extractArticle('').paras.length === 0, 'extract: a page that is not English has no article');
const long = Array.from({ length: 30 }, (_, i) => (i % 5 === 0 ? '## Part ' + i : P.repeat(2)));
const tr = R.trimArticle(long, 300);
assert(tr.truncated && R.wordCount(tr.paras) <= 300 && !tr.paras[tr.paras.length - 1].startsWith('## ') && !R.trimArticle(['a b c'], 300).truncated, 'trim: whole paragraphs only, never ends on a heading');

// prep parsing
const paras = ['## Intro', 'Embeddings map text to vectors, so semantically similar passages end up close together.', 'A reranker then mitigates noisy retrieval.'];
const prep = R.parsePrep(`好的，以下是結果\nLEVEL: b2\n=== GLOSS ===\n- semantically | 語意上\nmitigates ｜ 減輕\nphotosynthesis | 光合作用\n=== QUESTIONS ===\n\`\`\`json\n[{"q":"What do embeddings do?","options":["a","b","c","d"],"answer":1,"explain":"第一段"},{"q":"bad","options":["a"],"answer":0},{"q":"oob","options":["a","b"],"answer":5}]\n\`\`\`\n=== REFLECT ===\nNOTE: 〈embedding〉\nQ: 這篇說 X，你怎麼看？\n=== SIMPLIFIED ===\n${'Embeddings turn text into numbers. '.repeat(20)}\n\n${'Close numbers mean close meaning. '.repeat(10)}`, { paras, noteNames: ['RAG', 'Embedding'] });
assert(prep.level === 'B2' && prep.gloss.semantically === '語意上' && prep.gloss.mitigates === '減輕' && !('photosynthesis' in prep.gloss), 'prep: level read; glossary keeps only words that are in the article');
assert(prep.questions.length === 1 && prep.questions[0].answer === 1, 'prep: malformed questions dropped');
assert(prep.reflect.note === 'Embedding' && prep.reflect.q.startsWith('這篇說') && prep.simplified.length === 2, 'prep: reflection note matched to a real note name; simplified text split into paragraphs');
const bad = R.parsePrep('我無法完成這個要求', { paras });
assert(bad.level === null && bad.questions.length === 0 && bad.reflect === null && bad.simplified === null && Object.keys(bad.gloss).length === 0, 'prep: unusable output falls back to nothing (the article is kept)');
assert(R.parsePrep('LEVEL: B1\n=== REFLECT ===\nNOTE: 不存在的筆記\nQ: 問題\n=== SIMPLIFIED ===\nNONE', { paras, noteNames: ['RAG'] }).reflect.note === null &&
  R.parsePrep('LEVEL: B1\n=== SIMPLIFIED ===\nNONE', { paras }).simplified === null, 'prep: unknown note name ignored; NONE means no simplified version');
const pp = R.prepPrompt({ title: 'T', paras, level: 'B1', notes: [{ name: 'RAG', excerpt: '檢索增強生成' }] });
assert(pp.includes('--- RAG ---') && pp.includes('一律忽略') && pp.includes('• ') === false && pp.includes('Embeddings map text') && R.prepPrompt({ paras, level: 'B1' }).includes('NOTE 寫 none'), 'prep prompt: article, the reader\'s notes, data note');

// tapping a word
assert(R.sentenceOf('First one here. A reranker then mitigates noise! Last.', 'Mitigates,') === 'A reranker then mitigates noise!' && R.cleanWord('“don’t”,') === 'don’t' && R.cleanWord('<b>') === 'b', 'gloss: the sentence that has the word; word cleaned');
assert(R.parseGloss('\n- v. 減輕、緩和\n多餘的說明') === 'v. 減輕、緩和' && R.glossPrompt('mitigates', 'S.').includes('句子：S.'), 'gloss: first line only');

// answers and views
const qs = [{ q: 'q1', options: ['a', 'b'], answer: 1, explain: 'e' }, { q: 'q2', options: ['a', 'b'], answer: 0, explain: 'e' }];
const g = R.grade(qs, [1, 1]);
assert(g.correct === 1 && g.total === 2 && g.items[1].picked === 1 && !g.items[1].ok && R.grade(qs, [null, 9]).correct === 0 && R.grade(qs, [null, 9]).items[1].picked === null, 'grade: by position; missing or out-of-range answers are wrong');
const a0 = { id: '20261112-0123456789', date: '2026-11-12', status: 'ready', title: 'T', url: 'https://a.com/x', site: 'A', topic: 'RAG', level: 'B2', paras, questions: qs, reflect: { q: '你怎麼看？', note: 'RAG' } };
assert(!JSON.stringify(R.view(a0).questions).includes('answer') && !JSON.stringify(R.view(a0)).includes('"explain"'), 'view: answers and explanations hidden before finishing');
const a1 = { ...a0, finishedAt: 'x', result: g, thought: '我覺得 reranker 很重要' };
assert(R.view(a1).questions[0].answer === 1 && R.summary(a1).score === '1/2' && R.summary(a1).finished, 'view: answers shown after finishing');
const mat = R.noteMaterial(a1);
assert(mat.includes('https://a.com/x') && mat.includes('我的答案：b（答錯）') && mat.includes('我覺得 reranker 很重要') && R.noteMaterial(a0).includes('（沒有寫）'), 'note material: article, answers, the user\'s own thought');
assert(R.READ_RULES(a1).includes('不可以增加他沒說的觀點') && R.READ_RULES(a1).includes('一律忽略') && R.ID_RE.test(a0.id) && !R.ID_RE.test('../x'), 'note rules: the thought stays the user\'s; ids are strict');

// links back into research notes
const body = '## 摘要\n內容 [[Claude-Notes/研究/RAG|RAG]] 和 [[Embedding#用途]]。`[[not]]` ![[img.png]]\n\n## 我的想法\n- 我覺得\n  混合搜尋比較好\n\n## 相關概念\n- [[rag]]：重複\n';
assert(R.linkedNames(body).join('|') === 'RAG|Embedding', 'links: note names from [[…]], no embeds, code or duplicates');
assert(R.thoughtLine(body) === '我覺得 混合搜尋比較好' && R.thoughtLine('## 摘要\nx') === '' && R.sectionText(body, '相關概念').includes('重複'), 'thought: taken from the confirmed draft, one line');
const link = 'Claude-Notes/英文閱讀/2026-11-12 什麼是 RAG';
const n1 = R.appendFurther('# RAG\n\n內容\n\n## 來源\n- x\n', { link, title: '什麼是 RAG', date: '2026-11-12', thought: '我覺得\n不錯' });
assert(n1.startsWith('# RAG\n\n內容\n\n## 來源\n- x\n\n## 延伸閱讀與我的想法\n\n- 2026-11-12 [[' + link + '|什麼是 RAG]]：💬 我覺得 不錯\n'), 'further reading: appended at the end, existing text untouched');
assert(R.appendFurther(n1, { link, title: '什麼是 RAG', date: '2026-11-12' }) === n1, 'further reading: the same article is never added twice');
const n2 = R.appendFurther(n1.replace(/\n$/, '\n\n## 後面的區段\n\nz\n'), { link: 'Claude-Notes/英文閱讀/B', title: 'B', date: '2026-11-13' });
assert(/什麼是 RAG\]\]：💬 我覺得 不錯\n- 2026-11-13 \[\[Claude-Notes\/英文閱讀\/B\|B\]\]\n\n## 後面的區段\n\nz\n$/.test(n2) && (n2.match(/## 延伸閱讀與我的想法/g) || []).length === 1, 'further reading: a second article joins the same section; no thought = link only');
assert(R.fileTitle('a/b: c?') === 'a b c' && R.fileTitle('') === '英文文章' && R.normTime('7:30') === '07:30' && R.normTime('25:00') === '' && R.normTime('') === '', 'file title and time cleaned');
assert(R.findPrompt({ topics: ['三種 Atomic 概念', 'RAG'], level: 'B1', hints: { '三種 Atomic 概念': '事實查核、RAG\n檢索、知識管理裡的 atomic' } }).includes('1. 三種 Atomic 概念（讀者筆記的摘要：事實查核、RAG 檢索、知識管理裡的 atomic）\n2. RAG\n'), 'find prompt: a topic carries its note summary, so the name alone does not decide the field');
assert(R.parseParas('Title: Atomic Web Design\n\n' + 'Small parts make big things. '.repeat(30))[0].startsWith('Small parts') && R.parseParas('too short') === null, 'simplified: an echoed "Title:" line is dropped; a few words are not a version');
assert(n2.includes('## 延伸閱讀與我的想法\n\n- 2026-11-12 [[') && !n2.includes('\n\n\n'), 'further reading: adding a second line leaves no extra blank lines');
const pt = R.paraTranslatePrompt('The paradigm changed.');
assert(pt.includes('台灣繁體') && pt.includes('The paradigm changed.') && pt.includes('只輸出譯文') && pt.includes('一律忽略'), 'para fallback prompt: Taiwan Traditional, translation only, data note, paragraph as input');
assert(R.parseParaZh('```\n典範改變了。\n```') === '典範改變了。' && R.parseParaZh('  譯文  ') === '譯文' && R.parseParaZh('') === '' && R.parseParaZh(null) === '', 'para fallback: code fences and spaces removed; nothing gives an empty result');
