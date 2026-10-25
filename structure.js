// Market structure engine: swing points, HH/HL/LH/LL, Break of Structure (BOS) and Change of Character (CHoCH),
// trading ranges (accumulation / distribution), double tops/bottoms and head & shoulders.
// Everything is computed candle by candle WITHOUT hindsight: a swing point only exists once `right` candles
// have closed after it, and patterns only confirm on a candle close. Works in the browser and in Node.
// bars: [{ t, o, h, l, c }] (PaperPerps converts KLineChart data to this shape).
const Structure = (() => {
  // Per-timeframe settings chosen by the research (see the handbook's Structure page). Fallback = DEFAULTS.
  const DEFAULTS = {
    left: 5, right: 5, // a swing high is the highest high of `left` candles before and `right` after
    minSwingAtr: 1.5, // ignore swings smaller than this many ATRs (noise)
    eqTolAtr: 0.6, // double top/bottom: the two peaks must be within this many ATRs
    minDepthAtr: 2.5, // double top/bottom and H&S: neckline at least this far from the peaks
    shoulderTol: 0.5, // H&S: shoulder heights may differ by at most this share of the head's height
    headAtr: 0.8, // H&S: head must stick out above both shoulders by this many ATRs
    rangeMin: 20, // a trading range lasts at least this many candles ...
    rangeAtr: 4, // ... inside a band no wider than this many ATRs
    expireX: 1.5, // a pattern not confirmed within 1.5x its own width expires
  };
  const PRESETS = {};

  function atr(bars, n = 14) {
    const out = new Array(bars.length).fill(null);
    let a = null;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i], pc = i ? bars[i - 1].c : b.o;
      const tr = Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
      a = a == null ? tr : i < n ? (a * i + tr) / (i + 1) : (a * (n - 1) + tr) / n;
      out[i] = a;
    }
    return out;
  }

  function analyze(bars, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const n = bars.length, A = atr(bars);
    const swings = []; // alternating H / L: { type: 'H'|'L', i, price, at (confirmed on candle), label }
    const events = []; // { kind: 'BOS'|'CHoCH', dir, i (break candle), level, from (swing index) }
    const patterns = []; // double tops/bottoms and H&S with status
    const ranges = [];
    let trend = 0, brokeH = -1, brokeL = -1;
    const pending = [];

    const lastOf = (type, before = swings.length) => { for (let k = before - 1; k >= 0; k--) if (swings[k].type === type) return k; return -1; };

    for (let t = 0; t < n; t++) {
      // 1) Confirm a swing point at p = t - right.
      const p = t - o.right;
      if (p >= o.left) {
        let isH = true, isL = true;
        for (let k = p - o.left; k <= p + o.right; k++) {
          if (k === p) continue;
          if (bars[k].h > bars[p].h || (k > p && bars[k].h === bars[p].h)) isH = false;
          if (bars[k].l < bars[p].l || (k > p && bars[k].l === bars[p].l)) isL = false;
        }
        for (const type of isH && isL ? (bars[p].c >= bars[p].o ? ['L', 'H'] : ['H', 'L']) : isH ? ['H'] : isL ? ['L'] : []) addSwing(type, p, t);
      }
      // 2) Breaks of structure on the close.
      const c = bars[t].c;
      const hk = lastOf('H'), lk = lastOf('L');
      if (hk >= 0 && hk !== brokeH && c > swings[hk].price) {
        events.push({ kind: trend === -1 ? 'CHoCH' : 'BOS', dir: 1, i: t, level: swings[hk].price, from: swings[hk].i });
        trend = 1; brokeH = hk;
      }
      if (lk >= 0 && lk !== brokeL && c < swings[lk].price) {
        events.push({ kind: trend === 1 ? 'CHoCH' : 'BOS', dir: -1, i: t, level: swings[lk].price, from: swings[lk].i });
        trend = -1; brokeL = lk;
      }
      // 3) Pattern confirmation / invalidation.
      for (let k = pending.length - 1; k >= 0; k--) {
        const pt = pending[k], neck = pt.neckAt(t);
        if ((pt.dir === -1 && c < neck) || (pt.dir === 1 && c > neck)) {
          pt.status = 'confirmed'; pt.confirmAt = t; pt.entry = c; pt.neckAtConfirm = neck;
          pt.target = neck + pt.dir * pt.height;
          pending.splice(k, 1);
        } else if ((pt.dir === -1 && c > pt.invalid) || (pt.dir === 1 && c < pt.invalid) || t > pt.expires) {
          pt.status = (pt.dir === -1 && c > pt.invalid) || (pt.dir === 1 && c < pt.invalid) ? 'invalid' : 'expired';
          pt.endAt = t;
          pending.splice(k, 1);
        }
      }
    }

    function addSwing(type, i, at) {
      const price = type === 'H' ? bars[i].h : bars[i].l;
      const last = swings[swings.length - 1];
      if (last && last.type === type) {
        // Two highs (or lows) in a row: keep the more extreme one.
        if ((type === 'H' && price > last.price) || (type === 'L' && price < last.price)) { swings.pop(); } else return;
      } else if (last && Math.abs(price - last.price) < o.minSwingAtr * A[i]) {
        return; // too small a swing: noise
      }
      const prevK = lastOf(type);
      const prev = prevK >= 0 ? swings[prevK] : null;
      const label = !prev ? null : type === 'H' ? (price > prev.price ? 'HH' : 'LH') : price < prev.price ? 'LL' : 'HL';
      swings.push({ type, i, price, at, label, atr: A[i] });
      findPatterns(at);
    }

    function findPatterns(at) {
      const s = swings, m = s.length, last = s[m - 1];
      // Double top (H L H) / double bottom (L H L)
      if (m >= 3) {
        const a = s[m - 3], mid = s[m - 2], b = last, at0 = b.atr;
        const dir = b.type === 'H' ? -1 : 1; // -1 = bearish (double top)
        const peak = dir === -1 ? Math.max(a.price, b.price) : Math.min(a.price, b.price);
        const depth = (peak - mid.price) * -dir;
        if (Math.abs(a.price - b.price) <= o.eqTolAtr * at0 && depth >= o.minDepthAtr * at0 && b.i - a.i >= 6) {
          const width = b.i - a.i;
          pending.push(mk({ kind: dir === -1 ? 'doubleTop' : 'doubleBottom', dir, pts: [a, mid, b], neckAt: () => mid.price, height: depth, invalid: peak, start: a.i, end: b.i, detectedAt: at, expires: at + Math.round(width * o.expireX) }));
        }
      }
      // Head & shoulders (H L H L H) / inverse (L H L H L)
      if (m >= 5) {
        const [ls, t1, hd, t2, rs] = s.slice(m - 5);
        const dir = rs.type === 'H' ? -1 : 1;
        const x = (v) => v * -dir; // flip so "up" means toward the head
        const at0 = rs.atr;
        const nk = (i) => t1.price + ((t2.price - t1.price) * (i - t1.i)) / (t2.i - t1.i);
        const headH = x(hd.price) - x(nk(hd.i));
        if (x(hd.price) - Math.max(x(ls.price), x(rs.price)) >= o.headAtr * at0 && headH >= o.minDepthAtr * at0 &&
            Math.abs(ls.price - rs.price) <= o.shoulderTol * headH && x(ls.price) > x(nk(ls.i)) && x(rs.price) > x(nk(rs.i))) {
          const width = rs.i - ls.i;
          pending.push(mk({ kind: dir === -1 ? 'headShoulders' : 'invHeadShoulders', dir, pts: [ls, t1, hd, t2, rs], neckAt: nk, height: headH, invalid: hd.price, stopAlt: rs.price, start: ls.i, end: rs.i, detectedAt: at, expires: at + Math.round(width * 0.75) }));
        }
      }
    }
    function mk(pt) { pt.status = 'pending'; patterns.push(pt); return pt; }

    // Trading ranges: windows of >= rangeMin candles inside a band <= rangeAtr ATRs wide; named on the breakout.
    let r0 = 0;
    while (r0 < n - o.rangeMin) {
      let hi = -Infinity, lo = Infinity, e = r0;
      const a0 = A[r0 + o.rangeMin - 1] || A[r0];
      for (; e < n; e++) {
        const h2 = Math.max(hi, bars[e].h), l2 = Math.min(lo, bars[e].l);
        if (h2 - l2 > o.rangeAtr * a0) break;
        hi = h2; lo = l2;
      }
      if (e - r0 >= o.rangeMin) {
        // Breakout candle = e (first candle that would widen the band too much), if it closes outside.
        let brk = null;
        if (e < n) brk = bars[e].c > hi ? 1 : bars[e].c < lo ? -1 : 0;
        const before = r0 >= 30 ? Math.sign(bars[r0].c - bars[r0 - 30].c) : 0;
        ranges.push({ start: r0, end: e - 1, hi, lo, breakAt: e < n ? e : null, breakDir: brk, before, name: brk === 1 ? 'Accumulation' : brk === -1 ? 'Distribution' : 'Range' });
        r0 = e;
      } else r0++;
    }
    return { swings, events, patterns, ranges, trend, atr: A };
  }

  return { DEFAULTS, PRESETS, analyze, atr };
})();
if (typeof module !== 'undefined') module.exports = Structure;
