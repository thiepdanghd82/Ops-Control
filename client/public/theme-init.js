/* Phase 9J.5 — pre-paint theme init. Runs BEFORE main.jsx in <head>
   so the browser's first paint already has data-theme applied. Served
   from /public as a static asset so production CSP (script-src 'self')
   allows it without needing 'unsafe-inline'. */
(function () {
  try {
    var p = localStorage.getItem('ops_theme_pref') || 'system';
    if (p !== 'light' && p !== 'dark' && p !== 'system') p = 'system';
    var active = p === 'system'
      ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : p;
    if (active === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (_e) { /* localStorage unavailable; default to light */ void _e; }
})();
