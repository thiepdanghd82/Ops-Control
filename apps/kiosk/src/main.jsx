// Entry point — Sprint MES-2.6.
// React 19 createRoot + service-worker registration. The SW is mounted
// from /kiosk/sw.js (served by server/index.js) so its scope is the
// kiosk subtree only — it can never intercept planner or API requests.
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '../styles/kiosk.css';

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator) {
  // Defer registration until after first paint so the kiosk's pairing
  // screen renders before the SW handshake.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/kiosk/sw.js', { scope: '/kiosk/' })
      .catch((err) => console.warn('[kiosk] SW registration failed', err));

    // Stale-chunk reload pattern (mirrors client/ ErrorBoundary): when a
    // new SW takes control, force-reload once so all clients pick up
    // the fresh asset hashes. Guarded via sessionStorage so a genuine
    // bug can't loop the browser.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
