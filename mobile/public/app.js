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
  const navTab = tab === 'edit' ? 'drafts' : tab === 'read' ? 'notes' : tab === 'vread' ? 'vault' : tab;
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === navTab));
  if (tab === 'drafts') loadDrafts();
  if (tab === 'notes') loadNotes();
  if (tab === 'vault' && !vaultShown) loadVault(vaultDir);
  if (tab === 'tasks') loadTasks();
  if (tab === 'new') loadSeries();
  if (tab === 'learn') loadLearn();
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
  fd.append('series', $('#newSeries').value || '');
  picked.forEach((f) => fd.append('files', f, f.name));
  const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = '傳送中…';
  try {
    await api('/api/drafts', { method: 'POST', body: fd });
    $('#newText').value = ''; try { localStorage.removeItem('newText'); } catch {}
    picked = []; renderPicked(); $('#newSeries').value = '';
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
    const grp = (d) => (d.series ? `<span class="pill grp">📌 ${esc(d.series)}</span>` : '') + (d.learn ? `<span class="pill grp">📚 ${esc(d.learn)}</span>` : '') + (d.update ? `<span class="pill grp">🔄 更新${d.update.warnings.filter((w) => !w.startsWith('ℹ️')).length ? '・⚠️' + d.update.warnings.filter((w) => !w.startsWith('ℹ️')).length : ''}</span>` : !d.group ? '' : d.group.role === 'overview' ? `<span class="pill grp">📑 總覽・${d.group.size} 篇</span>` : `<span class="pill grp">🧩 ${d.group.index}／${d.group.size}</span>`);
    $('#draftList').innerHTML = list.map((d) => `<li data-id="${d.id}"${d.group && d.group.role === 'topic' ? ' class="in-group"' : ''}>
      <div class="t">${grp(d)}${esc(d.title || d.preview || '（未命名）')}</div>
      <div class="m"><span class="pill ${d.status}">${STATUS[d.status] || d.status}</span>${esc(d.status === 'processing' ? d.stage : fmtTime(d.createdAt))}
      ${d.review ? (d.review.status === 'processing' ? ' · 🔍 審查中' : d.review.status === 'error' ? ' · 🔍 審查失敗' : d.review.open ? ` · ⚠️ ${d.review.open} 個問題` : ' · ✅ 已審查') : ''}${d.images ? ' · 📷' + d.images : ''}${d.audios ? ' · 🎙️' + d.audios : ''}${d.reminders ? ' · ⏰' + d.reminders : ''}${d.expires ? ' · 🗑️' + esc(d.expires.slice(5, 10).replace('-', '/')) : ''}</div></li>`).join('');
  }
  const ups = list.filter((d) => d.update), upReady = ups.filter((d) => d.status === 'ready');
  $('#upAllBtn').hidden = current !== 'drafts' || !upReady.length;
  $('#upAllBtn').textContent = `⬆️ 上傳全部更新草稿（${upReady.length} 篇${ups.length > upReady.length ? `，另有 ${ups.length - upReady.length} 篇還在處理` : ''}）`;
  schedulePoll(list.some((d) => d.status === 'processing' || (d.review && d.review.status === 'processing')));
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
  dirty = false; fillEdit(); show('edit'); schedulePoll(draft.status === 'processing' || reviewBusy());
}
const reviewBusy = () => !!(draft && draft.review && draft.review.status === 'processing');
async function refreshEdit() {
  if (!draft) return;
  try {
    const d = await api('/api/drafts/' + draft.id);
    const was = draft.status, rWas = draft.review && draft.review.status; draft = d;
    // a learning draft just finished organizing: its review file appears a moment later — keep polling a few rounds for it
    if (was === 'processing' && d.status === 'ready' && d.learn) rvWait = 4;
    if (d.review) rvWait = 0; else if (rvWait > 0) rvWait--;
    if (was === 'processing' && d.status !== 'processing') {
      dirty = false; fillEdit();
      toast(d.status !== 'ready' ? '處理失敗' : d.group && d.group.role === 'overview' ? `內容有 ${d.group.size} 個主題，已拆成 ${d.group.size} 篇草稿` : d.learn ? '整理好了，AI 正在審查內容…' : '整理好了');
    }
    else {
      updateStatus(); fillReview();   // the review box only: never touch the user's unsaved edits
      if (rWas === 'processing' && d.review && d.review.status === 'ready') toast(d.review.items.length ? `審查完成：找到 ${d.review.items.length} 個可能的問題` : '審查完成：沒有發現錯誤', 4000);
    }
    schedulePoll(d.status === 'processing' || reviewBusy() || rvWait > 0);
  } catch (e) { schedulePoll(true); }
}
let rvWait = 0;
function updateStatus() {
  const s = $('#editStatus'), busy = draft.status === 'processing';
  s.hidden = draft.status === 'ready';
  s.className = 'status' + (draft.status === 'error' ? ' error' : '');
  s.innerHTML = busy ? '⏳ ' + esc(draft.stage || '處理中…') + '<br><small>可以先關掉 app，晚點再回來。</small>'
    : draft.status === 'error' ? '⚠️ ' + esc(draft.error) + '<br><button type="button" id="retryBtn">重試</button>' : '';
  ['#edTitle', '#edTags', '#edBody', '#reviseText', '#reviseBtn', '#saveBtn', '#uploadBtn', '#uploadAllBtn', '#deleteBtn', '#edExpMode', '#edExpires', '#addRem', '#edAgent'].forEach((q) => ($(q).disabled = busy));
  if (draft.status === 'error' && !draft.body) ['#reviseBtn', '#uploadBtn'].forEach((q) => ($(q).disabled = true));
  const r = $('#retryBtn'); if (r) r.onclick = retry;
  if (draft.update) ['#edTitle', '#edTags', '#edExpMode', '#edExpires', '#addRem', '#edAgent'].forEach((q) => ($(q).disabled = true));
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
  fillGroup(); fillUpdate(); fillSeries(); fillReview();
}
// ---- learning notes: AI review of facts / concepts before upload ----
const RV_CLASS = { 錯誤: 'err', 不精確: 'warn', 待查: 'info' };
// open items that still matter: not applied / ignored, and their quote is still in the (maybe edited) body
const rvInBody = (x) => { const b = $('#edBody').value, q = String(x.quote || '').trim(); return !!q && (b.includes(q) || new RegExp(q.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')).test(b)); };
const rvOpen = () => ((draft.review && draft.review.status === 'ready' && draft.review.items) || []).filter((x) => x.state === 'open' && x.level !== '待查' && rvInBody(x));
function fillReview() {
  const box = $('#reviewBox'), r = draft && draft.review;
  box.hidden = !draft || !draft.learn || draft.status !== 'ready';
  if (box.hidden) return;
  const busy = !!(r && r.status === 'processing');
  $('#rvRerun').textContent = r ? '重新審查' : '開始審查';
  $('#rvRerun').disabled = busy;
  const note = r && r.status === 'ready' ? (r.web ? '已對照教學內容、教材並上網查證。' : '已對照教學內容與教材（這次沒有上網查證）。') + (r.pdfSkipped ? 'PDF 教材沒有列入審查。' : '') : '';
  $('#rvStatus').innerHTML = !r ? '還沒審查。'
    : busy ? '⏳ AI 正在對照這一章的教學內容和教材檢查筆記' + (r.web ? '，必要時會上網查證' : '') + '，大約 1～3 分鐘。可以先看、先改，結果出來會顯示在這裡。'
    : r.status === 'error' ? '⚠️ 審查失敗：' + esc(r.error || '') + '　可以按「重新審查」。'
    : !r.items.length ? '✅ 沒有發現事實或觀念上的錯誤。' + esc(note)
    : `找到 ${r.items.length} 個可能的問題，勾選要套用的修正，或標成不用改。` + esc(note);
  const items = (r && r.status === 'ready' && r.items) || [];
  // re-rendering (typing in the note, polling) keeps the checkboxes the user changed
  const prev = {}, rid = draft.id + '|' + (r ? r.id : '');
  if ($('#rvList').dataset.rid === rid) document.querySelectorAll('#rvList input[data-rv]').forEach((c) => (prev[c.dataset.rv] = c.checked));
  $('#rvList').dataset.rid = rid;
  $('#rvList').innerHTML = items.map((x) => {
    const gone = x.state === 'open' && !rvInBody(x);
    const can = x.state === 'open' && !gone && x.found && !!x.fix;
    const tag = x.state === 'applied' ? '<span class="rvstate">✅ 已套用</span>' : x.state === 'ignored' ? `<span class="rvstate">不用改</span> <button type="button" class="link" data-rv-reopen="${x.id}">恢復</button>`
      : gone ? '<span class="rvstate">原文已經改過</span>' : !x.found ? '<span class="rvstate">找不到原文，請自己修改</span>' : !x.fix ? '<span class="rvstate">請自己確認</span>' : '';
    return `<li class="rv ${x.state !== 'open' || gone ? 'done' : ''}"><label class="rvhead">${x.state === 'open' && !gone ? `<input type="checkbox" data-rv="${x.id}"${(x.id in prev ? prev[x.id] : can) ? ' checked' : ''}>` : ''}
      <span class="rvlv ${RV_CLASS[x.level] || 'info'}">${esc(x.level)}</span> ${esc(x.problem)}</label>
      <div class="rvq"><del>${esc(x.quote)}</del>${x.fix ? `<br>→ <ins>${esc(x.fix)}</ins>` : ''}</div>
      ${x.source ? `<div class="rvsrc">依據：${esc(x.source)}</div>` : ''}${tag ? `<div>${tag}</div>` : ''}</li>`;
  }).join('');
  $('#rvActions').hidden = !items.some((x) => x.state === 'open' && rvInBody(x));
}
async function reviewAction(action, ids) {
  try {
    const d = await api('/api/drafts/' + draft.id + '/review/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...edits(), ids, action }) });
    draft = d; $('#edBody').value = d.body; dirty = false; if (!$('#edPreview').hidden) $('#edPreview').innerHTML = renderMd(d.body);
    fillReview();
    return d;
  } catch (e) { toast('失敗：' + e.message, 4000); }
}
const rvChecked = () => [...document.querySelectorAll('#rvList input[data-rv]:checked')].map((c) => c.dataset.rv);
$('#rvApply').onclick = async () => {
  const ids = rvChecked(); if (!ids.length) return toast('請先勾選要套用的項目');
  const before = draft.review.items.filter((x) => x.state === 'applied').length;
  const d = await reviewAction('apply', ids);
  if (d) { const n = d.review.items.filter((x) => x.state === 'applied').length - before; toast(n === ids.length ? `已套用 ${n} 個修正` : `已套用 ${n} 個；有 ${ids.length - n} 個找不到原文或沒有建議寫法，請自己修改`, 4500); }
};
$('#rvIgnore').onclick = () => { const ids = rvChecked(); if (!ids.length) return toast('請先勾選項目'); reviewAction('ignore', ids); };
$('#rvList').addEventListener('click', (e) => { const b = e.target.closest('[data-rv-reopen]'); if (b) reviewAction('reopen', [b.dataset.rvReopen]); });
$('#rvRerun').onclick = async () => {
  try {
    draft = await api('/api/drafts/' + draft.id + '/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edits()) });
    dirty = false; fillReview(); schedulePoll(true);
  } catch (e) { toast('失敗：' + e.message, 4000); }
};
$('#edBody').addEventListener('input', () => { if (draft && draft.review) { clearTimeout(rvTimer); rvTimer = setTimeout(fillReview, 600); } });
let rvTimer = null;
// ---- 接續到: which tracked note this draft continues ----
function fillSeries() {
  const box = $('#seriesBox');
  box.hidden = !!draft.update || !!draft.learn || draft.status === 'processing' || !(seriesData.length || draft.series) || !!(draft.group && draft.group.role === 'overview');
  if (draft.learn) $('#edTitle').disabled = true;   // learning notes are named after the chapter / quiz
  if (box.hidden) return;
  const known = seriesData.some((s) => s.note === draft.series);
  $('#edSeries').innerHTML = '<option value="-">不接續（一般筆記）</option>' + seriesData.map((s) => `<option value="${esc(s.note)}">📌 ${esc(s.name)}（${esc(s.title)}）</option>`).join('') +
    (draft.series && !known ? `<option value="${esc(draft.series)}">⚠️ ${esc(draft.series)}（主筆記已不存在）</option>` : '');
  $('#edSeries').value = draft.series || '-';
  $('#seriesRedo').hidden = true;
  seriesHint();
}
function seriesHint() {
  const v = $('#edSeries').value, s = seriesData.find((x) => x.note === v);
  $('#seriesHint').textContent = !s ? '會存成一般筆記。'
    : `會存成今天的「${s.name}」紀錄，並列進主筆記的「每日紀錄」；今天已經有紀錄的話，會接在後面。` + (v === draft.series && !draft.seriesPick ? '（這是 AI 判斷的，不對可以改。）' : '');
  $('#edTitle').disabled = !!s || draft.status === 'processing' || !!draft.update;
  if (s) $('#edTitle').value = s.name;
}
$('#edSeries').onchange = () => {
  dirty = true; seriesHint();
  const changed = $('#edSeries').value !== (draft.series || '-');
  $('#seriesRedo').hidden = !changed;
  if (changed) $('#seriesHint').textContent += ' 內容是照原本的選擇整理的，建議按「依新的選擇重新整理」。';
};
$('#seriesRedo').onclick = () => {
  const v = $('#edSeries').value, s = seriesData.find((x) => x.note === v);
  $('#reviseText').value = s ? `這篇是「${s.title}」的新紀錄，請依附上的主筆記和之前的紀錄重新整理：前提不要重寫，已經釐清的事不要再問，待辦只列這次新增的。`
    : '這篇不是持續追蹤筆記的紀錄，請當成一般筆記重新整理：標題、到期、提醒、AGENT 都照一般規則重新判斷。';
  $('#reviseBtn').click();
};
// one input split into several notes: an auto-generated overview + topic drafts
function fillGroup() {
  const g = draft.group, ov = !!(g && g.role === 'overview' && draft.status !== 'processing');
  document.querySelectorAll('.nogroup-ov').forEach((el) => (el.hidden = ov));
  $('#groupBox').hidden = !g || draft.status === 'processing';
  if (g) {
    $('#groupText').textContent = ov
      ? `📑 這是總覽：這次輸入拆成 ${g.size} 篇筆記。主題草稿都上傳（或刪除）後，會自動建立這篇總覽，並跟各篇互相連結。總覽只能改標題。`
      : `🧩 這是同一次輸入拆出的第 ${g.index}／${g.size} 篇，可以單獨修改、上傳，或按「全部上傳」一次上傳整組。`;
    $('#groupOpenOv').hidden = ov;
  }
  if (ov) { $('#edBody').hidden = true; $('#edPreview').hidden = false; $('#edPreview').innerHTML = renderMd(draft.body || ''); }
  $('#deleteBtn').textContent = ov ? '刪除整組（還沒上傳的主題草稿）' : '刪除草稿';
}
$('#groupOpenOv').onclick = () => openDraft(draft.group.overviewId);
$('#uploadAllBtn').onclick = async () => {
  const isOv = draft.group && draft.group.role === 'overview';
  if (!isOv && !checkTimes()) return toast('請先修正到期時間');
  if (!confirm('把這一組還沒上傳的主題草稿全部上傳到 Obsidian？總覽會在最後自動建立。')) return;
  const btn = $('#uploadAllBtn'); btn.disabled = true;
  try {
    const r = await api('/api/drafts/' + draft.id + '/upload-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isOv ? {} : edits()) });
    dirty = false; draft = null;
    toast(`已上傳 ${r.names.length} 篇` + (r.skipped.length ? `；${r.skipped.length} 篇還沒整理好或有錯誤，留在草稿` : '，總覽也已建立'), 4500);
    show('notes'); loadDrafts();
  } catch (e) { toast('上傳失敗：' + e.message, 5000); btn.disabled = false; }
};
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
  reminders: rems.filter((r) => r.at), agent: $('#edAgent').checked, series: $('#seriesBox').hidden ? undefined : $('#edSeries').value });
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
  let warn = '';
  if (draft.learn && reviewBusy()) warn = '⏳ AI 還在審查這篇筆記，結果還沒出來。\n';
  else if (draft.learn && rvOpen().length) warn = `⚠️ 審查找到的問題還有 ${rvOpen().length} 個沒處理（錯誤或不精確）。\n`;
  if (!confirm(warn + '確定上傳到 Obsidian？上傳後草稿會移除。')) return;
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
  noteFolder = b.dataset.f; $('#refreshBox').hidden = noteFolder === 'research'; $('#dedupBox').hidden = noteFolder !== 'research'; if (noteFolder === 'research') loadDedup();
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
// ---------- whole vault (read-only) ----------
let vaultDir = '', vaultShown = false;
async function loadVault(dir) {
  vaultDir = dir; vaultShown = true;
  let r;
  try { r = await api('/api/vault/list?dir=' + encodeURIComponent(dir)); } catch (e) { toast('讀取失敗：' + e.message); return; }
  const parts = r.dir ? r.dir.split('/') : [];
  $('#vCrumbs').innerHTML = `<a href="#" data-dir="">📚 筆記庫</a>` +
    parts.map((p, i) => ` / <a href="#" data-dir="${esc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</a>`).join('');
  $('#vList').innerHTML =
    r.folders.map((f) => `<li data-dir="${esc(f.path)}"><div class="t">📁 ${esc(f.name)}</div><div class="m">${f.count} 篇</div></li>`).join('') +
    r.notes.map((n) => `<li data-path="${esc(n.path)}"><div class="t">📄 ${esc(n.name)}</div><div class="m">${n.mtime ? fmtTime(new Date(n.mtime).toISOString()) : ''}</div></li>`).join('');
  $('#vEmpty').hidden = r.folders.length + r.notes.length > 0;
  window.scrollTo(0, 0);
}
$('#vList').addEventListener('click', (e) => {
  const li = e.target.closest('li'); if (!li) return;
  if (li.dataset.dir !== undefined) loadVault(li.dataset.dir);
  else if (li.dataset.path) openVaultNote(li.dataset.path);
});
$('#vCrumbs').addEventListener('click', (e) => { const a = e.target.closest('a[data-dir]'); if (a) { e.preventDefault(); $('#vSearch').value = ''; loadVault(a.dataset.dir); } });
$('#vSearchForm').onsubmit = async (e) => {
  e.preventDefault();
  const q = $('#vSearch').value.trim();
  if (!q) return loadVault(vaultDir);
  let r = [];
  try { r = await api('/api/vault/search?q=' + encodeURIComponent(q)); } catch (err) { return toast('搜尋失敗：' + err.message); }
  $('#vCrumbs').innerHTML = `🔍 「${esc(q)}」找到 ${r.length} 篇　<a href="#" data-dir="${esc(vaultDir)}">清除搜尋</a>`;
  $('#vList').innerHTML = r.map((n) => `<li data-path="${esc(n.path)}"><div class="t">📄 ${esc(n.name)}</div><div class="m">${esc(n.path)}${n.snippet ? '<br>…' + esc(n.snippet) + '…' : ''}</div></li>`).join('');
  $('#vEmpty').hidden = r.length > 0;
};
$('#vBack').onclick = () => show('vault');
// notes in Claude-Notes open in the full reader (with the Agent box); everything else in the vault reader
async function openVaultNote(p) {
  const m = p.match(/^Claude-Notes\/((?:研究\/|學習\/[^/]+\/)?[^/]+\.md)$/);
  if (m && !/^學習\/[^/]+\/(大綱|錯題本)\.md$/.test(m[1])) return openNote(m[1]);   // 大綱 / 錯題本 are system files: read-only view
  try {
    const md = await api('/api/vault/note?path=' + encodeURIComponent(p));
    $('#vPath').textContent = p.replace(/\.md$/i, '');
    $('#vBody').innerHTML = renderMd(md);
    show('vread');
  } catch (e) { toast(e.message); }
}
// any [[link]] in any rendered note
document.addEventListener('click', async (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a) return;
  e.preventDefault();
  try { const r = await api('/api/vault/resolve?name=' + encodeURIComponent(a.dataset.link)); openVaultNote(r.path); }
  catch { toast('還沒有這篇筆記（灰色連結）。在 Obsidian 點它，AI 會自動補寫。', 4000); }
});
async function openNote(name) {
  try {
    const md = await api('/api/notes/' + encodeURIComponent(name));
    reading = name; $('#readBody').innerHTML = renderMd(md); show('read'); refreshAgent(); loadAnswers(); loadTrack(md); $('#refreshBtn').hidden = name.includes('/') || !/^﻿?---[\s\S]*?\ngenerated_by:\s*claude-note/.test(md) || /^﻿?---[\s\S]*?\nseries_of:/.test(md);
  } catch (err) { toast(err.message); }
}
async function refreshAgent() {
  clearTimeout(agentTimer);
  if (!reading || current !== 'read') return;
  let jobs = []; try { jobs = await api('/api/agent?note=' + encodeURIComponent(reading)); } catch {}
  const j = jobs[jobs.length - 1];
  const busy = j && (j.status === 'queued' || j.status === 'running');
  $('#agentState').textContent = !j ? '尚未執行' : j.status === 'done' ? `已完成 ${fmtTime(j.finishedAt)}${j.counts && j.counts.new ? `，新增 ${j.counts.new} 篇` : ''}${j.counts && j.counts.append ? `，補充 ${j.counts.append} 篇` : ''}${j.ticked ? `，完成 ${j.ticked} 項待辦` : ''}${j.counts && j.counts.resolved ? `，釐清 ${j.counts.resolved} 題` : ''}`
    : j.status === 'error' ? '失敗：' + j.error : j.status === 'running' ? '查資料中…（可能要幾分鐘）' : '排隊中…';
  $('#agentBtn').disabled = !!busy;
  $('#agentBtn').textContent = j ? '重新讓 Agent 查資料' : '讓 Agent 查資料';
  if (busy) agentTimer = setTimeout(refreshAgent, 5000);
  else if (j && j.status === 'done' && refreshAgent.was === 'busy') { try { $('#readBody').innerHTML = renderMd(await api('/api/notes/' + encodeURIComponent(reading))); } catch {} loadAnswers(); }
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
    if (me.kiosk) return startKiosk(me);
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
// log out and leave nothing behind (service worker + its cache), important on a public computer
async function logout() {
  await fetch('/auth/logout', { method: 'POST' }).catch(() => {});
  try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch {}
  try { for (const k of await caches.keys()) await caches.delete(k); } catch {}
  location.replace('/login.html');
}
$('#logoutBtn').onclick = logout;

// copy buttons in the 連線網址 box
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-copy]');
  if (!b) return;
  const text = $('#' + b.dataset.copy).textContent;
  try { await navigator.clipboard.writeText(text); }
  catch { // older browsers / non-secure context: select the text so it can be copied by hand
    const r = document.createRange(); r.selectNodeContents($('#' + b.dataset.copy));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand && document.execCommand('copy');
  }
  const old = b.textContent; b.textContent = '已複製 ✓'; setTimeout(() => (b.textContent = old), 1500);
});
$('#kioskLogout').onclick = logout;

// public-computer mode: banner, no push / device management, idle logout after 15 min (the server enforces it too)
function startKiosk(me) {
  const until = new Date(me.expires);
  $('#kioskText').textContent = `🖥️ 公用電腦模式・${String(until.getHours()).padStart(2, '0')}:${String(until.getMinutes()).padStart(2, '0')} 前有效・閒置 15 分鐘自動登出・用完請按登出`;
  $('#kioskBar').hidden = false;
  document.body.classList.add('kiosk-mode');
  $('#linksBox').hidden = true;
  document.querySelectorAll('.box.notif, #sessList').forEach((el) => { const b = el.closest('.box') || el; b.hidden = true; });
  // browse + add notes + Agent; deleting drafts is not allowed here (the server refuses it too)
  $('#deleteBtn').hidden = true;
  let last = Date.now();
  for (const ev of ['click', 'keydown', 'scroll', 'touchstart', 'mousemove']) addEventListener(ev, () => { last = Date.now(); }, { passive: true });
  setInterval(() => { if (Date.now() - last > 15 * 60 * 1000 || Date.now() > until.getTime()) logout(); }, 30000);
}

// ---------- tiny markdown renderer (safe: escapes first) ----------
function inline(s) {
  s = esc(s);
  // images anywhere in the vault, resolved by name like Obsidian does
  s = s.replace(/!\[\[([^\]|]+?\.(?:png|jpe?g|gif|webp|bmp|svg|heic))(?:\|[^\]]*)?\]\]/gi, (_, f) => `<img src="/api/vault/raw?name=${encodeURIComponent(f)}" alt="">`);
  s = s.replace(/!\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g, (_, a) => `<a class="wl" href="#" data-link="${a}">📎 ${a}</a>`);
  // every [[link]] is clickable; it is resolved against the whole vault when tapped
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => `<a class="wl" href="#" data-link="${a}">${b || a.replace(/#.*$/, '')}</a>`);
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
  const stack = []; // open list tags, e.g. ['ul','ol']
  const flushList = () => { while (stack.length) out.push(`</${stack.pop()}>`); };
  // split a table row on |, but not on the | inside [[link|alias]] or an escaped \|
  const cells = (row) => row.trim().replace(/^\||\|$/g, '').replace(/\[\[[^\]]*\]\]/g, (m) => m.replace(/\\?\|/g, '\u0001')).replace(/\\\|/g, '\u0001')
    .split('|').map((c) => c.trim().replace(/\u0001/g, '|'));
  for (; i < lines.length; i++) {
    const l = lines[i];
    let m;
    if ((m = l.match(/^(\t*|\s*)(?:([-*+])|(\d+)[.)]) (.*)$/))) {
      const lvl = Math.floor(m[1].replace(/\t/g, '    ').length / 2) + 1, tag = m[2] ? 'ul' : 'ol';
      while (stack.length > lvl) out.push(`</${stack.pop()}>`);
      if (stack.length === lvl && stack[lvl - 1] !== tag) out.push(`</${stack.pop()}>`);
      while (stack.length < lvl) { out.push(`<${tag}>`); stack.push(tag); }
      let t = m[4], cls = '';
      if ((m = t.match(/^\[( |x|X)\] (.*)$/))) { cls = ' class="task"'; t = (m[1] === ' ' ? '☐ ' : '☑ ') + m[2]; }
      out.push(`<li${cls}>${inline(t)}</li>`); continue;
    }
    flushList();
    if (/^\s*```/.test(l)) { // fenced code block
      const code = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); continue;
    }
    if (/^\s*>/.test(l)) { // blockquote / Obsidian callout
      const q = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) q.push(lines[i].replace(/^\s*> ?/, ''));
      i--;
      let cls = '';
      if ((m = (q[0] || '').match(/^\[!(\w+)\][+-]?\s*(.*)$/))) { cls = ' class="callout"'; q[0] = '**' + (m[2] || m[1]) + '**'; }
      out.push(`<blockquote${cls}>${renderMd(q.join('\n'))}</blockquote>`); continue;
    }
    if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) { // table
      const head = cells(l); const rows = [];
      for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) rows.push(cells(lines[i]));
      i--;
      out.push('<div class="tbl"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
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
  // 連線網址 (not on a public computer: startKiosk hides the box)
  if (!document.body.classList.contains('kiosk-mode')) {
    $('#linksBox').hidden = false;
    $('#linksNone').hidden = !!(f.mobileUrl || f.publicPcUrl);
    if (f.mobileUrl) {
      $('#rowMobile').hidden = false; $('#urlMobile').textContent = f.mobileUrl;
      $('#qrMobile').src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(f.mobileQr);
    }
    if (f.publicPcUrl) { $('#rowPublic').hidden = false; $('#urlPublic').textContent = f.publicPcUrl; }
  }
  if (!f.audio) { const p = $('#pickAud'); if (p) p.closest('label').hidden = true; }
  if (!f.agent) {
    const c = $('#edAgent'); if (c) { c.checked = false; c.closest('label').hidden = true; }
    const b = $('#agentBox'); if (b) b.hidden = true;
  }
}).catch(() => {});

// ---------- boot ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(notifStatus).catch(() => {});
const qs = new URLSearchParams(location.search);
navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.openNote) openNote(e.data.openNote); if (e.data && e.data.openLearn) { show('learn'); openTopic(e.data.openLearn); } });
if (qs.has('note')) { const n = qs.get('note'); history.replaceState(null, '', '/'); loadDrafts(); openNote(n); }
else if (qs.has('shared')) { toast(qs.get('shared') === '1' ? '已收到分享內容，Claude 整理中' : '分享失敗：沒有可用的內容', 3500); history.replaceState(null, '', '/'); show('drafts'); }
else loadDrafts();
loadSessions();

// ---------- to-dos from every note ----------
let taskData = null;
const linkText = (s) => esc(s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'));
const dueLabel = (due, today) => {
  if (!due) return '';
  const days = Math.round((new Date(due) - new Date(today)) / 86400000);
  const cls = days < 0 ? 'over' : days === 0 ? 'today' : days <= 3 ? 'soon' : '';
  const word = days < 0 ? `過期 ${-days} 天` : days === 0 ? '今天' : days === 1 ? '明天' : `${due.slice(5).replace('-', '/')}`;
  return `<span class="due ${cls}">📅 ${word}</span>`;
};
function taskRow(t, i, kind) {
  return `<label class="task${t.done ? ' done' : ''}"><input type="checkbox" data-k="${kind}" data-i="${i}"${kind === 'done' ? ' checked' : ''}${document.body.classList.contains('kiosk-mode') ? ' disabled title="公用電腦只能查看"' : ''}>` +
    `<span class="tt">${linkText(t.text)}</span>${kind === 'open' ? dueLabel(t.due, taskData.today) : t.doneAt ? `<span class="due">✅ ${t.doneAt.slice(5).replace('-', '/')}</span>` : ''}</label>`;
}
const noteHead = (t) => `<button type="button" class="tnote" data-path="${esc(t.path)}">📄 ${esc(t.name)}</button>`;
async function loadTasks() {
  try { taskData = await api('/api/tasks'); } catch (e) { return toast('讀取待辦失敗：' + e.message); }
  const { open, done } = taskData;
  const dated = open.map((t, i) => [t, i]).filter(([t]) => t.due), rest = open.map((t, i) => [t, i]).filter(([t]) => !t.due);
  let html = '';
  if (dated.length) html += `<div class="box tgroup"><h3>有到期日</h3>${dated.map(([t, i]) => taskRow(t, i, 'open') + `<div class="tfrom">${noteHead(t)}</div>`).join('')}</div>`;
  const byNote = new Map();
  for (const [t, i] of rest) { if (!byNote.has(t.path)) byNote.set(t.path, []); byNote.get(t.path).push([t, i]); }
  for (const items of byNote.values()) html += `<div class="box tgroup">${noteHead(items[0][0])}${items.map(([t, i]) => taskRow(t, i, 'open')).join('')}</div>`;
  $('#tList').innerHTML = html;
  $('#tEmpty').hidden = open.length > 0;
  $('#tDone').hidden = !done.length;
  $('#tDone summary').textContent = `已完成（${taskData.doneTotal}）`;
  $('#tDoneList').innerHTML = done.map((t, i) => `<div class="tdrow">${taskRow(t, i, 'done')}<div class="tfrom">${noteHead(t)}</div></div>`).join('');
  const b = $('#taskCount'); b.textContent = open.length; b.hidden = !open.length;
}
$('#tab-tasks').addEventListener('click', (e) => { const n = e.target.closest('.tnote'); if (n) openVaultNote(n.dataset.path); });
$('#tab-tasks').addEventListener('change', async (e) => {
  const c = e.target; if (!c.matches('input[type=checkbox]')) return;
  const t = taskData[c.dataset.k][+c.dataset.i];
  c.disabled = true;
  try {
    await api('/api/tasks/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: t.path, line: t.line, raw: t.raw, done: c.checked }) });
    toast(c.checked ? '已完成 ✅' : '已改回未完成');
  } catch (err) { toast(err.message, 4000); }
  loadTasks();
});
api('/api/tasks').then((d) => { const b = $('#taskCount'); b.textContent = d.open.length; b.hidden = !d.open.length; }).catch(() => {});

// ---------- answering a note's open questions (and the to-dos the Agent said need you) ----------
let ansItems = [];
async function loadAnswers() {
  const box = $('#ansBox');
  try { ansItems = await api('/api/notes/' + encodeURIComponent(reading) + '/answers'); } catch { ansItems = []; }
  box.hidden = !ansItems.length;
  if (!ansItems.length) return;
  const open = ansItems.filter((x) => !x.answer).length;
  $('#ansCount').textContent = open ? `${open} 題還沒回答` : '都回答過了';
  if (open) box.open = true;
  $('#ansList').innerHTML = ansItems.map((x, i) => `<div class="ans"><div class="aq">${x.kind === 'q' ? '❓' : '🙋 待辦：'} ${linkText(x.text)}</div>` +
    `<textarea rows="2" data-i="${i}" placeholder="我的回答…（留白就不回答）">${esc(x.answer)}</textarea></div>`).join('');
}
async function saveAnswers(runAgent) {
  const list = ansItems.map((x, i) => ({ line: x.line, raw: x.raw, answer: $(`#ansList textarea[data-i="${i}"]`).value.trim() }));
  if (runAgent && !list.some((x) => x.answer)) return toast('請先至少回答一題');
  $('#ansSave').disabled = $('#ansRun').disabled = true;
  try {
    await api('/api/notes/' + encodeURIComponent(reading) + '/answers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: list, agent: runAgent }) });
    $('#readBody').innerHTML = renderMd(await api('/api/notes/' + encodeURIComponent(reading)));
    await loadAnswers();
    if (runAgent) { toast('已儲存回答，Agent 開始重查，完成後會通知你', 3500); refreshAgent.was = 'busy'; refreshAgent(); }
    else toast('已儲存回答');
  } catch (e) { toast('失敗：' + e.message, 4000); }
  $('#ansSave').disabled = $('#ansRun').disabled = false;
}
$('#ansSave').onclick = () => saveAnswers(false);
$('#ansRun').onclick = () => saveAnswers(true);

// ---------- updating notes with the current rules ----------
function fillUpdate() {
  const u = draft.update;
  $('#updateBox').hidden = !u || draft.status === 'processing';
  if (!u) return;
  $('#updateText').textContent = `🔄 這是「${u.note.replace(/\.md$/i, '')}」的更新草稿：上傳時只取代原筆記的正文（這裡只能改正文），檔名、標題、標籤、到期、提醒、Agent 研究結果、照片和原文都不變；舊版會先備份到筆記庫的 .trash。`;
  $('#updateWarn').innerHTML = (u.warnings || []).map((w) => `<li class="${w.startsWith('ℹ️') ? 'info' : ''}">${w.startsWith('ℹ️') ? '' : '⚠️ '}${esc(w)}</li>`).join('');
  // an update only replaces the body: the other fields stay as they are in the note
  ['#edTitle', '#edTags', '#edExpMode', '#edExpires', '#addRem', '#edAgent'].forEach((q) => ($(q).disabled = true));
}
$('#upAllBtn').onclick = async () => {
  const btn = $('#upAllBtn'); btn.disabled = true;
  try {
    const r = await api('/api/refresh/upload', { method: 'POST' });
    toast(`已更新 ${r.names.length} 篇` + (r.skipped.length ? `；${r.skipped.length} 篇沒有上傳：${r.skipped.map((s) => s.note.replace(/\.md$/i, '') + '（' + s.error + '）').join('、')}` : ''), 6000);
  } catch (e) { toast('上傳失敗：' + e.message, 5000); }
  btn.disabled = false; loadDrafts();
};
$('#refreshAllBtn').onclick = async () => {
  let r; try { r = await api('/api/refresh'); } catch (e) { return toast(e.message); }
  if (!r.notes.length) return toast('沒有可以更新的筆記（研究筆記、總覽、你自己寫的筆記不會更新；已經有更新草稿的也會跳過）', 5000);
  $('#refreshText').textContent = `會用最新的整理規則更新 ${r.notes.length} 篇筆記（研究/ 名詞筆記、總覽和你自己寫的筆記不包含），每篇產生一份更新草稿放在「草稿」，你看過再上傳。每篇會用掉 1 次 AI 整理（用比較強的模型，Claude 訂閱會用到較多額度），上傳後再各用 1～2 次拆名詞解釋；用免費額度的話請留意。`;
  $('#refreshConfirm').hidden = false; $('#refreshAllBtn').hidden = true;
};
$('#refreshCancel').onclick = () => { $('#refreshConfirm').hidden = true; $('#refreshAllBtn').hidden = false; };
$('#refreshGo').onclick = async () => {
  $('#refreshGo').disabled = true;
  try {
    const r = await api('/api/refresh', { method: 'POST' });
    toast(`已排入 ${r.made} 篇更新，完成後到「草稿」查看` + (r.failed.length ? `；${r.failed.length} 篇無法更新` : ''), 5000);
    $('#refreshConfirm').hidden = true; $('#refreshAllBtn').hidden = false; loadDrafts();
  } catch (e) { toast('失敗：' + e.message, 4000); }
  $('#refreshGo').disabled = false;
};
$('#refreshBtn').onclick = async () => {
  try { const d = await api('/api/notes/' + encodeURIComponent(reading) + '/refresh', { method: 'POST' }); toast('已開始更新，完成後在「草稿」查看', 3500); openDraft(d.id); }
  catch (e) { toast(e.message, 4500); }
};

// ---------- duplicate knowledge nodes ----------
let dedupItems = [], dedupTimer = null;
async function loadDedup() {
  clearTimeout(dedupTimer);
  let r; try { r = await api('/api/dedup'); } catch (e) { return; }
  dedupItems = r.items;
  $('#dedupState').textContent = r.busy ? '掃描中…' : r.lastScan ? `上次掃描 ${fmtTime(r.lastScan)}` : '還沒掃描過';
  $('#dedupScan').disabled = r.busy;
  $('#dedupList').innerHTML = !r.items.length ? (r.lastScan && !r.busy ? '<li class="hint left">沒有找到重複的名詞 👍</li>' : '') : r.items.map((x, i) => `<li>
    <div>${x.kind === 'gray' ? `灰色連結 <b>[[${esc(x.dup)}]]</b>${x.refs ? `（${x.refs} 處）` : ''} → 改連到 <b>${esc(x.keep)}</b>` : `<b>${esc(x.dup)}</b> → 併入 <b>${esc(x.keep)}</b>`}</div>
    ${x.reason ? `<div class="hint left">${esc(x.reason)}</div>` : ''}
    <div class="row gap"><button type="button" class="primary" data-merge="${i}">合併</button><button type="button" data-dismiss="${i}">不是重複</button></div></li>`).join('');
  if (r.busy) dedupTimer = setTimeout(loadDedup, 4000);
}
$('#dedupScan').onclick = async () => {
  try { await api('/api/dedup/scan', { method: 'POST' }); toast('開始掃描，約需半分鐘'); } catch (e) { return toast(e.message, 4000); }
  setTimeout(loadDedup, 800);
};
$('#dedupList').addEventListener('click', async (e) => {
  const m = e.target.dataset.merge, d = e.target.dataset.dismiss;
  if (m == null && d == null) return;
  const x = dedupItems[+(m != null ? m : d)];
  e.target.closest('li').querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    if (m != null) { const r = await api(`/api/dedup/${x.id}/merge`, { method: 'POST' }); toast(`已合併「${x.dup}」到「${x.keep}」，改了 ${r.links} 個連結` + (r.moved ? '；舊筆記移到 .trash' : ''), 4500); }
    else { await api(`/api/dedup/${x.id}/dismiss`, { method: 'POST' }); toast('好，之後不會再把這組列出來'); }
  } catch (err) { toast(err.message, 4500); }
  loadDedup(); loadNotes();
});

