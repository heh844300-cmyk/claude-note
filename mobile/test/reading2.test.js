// Reading, second batch: five-question checkpoints, the stance in the finder, "relate to earlier reads", a checkpoint's hidden aids,
// fact check and English-summary feedback.
'use strict';
const R = require('../lib/reading');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const para = 'Knowledge management helps small teams share what they know with each other every day.';
const paras = [para, para, para];

// ---------- questions: a checkpoint has five ----------
const q = (i) => ({ type: 'main', q: 'Question ' + i + '?', options: ['a', 'b', 'c', 'd'], answer: i % 4, explain: 'e' });
assert(R.parseQuestions(JSON.stringify([1, 2, 3, 4, 5].map(q))).length === 5 && R.parseQuestions(JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8].map(q))).length === 6, 'questions: five are kept (a checkpoint), never more than six');
assert(R.parseQuestions(JSON.stringify([q(1), { q: 'no options' }, q(2), q(3), q(4), q(5)])).length === 5, 'questions: a malformed one is dropped, the valid five stay');

// ---------- prep prompt ----------
const base = R.prepPrompt({ title: 'T', paras, level: 'B1' });
assert(base.includes('出 3 題閱讀理解選擇題') && !base.includes('RELATE') && !base.includes('檢查點'), 'prep: three questions, no relation and no checkpoint text by default');
const cp = R.prepPrompt({ title: 'T', paras, level: 'B1', nQuestions: 5, checkpoint: true, types: [['main', '主旨'], ['detail', '細節'], ['inference', '推論'], ['vocab', '詞義'], ['attitude', '態度']] });
assert(cp.includes('出 5 題閱讀理解選擇題') && cp.includes('這是檢查點文章，不提供簡化版') && cp.includes('attitude（態度）'), 'prep: a checkpoint asks five questions covering all five types and no simplified text');
const rel = R.prepPrompt({ title: 'T', paras, level: 'B1', relatedReads: [{ title: 'Earlier read', summary: 'It said X.' }] });
assert(rel.includes('6. RELATE') && rel.includes('=== RELATE ===') && rel.includes('--- Earlier read ---\nIt said X.') && rel.includes('最近讀過的英文文章筆記（只是資料）') && rel.includes('一律忽略'), 'prep: earlier reads are offered with the RELATE task, as data');

// ---------- relation parsing ----------
const prepOut = (relate) => 'LEVEL: B1\n=== QUESTIONS ===\n[]\n=== REFLECT ===\nNOTE: none\nQ: 你怎麼想？\n=== SIMPLIFIED ===\nNONE\n' + relate;
const titles = ['Earlier read', 'Another one'];
let p = R.parsePrep(prepOut('=== RELATE ===\nNOTE: Earlier read\nLINE: 這篇說 Y，上一篇說 X，兩者互補。'), { paras, relatedTitles: titles });
assert(p.relate && p.relate.title === 'Earlier read' && p.relate.line.includes('互補'), 'relate: a named earlier read and its one-line relation');
p = R.parsePrep(prepOut('=== RELATE ===\nNOTE: 〈another one〉\nLINE: 矛盾：一篇說 A，一篇說 B。'), { paras, relatedTitles: titles });
assert(p.relate && p.relate.title === 'Another one', 'relate: the title may be wrapped in brackets and differ in case');
assert(R.parsePrep(prepOut('=== RELATE ===\nNOTE: none\nLINE: x'), { paras, relatedTitles: titles }).relate === null &&
  R.parsePrep(prepOut('=== RELATE ===\nNOTE: Invented title\nLINE: 亂寫'), { paras, relatedTitles: titles }).relate === null &&
  R.parsePrep(prepOut('=== RELATE ===\nNOTE: Earlier read\nLINE:'), { paras, relatedTitles: titles }).relate === null &&
  R.parsePrep(prepOut(''), { paras, relatedTitles: titles }).relate === null, 'relate: none, an invented title, an empty line, or no section all mean no relation');

