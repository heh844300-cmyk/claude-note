// Zero-dependency MCP stdio server exposing one tool: sandbox_run.
// Commands run as the unprivileged 'agent' user inside the ClaudeSandbox WSL distro.
// The distro is reset from a clean snapshot on the first call of each session.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DISTRO = 'ClaudeSandbox';
const SANDBOX_DIR = path.join(__dirname, '..', '..', 'sandbox');
const SNAPSHOT = path.join(SANDBOX_DIR, 'clean.tar');
const DISK_DIR = path.join(SANDBOX_DIR, 'disk');
const LOG = path.join(__dirname, '..', 'logs', 'sandbox.log');
const MAX_OUT = 20000;
const CMD_TIMEOUT_S = 600;

const log = (...a) => { try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + a.join(' ') + '\n'); } catch {} };

function wsl(args, input, timeoutMs) {
  return new Promise((resolve) => {
    const p = spawn('wsl.exe', args, { windowsHide: true, env: { ...process.env, WSL_UTF8: '1' } });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stderr.on('data', (c) => chunks.push(c));
    const t = setTimeout(() => { p.kill(); chunks.push(Buffer.from('\n[timeout]')); }, timeoutMs);
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out: String(e) }); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out: Buffer.concat(chunks).toString('utf8') }); });
    p.stdin.end(input || '');
  });
}

let ready = false;
async function prepare() {
  if (ready) return;
  log('reset sandbox from snapshot');
  await wsl(['--terminate', DISTRO], '', 60000);
  await wsl(['--unregister', DISTRO], '', 120000);
  const imp = await wsl(['--import', DISTRO, DISK_DIR, SNAPSHOT, '--version', '2'], '', 300000);
  if (imp.code !== 0) throw new Error('沙盒重置失敗：' + imp.out.slice(-300));
  // install the current lockdown script from the Windows side (single source of truth)
  const script = fs.readFileSync(path.join(SANDBOX_DIR, 'ensure-sandbox.sh'), 'utf8').replace(/^﻿/, '').replace(/\r/g, '');
  const inst = await wsl(['-d', DISTRO, '-u', 'root', '--', 'bash', '-c', 'cat > /usr/local/sbin/ensure-sandbox.sh && chmod 700 /usr/local/sbin/ensure-sandbox.sh'], script, 60000);
  if (inst.code !== 0) throw new Error('沙盒設定失敗：' + inst.out.slice(-300));
  const ens = await wsl(['-d', DISTRO, '-u', 'root', '--', '/usr/local/sbin/ensure-sandbox.sh'], '', 60000);
  if (ens.code !== 0) throw new Error('沙盒鎖定失敗：' + ens.out.slice(-300));
  ready = true;
}

async function sandboxRun(command) {
  await prepare();
  // re-apply lockdown before every command (cheap, idempotent)
  const ens = await wsl(['-d', DISTRO, '-u', 'root', '--', '/usr/local/sbin/ensure-sandbox.sh'], '', 60000);
  if (ens.code !== 0) throw new Error('沙盒鎖定失敗：' + ens.out.slice(-300));
  log('run:', JSON.stringify(command).slice(0, 500));
  // the script arrives on stdin; the command itself gets /dev/null as stdin so nothing can block waiting for input
  const r = await wsl(['-d', DISTRO, '-u', 'agent', '--cd', '/home/agent/work', '--exec', 'timeout', '-k', '10', String(CMD_TIMEOUT_S),
    'bash', '-c', 'f=$(mktemp); cat > "$f"; bash "$f" < /dev/null 2>&1; rc=$?; rm -f "$f"; exit $rc'],
    command.replace(/\r/g, ''), (CMD_TIMEOUT_S + 30) * 1000);
  log('exit:', r.code, 'bytes:', r.out.length);
  let out = r.out;
  if (out.length > MAX_OUT) out = '[…前面輸出已截斷…]\n' + out.slice(-MAX_OUT);
  return `exit code: ${r.code}${r.code === 124 ? '（逾時）' : ''}\n${out}`;
}

const TOOL = {
  name: 'sandbox_run',
  description: '在隔離的 Linux 沙盒（Ubuntu 24.04，使用者 agent，沒有 sudo）裡用 bash 執行指令，回傳 exit code 與輸出。' +
    '已預裝 python3、pip、pipx、uv、git、node 18、npm、curl、build-essential。可以上公開網路下載與安裝（pip install --user、uv、npm 安裝到家目錄等），' +
    '但無法連到使用者的電腦、內網或 Windows 檔案。工作目錄 /home/agent/work，同一次任務中檔案會保留。單一指令最長 10 分鐘。',
  inputSchema: { type: 'object', properties: { command: { type: 'string', description: '要執行的 bash 指令（可多行）' } }, required: ['command'] },
};

const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
const fail = (id, code, message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') return reply(id, { protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'sandbox', version: '1.0.0' } });
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: [TOOL] });
  if (method === 'tools/call') {
    if (!params || params.name !== 'sandbox_run') return fail(id, -32602, 'unknown tool');
    const cmd = params.arguments && params.arguments.command;
    if (typeof cmd !== 'string' || !cmd.trim()) return reply(id, { content: [{ type: 'text', text: 'command 不能是空的' }], isError: true });
    try { return reply(id, { content: [{ type: 'text', text: await sandboxRun(cmd) }] }); }
    catch (e) { log('error', e.message); return reply(id, { content: [{ type: 'text', text: String(e.message) }], isError: true }); }
  }
  if (id !== undefined) fail(id, -32601, 'method not found');
}

let buf = '';
let chain = Promise.resolve();
process.stdin.on('data', (c) => {
  buf += c.toString('utf8');
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    chain = chain.then(() => handle(msg)).catch((e) => log('handler error', e.message));
  }
});
process.stdin.on('end', () => chain.then(() => process.exit(0)));
