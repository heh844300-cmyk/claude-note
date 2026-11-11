// Organizing rules: prompt.md plus the user's own prompt.local.md.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const R = require('../lib/rules');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

assert(R.compose('基本規則\n', '') === '基本規則\n', 'no local rules -> base rules unchanged');
assert(R.compose('基本規則\n', R.TEMPLATE) === '基本規則\n', 'untouched template adds nothing');
assert(R.compose('基本規則\n', '﻿  \n\n ') === '基本規則\n', 'blank local file (with BOM) adds nothing');
const c = R.compose('﻿基本規則\n\n', R.TEMPLATE + '- 標籤一律用中文\n');
assert(c.startsWith('基本規則' + R.HEADING) && c.endsWith('- 標籤一律用中文\n'), 'local rules come after the base rules under their own heading');
assert(!c.includes('<!--') && !c.includes('﻿'), 'template comment and BOM are not sent to the AI');
assert(R.compose('a', '<!-- x -->甲<!-- y -->乙').endsWith('甲乙\n'), 'several comments removed, text between them kept');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-rules-'));
const base = path.join(dir, 'prompt.md'), local = path.join(dir, 'prompt.local.md');
fs.writeFileSync(base, '基本規則\n');
(async () => {
  assert(await R.load(base, local) === '基本規則\n', 'missing local file is fine');
  assert(R.ensureLocal(local) && fs.readFileSync(local, 'utf8') === R.TEMPLATE, 'template created when missing');
  fs.writeFileSync(local, '我的規則');
  assert(!R.ensureLocal(local) && fs.readFileSync(local, 'utf8') === '我的規則', 'existing local file never overwritten');
  assert((await R.load(base, local)).endsWith(R.HEADING + '我的規則\n'), 'load combines both files');
  fs.rmSync(dir, { recursive: true, force: true });
})();
