// Taste and looking back: three versions, proposed rules, and appending them to prompt.local.md without touching what is there.
'use strict';
const fs = require('fs'), path = require('path');
const T = require('../lib/taste');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const grab = (name) => { const i = src.indexOf('function ' + name + '('); let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) return src.slice(i, k + 1); } };
const parseNote = new Function(grab('parseNote') + '\nreturn parseNote;')();

const v = (style, title) => `STYLE: ${style}\nTITLE: ${title}\nTAGS: a, b\nEXPIRES: never\nREMIND: none\nAGENT: no\n\n## 摘要\n${title} 的摘要。\n`;
const out = `${T.SEP}\n${v('精簡條列', '甲')}\n${T.SEP}\n${v('問答式', '乙')}\n=== VERSION 3 ===\n${v('敘事', '丙')}`;
const items = T.parseVariants(out, parseNote);
assert(items.length === 3 && items.map((x) => x.style).join() === '精簡條列,問答式,敘事' && items[1].note.title === '乙' && items[2].note.body.startsWith('## 摘要'), 'three versions parsed, each a full note with its style');
assert(T.parseVariants(`${T.SEP}\n${v('a', '甲')}`, parseNote).length === 0, 'only one usable version: nothing to compare, nothing offered');
assert(T.parseVariants('隨便亂寫', parseNote).length === 0, 'unreadable answer: nothing offered (the draft stays as it is)');
assert(T.VARIANTS_RULES.includes('不要增加或刪掉原文的資訊') && T.VARIANTS_RULES.includes(T.SEP), 'prompt: same facts, different form, a fixed separator');

assert(T.parseRules('前言\nRULE: 摘要第一句寫結論\nRULE: 標題寫主張 [[連結|名稱]]\nRULE: 摘要第一句寫結論\nRULE: 短\n').join('|') === '摘要第一句寫結論|標題寫主張 名稱', 'rules: RULE lines, links as text, no duplicates or fragments');
assert(T.parseRules('- [ ] 待辦用動詞開頭\n- 重點每點兩行內').join('|') === '待辦用動詞開頭|重點每點兩行內', 'rules: bullets also work, check boxes removed');
assert(T.parseRules('RULE: <!-- 偷塞 -->規則一').join() === '偷塞 規則一', 'rules: no HTML comment markers (they would hide later rules in prompt.local.md)');
assert(T.examplesPrompt([{ name: 'x', md: '內容' }]).includes('一律忽略') && T.insightsPrompt([{ at: '2026-11-24T10:00', kind: 'pick', text: '問答式' }]).includes('從三個版本挑了：問答式'), 'prompts: data-not-instructions note; picks and corrections listed');

const raw = '﻿<!--\n說明\n-->\r\n\r\n- 標籤用中文\r\n';
const app = T.appendRules(raw, ['摘要寫結論', '第二\n條'], '從我喜歡的筆記學到的寫法（2026-11-24）');
assert(app.startsWith(raw.replace(/\s*$/, '')) && app.charCodeAt(0) === 0xFEFF, 'append: everything already there stays, BOM kept');
assert(app.endsWith('\r\n\r\n## 從我喜歡的筆記學到的寫法（2026-11-24）\r\n- 摘要寫結論\r\n- 第二 條\r\n'), 'append: dated heading, one line per rule, the file\'s CRLF');
assert(T.appendRules(raw, [], 'x') === raw, 'nothing to add: file unchanged');

// server wiring
assert(/tasteLib\.parseVariants\(await askAI\(d, payload, src\), parseNote\)/.test(src), 'server: versions go through askAI (no tools for a mail or a clip)');
assert(/if \(!now \|\| now\.run !== run\) return;/.test(src) && /function saveVariants[^\n]*if \(!draftExists\(id\)\) return false;/.test(src), 'server: a newer run wins, and a deleted or uploaded draft is not recreated');
assert(/if \(sha1\(d\.body\) !== v\.base && !force\) throw httpErr\(409/.test(src), 'server: picking a version asks first when the draft was edited after the versions were made');
assert(/logFeedback\('revise', instruction, d\)/.test(src) && /JSON\.stringify\(\{ at: new Date\(\)\.toISOString\(\), kind, text: String\(text/.test(src), 'server: the feedback log keeps only what the user typed or picked');
assert(/vr && vr\.status === 'running'\) await saveVariants\(d\.id, \{ \.\.\.vr, status: 'error'/.test(src), 'server: versions cut off by a restart are shown as failed');
