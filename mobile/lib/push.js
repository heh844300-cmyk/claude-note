// Zero-dependency Web Push: RFC 8291 (aes128gcm payload encryption) + RFC 8292 (VAPID).
'use strict';
const crypto = require('crypto');
const fs = require('fs');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(s, 'base64url');

// ---------- payload encryption (RFC 8291) ----------
function encrypt(payload, uaPublicB64, authB64, { senderPriv, salt } = {}) {
  const uaPublic = unb64u(uaPublicB64);
  const auth = unb64u(authB64);
  const ecdh = crypto.createECDH('prime256v1');
  if (senderPriv) ecdh.setPrivateKey(senderPriv); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(uaPublic);
  salt = salt || crypto.randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, auth, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, ct]);
}

// ---------- VAPID keys / JWT (RFC 8292) ----------
function loadOrCreateVapid(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const keys = { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
  fs.writeFileSync(file, JSON.stringify(keys, null, 2));
  return keys;
}
function vapidAuth(endpoint, keys, subject) {
  const pub = unb64u(keys.publicKey);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: keys.privateKey };
  const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${keys.publicKey}`;
}

async function send(sub, data, keys, subject) {
  const body = encrypt(JSON.stringify(data), sub.keys.p256dh, sub.keys.auth);
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { TTL: '86400', Urgency: 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      Authorization: vapidAuth(sub.endpoint, keys, subject) },
    body,
  });
  return { status: r.status, text: r.ok ? '' : (await r.text()).slice(0, 300) };
}

module.exports = { encrypt, loadOrCreateVapid, vapidAuth, send, b64u, unb64u };

// `node lib/push.js --selftest` checks against the RFC 8291 section 5 example
if (require.main === module && process.argv.includes('--selftest')) {
  const out = encrypt('When I grow up, I want to be a watermelon',
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    'BTBZMqHH6r4Tts7J_aSIgg',
    { senderPriv: unb64u('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'), salt: unb64u('DGv6ra1nlYgDCS1FRnbzlw') });
  const expected = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
  console.log(b64u(out) === expected ? 'RFC8291 vector: PASS' : 'RFC8291 vector: FAIL\n' + b64u(out));
}
