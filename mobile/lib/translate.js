// Online English → Traditional Chinese. Node built-in fetch only, no SDK. Two providers:
//   microsoft — Azure Translator: Dictionary Lookup gives a word's part of speech and several senses; Translate gives Traditional directly.
//   deepl     — DeepL API: Translate only, and it outputs Simplified Chinese only, so the result goes through toTraditional (OpenCC).
// The key and region stay in config.json and are never sent to the browser.
'use strict';

const BASE = 'https://api.cognitive.microsofttranslator.com';
const DEEPL_FREE = 'https://api-free.deepl.com', DEEPL_PRO = 'https://api.deepl.com';
const TO = 'zh-Hant';
// Azure allows 50,000 characters and a bounded number of items per request; stay well below both
const MAX_ITEMS = 25, MAX_CHARS = 40000;
const POS = { NOUN: 'n.', VERB: 'v.', ADJ: 'a.', ADV: 'ad.', PREP: 'prep.', CONJ: 'conj.', PRON: 'pron.', DET: 'det.', INTJ: 'int.', NUM: 'num.' };

// texts -> groups that each fit one request (order kept); a single text over the limit is refused, never cut
function chunks(texts) {
  const out = []; let cur = [], chars = 0;
  for (const t of texts) {
    const n = String(t).length;
    if (n > MAX_CHARS) throw new Error('這段文字太長，無法翻譯');
    if (cur.length && (cur.length >= MAX_ITEMS || chars + n > MAX_CHARS)) { out.push(cur); cur = []; chars = 0; }
    cur.push(String(t)); chars += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

// what the service said when it refused us, in words the user can act on
function mapError(status, detail = '') {
  if (status === 401) return '翻譯金鑰或區域不對，請檢查 config.json 的 translatorKey 與 translatorRegion';
  if (status === 403) return '翻譯服務的額度已用完，或這把金鑰沒有權限（可到服務的後台查看用量）';
  if (status === 429) return '翻譯服務請求太頻繁，請稍後再試';
  if (status === 456) return '翻譯服務的額度已用完（DeepL 免費方案每月 50 萬字元）';
  if (status === 400) return '翻譯服務不接受這段文字' + (detail ? '：' + detail.slice(0, 120) : '');
  return '翻譯服務暫時無法使用（HTTP ' + status + '）';
}

// [{translations:[{text,to}]}, …] -> ['…', …] in the order sent; anything missing is an error, never a silent gap
function parseTranslate(json, expected) {
  if (!Array.isArray(json) || json.length !== expected) throw new Error('翻譯服務的回應格式不對');
  return json.map((x) => {
    const t = x && Array.isArray(x.translations) && x.translations[0];
    if (!t || typeof t.text !== 'string') throw new Error('翻譯服務的回應格式不對');
    return t.text.trim();
  });
}

// Dictionary Lookup -> senses sorted by confidence: [{ pos, zh, confidence }]
function parseLookup(json) {
  const first = Array.isArray(json) && json[0];
  const list = (first && Array.isArray(first.translations) ? first.translations : [])
    .map((t) => ({ pos: POS[t.posTag] || '', zh: String(t.displayTarget || t.normalizedTarget || '').trim(), confidence: Number(t.confidence) || 0 }))
    .filter((s) => s.zh);
  return list.sort((a, b) => b.confidence - a.confidence);
}
// one line for the reader: "n. 敘述、故事　v. 敘述" — at most three parts of speech, three meanings each, duplicates dropped
function formatSenses(list) {
  const groups = new Map();
  for (const s of list) {
    const k = s.pos || '';
    const g = groups.get(k) || [];
    if (!g.includes(s.zh) && g.length < 3) g.push(s.zh);
    groups.set(k, g);
  }
  return [...groups.entries()].slice(0, 3).map(([k, g]) => (k ? k + ' ' : '') + g.join('、')).join('　');
}

// the client: ready only when a key is set; every call has a timeout and returns plain Chinese errors
function createTranslator({ provider = 'microsoft', key = '', region = '', fetchFn = globalThis.fetch, base, timeoutMs = 20000, toTraditional = null } = {}) {
  const ready = !!String(key || '').trim();
  const deepl = provider === 'deepl';
  const root = base || (deepl ? (String(key).trim().endsWith(':fx') ? DEEPL_FREE : DEEPL_PRO) : BASE);
  const headers = () => {
    if (deepl) return { Authorization: 'DeepL-Auth-Key ' + String(key).trim(), 'Content-Type': 'application/json' };
    const h = { 'Ocp-Apim-Subscription-Key': String(key).trim(), 'Content-Type': 'application/json; charset=UTF-8' };
    if (String(region || '').trim()) h['Ocp-Apim-Subscription-Region'] = String(region).trim();
    return h;
  };
  async function post(path, body) {
    if (!ready) throw new Error('還沒有設定翻譯服務的金鑰');
    let r;
    try {
      r = await fetchFn(root + path, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) { throw new Error('連不到翻譯服務：' + (e.name === 'TimeoutError' ? '逾時' : e.message)); }
    const text = await r.text();
    if (!r.ok) throw new Error(mapError(r.status, text));
    try { return JSON.parse(text); } catch { throw new Error('翻譯服務的回應格式不對'); }
  }
  // paragraphs (or any list of strings) -> Traditional Chinese, same order
  async function translate(texts) {
    const out = [];
    for (const group of chunks(texts)) {
      if (deepl) {
        // checked before the request: a result we cannot convert to Traditional is never returned as Simplified
        if (!toTraditional) throw new Error('簡體轉繁體的表格沒有載入，無法轉成台灣繁體');
        const json = await post('/v2/translate', { text: group, source_lang: 'EN', target_lang: 'ZH' });
        const list = Array.isArray(json && json.translations) ? json.translations : [];
        if (list.length !== group.length) throw new Error('翻譯服務的回應格式不對');
        out.push(...list.map((x) => toTraditional(String(x.text || '').trim())));
      } else {
        out.push(...parseTranslate(await post(`/translate?api-version=3.0&from=en&to=${TO}`, group.map((Text) => ({ Text }))), group.length));
      }
    }
    return out;
  }
  // one English word -> senses (a single word, never a sentence)
  async function lookup(word) {
    const w = String(word || '').trim();
    if (!/^[A-Za-z][A-Za-z'’-]{0,39}$/.test(w)) throw new Error('這不是一個英文單字');
    if (deepl) {
      // DeepL has no dictionary: one translation, no part of speech
      const [zh] = await translate([w]);
      return zh ? [{ pos: '', zh, confidence: 1 }] : [];
    }
    return parseLookup(await post(`/dictionary/lookup?api-version=3.0&from=en&to=${TO}`, [{ Text: w }]));
  }
  return { ready, provider: deepl ? 'deepl' : 'microsoft', host: root, translate, lookup };
}

module.exports = { createTranslator, chunks, mapError, parseTranslate, parseLookup, formatSenses, MAX_ITEMS, MAX_CHARS, TO };
