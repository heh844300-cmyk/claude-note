// Codex provider: every call must carry the lockdown flags (no shell, no file/image tools, no user config),
// run in an always-empty folder, and only the research role may enable web search.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { createAI } = require('../lib/ai');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-codex-'));
const fakeCodex = path.join(tmp, 'codex.js'); fs.writeFileSync(fakeCodex, '');
const calls = [];
const run = async (cmd, args, opts) => {
  calls.push({ cmd, args, opts });
  const o = args[args.indexOf('-o') + 1];
  fs.writeFileSync(o, 'RESULT');
  return { stdout: '', stderr: '' };
};
const CFG = { provider: 'codex', codex: fakeCodex, dataRoot: tmp, vision: true, smallModel: '', agentModel: '' };
const ai = createAI({ CFG, run, log: () => {} });

(async () => {
  fs.mkdirSync(path.join(tmp, 'codex-empty'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'codex-empty', 'leftover.txt'), 'x');
  const img = path.join(tmp, 'a.png'); fs.writeFileSync(img, 'x');
  assert(await ai.organize({ prompt: 'P', images: [img], model: '', timeoutMs: 1000 }) === 'RESULT', 'organize returns -o file content');
  await ai.research({ prompt: 'Q', model: 'm1', timeoutMs: 1000 });
  await ai.librarian({ prompt: 'L', model: '', timeoutMs: 1000 });
  const [o, r, l] = calls;
  for (const [name, c] of [['organize', o], ['research', r], ['librarian', l]]) {
    const a = c.args;
    assert(c.cmd === process.execPath && a[0] === fakeCodex, name + ': runs codex.js with node');
    for (const f of ['shell_tool', 'unified_exec', 'view_image', 'apps', 'plugins', 'browser_use', 'browser_use_external', 'computer_use', 'in_app_browser', 'hooks']) {
      assert(a.some((x, i) => x === '--disable' && a[i + 1] === f), `${name}: --disable ${f}`);
    }
    assert(a.includes('--ignore-user-config') && a.includes('--ephemeral') && a[a.indexOf('-s') + 1] === 'read-only', name + ': read-only, no user config, ephemeral');
    assert(!a.some((x) => /dangerously|full-access|workspace-write/.test(x)), name + ': no dangerous flags');
    assert(path.basename(a[a.indexOf('-C') + 1]) === 'codex-empty' && path.basename(c.opts.cwd) === 'codex-empty', name + ': runs in the empty folder');
    assert(c.opts.input === (name === 'organize' ? 'P' : name === 'research' ? 'Q' : 'L'), name + ': prompt via stdin');
  }
  assert(fs.readdirSync(path.join(tmp, 'codex-empty')).length === 0, 'empty folder is emptied before a run');
  assert(r.args.indexOf('--search') === 1 && !o.args.includes('--search') && !l.args.includes('--search'), 'only research gets web search');
  assert(o.args.includes('--image=' + img) && !r.args.some((x) => x.startsWith('--image')), 'images only for organize');
  assert(r.args[r.args.indexOf('-m') + 1] === 'm1' && !o.args.includes('-m'), 'model passed only when set');
  assert(ai.agentAvailable(), 'agent available without a search key');
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => { console.log('FAIL', e.stack); process.exitCode = 1; });
