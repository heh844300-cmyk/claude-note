// A course outline that grows with its materials: the AI suggests changes from new materials, the user picks which to apply.
// Chapters keep a permanent id (c.n); a chapter already studied can only gain points, never be renamed, moved or merged away.
'use strict';
const { posOf, rulesBlock, DATA_NOTE } = require('./learn');

const TYPES = ['ADD', 'POINTS', 'EDIT', 'MOVE', 'MERGE', 'CONFLICT'];
const MAX_ITEMS = 12, LOG_MAX = 50;
const key = (s) => String(s || '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();

// ---------- chapter ids ----------
// Highest id ever used: chapters, levels, wrong answers and lesson files left behind (e.g. by an old full regeneration).
function usedMax(t, lessonIds = []) {
  return Math.max(0, t.nextChapter ? t.nextChapter - 1 : 0, ...(t.chapters || []).map((c) => +c.n || 0), ...Object.keys(t.levels || {}).map(Number).filter(Boolean),
    ...(t.wrong || []).map((w) => +w.chapter || 0), ...lessonIds.map(Number).filter(Boolean));
}
// a counter that only goes up: an id removed by a merge, or one with an orphaned lesson file, is never handed out again
function idAllocator(t, lessonIds = []) {
  let next = usedMax(t, lessonIds) + 1;
  return { next: () => { const n = next++; t.nextChapter = next; return n; }, peek: () => next };
}

// ---------- which chapters are fixed ----------
// studied = anything points at it: done, a lesson (any status), a linked note, a level, a wrong answer
function lockedIds(t, lessonIds = []) {
  const ls = new Set(lessonIds.map(Number));
  return new Set((t.chapters || []).filter((c) => c.status === 'done' || ls.has(c.n) || c.note || (t.levels || {})[c.n] || (t.wrong || []).some((w) => w.chapter === c.n)).map((c) => c.n));
}

// ---------- prompt ----------
function reviewPrompt(t, { locked, materialsText, pdfNote, newNames, all }) {
  const list = t.chapters.map((c, i) => `[代號 ${c.n}] 第${i + 1}章「${c.title}」${locked.has(c.n) ? '（🔒 已上過）' : ''}\n  重點：${c.points.join('；') || '（無）'}${c.source ? `\n  來源：${c.source}` : ''}`).join('\n');
  return `你是一位課程設計老師。學生在學「${t.title}」，${all ? '請對照下面附的全部教材' : `剛加入了新的教材（${newNames.join('、')}）`}，檢查目前的課程大綱，提出調整建議，讓大綱涵蓋教材的內容。${t.goal ? `\n學生的目標與程度：${t.goal}` : ''}

規則：
- 只根據附上的教材提出建議；教材的內容已經被某一章涵蓋的，就不要提。
- 標「🔒 已上過」的章節：學生已經學過，不能改標題、不能移動、不能合併掉。教材對它有補充時用 POINTS 補重點；說法和它不同時用 CONFLICT。
- 沒有鎖住的章節可以 EDIT（改標題或重點）、MOVE（調整順序）、MERGE（併進另一章）。要把一章拆成兩章：EDIT 原來那章，再 ADD 一章接在它後面。
- 新的主題用 ADD，放在最適合的位置。每章份量差不多（大約 20～40 分鐘可以學完），每章 2～5 個重點。
- 教材的說法和既有章節的重點衝突（定義、數據、結論不同）時用 CONFLICT，寫出兩邊的說法；不要自己判斷誰對。
- 章節一律用「代號」指定（不是第幾章）。用繁體中文（台灣用語），專有名詞可附英文。
- 最多 ${MAX_ITEMS} 條，重要的排前面；大綱不用改就只輸出一行 NONE。
${rulesBlock(t)}${DATA_NOTE}

輸出格式（每條建議一段，只輸出以下內容，不要前言、結語或 code block；用不到的欄位不要寫）：
=== CHANGE ===
TYPE: ADD | POINTS | EDIT | MOVE | MERGE | CONFLICT
CHAPTER: <要改的章節代號；ADD 寫要接在哪一章後面的代號，放最前面寫 0>
TITLE: <ADD 的新章節標題；EDIT 要改的新標題（不改就不寫）>
POINTS: <ADD、EDIT 寫這一章完整的重點；POINTS 只寫要新增的重點；用；分隔>
AFTER: <MOVE：移到哪一章後面的代號，最前面寫 0>
INTO: <MERGE：併進哪一章的代號>
OLD: <CONFLICT：大綱或既有章節原本的說法>
NEW: <CONFLICT：教材的說法>
SOURCE: <教材名稱與章節或頁數>
REASON: <為什麼要這樣改，一句>

===== 目前的大綱 =====
${list}
${pdfNote || ''}${materialsText ? '===== 教材 =====\n' + materialsText + '\n' : ''}`;
}

// ---------- parsing and checking ----------
const pointsOf = (s) => String(s || '').split(/[；;]/).map((x) => x.trim()).filter(Boolean).slice(0, 8);
const idOf = (s) => { const m = String(s || '').match(/\d+/); return m ? +m[0] : null; };
function parseSuggestions(out) {
  const s = String(out || '').replace(/\r/g, '');
  const items = [];
  for (const part of s.split(/^\s*=== CHANGE ===\s*$/m).slice(1)) {
    const f = {}; let k = null;
    for (const line of part.split('\n')) {
      const m = line.match(/^\s*(TYPE|CHAPTER|TITLE|POINTS|AFTER|INTO|OLD|NEW|SOURCE|REASON)\s*[:：]\s?(.*)$/);
      if (m) { k = m[1].toLowerCase(); f[k] = m[2].trim(); } else if (k && line.trim()) f[k] += ' ' + line.trim();
    }
    const type = TYPES.find((x) => String(f.type || '').toUpperCase().includes(x));
    if (!type) continue;
    items.push({ type, chapter: idOf(f.chapter), title: String(f.title || '').replace(/^第\s*\d+\s*[章課節]\s*[:：、.]?\s*/, '').trim().slice(0, 60), points: pointsOf(f.points),
      after: f.after != null ? idOf(f.after) : null, into: idOf(f.into), old: String(f.old || '').trim().slice(0, 500), new: String(f.new || '').trim().slice(0, 500),
      source: String(f.source || '').trim().slice(0, 120), reason: String(f.reason || '').trim().slice(0, 300) });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}
// why an item cannot be applied to these chapters right now ('' = it can)
function blockedReason(it, chapters, locked) {
  const has = (n) => chapters.some((c) => c.n === n);
  const name = (n) => { const c = chapters.find((x) => x.n === n); return c ? `「${c.title}」` : ''; };
  if (it.type === 'ADD') {
    if (!it.title) return '沒有章節標題';
    if (chapters.some((c) => key(c.title) === key(it.title))) return '已經有同名的章節';
    return '';
  }
  if (!has(it.chapter)) return '這一章已經不在大綱裡';
  if (it.type === 'POINTS') return it.points.length ? '' : '沒有要新增的重點';
  if (it.type === 'CONFLICT') return it.new ? '' : '沒有寫出教材的說法';
  if (locked.has(it.chapter)) return `${name(it.chapter)}已經上過，不能${it.type === 'EDIT' ? '改標題或重點' : it.type === 'MOVE' ? '移動' : '合併掉'}`;
  if (it.type === 'EDIT') return it.title || it.points.length ? (it.title && chapters.some((c) => c.n !== it.chapter && key(c.title) === key(it.title)) ? '已經有同名的章節' : '') : '沒有要改的內容';
  if (it.type === 'MOVE') return it.after === 0 || (has(it.after) && it.after !== it.chapter) ? '' : '找不到要移到哪裡';
  if (it.type === 'MERGE') return has(it.into) && it.into !== it.chapter ? '' : '找不到要併進哪一章';
  return '';
}
// parsed AI output -> review items shown to the user (blocked ones are shown but cannot be applied)
// titles of the chapters an item names are kept with it, so it still reads right after a merge removed one of them
function toItems(parsed, chapters, locked, makeId) {
  const labels = (it) => Object.fromEntries([it.chapter, it.after, it.into].map((n) => [n, (chapters.find((c) => c.n === n) || {}).title]).filter(([, v]) => v));
  return parsed.map((it) => ({ ...it, id: makeId(), labels: labels(it), blocked: blockedReason(it, chapters, locked), state: 'open' }));
}

// ---------- applying ----------
const addUnique = (list, more) => { const out = list.slice(); for (const p of more) if (!out.some((x) => key(x) === key(p))) out.push(p); return out; };
const mergeSource = (a, b) => (!b || String(a || '').includes(b) ? a || '' : (a ? a + '、' : '') + b).slice(0, 200);
// One pass over the chosen items, in order, against the chapters as they are now (locks re-checked here, not only when parsed).
// Returns new chapters plus what happened; a studied chapter that gains points is marked fresh (🆕) for a supplementary lesson.
function applySuggestions(chapters0, items, { locked, newId }) {
  const chapters = chapters0.map((c) => ({ ...c, points: c.points.slice(), fresh: (c.fresh || []).slice() }));
  const applied = [], skipped = [], changes = [];
  const find = (n) => chapters.find((c) => c.n === n);
  const insertAfter = (c, after) => { const i = after === 0 ? -1 : chapters.findIndex((x) => x.n === after); chapters.splice(i < 0 && after !== 0 ? chapters.length : i + 1, 0, c); };
  const gain = (c, pts) => { const before = c.points.length; c.points = addUnique(c.points, pts); const added = c.points.slice(before); if (locked.has(c.n)) c.fresh = addUnique(c.fresh, added); return added; };
  for (const it of items) {
    const why = blockedReason(it, chapters, locked);
    if (why) { skipped.push({ id: it.id, reason: why }); continue; }
    const c = find(it.chapter);
    if (it.type === 'ADD') {
      const nc = { n: newId(), title: it.title, points: it.points, source: it.source, status: 'todo', fresh: [] };
      insertAfter(nc, it.chapter == null ? null : it.chapter);
      changes.push(`新增章節「${nc.title}」`);
    } else if (it.type === 'POINTS') {
      const added = gain(c, it.points); c.source = mergeSource(c.source, it.source);
      if (!added.length) { skipped.push({ id: it.id, reason: '這些重點已經在大綱裡' }); continue; }
      changes.push(`「${c.title}」補充重點：${added.join('、')}`);
    } else if (it.type === 'EDIT') {
      const old = c.title;
      if (it.title) c.title = it.title;
      if (it.points.length) c.points = it.points;
      c.source = mergeSource(c.source, it.source);
      changes.push(it.title && it.title !== old ? `「${old}」改成「${c.title}」` : `「${c.title}」調整重點`);
    } else if (it.type === 'MOVE') {
      chapters.splice(chapters.indexOf(c), 1); insertAfter(c, it.after);
      changes.push(`「${c.title}」移到${it.after === 0 ? '最前面' : `「${find(it.after).title}」後面`}`);
    } else if (it.type === 'MERGE') {
      const into = find(it.into);
      gain(into, c.points); into.source = mergeSource(into.source, c.source);
      chapters.splice(chapters.indexOf(c), 1);
      changes.push(`「${c.title}」併入「${into.title}」`);
    } else if (it.type === 'CONFLICT') {
      const point = `新教材的說法：${it.new}` + (it.old ? `（原本：${it.old}）` : '');
      c.points = addUnique(c.points, [point]).slice(0, 12); if (locked.has(c.n)) c.fresh = addUnique(c.fresh, [point]);
      c.source = mergeSource(c.source, it.source);
      changes.push(`「${c.title}」記下教材的不同說法`);
    }
    applied.push(it.id);
  }
  for (const c of chapters) if (!c.fresh.length) delete c.fresh;
  return { chapters, applied, skipped, changes };
}
// the adjustment history kept in topic.json (newest last, capped)
const logEntry = (log, entry) => (log || []).concat([entry]).slice(-LOG_MAX);

// a supplementary lesson: only the points added since the chapter was taught
function supplementPrompt(t, c, { lesson, materialsText, web }) {
  return `你是一位很會教的老師。「${t.title}」的第 ${posOf(t.chapters, c.n)} 章「${c.title}」之前已經教過（原本的教學內容附在下面）。後來加入的教材補充了下面這些重點，請寫一段「補充教學」，只講這些新的內容：
${c.fresh.map((p) => '- ' + p).join('\n')}

規則：
- 不要重講原本已經教過的內容；需要時用一兩句帶過，再接到新內容。
- 寫著「新教材的說法：…（原本：…）」的，是教材和原本的說法不同：說明兩邊的差異、各自成立的條件或情境，${web ? '用網路搜尋查證哪一個正確，並列出來源' : '說明你判斷哪一個正確、為什麼；沒把握就明說'}。
- 每個新重點一個 ### 小節，由淺入深、給具體例子；最後加「### 補充重點整理」（條列）。
- 第一次出現的重要名詞寫成 Obsidian 連結，例如 [[正規化]]。用繁體中文（台灣用語）。
- 只輸出補充教學的內容（Markdown），不要前言或結語，不要寫測驗題。
${rulesBlock(t)}${DATA_NOTE}
===== 原本的教學內容 =====
${String(lesson || '').slice(0, 12000)}
${materialsText ? '===== 教材 =====\n' + materialsText + '\n' : ''}`;
}

module.exports = { TYPES, MAX_ITEMS, LOG_MAX, usedMax, idAllocator, lockedIds, reviewPrompt, parseSuggestions, blockedReason, toItems, applySuggestions, logEntry, supplementPrompt };
