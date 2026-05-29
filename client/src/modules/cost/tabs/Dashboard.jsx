/**
 * Dashboard — enterprise KPIs from /api/shared/dashboard.
 *
 * Read-only. Refetches on mount and whenever the time-range dropdown
 * changes (30 / 90 / 365 days / all time). SVG charts are inline —
 * no chart library because the payload is small and we avoid adding
 * a ~100 kB dependency for four small charts.
 *
 * CSV export is gated to admin+ on both the client (button hidden) and
 * server (/dashboard/export returns 403 for lower roles). Server-side
 * CSV has injection-hardening (prefixes formula chars with apostrophe).
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../utils/useI18n';
import { pct, fmtInt, gmClr } from '../../../utils/format';
import EmptyState from '../../../components/Shared/EmptyState';
import SkeletonTable from '../../../components/Shared/SkeletonTable';
import { showToast } from '../../../utils/toast';

// Phase 9G.6 — Dashboard polls every REFRESH_MS while the tab is
// visible. Intentional tab-visibility gate: a background tab should not
// burn API calls; it catches up when the user focuses it. 60 s is long
// enough that /dashboard (memoized to single-pass in 9F.3) adds
// negligible server load even with 100 users staring at it.
const REFRESH_MS = 60_000;

const RANGE_OPTION_KEYS = [
  { value: 'all', key: 'common.all_time' },
  { value: '365', key: 'common.last_year' },
  { value: '90', key: 'common.last_90_days' },
  { value: '30', key: 'common.last_30_days' },
];

export default function Dashboard() {
  const { hasRole } = useAuth();
  const { t } = useI18n();
  const [range, setRange] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Track the in-flight request so a range change OR unmount aborts
  // the previous fetch — prevents stale responses overwriting fresh
  // data and "setState on unmounted component" warnings.
  const abortRef = useRef(null);
  const load = useCallback(
    (rng = range) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setErr(null);
      const qs = rng && rng !== 'all' ? `?days=${rng}` : '';
      api
        .get(`/shared/dashboard${qs}`, { signal: ctrl.signal })
        .then((r) => {
          setData(r);
          setLoading(false);
        })
        .catch((e) => {
          // AbortError = the caller cancelled (new range or unmount) —
          // silently ignore; any other error surfaces to the UI.
          if (e?.name === 'AbortError') return;
          setErr(e.message || 'Failed to load dashboard');
          setLoading(false);
        });
    },
    [range]
  );

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps --
     load() is a stable useCallback that fetches and then updates the
     loading+data state in a then/catch — the standard fetch-on-mount
     pattern. The `range` dep triggers a refetch when the user changes
     the time-range filter. No cascading render issue because the
     setState happens after the fetch promise resolves, not synchronously. */
  useEffect(() => {
    load(range);
  }, [range]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // Phase 9G.6 — auto-refresh while the tab is visible. Uses
  // document.visibilityState so a background tab (sitting behind 20
  // other tabs for a day) doesn't quietly poll. We store `range` in
  // a ref so the polled load always uses the latest range without
  // adding `range` to the interval's deps (which would reset the
  // timer on every range change — jittery).
  const rangeRef = useRef(range);
  useEffect(() => {
    rangeRef.current = range;
  }, [range]);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      load(rangeRef.current);
    };
    const id = setInterval(tick, REFRESH_MS);
    // Also refresh when the tab comes back into focus — users with
    // stale data see fresh numbers immediately instead of waiting up
    // to 60 s.
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      // Abort any in-flight dashboard fetch so a late response can't
      // setState on an unmounted tab (e.g., user switched to Settings
      // while a slow /shared/dashboard request was still resolving).
      abortRef.current?.abort();
    };
  }, [load]);

  const canExport = hasRole('admin');

  const handleExport = useCallback(() => {
    const qs = range && range !== 'all' ? `?days=${range}` : '';
    const url = `/api${'/shared/dashboard/export'}${qs}`;
    // Phase 9H — credentials:'include' so the httpOnly session cookie
    // authenticates the download. Bearer header is still sent for
    // legacy localStorage clients (both work during rollout). No CSRF
    // header needed on GET — safe method.
    const token = localStorage.getItem('ops_token');
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Export failed (${r.status})`);
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = `ops_dashboard_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(href);
      })
      .catch((e) => showToast(e.message || 'Export failed', 'err'));
  }, [range]);

  if (loading && !data)
    return (
      <div style={{ padding: 24 }}>
        <SkeletonTable rows={8} cols={4} />
      </div>
    );
  if (err)
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          icon="⚠️"
          title={t('dashboard.err.title')}
          hint={err}
          action={
            <button onClick={() => load(range)} className="op-btn op-btn-primary op-btn-sm">
              {t('common.retry')}
            </button>
          }
        />
      </div>
    );
  if (!data) return null;

  const {
    overview,
    win_rate,
    approval_funnel,
    top_customers,
    monthly_quotes,
    margin_trend,
    margin_histogram,
    generated_at,
  } = data;

  return (
    <div
      style={{
        padding: 24,
        background: 'var(--surface-subtle)',
        minHeight: '100%',
        color: 'var(--text-primary)',
        fontFamily: "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      {/* Header + range + export */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('dashboard.title')}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {data.range?.days
            ? data.range.days === 30
              ? t('common.last_30_days')
              : data.range.days === 90
                ? t('common.last_90_days')
                : data.range.days === 365
                  ? t('common.last_year')
                  : `${data.range.days}d`
            : t('common.all_time')}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <label
            style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            {t('common.range')}
          </label>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            style={selectStyle}
            aria-label="Time range"
          >
            {RANGE_OPTION_KEYS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.key)}
              </option>
            ))}
          </select>
          <button
            onClick={() => load(range)}
            className="op-btn op-btn-secondary op-btn-sm"
            title={t('common.refresh')}
          >
            ↻ {t('common.refresh')}
          </button>
          {canExport && (
            <button
              onClick={handleExport}
              className="op-btn op-btn-primary op-btn-sm"
              title={t('common.export_csv')}
            >
              ⇩ {t('common.export_csv')}
            </button>
          )}
        </div>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 16 }}>
        {t('dashboard.generated_at', { ts: new Date(generated_at).toLocaleString() })}
      </div>

      {/* KPI cards: Total / Win rate / Avg GM / Pending */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <KpiCard
          label={t('dashboard.kpi.total_quotes')}
          value={fmtInt(overview.total) === '\u2014' ? '0' : fmtInt(overview.total)}
          sub={`${overview.by_type.standard || 0} std / ${overview.by_type.complex || 0} cplx`}
        />
        <KpiCard
          label={t('dashboard.kpi.win_rate')}
          value={win_rate.rate == null ? '—' : pct(win_rate.rate)}
          tone={
            win_rate.rate == null
              ? 'neutral'
              : win_rate.rate >= 0.6
                ? 'good'
                : win_rate.rate >= 0.4
                  ? 'warn'
                  : 'bad'
          }
          sub={t('dashboard.kpi.won_lost', { won: win_rate.won, lost: win_rate.lost })}
        />
        <KpiCard
          label={t('dashboard.kpi.avg_gm')}
          value={pct(overview.avg_gm)}
          tone={
            overview.avg_gm == null
              ? 'neutral'
              : overview.avg_gm >= 0.2
                ? 'good'
                : overview.avg_gm >= 0.1
                  ? 'warn'
                  : 'bad'
          }
          sub={`Value-add ${pct(overview.avg_va)}`}
        />
        <KpiCard
          label={t('dashboard.kpi.pending')}
          value={fmtInt(overview.pending_count) === '\u2014' ? '0' : fmtInt(overview.pending_count)}
          tone={overview.pending_count > 10 ? 'warn' : 'neutral'}
          sub={t('dashboard.kpi.draft_count', { n: win_rate.draft })}
        />
      </div>

      {/* Row 2: approval funnel + margin histogram */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <Panel title={t('dashboard.panel.approval_funnel')}>
          <ApprovalFunnel funnel={approval_funnel} t={t} />
        </Panel>
        <Panel title={t('dashboard.panel.gm_distribution')}>
          <div style={{ padding: 8 }}>
            {Object.entries(margin_histogram).map(([band, info]) => (
              <HistBar
                key={band}
                label={info.range}
                count={info.count}
                color={info.color}
                total={overview.total}
              />
            ))}
          </div>
        </Panel>
      </div>

      {/* Row 3: monthly volume + margin trend (full 12 months, ignores range filter) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <Panel title={t('dashboard.panel.volume_12m')}>
          <VolumeSparkline data={monthly_quotes} t={t} />
        </Panel>
        <Panel title={t('dashboard.panel.margin_trend_12m')}>
          <MarginTrendChart data={margin_trend} t={t} />
        </Panel>
      </div>

      {/* Top customers table with revenue + win rate */}
      <Panel title={t('dashboard.panel.top_customers')}>
        <TopCustomersTable rows={top_customers} t={t} />
      </Panel>
    </div>
  );
}

