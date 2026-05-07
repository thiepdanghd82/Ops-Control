/**
 * Dashboard — enterprise KPIs from /api/shared/dashboard.
 *
 * Read-only. Refetches whenever the range selector changes. Range modes:
 *   - preset: All / Last Year / Last 90 / Last 30 (sends ?days=)
 *   - month:  YYYY-MM picker (sends ?month=)
 *   - year:   YYYY picker (sends ?year=)
 *
 * Owns its own scroll because the parent .cost-module sets
 * overflow:hidden — without `.dashboard-root { overflow-y:auto }` the
 * user can't see panels below the fold.
 */
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { api } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../utils/useI18n';
import { pct, fmtInt, gmClr } from '../../../utils/format';
import EmptyState from '../../../components/Shared/EmptyState';
import SkeletonTable from '../../../components/Shared/SkeletonTable';
import { showToast } from '../../../utils/toast';
import './Dashboard.css';

const REFRESH_MS = 60_000;

const PRESET_OPTIONS = [
  { value: 'all', key: 'common.all_time' },
  { value: '365', key: 'common.last_year' },
  { value: '90',  key: 'common.last_90_days' },
  { value: '30',  key: 'common.last_30_days' },
];

const MONTH_LABELS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function buildYearOptions() {
  const now = new Date().getFullYear();
  // 6-year window ending at the current year (covers MoM/YoY comparisons + a buffer).
  return [now - 5, now - 4, now - 3, now - 2, now - 1, now];
}

