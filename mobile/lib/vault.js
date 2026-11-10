// Read-only access to the whole Obsidian vault for the web app (file list, open a note, resolve [[links]], search, images).
// Never writes. Hides dot folders (.obsidian, .trash, .stversions…) and any folder listed in CFG.vaultExclude.
'use strict';
const fs = require('fs');
const path = require('path');

const NOTE_EXT = new Set(['.md']);
const RAW_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.heic': 'image/heic', '.pdf': 'application/pdf' };
const MAX_FILES = 20000;

function createVault({ CFG }) {
  const root = () => path.resolve(CFG.vault);
  const excluded = () => (CFG.vaultExclude || []).map((x) => String(x).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase()).filter(Boolean);
  const isExcluded = (rel) => {
    const low = rel.toLowerCase();
    return low.split('/').some((s) => s.startsWith('.')) || excluded().some((x) => low === x || low.startsWith(x + '/'));
  };
  const toRel = (abs) => path.relative(root(), abs).split(path.sep).join('/');

  // vault-relative path -> absolute path, or throws; checks traversal, hidden/excluded folders, allowed extensions
  function safePath(rel, kinds = 'note') {
    if (typeof rel !== 'string' || !rel || rel.length > 500 || rel.includes('\0')) throw Object.assign(new Error('bad path'), { status: 400 });
    const norm = rel.replace(/\\/g, '/').replace(/^\/+/, '');
    const segs = norm.split('/');
    if (segs.some((s) => s === '' || s === '.' || s === '..')) throw Object.assign(new Error('bad path'), { status: 400 });
    if (isExcluded(norm)) throw Object.assign(new Error('這個位置不開放瀏覽'), { status: 403 });
    const ext = path.extname(norm).toLowerCase();
    const ok = kinds === 'note' ? NOTE_EXT.has(ext) : !!RAW_EXT[ext];
    if (!ok) throw Object.assign(new Error('不支援的檔案類型'), { status: 400 });
    const abs = path.resolve(root(), ...segs);
    if (!abs.toLowerCase().startsWith(root().toLowerCase() + path.sep)) throw Object.assign(new Error('bad path'), { status: 400 });
    return abs;
  }

  // every visible file (notes + images/pdf), relative paths
  function allFiles() {
    const out = [];
    const walk = (dir, depth) => {
      if (depth > 12 || out.length >= MAX_FILES) return;
      let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (e.name.startsWith('.')) continue;
        const abs = path.join(dir, e.name), rel = toRel(abs);
        if (isExcluded(rel)) continue;
        if (e.isDirectory()) walk(abs, depth + 1);
        else if (e.isFile()) {
          const ext = path.extname(e.name).toLowerCase();
          if (NOTE_EXT.has(ext) || RAW_EXT[ext]) out.push(rel);
        }
      }
    };
    walk(root(), 0);
    return out;
  }

  // one folder's contents: sub-folders (that contain notes somewhere) + notes
  function list(dirRel = '') {
    const prefix = dirRel ? dirRel.replace(/\/+$/, '') + '/' : '';
    if (prefix && isExcluded(prefix.slice(0, -1))) throw Object.assign(new Error('這個位置不開放瀏覽'), { status: 403 });
    const folders = new Map(), notes = [];
    for (const rel of allFiles()) {
      if (!rel.startsWith(prefix) || !rel.toLowerCase().endsWith('.md')) continue;
      const rest = rel.slice(prefix.length);
      const i = rest.indexOf('/');
      if (i >= 0) { const f = rest.slice(0, i); folders.set(f, (folders.get(f) || 0) + 1); }
      else {
        let st = null; try { st = fs.statSync(path.join(root(), ...rel.split('/'))); } catch {}
        notes.push({ path: rel, name: rest.replace(/\.md$/i, ''), mtime: st ? st.mtimeMs : 0, size: st ? st.size : 0 });
      }
    }
    return {
      dir: prefix.replace(/\/$/, ''),
      folders: [...folders].map(([name, count]) => ({ name, path: prefix + name, count })).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')),
      notes: notes.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')),
    };
  }

  function readNote(rel) { return fs.readFileSync(safePath(rel, 'note'), 'utf8'); }

  // Obsidian-style link resolution: exact path first, then by file name (shortest path wins)
  function resolve(target, kinds = 'note') {
    let t = String(target || '').split('|')[0].split('#')[0].trim().replace(/\\/g, '/');
    if (!t) return null;
    const want = kinds === 'note' && !/\.md$/i.test(t) ? t + '.md' : t;
    const files = allFiles();
    const low = want.toLowerCase();
    const exact = files.find((f) => f.toLowerCase() === low);
    if (exact) return exact;
    const base = path.posix.basename(low);
    const hits = files.filter((f) => path.posix.basename(f).toLowerCase() === base);
    if (!hits.length) return null;
    // path-qualified link like [[folder/name]]: prefer a match that ends with it
    const tail = hits.filter((f) => f.toLowerCase().endsWith('/' + low));
    return (tail.length ? tail : hits).sort((a, b) => a.length - b.length)[0];
  }

  function search(q, max = 50) {
    const query = String(q || '').trim().toLowerCase();
    if (!query) return [];
    const out = [];
    for (const rel of allFiles()) {
      if (!rel.toLowerCase().endsWith('.md')) continue;
      let md = ''; try { md = fs.readFileSync(path.join(root(), ...rel.split('/')), 'utf8'); } catch { continue; }
      const name = path.posix.basename(rel, '.md');
      const inName = name.toLowerCase().includes(query);
      const i = md.toLowerCase().indexOf(query);
      if (!inName && i < 0) continue;
      const snippet = i >= 0 ? md.slice(Math.max(0, i - 40), i + query.length + 60).replace(/\s+/g, ' ').trim() : '';
      out.push({ path: rel, name, snippet, score: (inName ? 10 : 0) + (i >= 0 ? 1 : 0) });
    }
    return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-Hant')).slice(0, max);
  }

  function raw(rel) { const abs = safePath(rel, 'raw'); return { abs, type: RAW_EXT[path.extname(abs).toLowerCase()] }; }

  const notes = () => allFiles().filter((f) => f.toLowerCase().endsWith('.md'));

  return { list, readNote, resolve, search, raw, safePath, notes };
}

module.exports = { createVault };
