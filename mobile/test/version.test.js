// Version numbers and the changelog shown in the app's "what's new" window.
'use strict';
const fs = require('fs'), path = require('path');
const V = require('../lib/version');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

assert(V.label(V.parseVer('22.5')) === 'V22.5' && V.label(V.parseVer('23.0')) === 'V23' && V.parseVer('abc') === null, 'version labels');
assert(V.newer([22, 5], [22, 4]) && V.newer([23, 0], [22, 9]) && !V.newer([22, 4], [22, 4]), 'newer comparison');

const md = '# 更新紀錄\n\n說明文字\n\n## V22.5（2026-11-11）\n- **甲**：一\n- 乙\n\n## V22.4 (2026-11-10)\n- 丙\n\n## V20 以前（2026-11-10）\n- 丁\n';
const e = V.parseChangelog(md);
assert(e.length === 3 && e[0].version === 'V22.5' && e[0].date === '2026-11-11' && e[0].body === '- **甲**：一\n- 乙', 'changelog entries: version, date, body (full-width brackets)');
assert(e[1].version === 'V22.4' && e[1].date === '2026-11-10' && e[2].version === 'V20 以前', 'half-width brackets and non-numeric headings');
assert(V.parseChangelog('').length === 0 && V.parseChangelog('## V1\n- x')[0].date === '', 'empty file / heading without a date');
assert(V.newerEntries(e, [22, 4]).map((x) => x.version).join() === 'V22.5', 'upcoming = only entries newer than this install');

// the real CHANGELOG.md: newest first, and its top entry matches VERSION (bump both on every push)
const root = path.join(__dirname, '..', '..');
const real = V.parseChangelog(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'));
const ver = V.label(V.parseVer(fs.readFileSync(path.join(root, 'VERSION'), 'utf8')));
assert(real.length > 0 && real[0].version === ver, `CHANGELOG.md top entry (${real[0] && real[0].version}) = VERSION (${ver})`);
assert(real.every((x) => x.body.length > 0), 'every changelog entry has content');
