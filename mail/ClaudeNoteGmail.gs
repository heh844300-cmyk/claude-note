/**
 * Claude 筆記 ← Gmail（唯讀匯出）
 *
 * 這支程式在「你自己的」Google 帳號裡執行，只做兩件事：
 *   1. 讀取貼了「筆記」標籤的信（權限 gmail.readonly：只能讀，不能改、刪、寄信，也不能改標籤）
 *   2. 把每封信存成一個 .eml 檔，放進 Drive 的「ClaudeNote-Inbox」資料夾（權限 drive.file：只能碰這支程式自己建立的檔案）
 *
 * 電腦上的 Google Drive 桌面版會把資料夾同步下來，Claude 筆記只讀那個資料夾。
 * 這支程式沒有連到任何外部網址，也不會把信件送到別的地方。
 *
 * 使用方法見 docs/Gmail連接.md。權限要和 appsscript.json 一致（授權畫面只能出現三項：讀取 Gmail、管理這支程式建立的 Drive 檔案、設定觸發條件）。
 */

const LABEL_NAME = '筆記';              // 在 Gmail 貼上這個標籤的信才會匯出
const FOLDER_NAME = 'ClaudeNote-Inbox'; // Drive 裡的資料夾名稱
const MAX_BYTES = 8 * 1024 * 1024;      // 超過這個大小的信不匯出（附件太大）
const MAX_PER_RUN = 25;                 // 每次最多匯出幾封
const EVERY_MINUTES = 10;               // 自動檢查的間隔（分鐘）
const BUDGET_MS = 4 * 60 * 1000;        // 一次最多跑 4 分鐘（Apps Script 的單次上限是 6 分鐘）

/** 第一次使用：建立資料夾、設定每 10 分鐘自動匯出，並立刻匯出一次。 */
function setup() {
  const folderId = ensureFolder_();
  removeTrigger();
  ScriptApp.newTrigger('exportLabelled').timeBased().everyMinutes(EVERY_MINUTES).create();
  Logger.log('完成：資料夾「%s」（%s），每 %s 分鐘自動匯出一次。', FOLDER_NAME, folderId, EVERY_MINUTES);
  exportLabelled();
}

/** 停止自動匯出（不會刪任何檔案）。 */
function removeTrigger() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'exportLabelled').forEach((t) => ScriptApp.deleteTrigger(t));
}

/** 檢查用：標籤在不在、有幾封信、資料夾裡已經有幾個檔案。 */
function check() {
  const labelId = findLabelId_();
  Logger.log('標籤「%s」：%s', LABEL_NAME, labelId ? '找到了' : '找不到（請先在 Gmail 建立這個標籤）');
  if (labelId) Logger.log('貼了這個標籤的信：%s 封', Gmail.Users.Labels.get('me', labelId).messagesTotal);
  const folderId = ensureFolder_();
  Logger.log('資料夾「%s」裡已匯出：%s 封', FOLDER_NAME, existingIds_(folderId).size);
  Logger.log('自動匯出：%s', ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'exportLabelled') ? '已開啟' : '沒有開啟（執行 setup）');
}

/** 由觸發條件每 10 分鐘執行：把貼了標籤、還沒匯出的信存成 .eml。 */
function exportLabelled() {
  const started = Date.now();
  const labelId = findLabelId_();
  if (!labelId) { Logger.log('找不到標籤「%s」。先在 Gmail 建立這個標籤，再貼到要整理的信上。', LABEL_NAME); return; }
  const folderId = ensureFolder_();
  const have = existingIds_(folderId);          // 已經匯出的信（從檔名取得 Gmail 信件編號）
  const tooBig = loadSkipped_();
  let exported = 0, failed = 0, token = null;
  do {
    const page = Gmail.Users.Messages.list('me', { labelIds: [labelId], maxResults: 100, pageToken: token || undefined });
    for (const m of page.messages || []) {
      if (have.has(m.id) || tooBig.has(m.id)) continue;
      if (exported >= MAX_PER_RUN || Date.now() - started > BUDGET_MS) { Logger.log('本次匯出 %s 封；其餘的下一次再處理。', exported); return; }
      // 先看大小（很小的呼叫），太大的不下載
      const size = Gmail.Users.Messages.get('me', m.id, { format: 'minimal' }).sizeEstimate || 0;
      if (size > MAX_BYTES) { tooBig.add(m.id); saveSkipped_(tooBig); Logger.log('略過太大的信（%s MB）：%s', Math.round(size / 1048576), m.id); continue; }
      try {
        const msg = Gmail.Users.Messages.get('me', m.id, { format: 'raw' });
        const name = Utilities.formatDate(new Date(Number(msg.internalDate)), 'UTC', "yyyyMMdd'T'HHmmss'Z'") + '-' + m.id + '.eml';
        const blob = Utilities.newBlob(decodeRaw_(msg.raw), 'message/rfc822', name);
        Drive.Files.create({ name: name, parents: [folderId], mimeType: 'message/rfc822' }, blob);
        have.add(m.id);
        exported++;
      } catch (e) {
        failed++;
        Logger.log('這封信匯出失敗（%s）：%s', m.id, e.message);
        if (failed >= 3) { Logger.log('連續失敗 3 封，先停止；請把上面的錯誤訊息告訴我。'); return; }
      }
    }
    token = page.nextPageToken;
  } while (token);
  Logger.log('本次匯出 %s 封。', exported);
}

