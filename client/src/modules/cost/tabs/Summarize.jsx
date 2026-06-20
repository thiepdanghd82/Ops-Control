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
import { snapshotPricingParams } from '../../../services/pricingSnapshot';
import { sharedApi } from '../../../services/api';
import { RFQ_COLOR_PALETTE, setRfqColor, useRfqColors } from '../../../services/rfqColors';
import { fmtN, pct, gmClr } from '../../../utils/format';
import { useAbortableFetch } from '../../../hooks/useAbortableFetch';
import EmptyState from '../../../components/Shared/EmptyState';
import { err as logErr } from '../../../utils/logger';
import { buildCsv, saveCsv } from '../../../services/csvExport';
import { useQuoteFilters } from '../hooks/useQuoteFilters';
import { applyQuoteFilters } from '../lib/quoteFilters';
import ScopedFilterBar from '../components/ScopedFilterBar';
import ColumnsToggle from '../../../components/Shared/ColumnsToggle';
import { loadVisibleColumns } from '../../../components/Shared/ColumnsToggle.helpers';
import {
  SUMMARIZE_COLUMNS_STORAGE_KEY,
  SUMMARIZE_DEFAULT_HIDDEN_KEYS,
  CSV_ALWAYS_INCLUDE_KEYS,
} from './Summarize.columns.js';
import { formatCsvRows } from './Summarize.csvHelpers.js';
import {
  collectDrwMaterials,
  collectQuoteMaterials,
  toBulletFromTextarea,
} from './Summarize.materials.helpers.js';
import {
  sumToolingCostStd,
  sumToolingCostCpx,
  safeLeadTime,
  fmtUsd,
  fmtVnd,
} from './StandardCalc/CalcLeadTimeNotice.helpers.js';
import './Summarize.css';

// Multi-line bullet cell — used by Draw Materials / Quote Materials /
// Remark / Process / Type of Material. Source string is already a
// bullet list ("- a\n- b\n- c") via formatBulletList / toBulletFromTextarea
// in Summarize.materials.helpers.js, so the cell just needs `white-space:
// pre-line` to honour the embedded newlines. Cell is capped at
// max-height 120px with custom-scrollbar vertical scroll; full content
// also available via native `title` tooltip on hover for the read-at-a-
// glance use case where opening the cell is overkill.
function MultilineCell({ value }) {
  const s = value == null || value === '' ? '' : String(value);
  if (!s) return '—';
  return (
    <div className="sum-cell-multiline" title={s}>
      {s}
    </div>
  );
}

// Sprint S-SUMMARIZE-DATE-COL (2026-06-18) — DATE column mirroring
// QuoteHistory sidebar's date cell (dd/MM/yyyy + small HH:mm beneath).
// Source field `r.update_date` is already populated from `q.saved_at`
// by the row builder (kept in CSV_ALWAYS_INCLUDE_KEYS as raw ISO so
// downstream forensic tooling is unaffected — render here is UI-only).
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function DateCell({ value }) {
  if (!value) return '—';
  return (
    <>
      <div className="sum-d-date">{fmtDate(value)}</div>
      <div className="sum-d-time">{fmtTime(value)}</div>
    </>
  );
}

