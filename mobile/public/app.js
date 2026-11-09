'use strict';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  const type = r.headers.get('content-type') || '';
  const data = type.includes('json') ? await r.json() : await r.text();
  if (r.status === 401 && data && data.login) { location.href = '/login.html'; throw new Error('請先登入'); }
  if (!r.ok) throw new Error((data && data.error) || ('HTTP ' + r.status));
  return data;
}
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms);
}
const fmtTime = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// ---------- tabs ----------
let current = 'new';
function show(tab) {
  current = tab;
  document.querySelectorAll('.tab').forEach((s) => (s.hidden = s.id !== 'tab-' + tab));
  const navTab = tab === 'edit' ? 'drafts' : tab === 'read' ? 'notes' : tab;
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === navTab));
  if (tab === 'drafts') loadDrafts();
  if (tab === 'notes') loadNotes();
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => show(b.dataset.back)));

// ---------- new ----------
let picked = [];
function renderPicked() {
  $('#fileList').innerHTML = picked.map((f, i) =>
    `<li><span>${f.type.startsWith('image/') ? '📷' : f.type.startsWith('audio/') ? '🎙️' : '📄'} ${esc(f.name)} (${(f.size / 1048576).toFixed(1)} MB)</span><button type="button" data-i="${i}">移除</button></li>`).join('');
}
$('#fileList').addEventListener('click', (e) => { if (e.target.dataset.i != null) { picked.splice(+e.target.dataset.i, 1); renderPicked(); } });
['#pickImg', '#pickAud', '#pickTxt'].forEach((s) => $(s).addEventListener('change', (e) => {
  picked.push(...e.target.files); e.target.value = ''; renderPicked();
}));
try { $('#newText').value = localStorage.getItem('newText') || ''; } catch {}
$('#newText').addEventListener('input', () => { try { localStorage.setItem('newText', $('#newText').value); } catch {} });

$('#newForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#newText').value.trim();
  if (!text && !picked.length) return toast('請輸入文字或附加檔案');
  const fd = new FormData();
  fd.append('text', text);
  picked.forEach((f) => fd.append('files', f, f.name));
  const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = '傳送中…';
  try {
    await api('/api/drafts', { method: 'POST', body: fd });
    $('#newText').value = ''; try { localStorage.removeItem('newText'); } catch {}
    picked = []; renderPicked();
    toast('已送出，Claude 整理中');
    show('drafts');
  } catch (err) { toast('送出失敗：' + err.message, 5000); }
  finally { btn.disabled = false; btn.textContent = '交給 Claude 整理'; }
});

// ---------- drafts ----------
const STATUS = { processing: '整理中', ready: '待確認', error: '失敗' };
let pollTimer = null;
async function loadDrafts() {
  let list = [];
  try { list = await api('/api/drafts'); } catch (e) { toast('讀取草稿失敗：' + e.message); }
  const b = $('#draftCount'); b.hidden = !list.length; b.textContent = list.length;
  if (current === 'drafts') {
    $('#draftEmpty').hidden = list.length > 0;
    $('#draftList').innerHTML = list.map((d) => `<li data-id="${d.id}">
      <div class="t">${esc(d.title || d.preview || '（未命名）')}</div>
      <div class="m"><span class="pill ${d.status}">${STATUS[d.status] || d.status}</span>${esc(d.status === 'processing' ? d.stage : fmtTime(d.createdAt))}
      ${d.images ? ' · 📷' + d.images : ''}${d.audios ? ' · 🎙️' + d.audios : ''}${d.reminders ? ' · ⏰' + d.reminders : ''}${d.expires ? ' · 🗑️' + esc(d.expires.slice(5, 10).replace('-', '/')) : ''}</div></li>`).join('');
  }
  schedulePoll(list.some((d) => d.status === 'processing'));
  return list;
}
function schedulePoll(active) {
  clearTimeout(pollTimer);
  if (active) pollTimer = setTimeout(() => (current === 'edit' ? refreshEdit() : loadDrafts()), 3000);
}
$('#draftList').addEventListener('click', (e) => { const li = e.target.closest('li[data-id]'); if (li) openDraft(li.dataset.id); });

