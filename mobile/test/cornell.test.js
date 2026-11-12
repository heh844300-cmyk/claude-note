// Cornell notes: three sections stored as one plain string
const C = require('../public/cornell.js');
function assert(c, m) { if (c) console.log('ok  ', m); else { console.log('FAIL', m); process.exitCode = 1; } }

const plain = '第一行\n\n  縮排的第二行\n';
assert(C.parse(plain).notes === plain && C.parse(plain).cues === '' && C.parse(plain).sum === '', 'text without section headings is all notes, untouched');
assert(C.serialize({ cues: '', notes: plain, sum: ' \n' }) === plain, 'only the notes section used: stored as the plain text');
assert(C.serialize(C.parse('')) === '', 'empty notes stay empty');

const full = C.serialize({ cues: 'TCP 為什麼要三次握手？\n滑動視窗', notes: '重點一\n\n> 引用\n', sum: '可靠傳輸靠確認和重送' });
assert(full === '## 🔑 線索\nTCP 為什麼要三次握手？\n滑動視窗\n\n## ✏️ 筆記\n重點一\n\n> 引用\n\n## 📝 總結\n可靠傳輸靠確認和重送\n', 'three sections are written under their headings');
const back = C.parse(full);
assert(back.cues === 'TCP 為什麼要三次握手？\n滑動視窗' && back.notes === '重點一\n\n> 引用' && back.sum === '可靠傳輸靠確認和重送', 'sections come back as they were written');
assert(C.serialize(back) === full, 'saving again does not change the text');

assert(C.serialize({ cues: '問題', notes: '', sum: '' }) === '## 🔑 線索\n問題\n', 'empty sections are left out');
const p2 = C.parse('先寫的\n## 總結\n我的結論\n## ✏ 筆記\n後寫的\r\n## 🔑 線索\n線索一');
assert(p2.notes === '先寫的\n後寫的' && p2.sum === '我的結論' && p2.cues === '線索一', 'headings typed by hand (no emoji, other emoji form, any order, CRLF) are recognised; text before them is notes');
assert(C.parse('## 總結報告\n內容').notes === '## 總結報告\n內容', 'a longer heading of the user is not a section');
assert(C.parse('### 筆記\n內容').sum === '' && C.parse('### 筆記\n內容').notes === '### 筆記\n內容', 'a deeper heading is not a section');

assert(C.quote('  第一段\n\n第二段  ') === '> 第一段\n> 第二段', 'a selection becomes one quote block without blank lines');
assert(C.quote('字'.repeat(700)).length === 2 + 600 + 1 && C.quote('字'.repeat(700)).endsWith('…'), 'a long selection is cut');
assert(C.cue(' 三次\n握手 ') === '三次 握手', 'a cue is one line');
assert(C.append('已經寫的\n\n\n', '> 引用') === '已經寫的\n\n> 引用\n' && C.append('', '> 引用') === '> 引用\n', 'a quote is added after the existing text with one blank line');
assert(C.append('線索一\n', '線索二', 1) === '線索一\n線索二\n', 'cues are added one per line');
