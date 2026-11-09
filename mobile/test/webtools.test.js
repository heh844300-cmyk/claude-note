// fetch_url must never reach this machine or private networks (127.0.0.1:8787 serves every note without login).
'use strict';
const http = require('http');
const W = require('../lib/webtools');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

for (const ip of ['127.0.0.1', '127.8.8.8', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.101.102.103', '100.64.0.1', '169.254.169.254',
  '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd7a:115c:a1e0::1', 'fc00::1', '::ffff:127.0.0.1', '::ffff:192.168.0.1', 'ff02::1']) {
  assert(W.isBlockedIp(ip), 'blocked ' + ip);
}
for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111']) assert(!W.isBlockedIp(ip), 'allowed ' + ip);

(async () => {
  const bad = ['http://127.0.0.1:8787/api/notes', 'http://localhost:8787/', 'http://[::1]:8787/', 'http://100.101.102.103:8787/',
    'http://2130706433:8787/', 'http://0x7f000001:8787/', 'http://017700000001:8787/', 'file:///C:/Windows/win.ini',
    'http://user:pw@example.com/', 'https://msi.example.ts.net/', 'http://foo.localhost/', 'ftp://example.com/'];
  for (const u of bad) {
    let blocked = false;
    try { await W.fetchUrl(u, { timeoutMs: 3000 }); } catch (e) { blocked = true; }
    assert(blocked, 'refused ' + u);
  }
  // a public-looking hostname that resolves to loopback (DNS answer is checked at connect time)
  let e1 = null; try { await W.fetchUrl('http://localtest.me:8787/', { timeoutMs: 5000 }); } catch (e) { e1 = e; }
  assert(e1 && /本機|內部|ENOTFOUND|EAI_AGAIN/.test(e1.message + (e1.code || '')), 'hostname resolving to 127.0.0.1 refused: ' + (e1 && e1.message));

  // redirect to loopback: run a tiny local server that redirects, but reach it only through the guard -> must be refused anyway
  const srv = http.createServer((q, r) => { r.writeHead(302, { Location: 'http://127.0.0.1:8787/api/notes' }); r.end(); }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.on('listening', r));
  let e2 = null; try { await W.fetchUrl(`http://127.0.0.1:${srv.address().port}/`, { timeoutMs: 3000 }); } catch (e) { e2 = e; }
  assert(!!e2, 'local redirect server itself refused');
  srv.close();

  // html to text
  const t = W.htmlToText('<html><head><title>T&amp;1</title><script>evil()</script></head><body><p>Hello&nbsp;<b>world</b></p><li>x</li></body></html>');
  assert(t.includes('標題：T&1') && t.includes('Hello world') && !t.includes('evil'), 'htmlToText');
})();