// ---------- tracked notes (持續追蹤): main note settings, "接續到" choices ----------
let seriesData = [];
async function loadSeries() {
  try { seriesData = await api('/api/series'); } catch { seriesData = []; }
  const sel = $('#newSeries'), cur = sel.value;
  sel.innerHTML = '<option value="">🤖 讓 AI 判斷</option><option value="-">不接續（一般筆記）</option>' +
    seriesData.map((s) => `<option value="${esc(s.note)}">📌 ${esc(s.name)}（${esc(s.title)}）</option>`).join('');
  sel.value = [...sel.options].some((o) => o.value === cur) ? cur : '';
  $('#newSeriesRow').hidden = !seriesData.length;
  return seriesData;
}
const DAY_NAMES = ['', '一', '二', '三', '四', '五', '六', '日'];
async function loadTrack(md) {
  const box = $('#trackBox');
  const isEntry = /^﻿?---[\s\S]*?\nseries_of:/.test(md);
  box.hidden = !reading || reading.includes('/') || isEntry || document.body.classList.contains('kiosk-mode');
  if (box.hidden) return;
  await loadSeries();
  const s = seriesData.find((x) => x.note === reading);
  const title = (md.match(/^title:\s*"?(.*?)"?\s*$/m) || [])[1] || reading.replace(/\.md$/i, '');
  const body = md.replace(/^[\s\S]*?\n---\n/, '');
  $('#trackState').textContent = s ? `追蹤中・${s.time ? s.daysLabel + ' ' + s.time + ' 前 ' + s.lead + ' 分鐘整理報告' : '不自動整理報告'}` : '未設定';
  $('#trName').value = s ? s.name : /例會|站會|會議/.test(title) ? '例會進度' : title.replace(/^\d{4}-\d{2}-\d{2}\s+/, '').slice(0, 12) + ' 紀錄';
  const days = s ? s.days : [1, 2, 3, 4, 5];
  $('#trDays').innerHTML = DAY_NAMES.slice(1).map((n, i) => `<label><input type="checkbox" value="${i + 1}"${days.includes(i + 1) ? ' checked' : ''}> ${n}</label>`).join('');
  $('#trTime').value = s ? s.time : ((body.match(/\b(\d{1,2}):(\d{2})\b/) || [])[0] || '').replace(/^(\d):/, '0$1:');
  $('#trStart').value = s ? s.start : toLocal(new Date()).slice(0, 10);
  $('#trSave').textContent = s ? '儲存修改' : '設為持續追蹤';
  $('#trNew').hidden = $('#trOff').hidden = !s;
  $('#trReport').hidden = !s || !s.time;
}
async function saveTrack(on) {
  const body = on ? { on: true, name: $('#trName').value, days: [...document.querySelectorAll('#trDays input:checked')].map((c) => +c.value), time: $('#trTime').value, start: $('#trStart').value } : { on: false };
  try {
    await api('/api/notes/' + encodeURIComponent(reading) + '/series', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    toast(on ? '已設為持續追蹤。之後新增的內容會自動判斷要不要接續到這篇' : '已停止追蹤（已經建立的每日紀錄會保留）', 4500);
    const md = await api('/api/notes/' + encodeURIComponent(reading));
    $('#readBody').innerHTML = renderMd(md); await loadTrack(md); $('#trackBox').open = on;
  } catch (e) { toast('失敗：' + e.message, 4500); }
}
$('#trSave').onclick = () => saveTrack(true);
$('#trOff').onclick = () => { if (confirm('停止追蹤這篇？已經建立的每日紀錄會保留，只是之後不再接續、也不再整理報告。')) saveTrack(false); };
$('#trNew').onclick = async () => { show('new'); await loadSeries(); $('#newSeries').value = reading; $('#newText').focus(); };
$('#trReport').onclick = async () => {
  const b = $('#trReport'); b.disabled = true; toast('整理中，大約半分鐘…', 30000);
  try { const r = await api('/api/notes/' + encodeURIComponent(reading) + '/series/report', { method: 'POST' }); toast('報告整理好了'); openNote(r.note); }
  catch (e) { toast('失敗：' + e.message, 5000); }
  b.disabled = false;
};
loadSeries();

// ---------- version (bottom-right) ----------
let verInfo = null;
function renderVersion() {
  const b = $('#verBadge'), v = verInfo;
  if (!v || !v.version) { b.hidden = true; return; }
  b.hidden = false;
  const isNew = v.newer && v.latest;
  b.classList.toggle('new', !!isNew);
  b.textContent = isNew ? `🆕 有新版本 ${v.latest.version}` : `${v.version}${v.date ? ' · ' + v.date.slice(5).replace('-', '/') : ''}`;
  b.title = isNew ? `目前 ${v.version}，最新 ${v.latest.version}：${v.latest.subject}` : `版本 ${v.version}（${v.sha}）${v.checkedAt ? '，' + fmtTime(v.checkedAt) + ' 檢查過' : ''}`;
}
async function loadVersion() { try { verInfo = await api('/api/version'); } catch { verInfo = null; } renderVersion(); maybeShowUpdate(); }

// ---- "what's new" window: pops up once after an update; the version badge opens it any time ----
const SEEN_KEY = 'cn-seen-version';
const seenGet = () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } };
const seenSet = (v) => { try { localStorage.setItem(SEEN_KEY, v); } catch {} };
let updateShown = false;
function maybeShowUpdate() {
  const v = verInfo && verInfo.version; if (!v || updateShown) return;
  updateShown = true;
  if (seenGet() !== v) openChangelog(true);
}
const chEntry = (e) => `<section class="chent"><h3>${esc(e.version)}${e.date ? ` <small>${esc(e.date)}</small>` : ''}</h3><div class="md">${renderMd(e.body)}</div></section>`;
async function openChangelog(afterUpdate) {
  let c; try { c = await api('/api/changelog'); } catch (e) { if (!afterUpdate) toast('讀不到更新紀錄：' + e.message, 4000); return; }
  const cur = c.entries.find((e) => e.version === c.version) || c.entries[0];
  if (afterUpdate && !cur) return seenSet(c.version);            // nothing to show (no changelog in this install)
  const older = c.entries.filter((e) => e !== cur);
  const v = verInfo || {};
  $('#chTitle').textContent = afterUpdate ? `🎉 已更新到 ${c.version}` : `更新紀錄（目前 ${c.version || '未知版本'}）`;
  $('#chBody').innerHTML =
    (c.upcoming && c.upcoming.length ? `<div class="chnew"><b>🆕 GitHub 上有新版本 ${esc(c.upcoming[0].version)}</b><p class="hint left">在電腦上雙擊 ClaudeNote 資料夾裡的 update.cmd 就會更新。新版本會有：</p>${c.upcoming.map(chEntry).join('')}</div>` : '') +
    (cur ? (afterUpdate ? '' : '<p class="hint left">這個版本：</p>') + chEntry(cur) : '<p class="hint left">這個版本沒有更新紀錄。</p>') +
    (older.length ? `<details class="chold"><summary>以前的更新（${older.length}）</summary>${older.map(chEntry).join('')}</details>` : '');
  $('#chCheck').hidden = isKioskMode() || !(v.sha);
  const d = $('#chDlg'); if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  $('#chBody').scrollTop = 0;
  seenSet(c.version);
}
const isKioskMode = () => document.body.classList.contains('kiosk-mode');
$('#chClose').onclick = () => { const d = $('#chDlg'); d.close ? d.close() : d.removeAttribute('open'); };
$('#chDlg').addEventListener('click', (e) => { if (e.target.id === 'chDlg') $('#chClose').onclick(); });   // tap outside closes
$('#chCheck').onclick = async () => {
  const b = $('#chCheck'); b.disabled = true; b.textContent = '檢查中…';
  try { verInfo = await api('/api/version/check', { method: 'POST' }); renderVersion(); }
  catch (e) { toast('檢查失敗：' + e.message, 4000); }
  b.disabled = false; b.textContent = '檢查新版本';
  if (verInfo && verInfo.error) toast(verInfo.error, 4000);
  else if (verInfo && !verInfo.newer) toast(`${verInfo.version} 已經是最新版本`, 3000);
  else openChangelog(false);
};
$('#verBadge').onclick = () => openChangelog(false);
loadVersion(); setInterval(loadVersion, 30 * 60 * 1000);

