// QR login sessions: personal (30 days) vs public computer (2 h, 15 min idle, browser-session cookie).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { createAuth } = require('../lib/auth');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-auth-'));
const logins = [];
const auth = createAuth({ dataRoot: dir, log: () => {}, onLogin: (s) => logins.push(s) });
const req = (tok) => ({ headers: { cookie: tok ? '__Host-cn_session=' + tok : '' } });
function login(kiosk) {
  const st = auth.start('1.2.3.4', 'UA', kiosk);
  assert(auth.lookup(st.code).kiosk === kiosk, 'lookup shows kiosk=' + kiosk);
  auth.decide(st.code, true, 'test');
  const p = auth.poll(st.poll);
  assert(p.status === 'approved' && p.kiosk === kiosk, 'poll returns token, kiosk=' + kiosk);
  return p.token;
}

const personal = login(false), kiosk = login(true);
assert(/Max-Age=2592000/.test(auth.cookieFor(personal, false)), 'personal cookie lasts 30 days');
assert(!/Max-Age/.test(auth.cookieFor(kiosk, true)), 'public-computer cookie has no Max-Age (dies with the browser)');
const ks = auth.check(req(kiosk));
assert(ks && ks.kiosk && ks.exp - Date.now() <= 2 * 3600 * 1000 + 1000 && ks.exp - Date.now() > 2 * 3600 * 1000 - 5000, 'public-computer session expires in 2 h');
assert(logins[1].kiosk === true, 'onLogin told it is a public computer');
assert(auth.list().find((s) => s.id === ks.id).kiosk === true, 'listed as public computer');

// idle 16 minutes -> logged out on next request; personal session unaffected
ks.seen = Date.now() - 16 * 60 * 1000;
assert(auth.check(req(kiosk)) === null, 'idle public-computer session refused');
assert(!auth.list().some((s) => s.id === ks.id), 'idle session removed');
const ps = auth.check(req(personal));
assert(ps && !ps.kiosk && ps.exp - Date.now() > 29 * 24 * 3600 * 1000, 'personal session still valid, 30 days');
// activity keeps a public-computer session alive
const k2 = login(true); const s2 = auth.check(req(k2));
s2.seen = Date.now() - 14 * 60 * 1000;
assert(auth.check(req(k2)) && Date.now() - s2.seen < 1000, 'activity within 15 min refreshes idle timer');
fs.rmSync(dir, { recursive: true, force: true });
