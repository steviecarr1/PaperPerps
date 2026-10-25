// Market context from the daily and weekly 12/25 EMA bands (the "TraderXO macro trend" idea):
//  - Uptrend: fast EMA (12) above slow EMA (25), price above the bands, and no recent cross.
//  - Downtrend: fast below slow, price below the bands, no recent cross.
//  - Range (rotational): the bands crossed recently (the first opposite cross after a trend usually starts a range),
//    or price is trading back inside / on the wrong side of the bands.
// Uses only CLOSED daily/weekly candles, so an intraday candle never sees the future. Works in browser and Node.
// bars: [{ t, o, h, l, c }] sorted by time.
const Context = (() => {
  const DEFAULTS = { fast: 12, slow: 25, settleDaily: 10, settleWeekly: 4 };

  function ema(vals, n) {
    const out = new Array(vals.length).fill(null), k = 2 / (n + 1);
    let e = null;
    vals.forEach((v, i) => { e = e == null ? v : v * k + e * (1 - k); out[i] = i >= n - 1 ? e : null; });
    return out;
  }
  // Weekly candles (Monday 00:00 UTC) from daily ones.
  function weekly(daily) {
    const out = [];
    for (const b of daily) {
      const d = new Date(b.t), dow = (d.getUTCDay() + 6) % 7, wk = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
      const l = out[out.length - 1];
      if (l && l.t === wk) { l.h = Math.max(l.h, b.h); l.l = Math.min(l.l, b.l); l.c = b.c; l.last = b.t; }
      else out.push({ t: wk, o: b.o, h: b.h, l: b.l, c: b.c, last: b.t });
    }
    return out;
  }

  // State for each candle of a daily (or weekly) series. settle = candles after a cross before a trend counts again.
  function states(bars, o = DEFAULTS, settle = o.settleDaily) {
    const c = bars.map((b) => b.c), f = ema(c, o.fast), s = ema(c, o.slow);
    let lastCross = -Infinity, prevBull = null;
    return bars.map((b, i) => {
      if (f[i] == null || s[i] == null) return { state: null };
      const bull = f[i] > s[i];
      let cross = null;
      if (prevBull != null && bull !== prevBull) { lastCross = i; cross = bull ? 'bullish' : 'bearish'; }
      prevBull = bull;
      const since = i - lastCross;
      let state;
      if (since < settle) state = 'range';
      else if (bull && b.c > s[i]) state = 'up';
      else if (!bull && b.c < s[i]) state = 'down';
      else state = 'range';
      return { state, bull, fast: f[i], slow: s[i], cross, since, t: b.t };
    });
  }

  // Build a lookup: for any intraday time, the context from the last CLOSED daily and weekly candle.
  function build(daily, o = {}) {
    o = { ...DEFAULTS, ...o };
    const D = states(daily, o, o.settleDaily);
    const Wb = weekly(daily), W = states(Wb, o, o.settleWeekly);
    const dayMs = 864e5, weekMs = 7 * dayMs;
    function at(t) {
      // Last daily candle that closed at or before t: open time + 1 day <= t.
      let lo = 0, hi = daily.length - 1, di = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (daily[m].t + dayMs <= t) { di = m; lo = m + 1; } else hi = m - 1; }
      lo = 0; hi = Wb.length - 1; let wi = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (Wb[m].t + weekMs <= t) { wi = m; lo = m + 1; } else hi = m - 1; }
      const d = di >= 0 ? D[di] : { state: null }, w = wi >= 0 ? W[wi] : { state: null };
      return { daily: d, weekly: w, state: combine(d.state, w.state) };
    }
    return { at, daily: D, weekly: W, weeklyBars: Wb };
  }
  // Overall bias: daily decides, weekly agreeing makes it "strong".
  function combine(d, w) {
    if (!d) return null;
    if (d === 'range') return 'range';
    return d === w ? d + '-strong' : d;
  }
  // Is a bullish (+1) / bearish (-1) idea with or against the context?
  function align(ctxState, dir) {
    if (!ctxState) return 'unknown';
    if (ctxState.startsWith('range')) return 'range';
    const up = ctxState.startsWith('up');
    return (up && dir > 0) || (!up && dir < 0) ? 'with' : 'against';
  }

  return { DEFAULTS, ema, weekly, states, build, combine, align };
})();
if (typeof module !== 'undefined') module.exports = Context;