// Column config — module-scoped so ColumnsToggle.helpers loader can read
// it without recomputing per render. `rfq_no` flagged required (anchor;
// also gives operator-visible quote identity in CSV export). Other
// metadata (`w`, `right`, `auto`, `fmt`, `bold`, `color`) consumed by
// the table render below — preserved as-is from pre-refactor.
//
// Cell-render contract (extended 2026-06-10 for schema-extend sprint):
//   - `fmt(value)` — formats a primitive cell value; existing path.
//   - `render(row, ri)` — full custom JSX cell, gets the entire row
//     PLUS the visible 1-based position; takes precedence over `fmt`.
//     Used for `row_idx` (numbering) + REMARK + materials aggregation
//     (ellipsis + tooltip wrapper).
//
// `row_idx` re-numbers on every filter / sort change because `ri` comes
// from the post-sort, post-filter `sorted.map((r, ri) => ...)` index.
// Henry confirmed VISIBLE-position semantics over original quote-tier
// ordinal — matches operator UX expectation for list views.
const SUMMARIZE_COLUMNS = [
  // row_idx is UI-only — visible position has no meaning in an exported
  // CSV row (operator re-sorts in Excel anyway). `csvExclude: true`
  // makes the CSV builder skip this column even when it shows up in
  // `visibleColumns`.
  {
    key: 'row_idx',
    label: '#',
    w: 40,
    required: true,
    csvExclude: true,
    render: (_r, ri) => ri + 1,
  },
  // Sprint S-SUMMARIZE-DATE-COL (2026-06-18) — DATE column inserted
  // ahead of RFQ NO so the operator scan reads "when → what" left-to-
  // right, mirroring the QuoteHistory sidebar header order. `required`
  // so it can't be hidden (anchor identity column like rfq_no). Source
  // `r.update_date` already populated by the row builder; this entry
  // also flips the CSV header label from raw `update_date` → `DATE`
  // via the colByKey.get(k).label lookup in the CSV builder (CSV row
  // value still emits the raw ISO from CSV_ALWAYS_INCLUDE_KEYS, so
  // downstream tooling sees no value change — only a friendlier header).
  {
    key: 'update_date',
    label: 'DATE',
    w: 88,
    required: true,
    render: (r) => <DateCell value={r.update_date} />,
  },
  { key: 'rfq_no', label: 'RFQ NO', w: 140, required: true },
  // Sprint S-SALE-OWNER-COL (2026-06-16, moved 2026-06-17) — operator-
  // entered free-text Sale Owner from Pricing (Std/Cpx) → RFQ & MOQ
  // info sub-tab (shared component RfqInfoCard.jsx). Positioned
  // immediately after RFQ NO per Henry's hardware-verify request so
  // the salesperson attribution surfaces as the first identity column
  // before the customer/project chain. CSV always-include already had
  // `sale_owner` (CSV_ALWAYS_INCLUDE_KEYS below) so the column
  // appearance is purely a UI gap closure.
  { key: 'sale_owner', label: 'Sale Owner', w: 100 },
  { key: 'direct_cu', label: 'Direct Customer', auto: true },
  { key: 'project', label: 'End Customer', auto: true },
  { key: 'project_name', label: 'Project', auto: true },
  { key: 'end_cu_pn', label: 'End CU PN', auto: true },
  { key: 'description', label: 'Description', auto: true },
  { key: 'production_size', label: 'Production Size', w: 110 },
  // Materials aggregation columns — values are pre-formatted bullet
  // lists (one Main.Mat row per line); MultilineCell honours the
  // embedded \n and caps height with a scrollbar.
  {
    key: 'drw_materials',
    label: 'Draw Materials',
    w: 200,
    render: (r) => <MultilineCell value={r.drw_materials} />,
  },
  {
    key: 'quote_materials',
    label: 'Quote Materials',
    w: 200,
    render: (r) => <MultilineCell value={r.quote_materials} />,
  },
  { key: 'moq', label: 'MOQ', w: 60, right: true },
  { key: 'yield_pct', label: 'Yield%', w: 55, right: true, fmt: (v) => pct(v) },
  { key: 's_mat_cost', label: 'Material', w: 70, right: true, fmt: (v) => fmtN(v) },
  { key: 'overhead', label: 'Overhead', w: 70, right: true, fmt: (v) => fmtN(v) },
  { key: 'labor_cost', label: 'Labor', w: 70, right: true, fmt: (v) => fmtN(v) },
  // Renamed from "Tooling" → "Tooling/pcs" to disambiguate from the
  // new TOOLING_COST_USD column (which is the quote-level Σ tool_cost
  // in absolute USD, not the per-piece allocation).
  { key: 'tooling', label: 'Tooling/pcs', w: 75, right: true, fmt: (v) => fmtN(v) },
  { key: 'pack_ship', label: 'Pack&Ship', w: 65, right: true, fmt: (v) => fmtN(v) },
  { key: 'g_ttl_cost', label: 'G.Total', w: 70, right: true, fmt: (v) => fmtN(v), bold: true },
  { key: 'target', label: 'Target Price', w: 75, right: true, fmt: (v) => fmtN(v, 4) },
  // Label change "Price" → "Price (USD)" so the new VND column reads
  // unambiguously next to it. Key stays `usd_price` to keep
  // localStorage `ops-cost-summarize-cols` operator state intact
  // (key-based toggle persistence — Phase 1 ColumnsToggle contract).
  { key: 'usd_price', label: 'Price (USD)', w: 75, right: true, fmt: (v) => fmtN(v, 4) },
  // Per-tier VND price — raw read from state.selling_price_vnd
  // (tier 0) / extra_moqs[i].price_vnd (tier 1+). fmtVnd → "10,450"
  // or "—" for 0 / NaN / non-finite. en-US locale match fmtUsd so
  // both columns share thousand-separator style side by side.
  { key: 'vnd_price', label: 'Price (VND)', w: 90, right: true, fmt: (v) => fmtVnd(v) },
  // Quote-level Σ tool_cost in USD (sums across processes in Std or
  // across every subproduct's processes in Cpx). `fmtUsd` returns '—'
  // for 0 / NaN / non-finite — matches Lead Time tab cover sheet.
  {
    key: 'tooling_cost_usd',
    label: 'Tooling Cost (USD)',
    w: 110,
    right: true,
    fmt: (v) => fmtUsd(v),
  },
  // Lead Time & Notice — free-text strings from state.lead_time.
  // safeLeadTime() heals legacy quotes so the 6 fields always exist
  // (defaulted to ''). REMARK gets ClipCell because operators write
  // multi-line essays; others are short single-line text fields.
  { key: 'material_lt', label: 'Material L/T', w: 110 },
  { key: 'sample_lt', label: 'Sample L/T', w: 110 },
  { key: 'po_lt', label: 'PO L/T', w: 110 },
  // 3 multi-line Lead Time cells — operator types newline-separated
  // text in the source textarea (Pricing Std/Cpx Lead Time & Notice
  // sub-tab); row builder converts to a bullet list via
  // toBulletFromTextarea so Summarize renders one bullet per source
  // line. MultilineCell caps + scrolls; full content in `title`.
  { key: 'remark', label: 'Remark', w: 220, render: (r) => <MultilineCell value={r.remark} /> },
  { key: 'process', label: 'Process', w: 180, render: (r) => <MultilineCell value={r.process} /> },
  {
    key: 'type_of_material',
    label: 'Type of Material',
    w: 180,
    render: (r) => <MultilineCell value={r.type_of_material} />,
  },
  { key: 'va_pct', label: 'VA%', w: 55, right: true, fmt: (v) => pct(v) },
  { key: 'contr_pct', label: 'Contr. %', w: 65, right: true, fmt: (v) => pct(v) },
  { key: 'gm_pct', label: 'GM%', w: 55, right: true, fmt: (v) => pct(v), color: true },
  { key: 'trade_mode', label: 'Trade', w: 60 },
  { key: 'npi_owner', label: 'NPI Owner', w: 90 },
  // Phase 4 — pricing-snapshot status pill (default hidden; operator
  // opts in via ColumnsToggle when auditing whether quotes are frozen
  // vs running on live rates).
  {
    key: 'snapshot_status',
    label: 'Snapshot',
    w: 90,
    render: (r) => {
      const snap = r.pricing_snapshot;
      if (!snap || !snap._captured_at) {
        return <span className="sum-snap-pill sum-snap-pill-empty">No snapshot</span>;
      }
      if (snap._synthesized) {
        return <span className="sum-snap-pill sum-snap-pill-live">Live</span>;
      }
      return <span className="sum-snap-pill sum-snap-pill-frozen">Frozen</span>;
    },
  },
];
// Sprint B3b / A3-03 (2026-06-19) — shape constants now live in
// the React-free Summarize.columns.js companion (imported at the
// top of this file). IMPORTANT: when adding/removing a column to
// SUMMARIZE_COLUMNS above, ALSO update SUMMARIZE_COLUMN_KEYS in
// Summarize.columns.js — the fixture test will fail loudly on
// length drift.

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
function aggregateCplxTier(cs, sps, lib, tierIdx, options = {}) {
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
      // Phase 3: propagate snapshot to the SP-level calcAll so the
      // aggregated Cpx tier honours frozen rates per saved quote.
      return calcAll(spSt, null, lib, null, options);
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
      return calcAll(spSt, pass1, lib, tieredSps, options);
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
  // Visible columns — loaded from localStorage on mount via helper so
  // initial render reflects the persisted toggle state (no flash from
  // full set → filtered set). ColumnsToggle component owns hiddenKeys
  // internally + fires onChange with already-filtered visibleColumns.
  const [visibleColumns, setVisibleColumns] = useState(() =>
    loadVisibleColumns(
      SUMMARIZE_COLUMNS,
      SUMMARIZE_COLUMNS_STORAGE_KEY,
      SUMMARIZE_DEFAULT_HIDDEN_KEYS
    )
  );
  const { filter, debouncedFilter, setField, clearField, clearAll, hasActiveFilter } =
    useQuoteFilters();
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
        let moq, usdPrice, vndPrice, eau, target;
        if (t === 0) {
          moq = st.moq || 0;
          usdPrice = st.selling_price || 0;
          // Tier 0 reads the quote-level mirror; CalcHeader.jsx
          // setPriceUsd/setPriceVnd keep selling_price_vnd in sync at
          // write time (Sprint 1.7g pattern). No USD × usd_rate fallback
          // — operator stated VND data is always raw-direct.
          vndPrice = Number(st.selling_price_vnd) || 0;
          eau = st.annual_qty || 0;
          target = st.target;
        } else {
          const em = (st.extra_moqs || [])[t - 1];
          if (!em) continue;
          moq = em.moq || 0;
          usdPrice = em.price || 0;
          vndPrice = Number(em.price_vnd) || 0;
          eau = em.eau || st.annual_qty || 0;
          target = em.target;
        }
        try {
          let r,
            yield_pct = 1;
          // Phase 3 — each saved quote carries its own pricing_snapshot
          // (or none → synthesize from current lib). Resolved once per
          // quote, reused across every tier walk.
          const { snapshot } = snapshotPricingParams(st, lib);
          const calcOpts = { snapshot };
          if (isCplx) {
            const sps = st.subproducts || [];
            r = aggregateCplxTier(st, sps, lib, t, calcOpts);
            // Yield = 1 - Σ(scrap_pct) across every process in every SP.
            yield_pct = yieldFromSubproducts(sps);
          } else {
            const tierSt = buildTierState(st, t, usdPrice, moq, eau);
            r = calcAll(tierSt, null, lib, null, calcOpts);
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
            // Bổ sung end_cu cho shared filter (S-PROJFIX fallback chain in
            // applyQuoteFilters reads end_cu || project so Standard quotes
            // — which alias End Customer into state.project — stay searchable).
            end_cu: st.end_cu || '',
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
            // Per-tier raw VND from CalcHeader (Sprint 1.7g mirror).
            // Falls back to 0 → fmtVnd → "—" for legacy quotes without
            // selling_price_vnd / extra_moqs[i].price_vnd populated.
            vnd_price: vndPrice,
            va_pct: va,
            contr_pct: contr,
            gm_pct: gm,
            trade_mode: st.trade_mode || '',
            delivery_term: st.delivery_term || '',
            npi_owner: st.npi_owner || '',
            sale_owner: st.sale_owner || '',
            // ─── Schema-extend sprint (2026-06-10) ──────────────────
            // Sync from Pricing (Std/Cpx) sub-tabs into the row so the
            // operator can browse + filter + CSV-export without round-
            // tripping through Quote History → Open quote.
            project_name: st.project_name || '',
            // Phase 4 — pass-through snapshot for the optional Snapshot
            // status column. Read-only; render-time only.
            pricing_snapshot: st.pricing_snapshot || null,
            drw_materials: collectDrwMaterials(st),
            quote_materials: collectQuoteMaterials(st),
            // Σ tool_cost across the quote. Branch on q.type because
            // Cpx walks subproducts whereas Std walks top-level
            // processes. Both helpers tolerate missing arrays.
            tooling_cost_usd:
              q.type === 'complex'
                ? sumToolingCostCpx(st.subproducts)
                : sumToolingCostStd(st.processes),
            // 6 Lead Time & Notice fields — heal-on-read via
            // safeLeadTime so legacy quotes (saved before Sprint S-D21-
            // LEADTIME) get empty strings, not undefined → no
            // ?.optional-chain in the renderer. The 3 multi-line fields
            // (remark / process / type_of_material) are reformatted as
            // bullet lists so the Summarize cell shows one bullet per
            // operator-typed source line; the 3 single-line LT fields
            // stay as plain text (UX would gain nothing from bullets).
            ...(() => {
              const lt = safeLeadTime(st.lead_time);
              return {
                material_lt: lt.lt_material,
                sample_lt: lt.lt_sample,
                po_lt: lt.lt_po,
                remark: toBulletFromTextarea(lt.lt_remark),
                process: toBulletFromTextarea(lt.lt_process),
                type_of_material: toBulletFromTextarea(lt.lt_material_type),
              };
            })(),
          });
        } catch (err) {
          console.warn('Summarize calc failed for quote', q.id, 'tier', t, err);
        }
      }
    });
    return rows;
  }, [quotes, lib]);

  const filtered = useMemo(
    () => applyQuoteFilters(records, debouncedFilter),
    [records, debouncedFilter]
  );

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
    // CSV column composition (Option B agreed at Phase-1 scope):
    //   - Always-include audit prefix: quote_id, tier, update_date, type,
    //     sale_owner — operator workflows rely on these for cross-ref
    //     with Quote History + multi-tier MOQ diff + timestamp forensic.
    //   - Then visibleColumns (post-toggle): respects operator's column
    //     toggle for display fields. Empty hidden = original full set
    //     (minus `direct_cu_pn` / `annual_qty` / `vat_loss` /
    //     `delivery_term` which were never in displayed columns config —
    //     same drop as pre-toggle behavior; if Henry needs them back,
    //     add to SUMMARIZE_COLUMNS as required: false).
    // Dedupe defensively in case visibleColumns somehow overlaps prefix.
    // Also filter `csvExclude: true` columns (currently row_idx — the
    // visible row counter has no meaning in a re-sortable CSV row).
    const csvExcludedKeys = new Set(
      SUMMARIZE_COLUMNS.filter((c) => c.csvExclude).map((c) => c.key)
    );
    const colByKey = new Map(SUMMARIZE_COLUMNS.map((c) => [c.key, c]));
    const visibleKeys = visibleColumns.map((c) => c.key);
    const seen = new Set();
    const cols = [];
    // Parallel array — operator-facing header label per column. For
    // SUMMARIZE_COLUMNS entries we use `c.label` so the CSV header
    // matches the on-screen column name (e.g. "End Customer" not
    // `project`, which is the internal key holding aliased text per
    // S-PROJFIX / Lesson 21). Most CSV_ALWAYS_INCLUDE_KEYS (quote_id,
    // tier, update_date, type) have no SUMMARIZE_COLUMNS entry; their
    // keys are machine-style identifiers operators already recognise
    // so we ship them as-is. `sale_owner` is in BOTH (Sprint S-SALE-
    // OWNER-COL added it as a visible/sortable column) — dedupe keeps
    // the prefix slot but colByKey.get() now hands back the friendly
    // "Sale Owner" header instead of the raw key.
    const headers = [];
    for (const k of [...CSV_ALWAYS_INCLUDE_KEYS, ...visibleKeys]) {
      if (seen.has(k)) continue;
      if (csvExcludedKeys.has(k)) continue;
      cols.push(k);
      const colDef = colByKey.get(k);
      headers.push(colDef && colDef.label ? colDef.label : k);
      seen.add(k);
    }
    // Export selected-and-visible if any selections; otherwise the full
    // visible set. Hidden selections (filtered out) are never written.
    const visibleSelected = sorted.filter((r) => selected.has(r.id));
    const rowsToExport = visibleSelected.length > 0 ? visibleSelected : sorted;
    if (rowsToExport.length === 0) return; // nothing to write
    // MES-3-FIX-60 (2026-06-19) — apply each column's UI `fmt` to its
    // CSV cell value so operators opening summarize_*.csv see the same
    // numeric precision + percent suffix as the on-screen table.
    // Audit-prefix slots (quote_id / tier / update_date / type /
    // sale_owner) have no SUMMARIZE_COLUMNS entry → formatCsvCell
    // returns raw; ISO timestamps + plain text untouched.
    const formattedRows = formatCsvRows(rowsToExport, cols, colByKey);
    const csv = buildCsv(formattedRows, cols, { headers });
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
  }, [sorted, selected, visibleColumns]);

  // selectedVisibleCount = how many currently-visible rows are selected.
  // Used for the button label so it never lies about "N rows" when
  // some selections are hidden by the search filter.
  const selectedVisibleCount = useMemo(
    () => sorted.reduce((n, r) => n + (selected.has(r.id) ? 1 : 0), 0),
    [sorted, selected]
  );
  const exportCount = selectedVisibleCount > 0 ? selectedVisibleCount : sorted.length;

  // Column layout per user spec — declared MODULE-SCOPED above as
  // `SUMMARIZE_COLUMNS` so the ColumnsToggle helper can load persisted
  // hidden keys at useState init. `visibleColumns` (state below) is the
  // filtered subset after operator toggles. Per-render fmt closures
  // (e.g. `pct(v)`) capture module imports at the top of this file, so
  // closures resolve correctly even though SUMMARIZE_COLUMNS is declared
  // outside the function body.
  //
  // # → Direct Customer → End Customer (project field, legacy naming) →
  //   End CU PN → Description → cost columns → G.Total → Target Price →
  //   Price → VA% → GM% → Trade → NPI Owner (moved to end).
  //
  // Columns with `auto: true` size to their widest content (no fixed
  // width, white-space: nowrap). Used for the identifier/name columns
  // where content length varies (Direct Customer, End Customer, End CU
  // PN, Description) — the wider labels would otherwise wrap or clip.

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
      </div>
      <ScopedFilterBar
        filter={filter}
        setField={setField}
        clearField={clearField}
        clearAll={clearAll}
        hasActiveFilter={hasActiveFilter}
        resultCount={sorted.length}
        totalCount={records.length}
        globalPlaceholder="Search RFQ / Customer / Part / Sale Owner / NPI Owner…"
        rightSlot={
          <>
            <ColumnsToggle
              columns={SUMMARIZE_COLUMNS}
              storageKey={SUMMARIZE_COLUMNS_STORAGE_KEY}
              onChange={setVisibleColumns}
              defaultHiddenKeys={SUMMARIZE_DEFAULT_HIDDEN_KEYS}
            />
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
          </>
        }
      />
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
              {visibleColumns.map((c) => (
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
              <th colSpan={visibleColumns.length} className="sum-select-hint">
                {selectedVisibleCount > 0
                  ? `${selectedVisibleCount} row(s) selected — only those will be exported${selected.size > selectedVisibleCount ? ` (${selected.size - selectedVisibleCount} more hidden by filter)` : ''}`
                  : 'No rows selected — export will include all visible rows'}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="sum-empty-cell">
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
                  {visibleColumns.map((c) => {
                    // RFQ NO gets its own color override from the rfqColors store;
                    // other "color: true" columns (GM%) still use gmClr.
                    const rfqTint = c.key === 'rfq_no' ? rfqColors[r.rfq_no] : null;
                    // Render contract: `render(row, ri)` wins over `fmt(value)`.
                    // Used for row_idx (visible position), REMARK + materials
                    // (ellipsis + tooltip via ClipCell). Existing 21 cols
                    // keep using `fmt` \u2014 fully backward compatible.
                    const cellContent = c.render
                      ? c.render(r, ri)
                      : c.fmt
                        ? c.fmt(r[c.key])
                        : (r[c.key] ?? '\u2014');
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
                        {cellContent}
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
