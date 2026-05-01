// Root shell — Sprint MES-2.6.
// Tiny URL-based router (no react-router): /kiosk/pair?t=… → pairing
// flow, anything else → the main shell. Dispatch list lands in MES-2.6b.
import { useEffect, useState } from 'react';
import PairingScreen from './routes/PairingScreen.jsx';
import * as session from './lib/session.js';

function readRoute() {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if (path === '/kiosk/pair' || path.startsWith('/kiosk/pair')) {
    return { name: 'pair', token: params.get('t') };
  }
  return { name: 'shell' };
}

export default function App() {
  const [route] = useState(readRoute);
  const [sess, setSess] = useState(() => session.load());

  // Re-read session if storage changes (e.g. another tab paired). Cheap
  // and avoids stale UI when an admin re-pairs a device from the planner.
  useEffect(() => {
    const onStorage = () => setSess(session.load());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  if (route.name === 'pair') {
    return <PairingScreen token={route.token} />;
  }

  if (!sess) {
    return (
      <main className="kiosk-screen kiosk-pair">
        <div className="kiosk-card">
          <h1>Pair this kiosk first</h1>
          <p className="kiosk-subtle">
            Ask a planner to issue a pairing card from <code>Settings → Kiosks</code>, then scan or
            open the URL on this device.
          </p>
        </div>
      </main>
    );
  }

  // Placeholder until MES-2.6b ships the dispatch list. Renders the
  // bound machine_code so operators can confirm the kiosk is on the
  // right station without devtools.
  return (
    <main className="kiosk-screen kiosk-shell">
      <header className="kiosk-shell-header">
        <h1>Ops Kiosk</h1>
        <span className="kiosk-machine">Machine: {sess.machine_code}</span>
      </header>
      <section className="kiosk-card">
        <h2>Dispatch list — coming next sprint (MES-2.6b)</h2>
        <p className="kiosk-subtle">This kiosk is paired and ready.</p>
      </section>
    </main>
  );
}
