/* Poker Drills app: screens, storage and touch flow. Drill logic is in drill_engine.js. */
(function () {
  const D = window.DRILL_DATA, E = DrillEngine;
  E.init(D);
  const $ = id => document.getElementById(id);
  const SEATS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  const PRE = ['open', 'vsopen', 'vs3bet', 'iso'], MATH = ['potodds', 'equity'];

  /* storage */
  const KEY = 'pd.v1';
  let st;
  try { st = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { st = {}; }
  st.modes = st.modes || {}; st.days = st.days || {}; st.goal = st.goal || 50; st.focus = st.focus || {};
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const M = m => st.modes[m] || (st.modes[m] = { ok: 0, n: 0, best: 0, miss: {} });
  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => st.days[dayKey(new Date())] || { n: 0, ok: 0 };
  function streakDays() {
    let s = 0; const d = new Date();
    if ((st.days[dayKey(d)] || { n: 0 }).n < st.goal) d.setDate(d.getDate() - 1);
    while ((st.days[dayKey(d)] || { n: 0 }).n >= st.goal) { s++; d.setDate(d.getDate() - 1); }
    return s;
  }
  const pct = (o, n) => n ? Math.round(100 * o / n) + '%' : '–';

  /* router */
  const screens = { home: $('s-home'), drill: $('s-drill'), charts: $('s-charts'), stats: $('s-stats') };
  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [name, arg] = h.split('/');
    closeSheet(true);
    Object.values(screens).forEach(s => s.hidden = true);
    const tab = name === 'charts' ? 'charts' : name === 'stats' ? 'stats' : 'home';
    document.querySelectorAll('.tabbar a').forEach(a => a.setAttribute('aria-current', a.dataset.t === tab ? 'page' : 'false'));
    $('tabbar').classList.toggle('hide', name === 'drill');
    if (name === 'drill' && E.MODES[arg]) { screens.drill.hidden = false; startDrill(arg); }
    else if (name === 'charts') { screens.charts.hidden = false; renderCharts(); }
    else if (name === 'stats') { screens.stats.hidden = false; renderStats(); }
    else { screens.home.hidden = false; renderHome(); }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* HOME */
  function ring(n, goal) {
    const r = 36, c = 2 * Math.PI * r, f = Math.min(1, n / goal);
    return `<svg class="ring" viewBox="0 0 88 88" aria-label="${n} of ${goal} today"><circle cx="44" cy="44" r="${r}" fill="none" stroke="#2a3832" stroke-width="9"/>
      ${f > 0 ? `<circle cx="44" cy="44" r="${r}" fill="none" stroke="${f >= 1 ? '#e8b64c' : '#3fb27f'}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c * f} ${c}" transform="rotate(-90 44 44)"/>` : ''}
      <text x="44" y="49" text-anchor="middle" font-size="17">${n}</text></svg>`;
  }
  function card(m, wide) {
    const s = M(m), acc = s.n ? s.ok / s.n : 0;
    const extra = m === 'mine' ? `<span class="badge">${E.misplays.length} hands</span>` : '';
    return `<button class="dcard${wide ? ' wide' : ''}${m === 'mine' ? ' hot' : ''}" type="button" data-m="${m}">
      <div class="name">${E.MODES[m]} ${extra}</div><div class="info">${E.MODE_INFO[m]}</div>
      <div class="bar"><i style="width:${Math.round(acc * 100)}%"></i></div>
      <div class="meta"><span>${s.n ? pct(s.ok, s.n) + ' correct' : 'Not started'}</span><span>${s.n || ''}</span></div></button>`;
  }
  function renderHome() {
    const t = today(), sd = streakDays();
    $('today').innerHTML = `${ring(t.n, st.goal)}<div><div class="big">${t.n >= st.goal ? 'Daily goal done.' : `${st.goal - t.n} to go today`}</div>
      <div class="row"><span>Goal <b>${st.goal}</b></span><span>Today <b>${pct(t.ok, t.n)}</b></span><span>Streak <b>${sd}</b> day${sd === 1 ? '' : 's'}</span></div></div>`;
    $('drills-pre').innerHTML = PRE.map(m => card(m)).join('');
    $('drills-math').innerHTML = MATH.map(m => card(m)).join('');
    $('drills-mine').innerHTML = card('mine', true);
    document.querySelectorAll('.dcard').forEach(b => b.onclick = () => { location.hash = '#/drill/' + b.dataset.m; });
    renderInstall();
  }

  /* install prompts */
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; if (!screens.home.hidden) renderInstall(); });
  function renderInstall() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const el = $('install');
    if (standalone) { el.hidden = true; return; }
    if (deferred) {
      el.innerHTML = '<div><b>Install the app</b><br>Works offline, opens full screen.</div><button class="pill gold" id="i-go" type="button">Install</button>';
      el.hidden = false;
      $('i-go').onclick = async () => { deferred.prompt(); await deferred.userChoice; deferred = null; el.hidden = true; };
    } else if (ios) {
      el.innerHTML = '<div><b>Install on iPhone</b><br>In Safari, tap the Share button, then <b>Add to Home Screen</b>.</div>';
      el.hidden = false;
    } else el.hidden = true;
  }

  /* DRILL */
  let mode = null, Q = null, answered = false, sess = { ok: 0, n: 0, streak: 0 };
  function startDrill(m) {
    if (mode !== m) sess = { ok: 0, n: 0, streak: 0 };
    mode = m;
    $('d-title').textContent = E.MODES[m];
    renderFocus();
    nextQ();
  }
  function renderFocus() {
    const kind = E.MODE_KIND[mode], el = $('d-focus');
    if (!kind) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    const f = st.focus[mode] || '';
    el.innerHTML = `<button class="chip" type="button" data-f="" aria-pressed="${!f}">All spots</button>` + E.spots(kind).map(s => `<button class="chip" type="button" data-f="${s}" aria-pressed="${f === s}">${E.spotShort(s)}</button>`).join('');
    el.querySelectorAll('.chip').forEach(b => b.onclick = () => { st.focus[mode] = b.dataset.f || null; save(); renderFocus(); nextQ(); });
  }
  function score() {
    $('d-score').innerHTML = `<b>${sess.ok}/${sess.n}</b><br>streak ${sess.streak}`;
  }
  const pcard = ([r, s], sm) => `<div class="pcard ${s}${sm ? ' sm' : ''}"><span>${r === 'T' ? '10' : r}<span class="su">${E.SUIT[s]}</span></span></div>`;
  function seatsHTML(t) {
    if (!t || !t.hero) return '';
    const hi = SEATS.indexOf(t.hero);
    return SEATS.map((s, i) => {
      let cls = '', sub = '';
      if (s === t.hero) { cls = 'hero'; sub = 'you'; }
      if (t.raise && t.raise[s] && s !== t.hero) { cls = 'raise'; sub = t.raise[s]; }
      if (t.raise && t.raise[s] && s === t.hero) sub = 'you ' + t.raise[s];
      if (t.limp && t.limp.includes(s)) { cls = 'limp'; sub = 'limp'; }
      if (!cls && i < hi) cls = 'out';
      return `<div class="seat ${cls}">${s}<small>${sub || '&nbsp;'}</small></div>`;
    }).join('');
  }
  function nextQ() {
    answered = false;
    closeSheet(true);
    Q = E.question(mode, st.focus[mode]);
    const A = $('d-answers');
    if (!Q) { $('d-text').textContent = 'No misplays recorded yet. Play a session and rebuild the app.'; $('d-cards').innerHTML = ''; $('d-board').innerHTML = ''; $('d-seats').innerHTML = ''; A.innerHTML = ''; return; }
    $('d-seats').innerHTML = seatsHTML(Q.table);
    $('d-seats').hidden = !Q.table;
    $('d-text').textContent = Q.text;
    $('d-cards').innerHTML = (Q.cards || []).map(c => pcard(c)).join('');
    $('d-board').innerHTML = Q.board ? Q.board.map(c => pcard(c, true)).join('') : '';
    const n = Q.opts.length;
    A.className = 'answers ' + (Q.kind === 'iso' ? 'c5' : n === 2 ? 'c2' : n === 3 ? 'c3' : 'c2');
    A.innerHTML = Q.opts.map(([k, l], i) => {
      let c = k.startsWith('raise') ? (Q.kind === 'iso' ? 'size' : 'raise') : k === 'call' ? (Q.kind === 'iso' ? 'fold full' : 'call') : k === 'fold' ? 'fold' : 'opt';
      if (Q.kind === 'iso' && k.startsWith('raise')) l = l.replace('Raise ', '');
      return `<button class="ans ${c}" type="button" data-a="${k}">${l}</button>`;
    }).join('');
    A.querySelectorAll('.ans').forEach(b => b.onclick = () => answer(b.dataset.a, b));
    score();
  }
  function correctKeys() {
    if (Q.kind === 'math') return [Q.correct];
    const allowed = Q.want.split('/');
    if (Q.kind === 'iso') return Q.opts.map(o => o[0]).filter(k => k === 'call' ? (allowed.includes('call') || allowed.includes('fold')) : (allowed.includes('raise') && +k.slice(5) === Q.iso.target));
    return Q.opts.map(o => o[0]).filter(k => allowed.includes(k));
  }
  function answer(a, btn) {
    if (answered || !Q) return; answered = true;
    const g = E.grade(Q, a), s = M(mode), dk = dayKey(new Date()), day = st.days[dk] || (st.days[dk] = { n: 0, ok: 0 });
    sess.n++; s.n++; day.n++;
    if (g.ok) { sess.ok++; s.ok++; day.ok++; sess.streak++; s.best = Math.max(s.best, sess.streak); }
    else { sess.streak = 0; s.miss[g.missKey] = (s.miss[g.missKey] || 0) + 1; if (navigator.vibrate) navigator.vibrate(40); }
    save(); score();
    const good = correctKeys();
    document.querySelectorAll('#d-answers .ans').forEach(b => { const k = b.dataset.a; if (good.includes(k)) b.classList.add('right'); else if (b === btn) b.classList.add('wrong'); else b.classList.add('dim'); });
    $('r-verdict').className = 'verdict ' + (g.ok ? 'ok' : 'no');
    $('r-verdict').textContent = g.ok ? 'Correct' : 'Not quite';
    if (g.spot) {
      $('r-reason').innerHTML = `<p>${g.reason}</p>`;
      $('r-grid').innerHTML = E.gridHTML(g.spot, Q.hand); $('r-grid').hidden = false;
      $('r-note').textContent = g.note + (Q.fromTable ? ' This hand came from your own tables.' : '');
    } else {
      $('r-reason').innerHTML = g.explain; $('r-grid').hidden = true; $('r-grid').innerHTML = ''; $('r-note').textContent = '';
    }
    setTimeout(openSheet, g.ok ? 250 : 450);
  }
  function openSheet() { if (!answered) return; $('scrim').hidden = false; $('sheet').hidden = false; $('r-next').focus({ preventScroll: true }); }
  function closeSheet(silent) { $('scrim').hidden = true; $('sheet').hidden = true; }
  $('r-next').onclick = nextQ;
  $('scrim').onclick = () => { closeSheet(); };
  $('d-back').onclick = () => { location.hash = '#/'; };
  // swipe the sheet down to peek at the table, tap Next to continue
  let y0 = null;
  $('sheet').addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
  $('sheet').addEventListener('touchend', e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 80 && $('sheet').scrollTop === 0) closeSheet(); y0 = null; }, { passive: true });
  // tapping the answer area after closing the sheet reopens it
  $('d-answers').addEventListener('click', () => { if (answered && $('sheet').hidden) openSheet(); });

  /* CHARTS */
  const KINDS = { rfi: 'Open', vsopen: 'Facing an open', vs3bet: 'Facing a 3-bet', iso: 'Limpers' };
  let cspot = st.cspot && E.charts[st.cspot] ? st.cspot : 'SB vs BTN';
  function renderCharts() {
    const kind = E.charts[cspot].kind;
    $('c-kind').innerHTML = Object.entries(KINDS).map(([k, l]) => `<button class="chip" type="button" data-k="${k}" aria-pressed="${k === kind}">${l}</button>`).join('');
    $('c-kind').querySelectorAll('.chip').forEach(b => b.onclick = () => { cspot = E.spots(b.dataset.k)[0]; st.cspot = cspot; save(); renderCharts(); });
    $('c-spot').innerHTML = E.spots(kind).map(s => `<button class="chip" type="button" data-s="${s}" aria-pressed="${s === cspot}">${E.spotShort(s)}</button>`).join('');
    $('c-spot').querySelectorAll('.chip').forEach(b => b.onclick = () => { cspot = b.dataset.s; st.cspot = cspot; save(); renderCharts(); });
    $('c-grid').innerHTML = E.gridHTML(cspot);
    const { parts, total } = E.rangeParts(cspot);
    $('c-legend').innerHTML = [...parts.map(p => p[0]), 'fold'].filter((v, i, a) => a.indexOf(v) === i).map(l => `<span><i style="${E.cellStyle(l)}"></i>${E.words(kind, l)}</span>`).join('');
    $('c-pct').innerHTML = `<b>${(100 * total / 1326).toFixed(1)}%</b> of hands played · ` + parts.map(([l, n]) => `${E.words(kind, l)} ${(100 * n / 1326).toFixed(1)}%`).join(' · ');
    $('c-note').textContent = E.charts[cspot].note;
  }

  /* STATS */
  function renderStats() {
    const d = new Date(); d.setDate(d.getDate() - 13);
    const cols = [], labels = [];
    let max = st.goal;
    const vals = [];
    for (let i = 0; i < 14; i++) { const k = dayKey(d); vals.push((st.days[k] || { n: 0 }).n); labels.push(`${d.getDate()}/${d.getMonth() + 1}`); d.setDate(d.getDate() + 1); }
    max = Math.max(max, ...vals);
    $('t-days').innerHTML = `<b>Last 14 days</b> <span class="muted">· goal ${st.goal}/day · streak ${streakDays()}</span><div class="cols">${vals.map(v => `<i class="${v ? '' : 'zero'}" style="height:${Math.max(4, 100 * v / max)}%" title="${v}"></i>`).join('')}</div><div class="lbl"><span>${labels[0]}</span><span>today</span></div>`;
    $('t-modes').innerHTML = Object.keys(E.MODES).map(m => {
      const s = M(m), mm = Object.entries(s.miss).sort((a, b) => b[1] - a[1]).slice(0, 6);
      return `<div class="mrow"><div class="h"><b>${E.MODES[m]}</b><span>${s.n ? `${pct(s.ok, s.n)} of ${s.n} · best ${s.best}` : 'not started'}</span></div>
        <div class="bar"><i style="width:${s.n ? Math.round(100 * s.ok / s.n) : 0}%"></i></div>
        ${mm.length ? `<div class="miss">${mm.map(([k, v]) => `<span>${k} ×${v}</span>`).join('')}</div>` : ''}</div>`;
    }).join('');
    $('t-goal').innerHTML = [25, 50, 100, 150].map(g => `<button class="chip" type="button" data-g="${g}" aria-pressed="${g === st.goal}">${g} a day</button>`).join('');
    $('t-goal').querySelectorAll('.chip').forEach(b => b.onclick = () => { st.goal = +b.dataset.g; save(); renderStats(); });
    $('t-build').textContent = `Charts and misplays from ${D.built}. ${E.misplays.length} misplayed hands, ${D.equity.length} equity spots.`;
  }
  $('t-reset').onclick = () => { $('t-confirm').hidden = false; };
  $('t-no').onclick = () => { $('t-confirm').hidden = true; };
  $('t-yes').onclick = () => { st = { modes: {}, days: {}, goal: st.goal, focus: {} }; save(); $('t-confirm').hidden = true; renderStats(); };

  /* keyboard (desktop use) */
  document.addEventListener('keydown', e => {
    if (screens.drill.hidden || !Q) return;
    if (answered && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); nextQ(); return; }
    if (!answered && /^[1-9]$/.test(e.key) && Q.opts[+e.key - 1]) answer(Q.opts[+e.key - 1][0], document.querySelectorAll('#d-answers .ans')[+e.key - 1]);
  });

  /* offline + updates */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      const offer = w => { const t = $('toast'); t.textContent = 'New charts available. Tap to update.'; t.hidden = false; t.onclick = () => w.postMessage('skip'); };
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); }); });
    }).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }
  route();
})();
