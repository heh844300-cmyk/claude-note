// Learning topics: outline, study plan, quiz parsing, grading, system files, material passages.
'use strict';
const L = require('../lib/learn');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

// names
assert(L.safeName('../資料庫/基礎') === '資料庫 基礎' && L.safeName('..') === '' && L.safeName('  .hidden ') === 'hidden' && L.safeName('a:b*c') === 'a b c', 'names: no path characters, no dot-start');

// outline
const out = '好的，大綱如下：\nCHAPTER: 第1章：關聯模型 | 資料表；主鍵；外鍵 | 講義 p.1-10\n- CHAPTER: 正規化 | 1NF；2NF；3NF\nCHAPTER:   \nCHAPTER: 索引 | B+ 樹；雜湊 | ';
const ch = L.parseOutline(out);
assert(ch.length === 3 && ch[0].title === '關聯模型' && ch[0].points.join() === '資料表,主鍵,外鍵' && ch[0].source === '講義 p.1-10' && ch[2].n === 3 && ch[1].source === '', 'outline parsed (prefix "第1章" stripped, empty dropped)');
ch[1].status = 'done'; ch[1].note = '第2章 正規化.md';
const merged = L.mergeOutline(ch, L.parseOutline('CHAPTER: 關聯模型 | x\nCHAPTER: 正 規化 | y\nCHAPTER: 交易 | z'));
assert(merged[1].status === 'done' && merged[1].note === '第2章 正規化.md' && merged[2].status === 'todo', 'regenerated outline keeps done chapters');

// study plan
const chs = [1, 2, 3, 4, 5, 6].map((n) => ({ n, title: 'C' + n, points: [], status: n === 1 ? 'done' : 'todo' }));
let p = L.computePlan({ chapters: chs, examDate: '2026-11-20', today: '2026-11-10' });
const study = p.days.filter((d) => d.kind === 'study' || d.kind === 'light');
assert(p.days.length === 11 && p.days[10].kind === 'exam' && p.days.filter((d) => d.kind === 'review').length === 2, '10 days: 8 study + 2 review + exam day');
assert(study.flatMap((d) => d.chapters).join() === '2,3,4,5,6' && p.days.slice(8, 10).every((d) => d.kind === 'review'), 'undone chapters spread over the study days, in order');
p = L.computePlan({ chapters: chs, examDate: '2026-11-12', today: '2026-11-10' });
assert(p.days.length === 3 && p.days[0].chapters.length + p.days[1].chapters.length === 5 && !p.days.some((d) => d.kind === 'review'), 'short time: no reserve, everything still fits');
assert(L.computePlan({ chapters: chs, examDate: '2026-11-10', today: '2026-11-10' }).days[0].kind === 'exam', 'exam day');
assert(L.computePlan({ chapters: chs, examDate: '2026-11-09', today: '2026-11-10' }).past === true, 'after the exam: no plan');
const behind = L.computePlan({ chapters: chs, examDate: '2026-11-20', today: '2026-11-15' });
assert(behind.days[0].date === '2026-11-15' && behind.days.flatMap((d) => d.chapters).join() === '2,3,4,5,6', 'fell behind: the plan reflows from today');
assert(L.planLine({ kind: 'study', chapters: [2, 3] }, chs) === '第2章 C2、第3章 C3' && L.planLine({ kind: 'review' }, chs) === '模擬考＋練錯題', 'plan line');

// quiz parsing
const qtext = '```json\n[{"type":"choice","q":"哪個是主鍵？","options":["A. id","B. name","C. age","D. note"],"answer":"(A)","chapter":1,"explanation":"唯一"},' +
  '{"type":"fill","q":"1NF 要求 ＿＿＿ 值、2NF 要求 ＿＿＿ 相依。","blanks":[["原子","atomic"],["完全"]],"score":4},' +
  '{"type":"short","q":"說明索引的優缺點","answer":"加快查詢，拖慢寫入","points":["加快查詢","寫入變慢","佔空間"]},' +
  '{"type":"choice","q":"壞題","options":["只有一個"],"answer":"A"},{"type":"poem","q":"x"},{"type":"essay","q":"沒有答案"}]\n```';
