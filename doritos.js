// "Doritos" = Steve's name for the LeveLeledc triangles (Leledc exhaustion bars). This file has the maths (used by
// the chart indicator in app.js) and a watcher that sends a Telegram message when a closed candle on a watched
// market/timeframe gets one. Separate from the bot: it never trades and the bot never reads it.
const Doritos = (() => {
  const QUAL = 6, LEN = 30; // the indicator's default settings (calcParams)
  const WATCH = [['ENA', '1h'], ['ENA', '4h']];
  const IV_MS = { '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5 };
  const HISTORY = 1000; // candles per check: the counters start from the first candle, so give them a long run-up
  const KEY = 'pp.doritos';

  // Exhaustion bar (glaz's Leledc): after more than `qual` closes above the close 4 bars back, a red candle making
  // the highest high of `len` bars is a bearish exhaustion -> its high becomes resistance. Mirror image for support.
  // sig: -1 = red Dorito above the candle (sell exhaustion), 1 = green Dorito below (buy exhaustion), 0 = none.
  function calc(list, qual = QUAL, len = LEN) {
    let bull = 0, bear = 0, res = null, sup = null;
    return list.map((k, i) => {
      let sig = 0;
      if (i >= 4) {
        if (k.close > list[i - 4].close) bull++;
        if (k.close < list[i - 4].close) bear++;
      }
      let hh = -Infinity, ll = Infinity;
      for (let j = Math.max(0, i - len + 1); j <= i; j++) { hh = Math.max(hh, list[j].high); ll = Math.min(ll, list[j].low); }
      if (bull > qual && k.close < k.open && k.high >= hh) { bull = 0; sig = -1; res = k.high; }
      if (bear > qual && k.close > k.open && k.low <= ll) { bear = 0; sig = 1; sup = k.low; }
      return { res, sup, sig };
    });
  }

  // ---------- watcher ----------
  let d = null, busy = false;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const st = load(); // { sent: { 'ENA 1h': candle timestamp of the last Dorito sent }, done: { 'ENA 1h': last closed candle checked } }
  st.sent = st.sent || {}; st.done = st.done || {};
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* best effort */ } };

  const lastClosed = (iv, now = Date.now()) => Math.floor(now / IV_MS[iv]) * IV_MS[iv] - IV_MS[iv]; // open time of the newest closed candle

  function message(coin, iv, k, r) {
    const up = r.sig > 0, t = new Date(k.timestamp + IV_MS[iv]);
    const at = t.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return {
      title: `${up ? '🟢' : '🔴'} Doritos on ${coin} ${iv}`,
      text: up
        ? `Green Dorito: buy exhaustion (sellers look tired, watch for a bounce).\nCandle closed ${at} at ${d.fmt(k.close, coin)}. New support: ${d.fmt(r.sup, coin)}.`
        : `Red Dorito: sell exhaustion (buyers look tired, watch for a drop).\nCandle closed ${at} at ${d.fmt(k.close, coin)}. New resistance: ${d.fmt(r.res, coin)}.`,
    };
  }

  async function check(coin, iv) {
    const key = `${coin} ${iv}`, want = lastClosed(iv);
    if (st.done[key] >= want) return;
    const bars = (await d.fetchCandles(coin, iv, want - IV_MS[iv] * HISTORY, want + IV_MS[iv] - 1, true)).filter((k) => k.timestamp <= want);
    const i = bars.length - 1;
    if (i < 0 || bars[i].timestamp !== want) return; // the newest candle is not in yet: try again next tick
    const r = calc(bars)[i];
    // Only the newest closed candle is looked at, so a Dorito from while the app was closed is never sent late.
    if (r.sig && st.sent[key] !== want) {
      const m = message(coin, iv, bars[i], r);
      await window.api.notify('telegram', '', m.title, m.text, 4, 'doritos');
      st.sent[key] = want;
    }
    st.done[key] = want;
    save();
  }

  async function tick() {
    if (busy) return;
    busy = true;
    for (const [coin, iv] of WATCH) {
      try { await check(coin, iv); } catch (e) { console.warn('Doritos check failed', coin, iv, e.message); } // retried next tick
    }
    busy = false;
  }

  // deps: { fetchCandles(coin, iv, start, end, background), fmt(price, coin) }
  function start(deps) {
    d = deps;
    if (window.api.web) return; // the phone website has no Telegram: only the desktop app sends
    setTimeout(tick, 8000);
    setInterval(tick, 30e3);
  }

  return { calc, start, WATCH, _check: check, _st: st };
})();