// ---------- 小工具 ----------
function findLabelId_() {
  const labels = Gmail.Users.Labels.list('me').labels || [];
  const hit = labels.filter((l) => l.name === LABEL_NAME)[0];
  return hit ? hit.id : '';
}
// 資料夾：先用記下來的編號；不見了（被刪掉）就找同名的；都沒有才建立
function ensureFolder_() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty('folderId');
  if (saved) {
    try { const f = Drive.Files.get(saved, { fields: 'id,trashed' }); if (f && !f.trashed) return saved; } catch (e) { /* 找不到了 */ }
  }
  const found = Drive.Files.list({ q: "name = '" + FOLDER_NAME + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false", fields: 'files(id)', pageSize: 1 }).files || [];
  const id = found.length ? found[0].id : Drive.Files.create({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }).id;
  props.setProperty('folderId', id);
  return id;
}
// 資料夾裡已有的檔案（drive.file 權限只看得到這支程式自己建立的檔案）：檔名是「時間-信件編號.eml」
function existingIds_(folderId) {
  const ids = new Set();
  let token = null;
  do {
    const page = Drive.Files.list({ q: "'" + folderId + "' in parents and trashed = false", fields: 'nextPageToken, files(name)', pageSize: 1000, pageToken: token || undefined });
    (page.files || []).forEach((f) => ids.add(String(f.name).replace(/\.eml$/, '').split('-').pop()));
    token = page.nextPageToken;
  } while (token);
  return ids;
}
// Gmail 回傳的信件原文是 base64url（用 - 和 _，常常沒有補結尾的 =）。整理成標準 base64 再解碼；
// 如果拿到的已經是信件原文本身（"Received: …" 這種標頭開頭），就直接使用。
function decodeRaw_(raw) {
  if (raw === undefined || raw === null || raw === '') throw new Error('Gmail 沒有回傳信件原文（raw 是空的）');
  // 形式一：位元組陣列（有些情況 Apps Script 會直接回傳數字陣列）
  if (Array.isArray(raw)) return raw.map((n) => (n > 127 ? n - 256 : n));
  const text = String(raw);
  // 形式二：數字用逗號隔開（"82,101,99,…"）
  if (/^\s*-?\d+(\s*,\s*-?\d+)+\s*$/.test(text)) return text.split(',').map((n) => { const v = Number(n); return v > 127 ? v - 256 : v; });
  // 形式三：已經是信件原文（標頭開頭，例如 "Delivered-To: …"）
  if (/^[\x21-\x7e]+:\s/.test(text)) return Utilities.newBlob(text, 'message/rfc822').getBytes();
  // 形式四：base64 或 base64url
  let s = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  try {
    return Utilities.base64Decode(s);
  } catch (e) {
    // 只記型別、長度和開頭幾個字元的字元碼（數字），不記內容
    const head = text.slice(0, 12).split('').map((c) => c.charCodeAt(0)).join(' ');
    throw new Error('無法解碼信件原文（型別 ' + typeof raw + '；長度 ' + text.length + '；開頭字元碼 ' + head + '；含 +/：' + /[+\/]/.test(text) + '；含 -_：' + /[-_]/.test(text) + '；含 =：' + /=/.test(text) + '）：' + e.message);
  }
}
function loadSkipped_() {
  try { return new Set(JSON.parse(PropertiesService.getScriptProperties().getProperty('tooBig') || '[]')); } catch (e) { return new Set(); }
}
function saveSkipped_(set) {
  PropertiesService.getScriptProperties().setProperty('tooBig', JSON.stringify(Array.from(set).slice(-200)));
}
