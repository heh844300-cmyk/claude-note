// Version of this install and whether GitHub has a newer one.
// The version number lives in the VERSION file at the repo root, as "<major>.<minor>":
//   major +1 (minor back to 0) = a new feature or an architecture change  -> shown as "V22"
//   minor +1                    = an optimisation, a fix or a small feature -> shown as "V22.1"
// The check runs `git fetch` in the program folder (the same access update.cmd uses) and never asks for a login:
// without access it just reports "can't check". A higher version on GitHub -> one push notification per version.
'use strict';
const fs = require('fs');
const path = require('path');
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
// "21.1" -> [21, 1]; anything else -> null
const parseVer = (s) => { const m = String(s || '').trim().match(/^v?(\d+)(?:\.(\d+))?$/i); return m ? [+m[1], +(m[2] || 0)] : null; };
const label = (v) => (v ? 'V' + v[0] + (v[1] ? '.' + v[1] : '') : '');
const newer = (a, b) => !!(a && b) && (a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1]);   // a newer than b

function createVersion({ repoDir, log = () => {}, onNew = async () => {}, notified = { has: () => false, add: () => {} } }) {
  const state = { version: '', sha: '', date: '', newer: false, behind: 0, latest: null, checkedAt: null, error: '' };
  let cur = null;

  async function local() {
    cur = parseVer((() => { try { return fs.readFileSync(path.join(repoDir, 'VERSION'), 'utf8'); } catch { return ''; } })());
    state.version = label(cur);
    try { Object.assign(state, parseLog(await git(repoDir, ['log', '-1', '--format=%h|%cs|%s', 'HEAD']))); delete state.subject; }
    catch { state.sha = ''; if (!cur) state.error = '這份程式不是用 git 安裝的，無法顯示版本'; }
    return state;
  }

  async function check() {
    await local();
    if (!state.sha) return state;
    try {
      await git(repoDir, ['fetch', '--quiet', 'origin']);
      const up = await git(repoDir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(() => 'origin/main');
      const [behind, latest, rv] = await Promise.all([git(repoDir, ['rev-list', '--count', 'HEAD..' + up]),
        git(repoDir, ['log', '-1', '--format=%h|%cs|%s', up]), git(repoDir, ['show', up + ':VERSION']).catch(() => '')]);
      const remote = parseVer(rv);
      state.behind = +behind || 0;
      state.latest = { version: label(remote), ...parseLog(latest) };
      state.newer = state.behind > 0 && newer(remote, cur);
      state.error = '';
      if (state.newer && !notified.has(state.latest.version)) {
        notified.add(state.latest.version);
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

module.exports = { createVersion, parseLog, parseVer, label, newer };
