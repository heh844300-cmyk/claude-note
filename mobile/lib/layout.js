// Folder layout of Claude-Notes: user notes in 筆記/, concept notes in 知識庫/ (學習/, 信件/, 英文閱讀/ unchanged).
// Older installs kept user notes directly in Claude-Notes/ and concept notes in 研究/; migrate() moves them once,
// rewrites every link that spells out the old path, and backs up each rewritten file to .trash first.
'use strict';
const fs = require('fs');
const path = require('path');

const NOTE_FOLDER = '筆記';
const KB_FOLDER = '知識庫';
const OLD_KB_FOLDER = '研究';
const MARKER = 'layout.json';
const VERSION = 1;

// old note id "研究/x.md" (saved in jobs, drafts, push URLs on phones) -> "知識庫/x.md"
const upgradeId = (id) => typeof id === 'string' && id.startsWith(OLD_KB_FOLDER + '/') ? KB_FOLDER + id.slice(OLD_KB_FOLDER.length) : id;

// one link target (no alias / heading) in the new layout; unchanged when it does not point at a moved place
function mapTarget(t, folder, moved) {
  const low = t.toLowerCase(), f = folder.toLowerCase() + '/';
  if (low.startsWith(f + OLD_KB_FOLDER + '/')) return t.slice(0, f.length) + KB_FOLDER + t.slice(f.length + OLD_KB_FOLDER.length);
  if (low.startsWith(OLD_KB_FOLDER + '/')) return KB_FOLDER + t.slice(OLD_KB_FOLDER.length);
  if (low.startsWith(f)) {
    const rest = t.slice(f.length);
    if (rest && !rest.includes('/') && moved.has(rest.replace(/\.md$/i, '').trim().toLowerCase())) return t.slice(0, f.length) + NOTE_FOLDER + '/' + rest;
  }
  return t;
}

// [[target|alias]], ![[embed]], [[target#heading]] and [text](path%20with%20spaces.md); code is not special-cased
// (a link written inside code would point at the old place anyway). Returns { md, n }.
function rewriteLinks(md, folder, moved) {
  let n = 0;
  let out = String(md).replace(/(!?\[\[)([^\]|#^\n]+)/g, (all, open, t) => {
    const t2 = mapTarget(t, folder, moved);
    if (t2 === t) return all;
    n++; return open + t2;
  });
  out = out.replace(/(\]\()([^)\s]+)(\))/g, (all, open, t, close) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return all;          // http:, obsidian:, mailto: …
    let dec; try { dec = decodeURI(t); } catch { return all; }
    const t2 = mapTarget(dec, folder, moved);
    if (t2 === dec) return all;
    n++; return open + (t === dec ? t2 : encodeURI(t2)) + close;
  });
  return { md: out, n };
}

function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try { return fs.renameSync(from, to); }
    catch (e) {
      if (i >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (i + 1));   // Obsidian or sync may hold the file briefly
    }
  }
}
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const exists = (p) => { try { fs.statSync(p); return true; } catch { return false; } };

// every .md in the vault outside dot-folders (.trash, .obsidian): mail notes included, links there must not break either
function allNotes(vault) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 10) return;
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.isFile() && /\.md$/i.test(e.name)) out.push(p);
    }
  };
  walk(vault, 0);
  return out;
}

const stampOf = (d) => { const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}`; };

// Synchronous, before the server starts anything that reads or writes notes. Safe to rerun: a crash halfway is finished
// on the next start (the marker is written last). Returns a summary, or null when the vault is already in the new layout.
function migrate({ vault, folder, dataRoot, log = () => {}, now = new Date() }) {
  const marker = path.join(dataRoot, MARKER);
  try { if (JSON.parse(fs.readFileSync(marker, 'utf8')).version >= VERSION) return null; } catch {}
  const base = path.join(vault, folder), noteDir = path.join(base, NOTE_FOLDER);
  const sum = { kb: 0, notes: 0, skipped: [], files: 0, links: 0, jobs: 0, backup: null };
  if (isDir(base)) {
    const oldKb = path.join(base, OLD_KB_FOLDER), kb = path.join(base, KB_FOLDER);
    if (isDir(oldKb)) {
      if (!exists(kb)) { sum.kb = fs.readdirSync(oldKb).length; renameRetry(oldKb, kb); }
      else {
        for (const n of fs.readdirSync(oldKb)) {
          if (exists(path.join(kb, n))) { sum.skipped.push(OLD_KB_FOLDER + '/' + n); continue; }
          renameRetry(path.join(oldKb, n), path.join(kb, n)); sum.kb++;
        }
        try { fs.rmdirSync(oldKb); } catch {}               // left in place when something could not move
      }
    }
    fs.mkdirSync(noteDir, { recursive: true });
    for (const e of fs.readdirSync(base, { withFileTypes: true })) {
      if (!e.isFile() || !/\.md$/i.test(e.name)) continue;
      if (exists(path.join(noteDir, e.name))) { sum.skipped.push(e.name); continue; }
      renameRetry(path.join(base, e.name), path.join(noteDir, e.name)); sum.notes++;
    }
  }
  // links: every note now in 筆記/ whose name is not also still at the top (a skipped conflict keeps its old links)
  const moved = new Set();
  try {
    for (const n of fs.readdirSync(noteDir)) if (/\.md$/i.test(n) && !exists(path.join(base, n))) moved.add(n.replace(/\.md$/i, '').toLowerCase());
  } catch {}
  const backup = path.join(vault, '.trash', '版面調整前 ' + stampOf(now));
  for (const abs of allNotes(vault)) {
    let raw; try { raw = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const r = rewriteLinks(raw, folder, moved);
    if (!r.n) continue;
    const dst = path.join(backup, path.relative(vault, abs));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, raw, 'utf8');                     // the exact old bytes (BOM, CRLF) before any change
    fs.writeFileSync(abs + '.cn-tmp', r.md, 'utf8'); renameRetry(abs + '.cn-tmp', abs);
    sum.files++; sum.links += r.n; sum.backup = backup;
  }
  // Agent jobs: their note ids and source paths are matched against the new ids in the app
  const jf = path.join(dataRoot, 'agent-jobs.json');
  try {
    const jobs = JSON.parse(fs.readFileSync(jf, 'utf8'));
    if (Array.isArray(jobs)) {
      for (const j of jobs) {
        const note = upgradeId(j.note), src = typeof j.src === 'string' ? mapTarget(j.src, folder, moved) : j.src;
        if (note !== j.note || src !== j.src) { j.note = note; j.src = src; sum.jobs++; }
      }
      if (sum.jobs) { fs.writeFileSync(jf + '.tmp', JSON.stringify(jobs, null, 2)); renameRetry(jf + '.tmp', jf); }
    }
  } catch {}
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.writeFileSync(marker, JSON.stringify({ version: VERSION, at: now.toISOString(), ...sum }, null, 2));
  log(`layout: ${sum.notes} notes -> ${NOTE_FOLDER}/, ${sum.kb} -> ${KB_FOLDER}/, ${sum.links} links in ${sum.files} files` +
    (sum.skipped.length ? `, skipped (name taken): ${sum.skipped.join(', ')}` : '') + (sum.backup ? `, backup: ${sum.backup}` : ''));
  return sum;
}

module.exports = { NOTE_FOLDER, KB_FOLDER, OLD_KB_FOLDER, upgradeId, mapTarget, rewriteLinks, migrate };
