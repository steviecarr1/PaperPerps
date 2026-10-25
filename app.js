// PaperPerps UI: Hyperliquid market data -> chart / order book / ticket; ticket -> Engine.
(() => {
  const $ = (id) => document.getElementById(id);
  const UP = '#0ecb81', DN = '#f6465d', ORANGE = '#ff8c3a', YELLOW = '#f0b90b';

  // Every candle interval Hyperliquid serves.
  const IV_MS = { '1m': 6e4, '3m': 18e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '2h': 72e5, '4h': 144e5, '8h': 288e5, '12h': 432e5, '1d': 864e5, '3d': 2592e5, '1w': 6048e5, '1M': 2592e6 };
  const IV_NAME = (iv) => { const n = parseInt(iv, 10), u = { m: 'minute', h: 'hour', d: 'day', w: 'week', M: 'month' }[iv.slice(-1)]; return `${n} ${u}${n > 1 ? 's' : ''}`; };
  const INDICATORS = [
    { name: 'MA', label: 'SMA', group: 'Averages', main: true },
    { name: 'EMA', label: 'EMA', group: 'Averages', main: true },
    { name: 'TREND', label: 'Trend (EMA 18/25/32)', group: 'Averages', main: true },
    { name: 'VWAP', label: 'VWAP', group: 'Averages', main: true },
    { name: 'BOLL', label: 'Bollinger bands', group: 'Averages', main: true },
    { name: 'RSI', label: 'RSI', group: 'Oscillators' },
    { name: 'STOCH', label: 'Stochastic', group: 'Oscillators' },
    { name: 'STOCHRSI', label: 'Stoch RSI', group: 'Oscillators' },
    { name: 'MACD', label: 'MACD', group: 'Oscillators' },
    { name: 'VOL', label: 'Volume', group: 'Volume' },
    { name: 'VRVP', label: 'Volume profile (visible range)', group: 'Volume', main: true },
    { name: 'LELEDC', label: 'LeveLeledc', group: 'Levels', main: true },
  ];
  // Drawing tools in Crayon-style groups: the button draws the group's last-used tool, the small
  // arrow beside it lists the rest. Names ending in a built-in KLineChart overlay are its own;
  // the others come from chart-tools.js.
  const TOOL_GROUPS = [
    { id: 'lines', tools: [
      { n: 'segment', t: 'Trend line', i: '<path d="M3 15 L15 3"/><circle cx="3" cy="15" r="1.6"/><circle cx="15" cy="3" r="1.6"/>' },
      { n: 'rayLine', t: 'Ray', i: '<path d="M3 15 L17 1"/><circle cx="3" cy="15" r="1.6"/>' },
      { n: 'straightLine', t: 'Extended line', i: '<path d="M1 17 L17 1"/>' },
      { n: 'horizontalStraightLine', t: 'Horizontal line', i: '<path d="M1 9 H17"/>' },
      { n: 'horizontalRayLine', t: 'Horizontal ray', i: '<path d="M4 9 H17"/><circle cx="4" cy="9" r="1.6"/>' },
      { n: 'verticalStraightLine', t: 'Vertical line', i: '<path d="M9 1 V17"/>' },
      { n: 'priceLine', t: 'Price line', i: '<path d="M2 11 H12"/><path d="M12 8 h5 v6 h-5z"/>' },
      { n: 'arrowLine', t: 'Arrow', i: '<path d="M3 15 L14 4"/><path d="M8 4 H14 V10"/>' },
    ] },
    { id: 'channels', tools: [
      { n: 'parallelStraightLine', t: 'Parallel channel', i: '<path d="M1 12 L12 1"/><path d="M6 17 L17 6"/>' },
      { n: 'priceChannelLine', t: 'Price channel', i: '<path d="M1 13 L13 1"/><path d="M5 17 L17 5"/><path d="M3 15 L15 3" stroke-dasharray="2 2"/>' },
    ] },
    { id: 'fib', tools: [
      { n: 'fibRetrace', t: 'Fib retracement', i: '<path d="M1 3 H17 M1 7 H17 M1 11 H17 M1 15 H17"/>' },
      { n: 'fibProjection', t: 'Fib projection (trend-based extension)', i: '<path d="M1 16 L5 7 L9 12"/><path d="M9 2 H17 M9 6 H17" stroke-dasharray="2 2"/>' },
    ] },
    { id: 'shapes', tools: [
      { n: 'box', t: 'Box', i: '<rect x="3" y="4" width="12" height="10" rx="1"/>' },
      { n: 'circleShape', t: 'Circle', i: '<circle cx="9" cy="9" r="6"/>' },
      { n: 'ellipse', t: 'Ellipse', i: '<ellipse cx="9" cy="9" rx="7.5" ry="4.5"/>' },
      { n: 'triangle', t: 'Triangle', i: '<path d="M9 3 L16 15 H2 Z"/>' },
    ] },
    { id: 'positions', tools: [
      { n: 'longPosition', t: 'Long position: click entry, then target, then stop', i: '<rect x="3" y="2.5" width="12" height="6.5" fill="rgba(14,203,129,.35)" stroke="#0ecb81"/><rect x="3" y="9" width="12" height="6" fill="rgba(246,70,93,.35)" stroke="#f6465d"/>' },
      { n: 'shortPosition', t: 'Short position: click entry, then target, then stop', i: '<rect x="3" y="2.5" width="12" height="6" fill="rgba(246,70,93,.35)" stroke="#f6465d"/><rect x="3" y="8.5" width="12" height="6.5" fill="rgba(14,203,129,.35)" stroke="#0ecb81"/>' },
    ] },
    { id: 'measure', tools: [
      { n: 'measure', t: 'Date & price range', i: '<rect x="2.5" y="4.5" width="13" height="9" stroke-dasharray="2 2"/><path d="M9 6.5 V11.5 M6.8 8.6 L9 6.5 L11.2 8.6"/>' },
      { n: 'frvp', t: 'Fixed range volume profile', i: '<path d="M3 2 V16"/><path d="M3 4.5 H9 M3 7.5 H14 M3 10.5 H11 M3 13.5 H6"/>' },
    ] },
    { id: 'text', tools: [
      { n: 'textNote', t: 'Text', i: '<path d="M4 4 H14 M9 4 V15"/>' },
    ] },
  ];
  const ALL_TOOLS = TOOL_GROUPS.flatMap((g) => g.tools);
  const DRAW_COLORS = ['#5b8cff', '#2ee6a6', '#f6465d', '#f0b90b', '#ff9f43', '#c084fc', '#e6e9ef', '#7d8696'];

  // ---------- small helpers ----------
  const loadJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const prefs = loadJSON('pp.prefs', {});
  const savePrefs = () => saveJSON('pp.prefs', { coin, interval, inds, unit, bookCollapsed, favOnly, crayonFree, toolPick, drawColor, drawingsHidden, logScale, drawingsLocked, ivFavs, bottomH });

  let meta = {}, ctxs = {}, mids = {};
  let coin = prefs.coin || 'BTC';
  let interval = IV_MS[prefs.interval] ? prefs.interval : '15m';
  // Intervals pinned to the toolbar (star them in the interval dropdown).
  let ivFavs = Array.isArray(prefs.ivFavs) ? prefs.ivFavs.filter((iv) => IV_MS[iv]) : ['1m', '5m', '15m', '1h', '4h', '1d'];
  let inds = prefs.inds || { VOL: true };
  let favs = loadJSON('pp.favs', ['BTC', 'ETH', 'SOL']);
  let favOnly = !!prefs.favOnly;
  let crayonFree = prefs.crayonFree !== false;
  let toolPick = prefs.toolPick || {};
  let drawColor = prefs.drawColor || '#5b8cff';
  let drawingsHidden = !!prefs.drawingsHidden;
  let logScale = !!prefs.logScale;
  let drawingsLocked = !!prefs.drawingsLocked;
  let ctxDrawing = null; // drawing under the last right-click
  const history = {}; // per-coin undo stack of drawing snapshots
  let restoringHistory = false;
  let defaultBarSpace = 8;
  let alerts = loadJSON('pp.alerts', []);
  let layout = loadJSON('pp.layout', { mode: '1', subs: [] });
  const subCharts = [];
  const studies = { pat: false, ms: false }; // candle patterns / market structure switched on (all charts)
  const redrawSubs = () => subCharts.forEach((s) => s.studies());
  let pointer = null; // last mouse position over the main chart, for Alt+A alerts
  let bookCollapsed = !!prefs.bookCollapsed;
  let bottomH = +prefs.bottomH || 270; // height of the Positions panel (drag its top edge)
  let unit = prefs.unit || 'USD';
  let side = 1, otype = 'market';
  let book = null, trades = [];
  let chart = null, candlesReady = false, loadTok = 0;
  let drawings = loadJSON('pp.drawings', {});
  // Drawings go on the chart you last clicked (the "drawing target"): the main chart or an extra layout chart.
  // Each chart keeps its own overlay ids; drawings are saved per coin, so charts showing the same coin share them.
  const mainTarget = { main: true, ids: new Set(), get k() { return chart; }, get coin() { return coin; }, get ready() { return candlesReady; } };
  let DT = mainTarget;
  const allTargets = () => [mainTarget, ...subCharts];
  let suppressRemove = false, selectedDrawing = null, magnet = false;
  let bottomTab = 'positions', lastPrice = 0, lastFillId = 0;

  const pxDec = (c, p) => {
    const sd = meta[c]?.szDecimals ?? 2;
    if (!p || !isFinite(p)) return 2;
    const mag = Math.floor(Math.log10(Math.abs(p)));
    return Math.max(0, Math.min(4 - mag, 6 - sd));
  };
  const nf = (v, d) => (+v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fp = (p, c = coin) => (p == null || !isFinite(p) ? '-' : nf(p, pxDec(c, p)));
  const fsz = (sz, c = coin) => nf(sz, meta[c]?.szDecimals ?? 4);
  const usd = (v, sign) => {
    if (v == null || !isFinite(v)) return '-';
    const s = v < 0 ? '-' : sign && v > 0 ? '+' : '';
    return s + '$' + nf(Math.abs(v), 2);
  };
  const compact = (v) => '$' + Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(v);
  const pct = (v) => (!isFinite(v) ? '-' : (v > 0 ? '+' : '') + v.toFixed(2) + '%');
  const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
  const num = (el) => { const v = parseFloat(String(el.value).replace(/,/g, '')); return isFinite(v) ? v : NaN; };
  const hhmmss = (t) => new Date(t).toLocaleTimeString([], { hour12: false });
  const when = (t) => {
    const d = new Date(t);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
  };
  const held = (ms) => {
    const m = Math.floor(ms / 6e4);
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
  };
  const sideTag = (dir, extra = '') => `<span class="tag ${dir > 0 ? 'long' : 'short'}">${dir > 0 ? 'Long' : 'Short'}${extra}</span>`;

  function toast(msg, kind = '', action = null) {
    if (!msg) return;
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    if (action) {
      const b = document.createElement('button');
      b.className = 'toast-act';
      b.textContent = action.label;
      b.onclick = () => { el.remove(); action.run(); };
      el.appendChild(b);
    }
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), action ? 9000 : 3800);
  }

  // onDismiss runs when the modal is closed without its own action (Cancel, Esc, backdrop).
  let modalDismiss = null;
  function closeModal() {
    if ($('modalBack').hidden) return;
    $('modalBack').hidden = true;
    $('modal').innerHTML = '';
    const f = modalDismiss;
    modalDismiss = null;
    f?.();
  }
  function modal(html, mount, { wide = false, onDismiss = null } = {}) {
    $('modal').innerHTML = html;
    $('modal').className = wide ? 'wide' : '';
    $('modalBack').hidden = false;
    modalDismiss = onDismiss;
    const close = () => { modalDismiss = null; closeModal(); };
    $('modal').querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
    mount?.(close);
  }

  // ---------- market data ----------
  function applyMeta([m, c], aliasOnly) {
    m.universe.forEach((u, i) => {
      // Other Hyperliquid exchanges: only the markets RISEx also lists (feed.js HL_ALIAS).
      const name = aliasOnly ? HL_FROM[u.name] : u.name;
      if (u.isDelisted || !name) return;
      meta[name] = { szDecimals: u.szDecimals, maxLeverage: u.maxLeverage };
      ctxs[name] = c[i];
      if (!mids[name]) mids[name] = +c[i].midPx || +c[i].markPx;
    });
    Engine.setMeta(meta);
  }
  // Main Hyperliquid markets, plus RISEx's stocks / ETFs / commodities from the HIP-3 exchanges (feed.js HL_ALIAS;
  // an exchange that can't be reached is skipped quietly).
  async function loadMeta() {
    const [main, ...extra] = await Promise.all([api.info({ type: 'metaAndAssetCtxs' }), ...HL_DEXES.map((dex) => api.info({ type: 'metaAndAssetCtxs', dex }).catch(() => null))]);
    applyMeta(main);
    for (const x of extra) if (x?.[0]?.universe) applyMeta(x, true);
  }

  async function refreshCtx() {
    try {
      await loadMeta();
      renderHeader();
      if (!$('marketPanel').hidden) renderMarketList();
    } catch {}
  }

  function onMids(d) {
    const upd = {};
    for (const k in d.mids) if (meta[k]) upd[k] = mids[k] = +d.mids[k];
    Engine.onMarks(upd);
    checkAlerts(upd);
    scheduleLive();
  }

  function onBook(d) {
    if (d.coin !== coin) return;
    book = {
      bids: d.levels[0].map((l) => [+l.px, +l.sz]),
      asks: d.levels[1].map((l) => [+l.px, +l.sz]),
    };
    scheduleBook();
  }

  function onTrades(arr) {
    const mine = arr.filter((t) => t.coin === coin);
    if (!mine.length) return;
    trades = mine.concat(trades).sort((a, b) => b.time - a.time).slice(0, 80);
    if (!$('tradesView').hidden) renderTrades();
  }

  const toBar = (c) => ({ timestamp: c.t, open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +c.v });

  function onCandle(d) {
    for (const sc of subCharts) sc.onCandle(d);
    if (!candlesReady || d.s !== coin || d.i !== interval) return;
    chart.updateData(toBar(d));
  }

  async function fetchCandles(c, iv, startTime, endTime, background) {
    const raw = await api.info({ type: 'candleSnapshot', req: { coin: hlName(c), interval: iv, startTime, endTime } }, background ? { background: true } : undefined);
    return (raw || []).map(toBar);
  }

  // Daily candles for the market-context EMA bands (weekly ones are built from them).
  let dailyTok = 0;
  async function loadDaily() {
    const tok = ++dailyTok, c = coin;
    try {
      const bars = await fetchCandles(c, '1d', Date.now() - 1400 * 864e5, Date.now());
      if (tok === dailyTok && c === coin) { Analysis.setDaily(c, bars); ForecastUI.refresh(); }
    } catch { if (tok === dailyTok) setTimeout(loadDaily, 5000); }
  }

  async function loadCandles() {
    const tok = ++loadTok;
    candlesReady = false;
    const end = Date.now();
    let bars;
    try {
      bars = await fetchCandles(coin, interval, end - IV_MS[interval] * 1500, end);
    } catch (e) {
      if (tok === loadTok) { toast('Could not load candles: ' + e.message, 'bad'); setTimeout(loadCandles, 3000); }
      return;
    }
    if (tok !== loadTok) return;
    chart.setPriceVolumePrecision(pxDec(coin, bars.at(-1)?.close), meta[coin]?.szDecimals ?? 2);
    if (inds.LELEDC) chart.overrideIndicator({ name: 'LELEDC', precision: pxDec(coin, bars.at(-1)?.close) }, 'candle_pane');
    chart.applyNewData(bars, bars.length > 0);
    setAutoScale(true);
    candlesReady = true;
    restoreDrawings(mainTarget);
    drawTradeLines();
    Analysis.renderPanel();
    ForecastUI.refresh();
  }

  // ---------- chart ----------
  function registerTradeLine() {
    klinecharts.registerOverlay({
      name: 'tradeLine',
      totalStep: 2,
      lock: true,
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      createPointFigures: ({ coordinates, bounding, overlay }) => {
        const y = coordinates[0].y, { color, text, coin: c, slot = 0 } = overlay.extendData;
        // Off the visible price range (e.g. a far take profit): pin the label to the top / bottom edge instead.
        if (y < 0 || y > bounding.height) {
          const up = y < 0, ey = up ? 38 + slot * 22 : bounding.height - 12 - slot * 22; // top: below the candle info row
          return [{ type: 'text', attrs: { x: bounding.width / 2, y: ey, text: `${up ? '▲' : '▼'} ${text} ${fp(overlay.points[0].value, c)}`, align: 'center', baseline: 'middle' }, styles: { color: '#0b0e11', backgroundColor: color, size: 11, weight: 600, family: 'Segoe UI, -apple-system, system-ui, Roboto, sans-serif', paddingLeft: 5, paddingRight: 5, paddingTop: 3, paddingBottom: 3, borderRadius: 2, borderSize: 0 }, ignoreEvent: true }];
        }
        return [
          { type: 'line', attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] }, styles: { style: 'dashed', dashedValue: [5, 4], size: 1, color }, ignoreEvent: true },
          { type: 'text', attrs: { x: bounding.width / 2, y, text, align: 'center', baseline: 'middle' }, styles: { color: '#0b0e11', backgroundColor: color, size: 11, weight: 600, family: 'Segoe UI, -apple-system, system-ui, Roboto, sans-serif', paddingLeft: 5, paddingRight: 5, paddingTop: 3, paddingBottom: 3, borderRadius: 2, borderSize: 0 }, ignoreEvent: true },
        ];
      },
      createYAxisFigures: ({ coordinates, bounding, overlay }) => (bounding && (coordinates[0].y < 0 || coordinates[0].y > bounding.height) ? [] : [
        { type: 'text', attrs: { x: 0, y: coordinates[0].y, text: fp(overlay.points[0].value), align: 'left', baseline: 'middle' }, styles: { color: '#0b0e11', backgroundColor: overlay.extendData.color, size: 11, family: 'Segoe UI, -apple-system, system-ui, Roboto, sans-serif', paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3, borderRadius: 2, borderSize: 0 }, ignoreEvent: true },
      ]),
    });
  }

  // "Leledc levels (IS)" / LeveLeledc by InSilico: support/resistance from Leledc exhaustion bars.
  // Exhaustion bar (glaz's Leledc): after more than `qual` closes above the close 4 bars back, a red candle
  // making the highest high of `len` bars is a bearish exhaustion -> its high becomes resistance.
  // Mirror image for support. Levels hold until the next exhaustion bar (zero confirmation, no repaint).
  function registerLeledc() {
    const RES = '#ff5d73', SUP = '#2ee6a6';
    klinecharts.registerIndicator({
      name: 'LELEDC',
      shortName: 'LeveLeledc',
      calcParams: [6, 30],
      figures: [
        { key: 'res', title: 'Resistance: ', type: 'line' },
        { key: 'sup', title: 'Support: ', type: 'line' },
      ],
      styles: { lines: [RES, SUP].map((color) => ({ style: 'solid', smooth: false, size: 1, dashedValue: [2, 2], color })) },
      calc: (list, indicator) => Doritos.calc(list, ...indicator.calcParams), // shared with the Telegram alerts (doritos.js)
      // Step lines (one flat segment per bar) plus a small triangle on each exhaustion bar.
      draw: ({ ctx, kLineDataList, indicator, visibleRange, barSpace, xAxis, yAxis }) => {
        const r = indicator.result, half = barSpace.halfBar, tri = Math.max(3, Math.min(6, barSpace.gapBar / 2));
        ctx.lineWidth = 2;
        for (let i = visibleRange.from; i < visibleRange.to; i++) {
          const d = r[i];
          if (!d) continue;
          const x = xAxis.convertToPixel(i);
          for (const [v, c] of [[d.res, RES], [d.sup, SUP]]) {
            if (v == null) continue;
            const y = Math.round(yAxis.convertToPixel(v)) + 0.5;
            ctx.strokeStyle = c;
            ctx.beginPath(); ctx.moveTo(x - half, y); ctx.lineTo(x + half, y); ctx.stroke();
          }
          if (d.sig) {
            const k = kLineDataList[i], up = d.sig > 0;
            const y = yAxis.convertToPixel(up ? k.low : k.high) + (up ? 6 : -6);
            ctx.fillStyle = up ? SUP : RES;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - tri, y + (up ? tri * 1.6 : -tri * 1.6));
            ctx.lineTo(x + tri, y + (up ? tri * 1.6 : -tri * 1.6));
            ctx.closePath(); ctx.fill();
          }
        }
        return true;
      },
    });
  }

  function buildChart() {
    registerTradeLine();
    registerLeledc();
    ChartTools.register({
      dataList: () => chart.getDataList(),
      barMs: () => IV_MS[interval],
      equity: () => Engine.totals().equity,
      coin: () => coin,
      fp: (v) => fp(v),
      candle: () => ({ up: colors.upBody, down: colors.downBody }),
    });
    Patterns.register();
    Analysis.register();
    ForecastUI.register();
    chart = klinecharts.init('kchart');
    defaultBarSpace = chart.getBarSpace();
    window.ppChart = chart; // handles for automated checks
    window.ppDebug = { alerts: () => alerts, mids: () => mids };
    const GRID = '#1a1f28', AX = '#7d8696', TXT = '#c9ced8';
    const FONT = 'Segoe UI, -apple-system, system-ui, Roboto, sans-serif';
    const crossText = { backgroundColor: '#2a313d', borderColor: '#2a313d', color: TXT, family: FONT };
    chart.setStyles({
      grid: { horizontal: { color: GRID }, vertical: { color: GRID } },
      candle: {
        bar: { upColor: UP, downColor: DN, upBorderColor: UP, downBorderColor: DN, upWickColor: UP, downWickColor: DN },
        priceMark: { high: { color: TXT, textFamily: FONT }, low: { color: TXT, textFamily: FONT }, last: { upColor: UP, downColor: DN, text: { family: FONT } } },
        tooltip: { text: { color: TXT, family: FONT } },
      },
      indicator: {
        ohlc: { upColor: UP, downColor: DN },
        bars: [{ upColor: 'rgba(14,203,129,.45)', downColor: 'rgba(246,70,93,.45)', noChangeColor: '#666' }],
        tooltip: { text: { color: TXT, family: FONT } },
      },
      xAxis: { axisLine: { color: GRID }, tickLine: { color: GRID }, tickText: { color: AX, family: FONT } },
      yAxis: { axisLine: { color: GRID }, tickLine: { color: GRID }, tickText: { color: AX, family: FONT } },
      separator: { color: '#222833' },
      crosshair: {
        horizontal: { line: { color: '#5d6573' }, text: crossText },
        vertical: { line: { color: '#5d6573' }, text: crossText },
      },
      overlay: {
        line: { color: '#5b8cff' },
        point: { color: '#5b8cff', borderColor: 'rgba(91,140,255,.35)', activeColor: '#5b8cff', activeBorderColor: 'rgba(91,140,255,.35)' },
        polygon: { color: 'rgba(91,140,255,.08)' },
        rect: { color: 'rgba(91,140,255,.08)' },
        text: { color: TXT },
      },
    });

    // Scrolling left loads older candles.
    chart.setLoadDataCallback(async ({ type, data, callback }) => {
      if (type !== 'forward' || !data) return callback([], false);
      const c = coin, iv = interval, tok = loadTok;
      try {
        const end = data.timestamp - 1;
        const bars = await fetchCandles(c, iv, end - IV_MS[iv] * 1000, end);
        if (tok !== loadTok) return callback([], false);
        callback(bars, bars.length > 0);
      } catch {
        callback([], true);
      }
    });

    for (const ind of INDICATORS) if (inds[ind.name]) addIndicator(ind);
    new ResizeObserver(() => chart.resize()).observe($('kchart'));
    applyChartColors(colors);
    if (logScale) chart.setStyles({ yAxis: { type: 'log' } });

    // Free panning: KLineChart only drags vertically once the price axis stops auto-fitting
    // (same as TradingView). Turn auto-fit off as soon as a drag starts on the candle area.
    $('kchart').addEventListener('mousedown', () => setTarget(mainTarget), true); // before the chart sees the click
    $('kchart').addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const main = chart.getSize('candle_pane', 'main');
      const box = $('kchart').getBoundingClientRect();
      const x = e.clientX - box.left, y = e.clientY - box.top;
      if (main && x >= main.left && x <= main.left + main.width && y >= main.top && y <= main.top + main.height) setAutoScale(false);
    }, true);
    // Double-clicking the price axis re-enables auto-fit inside the library; mirror it on the button.
    $('kchart').addEventListener('dblclick', () => setTimeout(syncAutoBtn, 0));
    axisWheel(chart, $('kchart'), syncAutoBtn);
  }

  // Mouse wheel on the axes: over the price axis it stretches / squeezes the price scale (like dragging the axis),
  // over the date axis it scrolls back and forward in time. Over the candles the library's own wheel zoom stays.
  function axisWheel(ch, el, onScale) {
    el.addEventListener('wheel', (e) => {
      if (!e.deltaY) return;
      const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const yAx = ch.getSize('candle_pane', 'yAxis'), xAx = ch.getSize('x_axis_pane', 'root');
      const inside = (b) => b && x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height;
      if (inside(yAx)) {
        const axis = ch.getDrawPaneById('candle_pane')?.getAxisComponent(), rg = axis?.getRange();
        if (!rg || !(rg.range > 0)) return;
        const range = rg.range * (e.deltaY > 0 ? 1.1 : 1 / 1.1), from = rg.from - (range - rg.range) / 2, to = from + range;
        const realFrom = axis.convertToRealValue(from), realTo = axis.convertToRealValue(to);
        axis.setRange({ from, to, range, realFrom, realTo, realRange: realTo - realFrom });
        ch.adjustPaneViewport(false, true, true, true);
        onScale?.();
      } else if (inside(xAx)) {
        ch.scrollByDistance(Math.sign(e.deltaY) * Math.max(60, Math.min(400, Math.abs(e.deltaY))));
      } else return;
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true, passive: false });
  }
  const candleAxis = () => chart.getDrawPaneById?.('candle_pane')?.getAxisComponent();
  function setAutoScale(on) {
    const axis = candleAxis();
    if (!axis || axis.getAutoCalcTickFlag() === on) return syncAutoBtn();
    axis.setAutoCalcTickFlag(on);
    if (on) chart.adjustPaneViewport(false, true, true, true);
    syncAutoBtn();
  }
  function syncAutoBtn() {
    const btn = $('autoBtn');
    if (btn) btn.classList.toggle('active', candleAxis()?.getAutoCalcTickFlag() ?? true);
  }

  // ---------- multi-chart layouts ----------
  // The main chart (left/top) is the one you trade and draw on. Extra charts each follow their own
  // market and interval with live candles, volume and your position, order and alert lines.
  const LAYOUTS = [
    { id: '1', n: 0, t: 'One chart', i: '<rect x="2" y="3" width="14" height="12" rx="1"/>' },
    { id: '2v', n: 1, t: 'Two charts side by side', i: '<rect x="2" y="3" width="14" height="12" rx="1"/><path d="M9 3 V15"/>' },
    { id: '2h', n: 1, t: 'Two charts, one above the other', i: '<rect x="2" y="3" width="14" height="12" rx="1"/><path d="M2 9 H16"/>' },
    { id: '3', n: 2, t: 'Three charts', i: '<rect x="2" y="3" width="14" height="12" rx="1"/><path d="M10 3 V15 M10 9 H16"/>' },
    { id: '4', n: 3, t: 'Four charts', i: '<rect x="2" y="3" width="14" height="12" rx="1"/><path d="M9 3 V15 M2 9 H16"/>' },
  ];
  const saveLayout = () => saveJSON('pp.layout', { mode: layout.mode, subs: subCharts.map((s) => ({ coin: s.coin, interval: s.interval, inds: s.inds })) });

  class SubChart {
    constructor(cfg) {
      this.coin = meta[cfg.coin] ? cfg.coin : 'ETH';
      this.interval = IV_MS[cfg.interval] ? cfg.interval : interval;
      this.tok = 0;
      this.ready = false;
      this.el = document.createElement('div');
      this.el.className = 'sub-chart';
      this.el.innerHTML = `<div class="sub-head">
          <select class="sub-coin" title="Market"></select>
          <select class="sub-iv" title="Time interval">${Object.keys(IV_MS).map((iv) => `<option value="${iv}">${iv}</option>`).join('')}</select>
          <span class="sub-px"></span>
          <button class="sub-trade" title="Trade this market on the main chart">Trade &#8599;</button>
        </div><div class="sub-k"></div>`;
      $('chartGrid').appendChild(this.el);
      this.fillCoins();
      this.el.querySelector('.sub-coin').onchange = (e) => this.setCoin(e.target.value);
      this.el.querySelector('.sub-iv').onchange = (e) => this.setInterval(e.target.value);
      this.el.querySelector('.sub-trade').onclick = () => setCoin(this.coin);
      this.k = klinecharts.init(this.el.querySelector('.sub-k'));
      this.k.setStyles(chart.getStyles());
      this.inds = [];
      this.ids = new Set(); // its drawing overlays
      this.applyInds(Array.isArray(cfg.inds) ? cfg.inds : ['VOL'], false);
      // Same free dragging as the main chart.
      this.el.querySelector('.sub-k').addEventListener('mousedown', (e) => {
        setTarget(this);
        if (e.button !== 0) return;
        const main = this.k.getSize('candle_pane', 'main'), r = this.el.querySelector('.sub-k').getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        if (main && x <= main.left + main.width && y >= main.top && y <= main.top + main.height) this.k.getDrawPaneById('candle_pane')?.getAxisComponent().setAutoCalcTickFlag(false);
      }, true);
      axisWheel(this.k, this.el.querySelector('.sub-k'));
      this.restyle();
      this.k.setLoadDataCallback(async ({ type, data, callback }) => {
        if (type !== 'forward' || !data) return callback([], false);
        try {
          const end = data.timestamp - 1, bars = await fetchCandles(this.coin, this.interval, end - IV_MS[this.interval] * 1000, end);
          callback(bars, bars.length > 0);
        } catch { callback([], true); }
      });
      this.ro = new ResizeObserver(() => this.k.resize());
      this.ro.observe(this.el.querySelector('.sub-k'));
      this.subscribe();
      this.load();
    }
    fillCoins() {
      const byVol = Object.keys(meta).sort((a, b) => (+ctxs[b]?.dayNtlVlm || 0) - (+ctxs[a]?.dayNtlVlm || 0));
      const opt = (c) => `<option value="${c}"${c === this.coin ? ' selected' : ''}>${favs.includes(c) ? '\u2605 ' : ''}${c}-USD</option>`;
      this.el.querySelector('.sub-coin').innerHTML = favs.filter((c) => meta[c]).map(opt).join('') + '<option disabled>──────────</option>' + byVol.filter((c) => !favs.includes(c)).map(opt).join('');
      this.el.querySelector('.sub-iv').value = this.interval;
    }
    subscribe() { Feed.sub({ type: 'candle', coin: this.coin, interval: this.interval }); }
    unsubscribe() { Feed.unsub({ type: 'candle', coin: this.coin, interval: this.interval }); }
    async load() {
      const tok = ++this.tok;
      this.ready = false;
      try {
        const end = Date.now(), bars = await fetchCandles(this.coin, this.interval, end - IV_MS[this.interval] * 1000, end);
        if (tok !== this.tok || !this.k) return;
        this.k.setPriceVolumePrecision(pxDec(this.coin, bars.at(-1)?.close), meta[this.coin]?.szDecimals ?? 2);
        this.k.applyNewData(bars, bars.length > 0);
        this.ready = true;
        this.drawLines();
        restoreDrawings(this);
        this.studies();
        this.tick();
      } catch {
        if (tok === this.tok) setTimeout(() => this.load(), 3000);
      }
    }
    setCoin(c) { if (c === this.coin) return; this.unsubscribe(); this.coin = c; this.subscribe(); this.fillCoins(); this.load(); saveLayout(); }
    setInterval(iv) { if (iv === this.interval) return; this.unsubscribe(); this.interval = iv; this.subscribe(); this.fillCoins(); this.load(); saveLayout(); }
    onCandle(d) { if (this.ready && d.s === this.coin && d.i === this.interval) this.k.updateData(toBar(d)); }
    applyInds(names, save = true) {
      for (const n of this.inds) {
        const ind = INDICATORS.find((i) => i.name === n);
        if (ind) this.k.removeIndicator(ind.main ? 'candle_pane' : 'pane_' + n, n);
      }
      this.inds = names.filter((n) => INDICATORS.some((i) => i.name === n));
      for (const n of this.inds) {
        const ind = INDICATORS.find((i) => i.name === n);
        if (ind.main) this.k.createIndicator(n, true, { id: 'candle_pane' });
        else { this.k.createIndicator(n, false, { id: 'pane_' + n, height: 70, position: PANE_TOP.has(n) ? 'top' : undefined }); levelTicks(this.k, n); }
      }
      refitY(this.k);
      if (save) saveLayout();
    }
    resetView() { resetChartView(this.k); }
    // Candle patterns / market structure follow the main chart's switches, using this chart's coin and interval.
    studies() {
      if (!this.k || !this.ready) return;
      for (const [name, on] of [['CANDLE_PATTERNS', studies.pat], ['MARKET_STRUCTURE', studies.ms]]) {
        const has = !!this.k.getIndicatorByPaneId('candle_pane', name);
        const extendData = { sub: true, coin: this.coin, interval: this.interval, v: (this.studyVer = (this.studyVer || 0) + 1) };
        if (on && !has) this.k.createIndicator({ name, extendData }, true, { id: 'candle_pane' });
        else if (!on && has) this.k.removeIndicator('candle_pane', name);
        else if (on) this.k.overrideIndicator({ name, extendData }, 'candle_pane');
      }
    }
    drawLines() { if (this.ready) drawLinesOn(this.k, this.coin); }
    restyle() {
      if (!this.k) return;
      this.k.setStyles({ candle: { bar: { upColor: colors.upBody, upBorderColor: colors.upBody, upWickColor: colors.upWick, downColor: colors.downBody, downBorderColor: colors.downBody, downWickColor: colors.downWick } } });
      this.el.querySelector('.sub-k').style.background = colors.bg;
    }
    tick() {
      const p = mids[this.coin], x = ctxs[this.coin] || {}, prev = +x.prevDayPx, ch = prev ? ((p - prev) / prev) * 100 : 0;
      this.el.querySelector('.sub-px').innerHTML = `${fp(p, this.coin)} <span class="${cls(ch)}">${pct(ch)}</span>`;
    }
    destroy() {
      if (DT === this) setTarget(mainTarget);
      this.tok++;
      this.unsubscribe();
      this.ro.disconnect();
      klinecharts.dispose(this.el.querySelector('.sub-k'));
      this.k = null;
      this.el.remove();
    }
  }

  function setLayout(id) {
    const L = LAYOUTS.find((x) => x.id === id) || LAYOUTS[0];
    const saved = [...subCharts.map((s) => ({ coin: s.coin, interval: s.interval })), ...(layout.subs || [])];
    while (subCharts.length > L.n) subCharts.pop().destroy();
    const defaults = ['ETH', 'SOL', 'HYPE', 'BTC'].filter((c) => c !== coin);
    while (subCharts.length < L.n) {
      const cfg = saved[subCharts.length] || { coin: defaults[subCharts.length] || 'ETH', interval };
      subCharts.push(new SubChart(cfg));
    }
    layout.mode = L.id;
    $('chartGrid').className = 'chart-grid lay-' + L.id;
    markTarget();
    $('layoutBtn').innerHTML = `<svg viewBox="0 0 18 18">${L.i}</svg>`;
    saveLayout();
  }

  // ---------- right-click menu (Crayon-style) ----------
  // Re-fit the price scale after panes come and go (the library can leave it squeezed).
  function refitY(ch) {
    requestAnimationFrame(() => {
      const axis = ch.getDrawPaneById?.('candle_pane')?.getAxisComponent();
      if (!axis) return;
      axis.setAutoCalcTickFlag(true);
      ch.adjustPaneViewport(true, true, true, true, true);
      if (ch === chart) syncAutoBtn();
    });
  }
  function resetChartView(ch) {
    ch.setBarSpace(defaultBarSpace);
    ch.scrollToRealTime();
    const axis = ch.getDrawPaneById?.('candle_pane')?.getAxisComponent();
    if (axis) { axis.setAutoCalcTickFlag(true); ch.adjustPaneViewport(false, true, true, true); }
    if (ch === chart) syncAutoBtn();
  }
  function toggleMaximize(cell) {
    const grid = $('chartGrid');
    if (layout.mode === '1') return;
    const was = grid.querySelector('.max');
    grid.querySelectorAll('.max').forEach((x) => x.classList.remove('max'));
    const on = !(was && was === cell);
    grid.classList.toggle('maxed', on);
    if (on) cell.classList.add('max');
  }
  function priceAt(ch, el, clientX, clientY) {
    const r = el.getBoundingClientRect(), x = clientX - r.left, y = clientY - r.top;
    const main = ch.getSize('candle_pane', 'main');
    if (!main || y < main.top || y > main.top + main.height || x > main.left + main.width) return null;
    const pt = ch.convertFromPixel([{ x, y }], { paneId: 'candle_pane', absolute: true });
    const v = Array.isArray(pt) ? pt[0]?.value : pt?.value;
    return isFinite(v) ? v : null;
  }
  const mainIndNames = () => INDICATORS.filter((i) => inds[i.name]).map((i) => i.name);
  function setMainInds(names) {
    for (const ind of INDICATORS) {
      const want = names.includes(ind.name);
      if (want === !!inds[ind.name]) continue;
      inds[ind.name] = want;
      want ? addIndicator(ind) : removeIndicator(ind);
    }
    savePrefs();
    refitY(chart);
    document.dispatchEvent(new Event('pp-inds-changed'));
  }
  function copyText(t) {
    (navigator.clipboard?.writeText(t) ?? Promise.reject()).then(() => toast('Copied ' + t, 'ok')).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      toast('Copied ' + t, 'ok');
    });
  }
  function showMenu(x, y, items) {
    const m = $('ctxMenu');
    m.innerHTML = items.map((it, i) => it === 'sep'
      ? '<div class="ctx-sep"></div>'
      : it.html
        ? `<div class="ctx-html">${it.html}</div>`
        : `<button data-i="${i}"${it.disabled ? ' disabled' : ''}><span>${it.label}</span><kbd>${it.hint || ''}</kbd></button>`).join('');
    m.hidden = false;
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.min(x, window.innerWidth - w - 6) + 'px';
    m.style.top = Math.min(y, window.innerHeight - h - 6) + 'px';
    m.onclick = (e) => {
      e.stopPropagation();
      const b = e.target.closest('[data-i]'), sw = e.target.closest('[data-swatch]');
      if (sw) { items.find((it) => it.onSwatch)?.onSwatch(sw.dataset.swatch); m.hidden = true; return; }
      if (!b || b.disabled) return;
      m.hidden = true;
      items[+b.dataset.i].run();
    };
  }
  function drawingMenu(id) {
    const ch = targetOf(id).k, o = ch?.getOverlayById(id);
    if (!o) return null;
    return [
      ...(o.name === 'textNote' ? [{ label: 'Edit text', run: () => editText(id, false) }] : []),
      { html: `<div class="ctx-swatches">${DRAW_COLORS.map((c) => `<button data-swatch="${c}" style="background:${c}"></button>`).join('')}</div>`,
        onSwatch: (c) => { ch.overrideOverlay({ id, extendData: { ...o.extendData, color: c }, styles: drawStyles(c) }); saveDrawings(targetOf(id)); } },
      { label: o.lock ? 'Unlock' : 'Lock', run: () => { ch.overrideOverlay({ id, lock: !o.lock, extendData: { ...o.extendData, locked: !o.lock } }); saveDrawings(targetOf(id)); } },
      { label: 'Hide', run: () => { ch.overrideOverlay({ id, visible: false, extendData: { ...o.extendData, hidden: true } }); saveDrawings(targetOf(id)); toast('Hidden. Show it again from the object tree (Alt+O)'); } },
      { label: 'Delete', hint: 'Del', run: () => ch.removeOverlay(id) },
      'sep',
      { label: 'Object tree', hint: 'Alt+O', run: () => openTree() },
    ];
  }
  function chartMenu(e, cell) {
    const isMain = cell.id === 'kchart';
    const sc = isMain ? null : subCharts.find((s) => s.el === cell);
    const ch = isMain ? chart : sc.k, c = isMain ? coin : sc.coin;
    const el = isMain ? $('kchart') : sc.el.querySelector('.sub-k');
    const raw = priceAt(ch, el, e.clientX, e.clientY);
    const px = raw == null ? null : +fp(raw, c).replace(/,/g, '');
    const names = isMain ? mainIndNames() : sc.inds;
    const maxed = cell.classList.contains('max');
    return [
      { label: 'Reset chart view', hint: 'Alt+R', run: () => resetChartView(ch) },
      ...(layout.mode !== '1' ? [{ label: maxed ? 'Restore layout' : 'Maximize this chart', hint: 'Alt+click', run: () => toggleMaximize(cell) }] : []),
      { label: px ? `Add alert on ${c} at ${fp(px, c)}` : `Add alert on ${c}`, hint: 'Alt+A', run: () => (px ? addAlert(c, px) : openAlertPanel()) },
      ...(px ? [{ label: `Copy price ${fp(px, c)}`, run: () => copyText(String(px)) }] : []),
      ...(subCharts.length ? [{ label: 'Apply indicators to all charts', run: () => {
        if (!isMain) setMainInds(names);
        for (const s of subCharts) if (s !== sc) s.applyInds(names);
        toast('Indicators applied to all charts', 'ok');
      } }] : []),
      'sep',
      { label: 'Object tree', hint: 'Alt+O', run: () => openTree() },
      { label: `Remove drawings (${(isMain ? mainTarget : sc).ids.size})`, disabled: !(isMain ? mainTarget : sc).ids.size, run: () => { const t = isMain ? mainTarget : sc; clearDrawingsFromChart(t); saveDrawings(t); toast('Drawings removed. Ctrl+Z brings them back'); } },
      { label: `Remove indicators (${names.length})`, disabled: !names.length, run: () => (isMain ? setMainInds([]) : sc.applyInds([])) },
      'sep',
      { label: 'Chart settings...', run: () => settingsModal() },
    ];
  }
  function openTree() {
    $('treePanel').hidden = false;
    renderTree();
  }

  // ---------- chart snapshots for the journal ----------
  const chartVisible = () => chart && candlesReady && !document.body.classList.contains('tv-mode');
  function captureChart() {
    return chartVisible() ? chart.getConvertPictureUrl(true, 'jpeg', colors.bg) : null;
  }
  // Snapshot of a just-closed trade with its entry and exit marked. Only when that coin is on screen.
  async function captureTrade(x) {
    if (!chartVisible() || x.coin !== coin) return null;
    const ts = chart.getDataList().at(-1)?.timestamp;
    if (!ts) return null;
    const net = x.pnl - x.fees;
    const line = (v, color, text) => chart.createOverlay({ name: 'tradeLine', groupId: 'shot', lock: true, points: [{ timestamp: ts, value: v }], extendData: { color, text } });
    line(x.entry, '#5b8cff', `Entry ${fp(x.entry)}`);
    line(x.exit, net >= 0 ? UP : DN, `Exit ${fp(x.exit)} (${usd(net, true)})`);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const url = chart.getConvertPictureUrl(true, 'jpeg', colors.bg);
    chart.removeOverlay({ groupId: 'shot' });
    return url;
  }

  // ---------- chart color customization ----------
  const DEFAULT_COLORS = { upBody: UP, upWick: UP, downBody: DN, downWick: DN, bg: '#12161c' };
  let colors = { ...DEFAULT_COLORS, ...loadJSON('pp.colors', {}) };
  function applyChartColors(c) {
    chart.setStyles({
      candle: {
        bar: {
          upColor: c.upBody, upBorderColor: c.upBody, upWickColor: c.upWick,
          downColor: c.downBody, downBorderColor: c.downBody, downWickColor: c.downWick,
        },
      },
    });
    $('kchart').style.background = c.bg;
    for (const sc of subCharts) sc.restyle();
  }

  function addIndicator(ind) {
    const create = ind.name === 'LELEDC' ? { name: ind.name, precision: pxDec(coin, mids[coin]) } : ind.name;
    if (ind.main) chart.createIndicator(create, true, { id: 'candle_pane' });
    else { chart.createIndicator(ind.name, false, { id: 'pane_' + ind.name, height: PANE_TOP.has(ind.name) ? 120 : 90, position: PANE_TOP.has(ind.name) ? 'top' : undefined }); levelTicks(chart, ind.name); }
  }
  // Steve wants RSI above the candles (2026-10-21); other oscillators stay below.
  const PANE_TOP = new Set(['RSI']);
  // Like Crayon, oscillator scales only label their overbought / oversold levels.
  const LEVEL_TICKS = { RSI: [70, 30], STOCH: [80, 20], STOCHRSI: [80, 20] };
  function levelTicks(ch, name) {
    const levels = LEVEL_TICKS[name], axis = levels && ch.getDrawPaneById('pane_' + name)?.getAxisComponent();
    if (!axis) return;
    axis.createTicks = () => levels.map((v) => ({ text: v.toFixed(1), coord: axis.convertToPixel(v), value: v }));
    axis.buildTicks(true);
  }
  function removeIndicator(ind) {
    chart.removeIndicator(ind.main ? 'candle_pane' : 'pane_' + ind.name, ind.name);
  }

  const ALERT_COLOR = '#c084fc';
  function linesFor(c) {
    const s = Engine.state, p = s.positions[c], lines = [];
    if (p) {
      lines.push({ v: p.entry, color: p.dir > 0 ? UP : DN, text: `${p.dir > 0 ? 'Long' : 'Short'} ${fsz(p.size, c)} ${c} @ ${fp(p.entry, c)}` });
      lines.push({ v: Engine.liqPrice(p), color: ORANGE, text: 'Liquidation' });
      if (p.tp) lines.push({ v: p.tp, color: UP, text: 'Take profit' });
      if (p.sl) lines.push({ v: p.sl, color: DN, text: 'Stop loss' });
    }
    for (const o of s.orders) {
      if (o.coin !== c) continue;
      lines.push({ v: o.price, color: YELLOW, text: `Limit ${o.dir > 0 ? 'buy' : 'sell'} ${fsz(o.size, c)}${o.reduceOnly ? ' (reduce)' : ''}` });
    }
    // The auto-trader's RISEx trades (live and practice): entry, take profit, stop loss, liquidation.
    for (const l of Bot.chartLines(c)) lines.push({ v: l.v, color: { entry: l.dir > 0 ? UP : DN, tp: UP, sl: DN, liq: ORANGE }[l.kind], text: l.text });
    for (const a of alerts) {
      if (a.coin !== c || a.triggered) continue;
      lines.push({ v: a.price, color: ALERT_COLOR, text: `\u{1F514} Alert ${a.dir > 0 ? 'above' : 'below'}${a.note ? ': ' + a.note : ''}` });
    }
    return lines;
  }
  function drawLinesOn(ch, c) {
    ch.removeOverlay({ groupId: 'trade' });
    const list = ch.getDataList();
    if (!list.length) return;
    const ts = list[list.length - 1].timestamp, last = list[list.length - 1].close;
    const lines = linesFor(c).filter((l) => l.v > 0 && isFinite(l.v));
    // Stacking order if they end up pinned to the chart edge: the farthest price sits right at the edge.
    const above = lines.filter((l) => l.v >= last).sort((a, b) => b.v - a.v), below = lines.filter((l) => l.v < last).sort((a, b) => a.v - b.v);
    for (const l of lines) {
      const slot = l.v >= last ? above.indexOf(l) : below.indexOf(l);
      ch.createOverlay({ name: 'tradeLine', groupId: 'trade', lock: true, points: [{ timestamp: ts, value: l.v }], extendData: { color: l.color, text: l.text, coin: c, slot } });
    }
  }
  function drawTradeLines() {
    if (!chart) return;
    drawLinesOn(chart, coin);
    for (const sc of subCharts) sc.drawLines();
  }

  // ---------- price alerts ----------
  const saveAlerts = () => saveJSON('pp.alerts', alerts);
  function addAlert(c, price, note = '') {
    const m = mids[c];
    if (!(price > 0)) return toast('Enter an alert price', 'bad');
    if (!m) return toast('No price yet for ' + c, 'bad');
    const dir = price >= m ? 1 : -1;
    alerts.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), coin: c, price, dir, note: note.trim(), created: Date.now(), triggered: null });
    saveAlerts();
    drawTradeLines();
    renderAlerts();
    toast(`Alert set: ${c} ${dir > 0 ? 'rises to' : 'falls to'} ${fp(price, c)}`, 'ok');
  }
  function removeAlert(id) {
    alerts = alerts.filter((a) => a.id !== id);
    saveAlerts();
    drawTradeLines();
    renderAlerts();
  }
  function checkAlerts(upd) {
    for (const a of alerts) {
      if (a.triggered) continue;
      const m = upd[a.coin];
      if (m == null || !(a.dir > 0 ? m >= a.price : m <= a.price)) continue;
      a.triggered = Date.now();
      a.hit = m;
      saveAlerts();
      const msg = `${a.coin} ${a.dir > 0 ? 'rose to' : 'fell to'} ${fp(a.price, a.coin)}${a.note ? ': ' + a.note : ''}`;
      toast('\u{1F514} ' + msg, 'ok', { label: 'Show', run: () => setCoin(a.coin) });
      try { new Notification('PaperPerps price alert', { body: msg, silent: true }); } catch {}
      chime();
      drawTradeLines();
      renderAlerts();
    }
  }
  // Two soft rising tones.
  function chime() {
    try {
      const ctx = new AudioContext();
      [880, 1320].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.16;
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.4);
      });
      setTimeout(() => ctx.close(), 1000);
    } catch {}
  }
  function renderAlerts() {
    const active = alerts.filter((a) => !a.triggered), done = alerts.filter((a) => a.triggered).sort((a, b) => b.triggered - a.triggered);
    $('alertCount').textContent = active.length || '';
    $('alertCount').hidden = !active.length;
    if ($('alertPanel').hidden) return;
    const row = (a) => `<div class="al-row${a.triggered ? ' done' : ''}">
        <span class="coin-link" data-coin="${a.coin}">${a.coin}</span>
        <span>${a.dir > 0 ? '&#8805;' : '&#8804;'} ${fp(a.price, a.coin)}</span>
        <span class="muted al-note">${a.note ? a.note.replace(/</g, '&lt;') : ''}</span>
        <span class="muted">${a.triggered ? 'hit ' + when(a.triggered) : 'set ' + when(a.created)}</span>
        <button class="act danger" data-del="${a.id}" title="Delete">&#10005;</button></div>`;
    $('alertList').innerHTML =
      (active.length ? `<h5>Active (${active.length})</h5>` + active.map(row).join('') : '<p class="muted">No active alerts.</p>') +
      (done.length ? `<h5>Triggered <button class="mini-link" id="alClear">clear</button></h5>` + done.slice(0, 30).map(row).join('') : '');
  }
  function openAlertPanel() {
    $('alCoin').textContent = coin;
    $('alPrice').value = fp(mids[coin]).replace(/,/g, '');
    $('alNote').value = '';
    $('alertPanel').hidden = false;
    renderAlerts();
    $('alPrice').focus();
    $('alPrice').select();
  }
  // Price under the mouse on the main chart (for Alt+A).
  function pointerPrice() {
    if (!pointer || !chartVisible()) return null;
    const main = chart.getSize('candle_pane', 'main');
    if (!main || pointer.y < main.top || pointer.y > main.top + main.height || pointer.x > main.left + main.width) return null;
    const pt = chart.convertFromPixel([{ x: pointer.x, y: pointer.y }], { paneId: 'candle_pane', absolute: true });
    const v = Array.isArray(pt) ? pt[0]?.value : pt?.value;
    return isFinite(v) ? +fp(v).replace(/,/g, '') : null;
  }

  // ---------- object tree ----------
  const toolTitle = (name) => ALL_TOOLS.find((t) => t.n === name)?.t.split(':')[0] || name;
  function renderTree() {
    if ($('treePanel').hidden) return;
    const items = [...DT.ids].map((id) => DT.k?.getOverlayById(id)).filter(Boolean);
    const activeInds = INDICATORS.filter((i) => inds[i.name]);
    $('treePanel').innerHTML = `
      <h5>Drawings on ${DT.coin}${DT.main ? '' : ' (this chart)'} (${items.length})</h5>
      ${items.length ? items.map((o) => {
        const hidden = !!o.extendData?.hidden, locked = !!o.lock;
        return `<div class="tree-row${hidden ? ' off' : ''}">
          <span class="tree-dot" style="background:${o.extendData?.color || '#5b8cff'}"></span>
          <span class="tree-name">${toolTitle(o.name)}${o.extendData?.text ? ': ' + o.extendData.text.replace(/</g, '&lt;') : ''}</span>
          <button data-tvis="${o.id}" class="${hidden ? '' : 'on'}" title="${hidden ? 'Show' : 'Hide'}">&#128065;</button>
          <button data-tlock="${o.id}" class="${locked ? 'on' : ''}" title="${locked ? 'Unlock' : 'Lock (stops it moving)'}">${locked ? '&#128274;' : '&#128275;'}</button>
          <button data-tdel="${o.id}" title="Delete">&#10005;</button></div>`;
      }).join('') : '<p class="muted">No drawings yet. Pick a tool on the left.</p>'}
      <h5>Indicators (${activeInds.length})</h5>
      ${activeInds.length ? activeInds.map((i) => `<div class="tree-row"><span class="tree-name">${i.label}</span><button data-tind="${i.name}" title="Remove">&#10005;</button></div>`).join('') : '<p class="muted">None. Add some from the Indicators menu.</p>'}`;
  }

  // ---------- drawings (saved per coin, by timestamp) ----------
  const targetOf = (id) => allTargets().find((t) => t.ids.has(id)) || DT;
  const drawingHooks = {
    onPressedMoveEnd: (e) => { saveDrawings(targetOf(e.overlay.id)); return false; },
    onRemoved: (e) => {
      if (suppressRemove) return false;
      const t = targetOf(e.overlay.id);
      t.ids.delete(e.overlay.id);
      saveDrawings(t);
      return false;
    },
    onSelected: (e) => { selectedDrawing = e.overlay.id; return false; },
    onRightClick: (e) => { ctxDrawing = e.overlay.id; return true; },
    onDoubleClick: (e) => { if (e.overlay.name === 'textNote') editText(e.overlay.id, false); return false; },
    onDeselected: () => { selectedDrawing = null; return false; },
  };

  // Built-in overlays take their colour from styles; ours read extendData.color.
  const fadeHex = (c, a) => c + Math.round(a * 255).toString(16).padStart(2, '0');
  const drawStyles = (c) => ({
    line: { color: c }, text: { color: c },
    polygon: { color: fadeHex(c, 0.1), borderColor: c }, rect: { color: fadeHex(c, 0.1), borderColor: c },
  });
  let drawingNow = null, drawingTool = null;

  // Clicking a chart makes it the drawing target; with several charts open it gets a thin outline.
  function markTarget() {
    for (const t of allTargets()) (t.main ? $('kchart') : t.el)?.classList.toggle('draw-target', t === DT && subCharts.length > 0);
  }
  function setTarget(t) {
    if (t === DT) return;
    // A tool picked before clicking another chart moves to that chart.
    const tool = drawingNow ? drawingTool : null;
    if (drawingNow) { DT.k?.removeOverlay(drawingNow); drawingNow = null; setActiveTool(null); }
    selectedDrawing = null;
    DT = t;
    markTarget();
    syncUndo();
    renderTree();
    if (tool) startDrawing(tool);
  }

  function startDrawing(name) {
    if (!DT.k) DT = mainTarget;
    const t = DT;
    if (drawingNow) t.k.removeOverlay(drawingNow);
    setActiveTool(name);
    drawingTool = name;
    drawingNow = t.k.createOverlay({
      name, groupId: 'drawings', mode: magnet ? 'weak_magnet' : 'normal', ...drawingHooks,
      visible: true, extendData: { color: drawColor }, styles: drawStyles(drawColor),
      onDrawEnd: (e) => {
        drawingNow = null;
        t.ids.add(e.overlay.id);
        setActiveTool(null);
        if (drawingsHidden) setDrawingsHidden(false);
        if (drawingsLocked) t.k.overrideOverlay({ id: e.overlay.id, lock: true });
        if (e.overlay.name === 'textNote') editText(e.overlay.id, true);
        saveDrawings(t);
        return false;
      },
    });
  }

  function editText(id, isNew) {
    const t = targetOf(id), o = t.k.getOverlayById(id);
    if (!o) return;
    const cur = o.extendData?.text || '';
    modal(
      `<h3>${isNew ? 'Add text' : 'Edit text'}</h3>
       <div class="field"><input id="mText" maxlength="200" value="${cur.replace(/"/g, '&quot;')}" placeholder="Type your note"></div>
       <div class="modal-btns"><button data-close>Cancel</button><button class="primary" id="mTextOk">Save</button></div>`,
      (close) => {
        const ok = () => {
          const text = $('mText').value.trim();
          if (!text) return toast('Type some text first', 'bad');
          t.k.overrideOverlay({ id, extendData: { ...o.extendData, text } });
          saveDrawings(t);
          close();
        };
        $('mTextOk').onclick = ok;
        $('mText').onkeydown = (e) => { if (e.key === 'Enter') ok(); };
        setTimeout(() => $('mText').focus(), 0);
      },
      { onDismiss: () => { if (isNew && !cur) t.k.removeOverlay(id); } },
    );
  }

  function setDrawColor(c) {
    drawColor = c;
    savePrefs();
    $('colorBtn').style.setProperty('--dc', c);
    if (selectedDrawing) {
      const t = targetOf(selectedDrawing), o = t.k.getOverlayById(selectedDrawing);
      if (o) {
        t.k.overrideOverlay({ id: o.id, extendData: { ...o.extendData, color: c }, styles: drawStyles(c) });
        saveDrawings(t);
      }
    }
  }

  function setDrawingsHidden(v) {
    drawingsHidden = v;
    savePrefs();
    for (const t of allTargets()) for (const id of t.ids) {
      const o = t.k?.getOverlayById(id);
      if (o) t.k.overrideOverlay({ id, visible: !v && !o.extendData?.hidden });
    }
    $('hideDraw').classList.toggle('active', v);
    $('hideDraw').title = v ? 'Show the drawings' : 'Hide the drawings';
  }

  function saveDrawings(t = DT) {
    const list = [];
    for (const id of t.ids) {
      const o = t.k.getOverlayById(id);
      if (!o) continue;
      const pts = o.points.map((p) => ({ timestamp: p.timestamp, value: p.value }));
      if (pts.every((p) => isFinite(p.timestamp) && isFinite(p.value))) list.push({ name: o.name, points: pts, ext: o.extendData ?? null });
    }
    drawings[t.coin] = list;
    saveJSON('pp.drawings', drawings);
    if (!restoringHistory) pushHistory(list, t.coin);
    // Other charts showing the same coin redraw from the saved list.
    for (const x of allTargets()) if (x !== t && x.coin === t.coin && x.ready && x.k) restoreDrawings(x);
    renderTree();
  }

  function clearDrawingsFromChart(t = DT) {
    suppressRemove = true;
    t.k.removeOverlay({ groupId: 'drawings' });
    suppressRemove = false;
    t.ids.clear();
  }

  // ---------- undo / redo of drawings (per market, this session) ----------
  function pushHistory(list, c = DT.coin) {
    const h = (history[c] ||= { stack: [JSON.stringify([])], i: 0 });
    const snap = JSON.stringify(list);
    if (h.stack[h.i] === snap) return;
    h.stack = h.stack.slice(0, h.i + 1);
    h.stack.push(snap);
    if (h.stack.length > 100) h.stack.shift();
    h.i = h.stack.length - 1;
    syncUndo();
  }
  function stepHistory(dir) {
    const c = DT.coin, h = history[c];
    if (!h || h.i + dir < 0 || h.i + dir >= h.stack.length) return;
    h.i += dir;
    drawings[c] = JSON.parse(h.stack[h.i]);
    saveJSON('pp.drawings', drawings);
    restoringHistory = true;
    for (const x of allTargets()) if (x.coin === c && x.ready && x.k) restoreDrawings(x);
    restoringHistory = false;
    syncUndo();
    renderTree();
  }
  function syncUndo() {
    const h = history[DT.coin];
    if ($('undoBtn')) $('undoBtn').disabled = !h || h.i <= 0;
    if ($('redoBtn')) $('redoBtn').disabled = !h || h.i >= h.stack.length - 1;
  }

  function restoreDrawings(t = DT) {
    if (!t.k) return;
    if (!history[t.coin]) history[t.coin] = { stack: [JSON.stringify(drawings[t.coin] || [])], i: 0 };
    if (t === DT) syncUndo();
    clearDrawingsFromChart(t);
    for (const d of drawings[t.coin] || []) {
      const c = d.ext?.color;
      const id = t.k.createOverlay({
        name: d.name, groupId: 'drawings', points: d.points, ...drawingHooks, visible: !drawingsHidden && !d.ext?.hidden, lock: !!d.ext?.locked || drawingsLocked,
        extendData: d.ext ?? undefined, ...(c ? { styles: drawStyles(c) } : {}),
      });
      if (id) t.ids.add(id);
    }
  }

  function setActiveTool(name) {
    document.querySelectorAll('#drawTools .tg-main').forEach((b) => b.classList.toggle('active', !!name && b.dataset.tool === name));
  }

  // ---------- screenshot & scale ----------
  async function saveScreenshot() {
    if (!chartVisible()) return toast('Open the Trading Chart tab to take a screenshot', 'bad');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    const file = await api.savePng(chart.getConvertPictureUrl(true, 'png', colors.bg), `${coin}-${interval}-${stamp}.png`);
    if (file) toast('Screenshot saved', 'ok');
  }
  function setLogScale(v) {
    logScale = v;
    savePrefs();
    chart.setStyles({ yAxis: { type: v ? 'log' : 'normal' } });
    $('logBtn').classList.toggle('active', v);
  }

  // ---------- Crayon Charts tab ----------
  // crayoncharts.xyz refuses to be framed, so it runs in an Electron <webview> (its own browser view).
  // A persistent partition keeps its sign-in, workspaces and drawings between launches.
  // It has no URL parameter for the symbol, so coins are picked inside Crayon itself.
  function buildCrayon() {
    if ($('crayon')) return;
    const wv = document.createElement('webview');
    wv.id = 'crayon';
    wv.setAttribute('src', 'https://crayoncharts.xyz/');
    wv.setAttribute('partition', 'persist:crayon');
    wv.setAttribute('allowpopups', '');
    wv.addEventListener('did-fail-load', (e) => {
      if (e.isMainFrame && e.errorCode !== -3) toast('Could not load Crayon Charts. Check your internet connection.', 'bad');
    });
    wv.addEventListener('dom-ready', () => wv.executeJavaScript(CRAYON_FREE_DRAG).then(syncCrayonFree).catch(() => {}));
    $('tvchart').appendChild(wv);
  }

  // Free drag for Crayon. Crayon only pans its price scale up and down once the scale is "manual",
  // which a wheel turn over the price axis switches on, and it goes back to auto on every coin or
  // interval change. So on each press on a chart we first send a wheel event too small to see
  // (a scale change of about one in a million) over that pane's price axis. Crayon then treats
  // the scale as manual and the drag moves the chart in every direction.
  const CRAYON_FREE_DRAG = `(() => {
    if (window.__ppFree) return;
    window.__ppFree = true;
    window.__ppFreeOn = true;
    window.addEventListener('pointerdown', (e) => {
      const cv = e.target;
      if (!window.__ppFreeOn || e.button !== 0 || !(cv instanceof HTMLCanvasElement)) return;
      const r = cv.getBoundingClientRect();
      cv.dispatchEvent(new WheelEvent('wheel', { clientX: r.right - 6, clientY: e.clientY, deltaY: 0.000001, deltaMode: 0, bubbles: true, cancelable: true }));
    }, true);
  })()`;
  function syncCrayonFree() {
    $('crayonFreeBtn').classList.toggle('active', crayonFree);
    $('crayon')?.executeJavaScript(`window.__ppFreeOn = ${crayonFree}`).catch(() => {});
  }

  // ---------- coin / interval switching ----------
  function setCoin(c, first = false) {
    closeMarketPanel();
    if (!first) {
      if (c === coin) return;
      saveDrawings();
      Feed.unsub({ type: 'l2Book', coin });
      Feed.unsub({ type: 'trades', coin });
      Feed.unsub({ type: 'candle', coin, interval });
      clearDrawingsFromChart();
    }
    coin = c;
    savePrefs();
    book = null; trades = [];
    Feed.sub({ type: 'l2Book', coin });
    Feed.sub({ type: 'trades', coin });
    Feed.sub({ type: 'candle', coin, interval });
    document.querySelectorAll('.coinLbl').forEach((e) => (e.textContent = coin));
    $('mkCoin').textContent = coin;
    $('sizeIn').value = ''; $('priceIn').value = ''; $('tpIn').value = ''; $('slIn').value = ''; $('pctRange').value = 0;
    if (otype === 'limit') $('priceIn').value = fp(mids[coin]).replace(/,/g, '');
    lastPrice = 0;
    if (!first) { Analysis.setDaily(c, null); loadDaily(); }
    loadCandles();
    renderBook(); renderTrades(); syncLeverage(); renderLive(); drawTradeLines(); renderFavStar();
  }

  function setChartInterval(iv) {
    if (iv === interval) return;
    Feed.unsub({ type: 'candle', coin, interval });
    interval = iv;
    Analysis.setInterval(iv);
    savePrefs();
    Feed.sub({ type: 'candle', coin, interval });
    renderIntervals();
    loadCandles();
  }

  // Toolbar shows the starred intervals (plus the current one); the dropdown lists all of them.
  function renderIntervals() {
    const order = Object.keys(IV_MS), shown = order.filter((iv) => ivFavs.includes(iv) || iv === interval);
    $('intervals').innerHTML = shown.map((iv) => `<button data-iv="${iv}" class="${iv === interval ? 'active' : ''}" title="${IV_NAME(iv)}">${iv}</button>`).join('')
      + '<button id="ivMore" class="iv-more" title="All time intervals">&#9662;</button>';
  }
  function renderIvPanel() {
    const groups = [['Minutes', /m$/], ['Hours', /h$/], ['Days', /[dwM]$/]];
    $('ivPanel').innerHTML = groups.map(([t, re]) => `<div class="iv-group"><h5>${t}</h5>${Object.keys(IV_MS).filter((iv) => re.test(iv)).map((iv) =>
      `<div class="iv-row${iv === interval ? ' active' : ''}" data-iv="${iv}"><span>${IV_NAME(iv)}</span><button class="iv-star${ivFavs.includes(iv) ? ' on' : ''}" title="${ivFavs.includes(iv) ? 'Remove from toolbar' : 'Pin to toolbar'}">${ivFavs.includes(iv) ? '&#9733;' : '&#9734;'}</button></div>`).join('')}</div>`).join('');
  }

  // ---------- market dropdown ----------
  function renderMarketList() {
    const q = $('marketSearch').value.trim().toUpperCase();
    document.querySelectorAll('#mkFilter button').forEach((b) => b.classList.toggle('active', (b.dataset.f === 'fav') === favOnly));
    const rows = Object.keys(meta)
      .filter((c) => (!q || c.toUpperCase().includes(q)) && (!favOnly || favs.includes(c)))
      .sort((a, b) => (+ctxs[b]?.dayNtlVlm || 0) - (+ctxs[a]?.dayNtlVlm || 0))
      .map((c) => {
        const x = ctxs[c] || {}, p = mids[c], prev = +x.prevDayPx;
        const ch = prev ? ((p - prev) / prev) * 100 : 0;
        const fav = favs.includes(c);
        return `<div class="mk-row${c === coin ? ' sel' : ''}" data-coin="${c}"><span><button class="star${fav ? ' on' : ''}" data-star="${c}" title="${fav ? 'Remove from' : 'Add to'} favorites">${fav ? '&#9733;' : '&#9734;'}</button><b>${c}</b>-USD<span class="lv">${meta[c].maxLeverage}x</span></span><span>${fp(p, c)}</span><span class="${cls(ch)}">${pct(ch)}</span><span>${compact(+x.dayNtlVlm || 0)}</span></div>`;
      });
    $('marketList').innerHTML = rows.join('') || `<div class="empty">${favOnly ? 'No favorites yet. Click a star to add one.' : 'No markets'}</div>`;
  }

  // ---------- favorites ----------
  function toggleFav(c) {
    favs = favs.includes(c) ? favs.filter((x) => x !== c) : [...favs, c];
    saveJSON('pp.favs', favs);
    renderFavBar();
    renderFavStar();
    if (!$('marketPanel').hidden) renderMarketList();
  }
  function renderFavStar() {
    const on = favs.includes(coin);
    $('favBtn').innerHTML = on ? '&#9733;' : '&#9734;';
    $('favBtn').classList.toggle('on', on);
    $('favBtn').title = on ? `Remove ${coin} from favorites` : `Add ${coin} to favorites`;
  }
  function renderFavBar() {
    const list = favs.filter((c) => meta[c]);
    $('favBar').innerHTML = list.length
      ? list.map((c) => {
          const x = ctxs[c] || {}, p = mids[c], prev = +x.prevDayPx, ch = prev ? ((p - prev) / prev) * 100 : 0;
          return `<button class="fav-chip${c === coin ? ' sel' : ''}" data-coin="${c}"><b>${c}</b><span>${fp(p, c)}</span><span class="${cls(ch)}">${pct(ch)}</span></button>`;
        }).join('')
      : '<span class="muted fav-empty">&#9734; Star coins in the market list to pin them here</span>';
  }
  function openMarketPanel() {
    $('marketPanel').hidden = false;
    $('marketSearch').value = '';
    renderMarketList();
    $('marketSearch').focus();
  }
  function closeMarketPanel() { $('marketPanel').hidden = true; }

  // ---------- rendering ----------
  let liveQueued = false, bookQueued = false;
  function scheduleLive() {
    if (liveQueued) return;
    liveQueued = true;
    setTimeout(() => { liveQueued = false; renderLive(); }, 250);
  }
  function scheduleBook() {
    if (bookQueued) return;
    bookQueued = true;
    requestAnimationFrame(() => { bookQueued = false; renderBook(); });
  }

  function renderLive() {
    renderHeader();
    for (const sc of subCharts) sc.tick();
    renderFavBar();
    updateTicket();
    renderAccount();
    if (bottomTab === 'positions') renderBottom();
  }

  function renderHeader() {
    const p = mids[coin], x = ctxs[coin] || {};
    const el = $('stPrice');
    el.textContent = fp(p);
    if (lastPrice && p !== lastPrice) el.className = 'price ' + (p > lastPrice ? 'up' : 'down');
    lastPrice = p;
    $('stMark').textContent = fp(+x.markPx);
    $('stOracle').textContent = fp(+x.oraclePx);
    const prev = +x.prevDayPx, ch = prev ? p - prev : 0;
    $('stChange').innerHTML = `<span class="${cls(ch)}">${prev ? fp(ch) + ' / ' + pct((ch / prev) * 100) : '-'}</span>`;
    $('stVol').textContent = x.dayNtlVlm ? compact(+x.dayNtlVlm) : '-';
    $('stOI').textContent = x.openInterest ? compact(+x.openInterest * +x.markPx) : '-';
    const f = +x.funding * 100;
    $('stFund').innerHTML = x.funding != null ? `<span class="${cls(f)}">${f.toFixed(4)}%</span>` : '-';
    document.title = `${fp(p)} ${coin} | PaperPerps`;
  }

  function tickCountdown() {
    const now = Date.now(), left = Math.ceil(now / 36e5) * 36e5 - now;
    const m = Math.floor(left / 6e4), s = Math.floor((left % 6e4) / 1000);
    $('stCountdown').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function renderBook() {
    const asksEl = $('asks'), bidsEl = $('bids');
    if (!book) {
      asksEl.innerHTML = bidsEl.innerHTML = '';
      $('spread').textContent = 'Loading order book...';
      return;
    }
    const rows = Math.max(4, Math.floor((asksEl.parentElement.clientHeight - 60) / 2 / 21));
    const cum = (levels) => { let t = 0; return levels.slice(0, rows).map(([px, sz]) => [px, sz, (t += sz)]); };
    const asks = cum(book.asks), bids = cum(book.bids);
    const max = Math.max(asks.at(-1)?.[2] || 0, bids.at(-1)?.[2] || 0) || 1;
    const sd = meta[coin]?.szDecimals ?? 2;
    const row = ([px, sz, t]) =>
      `<div class="lvl" data-px="${px}"><div class="bar" style="width:${(t / max) * 100}%"></div><span>${fp(px)}</span><span>${nf(sz, sd)}</span><span>${nf(t, sd)}</span></div>`;
    asksEl.innerHTML = asks.slice().reverse().map(row).join('');
    bidsEl.innerHTML = bids.map(row).join('');
    const a = book.asks[0]?.[0], b = book.bids[0]?.[0];
    if (a && b) $('spread').innerHTML = `<span>Spread</span><b>${nf(a - b, pxDec(coin, a))}</b><span>${(((a - b) / a) * 100).toFixed(3)}%</span>`;
  }

  function renderTrades() {
    const sd = meta[coin]?.szDecimals ?? 2;
    $('tradesList').innerHTML = trades.length
      ? trades.map((t) => `<div class="lvl" data-px="${t.px}"><span class="${t.side === 'B' ? 'up' : 'down'}">${fp(+t.px)}</span><span>${nf(+t.sz, sd)}</span><span class="muted">${hhmmss(t.time)}</span></div>`).join('')
      : '<div class="empty">Waiting for trades...</div>';
  }

  // ---------- ticket ----------
  const refPx = () => {
    const lp = num($('priceIn'));
    if (otype === 'limit' && lp > 0) return lp;
    const top = side > 0 ? book?.asks?.[0]?.[0] : book?.bids?.[0]?.[0];
    return top || mids[coin];
  };
  const roundSz = (sz) => { const f = 10 ** (meta[coin]?.szDecimals ?? 4); return Math.floor(sz * f + 1e-9) / f; };
  const sizeCoins = () => {
    const v = num($('sizeIn'));
    if (!(v > 0)) return 0;
    return unit === 'USD' ? v / refPx() : v;
  };
  const oppositePos = () => { const p = Engine.state.positions[coin]; return p && p.dir !== side ? p : null; };

  function maxSizeFor(pctVal) {
    const px = refPx();
    if (!px) return 0;
    if ($('reduceOnly').checked) { const p = oppositePos(); return p ? p.size * pctVal : 0; }
    const L = Engine.lev(coin), avail = Engine.totals().available;
    const opp = oppositePos();
    // Closing an opposite position frees its size before new margin is needed.
    return ((avail * L) / (1 + L * Engine.TAKER) / px) * pctVal + (opp ? opp.size : 0) * pctVal;
  }

  function setSizeFromPct(p) {
    const sz = roundSz(maxSizeFor(p / 100));
    const px = refPx();
    $('sizeIn').value = sz > 0 ? (unit === 'USD' ? (sz * px).toFixed(2) : String(sz)) : '';
    updateTicket();
  }

  function updateTicket() {
    const t = Engine.totals(), pos = Engine.state.positions[coin], L = Engine.lev(coin);
    $('tkAvail').textContent = usd(t.available);
    $('tkPos').innerHTML = pos ? `<span class="${pos.dir > 0 ? 'up' : 'down'}">${pos.dir > 0 ? '' : '-'}${fsz(pos.size)} ${coin}</span>` : '<span class="muted">None</span>';
    $('levVal').textContent = L + 'x';
    $('unitBtn').textContent = unit === 'USD' ? 'USD' : coin;
    $('submitBtn').textContent = `${$('reduceOnly').checked ? 'Reduce' : side > 0 ? 'Long' : 'Short'} ${coin}`;
    $('submitBtn').className = 'submit ' + (side > 0 ? 'long' : 'short');

    const px = refPx(), sz = roundSz(sizeCoins());
    $('sizeAlt').textContent = sz > 0 ? (unit === 'USD' ? `= ${fsz(sz)} ${coin}` : `= ${usd(sz * px)}`) : '';
    if (!(sz > 0) || !px) {
      ['sumValue', 'sumMargin', 'sumLiq', 'sumFee'].forEach((id) => ($(id).textContent = '-'));
      $('tpHint').textContent = $('slHint').textContent = '';
      return;
    }
    const value = sz * px;
    const reduce = $('reduceOnly').checked;
    const opp = oppositePos();
    const opening = reduce ? 0 : opp ? Math.max(0, sz - opp.size) : sz;
    const resting = otype === 'limit' && (side > 0 ? px < (book?.asks?.[0]?.[0] ?? Infinity) : px > (book?.bids?.[0]?.[0] ?? 0));
    $('sumValue').textContent = usd(value);
    $('sumMargin').textContent = usd((opening * px) / L);
    const liq = reduce && !opp ? null : Engine.previewLiq(coin, side, sz, px);
    $('sumLiq').innerHTML = liq && liq > 0 ? `<span style="color:var(--orange)">${fp(liq)}</span>` : '-';
    $('sumFee').textContent = usd(value * (resting ? Engine.MAKER : Engine.TAKER)) + (resting ? ' (maker)' : ' (taker)');

    const margin = (sz * px) / L;
    const hint = (target, el) => {
      if (!(target > 0)) { el.textContent = ''; return; }
      const pnl = sz * (target - px) * side;
      el.innerHTML = `Est. PnL <span class="${cls(pnl)}">${usd(pnl, true)} (${pct((pnl / margin) * 100)} ROE)</span>`;
    };
    hint(num($('tpIn')), $('tpHint'));
    hint(num($('slIn')), $('slHint'));
  }

  function syncLeverage() {
    const r = $('levRange'), hasPos = !!Engine.state.positions[coin];
    r.max = Engine.maxLev(coin);
    r.value = Engine.lev(coin);
    r.disabled = hasPos;
    $('levNote').textContent = hasPos ? 'Locked while you have an open position on ' + coin : `Max ${Engine.maxLev(coin)}x on ${coin}`;
  }

  function submitOrder() {
    const sz = roundSz(sizeCoins());
    if (!(sz > 0)) return toast(`Size is below the minimum for ${coin}`, 'bad');
    const px = refPx();
    let tp = null, sl = null;
    if ($('tpslChk').checked) {
      tp = num($('tpIn')) || null;
      sl = num($('slIn')) || null;
      if (tp && (side > 0 ? tp <= px : tp >= px)) return toast(`Take profit must be ${side > 0 ? 'above' : 'below'} your entry price`, 'bad');
      if (sl && (side > 0 ? sl >= px : sl <= px)) return toast(`Stop loss must be ${side > 0 ? 'below' : 'above'} your entry price`, 'bad');
    }
    const note = $('noteIn').value.trim() || null;
    const r = Engine.place({ coin, dir: side, type: otype, size: sz, price: num($('priceIn')), reduceOnly: $('reduceOnly').checked, tp, sl, note }, book);
    toast(r.msg, r.ok ? 'ok' : 'bad');
    if (r.ok) { $('sizeIn').value = ''; $('pctRange').value = 0; $('noteIn').value = ''; updateTicket(); }
  }

  function renderAccount() {
    const t = Engine.totals(), total = t.equity - Engine.state.start;
    $('acEquity').textContent = usd(t.equity);
    $('acWallet').textContent = usd(t.wallet + t.marginUsed);
    $('acUpnl').innerHTML = `<span class="${cls(t.upnl)}">${usd(t.upnl, true)}</span>`;
    $('acMargin').textContent = usd(t.marginUsed);
    $('acAvail').textContent = usd(t.available);
    $('acTotal').innerHTML = `<span class="${cls(total)}">${usd(total, true)} (${pct((total / Engine.state.start) * 100)})</span>`;
  }

  // ---------- bottom tables ----------
  const table = (head, rows, emptyMsg) =>
    rows.length
      ? `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
      : `<div class="empty">${emptyMsg}</div>`;
  const coinCell = (c, tag) => `<td><span class="coin-link" data-coin="${c}">${c}</span>${tag}</td>`;

  function renderBottom() {
    const s = Engine.state, posList = Object.values(s.positions);
    $('cntPos').textContent = posList.length ? `(${posList.length})` : '';
    $('cntOrd').textContent = s.orders.length ? `(${s.orders.length})` : '';
    let html = '';

    if (bottomTab === 'positions') {
      html = table(
        ['Market', 'Size', 'Value', 'Entry', 'Mark', 'Liq. price', 'Margin', 'PnL (ROE)', 'TP / SL', ''],
        posList.map((p) => {
          const m = mids[p.coin] ?? p.entry, pnl = Engine.upnl(p, m);
          return `<tr>${coinCell(p.coin, sideTag(p.dir, ' ' + p.lev + 'x'))}
            <td>${fsz(p.size, p.coin)} ${p.coin}</td><td>${usd(p.size * m)}</td>
            <td>${fp(p.entry, p.coin)}</td><td>${fp(m, p.coin)}</td>
            <td style="color:var(--orange)">${fp(Engine.liqPrice(p), p.coin)}</td><td>${usd(p.margin)}</td>
            <td class="${cls(pnl)}">${usd(pnl, true)} (${pct((pnl / p.margin) * 100)})</td>
            <td>${p.tp ? fp(p.tp, p.coin) : '-'} / ${p.sl ? fp(p.sl, p.coin) : '-'}</td>
            <td><button class="act" data-act="tpsl" data-coin="${p.coin}">TP/SL</button><button class="act" data-act="half" data-coin="${p.coin}">Close 50%</button><button class="act danger" data-act="close" data-coin="${p.coin}">Close</button></td></tr>`;
        }),
        'No open positions',
      );
    } else if (bottomTab === 'orders') {
      html = table(
        ['Time', 'Market', 'Type', 'Size', 'Price', 'Value', 'TP / SL', s.orders.length ? '<button class="act danger" data-act="cancelAll">Cancel all</button>' : ''],
        s.orders.map((o) => `<tr><td>${when(o.time)}</td>${coinCell(o.coin, sideTag(o.dir))}
          <td>Limit${o.reduceOnly ? ' (reduce only)' : ''}</td><td>${fsz(o.size, o.coin)} ${o.coin}</td><td>${fp(o.price, o.coin)}</td>
          <td>${usd(o.size * o.price)}</td><td>${o.tp ? fp(o.tp, o.coin) : '-'} / ${o.sl ? fp(o.sl, o.coin) : '-'}</td>
          <td><button class="act danger" data-act="cancel" data-id="${o.id}">Cancel</button></td></tr>`),
        'No open orders',
      );
    } else if (bottomTab === 'fills') {
      html = table(
        ['Time', 'Market', 'Side', 'Type', 'Size', 'Price', 'Value', 'Fee', 'Realized PnL'],
        s.fills.slice(0, 300).map((f) => `<tr><td>${when(f.time)}</td>${coinCell(f.coin, '')}
          <td class="${f.dir > 0 ? 'up' : 'down'}">${f.dir > 0 ? 'Buy' : 'Sell'}</td><td>${f.kind}</td>
          <td>${fsz(f.size, f.coin)}</td><td>${fp(f.px, f.coin)}</td><td>${usd(f.size * f.px)}</td><td>${usd(f.fee)}</td>
          <td class="${cls(f.pnl)}">${f.pnl ? usd(f.pnl, true) : '-'}</td></tr>`),
        'No trades yet',
      );
    } else {
      const c = s.closed, nets = c.map((x) => x.pnl - x.fees);
      const wins = nets.filter((n) => n > 0), losses = nets.filter((n) => n <= 0);
      const sum = (a) => a.reduce((x, y) => x + y, 0);
      const bar = c.length
        ? `<div class="stats-bar"><span>Trades <b>${c.length}</b></span><span>Win rate <b>${((wins.length / c.length) * 100).toFixed(1)}%</b></span>
          <span>Net PnL <b class="${cls(sum(nets))}">${usd(sum(nets), true)}</b></span>
          <span>Avg win <b class="up">${wins.length ? usd(sum(wins) / wins.length, true) : '-'}</b></span>
          <span>Avg loss <b class="down">${losses.length ? usd(sum(losses) / losses.length, true) : '-'}</b></span>
          <span>Best <b class="${cls(Math.max(...nets))}">${usd(Math.max(...nets), true)}</b></span>
          <span>Worst <b class="${cls(Math.min(...nets))}">${usd(Math.min(...nets), true)}</b></span></div>`
        : '';
      html = bar + table(
        ['Closed', 'Market', 'Size', 'Entry', 'Exit', 'Reason', 'Held', 'Fees', 'Net PnL', ''],
        c.slice(0, 300).map((x) => {
          const net = x.pnl - x.fees;
          return `<tr><td>${when(x.closed)}</td>${coinCell(x.coin, sideTag(x.dir, ' ' + x.lev + 'x'))}
            <td>${fsz(x.size, x.coin)}</td><td>${fp(x.entry, x.coin)}</td><td>${fp(x.exit, x.coin)}</td>
            <td${x.reason === 'Liquidated' ? ' style="color:var(--orange)"' : ''}>${x.reason}</td><td>${held(x.closed - x.opened)}</td>
            <td>${usd(x.fees)}</td><td class="${cls(net)}">${usd(net, true)} (${pct((net / ((x.size * x.entry) / x.lev)) * 100)})</td>
            <td><button class="act" data-act="journal" data-jid="${s.created}-${x.id}">Journal</button></td></tr>`;
        }),
        'No closed trades yet',
      );
    }
    $('bottomBody').innerHTML = html;
  }

  function tpslModal(c) {
    const p = Engine.state.positions[c];
    if (!p) return;
    modal(
      `<h3>TP / SL for ${c} ${p.dir > 0 ? 'long' : 'short'}</h3>
       <p>Entry ${fp(p.entry, c)} | Mark ${fp(mids[c], c)} | Liq. ${fp(Engine.liqPrice(p), c)}</p>
       <div class="field"><label>Take profit price</label><input id="mTp" value="${p.tp ?? ''}"></div>
       <div class="field"><label>Stop loss price</label><input id="mSl" value="${p.sl ?? ''}"></div>
       <div class="modal-btns"><button id="mClear">Remove both</button><button data-close>Cancel</button><button class="primary" id="mSave">Save</button></div>`,
      (close) => {
        $('mSave').onclick = () => {
          const r = Engine.setTpSl(c, num($('mTp')) || null, num($('mSl')) || null);
          toast(r.msg, r.ok ? 'ok' : 'bad');
          if (r.ok) close();
        };
        $('mClear').onclick = () => { Engine.setTpSl(c, null, null); toast('TP/SL removed', 'ok'); close(); };
      },
    );
  }

  function settingsModal() {
    const saved = { ...colors };
    const draft = { ...colors };
    const FIELDS = [
      ['upBody', 'Bullish (up) candle body'],
      ['upWick', 'Bullish (up) wick'],
      ['downBody', 'Bearish (down) candle body'],
      ['downWick', 'Bearish (down) wick'],
      ['bg', 'Chart background'],
    ];
    const row = ([k, label]) =>
      `<div class="color-row"><span>${label}</span><input type="color" data-k="${k}" value="${draft[k]}"><input class="hex" data-hex="${k}" value="${draft[k]}" maxlength="7" spellcheck="false"></div>`;
    modal(
      `<h3>Settings</h3>
       <div class="set-section">
         <h4>Chart customization</h4>
         <p>Colors for the Trading Chart tab. Changes preview live; press Save to keep them. (Crayon Charts has its own color settings.)</p>
         <div class="set-grid">
           <div class="color-rows">${FIELDS.map(row).join('')}</div>
           <div class="candle-preview" id="cPrev">
             <div class="pc"><i class="w"></i><b></b></div>
             <div class="pc dn"><i class="w"></i><b></b></div>
             <div class="pc"><i class="w"></i><b></b></div>
           </div>
         </div>
       </div>
       <div class="modal-btns"><button id="cDefaults" style="margin-right:auto">Reset to defaults</button><button data-close>Cancel</button><button class="primary" id="cSave">Save</button></div>`,
      (close) => {
        const paint = () => {
          applyChartColors(draft);
          const pv = $('cPrev');
          pv.style.background = draft.bg;
          pv.querySelectorAll('.pc').forEach((el) => {
            const dn = el.classList.contains('dn');
            el.querySelector('b').style.background = dn ? draft.downBody : draft.upBody;
            el.querySelector('i').style.background = dn ? draft.downWick : draft.upWick;
          });
          $('modal').querySelectorAll('[data-k]').forEach((el) => (el.value = draft[el.dataset.k]));
          $('modal').querySelectorAll('[data-hex]').forEach((el) => { if (document.activeElement !== el) el.value = draft[el.dataset.hex]; });
        };
        $('modal').addEventListener('input', (e) => {
          const k = e.target.dataset.k || e.target.dataset.hex;
          if (!k) return;
          let v = e.target.value.trim();
          if (e.target.dataset.hex) {
            if (!v.startsWith('#')) v = '#' + v;
            if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
          }
          draft[k] = v.toLowerCase();
          paint();
        });
        $('cDefaults').onclick = () => { Object.assign(draft, DEFAULT_COLORS); paint(); };
        $('cSave').onclick = () => {
          colors = { ...draft };
          saveJSON('pp.colors', colors);
          toast('Chart colors saved', 'ok');
          close();
        };
        paint();
      },
      { wide: true, onDismiss: () => applyChartColors(saved) },
    );
  }

  function resetModal() {
    modal(
      `<h3>Reset paper account</h3>
       <p>This closes all positions, cancels all orders and wipes your trade history. Choose a new starting balance.</p>
       <div class="field"><label>Starting balance (USD)</label><input id="mStart" value="${Engine.state.start}"></div>
       <div class="modal-btns"><button data-close>Cancel</button><button class="danger" id="mReset">Reset</button></div>`,
      (close) => {
        $('mReset').onclick = () => {
          const v = num($('mStart'));
          if (!(v >= 100)) return toast('Starting balance must be at least $100', 'bad');
          Engine.reset(v);
          lastFillId = 0;
          toast('Account reset to ' + usd(v), 'ok');
          close();
        };
      },
    );
  }

  // ---------- engine change: persist + redraw ----------
  let saveTimer = null;
  function onEngineChange(s) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => api.save(s), 300);
    // Announce fills the user didn't click for (limit fills, TP/SL, liquidations).
    const auto = { Limit: 'ok', 'Take profit': 'ok', 'Stop loss': 'bad', Liquidation: 'bad' };
    for (const f of s.fills) {
      if (f.id <= lastFillId) break;
      if (auto[f.kind]) toast(`${f.kind}: ${f.dir > 0 ? 'bought' : 'sold'} ${fsz(f.size, f.coin)} ${f.coin} @ ${fp(f.px, f.coin)}`, auto[f.kind]);
    }
    lastFillId = s.fills[0]?.id || 0;
    drawTradeLines();
    for (const e of Journal.sync(s)) {
      const t = e.trade, v = t.pnl - t.fees;
      captureTrade(t).then((url) => url && Journal.addShot(e.id, url));
      toast(`Closed ${t.coin} ${t.dir > 0 ? 'long' : 'short'}: ${usd(v, true)}`, v >= 0 ? 'ok' : 'bad', { label: 'Journal it', run: () => Journal.open(e.id) });
    }
    syncLeverage();
    renderBottom();
    updateTicket();
    renderAccount();
  }

  // ---------- wiring ----------
  function bindUI() {
    renderIntervals();
    $('intervals').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'ivMore') { e.stopPropagation(); renderIvPanel(); $('ivPanel').hidden = !$('ivPanel').hidden; return; }
      if (b.dataset.iv) setChartInterval(b.dataset.iv);
    };
    $('ivPanel').onclick = (e) => {
      e.stopPropagation();
      const star = e.target.closest('.iv-star'), row = e.target.closest('[data-iv]');
      if (!row) return;
      const iv = row.dataset.iv;
      if (star) {
        ivFavs = ivFavs.includes(iv) ? ivFavs.filter((x) => x !== iv) : [...ivFavs, iv];
        savePrefs(); renderIntervals(); renderIvPanel();
      } else { setChartInterval(iv); $('ivPanel').hidden = true; }
    };

    // Indicators menu (grouped like Crayon's) plus a chip for each active one.
    const renderIndChips = () => {
      $('indChips').innerHTML = INDICATORS.filter((i) => inds[i.name])
        .map((i) => `<span class="ind-chip">${i.label}<button data-off="${i.name}" title="Remove ${i.label}">&#10005;</button></span>`).join('');
    };
    const renderIndPanel = () => {
      const groups = [...new Set(INDICATORS.map((i) => i.group))];
      $('indPanel').innerHTML = groups.map((g) => `<div class="ind-col"><h5>${g}</h5>${INDICATORS.filter((i) => i.group === g)
        .map((i) => `<button data-ind="${i.name}" class="${inds[i.name] ? 'on' : ''}"><span class="tick">${inds[i.name] ? '&#10003;' : ''}</span>${i.label}</button>`).join('')}</div>`).join('');
    };
    const toggleInd = (name) => {
      const ind = INDICATORS.find((i) => i.name === name);
      if (!ind) return;
      inds[name] = !inds[name];
      inds[name] ? addIndicator(ind) : removeIndicator(ind);
      savePrefs();
      renderIndChips();
      renderIndPanel();
    };
    $('indBtn').onclick = (e) => { e.stopPropagation(); renderIndPanel(); $('indPanel').hidden = !$('indPanel').hidden; };
    $('indPanel').onclick = (e) => { e.stopPropagation(); const b = e.target.closest('[data-ind]'); if (b) toggleInd(b.dataset.ind); };
    $('indChips').onclick = (e) => { const b = e.target.closest('[data-off]'); if (b) toggleInd(b.dataset.off); };
    renderIndChips();

    const icon = (i) => `<svg viewBox="0 0 18 18">${i}</svg>`;
    const pickOf = (g) => g.tools.find((t) => t.n === toolPick[g.id]) || g.tools[0];
    const renderTools = () => {
      const I = {
        fx: '<text x="3" y="14" font-size="13" font-style="italic" font-family="Georgia, serif" fill="currentColor" stroke="none">fx</text>',
        eye: drawingsHidden
          ? '<path d="M1 9 C4 4 14 4 17 9 C14 14 4 14 1 9 Z"/><circle cx="9" cy="9" r="2.5"/><path d="M2 16 L16 2"/>'
          : '<path d="M1 9 C4 4 14 4 17 9 C14 14 4 14 1 9 Z"/><circle cx="9" cy="9" r="2.5"/>',
        magnet: '<path d="M4 2 v7 a5 5 0 0 0 10 0 v-7"/><path d="M4 5 h3 M11 5 h3"/>',
        lock: '<path d="M3 14 L11 6 L13 8 L5 16 H3 Z"/><rect x="11" y="12" width="6" height="5" rx="1"/><path d="M12.5 12 V10.5 a1.5 1.5 0 0 1 3 0 V12"/>',
        undo: '<path d="M6 4 L2 8 L6 12"/><path d="M2 8 H11 a5 5 0 0 1 0 10"/>',
        redo: '<path d="M12 4 L16 8 L12 12"/><path d="M16 8 H7 a5 5 0 0 0 0 10"/>',
      };
      $('drawTools').innerHTML =
        TOOL_GROUPS.map((g) => {
          const t = pickOf(g);
          return `<div class="tg"><button class="tg-main" data-tool="${t.n}" title="${t.t}">${icon(t.i)}</button>${g.tools.length > 1 ? `<button class="tg-corner" data-more="${g.id}" title="More tools"></button>` : ''}</div>`;
        }).join('') +
        `<div class="gap"></div>
         <button id="fxBtn" title="Indicators">${icon(I.fx)}</button>
         <button id="hideDraw" class="${drawingsHidden ? 'active' : ''}" title="${drawingsHidden ? 'Show' : 'Hide'} the drawings">${icon(I.eye)}</button>
         <button id="magnetBtn" class="${magnet ? 'active' : ''}" title="Magnet: snap to candle prices">${icon(I.magnet)}</button>
         <button id="lockAll" class="${drawingsLocked ? 'active' : ''}" title="${drawingsLocked ? 'Unlock' : 'Lock'} all drawings">${icon(I.lock)}</button>
         <div class="tg"><button id="colorBtn" class="tg-main" title="Drawing colour (also recolours the selected drawing)"><span class="color-dot"></span></button></div>
         <div class="gap"></div>
         <button id="undoBtn" title="Undo (Ctrl+Z)">${icon(I.undo)}</button>
         <button id="redoBtn" title="Redo (Ctrl+Y)">${icon(I.redo)}</button>`;
      $('colorBtn').style.setProperty('--dc', drawColor);
      syncUndo();
    };
    renderTools();
    const flyAt = (anchor, html) => {
      const r = anchor.getBoundingClientRect();
      $('toolFly').innerHTML = html;
      $('toolFly').style.left = r.right + 6 + 'px';
      $('toolFly').style.top = r.top - 4 + 'px';
      $('toolFly').hidden = false;
    };
    $('drawTools').onclick = (e) => {
      e.stopPropagation();
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.more) {
        const g = TOOL_GROUPS.find((x) => x.id === b.dataset.more);
        return flyAt(b, g.tools.map((t) => `<button data-pick="${g.id}:${t.n}">${icon(t.i)}<span>${t.t}</span></button>`).join(''));
      }
      $('toolFly').hidden = true;
      if (b.dataset.tool) startDrawing(b.dataset.tool);
      else if (b.id === 'colorBtn') flyAt(b, `<div class="swatches">${DRAW_COLORS.map((c) => `<button data-color="${c}" style="background:${c}" class="${c === drawColor ? 'on' : ''}"></button>`).join('')}</div>`);
      else if (b.id === 'magnetBtn') { magnet = !magnet; b.classList.toggle('active', magnet); }
      else if (b.id === 'hideDraw') { setDrawingsHidden(!drawingsHidden); renderTools(); }
      else if (b.id === 'fxBtn') $('indBtn').click();
      else if (b.id === 'lockAll') {
        drawingsLocked = !drawingsLocked;
        savePrefs();
        for (const t of allTargets()) for (const id of t.ids) { const o = t.k?.getOverlayById(id); if (o) t.k.overrideOverlay({ id, lock: drawingsLocked || !!o.extendData?.locked }); }
        renderTools();
        toast(drawingsLocked ? 'All drawings locked' : 'Drawings unlocked');
      }
      else if (b.id === 'undoBtn') stepHistory(-1);
      else if (b.id === 'redoBtn') stepHistory(1);
    };
    $('toolFly').onclick = (e) => {
      e.stopPropagation();
      const pick = e.target.closest('[data-pick]'), col = e.target.closest('[data-color]');
      if (pick) {
        const [gid, n] = pick.dataset.pick.split(':');
        toolPick[gid] = n;
        savePrefs();
        renderTools();
        $('toolFly').hidden = true;
        startDrawing(n);
      } else if (col) {
        setDrawColor(col.dataset.color);
        $('toolFly').hidden = true;
      }
    };
    document.addEventListener('click', () => { $('ivPanel').hidden = true; $('toolFly').hidden = true; $('indPanel').hidden = true; $('alertPanel').hidden = true; $('treePanel').hidden = true; $('ctxMenu').hidden = true; });
    document.addEventListener('pp-inds-changed', () => renderIndChips());

    // Right-click menus. The chart library reports drawing right-clicks first (onRightClick).
    $('chartGrid').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const cell = e.target.closest('#kchart, .sub-chart');
      if (!cell || e.target.closest('.sub-head')) return;
      const id = ctxDrawing;
      ctxDrawing = null;
      const items = (id && drawingMenu(id)) || chartMenu(e, cell);
      ['toolFly', 'indPanel', 'alertPanel', 'treePanel'].forEach((p) => ($(p).hidden = true));
      showMenu(e.clientX, e.clientY, items);
    });
    // Alt+click maximizes a chart in a multi-chart layout.
    $('chartGrid').addEventListener('click', (e) => {
      if (!e.altKey) return;
      const cell = e.target.closest('#kchart, .sub-chart');
      if (cell && !e.target.closest('.sub-head')) toggleMaximize(cell);
    }, true);
    $('shotBtn').onclick = saveScreenshot;

    // Alerts panel
    $('alertBtn').onclick = (e) => { e.stopPropagation(); $('alertPanel').hidden ? openAlertPanel() : ($('alertPanel').hidden = true); };
    $('alertPanel').onclick = (e) => {
      e.stopPropagation();
      const del = e.target.closest('[data-del]'), link = e.target.closest('.coin-link');
      if (del) removeAlert(del.dataset.del);
      else if (link) { $('alertPanel').hidden = true; setCoin(link.dataset.coin); }
      else if (e.target.id === 'alClear') { alerts = alerts.filter((a) => !a.triggered); saveAlerts(); renderAlerts(); }
    };
    const submitAlert = () => { addAlert(coin, num($('alPrice')), $('alNote').value); $('alNote').value = ''; };
    $('alAdd').onclick = submitAlert;
    $('alPrice').onkeydown = $('alNote').onkeydown = (e) => { if (e.key === 'Enter') submitAlert(); };
    renderAlerts();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});

    // Object tree
    $('treeBtn').onclick = (e) => { e.stopPropagation(); $('treePanel').hidden = !$('treePanel').hidden; renderTree(); };
    $('treePanel').onclick = (e) => {
      e.stopPropagation();
      const b = e.target.closest('button');
      if (!b) return;
      const id = b.dataset.tvis || b.dataset.tlock || b.dataset.tdel;
      const ch = DT.k, o = id && ch?.getOverlayById(id);
      if (b.dataset.tvis && o) {
        const hidden = !o.extendData?.hidden;
        ch.overrideOverlay({ id, extendData: { ...o.extendData, hidden }, visible: !hidden && !drawingsHidden });
      } else if (b.dataset.tlock && o) {
        ch.overrideOverlay({ id, lock: !o.lock, extendData: { ...o.extendData, locked: !o.lock } });
      } else if (b.dataset.tdel && o) {
        ch.removeOverlay(id);
      } else if (b.dataset.tind) {
        const ind = INDICATORS.find((i) => i.name === b.dataset.tind);
        inds[ind.name] = false;
        removeIndicator(ind);
        savePrefs();
        renderIndChips();
      }
      saveDrawings();
      renderTree();
    };

    // Layouts
    $('layoutBtn').onclick = (e) => {
      e.stopPropagation();
      const r = e.currentTarget.getBoundingClientRect();
      $('toolFly').innerHTML = LAYOUTS.map((l) => `<button data-layout="${l.id}" class="${l.id === layout.mode ? 'on' : ''}"><svg viewBox="0 0 18 18">${l.i}</svg><span>${l.t}</span></button>`).join('');
      $('toolFly').style.left = Math.min(r.left, window.innerWidth - 260) + 'px';
      $('toolFly').style.top = r.bottom + 4 + 'px';
      $('toolFly').hidden = false;
    };
    $('toolFly').addEventListener('click', (e) => {
      const b = e.target.closest('[data-layout]');
      if (!b) return;
      setLayout(b.dataset.layout);
      $('toolFly').hidden = true;
    });
    setLayout(layout.mode || '1');
    $('kchart').addEventListener('mousemove', (e) => { const r = $('kchart').getBoundingClientRect(); pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; });
    $('kchart').addEventListener('mouseleave', () => { pointer = null; });
    $('logBtn').onclick = () => setLogScale(!logScale);
    $('logBtn').classList.toggle('active', logScale);

    $('chartTabs').onclick = (e) => {
      const tab = e.target.dataset.tab;
      if (!tab) return;
      document.querySelectorAll('#chartTabs button').forEach((b) => b.classList.toggle('active', b === e.target));
      const tv = tab === 'tv';
      document.body.classList.toggle('tv-mode', tv);
      $('chartGrid').hidden = tv;
      $('tvchart').hidden = !tv;
      if (tv) buildCrayon(); else chart.resize();
    };

    $('bookTabs').onclick = (e) => {
      const tab = e.target.dataset.tab;
      if (!tab) return;
      document.querySelectorAll('#bookTabs button').forEach((b) => b.classList.toggle('active', b === e.target));
      $('bookView').hidden = tab !== 'book';
      $('tradesView').hidden = tab !== 'trades';
      if (tab === 'trades') renderTrades(); else renderBook();
    };
    const setBookCollapsed = (v) => {
      bookCollapsed = v;
      document.body.classList.toggle('book-collapsed', v);
      savePrefs();
      if (!v) requestAnimationFrame(renderBook);
    };
    $('bookCollapse').onclick = () => setBookCollapsed(true);
    $('bookExpand').onclick = () => setBookCollapsed(false);
    document.body.classList.toggle('book-collapsed', bookCollapsed);

    // Drag the top edge of the Positions panel to resize it; double-click resets.
    const maxBottom = () => Math.max(120, $('layout').clientHeight - 220);
    const setBottomH = (h, save) => {
      bottomH = Math.round(Math.min(Math.max(h, 36), maxBottom()));
      $('layout').style.setProperty('--bottom-h', bottomH + 'px');
      if (save) savePrefs();
    };
    setBottomH(bottomH, false);
    window.addEventListener('resize', () => setBottomH(bottomH, false));
    // Pointer capture keeps the drag going wherever the mouse goes (over the chart, book, off the window).
    const grip = $('bottomResize');
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const y0 = e.clientY, h0 = bottomH;
      grip.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing-v');
      const move = (ev) => setBottomH(h0 + (y0 - ev.clientY), false);
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('lostpointercapture', up);
        document.body.classList.remove('resizing-v');
        savePrefs();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('lostpointercapture', up);
    });
    $('bottomResize').ondblclick = () => setBottomH(270, true);

    // Clicking a price in the book or trades fills a limit order at that price.
    $('bookPanel').addEventListener('click', (e) => {
      const lvl = e.target.closest('.lvl');
      if (!lvl) return;
      setType('limit');
      $('priceIn').value = lvl.dataset.px;
      updateTicket();
    });

    $('bottomTabs').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      bottomTab = b.dataset.tab;
      document.querySelectorAll('#bottomTabs button').forEach((x) => x.classList.toggle('active', x === b));
      renderBottom();
    };
    $('bottomBody').onclick = (e) => {
      const link = e.target.closest('.coin-link');
      if (link) return setCoin(link.dataset.coin);
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const c = b.dataset.coin, act = b.dataset.act;
      const r =
        act === 'close' ? Engine.closePosition(c, 1, c === coin ? book : null)
        : act === 'half' ? Engine.closePosition(c, 0.5, c === coin ? book : null)
        : act === 'cancel' ? (Engine.cancel(+b.dataset.id), { ok: true, msg: 'Order cancelled' })
        : act === 'cancelAll' ? (Engine.cancelAll(), { ok: true, msg: 'All orders cancelled' })
        : null;
      if (act === 'tpsl') tpslModal(c);
      if (act === 'journal') Journal.open(b.dataset.jid);
      // A successful close is announced by the journal's "Closed ... Journal it" toast instead.
      if (r && !(r.ok && (act === 'close' || act === 'half'))) toast(r.msg, r.ok ? 'ok' : 'bad');
    };

    // Ticket
    const setSide = (d) => {
      side = d;
      $('sideLong').classList.toggle('active', d > 0);
      $('sideShort').classList.toggle('active', d < 0);
      updateTicket();
    };
    $('sideLong').onclick = () => setSide(1);
    $('sideShort').onclick = () => setSide(-1);
    const setType = (t) => {
      otype = t;
      document.querySelectorAll('#typeTabs button').forEach((b) => b.classList.toggle('active', b.dataset.type === t));
      $('priceField').hidden = t !== 'limit';
      if (t === 'limit' && !$('priceIn').value) $('priceIn').value = fp(mids[coin]).replace(/,/g, '');
      updateTicket();
    };
    $('typeTabs').onclick = (e) => { if (e.target.dataset.type) setType(e.target.dataset.type); };
    $('midBtn').onclick = () => {
      const a = book?.asks?.[0]?.[0], b = book?.bids?.[0]?.[0];
      $('priceIn').value = fp(a && b ? (a + b) / 2 : mids[coin]).replace(/,/g, '');
      updateTicket();
    };
    $('unitBtn').onclick = () => {
      const sz = roundSz(sizeCoins()), px = refPx();
      unit = unit === 'USD' ? 'COIN' : 'USD';
      if (sz > 0) $('sizeIn').value = unit === 'USD' ? (sz * px).toFixed(2) : String(sz);
      savePrefs();
      updateTicket();
    };
    $('levRange').oninput = () => { $('levVal').textContent = $('levRange').value + 'x'; };
    $('levRange').onchange = () => {
      const r = Engine.setLeverage(coin, +$('levRange').value);
      if (!r.ok) toast(r.msg, 'bad');
      syncLeverage();
      updateTicket();
    };
    $('pctRange').oninput = () => setSizeFromPct(+$('pctRange').value);
    $('pctMarks').onclick = (e) => { const p = e.target.dataset.p; if (p) { $('pctRange').value = p; setSizeFromPct(+p); } };
    $('sizeIn').oninput = () => {
      const max = maxSizeFor(1), sz = sizeCoins();
      $('pctRange').value = max > 0 ? Math.min(100, Math.round((sz / max) * 100)) : 0;
      updateTicket();
    };
    ['priceIn', 'tpIn', 'slIn'].forEach((id) => ($(id).oninput = updateTicket));
    $('reduceOnly').onchange = () => { $('pctRange').value = 0; $('sizeIn').value = ''; updateTicket(); };
    $('tpslChk').onchange = () => { $('tpslFields').hidden = !$('tpslChk').checked; updateTicket(); };
    $('submitBtn').onclick = submitOrder;
    $('ticket').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') submitOrder(); });

    // Market picker
    $('marketBtn').onclick = (e) => { e.stopPropagation(); $('marketPanel').hidden ? openMarketPanel() : closeMarketPanel(); };
    $('marketSearch').oninput = renderMarketList;
    $('marketSearch').onkeydown = (e) => { if (e.key === 'Enter') { const first = $('marketList').querySelector('.mk-row'); if (first) setCoin(first.dataset.coin); } };
    $('marketList').onclick = (e) => {
      const star = e.target.closest('[data-star]');
      if (star) { e.stopPropagation(); return toggleFav(star.dataset.star); }
      const r = e.target.closest('.mk-row');
      if (r) setCoin(r.dataset.coin);
    };
    $('mkFilter').onclick = (e) => {
      const f = e.target.dataset.f;
      if (!f) return;
      favOnly = f === 'fav';
      savePrefs();
      renderMarketList();
      $('marketSearch').focus();
    };
    $('favBtn').onclick = () => toggleFav(coin);
    $('favBar').onclick = (e) => { const b = e.target.closest('.fav-chip'); if (b) setCoin(b.dataset.coin); };
    document.addEventListener('click', (e) => { if (!$('marketPanel').hidden && !e.target.closest('#marketPanel')) closeMarketPanel(); });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMarketPanel(); closeModal(); $('ctxMenu').hidden = true;
        if (drawingNow) { DT.k?.removeOverlay(drawingNow); drawingNow = null; setActiveTool(null); }
        $('toolFly').hidden = true; $('indPanel').hidden = true;
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveScreenshot(); }
      const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      if (e.altKey && e.key.toLowerCase() === 'r' && !typing) { e.preventDefault(); resetChartView(chart); subCharts.forEach((s) => s.resetView()); }
      if (e.altKey && e.key.toLowerCase() === 'o' && !typing) { e.preventDefault(); $('treePanel').hidden ? openTree() : ($('treePanel').hidden = true); }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing && !Journal.isOpen()) { e.preventDefault(); stepHistory(-1); }
      if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && !typing && !Journal.isOpen()) { e.preventDefault(); stepHistory(1); }
      // Alt+A: alert at the price under the mouse (or the current price).
      if (e.altKey && e.key.toLowerCase() === 'a' && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
        e.preventDefault();
        const v = pointerPrice();
        if (v) addAlert(coin, v); else openAlertPanel();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawing && e.target.tagName !== 'INPUT') {
        targetOf(selectedDrawing).k?.removeOverlay(selectedDrawing);
        selectedDrawing = null;
      }
    });
    $('modalBack').onclick = (e) => { if (e.target === $('modalBack')) closeModal(); };
    $('resetBtn').onclick = resetModal;
    $('settingsBtn').onclick = settingsModal;
    $('journalBtn').onclick = () => { Handbook.close(); Bot.close(); Journal.toggle(); };
    $('botBtn').onclick = () => Bot.toggle();
    $('handbookBtn').onclick = () => Handbook.toggle();
    $('structBtn').onclick = (e) => { e.stopPropagation(); Analysis.setOn(!Analysis.isOn()); };
    $('fcBtn').onclick = (e) => { e.stopPropagation(); ForecastUI.setOn(!ForecastUI.isOn()); };
    $('patBtn').onclick = (e) => { e.stopPropagation(); Handbook.setChartOn(!Handbook.isChartOn()); };
    // Clicking a highlighted candle pattern opens a short explanation.
    let patDown = null;
    $('kchart').addEventListener('pointerdown', (e) => { patDown = { x: e.clientX, y: e.clientY }; }, true);
    $('kchart').addEventListener('click', (e) => {
      if (!Handbook.isChartOn() || !patDown || Math.hypot(e.clientX - patDown.x, e.clientY - patDown.y) > 4) return;
      const main = chart.getSize('candle_pane', 'main'), r = $('kchart').getBoundingClientRect();
      const hit = main && Patterns.hitAt(e.clientX - r.left - main.left, e.clientY - r.top - main.top);
      if (hit) Handbook.popup(hit, e.clientX, e.clientY);
    });
    $('crayonFreeBtn').onclick = () => {
      crayonFree = !crayonFree;
      savePrefs();
      syncCrayonFree();
      toast(crayonFree ? 'Free drag on: drag the Crayon chart in any direction' : 'Free drag off: Crayon auto-fits the price scale again after a coin or timeframe change (or double-click its price axis)');
    };
    syncCrayonFree();
    $('autoBtn').onclick = () => setAutoScale(true);
    window.addEventListener('resize', () => { if (book) scheduleBook(); });

    Feed.onStatus((up) => {
      $('conn').classList.toggle('on', up);
      $('connTxt').textContent = up ? 'Live: Hyperliquid' : 'Reconnecting...';
    });
  }

  async function init() {
    Engine.load(await api.load());
    lastFillId = Engine.state.fills[0]?.id || 0;
    await Journal.init({
      fp, fsz, usd, pct, cls, when, held, toast, modal, captureChart,
      onBadge: (n) => { $('jBadge').textContent = n || ''; $('jBadge').hidden = !n; },
    });
    Journal.sync(Engine.state);
    Engine.subscribe(onEngineChange);
    for (;;) {
      try { await loadMeta(); break; }
      catch { toast('Cannot reach Hyperliquid. Retrying...', 'bad'); await new Promise((r) => setTimeout(r, 3000)); }
    }
    if (!meta[coin]) coin = 'BTC';
    buildChart();
    bindUI();
    let patOn = false, patVer = 0, msOn = false, msVer = 0;
    const patRedraw = () => { if (patOn) chart.overrideIndicator({ name: 'CANDLE_PATTERNS', extendData: ++patVer }, 'candle_pane'); redrawSubs(); };
    Handbook.init({
      list: () => chart.getDataList(),
      coin: () => coin,
      interval: () => interval,
      colors: () => ({ up: colors.upBody, down: colors.downBody }),
      when, toast, fp,
      setOn: (on) => {
        if (on === patOn) return;
        patOn = on;
        studies.pat = on;
        if (on) chart.createIndicator('CANDLE_PATTERNS', true, { id: 'candle_pane' });
        else chart.removeIndicator('candle_pane', 'CANDLE_PATTERNS');
        redrawSubs();
      },
      redraw: patRedraw,
      scrollTo: (ts) => { if (!chartVisible()) $('chartTabs').querySelector('[data-tab="pro"]').click(); chart.scrollToTimestamp(ts, 200); },
      closeOthers: () => { if (Journal.isOpen()) Journal.close(); Bot.close(); },
    });
    Bot.init({
      fetchCandles, fp, when, toast,
      redrawLines: () => drawTradeLines(),
      szDecimals: (c) => meta[c]?.szDecimals ?? 4,
      book: (c) => (c === coin ? book : null),
      favs: () => favs,
      hasCoin: (c) => !!meta[c] && !HL_ALIAS[c], // stock/commodity charts are new: the bot keeps its tested data source for them
      closeOthers: () => { if (Journal.isOpen()) Journal.close(); Handbook.close(); },
    });
    Analysis.init({
      list: () => chart.getDataList(),
      toast,
      setOn: (on) => {
        if (on === msOn) return;
        msOn = on;
        studies.ms = on;
        if (on) chart.createIndicator('MARKET_STRUCTURE', true, { id: 'candle_pane' });
        else chart.removeIndicator('candle_pane', 'MARKET_STRUCTURE');
        redrawSubs();
      },
      redraw: () => { if (msOn) chart.overrideIndicator({ name: 'MARKET_STRUCTURE', extendData: ++msVer }, 'candle_pane'); patRedraw(); },
      fetchDaily: (c) => fetchCandles(c, '1d', Date.now() - 1400 * 864e5, Date.now()),
      redrawSubs,
      redrawPatterns: patRedraw,
      openHandbook: () => Handbook.open('structure'),
    });
    // Forecast panel + cone (display only; the bot never reads it).
    let fcOn = false, fcVer = 0;
    ForecastUI.init({
      list: () => chart.getDataList(),
      coin: () => coin,
      interval: () => interval,
      context: () => Analysis.context(),
      dailyCoin: () => Analysis.dailyCoin(),
      fetchCandles,
      fetchFunding: (c, startTime) => api.info({ type: 'fundingHistory', coin: hlName(c), startTime }),
      newsWeek: () => window.api.newsWeek(),
      updateOdds: (onMsg) => { window.api.onForecastProgress?.(onMsg); return window.api.forecastUpdate(); },
      fmt: (v) => fp(v),
      setOn: (on) => {
        if (on === fcOn) return;
        fcOn = on;
        if (on) chart.createIndicator('FORECAST', true, { id: 'candle_pane' });
        else chart.removeIndicator('candle_pane', 'FORECAST');
      },
      redraw: () => { if (fcOn) chart.overrideIndicator({ name: 'FORECAST', extendData: ++fcVer }, 'candle_pane'); },
    });
    Doritos.start({ fetchCandles, fmt: (v, c) => fp(v, c) }); // Telegram alert on new Doritos (ENA 1h/4h)
    Analysis.setInterval(interval);
    loadDaily();
    setInterval(loadDaily, 30 * 60e3);
    Feed.on('allMids', onMids);
    Feed.on('l2Book', onBook);
    Feed.on('trades', onTrades);
    Feed.on('candle', onCandle);
    Feed.sub({ type: 'allMids' });
    for (const dex of HL_DEXES) Feed.sub({ type: 'allMids', dex }); // stocks / ETFs / commodities
    Feed.start();
    setCoin(coin, true);
    Engine.onMarks({ ...mids });
    renderBottom();
    // Header stats only (prices stream over the websocket). 3 exchanges x weight 20 every 15 s = 240 of Hyperliquid's
    // 1,200/min; every 5 s used 720 and starved the bot's background downloads (main.js HL_BG).
    setInterval(refreshCtx, 15000);
    setInterval(tickCountdown, 1000);
    tickCountdown();
  }

  init();
})();