const qs = L.parseQuestions(qtext);
assert(qs.length === 3 && qs[0].answer === 0 && qs[0].options[0] === 'id' && qs[1].blanks.length === 2 && qs[1].score === 4 && qs[2].score === 5 && qs.map((q) => q.i).join() === '0,1,2', 'questions parsed; bad / unknown / answerless dropped; default score');
const cut = L.parseQuestions('[{"type":"choice","q":"a","options":["x","y"],"answer":"B"},{"type":"fill","q":"b ＿＿＿","blanks":[["c"]]},{"type":"short","q":"截');
assert(cut.length === 2 && cut[0].answer === 1, 'cut-off JSON: readable questions kept');
assert(L.choiceIndex('b', ['x', 'y']) === 1 && L.choiceIndex('B.', ['x', 'y']) === 1 && L.choiceIndex(2, ['x', 'y']) === 1 && L.choiceIndex('y', ['x', 'y']) === 1 && L.choiceIndex('Z', ['x', 'y']) === -1, 'choice answers normalised');
const pub = JSON.stringify(L.publicQuestions(qs));
assert(!pub.includes('原子') && !pub.includes('加快查詢') && !pub.includes('"answer"') && !pub.includes('唯一') && pub.includes('"blanks":2'), 'public questions carry no answers, key points or explanations');

// grading
assert(L.gradeObjective(qs[0], 0).correct && L.gradeObjective(qs[0], 'A').score === 2 && !L.gradeObjective(qs[0], 1).correct, 'choice graded');
const f = L.gradeObjective(qs[1], ['ATOMIC ', '部分']);
assert(f.score === 2 && !f.correct && L.gradeObjective(qs[1], ['原子', '完全']).correct && L.gradeObjective(qs[1], ['ａｔｏｍｉｃ', '完 全']).correct, 'fill: per-blank credit, case / width / spacing ignored');
const g = L.parseGrades('[{"i":2,"score":99,"hit":["加快查詢"],"miss":"寫入變慢；佔空間","feedback":"不完整"},{"i":0,"score":2},{"i":2,"score":1}]', qs);
assert(g.size === 1 && g.get(2).score === 5 && g.get(2).miss.length === 2, 'open grades: clamped to max, objective / duplicates ignored');
assert(L.parseGrades('[{"i":2,"score":-3}]', qs).get(2).score === 0 && L.isWrong(qs[2], { score: 2.5 }) && !L.isWrong(qs[2], { score: 3 }), 'below 60% is wrong; negative clamped');
assert(L.answerText(qs[0], 1) === '(B) name' && L.correctText(qs[1]) === '原子 / atomic、完全' && L.answerText(qs[2], '') === '（沒有作答）', 'answer texts');

// system files: no task syntax anywhere
const topic = { title: '資料庫', goal: '期末考', created: '2026-11-10T20:00', examDate: '2026-11-20', chapters: chs, materials: [{ file: '講義.pdf', kind: 'notes' }, { file: '107年.txt', kind: 'past' }],
  quizzes: [{ at: '2026-11-10T21:00:00Z', label: '應考測驗', score: 7, max: 10, graded: true }],
  wrong: [{ id: 'w1', at: '2026-11-10T21:00', typeLabel: '選擇', chapter: 1, q: '哪個是主鍵？', options: ['id', 'name'], mine: '(B) name', correct: '(A) id', explanation: '唯一', status: 'open' },
    { id: 'w2', at: '2026-11-09T21:00', typeLabel: '簡答', q: '索引', mine: 'x', correct: 'y', feedback: '不完整', status: 'mastered' }] };
chs[1].note = '第2章 C2.md';
const om = L.renderOutline(topic, { today: '2026-11-10', noteLink: (f) => 'Claude-Notes/學習/資料庫/' + f.replace(/\.md$/, '') });
assert(om.includes('**進度**：1 / 6 章') && om.includes('還有 10 天') && om.includes('- ⬜ [[Claude-Notes/學習/資料庫/第2章 C2|第2章 C2]]') && om.includes('- 2026-11-10（二）：第2章 C2') && om.includes('（考古題）') && om.includes('7 / 10 分'), 'outline note rendered');
const wb = L.renderWrongBook(topic);
assert(wb.includes('## 待複習（1）') && wb.includes('## 已熟練（1）') && wb.includes('A. id\nB. name') && wb.includes('- 正確答案：(A) id'), 'wrong-answer book rendered');
assert(![om, wb].some((s) => /- \[[ xX]\]|📅/.test(s)), 'no "- [ ]" or 📅 in system files (待辦 tab / Tasks plugin stay clean)');

