// Forecast panel + cone on the Trading Chart (engine: forecast.js, odds: forecast-model.js).
// Shows the chance the price is higher after 12 candles (1h) / 6 candles (4h), the likely range, nearby support /
// resistance, the reasons, how the odds did on the last 2 years, and your own track record (forecasts are saved and
// graded automatically). Display only: the auto-trader never reads any of this.
const ForecastUI = (() => {
  const $ = (id) => document.getElementById(id);
  const GREEN = '#0ecb81', RED = '#f6465d', GOLD = '#f0b90b', BLUE = '#5b8cff';
  const TF_MS = { '1h': 36e5, '4h': 4 * 36e5 };
  const load = (k, def) => { try { return { ...def, ...JSON.parse(localStorage.getItem(k) || '{}') }; } catch { return def; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  const prefs = load('pp.forecast', { on: false, cone: true, path: true, lines: true, levels: true, news: true, auto: true, pos: null, collapsed: false, more: false, hist: [] });
  if (!Array.isArray(prefs.hist)) prefs.hist = [];
  const save = () => store('pp.forecast', prefs);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pc = (x) => (x * 100).toFixed(0) + '%';

  let d = null, cur = null, key = '', lastHtml = '', grading = false;

  // Closed candles only (the chart's last candle is still forming), in the engines' shape.
  function closedBars(list, tf) {
    const ms = TF_MS[tf], out = list.map((k) => ({ t: k.timestamp, o: +k.open, h: +k.high, l: +k.low, c: +k.close, v: +k.volume || 0 }));
    while (out.length && out[out.length - 1].t + ms > Date.now()) out.pop();
    return out;
  }
  function ctxFor(coin) { return d.dailyCoin() === coin ? d.context() : null; }

  // Extra inputs the odds use: the coin's daily candles, Bitcoin on the same timeframe, and funding history.
  // Cached; anything that fails to load is simply left out (the panel says so).
  const cache = new Map(); // key -> { at, val }
  async function cached(k, maxAge, get) {
    const c = cache.get(k);
    if (c && Date.now() - c.at < maxAge) return c.val;
    const val = await get().catch(() => c?.val ?? null);
    cache.set(k, { at: Date.now(), val });
    if (cache.size > 30) cache.delete(cache.keys().next().value);
    return val;
  }
  async function extFor(coin, tf, lastT) {
    const now = Date.now(), ms = TF_MS[tf];
    const [daily, btc, funding] = await Promise.all([
      cached(`d|${coin}`, 30 * 60e3, async () => (await d.fetchCandles(coin, '1d', now - 400 * 864e5, now)).map((k) => ({ t: k.timestamp, o: +k.open, h: +k.high, l: +k.low, c: +k.close, v: +k.volume || 0 })).filter((b) => b.t + 864e5 <= now)),
      coin === 'BTC' ? null : cached(`b|${tf}|${lastT}`, 10 * 60e3, async () => closedBars(await d.fetchCandles('BTC', tf, now - ms * 1500, now), tf)),
      cached(`f|${coin}|${Math.floor(now / 36e5)}`, 60 * 60e3, async () => (await d.fetchFunding(coin, now - 3 * 864e5)).map((x) => ({ t: x.time, r: +x.fundingRate }))),
    ]);
    return { daily: daily?.length ? daily : null, btc: btc?.length ? btc : null, funding: funding?.length ? funding : null, isBtc: coin === 'BTC' };
  }

  // ---------- red-folder news (US CPI, PPI, jobs report, FOMC...) ----------
  // This week's high-impact USD events from ForexFactory's feed, plus the official schedule in news-calendar.js
  // (fallback, and later weeks). When one of the tested types falls inside the forecast window, the range is
  // widened by how much bigger those windows moved in the history (research/news-research.js).
  const NC = () => (typeof NEWS_CAL !== 'undefined' ? NEWS_CAL : null);
  const kindOf = (title) => (/\bCPI\b/i.test(title) ? 'CPI' : /\bPPI\b/i.test(title) ? 'PPI' : /non-farm|\bNFP\b/i.test(title) ? 'NFP' : /federal funds rate|FOMC (statement|press)/i.test(title) ? 'FOMC' : null);
  const NAME = { CPI: 'CPI (inflation)', PPI: 'PPI (producer prices)', NFP: 'Jobs report (NFP)', FOMC: 'FOMC rate decision' };
  let ff = { at: 0, items: null }, newsVer = 0;
  async function loadNews() {
    if (!d.newsWeek || Date.now() - ff.at < 30 * 60e3) return;
    ff.at = Date.now();
    try { ff.items = await d.newsWeek(); newsVer++; key = ''; } catch { /* official schedule still works */ }
  }
  function newsList() {
    const list = (ff.items || []).map((x) => ({ t: x.t, kind: kindOf(x.title), title: x.title, ff: true }));
    for (const e of NC()?.events || []) {
      // The ForexFactory week wins; the schedule fills in what it doesn't list (same type within 3 hours = same event).
      if (!list.some((x) => x.ff && x.kind === e.kind && Math.abs(x.t - e.t) < 3 * 36e5)) list.push({ t: e.t, kind: e.kind, title: NAME[e.kind] || e.title });
    }
    // One line per release time: FOMC comes with a statement and a rate; CPI with m/m, y/y and core.
    const out = [];
    for (const x of list.sort((a, b) => a.t - b.t)) {
      const same = out.find((o) => o.t === x.t);
      if (!same) out.push({ ...x, titles: [x.title] });
      else { if (!same.kind && x.kind) same.kind = x.kind; if (!same.titles.includes(x.title)) same.titles.push(x.title); }
    }
    return out;
  }
  // Widen the range around its middle for tested news inside the window [close, close + H candles].
  function applyNews(f, tf) {
    const ms = TF_MS[tf], from = f.t + ms, to = from + f.H * ms;
    f.news = newsList().filter((x) => x.t > from && x.t <= to);
    f.newsWiden = 1;
    if (!prefs.news) return;
    const cone = NC()?.cone?.[tf] || {};
    for (const x of f.news) if (x.kind && cone[x.kind] > f.newsWiden) f.newsWiden = cone[x.kind];
    if (f.newsWiden > 1) {
      const b = f.band, s = f.newsWiden, w = (v) => b.mid + (v - b.mid) * s;
      f.bandRaw = { ...b };
      f.band = { ...b, q10: w(b.q10), q25: w(b.q25), q75: w(b.q75), q90: w(b.q90) };
    }
  }
  const whenTxt = (t) => {
    const dt = new Date(t), mins = Math.round((t - Date.now()) / 6e4);
    const day = dt.toLocaleDateString(undefined, mins > 36 * 60 ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'short' }), tm = dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const rel = mins < 0 ? 'out now' : mins < 60 ? `in ${mins} min` : mins < 48 * 60 ? `in ${Math.round(mins / 60)} h` : `in ${Math.round(mins / 1440)} days`;
    return `${day} ${tm} <i class="muted">(${rel})</i>`;
  };

  // Recompute when a new candle closes (or the coin / timeframe / daily context / odds change).
  let busy = false, modelVer = 0;
  async function refresh() {
    if (!prefs.on || !d || busy) return;
    const tf = d.interval(), coin = d.coin(), list = d.list() || [];
    if (!TF_MS[tf] || !Forecast.model()) { cur = { coin, tf, none: !TF_MS[tf] ? 'tf' : 'model' }; key = ''; render(); d.redraw(); return; }
    const bars = closedBars(list, tf), ctx = ctxFor(coin), last = bars[bars.length - 1];
    loadNews();
    const k = `${coin}|${tf}|${last?.t}|${bars.length > 0}|${!!ctx}|${modelVer}|${newsVer}|${prefs.news}`;
    if (k === key) return;
    busy = true;
    try {
      const ext = ctx && last ? await extFor(coin, tf, last.t) : {};
      if (coin !== d.coin() || tf !== d.interval()) return; // switched while loading
      key = k;
      let f = null;
      try { f = ctx ? Forecast.predict(bars, ctx, tf, ext) : null; if (f) applyNews(f, tf); } catch (e) { console.warn('forecast', e); }
      cur = f ? { coin, tf, f } : { coin, tf, none: !ctx ? 'ctx' : 'bars' };
      if (f) record(coin, f);
      render();
      d.redraw();
    } finally { busy = false; }
  }

  // ---------- track record ----------
  function record(coin, f) {
    if (prefs.hist.some((h) => h.coin === coin && h.tf === f.tf && h.t === f.t)) return;
    prefs.hist.push({ coin, tf: f.tf, t: f.t, close: f.close, p: +f.p.toFixed(4), dir: f.dir, H: f.H });
    if (prefs.hist.length > 600) prefs.hist.splice(0, prefs.hist.length - 600);
    save();
  }
  // Grade forecasts whose time is up: was the close H candles later above the close at forecast time?
  async function grade() {
    if (grading || !d) return;
    grading = true;
    try {
      const due = prefs.hist.filter((h) => h.up == null && Date.now() >= h.t + (h.H + 1) * TF_MS[h.tf] + 60e3).slice(0, 6);
      for (const h of due) {
        const ms = TF_MS[h.tf], target = h.t + h.H * ms;
        const bars = await d.fetchCandles(h.coin, h.tf, target - ms, target + 2 * ms).catch(() => null);
        const b = bars?.find((x) => x.timestamp === target);
        if (b) { h.end = +b.close; h.up = +b.close > h.close ? 1 : 0; }
        else if (Date.now() - target > 7 * 864e5) h.up = -1; // no data (market gone): drop from the score
      }
      if (due.length) { save(); render(); }
    } finally { grading = false; }
  }
  function trackStats() {
    const g = prefs.hist.filter((h) => h.up === 0 || h.up === 1);
    const called = g.filter((h) => h.dir !== 0), right = called.filter((h) => (h.dir > 0) === (h.up === 1)).length;
    return { graded: g.length, pending: prefs.hist.filter((h) => h.up == null).length, called: called.length, right };
  }

  // ---------- panel ----------
  function setOn(on) {
    prefs.on = !!on; save();
    $('fcPanel').hidden = !prefs.on;
    $('fcBtn')?.classList.toggle('active', prefs.on);
    d.setOn(prefs.on);
    key = '';
    if (prefs.on) { refresh(); grade(); } else { cur = null; d.redraw(); }
  }
  function build() {
    const el = document.createElement('div');
    el.id = 'fcPanel';
    el.className = 'cheat-panel fc-panel pro-only';
    el.hidden = true;
    el.innerHTML = `<div class="cp-head" id="fcHead"><b>Forecast</b><span class="cp-sub" id="fcSub"></span>
        <button id="fcMin" title="Collapse">&#8211;</button><button id="fcX" title="Turn off">&#10005;</button></div>
      <div class="cp-body" id="fcBody"></div>`;
    document.querySelector('.chart-body').appendChild(el);
    if (prefs.pos) { el.style.left = prefs.pos.x + 'px'; el.style.top = prefs.pos.y + 'px'; el.style.right = 'auto'; }
    el.classList.toggle('min', !!prefs.collapsed);
    $('fcMin').onclick = () => { prefs.collapsed = !prefs.collapsed; el.classList.toggle('min', prefs.collapsed); save(); };
    $('fcX').onclick = () => setOn(false);
    $('fcBody').onchange = (e) => {
      const t = e.target;
      if (t.dataset.fc) prefs[t.dataset.fc] = t.checked;
      save(); d.redraw();
    };
    $('fcBody').onclick = (e) => {
      if (e.target.id === 'fcReset' && confirm('Clear your forecast track record?')) { prefs.hist = []; save(); render(); }
      if (e.target.closest('#fcMore')) { prefs.more = !prefs.more; save(); render(); }
      if (e.target.id === 'fcUpdate') updateOdds(false);
    };
    const head = $('fcHead');
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const host = el.parentElement.getBoundingClientRect(), r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const x = Math.min(Math.max(0, ev.clientX - host.left - dx), host.width - r.width), y = Math.min(Math.max(0, ev.clientY - host.top - dy), host.height - 40);
        el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto'; prefs.pos = { x, y };
      };
      const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); save(); };
      head.addEventListener('pointermove', move); head.addEventListener('pointerup', up);
    });
  }
  function render() {
    if (!$('fcBody') || !prefs.on) return;
    const px = (v) => d.fmt(v);
    let body = '';
    if (!cur || cur.none) {
      const why = { tf: 'Forecasts work on the <b>1h</b> and <b>4h</b> charts. Switch the timeframe to see one.', model: 'The odds file (forecast-model.js) is missing: run research/forecast-research.js.', ctx: 'Loading the daily trend...', bars: 'Not enough candles yet.' }[cur?.none] || 'Loading...';
      body = `<div class="fc-main"><p class="muted small">${why}</p></div>`;
      $('fcSub').textContent = '';
    } else {
      const f = cur.f, m = f.model.test, up = f.p, H = f.H;
      $('fcSub').textContent = `${cur.coin} ${f.tf} · next ${H} candles`;
      const call = f.dir > 0 ? `<b class="up">&#9650; Leaning up</b>` : f.dir < 0 ? `<b class="down">&#9660; Leaning down</b>` : `<b class="range">&#9670; No clear edge</b>`;
      // What held on the last 2 years of data the odds were not built from.
      const reliable = m.hitEdge >= 0.53 && m.skill > 0, cone = f.model.cone;
      const coneTxt = cone ? `The range held: price ended inside "likely" <b>${pc(cone.in50)}</b> and "wide" <b>${pc(cone.in80)}</b> of the time.` : '';
      const rel = reliable
        ? `<p class="fc-rel ok">Tested on the last 2 years (not used to build it): when it leaned one way it was right <b>${(m.hitEdge * 100).toFixed(1)}%</b> of the time. ${coneTxt}</p>`
        : `<p class="fc-rel warn">&#9888; Direction is weak: on the last 2 years (not used to build it) the lean was right <b>${(m.hitEdge * 100).toFixed(1)}%</b> of the time (coin flip = 50%). Use the up / down part as a summary of the signals. ${coneTxt}</p>`;
      const GN = { btc: "Bitcoin's lead", fund: 'funding', htf: 'daily candles' };
      const miss = (f.missing || []).filter((g) => GN[g]);
      const missTxt = miss.length ? `<p class="fc-rel warn">Could not load ${miss.map((g) => GN[g]).join(' and ')} right now, so ${miss.length > 1 ? 'those signals are' : 'that signal is'} left out of this forecast.</p>` : '';
      const rs = f.reasons.filter((r) => Math.abs(r.w) >= 0.02).slice(0, 5);
      const ts = trackStats();
      // Red-folder news: what lands inside this forecast, and what's coming up this week.
            const inWin = f.news || [];
      const winTxt = !inWin.length ? '' : `<div class="fc-news on"><div class="fc-h">&#9888; News inside this forecast</div>${inWin.map((x) => `<div class="fc-r"><b class="gold">${esc(x.kind || 'News')}</b>${esc(x.kind ? NAME[x.kind] : x.titles[0])} · ${whenTxt(x.t)}</div>`).join('')}
          <div class="muted small">${f.newsWiden > 1 ? `Range widened <b>x${f.newsWiden.toFixed(2)}</b>: windows with this news moved about that much more in the price history (2016 on).` : !prefs.news ? 'News widening is off (Settings).' : 'Not a tested type, so the range is not widened. Expect bigger moves anyway.'}</div></div>`;
      const soon = newsList().filter((x) => x.t > Date.now() - 30 * 6e4 && x.t < Date.now() + 7 * 864e5 && !inWin.some((w) => w.t === x.t)).slice(0, 4);
      const soonTxt = soon.length ? `<div class="fc-news"><div class="fc-h">Red-folder news coming up (US)</div>${soon.map((x) => `<div class="fc-r"><b class="gold">${esc(x.kind || '&#9679;')}</b>${esc(x.kind ? NAME[x.kind] : x.titles[0])} · ${whenTxt(x.t)}</div>`).join('')}</div>` : '';
      body = `<div class="fc-main">
          <div class="fc-call">${call}<span class="fc-p"><b class="up">${pc(up)}</b> up · <b class="down">${pc(1 - up)}</b> down</span></div>
          <div class="fc-bar"><i style="width:${(up * 100).toFixed(1)}%"></i></div>
          <div class="sp-row"><span>Likely</span><b>${px(f.band.q25)} – ${px(f.band.q75)}</b><i class="muted">half the time</i></div>
          <div class="sp-row"><span>Wide</span><b>${px(f.band.q10)} – ${px(f.band.q90)}</b><i class="muted">8 times in 10</i></div>
          <div class="sp-row"><span>Resistance</span><b class="down">${f.levels.res ? px(f.levels.res) : '-'}</b><i class="muted">${f.levels.res ? ((f.levels.res - f.close) / f.close * 100).toFixed(1) + '% above' : 'no swing high above'}</i></div>
          <div class="sp-row"><span>Support</span><b class="up">${f.levels.sup ? px(f.levels.sup) : '-'}</b><i class="muted">${f.levels.sup ? ((f.close - f.levels.sup) / f.close * 100).toFixed(1) + '% below' : 'no swing low below'}</i></div>
        </div>
        ${winTxt}${soonTxt}
        <div class="fc-why"><div class="fc-h">Why <span class="fc-key">&#9650; points up · &#9660; points down</span></div>${rs.length ? rs.map((r) => `<div class="fc-r"><b class="${r.w > 0 ? 'up' : 'down'}">${r.w > 0 ? '&#9650;' : '&#9660;'}</b>${esc(r.text)}</div>`).join('') : '<div class="muted small">No strong signals right now.</div>'}</div>
        ${rel}${missTxt}
        <div class="fc-track"><div class="fc-h">Your track record</div>${ts.called ? `<div class="small">Leaned one way <b>${ts.called}</b> times, right <b>${ts.right}</b> (<b>${pc(ts.right / ts.called)}</b>).</div>` : '<div class="muted small">No graded forecasts yet.</div>'}<div class="muted small">${ts.graded} graded, ${ts.pending} waiting${prefs.hist.length ? ' · <a href="#" id="fcReset">Clear</a>' : ''}</div></div>`;
    }
    const M = Forecast.model(), age = M ? Math.floor((Date.now() - Date.parse(M.trainedTo)) / 864e5) : null;
    const odds = upd.running ? `<b class="range">Updating the odds...</b> ${esc(upd.msg || '')}`
      : `Odds from <b>${esc(M?.trainedTo || '-')}</b>${age != null ? ` (${age} day${age === 1 ? '' : 's'} old)` : ''}${upd.err ? ` · <span class="down">last update failed: ${esc(upd.err)}</span>` : ''}`;
    const opt = (k, t) => `<label><input type="checkbox" data-fc="${k}" ${prefs[k] ? 'checked' : ''}> ${t}</label>`;
    const html = `${body}<button class="sp-more" id="fcMore">${prefs.more ? '&#9662;' : '&#9656;'} Settings &amp; notes</button>
      <div class="sp-fold"${prefs.more ? '' : ' hidden'}><div class="sp-opts">${opt('cone', 'Range cone')}${opt('path', 'Typical path (middle line in the cone)')}${opt('lines', 'Trendlines through the last swing highs / lows')}${opt('levels', 'Support / resistance lines')}${opt('news', 'Red-folder news: mark it on the chart and widen the range')}</div>
      <div class="fc-odds small">${odds}<div class="fc-upd"><button class="btn-ghost" id="fcUpdate" ${upd.running ? 'disabled' : ''}>Update the odds now</button>${opt('auto', 'Every month by itself')}</div><span class="muted">Downloads the newest candles and funding, then refits the odds on the latest data (a few minutes, in the background).</span></div>
      <p class="muted small fc-foot">Updates when a candle closes. Every forecast for a coin and timeframe you view is saved and checked automatically when its time is up. Practice tool, not financial advice. The bot does not use it.</p></div>`;
    if (html !== lastHtml) { lastHtml = html; $('fcBody').innerHTML = html; }
  }

  // ---------- drawing: the cone and the levels ----------
  function register() {
    klinecharts.registerIndicator({
      name: 'FORECAST', shortName: '', calcParams: [], figures: [],
      calc: (list) => list.map(() => ({})),
      createTooltipDataSource: () => ({ name: '', calcParamsText: '', values: [] }),
      draw: ({ ctx: g, kLineDataList: list, barSpace, xAxis, yAxis, bounding }) => {
        const f = cur?.f;
        if (!prefs.on || !f || cur.coin !== d.coin() || cur.tf !== d.interval()) return true;
        const i = list.findIndex((k) => k.timestamp === f.t);
        if (i < 0) return true;
        const x0 = xAxis.convertToPixel(i), step = barSpace?.bar ?? 6, x1 = x0 + f.H * step, Y = (v) => yAxis.convertToPixel(v), y0 = Y(f.close);
        const col = f.dir > 0 ? GREEN : f.dir < 0 ? RED : BLUE;
        g.save();
        // Trendlines through the last two swing highs / lows, extended H candles into the future.
        if (prefs.lines) {
          const xOf = (t) => { const k = list.findIndex((kk) => kk.timestamp === t); return k < 0 ? null : xAxis.convertToPixel(k); };
          for (const [ln, c] of [[f.lines?.hi, RED], [f.lines?.lo, GREEN]]) {
            if (!ln) continue;
            const xa = xOf(ln.t1);
            if (xa == null) continue;
            g.strokeStyle = c + 'b0'; g.lineWidth = 1.2; g.setLineDash([]);
            g.beginPath(); g.moveTo(xa, Y(ln.p1)); g.lineTo(x0, Y(ln.now)); g.stroke();
            g.setLineDash([5, 4]); g.beginPath(); g.moveTo(x0, Y(ln.now)); g.lineTo(x1, Y(ln.end)); g.stroke(); g.setLineDash([]);
            for (const [t, p] of [[ln.t1, ln.p1], [ln.t2, ln.p2]]) { const x = xOf(t); if (x == null) continue; g.fillStyle = c; g.beginPath(); g.arc(x, Y(p), 2.5, 0, 7); g.fill(); }
          }
        }
        if (prefs.cone) {
          const poly = (lo, hi, a) => { g.fillStyle = col + a; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, Y(hi)); g.lineTo(x1, Y(lo)); g.closePath(); g.fill(); };
          poly(f.band.q10, f.band.q90, '14');
          poly(f.band.q25, f.band.q75, '2a');
        }
        // Typical path: the middle move after each of the next H candles, for forecasts like this one.
        const endY = Y(f.path?.length ? f.path[f.path.length - 1] : f.band.mid);
        if (prefs.path || prefs.cone) {
          g.strokeStyle = col; g.lineWidth = 1.6; g.setLineDash(prefs.path && f.path?.length ? [] : [4, 3]);
          g.beginPath(); g.moveTo(x0, y0);
          if (prefs.path && f.path?.length) f.path.forEach((v, k) => g.lineTo(x0 + (k + 1) * step, Y(v)));
          else g.lineTo(x1, Y(f.band.mid));
          g.stroke(); g.setLineDash([]);
          g.font = '600 10px Segoe UI'; g.textBaseline = 'middle'; g.textAlign = 'left';
          const label = `${(f.p * 100).toFixed(0)}% up`, w = g.measureText(label).width + 8;
          g.fillStyle = col; g.beginPath(); if (g.roundRect) g.roundRect(x1 + 4, endY - 7, w, 14, 3); else g.rect(x1 + 4, endY - 7, w, 14); g.fill();
          g.fillStyle = '#0b0e11'; g.fillText(label, x1 + 8, endY + 0.5);
        }
        // Red-folder news times inside the window: gold dashed upright line with the type on top.
        if (prefs.news && f.news?.length) {
          const ms = TF_MS[f.tf], top = bounding.top, bot = bounding.top + bounding.height;
          g.font = '700 10px Segoe UI'; g.textAlign = 'center'; g.textBaseline = 'top';
          for (const x of f.news) {
            const xx = x0 + step / 2 + ((x.t - (f.t + ms)) / ms) * step;
            g.strokeStyle = GOLD + 'cc'; g.lineWidth = 1; g.setLineDash([3, 3]);
            g.beginPath(); g.moveTo(xx, top + 16); g.lineTo(xx, bot); g.stroke(); g.setLineDash([]);
            const t = x.kind || 'NEWS', w = g.measureText(t).width + 8;
            g.fillStyle = GOLD; g.beginPath(); if (g.roundRect) g.roundRect(xx - w / 2, top + 2, w, 14, 3); else g.rect(xx - w / 2, top + 2, w, 14); g.fill();
            g.fillStyle = '#0b0e11'; g.fillText(t, xx, top + 4);
          }
        }
        if (prefs.levels) {
          g.font = '600 10px Segoe UI'; g.textBaseline = 'bottom'; g.textAlign = 'right';
          for (const [v, c, t] of [[f.levels.res, RED, 'Resistance'], [f.levels.sup, GREEN, 'Support']]) {
            if (!v) continue;
            const y = Y(v);
            if (y < bounding.top || y > bounding.top + bounding.height) continue;
            g.strokeStyle = c + 'aa'; g.lineWidth = 1; g.setLineDash([6, 4]);
            g.beginPath(); g.moveTo(Math.max(0, x0 - 60 * step), y); g.lineTo(x1, y); g.stroke();
            g.setLineDash([]); g.fillStyle = c; g.fillText(t, x1, y - 2);
          }
        }
        g.restore();
        return true;
      },
    });
  }

  // ---------- monthly odds update ----------
  // Runs research/update-forecast.js in the background (new candles + funding, then refit) and loads the new odds.
  const upd = { running: false, msg: '', err: '' };
  async function updateOdds(auto) {
    if (upd.running || !d.updateOdds) return;
    upd.running = true; upd.err = ''; upd.msg = 'downloading new candles...'; render();
    try {
      const m = await d.updateOdds((msg) => { upd.msg = msg; render(); });
      Forecast.setModel(m);
      modelVer++; key = '';
      d.toast(`Forecast odds updated (${m.trainedTo}).`);
      refresh();
    } catch (e) {
      upd.err = String(e.message || e).replace(/^Error invoking remote method '[\w-]+': (Error: )?/, '').slice(0, 160);
      if (!auto) d.toast('Could not update the odds: ' + upd.err, 'bad');
    } finally { upd.running = false; upd.msg = ''; render(); }
  }
  function maybeAutoUpdate() {
    const M = Forecast.model();
    if (prefs.on && prefs.auto && M && Date.now() - Date.parse(M.trainedTo) > 30 * 864e5) updateOdds(true);
  }

  function init(deps) {
    d = deps;
    build();
    setOn(prefs.on);
    setInterval(refresh, 5000);
    setInterval(grade, 60e3);
    setTimeout(grade, 8000);
    setTimeout(maybeAutoUpdate, 60e3);
    setInterval(maybeAutoUpdate, 6 * 36e5);
  }
  return { init, register, refresh, setOn: (on) => setOn(on), isOn: () => prefs.on, current: () => cur, _stats: trackStats };
})();
