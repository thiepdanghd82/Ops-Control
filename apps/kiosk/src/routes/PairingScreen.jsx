// Pairing screen — Sprint MES-2.6.
// Reads ?t=<token> from the URL, posts to /api/planning/v2/kiosks/redeem,
// stores the returned session, redirects to the dispatch shell.
import { useEffect, useState } from 'react';
import * as session from '../lib/session.js';

export default function PairingScreen({ token }) {
  const [state, setState] = useState({ phase: 'idle', error: null, reason: null });

  useEffect(() => {
    if (!token) {
      setState({ phase: 'error', error: 'No pairing token in URL', reason: 'missing-token' });
      return;
    }
    let cancelled = false;
    setState({ phase: 'redeeming', error: null, reason: null });
    fetch('/api/planning/v2/kiosks/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        if (cancelled) return;
        const body = await r.json().catch(() => ({}));
        if (r.ok) {
          session.save({
            session_jwt: body.session_jwt,
            machine_code: body.machine_code,
            expires_at: body.expires_at,
            jti: body.jti,
            paired_at: new Date().toISOString(),
          });
          // Replace history so back-button doesn't return to the consumed
          // pairing URL (token is one-shot).
          window.history.replaceState(null, '', '/kiosk/');
          window.location.reload();
        } else if (r.status === 410 || body.type === 'urn:ops:kiosk-token-invalid') {
          setState({
            phase: 'error',
            error: 'Pairing token is invalid',
            reason: body.reason || 'invalid',
          });
        } else {
          setState({
            phase: 'error',
            error: 'Pairing failed — please try again',
            reason: body.type || `http-${r.status}`,
          });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          phase: 'error',
          error: 'Network error — could not reach the server',
          reason: e.message,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.phase === 'redeeming') {
    return (
      <main className="kiosk-screen kiosk-pair">
        <div className="kiosk-card">
          <h1>Pairing this kiosk…</h1>
          <p className="kiosk-subtle">Contacting the server. This usually takes &lt;2 seconds.</p>
        </div>
      </main>
    );
  }

  if (state.phase === 'error') {
    const isInvalidToken =
      state.reason &&
      /invalid|expired|already-redeemed|unknown|revoked|missing-token/.test(state.reason);
    return (
      <main className="kiosk-screen kiosk-pair">
        <div className="kiosk-card kiosk-card-error">
          <h1>Pairing failed</h1>
          <p>{state.error}</p>
          {state.reason && (
            <p className="kiosk-reason">
              Reason: <code>{state.reason}</code>
            </p>
          )}
          {isInvalidToken ? (
            <p className="kiosk-cta">Please contact your administrator for a new pairing card.</p>
          ) : (
            <button
              type="button"
              className="kiosk-btn kiosk-btn-primary"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="kiosk-screen kiosk-pair">
      <div className="kiosk-card">
        <h1>Ops Kiosk</h1>
        <p>Initializing…</p>
      </div>
    </main>
  );
}
