// Sprint MES-2.7 — SYSTEM › Kiosk Admin tab. Active-pairings table +
// Generate-pairing modal + sys-only revoke flow. AccessGate at parent
// (CostModule) wraps this; per-button gating reads via useAccess.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useI18n } from '../../../utils/useI18n.js';
import * as api from './KioskAdmin/api.js';
import GeneratePairingModal from './KioskAdmin/GeneratePairingModal.jsx';
import './KioskAdmin.css';

const POLL_MS = 30_000;

function pulseState(lastSeenIso) {
  if (!lastSeenIso) return 'red';
  const ageMs = Date.now() - Date.parse(lastSeenIso);
  if (ageMs < 30_000) return 'green';
  if (ageMs < 5 * 60_000) return 'amber';
  return 'red';
}

export default function KioskAdmin() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openModal, setOpenModal] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [toast, setToast] = useState(null);
  const pollRef = useRef(null);

  const isSys = user?.role === 'sys';

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.getPairings({ active: true });
      setRows(Array.isArray(r?.rows) ? r.rows : []);
      setError(null);
    } catch (e) {
      setError(e?.body?.detail || e?.message || 'Failed to load pairings');
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 30s; pause on tab blur (visibilitychange) so we don't burn
  // bandwidth on a backgrounded planner browser tab.
  useEffect(() => {
    refresh();
    const start = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(refresh, POLL_MS);
    };
    const stop = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    const onVis = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh]);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleRevoke = async (id) => {
    setRevokingId(id);
    setConfirmId(null);
    // Optimistic remove.
    const before = rows;
    setRows((r) => r.filter((x) => x.id !== id));
    try {
      await api.revokePairing(id);
      flash('Kiosk session revoked.');
    } catch (e) {
      setRows(before); // rollback
      flash(e?.body?.detail || 'Revoke failed — restored row.');
    } finally {
      setRevokingId(null);
    }
  };

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (a.machine_code || '').localeCompare(b.machine_code || '')),
    [rows]
  );

  return (
    <div className="kiosk-admin">
      <header className="kiosk-admin-header">
        <h2>{t('planning.kiosk_admin.title')}</h2>
        <button type="button" className="op-btn op-btn-primary" onClick={() => setOpenModal(true)}>
          {t('planning.kiosk_admin.generate_cta')}
        </button>
      </header>

      {error && <div className="kiosk-admin-error">{error}</div>}

      {!loading && sortedRows.length === 0 && (
        <div className="kiosk-admin-empty">{t('planning.kiosk_admin.empty_state')}</div>
      )}

      {sortedRows.length > 0 && (
        <table className="kiosk-admin-table">
          <thead>
            <tr>
              <th>{t('planning.kiosk_admin.col_machine')}</th>
              <th>{t('planning.kiosk_admin.col_paired_since')}</th>
              <th>{t('planning.kiosk_admin.col_last_seen')}</th>
              <th>{t('planning.kiosk_admin.col_status')}</th>
              <th>{t('planning.kiosk_admin.col_action')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((p) => {
              const dot = pulseState(p.last_seen_at_utc);
              return (
                <tr key={p.id}>
                  <td>
                    <code>{p.machine_code}</code>
                  </td>
                  <td>{p.redeemed_at_utc ? new Date(p.redeemed_at_utc).toLocaleString() : '—'}</td>
                  <td>
                    {p.last_seen_at_utc ? new Date(p.last_seen_at_utc).toLocaleString() : '—'}
                  </td>
                  <td>
                    <span className={`kiosk-dot kiosk-dot-${dot}`} aria-label={dot} /> {dot}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="op-btn op-btn-ghost op-btn-danger"
                      disabled={!isSys || revokingId === p.id}
                      title={isSys ? '' : t('planning.kiosk_admin.revoke_sys_only')}
                      onClick={() => setConfirmId(p.id)}
                    >
                      {t('planning.kiosk_admin.revoke_cta')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <GeneratePairingModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        onIssued={() => refresh()}
      />

      {confirmId !== null && (
        <div className="kiosk-confirm-scrim" role="dialog">
          <div className="kiosk-confirm-card">
            <p>{t('planning.kiosk_admin.revoke_confirm')}</p>
            <div className="kiosk-confirm-actions">
              <button
                type="button"
                className="op-btn op-btn-ghost"
                onClick={() => setConfirmId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="op-btn op-btn-primary op-btn-danger"
                onClick={() => handleRevoke(confirmId)}
              >
                {t('planning.kiosk_admin.revoke_cta')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="kiosk-admin-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