// ---------- learning (學習) ----------
let lnTopic = null, lnData = null, lnLessonN = null, lnQuizId = null, lnQuizBack = 'lnTopic', lnTimer = null, lnInfo = { web: true, pdf: true };
const isKiosk = () => document.body.classList.contains('kiosk-mode');
const lnApi = (p, o) => api('/api/learn' + p, o);
const jbody = (m, b) => ({ method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
const enc = encodeURIComponent;
function lnShow(v) { document.querySelectorAll('#tab-learn .lview').forEach((x) => (x.hidden = x.id !== v)); clearTimeout(lnTimer); window.scrollTo(0, 0); }
const lnPoll = (fn, ms = 3000) => { clearTimeout(lnTimer); lnTimer = setTimeout(fn, ms); };
document.querySelectorAll('[data-lback]').forEach((b) => (b.onclick = () => (b.dataset.lback === 'lnList' ? loadLearn() : openTopic(lnTopic))));
const shortDate = (s) => (s ? s.slice(5).replace('-', '/') : '');

async function loadLearn() {
  lnShow('lnList');
  let r; try { r = await lnApi(''); } catch (e) { return toast('讀取失敗：' + e.message); }
  lnInfo = { web: r.web, pdf: r.pdf };
  $('#lnEmpty').hidden = r.topics.length > 0;
  $('#lnNewBox').open = !r.topics.length;
  $('#lnTopics').innerHTML = r.topics.map((t) => `<li data-topic="${esc(t.id)}"><div class="t">📚 ${esc(t.title)}</div><div class="m">進度 ${t.done}/${t.total} 章` +
    (t.examDate ? ` · 考試 ${shortDate(t.examDate)}${t.daysLeft >= 0 ? `（還有 ${t.daysLeft} 天）` : '（已結束）'}` : '') + (t.open ? ` · 錯題 ${t.open}` : '') +
    (t.todayPlan ? `<br>今天：${esc(t.todayPlan)}` : '') + (t.outline && t.outline.status === 'processing' ? '<br>⏳ 大綱產生中…' : '') + '</div></li>').join('');
}
$('#lnTopics').addEventListener('click', (e) => { const li = e.target.closest('li[data-topic]'); if (li) openTopic(li.dataset.topic); });
$('#lnCreate').onclick = async () => {
  const title = $('#lnTitle').value.trim();
  if (!title) return toast('請填主題名稱');
  try {
    const t = await lnApi('', jbody('POST', { title, goal: $('#lnGoal').value, rules: $('#lnRules').value, examDate: $('#lnExam').value, planTime: $('#lnPlanTime').value }));
    ['#lnTitle', '#lnGoal', '#lnRules', '#lnExam'].forEach((q) => ($(q).value = ''));
    toast('已建立，可以先上傳教材，再按「產生大綱」', 4000);
    lnShow('lnTopic'); openTopic(t.id, true);
  } catch (e) { toast('建立失敗：' + e.message, 4000); }
};

async function openTopic(id, fresh) {
  lnTopic = id;
  let t; try { t = await lnApi('/' + enc(id)); } catch (e) { return toast(e.message); }
  lnData = t; lnInfo = { web: t.web, pdf: t.pdf };
  if ($('#lnTopic').hidden) lnShow('lnTopic');
  $('#ltTitle').textContent = '📚 ' + t.title;
  const s = t.summary;
  $('#ltMeta').textContent = `進度 ${s.done}/${s.total} 章` + (t.examDate ? ` · 考試 ${t.examDate}${s.daysLeft >= 0 ? `（還有 ${s.daysLeft} 天）` : '（已結束）'}` : '') + (t.goal ? ` · ${t.goal}` : '');
  const plan = t.plan || [];
  $('#ltToday').hidden = !plan.length;
  $('#ltToday').innerHTML = plan.length ? '<div class="lbl">🗓️ 讀書計畫</div>' + plan.slice(0, 4).map((d, i) => `<div class="hint left">${i === 0 ? '<b>今天</b>' : shortDate(d.date)}：${esc(d.line)}</div>`).join('') : '';
  const o = t.outline || {};
  const busy = o.status === 'processing';
  $('#ltOutlineState').textContent = busy ? '⏳ 大綱產生中（可能要幾分鐘）' : o.status === 'error' ? '⚠️ ' + (o.error || '失敗') : o.status === 'ready' ? (o.fromMaterials ? '依教材排' : o.web ? 'AI 查證後排' : 'AI 排') : '';
  const orBusy = !!(t.outlineReview && t.outlineReview.status === 'processing');
  $('#ltGenOutline').textContent = t.chapters.length ? '🔍 依教材檢查大綱' : '產生大綱';
  $('#ltGenOutline').disabled = busy || orBusy || (t.chapters.length > 0 && !t.materials.length);
  $('#ltGenOutline').hidden = t.chapters.length > 0 && isKiosk();
  $('#ltGenOutline').title = t.chapters.length && !t.materials.length ? '先上傳教材才能對照' : '';
  $('#ltChapters').innerHTML = t.chapters.length ? t.chapters.map((c, i) => {
    const ls = t.lessons[c.n];
    return `<li><button type="button" class="ci" data-done="${c.n}" title="切換完成">${c.status === 'done' ? '✅' : '⬜'}</button>` +
      `<div class="cb"><div class="ct">第${i + 1}章 ${esc(c.title)}${(c.fresh || []).length ? ' <span class="lv fresh" title="新教材補充了重點">🆕</span>' : ''}${t.levels && t.levels[c.n] ? ` <span class="lv">Lv.${t.levels[c.n].level}</span>` : ''}</div><div class="cp">${esc(c.points.join('、'))}${c.source ? '　📖 ' + esc(c.source) : ''}</div></div>` +
      `<button type="button" class="cgo" data-lesson="${c.n}">${ls === 'processing' ? '準備中…' : ls === 'ready' ? '繼續' : '上課'}</button></li>`;
  }).join('') : '<li class="hint left">還沒有大綱。有教材的話先上傳，再按「產生大綱」。</li>';
  $('#ltQuizBtn').disabled = !t.chapters.length;
  fillOutlineReview(t);
  const open = t.wrong.filter((w) => w.status !== 'mastered').length;
  $('#ltWrongBtn').textContent = '📕 錯題本' + (open ? `（${open}）` : '');
  $('#ltMatCount').textContent = t.materials.length ? `${t.materials.length} 份` : '還沒有';
  $('#ltMats').innerHTML = t.materials.map((m) => `<li><span>${m.type === 'pdf' ? '📄' : m.type === 'image' ? '📷' : m.type === 'html' ? '🌐' : '📝'} ${esc(m.file)}　<span class="hint">${m.kind === 'past' ? '考古題' : '講義'}${m.status === 'processing' ? '・轉文字中…' : m.status === 'error' ? '・⚠️ ' + esc(m.error || '失敗') : ''}</span></span>` +
    (isKiosk() ? '' : `<button type="button" data-delmat="${esc(m.file)}" aria-label="刪除">✕</button>`) + '</li>').join('');
  $('#ltMatHint').textContent = '支援 HTML 網頁檔、文字檔、照片' + (t.pdf ? '、PDF（Claude 可以直接讀，包括掃描檔）' : '（目前的 AI 讀不到 PDF，請改用照片或文字）') + '。考古題用來仿照出題風格。';
  if (fresh) $('#ltMatBox').open = true;
  $('#ltGoal').value = t.goal || ''; $('#ltRules').value = t.rules || ''; $('#ltExam').value = t.examDate || ''; $('#ltPlanTime').value = t.planTime || '';
  if (busy || orBusy || t.materials.some((m) => m.status === 'processing') || Object.values(t.lessons).includes('processing')) lnPoll(() => !$('#lnTopic').hidden && openTopic(id), 4000);
}
$('#ltGenOutline').onclick = async () => {
  if (lnData.chapters.length) {   // the outline exists: suggestions against all materials, nothing changes until the user applies them
    try { await lnApi('/' + enc(lnTopic) + '/outline/check', { method: 'POST' }); toast('AI 正在對照全部教材檢查大綱，建議會列在章節下面', 4000); openTopic(lnTopic); }
    catch (e) { toast(e.message, 4000); }
    return;
  }
  try { await lnApi('/' + enc(lnTopic) + '/outline', { method: 'POST' }); toast(lnData.materials.length ? '依教材排大綱中…' : (lnInfo.web ? 'AI 查資料後排大綱，可能要幾分鐘' : 'AI 排大綱中…'), 4000); openTopic(lnTopic); }
  catch (e) { toast(e.message, 4000); }
};
// ---- outline suggestions (from new materials) ----
const OR_TYPE = { ADD: '新增章節', POINTS: '補充重點', EDIT: '修改章節', MOVE: '調整順序', MERGE: '合併章節', CONFLICT: '說法不同' };
function orText(x, chs) {
  const name = (n) => { const i = chs.findIndex((c) => c.n === n); return i >= 0 ? `第${i + 1}章「${chs[i].title}」` : (x.labels || {})[n] ? `「${x.labels[n]}」` : '（已不在大綱裡的章節）'; };
  const pts = x.points && x.points.length ? x.points.join('、') : '';
  if (x.type === 'ADD') return `新增「${x.title}」，放在${x.chapter === 0 ? '最前面' : x.chapter ? name(x.chapter) + '後面' : '最後面'}` + (pts ? `；重點：${pts}` : '');
  if (x.type === 'POINTS') return `${name(x.chapter)}補充：${pts}`;
  if (x.type === 'EDIT') return `${name(x.chapter)}` + (x.title ? `改名為「${x.title}」` : '') + (pts ? `${x.title ? '，' : ''}重點改成：${pts}` : '');
  if (x.type === 'MOVE') return `${name(x.chapter)}移到${x.after === 0 ? '最前面' : name(x.after) + '後面'}`;
  if (x.type === 'MERGE') return `${name(x.chapter)}併入${name(x.into)}`;
  return `${name(x.chapter)}：` + (x.old ? `原本「${x.old}」，` : '') + `教材寫「${x.new}」`;
}
function fillOutlineReview(t) {
  const r = t.outlineReview, box = $('#ltOrBox');
  const items = (r && r.items) || [], busy = !!(r && r.status === 'processing');
  const open = items.filter((x) => x.state === 'open' && !x.blocked);
  box.hidden = !t.chapters.length || !r || (r.status === 'none' && !items.length);
  if (box.hidden) return;
  $('#ltOrStatus').innerHTML = busy ? '⏳ AI 正在對照' + (r.all ? '全部教材' : '新的教材') + '檢查大綱，大約 1～3 分鐘。' + (items.some((x) => x.state === 'open') ? '下面是之前還沒處理的建議。' : '')
    : r.status === 'error' ? '⚠️ ' + esc(r.error || '檢查失敗') + (isKiosk() ? '' : '　可以按「依教材檢查大綱」再試一次。')
    : open.length ? `有 ${open.length} 條建議${isKiosk() ? '，請在自己的裝置上套用' : '：勾選要套用的，或標成不用改'}。已經上過的章節只會補充重點，不會改名、移動或合併掉。`
    : '✅ 大綱已經涵蓋目前的教材。';
  // re-rendering (polling) keeps the checkboxes the user changed
  const prev = {}, rid = t.id + '|' + (r.at || '');
  if ($('#ltOrList').dataset.rid === rid) document.querySelectorAll('#ltOrList input[data-or]').forEach((c) => (prev[c.dataset.or] = c.checked));
  $('#ltOrList').dataset.rid = rid;
  $('#ltOrList').innerHTML = items.slice().sort((a, b) => (a.state === 'open' ? 0 : 1) - (b.state === 'open' ? 0 : 1)).map((x) => {
    const can = x.state === 'open' && !x.blocked && !isKiosk();
    const tag = x.state === 'applied' ? '<span class="rvstate">✅ 已套用</span>' : x.state === 'ignored' ? `<span class="rvstate">不用改</span>${isKiosk() ? '' : ` <button type="button" class="link" data-or-reopen="${esc(x.id)}">恢復</button>`}`
      : x.blocked ? `<span class="rvstate">🔒 ${esc(x.blocked)}</span>` : '';
    const def = x.type !== 'CONFLICT';   // a conflict is the user's call: not pre-ticked
    return `<li class="rv ${x.state !== 'open' || x.blocked ? 'done' : ''}"><label class="rvhead">${can ? `<input type="checkbox" data-or="${esc(x.id)}"${(x.id in prev ? prev[x.id] : def) ? ' checked' : ''}>` : ''}
      <span class="rvlv ${x.type === 'CONFLICT' ? 'warn' : 'info'}">${OR_TYPE[x.type] || esc(x.type)}</span> ${esc(orText(x, t.chapters))}</label>
      ${x.reason ? `<div class="rvq">${esc(x.reason)}</div>` : ''}${x.source || (x.materials || []).length ? `<div class="rvsrc">依據：${esc(x.source || (x.materials || []).join('、'))}</div>` : ''}${tag ? `<div>${tag}</div>` : ''}</li>`;
  }).join('');
  $('#ltOrActions').hidden = busy || !open.length || isKiosk();
}
async function orAction(action, ids) {
  if (!ids.length) return toast('請先勾選建議');
  try {
    const r = await lnApi('/' + enc(lnTopic) + '/outline/apply', jbody('POST', { action, ids }));
    if (action === 'apply') toast(`已套用 ${r.applied} 條` + (r.skipped.length ? `；${r.skipped.length} 條沒有套用：${r.skipped.map((x) => x.reason).join('；')}` : ''), 6000);
  } catch (e) { toast(e.message, 4000); }
  openTopic(lnTopic);
}
const orChecked = () => [...document.querySelectorAll('#ltOrList input[data-or]:checked')].map((c) => c.dataset.or);
$('#ltOrApply').onclick = () => orAction('apply', orChecked());
$('#ltOrIgnore').onclick = () => orAction('ignore', orChecked());
$('#ltOrList').addEventListener('click', (e) => { const b = e.target.closest('[data-or-reopen]'); if (b) { e.preventDefault(); orAction('reopen', [b.dataset.orReopen]); } });
$('#ltChapters').addEventListener('click', async (e) => {
  const d = e.target.closest('[data-done]'), l = e.target.closest('[data-lesson]');
  if (d) { const c = lnData.chapters.find((x) => x.n === +d.dataset.done); try { await lnApi(`/${enc(lnTopic)}/chapters/${c.n}/done`, jbody('POST', { done: c.status !== 'done' })); openTopic(lnTopic); } catch (err) { toast(err.message); } }
  if (l) openLesson(+l.dataset.lesson);
});
$('#ltMatFile').addEventListener('change', async (e) => {
  const files = [...e.target.files]; e.target.value = '';
  if (!files.length) return;
  const fd = new FormData(); fd.append('kind', $('#ltMatKind').value); files.forEach((f) => fd.append('files', f, f.name));
  toast('上傳中…', 20000);
  try { const r = await lnApi('/' + enc(lnTopic) + '/materials', { method: 'POST', body: fd }); toast(`已加入 ${r.added.length} 份` + (r.skipped.length ? `；略過：${r.skipped.join('；')}` : '') + (files.some((f) => f.type.startsWith('image/')) ? '。照片會先轉成文字' : '') +
    (r.outlineCheck ? '。AI 會依新教材檢查大綱，建議會列在章節下面' : ''), 8000); }
  catch (err) { toast('上傳失敗：' + err.message, 6000); }
  openTopic(lnTopic);
});
$('#ltMats').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-delmat]'); if (!b) return;
  if (!confirm(`刪除教材「${b.dataset.delmat}」？（會移到筆記庫的 .trash）`)) return;
  try { await lnApi(`/${enc(lnTopic)}/materials/${enc(b.dataset.delmat)}`, { method: 'DELETE' }); openTopic(lnTopic); } catch (err) { toast(err.message); }
});
$('#ltSave').onclick = async () => {
  try { await lnApi('/' + enc(lnTopic), jbody('PUT', { goal: $('#ltGoal').value, rules: $('#ltRules').value, examDate: $('#ltExam').value, planTime: $('#ltPlanTime').value })); toast('已儲存'); $('#ltSetBox').open = false; openTopic(lnTopic); }
  catch (e) { toast(e.message, 4000); }
};
$('#ltDelete').onclick = async () => {
  if (!confirm(`刪除「${lnData.title}」整個主題？大綱、錯題本、章節筆記、教材會一起移到筆記庫的 .trash。`)) return;
  try { await lnApi('/' + enc(lnTopic), { method: 'DELETE' }); toast('已移到 .trash'); loadLearn(); } catch (e) { toast(e.message, 4000); }
};
const vaultOpen = (p, missing) => api('/api/vault/note?path=' + enc(p)).then(() => openVaultNote(p)).catch(() => toast(missing, 3500));
$('#ltWrongBtn').onclick = () => vaultOpen(lnData.links.wrong, '還沒有錯題 👍');
$('#ltOutlineBtn').onclick = () => vaultOpen(lnData.links.outline, '還沒有大綱');