// ── KPI + Panel ──

function KpiCard({ label, value, sub, tone }) {
  // Tone colors stay as raw hex — success/warn/danger semantic colors
  // read well on both light and dark bg, and the tokens.css system
  // doesn't currently have semantic-tone fg vars distinct from bg.
  const color =
    tone === 'good'
      ? '#16a34a'
      : tone === 'warn'
        ? '#d97706'
        : tone === 'bad'
          ? '#dc2626'
          : 'var(--text-primary)';
  return (
    <div
      style={{
        background: 'var(--surface-card)',
        padding: 16,
        border: '1px solid var(--border-strong)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-secondary)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color,
          marginTop: 8,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-strong)' }}>
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-strong)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Charts ──

function HistBar({ label, count, color, total }) {
  const pctW = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <div style={{ width: 80, fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ flex: 1, height: 14, background: 'var(--surface-subtle)' }}>
        <div
          style={{
            width: `${pctW}%`,
            height: '100%',
            background: color,
            minWidth: count > 0 ? 2 : 0,
          }}
        />
      </div>
      <div
        style={{
          width: 50,
          fontSize: 11,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
          color: 'var(--text-primary)',
        }}
      >
        {count}
      </div>
    </div>
  );
}

function ApprovalFunnel({ funnel, t }) {
  // Ordered from top-of-funnel to terminal; rejected sits beside the
  // main chain since it's a branch, not a progression.
  const main = [
    { key: 'draft', label: t('dashboard.status.draft'), color: '#94a3b8' },
    { key: 'pending_sales', label: t('dashboard.status.pending_sales'), color: '#f59e0b' },
    { key: 'pending_finance', label: t('dashboard.status.pending_finance'), color: '#3b82f6' },
    { key: 'approved', label: t('dashboard.status.approved'), color: '#16a34a' },
  ];
  const rejected = funnel.rejected || 0;
  const max = Math.max(1, ...main.map((s) => funnel[s.key] || 0), rejected);

  return (
    <div style={{ padding: 8 }}>
      {main.map((s) => {
        const n = funnel[s.key] || 0;
        const w = Math.round((n / max) * 100);
        return (
          <div
            key={s.key}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}
          >
            <div style={{ width: 120, fontSize: 11, color: 'var(--text-secondary)' }}>
              {s.label}
            </div>
            <div
              style={{
                flex: 1,
                height: 18,
                background: 'var(--surface-subtle)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  width: `${w}%`,
                  height: '100%',
                  background: s.color,
                  minWidth: n > 0 ? 2 : 0,
                }}
              />
            </div>
            <div
              style={{
                width: 50,
                fontSize: 11,
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'right',
                color: 'var(--text-primary)',
              }}
            >
              {n}
            </div>
          </div>
        );
      })}
      <div
        style={{
          borderTop: '1px dashed var(--border-strong)',
          marginTop: 6,
          paddingTop: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ width: 120, fontSize: 11, color: 'var(--text-secondary)' }}>
          {t('dashboard.status.rejected')}
        </div>
        <div style={{ flex: 1, height: 18, background: 'var(--surface-subtle)' }}>
          <div
            style={{
              width: `${Math.round((rejected / max) * 100)}%`,
              height: '100%',
              background: '#dc2626',
              minWidth: rejected > 0 ? 2 : 0,
            }}
          />
        </div>
        <div
          style={{
            width: 50,
            fontSize: 11,
            fontVariantNumeric: 'tabular-nums',
            textAlign: 'right',
            color: 'var(--text-primary)',
          }}
        >
          {rejected}
        </div>
      </div>
    </div>
  );
}

