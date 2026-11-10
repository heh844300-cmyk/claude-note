// Version of this install (= the git commit it runs) and whether GitHub has a newer one.
// Version label: "v<number of commits>" — the same on every clone of the repo, and it only goes up.
// The check runs `git fetch` in the program folder (the same access update.cmd uses) and never asks for a login:
// without access it just reports "can't check". A new version on GitHub -> one push notification per new commit.
'use strict';
const { spawn } = require('child_process');

function git(cwd, args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    // no prompts of any kind: no terminal password prompt, no Git Credential Manager login window
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_ASKPASS: '', SSH_ASKPASS: '' };
    let p; try { p = spawn('git', args, { cwd, env, windowsHide: true }); } catch (e) { return reject(e); }
    const out = [], err = [];
    p.stdout.on('data', (c) => out.push(c)); p.stderr.on('data', (c) => err.push(c));
    const t = setTimeout(() => { p.kill(); reject(new Error('git 逾時')); }, timeoutMs);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); const s = Buffer.concat(out).toString('utf8').trim(); code === 0 ? resolve(s) : reject(new Error(Buffer.concat(err).toString('utf8').trim().slice(-300) || 'git exit ' + code)); });
  });
}
const parseLog = (s) => { const [sha, date, ...subj] = String(s).split('|'); return { sha, date, subject: subj.join('|') }; };

function createVersion({ repoDir, log = () => {}, onNew = async () => {}, notified = { has: () => false, add: () => {} } }) {
  const state = { version: '', sha: '', date: '', behind: 0, latest: null, checkedAt: null, error: '' };

  async function local() {
    try {
      const [count, head] = await Promise.all([git(repoDir, ['rev-list', '--count', 'HEAD']), git(repoDir, ['log', '-1', '--format=%h|%cs|%s', 'HEAD'])]);
      Object.assign(state, { version: 'v' + count }, parseLog(head));
      delete state.subject;
    } catch (e) { state.version = ''; state.error = '這份程式不是用 git 安裝的，無法顯示版本'; }
    return state;
  }

  async function check() {
    if (!state.sha) await local();
    if (!state.sha) return state;
    try {
      await git(repoDir, ['fetch', '--quiet', 'origin']);
      const up = await git(repoDir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(() => 'origin/main');
      const [behind, count, latest] = await Promise.all([git(repoDir, ['rev-list', '--count', 'HEAD..' + up]), git(repoDir, ['rev-list', '--count', up]),
        git(repoDir, ['log', '-1', '--format=%h|%cs|%s', up])]);
      state.behind = +behind || 0;
      state.latest = { version: 'v' + count, ...parseLog(latest) };
      state.error = '';
      if (state.behind > 0 && !notified.has(state.latest.sha)) {
        notified.add(state.latest.sha);
        log('new version on GitHub', state.latest.version, state.latest.sha);
        await onNew(state);
      }
    } catch (e) {
      state.error = '無法連到 GitHub 檢查新版本';
      log('version check failed:', e.message);
    }
    state.checkedAt = new Date().toISOString();
    return state;
  }

  return { local, check, get: () => state };
}

module.exports = { createVersion, parseLog };