export default function Dashboard() {
  const { hasRole } = useAuth();
  const { t } = useI18n();

  // Range state — `mode` drives which query param ships to the server.
  const [mode, setMode] = useState('preset');     // 'preset' | 'month' | 'year'
  const [preset, setPreset] = useState('all');    // PRESET_OPTIONS value
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const yearOptions = useMemo(buildYearOptions, []);

  // Build the query string from current range state.
  const buildQs = useCallback(() => {
    if (mode === 'month') {
      const m = String(month).padStart(2, '0');
      return `?month=${year}-${m}`;
    }
    if (mode === 'year') return `?year=${year}`;
    if (preset && preset !== 'all') return `?days=${preset}`;
    return '';
  }, [mode, preset, year, month]);

  const abortRef = useRef(null);
  const load = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true); setErr(null);
    api.get(`/shared/dashboard${buildQs()}`, { signal: ctrl.signal })
      .then(r => { setData(r); setLoading(false); })
      .catch(e => {
        if (e?.name === 'AbortError') return;
        setErr(e.message || 'Failed to load dashboard');
        setLoading(false);
      });
  }, [buildQs]);

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => { load(); }, [mode, preset, year, month]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      loadRef.current();
    };
    const id = setInterval(tick, REFRESH_MS);
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      abortRef.current?.abort();
    };
  }, []);

  const canExport = hasRole('admin');

  const handleExport = useCallback(() => {
    const url = `/api/shared/dashboard/export${buildQs()}`;
    const token = localStorage.getItem('ops_token');
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then(r => {
        if (!r.ok) throw new Error(`Export failed (${r.status})`);
        return r.blob();
      })
      .then(blob => {
        const a = document.createElement('a');
        const href = URL.createObjectURL(blob);
        a.href = href;
        a.download = `ops_dashboard_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(href);
      })
      .catch(e => showToast(e.message || 'Export failed', 'err'));
  }, [buildQs]);

  // Range badge text — shows the active filter in the header subtitle.
  const rangeLabel = useMemo(() => {
    if (mode === 'month') return `${MONTH_LABELS_EN[month - 1]} ${year}`;
    if (mode === 'year')  return String(year);
    const opt = PRESET_OPTIONS.find(o => o.value === preset);
    return opt ? t(opt.key) : t('common.all_time');
  }, [mode, preset, year, month, t]);

  if (loading && !data) return (
    <div className="dashboard-root">
      <div className="dashboard-inner"><SkeletonTable rows={8} cols={4} /></div>
    </div>
  );
  if (err) return (
    <div className="dashboard-root">
      <div className="dashboard-inner">
        <EmptyState
          icon="⚠️"
          title={t('dashboard.err.title')}
          hint={err}
          action={<button onClick={load} className="op-btn op-btn-primary op-btn-sm">{t('common.retry')}</button>}
        />
      </div>
    </div>
  );
  if (!data) return null;

  const {
    overview, win_rate, approval_funnel, top_customers,
    monthly_quotes, margin_trend, margin_histogram, generated_at,
  } = data;

  return (
    <div className="dashboard-root">
      <div className="dashboard-inner">
        {/* Sticky header */}
        <div className="dashboard-head">
          <div className="dashboard-head-left">
            <h2 className="dashboard-title">{t('dashboard.title')}</h2>
            <div className="dashboard-subtitle">
              <span className="dashboard-range-badge">{rangeLabel}</span>
              <span className="dashboard-generated">
                {t('dashboard.generated_at', { ts: new Date(generated_at).toLocaleString() })}
              </span>
            </div>
          </div>

          <div className="dashboard-controls">
            <div className="dashboard-control-group">
              <span className="dashboard-control-label">{t('common.range')}</span>
              <div className="dashboard-segmented" role="tablist" aria-label={t('common.range')}>
                {PRESET_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    role="tab"
                    aria-selected={mode === 'preset' && preset === o.value}
                    className={mode === 'preset' && preset === o.value ? 'is-active' : ''}
                    onClick={() => { setMode('preset'); setPreset(o.value); }}
                  >
                    {t(o.key)}
                  </button>
                ))}
              </div>
            </div>

            <div className="dashboard-control-group">
              <span className="dashboard-control-label">{t('dashboard.range.month')}</span>
              <select
                className="dashboard-select"
                value={month}
                onChange={e => { setMonth(Number(e.target.value)); setMode('month'); }}
                aria-label={t('dashboard.range.month')}
              >
                {MONTH_LABELS_EN.map((lbl, i) => (
                  <option key={i + 1} value={i + 1}>{lbl}</option>
                ))}
              </select>
              <select
                className="dashboard-select"
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                aria-label={t('dashboard.range.year')}
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button
                className={'op-btn op-btn-sm ' + (mode === 'year' ? 'op-btn-primary' : 'op-btn-secondary')}
                onClick={() => setMode(mode === 'year' ? 'month' : 'year')}
                title={t('dashboard.range.full_year_tip')}
              >
                {mode === 'year' ? t('dashboard.range.full_year_on') : t('dashboard.range.full_year_off')}
              </button>
            </div>

            <button onClick={load} className="op-btn op-btn-secondary op-btn-sm" title={t('common.refresh')}>
              ↻ {t('common.refresh')}
            </button>
            {canExport && (
              <button onClick={handleExport} className="op-btn op-btn-primary op-btn-sm" title={t('common.export_csv')}>
                ⇩ {t('common.export_csv')}
              </button>
            )}
          </div>
        </div>

        {/* KPI cards */}
        <div className="dashboard-kpi-grid">
          <KpiCard
            label={t('dashboard.kpi.total_quotes')}
            value={fmtInt(overview.total) === '—' ? '0' : fmtInt(overview.total)}
            sub={`${overview.by_type.standard || 0} std / ${overview.by_type.complex || 0} cplx`}
          />
          <KpiCard
            label={t('dashboard.kpi.win_rate')}
            value={win_rate.rate == null ? '—' : pct(win_rate.rate)}
            tone={win_rate.rate == null ? 'neutral' : win_rate.rate >= 0.6 ? 'good' : win_rate.rate >= 0.4 ? 'warn' : 'bad'}
            sub={t('dashboard.kpi.won_lost', { won: win_rate.won, lost: win_rate.lost })}
          />
          <KpiCard
            label={t('dashboard.kpi.avg_gm')}
            value={pct(overview.avg_gm)}
            tone={overview.avg_gm == null ? 'neutral' : overview.avg_gm >= 0.2 ? 'good' : overview.avg_gm >= 0.1 ? 'warn' : 'bad'}
            sub={`Value-add ${pct(overview.avg_va)}`}
          />
          <KpiCard
            label={t('dashboard.kpi.pending')}
            value={fmtInt(overview.pending_count) === '—' ? '0' : fmtInt(overview.pending_count)}
            tone={overview.pending_count > 10 ? 'warn' : 'neutral'}
            sub={t('dashboard.kpi.draft_count', { n: win_rate.draft })}
          />
        </div>

        {/* Approval funnel + GM histogram */}
        <div className="dashboard-row-2">
          <Panel title={t('dashboard.panel.approval_funnel')}>
            <ApprovalFunnel funnel={approval_funnel} t={t} />
          </Panel>
          <Panel title={t('dashboard.panel.gm_distribution')}>
            <div style={{ padding: 0 }}>
              {Object.entries(margin_histogram).map(([band, info]) => (
                <HistBar key={band} label={info.range} count={info.count} color={info.color} total={overview.total} />
              ))}
            </div>
          </Panel>
        </div>

        {/* Volume + margin trend (always last 12 months — independent of filter) */}
        <div className="dashboard-row-2">
          <Panel title={t('dashboard.panel.volume_12m')} hint={t('dashboard.panel.fixed_12m_hint')}>
            <VolumeSparkline data={monthly_quotes} t={t} />
          </Panel>
          <Panel title={t('dashboard.panel.margin_trend_12m')} hint={t('dashboard.panel.fixed_12m_hint')}>
            <MarginTrendChart data={margin_trend} t={t} />
          </Panel>
        </div>

        {/* Top customers */}
        <div className="dashboard-row-1">
          <Panel title={t('dashboard.panel.top_customers')} bodyPad={false}>
            <TopCustomersTable rows={top_customers} t={t} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── KPI + Panel ──

function KpiCard({ label, value, sub, tone = 'neutral' }) {
  return (
    <div className={`dashboard-kpi tone-${tone}`}>
      <div className="dashboard-kpi-label">{label}</div>
      <div className={`dashboard-kpi-value tone-${tone}`}>{value}</div>
      {sub && <div className="dashboard-kpi-sub">{sub}</div>}
    </div>
  );
}

function Panel({ title, hint, bodyPad = true, children }) {
  return (
    <div className="dashboard-panel">
      <div className="dashboard-panel-head">
        <span>{title}</span>
        {hint && <span className="hint">{hint}</span>}
      </div>
      {bodyPad ? <div className="dashboard-panel-body">{children}</div> : children}
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
        <div style={{ width: `${pctW}%`, height: '100%', background: color, minWidth: count > 0 ? 2 : 0 }} />
      </div>
      <div style={{ width: 50, fontSize: 11, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: 'var(--text-primary)' }}>{count}</div>
    </div>
  );
}

function ApprovalFunnel({ funnel, t }) {
  const main = [
    { key: 'draft',           label: t('dashboard.status.draft'),           color: '#94a3b8' },
    { key: 'pending_sales',   label: t('dashboard.status.pending_sales'),   color: '#f59e0b' },
    { key: 'pending_finance', label: t('dashboard.status.pending_finance'), color: '#3b82f6' },
    { key: 'approved',        label: t('dashboard.status.approved'),        color: '#16a34a' },
  ];
  const rejected = funnel.rejected || 0;
  const max = Math.max(1, ...main.map(s => funnel[s.key] || 0), rejected);

  return (
    <div>
      {main.map(s => {
        const n = funnel[s.key] || 0;
        const w = Math.round((n / max) * 100);
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
            <div style={{ width: 120, fontSize: 11, color: 'var(--text-secondary)' }}>{s.label}</div>
            <div style={{ flex: 1, height: 18, background: 'var(--surface-subtle)', position: 'relative' }}>
              <div style={{ width: `${w}%`, height: '100%', background: s.color, minWidth: n > 0 ? 2 : 0 }} />
            </div>
            <div style={{ width: 50, fontSize: 11, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: 'var(--text-primary)' }}>{n}</div>
          </div>
        );
      })}
      <div style={{ borderTop: '1px dashed var(--border-strong)', marginTop: 6, paddingTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 120, fontSize: 11, color: 'var(--text-secondary)' }}>{t('dashboard.status.rejected')}</div>
        <div style={{ flex: 1, height: 18, background: 'var(--surface-subtle)' }}>
          <div style={{ width: `${Math.round((rejected / max) * 100)}%`, height: '100%', background: '#dc2626', minWidth: rejected > 0 ? 2 : 0 }} />
        </div>
        <div style={{ width: 50, fontSize: 11, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: 'var(--text-primary)' }}>{rejected}</div>
      </div>
    </div>
  );
}

function VolumeSparkline({ data, t }) {
  const W = 480, H = 140, PAD_T = 10, PAD_B = 28, PAD_X = 8;
  const max = Math.max(1, ...data.map(d => d.count));
  const barW = (W - PAD_X * 2) / data.length;

  if (data.length === 0 || data.every(d => d.count === 0)) {
    return <EmptyState compact icon="📊" title={t('dashboard.empty.no_volume')} />;
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label="Monthly quote volume">
      {data.map((d, i) => {
        const x = PAD_X + i * barW;
        const h = d.count > 0 ? (d.count / max) * (H - PAD_T - PAD_B) : 1;
        const y = H - PAD_B - h;
        return (
          <g key={d.month}>
            <rect x={x + 2} y={y} width={Math.max(2, barW - 4)} height={h} fill={d.count > 0 ? 'var(--color-primary)' : 'var(--border-strong)'} />
            <text x={x + barW / 2} y={y - 3} fontSize="9" textAnchor="middle" fill="var(--text-secondary)">{d.count || ''}</text>
            <text x={x + barW / 2} y={H - 8} fontSize="9" textAnchor="middle" fill="var(--text-tertiary)">{d.month.slice(5)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function MarginTrendChart({ data, t }) {
  const W = 480, H = 140, PAD_T = 10, PAD_B = 28, PAD_X = 30;
  const ys = data.map(d => d.avg_gm).filter(v => v != null);
  const hasData = ys.length > 0;

  if (!hasData) {
    return <EmptyState compact icon="📈" title={t('dashboard.empty.no_margin')} />;
  }

  const minGm = Math.min(...ys, 0);
  const maxGm = Math.max(...ys, 0.3);
  const range = Math.max(0.01, maxGm - minGm);

  const stepX = (W - PAD_X * 2) / Math.max(1, data.length - 1);
  const yOf = (v) => H - PAD_B - ((v - minGm) / range) * (H - PAD_T - PAD_B);
  const xOf = (i) => PAD_X + i * stepX;

  const segments = [];
  {
    let cur = [];
    data.forEach((d, i) => {
      if (d.avg_gm == null) {
        if (cur.length > 0) { segments.push(cur); cur = []; }
      } else {
        cur.push({ x: xOf(i), y: yOf(d.avg_gm) });
      }
    });
    if (cur.length > 0) segments.push(cur);
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img" aria-label="Monthly average gross margin trend">
      <line x1={PAD_X} x2={W - PAD_X} y1={yOf(0)} y2={yOf(0)} stroke="var(--border-strong)" strokeDasharray="3 3" />
      <text x={PAD_X - 4} y={yOf(0) + 3} fontSize="8" textAnchor="end" fill="var(--text-tertiary)">0%</text>

      {maxGm >= 0.2 && (
        <>
          <line x1={PAD_X} x2={W - PAD_X} y1={yOf(0.2)} y2={yOf(0.2)} stroke="#16a34a" strokeDasharray="2 4" opacity="0.4" />
          <text x={PAD_X - 4} y={yOf(0.2) + 3} fontSize="8" textAnchor="end" fill="#16a34a">20%</text>
        </>
      )}

      {segments.map((seg, idx) => (
        <polyline key={idx} points={seg.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" />
      ))}

      {data.map((d, i) => {
        if (d.avg_gm == null) return null;
        return <circle key={d.month} cx={xOf(i)} cy={yOf(d.avg_gm)} r="2.5" fill="var(--color-primary)" />;
      })}

      {data.map((d, i) => {
        if (i % 3 !== 0 && i !== data.length - 1) return null;
        return <text key={`x-${d.month}`} x={xOf(i)} y={H - 8} fontSize="9" textAnchor="middle" fill="var(--text-tertiary)">{d.month.slice(5)}</text>;
      })}
    </svg>
  );
}

// ── Top customers ──

function TopCustomersTable({ rows, t }) {
  if (!rows || rows.length === 0) {
    return <div style={{ padding: 16 }}><EmptyState compact icon="📊" title={t('dashboard.empty.no_customer')} /></div>;
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
          <tr key={c.customer} style={{ background: i % 2 ? 'var(--surface-zebra)' : 'var(--surface-card)' }}>
            <td style={tdStyle}>{c.customer}</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtInt(c.quote_count)}</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {c.revenue > 0 ? c.revenue.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
            </td>
            <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: gmClr(c.avg_gm) }}>
              {pct(c.avg_gm)}
            </td>
            <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ color: '#16a34a' }}>{c.won}</span>
              {' / '}
              <span style={{ color: '#dc2626' }}>{c.lost}</span>
            </td>
            <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: c.win_rate == null ? 'var(--text-tertiary)' : c.win_rate >= 0.6 ? '#16a34a' : c.win_rate >= 0.4 ? '#d97706' : '#dc2626' }}>
              {c.win_rate == null ? '—' : pct(c.win_rate)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const thStyle = {
  padding: '10px', textAlign: 'left', fontSize: 11, fontWeight: 600,
  color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4,
  borderBottom: '2px solid var(--border-strong)', background: 'var(--surface-subtle)',
};
const tdStyle = { padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' };