// material passages: relevant chunks first, within budget, labelled
const docs = [{ name: '講義.txt', text: Array.from({ length: 30 }, (_, i) => i === 17 ? '交易的 ACID 特性：原子性、一致性、隔離性、持久性。' + 'x'.repeat(900) : `第${i}段 其他內容 ` + 'y'.repeat(1100)).join('\n\n') }];
const pp = L.pickPassages(docs, '交易 ACID 隔離性', 3000);
assert(pp.length <= 3200 && pp.includes('ACID') && pp.includes('--- 講義.txt（第'), 'passages: the relevant chunk is picked within budget');
assert(L.pickPassages([{ name: 'a', text: '短' }], 'x', 3000).includes('短'), 'small materials: everything included');

// prompts carry the key settings
const qp = L.quizPrompt(topic, { counts: { choice: 3, essay: 1, fill: 0 }, difficulty: 'hard', mimic: true, scope: [2, 3], pastText: '考古題內容', materialsText: '教材內容', wrongItems: [topic.wrong[0]] });
assert(qp.includes('選擇 3 題、申論 1 題') && !qp.includes('填空 0') && qp.includes('Level 4（進階變形）') && qp.includes('2. C2') && !qp.includes('1. C1（') && qp.includes('考古題內容') && qp.includes('[w1]'), 'quiz prompt: counts, difficulty, scope, past exams, wrong answers');
assert(L.notesMaterial(topic, { chapter: chs[1], notes: '我的理解', lesson: '老師講', chat: [{ q: '為何', a: '因為' }] }).includes('===== 我的筆記 =====\n我的理解'), 'notes material puts the user\'s notes first');

// the user's requirements reach every prompt that should follow them
const rt = { ...topic, rules: '名詞要附英文' };
assert(L.lessonPrompt(rt, chs[0], {}).includes('這個主題的教學要求：\n名詞要附英文') && L.outlinePrompt(rt, {}).includes('名詞要附英文') && L.followupPrompt(rt, chs[0], '', [], '問').includes('名詞要附英文'), 'topic rules in outline, lesson and follow-up prompts');
const qr = L.quizPrompt(rt, { counts: { choice: 1 }, rules: '每題都用便利商店當情境' });
assert(qr.includes('名詞要附英文') && qr.includes('這次的出題要求：\n每題都用便利商店當情境') && qr.indexOf('使用者的要求') < qr.indexOf('只輸出 JSON 陣列'), 'quiz prompt: topic rules + this quiz\'s rules, before the output format');
assert(L.gradePrompt(rt, [], '申論要分點').includes('出題時的要求（批改時也要照這些要求評分）：\n申論要分點') && !L.quizPrompt(topic, { counts: { choice: 1 } }).includes('使用者的要求'), 'grading follows the quiz rules; nothing added when there are none');

// hints while answering: the prompt carries the key for the AI only; leaks of objective answers are caught
const hp = L.hintPrompt(rt, qs[0], 1, '', []);
assert(hp.includes('絕對不能說出答案') && hp.includes('正確選項：(A) id') && hp.includes('第 1 個提示') && hp.includes('名詞要附英文'), 'hint prompt: key for the AI, never-tell rule, topic rules');
assert(L.hintLeaks(qs[0], '想想哪個欄位可以唯一識別每一筆資料，像身分證字號。') === false && L.hintLeaks(qs[0], '答案就是 id 欄位') === true && L.hintLeaks(qs[0], '應該選 (A)') === true, 'choice hint: option text or letter = leak');
assert(L.hintLeaks(qs[1], '想想 1NF 對欄位值的要求') === false && L.hintLeaks(qs[1], '第一格填「原子」') === true && L.hintLeaks(qs[2], '索引會加快查詢') === false, 'fill hint: an accepted answer = leak; open questions not checked');
assert(L.followupPrompt(rt, chs[0], '', [], '問').includes('🤔 小問題'), 'follow-up ends with a small check question');

