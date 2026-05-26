/**
 * Summarize — Cost records table aggregated from all saved quotes.
 *
 * Reads `sharedApi.getQuotes()` on mount and re-fetches whenever the
 * user saves/updates/loads a quote (detected via isDirty / activeQuoteId
 * in CalcContext). Each saved quote expands into one row per MOQ tier so
 * Standard quotes with N tiers produce N rows, and Complex quotes run
 * through the same two-pass per-tier calc that ComplexCalc uses.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useCalc } from '../../../context/CalcContext';
import { useCostLib } from '../../../context/CostLibContext';
import { calcAll, buildTierState, applyCplxTierToSp } from '../../../services/calcEngine';
import { sharedApi } from '../../../services/api';
import { RFQ_COLOR_PALETTE, setRfqColor, useRfqColors } from '../../../services/rfqColors';
import { fmtN, pct, gmClr } from '../../../utils/format';
import { useAbortableFetch } from '../../../hooks/useAbortableFetch';
import EmptyState from '../../../components/Shared/EmptyState';
import { err as logErr } from '../../../utils/logger';
import { buildCsv, saveCsv } from '../../../services/csvExport';
import './Summarize.css';

// Yield = 1 - Σ(scrap_pct) across every process in a state. Uses a simple
// sum (not the compound 1-∏(1-s) formula calcEngine uses internally) because
// that's what the Cost Breakdown summary column is documented to show.
function yieldFromProcesses(st) {
  const procs = (st && st.processes) || [];
  const sumScrap = procs.reduce((acc, p) => {
    return acc + (p && p.workcenter ? Number(p.scrap_pct) || 0 : 0);
  }, 0);
  return 1 - sumScrap;
}

// For Complex quotes, aggregate the sum across every sub-product's processes
// so the displayed yield reflects the whole assembly, not just SP0.
function yieldFromSubproducts(sps) {
  let sumScrap = 0;
  for (const sp of sps || []) {
    for (const p of sp.processes || []) {
      if (p && p.workcenter) sumScrap += Number(p.scrap_pct) || 0;
    }
  }
  return 1 - sumScrap;
}

// Complex two-pass aggregator — mirrors ComplexCalc.jsx / CplxCostBreakdown.
// Kept inline rather than extracted to a shared util to avoid touching
// more modules; the logic is small and self-contained.
function aggregateCplxTier(cs, sps, lib, tierIdx) {
  if (!lib || !sps.length) return null;
  const activeMoq =
    tierIdx === 0 ? cs.moq : ((cs.extra_moqs || [])[tierIdx - 1] || {}).moq || cs.moq;
  const tieredSps = sps.map((sp, spi) => applyCplxTierToSp(cs, sp, spi, tierIdx));
  const pass1 = tieredSps.map((sp) => {
    try {
      const spSt = {
        ...sp,
        moq: sp.ship_qty || activeMoq,
        selling_price: cs.selling_price,
        trade_mode: cs.trade_mode,
        site: cs.site,
      };
      return calcAll(spSt, null, lib, null);
    } catch {
      return null;
    }
  });
  const pass2 = tieredSps.map((sp, spi) => {
    const hasRef = sp.materials?.some(
      (m) => m.code && tieredSps.some((s, si2) => si2 !== spi && s.code === m.code)
    );
    if (!hasRef) return pass1[spi];
    try {
      const spSt = {
        ...sp,
        moq: sp.ship_qty || activeMoq,
        selling_price: cs.selling_price,
        trade_mode: cs.trade_mode,
        site: cs.site,
      };
      return calcAll(spSt, pass1, lib, tieredSps);
    } catch {
      return pass1[spi];
    }
  });
  // If any SP calc failed (null result), bail out of the whole aggregation
  // rather than silently treating the failed SP's cost as $0 — a silent
  // understatement is worse than a missing row.
  if (pass2.some((r) => r == null)) {
    console.warn('aggregateCplxTier: one or more SPs failed to calc — skipping this tier');
    return null;
  }
  const fgIdx = sps.findIndex((s) => (s.code || '').toUpperCase().startsWith('FG'));
  if (fgIdx >= 0 && pass2[fgIdx]) return pass2[fgIdx];
  const sum = (key) => pass2.reduce((a, r) => a + (r?.[key] || 0), 0);
  return {
    s_ttl: sum('s_ttl'),
    s_mat_cost: sum('s_mat_cost'),
    overhead: sum('overhead'),
    labor_cost: sum('labor_cost'),
    tooling: sum('tooling'),
    packing_ship: sum('packing_ship'),
    bd_ink_setup: sum('bd_ink_setup'),
    bd_ink_run: sum('bd_ink_run'),
    vat_loss: sum('vat_loss'),
  };
}

export default function Summarize() {
  const { isDirty, activeQuoteId, setPendingQuote } = useCalc();
  const { lib } = useCostLib();
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState('');
  // Sprint AR — hook-managed fetch with isDirty + activeQuoteId as
  // refresh triggers. Hook internally aborts stale in-flight loads on
  // rapid save/load switching so the table never flashes old rows.
  const {
    data: rawQuotes,
    loading,
    error: loadError,
    refresh,
  } = useAbortableFetch((signal) => sharedApi.getQuotes({ signal }), [isDirty, activeQuoteId], {
    onError: (err) => err?.name !== 'AbortError' && logErr('Summarize getQuotes failed:', err),
  });
  const quotes = useMemo(() => (Array.isArray(rawQuotes) ? rawQuotes : []), [rawQuotes]);
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, row }
  const ctxRef = useRef(null);
  const rfqColors = useRfqColors();

  // Close context menu on outside click / Escape
  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (e) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxMenu(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setCtxMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

  function handleContextMenu(e, row) {
    e.preventDefault();
    const rect = e.currentTarget.closest('.sum')?.getBoundingClientRect() || { left: 0, top: 0 };
    setCtxMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, row });
  }

  function handleOpen(row) {
    setPendingQuote(row.quote_id, row.type || 'standard', 'load');
    const target = row.type === 'complex' ? 'complex' : 'standard';
    window.dispatchEvent(new CustomEvent('ops-switch-tab', { detail: target }));
    setCtxMenu(null);
  }

  // refetch / abort / effect now handled by useAbortableFetch above.

  // Expand each saved quote into one row per MOQ tier. Standard and
  // Complex share the same row shape; the type-switch only decides how
  // the per-tier result object is computed.
  const records = useMemo(() => {
    if (!lib || !quotes.length) return [];
    const rows = [];
    quotes.forEach((q) => {
      const st = q.state || {};
      const isCplx = q.type === 'complex';
      const numTiers = st.num_moq || 1;
      for (let t = 0; t < numTiers; t++) {
        let moq, usdPrice, eau, target;
        if (t === 0) {
          moq = st.moq || 0;
          usdPrice = st.selling_price || 0;
          eau = st.annual_qty || 0;
          target = st.target;
        } else {
          const em = (st.extra_moqs || [])[t - 1];
          if (!em) continue;
          moq = em.moq || 0;
          usdPrice = em.price || 0;
          eau = em.eau || st.annual_qty || 0;
          target = em.target;
        }
        try {
          let r,
            yield_pct = 1;
          if (isCplx) {
            const sps = st.subproducts || [];
            r = aggregateCplxTier(st, sps, lib, t);
            // Yield = 1 - Σ(scrap_pct) across every process in every SP.
            yield_pct = yieldFromSubproducts(sps);
          } else {
            const tierSt = buildTierState(st, t, usdPrice, moq, eau);
            r = calcAll(tierSt, null, lib, null);
            // Yield = 1 - Σ(scrap_pct) across every process in this tier.
            yield_pct = yieldFromProcesses(tierSt);
          }
          if (!r) continue;
          const tierSp = usdPrice || 0;
          const gm = tierSp > 0 ? (tierSp - (r.s_ttl || 0)) / tierSp : null;
          // VA% and Contribution% must follow the canonical kpiDefinitions
          // formula so Summary agrees with Cost Breakdown + Summary Bar
          // on the same quote. Prior impl omitted tooling from VA and
          // omitted tooling + labor from Contribution — quotes with
          // non-trivial tooling cost looked 3–8% better here than on
          // the Cost Breakdown tab. Aligned 2026-04-19 audit.
          const va =
            tierSp > 0
              ? (tierSp - (r.s_mat_cost || 0) - (r.tooling || 0) - (r.packing_ship || 0)) / tierSp
              : null;
          const contr =
            tierSp > 0
              ? (tierSp -
                  (r.s_mat_cost || 0) -
                  (r.tooling || 0) -
                  (r.packing_ship || 0) -
                  (r.labor_cost || 0)) /
                tierSp
              : null;
          rows.push({
            id: `${q.id}-${t + 1}`,
            quote_id: q.id,
            tier: t + 1,
            // RFQ NO shown in the first column — pulls from the saved
            // quote state, falls back to the numeric quote id prefixed
            // with Q# if the user never generated/typed an RFQ number.
            rfq_no: st.rfq_number || `Q${q.id}`,
            update_date: q.saved_at,
            type: q.type,
            direct_cu: st.direct_cu || '',
            direct_cu_pn: st.direct_cu_pn || '',
            project: st.project || '',
            end_cu_pn: st.end_cu_pn || '',
            description: st.description || '',
            size:
              st.part_width && st.part_length_md
                ? `${st.part_width}\u00D7${st.part_length_md}`
                : '',
            // `production_size` = Print sub-tab dimensions (print_part_*).
            // What the layout calc + plate use; matches the artwork area
            // operator engages with daily. Falls back to canonical Cut
            // when Print fields are not populated (legacy + Print-only quotes).
            production_size: (() => {
              const pw = Number(st.print_part_width) || 0;
              const pl = Number(st.print_part_length_md) || 0;
              if (pw > 0 && pl > 0) return pw + '×' + pl;
              const cw = Number(st.part_width) || 0;
              const cl = Number(st.part_length_md) || 0;
              if (cw > 0 && cl > 0) return cw + '×' + cl;
              return '';
            })(),
            moq,
            annual_qty: eau,
            yield_pct,
            s_mat_cost: r.s_mat_cost,
            overhead: r.overhead,
            labor_cost: r.labor_cost,
            vat_loss: r.vat_loss,
            tooling: r.tooling,
            pack_ship: r.packing_ship,
            g_ttl_cost: r.s_ttl,
            target,
            usd_price: usdPrice,
            va_pct: va,
            contr_pct: contr,
            gm_pct: gm,
            trade_mode: st.trade_mode || '',
            delivery_term: st.delivery_term || '',
            npi_owner: st.npi_owner || '',
            sale_owner: st.sale_owner || '',
          });
        } catch (err) {
          console.warn('Summarize calc failed for quote', q.id, 'tier', t, err);
        }
      }
    });
    return rows;
  }, [quotes, lib]);

  const filtered = useMemo(() => {
    if (!filter) return records;
    const q = filter.toLowerCase();
    return records.filter((r) =>
      [
        r.direct_cu,
        r.direct_cu_pn,
        r.project,
        r.end_cu_pn,
        r.description,
        r.size,
        r.trade_mode,
        r.npi_owner,
      ].some((f) => (f || '').toLowerCase().includes(q))
    );
  }, [records, filter]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortCol] ?? '';
      const bv = b[sortCol] ?? '';
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortAsc ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortAsc]);

  const handleSort = useCallback(
    (col) => {
      if (sortCol === col) setSortAsc(!sortAsc);
      else {
        setSortCol(col);
        setSortAsc(true);
      }
    },
    [sortCol, sortAsc]
  );

  // Per-row selection for CSV export. `selected` keyed by `r.id`
  // (= `${quote_id}-${tier}`, unique per row). Operator can pick
  // specific quotes to export; if none picked we export everything
  // visible. Selections persist across filter changes — a row hidden
  // by the search box stays in `selected` and reappears when the
  // filter is cleared. Export rows = selected ∩ currently-visible,
  // so the operator never accidentally writes hidden rows to disk.
  const [selected, setSelected] = useState(() => new Set());

  const toggleSelected = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allVisibleSelected = sorted.length > 0 && sorted.every((r) => selected.has(r.id));
  const someVisibleSelected = !allVisibleSelected && sorted.some((r) => selected.has(r.id));
  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (sorted.every((r) => prev.has(r.id))) {
        // All visible already selected → clear (intersect with non-visible)
        const next = new Set(prev);
        for (const r of sorted) next.delete(r.id);
        return next;
      }
      // Otherwise add all visible
      const next = new Set(prev);
      for (const r of sorted) next.add(r.id);
      return next;
    });
  }, [sorted]);

  const exportCSV = useCallback(async () => {
    const cols = [
      'rfq_no',
      'quote_id',
      'tier',
      'update_date',
      'type',
      'direct_cu',
      'direct_cu_pn',
      'project',
      'end_cu_pn',
      'description',
      'size',
      // Inserted between `size` and `moq` so CSV column order matches the
      // visible table. `size` stays for backward-compat (legacy exports).
      'production_size',
      'moq',
      'annual_qty',
      'yield_pct',
      's_mat_cost',
      'overhead',
      'labor_cost',
      'vat_loss',
      'tooling',
      'pack_ship',
      'g_ttl_cost',
      'target',
      'usd_price',
      'va_pct',
      'contr_pct',
      'gm_pct',
      'trade_mode',
      'delivery_term',
      'npi_owner',
      'sale_owner',
    ];
    // Export selected-and-visible if any selections; otherwise the full
    // visible set. Hidden selections (filtered out) are never written.
    const visibleSelected = sorted.filter((r) => selected.has(r.id));
    const rowsToExport = visibleSelected.length > 0 ? visibleSelected : sorted;
    if (rowsToExport.length === 0) return; // nothing to write
    const csv = buildCsv(rowsToExport, cols);
    const suggested = `summarize_${new Date().toISOString().slice(0, 10)}${visibleSelected.length > 0 ? `_${visibleSelected.length}rows` : ''}.csv`;
    try {
      await saveCsv(csv, suggested);
    } catch (err) {
      logErr('CSV export failed:', err);
      // Surface a friendly hint — operator sees this rarely (only on
      // permission-denied or disk-full); user-cancel is caught silently
      // inside saveCsv.
      window.alert(`Export failed: ${err?.message || err}`);
    }
  }, [sorted, selected]);

  // selectedVisibleCount = how many currently-visible rows are selected.
  // Used for the button label so it never lies about "N rows" when
  // some selections are hidden by the search filter.
  const selectedVisibleCount = useMemo(
    () => sorted.reduce((n, r) => n + (selected.has(r.id) ? 1 : 0), 0),
    [sorted, selected]
  );
  const exportCount = selectedVisibleCount > 0 ? selectedVisibleCount : sorted.length;

  // Column layout per user spec:
  // # → Direct Customer → End Customer (project field, legacy naming) →
  //   End CU PN → Description → cost columns → G.Total → Target Price →
  //   Price → VA% → GM% → Trade → NPI Owner (moved to end).
  //
  // Columns with `auto: true` size to their widest content (no fixed
  // width, white-space: nowrap). Used for the identifier/name columns
  // where content length varies (Direct Customer, End Customer, End CU
  // PN, Description) — the wider labels would otherwise wrap or clip.
  const columns = [
    { key: 'rfq_no', label: 'RFQ NO', w: 140 },
    { key: 'direct_cu', label: 'Direct Customer', auto: true },
    { key: 'project', label: 'End Customer', auto: true },
    { key: 'end_cu_pn', label: 'End CU PN', auto: true },
    { key: 'description', label: 'Description', auto: true },
    {
      key: 'production_size',
      label: 'Production Size',
      w: 110,
      // Centered + tabular numerals so 220×395 vs 60×120 align under each other.
      // Sourced from `print_part_*` (Print sub-tab) with fallback to canonical
      // `part_*` per row computation above.
    },
    { key: 'moq', label: 'MOQ', w: 60, right: true },
    { key: 'yield_pct', label: 'Yield%', w: 55, right: true, fmt: (v) => pct(v) },
    { key: 's_mat_cost', label: 'Material', w: 70, right: true, fmt: (v) => fmtN(v) },
    { key: 'overhead', label: 'Overhead', w: 70, right: true, fmt: (v) => fmtN(v) },
    { key: 'labor_cost', label: 'Labor', w: 70, right: true, fmt: (v) => fmtN(v) },
    { key: 'tooling', label: 'Tooling', w: 65, right: true, fmt: (v) => fmtN(v) },
    { key: 'pack_ship', label: 'Pack&Ship', w: 65, right: true, fmt: (v) => fmtN(v) },
    { key: 'g_ttl_cost', label: 'G.Total', w: 70, right: true, fmt: (v) => fmtN(v), bold: true },
    { key: 'target', label: 'Target Price', w: 75, right: true, fmt: (v) => fmtN(v, 4) },
    { key: 'usd_price', label: 'Price', w: 65, right: true, fmt: (v) => fmtN(v, 4) },
    { key: 'va_pct', label: 'VA%', w: 55, right: true, fmt: (v) => pct(v) },
    { key: 'contr_pct', label: 'Contr. %', w: 65, right: true, fmt: (v) => pct(v) },
    { key: 'gm_pct', label: 'GM%', w: 55, right: true, fmt: (v) => pct(v), color: true },
    { key: 'trade_mode', label: 'Trade', w: 60 },
    { key: 'npi_owner', label: 'NPI Owner', w: 90 },
  ];

  return (
    <div className="sum">
      <div className="sum-header">
        <div className="sum-header-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 3v18h18" />
            <rect x="7" y="12" width="3" height="6" />
            <rect x="12" y="8" width="3" height="10" />
            <rect x="17" y="5" width="3" height="13" />
          </svg>
        </div>
        <div className="sum-header-title">Summarize &mdash; Cost Records</div>
        <input
          className="sum-search"
          type="text"
          placeholder="Search..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="sum-header-spacer" />
        <button
          className="sum-export-btn"
          onClick={exportCSV}
          disabled={exportCount === 0}
          title={
            selectedVisibleCount > 0
              ? `Export ${selectedVisibleCount} selected row(s) — native Save dialog`
              : sorted.length > 0
                ? `Export all ${sorted.length} visible row(s) — native Save dialog`
                : 'No rows to export'
          }
        >
          CSV Export{exportCount > 0 ? ` (${exportCount})` : ''}
        </button>
      </div>
      <div className="sum-table-wrap">
        <table className="sum-table">
          <thead>
            <tr>
              {/* Checkbox column header — rowSpan=2 so this TH spans both
                  the column-label row and the hint row below, keeping the
                  N+1 cell count aligned with the data rows. */}
              <th
                className="sum-select-col sum-select-header"
                rowSpan={2}
                title={
                  allVisibleSelected
                    ? 'Clear selection'
                    : someVisibleSelected
                      ? 'Select all visible rows'
                      : 'Select all visible rows for export'
                }
              >
                <input
                  type="checkbox"
                  aria-label="Select all visible rows"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected;
                  }}
                  onChange={toggleSelectAll}
                />
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  // `auto: true` columns get no width + nowrap so the
                  // browser sizes them to their widest content.
                  style={{ width: c.auto ? 'auto' : c.w, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  className={c.right ? 'right' : ''}
                  onClick={() => handleSort(c.key)}
                >
                  {c.label} {sortCol === c.key ? (sortAsc ? '\u25B2' : '\u25BC') : ''}
                </th>
              ))}
            </tr>
            <tr className="sum-select-header-row">
              {/* Checkbox column already occupies leftmost via rowSpan=2 above. */}
              <th colSpan={columns.length} className="sum-select-hint">
                {selectedVisibleCount > 0
                  ? `${selectedVisibleCount} row(s) selected — only those will be exported${selected.size > selectedVisibleCount ? ` (${selected.size - selectedVisibleCount} more hidden by filter)` : ''}`
                  : 'No rows selected — export will include all visible rows'}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="sum-empty-cell">
                  {loadError ? (
                    <EmptyState
                      icon="⚠️"
                      title="Failed to load summary"
                      hint={loadError.message || String(loadError)}
                      action={
                        <button className="op-btn op-btn-primary" onClick={refresh}>
                          Retry
                        </button>
                      }
                    />
                  ) : loading ? (
                    'Loading…'
                  ) : (
                    <EmptyState
                      icon="📊"
                      title="No summary records"
                      hint="Save Standard or Complex quotes to populate this table."
                    />
                  )}
                </td>
              </tr>
            )}
            {sorted.map((r, ri) => {
              const rowCtx = ctxMenu?.row?.id === r.id;
              return (
                <tr
                  key={r.id || ri}
                  className={rowCtx ? 'sum-row-ctx' : ''}
                  onContextMenu={(e) => handleContextMenu(e, r)}
                >
                  <td className="sum-select-col" style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      aria-label={`Select row ${r.rfq_no} tier ${r.tier} for export`}
                      checked={selected.has(r.id)}
                      onChange={() => toggleSelected(r.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  {columns.map((c) => {
                    // RFQ NO gets its own color override from the rfqColors store;
                    // other "color: true" columns (GM%) still use gmClr.
                    const rfqTint = c.key === 'rfq_no' ? rfqColors[r.rfq_no] : null;
                    return (
                      <td
                        key={c.key}
                        className={c.right ? 'right' : ''}
                        style={{
                          fontWeight: c.bold ? 700 : undefined,
                          color: rfqTint || (c.color ? gmClr(r[c.key]) : undefined),
                          whiteSpace: c.auto ? 'nowrap' : undefined,
                        }}
                      >
                        {c.fmt ? c.fmt(r[c.key]) : (r[c.key] ?? '\u2014')}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ══ Context Menu (right-click on row) ══ */}
      {ctxMenu && (
        <div ref={ctxRef} className="sum-ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <div className="sum-ctx-header">
            {ctxMenu.row.rfq_no} — {ctxMenu.row.direct_cu || 'Untitled'}
          </div>
          <div className="sum-ctx-divider" />
          <button className="sum-ctx-item" onClick={() => handleOpen(ctxMenu.row)}>
            <span className="sum-ctx-icon">📂</span>
            <span>Open</span>
            <span className="sum-ctx-shortcut">⌘O</span>
          </button>
          <div className="sum-ctx-divider" />
          {/* Color bar — tints RFQ NO text only */}
          <div className="sum-ctx-colorbar">
            {RFQ_COLOR_PALETTE.map((c) => {
              const active = rfqColors[ctxMenu.row.rfq_no] === c.color;
              return (
                <button
                  key={c.key}
                  className={`sum-ctx-dot ${active ? 'active' : ''}`}
                  style={{ background: c.color }}
                  title={c.label}
                  onClick={() => {
                    setRfqColor(ctxMenu.row.rfq_no, c.color);
                    setCtxMenu(null);
                  }}
                />
              );
            })}
            <button
              className="sum-ctx-dot sum-ctx-dot-clear"
              title="Clear color"
              onClick={() => {
                setRfqColor(ctxMenu.row.rfq_no, null);
                setCtxMenu(null);
              }}
            >
              ×
            </button>
          </div>
          <div className="sum-ctx-divider" />
          <button
            className="sum-ctx-item"
            onClick={() => {
              const r = ctxMenu.row;
              const text = `${r.rfq_no} | ${r.direct_cu || ''} | ${r.project || ''} | ${r.end_cu_pn || ''}`;
              navigator.clipboard?.writeText(text);
              setCtxMenu(null);
            }}
          >
            <span className="sum-ctx-icon">📑</span>
            <span>Copy</span>
            <span className="sum-ctx-shortcut">⌘C</span>
          </button>
        </div>
      )}
    </div>
  );
}
