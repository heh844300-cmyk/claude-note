// Creates the Agent sandbox: an isolated WSL distro (Ubuntu 24.04) used through mobile/lib/sandbox-mcp.js.
// Called by setup.ps1. Never touches other distros and never runs `wsl --shutdown`.
//
//   node sandbox-setup.js status  --name N --dir D
//   node sandbox-setup.js install --name N --dir D [--tailnet-ip IP] [--tailnet-name HOST] [--lan-gw IP]
//   node sandbox-setup.js remove  --name N --dir D
//
// Prints progress lines, then a final line: RESULT {json}
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const [cmd, ...rest] = process.argv.slice(2);
const arg = (k, d = '') => { const i = rest.indexOf(k); return i >= 0 && rest[i + 1] !== undefined ? rest[i + 1] : d; };
const NAME = arg('--name', 'ClaudeSandbox');
const DIR = path.resolve(arg('--dir', path.join(__dirname, '..', 'sandbox')));
const SCRIPTS = path.join(__dirname, '..', 'sandbox');
const DISK = path.join(DIR, 'disk');
const SNAP = path.join(DIR, 'clean.tar');
const say = (s) => console.log(s);
const done = (r) => { console.log('RESULT ' + JSON.stringify(r)); process.exit(r.ok ? 0 : 1); };
const lf = (f) => fs.readFileSync(path.join(SCRIPTS, f), 'utf8').replace(/^\uFEFF/, '').replace(/\r/g, '');

function wsl(args, input = '', timeoutMs = 120000) {
  return new Promise((resolve) => {
    const p = spawn('wsl.exe', args, { windowsHide: true, env: { ...process.env, WSL_UTF8: '1' } });
    const out = [];
    p.stdout.on('data', (c) => out.push(c)); p.stderr.on('data', (c) => out.push(c));
    const t = setTimeout(() => { p.kill(); out.push(Buffer.from('\n[timeout]')); }, timeoutMs);
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out: String(e) }); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out: Buffer.concat(out).toString('utf8').replace(/\0/g, '') }); });
    p.stdin.end(Buffer.from(input, 'utf8'));
  });
}
// run a bash script (sent on stdin) inside the distro; env vars passed through `env`
const runScript = (user, script, env = {}, timeoutMs = 30 * 60 * 1000) => wsl(['-d', NAME, '-u', user, '--exec', 'env',
  ...Object.entries(env).map(([k, v]) => `${k}=${v}`), 'bash', '-c', 'f=$(mktemp); cat > "$f"; bash "$f" < /dev/null 2>&1; rc=$?; rm -f "$f"; exit $rc'], script, timeoutMs);

async function distros() {
  const r = await wsl(['--list', '--quiet'], '', 60000);
  return r.code === 0 ? r.out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : null;
}
const ownedByDir = () => fs.existsSync(path.join(DISK, 'ext4.vhdx'));

async function status() {
  const st = await wsl(['--status'], '', 60000);
  const list = await distros();
  return { wsl: st.code === 0 && list !== null, exists: !!(list && list.includes(NAME)), owned: ownedByDir(), snapshot: fs.existsSync(SNAP), raw: st.out.slice(0, 400) };
}

async function isolation(env) {
  say('檢查隔離（沙盒裡的程式不能碰到你的電腦、筆記伺服器、Tailscale 和區網）…');
  const ens = await wsl(['-d', NAME, '-u', 'root', '--exec', '/usr/local/sbin/ensure-sandbox.sh'], '', 120000);
  if (ens.code !== 0) return { ok: false, lines: ['鎖定腳本執行失敗：' + ens.out.slice(-300)] };
  const r = await runScript('agent', lf('isolation-test.sh'), env, 5 * 60 * 1000);
  const lines = r.out.split(/\r?\n/).filter((l) => /^(ok|BAD|NOTE)/.test(l));
  lines.forEach((l) => say('  ' + l));
  const bad = lines.filter((l) => l.startsWith('BAD'));
  return { ok: lines.length > 5 && !bad.length, lines, bad };
}

