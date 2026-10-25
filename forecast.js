// Forecast engine: turns what the chart already detects (daily/weekly context, market structure, double tops/bottoms,
// candle patterns, RSI, momentum, volatility, nearby swing levels) plus Bitcoin's lead, funding, volume and the
// bigger timeframes into "chance price is higher after N candles", a likely range, a typical path and trendlines.
// The odds come from FORECAST_MODEL (src/forecast-model.js), fitted by research/forecast-research.js on years of
// crypto history. Read-only use of the detectors: nothing here changes them, and the bot does not use this file.
// Works in the browser and in Node. bars: [{ t, o, h, l, c, v }], closed candles, oldest first.
const Forecast = (() => {
  let override = null; // a freshly retrained model loaded while the app runs
  const lib = () => ({
    S: typeof Structure !== 'undefined' ? Structure : null,
    P: typeof Patterns !== 'undefined' ? Patterns : null,
    C: typeof Context !== 'undefined' ? Context : null,
    M: override || (typeof FORECAST_MODEL !== 'undefined' ? FORECAST_MODEL : null),
  });
  const HORIZON = { '1h': 12, '4h': 6 }; // candles ahead
  const TF_MS = { '1h': 36e5, '4h': 4 * 36e5 }, DAY = 864e5;
  const STRUCT = { // same research-picked structure settings as the chart and the bot
    '1h': { left: 12, right: 12, minSwingAtr: 1.5, eqTolAtr: 1, minDepthAtr: 4 },
    '4h': { left: 12, right: 12, minSwingAtr: 1, eqTolAtr: 0.6, minDepthAtr: 2.5 },
  };
  // Every feature is on/off, in groups the research can switch on and off. Plain-English names for the panel.
  // Groups that are always one of a few states leave one state out (daily trend sideways, structure bearish) so the
  // weights read as "compared with that".
  const GROUPS = {
    base: {
      'ctx:up-strong': 'Daily and weekly trend both up', 'ctx:up': 'Daily trend up (weekly not)',
      'ctx:down-strong': 'Daily and weekly trend both down', 'ctx:down': 'Daily trend down (weekly not)',
      'st:up': 'Structure bullish (vs bearish)',
      'ev:BOS+': 'Fresh break of structure up', 'ev:BOS-': 'Fresh break of structure down',
      'ev:CHoCH+': 'Fresh change of character up', 'ev:CHoCH-': 'Fresh change of character down',
      'pat:+': 'Double bottom / inverse H&S confirmed recently', 'pat:-': 'Double top / H&S confirmed recently',
      'cdlA:+': 'Grade A bullish candle pattern', 'cdlA:-': 'Grade A bearish candle pattern',
      'cdl:+': 'Bullish candle pattern (not grade A)', 'cdl:-': 'Bearish candle pattern (not grade A)',
      'rsi:<30': 'RSI oversold (below 30)', 'rsi:30-45': 'RSI weak (30-45)', 'rsi:55-70': 'RSI strong (55-70)', 'rsi:>70': 'RSI overbought (above 70)',
      'pos:low': 'Near the bottom of the last 50 candles', 'pos:high': 'Near the top of the last 50 candles',
      'mom:--': 'Fell hard recently', 'mom:-': 'Drifting down recently', 'mom:+': 'Drifting up recently', 'mom:++': 'Rose hard recently',
      'vol:low': 'Quiet market (low volatility)', 'vol:high': 'Wild market (high volatility)',
      'res:near': 'Swing high (resistance) close above', 'sup:near': 'Swing low (support) close below',
    },
    btc: {
      'btc:st-up': 'Bitcoin structure bullish (vs bearish)', 'btc:mom+': 'Bitcoin rising recently', 'btc:mom-': 'Bitcoin falling recently',
      'rs:+': 'Stronger than Bitcoin recently', 'rs:-': 'Weaker than Bitcoin recently',
    },
    fund: {
      'fund:high': 'Funding high: longs paying a lot (crowded long)', 'fund:neg': 'Funding negative: shorts paying',
      'fund:veryneg': 'Funding very negative (crowded short)',
    },
    vol: {
      'rv:spike': 'Volume spike (over 2x normal)', 'rv:dry': 'Very low volume (under half normal)',
      'evv:+': 'Break up on strong volume', 'evv:-': 'Break down on strong volume',
    },
    htf: {
      'drsi:<35': 'Daily RSI low (below 35)', 'drsi:>65': 'Daily RSI high (above 65)',
      'dema:above': 'Far above the daily 25 EMA (over 8%)', 'dema:below': 'Far below the daily 25 EMA (over 8%)',
      'h4rsi:<30': '4h RSI oversold (below 30)', 'h4rsi:>70': '4h RSI overbought (above 70)',
    },
  };
  const FEATURES = Object.assign({}, ...Object.values(GROUPS));
  const GROUP_OF = Object.fromEntries(Object.entries(GROUPS).flatMap(([g, fs]) => Object.keys(fs).map((k) => [k, g])));
  const NAMES = Object.keys(FEATURES);
  const IDX = Object.fromEntries(NAMES.map((n, i) => [n, i]));

  function rsi(bars, n = 14) {
    const out = new Array(bars.length).fill(null);
    let up = 0, dn = 0;
    for (let i = 1; i < bars.length; i++) {
      const ch = bars[i].c - bars[i - 1].c, u = Math.max(ch, 0), d = Math.max(-ch, 0);
      if (i <= n) { up += u / n; dn += d / n; if (i < n) continue; } else { up = (up * (n - 1) + u) / n; dn = (dn * (n - 1) + d) / n; }
      out[i] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
    }
    return out;
  }
  function atrN(bars, n) {
    const out = new Array(bars.length).fill(null);
    let a = null;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i], pc = i ? bars[i - 1].c : b.o, tr = Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
      a = a == null ? tr : i < n ? (a * i + tr) / (i + 1) : (a * (n - 1) + tr) / n;
      out[i] = a;
    }
    return out;
  }
  function agg(bars, ms) {
    const out = [];
    for (const b of bars) { const t = Math.floor(b.t / ms) * ms, l = out[out.length - 1]; if (l && l.t === t) { l.h = Math.max(l.h, b.h); l.l = Math.min(l.l, b.l); l.c = b.c; l.v += b.v || 0; } else out.push({ ...b, t, v: b.v || 0 }); }
    return out;
  }
  // Index of the last item whose time key is <= t (items sorted by time), or -1.
  function lastAtOrBefore(arr, t, key = (x) => x.t) {
    let lo = 0, hi = arr.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (key(arr[m]) <= t) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  }
  function trendOf(res, n) {
    const trend = new Array(n).fill(0);
    let ei = 0, tr = 0; for (let i = 0; i < n; i++) { while (ei < res.events.length && res.events[ei].i <= i) tr = res.events[ei++].dir; trend[i] = tr; }
    return trend;
  }

  // Active features for every candle, using only what was known when that candle closed.
  // ext (all optional): { daily: daily bars, btc: BTC bars on the same timeframe (not for BTC itself),
  // funding: [{ t, r }] hourly funding rates }. Missing data just leaves those features off.
  function features(bars, ctx, tf, ext = {}) {
    const L = lib(), S = L.S, P = L.P, C = L.C, n = bars.length, H = HORIZON[tf] || 12, ms = TF_MS[tf] || 36e5;
    const res = S.analyze(bars, STRUCT[tf] || {});
    const A = res.atr, A100 = atrN(bars, 100), R = rsi(bars);
    const trend = trendOf(res, n), lastEv = new Array(n).fill(null), lastPat = new Array(n).fill(null);
    { let ei = 0, ev = null; for (let i = 0; i < n; i++) { while (ei < res.events.length && res.events[ei].i <= i) ev = res.events[ei++]; lastEv[i] = ev; } }
    { const conf = res.patterns.filter((p) => p.status === 'confirmed').sort((a, b) => a.confirmAt - b.confirmAt); let k = 0, cur = null; for (let i = 0; i < n; i++) { while (k < conf.length && conf[k].confirmAt <= i) cur = conf[k++]; lastPat[i] = cur; } }
    // Candle patterns, placed on the candle that confirmed them.
    const cdl = new Array(n).fill(null);
    if (P) {
      const kl = bars.map((b) => ({ timestamp: b.t, open: b.o, high: b.h, low: b.l, close: b.c }));
      P.detect(kl).forEach((ms_, end) => {
        const m = ms_.find((x) => P.BY_ID[x.id].bias !== 'neutral');
        if (!m) return;
        const dir = P.BY_ID[m.id].bias === 'bull' ? 1 : -1, cf = P.confirmOf(kl, { ...m, end });
        if ((cf.s === 'ok' || cf.s === 'built') && cf.at < n) cdl[cf.at] = { dir, name: P.BY_ID[m.id].name };
      });
    }
    // Bitcoin on the same timeframe, matched by candle time.
    let btc = null;
    if (ext.btc && ext.btc.length > 150) {
      const bb = ext.btc, bres = S.analyze(bb, STRUCT[tf] || {});
      btc = { bars: bb, atr: bres.atr, trend: trendOf(bres, bb.length), idx: new Map(bb.map((b, k) => [b.t, k])) };
    }
    // Bigger timeframes: daily RSI and daily 25 EMA (closed days only), 4h RSI for the 1h chart.
    let daily = null, h4 = null;
    if (ext.daily && ext.daily.length > 40) {
      const dl = ext.daily, dr = rsi(dl), k25 = 2 / 26; let e = null;
      const ema = dl.map((b) => (e = e == null ? b.c : e + k25 * (b.c - e)));
      daily = { bars: dl, rsi: dr, ema };
    }
    if (tf === '1h') { const hb = agg(bars, 4 * 36e5); h4 = { bars: hb, rsi: rsi(hb) }; }
    const fund = ext.funding && ext.funding.length ? ext.funding : null;

    const ctxState = (i) => (ctx && C ? ctx.at(bars[i].t).state : null);
    const rows = new Array(n).fill(null);
    // Support / resistance: confirmed swings that no close has passed yet (the newest 40).
    const levels = new Array(n).fill(null);
    let sw = 0, live = [], vsum = 0;
    for (let i = 0; i < n; i++) {
      while (sw < res.swings.length && res.swings[sw].at <= i) { live.push(res.swings[sw++]); if (live.length > 40) live.shift(); }
      const cl = bars[i].c;
      live = live.filter((s) => (s.type === 'H' ? cl <= s.price : cl >= s.price));
      let rs = null, sp = null;
      for (const s of live) { if (s.type === 'H' && (rs == null || s.price < rs)) rs = s.price; if (s.type === 'L' && (sp == null || s.price > sp)) sp = s.price; }
      levels[i] = { res: rs, sup: sp };
      vsum += bars[i].v || 0; if (i >= 20) vsum -= bars[i - 20].v || 0;
      if (i < 110 || !(A[i] > 0) || R[i] == null) continue;
      const f = [], on = (k) => f.push(IDX[k]), c = bars[i].c, a = A[i], closeT = bars[i].t + ms;
      // --- base
      const cs = ctxState(i); if (cs && cs !== 'range') on('ctx:' + cs); // sideways = the baseline
      if (trend[i] > 0) on('st:up'); // bearish = the baseline
      const ev = lastEv[i]; if (ev && i - ev.i < 6) on(`ev:${ev.kind}${ev.dir > 0 ? '+' : '-'}`);
      const pt = lastPat[i]; if (pt && i - pt.confirmAt < H) on(pt.dir > 0 ? 'pat:+' : 'pat:-');
      for (let k = i; k >= Math.max(0, i - 2); k--) {
        const cd = cdl[k]; if (!cd) continue;
        const A_ = C && cs && C.align(cs, cd.dir) === 'with' && trend[i] === cd.dir;
        on(`${A_ ? 'cdlA' : 'cdl'}:${cd.dir > 0 ? '+' : '-'}`); break;
      }
      const r = R[i]; if (r < 30) on('rsi:<30'); else if (r < 45) on('rsi:30-45'); else if (r > 70) on('rsi:>70'); else if (r > 55) on('rsi:55-70');
      let hi = -Infinity, lo = Infinity; for (let k = i - 49; k <= i; k++) { hi = Math.max(hi, bars[k].h); lo = Math.min(lo, bars[k].l); }
      const pos = hi > lo ? (c - lo) / (hi - lo) : 0.5; if (pos < 0.2) on('pos:low'); else if (pos > 0.8) on('pos:high');
      const mom = (c - bars[i - H].c) / a; if (mom < -2) on('mom:--'); else if (mom < -0.5) on('mom:-'); else if (mom > 2) on('mom:++'); else if (mom > 0.5) on('mom:+');
      const vr = a / A100[i]; if (vr < 0.8) on('vol:low'); else if (vr > 1.25) on('vol:high');
      const lv = levels[i];
      if (lv.res && (lv.res - c) / a < 1.5) on('res:near');
      if (lv.sup && (c - lv.sup) / a < 1.5) on('sup:near');
      // --- Bitcoin's lead
      if (btc) {
        const k = btc.idx.get(bars[i].t);
        if (k != null && k >= H && btc.atr[k] > 0) {
          if (btc.trend[k] > 0) on('btc:st-up');
          const bm = (btc.bars[k].c - btc.bars[k - H].c) / btc.atr[k]; if (bm > 1) on('btc:mom+'); else if (bm < -1) on('btc:mom-');
          const rel = ((c / bars[i - H].c) - (btc.bars[k].c / btc.bars[k - H].c)) / (a / c); if (rel > 1) on('rs:+'); else if (rel < -1) on('rs:-');
        }
      }
      // --- funding: average hourly rate over the last 24 hours
      if (fund) {
        const k = lastAtOrBefore(fund, closeT);
        if (k >= 23 && closeT - fund[k].t < 3 * 36e5) {
          let s = 0; for (let j = k - 23; j <= k; j++) s += fund[j].r;
          const avg = s / 24; // normal is about 0.00125% per hour
          if (avg > 0.00003) on('fund:high'); else if (avg < -0.00002) on('fund:veryneg'); else if (avg < 0) on('fund:neg');
        }
      }
      // --- volume
      if (i >= 21 && vsum > 0 && (bars[i].v || 0) >= 0) {
        const avgPrev = (vsum - (bars[i].v || 0) + (bars[i - 20].v || 0)) / 20; // the 20 candles before this one
        if (avgPrev > 0) {
          const rv = (bars[i].v || 0) / avgPrev; if (rv > 2) on('rv:spike'); else if (rv < 0.5) on('rv:dry');
          if (ev && i - ev.i < 6 && (bars[ev.i].v || 0) > 1.5 * avgPrev) on(ev.dir > 0 ? 'evv:+' : 'evv:-');
        }
      }
      // --- bigger timeframes
      if (daily) {
        const k = lastAtOrBefore(daily.bars, closeT, (b) => b.t + DAY);
        if (k >= 30) {
          const dr = daily.rsi[k]; if (dr != null) { if (dr < 35) on('drsi:<35'); else if (dr > 65) on('drsi:>65'); }
          const de = (c - daily.ema[k]) / daily.ema[k]; if (de > 0.08) on('dema:above'); else if (de < -0.08) on('dema:below');
        }
      }
      if (h4) {
        const k = lastAtOrBefore(h4.bars, closeT, (b) => b.t + 4 * 36e5);
        const hr = k >= 0 ? h4.rsi[k] : null; if (hr != null) { if (hr < 30) on('h4rsi:<30'); else if (hr > 70) on('h4rsi:>70'); }
      }
      rows[i] = f;
    }
    return { rows, atr: A, res, levels, trend, cdl, rsi: R };
  }

  // Trendlines through the last two confirmed swing highs and the last two swing lows (as a trader would draw them),
  // to be extended into the future. Only recent swings (within 200 candles) count.
  function trendlines(res, bars, i) {
    const known = res.swings.filter((s) => s.at <= i && i - s.i <= 200);
    const two = (type) => { const s = known.filter((x) => x.type === type).slice(-2); return s.length === 2 ? { t1: bars[s[0].i].t, p1: s[0].price, i1: s[0].i, t2: bars[s[1].i].t, p2: s[1].price, i2: s[1].i } : null; };
    const at = (ln, k) => ln.p1 + ((ln.p2 - ln.p1) * (k - ln.i1)) / (ln.i2 - ln.i1);
    const hi = two('H'), lo = two('L');
    return { hi, lo, at };
  }

  const sigmoid = (z) => 1 / (1 + Math.exp(-z));

  // Forecast for the last closed candle. Returns null without a model or enough history.
  function predict(bars, ctx, tf, ext = {}) {
    const M = lib().M, m = M?.[tf];
    if (!m || bars.length < 150) return null;
    const F = features(bars, ctx, tf, ext), i = bars.length - 1, f = F.rows[i];
    if (!f) return null;
    const active = f.map((k) => NAMES[k]).filter((nm) => nm in m.w);
    let z = m.b; for (const nm of active) z += m.w[nm];
    const raw = sigmoid(z), p = 0.5 + (m.shrink ?? 1) * (raw - 0.5); // shown chance, shrunk to what held on the test years
    const c = bars[i].c, a = F.atr[i], H = HORIZON[tf];
    // Cone + typical path: what moves (in ATRs) followed forecasts like this one in the history.
    const bk = m.buckets.find((b) => raw >= b.lo && raw < b.hi) || m.buckets[m.buckets.length - 1];
    const q = bk.q; // quantiles 10/25/50/75/90 of the move after H candles, in ATRs
    const path = (bk.path || []).map((x) => c + x * a); // middle move after 1..H candles
    const reasons = active.map((nm) => ({ name: nm, text: FEATURES[nm], w: m.w[nm], group: GROUP_OF[nm] })).sort((x, y) => Math.abs(y.w) - Math.abs(x.w));
    const tl = trendlines(F.res, bars, i);
    const proj = (ln) => (ln ? { t1: ln.t1, p1: ln.p1, t2: ln.t2, p2: ln.p2, now: tl.at(ln, i), end: tl.at(ln, i + H) } : null);
    const edge = Math.abs(raw - 0.5) >= m.minEdge;
    const missing = (m.groups || []).filter((g) => (g === 'btc' && !ext.btc && ext.isBtc !== true) || (g === 'fund' && !ext.funding) || (g === 'htf' && !ext.daily));
    return {
      tf, H, t: bars[i].t, close: c, atr: a, p, raw, dir: !edge ? 0 : p > 0.5 ? 1 : -1, edge,
      band: { q10: c + q[0] * a, q25: c + q[1] * a, mid: c + q[2] * a, q75: c + q[3] * a, q90: c + q[4] * a },
      path, lines: { hi: proj(tl.hi), lo: proj(tl.lo) }, bucket: bk, reasons, levels: F.levels[i], missing,
      model: { trainedTo: M.trainedTo, test: m.test, cone: m.cone, mode: m.mode, groups: m.groups },
    };
  }

  return { HORIZON, TF_MS, STRUCT, GROUPS, GROUP_OF, FEATURES, NAMES, features, predict, trendlines, sigmoid, rsi, agg, setModel: (mm) => { override = mm; }, model: () => lib().M };
})();
if (typeof module !== 'undefined') module.exports = Forecast;
