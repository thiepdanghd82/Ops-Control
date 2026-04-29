/**
 * Audit Log viewer — sys-only.
 *
 * Read-only window onto the SQLite-backed audit log served by
 * GET /api/audit. Filters: event, user, from, to, limit.
 *
 * Ported from Ops Control v1.3 (domains/basis/client/audit/AuditLogViewer.jsx).
 * Adapted to v1.2 schema (audit_log columns: ts, event, user, ip, detail).
 *
 * No client-side caching — the audit log is append-only and ops users
 * expect a fresh read on every "Refresh".
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import './AuditLog.css';

const DEFAULT_LIMIT = 200;
const MAX_DETAIL_LEN = 120;

export default function AuditLog() {
  const { user } = useAuth();
  const isSys = user?.role === 'sys';

  const [filter, setFilter] = useState({
    event: '', user: '', from: '', to: '', limit: DEFAULT_LIMIT,
  });
  const [state, setState] = useState({
    loading: false, rows: [], total: null, error: null, fetched: false,
  });

  const fetchRows = useCallback(async (f = filter) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(f)) {
        if (v !== '' && v != null) qs.set(k, String(v));
      }
      const r = await fetch('/api/audit?' + qs.toString(), { credentials: 'include' });
      const body = await r.json();
      if (!r.ok || body?.error) {
        throw new Error(body?.error?.message || body?.error || ('HTTP ' + r.status));
      }
      const rows = Array.isArray(body?.data?.rows) ? body.data.rows : [];
      const total = body?.data?.total ?? rows.length;
      setState({ loading: false, rows, total, error: null, fetched: true });
    } catch (err) {
      setState({
        loading: false, rows: [], total: null,
        error: String(err?.message || err), fetched: true,
      });
    }
  }, [filter]);

  // Initial load on mount.
  useEffect(() => { if (isSys) fetchRows(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  if (!isSys) {
    return (
      <section className="audit">
        <header className="audit__head">
          <h2 className="audit__title">Audit log</h2>
          <p className="audit__sub">sys role required.</p>
        </header>
      </section>
    );
  }

  const upd = (k, v) => setFilter(f => ({ ...f, [k]: v }));

  return (
    <section className="audit">
      <header className="audit__head">
        <h2 className="audit__title">Audit log</h2>
        <p className="audit__sub">Append-only event stream. Newest first.</p>
      </header>

      <fieldset className="audit__filter">
        <Field label="Event">
          <input className="audit__input" value={filter.event}
                 onChange={e => upd('event', e.target.value)}
                 placeholder="UPPER_SNAKE" />
        </Field>
        <Field label="User">
          <input className="audit__input" value={filter.user}
                 onChange={e => upd('user', e.target.value)}
                 placeholder="username or id" />
        </Field>
        <Field label="From (ISO ts)">
          <input className="audit__input" value={filter.from}
                 onChange={e => upd('from', e.target.value)}
                 placeholder="2026-04-01T00:00:00Z" />
        </Field>
        <Field label="To (ISO ts)">
          <input className="audit__input" value={filter.to}
                 onChange={e => upd('to', e.target.value)}
                 placeholder="2026-04-30T00:00:00Z" />
        </Field>
        <Field label="Limit">
          <input type="number" min="1" max="10000"
                 className="audit__input audit__input--num"
                 value={filter.limit}
                 onChange={e => upd('limit', e.target.value === '' ? '' : Number(e.target.value))} />
        </Field>
        <div className="audit__actions">
          <button type="button" className="audit__btn"
                  onClick={() => fetchRows()} disabled={state.loading}>
            {state.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </fieldset>

      {state.error && (
        <div className="audit__alert">
          <b>Audit query failed:</b> {state.error}
        </div>
      )}

      {!state.error && state.fetched && state.rows.length === 0 && (
        <div className="audit__empty">No audit events match the current filter.</div>
      )}

      {state.rows.length > 0 && (
        <>
          <div className="audit__total">{state.total ?? state.rows.length} rows total</div>
          <div className="audit__tbl-wrap">
            <table className="audit__tbl">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Target</th>
                  <th>Result</th>
                  <th>IP</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r, i) => {
                  const result = inferResult(r);
                  return (
                    <tr key={r.id ?? `${r.ts}-${i}`}>
                      <td className="audit__mono">{r.ts || '—'}</td>
                      <td className="audit__mono">{r.event || r.action || '—'}</td>
                      <td>{r.user || r.actor || '—'}</td>
                      <td className="audit__mono">{r.target || '—'}</td>
                      <td>
                        <span className={'audit__badge audit__badge--' + result.tone}>
                          {result.label}
                        </span>
                      </td>
                      <td className="audit__mono">{r.ip || '—'}</td>
                      <td className="audit__details">
                        {r.detail ? truncate(r.detail, MAX_DETAIL_LEN) : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="audit__field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function truncate(s, n) {
  const str = String(s);
  return str.length <= n ? str : str.slice(0, n - 1) + '…';
}

// v1.2's audit_log table doesn't have an explicit `result` column, so
// we infer ok/danger from the event name and detail content. Events
// suffixed with _FAIL or containing an "error"/"denied" detail render
// as a danger badge; everything else is ok.
function inferResult(row) {
  const ev = String(row.event || row.action || '').toUpperCase();
  const detail = String(row.detail || '').toLowerCase();
  const bad = /_FAIL$|FAILED|DENIED|ERROR|REJECT|LOCKOUT/.test(ev)
    || /\berror\b|\bdenied\b|\bfailed\b/.test(detail);
  return bad ? { label: 'fail', tone: 'danger' } : { label: 'ok', tone: 'ok' };
}
