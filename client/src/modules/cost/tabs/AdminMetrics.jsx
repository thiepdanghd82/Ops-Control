/**
 * AdminMetrics — sys-only ops dashboard.
 *
 * Reads `/metrics` (Prometheus text exposition served by the node
 * server) and renders a Carbon-style summary: KPI tiles, latency chart,
 * per-route latency table, breakdowns by status / method / boundary,
 * and a recent-events feed (when `/metrics/events` is available).
 *
 * UI design ported from Ops Control v1.3
 * (domains/basis/client/admin-metrics/AdminMetrics.jsx) on 2026-04-29.
 * Pure parsing helpers stay in AdminMetrics.helpers.js so node --test
 * can exercise them without a JSX loader.
 *
 * 30 s auto-refresh; pauses while the tab is hidden.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  parsePrometheus, sumByLabel, histogramSummary, computeHealth,
  P95_WARN_MS, P95_ALERT_MS,
} from './AdminMetrics.helpers.js';
import './AdminMetrics.css';

const REFRESH_MS = 30_000;
const RECENT_EVENTS_LIMIT = 25;

export default function AdminMetrics() {
  const [raw, setRaw] = useState('');
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState(null);
  const abortRef = useRef(null);

  const [events, setEvents] = useState([]);
  const [eventsErr, setEventsErr] = useState(null);

  const fetchMetrics = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const r = await fetch('/metrics', { signal: ctrl.signal, credentials: 'include' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      setRaw(await r.text());
      setErr(null);
      setFetchedAt(new Date());
    } catch (e) {
      if (e?.name !== 'AbortError') setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
    // Recent events — non-fatal. v1.2 may not expose /metrics/events
    // (it's a v1.3-era endpoint); a 404 just hides the section.
    try {
      const r = await fetch(
        '/metrics/events?limit=' + RECENT_EVENTS_LIMIT,
        { signal: ctrl.signal, credentials: 'include' },
      );
      if (!r.ok) {
        setEvents([]);
        setEventsErr(r.status === 404 ? null : 'HTTP ' + r.status);
        return;
      }
      const body = await r.json();
      const items = Array.isArray(body?.data?.items) ? body.data.items
                  : Array.isArray(body?.items) ? body.items
                  : [];
      setEvents(items);
      setEventsErr(null);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      setEventsErr(e?.message || String(e));
    }
  };

  useEffect(() => {
    fetchMetrics();
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchMetrics();
    }, REFRESH_MS);
    return () => { clearInterval(iv); abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows         = useMemo(() => parsePrometheus(raw), [raw]);
  const httpByStatus = useMemo(() => sumByLabel(rows, 'http_requests_total', 'status'), [rows]);
  const httpByMethod = useMemo(() => sumByLabel(rows, 'http_requests_total', 'method'), [rows]);
  const clientErrors = useMemo(() => sumByLabel(rows, 'client_errors_total', 'boundary'), [rows]);
  const httpByUser   = useMemo(() => sumByLabel(rows, 'http_requests_total', 'user'), [rows]);
  const latency      = useMemo(() => histogramSummary(rows, 'http_request_duration_ms'), [rows]);

  // Roll up status counts → total + error rate. v1.3 has a dedicated
  // statusSummary() helper; v1.2 inlines the same maths.
  const status = useMemo(() => {
    let total = 0; let errors = 0;
    for (const [s, n] of httpByStatus) {
      total += n;
      if (Number(String(s).replace(/[^0-9]/g, '')) >= 500 || /^5/.test(String(s))) errors += n;
    }
    return { total, errors, errorRate: total > 0 ? (errors / total) * 100 : 0 };
  }, [httpByStatus]);

  const slowRoutes = latency.filter(r => (r.p95 ?? 0) >= P95_ALERT_MS).length;
  const totalClientErrors = clientErrors.reduce((s, [, n]) => s + n, 0);
  const health = computeHealth({
    totalRequests: status.total,
    errorRate: status.errorRate,
    slowRoutes,
    totalClientErrors,
  });

  if (loading && !raw) {
    return (
      <section className="metrics">
        <header className="metrics__head">
          <h2 className="metrics__title">Admin metrics</h2>
        </header>
        <div className="metrics__empty">Loading metrics…</div>
      </section>
    );
  }
  if (err && !raw) {
    return (
      <section className="metrics">
        <header className="metrics__head">
          <h2 className="metrics__title">Admin metrics</h2>
        </header>
        <div className="metrics__empty metrics__empty--err">⚠ {err}</div>
      </section>
    );
  }

  const healthLabel = health === 'alert' ? 'alert'
    : health === 'warn' ? 'degraded'
    : health === 'ok' ? 'ok' : 'idle';

  return (
    <section className="metrics">
      <header className="metrics__head">
        <h2 className="metrics__title">Admin metrics</h2>
        <div className="metrics__bar">
          <span className={'metrics__health metrics__health--' + health}>{healthLabel}</span>
          <span className="metrics__when">
            {fetchedAt ? `updated ${fetchedAt.toLocaleTimeString()}` : ''}
          </span>
          <button
            type="button"
            className="metrics__btn"
            onClick={fetchMetrics}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="metrics__tiles">
        <Tile label="HTTP requests" value={status.total.toLocaleString()} />
        <Tile label="Error rate (5xx)"
              value={status.errorRate.toFixed(2) + '%'}
              tone={status.errorRate >= 1 ? 'danger' : status.errorRate >= 0.5 ? 'warning' : 'ok'} />
        <Tile label={'Slow routes (p95 ≥ ' + P95_ALERT_MS + 'ms)'}
              value={slowRoutes}
              tone={slowRoutes > 0 ? 'danger' : 'ok'} />
        <Tile label="Client errors"
              value={totalClientErrors}
              tone={totalClientErrors > 0 ? 'danger' : 'ok'} />
      </div>

      <Section title="Latency chart">
        <LatencyChart routes={latency.slice(0, 12)} />
      </Section>

      <Section title="Latency by route (top 20)">
        {latency.length === 0 ? (
          <p className="metrics__empty">No latency data yet</p>
        ) : (
          <table className="metrics__tbl">
            <thead>
              <tr>
                <th>Route</th>
                <th className="metrics__num">Count</th>
                <th className="metrics__num">P50</th>
                <th className="metrics__num">P95</th>
                <th className="metrics__num">Avg</th>
              </tr>
            </thead>
            <tbody>
              {latency.slice(0, 20).map(r => (
                <tr key={r.route}>
                  <td><code>{r.route || '—'}</code></td>
                  <td className="metrics__num">{r.count.toLocaleString()}</td>
                  <td className="metrics__num">{fmtMs(r.p50)}</td>
                  <td className={'metrics__num ' + p95Class(r.p95)}>{fmtMs(r.p95)}</td>
                  <td className="metrics__num">{r.count > 0 ? (r.sum / r.count).toFixed(1) + ' ms' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <div className="metrics__cols">
        <Section title="Requests by status">
          <CounterTable entries={httpByStatus} keyLabel="Status" />
        </Section>
        <Section title="Requests by method">
          <CounterTable entries={httpByMethod} keyLabel="Method" />
        </Section>
        <Section title="Client errors by boundary">
          <CounterTable entries={clientErrors} keyLabel="Boundary" />
        </Section>
        <Section title="Top users">
          <CounterTable entries={httpByUser.slice(0, 10)} keyLabel="User" />
        </Section>
      </div>

      {(events.length > 0 || eventsErr) && (
        <Section title="Recent events">
          <RecentEvents events={events} error={eventsErr} />
        </Section>
      )}
    </section>
  );
}

function Tile({ label, value, tone = 'info' }) {
  return (
    <div className={'metrics__tile metrics__tile--' + tone}>
      <div className="metrics__tile-lbl">{label}</div>
      <div className="metrics__tile-val">{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <fieldset className="metrics__panel">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}

function CounterTable({ entries, keyLabel }) {
  if (!entries || entries.length === 0) {
    return <p className="metrics__empty">—</p>;
  }
  return (
    <table className="metrics__tbl">
      <thead>
        <tr>
          <th>{keyLabel}</th>
          <th className="metrics__num">Count</th>
        </tr>
      </thead>
      <tbody>
        {entries.slice(0, 20).map(([k, v]) => (
          <tr key={k}>
            <td><code>{k}</code></td>
            <td className="metrics__num">{Number(v).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LatencyChart({ routes }) {
  if (!routes || routes.length === 0) {
    return <p className="metrics__empty">—</p>;
  }
  const W = 520, ROW_H = 18, PAD_L = 160, PAD_R = 50, PAD_T = 8, PAD_B = 8;
  const H = PAD_T + PAD_B + routes.length * ROW_H;
  const maxMs = Math.max(P95_ALERT_MS, ...routes.map(r => r.p95 ?? 0));
  const xOf = (ms) => PAD_L + ((ms || 0) / maxMs) * (W - PAD_L - PAD_R);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}
         style={{ display: 'block', maxHeight: H }}
         role="img" aria-label="Per-route p95 latency">
      <line x1={xOf(P95_WARN_MS)}  x2={xOf(P95_WARN_MS)}
            y1={PAD_T}             y2={H - PAD_B}
            stroke="#f1c21b" strokeDasharray="3 3" />
      <line x1={xOf(P95_ALERT_MS)} x2={xOf(P95_ALERT_MS)}
            y1={PAD_T}             y2={H - PAD_B}
            stroke="#da1e28" strokeDasharray="3 3" />
      {routes.map((r, i) => {
        const y = PAD_T + i * ROW_H;
        const p95 = r.p95 ?? 0;
        const fill = p95 >= P95_ALERT_MS ? '#da1e28'
          : p95 >= P95_WARN_MS ? '#f1c21b' : '#0f62fe';
        const label = (r.route || '—').slice(0, 30);
        return (
          <g key={r.route}>
            <text x={PAD_L - 8} y={y + ROW_H * 0.7}
                  fontSize="10" textAnchor="end" fill="#525252"
                  style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>
              {label}
            </text>
            <rect
              x={PAD_L} y={y + 3}
              width={Math.max(2, xOf(p95) - PAD_L)} height={ROW_H - 6}
              fill={fill} />
            <text x={xOf(p95) + 4} y={y + ROW_H * 0.7}
                  fontSize="10" fill="#161616"
                  style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtMs(p95)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function RecentEvents({ events, error }) {
  if (error) return <p className="metrics__empty">⚠ {error}</p>;
  if (!events || events.length === 0) return <p className="metrics__empty">No recent events.</p>;
  return (
    <table className="metrics__tbl">
      <thead>
        <tr>
          <th>When</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Target</th>
          <th className="metrics__num">Status</th>
        </tr>
      </thead>
      <tbody>
        {events.map((ev, i) => (
          <tr key={ev.id || i}>
            <td>{ev.at || ev.ts || '—'}</td>
            <td><code>{ev.actor || ev.user || '—'}</code></td>
            <td><code>{ev.action || ev.event || '—'}</code></td>
            <td>{ev.target || ev.detail || '—'}</td>
            <td className={'metrics__num ' + (ev.status >= 500 ? 'metrics__alert'
              : ev.status >= 400 ? 'metrics__warn' : '')}>
              {ev.status ?? '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function fmtMs(v) {
  if (v == null) return '—';
  return v + ' ms';
}
function p95Class(v) {
  if (v == null) return '';
  if (v >= P95_ALERT_MS) return 'metrics__alert';
  if (v >= P95_WARN_MS)  return 'metrics__warn';
  return '';
}