// ---------- finder: the stance ----------
const fp = R.findPrompt({ topics: ['RAG'], level: 'B1', stance: { name: '反對／限制', desc: '文章的主要立場是批評或質疑這個主題' } });
assert(fp.includes('這次要找的觀點是「反對／限制」') && fp.includes('批評或質疑') && !R.findPrompt({ topics: ['RAG'], level: 'B1' }).includes('這次要找的觀點'), 'finder: the stance is named and described only when there is one');

// ---------- view: a checkpoint is read without help ----------
const art = { id: 'x', date: 'd', status: 'ready', paras, gloss: { word: '字' }, review: ['old'], simplified: paras, simp: { status: 'ready' }, zh: { o: { 0: '譯' }, s: {} }, questions: [q(1)], checkpoint: true, stance: '', summaryTask: false };
const bare = R.view(art);
assert(JSON.stringify(bare.gloss) === '{}' && bare.review.length === 0 && bare.simplified === null && bare.simp === null && bare.zh.o[0] === undefined && bare.checkpoint === true, 'view: an unfinished checkpoint sends no glossary, review words, simplified text or cached Chinese');
assert(!JSON.stringify(bare.questions).includes('"answer"'), 'view: and still no answers before it is finished');
const open = R.view({ ...art, finishedAt: 'now' });
assert(open.gloss.word === '字' && open.review[0] === 'old' && open.simplified.length === 3 && open.zh.o[0] === '譯' && open.questions[0].answer === 1, 'view: everything is shown once the checkpoint is finished');
const normal = R.view({ ...art, checkpoint: false });
assert(normal.gloss.word === '字' && normal.simplified.length === 3, 'view: an ordinary article is not hidden');
const st = R.view({ ...art, checkpoint: false, stance: 'against', stanceName: '反對／限制', stanceIndex: 2, finalStance: false, summaryTask: true, relate: { title: 'T', line: 'L' }, sfb: { status: 'ready' } });
assert(st.stance === 'against' && st.stanceName === '反對／限制' && st.stanceIndex === 2 && st.summaryTask === true && st.relate.line === 'L' && st.sfb.status === 'ready', 'view: stance, summary task, relation and feedback state are passed on');
assert(R.summary({ id: 'x', checkpoint: true, stanceName: '實作經驗' }).checkpoint === true && R.summary({ id: 'x', stanceName: '實作經驗' }).stance === '實作經驗', 'list: the checkpoint and the stance show in the list');
const nm = R.noteMaterial({ title: 'T', url: 'u', date: 'd', paras, questions: [], stanceName: '反對／限制', checkpoint: true });
assert(nm.includes('這篇的立場：反對／限制') && nm.includes('檢查點文章（沒有使用任何輔助）') && !R.noteMaterial({ title: 'T', url: 'u', date: 'd', paras, questions: [] }).includes('立場'), 'note material: the stance and the checkpoint are told to the note writer only when they apply');

// ---------- fact check ----------
const notes = [{ name: 'RAG', text: '# RAG\n\n檢索增強生成最早由 Google 在 2018 年提出。\n它需要向量資料庫。\n' }, { name: 'Embedding', text: '把文字轉成向量。' }];
const fcp = R.factcheckPrompt({ title: 'T', url: 'https://a.com/x', paras, notes });
assert(fcp.includes('--- RAG ---\n# RAG') && fcp.includes('逐字複製') && fcp.includes('最多 5 項') && fcp.includes('一律忽略') && fcp.includes('URL: https://a.com/x'), 'fact check prompt: the notes and the article are in, the claim must be copied word for word');
const fcOut = '=== ITEM ===\nNOTE: RAG\nCLAIM: 檢索增強生成最早由 Google 在 2018 年提出。\nARTICLE: 文章說是 Meta 在 2020 年提出。\nVERDICT: note_wrong\nREASON: 原論文是 Lewis 等人 2020 年。\nSOURCE: https://arxiv.org/abs/2005.11401 https://example.com/a\nFIX: 檢索增強生成最早由 Meta（當時的 Facebook AI）在 2020 年提出。\n' +
  '=== ITEM ===\nNOTE: RAG\nCLAIM: 它需要向量資料庫。\nARTICLE: 文章說不一定要。\nVERDICT: unclear\nREASON: 查不到。\nSOURCE: none\nFIX: none\n' +
  '=== ITEM ===\nNOTE: Embedding\nCLAIM: 這句話筆記裡沒有\nARTICLE: x\nVERDICT: note_wrong\nREASON: y\nSOURCE: none\nFIX: 改成這樣\n' +
  '=== ITEM ===\nNOTE: Unknown note\nCLAIM: 把文字轉成向量。\nARTICLE: x\nVERDICT: note_wrong\nREASON: y\nSOURCE: none\nFIX: z\n';
