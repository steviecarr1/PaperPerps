// Browser stand-in for preload.js on the phone website (GitHub Pages). There is no Electron main process there, so:
// Hyperliquid is called straight from the page (it allows browser requests), saves go to localStorage, and the
// desktop-only jobs (live RISEx trading, Telegram, files on disk, odds update) are switched off.
(() => {
  const API = 'https://api.hyperliquid.xyz/info';
  const get = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } return true; };
  const off = () => Promise.reject(new Error('Only in the desktop app'));

  async function info(body) {
    for (let k = 0; ; k++) {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45e3),
      });
      if (res.status === 429 && k < 4) { await new Promise((r) => setTimeout(r, 5000 * 2 ** k)); continue; }
      if (!res.ok) throw new Error('Hyperliquid HTTP ' + res.status);
      return res.json();
    }
  }

  // Screenshot button: the phone saves it as a download instead of a file dialog.
  async function savePng(dataUrl, fileName) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    a.click();
    return fileName;
  }

  window.api = {
    info,
    load: async () => get('pp.web.account'),
    save: async (data) => put('pp.web.account', data),
    journalLoad: async () => get('pp.web.journal'),
    journalSave: async (data) => put('pp.web.journal', data),
    shotDir: async () => '',
    shotSave: async (name) => name,
    shotDelete: async () => true,
    exportCsv: async () => null,
    savePng,
    newsWeek: async () => [], // ForexFactory's feed blocks browser requests
    forecastUpdate: off,
    onForecastProgress: () => {},
    yahoo: off, botLog: async () => true, rx: async () => ({ ok: false, error: 'Only in the desktop app' }),
    notify: off, notifyChat: off, notifyStatus: off, notifySetup: off, notifyLink: off, notifyForget: off,
    notifyPoll: async () => [], notifyReply: off, keepAwake: async () => false,
  };

  // Pencil button (phones only, see web.css): shows / hides the drawing tools column.
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('webDrawBtn')?.addEventListener('click', () => document.body.classList.toggle('draw-on'));

    // Phones: the floating forecast / structure / pattern panels are moved into one stack at the bottom of the chart
    // (web.css #webSheets) so several open ones share the space instead of covering each other.
    const body = document.querySelector('.chart-body');
    const sheets = document.createElement('div');
    sheets.id = 'webSheets';
    body.appendChild(sheets);
    const phone = matchMedia('(max-width: 820px)');
    const gather = () => { if (phone.matches) for (const el of body.querySelectorAll(':scope > .cheat-panel')) sheets.appendChild(el); };
    new MutationObserver(gather).observe(body, { childList: true });
    gather();
    sheets.addEventListener('click', (e) => { // tapping a minimised pill's name opens it again
      const head = e.target.closest('.cheat-panel.min .cp-head');
      if (head && !e.target.closest('button')) head.querySelector('button[title="Collapse"]')?.click();
    });

    touchAsMouse(document.getElementById('chartGrid'));
  });

  // KLineChart's own touch support only swipes sideways and pinches: no up/down drag, no dragging the price or date
  // axis. Those exist for the mouse, so one finger on the chart is replayed as the mouse:
  //   drag = mouse drag (move the chart any way, stretch the price axis, drag the date axis, move drawings)
  //   tap = click (drawing tools, menus), double tap = double click (price axis: back to auto-fit)
  //   hold still ~0.4 s = crosshair that follows the finger and stays after lifting it; the next touch clears it
  // Two fingers go to the library untouched (pinch zoom).
  function touchAsMouse(grid) {
    const HOLD_MS = 400, MOVE_PX = 6;
    let mode = null; // null | 'wait' (finger down, undecided) | 'drag' | 'cross' | 'pinch'
    let start = null, downEl = null, holdTimer = 0, crossEl = null, lastTap = null;

    const mouse = (type, el, x, y, buttons) => el.dispatchEvent(new MouseEvent(type, {
      bubbles: type !== 'mouseleave' && type !== 'mouseenter', cancelable: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons,
    }));
    const clearCross = () => {
      if (!crossEl) return;
      for (let el = crossEl; el && el !== grid; el = el.parentElement) mouse('mouseleave', el, 0, 0, 0);
      crossEl = null;
    };
    const finish = () => { clearTimeout(holdTimer); mode = null; start = downEl = null; };

    grid.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1) { // second finger: hand over to the library's pinch zoom
        if (mode === 'drag') mouse('mouseup', downEl, start.x, start.y, 0);
        clearTimeout(holdTimer);
        mode = 'pinch';
        return;
      }
      e.preventDefault(); e.stopPropagation();
      clearCross();
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY };
      downEl = document.elementFromPoint(t.clientX, t.clientY) || grid;
      mode = 'wait';
      holdTimer = setTimeout(() => {
        if (mode !== 'wait') return;
        mode = 'cross';
        crossEl = downEl;
        for (let el = crossEl; el && el !== grid; el = el.parentElement) mouse('mouseenter', el, start.x, start.y, 0); // the library only listens for hover after this
        mouse('mousemove', crossEl, start.x, start.y, 0);
      }, HOLD_MS);
    }, { capture: true, passive: false });

    grid.addEventListener('touchmove', (e) => {
      if (mode === 'pinch' || !mode) return;
      e.preventDefault(); e.stopPropagation();
      const t = e.touches[0];
      if (mode === 'wait') {
        if (Math.abs(t.clientX - start.x) + Math.abs(t.clientY - start.y) < MOVE_PX) return;
        clearTimeout(holdTimer);
        mode = 'drag';
        mouse('mousedown', downEl, start.x, start.y, 1);
      }
      if (mode === 'drag') mouse('mousemove', downEl, t.clientX, t.clientY, 1);
      else if (mode === 'cross') mouse('mousemove', crossEl, t.clientX, t.clientY, 0);
    }, { capture: true, passive: false });

    const end = (e) => {
      if (mode === 'pinch') { if (e.touches.length === 0) finish(); return; }
      if (!mode) return;
      e.preventDefault(); e.stopPropagation();
      const t = e.changedTouches[0];
      if (mode === 'drag') {
        mouse('mouseup', downEl, t.clientX, t.clientY, 0);
        crossEl = downEl; clearCross(); // a mouse would still hover here and show the crosshair; a finger is gone
      } else if (mode === 'wait') { // a tap
        mouse('mousedown', downEl, start.x, start.y, 1);
        mouse('mouseup', downEl, start.x, start.y, 0);
        mouse('click', downEl, start.x, start.y, 0);
        const now = Date.now();
        if (lastTap && now - lastTap.at < 350 && Math.abs(lastTap.x - start.x) + Math.abs(lastTap.y - start.y) < 24) {
          grid.querySelector('#kchart')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: false })); // app.js re-syncs the Auto button
          lastTap = null;
        } else lastTap = { at: now, x: start.x, y: start.y };
      }
      finish();
    };
    grid.addEventListener('touchend', end, { capture: true, passive: false });
    grid.addEventListener('touchcancel', end, { capture: true, passive: false });
  }
})();
