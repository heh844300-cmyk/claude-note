// Online translation (Microsoft Translator): request shape, chunking, parsing, plain-Chinese errors. A local fake server stands in for Azure.
'use strict';
const http = require('http');
const T = require('../lib/translate');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

// chunking
const many = Array.from({ length: 60 }, (_, i) => 'p' + i);
const cs = T.chunks(many);
assert(cs.length === 3 && cs[0].length === T.MAX_ITEMS && cs.flat().join() === many.join(), 'chunks: at most 25 items per request, order kept');
const big = ['x'.repeat(30000), 'y'.repeat(30000)];
assert(T.chunks(big).length === 2 && T.chunks(['a'.repeat(100)]).length === 1, 'chunks: a group stays under 40,000 characters');
assert(throws(() => T.chunks(['z'.repeat(40001)])).includes('太長'), 'chunks: one text over the limit is refused, never cut');

// errors
assert(T.mapError(401).includes('translatorKey') && T.mapError(403).includes('額度') && T.mapError(429).includes('太頻繁') && T.mapError(500).includes('500'), 'errors: plain Chinese messages that say what to check');

// parsing
assert(T.parseTranslate([{ translations: [{ text: ' 甲 ', to: 'zh-Hant' }] }, { translations: [{ text: '乙', to: 'zh-Hant' }] }], 2).join() === '甲,乙', 'parse: translations in order, trimmed');
assert(throws(() => T.parseTranslate([{ translations: [] }], 1)) && throws(() => T.parseTranslate([], 1)) && throws(() => T.parseTranslate({}, 1)), 'parse: a missing translation is an error, never a silent gap');
const lk = T.parseLookup([{ normalizedSource: 'narrative', translations: [
  { normalizedTarget: '敘述', displayTarget: '敘述', posTag: 'NOUN', confidence: 0.4 },
  { normalizedTarget: '故事', displayTarget: '故事', posTag: 'NOUN', confidence: 0.3 },
  { normalizedTarget: '敘述的', displayTarget: '敘述的', posTag: 'ADJ', confidence: 0.2 },
  { normalizedTarget: '敘述', displayTarget: '敘述', posTag: 'NOUN', confidence: 0.1 } ] }]);
assert(lk[0].zh === '敘述' && lk[0].pos === 'n.' && lk[lk.length - 1].confidence <= lk[0].confidence, 'lookup: senses sorted by confidence, part of speech mapped');
assert(T.formatSenses(lk) === 'n. 敘述、故事　a. 敘述的', 'lookup: one line, duplicates dropped, grouped by part of speech');
assert(T.formatSenses(T.parseLookup([])) === '' && T.parseLookup([{ translations: [{ displayTarget: '', posTag: 'X' }] }]).length === 0, 'lookup: nothing found gives an empty result');

// the client against a fake Azure
const seen = [];
let mode = 'ok';
const srv = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    seen.push({ url: req.url, key: req.headers['ocp-apim-subscription-key'], region: req.headers['ocp-apim-subscription-region'], ct: req.headers['content-type'], body: JSON.parse(body || '[]') });
    if (mode === 'slow') return; // never answers: the client must time out
    if (mode === 'err') { res.writeHead(Number(process.env.FAKE_STATUS || 403), { 'Content-Type': 'application/json' }); return res.end('{"error":{"code":403}}'); }
    if (req.url.startsWith('/translate')) return res.end(JSON.stringify(body && JSON.parse(body).map((x) => ({ translations: [{ text: '譯:' + x.Text, to: 'zh-Hant' }] }))));
    if (req.url.startsWith('/dictionary/lookup')) return res.end(JSON.stringify([{ translations: [{ displayTarget: '故事', posTag: 'NOUN', confidence: 0.5 }] }]));
    res.writeHead(404); res.end('{}');
  });
});
srv.listen(0, '127.0.0.1', async () => {
  const base = 'http://127.0.0.1:' + srv.address().port;
  try {
    const off = T.createTranslator({ key: '', base });
    assert(!off.ready, 'client: not ready without a key');
    let refused = ''; try { await off.translate(['x']); } catch (e) { refused = e.message; }
    assert(refused.includes('沒有設定') && seen.length === 0, 'client: refuses to call the service without a key');

    const t = T.createTranslator({ key: ' K1 ', region: 'eastasia', base });
    assert(t.ready, 'client: ready with a key');
    const out = await t.translate(Array.from({ length: 30 }, (_, i) => 'para ' + i));
    const calls = seen.filter((s) => s.url.startsWith('/translate'));
    assert(out.length === 30 && out[29] === '譯:para 29' && calls.length === 2 && calls[0].body.length === 25, 'translate: 30 paragraphs go in two requests, results in order');
    assert(calls[0].url === '/translate?api-version=3.0&from=en&to=zh-Hant' && calls[0].key === 'K1' && calls[0].region === 'eastasia' && calls[0].ct.startsWith('application/json') && calls[0].body[0].Text === 'para 0',
      'translate: endpoint, key (trimmed), region header and body shape');
    const noRegion = T.createTranslator({ key: 'K2', base });
    await noRegion.translate(['a']);
    assert(seen[seen.length - 1].region === undefined, 'translate: region header only sent when configured');

    const w = await t.lookup('narrative');
    const last = seen[seen.length - 1];
    assert(last.url === '/dictionary/lookup?api-version=3.0&from=en&to=zh-Hant' && last.body[0].Text === 'narrative' && w[0].zh === '故事', 'lookup: dictionary endpoint for one word, senses returned');
    let bad = ''; try { await t.lookup('這不是英文'); } catch (e) { bad = e.message; }
    assert(bad.includes('英文單字'), 'lookup: non-English input is refused before calling the service');

    mode = 'err'; process.env.FAKE_STATUS = '403';
    let e403 = ''; try { await t.translate(['q']); } catch (e) { e403 = e.message; }
    assert(e403.includes('額度'), 'errors: quota (403) becomes the plain message');
    process.env.FAKE_STATUS = '401';
    let e401 = ''; try { await t.lookup('story'); } catch (e) { e401 = e.message; }
    assert(e401.includes('translatorRegion'), 'errors: wrong key or region (401) says what to check');

    mode = 'slow';
    const short = T.createTranslator({ key: 'K3', base, timeoutMs: 300 });
    let slow = ''; try { await short.translate(['q']); } catch (e) { slow = e.message; }
    assert(slow.includes('逾時'), 'errors: a service that never answers times out with a message');
  } finally { srv.close(); }
  console.log(process.exitCode ? 'translate tests FAILED' : 'translate tests passed');
});

function throws(fn) { try { fn(); return ''; } catch (e) { return e.message; } }
