// Candlestick handbook: cheat sheet, pattern pages with real examples from the chart, two practice quizzes,
// the floating cheat-sheet panel on the Trading Chart, and the popup when a highlighted pattern is clicked.
const Handbook = (() => {
  const P = Patterns;
  const $ = (id) => document.getElementById(id);
  const load = (k, def) => { try { return { ...def, ...JSON.parse(localStorage.getItem(k) || '{}') }; } catch { return def; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  const BIAS_TXT = { bull: 'Bullish', bear: 'Bearish', neutral: 'Neutral' };
  const N_TXT = { 1: 'single candle', 2: 'two candles', 3: 'three candles', 4: 'four candles', 5: 'five candles' };
  // Confirmation status chip, e.g. "✓ Confirmed".
  const stClass = (s) => (s === 'ok' || s === 'built' ? 'ok' : s === 'fail' ? 'fail' : s === 'up' || s === 'down' ? 'ok' : 'wait');
  const STAR_TIP = 'One of the strongest candlestick patterns in Thomas Bulkowski tests on stock data. In the PaperPerps BTC/ETH tests, market context (grade A/B/C) mattered more';
  const topBadge = (p) => (p.top ? `<span class="hb-top-badge" title="${STAR_TIP}">&#9733; Strongest</span>` : p.topAt ? `<span class="hb-top-badge soft" title="${STAR_TIP}, when it forms at support or resistance">&#9733; at support/resistance</span>` : '');
  const stChip = (cf) => `<span class="hb-st ${stClass(cf.s)}" title="${P.STATUS[cf.s].tip}">${P.STATUS[cf.s].icon} ${P.STATUS[cf.s].label}</span>`;
  function confirmText(p) {
    if (p.group === 'confirm') return 'Already confirmed: its last candle IS the confirmation, so it is marked confirmed as soon as it finishes.';
    const n = P.CONFIRM_BARS;
    if (p.bias === 'bull') return `Confirmed when one of the next ${n} candles closes ABOVE the high of the pattern\'s last candle. Failed if price closes below the pattern\'s low first. If neither happens in ${n} candles: no follow-through.`;
    if (p.bias === 'bear') return `Confirmed when one of the next ${n} candles closes BELOW the low of the pattern\'s last candle. Failed if price closes above the pattern\'s high first. If neither happens in ${n} candles: no follow-through.`;
    return `Neutral patterns resolve when one of the next ${n} candles closes above their high (broke up) or below their low (broke down).`;
  }

  let d = null; // helpers from app.js
  let prefs = load('pp.patterns', { on: false, off: [], noisy: false, bias: { bull: true, bear: true, neutral: true }, pos: null, collapsed: false });
  let quiz = load('pp.quiz', { stats: {}, best: 0, realBest: 0 });
  let view = 'sheet', selId = 'hammer';
  let q = null, qScore = { right: 0, total: 0, streak: 0 }, qGroup = 'all';
  let rq = null, rScore = { right: 0, total: 0, streak: 0 };

  const savePrefs = () => {
    prefs.off = [...P.state.off];
    prefs.noisy = P.state.noisy;
    prefs.onlyConfirmed = P.state.onlyConfirmed;
    prefs.onlyTop = P.state.onlyTop;
    prefs.bias = { ...P.state.bias };
    store('pp.patterns', prefs);
  };
  const isOpen = () => !$('handbook').hidden;
  const strength = (n) => `<span class="hb-str" title="Reliability">${'&#9679;'.repeat(n)}${'<i>&#9679;</i>'.repeat(3 - n)}</span>`;
  const badge = (b) => `<span class="hb-bias ${b}">${BIAS_TXT[b]}</span>`;
  const colors = () => (d ? d.colors() : { up: '#0ecb81', down: '#f6465d' });
  const pat = (id, opts) => P.svgPattern(id, { ...colors(), ...opts });

  function init(deps) {
    d = deps;
    P.state.off = new Set(prefs.off);
    P.state.noisy = !!prefs.noisy;
    P.state.onlyConfirmed = !!prefs.onlyConfirmed;
    P.state.onlyTop = !!prefs.onlyTop;
    P.state.bias = { bull: true, bear: true, neutral: true, ...prefs.bias };
    buildOverlay();
    buildPanel();
    buildPopup();
    P.setOnVisible(onVisible);
    setChartOn(prefs.on, true);
  }

  // ================= handbook overlay =================
  function buildOverlay() {
    const el = document.createElement('div');
    el.id = 'handbook';
    el.hidden = true;
    el.innerHTML = `<div class="hb-top">
        <h2>&#128214; Candlestick Handbook</h2>
        <div class="hb-tabs" id="hbTabs">
          <button data-v="sheet">Cheat sheet</button>
          <button data-v="learn">Learn the patterns</button>
          <button data-v="practice">Practice: name it</button>
          <button data-v="real">Practice: real charts</button>
          <button data-v="structure">Structure &amp; context</button>
        </div>
        <div class="spacer"></div>
        <button class="btn-ghost" id="hbChart"></button>
        <button class="btn-ghost" id="hbClose" title="Close (Esc)">&#10005; Close</button>
      </div>
      <div class="hb-body" id="hbBody"></div>`;
    document.body.appendChild(el);
    $('hbTabs').onclick = (e) => { const v = e.target.dataset.v; if (v) show(v); };
    $('hbClose').onclick = close;
    $('hbChart').onclick = () => { setChartOn(!prefs.on); syncChartBtn(); };
    $('hbBody').addEventListener('click', onBodyClick);
    document.addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' && ((view === 'practice' && q?.answered) || (view === 'real' && rq?.answered))) { e.preventDefault(); view === 'practice' ? nextQ() : nextReal(); }
      if (/^[1-4]$/.test(e.key) && !e.target.closest('input,textarea')) {
        const b = document.querySelectorAll('#hbBody .hb-opt')[+e.key - 1];
        if (b && !b.disabled) b.click();
      }
    });
  }
  const syncChartBtn = () => { $('hbChart').innerHTML = prefs.on ? '&#10003; Highlighting on chart' : 'Highlight patterns on chart'; $('hbChart').classList.toggle('on', prefs.on); };

  function open(v, id) {
    if (id) selId = id;
    d.closeOthers?.();
    $('handbook').hidden = false;
    document.body.classList.add('handbook-open');
    syncChartBtn();
    show(v || view);
  }
  function close() {
    $('handbook').hidden = true;
    document.body.classList.remove('handbook-open');
  }
  const toggle = () => (isOpen() ? close() : open());

  function show(v) {
    view = v;
    document.querySelectorAll('#hbTabs button').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
    const body = $('hbBody');
    body.scrollTop = 0;
    if (v === 'sheet') body.innerHTML = sheetHtml();
    else if (v === 'learn') body.innerHTML = learnHtml();
    else if (v === 'practice') { if (!q) newQ(); body.innerHTML = practiceHtml(); }
    else if (v === 'real') { if (!rq) newReal(); body.innerHTML = realHtml(); }
    else if (v === 'structure') body.innerHTML = structureHtml();
  }

  function onBodyClick(e) {
    const t = e.target.closest('[data-act], [data-pid]');
    if (!t) return;
    if (t.dataset.pid && !t.dataset.act) { selId = t.dataset.pid; show('learn'); return; }
    const act = t.dataset.act;
    if (act === 'answer') answerQ(t.dataset.id);
    else if (act === 'next') nextQ();
    else if (act === 'group') { qGroup = t.dataset.g; newQ(); show('practice'); }
    else if (act === 'ranswer') answerReal(t.dataset.id);
    else if (act === 'rnext') nextReal();
    else if (act === 'solo') { solo(t.dataset.id); close(); }
    else if (act === 'goto') { setChartOn(true); d.scrollTo(+t.dataset.ts); close(); }
    else if (act === 'chartOn') { setChartOn(true); syncChartBtn(); close(); }
  }

  // ---------- cheat sheet ----------
  function anatomySvg() {
    const c = colors();
    const one = (x, col, bull) => {
      const top = 70, bot = 170, hi = 30, lo = 205;
      const [oy, cy] = bull ? [bot, top] : [top, bot];
      return `<line x1="${x}" x2="${x}" y1="${hi}" y2="${lo}" stroke="${col}" stroke-width="3"/>
        <rect x="${x - 22}" y="${top}" width="44" height="${bot - top}" rx="3" fill="${col}"/>
        <g class="an-l">
          <text x="${x - 40}" y="${hi + 4}" text-anchor="end">High</text><line x1="${x - 36}" x2="${x - 6}" y1="${hi}" y2="${hi}"/>
          <text x="${x - 40}" y="${cy + 4}" text-anchor="end">${bull ? 'Close' : 'Open'}</text><line x1="${x - 36}" x2="${x - 24}" y1="${cy}" y2="${cy}"/>
          <text x="${x - 40}" y="${oy + 4}" text-anchor="end">${bull ? 'Open' : 'Close'}</text><line x1="${x - 36}" x2="${x - 24}" y1="${oy}" y2="${oy}"/>
          <text x="${x - 40}" y="${lo + 4}" text-anchor="end">Low</text><line x1="${x - 36}" x2="${x - 6}" y1="${lo}" y2="${lo}"/>
          <text x="${x + 40}" y="${(hi + top) / 2 + 4}">Upper wick</text><line x1="${x + 6}" x2="${x + 36}" y1="${(hi + top) / 2}" y2="${(hi + top) / 2}"/>
          <text x="${x + 40}" y="${(top + bot) / 2 + 4}">Real body</text><line x1="${x + 24}" x2="${x + 36}" y1="${(top + bot) / 2}" y2="${(top + bot) / 2}"/>
          <text x="${x + 40}" y="${(bot + lo) / 2 + 4}">Lower wick</text><line x1="${x + 6}" x2="${x + 36}" y1="${(bot + lo) / 2}" y2="${(bot + lo) / 2}"/>
        </g>
        <text x="${x}" y="228" text-anchor="middle" class="an-t" fill="${col}">${bull ? 'Bullish (green): closed UP' : 'Bearish (red): closed DOWN'}</text>`;
    };
    return `<svg class="hb-anatomy" viewBox="0 0 560 240" xmlns="http://www.w3.org/2000/svg">${one(140, c.up, true)}${one(420, c.down, false)}</svg>`;
  }
  const card = (id) => { const p = P.BY_ID[id]; return `<button class="hb-card ${p.bias}${p.top ? ' top' : ''}" data-pid="${id}" title="${p.name}: click to learn${p.top ? ' (one of the strongest)' : p.topAt ? ' (strongest at support/resistance)' : ''}">${p.top || p.topAt ? `<i class="hb-card-star${p.topAt ? ' soft' : ''}">&#9733;</i>` : ''}${pat(id, { w: 120, h: 84, maxBody: 13 })}<span>${p.name}</span></button>`; };
  function sheetHtml() {
    const ids = (g, b) => P.DEFS.filter((p) => p.group === g && (!b || p.bias === b)).map((p) => p.id);
    const row = (g, title) => `<div class="hb-sec-title">${title}</div>
      <div class="hb-split"><div class="hb-grid">${ids(g, 'bull').map(card).join('')}</div><div class="hb-grid">${ids(g, 'bear').map(card).join('')}</div></div>`;
    return `<div class="hb-sheet">
      <div class="hb-intro">
        <div class="hb-anat-wrap"><div class="hb-sec-title">Candlestick anatomy</div>${anatomySvg()}</div>
        <div class="hb-basics">
          <h3>How to read a candle</h3>
          <ul>
            <li><b>One candle = one slice of time.</b> On the 15m chart each candle is 15 minutes; on 1d it is a whole day.</li>
            <li><b>Green</b> = price closed higher than it opened. <b>Red</b> = it closed lower.</li>
            <li>The <b>body</b> is open-to-close. The thin <b>wicks</b> show the highest and lowest prices reached.</li>
            <li><b>Big body</b> = one side pushed hard. <b>Small body</b> = indecision. <b>Long wick</b> = price went there and got rejected.</li>
          </ul>
          <h3>Before you trust a pattern</h3>
          <ul>
            <li><b>Context matters most.</b> A hammer after a drop, at a support level, means far more than a hammer in the middle of nowhere.</li>
            <li><b>Wait for confirmation:</b> the next candle should move the way the pattern suggests.</li>
            <li><b>Bigger timeframes are more reliable.</b> Patterns on 1h, 4h and 1d matter more than on 1m.</li>
            <li>Patterns are <b>hints, not guarantees</b>. Always know where your stop goes.</li>
          </ul>
          <h3>Confirmation marks on the chart</h3>
          <ul class="hb-legend">
            <li><span class="hb-top-badge">&#9733; Strongest</span> the best-performing patterns in real-data tests (engulfing only at support/resistance)</li>
            <li><span class="hb-st ok">&#10003; Confirmed</span> a candle after it closed past the pattern in its direction</li>
            <li><span class="hb-st wait">&#8230; Waiting</span> not enough candles after it yet</li>
            <li><span class="hb-st wait">&#8211; No follow-through</span> nothing happened within ${P.CONFIRM_BARS} candles</li>
            <li><span class="hb-st fail">&#10007; Failed</span> price broke the other way first</li>
          </ul>
          <p class="muted">Faded candles in each drawing show the trend the pattern needs to appear in. Click any pattern to learn it.</p>
          <button class="primary-btn" data-act="chartOn">Highlight these patterns on my chart</button>
        </div>
      </div>
      <div class="hb-sec-title">Neutral: indecision</div>
      <div class="hb-grid center">${ids('neutral').map(card).join('')}</div>
      <div class="hb-split head"><h3 class="up">Bullish patterns <small>(price may go UP)</small></h3><h3 class="down">Bearish patterns <small>(price may go DOWN)</small></h3></div>
      ${row('single', 'Single candlestick patterns')}
      ${row('double', 'Double candlestick patterns')}
      ${row('triple', 'Triple candlestick patterns')}
      ${row('continuation', 'Continuation patterns (the trend keeps going)')}
      ${row('confirm', 'Confirmation patterns (confirmation built in)')}
    </div>`;
  }


  // ---------- market structure & context (with the BTC/ETH research) ----------
  function structSvg() {
    const pts = [[20, 170], [70, 120], [100, 140], [150, 80], [180, 105], [235, 40], [265, 70], [300, 55], [330, 120], [360, 100], [400, 160]];
    const lab = [[70, 120, 'HH?', 0], [100, 140, 'HL', 1], [150, 80, 'HH', 0], [180, 105, 'HL', 1], [235, 40, 'HH', 0], [265, 70, 'HL', 1], [300, 55, 'LH', 0], [360, 100, 'LH', 0]];
    const poly = pts.map((p) => p.join(',')).join(' ');
    return `<svg viewBox="0 0 430 200" class="hb-diag" xmlns="http://www.w3.org/2000/svg">
      <polyline points="${poly}" fill="none" stroke="#8a94a6" stroke-width="2"/>
      <line x1="150" y1="80" x2="205" y2="80" stroke="#0ecb81" stroke-dasharray="6 3"/><text x="178" y="74" class="dg g">BOS</text>
      <line x1="265" y1="70" x2="318" y2="70" stroke="#f6465d" stroke-dasharray="2 2"/><text x="324" y="74" class="dg r" style="text-anchor:start">CHoCH</text>
      ${lab.slice(1).map(([x, y, t, low]) => `<text x="${x}" y="${low ? y + 16 : y - 8}" class="dg ${t === 'HH' || t === 'HL' ? 'g' : 'r'}">${t}</text>`).join('')}
    </svg>`;
  }
  const tbl = (head, rows) => `<table class="hb-tbl"><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
  const good = (t) => `<b class="up">${t}</b>`, bad = (t) => `<b class="down">${t}</b>`;
  function structureHtml() {
    return `<div class="hb-sheet hb-struct">
      <div class="hb-intro">
        <div>
          <h2>Market structure &amp; context</h2>
          <p><b>Patterns only matter in the right context.</b> A bearish candle pattern in a strong uptrend is usually just a pause. The <b>&#128200; Market structure</b> button on the chart shows the context and grades every pattern.</p>
          <h3>1. Market context: daily &amp; weekly 12/25 EMA bands</h3>
          <ul>
            <li><b class="up">Uptrend</b>: 12 EMA above 25 EMA, price above the bands, no cross for 10+ days. The bands act as support.</li>
            <li><b class="down">Downtrend</b>: 12 below 25, price below the bands. They act as resistance from underneath.</li>
            <li><b style="color:var(--yellow)">Range</b>: the bands crossed recently. The <b>first bearish cross after an uptrend</b> (or bullish cross after a downtrend) usually starts a sideways, rotational market. Price chopping around the bands means the same.</li>
            <li>Weekly bands give the bigger picture. When daily and weekly agree, the trend is strong.</li>
          </ul>
          <h3>2. Market structure</h3>
          <ul>
            <li><b>Swing points:</b> a swing high is a peak with lower highs on both sides; a swing low the opposite.</li>
            <li><b class="up">HH + HL</b> (higher highs, higher lows) = uptrend. <b class="down">LH + LL</b> = downtrend.</li>
            <li><b>BOS</b> (break of structure) = a close beyond the last swing in the trend's direction: the trend continues.</li>
            <li><b>CHoCH</b> (change of character) = the first close beyond a swing AGAINST the trend: a possible trend change. On your chart picture, the "Break of Structure" after the lower high is a CHoCH.</li>
            <li><b>Ranges</b>: sideways boxes. Called <b>Accumulation</b> when they break up, <b>Distribution</b> when they break down.</li>
          </ul>
        </div>
        <div>${structSvg()}
          <h3>3. Grades on every candle pattern</h3>
          <ul>
            <li><span class="pp-grade gA"><b>A</b></span> with the daily trend AND the structure: the setups to focus on.</li>
            <li><span class="pp-grade gB"><b>B</b></span> mixed: range, or trend and structure disagree.</li>
            <li><span class="pp-grade gC"><b>C</b></span> against the daily trend or structure: hidden by default.</li>
          </ul>
          <h3>4. Chart patterns</h3>
          <ul>
            <li><b>Double top / bottom</b>: two peaks (or troughs) at about the same price. Confirmed only when a candle CLOSES through the neckline (the dip between them). Target = the pattern's height, projected from the neckline.</li>
            <li><b>Head &amp; shoulders</b>: three peaks, the middle one highest. Confirmed on a close through the neckline. Inverse = upside-down version (bullish).</li>
            <li><b>Staircase / elevator</b>: a slow, orderly trend of small steps (staircase), and the fast move that often ends it (elevator).</li>
          </ul>
        </div>
      </div>

      <div class="hb-sec-title">What the research found: BTC &amp; ETH, 2016 to now, 1h and 4h</div>
      <p class="muted">Every rule was tested candle by candle without hindsight on Coinbase BTC-USD and ETH-USD history (about 90,000 hourly candles per coin), and checked on both halves of the history. "ATR" = an average candle's size.</p>
      <div class="hb-split">
        <div>
          <h3>Candle patterns by grade</h3>
          ${tbl(['', 'Went the right way', 'Avg move after 1 day'], [
            ['BTC 1h  A', '53.5%', good('+0.47 ATR')], ['BTC 1h  C', '50.8%', bad('-0.25 ATR')],
            ['BTC 4h  A', '53.0%', good('+0.17 ATR')], ['BTC 4h  C', '50.6%', bad('-0.14 ATR')],
            ['ETH 1h  A', '51.9%', good('+0.39 ATR')], ['ETH 1h  C', '51.4%', bad('-0.24 ATR')],
            ['ETH 4h  A', '55.3%', good('+0.23 ATR')], ['ETH 4h  C', '50.9%', bad('-0.10 ATR')],
          ])}
          <p>Candle patterns alone are close to a coin flip in crypto. <b>Context is what separates them:</b> grade A patterns made money on average, grade C lost it. With the daily trend, patterns also confirmed more often (57-59% vs 50% against). Note: the starred "strongest" patterns did <b>not</b> beat the others in these crypto tests; context mattered much more.</p>
          <h3>Breaks of structure</h3>
          ${tbl(['', 'Right way after 1 day', 'Avg move'], [
            ['BTC 1h BOS with trend', '52.9%', good('+0.83 ATR')], ['BTC 1h BOS against trend', '42.3%', bad('-0.25 ATR')],
            ['ETH 4h BOS with trend', '58.8%', good('+0.65 ATR')], ['ETH 1h BOS against trend', '42.9%', bad('-0.19 ATR')],
          ])}
          <p>A BOS in the direction of the daily trend follows through; against it, it usually fails. A CHoCH on its own is about 50/50: wait for a BOS in the new direction to confirm the trend change.</p>
        </div>
        <div>
          <h3>Double tops / bottoms and head &amp; shoulders</h3>
          ${tbl(['After the neckline break', 'Hit target first', 'Expectancy'], [
            ['Double bottom BTC 1h / 4h', '66% / 76%', good('+0.09R / +0.17R')], ['Double bottom ETH 1h / 4h', '64% / 74%', good('+0.08R / +0.26R')],
            ['Double top BTC 1h / 4h', '69% / 71%', good('+0.11R / +0.14R')], ['Double top ETH 1h / 4h', '68% / 74%', good('+0.11R / +0.20R')],
            ['Head &amp; shoulders (all)', '39-53%', bad('-0.25R to +0.04R')], ['Inverse H&amp;S (all)', '55-60%', good('+0.09R to +0.16R')],
          ])}
          <p class="muted small">Stop above the top (below the bottom), target = pattern height. Expectancy = average result per trade in units of risk (R).</p>
          <p><b>Double tops/bottoms are the most dependable structure patterns</b>, especially on 4h. Bearish head &amp; shoulders did not work in crypto on its own (only with the daily downtrend); the inverse (bullish) version did a bit better.</p>
          <h3>Ranges and staircases</h3>
          <ul>
            <li>Range breakouts <b>with</b> the daily trend reached a full range-height move 52-63% of the time; <b>against</b> it only 42-48%.</li>
            <li><b>Staircase up &rarr; elevator down</b> is real: after an orderly staircase up, a fast drop of half the move followed <b>25%</b> of the time, <b>twice</b> the normal rate (12%), and those drops ran 3-5x faster than the climb.</li>
            <li><b>Staircase down &rarr; elevator up</b> was not supported (10% vs 12% normal): staircases down usually fade slowly or keep going.</li>
            <li>Staircases up were 2-3x more common than staircases down. In crypto, rises are orderly and falls are fast.</li>
            <li>Use a staircase up as a <b>warning</b> (tighten stops, take profit), not as a short signal: shorting the first break only won about half the time.</li>
          </ul>
          <h3>Market context itself</h3>
          <p>On 4h candles, BTC moved up the next day 54.8% of the time in a daily uptrend (+0.26 ATR on average) and was flat in a downtrend and in ranges. ETH was similar (+0.22 ATR up, -0.10 ATR down).</p>
        </div>
      </div>
    </div>`;
  }

  // ---------- pattern pages ----------
  function examples(id) {
    const list = d.list();
    if (!list.length) return { found: [], total: 0 };
    const res = P.detect(list), found = [];
    res.forEach((ms, i) => { const m = ms.find((x) => x.id === id); if (m) found.push({ start: m.start, end: i }); });
    return { found, list };
  }
  function snippet(list, m, after, w = 170, h = 96) {
    const from = Math.max(0, m.start - 8), to = Math.min(list.length - 1, m.end + after);
    const bars = list.slice(from, to + 1).map((k) => ({ o: k.open, h: k.high, l: k.low, c: k.close }));
    return P.svgCandles(bars, { ...colors(), w, h, pad: 6, box: [m.start - from, m.end - from], boxColor: P.BIAS_COLOR[P.BY_ID[m.id || selId]?.bias] || '#5b8cff', divider: after ? m.end - from + 1 : null, maxBody: 9, wick: 1 });
  }
  // Did price move the way the pattern suggests, `ahead` candles later?
  function outcome(list, m, bias, ahead = 5) {
    const k = list[m.end + ahead];
    if (!k) return null;
    const ch = (k.close - list[m.end].close) / list[m.end].close;
    return { ch, ok: bias === 'bull' ? ch > 0 : bias === 'bear' ? ch < 0 : null };
  }
  function learnHtml() {
    const p = P.BY_ID[selId];
    const nav = P.GROUPS.map(([g, t]) => `<div class="hb-nav-h">${t}</div>` + P.DEFS.filter((x) => x.group === g).map((x) =>
      `<button class="hb-nav-i${x.id === selId ? ' sel' : ''}" data-pid="${x.id}"><i class="dot ${x.bias}"></i>${x.name}</button>`).join('')).join('');
    const ex = examples(selId), found = ex.found;
    const done = found.map((m) => outcome(ex.list, m, p.bias)).filter((o) => o && o.ok !== null);
    const wins = done.filter((o) => o.ok).length;
    const cfs = found.map((m) => ({ m, cf: P.confirmOf(ex.list, { ...m, id: selId }) }));
    const settled = cfs.filter((x) => x.cf.s !== 'wait'), conf = cfs.filter((x) => P.isConfirmed(x.cf.s)), failed = cfs.filter((x) => x.cf.s === 'fail');
    const after = conf.map((x) => outcome(ex.list, { ...x.m, end: x.cf.at }, p.bias)).filter((o) => o && o.ok !== null), afterWins = after.filter((o) => o.ok).length;
    const recent = found.slice(-6).reverse();
    const st = quiz.stats[selId];
    const real = !found.length ? `<p class="muted">Not found in the ${d.coin()} ${d.interval()} candles loaded right now. Try another timeframe or coin, or scroll the chart back to load more history.</p>`
      : `<p>Found <b>${found.length}</b> time${found.length > 1 ? 's' : ''} in the ${d.coin()} ${d.interval()} candles loaded right now.${done.length && p.bias !== 'neutral' ? ` Five candles later price had moved the ${p.bias === 'bull' ? 'up' : 'down'} way <b>${wins} of ${done.length}</b> times (${Math.round((wins / done.length) * 100)}%).` : ''}</p>
         ${settled.length ? `<p>Confirmation: <b class="up">${conf.length} confirmed</b>, <b class="down">${failed.length} failed</b>, ${settled.length - conf.length - failed.length} no follow-through${cfs.length > settled.length ? `, ${cfs.length - settled.length} still waiting` : ''}.${after.length && p.bias !== 'neutral' ? ` After confirming, price kept going the right way 5 candles later <b>${afterWins} of ${after.length}</b> times (${Math.round((afterWins / after.length) * 100)}%).` : ''}</p>` : ''}
         <div class="hb-ex">${recent.map((m) => { const o = outcome(ex.list, m, p.bias); return `<button class="hb-ex-i" data-act="goto" data-ts="${ex.list[m.end].timestamp}" title="Show this one on the chart">${snippet(ex.list, { ...m, id: selId }, 5)}${stChip(P.confirmOf(ex.list, { ...m, id: selId }))}<span>${d.when(ex.list[m.end].timestamp)}${o && o.ok !== null ? ` <b class="${o.ok ? 'up' : 'down'}">${o.ok ? '&#10003;' : '&#10007;'} ${(o.ch * 100).toFixed(2)}%</b>` : ''}</span></button>`; }).join('')}</div>
         <p class="muted small">Box = the pattern. Dashed line = where it finished; the candles after it show what happened next. Click one to jump to it on the chart.</p>`;
    return `<div class="hb-learn">
      <nav class="hb-nav">${nav}</nav>
      <article class="hb-page">
        <div class="hb-p-head"><h2>${p.name}</h2>${badge(p.bias)}${topBadge(p)}<span class="muted">${N_TXT[p.n]}</span>${strength(p.strength)}
          ${st ? `<span class="muted small">Quiz: ${st.right}/${st.right + st.wrong} right</span>` : ''}</div>
        <div class="hb-p-top">
          <div class="hb-p-draw">${pat(selId, { w: 300, h: 200, maxBody: 26, wick: 2 })}<span class="muted small">${p.ctx ? `Faded candles: the ${p.ctx === 'down' ? 'downtrend' : 'uptrend'} it needs to appear in` : 'Can appear anywhere'}</span></div>
          <div class="hb-p-text">
            <h4>What it looks like</h4><p>${p.looks}</p>
            <h4>What it means</h4><p>${p.means}</p>
            <h4>How traders use it</h4><p>${p.trade}</p>
            <h4>How PaperPerps spots it</h4><p class="muted">${p.rule}</p>
            ${p.top ? `<h4>&#9733; Why it is starred</h4><p class="muted">${STAR_TIP}. Still not a sure thing: wait for confirmation and use a stop.</p>` : ''}
            ${p.topAt ? `<h4>&#9733; When it is starred</h4><p class="muted">Engulfing patterns are among the strongest signals when they form at support or resistance. PaperPerps stars one when its low (bullish) or high (bearish) is at the lowest low / highest high of the previous ${P.LOOKBACK} candles.</p>` : ''}
            <h4>How it gets confirmed</h4><p class="muted">${confirmText(p)}</p>
            <div class="hb-p-btns"><button class="primary-btn" data-act="solo" data-id="${selId}">Show only ${p.name} on my chart</button></div>
          </div>
        </div>
        <h3>On your chart right now</h3>
        ${real}
      </article>
    </div>`;
  }

  // ---------- practice: name the drawn pattern ----------
  const QGROUPS = [['all', 'All'], ['single', 'Single'], ['double', 'Two candles'], ['triple', 'Three+ candles'], ['continuation', 'Continuation'], ['neutral', 'Neutral']];
  function pool() {
    return P.DEFS.filter((p) => qGroup === 'all' || p.group === qGroup || (qGroup === 'triple' && p.group === 'confirm'));
  }
  function weighted(list) {
    // Patterns you get wrong come up more often.
    const w = list.map((p) => { const s = quiz.stats[p.id] || { right: 0, wrong: 0 }; return Math.max(0.3, 1 + s.wrong * 1.5 - s.right * 0.4); });
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }
  function choices(correct, avoid) {
    const p = P.BY_ID[correct];
    const near = P.DEFS.filter((x) => x.id !== correct && (x.n === p.n || x.group === p.group) && !avoid?.includes(x.id));
    const rest = P.DEFS.filter((x) => x.id !== correct && !near.includes(x));
    const pickN = (arr, n) => arr.sort(() => Math.random() - 0.5).slice(0, n);
    const opts = [...pickN(near, 3)];
    if (opts.length < 3) opts.push(...pickN(rest, 3 - opts.length));
    return [...opts.map((x) => x.id), correct].sort(() => Math.random() - 0.5);
  }
  function newQ() {
    const list = pool();
    let p = weighted(list);
    if (q && list.length > 1) for (let t = 0; t < 5 && p.id === q.id; t++) p = weighted(list);
    q = { id: p.id, opts: choices(p.id), svg: pat(p.id, { w: 340, h: 220, jitter: 6, maxBody: 30, wick: 2 }), answered: null };
  }
  function answerQ(id) {
    if (!q || q.answered) return;
    q.answered = id;
    const ok = id === q.id, s = quiz.stats[q.id] || { right: 0, wrong: 0 };
    ok ? s.right++ : s.wrong++;
    quiz.stats[q.id] = s;
    qScore.total++;
    if (ok) { qScore.right++; qScore.streak++; } else qScore.streak = 0;
    quiz.best = Math.max(quiz.best || 0, qScore.streak);
    store('pp.quiz', quiz);
    show('practice');
  }
  const nextQ = () => { newQ(); show('practice'); };
  function practiceHtml() {
    const p = P.BY_ID[q.id], a = q.answered;
    const weak = P.DEFS.map((x) => ({ x, s: quiz.stats[x.id] })).filter((o) => o.s && o.s.wrong > 0).sort((m, n) => (n.s.wrong - n.s.right) - (m.s.wrong - m.s.right)).slice(0, 4);
    const learned = P.DEFS.filter((x) => (quiz.stats[x.id]?.right || 0) >= 3 && (quiz.stats[x.id]?.right || 0) > 2 * (quiz.stats[x.id]?.wrong || 0)).length;
    return `<div class="hb-quiz">
      <div class="hb-q-bar">
        <div class="seg hb-q-groups">${QGROUPS.map(([g, t]) => `<button data-act="group" data-g="${g}" class="${g === qGroup ? 'active' : ''}">${t}</button>`).join('')}</div>
        <div class="hb-q-score">Score <b>${qScore.right}/${qScore.total}</b> &middot; Streak <b>${qScore.streak}</b> &middot; Best <b>${quiz.best || 0}</b> &middot; Learned <b>${learned}/${P.DEFS.length}</b></div>
      </div>
      <div class="hb-q-main">
        <div class="hb-q-card">
          <div class="hb-q-ask">Which pattern is this?</div>
          <div class="hb-q-svg">${q.svg}</div>
          <div class="muted small">Faded candles show the trend before it. Keys 1-4 answer, Enter = next.</div>
        </div>
        <div class="hb-q-side">
          <div class="hb-opts">${q.opts.map((id, i) => `<button class="hb-opt${a ? (id === q.id ? ' right' : id === a ? ' wrong' : '') : ''}" data-act="answer" data-id="${id}" ${a ? 'disabled' : ''}><kbd>${i + 1}</kbd>${P.BY_ID[id].name}</button>`).join('')}</div>
          ${a ? `<div class="hb-q-res ${a === q.id ? 'ok' : 'bad'}">
              <h3>${a === q.id ? '&#10003; Correct!' : `&#10007; It's a ${p.name}`}</h3>
              <div class="hb-q-res-h">${badge(p.bias)}${strength(p.strength)}</div>
              <p><b>Looks like:</b> ${p.looks}</p>
              <p><b>Means:</b> ${p.means}</p>
              ${a !== q.id ? `<p class="muted">You picked <b>${P.BY_ID[a].name}</b>: ${P.BY_ID[a].looks}</p>` : ''}
              <div class="hb-p-btns"><button class="primary-btn" data-act="next">Next &#9654;</button><button class="btn-ghost" data-pid="${p.id}">Open ${p.name} page</button></div>
            </div>` : ''}
          ${weak.length ? `<div class="hb-weak"><span class="muted">Needs work:</span> ${weak.map((o) => `<button class="hb-chip" data-pid="${o.x.id}">${o.x.name} <small>${o.s.right}/${o.s.right + o.s.wrong}</small></button>`).join('')}</div>` : ''}
        </div>
      </div>
    </div>`;
  }

  // ---------- practice: real candles from the loaded chart ----------
  const AFTER = 6;
  function newReal() {
    const list = d.list();
    const res = list.length ? P.detect(list) : [];
    const cands = [];
    res.forEach((ms, i) => {
      if (i > list.length - 1 - AFTER) return;
      const m = ms.find((x) => P.state.noisy || !P.BY_ID[x.id].noisy);
      if (m && m.start >= 10) cands.push({ ...m, end: i });
    });
    if (!cands.length) { rq = { empty: true }; return; }
    // Prefer rarer patterns so it is not all hammers and dojis.
    const freq = {};
    for (const c of cands) freq[c.id] = (freq[c.id] || 0) + 1;
    const ids = Object.keys(freq), id = ids[Math.floor(Math.random() * ids.length)];
    const ofId = cands.filter((c) => c.id === id), m = ofId[Math.floor(Math.random() * ofId.length)];
    rq = { m, list, coin: d.coin(), interval: d.interval(), opts: choices(m.id), answered: null };
  }
  function answerReal(id) {
    if (!rq || rq.answered) return;
    rq.answered = id;
    const ok = id === rq.m.id;
    rScore.total++;
    if (ok) { rScore.right++; rScore.streak++; } else rScore.streak = 0;
    quiz.realBest = Math.max(quiz.realBest || 0, rScore.streak);
    store('pp.quiz', quiz);
    show('real');
  }
  const nextReal = () => { newReal(); show('real'); };
  function realHtml() {
    if (rq.empty) return `<div class="hb-quiz"><p class="hb-empty">No clear patterns in the candles loaded right now. Switch to another coin or timeframe on the Trading Chart, then come back.<br><br><button class="primary-btn" data-act="rnext">Try again</button></p></div>`;
    const { m, list, answered: a } = rq, p = P.BY_ID[m.id];
    const o = outcome(list, m, p.bias, AFTER);
    const ts = list[m.end].timestamp;
    return `<div class="hb-quiz">
      <div class="hb-q-bar">
        <div class="muted">Real ${rq.coin} ${rq.interval} candles from your chart. Which pattern is in the box?</div>
        <div class="hb-q-score">Score <b>${rScore.right}/${rScore.total}</b> &middot; Streak <b>${rScore.streak}</b> &middot; Best <b>${quiz.realBest || 0}</b></div>
      </div>
      <div class="hb-q-main">
        <div class="hb-q-card">
          <div class="hb-q-svg">${snippet(list, m, a ? AFTER : 0, 420, 250)}</div>
          <div class="muted small">${a ? 'Right of the dashed line: what happened next.' : 'Keys 1-4 answer.'}</div>
        </div>
        <div class="hb-q-side">
          <div class="hb-opts">${rq.opts.map((id, i) => `<button class="hb-opt${a ? (id === m.id ? ' right' : id === a ? ' wrong' : '') : ''}" data-act="ranswer" data-id="${id}" ${a ? 'disabled' : ''}><kbd>${i + 1}</kbd>${P.BY_ID[id].name}</button>`).join('')}</div>
          ${a ? `<div class="hb-q-res ${a === m.id ? 'ok' : 'bad'}">
              <h3>${a === m.id ? '&#10003; Correct!' : `&#10007; It's a ${p.name}`}</h3>
              <div class="hb-q-res-h">${badge(p.bias)}<span class="muted small">${d.when(ts)}</span></div>
              <p>${p.means}</p>
              <p>${stChip(P.confirmOf(list, m))} <span class="muted small">${P.STATUS[P.confirmOf(list, m).s].tip}</span></p>
              ${o && p.bias !== 'neutral' ? `<p><b>What happened:</b> ${AFTER} candles later price was <b class="${o.ch >= 0 ? 'up' : 'down'}">${o.ch >= 0 ? '+' : ''}${(o.ch * 100).toFixed(2)}%</b>, so this one ${o.ok ? '<b class="up">worked</b>' : '<b class="down">failed</b>'}. ${o.ok ? '' : 'Patterns fail often; that is why traders wait for confirmation and use stops.'}</p>` : ''}
              <div class="hb-p-btns"><button class="primary-btn" data-act="rnext">Next &#9654;</button><button class="btn-ghost" data-act="goto" data-ts="${ts}">See it on the chart</button><button class="btn-ghost" data-pid="${p.id}">Learn ${p.name}</button></div>
            </div>` : ''}
        </div>
      </div>
    </div>`;
  }

  // ================= chart highlighting + floating cheat sheet =================
  function setChartOn(on, initial) {
    prefs.on = !!on;
    store('pp.patterns', prefs);
    d.setOn(prefs.on);
    $('cheatPanel').hidden = !prefs.on;
    $('patBtn')?.classList.toggle('active', prefs.on);
    if (!initial && on) d.toast('Candle patterns highlighted. Click a tag on the chart to learn it.');
  }
  // Show one pattern only (from a handbook page).
  function solo(id) {
    P.state.off = new Set(P.DEFS.filter((p) => p.id !== id).map((p) => p.id));
    const p = P.BY_ID[id];
    P.state.bias[p.bias] = true;
    if (p.noisy) P.state.noisy = true;
    savePrefs();
    setChartOn(true);
    renderPanel();
    d.redraw();
    d.toast(`Showing only ${p.name}. Use "Show all" in the patterns panel to bring the rest back.`);
  }

  function buildPanel() {
    const el = document.createElement('div');
    el.id = 'cheatPanel';
    el.className = 'cheat-panel pro-only';
    el.hidden = true;
    el.innerHTML = `<div class="cp-head" id="cpHead"><b>Candle patterns</b><span class="cp-sub" id="cpSub"></span>
        <button id="cpMin" title="Collapse">&#8211;</button><button id="cpX" title="Turn pattern highlighting off">&#10005;</button></div>
      <div class="cp-body" id="cpBody">
        <div class="cp-filters" id="cpFilters"></div>
        <div class="cp-list" id="cpList"></div>
        <div class="cp-legend" title="Confirmation status, shown at the end of each tag">&#10003; confirmed &middot; &#8230; waiting &middot; &#8211; no follow-through &middot; &#10007; failed</div>
        <div class="cp-foot"><button id="cpAll">Show all</button><button id="cpBook">&#128214; Handbook</button></div>
      </div>`;
    document.querySelector('.chart-body').appendChild(el);
    if (prefs.pos) { el.style.left = prefs.pos.x + 'px'; el.style.top = prefs.pos.y + 'px'; el.style.right = 'auto'; }
    el.classList.toggle('min', !!prefs.collapsed);
    $('cpMin').onclick = () => { prefs.collapsed = !prefs.collapsed; el.classList.toggle('min', prefs.collapsed); store('pp.patterns', prefs); };
    $('cpX').onclick = () => setChartOn(false);
    $('cpBook').onclick = () => open('sheet');
    $('cpAll').onclick = () => { P.state.off.clear(); P.state.bias = { bull: true, bear: true, neutral: true }; savePrefs(); renderPanel(); d.redraw(); };
    $('cpFilters').onclick = (e) => {
      const b = e.target.closest('[data-b]');
      if (b) { P.state.bias[b.dataset.b] = !P.state.bias[b.dataset.b]; savePrefs(); renderPanel(); d.redraw(); }
    };
    $('cpFilters').onchange = (e) => {
      if (e.target.id === 'cpNoisy') P.state.noisy = e.target.checked;
      else if (e.target.id === 'cpConf') P.state.onlyConfirmed = e.target.checked;
      else if (e.target.id === 'cpTop') P.state.onlyTop = e.target.checked;
      else return;
      savePrefs(); renderPanel(); d.redraw();
    };
    $('cpList').onclick = (e) => {
      const info = e.target.closest('.cp-info');
      const row = e.target.closest('.cp-row');
      if (!row) return;
      if (info) { open('learn', row.dataset.id); return; }
      const id = row.dataset.id;
      P.state.off.has(id) ? P.state.off.delete(id) : P.state.off.add(id);
      savePrefs(); renderPanel(); d.redraw();
    };
    $('cpList').onmouseover = (e) => { const row = e.target.closest('.cp-row'); const id = row && !P.state.off.has(row.dataset.id) ? row.dataset.id : null; if (P.state.focus !== id) { P.state.focus = id; d.redraw(); } };
    $('cpList').onmouseleave = () => { if (P.state.focus) { P.state.focus = null; d.redraw(); } };
    // Drag by the header; stays inside the chart area.
    $('cpHead').addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const host = el.parentElement.getBoundingClientRect(), r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      $('cpHead').setPointerCapture(e.pointerId);
      const move = (ev) => {
        const x = Math.min(Math.max(0, ev.clientX - host.left - dx), host.width - r.width), y = Math.min(Math.max(0, ev.clientY - host.top - dy), host.height - 40);
        el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto';
        prefs.pos = { x, y };
      };
      const up = () => { $('cpHead').removeEventListener('pointermove', move); $('cpHead').removeEventListener('pointerup', up); store('pp.patterns', prefs); };
      $('cpHead').addEventListener('pointermove', move);
      $('cpHead').addEventListener('pointerup', up);
    });
    renderPanel();
  }
  let lastCounts = {};
  function renderPanel() {
    const S = P.state;
    $('cpFilters').innerHTML = ['bull', 'bear', 'neutral'].map((b) => `<button data-b="${b}" class="cp-chip ${b}${S.bias[b] ? ' on' : ''}">${BIAS_TXT[b]}</button>`).join('')
      + `<label class="cp-noisy" title="Doji, spinning tops, high waves and inside/outside bars appear constantly; they are hidden unless you tick this"><input type="checkbox" id="cpNoisy" ${S.noisy ? 'checked' : ''}> Common ones</label>`
      + `<label class="cp-noisy" title="Only show patterns that later candles have confirmed"><input type="checkbox" id="cpConf" ${S.onlyConfirmed ? 'checked' : ''}> Confirmed only</label>`
      + `<label class="cp-noisy" title="Only the strongest patterns (gold star)"><input type="checkbox" id="cpTop" ${S.onlyTop ? 'checked' : ''}> &#9733; Strongest only</label>`;
    $('cpList').innerHTML = P.GROUPS.map(([g, t]) => {
      const rows = P.DEFS.filter((p) => p.group === g && S.bias[p.bias] && (S.noisy || !p.noisy) && (!S.onlyTop || p.top || p.topAt));
      if (!rows.length) return '';
      return `<div class="cp-gh">${t}</div>` + rows.map((p) => {
        const off = S.off.has(p.id), n = lastCounts[p.id] || 0;
        return `<div class="cp-row${off ? ' off' : ''}${n && !off ? ' lit' : ''}" data-id="${p.id}" title="${off ? 'Hidden: click to show' : 'Click to hide'} - hover to spotlight it on the chart">
          <span class="cp-ico">${pat(p.id, { noContext: true, w: 34, h: 26, pad: 3, maxBody: 7, wick: 1 })}</span>
          <span class="cp-name"><i class="dot ${p.bias}"></i>${p.name}${p.top || p.topAt ? `<b class="cp-star${p.topAt ? ' soft' : ''}" title="${p.top ? 'One of the strongest' : 'Strongest at support/resistance'}">&#9733;</b>` : ''}</span>
          <span class="cp-n" data-n="${p.id}">${n && !off ? n : ''}</span>
          <button class="cp-info" title="Learn ${p.name}">?</button>
        </div>`;
      }).join('');
    }).join('');
    updateSub();
  }
  const updateSub = () => { const t = Object.entries(lastCounts).reduce((a, [id, n]) => a + (P.shown(id) ? n : 0), 0); $('cpSub').textContent = t ? `${t} on screen` : 'none on screen'; };
  // Called after every chart draw with counts of patterns in view: update badges only (cheap).
  let visTimer = 0;
  function onVisible(counts) {
    cancelAnimationFrame(visTimer);
    visTimer = requestAnimationFrame(() => {
      const same = Object.keys(counts).length === Object.keys(lastCounts).length && Object.entries(counts).every(([k, v]) => lastCounts[k] === v);
      if (same) return;
      lastCounts = counts;
      document.querySelectorAll('#cpList .cp-row').forEach((r) => {
        const n = counts[r.dataset.id] || 0, off = r.classList.contains('off');
        r.classList.toggle('lit', !!n && !off);
        r.querySelector('.cp-n').textContent = n && !off ? n : '';
      });
      updateSub();
    });
  }

  // ---------- popup when a highlighted pattern is clicked ----------
  function buildPopup() {
    const el = document.createElement('div');
    el.id = 'patPop';
    el.className = 'pat-pop';
    el.hidden = true;
    document.body.appendChild(el);
    el.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'learn') { el.hidden = true; open('learn', b.dataset.id); }
      if (b.dataset.act === 'hide') { P.state.off.add(b.dataset.id); savePrefs(); renderPanel(); d.redraw(); el.hidden = true; }
      if (b.dataset.act === 'close') el.hidden = true;
    };
    document.addEventListener('pointerdown', (e) => { if (!el.hidden && !e.target.closest('#patPop')) el.hidden = true; }, true);
  }
  function popupStatus(p, cf) {
    const lv = cf.level != null ? d.fp(cf.level) : '';
    const dir = p.bias === 'bear' ? 'below' : 'above';
    switch (cf.s) {
      case 'built': return 'Its last candle is the confirmation.';
      case 'ok': return `A candle closed ${dir} ${lv}, confirming it.`;
      case 'fail': return `Price closed ${p.bias === 'bear' ? 'above' : 'below'} ${lv} first, so it failed.`;
      case 'none': return `No candle closed past ${lv} in the next ${P.CONFIRM_BARS}, so it never confirmed.`;
      case 'up': return `Broke up: a candle closed above ${lv}.`;
      case 'down': return `Broke down: a candle closed below ${lv}.`;
      default: return p.bias === 'neutral' ? `Watch for a close above ${d.fp(cf.hi)} or below ${d.fp(cf.lo)}.` : `Confirms on a close ${dir} ${lv} within the next ${P.CONFIRM_BARS} candles.`;
    }
  }
  function popup(hit, x, y) {
    const el = $('patPop'), p = P.BY_ID[hit.m.id];
    const also = hit.m.all.slice(1).map((m) => P.BY_ID[m.id].name);
    el.innerHTML = `<div class="pp-h"><b>${hit.m.top ? '<span class="cp-star">&#9733;</span> ' : ''}${p.name}</b>${badge(p.bias)}<button data-act="close">&#10005;</button></div>
      <div class="pp-b">${pat(p.id, { w: 120, h: 84, maxBody: 13 })}
        <div><p>${p.means.split('. ')[0]}.</p>
        ${hit.m.top ? `<p class="pp-top">&#9733; ${p.topAt ? 'Formed at support/resistance: one of the strongest setups.' : 'One of the strongest candlestick patterns.'}</p>` : ''}
        ${hit.m.g ? `<p class="pp-grade g${hit.m.g}"><b>Grade ${hit.m.g}</b> ${{ A: 'with the daily trend AND market structure: the best kind of setup.', B: 'mixed: range, or trend and structure disagree. Be selective.', C: 'against the daily trend or structure. These lost money on average in the BTC/ETH tests.' }[hit.m.g]}</p>` : ''}
        <p>${stChip(hit.m.cf)}</p><p class="muted small">${popupStatus(p, hit.m.cf)}</p>
        ${hit.forming ? '<p class="muted small">&#9888; Forming: the last candle has not closed yet, so this can still change.</p>' : ''}
        ${also.length ? `<p class="muted small">Also matches: ${also.join(', ')}</p>` : ''}
        <p class="muted small">${d.when(hit.time)}</p></div></div>
      <div class="pp-f"><button class="primary-btn" data-act="learn" data-id="${p.id}">Learn more</button><button class="btn-ghost" data-act="hide" data-id="${p.id}">Hide this pattern</button></div>`;
    el.hidden = false;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.min(window.innerWidth - w - 8, x + 12) + 'px';
    el.style.top = Math.min(window.innerHeight - h - 8, Math.max(8, y - h / 2)) + 'px';
  }

  return { init, open, close, toggle, isOpen, popup, setChartOn: (on) => setChartOn(on), isChartOn: () => prefs.on };
})();
