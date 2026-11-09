'use strict';
const $ = (s) => document.querySelector(s);
let pollTok = null, deadline = 0, timer = null;

async function begin() {
  $('#again').hidden = true;
  $('#qrBox').innerHTML = '<p class="hint">產生中…</p>';
  try {
    const r = await fetch('/auth/start', { method: 'POST' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
    pollTok = d.poll; deadline = Date.now() + d.expiresIn * 1000;
    const img = new Image();
    img.alt = '登入 QR code';
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(d.qr);
    $('#qrBox').replaceChildren(img);
    $('#loginState').innerHTML = '剩餘 <span id="left"></span> 秒';
    clearInterval(timer); timer = setInterval(tick, 2000); tick();
  } catch (e) {
    $('#qrBox').innerHTML = '';
    $('#loginState').textContent = '無法產生 QR code：' + e.message;
    $('#again').hidden = false;
  }
}

async function tick() {
  const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
  const el = $('#left'); if (el) el.textContent = left;
  if (!pollTok) return;
  try {
    const r = await fetch('/auth/poll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poll: pollTok }) });
    const d = await r.json();
    if (d.status === 'approved') { clearInterval(timer); $('#loginState').textContent = '✅ 已允許，進入中…'; location.replace('/'); return; }
    if (d.status === 'denied') return stop('❌ 手機上按了拒絕');
    if (d.status === 'expired' || left === 0) return stop('QR code 已失效');
  } catch { /* network hiccup: keep polling */ }
}
function stop(msg) {
  clearInterval(timer); pollTok = null;
  $('#qrBox').innerHTML = '';
  $('#loginState').textContent = msg;
  $('#again').hidden = false;
}
$('#again').onclick = begin;
begin();
