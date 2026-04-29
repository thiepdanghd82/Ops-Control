/**
 * LibFinance — Finance Data Viewer / Work Center Cost Analysis
 * Matches COST V1.0 M17: renderLibFinanceHub
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { useCostLib } from '../../../context/CostLibContext';
import { useAuth } from '../../../context/AuthContext';
import { costApi } from '../../../services/api';
import EmptyState from '../../../components/Shared/EmptyState';
import DecimalInput from '../../../utils/DecimalInput';
import './LibFinance.css';

// Phase 9G.4 — consume the canonical site list from utils/sites.js
// instead of duplicating the array here. Add a new site there and it
// appears automatically in every consumer (RfqInfoCard, LibRate,
// LibDDL, LibFinance).
import { SITES as SGA_SITES } from '../../../utils/sites';

function fmtNum(v, decimals = 0) {
  if (v == null || v === '' || isNaN(v)) return '\u2014';
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(v) {
  if (v == null || v === '' || isNaN(v)) return '\u2014';
  return (Number(v) * 100).toFixed(1) + '%';
}

export default function LibFinance() {
  const { finance, setFinance, refreshLib } = useCostLib();
  const { hasRole } = useAuth();
  const canEditSga = hasRole('admin');
  const [activeTab, setActiveTab] = useState('wc');
  const [activeYear, setActiveYear] = useState(null);
  const [search, setSearch] = useState('');

  // Phase 9D.2 — SGA rate by site. Edited locally, saved on "Save SGA".
  // Pulls from lib.finance.summary.sga_rate_pct_by_site and persists back
  // through /save-all financeSumDB. Non-admin users see the numbers but
  // can't edit (inputs disabled).
  const storedSga = finance?.summary?.sga_rate_pct_by_site || {};
  const [sgaDraft, setSgaDraft] = useState(storedSga);
  const [sgaDirty, setSgaDirty] = useState(false);
  const [sgaSaving, setSgaSaving] = useState(false);
  // Phase 9G.7 — inline banner replaces alert() for conflict + error.
  // { kind: 'conflict' | 'error' | 'info', message } shown at the top of
  // the panel; dismissed on successful save or via the X button.
  const [sgaBanner, setSgaBanner] = useState(null);
  // Sprint 33: track which site keys the user has touched. On a 409
  // conflict + reload, we keep ONLY those sites from the draft and
  // adopt fresh server values for every other site — prevents the
  // classic lost-update where Admin A's unsaved draft clobbers a
  // concurrently-edited site Admin B changed.
  const touchedSitesRef = useRef(new Set());

  // Accepts either a raw string (legacy path, pre-Sprint-AE) or a
  // number (DecimalInput emits numbers directly). Empty string keeps
  // the draft field blank so callers can represent "cleared".
  const handleSgaChange = (site, val) => {
    const n = val === '' || val == null
      ? ''
      : (typeof val === 'number' ? val : Number(val));
    setSgaDraft(prev => ({ ...prev, [site]: n }));
    setSgaDirty(true);
    touchedSitesRef.current.add(site);
    if (sgaBanner) setSgaBanner(null);
  };

  // Sprint 33 bug fix: prior impl was `setSgaDraft(prev => ({...prev}))`
  // — a no-op identity spread that silently preserved the stale draft.
  // If Admin A was editing VN: 5%→8% and Admin B saved RDC: 3%→5%
  // concurrently, Admin A's 409→Reload→Save would overwrite RDC back
  // to the pre-B value. Now we merge: keep only sites the user
  // explicitly touched, adopt server values for everything else.
  const handleSgaReloadAfterConflict = async () => {
    try {
      await refreshLib();
      // refreshLib updates `finance` in context; storedSga computed
      // above will reflect the refresh on the next render, but our
      // setSgaDraft call here needs the FRESH value. Read from the
      // latest `finance` via a re-fetch guarded by ref — cheapest is
      // to use the current storedSga variable closed over by the
      // callback, which is stale; so use a functional state form that
      // combines with the just-refreshed context via setTimeout 0.
      // Simpler: rely on the useEffect below that watches storedSga
      // and selectively applies touched-site overrides.
      const touched = touchedSitesRef.current;
      if (touched.size === 0) {
        // No local edits worth preserving — the useEffect will fully
        // sync draft to fresh server. Clear banner with info.
        setSgaBanner({ kind: 'info', message: 'Reloaded. Local SGA edits cleared.' });
      } else {
        const touchedList = Array.from(touched).join(', ');
        setSgaBanner({
          kind: 'info',
          message: `Reloaded. Your edits on [${touchedList}] kept; other sites pulled fresh from server. Review + Save.`,
        });
      }
    } catch (err) {
      setSgaBanner({
        kind: 'error',
        message: 'Reload failed: ' + (err.message || 'network error') + '. Try again or switch tabs.',
      });
    }
  };

  // Sprint 33: re-sync sgaDraft when the finance context changes from
  // outside (refreshLib, LOAD_QUOTE, etc.). Honors the touched-sites
  // set so user's unsaved edits survive. Runs only when storedSga's
  // JSON identity changes — flat value compare via stringify avoids
  // infinite loops on object identity churn.
  const storedSgaKey = JSON.stringify(storedSga);
  useEffect(() => {
    const touched = touchedSitesRef.current;
    setSgaDraft(prev => {
      const next = { ...storedSga };
      // Overlay user's unsaved edits back on top — only for sites
      // they actually typed into.
      for (const site of touched) {
        if (Object.prototype.hasOwnProperty.call(prev, site)) {
          next[site] = prev[site];
        }
      }
      return next;
    });
    // Don't clear dirty — user still has unsaved touched-site edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedSgaKey]);

  const handleSgaSave = async () => {
    if (!canEditSga || sgaSaving) return;
    setSgaSaving(true);
    setSgaBanner(null);
    try {
      // Coerce blanks to 0 and strip non-finite values before persisting
      // so the calc engine never reads a NaN as a percent.
      const cleaned = Object.fromEntries(
        Object.entries(sgaDraft).map(([k, v]) => [k, Number.isFinite(Number(v)) ? Number(v) : 0])
      );
      // Phase 9F.4 — send current `version` with the payload. Server
      // rejects with 409 if someone else has saved in the meantime so
      // we don't blind-overwrite their edits.
      const currentVersion = Number(finance?.summary?.version) || 0;
      const nextSummary = {
        ...(finance?.summary || {}),
        sga_rate_pct_by_site: cleaned,
        version: currentVersion,
      };
      await costApi.saveAll({ financeSumDB: nextSummary });
      // Server increments version on successful write; re-fetch via
      // context refresh would be cleaner but we don't have that hook
      // here. Bump our local copy to stay in sync for the next save.
      setFinance(prev => ({
        ...(prev || {}),
        summary: { ...nextSummary, version: currentVersion + 1 },
      }));
      setSgaDraft(cleaned);
      setSgaDirty(false);
      // Sprint 33: clear the touched-sites set on successful save —
      // next conflict-reload should start fresh (no stale overrides).
      touchedSitesRef.current = new Set();
    } catch (err) {
      // Phase 9G.7 — 409 conflict and generic errors both render as an
      // inline banner instead of alert(). Banner stays until dismissed
      // or a new save succeeds. alert() was not screen-reader friendly
      // and blocked the whole tab until dismissed.
      const msg = String(err?.message || '');
      if (msg.includes('finance_sum_conflict') || msg.includes('modified by another user')) {
        setSgaBanner({
          kind: 'conflict',
          message: 'Another admin saved SGA rates while you were editing. Click "Reload server values" to pull the latest, then re-apply your change.',
        });
        setSgaDirty(false);
      } else {
        setSgaBanner({ kind: 'error', message: 'Save failed: ' + (msg || 'unknown error') });
      }
    } finally {
      setSgaSaving(false);
    }
  };

  const wc = useMemo(() => finance?.wc || [], [finance]);
  const years = finance?.years || {};
  const yearKeys = Object.keys(years).sort().reverse();

  // Auto-select latest year if available
  const selectedYear = activeYear || yearKeys[0] || null;
  const yearData = selectedYear ? (years[selectedYear] || {}) : {};

  // WC table data
  const wcFiltered = useMemo(() => {
    if (!search.trim()) return wc;
    const q = search.toLowerCase();
    return wc.filter(r => (r.w || '').toLowerCase().includes(q) || (r.n || '').toLowerCase().includes(q));
  }, [wc, search]);

  return (
    <div className="lib-finance">
      <div className="lf-toolbar">
        <div className="lf-title">Finance Data</div>
        <div className="lf-tabs">
          <button className={`lf-tab ${activeTab === 'wc' ? 'active' : ''}`} onClick={() => setActiveTab('wc')}>Work Center Rates</button>
          <button className={`lf-tab ${activeTab === 'db' ? 'active' : ''}`} onClick={() => setActiveTab('db')}>DB Finance Data</button>
          <button className={`lf-tab ${activeTab === 'expenses' ? 'active' : ''}`} onClick={() => setActiveTab('expenses')}>Expenses</button>
        </div>
        {yearKeys.length > 1 && (
          <div className="lf-years">
            {yearKeys.map(y => (
              <button key={y} className={`lf-year-btn ${selectedYear === y ? 'active' : ''}`} onClick={() => setActiveYear(y)}>
                {y}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* SGA Overhead by Site — Phase 9D.2. Admin-editable; others see read-only.
          A non-zero rate applies at calc time to every quote for that site. */}
      <div className="lf-sga-panel" style={{ margin: '8px 16px', padding: 12, background: '#fff', border: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#161616' }}>SGA Overhead by Site</div>
          <div style={{ fontSize: 11, color: '#6f6f6f' }}>
            Applied as a percent of COGS (g_ttl) per quote. 0 = no SGA burden.
          </div>
          {canEditSga && (
            <button
              onClick={handleSgaSave}
              disabled={!sgaDirty || sgaSaving}
              className="op-btn op-btn-primary op-btn-sm"
              style={{ marginLeft: 'auto' }}
            >
              {sgaSaving ? 'Saving...' : sgaDirty ? 'Save SGA' : 'Saved'}
            </button>
          )}
        </div>

        {/* Phase 9G.7 — inline status banner (replaces alert()). Color
            by kind: amber for conflict (recoverable via reload), red
            for error. Dismissible via X; conflicts also offer a direct
            Reload button so the user doesn't have to leave the tab. */}
        {sgaBanner && (() => {
          // Sprint 33: added 'info' kind (post-reload merge notice).
          // Three palettes keep visual distinction sharp so Finance
          // users parse "action-required vs OK" at a glance.
          const palette = sgaBanner.kind === 'conflict'
            ? { bg: '#fff4e0', border: '#d97706', fg: '#7c2d12', label: '⚠ Conflict' }
            : sgaBanner.kind === 'info'
            ? { bg: '#e0f2fe', border: '#0284c7', fg: '#075985', label: 'ℹ Info' }
            : { bg: '#fee2e2', border: '#991b1b', fg: '#991b1b', label: '⚠ Error' };
          return (
          <div
            role="alert"
            style={{
              marginBottom: 10,
              padding: '8px 12px',
              borderRadius: 2,
              background: palette.bg,
              border: `1px solid ${palette.border}`,
              color: palette.fg,
              display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 600 }}>{palette.label}</span>
            <span style={{ flex: 1 }}>{sgaBanner.message}</span>
            {sgaBanner.kind === 'conflict' && (
              <button
                onClick={handleSgaReloadAfterConflict}
                className="op-btn op-btn-secondary op-btn-sm"
              >
                Reload server values
              </button>
            )}
            <button
              onClick={() => setSgaBanner(null)}
              className="op-btn op-btn-ghost op-btn-sm"
              aria-label="Dismiss"
              style={{ padding: '2px 8px' }}
            >
              ✕
            </button>
          </div>
          );
        })()}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {SGA_SITES.map(site => (
            <label key={site} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
              <span style={{ color: '#525252', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>{site}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <DecimalInput
                  value={sgaDraft[site]}
                  onChange={v => handleSgaChange(site, v)}
                  disabled={!canEditSga}
                  placeholder="0"
                  style={{
                    width: '100%', padding: '4px 6px', border: '1px solid #c6c6c6',
                    fontSize: 12, fontVariantNumeric: 'tabular-nums',
                    background: canEditSga ? '#fff' : '#f4f4f4',
                  }}
                />
                <span style={{ color: '#6f6f6f' }}>%</span>
              </div>
            </label>
          ))}
        </div>
        {!canEditSga && (
          <div style={{ marginTop: 6, fontSize: 10, color: '#8d8d8d' }}>
            Read-only — admin role required to edit SGA rates.
          </div>
        )}
      </div>

      {activeTab === 'wc' && (
        <div className="lf-wc">
          <div className="lf-search-bar">
            <input type="text" placeholder="Search by WC code or name..." value={search}
              onChange={e => setSearch(e.target.value)} className="lf-search" />
            <span className="lf-count">{wcFiltered.length} work centers</span>
          </div>
          <div className="lf-table-wrap">
            <table className="lf-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th style={{ color: '#065f46' }}>WC Code</th>
                  <th>Description</th>
                  <th>Prod Hrs</th>
                  <th style={{ color: '#0369a1' }}>Labor</th>
                  <th style={{ color: '#0369a1' }}>KH May</th>
                  <th style={{ color: '#0369a1' }}>KH NX</th>
                  <th style={{ color: '#0369a1' }}>GT+OH</th>
                  <th style={{ color: '#b45309' }}>Power</th>
                  <th style={{ color: '#059669' }}>OH SX</th>
                  <th style={{ color: '#1d4ed8' }}>Total Alloc</th>
                  <th style={{ color: '#7c3aed' }}>Labor/hr</th>
                  <th style={{ color: '#7c3aed' }}>Dep/hr</th>
                  <th style={{ color: '#7c3aed' }}>OH/hr</th>
                  <th style={{ color: '#059669', fontWeight: 700 }}>Total Rate</th>
                </tr>
              </thead>
              <tbody>
                {wcFiltered.map((r, i) => (
                  <tr key={i}>
                    <td className="lf-idx">{i + 1}</td>
                    <td style={{ color: '#065f46', fontWeight: 600 }}>{r.w || ''}</td>
                    <td>{r.n || ''}</td>
                    <td className="lf-num">{fmtNum(r.hrs)}</td>
                    <td className="lf-num" style={{ color: '#0369a1' }}>{fmtNum(r.labor)}</td>
                    <td className="lf-num" style={{ color: '#0369a1' }}>{fmtNum(r.dep_m)}</td>
                    <td className="lf-num" style={{ color: '#0369a1' }}>{fmtNum(r.dep_b)}</td>
                    <td className="lf-num" style={{ color: '#0369a1' }}>{fmtNum(r.oh)}</td>
                    <td className="lf-num" style={{ color: '#b45309' }}>{fmtNum(r.power)}</td>
                    <td className="lf-num" style={{ color: '#059669' }}>{fmtNum(r.oh_sx)}</td>
                    <td className="lf-num" style={{ color: '#1d4ed8' }}>{fmtNum(r.total_alloc)}</td>
                    <td className="lf-num" style={{ color: '#7c3aed' }}>{fmtNum(r.lr, 0)}</td>
                    <td className="lf-num" style={{ color: '#7c3aed' }}>{fmtNum(r.dr, 0)}</td>
                    <td className="lf-num" style={{ color: '#7c3aed' }}>{fmtNum(r.or_, 0)}</td>
                    <td className="lf-num" style={{ color: '#059669', fontWeight: 700 }}>{fmtNum(r.tr, 0)}</td>
                  </tr>
                ))}
                {wcFiltered.length === 0 && (
                  <tr><td colSpan={15} style={{ padding: 0 }}>
                    <EmptyState icon="💰" title="No work-center cost data" hint="Try a different year or verify Finance data was imported." />
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'db' && (
        <div className="lf-db-content">
          {yearData.db ? (
            <>
              {yearData.db.kpi && (
                <div className="lf-section">
                  <h3 className="lf-section-title">KPI Summary</h3>
                  <table className="lf-table lf-table-compact">
                    <thead><tr><th>Item</th><th>YTD</th><th>%</th><th>Note</th></tr></thead>
                    <tbody>
                      {yearData.db.kpi.map((r, i) => (
                        <tr key={i} className={r.isBold ? 'lf-bold' : ''}>
                          <td>{r.label}</td>
                          <td className="lf-num">{fmtNum(r.ytd)}</td>
                          <td className="lf-num">{r.pct != null ? fmtPct(r.pct) : '\u2014'}</td>
                          <td>{r.note || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {yearData.db.costGroups && (
                <div className="lf-section">
                  <h3 className="lf-section-title">Cost Groups</h3>
                  <table className="lf-table lf-table-compact">
                    <thead><tr><th>Group</th><th>Item</th><th>YTD</th><th>Rate</th><th>%</th></tr></thead>
                    <tbody>
                      {yearData.db.costGroups.map((r, i) => (
                        <tr key={i} className={r.isTotal ? 'lf-total' : ''}>
                          <td>{r.group}</td><td>{r.item}</td>
                          <td className="lf-num">{fmtNum(r.ytd)}</td>
                          <td className="lf-num">{r.rate != null ? fmtNum(r.rate, 2) : '\u2014'}</td>
                          <td className="lf-num">{r.pct != null ? fmtPct(r.pct) : '\u2014'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {yearData.db.wcSummary && (
                <div className="lf-section">
                  <h3 className="lf-section-title">WC Cost Summary</h3>
                  <table className="lf-table lf-table-compact">
                    <thead><tr><th>Group</th><th>Item</th><th>YTD</th><th>Rate</th><th>%</th><th>Basis</th></tr></thead>
                    <tbody>
                      {yearData.db.wcSummary.map((r, i) => (
                        <tr key={i} className={r.isTotal ? 'lf-total' : r.isSubtotal ? 'lf-subtotal' : ''}>
                          <td>{r.group}</td><td>{r.item}</td>
                          <td className="lf-num">{fmtNum(r.ytd)}</td>
                          <td className="lf-num">{r.rate != null ? fmtNum(r.rate, 2) : '\u2014'}</td>
                          <td className="lf-num">{r.pct != null ? fmtPct(r.pct) : '\u2014'}</td>
                          <td>{r.basis || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <EmptyState icon="📊" title="No DB Finance data" hint={`Verify Finance dataset was imported${selectedYear ? ` for ${selectedYear}` : ''}.`} />
          )}
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="lf-expenses-content">
          {yearData.db ? (
            <>
              {['operations', 'production', 'sdAdmin', 'headcount'].map(section => {
                const key = `expenses_${section}`;
                const data = yearData.db[key] || yearData.db[section];
                if (!data || !Array.isArray(data)) return null;
                return (
                  <div key={section} className="lf-section">
                    <h3 className="lf-section-title">{section.charAt(0).toUpperCase() + section.slice(1)}</h3>
                    <div className="lf-table-wrap">
                      <table className="lf-table lf-table-compact">
                        <thead>
                          <tr>
                            <th>Item</th>
                            {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map(m => <th key={m}>{m}</th>)}
                            <th style={{ fontWeight: 700 }}>YTD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.map((r, i) => (
                            <tr key={i} className={r.isTotal ? 'lf-total' : r.isBold ? 'lf-bold' : ''}>
                              <td>{r.label}</td>
                              {['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].map(m => (
                                <td key={m} className="lf-num">{r[m] != null ? fmtNum(r[m]) : '\u2014'}</td>
                              ))}
                              <td className="lf-num" style={{ fontWeight: 600 }}>{r.ytd != null ? fmtNum(r.ytd) : '\u2014'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <EmptyState icon="💵" title="No expense data" hint={`Verify P&L/expense sheet was imported${selectedYear ? ` for ${selectedYear}` : ''}.`} />
          )}
        </div>
      )}
    </div>
  );
}
