// QR-code login for the public (Tailscale Funnel) entrance.
// A browser that wants in gets a random, single-use, 2-minute login request shown as a QR code.
// An already-trusted device (on the tailnet, or with a valid public session) scans it and approves.
// The waiting browser then receives a 30-day session cookie. Only SHA-256 hashes of session tokens are stored.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COOKIE = '__Host-cn_session';
const REQ_TTL_MS = 2 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const START_LIMIT = 10;              // login requests per IP ...
const START_WINDOW_MS = 10 * 60 * 1000; // ... per 10 minutes
const MAX_PENDING = 30;

const rnd = (n) => crypto.randomBytes(n).toString('base64url');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createAuth({ dataRoot, log, onLogin }) {
  const file = path.join(dataRoot, 'sessions.json');
  let sessions = [];
  try { sessions = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const save = () => { fs.writeFileSync(file + '.tmp', JSON.stringify(sessions, null, 2)); fs.renameSync(file + '.tmp', file); };
  const pending = new Map(); // code -> request
  const starts = new Map();  // ip -> [timestamps]

  function sweep() {
    const now = Date.now();
    for (const [k, r] of pending) if (now > r.exp + 60000) pending.delete(k);
    const before = sessions.length;
    sessions = sessions.filter((s) => s.exp > now);
    if (sessions.length !== before) save();
    for (const [ip, ts] of starts) { const keep = ts.filter((t) => now - t < START_WINDOW_MS); if (keep.length) starts.set(ip, keep); else starts.delete(ip); }
  }
  setInterval(sweep, 60000).unref();

  function start(ip, ua) {
    sweep();
    const now = Date.now();
    const ts = starts.get(ip) || [];
    if (ts.filter((t) => now - t < START_WINDOW_MS).length >= START_LIMIT) return { error: '嘗試次數太多，請 10 分鐘後再試', status: 429 };
    if ([...pending.values()].filter((r) => r.status === 'pending' && r.exp > now).length >= MAX_PENDING) return { error: '目前登入要求太多，請稍後再試', status: 429 };
    ts.push(now); starts.set(ip, ts);
    const r = { code: rnd(16), poll: rnd(24), ip, ua: String(ua || '').slice(0, 200), created: now, exp: now + REQ_TTL_MS, status: 'pending', token: null };
    pending.set(r.code, r);
    log('login request from', ip);
    return { code: r.code, poll: r.poll, expiresIn: REQ_TTL_MS / 1000 };
  }

  const findByPoll = (poll) => { for (const r of pending.values()) if (typeof poll === 'string' && r.poll.length === poll.length && crypto.timingSafeEqual(Buffer.from(r.poll), Buffer.from(poll))) return r; return null; };

  // browser polling: returns { status } and, exactly once after approval, a session token
  function poll(pollToken) {
    const r = findByPoll(pollToken);
    if (!r) return { status: 'expired' };
    if (r.status === 'pending' && Date.now() > r.exp) return { status: 'expired' };
    if (r.status === 'approved' && r.token) { const token = r.token; r.token = null; r.status = 'used'; pending.delete(r.code); return { status: 'approved', token }; }
    return { status: r.status === 'used' ? 'expired' : r.status };
  }

  function lookup(code) {
    const r = typeof code === 'string' ? pending.get(code) : null;
    if (!r || r.status !== 'pending' || Date.now() > r.exp) return null;
    return { ip: r.ip, ua: r.ua, created: new Date(r.created).toISOString(), expiresIn: Math.max(0, Math.round((r.exp - Date.now()) / 1000)) };
  }

  function decide(code, allow, approver) {
    const r = typeof code === 'string' ? pending.get(code) : null;
    if (!r || r.status !== 'pending' || Date.now() > r.exp) return { error: '這個登入要求已失效，請在要登入的裝置上重新產生 QR code', status: 410 };
    if (!allow) { r.status = 'denied'; log('login denied', r.ip); return { ok: true }; }
    const token = rnd(32);
    const s = { id: rnd(9), hash: sha(token), created: new Date().toISOString(), exp: Date.now() + SESSION_TTL_MS, ip: r.ip, ua: r.ua, approvedBy: approver };
    sessions.push(s); save();
    r.status = 'approved'; r.token = token;
    log('login approved', r.ip, 'by', approver);
    if (onLogin) onLogin(s);
    return { ok: true };
  }

  function cookieToken(req) {
    const c = req.headers.cookie || '';
    for (const part of c.split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim(); }
    return null;
  }
  function check(req) {
    const t = cookieToken(req);
    if (!t || t.length > 100) return null;
    const h = sha(t), now = Date.now();
    const s = sessions.find((x) => x.hash === h && x.exp > now);
    if (s && (!s.lastSeen || now - Date.parse(s.lastSeen) > 3600000)) { s.lastSeen = new Date(now).toISOString(); save(); }
    return s || null;
  }
  const cookieFor = (token) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`;
  const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  const list = () => { sweep(); return sessions.map(({ id, created, exp, ip, ua, lastSeen, approvedBy }) => ({ id, created, expires: new Date(exp).toISOString(), ip, ua, lastSeen, approvedBy })); };
  const revoke = (id) => { const n = sessions.length; sessions = sessions.filter((s) => s.id !== id); if (sessions.length !== n) { save(); log('session revoked', id); return true; } return false; };

  return { start, poll, lookup, decide, check, cookieFor, clearCookie, list, revoke };
}

module.exports = { createAuth };
