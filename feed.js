// RISEx's stock / ETF / commodity markets, charted from Hyperliquid's HIP-3 exchanges ("xyz", "mkts") under the
// names RISEx uses. Hyperliquid calls them xyz:GOLD, mkts:US500 etc.; the app only ever sees XAU, SPY...
// (translated here and in app.js's API calls). Prices were checked against RISEx's marks when this was added.
const HL_ALIAS = {
  XAU: 'xyz:GOLD', XAG: 'xyz:SILVER', CL: 'xyz:CL', BZ: 'xyz:BRENTOIL',
  NVDA: 'xyz:NVDA', MU: 'xyz:MU', SNDK: 'xyz:SNDK', SKHYNIX: 'xyz:SKHX', DRAM: 'xyz:DRAM', INTC: 'xyz:INTC', META: 'xyz:META',
  TSLA: 'xyz:TSLA', HOOD: 'xyz:HOOD', MSTR: 'xyz:MSTR', CRCL: 'xyz:CRCL', KORU: 'xyz:KORU', SPCX: 'xyz:SPCX',
  SPY: 'mkts:US500', QQQ: 'mkts:USTECH',
  GOOGL: 'xyz:GOOGL', CRWV: 'xyz:CRWV', SOXL: 'xyz:SOXL', // added 2026-10-21, within 0.1% of RISEx's marks
};
const HL_DEXES = [...new Set(Object.values(HL_ALIAS).map((h) => h.split(':')[0]))];
const HL_FROM = Object.fromEntries(Object.entries(HL_ALIAS).map(([a, h]) => [h, a]));
const hlName = (c) => HL_ALIAS[c] || c;

// Hyperliquid public WebSocket feed. Auto-reconnects and re-subscribes.
const Feed = (() => {
  const URL = 'wss://api.hyperliquid.xyz/ws';
  const subs = new Map();
  const counts = new Map();
  const handlers = {};
  const statusCbs = [];
  let ws = null;

  const send = (o) => {
    if (o.subscription?.coin) o = { ...o, subscription: { ...o.subscription, coin: hlName(o.subscription.coin) } };
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(o));
  };
  // Incoming data back to the app's names (only aliased markets are touched; everything else passes through).
  function fromHl(channel, d) {
    if (!d) return d;
    if (channel === 'allMids' && d.dex) {
      const mids = {};
      for (const k in d.mids) if (HL_FROM[k]) mids[HL_FROM[k]] = d.mids[k];
      return { ...d, mids };
    }
    if (channel === 'l2Book' && HL_FROM[d.coin]) return { ...d, coin: HL_FROM[d.coin] };
    if (channel === 'candle' && HL_FROM[d.s]) return { ...d, s: HL_FROM[d.s] };
    if (channel === 'trades' && Array.isArray(d)) return d.map((t) => (HL_FROM[t.coin] ? { ...t, coin: HL_FROM[t.coin] } : t));
    return d;
  }
  const setStatus = (up) => statusCbs.forEach((f) => f(up));

  function connect() {
    ws = new WebSocket(URL);
    ws.onopen = () => {
      setStatus(true);
      for (const sub of subs.values()) send({ method: 'subscribe', subscription: sub });
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      const h = handlers[m.channel];
      if (h) h(fromHl(m.channel, m.data));
    };
    ws.onclose = () => { setStatus(false); setTimeout(connect, 2000); };
    ws.onerror = () => ws.close();
  }

  setInterval(() => send({ method: 'ping' }), 30000);

  return {
    start: connect,
    on(channel, fn) { handlers[channel] = fn; },
    onStatus(fn) { statusCbs.push(fn); },
    // Counted, so two charts on the same market share one subscription.
    sub(sub) {
      const k = JSON.stringify(sub);
      counts.set(k, (counts.get(k) || 0) + 1);
      if (subs.has(k)) return;
      subs.set(k, sub);
      send({ method: 'subscribe', subscription: sub });
    },
    unsub(sub) {
      const k = JSON.stringify(sub);
      const n = (counts.get(k) || 0) - 1;
      if (n > 0) { counts.set(k, n); return; }
      counts.delete(k);
      if (!subs.delete(k)) return;
      send({ method: 'unsubscribe', subscription: sub });
    },
  };
})();