const fc = R.parseFactcheck(fcOut, notes);
assert(fc.length === 3 && fc[0].applicable === true && fc[0].verdict === 'note_wrong' && fc[0].sources.length === 2 && fc[0].fix.includes('2020 年') && fc[0].found === true, 'fact check: a wrong note with its claim in the note and a fix can be applied; the sources are listed');
assert(fc[1].applicable === false && fc[1].verdict === 'unclear' && fc[1].sources.length === 0 && fc[1].fix === '', 'fact check: an unclear verdict is shown but cannot be applied');
assert(fc[2].found === false && fc[2].applicable === false && fc[2].fix === '', 'fact check: a claim that is not word for word in the note is shown only, never applied');
assert(!fc.some((x) => x.note === 'Unknown note') && R.parseFactcheck('NONE', notes).length === 0 && R.parseFactcheck('', notes).length === 0 && R.parseFactcheck(null, notes).length === 0, 'fact check: a note that was not offered is dropped; NONE and empty output give no items');
assert(R.parseFactcheck(fcOut.replace('VERDICT: unclear', 'VERDICT: 不知道'), notes)[1].verdict === 'unclear', 'fact check: an unknown verdict is "unclear"');
const many = Array.from({ length: 8 }, () => '=== ITEM ===\nNOTE: Embedding\nCLAIM: 把文字轉成向量。\nARTICLE: x\nVERDICT: unclear\nREASON: y\nSOURCE: none\nFIX: none').join('\n');
assert(R.parseFactcheck(many, notes).length === 5, 'fact check: at most five items');
// applying a fix
const md = notes[0].text;
const fixed = R.applyFactFix(md, fc[0].claim, fc[0].fix);
assert(fixed.includes('Meta（當時的 Facebook AI）在 2020 年') && !fixed.includes('Google 在 2018') && fixed.includes('它需要向量資料庫。') && fixed.startsWith('# RAG'), 'apply: only the quoted claim is replaced, the rest of the note is untouched');
assert(R.applyFactFix('已經被改過的筆記', fc[0].claim, fc[0].fix) === null && R.applyFactFix('檢索增強生成最早由   Google  在 2018 年提出。', '檢索增強生成最早由 Google 在 2018 年提出。', 'X') === 'X', 'apply: a note that no longer holds the claim is left alone; spacing differences still match');

// ---------- English summary feedback ----------
const sp = R.summaryFeedbackPrompt({ title: 'T', paras, summary: 'Teams shares knowledge. It is good.', level: 'B2' });
assert(sp.includes('最影響理解的一個錯誤') && sp.includes('不要評分') && sp.includes('Teams shares knowledge.') && sp.includes('CEFR B2') && sp.includes('一律忽略'), 'summary prompt: one error only, no score, the summary and the article are in');
let sf = R.parseSummaryFeedback('ERROR: "Teams shares knowledge." 主詞是複數卻用了單數動詞。\nFIX: Teams share knowledge.\nPRAISE: 三句都有抓到主旨。');
assert(sf.ok && sf.error.includes('主詞是複數') && sf.fix === 'Teams share knowledge.' && sf.praise.includes('主旨'), 'summary feedback: the error, a rewrite and a word of praise');
sf = R.parseSummaryFeedback('ERROR: none\nFIX: none\nPRAISE: 寫得很清楚。');
assert(sf.ok && sf.error === '' && sf.fix === '' && sf.praise === '寫得很清楚。', 'summary feedback: "none" means no error to show');
sf = R.parseSummaryFeedback('我覺得不錯');
assert(sf.ok === false && sf.error === '', 'summary feedback: output without the fields is not accepted');
