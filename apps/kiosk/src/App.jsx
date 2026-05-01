// Root shell — Sprint MES-2.6 (extended in MES-2.6b).
// Tiny URL-based router (no react-router): /kiosk/pair?t=… → pairing,
// /kiosk/op/:id → op detail, anything else → dispatch list.
import { useEffect, useState } from 'react';
import PairingScreen from './routes/PairingScreen.jsx';
import DispatchList from './routes/DispatchList.jsx';
import OpDetail from './routes/OpDetail.jsx';
import ConnBadge from './components/ConnBadge.jsx';
import * as session from './lib/session.js';
import * as queue from './lib/queue.js';

function readRoute() {
  const p = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if (p.startsWith('/kiosk/pair')) return { name: 'pair', token: params.get('t') };
  const opMatch = p.match(/^\/kiosk\/op\/(\d+)/);
  if (opMatch) return { name: 'op', opId: Number(opMatch[1]) };
  return { name: 'shell' };
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [sess, setSess] = useState(() => session.load());

  useEffect(() => {
    const onStorage = () => setSess(session.load());
    const onPop = () => setRoute(readRoute());
    window.addEventListener('storage', onStorage);
    window.addEventListener('popstate', onPop);
    queue.startOnlineFlushDriver();
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  if (route.name === 'pair') return <PairingScreen token={route.token} />;

  if (!sess) {
    return (
      <main className="kiosk-screen kiosk-pair">
        <div className="kiosk-card">
          <h1>Pair this kiosk first</h1>
          <p className="kiosk-subtle">
            Ask a planner to issue a pairing card from <code>Settings → Kiosks</code>, then open the
            URL on this device.
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
      <ConnBadge />
      {route.name === 'op' ? <OpDetail opId={route.opId} /> : <DispatchList />}
    </>
  );
}
