// Web tools for Agents running on an OpenAI-compatible model: web search + safe page fetch.
// fetch_url runs on THIS machine, so it must never reach local / private addresses
// (127.0.0.1:8787 serves every note without a login). Checked at connect time, on every redirect hop.
'use strict';
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');

// ---------- address policy ----------
function v4ToInt(ip) { return ip.split('.').reduce((a, b) => (a << 8) + (+b), 0) >>> 0; }
const V4_BLOCK = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([a, bits]) => [v4ToInt(a), bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0]);
function isBlockedV4(ip) { const n = v4ToInt(ip); return V4_BLOCK.some(([base, mask]) => ((n & mask) >>> 0) === ((base & mask) >>> 0)); }
function isBlockedIp(ip) {
  if (net.isIPv4(ip)) return isBlockedV4(ip);
  if (!net.isIPv6(ip)) return true;
  const s = ip.toLowerCase().split('%')[0];
  const mapped = s.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/) || s.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);
  if (s === '::' || s === '::1' || /^0*:0*:0*:0*:0*:0*:0*:0*1?$/.test(s)) return true;
  const first = parseInt(s.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true;   // fc00::/7 unique local (incl. Tailscale fd7a:115c:a1e0::/48)
  if ((first & 0xffc0) === 0xfe80) return true;   // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true;   // multicast
  if (s.startsWith('64:ff9b:')) return true;      // NAT64 can point at private v4
  if (s.startsWith('2001:db8:')) return true;
  return false;
}

// dns lookup that refuses blocked addresses; used as the socket's lookup so check and connect use the same answer
function safeLookup(hostname, options, cb) {
  if (typeof options === 'function') { cb = options; options = {}; }
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length) return cb(new Error('找不到這個網址的主機'));
    const bad = addrs.find((a) => isBlockedIp(a.address));
    if (bad) return cb(Object.assign(new Error('不允許連到本機或內部網路位址'), { code: 'EBLOCKED' }));
    const a = addrs[0];
    if (options && options.all) return cb(null, [a]);
    cb(null, a.address, a.family);
  });
}

function checkUrl(u) {
  let url; try { url = new URL(u); } catch { throw new Error('網址格式不正確'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('只支援 http／https 網址');
  if (url.username || url.password) throw new Error('網址不能包含帳號密碼');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || /^localhost$/i.test(host) || /\.localhost$/i.test(host) || /\.(local|internal|lan|home|ts\.net)$/i.test(host)) throw new Error('不允許連到本機或內部網路位址');
  if (net.isIP(host) && isBlockedIp(host)) throw new Error('不允許連到本機或內部網路位址');
  return url;
}

// ---------- fetch_url ----------
function requestOnce(url, { timeoutMs, maxBytes }) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, { method: 'GET', lookup: safeLookup, timeout: timeoutMs, headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ClaudeNoteAgent/1.0)', Accept: 'text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.1',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' } }, (res) => {
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size > maxBytes) { req.destroy(); resolve({ res, body: Buffer.concat(chunks), truncated: true }); } else chunks.push(c); });
      res.on('end', () => resolve({ res, body: Buffer.concat(chunks), truncated: false }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('讀取網頁逾時')));
    req.on('error', reject);
    req.end();
  });
}
function htmlToText(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  let s = html.replace(/<(script|style|noscript|svg|head|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ').replace(/<[^>]+>/g, ' ');
  const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const decode = (x) => x.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(parseInt(e.slice(e[1] === 'x' || e[1] === 'X' ? 2 : 1), e[1] === 'x' || e[1] === 'X' ? 16 : 10) || 32) : (ent[e.toLowerCase()] || m));
  s = decode(s).replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  return (title ? '標題：' + decode(title).trim() + '\n\n' : '') + s;
}
async function fetchUrl(u, { timeoutMs = 15000, maxBytes = 2 * 1024 * 1024, maxChars = 12000, maxRedirects = 5, keepHtml = false } = {}) {
  let url = checkUrl(u);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const { res, body, truncated } = await requestOnce(url, { timeoutMs, maxBytes });
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      url = checkUrl(new URL(res.headers.location, url).href); // re-check every hop
      continue;
    }
    if (res.statusCode >= 400) throw new Error(`網頁回應 ${res.statusCode}`);
    const type = String(res.headers['content-type'] || '');
    if (type && !/text\/|json|xml|javascript/i.test(type)) throw new Error('不是文字內容（' + type.split(';')[0] + '）');
    const raw = body.toString('utf8');
    let text = /html/i.test(type) || /^\s*</.test(raw) ? htmlToText(raw) : raw;
    if (text.length > maxChars) text = text.slice(0, maxChars) + '\n…（內容過長，已截斷）';
    if (truncated) text += '\n…（網頁過大，只讀了前段）';
    return keepHtml ? { url: url.href, text, html: raw } : { url: url.href, text };   // keepHtml: the reading feature extracts the article itself
  }
  throw new Error('轉址次數太多');
}

// ---------- web_search ----------
async function webSearch(query, search, { count = 6, timeoutMs = 20000 } = {}) {
  const q = String(query || '').trim().slice(0, 300);
  if (!q) throw new Error('搜尋字串是空的');
  if (!search || !search.apiKey) throw new Error('沒有設定搜尋服務');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    if (search.provider === 'tavily') {
      const r = await fetch('https://api.tavily.com/search', { method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + search.apiKey },
        body: JSON.stringify({ query: q, max_results: count, search_depth: 'basic' }) });
      if (!r.ok) throw new Error('Tavily 搜尋失敗：HTTP ' + r.status);
      const j = await r.json();
      return (j.results || []).slice(0, count).map((x) => ({ title: x.title || '', url: x.url || '', snippet: String(x.content || '').slice(0, 500) }));
    }
    if (search.provider === 'brave') {
      const r = await fetch('https://api.search.brave.com/res/v1/web/search?count=' + count + '&q=' + encodeURIComponent(q), { signal: ctl.signal,
        headers: { Accept: 'application/json', 'X-Subscription-Token': search.apiKey } });
      if (!r.ok) throw new Error('Brave 搜尋失敗：HTTP ' + r.status);
      const j = await r.json();
      return ((j.web && j.web.results) || []).slice(0, count).map((x) => ({ title: x.title || '', url: x.url || '', snippet: String(x.description || '').replace(/<[^>]+>/g, '').slice(0, 500) }));
    }
    throw new Error('不支援的搜尋服務：' + search.provider);
  } finally { clearTimeout(t); }
}

module.exports = { isBlockedIp, checkUrl, fetchUrl, webSearch, htmlToText, safeLookup };