// adaptive difficulty: the counters live in code
let s = { ...L.START };
let r1 = L.stepLevel(s, 'correct'); assert(r1.st.level === 2 && r1.st.sc === 1 && !r1.event, 'one right: same level, streak 1');
let r2 = L.stepLevel(r1.st, 'correct'); assert(r2.st.level === 3 && r2.st.sc === 0 && r2.event === 'up', 'two right in a row: level up, streak reset');
let w1 = L.stepLevel(r2.st, 'wrong'); assert(w1.st.level === 3 && w1.st.sw === 1 && w1.event === 'retry', 'first wrong: keep the level, retry with a hint');
let w2 = L.stepLevel(w1.st, 'wrong'); assert(w2.st.level === 2 && w2.st.sw === 0 && w2.event === 'down', 'second wrong in a row: level down');
assert(L.stepLevel({ level: 5, sc: 1, sw: 0 }, 'correct').st.level === 5 && L.stepLevel({ level: 1, sc: 0, sw: 1 }, 'wrong').st.level === 1, 'levels stay within 1..5');
const hz = L.stepLevel({ level: 3, sc: 1, sw: 1 }, 'hinted');
assert(hz.st.sw === 0 && hz.st.sc === 1 && hz.st.level === 3, 'right only after a hint: wrong streak cleared, no credit towards a level up');
assert(L.stepLevel({ level: 2, sc: 1, sw: 0 }, 'wrong').st.sc === 0, 'a wrong answer resets the right streak');
assert(L.levelOf('easy') === 2 && L.levelOf('hard') === 4 && L.levelOf('5') === 5 && L.levelOf('auto') === 'auto' && L.levelOf('x') === 3, 'difficulty settings -> levels (old easy/medium/hard kept)');
const at = { ...topic, levels: { 2: { level: 4, sc: 0, sw: 0 } } };
const ap = L.quizPrompt(at, { counts: { choice: 2 }, difficulty: 'auto', scope: [2, 3] });
assert(ap.includes('第2章 Level 4、第3章 Level 2') && ap.includes('Level 4（進階變形）：') && ap.includes('Level 2（標準入門）：') && !ap.includes('Level 5（'), 'auto difficulty: per-chapter levels and only the definitions used');
const fp = L.followupPrompt(rt, chs[0], '', [], '答案', { level: 3, sc: 1, sw: 0 });
assert(fp.includes('目前是 Level 3') && fp.includes('這是連續第 2 題答對') && fp.includes('會難一點') && fp.includes('🤔 再試一次') && fp.includes('不要再出新的小問題'), 'follow-up: branches precomputed from the state (up next / retry), no new question after an answer');
assert(L.followupPrompt(rt, chs[0], '', [], 'x', { level: 3, sc: 0, sw: 1 }).includes('會簡單一點'), 'follow-up: second wrong branch goes down a level');
const mp = L.followupPrompt(rt, chs[0], '', [], '🎯 再來一題', { level: 4, sc: 0, sw: 0 }, true);
assert(mp.includes('Level 4') && mp.includes('只輸出這兩行') && !mp.includes('JUDGE: correct'), 'follow-up: "one more" asks only a new question at the current level');
const pj = L.parseJudge('JUDGE: wrong\n你的思路對了一半…\n🤔 再試一次：…');
assert(pj.judge === 'wrong' && pj.text.startsWith('你的思路') && L.parseJudge('沒有標記').judge === 'none', 'judge line parsed and hidden');