const LEVEL_NAMES = ['', '基礎建立', '標準入門', '概念應用', '進階變形', '大師挑戰'];
// ---- lesson ----
let llNotesTimer = null;
const chatOpen = {}; // lesson chat: which question/answer pairs the user opened or closed
async function openLesson(n, start = true) {
  const entering = lnLessonN !== n || $('#lnLesson').hidden;
  lnLessonN = n;
  let r; try { r = await lnApi(`/${enc(lnTopic)}/lesson/${n}`); } catch (e) { return toast(e.message); }
  const l = r.lesson, c = r.chapter;
  if (entering) { lnShow('lnLesson'); $('#llNotes').value = (l && l.notes) || ''; $('#llSaved').textContent = ''; }
  $('#llTitle').textContent = `第${r.pos || '?'}章 ${c.title}`;
  if ((!l || l.status === 'none') && start) {
    try { await lnApi(`/${enc(lnTopic)}/lesson/${n}`, { method: 'POST' }); } catch (e) { return toast(e.message); }
    return openLesson(n, false);
  }
  const busy = !!(l && l.status === 'processing');
  const ready = !!(l && l.status === 'ready');
  $('#llStatus').hidden = ready;
  $('#llStatus').className = 'status' + (l && l.status === 'error' ? ' error' : '');
  $('#llStatus').innerHTML = busy ? `⏳ 老師正在準備這一章${lnInfo.web ? '（會先上網查證，可能要幾分鐘）' : ''}…<br><small>可以先關掉，晚點再回來。</small>` : l && l.status === 'error' ? '⚠️ ' + esc(l.error) : '';
  $('#llBody').innerHTML = l && l.content ? renderMd(l.content) : '';
  const chat = (l && l.chat) || [];
  const st = (l && l.adapt) || { level: r.level || 2, sc: 0, sw: 0 };
  $('#llLevel').hidden = !(l && l.status === 'ready');
  $('#llLevel').textContent = `🎯 小問題等級 Lv.${st.level}（${LEVEL_NAMES[st.level]}）` + (st.sc ? `・連續答對 ${st.sc} 題` : '') + (st.sw ? '・剛剛答錯，再試一次' : '') + '　答對 2 題會升級，連錯 2 題會降一級';
  const mark = (m) => (m.judge === 'correct' ? ' ✅' : m.judge === 'wrong' ? ' ❌' : '') + (m.event === 'up' ? ` <span class="lv">⬆️ 升到 Lv.${m.level}</span>` : m.event === 'down' ? ` <span class="lv">⬇️ 降到 Lv.${m.level}</span>` : '');
  // threads: a question with its answer, then the answers to its small questions and 再來一題 underneath.
  // Each thread folds; the newest is open unless the user toggled it (kept across re-renders)
  const threads = r.threads || chat.map((m, i) => [i]);
  const asking = l && l.asking, intoThread = asking && threads.length && (l.askingMode === 'answer' || l.askingMode === 'more');
  const ck = (i) => `${lnTopic}|${n}|${i}`, newest = asking && !intoThread ? -1 : threads.length ? threads[threads.length - 1][0] : -1;
  const isOpen = (i) => (ck(i) in chatOpen ? chatOpen[ck(i)] : i === newest);
  const reply = (m) => `<div class="creply"><div class="cq2">${m.kind === 'more' ? '🎯 再來一題' : '✍️ ' + esc(m.q)}${mark(m)}</div><div class="ca md">${renderMd(m.a)}</div></div>`;
  const marks = (t) => t.slice(1).map((i) => chat[i]).filter((m) => m.judge === 'correct' || m.judge === 'wrong').map((m) => (m.judge === 'correct' ? '✅' : '❌')).join('');
  const waiting = (q) => `<div class="creply"><div class="cq2">✍️ ${esc(q)}</div><div class="ca hint left">回答中…</div></div>`;
  $('#llChat').innerHTML = chat.length || asking ? '<div class="chat">' + threads.map((t, k) => {
    const m = chat[t[0]], last = k === threads.length - 1;
    const more = t.length - 1 + (intoThread && last ? 1 : 0);
    return `<details class="cqa" data-i="${t[0]}"${isOpen(t[0]) || (intoThread && last) ? ' open' : ''}><summary class="cq">🙋 ${esc(m.q)}${mark(m)}${more ? ` <span class="cnt">💬 ${more}${marks(t) ? ' ' + marks(t) : ''}</span>` : ''}</summary>` +
      `<div class="ca md">${renderMd(m.a)}</div>${t.slice(1).map((i) => reply(chat[i])).join('')}${intoThread && last ? waiting(l.askingMode === 'more' ? '🎯 再來一題' : asking) : ''}</details>`;
  }).join('') + (asking && !intoThread ? `<div class="cq">🙋 ${esc(asking)}</div><div class="ca hint left">回答中…</div>` : '') + '</div>' : '';
  $('#llChat').querySelectorAll('details.cqa').forEach((d) => d.addEventListener('toggle', () => { chatOpen[ck(d.dataset.i)] = d.open; }));
  $('#llAskBox').hidden = !ready;
  llPending = r.pending || '';
  setLlMode(llMode);
  $('#llAskBtn').disabled = $('#llMoreBtn').disabled = !!asking;
  $('#llQuizBtn').disabled = $('#llFinish').disabled = !ready;
  $('#llRedo').disabled = busy;
  const fresh = c.fresh || [], sp = l && l.supp, spBusy = !!(sp && sp.status === 'processing');
  const spDone = !!(sp && sp.status === 'ready' && !fresh.length && (r.suppDraft || !sp.note));
  $('#llSupp').hidden = !ready || !(fresh.length || spBusy || spDone);
  $('#llSupp').innerHTML = spBusy ? '⏳ 正在補上新教材的內容，完成後會接在教學內容的最後面…'
    : spDone ? (sp.note ? `✅ 補充的內容已經整理成草稿，到「草稿」確認後會接在「${esc(sp.note)}」筆記的後面。` : '✅ 已補上新教材的內容。這一章還沒整理成筆記，按「完成這章並整理筆記」時會包含補充的內容。')
    : `<div>🆕 新教材補充了這些重點：${esc(fresh.join('、'))}</div>` + (sp && sp.status === 'error' ? `<div class="hint left">⚠️ 上次補充失敗：${esc(sp.error || '')}</div>` : '') +
      (isKiosk() ? '' : '<button type="button" id="llSuppBtn">補上新內容</button>');
  const sb = $('#llSuppBtn'); if (sb) sb.onclick = async () => {
    try { await lnApi(`/${enc(lnTopic)}/lesson/${n}/supplement`, { method: 'POST' }); toast('老師正在補充新的內容…'); } catch (e) { toast(e.message, 4000); }
    openLesson(n, false);
  };
  if (busy || spBusy || (l && l.asking)) lnPoll(() => !$('#lnLesson').hidden && openLesson(n, false), 4000);
}
// one input for both: the student picks (or lets the AI decide) whether this is a new question or an answer to the small question
let llMode = 'auto', llPending = '';
const LL_PLACEHOLDER = { auto: '有不懂的地方直接問，或回答老師的 🤔 小問題（AI 會自己判斷）', ask: '輸入你想問的問題', answer: '輸入你對 🤔 小問題的回答' };
function setLlMode(m) {
  if (m === 'answer' && !llPending) m = 'auto';                 // nothing to answer right now
  llMode = m;
  document.querySelectorAll('#llMode button').forEach((b) => { b.classList.toggle('active', b.dataset.mode === m); b.setAttribute('aria-checked', b.dataset.mode === m); });
  const ab = $('#llMode [data-mode="answer"]'); ab.disabled = !llPending; ab.title = llPending ? '' : '目前沒有等你回答的小問題';
  $('#llAsk').placeholder = LL_PLACEHOLDER[m];
  $('#llPending').hidden = !llPending;
  $('#llPending').textContent = llPending ? '🤔 等你回答：' + llPending.replace(/\s+/g, ' ').slice(0, 160) : '';
}
document.querySelectorAll('#llMode button').forEach((b) => (b.onclick = () => setLlMode(b.dataset.mode)));
$('#llAskBtn').onclick = async () => {
  const q = $('#llAsk').value.trim(); if (!q) return toast(llMode === 'answer' ? '請輸入你的回答' : '請輸入問題');
  try { await lnApi(`/${enc(lnTopic)}/lesson/${lnLessonN}/ask`, jbody('POST', { q, mode: llMode })); $('#llAsk').value = ''; if (llMode !== 'auto') llMode = 'auto'; openLesson(lnLessonN, false); } catch (e) { toast(e.message); }
};
$('#llMoreBtn').onclick = async () => {
  try { await lnApi(`/${enc(lnTopic)}/lesson/${lnLessonN}/ask`, jbody('POST', { more: true })); openLesson(lnLessonN, false); } catch (e) { toast(e.message); }
};
async function saveLessonNotes() {
  clearTimeout(llNotesTimer);
  if (lnLessonN == null) return;
  try { await lnApi(`/${enc(lnTopic)}/lesson/${lnLessonN}/notes`, jbody('PUT', { notes: $('#llNotes').value })); $('#llSaved').textContent = '已自動儲存'; } catch { $('#llSaved').textContent = '⚠️ 沒存到'; }
}
$('#llNotes').addEventListener('input', () => { $('#llSaved').textContent = '…'; clearTimeout(llNotesTimer); llNotesTimer = setTimeout(saveLessonNotes, 1500); });
$('#llNotes').addEventListener('blur', () => { if ($('#llSaved').textContent === '…') saveLessonNotes(); });
$('#llRedo').onclick = async () => {
  if (!confirm('重新準備這一章的教學內容？你的筆記和問答會保留。')) return;
  try { await lnApi(`/${enc(lnTopic)}/lesson/${lnLessonN}`, { method: 'POST' }); openLesson(lnLessonN, false); } catch (e) { toast(e.message); }
};
$('#llQuizBtn').onclick = async () => {
  await saveLessonNotes();
  try { const r = await lnApi(`/${enc(lnTopic)}/lesson/${lnLessonN}/quiz`, { method: 'POST' }); openQuiz(r.id, 'lnLesson'); } catch (e) { toast(e.message); }
};
$('#llFinish').onclick = async () => {
  await saveLessonNotes();
  if (!confirm('完成這一章？你的筆記會連同教學重點和小測驗結果交給 AI 整理成草稿，你看過再上傳。')) return;
  try { const r = await lnApi(`/${enc(lnTopic)}/lesson/${lnLessonN}/finish`, jbody('POST', {})); toast('這章完成了 ✅ 筆記整理中', 3500); openDraft(r.draft); }
  catch (e) { toast(e.message, 4000); }
};

