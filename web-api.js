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
  });
})();
