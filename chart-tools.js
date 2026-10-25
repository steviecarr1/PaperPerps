// Extra drawing tools and indicators for the Trading Chart (KLineChart v9), modeled on Crayon Charts' set.
// Each drawing reads its colour from extendData.color so the colour picker can restyle it.
const ChartTools = (() => {
  const BLUE = '#5b8cff', UP = '#0ecb81', DN = '#f6465d', TXT = '#e6e9ef', FONT = 'Segoe UI';
  let h = { dataList: () => [], barMs: () => 6e4, equity: () => 0, coin: () => '', fp: (v) => String(v), candle: () => ({ up: UP, down: DN }) };

  const colorOf = (o) => o.extendData?.color || BLUE;
  // '#rrggbb' + alpha -> '#rrggbbaa'
  const fade = (c, a) => (/^#[0-9a-f]{6}$/i.test(c) ? c + Math.round(a * 255).toString(16).padStart(2, '0') : c);
  const label = (x, y, text, color, opts = {}) => ({
    type: 'text', ignoreEvent: true,
    attrs: { x, y, text, align: opts.align || 'left', baseline: opts.baseline || 'middle' },
    styles: { color: opts.fg || '#0b0e11', backgroundColor: color, size: 11, family: FONT, weight: 600, paddingLeft: 5, paddingRight: 5, paddingTop: 3, paddingBottom: 3, borderRadius: 2, borderSize: 0 },
  });
  const pct = (a, b) => ((b - a) / a) * 100;
  // TradingView's default fib retracement levels and colours (extensions below 1 included).
  const FIB_LEVELS = [[0, '#787b86'], [0.236, '#f23645'], [0.382, '#ff9800'], [0.5, '#4caf50'], [0.618, '#089981'], [0.786, '#00bcd4'],
    [1, '#787b86'], [1.618, '#2962ff'], [2.618, '#f23645'], [3.618, '#9c27b0'], [4.236, '#e91e63']];
  // Bar index of a drawing point, found by its time: indexes shift when older history loads.
  const idx = (pt) => {
    const list = h.dataList();
    if (!list.length) return 0;
    if (!isFinite(pt.timestamp)) return pt.dataIndex ?? 0;
    let lo = 0, hi = list.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].timestamp < pt.timestamp) lo = m + 1; else hi = m; }
    if (list[lo].timestamp > pt.timestamp && lo === list.length - 1) return lo;
    // Past the last bar: count whole bars beyond it.
    if (pt.timestamp > list[list.length - 1].timestamp) return list.length - 1 + Math.round((pt.timestamp - list[list.length - 1].timestamp) / h.barMs());
    return lo;
  };
  const sign = (v) => (v > 0 ? '+' : '');
  const span = (ms) => {
    const m = Math.round(ms / 6e4);
    if (m < 60) return m + 'm';
    const hr = Math.floor(m / 60);
    return hr < 48 ? `${hr}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}` : `${Math.floor(hr / 24)}d ${hr % 24}h`;
  };
  const base = { needDefaultPointFigure: true, needDefaultXAxisFigure: true, needDefaultYAxisFigure: true };
  // A complete indicator line style: KLineChart reads every field when it merges line segments.
  const L = (color, size = 1) => ({ style: 'solid', smooth: false, size, dashedValue: [2, 2], color });

  // ---------- shapes ----------
  const shapes = [
    {
      name: 'box', totalStep: 3,
      createPointFigures: ({ coordinates: c, overlay }) => {
        if (c.length < 2) return [];
        const col = colorOf(overlay);
        return [{ type: 'polygon', attrs: { coordinates: [c[0], { x: c[1].x, y: c[0].y }, c[1], { x: c[0].x, y: c[1].y }] }, styles: { style: 'stroke_fill', color: fade(col, 0.12), borderColor: col, borderSize: 1 } }];
      },
    },
    {
      name: 'circleShape', totalStep: 3,
      createPointFigures: ({ coordinates: c, overlay }) => {
        if (c.length < 2) return [];
        const col = colorOf(overlay), r = Math.hypot(c[1].x - c[0].x, c[1].y - c[0].y);
        return [{ type: 'circle', attrs: { x: c[0].x, y: c[0].y, r }, styles: { style: 'stroke_fill', color: fade(col, 0.12), borderColor: col, borderSize: 1 } }];
      },
    },
    {
      name: 'ellipse', totalStep: 3,
      createPointFigures: ({ coordinates: c, overlay }) => {
        if (c.length < 2) return [];
        const col = colorOf(overlay);
        const cx = (c[0].x + c[1].x) / 2, cy = (c[0].y + c[1].y) / 2, rx = Math.abs(c[1].x - c[0].x) / 2, ry = Math.abs(c[1].y - c[0].y) / 2;
        const pts = Array.from({ length: 64 }, (_, i) => ({ x: cx + rx * Math.cos((i / 64) * Math.PI * 2), y: cy + ry * Math.sin((i / 64) * Math.PI * 2) }));
        return [{ type: 'polygon', attrs: { coordinates: pts }, styles: { style: 'stroke_fill', color: fade(col, 0.12), borderColor: col, borderSize: 1 } }];
      },
    },
    {
      name: 'triangle', totalStep: 4,
      createPointFigures: ({ coordinates: c, overlay }) => {
        const col = colorOf(overlay);
        if (c.length === 2) return [{ type: 'line', attrs: { coordinates: c }, styles: { color: col } }];
        if (c.length < 3) return [];
        return [{ type: 'polygon', attrs: { coordinates: c }, styles: { style: 'stroke_fill', color: fade(col, 0.12), borderColor: col, borderSize: 1 } }];
      },
    },
    {
      name: 'arrowLine', totalStep: 3,
      createPointFigures: ({ coordinates: c, overlay }) => {
        if (c.length < 2) return [];
        const col = colorOf(overlay), [a, b] = c, ang = Math.atan2(b.y - a.y, b.x - a.x), L = 11;
        const head = [b, { x: b.x - L * Math.cos(ang - 0.45), y: b.y - L * Math.sin(ang - 0.45) }, { x: b.x - L * Math.cos(ang + 0.45), y: b.y - L * Math.sin(ang + 0.45) }];
        return [
          { type: 'line', attrs: { coordinates: [a, b] }, styles: { color: col, size: 2 } },
          { type: 'polygon', attrs: { coordinates: head }, styles: { style: 'fill', color: col } },
        ];
      },
    },
    {
      name: 'textNote', totalStep: 2, needDefaultXAxisFigure: false, needDefaultYAxisFigure: false,
      createPointFigures: ({ coordinates: c, overlay }) => {
        if (!c.length) return [];
        const col = colorOf(overlay), text = overlay.extendData?.text || 'Text';
        return [{ type: 'text', attrs: { x: c[0].x, y: c[0].y, text, align: 'left', baseline: 'bottom' }, styles: { color: col, size: 14, family: FONT, weight: 600, backgroundColor: 'rgba(11,14,17,0.55)', paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, borderRadius: 3, borderSize: 0 } }];
      },
    },
  ];

  // ---------- measuring & trade planning ----------
  const planning = [
    {
      // Date & price range: price change, % change, bars and time between two clicks.
      name: 'measure', totalStep: 3,
      createPointFigures: ({ coordinates: c, overlay }) => {
        if (c.length < 2) return [];
        const [p0, p1] = overlay.points;
        const up = p1.value >= p0.value, col = up ? BLUE : DN;
        const d = p1.value - p0.value, bars = idx(p1) - idx(p0);
        const midX = (c[0].x + c[1].x) / 2, bottom = Math.max(c[0].y, c[1].y);
        return [
          { type: 'polygon', attrs: { coordinates: [c[0], { x: c[1].x, y: c[0].y }, c[1], { x: c[0].x, y: c[1].y }] }, styles: { style: 'fill', color: fade(col, 0.15) } },
          { type: 'line', attrs: { coordinates: [{ x: midX, y: c[0].y }, { x: midX, y: c[1].y }] }, styles: { color: col } },
          { type: 'line', attrs: { coordinates: [{ x: c[0].x, y: (c[0].y + c[1].y) / 2 }, { x: c[1].x, y: (c[0].y + c[1].y) / 2 }] }, styles: { color: col } },
          label(midX, bottom + 14, `${sign(d)}${h.fp(d)} (${sign(d)}${pct(p0.value, p1.value).toFixed(2)}%)`, col, { align: 'center', fg: '#fff' }),
          label(midX, bottom + 34, `${Math.abs(bars)} bars, ${span(Math.abs(bars) * h.barMs())}`, col, { align: 'center', fg: '#fff' }),
        ];
      },
    },
    ...[1, -1].map((dir) => ({
      // Long / short position: click entry, then target (also sets the width), then stop.
      name: dir > 0 ? 'longPosition' : 'shortPosition', totalStep: 4,
      performEventMoveForDrawing: ({ currentStep, points, performPoint }) => {
        if (currentStep === 3 && points[1]) { performPoint.dataIndex = points[1].dataIndex; performPoint.timestamp = points[1].timestamp; }
      },
      performEventPressedMove: ({ points, performPointIndex }) => {
        if (points.length > 2 && (performPointIndex === 1 || performPointIndex === 2)) {
          const src = points[performPointIndex], other = points[performPointIndex === 1 ? 2 : 1];
          other.dataIndex = src.dataIndex; other.timestamp = src.timestamp;
        }
      },
      createPointFigures: ({ coordinates: c, overlay, bounding }) => {
        if (c.length < 2) return [];
        const p = overlay.points, e = p[0].value, t = p[1].value, s = p[2]?.value;
        const x0 = c[0].x, x1 = c[1].x > c[0].x + 4 ? c[1].x : Math.min(bounding.width, c[0].x + 160);
        const zone = (y1, y2, col) => ({ type: 'polygon', ignoreEvent: true, attrs: { coordinates: [{ x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y2 }, { x: x0, y: y2 }] }, styles: { style: 'fill', color: fade(col, 0.2) } });
        const out = [zone(c[0].y, c[1].y, UP), { type: 'line', attrs: { coordinates: [{ x: x0, y: c[0].y }, { x: x1, y: c[0].y }] }, styles: L('#c9ced8') }];
        const reward = (t - e) * dir;
        out.push(label(x0 + 4, c[1].y, `Target ${h.fp(t)} (${sign(reward)}${((reward / e) * 100).toFixed(2)}%)`, UP, { baseline: dir > 0 ? 'bottom' : 'top' }));
        if (c.length > 2 && s != null) {
          const risk = (e - s) * dir;
          out.push(zone(c[0].y, c[2].y, DN));
          out.push(label(x0 + 4, c[2].y, `Stop ${h.fp(s)} (${((-risk / e) * 100).toFixed(2)}%)`, DN, { baseline: dir > 0 ? 'top' : 'bottom', fg: '#fff' }));
          const rr = risk > 0 ? (reward / risk).toFixed(2) : '-';
          const eq = h.equity(), qty = risk > 0 && eq > 0 ? (eq * 0.01) / risk : 0;
          const sizeTxt = qty > 0 ? `  |  1% risk: ${qty.toPrecision(3)} ${h.coin()} ($${Math.round(qty * e).toLocaleString('en-US')})` : '';
          out.push(label(x0 + 4, c[0].y, `${dir > 0 ? 'Long' : 'Short'}  R:R ${rr}${sizeTxt}`, '#c9ced8'));
        }
        return out;
      },
    })),
    {
      // Fib retracement, TradingView style: only between the two clicks, coloured bands between levels,
      // "level (price)" labels on the left and a dashed line along the drawn move. 1 = first click, 0 = second.
      name: 'fibRetrace', totalStep: 3,
      createPointFigures: ({ coordinates: c, overlay }) => {
        const col = colorOf(overlay), out = [];
        if (c.length < 2) return out;
        out.push({ type: 'line', attrs: { coordinates: [c[0], c[1]] }, styles: { style: 'dashed', color: fade(col, 0.8), dashedValue: [4, 3] } });
        const [A, B] = overlay.points, xL = Math.min(c[0].x, c[1].x), xR = Math.max(c[0].x, c[1].x);
        if (xR - xL < 2 || A.value === B.value) return out;
        const yPer = (c[0].y - c[1].y) / (A.value - B.value);
        const lv = FIB_LEVELS.map(([k, color]) => { const v = B.value + (A.value - B.value) * k; return { k, color, v, y: c[1].y + (v - B.value) * yPer }; });
        for (let i = 1; i < lv.length; i++) {
          const a = lv[i - 1], b = lv[i];
          out.push({ type: 'polygon', ignoreEvent: true, attrs: { coordinates: [{ x: xL, y: a.y }, { x: xR, y: a.y }, { x: xR, y: b.y }, { x: xL, y: b.y }] }, styles: { style: 'fill', color: fade(b.color, 0.14) } });
        }
        for (const l of lv) {
          out.push({ type: 'line', attrs: { coordinates: [{ x: xL, y: l.y }, { x: xR, y: l.y }] }, styles: { color: l.color, size: 1 } });
          out.push({ type: 'text', ignoreEvent: true, attrs: { x: xL - 4, y: l.y, text: `${l.k} (${h.fp(l.v)})`, align: 'right', baseline: 'middle' }, styles: { color: l.color, size: 11, family: FONT, backgroundColor: 'transparent' } });
        }
        return out;
      },
    },
    {
      // Trend-based fib extension: A -> B move projected from C.
      name: 'fibProjection', totalStep: 4,
      createPointFigures: ({ coordinates: c, overlay, bounding }) => {
        const col = colorOf(overlay), dashed = { style: 'dashed', color: col, dashedValue: [4, 3] };
        const out = [];
        if (c.length >= 2) out.push({ type: 'line', attrs: { coordinates: c.slice(0, 3) }, styles: dashed });
        if (c.length < 3) return out;
        const [A, B, Cp] = overlay.points, move = B.value - A.value;
        const levels = [0, 0.618, 1, 1.272, 1.618, 2, 2.618];
        const yPer = (c[2].y - c[0].y) / ((Cp.value - A.value) || 1e-12);
        for (const k of levels) {
          const v = Cp.value + move * k, y = c[2].y + (v - Cp.value) * yPer;
          out.push({ type: 'line', attrs: { coordinates: [{ x: c[2].x, y }, { x: bounding.width, y }] }, styles: { color: fade(col, k === 1 || k === 1.618 ? 1 : 0.6) } });
          out.push({ type: 'text', ignoreEvent: true, attrs: { x: c[2].x + 4, y, text: `${k} (${h.fp(v)})`, baseline: 'bottom' }, styles: { color: col, size: 11, family: FONT, backgroundColor: 'transparent' } });
        }
        return out;
      },
    },
    {
      // Fixed range volume profile: volume traded at each price between two clicks.
      name: 'frvp', totalStep: 3,
      createPointFigures: ({ coordinates: c, overlay, yAxis }) => {
        if (c.length < 2 || !yAxis) return [];
        const list = h.dataList();
        const a = idx(overlay.points[0]), b = idx(overlay.points[1]);
        const i0 = Math.max(0, Math.min(a, b)), i1 = Math.min(list.length - 1, Math.max(a, b));
        const prof = profile(list, i0, i1, 30);
        const xL = Math.min(c[0].x, c[1].x), xR = Math.max(c[0].x, c[1].x), w = (xR - xL) * 0.75;
        const out = [{ type: 'polygon', ignoreEvent: true, attrs: { coordinates: [{ x: xL, y: 0 }, { x: xR, y: 0 }, { x: xR, y: 99999 }, { x: xL, y: 99999 }] }, styles: { style: 'fill', color: 'rgba(91,140,255,0.04)' } }];
        if (!prof) return out;
        for (const row of prof.rows) {
          const yTop = yAxis.convertToPixel(row.hi), yBot = yAxis.convertToPixel(row.lo);
          const len = (row.vol / prof.max) * w;
          out.push({ type: 'rect', ignoreEvent: true, attrs: { x: xL, y: Math.min(yTop, yBot) + 0.5, width: len, height: Math.max(1, Math.abs(yBot - yTop) - 1) }, styles: { style: 'fill', color: row.poc ? 'rgba(240,185,11,0.75)' : row.va ? 'rgba(91,140,255,0.45)' : 'rgba(125,134,150,0.3)' } });
        }
        const yP = yAxis.convertToPixel(prof.poc);
        out.push({ type: 'line', ignoreEvent: true, attrs: { coordinates: [{ x: xL, y: yP }, { x: xR, y: yP }] }, styles: { color: '#f0b90b', style: 'dashed', dashedValue: [4, 3] } });
        out.push({ type: 'line', attrs: { coordinates: [{ x: xL, y: c[0].y }, { x: xL, y: c[1].y }] }, styles: { color: BLUE } });
        out.push({ type: 'line', attrs: { coordinates: [{ x: xR, y: c[0].y }, { x: xR, y: c[1].y }] }, styles: { color: BLUE } });
        return out;
      },
    },
  ];

  // Volume at price over bars i0..i1: each candle's volume spread evenly over its high-low range.
  function profile(list, i0, i1, nRows) {
    if (i1 < i0 || !list.length) return null;
    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i <= i1; i++) { lo = Math.min(lo, list[i].low); hi = Math.max(hi, list[i].high); }
    if (!(hi > lo)) return null;
    const step = (hi - lo) / nRows, vols = new Array(nRows).fill(0);
    for (let i = i0; i <= i1; i++) {
      const k = list[i], range = Math.max(k.high - k.low, step * 1e-6);
      const a = Math.max(0, Math.floor((k.low - lo) / step)), b = Math.min(nRows - 1, Math.floor((k.high - lo) / step));
      for (let r = a; r <= b; r++) {
        const overlap = Math.min(k.high, lo + (r + 1) * step) - Math.max(k.low, lo + r * step);
        vols[r] += (k.volume || 0) * (k.high === k.low ? 1 / (b - a + 1) : Math.max(0, overlap) / range);
      }
    }
    const total = vols.reduce((x, y) => x + y, 0), max = Math.max(...vols) || 1, pocIdx = vols.indexOf(max);
    // Value area: grow out from the POC until 70% of volume is covered.
    let inVa = new Set([pocIdx]), acc = vols[pocIdx], up = pocIdx + 1, dn = pocIdx - 1;
    while (acc < total * 0.7 && (up < nRows || dn >= 0)) {
      if (dn < 0 || (up < nRows && vols[up] >= vols[dn])) { acc += vols[up]; inVa.add(up++); } else { acc += vols[dn]; inVa.add(dn--); }
    }
    return {
      max, poc: lo + (pocIdx + 0.5) * step,
      rows: vols.map((vol, r) => ({ lo: lo + r * step, hi: lo + (r + 1) * step, vol, poc: r === pocIdx, va: inVa.has(r) })),
    };
  }

  // ---------- indicators ----------
  const ema = (vals, n) => {
    const out = new Array(vals.length).fill(null), k = 2 / (n + 1);
    let prev = null, sum = 0;
    vals.forEach((v, i) => {
      if (i < n - 1) { sum += v; return; }
      if (i === n - 1) { sum += v; prev = sum / n; } else prev = v * k + prev * (1 - k);
      out[i] = prev;
    });
    return out;
  };
  const sma = (vals, n) => vals.map((_, i) => {
    if (i < n - 1) return null;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) { if (vals[j] == null) return null; s += vals[j]; }
    return s / n;
  });
  const rsi = (closes, n) => {
    const out = new Array(closes.length).fill(null);
    let g = 0, l = 0;
    for (let i = 1; i < closes.length; i++) {
      const ch = closes[i] - closes[i - 1], up = Math.max(ch, 0), dn = Math.max(-ch, 0);
      if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } continue; }
      g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  };
  const stochOf = (src, hiSrc, loSrc, n) => src.map((v, i) => {
    if (i < n - 1 || v == null) return null;
    let hh = -Infinity, ll = Infinity;
    for (let j = i - n + 1; j <= i; j++) { if (hiSrc[j] == null || loSrc[j] == null) return null; hh = Math.max(hh, hiSrc[j]); ll = Math.min(ll, loSrc[j]); }
    return hh === ll ? 50 : ((v - ll) / (hh - ll)) * 100;
  });

  // Crayon-style legend: "RSI 14  52.3", each value in its line colour.
  const big = (v) => { const a = Math.abs(v); return a >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (v / 1e3).toFixed(2) + 'K' : v.toFixed(0); };
  function tip({ indicator, crosshair, kLineDataList, defaultStyles }) {
    const i = crosshair?.dataIndex ?? kLineDataList.length - 1, d = indicator.result?.[i] || {};
    const muted = defaultStyles?.tooltip?.text?.color || '#9aa4b2';
    return {
      name: indicator.shortName,
      calcParamsText: indicator.calcParams.length ? ' ' + indicator.calcParams.join(' ') : '',
      values: indicator.figures.map((f) => {
        const v = d[f.key];
        const text = typeof v !== 'number' ? '-' : f.px ? h.fp(v) : indicator.shouldFormatBigNumber ? big(v) : v.toLocaleString('en-US', { minimumFractionDigits: indicator.precision, maximumFractionDigits: indicator.precision });
        return { title: { text: '', color: muted }, value: { text, color: f.c || muted } };
      }),
    };
  }
  // Shade between two result series across the visible bars (skips gaps).
  function fillBetween({ ctx, indicator, visibleRange, xAxis, yAxis }, ka, kb, color) {
    const r = indicator.result || [];
    ctx.fillStyle = color;
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        ctx.beginPath();
        run.forEach((p, j) => (j ? ctx.lineTo(p.x, p.a) : ctx.moveTo(p.x, p.a)));
        for (let j = run.length - 1; j >= 0; j--) ctx.lineTo(run[j].x, run[j].b);
        ctx.closePath(); ctx.fill();
      }
      run = [];
    };
    for (let i = Math.max(0, visibleRange.from - 1); i < Math.min(r.length, visibleRange.to + 1); i++) {
      const a = r[i]?.[ka], b = r[i]?.[kb];
      if (a == null || b == null) { flush(); continue; }
      run.push({ x: xAxis.convertToPixel(i), a: yAxis.convertToPixel(a), b: yAxis.convertToPixel(b) });
    }
    flush();
  }
  // Oscillator guides: shaded band between the overbought/oversold levels with dashed edges.
  function guideBand({ ctx, bounding, yAxis }, hi, lo, color) {
    const yH = Math.round(yAxis.convertToPixel(hi)) + 0.5, yL = Math.round(yAxis.convertToPixel(lo)) + 0.5;
    ctx.fillStyle = fade(color, 0.06);
    ctx.fillRect(0, yH, bounding.width, yL - yH);
    ctx.strokeStyle = 'rgba(140,150,170,0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, yH); ctx.lineTo(bounding.width, yH);
    ctx.moveTo(0, yL); ctx.lineTo(bounding.width, yL);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // RSI divergences, as TradingView's RSI "Calculate Divergence": RSI pivots 5 bars each side, the previous pivot
  // 5-60 bars back. Bullish = RSI higher low while price makes a lower low; bearish = RSI lower high while price
  // makes a higher high. A pivot is only known 5 candles later, like on TradingView.
  function rsiDivergences(list, r, L = 5, R = 5, min = 5, max = 60) {
    let pl = null, ph = null;
    for (let i = L; i < list.length - R; i++) {
      const v = r[i];
      if (v == null) continue;
      let lo = true, hi = true;
      for (let k = i - L; k <= i + R && (lo || hi); k++) {
        if (k === i) continue;
        const w = r[k];
        if (w == null) { lo = hi = false; break; }
        if (w <= v) lo = false;
        if (w >= v) hi = false;
      }
      if (lo) { if (pl != null && i - pl >= min && i - pl <= max && v > r[pl] && list[i].low < list[pl].low) r.div[i] = { a: pl, bull: true }; pl = i; }
      if (hi) { if (ph != null && i - ph >= min && i - ph <= max && v < r[ph] && list[i].high > list[ph].high) r.div[i] = { a: ph, bull: false }; ph = i; }
    }
  }
  function drawDivergences({ ctx, bounding, indicator, visibleRange, xAxis, yAxis }) {
    const res = indicator.result || [];
    ctx.font = '600 11px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let b = visibleRange.from; b < Math.min(res.length, visibleRange.to + 60); b++) {
      const d = res[b]?.div;
      if (!d || d.a >= visibleRange.to) continue;
      const color = d.bull ? '#4caf50' : '#f23645';
      const x1 = xAxis.convertToPixel(d.a), y1 = yAxis.convertToPixel(res[d.a].rsi), x2 = xAxis.convertToPixel(b), y2 = yAxis.convertToPixel(res[b].rsi);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const text = d.bull ? 'Bull' : 'Bear', w = ctx.measureText(text).width + 10, h = 16, ly = Math.max(h / 2 + 18, Math.min(bounding.height - h / 2 - 2, d.bull ? y2 + 6 + h / 2 : y2 - 6 - h / 2)); // clear of the legend row
      ctx.fillStyle = color;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x2 - w / 2, ly - h / 2, w, h, 3); else ctx.rect(x2 - w / 2, ly - h / 2, w, h);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x2, ly + 0.5);
    }
  }

  const indicators = [
    // ----- Crayon-style indicators: same defaults, colours and look as Crayon Charts. -----
    {
      name: 'MA', shortName: 'SMA', calcParams: [50],
      figures: [{ key: 'ma', title: '', type: 'line', px: 1, c: '#cc5de8' }],
      styles: { lines: [L('#cc5de8', 1.25)] },
      calc: (list, ind) => { const v = sma(list.map((k) => k.close), ind.calcParams[0]); return list.map((_, i) => ({ ma: v[i] })); },
      createTooltipDataSource: tip,
    },
    {
      name: 'EMA', shortName: 'EMA', calcParams: [20],
      figures: [{ key: 'ema', title: '', type: 'line', px: 1, c: '#f0b90b' }],
      styles: { lines: [L('#f0b90b', 1.25)] },
      calc: (list, ind) => { const v = ema(list.map((k) => k.close), ind.calcParams[0]); return list.map((_, i) => ({ ema: v[i] })); },
      createTooltipDataSource: tip,
    },
    {
      // EMA 25 line inside a shaded EMA 18 - EMA 32 ribbon.
      name: 'TREND', shortName: 'Trend', calcParams: [18, 25, 32],
      figures: [{ key: 'e2', title: '', type: 'line', px: 1, c: '#20c997' }],
      styles: { lines: [L('#20c997', 1.25)] },
      calc: (list, ind) => {
        const cl = list.map((k) => k.close), [a, b, c] = ind.calcParams.map((n) => ema(cl, n));
        return list.map((_, i) => ({ e1: a[i], e2: b[i], e3: c[i] }));
      },
      draw: (p) => { fillBetween(p, 'e1', 'e3', fade('#20c997', 0.16)); return false; },
      createTooltipDataSource: (p) => ({ ...tip(p), calcParamsText: '' }),
    },
    {
      // Session VWAP anchored at each UTC day, with a +/- 1 standard deviation band like Crayon's default.
      name: 'VWAP', shortName: 'VWAP', calcParams: [1],
      figures: [{ key: 'vwap', title: '', type: 'line', px: 1, c: '#ff922b' }, { key: 'up', title: '', type: 'line', px: 1, c: '#4dabf7' }, { key: 'dn', title: '', type: 'line', px: 1, c: '#4dabf7' }],
      styles: { lines: [L('#ff922b', 1.5), L('#4dabf7', 1), L('#4dabf7', 1)] },
      calc: (list, ind) => {
        const m = ind.calcParams[0];
        let day = null, pv = 0, pv2 = 0, v = 0;
        return list.map((k) => {
          const d = Math.floor(k.timestamp / 864e5);
          const fresh = day !== null && d !== day;
          if (d !== day) { day = d; pv = 0; pv2 = 0; v = 0; }
          const tp = (k.high + k.low + k.close) / 3, vol = k.volume || 0;
          pv += tp * vol; pv2 += tp * tp * vol; v += vol;
          // Leave a gap where a new day starts, so the reset is not drawn as a jump.
          if (fresh) return {};
          const w = v > 0 ? pv / v : k.close, sd = v > 0 ? Math.sqrt(Math.max(0, pv2 / v - w * w)) : 0;
          return { vwap: w, up: w + m * sd, dn: w - m * sd };
        });
      },
      draw: (p) => { fillBetween(p, 'up', 'dn', fade('#4dabf7', 0.06)); return false; },
      createTooltipDataSource: (p) => ({ ...tip(p), calcParamsText: '' }),
    },
    {
      name: 'BOLL', shortName: 'BB', calcParams: [20, 2],
      figures: [{ key: 'up', title: '', type: 'line', px: 1, c: '#4dabf7' }, { key: 'mid', title: '', type: 'line', px: 1, c: '#ff922b' }, { key: 'dn', title: '', type: 'line', px: 1, c: '#4dabf7' }],
      styles: { lines: [L('#4dabf7', 1), L('#ff922b', 1), L('#4dabf7', 1)] },
      calc: (list, ind) => {
        const [n, mult] = ind.calcParams, cl = list.map((k) => k.close), mid = sma(cl, n);
        return list.map((_, i) => {
          if (mid[i] == null) return {};
          let s = 0;
          for (let j = i - n + 1; j <= i; j++) s += (cl[j] - mid[i]) ** 2;
          const sd = Math.sqrt(s / n);
          return { up: mid[i] + mult * sd, mid: mid[i], dn: mid[i] - mult * sd };
        });
      },
      draw: (p) => { fillBetween(p, 'up', 'dn', fade('#4dabf7', 0.06)); return false; },
      createTooltipDataSource: tip,
    },
    {
      // One 14-period line, shaded 30-70 band with dashed edges.
      // min/max keep 20-80 in view (Crayon's least range); the scale widens when RSI goes further.
      name: 'RSI', shortName: 'RSI', calcParams: [14], minValue: 20, maxValue: 80, precision: 1,
      figures: [{ key: 'rsi', title: '', type: 'line', c: '#9775fa' }],
      styles: { lines: [L('#9775fa', 1.5)] },
      calc: (list, ind) => {
        const r = rsi(list.map((k) => k.close), ind.calcParams[0]);
        r.div = {};
        rsiDivergences(list, r);
        return list.map((_, i) => ({ rsi: r[i], div: r.div[i] }));
      },
      draw: (p) => { guideBand(p, 70, 30, '#9775fa'); drawDivergences(p); return false; },
      createTooltipDataSource: tip,
    },
    {
      name: 'STOCH', shortName: 'Stoch', calcParams: [14, 1, 3], minValue: 10, maxValue: 90, precision: 1,
      figures: [{ key: 'k', title: '', type: 'line', c: '#4dabf7' }, { key: 'd', title: '', type: 'line', c: '#ff922b' }],
      styles: { lines: [L('#4dabf7', 1.5), L('#ff922b', 1.5)] },
      calc: (list, ind) => {
        const [n, sk, sd] = ind.calcParams;
        const raw = stochOf(list.map((k) => k.close), list.map((k) => k.high), list.map((k) => k.low), n);
        const K = sma(raw, sk), D = sma(K, sd);
        return list.map((_, i) => ({ k: K[i], d: D[i] }));
      },
      draw: (p) => { guideBand(p, 80, 20, '#4dabf7'); return false; },
      createTooltipDataSource: tip,
    },
    {
      // Params: RSI length, stoch length, %K smoothing, %D smoothing (Crayon: 14 14 3 3).
      name: 'STOCHRSI', shortName: 'Stoch RSI', calcParams: [14, 14, 3, 3], minValue: 0, maxValue: 100, precision: 1,
      figures: [{ key: 'k', title: '', type: 'line', c: '#4dabf7' }, { key: 'd', title: '', type: 'line', c: '#ff922b' }],
      styles: { lines: [L('#4dabf7', 1.5), L('#ff922b', 1.5)] },
      calc: (list, ind) => {
        const [rl, sl, sk, sd] = ind.calcParams;
        const r = rsi(list.map((k) => k.close), rl);
        const K = sma(stochOf(r, r, r, sl), sk), D = sma(K, sd);
        return list.map((_, i) => ({ k: K[i], d: D[i] }));
      },
      draw: (p) => { guideBand(p, 80, 20, '#4dabf7'); return false; },
      createTooltipDataSource: tip,
    },
    {
      name: 'MACD', shortName: 'MACD', calcParams: [12, 26, 9], precision: 2,
      figures: [
        { key: 'hist', title: '', type: 'bar', baseValue: 0, styles: ({ current }) => {
          const v = current.indicatorData?.hist ?? 0, c = h.candle(), col = v >= 0 ? c.up : c.down;
          return { style: 'fill', color: col, borderColor: col };
        } },
        { key: 'macd', title: '', type: 'line', c: '#4dabf7' },
        { key: 'signal', title: '', type: 'line', c: '#ffa94d' },
      ],
      styles: { lines: [L('#4dabf7', 1.5), L('#ffa94d', 1.5)] },
      calc: (list, ind) => {
        const [f, s, g] = ind.calcParams, cl = list.map((k) => k.close), ef = ema(cl, f), es = ema(cl, s);
        const m = cl.map((_, i) => (ef[i] == null || es[i] == null ? null : ef[i] - es[i]));
        const first = m.findIndex((v) => v != null), sig = new Array(m.length).fill(null);
        if (first >= 0) ema(m.slice(first), g).forEach((v, i) => { sig[first + i] = v; });
        return list.map((_, i) => ({ macd: m[i], signal: sig[i], hist: m[i] == null || sig[i] == null ? null : m[i] - sig[i] }));
      },
      createTooltipDataSource: tip,
    },
    {
      // Volume bars in the candle colours at 60% strength, no average lines: Crayon's default.
      name: 'VOL', shortName: 'Volume', calcParams: [], minValue: 0, precision: 0, shouldFormatBigNumber: true,
      figures: [{ key: 'volume', title: '', type: 'bar', baseValue: 0, styles: ({ current }) => {
        const k = current.kLineData, c = h.candle(), col = fade(k && k.close < k.open ? c.down : c.up, 0.6);
        return { style: 'fill', color: col, borderColor: col };
      } }],
      calc: (list) => list.map((k) => ({ volume: k.volume ?? 0 })),
      createTooltipDataSource: (p) => ({ ...tip(p), calcParamsText: '' }),
    },
    {
      // Visible range volume profile, drawn against the right edge of the price pane.
      name: 'VRVP', shortName: 'VRVP', calcParams: [], figures: [],
      calc: (list) => list.map(() => ({})),
      draw: ({ ctx, kLineDataList, visibleRange, bounding, yAxis }) => {
        const prof = profile(kLineDataList, Math.max(0, visibleRange.from), Math.min(kLineDataList.length - 1, visibleRange.to - 1), 40);
        if (!prof) return true;
        const w = bounding.width * 0.22, right = bounding.width;
        for (const row of prof.rows) {
          const y1 = yAxis.convertToPixel(row.hi), y2 = yAxis.convertToPixel(row.lo), len = (row.vol / prof.max) * w;
          ctx.fillStyle = row.poc ? 'rgba(240,185,11,0.7)' : row.va ? 'rgba(91,140,255,0.35)' : 'rgba(125,134,150,0.22)';
          ctx.fillRect(right - len, Math.min(y1, y2) + 0.5, len, Math.max(1, Math.abs(y2 - y1) - 1));
        }
        const yP = Math.round(yAxis.convertToPixel(prof.poc)) + 0.5;
        ctx.strokeStyle = 'rgba(240,185,11,0.8)';
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(right - w, yP); ctx.lineTo(right, yP); ctx.stroke();
        ctx.setLineDash([]);
        return true;
      },
    },
  ];

  function register(helpers) {
    h = { ...h, ...helpers };
    for (const o of [...shapes, ...planning]) klinecharts.registerOverlay({ ...base, ...o });
    for (const i of indicators) klinecharts.registerIndicator(i);
  }

  return { register };
})();
