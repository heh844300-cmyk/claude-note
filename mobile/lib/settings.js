// The settings the app's 「⚙️ 設定」 page can change: a fixed list (nothing else in config.json is readable or writable
// from the browser — no keys, paths or URLs), validation, and merging into the config file's JSON. Pure functions.
'use strict';

// type: bool | int (min–max) | seconds (stored as milliseconds) | time (HH:mm or '') | model (short name or '') | lines (array of strings)
const SCHEMA = [
  { group: '✍️ 整理', items: [
    { key: 'maxTopics', type: 'int', min: 2, max: 20, label: '一次輸入最多拆成幾篇', hint: '內容有好幾個不相關的主題時，最多拆成幾篇筆記；多的併進最後一篇。' },
    { key: 'termSplit', type: 'bool', label: '名詞解釋拆成研究筆記', hint: '上傳後，把解釋名詞的段落移到「研究」資料夾，原處留摘要和連結。' },
    { key: 'maxTerms', type: 'int', min: 1, max: 20, label: '每篇最多拆出幾個名詞', hint: '學習筆記、英文閱讀筆記也適用。' },
    { key: 'bigTextChars', type: 'int', min: 200, max: 50000, label: '超過幾個字改用大模型整理', hint: '有照片或錄音時一律用大模型。' },
  ] },
  { group: '🔎 Agent', items: [
    { key: 'expandTerms', type: 'bool', label: '新名詞補寫「實際用途」', hint: '新拆出的名詞筆記，Agent 再上網查證補寫；每個名詞多用一次 Agent。' },
    { key: 'agentParallel', type: 'int', min: 1, max: 6, label: '補寫實際用途同時跑幾件', hint: '太多容易碰到 AI 的速率限制。' },
    { key: 'agentVerify', type: 'bool', label: '研究完查證引用的來源', hint: 'Agent 列出論點和引用的原文，系統實際打開每個來源檢查，並標出和既有筆記不一致的地方；每次研究多用一次小模型。' },
    { key: 'agentVerifyMax', type: 'int', min: 1, max: 30, label: '每次研究最多查證幾條論點', hint: '每條會開一次來源網頁。' },
    { key: 'agentTeam', type: 'bool', label: '用四個角色的研究團隊', hint: '文獻員、調查記者、紅隊、情報分析師各自獨立上網查，再由編輯整合，並列出四方不一致的地方。每次研究大約用 5 倍的 Agent 額度；這個模式不使用沙盒。' },
    { key: 'fillAfterMs', type: 'seconds', min: 0, max: 3600, label: '灰色連結空白幾秒後自動補寫', hint: '在 Obsidian 點灰色連結產生的空白筆記；0 是關閉。' },
    { key: 'dedupEveryDays', type: 'int', min: 0, max: 90, label: '每幾天掃描重複的名詞', hint: '0 是只在按按鈕時掃描。' },
  ] },
  { group: '📖 每日英文閱讀', items: [
    { key: 'readingTime', type: 'time', label: '每天幾點準備文章並推播', hint: '清空是不自動準備，只在按「現在找一篇文章」時才找。' },
    { key: 'translateWords', type: 'bool', label: '點單字用線上詞典查', hint: '用線上翻譯（DeepL 或 Azure）查單字；失敗或查不到時改用小模型。需要先在 config.json 設定翻譯金鑰（金鑰不在這裡）。' },
    { key: 'translatePara', type: 'bool', label: '段落旁顯示 🌐 中文翻譯', hint: '每段旁邊有 🌐，按了才翻譯並存起來。需要翻譯金鑰；沒有金鑰時按鈕不會出現。' },
    { key: 'readingReportTime', type: 'time', label: '每週日幾點產生週報並推播', hint: '週報會比較這週和上週的四個指標。清空是不自動產生，仍可以在每日英文頁手動產生。' },
    { key: 'readingCheckpoint', type: 'bool', label: '定期做檢查點文章', hint: '每隔幾天，當天的文章改成檢查點：不能查字、沒有簡化版、不能 🌐，5 題，答完用來校正你的等級。' },
    { key: 'readingCheckpointDays', type: 'int', min: 7, max: 90, label: '檢查點的間隔（天）', hint: '從上一次檢查點（或分級測驗）算起。' },
    { key: 'readingStances', type: 'bool', label: '每週主題讀三種立場', hint: '同一個主題的三篇文章依序是：支持、反對、實作經驗；第三篇讀完會問你站哪一邊。' },
    { key: 'readingNewsletters', type: 'bool', label: '用 Gmail 的英文電子報當每日文章', hint: '你在 Gmail 貼了「筆記」標籤的英文電子報，會成為之後的每日文章（不用上網找）；一般週才用，檢查點和立場週照舊。關閉時電子報只會整理成一般的信件筆記。' },
    { key: 'readingRelate', type: 'bool', label: '文章開頭對照你最近讀過的', hint: '準備文章時，用一句話說明這篇和你最近 3 篇閱讀筆記哪裡矛盾或互補（不多花一次 AI）。' },
    { key: 'readingFactcheck', type: 'bool', label: '上傳筆記後事實查核', hint: '筆記連到的研究筆記，由 Agent 上網查證有沒有和文章衝突；結果等你確認才會改筆記。每篇多用一次 Agent 額度。' },
    { key: 'readingSummary', type: 'bool', label: '每週一天用英文寫摘要', hint: '那天「你怎麼想」改成用英文寫三句摘要，AI 只指出最影響理解的一個錯誤，不計分、不影響等級。' },
    { key: 'readingSummaryDay', type: 'int', min: 0, max: 6, label: '英文摘要是星期幾（0＝週日 … 6＝週六）', hint: '預設 6（週六）。' },
  ] },
  { group: '✉️ 信箱（Gmail）', items: [
    { key: 'mailEnabled', type: 'bool', label: '讀取 Gmail 匯出的信件', hint: '把 Gmail 貼了「筆記」標籤的信整理成草稿。還沒有在 config.json 設定信箱（mailAccounts）時什麼也不會做；資料夾路徑不在這裡設定。' },
    { key: 'mailEveryMinutes', type: 'int', min: 5, max: 120, label: '每幾分鐘檢查一次', hint: '檢查 Drive 同步下來的資料夾有沒有新的信。' },
    { key: 'mailMaxPerRun', type: 'int', min: 1, max: 20, label: '每次最多整理幾封', hint: '每封信用一次 AI；一次貼了很多標籤時，會分幾次慢慢整理。' },
    { key: 'mailAutoUpload', type: 'bool', label: '整理好的信直接放進筆記庫', hint: '開啟後不用在草稿確認，整理完直接存進「信件」資料夾；關閉時信件會先變成草稿。信件內容不可信，所以只會放在「信件」資料夾，不會改動其他筆記。' },
    { key: 'mailKeepIgnored', type: 'bool', label: '自動讀到的「可以忽略」的信也留成筆記', hint: '預設關閉：全自動讀取的信如果被判斷成可以忽略（廣告、群發），只在「信件分流紀錄」加一行，不建筆記。你自己貼了「筆記」標籤的信一定會留。' },
    { key: 'mailNotify', type: 'bool', label: '收到新信時推播', hint: '一次檢查只推播一次，內容只有封數，不含主旨和寄件者。' },
  ] },
  { group: '🤖 模型', items: [
    { key: 'smallModel', type: 'model', label: '整理短筆記、查單字', hint: '例如 haiku。留空是用這個 AI 服務的預設模型。' },
    { key: 'bigModel', type: 'model', label: '整理長筆記、學習、英文閱讀', hint: '例如 sonnet。' },
    { key: 'agentModel', type: 'model', label: 'Agent 上網研究', hint: '例如 sonnet。' },
    { key: 'librarianModel', type: 'model', label: '決定研究結果放哪裡', hint: '例如 haiku。' },
  ] },
  { group: '🧩 其他', items: [
    { key: 'updateCheckHours', type: 'int', min: 0, max: 168, label: '每幾小時檢查新版本', hint: '0 是關閉。' },
    { key: 'vaultExclude', type: 'lines', label: '「🔍 搜尋」不顯示的資料夾', hint: '一行一個，例如：私人、日記/2025。這些資料夾也不會送給 AI。' },
  ] },
];
const ITEMS = SCHEMA.flatMap((g) => g.items);
const KEYS = ITEMS.map((x) => x.key);

