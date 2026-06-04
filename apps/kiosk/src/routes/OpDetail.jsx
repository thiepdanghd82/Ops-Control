// Op detail — Sprint MES-2.6b. Optimistic-UI + queue-on-mutation.
// Status-driven primary CTA, scan input always visible, complete confirm modal.
import { useEffect, useState } from 'react';
import * as session from '../lib/session.js';
import * as api from '../lib/api.js';
import * as queue from '../lib/queue.js';
import BigButton from '../components/BigButton.jsx';
import ReasonPicker from './ReasonPicker.jsx';
import { t } from '../../i18n/kiosk.js';

// Optimistic next-status given the event we're dispatching. Mirrors the
// MES-2.2 transition table — kept here (not imported from server) so the
// kiosk renders without a round-trip even when offline.
const OPTIMISTIC = {
  start: 'SETUP',
  start_run: 'RUNNING',
  scan: null, // scan does not always transition; show no optimistic flip
  pause: 'PAUSED',
  resume: 'RUNNING',
  complete: 'DONE',
};

async function dispatchAction(opId, kind, body) {
  const idemKey = api.newIdemKey();
  const url = `/api/planning/v2/operations/${opId}/${kind === 'complete_from_pause' ? 'complete' : kind}`;
  const httpKind = kind === 'complete_from_pause' ? 'complete' : kind;
  // Try direct send first (online happy path). On network error, queue.
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    const r = await api[`post${httpKind[0].toUpperCase()}${httpKind.slice(1)}`](
      opId,
      ...buildArgs(httpKind, body, idemKey)
    );
    if (r.ok) return { sent: true, op: r.body?.op };
    if (!r.networkError) {
      // Surface 4xx from server to caller; don't queue (would just permanent-fail).
      return { sent: false, problem: r.problem };
    }
    // Network error → enqueue.
  }
  await queue.enqueue({
    method: 'POST',
    url,
    body: body || {},
    idempotency_key: idemKey,
    op_id: opId,
    kind: httpKind,
  });
  return { sent: false, queued: true };
}
function buildArgs(kind, body, idemKey) {
  if (kind === 'pause') return [body.reason_code, idemKey];
  if (kind === 'complete') return [body, idemKey];
  if (kind === 'scan') return [body.barcode, idemKey];
  return [idemKey];
}

