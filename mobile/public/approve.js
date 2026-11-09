'use strict';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const code = location.hash.slice(1);
// The tailnet-only address of this app (trusted without a session cookie): same host, default HTTPS port
// (the public Funnel entrance runs on :8443 of the same machine name)
const TAILNET = 'https://' + location.hostname;

function done(msg) { $('#btns').hidden = true; const r = $('#result'); r.textContent = msg; r.hidden = false; }
function device(ua) {
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : '未知系統';
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung 瀏覽器' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '未知瀏覽器';
  return `${os}・${br}`;
}

async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let d = {}; try { d = await r.json(); } catch {}
  return { status: r.status, d };
}

async function load() {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(code)) return done('QR code 內容不正確');
  const { status, d } = await post('/api/auth/lookup', { code });
  if (status === 401) {
    // this phone has no session on the public address: hand over to the tailnet address (needs Tailscale on)
    if (location.origin !== TAILNET) { location.replace(TAILNET + '/approve.html#' + code); return; }
    return done('這支手機沒有權限核准登入');
  }
  if (status !== 200) return done(d.error || ('錯誤 ' + status));
  const t = new Date(d.created);
  $('#info').innerHTML =
    `<div class="row"><span class="lbl">裝置</span><span>${esc(device(d.ua))}</span></div>` +
    `<div class="row"><span class="lbl">IP</span><span>${esc(d.ip)}</span></div>` +
    `<div class="row"><span class="lbl">時間</span><span>${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}（${d.expiresIn} 秒後失效）</span></div>` +
    `<p class="hint left">${esc(d.ua)}</p>`;
  $('#btns').hidden = false;
}
async function decide(allow) {
  $('#allow').disabled = $('#deny').disabled = true;
  const { status, d } = await post('/api/auth/decide', { code, allow });
  if (status === 200) done(allow ? '✅ 已允許，那台裝置會自動進入筆記' : '已拒絕');
  else done(d.error || ('錯誤 ' + status));
  history.replaceState(null, '', location.pathname); // drop the code from the address bar
}
$('#allow').onclick = () => decide(true);
$('#deny').onclick = () => decide(false);
load();