// ---- quiz settings ----
const QTYPES = [['choice', '選擇', 5], ['fill', '填空', 3], ['short', '簡答', 2], ['term', '名詞解釋', 0], ['qa', '問答', 0], ['essay', '申論', 0]];
$('#ltQuizBtn').onclick = () => {
  lnShow('lnQuizCfg');
  if (!$('#qcTypes').children.length) $('#qcTypes').innerHTML = QTYPES.map(([k, n, d]) => `<label>${n}<input type="number" min="0" max="20" value="${d}" data-qt="${k}"></label>`).join('');
  const past = lnData.materials.some((m) => m.kind === 'past'), wrong = lnData.wrong.filter((w) => w.status !== 'mastered').length;
  $('#qcMimic').disabled = !past; $('#qcMimic').checked = past;
  $('#qcWrong').disabled = !wrong; $('#qcWrong').checked = false;
  $('#qcHint').textContent = (past ? '' : '沒有上傳考古題，所以不能仿照風格。') + (wrong ? `錯題本有 ${wrong} 題待複習。` : '錯題本是空的。') + (lnData.materials.length ? '題目會照你上傳的教材出。' : '沒有教材，題目依 AI 的知識出。');
  $('#qcRules').value = lnData.quizRules || '';
  $('#qcScope').innerHTML = lnData.chapters.map((c, i) => `<label><input type="checkbox" value="${c.n}"> 第${i + 1}章 ${esc(c.title)}</label>`).join('');
};
$('#qcAll').onclick = () => { const bs = [...document.querySelectorAll('#qcScope input')]; const on = !bs.every((b) => b.checked); bs.forEach((b) => (b.checked = on)); };
$('#qcGo').onclick = async () => {
  const counts = {}; document.querySelectorAll('#qcTypes input').forEach((i) => (counts[i.dataset.qt] = +i.value || 0));
  const body = { counts, rules: $('#qcRules').value, difficulty: $('#qcDiff').value, mimic: $('#qcMimic').checked, wrongOnly: $('#qcWrong').checked, scope: [...document.querySelectorAll('#qcScope input:checked')].map((i) => +i.value) };
  $('#qcGo').disabled = true;
  try { const r = await lnApi('/' + enc(lnTopic) + '/quiz', jbody('POST', body)); openQuiz(r.id, 'lnTopic'); } catch (e) { toast(e.message, 4000); }
  $('#qcGo').disabled = false;
};