(async () => {
  if (cmd === 'status') return done({ ok: true, ...(await status()) });

  if (cmd === 'remove') {
    const st = await status();
    if (st.exists && !st.owned) return done({ ok: false, error: `WSL 裡的「${NAME}」不是這個程式建立的，不會刪除它。` });
    if (st.exists) { await wsl(['--terminate', NAME]); const u = await wsl(['--unregister', NAME], '', 300000); if (u.code !== 0) return done({ ok: false, error: u.out.slice(-300) }); }
    fs.rmSync(DISK, { recursive: true, force: true }); fs.rmSync(SNAP, { force: true });
    return done({ ok: true });
  }

  if (cmd !== 'install') return done({ ok: false, error: 'usage: status|install|remove' });
  const env = { TAILNET_IP: arg('--tailnet-ip', '100.100.100.100'), TAILNET_NAME: arg('--tailnet-name', 'example.ts.net'), LAN_GW: arg('--lan-gw', '') };
  let st = await status();
  if (!st.wsl) return done({ ok: false, needWsl: true, error: 'WSL 還沒有安裝或還沒啟用' });
  if (st.exists && !st.owned) return done({ ok: false, error: `WSL 裡已經有一個叫「${NAME}」的發行版，而且不是這個程式建立的。為了不動到它，沙盒安裝停止。` });

  if (st.exists && st.snapshot) {
    say('沙盒已經建立過，重新檢查隔離…');
    const iso = await isolation(env);
    return done({ ok: iso.ok, reused: true, bad: iso.bad, error: iso.ok ? '' : '隔離檢查沒有通過' });
  }
  if (!st.exists) {
    fs.mkdirSync(DIR, { recursive: true });
    say('下載並建立 Ubuntu 24.04（約 2 GB，視網路速度可能要 5～15 分鐘）…');
    const ins = await wsl(['--install', 'Ubuntu-24.04', '--name', NAME, '--location', DISK, '--no-launch'], '', 60 * 60 * 1000);
    const list = await distros();
    if (!list || !list.includes(NAME)) {
      const hint = /--name|--location|invalid|無效|unknown/i.test(ins.out) ? '（你的 WSL 版本可能太舊，請先執行 wsl --update 再重試）' : '';
      return done({ ok: false, error: '建立 Ubuntu 失敗' + hint + '：' + ins.out.slice(-400) });
    }
  }
  say('安裝工具（Python、Node、git、編譯工具…）並建立沒有管理員權限的 agent 使用者…');
  const put = await wsl(['-d', NAME, '-u', 'root', '--exec', 'bash', '-c', 'cat > /tmp/ensure-sandbox.sh'], lf('ensure-sandbox.sh'), 60000);
  if (put.code !== 0) return done({ ok: false, error: '無法寫入沙盒：' + put.out.slice(-300) });
  const setup = await runScript('root', lf('setup-root.sh'));
  setup.out.split(/\r?\n/).filter((l) => /setup done|error|E:/i.test(l)).forEach((l) => say('  ' + l));
  if (setup.code !== 0) return done({ ok: false, error: '沙盒設定失敗：' + setup.out.slice(-500) });
  await wsl(['--terminate', NAME]); // apply wsl.conf (no Windows drives, no interop) — this distro only

  const iso = await isolation(env);
  if (!iso.ok) return done({ ok: false, bad: iso.bad, error: '隔離檢查沒有通過，沙盒不會啟用' });

  say('建立乾淨快照（每次 Agent 工作前都會從這裡還原，約 2 GB）…');
  await wsl(['--terminate', NAME]);
  const ex = await wsl(['--export', NAME, SNAP], '', 60 * 60 * 1000);
  if (ex.code !== 0 || !fs.existsSync(SNAP)) return done({ ok: false, error: '建立快照失敗：' + ex.out.slice(-300) });
  done({ ok: true, snapshotBytes: fs.statSync(SNAP).size });
})().catch((e) => done({ ok: false, error: e.message }));
