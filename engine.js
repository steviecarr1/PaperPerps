// Paper trading engine: isolated-margin perpetuals, one position per coin (one-way mode).
// All money is fake. Fees mirror Hyperliquid's base tier.
const Engine = (() => {
  const TAKER = 0.00045;
  const MAKER = 0.00015;
  const START = 10000;
  const EPS = 1e-12;

  const fresh = (start = START) => ({
    v: 1, start, wallet: start, positions: {}, orders: [], fills: [], closed: [],
    leverage: {}, seq: 1, created: Date.now(),
  });

  let s = fresh();
  let meta = {};
  const marks = {};
  const subs = [];

  const emit = () => subs.forEach((f) => f(s));
  const nextId = () => s.seq++;
  const ok = (msg) => ({ ok: true, msg });
  const err = (msg) => ({ ok: false, msg });

  const maxLev = (c) => meta[c]?.maxLeverage || 20;
  // Maintenance margin = half of initial margin at max leverage (Hyperliquid's rule).
  const mmr = (c) => 0.5 / maxLev(c);
  const lev = (c) => Math.max(1, Math.min(s.leverage[c] || Math.min(10, maxLev(c)), maxLev(c)));
  const sizeEps = (c) => Math.pow(10, -(meta[c]?.szDecimals ?? 4)) / 2;

  function liqPrice(p) {
    const m = mmr(p.coin);
    return p.dir > 0
      ? (p.entry * p.size - p.margin) / (p.size * (1 - m))
      : (p.entry * p.size + p.margin) / (p.size * (1 + m));
  }

  const upnl = (p, mark = marks[p.coin] ?? p.entry) => p.size * (mark - p.entry) * p.dir;

  function totals() {
    let marginUsed = 0, upl = 0, reserved = 0;
    for (const p of Object.values(s.positions)) { marginUsed += p.margin; upl += upnl(p); }
    for (const o of s.orders) reserved += o.reserve;
    return {
      wallet: s.wallet, marginUsed, upnl: upl, reserved,
      equity: s.wallet + marginUsed + upl,
      available: Math.max(0, s.wallet - reserved),
    };
  }

  function openingSize(coin, dir, size) {
    const pos = s.positions[coin];
    return pos && pos.dir !== dir ? Math.max(0, size - pos.size) : size;
  }

  // Average fill price from walking the live order book.
  function walk(book, dir, size, mark) {
    const levels = book ? (dir > 0 ? book.asks : book.bids) : null;
    if (!levels || !levels.length) return mark;
    let rem = size, cost = 0, last = mark;
    for (const [px, sz] of levels) {
      const take = Math.min(rem, sz);
      cost += take * px; rem -= take; last = px;
      if (rem <= EPS) break;
    }
    if (rem > EPS) cost += rem * last * (1 + dir * 0.002);
    return cost / size;
  }

  const bestAsk = (book, mark) => book?.asks?.[0]?.[0] ?? mark;
  const bestBid = (book, mark) => book?.bids?.[0]?.[0] ?? mark;

  function dropReduceOnly(coin) {
    s.orders = s.orders.filter((o) => !(o.coin === coin && o.reduceOnly));
  }

  function fill(coin, dir, size, px, feeRate, kind, extra = {}, reason = 'Close') {
    const fee = size * px * feeRate;
    s.wallet -= fee;
    let pos = s.positions[coin];
    let rem = size, realized = 0;

    if (pos && pos.dir !== dir) {
      const q = Math.min(rem, pos.size), frac = q / pos.size;
      const pnl = q * (px - pos.entry) * pos.dir;
      const m = pos.margin * frac, openFee = pos.fees * frac;
      s.wallet += m + pnl;
      realized = pnl;
      s.closed.unshift({
        id: nextId(), coin, dir: pos.dir, size: q, entry: pos.entry, exit: px, pnl,
        fees: openFee + fee * (q / size), lev: pos.lev, opened: pos.time, closed: Date.now(), reason, note: pos.note || null,
      });
      pos.size -= q; pos.margin -= m; pos.fees -= openFee; rem -= q;
      if (pos.size <= sizeEps(coin)) {
        delete s.positions[coin];
        dropReduceOnly(coin);
        pos = null;
      }
    }

    if (rem > sizeEps(coin)) {
      const L = lev(coin), m = (rem * px) / L, f = fee * (rem / size);
      s.wallet -= m;
      if (pos) {
        pos.entry = (pos.entry * pos.size + px * rem) / (pos.size + rem);
        pos.size += rem; pos.margin += m; pos.fees += f;
      } else {
        pos = s.positions[coin] = {
          coin, dir, size: rem, entry: px, margin: m, lev: L, fees: f, time: Date.now(), tp: null, sl: null, note: null,
        };
      }
      if (extra.note && !pos.note) pos.note = extra.note;
      if (extra.tp) pos.tp = extra.tp;
      if (extra.sl) pos.sl = extra.sl;
    }

    s.fills.unshift({ id: nextId(), time: Date.now(), coin, dir, size, px, fee, pnl: realized, kind });
    if (s.fills.length > 1000) s.fills.length = 1000;
    emit();
  }

  function liquidate(p, liq) {
    delete s.positions[p.coin];
    dropReduceOnly(p.coin);
    s.closed.unshift({
      id: nextId(), coin: p.coin, dir: p.dir, size: p.size, entry: p.entry, exit: liq, pnl: -p.margin,
      fees: p.fees, lev: p.lev, opened: p.time, closed: Date.now(), reason: 'Liquidated', note: p.note || null,
    });
    s.fills.unshift({ id: nextId(), time: Date.now(), coin: p.coin, dir: -p.dir, size: p.size, px: liq, fee: 0, pnl: -p.margin, kind: 'Liquidation' });
    emit();
  }

  function place({ coin, dir, type, size, price, reduceOnly, tp, sl, note }, book) {
    const mark = marks[coin];
    if (!mark) return err('No price yet for ' + coin);
    if (!(size > 0)) return err('Enter a size');
    const pos = s.positions[coin];
    if (reduceOnly) {
      if (!pos || pos.dir === dir) return err('Reduce only: no opposite position to reduce');
      size = Math.min(size, pos.size);
    }
    const L = lev(coin);

    if (type === 'limit') {
      if (!(price > 0)) return err('Enter a limit price');
      const crosses = dir > 0 ? price >= bestAsk(book, mark) : price <= bestBid(book, mark);
      if (!crosses) {
        const open = reduceOnly ? 0 : openingSize(coin, dir, size);
        const reserve = (open * price) / L + size * price * MAKER;
        if (open > 0 && reserve > totals().available + EPS) return err('Insufficient available balance');
        s.orders.push({ id: nextId(), coin, dir, size, price, reduceOnly: !!reduceOnly, tp, sl, note, reserve, lev: L, time: Date.now() });
        emit();
        return ok(`Limit ${dir > 0 ? 'buy' : 'sell'} placed`);
      }
    }

    let px = walk(book, dir, size, mark);
    if (type === 'limit') px = dir > 0 ? Math.min(px, price) : Math.max(px, price);
    const open = reduceOnly ? 0 : openingSize(coin, dir, size);
    const need = (open * px) / L + size * px * TAKER;
    if (open > 0 && need > totals().available + EPS) return err('Insufficient available balance');
    fill(coin, dir, size, px, TAKER, type === 'limit' ? 'Limit (taker)' : 'Market', { tp, sl, note });
    return ok(`${dir > 0 ? 'Bought' : 'Sold'} ${coin}`);
  }

  // Called with fresh mid prices. Fills resting limits, then checks liquidation and TP/SL.
  function onMarks(mids) {
    Object.assign(marks, mids);
    for (const o of [...s.orders]) {
      const m = marks[o.coin];
      if (m == null) continue;
      if (o.dir > 0 ? m > o.price : m < o.price) continue;
      s.orders = s.orders.filter((x) => x !== o);
      let size = o.size;
      const pos = s.positions[o.coin];
      if (o.reduceOnly) {
        if (!pos || pos.dir === o.dir) { emit(); continue; }
        size = Math.min(size, pos.size);
      }
      fill(o.coin, o.dir, size, o.price, MAKER, 'Limit', { tp: o.tp, sl: o.sl, note: o.note }, 'Limit close');
    }
    for (const p of Object.values(s.positions)) {
      const m = marks[p.coin];
      if (m == null) continue;
      const liq = liqPrice(p);
      if (p.dir > 0 ? m <= liq : m >= liq) { liquidate(p, liq); continue; }
      if (p.tp && (p.dir > 0 ? m >= p.tp : m <= p.tp)) { fill(p.coin, -p.dir, p.size, m, TAKER, 'Take profit', {}, 'Take profit'); continue; }
      if (p.sl && (p.dir > 0 ? m <= p.sl : m >= p.sl)) fill(p.coin, -p.dir, p.size, m, TAKER, 'Stop loss', {}, 'Stop loss');
    }
  }

  function closePosition(coin, frac = 1, book = null) {
    const p = s.positions[coin];
    if (!p) return err('No position');
    const mark = marks[coin];
    if (!mark) return err('No price yet');
    const size = frac >= 1 ? p.size : p.size * frac;
    fill(coin, -p.dir, size, walk(book, -p.dir, size, mark), TAKER, 'Market close', {}, 'Close');
    return ok(`Closed ${frac >= 1 ? '' : Math.round(frac * 100) + '% of '}${coin} position`);
  }

  function setLeverage(coin, L) {
    if (s.positions[coin]) return err(`Close your ${coin} position to change leverage`);
    s.leverage[coin] = Math.max(1, Math.min(Math.round(L), maxLev(coin)));
    emit();
    return ok();
  }

  function setTpSl(coin, tp, sl) {
    const p = s.positions[coin];
    if (!p) return err('No position');
    const m = marks[coin] ?? p.entry;
    if (tp && (p.dir > 0 ? tp <= m : tp >= m)) return err(`Take profit must be ${p.dir > 0 ? 'above' : 'below'} the current price`);
    if (sl && (p.dir > 0 ? sl >= m : sl <= m)) return err(`Stop loss must be ${p.dir > 0 ? 'below' : 'above'} the current price`);
    p.tp = tp || null;
    p.sl = sl || null;
    emit();
    return ok('TP/SL updated');
  }

  function previewLiq(coin, dir, size, px) {
    const pos = s.positions[coin], L = lev(coin);
    let p;
    if (!pos) p = { coin, dir, size, entry: px, margin: (size * px) / L };
    else if (pos.dir === dir) {
      p = { coin, dir, size: pos.size + size, entry: (pos.entry * pos.size + px * size) / (pos.size + size), margin: pos.margin + (size * px) / L };
    } else if (size < pos.size - EPS) p = { ...pos, size: pos.size - size, margin: pos.margin * (1 - size / pos.size) };
    else if (size > pos.size + EPS) { const r = size - pos.size; p = { coin, dir, size: r, entry: px, margin: (r * px) / L }; }
    else return null;
    return liqPrice(p);
  }

  return {
    TAKER, MAKER, START, marks,
    get state() { return s; },
    setMeta(m) { meta = m; },
    subscribe(fn) { subs.push(fn); },
    load(saved) { if (saved && saved.v === 1) s = saved; },
    reset(amount = START) { s = fresh(amount); emit(); },
    lev, maxLev, liqPrice, upnl, totals, place, onMarks, closePosition, setLeverage, setTpSl, previewLiq,
    cancel(id) { s.orders = s.orders.filter((o) => o.id !== id); emit(); },
    cancelAll() { s.orders = []; emit(); },
  };
})();