// ---- taking a quiz / results ----
let lqNotesTimer = null, lqData = null;
const draftKey = () => 'quiz-' + lnQuizId;
function readAnswers() {
  const a = {};
  for (const q of lqData.questions) {
    if (q.type === 'choice') { const c = document.querySelector(`#lqForm input[name="q${q.i}"]:checked`); a[q.i] = c ? +c.value : -1; }
    else if (q.type === 'fill') a[q.i] = [...document.querySelectorAll(`#lqForm input[data-fill="${q.i}"]`)].map((x) => x.value);
    else { const t = document.querySelector(`#lqForm textarea[data-q="${q.i}"]`); a[q.i] = t ? t.value : ''; }
  }
  return a;
}
async function openQuiz(id, back) {
  if (back) lnQuizBack = back;
  const entering = lnQuizId !== id || $('#lnQuiz').hidden;
  lnQuizId = id;
  let z; try { z = await lnApi(`/${enc(lnTopic)}/quiz/${id}`); } catch (e) { return toast(e.message); }
  lqData = z;
  if (entering) { lnShow('lnQuiz'); $('#lqNotes').value = z.notes || ''; $('#lqSaved').textContent = ''; $('#lqForm').innerHTML = ''; $('#lqForm').dataset.mode = ''; }
  $('#lqTitle').textContent = '📝 ' + z.label;
  const busy = z.status === 'processing' || z.status === 'grading', graded = z.status === 'graded';
  $('#lqStatus').hidden = !busy && !z.error;
  $('#lqStatus').className = 'status' + (!busy && z.error ? ' error' : '');
  $('#lqStatus').innerHTML = z.status === 'processing' ? '⏳ 出題中…（大約一兩分鐘）' : z.status === 'grading' ? '⏳ 批改中…' : '⚠️ ' + esc(z.error || '');
  $('#lqScore').hidden = !graded;
  if (graded) { const wrong = z.questions.filter((q) => q.wrong).length; $('#lqScore').innerHTML = `<div class="lbl">得分 ${z.score} / ${z.max}</div><div class="hint left">${wrong ? `${wrong} 題答錯或分數低於六成，已記進錯題本` : '全部答對 🎉'}</div>`; }
  if (z.status === 'ready' && $('#lqForm').dataset.mode !== 'answer') {
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(draftKey()) || '{}'); } catch {}
    $('#lqForm').dataset.mode = 'answer';
    $('#lqForm').innerHTML = z.questions.map((q, k) => `<div class="qcard"><div class="qh">${k + 1}．${q.typeLabel}（${q.score} 分）</div><div class="qq md">${renderMd(q.q)}</div>` +
      (q.type === 'choice' ? q.options.map((o, j) => `<label class="opt"><input type="radio" name="q${q.i}" value="${j}"${saved[q.i] === j ? ' checked' : ''}> (${String.fromCharCode(65 + j)}) ${esc(o)}</label>`).join('')
        : q.type === 'fill' ? Array.from({ length: q.blanks }, (_, j) => `<input type="text" data-fill="${q.i}" placeholder="第 ${j + 1} 個空格" value="${esc((saved[q.i] || [])[j] || '')}">`).join('')
          : `<textarea data-q="${q.i}" rows="${q.type === 'essay' ? 9 : q.type === 'qa' ? 6 : 3}" placeholder="作答…">${esc(saved[q.i] || '')}</textarea>`) +
      `<div class="hints" data-h="${q.i}">${(q.hints || []).map((h) => `<div class="hintline">💡 ${esc(h)}</div>`).join('')}</div>` +
      `<button type="button" class="small hintbtn" data-hint="${q.i}"${(q.hints || []).length >= 2 ? ' hidden' : ''}>💡 給我提示${(q.hints || []).length ? '（再一個）' : ''}</button></div>`).join('');
  }
  if (graded && $('#lqForm').dataset.mode !== 'result') {
    try { localStorage.removeItem(draftKey()); } catch {}
    $('#lqForm').dataset.mode = 'result';
    $('#lqForm').innerHTML = z.questions.map((q, k) => `<div class="qcard ${q.wrong ? 'wrong' : 'right'}"><div class="qh">${k + 1}．${q.typeLabel}　${q.wrong ? '❌' : '⭕'} ${q.score} / ${q.max} 分</div>` +
      `<div class="qq md">${renderMd(q.q)}</div>` + (q.options ? `<div class="hint left">${q.options.map((o, j) => `(${String.fromCharCode(65 + j)}) ${esc(o)}`).join('　')}</div>` : '') +
      `<div class="res">${q.hints && q.hints.length ? `<div class="hint left">💡 用了 ${q.hints.length} 個提示</div>` : ''}<div>🖊️ 我的答案：${esc(q.mine)}</div><div>✔️ ${q.type === 'choice' || q.type === 'fill' ? '正確答案' : '參考答案'}：${esc(q.key)}</div>` +
      (q.hit && q.hit.length ? `<div>👍 有寫到：${esc(q.hit.join('；'))}</div>` : '') + (q.miss && q.miss.length ? `<div>⚠️ 漏掉／寫錯：${esc(q.miss.join('；'))}</div>` : '') +
      (q.feedback && q.feedback !== '答對' ? `<div>💬 ${esc(q.feedback)}</div>` : '') + (q.explanation ? `<div class="hint left">解析：${esc(q.explanation)}</div>` : '') + '</div></div>').join('');
  }
  if (z.status === 'processing' || z.status === 'error') { $('#lqForm').innerHTML = ''; $('#lqForm').dataset.mode = ''; }
  $('#lqSubmit').hidden = z.status !== 'ready';
  $('#lqNotesBox').hidden = !(z.status === 'ready' || z.status === 'grading' || graded);
  $('#lqFinish').hidden = !graded;
  if (busy) lnPoll(() => !$('#lnQuiz').hidden && openQuiz(id), 3000);
}
// 💡 hint for one question (the server never sends the answer; at most 2 per question)
$('#lqForm').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-hint]'); if (!b) return;
  const i = +b.dataset.hint, q = lqData.questions.find((x) => x.i === i), a = readAnswers()[i];
  const current = q.type === 'choice' ? (a >= 0 ? q.options[a] : '') : Array.isArray(a) ? a.filter(Boolean).join('、') : a;
  b.disabled = true; b.textContent = '💡 想提示中…';
  try {
    const r = await lnApi(`/${enc(lnTopic)}/quiz/${lnQuizId}/hint`, jbody('POST', { i, current }));
    q.hints = (q.hints || []).concat([r.hint]);
    document.querySelector(`#lqForm .hints[data-h="${i}"]`).insertAdjacentHTML('beforeend', `<div class="hintline">💡 ${esc(r.hint)}</div>`);
    b.hidden = r.left <= 0; b.textContent = '💡 給我提示（再一個）';
  } catch (err) { toast(err.message, 4000); b.textContent = '💡 給我提示'; }
  b.disabled = false;
});
$('#lqForm').addEventListener('input', () => { if ($('#lqForm').dataset.mode === 'answer') { try { localStorage.setItem(draftKey(), JSON.stringify(readAnswers())); } catch {} } });
$('#lqSubmit').onclick = async () => {
  const a = readAnswers();
  const empty = lqData.questions.filter((q) => (q.type === 'choice' ? a[q.i] < 0 : q.type === 'fill' ? !a[q.i].some((x) => x.trim()) : !String(a[q.i]).trim())).length;
  if (!confirm(empty ? `還有 ${empty} 題沒作答，確定交卷？` : '確定交卷？')) return;
  $('#lqSubmit').disabled = true;
  try { await lnApi(`/${enc(lnTopic)}/quiz/${lnQuizId}/submit`, jbody('POST', { answers: a })); $('#lqForm').dataset.mode = 'submitted'; openQuiz(lnQuizId); } catch (e) { toast(e.message, 4000); }
  $('#lqSubmit').disabled = false;
};
async function saveQuizNotes() { clearTimeout(lqNotesTimer); try { await lnApi(`/${enc(lnTopic)}/quiz/${lnQuizId}/notes`, jbody('PUT', { notes: $('#lqNotes').value })); $('#lqSaved').textContent = '已自動儲存'; } catch { $('#lqSaved').textContent = '⚠️ 沒存到'; } }
$('#lqNotes').addEventListener('input', () => { $('#lqSaved').textContent = '…'; clearTimeout(lqNotesTimer); lqNotesTimer = setTimeout(saveQuizNotes, 1500); });
$('#lqFinish').onclick = async () => {
  await saveQuizNotes();
  try { const r = await lnApi(`/${enc(lnTopic)}/quiz/${lnQuizId}/finish`, jbody('POST', {})); toast('筆記整理中，好了在「草稿」確認後上傳', 4000); openDraft(r.draft); }
  catch (e) { toast(e.message, 4000); }
};
$('#lqBack').onclick = () => (lnQuizBack === 'lnLesson' ? openLesson(lnLessonN, false) : openTopic(lnTopic));
if (qs.has('learn')) { const t = qs.get('learn'); history.replaceState(null, '', '/'); show('learn'); openTopic(t); }
