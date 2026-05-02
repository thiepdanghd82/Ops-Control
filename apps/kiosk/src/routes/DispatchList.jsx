// Dispatch list — Sprint MES-2.6b.
// Polls /v2/operations/dispatch every 30s while online; tap row → /op/:id.
import { useEffect, useState } from 'react';
import * as session from '../lib/session.js';
import * as api from '../lib/api.js';
import { t } from '../../i18n/kiosk.js';

const STALE_PULSE_MS = 5 * 60 * 1000;

export default function DispatchList() {
  const sess = session.load();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = async () => {
    if (!sess?.machine_code) return;
    setLoading(true);
    const r = await api.getDispatch(sess.machine_code);
    setLoading(false);
    if (r.ok) {
      setItems(r.body.items || []);
      setError(null);
    } else if (!r.networkError) {
      setError(r.problem?.detail || r.problem?.type || 'fetch failed');
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (navigator.onLine) refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const go = (opId) => {
    window.history.pushState(null, '', `/kiosk/op/${opId}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  const isStale = (iso) => !iso || Date.now() - Date.parse(iso) > STALE_PULSE_MS;

  return (
    <main className="kiosk-screen kiosk-shell">
      <header className="kiosk-shell-header">
        <h1>{t('kiosk.dispatch.title')}</h1>
        <span className="kiosk-machine">Machine: {sess?.machine_code}</span>
      </header>
      {loading && items.length === 0 && <p className="kiosk-subtle">…</p>}
      {!loading && items.length === 0 && (
        <div className="kiosk-card">
          <p>{t('kiosk.dispatch.empty')}</p>
          <button type="button" className="kiosk-btn kiosk-btn-primary" onClick={refresh}>
            {t('kiosk.dispatch.refresh')}
          </button>
        </div>
      )}
      {error && (
        <div className="kiosk-card kiosk-card-error">
          <p>{error}</p>
        </div>
      )}
      {items.length > 0 && (
        <ul className="kiosk-list" data-testid="dispatch-list" role="list">
          {items.map((op, i) => (
            <li
              key={op.id}
              data-testid={`op-row-${op.wo_code}`}
              className={`kiosk-row${i === 0 ? ' kiosk-row-top' : ''}${isStale(op.last_pulse_at) ? ' kiosk-row-stale' : ''}`}
              onClick={() => go(op.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && go(op.id)}
              role="button"
              tabIndex={0}
            >
              <div className="kiosk-row-main">
                <strong>{op.wo_code}</strong>
                <span className={`kiosk-status kiosk-status-${op.status}`}>{op.status}</span>
              </div>
              <div className="kiosk-row-sub">
                <span>
                  {t('kiosk.dispatch.row_qty')}: {op.qty_planned ?? '—'}
                </span>
                <span>
                  {t('kiosk.dispatch.row_due')}: {op.due_date ?? '—'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