function VolumeSparkline({ data, t }) {
  // Full-width SVG bar chart. Vertical bars sized by count, with the
  // month label rotated beneath. Grows with container via viewBox.
  const W = 480,
    H = 140,
    PAD_T = 10,
    PAD_B = 28,
    PAD_X = 8;
  const max = Math.max(1, ...data.map((d) => d.count));
  const barW = (W - PAD_X * 2) / data.length;

  if (data.length === 0 || data.every((d) => d.count === 0)) {
    return <EmptyState compact icon="📊" title={t('dashboard.empty.no_volume')} />;
  }

  return (
    <div style={{ padding: 8 }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block' }}
        role="img"
        aria-label="Monthly quote volume"
      >
        {data.map((d, i) => {
          const x = PAD_X + i * barW;
          const h = d.count > 0 ? (d.count / max) * (H - PAD_T - PAD_B) : 1;
          const y = H - PAD_B - h;
          return (
            <g key={d.month}>
              <rect
                x={x + 2}
                y={y}
                width={Math.max(2, barW - 4)}
                height={h}
                fill={d.count > 0 ? 'var(--color-primary)' : 'var(--border-strong)'}
              />
              <text
                x={x + barW / 2}
                y={y - 3}
                fontSize="9"
                textAnchor="middle"
                fill="var(--text-secondary)"
              >
                {d.count || ''}
              </text>
              <text
                x={x + barW / 2}
                y={H - 8}
                fontSize="9"
                textAnchor="middle"
                fill="var(--text-tertiary)"
              >
                {d.month.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MarginTrendChart({ data, t }) {
  // Line chart of avg_gm per month. Null months are rendered as gaps
  // (no segment connects across them), so absence is visible instead
  // of being smoothed away.
  const W = 480,
    H = 140,
    PAD_T = 10,
    PAD_B = 28,
    PAD_X = 30;
  const ys = data.map((d) => d.avg_gm).filter((v) => v != null);
  const hasData = ys.length > 0;

  if (!hasData) {
    return <EmptyState compact icon="📈" title={t('dashboard.empty.no_margin')} />;
  }

  const minGm = Math.min(...ys, 0);
  const maxGm = Math.max(...ys, 0.3); // anchor ceiling to at least 30% so normal margins aren't squashed
  const range = Math.max(0.01, maxGm - minGm);

  const stepX = (W - PAD_X * 2) / Math.max(1, data.length - 1);
  const yOf = (v) => H - PAD_B - ((v - minGm) / range) * (H - PAD_T - PAD_B);
  const xOf = (i) => PAD_X + i * stepX;

  // Build path segments — break the line whenever we hit a null month.
  // Plain computation, not useMemo: xOf/yOf capture closures that change
  // every render anyway, and this runs in microseconds on 12 points.
  const segments = [];
  {
    let cur = [];
    data.forEach((d, i) => {
      if (d.avg_gm == null) {
        if (cur.length > 0) {
          segments.push(cur);
          cur = [];
        }
      } else {
        cur.push({ x: xOf(i), y: yOf(d.avg_gm) });
      }
    });
    if (cur.length > 0) segments.push(cur);
  }

  return (
    <div style={{ padding: 8 }}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block' }}
        role="img"
        aria-label="Monthly average gross margin trend"
      >
        {/* Zero-baseline */}
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={yOf(0)}
          y2={yOf(0)}
          stroke="var(--border-strong)"
          strokeDasharray="3 3"
        />
        <text
          x={PAD_X - 4}
          y={yOf(0) + 3}
          fontSize="8"
          textAnchor="end"
          fill="var(--text-tertiary)"
        >
          0%
        </text>

        {/* 20% threshold line for visual target reference */}
        {maxGm >= 0.2 && (
          <>
            <line
              x1={PAD_X}
              x2={W - PAD_X}
              y1={yOf(0.2)}
              y2={yOf(0.2)}
              stroke="#16a34a"
              strokeDasharray="2 4"
              opacity="0.4"
            />
            <text x={PAD_X - 4} y={yOf(0.2) + 3} fontSize="8" textAnchor="end" fill="#16a34a">
              20%
            </text>
          </>
        )}

        {/* Line segments */}
        {segments.map((seg, idx) => (
          <polyline
            key={idx}
            points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="1.5"
          />
        ))}

        {/* Data points */}
        {data.map((d, i) => {
          if (d.avg_gm == null) return null;
          return (
            <circle
              key={d.month}
              cx={xOf(i)}
              cy={yOf(d.avg_gm)}
              r="2.5"
              fill="var(--color-primary)"
            />
          );
        })}

        {/* X-axis month labels — every 3rd month to avoid clutter */}
        {data.map((d, i) => {
          if (i % 3 !== 0 && i !== data.length - 1) return null;
          return (
            <text
              key={`x-${d.month}`}
              x={xOf(i)}
              y={H - 8}
              fontSize="9"
              textAnchor="middle"
              fill="var(--text-tertiary)"
            >
              {d.month.slice(5)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── Top customers table ──

function TopCustomersTable({ rows, t }) {
  if (!rows || rows.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <EmptyState compact icon="📊" title={t('dashboard.empty.no_customer')} />
      </div>
    );
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
      <thead>
        <tr style={{ background: 'var(--surface-subtle)' }}>
          <th style={thStyle}>{t('dashboard.col.customer')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('dashboard.col.quotes')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('dashboard.col.revenue')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('dashboard.kpi.avg_gm')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('dashboard.col.won_lost')}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{t('dashboard.kpi.win_rate')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c, i) => (
          <tr
            key={c.customer}
            style={{ background: i % 2 ? 'var(--surface-zebra)' : 'var(--surface-card)' }}
          >
            <td style={tdStyle}>{c.customer}</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {fmtInt(c.quote_count)}
            </td>
            <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {c.revenue > 0
                ? c.revenue.toLocaleString('en-US', { maximumFractionDigits: 0 })
                : '—'}
            </td>
            <td
              style={{
                ...tdStyle,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                color: gmClr(c.avg_gm),
              }}
            >
              {pct(c.avg_gm)}
            </td>
            <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ color: '#16a34a' }}>{c.won}</span>
              {' / '}
              <span style={{ color: '#dc2626' }}>{c.lost}</span>
            </td>
            <td
              style={{
                ...tdStyle,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                color:
                  c.win_rate == null
                    ? 'var(--text-tertiary)'
                    : c.win_rate >= 0.6
                      ? '#16a34a'
                      : c.win_rate >= 0.4
                        ? '#d97706'
                        : '#dc2626',
              }}
            >
              {c.win_rate == null ? '—' : pct(c.win_rate)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Styles ──

const thStyle = {
  padding: '10px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  borderBottom: '2px solid var(--border-strong)',
  background: 'var(--surface-subtle)',
};
const tdStyle = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)',
};

// Select is not yet part of the .op-btn system — keep an inline style
// object for it. When a shared <Select> primitive lands (post-9A), this
// moves to className. Phase 9J.3 — tokenized for dark-mode compat.
const selectStyle = {
  background: 'var(--surface-card)',
  border: '1px solid var(--border-strong)',
  padding: '4px 8px',
  fontSize: 12,
  cursor: 'pointer',
  color: 'var(--text-primary)',
  fontFamily: 'inherit',
};
