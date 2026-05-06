/**
 * QuoteAnalysis — VP Dashboard (Monthly RFQ Report)
 *
 * Sprint 1.7d redesign — IBM Carbon Design / SAP Fiori object-page /
 * IFS Cloud Aurena pattern. Replaces the previous gradient-heavy
 * "executive dashboard" look with a dense, flat, audit-defensible
 * enterprise layout:
 *   - Object-page header with breadcrumb + action toolbar
 *   - Compact filter bar (period, site, npi owner) — applied immediately
 *   - KPI tiles with month-over-month delta arrows (↑ green / ↓ red)
 *   - Section panels (white card, thin top accent, no gradient chrome)
 *   - Click-through drill-down: clicking a customer / process / month
 *     filters the page
 *
 * Functional baseline matches COST V1.0 M08 renderQuoteAnalysis.
 * IBM Plex Sans typography assumed (loaded globally in tokens.css).
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { sharedApi } from '../../../services/api';
import './QuoteAnalysis.css';

function qaFmt(v) {
  return (v / 1000).toFixed(1);
}
function qaPct(v) {
  return (v * 100).toFixed(1) + '%';
}
function qaPctRaw(v) {
  return (v * 100).toFixed(1);
}
function qaGmClr(v) {
  if (v == null) return 'var(--qa-neutral)';
  return v >= 0.2 ? 'var(--qa-positive)' : v >= 0.1 ? 'var(--qa-warning)' : 'var(--qa-negative)';
}

// Mid-MOQ tier — same convention as COST V1.0: revenue estimate uses
// the middle pricing tier so a 1k MOQ at $5 doesn't dwarf a 100k MOQ
// at $0.10. Picks index floor((n-1)/2) over [base, ...extras].
function qaMidTier(q) {
  const st = q.state || {};
  const base = { moq: st.moq || 0, sp: st.selling_price || 0 };
  const extras = (st.extra_moqs || []).map((e) => ({ moq: e.moq || 0, sp: e.price || 0 }));
  const tiers = [base, ...extras];
  const midIdx = Math.floor((tiers.length - 1) / 2);
  return tiers[midIdx];
}

function qaRevenue(q) {
  const t = qaMidTier(q);
  return t.sp * t.moq;
}

function qaPrimaryProcess(q) {
  return (q.state?.design_process || '').trim() || 'Not updated';
}

function qaMonthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const names = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return (names[parseInt(m) - 1] || m) + ' ' + y;
}

function prevMonth(ym) {
  if (!ym) return null;
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// S-RESP-1 (2026-05-06) — preset period descriptors. Driven by the
// 7-chip toolbar; resolveRange() turns each descriptor into a closed
// [from, to] YYYY-MM range that the filter predicate consumes. Pure
// — no side effects, no Date.now(); pass `today` so tests are stable.
const PERIOD_PRESETS = [
  { id: 'all', label: 'All time', vi: 'Tất cả' },
  { id: 'thisMonth', label: 'This month', vi: 'Tháng này' },
  { id: 'lastMonth', label: 'Last month', vi: 'Tháng trước' },
  { id: 'qtd', label: 'QTD', vi: 'Từ đầu quý' },
  { id: 'ytd', label: 'YTD', vi: 'Từ đầu năm' },
  { id: 'last90', label: 'Last 90 days', vi: '90 ngày' },
  { id: 'last12', label: 'Last 12 months', vi: '12 tháng' },
];

function ymOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function resolveRange(period, today = new Date()) {
  if (!period || period.kind === 'all') return null;
  if (period.kind === 'singleMonth') return { from: period.month, to: period.month };
  if (period.kind === 'custom') {
    if (!period.from || !period.to) return null;
    return period.from <= period.to
      ? { from: period.from, to: period.to }
      : { from: period.to, to: period.from };
  }
  if (period.kind === 'thisMonth') return { from: ymOf(today), to: ymOf(today) };
  if (period.kind === 'lastMonth') {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { from: ymOf(d), to: ymOf(d) };
  }
  if (period.kind === 'qtd') {
    const qStart = Math.floor(today.getMonth() / 3) * 3;
    return { from: ymOf(new Date(today.getFullYear(), qStart, 1)), to: ymOf(today) };
  }
  if (period.kind === 'ytd') {
    return { from: ymOf(new Date(today.getFullYear(), 0, 1)), to: ymOf(today) };
  }
  if (period.kind === 'last90') {
    const d = new Date(today);
    d.setDate(d.getDate() - 90);
    return { from: ymOf(d), to: ymOf(today) };
  }
  if (period.kind === 'last12') {
    const d = new Date(today.getFullYear(), today.getMonth() - 11, 1);
    return { from: ymOf(d), to: ymOf(today) };
  }
  return null;
}

function periodLabelOf(period) {
  if (!period || period.kind === 'all') return 'All time';
  if (period.kind === 'singleMonth') return qaMonthLabel(period.month);
  if (period.kind === 'custom') {
    return `${qaMonthLabel(period.from)} → ${qaMonthLabel(period.to)}`;
  }
  const preset = PERIOD_PRESETS.find((p) => p.id === period.kind);
  return preset?.label || '—';
}

// Compute summary KPIs for a quote slice — reused for current + prev month
// so the delta arrows stay symmetric.
function computeKpis(quotes) {
  const totalParts = quotes.length;
  const totalRev = quotes.reduce((s, q) => s + qaRevenue(q), 0);
  const stdCount = quotes.filter((q) => q.type === 'standard').length;
  const cplxCount = quotes.filter((q) => q.type === 'complex').length;
  const validGM = quotes.filter((q) => q.result?.gm != null);
  const avgGM = validGM.length
    ? validGM.reduce((s, q) => s + q.result.gm, 0) / validGM.length
    : null;
  const validVA = quotes.filter((q) => q.result?.va != null);
  const avgVA = validVA.length
    ? validVA.reduce((s, q) => s + q.result.va, 0) / validVA.length
    : null;
  return {
    totalParts,
    totalRev,
    stdCount,
    cplxCount,
    avgGM,
    avgVA,
    validGMCount: validGM.length,
    validVACount: validVA.length,
  };
}

// S-DESIGN-1 — Smart KPI delta. Conditional render:
//   - hide when prev is null/0 (no anchor → "↑6300%" type vanity)
//   - hide when |Δ| < 1% relative (or < 0.5pp absolute) — within noise
// Polarity decides delta-pill color:
//   - 'higher_better' (revenue, GM, VA): up=green, down=red
//   - 'lower_better'  (lead time, defect rate): up=red, down=green
//   - 'neutral'       (count metrics — total parts, active rfqs):
//                     gray pill regardless of direction
function shouldShowDelta(now, prev, unit) {
  if (now == null || prev == null) return false;
  if (unit === 'pp') {
    const ppDiff = (now - prev) * 100;
    return Math.abs(ppDiff) >= 0.5;
  }
  if (!(prev > 0)) return false;
  return Math.abs((now - prev) / prev) >= 0.01;
}

function Delta({ now, prev, unit, polarity = 'neutral' }) {
  if (!shouldShowDelta(now, prev, unit)) return null;
  const diff = unit === 'pp' ? (now - prev) * 100 : ((now - prev) / Math.abs(prev || 1)) * 100;
  const sign = diff > 0 ? '↑' : '↓';
  const suffix = unit === 'pp' ? 'pp' : '%';
  let cls = 'qa-delta-neutral';
  if (polarity === 'higher_better') cls = diff > 0 ? 'qa-delta-up' : 'qa-delta-down';
  else if (polarity === 'lower_better') cls = diff < 0 ? 'qa-delta-up' : 'qa-delta-down';
  return (
    <span className={`qa-delta ${cls}`}>
      {sign} {Math.abs(diff).toFixed(1)}
      {suffix}
    </span>
  );
}

// Smart sparkline gate — only render when we have a real trend
// (≥4 non-null points). Below that the "trend" is mostly noise and
// adds visual weight without insight.
function hasSparklineData(values) {
  if (!values || values.length < 4) return false;
  return values.filter((v) => v != null && v !== 0).length >= 4;
}

// Tile tone — Dashboard convention. Drives the 3px left-rail color.
// GM has hard thresholds (industry-known); other metrics stay neutral.
function toneOfGM(v) {
  if (v == null) return 'neutral';
  return v >= 0.2 ? 'good' : v >= 0.1 ? 'warn' : 'bad';
}

// Reusable section panel. `headRight` is for actions/segmented controls
// that belong on the title bar (replaces the older `badge` slot for
// rich content; badge still works for plain counters).
function Section({ title, subtitle, badge, accent = 'blue', headRight, children }) {
  return (
    <section className={`qa-section qa-accent-${accent}`}>
      <header className="qa-section-head">
        <div className="qa-section-titles">
          <h3 className="qa-section-title">{title}</h3>
          {subtitle && <span className="qa-section-sub">{subtitle}</span>}
        </div>
        {headRight}
        {badge != null && <span className="qa-section-badge">{badge}</span>}
      </header>
      <div className="qa-section-body">{children}</div>
    </section>
  );
}

// Compact GM% distribution — one horizontal stacked bar with inline
// legend. Replaces the previous 4-row table; same data, far less ink.
function GmStackBar({ buckets, total }) {
  const tones = {
    '≥ 20%': 'positive',
    '10–19%': 'warning',
    '< 10%': 'negative',
    'No price': 'neutral',
  };
  if (total === 0) {
    return <div className="qa-gm-empty">No parts to bucket</div>;
  }
  return (
    <div className="qa-gm">
      <div className="qa-gm-bar" role="img" aria-label="Gross margin distribution">
        {buckets.map(([label, cnt]) => {
          if (cnt === 0) return null;
          const w = (cnt / total) * 100;
          return (
            <div
              key={label}
              className={`qa-gm-seg qa-tone-${tones[label]}`}
              style={{ width: `${w}%` }}
              title={`${label}: ${cnt} (${w.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <ul className="qa-gm-legend">
        {buckets.map(([label, cnt]) => {
          const w = total > 0 ? (cnt / total) * 100 : 0;
          return (
            <li key={label} className={`qa-gm-leg qa-bucket-${tones[label]}`}>
              <span className={`qa-bucket-dot qa-tone-${tones[label]}`} />
              <span className="qa-gm-leg-label">{label}</span>
              <span className="qa-gm-leg-val">{cnt}</span>
              <span className="qa-gm-leg-pct">{w.toFixed(0)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Bar cell — same role as before (label + tiny progress bar) but
// flatter visual, square edges, Carbon spacing.
function BarCell({ label, value, total, tone = 'blue', bold }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="qa-barcell">
      <div className={`qa-barcell-label ${bold ? 'qa-barcell-bold' : ''}`}>{label}</div>
      <div className="qa-barcell-track">
        <div className={`qa-barcell-fill qa-tone-${tone}`} style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}

// Sparkline — inline SVG mini chart for KPI tiles. Carbon convention:
// muted fill + accent stroke, no axis, no labels. S-DESIGN-1: gated by
// hasSparklineData() at the call site so this never renders on a thin
// slice (1-3 points = noise, not a trend).
function Sparkline({ values, accent = 'blue', height = 28 }) {
  if (!hasSparklineData(values)) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = 80;
  const stepX = w / (values.length - 1);
  const points = values
    .map(
      (v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`
    )
    .join(' ');
  const fillPoints = `0,${height} ${points} ${w},${height}`;
  return (
    <svg
      className={`qa-sparkline qa-sparkline-${accent}`}
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={fillPoints} className="qa-sparkline-fill" />
      <polyline points={points} className="qa-sparkline-line" />
    </svg>
  );
}

export default function QuoteAnalysis() {
  const [quoteHistory, setQuoteHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  // S-RESP-1 — `period` is the new authoritative filter. `selectedMonth`
  // stays as a derived legacy mirror for the trend-row click-through
  // (Sprint 1.7d) so existing handlers keep working without rewrites.
  // Default 'all' so first paint shows the full dataset (was: newest
  // month only — confused operators auditing a fresh install).
  const [period, setPeriod] = useState({ kind: 'all' });
  const [customOpen, setCustomOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  // S-RESP-1 — sticky filterbar pin detection. The bar is always
  // sticky via CSS; this just adds a class for the shadow-on-pin
  // effect (Carbon "Tearsheet" pattern). IntersectionObserver on a
  // 1px sentinel placed BEFORE the bar — when sentinel scrolls out,
  // bar is pinned. Cheaper than a scroll listener.
  const filterbarRef = useRef(null);
  const sentinelRef = useRef(null);
  useEffect(() => {
    const bar = filterbarRef.current;
    const sentinel = sentinelRef.current;
    if (!bar || !sentinel || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      ([entry]) => bar.classList.toggle('is-pinned', !entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, []);
  // Sprint 1.7d — Fiori-style filter bar. Filters apply across the
  // whole page (cards + tables) so a CFO can pivot to "Sales East →
  // April → Process X" with three dropdowns.
  const [filterSite, setFilterSite] = useState('all');
  const [filterNpi, setFilterNpi] = useState('all');
  // Sprint S-QA-CONSOL (2026-05-03) — operator pivots between three
  // breakdown views (Customer / Process / NPI) inside a single panel
  // instead of staring at three near-identical tables side-by-side.
  // Same data, less visual noise.
  const [breakdownView, setBreakdownView] = useState('customer');
  const [breakdownMetric, setBreakdownMetric] = useState('revenue'); // 'revenue' | 'parts'

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const d = await sharedApi.getQuotes();
      setQuoteHistory(Array.isArray(d) ? d : []);
    } catch (err) {
      console.error('Failed to load quote history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Distinct months in the dataset, newest first.
  const allMonths = useMemo(
    () =>
      [...new Set(quoteHistory.map((q) => (q.saved_at || '').slice(0, 7)).filter(Boolean))]
        .sort()
        .reverse(),
    [quoteHistory]
  );

  useEffect(() => {
    if (allMonths.length > 0 && (!selectedMonth || !allMonths.includes(selectedMonth))) {
      setSelectedMonth(allMonths[0]);
    }
  }, [allMonths, selectedMonth]);

  // S-RESP-1 — resolve the period descriptor to a [from, to] window
  // every render. Memoise so identical periods don't re-trigger downstream
  // useMemos that depend on `range`.
  const range = useMemo(() => resolveRange(period), [period]);

  // Distinct sites + npi owners across the WHOLE dataset (not the
  // month slice) so picking a less-active site doesn't strand the
  // dropdown with no options.
  const allSites = useMemo(
    () =>
      [
        'all',
        ...new Set(quoteHistory.map((q) => (q.state?.site || '').trim()).filter(Boolean)),
      ].sort(),
    [quoteHistory]
  );
  const allNpis = useMemo(
    () =>
      [
        'all',
        ...new Set(
          quoteHistory.map((q) => (q.npi_owner || q.state?.npi_owner || '').trim()).filter(Boolean)
        ),
      ].sort(),
    [quoteHistory]
  );

  // S-RESP-1 — apply a YYYY-MM range slice + site/owner filters.
  // `r` may be null (= 'All time' — no range filter applied).
  function applyFilters(quotes, r) {
    return quotes.filter((q) => {
      const ym = (q.saved_at || '').slice(0, 7);
      if (r && (!ym || ym < r.from || ym > r.to)) return false;
      if (filterSite !== 'all' && (q.state?.site || '').trim() !== filterSite) return false;
      if (filterNpi !== 'all' && (q.npi_owner || q.state?.npi_owner || '').trim() !== filterNpi)
        return false;
      return true;
    });
  }

  const mq = useMemo(
    () => applyFilters(quoteHistory, range),
    [quoteHistory, range, filterSite, filterNpi]
  );
  // Delta arrows only meaningful when the period is a single month
  // (then "prev" = previous calendar month). For ranges (QTD/YTD/last90/
  // last12/custom) we skip delta — same-length-window comparison would
  // be misleading for QTD (partial quarter vs full prev quarter, etc.).
  const prevMq = useMemo(() => {
    const isSingle = range && range.from === range.to;
    if (!isSingle) return [];
    const pm = prevMonth(range.from);
    if (!pm) return [];
    return applyFilters(quoteHistory, { from: pm, to: pm });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteHistory, range, filterSite, filterNpi]);

  const kpis = useMemo(() => computeKpis(mq), [mq]);
  const prevKpis = useMemo(() => computeKpis(prevMq), [prevMq]);

  // Single grouping engine — `view` decides the bucketing key, `metric`
  // decides whether we sum revenue or count parts. Replaces the 3
  // bespoke memo blocks (topCustomers, procRevRows, npiRows) the page
  // used to stack vertically; the user toggles between them in one
  // panel now.
  const buildGroups = useCallback((quotes, view, metric) => {
    const keyOf = (q) => {
      if (view === 'customer') return (q.state?.direct_cu || '').trim() || 'Unknown';
      if (view === 'process') return qaPrimaryProcess(q);
      return (q.npi_owner || q.state?.npi_owner || '—').trim() || '—';
    };
    const valOf = (q) => (metric === 'parts' ? 1 : qaRevenue(q));
    const map = {};
    quotes.forEach((q) => {
      const k = keyOf(q);
      map[k] = (map[k] || 0) + valOf(q);
    });
    const rows = Object.entries(map).sort((a, b) => b[1] - a[1]);
    // Customer view caps to 9 + 'Other' bucket so a long tail of
    // one-off customers doesn't push monthly trend off-screen.
    if (view === 'customer' && rows.length > 9) {
      const top9 = rows.slice(0, 9);
      const otherRev = rows.slice(9).reduce((s, r) => s + r[1], 0);
      if (otherRev > 0) top9.push(['Other', otherRev]);
      return top9;
    }
    return rows;
  }, []);

  const breakdownRows = useMemo(
    () => buildGroups(mq, breakdownView, breakdownMetric),
    [mq, breakdownView, breakdownMetric, buildGroups]
  );
  const breakdownTotal = useMemo(
    () => breakdownRows.reduce((s, r) => s + r[1], 0),
    [breakdownRows]
  );

  // GM Distribution — kept as a separate widget but now rendered as a
  // single horizontal stacked bar (more compact than a 4-row table).
  const gmBuckets = useMemo(() => {
    const buckets = { '≥ 20%': 0, '10–19%': 0, '< 10%': 0, 'No price': 0 };
    mq.forEach((q) => {
      const gm = q.result?.gm;
      if (gm == null) buckets['No price']++;
      else if (gm >= 0.2) buckets['≥ 20%']++;
      else if (gm >= 0.1) buckets['10–19%']++;
      else buckets['< 10%']++;
    });
    return Object.entries(buckets);
  }, [mq]);

  // 12-month trend for the sparklines on KPI tiles + the trend table.
  const trendData = useMemo(() => {
    const months = [
      ...new Set(quoteHistory.map((q) => (q.saved_at || '').slice(0, 7)).filter(Boolean)),
    ]
      .sort()
      .slice(-12);
    const rows = months.map((m) => {
      const qs = applyFilters(quoteHistory, m);
      const k = computeKpis(qs);
      return { month: m, ...k };
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteHistory, filterSite, filterNpi]);

  const trendLast6 = trendData.slice(-6).reverse();
  const sparkRev = trendData.slice(-6).map((r) => r.totalRev);
  const sparkParts = trendData.slice(-6).map((r) => r.totalParts);
  const sparkGM = trendData.slice(-6).map((r) => r.avgGM ?? 0);
  const sparkVA = trendData.slice(-6).map((r) => r.avgVA ?? 0);

  if (loading) {
    return <div className="qa qa-loading">Loading Quote Analysis…</div>;
  }

  const { totalParts, totalRev, stdCount, cplxCount, avgGM, avgVA, validGMCount } = kpis;

  const periodLabel = periodLabelOf(period);

  return (
    <div className="qa">
      <div className="qa-inner">
        {/* S-RESP-1 — 1px sentinel for the IntersectionObserver. When
          this scrolls out of view, the filterbar gets `is-pinned`. */}
        <div ref={sentinelRef} className="qa-filterbar-sentinel" aria-hidden="true" />

        {/* ── Filterbar — sticky on scroll (S-RESP-1). Period picker is
            now a chip toolbar + Custom… modal; site/owner stay as
            <select>. Wrapping div carries `is-pinned` class when
            scrolled past — IntersectionObserver toggles it (see effect). */}
        <div className="qa-filterbar" ref={filterbarRef}>
          <div className="qa-toolbar">
            <div className="qa-toolbar-filters">
              <PeriodPicker
                period={period}
                onChange={setPeriod}
                onOpenCustom={() => setCustomOpen(true)}
                allMonths={allMonths}
              />
              <label className="qa-filter">
                <span className="qa-filter-lbl">Site</span>
                <select
                  value={filterSite}
                  onChange={(e) => setFilterSite(e.target.value)}
                  className="qa-filter-input"
                >
                  {allSites.map((s) => (
                    <option key={s} value={s}>
                      {s === 'all' ? 'All sites' : s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="qa-filter">
                <span className="qa-filter-lbl">NPI Owner</span>
                <select
                  value={filterNpi}
                  onChange={(e) => setFilterNpi(e.target.value)}
                  className="qa-filter-input"
                >
                  {allNpis.map((n) => (
                    <option key={n} value={n}>
                      {n === 'all' ? 'All owners' : n}
                    </option>
                  ))}
                </select>
              </label>
              {(filterSite !== 'all' || filterNpi !== 'all') && (
                <button
                  type="button"
                  className="qa-filter-reset"
                  onClick={() => {
                    setFilterSite('all');
                    setFilterNpi('all');
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="qa-toolbar-meta">
              <span className="qa-toolbar-count">
                <strong>{totalParts}</strong> part{totalParts !== 1 ? 's' : ''} ·{' '}
                <span className="qa-toolbar-period">{periodLabel || '—'}</span>
              </span>
              <span className="qa-toolbar-note">est. revenue uses mid-MOQ tier</span>
              <span className="qa-toolbar-spacer" />
              <button
                type="button"
                className="qa-btn qa-btn-ghost"
                onClick={loadData}
                title="Re-fetch quote history"
              >
                ↻ Refresh
              </button>
              <button
                type="button"
                className="qa-btn qa-btn-ghost"
                onClick={() => window.print()}
                title="Print this report"
              >
                🖨 Print
              </button>
            </div>
          </div>
        </div>
        {/* /qa-filterbar */}

        {/* ── KPI tile strip — Smart KPI pattern (S-DESIGN-1).
            • Tile tone follows Dashboard (good/warn/bad/neutral, drives
              3px left rail). Removed decorative qa-kpi-primary/cyan/
              neutral variants — operator metrics > brand colors.
            • <Delta/> hides itself when prev=0 or |Δ|<1%.
            • <Sparkline/> hides itself when fewer than 4 points.
            • qa-kpi-v2 marker class — bundle grep target. */}
        <div className="qa-kpis-container">
          <div className="qa-kpis">
            <article className="qa-kpi qa-kpi-v2 qa-kpi-tone-neutral">
              <div className="qa-kpi-row">
                <span className="qa-kpi-label">Total Parts</span>
                <Delta now={totalParts} prev={prevKpis.totalParts} unit="pct" polarity="neutral" />
              </div>
              <div className="qa-kpi-val">{totalParts.toLocaleString()}</div>
              <div className="qa-kpi-row qa-kpi-foot">
                <span className="qa-kpi-sub">
                  {stdCount} std · {cplxCount} cplx
                </span>
                <Sparkline values={sparkParts} accent="blue" />
              </div>
            </article>

            <article className="qa-kpi qa-kpi-v2 qa-kpi-tone-neutral">
              <div className="qa-kpi-row">
                <span className="qa-kpi-label">Estimated Revenue</span>
                <Delta
                  now={totalRev}
                  prev={prevKpis.totalRev}
                  unit="pct"
                  polarity="higher_better"
                />
              </div>
              <div className="qa-kpi-val">
                {qaFmt(totalRev)} <span className="qa-kpi-unit">k.CAD</span>
              </div>
              <div className="qa-kpi-row qa-kpi-foot">
                <span className="qa-kpi-sub">
                  {prevKpis.totalRev > 0
                    ? `vs ${qaFmt(prevKpis.totalRev)}k prev mo`
                    : 'no prev period'}
                </span>
                <Sparkline values={sparkRev} accent="primary" />
              </div>
            </article>

            <article className={`qa-kpi qa-kpi-v2 qa-kpi-tone-${toneOfGM(avgGM)}`}>
              <div className="qa-kpi-row">
                <span className="qa-kpi-label">Avg GM%</span>
                <Delta now={avgGM} prev={prevKpis.avgGM} unit="pp" polarity="higher_better" />
              </div>
              <div className="qa-kpi-val">{avgGM != null ? qaPct(avgGM) : '—'}</div>
              <div className="qa-kpi-row qa-kpi-foot">
                <span className="qa-kpi-sub">
                  {validGMCount} priced of {totalParts}
                </span>
                <Sparkline
                  values={sparkGM}
                  accent={
                    avgGM != null && avgGM >= 0.2
                      ? 'positive'
                      : avgGM != null && avgGM >= 0.1
                        ? 'warning'
                        : 'negative'
                  }
                />
              </div>
            </article>

            <article className="qa-kpi qa-kpi-v2 qa-kpi-tone-neutral">
              <div className="qa-kpi-row">
                <span className="qa-kpi-label">Avg VA%</span>
                <Delta now={avgVA} prev={prevKpis.avgVA} unit="pp" polarity="higher_better" />
              </div>
              <div className="qa-kpi-val">{avgVA != null ? qaPct(avgVA) : '—'}</div>
              <div className="qa-kpi-row qa-kpi-foot">
                <span className="qa-kpi-sub">value-add ratio</span>
                <Sparkline values={sparkVA} accent="cyan" />
              </div>
            </article>
          </div>
        </div>
        {/* /qa-kpis-container */}

        {/* ── Body grid — sections in IBM Carbon flat style ──────── */}
        <div className="qa-body">
          {totalParts === 0 ? (
            <div className="qa-empty">
              <div className="qa-empty-icon">∅</div>
              <h2 className="qa-empty-title">No quotes for {periodLabel}</h2>
              <p className="qa-empty-sub">
                {filterSite !== 'all' || filterNpi !== 'all'
                  ? 'Try clearing the site/owner filters or pick a different month.'
                  : 'Pick a different month from the filter bar above, or save quotes from the Standard / Complex calculator.'}
              </p>
            </div>
          ) : (
            <>
              {/* Single consolidated breakdown panel + compact GM strip.
                Replaces 4 stacked tables with one pivot table + 1 sidecar. */}
              <div className="qa-grid qa-grid-breakdown">
                <Section
                  title="Breakdown"
                  subtitle={
                    breakdownView === 'customer'
                      ? 'top revenue contributors'
                      : breakdownView === 'process'
                        ? 'by primary design process'
                        : 'by NPI owner'
                  }
                  accent="blue"
                  headRight={
                    <div className="qa-pivot">
                      <div
                        className="qa-pivot-group"
                        role="tablist"
                        aria-label="Group breakdown by"
                      >
                        {[
                          { v: 'customer', l: 'Customer' },
                          { v: 'process', l: 'Process' },
                          { v: 'npi', l: 'NPI Owner' },
                        ].map((o) => (
                          <button
                            key={o.v}
                            role="tab"
                            aria-selected={breakdownView === o.v}
                            className={`qa-pivot-btn ${breakdownView === o.v ? 'is-active' : ''}`}
                            onClick={() => setBreakdownView(o.v)}
                          >
                            {o.l}
                          </button>
                        ))}
                      </div>
                      <div
                        className="qa-pivot-group qa-pivot-group-sm"
                        role="tablist"
                        aria-label="Metric"
                      >
                        {[
                          { v: 'revenue', l: 'k.CAD' },
                          { v: 'parts', l: 'Parts' },
                        ].map((o) => (
                          <button
                            key={o.v}
                            role="tab"
                            aria-selected={breakdownMetric === o.v}
                            className={`qa-pivot-btn ${breakdownMetric === o.v ? 'is-active' : ''}`}
                            onClick={() => setBreakdownMetric(o.v)}
                          >
                            {o.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  }
                >
                  <table className="qa-table">
                    <thead>
                      <tr>
                        <th className="qa-th-idx">#</th>
                        <th>
                          {breakdownView === 'customer'
                            ? 'Customer'
                            : breakdownView === 'process'
                              ? 'Process'
                              : 'Owner'}
                        </th>
                        <th className="qa-th-num">
                          {breakdownMetric === 'revenue' ? 'k.CAD' : 'Parts'}
                        </th>
                        <th className="qa-th-num">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdownRows.map(([name, val], i) => (
                        <tr key={name}>
                          <td className="qa-td-idx">{i + 1}</td>
                          <td>
                            <BarCell
                              label={name}
                              value={val}
                              total={breakdownTotal}
                              tone="blue"
                              bold={i === 0}
                            />
                          </td>
                          <td className="qa-td-num qa-td-strong">
                            {breakdownMetric === 'revenue' ? qaFmt(val) : val}
                          </td>
                          <td className="qa-td-num qa-td-muted">
                            {breakdownTotal > 0 ? qaPct(val / breakdownTotal) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2} className="qa-tfoot-label">
                          Total
                        </td>
                        <td className="qa-td-num qa-tfoot-val">
                          {breakdownMetric === 'revenue' ? qaFmt(breakdownTotal) : breakdownTotal}
                        </td>
                        <td className="qa-td-num qa-tfoot-val">100.0%</td>
                      </tr>
                    </tfoot>
                  </table>
                </Section>

                <Section
                  title="GM% Distribution"
                  subtitle={`${totalParts} part${totalParts === 1 ? '' : 's'} this period`}
                  accent="amber"
                >
                  <GmStackBar buckets={gmBuckets} total={totalParts} />
                </Section>
              </div>

              {/* Row 3 — full-width 6-month trend with click-to-pivot */}
              <Section
                title="Monthly Trend"
                subtitle="last 6 months — click a row to switch period"
                badge="6 mo"
                accent="blue"
              >
                <table className="qa-table qa-table-trend">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th className="qa-th-num">Parts</th>
                      <th className="qa-th-num">Revenue (k.CAD)</th>
                      <th className="qa-th-num">Avg GM%</th>
                      <th className="qa-th-num">Avg VA%</th>
                      <th className="qa-th-trend">Revenue trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendLast6.map((d) => {
                      const isSel = period.kind === 'singleMonth' && d.month === period.month;
                      const maxR = Math.max(...trendLast6.map((x) => x.totalRev), 1);
                      const barW = Math.round((d.totalRev / maxR) * 100);
                      return (
                        <tr
                          key={d.month}
                          className={`qa-trend-row ${isSel ? 'qa-trend-row-sel' : ''}`}
                          onClick={() => setPeriod({ kind: 'singleMonth', month: d.month })}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ')
                              setPeriod({ kind: 'singleMonth', month: d.month });
                          }}
                        >
                          <td className="qa-td-strong">{qaMonthLabel(d.month)}</td>
                          <td className="qa-td-num">{d.totalParts}</td>
                          <td className="qa-td-num qa-td-strong">{qaFmt(d.totalRev)}</td>
                          <td className="qa-td-num" style={{ color: qaGmClr(d.avgGM) }}>
                            {d.avgGM != null ? qaPctRaw(d.avgGM) + '%' : '—'}
                          </td>
                          <td className="qa-td-num qa-td-muted">
                            {d.avgVA != null ? qaPctRaw(d.avgVA) + '%' : '—'}
                          </td>
                          <td>
                            <div className="qa-trend-bar">
                              <div className="qa-trend-bar-fill" style={{ width: barW + '%' }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Section>
            </>
          )}
        </div>
        {customOpen && (
          <CustomRangeModal
            allMonths={allMonths}
            initialFrom={
              period.kind === 'custom' ? period.from : allMonths[allMonths.length - 1] || ''
            }
            initialTo={period.kind === 'custom' ? period.to : allMonths[0] || ''}
            onCancel={() => setCustomOpen(false)}
            onApply={(from, to) => {
              setPeriod({ kind: 'custom', from, to });
              setCustomOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

// S-RESP-1 — Period chip toolbar. role=tablist + role=tab + Home/End
// keyboard nav matches the Sprint 10 P1-1 a11y contract used elsewhere.
// Width-overflow handled by parent flex-wrap; chips never go vertical.
function PeriodPicker({ period, onChange, onOpenCustom }) {
  const ref = useRef(null);
  const handleKeyDown = (e) => {
    if (e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const tabs = ref.current?.querySelectorAll('[role="tab"]');
    if (!tabs || tabs.length === 0) return;
    const target = e.key === 'Home' ? tabs[0] : tabs[tabs.length - 1];
    target.focus();
  };
  const isActive = (id) => period.kind === id;
  return (
    <div className="qa-period">
      <span className="qa-filter-lbl">Period</span>
      <div
        className="qa-period-chips"
        role="tablist"
        aria-label="Period range"
        ref={ref}
        onKeyDown={handleKeyDown}
      >
        {PERIOD_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={isActive(p.id)}
            className={`qa-chip ${isActive(p.id) ? 'is-active' : ''}`}
            onClick={() => onChange({ kind: p.id })}
            title={p.vi}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={period.kind === 'custom' || period.kind === 'singleMonth'}
          className={`qa-chip ${period.kind === 'custom' || period.kind === 'singleMonth' ? 'is-active' : ''}`}
          onClick={onOpenCustom}
          title="Custom range / Khoảng tuỳ chọn"
        >
          {period.kind === 'singleMonth'
            ? qaMonthLabel(period.month)
            : period.kind === 'custom'
              ? `${qaMonthLabel(period.from)} → ${qaMonthLabel(period.to)}`
              : 'Custom…'}
        </button>
      </div>
    </div>
  );
}

// S-RESP-1 — Custom range modal: 2 native <input type="month"> for
// from/to. Auto-swap if from > to so the predicate never gets a
// reversed range. Native input gives free locale + keyboard nav;
// no JS calendar dep needed.
function CustomRangeModal({ allMonths, initialFrom, initialTo, onCancel, onApply }) {
  const [from, setFrom] = useState(initialFrom || '');
  const [to, setTo] = useState(initialTo || '');
  const minMonth = allMonths.length > 0 ? allMonths[allMonths.length - 1] : undefined;
  const maxMonth = allMonths.length > 0 ? allMonths[0] : undefined;
  const apply = () => {
    if (!from || !to) return;
    const [a, b] = from <= to ? [from, to] : [to, from];
    onApply(a, b);
  };
  return (
    <div className="qa-modal-scrim" role="dialog" aria-label="Custom date range" onClick={onCancel}>
      <div className="qa-modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="qa-modal-title">Custom range / Khoảng tuỳ chọn</h3>
        <p className="qa-modal-sub">
          Pick start and end month. Inclusive on both ends. / Chọn tháng bắt đầu và kết thúc (bao
          gồm cả 2 đầu).
        </p>
        <div className="qa-modal-row">
          <label className="qa-filter">
            <span className="qa-filter-lbl">From / Từ</span>
            <input
              type="month"
              className="qa-filter-input"
              value={from}
              min={minMonth}
              max={maxMonth}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="qa-filter">
            <span className="qa-filter-lbl">To / Đến</span>
            <input
              type="month"
              className="qa-filter-input"
              value={to}
              min={minMonth}
              max={maxMonth}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <div className="qa-modal-actions">
          <button type="button" className="qa-btn qa-btn-ghost" onClick={onCancel}>
            Cancel / Huỷ
          </button>
          <button
            type="button"
            className="qa-btn qa-btn-primary"
            onClick={apply}
            disabled={!from || !to}
          >
            Apply / Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
}
