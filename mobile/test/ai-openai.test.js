// OpenAI-compatible path against a scripted mock server: organize with images, the research tool loop
// (search + fetch, including a blocked local fetch), round limits, and a librarian call without tools.
'use strict';
const http = require('http');
const fs = require('fs'), path = require('path'), os = require('os');
const { createAI } = require('../lib/ai');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const requests = [];
let script = [];
const srv = http.createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  const j = JSON.parse(body); requests.push({ url: req.url, auth: req.headers.authorization, body: j });
  const next = script.shift() || { content: 'END' };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', ...next } }] }));
}).listen(0, '127.0.0.1');

(async () => {
  await new Promise((r) => srv.on('listening', r));
  const CFG = { provider: 'openai', apiBaseUrl: `http://127.0.0.1:${srv.address().port}/v1/`, apiKey: 'test-key', vision: true,
    search: { provider: 'tavily', apiKey: 'x' }, agentMaxRounds: 3, agentMaxSearches: 1, smallModel: 'm-small', agentModel: 'm-agent', vault: os.tmpdir() };
  const ai = createAI({ CFG, run: () => { throw new Error('CLI must not be used'); }, log: () => {} });

  // organize with an image
  const img = path.join(os.tmpdir(), 'cn-test.png'); fs.writeFileSync(img, Buffer.from([137, 80, 78, 71]));
  script = [{ content: 'TITLE: 測試\n\n內容' }];
  const o = await ai.organize({ prompt: 'P', images: [img], model: 'm-small', timeoutMs: 5000 });
  const r0 = requests[0];
  assert(o.startsWith('TITLE: 測試'), 'organize returns text');
  assert(r0.url === '/v1/chat/completions' && r0.auth === 'Bearer test-key' && r0.body.model === 'm-small', 'endpoint, key, model');
  assert(r0.body.messages[0].content[1].image_url.url.startsWith('data:image/png;base64,'), 'image sent as data URL');
  CFG.vision = false; script = [{ content: 'x' }];
  await ai.organize({ prompt: 'P', images: [img], model: 'm-small', timeoutMs: 5000 });
  assert(requests[1].body.messages[0].content.length === 1, 'no image parts when vision is off');

  // research loop: fetch of a local address is refused and reported back to the model as a tool error
  requests.length = 0;
  script = [
    { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'fetch_url', arguments: JSON.stringify({ url: 'http://127.0.0.1:8787/api/notes' }) } }] },
    { content: '最終答案' },
  ];
  const out = await ai.research({ prompt: 'Q', model: 'm-agent', timeoutMs: 20000 });
  assert(out === '最終答案', 'research returns final text');
  const toolMsg = requests[1].body.messages.find((m) => m.role === 'tool');
  assert(toolMsg && /工具錯誤/.test(toolMsg.content) && /本機|內部/.test(toolMsg.content), 'local fetch refused inside the loop');
  assert(requests[0].body.tools.map((t) => t.function.name).join() === 'web_search,fetch_url', 'only search + fetch tools offered');

  // search limit + round limit -> final call without tools
  requests.length = 0;
  const call = (id) => ({ content: null, tool_calls: [{ id, type: 'function', function: { name: 'web_search', arguments: '{"query":"a"}' } }] });
  script = [call('s1'), call('s2'), call('s3'), { content: '收尾' }];
  const out2 = await ai.research({ prompt: 'Q', model: 'm-agent', timeoutMs: 20000 });
  assert(out2 === '收尾', 'round limit -> forced final answer');
  const last = requests[requests.length - 1].body;
  assert(!last.tools && requests.length === 4, 'final call has no tools, total 3 rounds + 1');
  const toolTexts = requests[2].body.messages.filter((m) => m.role === 'tool').map((m) => m.content).join('\n');
  assert(/上限/.test(toolTexts), 'search limit enforced');

  // librarian: plain chat, no tools
  requests.length = 0; script = [{ content: '[]' }];
  await ai.librarian({ prompt: 'L', model: 'm-small', timeoutMs: 5000 });
  assert(!requests[0].body.tools, 'librarian gets no tools');

  // agent availability
  assert(ai.agentAvailable() === true, 'agent available with search key');
  CFG.search = { provider: '', apiKey: '' };
  assert(ai.agentAvailable() === false, 'agent unavailable without search');
  let err = null; try { await ai.research({ prompt: 'Q', model: 'm', timeoutMs: 1000 }); } catch (e) { err = e; }
  assert(err && /搜尋服務/.test(err.message), 'research refuses without search');
  srv.close(); fs.unlinkSync(img);
})().catch((e) => { console.log('FAIL', e.stack); process.exitCode = 1; srv.close(); });