// ---------- edit ----------
let draft = null, dirty = false;
async function openDraft(id) {
  try { draft = await api('/api/drafts/' + id); } catch (e) { return toast(e.message); }
  dirty = false; fillEdit(); show('edit'); schedulePoll(draft.status === 'processing');
}
async function refreshEdit() {
  if (!draft) return;
  try {
    const d = await api('/api/drafts/' + draft.id);
    const was = draft.status; draft = d;
    if (was === 'processing' && d.status !== 'processing') { dirty = false; fillEdit(); toast(d.status === 'ready' ? 'Claude 整理好了' : '處理失敗'); }
    else updateStatus();
    schedulePoll(d.status === 'processing');
  } catch (e) { schedulePoll(true); }
}
function updateStatus() {
  const s = $('#editStatus'), busy = draft.status === 'processing';
  s.hidden = draft.status === 'ready';
  s.className = 'status' + (draft.status === 'error' ? ' error' : '');
  s.innerHTML = busy ? '⏳ ' + esc(draft.stage || '處理中…') + '<br><small>可以先關掉 app，晚點再回來。</small>'
    : draft.status === 'error' ? '⚠️ ' + esc(draft.error) + '<br><button type="button" id="retryBtn">重試</button>' : '';
  ['#edTitle', '#edTags', '#edBody', '#reviseText', '#reviseBtn', '#saveBtn', '#uploadBtn', '#deleteBtn', '#edExpMode', '#edExpires', '#addRem', '#edAgent'].forEach((q) => ($(q).disabled = busy));
  if (draft.status === 'error' && !draft.body) ['#reviseBtn', '#uploadBtn'].forEach((q) => ($(q).disabled = true));
  const r = $('#retryBtn'); if (r) r.onclick = retry;
}
function fillEdit() {
  $('#edTitle').value = draft.title || '';
  $('#edTags').value = (draft.tags || []).join(', ');
  $('#edBody').value = draft.body || '';
  $('#editImages').innerHTML = (draft.images || []).map((f) => `<img src="/api/drafts/${draft.id}/file/${encodeURIComponent(f)}" alt="">`).join('');
  let raw = draft.text || '';
  if (draft.transcript) raw += (raw ? '\n\n' : '') + '【錄音逐字稿】\n' + draft.transcript;
  $('#edRaw').hidden = !raw; $('#edRawText').textContent = raw;
  $('#edExpMode').value = draft.expires ? 'at' : 'never';
  $('#edExpires').value = draft.expires || defaultExpiry();
  $('#edExpires').hidden = !draft.expires;
  rems = (draft.reminders || []).map((r) => ({ ...r }));
  renderRems();
  $('#edAgent').checked = !!draft.agent;
  $('#edModel').textContent = draft.model ? `整理模型：${draft.model === 'haiku' ? 'Haiku（輕量）' : draft.model === 'sonnet' ? 'Sonnet' : draft.model}` : '';
  setMode('edit'); updateStatus(); checkTimes();
}
// ---- expiry & reminders ----
const pad2 = (n) => String(n).padStart(2, '0');
const toLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const defaultExpiry = () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(23, 59, 0, 0); return toLocal(d); };
let rems = [];
function renderRems() {
  const now = toLocal(new Date());
  $('#remList').innerHTML = rems.length ? rems.map((r, i) => `<li>
    <input type="datetime-local" data-i="${i}" data-k="at" value="${esc(r.at)}">
    <input type="text" data-i="${i}" data-k="text" value="${esc(r.text)}" placeholder="提醒內容">
    ${r.at && r.at <= now ? '<span class="past">⚠️ 這個時間已經過了：6 小時內的會在上傳後立刻通知一次，更早的會略過</span>' : ''}
    <button type="button" data-del="${i}" aria-label="刪除提醒">✕</button></li>`).join('') : '<li class="hint left" style="display:block;border:0">沒有提醒</li>';
}
$('#remList').addEventListener('input', (e) => { const i = e.target.dataset.i; if (i != null) { rems[i][e.target.dataset.k] = e.target.value; dirty = true; checkTimes(); } });
$('#remList').addEventListener('change', (e) => { if (e.target.dataset.k === 'at') renderRems(); });
$('#remList').addEventListener('click', (e) => { if (e.target.dataset.del != null) { rems.splice(+e.target.dataset.del, 1); dirty = true; renderRems(); checkTimes(); } });
$('#addRem').onclick = () => { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); rems.push({ at: toLocal(d), text: $('#edTitle').value.slice(0, 15) || '提醒' }); dirty = true; renderRems(); checkTimes(); };
$('#edExpMode').onchange = () => { $('#edExpires').hidden = $('#edExpMode').value !== 'at'; if (!$('#edExpires').value) $('#edExpires').value = defaultExpiry(); dirty = true; checkTimes(); };
$('#edExpires').oninput = () => { dirty = true; checkTimes(); };
$('#edAgent').onchange = () => (dirty = true);
function checkTimes() {
  const exp = $('#edExpMode').value === 'at' ? $('#edExpires').value : null;
  const last = rems.map((r) => r.at).filter(Boolean).sort().pop();
  let msg = '';
  if (exp && last && exp <= last) msg = '到期時間必須晚於最後一個提醒，否則提醒前筆記就被刪了。';
  else if (exp && exp <= toLocal(new Date())) msg = '到期時間已經過了，上傳後很快就會被移到垃圾桶。';
  $('#timeWarn').textContent = msg; $('#timeWarn').hidden = !msg;
  return !(exp && last && exp <= last);
}
['#edTitle', '#edTags', '#edBody'].forEach((q) => $(q).addEventListener('input', () => (dirty = true)));
const edits = () => ({ title: $('#edTitle').value, tags: $('#edTags').value, body: $('#edBody').value,
  expires: $('#edExpMode').value === 'at' ? $('#edExpires').value : null,
  reminders: rems.filter((r) => r.at), agent: $('#edAgent').checked });
