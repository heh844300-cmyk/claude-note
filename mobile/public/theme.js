// Deep-water theme: the water seen from below, the page's name in big letters, a splash when the tab changes.
// Decoration only: nothing here is needed for the app to work, and every failure is swallowed.
(function () {
  try {
    const WORDS = { new: 'RECORD', drafts: 'DRAFT', notes: 'NOTES', tasks: 'TASK', learn: 'STUDY', vault: 'SEARCH' };
    const el = (tag, id) => { const e = document.createElement(tag); e.id = id; e.setAttribute('aria-hidden', 'true'); return e; };
    const cv = el('canvas', 'deepBg'), word = el('div', 'deepWord'), hero = el('div', 'deepHero'), heroB = document.createElement('b');
    hero.append(heroB); document.body.prepend(cv, word);
    const main = document.querySelector('main'); if (main) main.prepend(hero);

    // the word follows the open tab; a new word restarts its slide-in and sends a splash across the screen
    let cur = null;
    const setWord = () => {
      const a = document.querySelector('nav button.active'), shown = document.querySelector('.tab:not([hidden])');
      const t = shown && shown.id === 'tab-settings' ? 'CONFIG' : (a && WORDS[a.dataset.tab]) || '';
      if (t === cur) return;
      cur = t; word.textContent = t; heroB.textContent = t;
    };
    setWord();
    document.querySelectorAll('.tab').forEach((s) => new MutationObserver(setWord).observe(s, { attributes: true, attributeFilter: ['hidden'] }));

    // the app's own switch (not the system setting): localStorage deep-motion = off
    let off = false; try { off = localStorage.getItem('deep-motion') === 'off'; } catch (e) {}
    const root = document.documentElement; root.classList.toggle('deep-still', off); root.classList.toggle('deep-novt', !document.startViewTransition);

    // page changes go through the browser's view transition; the kind picks the pattern in theme.css
    const vt = (kind, change) => {
      // not while the app is still starting up: its own first page changes must land in order, at once
      if (off || !document.startViewTransition || document.hidden || performance.now() < 1500) return change();
      let done = false; const once = () => { if (!done) { done = true; change(); } };
      try { root.dataset.vt = kind; const tr = document.startViewTransition(once); tr.finished.catch(() => {}).then(() => { if (root.dataset.vt === kind) delete root.dataset.vt; }); tr.ready.catch(() => {}); }
      catch (e) { once(); }
    };
    // app.js hands over only the visible swap of a page change (state, timers and loading are already done by then)
    window.pageSwap = (kind, swap) => (kind ? vt(kind, swap) : swap());

    let onMotion = () => {};
    const setMotion = (on) => { off = !on; try { if (off) localStorage.setItem('deep-motion', 'off'); else localStorage.removeItem('deep-motion'); } catch (e) {} root.classList.toggle('deep-still', off); onMotion(); };
    const st = document.querySelector('#tab-settings');
    if (st) {
      const DESC = { linksBox: '手機和公用電腦連到這台電腦用的網址', notif: '到期提醒和整理完成時的推播通知', sess: '用公開網址登入的裝置，可以在這裡登出', mailBox: 'Gmail 貼上「筆記」標籤的信，整理成草稿',
        cfgBox: '各項功能的開關和數值，改完馬上生效', welcome: '再看一次這個 App 可以做哪些事' };
      const keyOf = (b) => b.id || (b.querySelector('#sessList') ? 'sess' : b.classList.contains('notif') ? 'notif' : '');
      const clean = (x) => String(x || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
      const menu = document.createElement('div'); menu.id = 'cfgMenu';
      menu.innerHTML = '<p class="cfginfo"><i>Info</i><span></span></p><div class="cfglist"></div><p class="cfgask">要調整哪一項？</p><div id="cfgBand" aria-hidden="true"><b>CONFIG</b></div>';
      const tabsEl = document.createElement('div'); tabsEl.id = 'cfgTabs';
      const h2 = st.querySelector('h2'); (h2 || st.firstElementChild).after(menu, tabsEl);
      const back = st.querySelector('.back'), backText = back ? back.textContent : '';
      const list = menu.querySelector('.cfglist'), info = menu.querySelector('.cfginfo span');
      let items = [], cur = -1;
      const boxes = () => [...st.children].filter((b) => b.classList.contains('box') && !b.hidden && !(document.body.classList.contains('kiosk-mode') && b.classList.contains('nokiosk')));
      const point = (i) => { list.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === i)); info.textContent = items[i] ? items[i].desc : ''; };
      const mode = (m) => { st.dataset.cfg = m; if (back) back.textContent = m === 'detail' ? '← 設定' : backText; window.scrollTo(0, 0); };
      const openAt = (i) => {
        const it = items[i]; if (!it) return;
        if (it.motion) { setMotion(off); build(); return; }
        if (!it.box) { const w = st.querySelector('#welcomeAgain'); if (w) w.click(); return; }
        cur = i; st.querySelectorAll('.box.cfg-on').forEach((b) => b.classList.remove('cfg-on')); it.box.classList.add('cfg-on');
        if (it.box.tagName === 'DETAILS') it.box.open = true;
        tabsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
        const on = tabsEl.querySelector('button.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
        mode('detail');
      };
      const build = () => {
        items = boxes().map((box) => ({ box, label: clean((box.querySelector('.lbl') || {}).textContent), desc: DESC[keyOf(box)] || '' }));
        items.push({ box: null, motion: true, label: '介面動畫：' + (off ? '關' : '開'), desc: off ? '現在是關的：換頁不播轉場，背景靜止。點一下打開' : '現在是開的：換頁轉場和會動的背景。點一下關掉' });
        if (st.querySelector('#welcomeAgain')) items.push({ box: null, label: '功能介紹', desc: DESC.welcome });
        list.replaceChildren(...items.map((it, i) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.i = i; b.textContent = it.label; const sm = document.createElement('small'); sm.textContent = it.desc; b.append(sm); return b; }));
        tabsEl.replaceChildren(...items.filter((it) => it.box).map((it) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.i = items.indexOf(it); b.textContent = it.label; return b; }));
        if (st.dataset.cfg === 'detail' && items[cur] && items[cur].box && items[cur].box.classList.contains('cfg-on')) tabsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.i === cur));
        else { mode('menu'); point(window.matchMedia('(hover: hover)').matches ? 0 : -1); if (!info.textContent && items[0]) info.textContent = '選一項來調整'; }
      };
      list.addEventListener('pointerover', (e) => { const b = e.target.closest('button'); if (b) point(+b.dataset.i); });
      list.addEventListener('focusin', (e) => { const b = e.target.closest('button'); if (b) point(+b.dataset.i); });
      list.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { const i = +b.dataset.i; if (items[i] && items[i].box) vt('fwd', () => openAt(i)); else openAt(i); } });
      tabsEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && +b.dataset.i !== cur) vt('tab', () => openAt(+b.dataset.i)); });
      // inside a category the page's own back button returns to the list first
      st.addEventListener('click', (e) => { if (st.dataset.cfg === 'detail' && back && e.target.closest('.back') === back) { e.stopImmediatePropagation(); e.preventDefault(); vt('back', () => { st.querySelectorAll('.box.cfg-on').forEach((b) => b.classList.remove('cfg-on')); build(); }); } }, true);
      const sync = () => { root.classList.toggle('deep-cfg', !st.hidden); if (!st.hidden) { st.dataset.cfg = 'menu'; st.querySelectorAll('.box.cfg-on').forEach((b) => b.classList.remove('cfg-on')); build(); } };
      new MutationObserver(sync).observe(st, { attributes: true, attributeFilter: ['hidden'] });
      [...st.children].filter((b) => b.classList.contains('box')).forEach((b) => new MutationObserver(() => { if (!st.hidden) build(); }).observe(b, { attributes: true, attributeFilter: ['hidden'] }));
      new MutationObserver(() => { if (!st.hidden) build(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      sync();
    }

    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const still = { get matches() { return off; } };
    const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    let W = 0, H = 0, ripples = [], shards = [], bubbles = [], last = 0, raf = 0, grad = null;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);       // a background does not need full resolution
      W = window.innerWidth; H = window.innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, css('--w1')); grad.addColorStop(0.16, css('--w2')); grad.addColorStop(0.5, css('--w3')); grad.addColorStop(1, css('--w4'));
      // light broken up by the waves: flat streaks, dense and bright near the surface
      ripples = Array.from({ length: Math.round(Math.max(18, W / 26)) }, () => { const d = Math.pow(Math.random(), 1.7); return { x: rnd(-0.2, 1.2) * W, y: d * H * 0.5, rx: rnd(30, 150) * (1 - d * 0.5), ry: rnd(2, 7), v: rnd(6, 22) * (Math.random() < 0.5 ? -1 : 1), ph: rnd(0, 6.3), a: rnd(0.25, 0.7) * (1 - d) }; });
      shards = Array.from({ length: 9 }, (_, i) => ({ x: rnd(0, W), y: rnd(0, H), s: rnd(6, 18), r: rnd(0, 6.3), vr: rnd(-0.8, 0.8), vx: rnd(-10, 10), vy: rnd(6, 20), c: i % 3 }));
      bubbles = Array.from({ length: 8 }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(2, 9), v: rnd(14, 34), ph: rnd(0, 6.3) }));
    };
    const draw = (dt, t) => {
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      for (const p of ripples) {
        p.x += p.v * dt; if (p.x > W + 200) p.x = -200; if (p.x < -200) p.x = W + 200;
        const wob = 0.75 + 0.25 * Math.sin(t * 1.3 + p.ph);
        ctx.fillStyle = `rgba(255,255,255,${p.a * wob})`;
        ctx.beginPath(); ctx.ellipse(p.x, p.y + Math.sin(t * 0.7 + p.ph) * 4, p.rx * wob, p.ry, 0, 0, 6.3); ctx.fill();
      }
      const cols = [css('--hot'), '#ffffff', css('--cyan')];
      for (const s of shards) {
        s.x += s.vx * dt; s.y += s.vy * dt; s.r += s.vr * dt; if (s.y > H + 30) { s.y = -30; s.x = rnd(0, W); }
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.r); ctx.globalAlpha = 0.75; ctx.fillStyle = cols[s.c];
        ctx.beginPath(); ctx.moveTo(-s.s, -s.s * 0.3); ctx.lineTo(s.s, -s.s * 0.6); ctx.lineTo(s.s * 0.2, s.s * 0.7); ctx.closePath(); ctx.fill(); ctx.restore();
      }
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,.55)';
      for (const b of bubbles) {
        b.y -= b.v * dt; if (b.y < -20) { b.y = H + 20; b.x = rnd(0, W); }
        ctx.beginPath(); ctx.arc(b.x + Math.sin(t * 0.8 + b.ph) * 8, b.y, b.r, 0, 6.3); ctx.stroke();
      }
    };
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return;                                   // ~30 fps is plenty and easier on a phone battery
      const dt = Math.min(0.1, (now - last) / 1000); last = now; draw(dt, now / 1000);
    };
    const run = () => { cancelAnimationFrame(raf); raf = 0; if (still.matches || document.hidden) { draw(0, 0); return; } last = performance.now(); raf = requestAnimationFrame(frame); };
    size(); run(); onMotion = run;
    window.addEventListener('resize', () => { size(); run(); });
    document.addEventListener('visibilitychange', run);
    if (dark.addEventListener) dark.addEventListener('change', () => { size(); run(); });
  } catch (e) { /* decoration only */ }
})();
