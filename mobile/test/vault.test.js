// Read-only vault browser: path safety, hidden/excluded folders, Obsidian-style link resolution, search.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { createVault } = require('../lib/vault');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const throws = (fn) => { try { fn(); return null; } catch (e) { return e; } };

const v = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-vault-'));
const w = (rel, s = 'x') => { const p = path.join(v, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
w('首頁.md', '# 首頁\n連到 [[專案/計畫]] 和 [[WireGuard]]');
w('專案/計畫.md', '# 計畫\n內容包含 Tailscale 設定');
w('專案/子/WireGuard.md', '# 深層的 WireGuard');
w('WireGuard.md', '# 根目錄的 WireGuard');
w('私人/日記.md', '秘密日記 Tailscale');
w('.obsidian/app.json', '{}'); w('.obsidian/x.md', 'hidden');
w('.trash/old.md', 'trash');
w('attachments/pic.png', 'PNG');
w('outside-secret.txt', 'nope');
const vault = createVault({ CFG: { vault: v, vaultExclude: ['私人'] } });

const root = vault.list('');
assert(root.folders.map((f) => f.name).join() === 'attachments,專案' || root.folders.map((f) => f.name).join() === '專案', 'root folders exclude hidden + excluded: ' + root.folders.map((f) => f.name).join());
assert(!root.folders.some((f) => f.name === '私人' || f.name.startsWith('.')), 'excluded / dot folders not listed');
assert(root.notes.map((n) => n.name).sort().join() === ['WireGuard', '首頁'].sort().join(), 'root notes');
assert(vault.list('專案').folders[0].name === '子', 'sub folder listing');
assert(throws(() => vault.list('私人')).status === 403, 'excluded folder listing refused');

assert(vault.readNote('專案/計畫.md').includes('Tailscale'), 'read note');
for (const bad of ['../x.md', '專案/../../x.md', '.obsidian/x.md', '.trash/old.md', '私人/日記.md', 'outside-secret.txt', 'C:/Windows/win.ini', '/etc/passwd', '專案//計畫.md', '']) {
  const e = throws(() => vault.readNote(bad));
  assert(e && (e.status === 400 || e.status === 403), 'refused ' + JSON.stringify(bad));
}
assert(throws(() => vault.raw('首頁.md')).status === 400, 'raw refuses notes');
assert(vault.raw('attachments/pic.png').type === 'image/png', 'raw image ok');

assert(vault.resolve('專案/計畫') === '專案/計畫.md', 'resolve exact path');
assert(vault.resolve('計畫') === '專案/計畫.md', 'resolve by name');
assert(vault.resolve('WireGuard') === 'WireGuard.md', 'resolve shortest path wins');
assert(vault.resolve('子/WireGuard') === '專案/子/WireGuard.md', 'resolve path-qualified');
assert(vault.resolve('WireGuard|別名') === 'WireGuard.md' && vault.resolve('計畫#標題') === '專案/計畫.md', 'alias / heading stripped');
assert(vault.resolve('日記') === null, 'excluded note never resolves');
assert(vault.resolve('不存在') === null, 'missing note -> null');
assert(vault.resolve('pic.png', 'raw') === 'attachments/pic.png', 'resolve image by name');

const s = vault.search('tailscale');
assert(s.length === 1 && s[0].path === '專案/計畫.md' && s[0].snippet.includes('Tailscale'), 'search finds visible notes only');
assert(vault.search('wireguard')[0].name === 'WireGuard', 'name match ranked first');
fs.rmSync(v, { recursive: true, force: true });
