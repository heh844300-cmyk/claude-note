// Simplified → Taiwan Traditional conversion (OpenCC s2twp chain, tables in lib/opencc/).
'use strict';
const fs = require('fs'), path = require('path');
const { createConverter, parseTable } = require('../lib/opencc');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const dir = path.join(__dirname, '..', 'lib', 'opencc');
const f = (n) => fs.readFileSync(path.join(dir, n), 'utf8');
const c = createConverter({ phrases: f('STPhrases.txt'), chars: f('STCharacters.txt'), twPhrases: f('TWPhrases.txt'), twVariants: f('TWVariants.txt') });

assert(c.convert('范例 叙述 发展 头发 发现') === '範例 敘述 發展 頭髮 發現', 'simplified → traditional, including 发 read as 發 or 髮 by its phrase');
assert(c.convert('数据库 软件 信息 网络 内存') === '資料庫 軟體 資訊 網路 記憶體', 'Taiwan usage: 數據庫 becomes 資料庫, 軟件 becomes 軟體 (not the mainland-style forms)');
assert(c.convert('鼠标 视频 出租车 默认') === '滑鼠 影片 計程車 預設', 'Taiwan usage: 鼠標 becomes 滑鼠, 視頻 becomes 影片');
assert(c.convert('伪造 僞證') === '偽造 偽證', 'Taiwan character variants: 僞 becomes 偽');
assert(c.convert('abc 123 — hello') === 'abc 123 — hello', 'text without Chinese passes through unchanged');
assert(c.convert('') === '' && c.convert(null) === '', 'empty input gives empty output');
assert(c.convert('Use the API 数据 today') === 'Use the API 資料 today', 'English words around the Chinese are left alone');

const t = parseTable('﻿# comment\n甲\t乙 丙\n\n丁\n戊\t己');
assert(t.get('甲') === '乙' && t.get('丁') === undefined && t.get('戊') === '己' && t.size === 2, 'table parser: BOM and comments skipped, first alternative kept, malformed lines skipped');
assert(c.ready === true && createConverter({}).ready === false && createConverter({ phrases: 'a\tb' }).ready === false, 'converter: ready only when the simplified tables are loaded');
