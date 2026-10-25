// Staircase / elevator detector.
// A STAIRCASE is a slow, orderly trend: many small candles stepping the same way, with shallow pullbacks and
// no single candle doing the work. An ELEVATOR is the opposite: a fast move that covers a lot of ground in a
// few big candles. The market saying: "prices take the stairs up and the elevator down".
// Works in the browser (PaperPerps) and in Node (the research scripts).
const Stairs = (() => {
  const DEFAULTS = {
    minLen: 10, // candles in a staircase, at least
    maxLen: 80,
    minNetAtr: 5, // total move, measured in ATRs (average candle ranges) at the start
    minR2: 0.86, // how straight the closes line up (1 = perfectly straight)
    minSpeed: 0.12, // move per candle in ATRs: a staircase is slower than normal volatility ...
    maxSpeed: 0.7, // ... and much slower than an elevator
    maxBarShare: 0.2, // no single candle may do more than 20% of the whole move
    maxPullback: 0.3, // deepest pullback inside it, as a share of the whole move
    maxCandleAtr: 2.5, // no candle range bigger than 2.5 ATRs (that would be an elevator step)
    elevatorRetrace: 0.5, // elevator = retraces at least half the staircase ...
    elevatorSpeedX: 2, // ... at 2x the staircase speed or more
  };

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

  // Prefix sums so the straight-line fit (regression) of any window costs O(1).
  function prefix(bars) {
    const n = bars.length, Sy = new Float64Array(n + 1), Sxy = new Float64Array(n + 1), Syy = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) { const y = bars[i].c; Sy[i + 1] = Sy[i] + y; Sxy[i + 1] = Sxy[i] + i * y; Syy[i + 1] = Syy[i] + y * y; }
    return { Sy, Sxy, Syy };
  }
  function fit(P, s, e) {
    const n = e - s + 1, sx = ((s + e) * n) / 2, sxx = (e * (e + 1) * (2 * e + 1) - (s - 1) * s * (2 * s - 1)) / 6;
    const sy = P.Sy[e + 1] - P.Sy[s], sxy = P.Sxy[e + 1] - P.Sxy[s], syy = P.Syy[e + 1] - P.Syy[s];
    const vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n, cxy = sxy - (sx * sy) / n;
    const slope = cxy / vx, icpt = (sy - slope * sx) / n;
    const r2 = vy > 0 ? (cxy * cxy) / (vx * vy) : 0;
    const sd = Math.sqrt(Math.max(0, (vy - slope * cxy) / n));
    return { slope, icpt, r2, sd };
  }

  // Checks one window [s, e] in direction dir (+1 up, -1 down). Running stats are passed in by the caller.
  function passes(o, a0, net, L, r2, maxBar, pull, isExtreme) {
    if (L < o.minLen || !isExtreme || net <= 0) return false;
    const netAtr = net / a0, speed = netAtr / L;
    return netAtr >= o.minNetAtr && r2 >= o.minR2 && speed >= o.minSpeed && speed <= o.maxSpeed && maxBar <= o.maxBarShare * net && pull <= o.maxPullback * net;
  }

  // Longest valid staircase starting at s in direction dir, or null.
  function longestFrom(bars, A, P, s, dir, o) {
    const a0 = A[s];
    if (!(a0 > 0)) return null;
    let best = null, ext = bars[s].c, maxBar = 0, pull = 0;
    const lim = Math.min(bars.length - 1, s + o.maxLen);
    for (let e = s + 1; e <= lim; e++) {
      const c = bars[e].c, mv = (c - bars[e - 1].c) * dir;
      if ((c - bars[s].c) * dir < 0 || bars[e].h - bars[e].l > o.maxCandleAtr * a0) break; // start must stay the extreme; no huge candles
      if (mv > maxBar) maxBar = mv;
      const isExtreme = (c - ext) * dir >= 0;
      if (isExtreme) ext = c; else pull = Math.max(pull, (ext - c) * dir);
      const net = (c - bars[s].c) * dir, L = e - s;
      // Pullback/bar limits only get looser as net grows, but stop early when hopeless.
      if (L >= o.minLen && isExtreme) {
        const f = fit(P, s, e);
        if (f.slope * dir > 0 && passes(o, a0, net, L, f.r2, maxBar, pull, true)) best = { dir, s, e, L, net, netAtr: net / a0, speed: net / a0 / L, r2: f.r2, slope: f.slope, icpt: f.icpt, sd: f.sd, atr: a0 };
      }
      if (pull > 1.5 * Math.max(net, 4 * a0) && L > o.minLen) break;
    }
    return best;
  }

  // All staircases in the history, non-overlapping, scanning left to right (uses hindsight: for research and drawing).
  function find(bars, opts = {}) {
    const o = { ...DEFAULTS, ...opts }, A = atr(bars), P = prefix(bars), out = [];
    let s = 15;
    while (s < bars.length - o.minLen) {
      const u = longestFrom(bars, A, P, s, 1, o), d = longestFrom(bars, A, P, s, -1, o);
      const st = u && d ? (u.L >= d.L ? u : d) : u || d;
      if (st) { out.push(st); s = st.e; } else s++;
    }
    return out;
  }

  // What happened after a staircase ended. Looks ahead up to L candles.
  function outcome(bars, st, o = DEFAULTS) {
    const { dir, e, L, net } = st, endC = bars[e].c, W = Math.max(3, Math.round(L / 3)), H = L;
    let retraceBar = null, newExtBar = null, maxRet = 0;
    for (let k = 1; k <= H && e + k < bars.length; k++) {
      const b = bars[e + k];
      const ret = ((endC - (dir > 0 ? b.l : b.h)) * dir) / net;
      maxRet = Math.max(maxRet, ret);
      if (retraceBar == null && ret >= o.elevatorRetrace) retraceBar = k;
      if (newExtBar == null && ((dir > 0 ? b.h : b.l) - endC) * dir >= 0.5 * net) newExtBar = k;
      if (retraceBar != null || newExtBar != null) break;
    }
    const enough = e + Math.min(H, W) < bars.length;
    if (!enough) return { kind: 'open' };
    if (retraceBar != null && retraceBar <= W) {
      // Elevator: retraced half or more within a third of the staircase's length -> at least ~1.5x faster.
      return { kind: 'elevator', bars: retraceBar, speedX: (o.elevatorRetrace * net / retraceBar) / (net / L) };
    }
    if (retraceBar != null) return { kind: 'fade', bars: retraceBar };
    if (newExtBar != null) return { kind: 'continue', bars: newExtBar };
    return { kind: 'sideways', maxRet };
  }

  // Live scan without hindsight: at each candle, is a staircase in progress (ending here)? And when does price
  // close outside its channel on the other side (the "break")? Returns the latest active staircase and break events.
  function live(bars, opts = {}) {
    const o = { ...DEFAULTS, ...opts }, A = atr(bars), P = prefix(bars), breaks = [];
    let active = null;
    for (let t = 30; t < bars.length; t++) {
      // Is there a valid staircase ending at t? Try start points from long to short.
      let cur = null;
      for (let L = Math.min(o.maxLen, t - 15); L >= o.minLen && !cur; L -= 2) {
        const s = t - L;
        for (const dir of [1, -1]) {
          const st = endsAt(bars, A, P, s, t, dir, o);
          if (st) { cur = st; break; }
        }
      }
      if (cur) { active = { ...cur, lastValid: t }; continue; }
      if (!active) continue;
      // Channel line and lower/upper band projected to t.
      const mid = active.icpt + active.slope * t, band = mid - active.dir * Math.max(2 * active.sd, active.atr);
      const c = bars[t].c;
      if ((band - c) * active.dir > 0) { breaks.push({ ...active, breakAt: t, breakPrice: c }); active = null; continue; }
      if (t - active.lastValid > active.L) active = null; // went sideways for too long: forget it
    }
    return { active, breaks };
  }
  function endsAt(bars, A, P, s, e, dir, o) {
    const a0 = A[s];
    if (!(a0 > 0)) return null;
    const net = (bars[e].c - bars[s].c) * dir, L = e - s;
    if (net <= 0 || net / a0 < o.minNetAtr) return null;
    const speed = net / a0 / L;
    if (speed < o.minSpeed || speed > o.maxSpeed) return null;
    let ext = bars[s].c, maxBar = 0, pull = 0;
    for (let i = s + 1; i <= e; i++) {
      const c = bars[i].c, mv = (c - bars[i - 1].c) * dir;
      if ((c - bars[s].c) * dir < 0 || bars[i].h - bars[i].l > o.maxCandleAtr * a0) return null;
      if (mv > maxBar) maxBar = mv;
      if ((c - ext) * dir >= 0) ext = c; else pull = Math.max(pull, (ext - c) * dir);
    }
    if ((bars[e].c - ext) * dir < 0) return null;
    const f = fit(P, s, e);
    if (f.slope * dir <= 0 || !passes(o, a0, net, L, f.r2, maxBar, pull, true)) return null;
    return { dir, s, e, L, net, netAtr: net / a0, speed, r2: f.r2, slope: f.slope, icpt: f.icpt, sd: f.sd, atr: a0 };
  }

  return { DEFAULTS, atr, find, outcome, live };
})();
if (typeof module !== 'undefined') module.exports = Stairs;