function setMode(m) {
  $('#modeEdit').classList.toggle('active', m === 'edit'); $('#modePreview').classList.toggle('active', m === 'preview');
  $('#edBody').hidden = m !== 'edit'; $('#edPreview').hidden = m !== 'preview';
  if (m === 'preview') $('#edPreview').innerHTML = renderMd('# ' + $('#edTitle').value + '\n\n' + $('#edBody').value);
}
$('#modeEdit').onclick = () => setMode('edit');
$('#modePreview').onclick = () => setMode('preview');

$('#saveBtn').onclick = async () => {
  try { draft = await api('/api/drafts/' + draft.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edits()) }); dirty = false; toast('已儲存'); }
  catch (e) { toast('儲存失敗：' + e.message); }
};
$('#reviseBtn').onclick = async () => {
  const instruction = $('#reviseText').value.trim();
  if (!instruction) return toast('請先輸入修改要求');
  try {
    draft = await api('/api/drafts/' + draft.id + '/revise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...edits(), instruction }) });
    $('#reviseText').value = ''; dirty = false; updateStatus(); schedulePoll(true);
  } catch (e) { toast('失敗：' + e.message); }
};
async function retry() {
  try { draft = await api('/api/drafts/' + draft.id + '/retry', { method: 'POST' }); updateStatus(); schedulePoll(true); }
  catch (e) { toast('失敗：' + e.message); }
}
$('#uploadBtn').onclick = async () => {
  if (!checkTimes()) return toast('請先修正到期時間');
  if (!confirm('確定上傳到 Obsidian？上傳後草稿會移除。')) return;
  const btn = $('#uploadBtn'); btn.disabled = true;
  try {
    const r = await api('/api/drafts/' + draft.id + '/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edits()) });
    dirty = false; draft = null; toast('已上傳：' + r.name, 3500); show('notes'); loadDrafts();
  } catch (e) { toast('上傳失敗：' + e.message, 5000); btn.disabled = false; }
};
$('#deleteBtn').onclick = async () => {
  if (!confirm('確定刪除這份草稿？')) return;
  try { await api('/api/drafts/' + draft.id, { method: 'DELETE' }); draft = null; dirty = false; toast('已刪除'); show('drafts'); }
  catch (e) { toast('刪除失敗：' + e.message); }
};
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------- notes ----------
let noteFolder = 'mine';
document.querySelectorAll('#noteSeg button').forEach((b) => b.addEventListener('click', () => {
  noteFolder = b.dataset.f;
  document.querySelectorAll('#noteSeg button').forEach((x) => x.classList.toggle('active', x === b));
  loadNotes();
}));
async function loadNotes() {
  let list = [];
  try { list = await api('/api/notes' + (noteFolder === 'research' ? '?folder=research' : '')); } catch (e) { toast('讀取失敗：' + e.message); }
  $('#noteEmpty').hidden = list.length > 0;
  $('#noteEmpty').textContent = noteFolder === 'research' ? '還沒有研究筆記' : '還沒有上傳的筆記';
  $('#noteList').innerHTML = list.map((n) => `<li data-name="${esc(n.name)}"><div class="t">${esc(n.name.replace(/^研究\//, '').replace(/\.md$/i, ''))}</div>
    <div class="m">${fmtTime(new Date(n.mtime).toISOString())}${n.reminders ? ' · ⏰' + n.reminders : ''}${n.expires ? ' · 🗑️' + esc(n.expires.slice(5, 10).replace('-', '/')) + ' 到期' : ''}${AGENT_LABEL[n.agent] ? ' · ' + AGENT_LABEL[n.agent] : ''}</div></li>`).join('');
}
const AGENT_LABEL = { queued: '🔎 排隊中', running: '🔎 查資料中', done: '🔎 已完成', error: '🔎 失敗' };
let reading = null, agentTimer = null;
$('#noteList').addEventListener('click', (e) => { const li = e.target.closest('li[data-name]'); if (li) openNote(li.dataset.name); });
$('#readBody').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-note]');
  if (a) { e.preventDefault(); openNote(a.dataset.note); }
});
async function openNote(name) {
  try {
    const md = await api('/api/notes/' + encodeURIComponent(name));
    reading = name; $('#readBody').innerHTML = renderMd(md); show('read'); refreshAgent();
  } catch (err) { toast(err.message); }
}
async function refreshAgent() {
  clearTimeout(agentTimer);
  if (!reading || current !== 'read') return;
  let jobs = []; try { jobs = await api('/api/agent?note=' + encodeURIComponent(reading)); } catch {}
  const j = jobs[jobs.length - 1];
  const busy = j && (j.status === 'queued' || j.status === 'running');
  $('#agentState').textContent = !j ? '尚未執行' : j.status === 'done' ? `已完成 ${fmtTime(j.finishedAt)}${j.counts && j.counts.new ? `，新增 ${j.counts.new} 篇` : ''}${j.counts && j.counts.append ? `，補充 ${j.counts.append} 篇` : ''}${j.ticked ? `，完成 ${j.ticked} 項待辦` : ''}`
    : j.status === 'error' ? '失敗：' + j.error : j.status === 'running' ? '查資料中…（可能要幾分鐘）' : '排隊中…';
  $('#agentBtn').disabled = !!busy;
  $('#agentBtn').textContent = j ? '重新讓 Agent 查資料' : '讓 Agent 查資料';
  if (busy) agentTimer = setTimeout(refreshAgent, 5000);
  else if (j && j.status === 'done' && refreshAgent.was === 'busy') { try { $('#readBody').innerHTML = renderMd(await api('/api/notes/' + encodeURIComponent(reading))); } catch {} }
  refreshAgent.was = busy ? 'busy' : 'idle';
}
$('#agentBtn').onclick = async () => {
  try { await api('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: reading }) }); toast('Agent 開始查資料，完成後會通知你'); refreshAgent.was = 'busy'; refreshAgent(); }
  catch (e) { toast('失敗：' + e.message); }
};

// ---------- push notifications ----------
const b64ToBytes = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); const r = atob(s + '='.repeat((4 - s.length % 4) % 4)); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
async function notifStatus() {
  const st = $('#notifState');
  if (!('Notification' in window) || !('PushManager' in window)) { st.textContent = '這個瀏覽器不支援（請先加到主畫面）'; $('#notifBtn').disabled = true; return; }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  st.textContent = Notification.permission === 'denied' ? '已被封鎖，請到瀏覽器設定允許' : sub ? '已開啟 ✅' : '尚未開啟';
  $('#notifBtn').textContent = sub ? '重新註冊通知' : '開啟通知';
}
$('#notifBtn').onclick = async () => {
  try {
    if (await Notification.requestPermission() !== 'granted') { toast('沒有取得通知權限'); return notifStatus(); }
    const reg = await navigator.serviceWorker.ready;
    const { key } = await api('/api/push/key');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
    await api('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) });
    toast('通知已開啟'); notifStatus();
  } catch (e) { toast('開啟失敗：' + e.message, 5000); }
};
$('#notifTest').onclick = async () => {
  try { const r = await api('/api/push/test', { method: 'POST' }); toast(r.sent ? '已送出，幾秒內會收到' : '沒有已註冊的裝置，請先開啟通知'); }
  catch (e) { toast('失敗：' + e.message); }
};

// ---------- devices logged in through the public address ----------
async function loadSessions() {
  try {
    const me = await api('/api/auth/me');
    $('#logoutBtn').hidden = !me.public;
    $('#entryState').textContent = me.public ? '你現在透過公開網址連線' : '你現在透過 Tailscale 連線';
    const list = await api('/api/auth/sessions');
    $('#sessList').innerHTML = list.length ? list.map((s) =>
      `<li><div><b>${esc(s.ua.match(/Android|iPhone|iPad|Windows|Mac OS|Linux/i)?.[0] || '裝置')}</b>${s.id === me.session ? '（這台）' : ''}<br><span class="hint left">${esc(s.ip)}・登入 ${fmtTime(s.created)}${s.lastSeen ? '・最近 ' + fmtTime(s.lastSeen) : ''}・${fmtTime(s.expires)} 到期</span></div><button type="button" class="small danger" data-rm="${esc(s.id)}">移除</button></li>`).join('') : '<li class="hint">目前沒有</li>';
  } catch {}
}
document.addEventListener('click', async (e) => {
  const id = e.target && e.target.dataset && e.target.dataset.rm;
  if (!id) return;
  try { await api('/api/auth/sessions/' + encodeURIComponent(id), { method: 'DELETE' }); toast('已移除，那台裝置需要重新掃碼登入'); loadSessions(); }
  catch (err) { toast('失敗：' + err.message); }
});
$('#logoutBtn').onclick = async () => { await fetch('/auth/logout', { method: 'POST' }).catch(() => {}); location.href = '/login.html'; };

// ---------- tiny markdown renderer (safe: escapes first) ----------
function inline(s) {
  s = esc(s);
  s = s.replace(/!\[\[([^\]|]+?\.(?:png|jpe?g|gif|webp|bmp|heic))(?:\|[^\]]*)?\]\]/gi, (_, f) => `<img src="/api/attachments/${encodeURIComponent(f)}" alt="">`);
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => {
    // only notes inside Claude-Notes (and its 研究 folder) can be opened in the app
    const m = a.match(/^Claude-Notes\/((?:研究\/)?[^/]+)$/);
    return m ? `<a class="wl" href="#" data-note="${m[1]}.md">${b || a}</a>` : `<span class="wl" title="請在 Obsidian 開啟">${b || a}</span>`;
  });
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}
function renderMd(md) {
  let lines = md.replace(/\r/g, '').split('\n'), out = [], i = 0;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      const fm = {}; let key = null;
      for (const l of lines.slice(1, end)) {
        let m;
        if ((m = l.match(/^(\w+):\s*(.*)$/))) { key = m[1]; fm[key] = m[2] ? m[2].replace(/^"|"$/g, '') : []; }
        else if ((m = l.match(/^\s+-\s*(.*)$/)) && Array.isArray(fm[key])) fm[key].push(m[1].replace(/^"|"$/g, ''));
      }
      const parts = [];
      if (fm.created) parts.push('📅 ' + fm.created.replace('T', ' '));
      if (fm.expires) parts.push('🗑️ ' + fm.expires.replace('T', ' ') + ' 到期');
      (Array.isArray(fm.reminders) ? fm.reminders : []).forEach((r) => parts.push('⏰ ' + r.replace('T', ' ')));
      if (Array.isArray(fm.tags)) parts.push(fm.tags.filter((t) => t !== 'claude-note').map((t) => '#' + t).join(' '));
      out.push('<div class="fm">' + parts.map(esc).join('<br>') + '</div>');
      i = end + 1;
    }
  }
  let list = [], depth = 0;
  const flushList = () => { while (depth > 0) { out.push('</ul>'); depth--; } };
  for (; i < lines.length; i++) {
    const l = lines[i];
    let m;
    if ((m = l.match(/^(\t*|\s*)[-*+] (.*)$/))) {
      const lvl = Math.floor(m[1].replace(/\t/g, '    ').length / 2) + 1;
      while (depth < lvl) { out.push('<ul>'); depth++; } while (depth > lvl) { out.push('</ul>'); depth--; }
      let t = m[2], cls = '';
      if ((m = t.match(/^\[( |x|X)\] (.*)$/))) { cls = ' class="task"'; t = (m[1] === ' ' ? '☐ ' : '☑ ') + m[2]; }
      out.push(`<li${cls}>${inline(t)}</li>`); continue;
    }
    flushList();
    if ((m = l.match(/^(#{1,6}) (.*)$/))) out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
    else if (/^---+$/.test(l)) out.push('<hr>');
    else if ((m = l.match(/^<details><summary>(.*)<\/summary>\s*$/))) out.push(`<details><summary>${esc(m[1])}</summary>`);
    else if (l.trim() === '</details>') out.push('</details>');
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  flushList();
  return out.join('\n');
}

// ---------- features of this install (recordings, Agent) ----------
api('/api/features').then((f) => {
  if (!f.audio) { const p = $('#pickAud'); if (p) p.closest('label').hidden = true; }
  if (!f.agent) {
    const c = $('#edAgent'); if (c) { c.checked = false; c.closest('label').hidden = true; }
    const b = $('#agentBox'); if (b) b.hidden = true;
  }
}).catch(() => {});

// ---------- boot ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(notifStatus).catch(() => {});
const qs = new URLSearchParams(location.search);
navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.openNote) openNote(e.data.openNote); });
if (qs.has('note')) { const n = qs.get('note'); history.replaceState(null, '', '/'); loadDrafts(); openNote(n); }
else if (qs.has('shared')) { toast(qs.get('shared') === '1' ? '已收到分享內容，Claude 整理中' : '分享失敗：沒有可用的內容', 3500); history.replaceState(null, '', '/'); show('drafts'); }
else loadDrafts();
loadSessions();
