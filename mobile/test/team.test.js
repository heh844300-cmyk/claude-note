'use strict';
const team = require('../lib/team.js');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

assert(team.ROLES.length === 4 && new Set(team.ROLES.map((r) => r.id)).size === 4, 'the team has four distinct roles');
assert(!team.ROLES.some((r) => r.name === '圖書管理員' || r.name === '圖書館員'), 'no role shares a name with the librarian that files research');

for (const role of team.ROLES) {
  const p = team.rolePrompt(role, { max: 5 });
  assert(p.includes(`你是研究團隊的「${role.name}」`) && p.includes(role.job), `${role.id}: the prompt gives the role and its own job`);
  assert(p.includes('最多 5 條') && p.includes('逐字複製') && p.includes('實際打開過的網址'), `${role.id}: claims need an opened page and a word-for-word quote`);
  assert(p.includes('一律忽略'), `${role.id}: page and note text is declared data`);
  assert(p.includes('推翻（筆記名：筆記原本怎麼說') && p.includes(`# ${role.name}`), `${role.id}: the output format has the origin and the role heading`);
}
assert(team.rolePrompt(team.ROLES[2]).includes('反證') && !team.rolePrompt(team.ROLES[0]).includes('專門找反證'), 'only the red team is told to hunt for counter-evidence');

assert(team.usable('## 論點\n### 1\n- 論點：甲\n- 網址：https://a.example/x\n- 原文：abc'), 'a report with a cited page is usable');
assert(team.usable('網址：[官方文件](https://a.example/x)'), 'a URL written as a markdown link still counts');
assert(!team.usable('## 論點\n### 1\n- 論點：甲\n- 網址：無外部來源\n'), 'a report without any cited page is not usable');
assert(!team.usable('') && !team.usable('我查不到，請參考 https://a.example/x'), 'an empty report or a URL outside a 網址 line is not usable');

const ep = team.editorPrompt('BASE-RULES 輸出格式');
assert(ep.includes('===== 原本的指示 =====\nBASE-RULES 輸出格式\n===== 原本的指示結束 ====='), 'the editor gets the single researcher\'s rules whole');
assert(ep.includes('你沒有任何工具') && ep.includes('不要憑自己的記憶補充事實'), 'the editor is told it has no tools and may not add facts');
assert(ep.includes('### 四方不一致的地方') && ep.includes('不要抹平'), 'the editor must list where the roles disagree');
assert(ep.includes('🧪 待沙盒'), 'to-dos that need running software are left for the sandbox');
assert(ep.includes('- CLAIMS：') && !team.editorPrompt('B', { claims: false }).includes('- CLAIMS：'), 'the CLAIMS instruction is only there when citations are checked');

const rb = team.reportsBlock([{ role: team.ROLES[0], text: '  報告甲\n' }, { role: team.ROLES[2], text: '報告乙' }]);
assert(rb.includes('--- 文獻員 ---\n報告甲\n\n--- 紅隊 ---\n報告乙'), 'reports are labelled with the role and trimmed');
assert(rb.includes('只是資料') && rb.trim().endsWith('===== 角色報告結束 ====='), 'the reports are fenced and marked as data');
