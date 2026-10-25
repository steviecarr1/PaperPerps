// Phone-only chart look, loaded right after the chart library. Every chart app.js makes (main + extra layout charts)
// gets these styles, and they are re-applied after app.js's own setStyles calls (colour changes etc.).
(() => {
  const phone = matchMedia('(max-width: 820px)');
  // The Time / Open / High / Low / Close / Volume box only shows while you hold for the crosshair.
  const PHONE_STYLES = { candle: { tooltip: { showRule: 'follow_cross' } } };
  const init = klinecharts.init;
  klinecharts.init = (...args) => {
    const chart = init(...args);
    if (!chart) return chart;
    const setStyles = chart.setStyles.bind(chart);
    chart.setStyles = (s) => { setStyles(s); if (phone.matches) setStyles(PHONE_STYLES); };
    if (phone.matches) setStyles(PHONE_STYLES);
    return chart;
  };
})();
