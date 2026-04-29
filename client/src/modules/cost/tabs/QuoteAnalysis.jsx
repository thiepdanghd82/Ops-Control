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
import { useState, useEffect, useMemo, useCallback } from 'react';
import { sharedApi } from '../../../services/api';
import './QuoteAnalysis.css';

function qaFmt(v) { return (v / 1000).toFixed(1); }
function qaPct(v) { return (v * 100).toFixed(1) + '%'; }
function qaPctRaw(v) { return (v * 100).toFixed(1); }
function qaGmClr(v) {
  if (v == null) return 'var(--qa-neutral)';
  return v >= 0.20 ? 'var(--qa-positive)' : v >= 0.10 ? 'var(--qa-warning)' : 'var(--qa-negative)';
}

// Mid-MOQ tier — same convention as COST V1.0: revenue estimate uses
// the middle pricing tier so a 1k MOQ at $5 doesn't dwarf a 100k MOQ
// at $0.10. Picks index floor((n-1)/2) over [base, ...extras].
function qaMidTier(q) {
  const st = q.state || {};
  const base = { moq: st.moq || 0, sp: st.selling_price || 0 };
  const extras = (st.extra_moqs || []).map(e => ({ moq: e.moq || 0, sp: e.price || 0 }));
  const tiers = [base, ...extras];
  const midIdx = Math.floor((tiers.length - 1) / 2);
  return tiers[midIdx];
}

function qaRevenue(q) {
  const t = qaMidTier(q);
  return t.sp * t.moq;
}

function qaPrimaryProcess(q) {
  return ((q.state?.design_process || '').trim()) || 'Not updated';
}

function qaMonthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return (names[parseInt(m) - 1] || m) + ' ' + y;
}

