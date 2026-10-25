// Market analysis layer for the Trading Chart: daily/weekly EMA context, market structure (swings, BOS/CHoCH,
// ranges), double tops/bottoms, head & shoulders and staircases, plus the A/B/C grade for candle patterns.
// Engines: context.js, structure.js, stairs.js. Settings per timeframe come from the BTC/ETH research (2016-2026).
const Analysis = (() => {
  const $ = (id) => document.getElementById(id);
  const GREEN = '#0ecb81', RED = '#f6465d', GOLD = '#f0b90b', GREY = '#7d8696';
  // Research-picked structure settings (double top/bottom expectancy positive on BTC+ETH, both halves of history).
  const PRESETS = {
    '1h': { left: 12, right: 12, minSwingAtr: 1.5, eqTolAtr: 1, minDepthAtr: 4 },
    '4h': { left: 12, right: 12, minSwingAtr: 1, eqTolAtr: 0.6, minDepthAtr: 2.5 },
  };
  const FALLBACK = { left: 5, right: 5, minSwingAtr: 1.5, eqTolAtr: 0.6, minDepthAtr: 2.5 };
  const SWING_SIZES = { auto: null, small: 5, medium: 8, large: 12 };
  const LAYERS = [
    ['emaD', 'Daily 12/25 EMA bands', 'The macro trend filter: green = uptrend, red = downtrend'],
    ['emaW', 'Weekly 12/25 EMA bands', 'Bigger-picture trend'],
    ['swings', 'Swing points (HH / HL / LH / LL)', 'Higher highs + higher lows = uptrend; lower highs + lower lows = downtrend'],
    ['breaks', 'Break of structure (BOS / CHoCH)', 'BOS = trend continues; CHoCH = first break against the trend'],
    ['ranges', 'Ranges (accumulation / distribution)', 'Sideways boxes; named by which way they break'],
    ['doubles', 'Double tops / bottoms', 'Confirmed on a close through the neckline'],
    ['hs', 'Head & shoulders', 'Weaker in crypto tests: use with the trend'],
    ['stairs', 'Staircases & elevators', 'Staircase up = 2x the normal risk of a sharp drop'],
  ];

  const load = (k, def) => { try { return { ...def, ...JSON.parse(localStorage.getItem(k) || '{}') }; } catch { return def; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  let prefs = load('pp.analysis', {
    on: false, layers: { emaD: true, emaW: true, swings: true, breaks: true, ranges: true, doubles: true, hs: true, stairs: true },
    swing: 'auto', hideC: true, pos: null, collapsed: false, showLayers: false,
  });
  prefs.layers = { emaD: true, emaW: true, swings: true, breaks: true, ranges: true, doubles: true, hs: true, stairs: true, ...prefs.layers };

  let d = null; // app helpers
  let ctx = null, dailyCoin = null; // Context.build() of the current coin's daily candles
  let interval = '1h';
  let cache = { key: '', res: null, stairs: [], trend: [], bars: [] }, panelTimer = 0, lastHtml = '';

  const toBars = (list) => list.map((k) => ({ t: k.timestamp, o: +k.open, h: +k.high, l: +k.low, c: +k.close }));
  const settings = (iv = interval) => {
    const base = PRESETS[iv] || FALLBACK, sz = SWING_SIZES[prefs.swing];
    return sz ? { ...base, left: sz, right: sz } : base;
  };

  // Runs the engines on the chart's candles (cached until the data or settings change).
  // who = { sub: true, coin, interval } for an extra layout chart, null for the main chart.
  const whoOf = (ind) => (ind?.extendData && typeof ind.extendData === 'object' && ind.extendData.sub ? ind.extendData : null);
  const subCache = new Map(); // key -> result, for the extra charts
  const subCtx = new Map(); // coin -> { ctx, at } daily context for the extra charts' coins
  function ctxFor(who) {
    if (!who || who.coin === dailyCoin) return ctx;
    const c = subCtx.get(who.coin);
    if (!c || (Date.now() - c.at > 30 * 60e3 && !c.loading)) {
      const e = { ctx: c?.ctx || null, at: Date.now(), loading: true };
      subCtx.set(who.coin, e);
      d?.fetchDaily?.(who.coin).then((kl) => { e.ctx = kl && kl.length > 30 ? Context.build(toBars(kl)) : null; e.loading = false; subCache.clear(); d?.redrawSubs?.(); }).catch(() => { e.loading = false; });
    }
    return subCtx.get(who.coin).ctx;
  }
  function compute(list, who) {
    const lastK = list[list.length - 1], iv = who ? who.interval : interval;
    const key = `${who ? who.coin : ''}|${list.length}|${lastK?.timestamp}|${lastK?.close}|${iv}|${prefs.swing}`;
    if (!who && cache.key === key) return cache;
    if (who && subCache.has(key)) return subCache.get(key);
    const bars = toBars(list);
    const res = Structure.analyze(bars, settings(iv));
    const trend = new Array(bars.length).fill(0);
    let ei = 0, tr = 0;
    for (let i = 0; i < bars.length; i++) { while (ei < res.events.length && res.events[ei].i <= i) tr = res.events[ei++].dir; trend[i] = tr; }
    const stairs = Stairs.find(bars).map((s) => ({ ...s, outcome: Stairs.outcome(bars, s) }));
    const out = { key, res, stairs, trend, bars };
    if (who) {
      subCache.set(key, out);
      if (subCache.size > 12) subCache.delete(subCache.keys().next().value);
      return out;
    }
    cache = out;
    // Keep the context / structure readout in the panel current (at most every 2 s).
    if (!panelTimer) panelTimer = setTimeout(() => { panelTimer = 0; renderPanel(); }, 2000);
    return cache;
  }

  // Grade for a bullish (+1) / bearish (-1) idea at candle i: A = daily context AND structure agree,
  // C = either is against it, B = anything in between (range / no trend yet).
  function gradeAt(list, i, dir, who) {
    const c = compute(list, who), st = c.trend[i] || 0, cx = ctxFor(who);
    const cs = cx ? cx.at(list[i].timestamp).state : null;
    const al = Context.align(cs, dir);
    const sAl = st === 0 ? 'none' : st === dir ? 'with' : 'against';
    const g = al === 'against' || sAl === 'against' ? 'C' : al === 'with' && sAl === 'with' ? 'A' : 'B';
    return { g, ctx: al, structure: sAl, ctxState: cs };
  }

  // ---------- drawing ----------
  function register() {
    klinecharts.registerIndicator({
      name: 'MARKET_STRUCTURE', shortName: '', calcParams: [], figures: [],
      calc: (list, ind) => { compute(list, whoOf(ind)); return list.map(() => ({})); },
      createTooltipDataSource: () => ({ name: '', calcParamsText: '', values: [] }),
      draw: ({ ctx: g, kLineDataList: list, indicator, visibleRange, barSpace, xAxis, yAxis, bounding }) => {
        const who = whoOf(indicator), ctx = ctxFor(who);
        const c = compute(list, who), L = prefs.layers, from = Math.max(0, visibleRange.from - 1), to = Math.min(list.length - 1, visibleRange.to);
        const X = (i) => xAxis.convertToPixel(i), Y = (v) => yAxis.convertToPixel(v), half = (barSpace?.bar ?? 6) / 2;
        g.save();
        g.font = '600 10px Segoe UI'; g.textBaseline = 'middle';
        const tag = (x, y, text, bg, fg = '#0b0e11', align = 'center') => {
          const w = g.measureText(text).width + 8, x0 = align === 'center' ? x - w / 2 : align === 'left' ? x : x - w;
          g.fillStyle = bg; rr(g, x0, y - 7, w, 14, 3); g.fill();
          g.fillStyle = fg; g.textAlign = 'center'; g.fillText(text, x0 + w / 2, y + 0.5);
        };
        // EMA bands from the last CLOSED daily / weekly candle at each chart candle.
        if (ctx && (L.emaD || L.emaW)) {
          for (const [on, key, dash, alpha] of [[L.emaW, 'weekly', [5, 4], 0.08], [L.emaD, 'daily', [], 0.14]]) {
            if (!on) continue;
            // One point where each new daily/weekly value takes effect, joined by straight lines, so the
            // EMA reads as a smooth line instead of a staircase of flat steps. Start one knot left of the screen.
            const pts = [];
            let prevT = null;
            for (let i = Math.max(0, from - 400); i <= to; i++) {
              const s = ctx.at(list[i].timestamp)[key];
              if (s.fast == null || s.t === prevT) continue;
              prevT = s.t;
              const p = { x: X(i), f: Y(s.fast), s: Y(s.slow), bull: s.bull };
              if (i < from) pts[0] = p; else pts.push(p);
            }
            if (pts.length) { const l = pts[pts.length - 1]; if (l.x < X(to)) pts.push({ ...l, x: X(to) }); }
            for (let k = 1; k < pts.length; k++) {
              const a = pts[k - 1], b = pts[k], col = b.bull ? GREEN : RED;
              // Shade fades from the 12 EMA toward the 25 EMA so a wide gap does not look like a solid block.
              const gr = g.createLinearGradient(0, (a.f + b.f) / 2, 0, (a.s + b.s) / 2);
              gr.addColorStop(0, col + Math.round(alpha * 255).toString(16).padStart(2, '0'));
              gr.addColorStop(1, col + '03');
              g.fillStyle = gr;
              g.beginPath(); g.moveTo(a.x, a.f); g.lineTo(b.x, b.f); g.lineTo(b.x, b.s); g.lineTo(a.x, a.s); g.closePath(); g.fill();
            }
            g.setLineDash(dash);
            for (const [k2, w] of [['f', 1.3], ['s', 1.8]]) {
              g.lineWidth = w;
              for (let k = 1; k < pts.length; k++) {
                g.strokeStyle = (pts[k].bull ? GREEN : RED) + (k2 === 'f' ? 'cc' : 'ff');
                g.beginPath(); g.moveTo(pts[k - 1].x, pts[k - 1][k2]); g.lineTo(pts[k].x, pts[k][k2]); g.stroke();
              }
            }
            g.setLineDash([]);
            if (pts.length) { const p = pts[pts.length - 1]; tag(p.x - 4, p.f - 11, key === 'daily' ? 'D 12/25' : 'W 12/25', (p.bull ? GREEN : RED) + 'cc', '#0b0e11', 'right'); }
          }
        }
        const res = c.res;
        // Ranges
        if (L.ranges) for (const r of res.ranges) {
          const endI = r.breakAt ?? list.length - 1;
          if (endI < from || r.start > to) continue;
          const x1 = X(r.start) - half, x2 = X(r.end) + half, y1 = Y(r.hi), y2 = Y(r.lo);
          const col = r.breakDir === 1 ? GREEN : r.breakDir === -1 ? RED : GREY;
          g.fillStyle = col + '14'; g.strokeStyle = col + 'aa'; g.lineWidth = 1; g.setLineDash([4, 3]);
          g.fillRect(x1, y1, x2 - x1, y2 - y1); g.strokeRect(x1, y1, x2 - x1, y2 - y1); g.setLineDash([]);
          const forming = r.breakAt == null || r.breakDir === 0 && r.end >= list.length - 2;
          g.fillStyle = col; g.textAlign = 'left'; g.font = '600 10px Segoe UI';
          g.fillText(forming ? 'Range (forming)' : r.name, x1 + 4, y1 - 7);
        }
        // Staircases (+ the elevator after them)
        if (L.stairs) for (const s of c.stairs) {
          if (s.e + (s.outcome.bars || 0) < from || s.s > to) continue;
          const col = s.dir > 0 ? GREEN : RED, band = Math.max(2 * s.sd, s.atr);
          const pA = s.icpt + s.slope * s.s, pB = s.icpt + s.slope * s.e;
          g.fillStyle = col + '16';
          g.beginPath(); g.moveTo(X(s.s), Y(pA + band)); g.lineTo(X(s.e), Y(pB + band)); g.lineTo(X(s.e), Y(pB - band)); g.lineTo(X(s.s), Y(pA - band)); g.closePath(); g.fill();
          g.strokeStyle = col + '88'; g.setLineDash([2, 3]); g.stroke(); g.setLineDash([]);
          const live = s.e >= list.length - 2;
          tag((X(s.s) + X(s.e)) / 2, Y(s.dir > 0 ? pA - band : pA + band) + (s.dir > 0 ? 12 : -12), `${s.dir > 0 ? 'Staircase ↑' : 'Staircase ↓'}${live ? ' (active)' : ''}`, col + 'dd');
          if (s.outcome.kind === 'elevator') {
            const e2 = s.e + s.outcome.bars, k = list[e2];
            if (k) {
              const chg = ((k.close - list[s.e].close) / list[s.e].close) * 100;
              g.strokeStyle = GOLD; g.lineWidth = 2; g.beginPath(); g.moveTo(X(s.e), Y(list[s.e].close)); g.lineTo(X(e2), Y(k.close)); g.stroke();
              tag(X(e2) + 6, Y(k.close), `Elevator ${s.dir > 0 ? '↓' : '↑'} ${chg.toFixed(1)}% in ${s.outcome.bars}`, GOLD, '#0b0e11', 'left');
            }
          }
        }
        // Breaks of structure
        if (L.breaks) for (const e of res.events) {
          if (e.i < from || e.from > to) continue;
          const col = e.dir > 0 ? GREEN : RED, y = Y(e.level);
          g.strokeStyle = col; g.lineWidth = 1; g.setLineDash(e.kind === 'CHoCH' ? [2, 2] : [6, 3]);
          g.beginPath(); g.moveTo(X(e.from), y); g.lineTo(X(e.i), y); g.stroke(); g.setLineDash([]);
          g.fillStyle = col; g.textAlign = 'center'; g.font = '700 9.5px Segoe UI';
          g.fillText(e.kind, (X(e.from) + X(e.i)) / 2, y + (e.dir > 0 ? -7 : 8));
        }
        // Swing labels
        if (L.swings) {
          g.font = '700 9.5px Segoe UI'; g.textAlign = 'center';
          for (const s of res.swings) {
            if (s.i < from || s.i > to || !s.label) continue;
            g.fillStyle = s.label === 'HH' || s.label === 'HL' ? GREEN : RED;
            g.fillText(s.label, X(s.i), s.type === 'H' ? Y(s.price) - 9 : Y(s.price) + 10);
          }
        }
        // Double tops / bottoms and head & shoulders
        for (const p of res.patterns) {
          const isHS = p.kind === 'headShoulders' || p.kind === 'invHeadShoulders';
          if ((isHS && !L.hs) || (!isHS && !L.doubles)) continue;
          const last = p.confirmAt ?? p.endAt ?? list.length - 1;
          if (last < from || p.start > to) continue;
          if (p.status === 'expired') continue;
          const col = p.dir > 0 ? GREEN : RED, faded = p.status === 'invalid';
          g.globalAlpha = faded ? 0.35 : 1;
          g.strokeStyle = col; g.lineWidth = 1.6;
          g.beginPath(); p.pts.forEach((s, k) => (k ? g.lineTo(X(s.i), Y(s.price)) : g.moveTo(X(s.i), Y(s.price)))); g.stroke();
          // Neckline
          const nEnd = p.confirmAt ?? Math.min(list.length - 1, p.end + Math.round((p.end - p.start) / 2));
          g.setLineDash([5, 3]); g.lineWidth = 1;
          g.beginPath(); g.moveTo(X(p.pts[1].i), Y(p.neckAt(p.pts[1].i))); g.lineTo(X(nEnd), Y(p.neckAt(nEnd))); g.stroke();
          if (p.status === 'confirmed') {
            const tEnd = Math.min(list.length + 20, p.confirmAt + (p.end - p.start));
            g.strokeStyle = GOLD; g.beginPath(); g.moveTo(X(p.confirmAt), Y(p.target)); g.lineTo(X(tEnd), Y(p.target)); g.stroke();
            g.fillStyle = GOLD; g.textAlign = 'left'; g.font = '600 9.5px Segoe UI'; g.fillText('Target', X(tEnd) + 3, Y(p.target));
          }
          g.setLineDash([]);
          const name = { doubleTop: 'Double Top', doubleBottom: 'Double Bottom', headShoulders: 'Head & Shoulders', invHeadShoulders: 'Inv H&S' }[p.kind];
          const st = p.status === 'confirmed' ? ' ✓' : p.status === 'invalid' ? ' ✗' : ' …';
          const gr = p.status !== 'invalid' ? gradeAt(list, Math.min(list.length - 1, p.confirmAt ?? p.end), p.dir, who).g : '';
          const apex = isHS ? p.pts[2] : p.pts[2];
          g.font = '600 10px Segoe UI';
          tag(X(apex.i), Y(apex.price) + (p.dir > 0 ? 22 : -22), `${gr ? gr + ' ' : ''}${name}${st}`, faded ? '#5c6370' : col, faded ? '#e6e9ef' : '#0b0e11');
          g.globalAlpha = 1;
        }
        g.restore();
        return true;
      },
    });
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }

  // ---------- panel ----------
  function init(deps) {
    d = deps;
    buildPanel();
    setOn(prefs.on, true);
    renderPanel();
    Patterns.state.grade = (list, i, dir, who) => gradeAt(list, i, dir, who).g;
    Patterns.state.hideC = !!prefs.hideC;
  }
  function setDaily(coin, kl) {
    dailyCoin = coin;
    ctx = kl && kl.length > 30 ? Context.build(toBars(kl)) : null;
    cache.key = '';
    renderPanel();
    d?.redraw();
  }
  function setInterval_(iv) { interval = iv; cache.key = ''; renderPanel(); }
  function setOn(on, initial) {
    prefs.on = !!on; store('pp.analysis', prefs);
    d.setOn(prefs.on);
    $('structPanel').hidden = !prefs.on;
    $('structBtn')?.classList.toggle('active', prefs.on);
    if (!initial && on) d.toast('Market structure on: context bands, swings, BOS/CHoCH, ranges and patterns.');
  }
  function buildPanel() {
    const el = document.createElement('div');
    el.id = 'structPanel';
    el.className = 'cheat-panel struct-panel pro-only';
    el.hidden = true;
    el.innerHTML = `<div class="cp-head" id="spHead"><b>Market structure</b><span class="cp-sub" id="spSub"></span>
        <button id="spMin" title="Collapse">&#8211;</button><button id="spX" title="Turn off">&#10005;</button></div>
      <div class="cp-body" id="spBody"></div>`;
    document.querySelector('.chart-body').appendChild(el);
    if (prefs.pos) { el.style.left = prefs.pos.x + 'px'; el.style.top = prefs.pos.y + 'px'; el.style.right = 'auto'; }
    el.classList.toggle('min', !!prefs.collapsed);
    $('spMin').onclick = () => { prefs.collapsed = !prefs.collapsed; el.classList.toggle('min', prefs.collapsed); store('pp.analysis', prefs); };
    $('spX').onclick = () => setOn(false);
    $('spBody').onchange = (e) => {
      const t = e.target;
      if (t.dataset.layer) prefs.layers[t.dataset.layer] = t.checked;
      else if (t.id === 'spSwing') { prefs.swing = t.value; cache.key = ''; }
      else if (t.id === 'spHideC') { prefs.hideC = t.checked; Patterns.state.hideC = t.checked; d.redrawPatterns(); }
      store('pp.analysis', prefs); renderPanel(); d.redraw();
    };
    $('spBody').onclick = (e) => {
      if (e.target.closest('#spLearn')) d.openHandbook();
      if (e.target.closest('#spMore')) { prefs.showLayers = !prefs.showLayers; store('pp.analysis', prefs); renderPanel(); }
    };
    const head = $('spHead');
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const host = el.parentElement.getBoundingClientRect(), r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const x = Math.min(Math.max(0, ev.clientX - host.left - dx), host.width - r.width), y = Math.min(Math.max(0, ev.clientY - host.top - dy), host.height - 40);
        el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto'; prefs.pos = { x, y };
      };
      const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); store('pp.analysis', prefs); };
      head.addEventListener('pointermove', move); head.addEventListener('pointerup', up);
    });
    renderPanel();
  }
  const STATE_TXT = { up: ['▲ Uptrend', 'up'], down: ['▼ Downtrend', 'down'], range: ['◆ Range', 'range'] };
  function ctxLine(label, s) {
    if (!s || !s.state) return `<div class="sp-row"><span>${label}</span><b class="muted">loading...</b></div>`;
    const [txt, cls] = STATE_TXT[s.state];
    const why = s.state === 'range' ? (s.since < (label === 'Daily' ? Context.DEFAULTS.settleDaily : Context.DEFAULTS.settleWeekly) ? `bands crossed ${s.since} ${label === 'Daily' ? 'days' : 'weeks'} ago` : 'price inside the bands') : `no cross for ${s.since > 500 ? 'a long time' : s.since + (label === 'Daily' ? ' days' : ' weeks')}`;
    return `<div class="sp-row" title="12 EMA ${s.fast?.toFixed(2)} / 25 EMA ${s.slow?.toFixed(2)}"><span>${label}</span><b class="${cls}">${txt}</b><i class="muted">${why}</i></div>`;
  }
  function renderPanel() {
    if (!$('spBody')) return;
    const list = d?.list() || [];
    let dl = null, wk = null, st = 0, bias = '';
    if (ctx && list.length) { const a = ctx.at(list[list.length - 1].timestamp); dl = a.daily; wk = a.weekly; }
    if (list.length) { const c = compute(list); st = c.trend[c.trend.length - 1] || 0; }
    if (dl?.state) {
      if (dl.state === 'range') bias = 'Range: favour buying the bottom / selling the top of the range; trend signals are less reliable.';
      else if ((dl.state === 'up' && st > 0) || (dl.state === 'down' && st < 0)) bias = `${dl.state === 'up' ? 'Longs' : 'Shorts'} favoured: daily trend and ${interval} structure agree (grade A setups).`;
      else bias = `Mixed: daily is ${dl.state === 'up' ? 'up' : 'down'} but ${interval} structure is ${st > 0 ? 'bullish' : st < 0 ? 'bearish' : 'unclear'}. Be selective.`;
    }
    const sz = settings().left;
    $('spSub').textContent = dl?.state ? STATE_TXT[dl.state][0] : '';
    const html = `<div class="sp-ctx">
        ${ctxLine('Daily', dl)}${ctxLine('Weekly', wk)}
        <div class="sp-row"><span>Structure</span><b class="${st > 0 ? 'up' : st < 0 ? 'down' : 'range'}">${st > 0 ? '▲ Bullish' : st < 0 ? '▼ Bearish' : '◆ Unclear'}</b><i class="muted">${interval}, last break</i></div>
        ${bias ? `<p class="sp-bias">${bias}</p>` : ''}
      </div>
      <button class="sp-more" id="spMore">${prefs.showLayers ? '&#9662;' : '&#9656;'} Layers &amp; settings</button>
      <div class="sp-fold"${prefs.showLayers ? '' : ' hidden'}>
      <div class="sp-layers">${LAYERS.map(([k, t, tip]) => `<label title="${tip}"><input type="checkbox" data-layer="${k}" ${prefs.layers[k] ? 'checked' : ''}> ${t}</label>`).join('')}</div>
      <div class="sp-opts">
        <label title="How big a swing must be to count. Auto = the research-picked size for this timeframe">Swing size <select id="spSwing">${Object.keys(SWING_SIZES).map((k) => `<option value="${k}" ${prefs.swing === k ? 'selected' : ''}>${k === 'auto' ? `Auto (${(PRESETS[interval] || FALLBACK).left})` : k[0].toUpperCase() + k.slice(1) + ` (${SWING_SIZES[k]})`}</option>`).join('')}</select></label>
        <label title="Candle patterns get A (with daily trend and structure), B (mixed / range) or C (against). C patterns lost money on average in the BTC/ETH tests"><input type="checkbox" id="spHideC" ${prefs.hideC ? 'checked' : ''}> Hide grade C candle patterns</label>
      </div>
      </div>
      <div class="cp-foot"><button id="spLearn">&#128214; How to read this</button></div>`;
    if (html !== lastHtml) { lastHtml = html; $('spBody').innerHTML = html; }
    void sz;
  }

  return { init, register, setDaily, setInterval: setInterval_, setOn: (on) => setOn(on), isOn: () => prefs.on, gradeAt, compute, renderPanel, context: () => ctx, dailyCoin: () => dailyCoin };
})();