export default function OpDetail({ opId }) {
  const sess = session.load();
  const [op, setOp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [pickReason, setPickReason] = useState(false);
  const [completing, setCompleting] = useState(null); // null | { qty, scrap, notes }
  const [barcode, setBarcode] = useState('');

  // Initial load: fetch the dispatch list for this machine and pick our op
  // (cheap because we already cache it in IndexedDB via SW; falls back to a
  // direct GET when network is available).
  const refresh = async () => {
    if (!sess?.machine_code) return;
    const r = await api.getDispatch(sess.machine_code);
    if (r.ok) {
      const found = (r.body.items || []).find((x) => String(x.id) === String(opId));
      if (found) setOp(found);
    }
  };
  useEffect(() => {
    refresh();
  }, [opId]);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const act = async (kind, body) => {
    if (!op || busy) return;
    setBusy(true);
    const prev = op; // snapshot for revert-on-failure
    const optimisticTo = OPTIMISTIC[kind] || (kind === 'complete_from_pause' ? 'DONE' : null);
    if (optimisticTo) setOp({ ...op, status: optimisticTo });
    const r = await dispatchAction(opId, kind, body);
    setBusy(false);
    if (r.sent && r.op) setOp(r.op);
    else if (r.queued) flash('Queued — will send when online.');
    else if (r.problem) {
      // Revert optimistic flip — refresh() pulls from /dispatch which
      // only lists DISPATCHED ops, so a non-DISPATCHED op would orphan
      // the UI on the bad optimistic state. Snapshot is authoritative.
      setOp(prev);
      flash(r.problem.detail || r.problem.type || 'Action failed');
    }
  };

  if (!sess)
    return (
      <main className="kiosk-screen kiosk-pair">
        <div className="kiosk-card">
          <h1>Pair this kiosk first</h1>
        </div>
      </main>
    );
  if (!op)
    return (
      <main className="kiosk-screen kiosk-shell">
        <p className="kiosk-subtle">…</p>
      </main>
    );

  const back = () => {
    window.history.pushState(null, '', '/kiosk/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <main className="kiosk-screen kiosk-shell" data-testid="op-detail">
      <header className="kiosk-shell-header">
        <button type="button" className="kiosk-btn kiosk-btn-secondary" onClick={back}>
          {t('kiosk.op.back')}
        </button>
        <h1>{op.wo_code}</h1>
        <span className={`kiosk-status kiosk-status-${op.status}`} data-testid="op-status">
          {op.status}
        </span>
      </header>

      <section className="kiosk-card">
        <p>
          {op.customer || '—'} · Qty {op.qty_planned ?? '—'} · Due {op.due_date ?? '—'}
        </p>
      </section>

      <section className="kiosk-card kiosk-card-actions">
        {op.status === 'DISPATCHED' && (
          <BigButton
            variant="primary"
            disabled={busy}
            onClick={() => act('start')}
            data-testid="op-btn-start"
          >
            {t('kiosk.op.start')}
          </BigButton>
        )}
        {op.status === 'SETUP' && (
          <BigButton
            variant="primary"
            disabled={busy}
            onClick={() => act('start_run')}
            data-testid="op-btn-begin-run"
          >
            {t('kiosk.op.begin_run')}
          </BigButton>
        )}
        {op.status === 'RUNNING' && (
          <>
            <BigButton
              variant="danger"
              disabled={busy}
              onClick={() => setPickReason(true)}
              data-testid="op-btn-pause"
            >
              {t('kiosk.op.pause')}
            </BigButton>
            <BigButton
              variant="primary"
              disabled={busy}
              onClick={() => setCompleting({ qty: op.qty_planned ?? 0, scrap: 0 })}
              data-testid="op-btn-complete"
            >
              {t('kiosk.op.complete')}
            </BigButton>
          </>
        )}
        {op.status === 'PAUSED' && (
          <>
            <BigButton
              variant="primary"
              disabled={busy}
              onClick={() => act('resume')}
              data-testid="op-btn-resume"
            >
              {t('kiosk.op.resume')}
            </BigButton>
            <BigButton
              variant="secondary"
              disabled={busy}
              onClick={() => setCompleting({ qty: op.qty_planned ?? 0, scrap: 0 })}
              data-testid="op-btn-complete"
            >
              {t('kiosk.op.complete')}
            </BigButton>
          </>
        )}
        {op.status === 'DONE' && <p className="kiosk-subtle">{t('kiosk.op.awaiting_accept')}</p>}
      </section>

      <section className="kiosk-card">
        <label className="kiosk-label">{t('kiosk.op.scan_prompt')}</label>
        <input
          className="kiosk-input"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          inputMode="text"
          autoComplete="off"
        />
        <BigButton
          variant="secondary"
          disabled={busy || !barcode}
          onClick={async () => {
            await act('scan', { barcode });
            setBarcode('');
          }}
        >
          {t('kiosk.op.scan_send')}
        </BigButton>
      </section>

      {pickReason && (
        <ReasonPicker
          onCancel={() => setPickReason(false)}
          onPick={async (code) => {
            setPickReason(false);
            await act('pause', { reason_code: code });
          }}
        />
      )}

      {completing && (
        <CompleteModal
          initial={completing}
          onCancel={() => setCompleting(null)}
          onConfirm={async (payload) => {
            setCompleting(null);
            const kind = op.status === 'PAUSED' ? 'complete_from_pause' : 'complete';
            await act(kind, payload);
          }}
        />
      )}

      {toast && (
        <div className="kiosk-toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}

function CompleteModal({ initial, onCancel, onConfirm }) {
  const [qty, setQty] = useState(initial.qty);
  const [scrap, setScrap] = useState(initial.scrap);
  const [notes, setNotes] = useState('');
  return (
    <div className="kiosk-modal-scrim" role="dialog">
      <div className="kiosk-card">
        <label className="kiosk-label">{t('kiosk.op.qty_done')}</label>
        <input
          className="kiosk-input"
          type="number"
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />
        <label className="kiosk-label">{t('kiosk.op.scrap_count')}</label>
        <input
          className="kiosk-input"
          type="number"
          inputMode="numeric"
          value={scrap}
          onChange={(e) => setScrap(Number(e.target.value))}
        />
        <label className="kiosk-label">{t('kiosk.op.notes_opt')}</label>
        <textarea
          className="kiosk-input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
        <div className="kiosk-modal-actions">
          <BigButton variant="secondary" onClick={onCancel}>
            {t('kiosk.reason.cancel')}
          </BigButton>
          <BigButton
            variant="primary"
            data-testid="op-btn-complete-confirm"
            onClick={() =>
              onConfirm({ qty_done: qty, scrap_count: scrap, notes: notes || undefined })
            }
          >
            {t('kiosk.op.complete_confirm')}
          </BigButton>
        </div>
      </div>
    </div>
  );
}