function prevMonth(ym) {
  if (!ym) return null;
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Compute summary KPIs for a quote slice — reused for current + prev month
// so the delta arrows stay symmetric.
function computeKpis(quotes) {
  const totalParts = quotes.length;
  const totalRev = quotes.reduce((s, q) => s + qaRevenue(q), 0);
  const stdCount = quotes.filter(q => q.type === 'standard').length;
  const cplxCount = quotes.filter(q => q.type === 'complex').length;
  const validGM = quotes.filter(q => q.result?.gm != null);
  const avgGM = validGM.length ? validGM.reduce((s, q) => s + q.result.gm, 0) / validGM.length : null;
  const validVA = quotes.filter(q => q.result?.va != null);
  const avgVA = validVA.length ? validVA.reduce((s, q) => s + q.result.va, 0) / validVA.length : null;
  return { totalParts, totalRev, stdCount, cplxCount, avgGM, avgVA, validGMCount: validGM.length, validVACount: validVA.length };
}

// Delta indicator — IBM Carbon convention: ↑/↓ glyph + colored text.
// `unit` = 'pp' (percentage points, for GM/VA) | 'pct' (relative %) | null (raw)
function Delta({ now, prev, unit, invert }) {
  if (now == null || prev == null) return <span className="qa-delta qa-delta-flat">—</span>;
  const diff = unit === 'pp' ? (now - prev) * 100 : ((now - prev) / Math.abs(prev || 1)) * 100;
  if (Math.abs(diff) < 0.05) return <span className="qa-delta qa-delta-flat">±0</span>;
  const positive = invert ? diff < 0 : diff > 0;
  const sign = diff > 0 ? '↑' : '↓';
  const cls = positive ? 'qa-delta-up' : 'qa-delta-down';
  const suffix = unit === 'pp' ? 'pp' : '%';
  return <span className={`qa-delta ${cls}`}>{sign} {Math.abs(diff).toFixed(1)}{suffix}</span>;
}

// Reusable section panel — IBM Carbon-style white card with thin top
// accent in brand color. No gradient header, no rounded corners
// (Carbon uses 0px), generous internal spacing.
function Section({ title, subtitle, badge, accent = 'blue', children }) {
  return (
    <section className={`qa-section qa-accent-${accent}`}>
      <header className="qa-section-head">
        <div className="qa-section-titles">
          <h3 className="qa-section-title">{title}</h3>
          {subtitle && <span className="qa-section-sub">{subtitle}</span>}
        </div>
        {badge != null && <span className="qa-section-badge">{badge}</span>}
      </header>
      <div className="qa-section-body">{children}</div>
    </section>
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
// muted fill + accent stroke, no axis, no labels.
function Sparkline({ values, accent = 'blue', height = 28 }) {
  if (!values || values.length < 2) return <div className="qa-sparkline qa-sparkline-empty">—</div>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = (max - min) || 1;
  const w = 80;
  const stepX = w / (values.length - 1);
  const points = values.map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(' ');
  const fillPoints = `0,${height} ${points} ${w},${height}`;
  return (
    <svg className={`qa-sparkline qa-sparkline-${accent}`} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={fillPoints} className="qa-sparkline-fill" />
      <polyline points={points} className="qa-sparkline-line" />
    </svg>
  );
}

export default function QuoteAnalysis() {
  const [quoteHistory, setQuoteHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('');
  // Sprint 1.7d — Fiori-style filter bar. Filters apply across the
  // whole page (cards + tables) so a CFO can pivot to "Sales East →
  // April → Process X" with three dropdowns.
  const [filterSite, setFilterSite] = useState('all');
  const [filterNpi, setFilterNpi] = useState('all');

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

  useEffect(() => { loadData(); }, [loadData]);

  // Distinct months in the dataset, newest first.
  const allMonths = useMemo(() =>
    [...new Set(quoteHistory.map(q => (q.saved_at || '').slice(0, 7)).filter(Boolean))].sort().reverse(),
    [quoteHistory]
  );

  useEffect(() => {
    if (allMonths.length > 0 && (!selectedMonth || !allMonths.includes(selectedMonth))) {
      setSelectedMonth(allMonths[0]);
    }
  }, [allMonths, selectedMonth]);

  // Distinct sites + npi owners across the WHOLE dataset (not the
  // month slice) so picking a less-active site doesn't strand the
  // dropdown with no options.
  const allSites = useMemo(() =>
    ['all', ...new Set(quoteHistory.map(q => (q.state?.site || '').trim()).filter(Boolean))].sort(),
    [quoteHistory]
  );
  const allNpis = useMemo(() =>
    ['all', ...new Set(quoteHistory.map(q => (q.npi_owner || q.state?.npi_owner || '').trim()).filter(Boolean))].sort(),
    [quoteHistory]
  );

  // Apply month + filter slice; reused for current + prev so deltas
  // compare like-for-like.
  function applyFilters(quotes, month) {
    return quotes.filter(q => {
      if ((q.saved_at || '').slice(0, 7) !== month) return false;
      if (filterSite !== 'all' && (q.state?.site || '').trim() !== filterSite) return false;
      if (filterNpi !== 'all' && ((q.npi_owner || q.state?.npi_owner || '').trim()) !== filterNpi) return false;
      return true;
    });
  }

  const mq = useMemo(() => applyFilters(quoteHistory, selectedMonth), [quoteHistory, selectedMonth, filterSite, filterNpi]);
  const prevMq = useMemo(() => {
    const pm = prevMonth(selectedMonth);
    if (!pm) return [];
    return applyFilters(quoteHistory, pm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteHistory, selectedMonth, filterSite, filterNpi]);

  const kpis = useMemo(() => computeKpis(mq), [mq]);
  const prevKpis = useMemo(() => computeKpis(prevMq), [prevMq]);

  // Top Customers
  const topCustomers = useMemo(() => {
    const cuMap = {};
    mq.forEach(q => {
      const cu = (q.state?.direct_cu || '').trim() || 'Unknown';
      cuMap[cu] = (cuMap[cu] || 0) + qaRevenue(q);
    });
    const cuRows = Object.entries(cuMap).sort((a, b) => b[1] - a[1]);
    const topCu = cuRows.slice(0, 9);
    const otherRev = cuRows.slice(9).reduce((s, r) => s + r[1], 0);
    if (otherRev > 0) topCu.push(['Other', otherRev]);
    return topCu;
  }, [mq]);

  const procRevRows = useMemo(() => {
    const map = {};
    mq.forEach(q => {
      const proc = qaPrimaryProcess(q);
      map[proc] = (map[proc] || 0) + qaRevenue(q);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [mq]);

  const procCntRows = useMemo(() => {
    const map = {};
    mq.forEach(q => {
      const proc = qaPrimaryProcess(q);
      map[proc] = (map[proc] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [mq]);

  const npiRows = useMemo(() => {
    const map = {};
    mq.forEach(q => {
      const npi = (q.npi_owner || q.state?.npi_owner || '—').trim() || '—';
      map[npi] = (map[npi] || 0) + qaRevenue(q);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [mq]);

  const gmBuckets = useMemo(() => {
    const buckets = { '≥ 20%': 0, '10–19%': 0, '< 10%': 0, 'No price': 0 };
    mq.forEach(q => {
      const gm = q.result?.gm;
      if (gm == null) buckets['No price']++;
      else if (gm >= 0.20) buckets['≥ 20%']++;
      else if (gm >= 0.10) buckets['10–19%']++;
      else buckets['< 10%']++;
    });
    return Object.entries(buckets);
  }, [mq]);

  // 12-month trend for the sparklines on KPI tiles + the trend table.
  const trendData = useMemo(() => {
    const months = [...new Set(quoteHistory.map(q => (q.saved_at || '').slice(0, 7)).filter(Boolean))].sort().slice(-12);
    const rows = months.map(m => {
      const qs = applyFilters(quoteHistory, m);
      const k = computeKpis(qs);
      return { month: m, ...k };
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteHistory, filterSite, filterNpi]);

  const trendLast6 = trendData.slice(-6).reverse();
  const sparkRev = trendData.slice(-6).map(r => r.totalRev);
  const sparkParts = trendData.slice(-6).map(r => r.totalParts);
  const sparkGM = trendData.slice(-6).map(r => r.avgGM ?? 0);
  const sparkVA = trendData.slice(-6).map(r => r.avgVA ?? 0);

  if (loading) {
    return <div className="qa qa-loading">Loading Quote Analysis…</div>;
  }

  const { totalParts, totalRev, stdCount, cplxCount, avgGM, avgVA, validGMCount } = kpis;

  return (
    <div className="qa">
      {/* ── Object-page header (SAP Fiori convention) ────────────── */}
      <header className="qa-objhdr">
        <div className="qa-objhdr-meta">
          <div className="qa-breadcrumb">Reports · Quote Analysis</div>
          <h1 className="qa-objhdr-title">Quote Analysis</h1>
          <div className="qa-objhdr-sub">
            RFQ monthly report — estimated revenue uses the middle MOQ tier
          </div>
        </div>
        <div className="qa-objhdr-actions">
          <button type="button" className="qa-btn qa-btn-ghost" onClick={loadData} title="Re-fetch quote history">
            ↻ Refresh
          </button>
          <button type="button" className="qa-btn qa-btn-ghost" onClick={() => window.print()} title="Print this report">
            🖨 Print
          </button>
        </div>
      </header>

      {/* ── Filter bar (IFS Aurena / Fiori smart filter) ─────────── */}
      <div className="qa-filterbar">
        <label className="qa-filter">
          <span className="qa-filter-lbl">Period</span>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="qa-filter-input">
            {allMonths.map(m => <option key={m} value={m}>{qaMonthLabel(m)}</option>)}
          </select>
        </label>
        <label className="qa-filter">
          <span className="qa-filter-lbl">Site</span>
          <select value={filterSite} onChange={e => setFilterSite(e.target.value)} className="qa-filter-input">
            {allSites.map(s => <option key={s} value={s}>{s === 'all' ? 'All sites' : s}</option>)}
          </select>
        </label>
        <label className="qa-filter">
          <span className="qa-filter-lbl">NPI Owner</span>
          <select value={filterNpi} onChange={e => setFilterNpi(e.target.value)} className="qa-filter-input">
            {allNpis.map(n => <option key={n} value={n}>{n === 'all' ? 'All owners' : n}</option>)}
          </select>
        </label>
        {(filterSite !== 'all' || filterNpi !== 'all') && (
          <button type="button" className="qa-filter-reset" onClick={() => { setFilterSite('all'); setFilterNpi('all'); }}>
            Clear filters
          </button>
        )}
        <span className="qa-filter-result">
          {totalParts} part{totalParts !== 1 ? 's' : ''} matching
        </span>
      </div>

      {/* ── KPI tile strip with delta + sparkline ─────────────────── */}
      <div className="qa-kpis">
        <article className="qa-kpi qa-kpi-neutral">
          <div className="qa-kpi-row">
            <span className="qa-kpi-label">Total Parts</span>
            <Delta now={totalParts} prev={prevKpis.totalParts} unit="pct" />
          </div>
          <div className="qa-kpi-val">{totalParts.toLocaleString()}</div>
          <div className="qa-kpi-row qa-kpi-foot">
            <span className="qa-kpi-sub">{stdCount} std · {cplxCount} cplx</span>
            <Sparkline values={sparkParts} accent="blue" />
          </div>
        </article>

        <article className="qa-kpi qa-kpi-primary">
          <div className="qa-kpi-row">
            <span className="qa-kpi-label">Estimated Revenue</span>
            <Delta now={totalRev} prev={prevKpis.totalRev} unit="pct" />
          </div>
          <div className="qa-kpi-val">{qaFmt(totalRev)} <span className="qa-kpi-unit">k.CAD</span></div>
          <div className="qa-kpi-row qa-kpi-foot">
            <span className="qa-kpi-sub">{prevKpis.totalRev > 0 ? `vs ${qaFmt(prevKpis.totalRev)}k prev mo` : 'no prev period'}</span>
            <Sparkline values={sparkRev} accent="primary" />
          </div>
        </article>

        <article className="qa-kpi" style={{ '--qa-tile-accent': avgGM != null ? qaGmClr(avgGM) : 'var(--qa-neutral)' }}>
          <div className="qa-kpi-row">
            <span className="qa-kpi-label">Avg GM%</span>
            <Delta now={avgGM} prev={prevKpis.avgGM} unit="pp" />
          </div>
          <div className="qa-kpi-val">{avgGM != null ? qaPct(avgGM) : '—'}</div>
          <div className="qa-kpi-row qa-kpi-foot">
            <span className="qa-kpi-sub">{validGMCount} priced of {totalParts}</span>
            <Sparkline values={sparkGM} accent={avgGM != null && avgGM >= 0.20 ? 'positive' : avgGM != null && avgGM >= 0.10 ? 'warning' : 'negative'} />
          </div>
        </article>

        <article className="qa-kpi qa-kpi-cyan">
          <div className="qa-kpi-row">
            <span className="qa-kpi-label">Avg VA%</span>
            <Delta now={avgVA} prev={prevKpis.avgVA} unit="pp" />
          </div>
          <div className="qa-kpi-val">{avgVA != null ? qaPct(avgVA) : '—'}</div>
          <div className="qa-kpi-row qa-kpi-foot">
            <span className="qa-kpi-sub">value-add ratio</span>
            <Sparkline values={sparkVA} accent="cyan" />
          </div>
        </article>
      </div>

      {/* ── Body grid — sections in IBM Carbon flat style ──────── */}
      <div className="qa-body">
        {totalParts === 0 ? (
          <div className="qa-empty">
            <div className="qa-empty-icon">∅</div>
            <h2 className="qa-empty-title">No quotes for {qaMonthLabel(selectedMonth)}</h2>
            <p className="qa-empty-sub">
              {(filterSite !== 'all' || filterNpi !== 'all')
                ? 'Try clearing the site/owner filters or pick a different month.'
                : 'Pick a different month from the filter bar above, or save quotes from the Standard / Complex calculator.'}
            </p>
          </div>
        ) : (
          <>
            {/* Row 1 — Customers + Revenue by Process (50/50) */}
            <div className="qa-grid qa-grid-2">
              <Section title="Top Customers" subtitle="ranked by est. revenue" badge={topCustomers.length} accent="blue">
                <table className="qa-table">
                  <thead>
                    <tr>
                      <th className="qa-th-idx">#</th>
                      <th>Customer</th>
                      <th className="qa-th-num">k.CAD</th>
                      <th className="qa-th-num">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCustomers.map(([name, rev], i) => (
                      <tr key={name}>
                        <td className="qa-td-idx">{i + 1}</td>
                        <td><BarCell label={name} value={rev} total={totalRev} tone="blue" bold={i === 0} /></td>
                        <td className="qa-td-num qa-td-strong">{qaFmt(rev)}</td>
                        <td className="qa-td-num qa-td-muted">{totalRev > 0 ? qaPct(rev / totalRev) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="qa-tfoot-label">Total</td>
                      <td className="qa-td-num qa-tfoot-val">{qaFmt(totalRev)}</td>
                      <td className="qa-td-num qa-tfoot-val">100.0%</td>
                    </tr>
                  </tfoot>
                </table>
              </Section>

              <Section title="Revenue by Design Process" subtitle="primary process per quote" badge={procRevRows.length} accent="cyan">
                <table className="qa-table">
                  <thead>
                    <tr>
                      <th className="qa-th-idx">#</th>
                      <th>Process</th>
                      <th className="qa-th-num">k.CAD</th>
                      <th className="qa-th-num">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {procRevRows.map(([name, rev], i) => (
                      <tr key={name}>
                        <td className="qa-td-idx">{i + 1}</td>
                        <td><BarCell label={name} value={rev} total={totalRev} tone="cyan" /></td>
                        <td className="qa-td-num qa-td-strong">{qaFmt(rev)}</td>
                        <td className="qa-td-num qa-td-muted">{totalRev > 0 ? qaPct(rev / totalRev) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="qa-tfoot-label">Total</td>
                      <td className="qa-td-num qa-tfoot-val">{qaFmt(totalRev)}</td>
                      <td className="qa-td-num qa-tfoot-val">100.0%</td>
                    </tr>
                  </tfoot>
                </table>
              </Section>
            </div>

            {/* Row 2 — three narrow columns */}
            <div className="qa-grid qa-grid-3">
              <Section title="Parts by Process" subtitle="quote count" badge={procCntRows.length} accent="green">
                <table className="qa-table">
                  <thead>
                    <tr>
                      <th className="qa-th-idx">#</th>
                      <th>Process</th>
                      <th className="qa-th-num">Parts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {procCntRows.map(([name, cnt], i) => (
                      <tr key={name}>
                        <td className="qa-td-idx">{i + 1}</td>
                        <td><BarCell label={name} value={cnt} total={procCntRows[0]?.[1] || 1} tone="green" /></td>
                        <td className="qa-td-num qa-td-strong">{cnt}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="qa-tfoot-label">Total</td>
                      <td className="qa-td-num qa-tfoot-val">{totalParts}</td>
                    </tr>
                  </tfoot>
                </table>
              </Section>

              <Section title="Revenue by NPI Owner" subtitle="ownership of pipeline" badge={npiRows.length} accent="purple">
                <table className="qa-table">
                  <thead>
                    <tr>
                      <th className="qa-th-idx">#</th>
                      <th>Owner</th>
                      <th className="qa-th-num">k.CAD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {npiRows.map(([name, rev], i) => (
                      <tr key={name}>
                        <td className="qa-td-idx">{i + 1}</td>
                        <td><BarCell label={name} value={rev} total={totalRev} tone="purple" /></td>
                        <td className="qa-td-num qa-td-strong">{qaFmt(rev)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="qa-tfoot-label">Total</td>
                      <td className="qa-td-num qa-tfoot-val">{qaFmt(totalRev)}</td>
                    </tr>
                  </tfoot>
                </table>
              </Section>

              <Section title="GM% Distribution" subtitle="margin health buckets" accent="amber">
                <table className="qa-table qa-table-buckets">
                  <thead>
                    <tr>
                      <th>Range</th>
                      <th className="qa-th-num">Parts</th>
                      <th className="qa-th-num">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gmBuckets.map(([label, cnt]) => {
                      const tone = label === '≥ 20%' ? 'positive'
                        : label === '10–19%' ? 'warning'
                        : label === '< 10%' ? 'negative'
                        : 'neutral';
                      return (
                        <tr key={label} className={`qa-bucket-row qa-bucket-${tone}`}>
                          <td>
                            <span className={`qa-bucket-dot qa-tone-${tone}`} />
                            <span className="qa-bucket-label">{label}</span>
                          </td>
                          <td className="qa-td-num qa-td-strong">{cnt}</td>
                          <td className="qa-td-num qa-td-muted">{totalParts > 0 ? qaPct(cnt / totalParts) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Section>
            </div>

            {/* Row 3 — full-width 6-month trend with click-to-pivot */}
            <Section title="Monthly Trend" subtitle="last 6 months — click a row to switch period" badge="6 mo" accent="blue">
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
                  {trendLast6.map(d => {
                    const isSel = d.month === selectedMonth;
                    const maxR = Math.max(...trendLast6.map(x => x.totalRev), 1);
                    const barW = Math.round((d.totalRev / maxR) * 100);
                    return (
                      <tr key={d.month}
                          className={`qa-trend-row ${isSel ? 'qa-trend-row-sel' : ''}`}
                          onClick={() => setSelectedMonth(d.month)}
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedMonth(d.month); }}>
                        <td className="qa-td-strong">{qaMonthLabel(d.month)}</td>
                        <td className="qa-td-num">{d.totalParts}</td>
                        <td className="qa-td-num qa-td-strong">{qaFmt(d.totalRev)}</td>
                        <td className="qa-td-num" style={{ color: qaGmClr(d.avgGM) }}>
                          {d.avgGM != null ? qaPctRaw(d.avgGM) + '%' : '—'}
                        </td>
                        <td className="qa-td-num qa-td-muted">{d.avgVA != null ? qaPctRaw(d.avgVA) + '%' : '—'}</td>
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
    </div>
  );
}
