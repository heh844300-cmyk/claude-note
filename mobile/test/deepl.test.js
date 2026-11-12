// DeepL provider: request shape, host choice, Simplified → Traditional on the way back, quota and auth errors. A local fake stands in for DeepL.
'use strict';
const http = require('http');
const T = require('../lib/translate');
const { createConverter } = require('../lib/opencc');
const fs = require('fs'), path = require('path');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
const dir = path.join(__dirname, '..', 'lib', 'opencc');
const f = (n) => fs.readFileSync(path.join(dir, n), 'utf8');
const toTraditional = createConverter({ phrases: f('STPhrases.txt'), chars: f('STCharacters.txt'), twPhrases: f('TWPhrases.txt'), twVariants: f('TWVariants.txt') }).convert;

// host choice: free keys end in :fx and must use the free host
const freeHost = T.createTranslator({ provider: 'deepl', key: 'abc:fx' });
const proHost = T.createTranslator({ provider: 'deepl', key: 'abc' });
assert(freeHost.provider === 'deepl' && freeHost.ready && proHost.ready, 'deepl: ready with a key');
assert(T.mapError(456).includes('50 萬字元') && T.mapError(403).includes('額度'), 'deepl: quota (456) gets its own message');

const seen = [];
let mode = 'ok';
const srv = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    seen.push({ url: req.url, auth: req.headers.authorization, ct: req.headers['content-type'], region: req.headers['ocp-apim-subscription-region'], body: body ? JSON.parse(body) : null });
    if (mode === 'quota') { res.writeHead(456, { 'Content-Type': 'application/json' }); return res.end('{"message":"Quota exceeded"}'); }
    if (mode === 'auth') { res.writeHead(403, { 'Content-Type': 'application/json' }); return res.end('{"message":"Forbidden"}'); }
    if (req.url === '/v2/translate') {
      // DeepL answers in Simplified Chinese; one entry per text, in order
      return res.end(JSON.stringify({ translations: body && JSON.parse(body).text.map((x) => ({ detected_source_language: 'EN', text: x === 'data' ? '数据' : x === 'software' ? '软件' : '发展：' + x })) }));
    }
    res.writeHead(404); res.end('{}');
  });
});
srv.listen(0, '127.0.0.1', async () => {
  const base = 'http://127.0.0.1:' + srv.address().port;
  try {
    const t = T.createTranslator({ provider: 'deepl', key: 'SECRET-1', base, toTraditional });
    const out = await t.translate(['data', 'x']);
    const last = seen[seen.length - 1];
    assert(last.url === '/v2/translate' && last.auth === 'DeepL-Auth-Key SECRET-1' && last.ct === 'application/json' && last.region === undefined,
      'deepl: endpoint /v2/translate, DeepL-Auth-Key header, no Azure headers');
    assert(last.body.source_lang === 'EN' && last.body.target_lang === 'ZH' && last.body.text.join() === 'data,x', 'deepl: request asks for EN → ZH (Simplified) and sends the texts in order');
    assert(out[0] === '資料' && out[1] === '發展：x', 'deepl: Simplified answer comes back as Taiwan Traditional (數据 → 資料)');
    const sw = await t.lookup('software');
    assert(sw.length === 1 && sw[0].zh === '軟體' && sw[0].pos === '', 'deepl: a word gets one translation (no dictionary, no part of speech)');
    assert(freeHost.host === 'https://api-free.deepl.com' && proHost.host === 'https://api.deepl.com', 'deepl: keys ending in :fx use the free host, others the Pro host');
    const cfg = T.createTranslator({ provider: 'deepl', key: 'K:fx', base, toTraditional });
    await cfg.translate(['q']);
    assert(seen[seen.length - 1].auth === 'DeepL-Auth-Key K:fx', 'deepl: free key is sent as given');

    mode = 'quota';
    let q = ''; try { await t.translate(['q']); } catch (e) { q = e.message; }
    assert(q.includes('50 萬字元'), 'deepl: quota exhausted (456) gives the plain Chinese message');
    mode = 'auth';
    let a = ''; try { await t.translate(['q']); } catch (e) { a = e.message; }
    assert(a.includes('額度') || a.includes('權限'), 'deepl: refused key (403) gives a plain message');
  } finally { srv.close(); }
  console.log(process.exitCode ? 'deepl tests FAILED' : 'deepl tests passed');
});
// without the Simplified-to-Traditional tables the DeepL result is refused, never returned as Simplified
const noTables = T.createTranslator({ provider: 'deepl', key: 'K:fx', base: 'http://127.0.0.1:9', toTraditional: null });
noTables.translate(['data']).then(() => { console.log('FAIL deepl: returned a result without conversion'); process.exitCode = 1; }, (e) => {
  assert(e.message.includes('簡體轉繁體') && !e.message.includes('連不到'), 'deepl: no conversion tables means a clear error before any request');
});