// review of a learning note before upload
const rbody = '## 重點整理\n- 2NF 要消除遞移相依。\n- 1NF：每個欄位都是不可分割的值。\n- 主鍵可以是 NULL。\n';
const rp = L.reviewPrompt(rt, { body: rbody, reference: '第一章教學內容', materialsText: '教材段落', web: true });
assert(rp.includes('網路搜尋查證') && rp.includes('名詞要附英文') && rp.includes('逐字複製') && rp.includes('教材段落') && rp.includes('2NF 要消除遞移相依'), 'review prompt: references, user rules, verbatim quotes, web');
assert(!L.reviewPrompt(rt, { body: rbody, reference: '', web: false }).includes('網路搜尋查證'), 'review prompt without web search');
const rout = `=== ISSUE ===
LEVEL: 錯誤
QUOTE: 2NF 要消除遞移相依。
PROBLEM: 消除遞移相依是 3NF；2NF 是消除部分相依。
FIX: 2NF 要消除部分相依（遞移相依是 3NF 處理的）。
SOURCE: 第一章教學內容
=== ISSUE ===
LEVEL: 錯誤
QUOTE: 「主鍵可以是   NULL。」
PROBLEM: 主鍵不能是 NULL。
FIX: 主鍵不能是 NULL。
SOURCE: https://example.com
=== ISSUE ===
LEVEL: 不精確
QUOTE: 這句不在筆記裡
PROBLEM: x
FIX: y
=== ISSUE ===
LEVEL: 待查
QUOTE: 1NF：每個欄位都是不可分割的值。
PROBLEM: 定義大致正確，但不同教科書說法不一。
FIX: none`;
const ri = L.parseReview(rout, rbody);
assert(ri.length === 4 && ri[0].level === '錯誤' && ri[0].found && ri[0].state === 'open' && ri[0].source === '第一章教學內容', 'review items parsed');
assert(ri[1].found && ri[1].quote === '主鍵可以是 NULL。', 'quote found despite quotes marks / extra spaces, stored as the exact body text');
assert(!ri[2].found && ri[2].level === '不精確' && ri[3].level === '待查' && ri[3].fix === '', 'unknown quote marked not found; 待查 without a fix');
assert(L.parseReview('NONE', rbody).length === 0 && L.parseReview('', rbody).length === 0, 'no issues');
const rfx = L.applyFixes(rbody, ri);
assert(rfx.applied.join() === 'r1,r2' && rfx.body.includes('2NF 要消除部分相依（遞移相依是 3NF 處理的）。') && rfx.body.includes('主鍵不能是 NULL。') && rfx.body.includes('1NF：每個欄位') && !rfx.body.includes('主鍵可以是'), 'fixes applied exactly once each; others untouched');
assert(L.applyFixes(rfx.body, ri).applied.length === 0, 'applying again changes nothing (quotes gone)');

// one input box: new question / answer to the small question / auto; answers stay under their question
const tc = [
  { q: '什麼是主鍵？', a: '主鍵是…\n🤔 小問題：學號能當主鍵嗎？', judge: 'none', kind: 'ask' },
  { q: '可以', a: '對！', judge: 'correct', kind: 'answer' },
  { q: '🎯 再來一題', a: '🤔 小問題：姓名適合當主鍵嗎？', judge: 'none', kind: 'more' },
  { q: '適合', a: '再想想…\n🤔 再試一次：同名的人怎麼辦？', judge: 'wrong', kind: 'answer' },
  { q: '什麼是外鍵？', a: '外鍵是…\n🤔 小問題：外鍵指向哪裡？', judge: 'none', kind: 'ask' },
];
assert(JSON.stringify(L.threadsOf(tc)) === '[[0,1,2,3],[4]]', 'threads: answers and 再來一題 grouped under their question');
assert(JSON.stringify(L.threadsOf([{ q: 'a', judge: 'none' }, { q: 'b', judge: 'correct' }, { q: '🎯 再來一題', judge: 'none' }, { q: 'c', judge: 'none' }])) === '[[0,1,2],[3]]', 'threads for older entries without kind');
assert(JSON.stringify(L.threadsOf([{ q: 'x', judge: 'wrong' }])) === '[[0]]' && L.threadsOf([]).length === 0, 'threads: a reply with nothing before it starts a thread');
assert(L.pendingQuestion(tc) === '外鍵指向哪裡？' && L.pendingQuestion(tc.slice(0, 4)) === '同名的人怎麼辦？' && L.pendingQuestion(tc.slice(0, 2)) === '' && L.pendingQuestion([]) === '', 'pending small question = the last reply\'s 🤔 line');
const askP = L.followupPrompt(rt, chs[0], '', tc, '那複合鍵呢？', { level: 2, sc: 0, sw: 0 }, 'ask');
assert(askP.includes('學生這次是在問新的問題') && !askP.includes('JUDGE: correct'), 'mode ask: never judged as an answer');
const ansP = L.followupPrompt(rt, chs[0], '', tc, '它指向另一張表的主鍵', { level: 2, sc: 0, sw: 0 }, 'answer');
assert(ansP.includes('一定要判斷對錯') && ansP.includes('「外鍵指向哪裡？」') && ansP.includes('JUDGE: correct') && ansP.includes('JUDGE: wrong') && !ansP.includes('JUDGE: none'), 'mode answer: judged against the pending small question');
const autoP = L.followupPrompt(rt, chs[0], '', tc, 'x', { level: 2, sc: 0, sw: 0 });
assert(autoP.includes('先判斷') && autoP.includes('「外鍵指向哪裡？」') && autoP.includes('JUDGE: none'), 'mode auto: the AI decides, told which small question is pending');
