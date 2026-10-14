/* Drill engine shared by the Poker Lab dashboard and the phone app.
   Pure logic plus HTML snippets; no page wiring. Data comes from pokerlab.py (charts),
   make_drills.py (equity questions) and the misplay list, passed to DrillEngine.init(). */
const DrillEngine = (function () {
  const RK = 'AKQJT98765432';
  const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const cellName = (r, c) => r === c ? RK[r] + RK[c] : r < c ? RK[r] + RK[c] + 's' : RK[c] + RK[r] + 'o';
  const ALL = []; for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) ALL.push(cellName(r, c));
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const combos = n => n.length === 2 ? 6 : n[2] === 's' ? 4 : 12;
  const ACT = { rfi: { raise: 'Raise', call: 'Call', fold: 'Fold', limp: 'Limp' }, vsopen: { raise: '3-bet', call: 'Call', fold: 'Fold' }, vs3bet: { raise: '4-bet', call: 'Call', fold: 'Fold' }, iso: { raise: 'Raise', call: 'Overlimp', fold: 'Fold' } };
  const COL = { raise: 'var(--raise)', call: 'var(--call)', fold: 'var(--fold)' };
  const MODES = { open: 'Open or fold', vsopen: 'Facing an open', vs3bet: 'Facing a 3-bet', iso: 'Isolate limpers', potodds: 'Pot odds', equity: 'Draw equity', mine: 'My misplays' };
  const MODE_INFO = {
    open: 'Folded to you: raise or fold from every seat.',
    vsopen: 'Someone opens: 3-bet, call or fold.',
    vs3bet: 'You opened and got 3-bet: 4-bet, call or fold.',
    iso: 'Limpers in front: raise, and how big?',
    potodds: 'How much equity does a call need?',
    equity: 'Your draw against a shown hand: how often do you win?',
    mine: 'The exact hands you misplayed at the tables.',
  };
  const MODE_KIND = { open: 'rfi', vsopen: 'vsopen', vs3bet: 'vs3bet', iso: 'iso' };
  let CH = {}, CHS = {}, EQ = [], MINE = [];
  const EDGE = {};

  function init(data) {
    CH = data.charts; EQ = (data.equity || []); MINE = (data.misplays || []).filter(m => CH[m.spot]);
    CHS = Object.fromEntries(Object.entries(CH).map(([k, c]) => [k, Object.fromEntries(Object.entries(c.sets).map(([l, hs]) => [l, new Set(hs)]))]));
  }
  const wantOf = (spot, cls) => { for (const [l, s] of Object.entries(CHS[spot])) if (s.has(cls)) return l; return CH[spot].kind === 'iso' ? 'fold/call' : 'fold'; };
  const shown = w => w === 'fold/call' ? 'fold' : w;
  const cellStyle = w => { const p = shown(w).split('/'); return p.length === 1 ? `background:${COL[p[0]]}` : `background:linear-gradient(135deg, ${COL[p[0]]} 50%, ${COL[p[1]]} 50%)`; };
  const words = (kind, w) => w.split('/').map(a => ACT[kind][a] || a).join(' or ');
  const spots = kind => Object.keys(CH).filter(k => CH[k].kind === kind);
  const spotTitle = k => { const c = CH[k]; return c.kind === 'rfi' ? `Open from ${c.hero}` : c.kind === 'vsopen' ? `${c.hero} vs ${c.opp} open` : k === 'vs 3-bet OOP' ? 'Facing a 3-bet, out of position' : k === 'vs 3-bet IP' ? 'Facing a 3-bet, in position' : k === 'ISO late' ? 'Limpers, from CO or button' : 'Limpers, from MP or the blinds'; };
  const spotShort = k => spotTitle(k).replace('Open from ', '').replace('Facing a 3-bet, ', '').replace('Limpers, from ', '');
  function gridHTML(spot, hi, miss) {
    let h = '';
    for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) {
      const n = cellName(r, c), w = wantOf(spot, n), sw = shown(w);
      const fg = sw === 'fold' ? '' : sw.includes('fold') ? 'color:var(--ink)' : 'color:#fff';
      h += `<div class="cell${n === hi ? ' hi' : ''}${miss && miss.has(n) ? ' miss' : ''}" style="${cellStyle(w)};${fg}" title="${n}: ${words(CH[spot].kind, w)}">${n.slice(0, 2)}</div>`;
    }
    return h;
  }
  function rangeParts(spot) {
    const kind = CH[spot].kind;
    const parts = Object.entries(CHS[spot]).filter(([, s]) => s.size).map(([l, s]) => [l, [...s].reduce((a, n) => a + combos(n), 0)]);
    return { kind, parts, total: parts.reduce((a, p) => a + p[1], 0) };
  }
  const RKi = r => RK.indexOf(r);
  const lower = n => n.length === 2 ? (RKi(n[0]) < 12 ? RK[RKi(n[0]) + 1].repeat(2) : null) : (RKi(n[1]) < 12 ? n[0] + RK[RKi(n[1]) + 1] + n[2] : null);
  const upper = n => n.length === 2 ? (RKi(n[0]) > 0 ? RK[RKi(n[0]) - 1].repeat(2) : null) : (RKi(n[1]) - 1 > RKi(n[0]) ? n[0] + RK[RKi(n[1]) - 1] + n[2] : null);
  function edges(spot) {
    if (EDGE[spot]) return EDGE[spot];
    return EDGE[spot] = ALL.filter(h => { const w = wantOf(spot, h); if (w.includes('/') && w !== 'fold/call') return true; return [lower(h), upper(h)].some(x => x && wantOf(spot, x) !== w); });
  }
  function dealSuits(h) { const Su = ['s', 'h', 'd', 'c'], pick = () => rnd(Su); const a = pick(); if (h.length === 3 && h[2] === 's') return [[h[0], a], [h[1], a]]; let b; do { b = pick(); } while (b === a); return [[h[0], a], [h[1], b]]; }
  const lcFirst = t => /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
  const pctf = x => (100 * x).toFixed(1) + '%';

  /* A question carries: kind, text, opts [[key, label]], and a table description for seat diagrams. */
  function preflopQ(spot, hand, extra) {
    const c = CH[spot], kind = c.kind;
    hand = hand || (Math.random() < .5 ? rnd(edges(spot)) : rnd(ALL));
    const w = wantOf(spot, hand), q = { spot, kind, hand, cards: dealSuits(hand), want: w, table: {} };
    if (kind === 'rfi') { q.text = `Folded to you in the ${c.hero}. 100bb deep.`; q.opts = [['raise', 'Raise'], ['fold', 'Fold']]; q.table = { hero: c.hero }; }
    if (kind === 'vsopen') { q.text = `The ${c.opp} opens to 2.5bb and it folds to you in the ${c.hero}.`; q.opts = c.hero === 'SB' ? [['raise', '3-bet'], ['fold', 'Fold']] : [['raise', '3-bet'], ['call', 'Call'], ['fold', 'Fold']]; q.table = { hero: c.hero, raise: { [c.opp]: '2.5bb' } }; }
    if (kind === 'vs3bet') {
      if (spot === 'vs 3-bet OOP') {
        const op = (extra && extra.pos) || rnd(['UTG', 'MP', 'CO']);
        const tb = op === 'SB' ? 'BB' : rnd(['MP', 'CO', 'BTN'].slice(['UTG', 'MP', 'CO'].indexOf(op)));
        q.text = op === 'SB' ? 'You open to 3bb from the small blind. The big blind 3-bets to 10bb.' : `You open to 2.5bb from ${op}. The ${tb} 3-bets to 8bb and the blinds fold.`;
        q.table = { hero: op, raise: { [op]: op === 'SB' ? '3bb' : '2.5bb', [tb]: op === 'SB' ? '10bb' : '8bb' } };
      } else {
        const op = (extra && extra.pos) || rnd(['CO', 'BTN']), tb = rnd(['SB', 'BB']);
        q.text = `You open to 2.5bb from ${op}. The ${tb} 3-bets to 10bb; everyone else folds.`;
        q.table = { hero: op, raise: { [op]: '2.5bb', [tb]: '10bb' } };
      }
      q.opts = [['raise', '4-bet'], ['call', 'Call'], ['fold', 'Fold']];
    }
    if (kind === 'iso') {
      const hero = (extra && extra.pos) || (spot === 'ISO late' ? rnd(['CO', 'BTN']) : rnd(['MP', 'BB']));
      const before = { MP: ['UTG'], CO: ['UTG', 'MP'], BTN: ['UTG', 'MP', 'CO'], BB: ['UTG', 'MP', 'CO', 'BTN'] }[hero] || ['UTG'];
      const L = Math.min(hero === 'BB' ? 3 : before.length, rnd([1, 1, 1, 1, 2, 2, 3]));
      const limpers = before.slice(0, L);
      const target = 5 + (L - 1) + (hero === 'BB' ? 1 : 0);
      q.text = `${L} player${L > 1 ? 's limp' : ' limps'} for 1bb${hero === 'BB' ? ' and the small blind folds. You are in the big blind.' : `. It is your turn in the ${hero}.`}`;
      q.iso = { L, target, hero };
      q.table = { hero, limp: limpers };
      const sizes = [target - 2, target - 1, target, target + 1, target + 2].filter(s => s >= 3);
      q.opts = [['call', hero === 'BB' ? 'Check' : 'Fold or limp'], ...sizes.map(s => ['raise' + s, `Raise ${s}bb`])];
    }
    return q;
  }
  function judgePreflop(q, a) {
    const allowed = q.want.split('/');
    if (q.kind === 'iso') {
      const passiveOk = allowed.includes('call') || allowed.includes('fold');
      if (a === 'call') return { ok: passiveOk };
      if (!allowed.includes('raise')) return { ok: false };
      return { ok: +a.slice(5) === q.iso.target, sizeWrong: +a.slice(5) !== q.iso.target };
    }
    return { ok: allowed.includes(a) };
  }
  function reasonPreflop(q, res) {
    const w = q.want;
    let line = `<strong>${q.hand}</strong>, ${lcFirst(spotTitle(q.spot))}: the chart says <strong>${words(q.kind, w).toLowerCase()}</strong>.`;
    if (w.includes('/') && w !== 'fold/call') line += ' Mixed hand: either answer is correct.';
    if (q.kind === 'iso') {
      if (w.includes('raise')) line += ` Size: 5bb + ${q.iso.L - 1}bb for extra limpers${q.iso.hero === 'BB' ? ' + 1bb from the blinds' : ''} = <strong>${q.iso.target}bb</strong>.`;
      if (res.sizeWrong) line += ' Right hand to raise, wrong size.';
    }
    return line;
  }
  function potQ() {
    const pot = rnd([4, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80]), frac = rnd([.25, .33, .5, .66, .75, 1, 1.25, 1.5, 2]);
    const bet = Math.max(1, Math.round(pot * frac * 2) / 2), need = bet / (pot + 2 * bet);
    const q = { kind: 'math', mode: 'potodds', pot, bet, need, frac };
    if (Math.random() < .5) {
      const cand = [need, bet / (pot + bet), bet / pot, need + .08, need - .07].filter(v => v > .03 && v < .97);
      const uniq = []; cand.forEach(v => { if (uniq.every(u => Math.abs(u - v) > .03)) uniq.push(v); });
      q.text = `The pot is ${pot}bb. Villain bets ${bet}bb. What equity do you need to call?`;
      q.opts = uniq.slice(0, 4).sort((a, b) => a - b).map(v => [v === need ? 'right' : 'w' + v.toFixed(3), pctf(v)]);
      q.correct = 'right';
    } else {
      let e; do { e = Math.round((need + (Math.random() * .3 - .15)) * 100) / 100; } while (Math.abs(e - need) < .02 || e <= .02);
      q.eq = e;
      q.text = `The pot is ${pot}bb. Villain bets ${bet}bb. Your hand wins ${Math.round(e * 100)}% of the time. Call or fold?`;
      q.opts = [['call', 'Call'], ['fold', 'Fold']]; q.correct = e >= need ? 'call' : 'fold';
    }
    q.missKey = `bet ${Math.round(frac * 100)}% pot`;
    return q;
  }
  function explainPot(q) {
    return `<p>You call <strong>${q.bet}bb</strong> to win ${q.pot} + ${q.bet} = ${q.pot + q.bet}bb. Needed equity = ${q.bet} ÷ (${q.pot} + ${q.bet} + ${q.bet}) = <strong>${pctf(q.need)}</strong>.${q.eq != null ? ` You have ${Math.round(q.eq * 100)}%, so <strong>${q.correct}</strong>.` : ''}</p>
      <p class="muted">Memorize: ¼ pot 17% · ⅓ pot 20% · ½ pot 25% · ⅔ pot 28.5% · ¾ pot 30% · pot 33% · 1.5× pot 37.5% · 2× pot 40%.</p>`;
  }
  function equityQ() {
    const e = rnd(EQ), v = e.eq;
    const cands = [v, v + 9, v - 9, v + 17, v - 17, v + 25].filter(x => x >= 2 && x <= 95);
    const opts = [v, ...cands.slice(1).sort(() => Math.random() - .5).slice(0, 3)].sort((a, b) => a - b);
    return { kind: 'math', mode: 'equity', e, cards: e.hero.map(c => [c[0], c[1]]), board: e.board.map(c => [c[0], c[1]]), vil: e.vil.map(c => [c[0], c[1]]),
      text: `${e.street === 'flop' ? 'Flop' : 'Turn'}. Your hand: ${e.label}. Villain shows ${e.vil.map(c => c[0] + SUIT[c[1]]).join(' ')} (${e.vil_hand}). How often do you win by the river?`,
      opts: opts.map(x => [x === v ? 'right' : 'w' + x, '≈ ' + Math.round(x) + '%']), correct: 'right', missKey: e.label };
  }
  function explainEquity(q) {
    const e = q.e, mult = e.street === 'flop' ? 4 : 2;
    return `<p>Exact equity, every runout counted: <strong>${e.eq}%</strong>.</p><p>Cards that put you ahead on the ${e.street === 'flop' ? 'turn' : 'river'}: <strong>${e.outs}</strong>. Rule of ${mult}: ${e.outs} × ${mult} = ${e.rule}%${e.street === 'flop' && e.outs > 8 ? ' (with more than 8 outs the rule overestimates; subtract the outs above 8)' : ''}.</p>
      <p class="muted">On the flop, multiply outs by 4 when you will see both cards; by 2 for one card. Outs that also help the villain are worth less.</p>`;
  }
  function question(mode, focusSpot) {
    if (mode === 'potodds') return potQ();
    if (mode === 'equity') return equityQ();
    if (mode === 'mine') { if (!MINE.length) return null; const d = rnd(MINE); const q = preflopQ(d.spot, d.cls, { pos: d.pos }); q.fromTable = d; return q; }
    const list = spots(MODE_KIND[mode]);
    return preflopQ(focusSpot && CH[focusSpot] ? focusSpot : rnd(list));
  }
  /* Returns { ok, missKey, reason (html, preflop only), explain (html) } */
  function grade(q, a) {
    if (q.kind === 'math') return { ok: a === q.correct, missKey: q.missKey, explain: q.mode === 'potodds' ? explainPot(q) : explainEquity(q) };
    const res = judgePreflop(q, a);
    return { ok: res.ok, missKey: `${q.spot}: ${q.hand}`, reason: reasonPreflop(q, res), note: CH[q.spot].note, spot: q.spot };
  }
  return { init, RK, SUIT, ALL, MODES, MODE_INFO, MODE_KIND, cellName, combos, rnd, wantOf, cellStyle, words, spots, spotTitle, spotShort, gridHTML, rangeParts,
    preflopQ, judgePreflop, potQ, equityQ, question, grade, get charts() { return CH; }, get misplays() { return MINE; } };
})();
if (typeof module !== 'undefined') module.exports = DrillEngine;
