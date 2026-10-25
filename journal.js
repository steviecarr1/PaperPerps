// Trading journal: every closed trade becomes an entry (with a chart snapshot) that the trader reviews.
// Entries keep their own copy of the trade, so they survive an account reset. Saved to journal.json.
const Journal = (() => {
  const DEFAULT_SETUPS = ['Breakout', 'Pullback', 'Reversal', 'Range', 'Trend continuation', 'Support / resistance', 'News', 'Scalp'];
  const EMOTIONS = ['Calm', 'Confident', 'Patient', 'Disciplined', 'FOMO', 'Fear', 'Greedy', 'Revenge', 'Impatient', 'Bored', 'Unsure', 'Overconfident'];
  const PLAN = ['Yes', 'Partly', 'No'];
  const TEXTS = [
    ['entryReason', 'Why I entered', 'What did you see? What was the plan, target and invalidation?'],
    ['exitReason', 'Why I exited', 'Target hit, stop hit, changed my mind, panic...?'],
    ['good', 'What I did well', ''],
    ['mistakes', 'Mistakes / what to improve', ''],
    ['lesson', 'Lesson for next time', 'One sentence you want to remember.'],
  ];

  let d = null; // helpers handed in by app.js
  let J = { v: 1, entries: [], setups: DEFAULT_SETUPS.slice() };
  let shotBase = '';
  let selId = null, filter = 'all', query = '', view = 'entry';
  let saveTimer = null;

  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const net = (e) => e.trade.pnl - e.trade.fees;
  const margin = (t) => (t.size * t.entry) / t.lev;
  const roe = (e) => (net(e) / margin(e.trade)) * 100;
  const reviewed = (e) => !!e.updated;
  const byId = (id) => J.entries.find((e) => e.id === id);
  const shotUrl = (name) => encodeURI('file:///' + shotBase.replace(/\\/g, '/') + '/' + name);
  const isOpen = () => !$('journal').hidden;

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => api.journalSave(J), 400);
  }

  async function init(deps) {
    d = deps;
    const saved = await api.journalLoad();
    if (saved && saved.v === 1) J = { ...J, ...saved };
    if (!Array.isArray(J.setups) || !J.setups.length) J.setups = DEFAULT_SETUPS.slice();
    shotBase = await api.shotDir();
    build();
  }

  // Creates entries for closed trades not yet in the journal. Returns the new ones.
  function sync(state) {
    const have = new Set(J.entries.map((e) => e.id));
    const added = [];
    for (const x of [...state.closed].reverse()) {
      const id = `${state.created}-${x.id}`;
      if (have.has(id)) continue;
      const e = {
        id, trade: { ...x }, setup: '', emotions: [], plan: '', rating: 0,
        entryReason: x.note || '', exitReason: '', good: '', mistakes: '', lesson: '',
        shots: [], created: Date.now(), updated: null,
      };
      J.entries.push(e);
      added.push(e);
    }
    if (added.length) { save(); refresh(); }
    return added;
  }

  async function addShot(id, dataUrl) {
    const e = byId(id);
    const m = /^data:image\/(png|jpeg|webp);base64,/.exec(dataUrl || '');
    if (!e || !m) return;
    const name = `${id}-${Date.now()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    await api.shotSave(name, dataUrl);
    e.shots.push(name);
    save();
    if (isOpen() && selId === id && view === 'entry') renderDetail();
  }

  const toReview = () => J.entries.filter((e) => !reviewed(e)).length;

  // ---------- shell ----------
  function build() {
    const el = document.createElement('section');
    el.id = 'journal';
    el.hidden = true;
    el.innerHTML = `
      <div class="j-top">
        <h2>Trading Journal</h2>
        <div class="j-kpis" id="jKpis"></div>
        <div class="spacer"></div>
        <div class="seg j-views"><button data-view="entry" class="active">Entries</button><button data-view="insights">Insights</button></div>
        <button class="btn-ghost" id="jExport">Export CSV</button>
        <button class="btn-ghost" id="jClose" title="Back to trading (Esc)">&#10005; Close</button>
      </div>
      <div class="j-body">
        <aside class="j-list">
          <input id="jSearch" placeholder="Search coin, setup, notes" autocomplete="off">
          <div class="seg j-filter" id="jFilter">
            <button data-f="all" class="active">All</button><button data-f="review">To review</button><button data-f="wins">Wins</button><button data-f="losses">Losses</button>
          </div>
          <div id="jItems" class="j-items"></div>
        </aside>
        <div class="j-detail" id="jDetail"></div>
      </div>`;
    document.body.appendChild(el);

    $('jClose').onclick = close;
    $('jExport').onclick = exportCsv;
    el.querySelector('.j-views').onclick = (e) => {
      const v = e.target.dataset.view;
      if (!v) return;
      view = v;
      el.querySelectorAll('.j-views button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
      renderDetail();
    };
    $('jFilter').onclick = (e) => {
      const f = e.target.dataset.f;
      if (!f) return;
      filter = f;
      $('jFilter').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.f === f));
      renderList();
    };
    $('jSearch').oninput = () => { query = $('jSearch').value.trim().toLowerCase(); renderList(); };
    $('jItems').onclick = (e) => {
      const it = e.target.closest('.j-item');
      if (!it) return;
      select(it.dataset.id);
    };
    $('jDetail').addEventListener('input', onEdit);
    $('jDetail').addEventListener('click', onDetailClick);
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', (e) => {
      if (!isOpen() || !$('modalBack').hidden) return;
      const typing = /INPUT|TEXTAREA/.test(e.target.tagName);
      if (e.key === 'Escape' && !typing) close();
      if (!typing && view === 'entry' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        step(e.key === 'ArrowDown' ? 1 : -1);
      }
    });
  }

  function open(id) {
    $('journal').hidden = false;
    document.body.classList.add('journal-open');
    if (id && byId(id)) { selId = id; view = 'entry'; }
    if (!selId || !byId(selId)) selId = visible()[0]?.id ?? null;
    $('journal').querySelectorAll('.j-views button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    refresh();
    $('jItems').querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  }
  function close() {
    $('journal').hidden = true;
    document.body.classList.remove('journal-open');
  }
  const toggle = () => (isOpen() ? close() : open());

  function refresh() {
    d?.onBadge?.(toReview());
    if (!isOpen()) return;
    renderKpis();
    renderList();
    renderDetail();
  }

  // ---------- list ----------
  function visible() {
    return J.entries
      .filter((e) => {
        if (filter === 'review' && reviewed(e)) return false;
        if (filter === 'wins' && net(e) <= 0) return false;
        if (filter === 'losses' && net(e) > 0) return false;
        if (!query) return true;
        const hay = [e.trade.coin, e.setup, e.emotions.join(' '), e.trade.reason, ...TEXTS.map(([k]) => e[k])].join(' ').toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => b.trade.closed - a.trade.closed);
  }

  function renderKpis() {
    const es = J.entries, n = es.length;
    const nets = es.map(net), wins = nets.filter((v) => v > 0).length;
    const total = nets.reduce((a, b) => a + b, 0);
    $('jKpis').innerHTML = n
      ? `<span>Trades <b>${n}</b></span><span>Reviewed <b>${n - toReview()}/${n}</b></span>
         <span>Win rate <b>${((wins / n) * 100).toFixed(1)}%</b></span>
         <span>Net PnL <b class="${d.cls(total)}">${d.usd(total, true)}</b></span>`
      : '';
  }

  function itemHtml(e) {
    const t = e.trade, v = net(e);
    const stars = e.rating ? '<span class="j-stars-mini">' + '&#9733;'.repeat(e.rating) + '</span>' : '';
    return `<div class="j-item${e.id === selId ? ' sel' : ''}" data-id="${e.id}">
      <div class="j-row1"><b>${esc(t.coin)}</b><span class="tag ${t.dir > 0 ? 'long' : 'short'}">${t.dir > 0 ? 'Long' : 'Short'} ${t.lev}x</span>
        <span class="j-net ${d.cls(v)}">${d.usd(v, true)}</span></div>
      <div class="j-row2"><span>${d.when(t.closed)}</span><span>${esc(e.setup || t.reason)}</span>${stars}
        ${reviewed(e) ? '' : '<span class="j-dot" title="Not reviewed yet">To review</span>'}</div>
    </div>`;
  }

  function renderList() {
    const list = visible();
    $('jItems').innerHTML = list.length
      ? list.map(itemHtml).join('')
      : `<div class="empty">${J.entries.length ? 'Nothing matches this filter.' : 'Close a trade and it shows up here, ready to review.'}</div>`;
  }

  function select(id) {
    selId = id;
    view = 'entry';
    $('journal').querySelectorAll('.j-views button').forEach((b) => b.classList.toggle('active', b.dataset.view === 'entry'));
    $('jItems').querySelectorAll('.j-item').forEach((x) => x.classList.toggle('sel', x.dataset.id === id));
    renderDetail();
    $('jDetail').scrollTop = 0;
  }

  function step(dir) {
    const list = visible(), i = list.findIndex((e) => e.id === selId);
    const next = list[Math.max(0, Math.min(list.length - 1, i + dir))];
    if (next && next.id !== selId) { select(next.id); $('jItems').querySelector('.sel')?.scrollIntoView({ block: 'nearest' }); }
  }

  // ---------- entry editor ----------
  function chips(list, chosen, attr) {
    return list.map((x) => `<button class="chip${chosen(x) ? ' on' : ''}" data-${attr}="${esc(x)}">${esc(x)}</button>`).join('');
  }

  function renderDetail() {
    if (view === 'insights') return renderInsights();
    const e = byId(selId);
    if (!e) {
      $('jDetail').innerHTML = `<div class="empty j-empty">${J.entries.length ? 'Pick a trade on the left.' : 'No trades yet.<br>Every trade you close lands here with a chart snapshot, ready for you to review.'}</div>`;
      return;
    }
    const t = e.trade, v = net(e);
    const stat = (k, val) => `<div><label>${k}</label><span>${val}</span></div>`;
    $('jDetail').innerHTML = `
      <div class="j-head">
        <div class="j-nav"><button class="act" data-nav="-1" title="Newer (Up arrow)">&#9650;</button><button class="act" data-nav="1" title="Older (Down arrow)">&#9660;</button></div>
        <h3>${esc(t.coin)} <span class="tag ${t.dir > 0 ? 'long' : 'short'}">${t.dir > 0 ? 'Long' : 'Short'} ${t.lev}x</span></h3>
        <span class="j-big ${d.cls(v)}">${d.usd(v, true)} <small>(${d.pct(roe(e))} ROE)</small></span>
        <div class="spacer"></div>
        <span class="muted">${reviewed(e) ? 'Reviewed' : 'Not reviewed yet'}</span>
        <button class="act danger" data-del="1">Delete entry</button>
      </div>
      <div class="j-stats">
        ${stat('Entry', d.fp(t.entry, t.coin))}${stat('Exit', d.fp(t.exit, t.coin))}${stat('Size', d.fsz(t.size, t.coin) + ' ' + esc(t.coin))}
        ${stat('Position value', d.usd(t.size * t.entry))}${stat('Margin', d.usd(margin(t)))}${stat('Fees', d.usd(t.fees))}
        ${stat('Opened', d.when(t.opened))}${stat('Closed', d.when(t.closed))}${stat('Held', d.held(t.closed - t.opened))}${stat('Exit type', esc(t.reason))}
      </div>

      <div class="j-section">
        <h4>Chart</h4>
        <div class="j-shots">
          ${e.shots.map((s) => `<div class="j-shot"><img src="${shotUrl(s)}" data-zoom="${esc(s)}" alt="Chart"><button class="j-x" data-delshot="${esc(s)}" title="Remove">&#10005;</button></div>`).join('')}
          <div class="j-shot-add"><button class="act" data-capture="1">Capture current chart</button><span class="muted">or paste an image here (Ctrl+V)</span></div>
        </div>
      </div>

      <div class="j-grid2">
        <div class="j-section">
          <h4>Setup</h4>
          <div class="chips">${chips(J.setups, (x) => x === e.setup, 'setup')}
            <input class="chip-new" id="jNewSetup" placeholder="+ New setup" maxlength="40"></div>
        </div>
        <div class="j-section">
          <h4>Did I follow my plan?</h4>
          <div class="chips">${chips(PLAN, (x) => x === e.plan, 'plan')}</div>
          <h4 style="margin-top:14px">Execution rating</h4>
          <div class="j-rating">${[1, 2, 3, 4, 5].map((i) => `<button data-rate="${i}" class="${i <= e.rating ? 'on' : ''}">&#9733;</button>`).join('')}
            <span class="muted">${['', 'Poor', 'Below average', 'OK', 'Good', 'Perfect'][e.rating]}</span></div>
        </div>
      </div>

      <div class="j-section">
        <h4>Emotions during the trade</h4>
        <div class="chips">${chips(EMOTIONS, (x) => e.emotions.includes(x), 'emo')}</div>
      </div>

      ${TEXTS.map(([k, label, ph]) => `<div class="j-section"><h4>${label}</h4><textarea data-f="${k}" rows="${k === 'lesson' ? 2 : 3}" placeholder="${esc(ph)}">${esc(e[k])}</textarea></div>`).join('')}
    `;
  }

  function touch(e) {
    e.updated = Date.now();
    save();
    const it = $('jItems').querySelector(`[data-id="${CSS.escape(e.id)}"]`);
    if (it) it.outerHTML = itemHtml(e);
    renderKpis();
    d.onBadge?.(toReview());
  }

  function onEdit(ev) {
    const e = byId(selId), f = ev.target.dataset.f;
    if (!e || !f) return;
    e[f] = ev.target.value;
    touch(e);
  }

  async function onDetailClick(ev) {
    const b = ev.target.closest('button, img');
    const e = byId(selId);
    if (!b || !e) return;
    const ds = b.dataset;
    if (ds.nav) return step(+ds.nav);
    if (ds.setup !== undefined) { e.setup = e.setup === ds.setup ? '' : ds.setup; touch(e); return renderDetail(); }
    if (ds.plan !== undefined) { e.plan = e.plan === ds.plan ? '' : ds.plan; touch(e); return renderDetail(); }
    if (ds.emo !== undefined) {
      e.emotions = e.emotions.includes(ds.emo) ? e.emotions.filter((x) => x !== ds.emo) : [...e.emotions, ds.emo];
      touch(e);
      return renderDetail();
    }
    if (ds.rate) { e.rating = e.rating === +ds.rate ? 0 : +ds.rate; touch(e); return renderDetail(); }
    if (ds.capture) {
      const url = d.captureChart();
      if (!url) return d.toast('Open the Trading Chart tab to capture it', 'bad');
      await addShot(e.id, url);
      e.updated ||= Date.now();
      return d.toast('Chart captured', 'ok');
    }
    if (ds.zoom) {
      return d.modal(`<img class="j-zoom" src="${shotUrl(ds.zoom)}" alt="Chart"><div class="modal-btns"><button data-close>Close</button></div>`, null, { wide: true });
    }
    if (ds.delshot) {
      e.shots = e.shots.filter((s) => s !== ds.delshot);
      api.shotDelete(ds.delshot);
      save();
      return renderDetail();
    }
    if (ds.del) {
      d.modal(
        `<h3>Delete this journal entry?</h3><p>Your notes and chart snapshots for this ${esc(e.trade.coin)} trade will be removed. The trade itself stays in Closed P&amp;L.</p>
         <div class="modal-btns"><button data-close>Cancel</button><button class="danger" id="jDelYes">Delete</button></div>`,
        (closeModal) => {
          $('jDelYes').onclick = () => {
            e.shots.forEach((s) => api.shotDelete(s));
            J.entries = J.entries.filter((x) => x !== e);
            selId = visible()[0]?.id ?? null;
            save();
            closeModal();
            refresh();
          };
        },
      );
    }
  }

  // Typing a new setup name and pressing Enter adds it to the list and picks it.
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.target.id !== 'jNewSetup') return;
    const name = ev.target.value.trim();
    const e = byId(selId);
    if (!name || !e) return;
    if (!J.setups.includes(name)) J.setups.push(name);
    e.setup = name;
    touch(e);
    renderDetail();
  });

  function onPaste(ev) {
    if (!isOpen() || view !== 'entry' || !selId) return;
    const item = [...(ev.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    ev.preventDefault();
    const reader = new FileReader();
    reader.onload = async () => {
      await addShot(selId, reader.result);
      const e = byId(selId);
      if (e) touch(e);
      d.toast('Image added', 'ok');
    };
    reader.readAsDataURL(item.getAsFile());
  }

  // ---------- insights ----------
  function group(entries, keysOf) {
    const m = new Map();
    for (const e of entries) for (const k of keysOf(e)) {
      if (!k) continue;
      const g = m.get(k) || { k, n: 0, wins: 0, total: 0 };
      g.n++; g.total += net(e); if (net(e) > 0) g.wins++;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }

  function groupTable(title, rows, hint) {
    if (!rows.length) return `<div class="j-card"><h4>${title}</h4><p class="muted">${hint}</p></div>`;
    return `<div class="j-card"><h4>${title}</h4><table>
      <thead><tr><th></th><th>Trades</th><th>Win rate</th><th>Net PnL</th><th>Avg / trade</th></tr></thead><tbody>
      ${rows.map((g) => {
        const wr = (g.wins / g.n) * 100;
        return `<tr><td>${esc(g.k)}</td><td>${g.n}</td>
          <td><div class="j-wr"><div style="width:${wr}%"></div></div>${wr.toFixed(0)}%</td>
          <td class="${d.cls(g.total)}">${d.usd(g.total, true)}</td><td class="${d.cls(g.total)}">${d.usd(g.total / g.n, true)}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function renderInsights() {
    const es = J.entries;
    if (!es.length) {
      $('jDetail').innerHTML = '<div class="empty j-empty">Insights appear once you have closed some trades.</div>';
      return;
    }
    const nets = es.map(net), win = nets.filter((v) => v > 0), loss = nets.filter((v) => v <= 0);
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const gw = sum(win), gl = -sum(loss);
    const avgHold = (arr) => (arr.length ? d.held(sum(arr.map((e) => e.trade.closed - e.trade.opened)) / arr.length) : '-');
    const kpi = (k, v, c = '') => `<div class="j-kpi"><label>${k}</label><b class="${c}">${v}</b></div>`;

    const setups = group(es, (e) => [e.setup]);
    const emos = group(es, (e) => e.emotions);
    const plan = group(es, (e) => [e.plan && 'Followed plan: ' + e.plan]);
    const coins = group(es, (e) => [e.trade.coin]);
    const sides = group(es, (e) => [e.trade.dir > 0 ? 'Long' : 'Short']);
    const exits = group(es, (e) => [e.trade.reason]);

    // Plain-language takeaways from the numbers.
    const tips = [];
    const best = setups.find((g) => g.n >= 2 && g.total > 0);
    if (best) tips.push(`Your best setup so far is <b>${esc(best.k)}</b>: ${best.n} trades, ${((best.wins / best.n) * 100).toFixed(0)}% win rate, ${d.usd(best.total, true)}.`);
    const worst = [...setups].reverse().find((g) => g.n >= 2 && g.total < 0);
    if (worst) tips.push(`<b>${esc(worst.k)}</b> is costing you money (${d.usd(worst.total, true)} over ${worst.n} trades). Review those entries.`);
    const badEmo = emos.filter((g) => g.total < 0).sort((a, b) => a.total - b.total)[0];
    if (badEmo) tips.push(`Trades where you felt <b>${esc(badEmo.k)}</b> lost ${d.usd(badEmo.total, true)} in total.`);
    const yes = plan.find((g) => g.k.endsWith('Yes')), no = plan.find((g) => g.k.endsWith('No'));
    if (yes && no) tips.push(`Following your plan: ${((yes.wins / yes.n) * 100).toFixed(0)}% win rate. Not following it: ${((no.wins / no.n) * 100).toFixed(0)}%.`);
    const liq = exits.find((g) => g.k === 'Liquidated');
    if (liq) tips.push(`You have been liquidated <b>${liq.n}</b> time${liq.n > 1 ? 's' : ''} (${d.usd(liq.total, true)}). A stop loss closes the trade before that happens.`);
    if (toReview()) tips.push(`${toReview()} trade${toReview() > 1 ? 's are' : ' is'} waiting for review. The insights get sharper the more you fill in.`);

    $('jDetail').innerHTML = `
      <div class="j-kpi-row">
        ${kpi('Trades', es.length)}${kpi('Win rate', ((win.length / es.length) * 100).toFixed(1) + '%')}
        ${kpi('Net PnL', d.usd(sum(nets), true), d.cls(sum(nets)))}
        ${kpi('Profit factor', gl ? (gw / gl).toFixed(2) : gw ? '&#8734;' : '-')}
        ${kpi('Avg win', win.length ? d.usd(gw / win.length, true) : '-', 'up')}${kpi('Avg loss', loss.length ? d.usd(-gl / loss.length, true) : '-', 'down')}
        ${kpi('Expectancy / trade', d.usd(sum(nets) / es.length, true), d.cls(sum(nets)))}
        ${kpi('Avg hold: winners', avgHold(es.filter((e) => net(e) > 0)))}${kpi('Avg hold: losers', avgHold(es.filter((e) => net(e) <= 0)))}
      </div>
      ${tips.length ? `<div class="j-card j-tips"><h4>Takeaways</h4><ul>${tips.map((t) => `<li>${t}</li>`).join('')}</ul></div>` : ''}
      <div class="j-cards">
        ${groupTable('By setup', setups, 'Tag a setup on your entries to see which ones work.')}
        ${groupTable('By emotion', emos, 'Tag how you felt to see how emotions affect your results.')}
        ${groupTable('Followed my plan?', plan, 'Answer "Did I follow my plan?" on your entries.')}
        ${groupTable('By market', coins, '')}
        ${groupTable('Long vs short', sides, '')}
        ${groupTable('By exit type', exits, '')}
      </div>`;
  }

  // ---------- export ----------
  async function exportCsv() {
    const cols = ['Closed', 'Opened', 'Market', 'Side', 'Leverage', 'Size', 'Entry', 'Exit', 'Fees', 'Net PnL', 'ROE %', 'Exit type',
      'Setup', 'Followed plan', 'Rating', 'Emotions', ...TEXTS.map(([, l]) => l)];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const iso = (t) => new Date(t).toISOString().replace('T', ' ').slice(0, 16);
    const rows = [...J.entries].sort((a, b) => a.trade.closed - b.trade.closed).map((e) => {
      const t = e.trade;
      return [iso(t.closed), iso(t.opened), t.coin, t.dir > 0 ? 'Long' : 'Short', t.lev, t.size, t.entry, t.exit,
        t.fees.toFixed(2), net(e).toFixed(2), roe(e).toFixed(2), t.reason, e.setup, e.plan, e.rating || '', e.emotions.join('; '),
        ...TEXTS.map(([k]) => e[k])].map(q).join(',');
    });
    const file = await api.exportCsv([cols.map(q).join(','), ...rows].join('\r\n'), `trading-journal-${new Date().toISOString().slice(0, 10)}.csv`);
    if (file) d.toast('Journal exported', 'ok');
  }

  return { init, sync, addShot, open, close, toggle, isOpen, toReview };
})();