// what the browser sees: the listed keys only, in the units the page shows
function view(cfg) {
  const show = (it) => { const v = cfg[it.key]; return it.type === 'seconds' ? Math.round((Number(v) || 0) / 1000) : it.type === 'lines' ? (Array.isArray(v) ? v : []) : it.type === 'bool' ? !!v : v == null ? '' : v; };
  return SCHEMA.map((g) => ({ group: g.group, items: g.items.map((it) => ({ ...it, value: show(it) })) }));
}
// one value from the page -> the value stored in config.json; throws a message for the user when it is not acceptable
function parseValue(it, raw) {
  const bad = (m) => { throw new Error(`「${it.label}」${m}`); };
  if (it.type === 'bool') { if (typeof raw !== 'boolean') bad('只能是開或關'); return raw; }
  if (it.type === 'int' || it.type === 'seconds') {
    const n = typeof raw === 'number' ? raw : /^\s*\d+\s*$/.test(String(raw)) ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n < it.min || n > it.max) bad(`要填 ${it.min}～${it.max} 的整數`);
    return it.type === 'seconds' ? n * 1000 : n;
  }
  if (it.type === 'time') {
    const s = String(raw == null ? '' : raw).trim(); if (!s) return '';
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m || +m[1] > 23 || +m[2] > 59) bad('要填 HH:mm，例如 07:30；清空是關閉');
    return String(+m[1]).padStart(2, '0') + ':' + m[2];
  }
  if (it.type === 'model') {
    const s = String(raw == null ? '' : raw).trim();
    if (!/^[A-Za-z0-9._:\/\-\[\]]{0,80}$/.test(s)) bad('只能用英文、數字和 . _ : / - [ ]，最多 80 個字');
    return s;
  }
  if (it.type === 'lines') {
    const list = (Array.isArray(raw) ? raw : String(raw == null ? '' : raw).split(/\r?\n/)).map((x) => String(x).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim()).filter(Boolean);
    if (list.length > 50 || list.some((x) => x.length > 200 || /(^|\/)\.\.?(\/|$)/.test(x) || /[\0<>:"|?*]/.test(x))) bad('裡有不能用的資料夾名稱');
    return [...new Set(list)];
  }
  bad('不能修改');
}
// { values } for the keys that changed, or throws; keys outside the list are refused, never ignored silently
function validate(patch, cfg) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('設定格式不對');
  const values = {};
  for (const [k, raw] of Object.entries(patch)) {
    const it = ITEMS.find((x) => x.key === k);
    if (!it) throw new Error('不能從這裡修改的設定：' + k);
    const v = parseValue(it, raw);
    if (JSON.stringify(v) !== JSON.stringify(cfg[k])) values[k] = v;
  }
  return values;
}
// config.json text with the values merged in: every other key (and the key order) is kept
function mergeIntoFile(text, values) {
  let obj = {};
  const t = String(text || '').replace(/^﻿/, '');
  if (t.trim()) { obj = JSON.parse(t); if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('config.json 的格式不對'); }
  for (const k of Object.keys(values)) if (!KEYS.includes(k)) throw new Error('不能從這裡修改的設定：' + k);
  return JSON.stringify({ ...obj, ...values }, null, 2) + '\n';
}

module.exports = { SCHEMA, KEYS, view, parseValue, validate, mergeIntoFile };
