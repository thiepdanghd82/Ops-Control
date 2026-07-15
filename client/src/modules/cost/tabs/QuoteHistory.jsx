import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { sharedApi, costApi } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { useCalc } from '../../../context/CalcContext';
import { useFeatureFlag } from '../../../context/useAppConfig';
import { useI18n } from '../../../utils/useI18n';
import MaterialActiveBadge from '../../../components/Shared/MaterialActiveBadge';
import { summariseMaterialActive } from '../../../components/Shared/materialActiveBadgeSummary';
import { RFQ_COLOR_PALETTE, setRfqColor, useRfqColors } from '../../../services/rfqColors';
import EmptyState from '../../../components/Shared/EmptyState';
import SkeletonTable from '../../../components/Shared/SkeletonTable';
import { err as logErr } from '../../../utils/logger';
import ApprovalStatusBadge from '../../../components/Shared/ApprovalStatusBadge';
import ApprovalActionsCell from '../../../components/Shared/ApprovalActionsCell';
import ApprovalHistoryModal from '../../../components/Shared/ApprovalHistoryModal';
import Modal from '../../../components/Shared/Modal';
import { getStatus as getApprovalStatus } from '../../../utils/approvalWorkflow';
import { useAbortableFetch } from '../../../hooks/useAbortableFetch';
import { useAutoRefresh, formatLastRefresh } from '../../../utils/useAutoRefresh';
import { subscribeDataEvents } from '../../../services/dataEventBus';
import { useAccess } from '../../../context/useAccess';
import ExportModal from './QuoteHistory/ExportModal';
import { useQuoteFilters } from '../hooks/useQuoteFilters';
import { applyQuoteFilters, quoteAccessor } from '../lib/quoteFilters';
import ScopedFilterBar from '../components/ScopedFilterBar';
import ColumnsToggle from '../../../components/Shared/ColumnsToggle';
import { loadVisibleColumns } from '../../../components/Shared/ColumnsToggle.helpers.js';
import {
  QUOTE_HISTORY_SORT_FNS,
  QUOTE_HISTORY_DEFAULT_HIDDEN_KEYS,
  QUOTE_HISTORY_STORAGE_KEY,
  resolveSortKey,
} from './QuoteHistory.columns.js';
import './QuoteHistory.css';
import './QuoteHistory/ExportModal.css';

const PAGE_SIZE = 100;

// Module-scoped sort-header cell. Previously defined inside QuoteHistory,
// which React 19's react-hooks/static-components rule correctly flags
// (each render allocates a fresh component function → defeats memo).
// Lifting it out lets React reuse the definition across renders.
function SortTh({ children, id, className, style, sortKey, sortDir, toggleSort }) {
  const active = sortKey === id;
  return (
    <th
      className={`qh-col ${className || ''} ${active ? 'qh-sort-on' : ''}`}
      style={style}
      onClick={() => toggleSort(id)}
    >
      {children}
      {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );
}

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
function fmtNum(v) {
  return v == null || v === '' ? '—' : Number(v).toLocaleString('en-US');
}
function fmtPrice(v) {
  return v == null || v === ''
    ? '—'
    : Number(v)
        .toFixed(4)
        .replace(/\.?0+$/, '');
}
function fmtPct(v) {
  return v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`;
}
function fmtSize(w, h) {
  if (w == null && h == null) return '—';
  if (!w && !h) return '—';
  return `${w}×${h} mm`;
}

function gmClass(gm) {
  const p = (Number(gm) || 0) * 100;
  return p >= 20 ? 'gm-green' : p >= 10 ? 'gm-amber' : 'gm-red';
}

/**
 * Full column config — drives BOTH the <thead> sort-header row and the
 * <tbody> cell render. Lives at module scope so ColumnsToggle's
 * useEffect (which depends on `columns` identity) doesn't fire every
 * parent render. Sort fns live in QuoteHistory.columns.js so the pure
 * pieces can be unit-tested via vanilla node:test.
 *
 * Render contract:
 *   - First arg `q` is the raw quote row.
 *   - Second arg `ctx` is a per-row bag with `idx`, helper hooks
 *     (`t`, `rfqColors`, `user`, `altMaterialsEnabled`, `canExport`),
 *     setters (`setExportModal`, `setHistoryModal`,
 *     `reloadAfterTransition`), and a pre-computed `derived` block to
 *     avoid recomputing s/r/gmVal/vaVal/contrVal/etc. per cell.
 *
 * Header rendering: `labelKey` resolves through `t()`. Width/thClass
 * captured here so the popover-driven visible subset re-renders with
 * the original column widths preserved.
 */
const QUOTE_HISTORY_COLUMNS = [
  {
    key: 'num',
    label: '#',
    required: true,
    width: 28,
    thClass: 'qh-c-num',
    tdClass: 'qh-d-num',
    render: (q, ctx) => ctx.idx + 1,
  },
  {
    key: 'date',
    labelKey: 'qh.date',
    required: true,
    sortable: true,
    width: 88,
    tdClass: 'qh-d-date',
    render: (q) => (
      <>
        <div>{fmtDate(q.saved_at)}</div>
        <div className="qh-d-time">{fmtTime(q.saved_at)}</div>
      </>
    ),
  },
  {
    key: 'rfq',
    labelKey: 'qh.rfq_number',
    required: true,
    sortable: true,
    width: 120,
    tdClass: 'qh-d-rfq',
    // RFQ color tint is dynamic per-row; tdStyleFn lets the renderer
    // apply `color: rfqColors[s.rfq_number]` without forcing the
    // cell map to know about the rfqColors store.
    tdStyleFn: (q, ctx) => ({ color: ctx.rfqColors[q.state?.rfq_number] || undefined }),
    render: (q) => q.state?.rfq_number || '—',
  },
  {
    key: 'option',
    labelKey: 'qh.option',
    width: 180,
    sortable: true,
    tdClass: 'qh-d-option',
    render: (q, ctx) => {
      const opts = q.state?.options || '';
      return (
        <>
          {opts && (
            <span className="qh-option-text" title={opts}>
              {opts}
            </span>
          )}
          <span className={`qh-tb ${q.type === 'complex' ? 'tb-cpx' : 'tb-std'}`}>
            {q.type === 'complex' ? 'CPX' : 'STD'}
          </span>
          {ctx.altMaterialsEnabled && (
            <MaterialActiveBadge
              summary={summariseMaterialActive(q.state || {}, q.type)}
              t={ctx.t}
            />
          )}
        </>
      );
    },
  },
  {
    key: 'ul',
    labelKey: 'qh.ul',
    width: 32,
    thClass: 'qh-c-ctr',
    tdClass: 'qh-d-ul',
    render: (q) => (q.state?.underwriter ? 'N' : ''),
  },
  {
    key: 'owner',
    labelKey: 'qh.owner',
    sortable: true,
    width: 100,
    tdClass: 'qh-d-owner',
    render: (q) => q.state?.npi_owner || q.npi_owner || '—',
  },
  // Sprint S-SALE-OWNER-COL (2026-06-16) — Sale Owner from RFQ & MOQ
  // info sub-tab (shared RfqInfoCard.jsx). Reads top-level state.sale_owner
  // for both Std + Cpx. Placed next to owner (NPI) so both operator
  // attribution columns sit together.
  {
    key: 'sale',
    labelKey: 'qh.sale_owner',
    sortable: true,
    width: 100,
    tdClass: 'qh-d-owner',
    render: (q) => q.state?.sale_owner || '—',
  },
  {
    key: 'direct_cu',
    labelKey: 'qh.direct_cu',
    sortable: true,
    width: 100,
    tdClass: 'qh-d-dcu',
    render: (q) => q.state?.direct_cu || '—',
  },
  {
    key: 'end_cu',
    labelKey: 'qh.end_cu',
    sortable: true,
    width: 90,
    tdClass: 'qh-d-ecu',
    // S-PROJFIX (Lesson 21) — Standard's aliasMap stores End Customer
    // text under state.project for Standard quotes; Complex writes to
    // state.end_cu directly. Fallback covers both.
    render: (q) => q.state?.end_cu || q.state?.project || '—',
  },
  {
    key: 'project',
    labelKey: 'qh.project',
    sortable: true,
    width: 90,
    tdClass: 'qh-d-proj',
    render: (q) => q.state?.project_name || '—',
  },
  {
    key: 'ifs',
    labelKey: 'qh.ifs_code',
    sortable: true,
    width: 130,
    thClass: 'qh-c-ifs',
    tdClass: 'qh-d-ifs',
    render: (q) => q.state?.ccl_pn || '—',
  },
  {
    key: 'dcu_pn',
    labelKey: 'qh.direct_cu_pn',
    sortable: true,
    width: 110,
    tdClass: 'qh-d-dcupn',
    render: (q) => q.state?.direct_cu_pn || '—',
  },
  {
    key: 'ecu_pn',
    labelKey: 'qh.end_cu_pn',
    width: 90,
    tdClass: 'qh-d-ecupn',
    render: (q) => q.state?.end_cu_pn || '—',
  },
  {
    key: 'size',
    labelKey: 'qh.size',
    width: 85,
    tdClass: 'qh-d-size',
    render: (q, ctx) => fmtSize(ctx.derived.sizeW, ctx.derived.sizeH),
  },
  {
    key: 'materials',
    labelKey: 'qh.materials',
    width: 110,
    tdClass: 'qh-d-mats',
    // Materials cell needs a title tooltip equal to the cell text, so the
    // renderer overrides td-level props via tdPropsFn.
    tdPropsFn: (q, ctx) => ({ title: ctx.derived.matStr }),
    render: (q, ctx) => ctx.derived.matStr || '—',
  },
  {
    key: 'trade_mode',
    labelKey: 'qh.trade_mode',
    width: 80,
    tdClass: 'qh-d-trade',
    render: (q) =>
      q.state?.trade_mode ? <span className="qh-trade">{q.state.trade_mode}</span> : '—',
  },
  {
    key: 'design',
    labelKey: 'qh.design',
    width: 75,
    tdClass: 'qh-d-design',
    render: (q, ctx) => ctx.derived.design || '—',
  },
  {
    key: 'moq',
    labelKey: 'qh.moq',
    sortable: true,
    width: 75,
    thClass: 'qh-c-r',
    tdClass: 'qh-d-moq',
    render: (q) => fmtNum(q.state?.moq),
  },
  {
    key: 'sell',
    labelKey: 'qh.sell_price',
    sortable: true,
    width: 80,
    thClass: 'qh-c-r',
    tdClass: 'qh-d-sell',
    render: (q) => fmtPrice(q.state?.selling_price),
  },
  {
    key: 'price_vnd',
    labelKey: 'qh.price_vnd',
    sortable: true,
    width: 100,
    thClass: 'qh-c-r',
    tdClass: 'qh-d-price-vnd',
    // Sprint 1.7g — auto-synced from RFQ & MOQ Pricing info. Falls
    // back to USD × usd_rate when the explicit VND mirror is absent.
    render: (q) => {
      const s = q.state || {};
      if (s.selling_price_vnd != null && s.selling_price_vnd !== '')
        return fmtNum(s.selling_price_vnd);
      if (Number.isFinite(+s.selling_price) && Number.isFinite(+s.usd_rate)) {
        return fmtNum(Number(s.selling_price) * Number(s.usd_rate));
      }
      return '—';
    },
  },
  {
    key: 'target',
    labelKey: 'qh.target',
    width: 65,
    thClass: 'qh-c-r',
    tdClass: 'qh-d-target',
    render: (q, ctx) => (ctx.derived.target ? fmtPrice(ctx.derived.target) : '—'),
  },
  {
    key: 'va',
    labelKey: 'qh.va_pct',
    sortable: true,
    width: 50,
    thClass: 'qh-c-r',
    tdClass: 'qh-d-va',
    render: (q, ctx) => (ctx.derived.vaVal != null ? fmtPct(ctx.derived.vaVal) : '—'),
  },
  {
    key: 'contr',
    labelKey: 'qh.contr_pct',
    sortable: true,
    width: 60,
    thClass: 'qh-c-r',
    tdClass: 'qh-d-contr',
    render: (q, ctx) => (ctx.derived.contrVal != null ? fmtPct(ctx.derived.contrVal) : '—'),
  },
  {
    key: 'gm',
    labelKey: 'qh.gm_pct',
    sortable: true,
    width: 55,
    thClass: 'qh-c-ctr',
    tdClass: 'qh-d-gm',
    render: (q, ctx) => {
      const { gmVal } = ctx.derived;
      return gmVal != null ? (
        <span className={`qh-gm ${gmClass(gmVal)}`}>{fmtPct(gmVal)}</span>
      ) : (
        '—'
      );
    },
  },
  {
    key: 'status',
    labelKey: 'qh.status',
    required: true,
    sortable: true,
    width: 120,
    tdClass: 'qh-d-status',
    tdStyle: { textAlign: 'left' },
    render: (q, ctx) => (
      <ApprovalStatusBadge
        approval={q.state?.approval}
        onOpenHistory={() =>
          ctx.setHistoryModal({
            approval: q.state?.approval || null,
            label: q.state?.ccl_pn || q.state?.rfq_number || `#${q.id}`,
          })
        }
      />
    ),
  },
  {
    key: 'approve',
    labelKey: 'qh.quote_progress',
    required: true,
    width: 170,
    thClass: 'qh-c-ctr',
    tdClass: 'qh-d-approve',
    tdStyle: { textAlign: 'center' },
    render: (q, ctx) => (
      <ApprovalActionsCell
        quote={q}
        user={ctx.user}
        onAfterTransition={ctx.reloadAfterTransition}
      />
    ),
  },
  {
    key: 'layout',
    labelKey: 'qh.layout',
    required: true,
    width: 90,
    thClass: 'qh-c-ctr',
    tdClass: 'qh-d-acts',
    // Layout cell hosts the Export button (xlsx download trigger) +
    // the layout-attached badge (green ✓ or red ✗). Open/Copy/Delete
    // live in the right-click context menu, not here.
    render: (q, ctx) => (
      <>
        {ctx.canExport && (
          <button
            type="button"
            className="qe-trigger"
            title={ctx.t('qexp.button.tooltip')}
            aria-label={ctx.t('qexp.button.tooltip')}
            onClick={(e) => {
              e.stopPropagation();
              ctx.setExportModal({ quote: q });
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        )}
        {q.has_layout || q.state?.layout_files?.length || q.state?.layout_file?.name ? (
          <span className="qh-act-layout qh-layout-yes" title="Layout attached">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#16a34a"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        ) : (
          <span className="qh-act-layout qh-layout-no" title="No layout">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#dc2626"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </span>
        )}
      </>
    ),
  },
];

export default function QuoteHistory() {
  const { hasRole, user } = useAuth();
  const { setPendingQuote } = useCalc();
  const { t } = useI18n();
  const altMaterialsEnabled = useFeatureFlag('alt_materials');
  const canDelete = hasRole('cost');
  // Sprint AR — hook-managed fetch. `refresh` is wired up to the
  // transition + delete write paths so actions that mutate server
  // state re-pull the authoritative list. setData handles optimistic
  // local updates (e.g. color pick) without a network round-trip.
  const {
    data: rawQuotes,
    setData: setQuotes,
    loading,
    initialLoading,
    error: loadError,
    refresh,
  } = useAbortableFetch((signal) => sharedApi.getQuotes({ signal }), [], {
    onError: (err) => err?.name !== 'AbortError' && logErr('Failed to load quotes:', err),
  });
  const quotes = useMemo(() => (Array.isArray(rawQuotes) ? rawQuotes : []), [rawQuotes]);
  const { filter, debouncedFilter, setField, clearField, clearAll, hasActiveFilter } =
    useQuoteFilters();
  const [filterType, setFilterType] = useState('all');
  const [page, setPage] = useState(0);
  // Reset to page 0 whenever the applied filter or pill changes so the
  // user lands on the first page of results instead of an out-of-range page.
  useEffect(() => {
    setPage(0);
  }, [debouncedFilter, filterType]);
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  // Column visibility — Phase 2. State lives in QuoteHistory so the
  // table-render path consumes it without prop-drilling through
  // ScopedFilterBar. ColumnsToggle owns the popover UI + persistence;
  // onChange feeds the filtered subset back here. Module-scoped
  // QUOTE_HISTORY_COLUMNS keeps the columns prop identity stable so the
  // toggle's useEffect doesn't fire every parent render.
  const toggleColumns = useMemo(
    () =>
      QUOTE_HISTORY_COLUMNS.map((c) => ({
        ...c,
        label: c.labelKey ? t(c.labelKey) : c.label,
      })),
    [t]
  );
  const [visibleColumns, setVisibleColumns] = useState(() =>
    loadVisibleColumns(toggleColumns, QUOTE_HISTORY_STORAGE_KEY, QUOTE_HISTORY_DEFAULT_HIDDEN_KEYS)
  );
  // Resilience guard — when the active sortKey is hidden via the toggle
  // (or rewritten by the legacy 'npi' → 'owner' rename path), snap back
  // to `date desc` so the sort tick stays well-defined and the header
  // doesn't render an arrow on a hidden column.
  useEffect(() => {
    const visibleKeySet = new Set(visibleColumns.map((c) => c.key));
    const resolved = resolveSortKey(sortKey, visibleKeySet);
    if (resolved !== sortKey) {
      setSortKey(resolved);
      setSortDir('desc');
    }
  }, [visibleColumns, sortKey]);
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, quote }
  const [historyModal, setHistoryModal] = useState(null); // { approval, label }
  // Sprint 13 UI — Trash modal. Lazy-loads on open: `null` = closed,
  // `{ loading: true }` while fetching, `{ items: [...] }` once loaded.
  const [trashModal, setTrashModal] = useState(null);
  // Sprint S-EXPORT-UI — export dialog. `null` = closed; `{ quote }` = open
  // for that row. Permission gate handled at trigger render — `useAccess`
  // returns 'edit' as fallback when AccessProvider is mid-load (matches
  // existing tab gating).
  const [exportModal, setExportModal] = useState(null);
  const { access: tabAccess } = useAccess();
  const canExport = tabAccess('quote-history') !== 'hidden';
  const ctxRef = useRef(null);
  const rfqColors = useRfqColors();

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!ctxMenu) return;
    function handleClick(e) {
      if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtxMenu(null);
    }
    function handleKey(e) {
      if (e.key === 'Escape') setCtxMenu(null);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [ctxMenu]);

  function handleContextMenu(e, quote) {
    e.preventDefault();
    // Get position relative to the qh-root container
    const rect = e.currentTarget.closest('.qh-root')?.getBoundingClientRect() || {
      left: 0,
      top: 0,
    };
    setCtxMenu({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      quote,
    });
  }

  // load + abort-on-unmount now handled by useAbortableFetch above.
  // reloadAfterTransition below forwards to the hook's refresh().
  //
  // v1.3 P0 — Auto-refresh every 30s khi tab visible. User khác save
  // quote, máy mình thấy trong vòng 30s mà không phải reload tay.
  // Pause tự động khi tab hidden (visibilitychange API).
  const { lastRefreshedAt, isRefreshing } = useAutoRefresh(refresh, {
    intervalMs: 30000,
    enabled: true,
    pauseWhenHidden: true,
    runOnMount: false, // initial load đã do useAbortableFetch handle
  });

  // v1.3 Đợt 2 — instant push refresh on server-side data changes.
  // SSE event bus emits quote.saved / quote.deleted whenever any user
  // posts/patches/deletes; we refetch immediately instead of waiting
  // for the 30s polling tick. SSE failure falls back silently to the
  // poll above, so this is a pure latency improvement.
  useEffect(() => {
    const unsub = subscribeDataEvents(
      ['quote.saved', 'quote.deleted', 'approval.transition'],
      () => {
        refresh();
      }
    );
    return unsub;
  }, [refresh]);

  // After a server-side transition we re-fetch to pick up the new
  // approval object (the atomic endpoint only returns the one changed
  // quote; refreshing the full list keeps sort-by-status coherent).
  // Hook's `refresh` internally aborts any in-flight load, so rapid
  // transitions never race.
  const reloadAfterTransition = useCallback(() => {
    refresh();
  }, [refresh]);

  // Option 3 anti-flash for approval Approve/Reject: optimistic local
  // mutation of the quote's approval state so the row updates instantly.
  // Unlike PendingApprovalsInbox (where the row is removed), QuoteHistory
  // shows ALL quotes regardless of approval state — we just refresh
  // after the API call to pick up the new status from the server.
  // The "remove" pattern doesn't apply; instead we drop the optimistic
  // hook and rely on the existing refresh-after-success path.
  // (Inbox is the high-frequency target — this tab is browse-mostly.)

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const filtered = useMemo(() => {
    let r = quotes;
    if (filterType !== 'all') r = r.filter((q) => q.type === filterType);
    // Shared scoped + global filter (S-PROJFIX + NPI fallback preserved in
    // quoteAccessor). AND-combine across query / date range / customer /
    // part / sale boxes; empty/null fields are skipped.
    r = applyQuoteFilters(r, debouncedFilter, quoteAccessor);
    const getter = QUOTE_HISTORY_SORT_FNS[sortKey] || QUOTE_HISTORY_SORT_FNS.date;
    return [...r].sort((a, b) => {
      const va = getter(a),
        vb = getter(b);
      return va < vb ? (sortDir === 'asc' ? -1 : 1) : va > vb ? (sortDir === 'asc' ? 1 : -1) : 0;
    });
  }, [quotes, debouncedFilter, filterType, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Defense-in-depth: if the stored page lands out of range (e.g. the
  // filtered set shrank via an async quotes refresh), clamp to the
  // last valid page on the fly. Search/filter change handlers already
  // setPage(0) eagerly, so this branch rarely fires in practice.
  const effectivePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(effectivePage * PAGE_SIZE, (effectivePage + 1) * PAGE_SIZE);

  function handleCopy(q) {
    _openQuoteInCalc(q.id, q.type || 'standard', 'copy');
  }

  // Publish the handoff via CalcContext (single source of truth) and
  // switch tabs. The target calc tab subscribes to pendingQuote and
  // consumes+clears it on the next render — no sessionStorage races.
  function _openQuoteInCalc(id, type, action) {
    setPendingQuote(id, type, action || 'load');
    const targetTab = type === 'complex' ? 'complex' : 'standard';
    window.dispatchEvent(new CustomEvent('ops-switch-tab', { detail: targetTab }));
  }

  function handleDelete(q) {
    // Sprint 13 — soft-delete by default. The quote moves to Trash and
    // can be restored within 30 days; nothing is wiped on disk yet.
    // Saves us from the "operator clicked Delete by accident" incident
    // that previously required a full backup restore.
    if (
      !confirm(
        `Move quote #${q.id} — ${q.state?.ccl_pn || q.state?.rfq_number || ''} to Trash?\n\nYou can restore it later from the Trash tab.`
      )
    )
      return;
    // Option 3 anti-flash: TRUE optimistic delete. Drop the row BEFORE
    // the network call so the operator sees the result instantly. On
    // error we restore via setQuotes(before) + refresh() to reconcile
    // with the server's canonical view.
    const before = quotes;
    setQuotes(quotes.filter((x) => x.id !== q.id));
    costApi
      .trashQuote(q.id)
      .then(() => {
        // Server confirmed — already removed locally, nothing else to do.
      })
      .catch((err) => {
        console.error('Failed to trash quote:', err);
        // Restore + refresh to pick up canonical state.
        setQuotes(before);
        refresh();
        alert('Trash failed: ' + (err.message || 'network error'));
      });
  }

  // ── Sprint 13 UI: Trash modal handlers ───────────────────────────
  const openTrash = useCallback(() => {
    setTrashModal({ loading: true, items: [] });
    costApi
      .getTrashedQuotes()
      .then((items) => {
        setTrashModal({ loading: false, items: Array.isArray(items) ? items : [] });
      })
      .catch((err) => {
        console.error('Failed to load trash:', err);
        setTrashModal({ loading: false, items: [], err: err.message || 'load failed' });
      });
  }, []);
  const closeTrash = () => setTrashModal(null);
  const refreshTrash = openTrash;

  const handleRestore = (q) => {
    if (!confirm(`Restore quote #${q.id} — ${q.state?.ccl_pn || q.state?.rfq_number || ''}?`))
      return;
    costApi
      .restoreQuote(q.id)
      .then(() => {
        refreshTrash();
        refresh();
      })
      .catch((err) => alert('Restore failed: ' + (err.message || 'network error')));
  };
  const handlePurge = (q) => {
    if (
      !confirm(
        `PERMANENTLY delete quote #${q.id} — ${q.state?.ccl_pn || q.state?.rfq_number || ''}?\n\n` +
          `THIS CANNOT BE UNDONE. Backup is the only recovery path. Sys-only operation.`
      )
    )
      return;
    costApi
      .purgeQuote(q.id)
      .then(() => {
        refreshTrash();
      })
      .catch((err) => alert('Purge failed: ' + (err.message || 'network error')));
  };

  function handleLoad(q) {
    _openQuoteInCalc(q.id, q.type || 'standard', 'load');
  }

  // Helper to spread sort state into every SortTh below, since SortTh
  // now lives at module scope (see top of file) and needs the props
  // explicitly passed instead of reading them from closure.
  const sortProps = { sortKey, sortDir, toggleSort };

  // Skeleton only on INITIAL load. Refresh after save / SSE flips
  // `loading` true mid-session — gating on raw loading would unmount
  // the table + drop scroll/sort/filter state. Stale-while-revalidate
  // keeps the existing rows visible until new data lands.
  if (initialLoading)
    return (
      <div className="qh-skeleton-wrap">
        <SkeletonTable rows={12} cols={10} />
      </div>
    );

  if (loadError)
    return (
      <div className="qh-root">
        <EmptyState
          icon="⚠️"
          title="Failed to load quote history"
          hint={loadError.message || String(loadError)}
          action={
            <button className="op-btn op-btn-primary" onClick={refresh}>
              Retry
            </button>
          }
        />
      </div>
    );

  return (
    <div className="qh-root">
      {/* ══ Header Bar (title + sync info) + ScopedFilterBar below ══ */}
      <div className="qh-headerbar">
        <div className="qh-hb-icon">
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="white"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 3h18v4H3z" />
            <path d="M3 10h18v4H3z" />
            <path d="M3 17h18v4H3z" />
          </svg>
        </div>
        <div className="qh-hb-titleblock">
          <div className="qh-hb-title">Quote History</div>
          <div className="qh-hb-meta">
            <span className="qh-hb-badge">{quotes.length}</span>
            <span className="qh-hb-sub">{filtered.length} shown</span>
            {filterType !== 'all' && <span className="qh-hb-filter-tag">🏷 {filterType}</span>}
            {/* v1.3 P0 — auto-refresh status indicator + manual refresh */}
            <span
              className="qh-hb-refresh-info"
              title={
                lastRefreshedAt
                  ? `Last sync: ${lastRefreshedAt.toLocaleString('vi-VN')}`
                  : 'Auto-refresh every 30s'
              }
            >
              {isRefreshing ? '↻ Đang sync…' : `↻ Sync ${formatLastRefresh(lastRefreshedAt)}`}
            </span>
            <button
              type="button"
              className="qh-hb-refresh-btn"
              onClick={refresh}
              disabled={isRefreshing || loading}
              title="Refresh quote list ngay (Cmd/Ctrl+R cho full reload)"
            >
              ↻
            </button>
          </div>
        </div>
      </div>
      <ScopedFilterBar
        filter={filter}
        setField={setField}
        clearField={clearField}
        clearAll={clearAll}
        hasActiveFilter={hasActiveFilter}
        resultCount={filtered.length}
        totalCount={quotes.length}
        globalPlaceholder="Search CCL PN / RFQ / Customer / Project / NPI Owner / Sale Owner…"
        rightSlot={
          <>
            {/* Phase 2 — Columns toggle. Placed BEFORE the pill filter
                buttons so operator sees "Columns | All | Standard | …"
                left-to-right (parity with Summarize tab pattern). */}
            <ColumnsToggle
              columns={toggleColumns}
              storageKey={QUOTE_HISTORY_STORAGE_KEY}
              onChange={setVisibleColumns}
              defaultHiddenKeys={QUOTE_HISTORY_DEFAULT_HIDDEN_KEYS}
            />
            <div className="qh-hb-filters">
              {[
                { id: 'all', label: 'All' },
                { id: 'standard', label: '◇ Standard' },
                { id: 'complex', label: '◈ Complex' },
              ].map((f) => (
                <button
                  key={f.id}
                  className={`qh-hb-fbtn ${filterType === f.id ? 'active' : ''}`}
                  onClick={() => setFilterType(f.id)}
                >
                  {f.label}
                </button>
              ))}
              {/* Sprint 13 UI — Trash bin entry. Lazy-loads server data
                  on click (no polling cost when closed). */}
              <button
                className="qh-hb-fbtn qh-hb-trash-btn"
                onClick={openTrash}
                title="View soft-deleted quotes · Xem các quote đã xoá (có thể restore)"
              >
                🗑 Trash
              </button>
            </div>
          </>
        }
      />

      {/* ══ TABLE — flush with header, full screen ══ */}
      <div className="qh-table-full">
        <div className="qh-table-flush">
          <table className="qh-table">
            <thead>
              {/* Single-tier header. Freeze panes were removed per operator
                  request — table now scrolls horizontally as one wide
                  region. TRADE/DESIGN sit next to MATERIALS inside what
                  used to be the PRODUCT group. */}
              <tr className="qh-g2">
                {visibleColumns.map((c) => {
                  const thStyle = c.width ? { width: c.width } : undefined;
                  const label = c.labelKey ? t(c.labelKey) : c.label;
                  if (c.sortable) {
                    return (
                      <SortTh
                        key={c.key}
                        {...sortProps}
                        id={c.key}
                        className={c.thClass}
                        style={thStyle}
                      >
                        {label}
                      </SortTh>
                    );
                  }
                  return (
                    <th
                      key={c.key}
                      className={`qh-col${c.thClass ? ' ' + c.thClass : ''}`}
                      style={thStyle}
                    >
                      {label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} style={{ padding: 0 }}>
                    <EmptyState
                      icon="📊"
                      title="No quotes found"
                      hint="Save a Standard or Complex quote — it will appear here with version history."
                    />
                  </td>
                </tr>
              ) : (
                paged.map((q, i) => {
                  const s = q.state || {};
                  const r = q.result || {};
                  const idx = page * PAGE_SIZE + i;
                  const rawMats = s.materials || q.materials || [];
                  const matStr = Array.isArray(rawMats)
                    ? rawMats
                        .slice(0, 2)
                        .map((m) => (typeof m === 'object' ? m.code || m.name || '' : String(m)))
                        .filter(Boolean)
                        .join(', ')
                    : '';
                  const gmVal = r.gm != null ? r.gm : r.gm_pct != null ? r.gm_pct / 100 : null;
                  const vaVal = r.va != null ? r.va : null;
                  // Sprint 1.7f — Contr.% (contribution margin). Two field
                  // shapes in the wild: new calcAll uses fraction `contribution`,
                  // legacy bundle stored `contr_pct` as already-multiplied %.
                  const contrVal =
                    r.contribution != null
                      ? r.contribution
                      : r.contr_pct != null
                        ? r.contr_pct / 100
                        : null;
                  const target = s.target || r.target_price || s.target_price;
                  const sizeW = s.part_width || s.size_w;
                  const sizeH = s.part_length_md || s.size_h;
                  const design = s.design_process || s.process_design || s.design;
                  const rowStatus = getApprovalStatus(s.approval);
                  // Per-row ctx bag passed to every cell renderer. `derived`
                  // memoises the s/r/gmVal/vaVal/... computations so each of
                  // the ~21 visible cells doesn't re-read q.state / q.result.
                  const ctx = {
                    idx,
                    t,
                    user,
                    altMaterialsEnabled,
                    canExport,
                    rfqColors,
                    setExportModal,
                    setHistoryModal,
                    reloadAfterTransition,
                    derived: {
                      s,
                      r,
                      gmVal,
                      vaVal,
                      contrVal,
                      target,
                      sizeW,
                      sizeH,
                      design,
                      matStr,
                    },
                  };
                  return (
                    <tr
                      key={q.id || idx}
                      data-status={rowStatus}
                      className={`qh-row ${ctxMenu?.quote?.id === q.id ? 'qh-row-ctx' : ''}`}
                      onContextMenu={(e) => handleContextMenu(e, q)}
                    >
                      {visibleColumns.map((c) => {
                        const cls = `qh-d${c.tdClass ? ' ' + c.tdClass : ''}`;
                        const style = c.tdStyleFn ? c.tdStyleFn(q, ctx) : c.tdStyle;
                        const extraProps = c.tdPropsFn ? c.tdPropsFn(q, ctx) : null;
                        return (
                          <td key={c.key} className={cls} style={style} {...extraProps}>
                            {c.render(q, ctx)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="qh-pag">
          <button className="qh-pb" disabled={page === 0} onClick={() => setPage(0)}>
            «
          </button>
          <button className="qh-pb" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ‹ Prev
          </button>
          <span className="qh-pi">
            Page {page + 1} / {totalPages} <span className="qh-pr">({filtered.length} rows)</span>
          </span>
          <button
            className="qh-pb"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next ›
          </button>
          <button
            className="qh-pb"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(totalPages - 1)}
          >
            »
          </button>
        </div>
      )}

      {/* ══ Approval History Modal (Sprint 6.3) ══ */}
      <ApprovalHistoryModal
        open={!!historyModal}
        onClose={() => setHistoryModal(null)}
        approval={historyModal?.approval}
        quoteLabel={historyModal?.label}
      />

      {/* ══ Export Modal (Sprint S-EXPORT-UI) ══ */}
      <ExportModal
        open={!!exportModal}
        quote={exportModal?.quote || null}
        onClose={() => setExportModal(null)}
        onSuccess={(filename) => {
          // Inline alert is the existing toast surrogate in this tab
          // (handleDelete also uses alert). Future polish: lift to the
          // shared toast service once one exists.

          alert(t('qexp.success.downloaded', { f: filename }));
        }}
      />

      {/* ══ Sprint 13 UI: Trash bin modal ══ */}
      <Modal
        open={!!trashModal}
        onClose={closeTrash}
        size="xl"
        severity="warning"
        ariaLabelledBy="qh-trash-title"
      >
        <Modal.Header
          id="qh-trash-title"
          title="Trash"
          subtitle={`${trashModal?.items?.length || 0} soft-deleted quote(s) · Soft-deleted, restorable. Permanent delete (purge) is sys-only.`}
          severity="warning"
        />
        <Modal.Body className="flush">
          {trashModal?.loading && (
            <div style={{ padding: 32, textAlign: 'center', color: '#6f6f6f' }}>Loading…</div>
          )}
          {trashModal?.err && (
            <div style={{ padding: 24, color: '#a2191f' }}>Failed: {trashModal.err}</div>
          )}
          {trashModal && !trashModal.loading && (trashModal.items || []).length === 0 && (
            <div
              style={{ padding: 32, textAlign: 'center', color: '#6f6f6f', fontStyle: 'italic' }}
            >
              Trash is empty · Thùng rác trống.
            </div>
          )}
          {trashModal && (trashModal.items || []).length > 0 && (
            <table className="qh-table" style={{ fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#525252', color: '#fff' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>#</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Type</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Label / RFQ</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Direct CU</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>Trashed at</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left' }}>By</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {trashModal.items.map((q) => (
                  <tr key={q.id} style={{ borderBottom: '1px solid #e8e8e8' }}>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{q.id}</td>
                    <td style={{ padding: '6px 10px' }}>{q.type || '—'}</td>
                    <td style={{ padding: '6px 10px' }}>
                      <b>{q.state?.ccl_pn || q.state?.rfq_number || q.label || '—'}</b>
                    </td>
                    <td style={{ padding: '6px 10px' }}>{q.state?.direct_cu || '—'}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#525252' }}>
                      {(q.deleted_at || '').slice(0, 16).replace('T', ' ')}
                    </td>
                    <td style={{ padding: '6px 10px' }}>{q.deleted_by || '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                      <button
                        className="op-btn op-btn-secondary"
                        style={{ padding: '4px 10px', fontSize: 11, marginRight: 6 }}
                        onClick={() => handleRestore(q)}
                        title="Restore quote · Khôi phục"
                      >
                        ↩ Restore
                      </button>
                      {hasRole('sys') && (
                        <button
                          className="op-btn op-btn-danger"
                          style={{ padding: '4px 10px', fontSize: 11 }}
                          onClick={() => handlePurge(q)}
                          title="Permanent delete · Xoá vĩnh viễn (sys only)"
                        >
                          ⚠ Purge
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button className="op-btn op-btn-ghost" onClick={refreshTrash}>
            ↻ Refresh
          </button>
          <button className="op-btn op-btn-primary" onClick={closeTrash}>
            Close
          </button>
        </Modal.Footer>
      </Modal>

      {/* ══ Context Menu (right-click) ══ */}
      {ctxMenu && (
        <div ref={ctxRef} className="qh-ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
          <div className="qh-ctx-header">
            Quote #{ctxMenu.quote.id} —{' '}
            {ctxMenu.quote.state?.ccl_pn || ctxMenu.quote.state?.rfq_number || 'Untitled'}
          </div>
          <div className="qh-ctx-divider" />
          <button
            className="qh-ctx-item"
            onClick={() => {
              handleLoad(ctxMenu.quote);
              setCtxMenu(null);
            }}
          >
            <span className="qh-ctx-icon">📂</span>
            <span>Open</span>
            <span className="qh-ctx-shortcut">⌘O</span>
          </button>
          {/* Copy (above Open With) — same behavior as the Action-column
              Copy: _openQuoteInCalc(id, type, 'copy') via handleCopy. */}
          <button
            className="qh-ctx-item"
            onClick={() => {
              handleCopy(ctxMenu.quote);
              setCtxMenu(null);
            }}
          >
            <span className="qh-ctx-icon">📑</span>
            <span>Copy</span>
            <span className="qh-ctx-shortcut">⌘C</span>
          </button>
          <button
            className="qh-ctx-item"
            onClick={() => {
              handleLoad(ctxMenu.quote);
              setCtxMenu(null);
            }}
          >
            <span className="qh-ctx-icon">📋</span>
            <span>Open With</span>
            <span className="qh-ctx-arrow">›</span>
          </button>
          <div className="qh-ctx-divider" />
          {/* Color bar — changes RFQ NO text color only */}
          <div className="qh-ctx-colorbar">
            {RFQ_COLOR_PALETTE.map((c) => {
              const rfq = ctxMenu.quote.state?.rfq_number;
              const active = rfq && rfqColors[rfq] === c.color;
              return (
                <button
                  key={c.key}
                  className={`qh-ctx-dot ${active ? 'active' : ''}`}
                  style={{ background: c.color }}
                  title={c.label}
                  onClick={() => {
                    if (rfq) setRfqColor(rfq, c.color);
                    setCtxMenu(null);
                  }}
                />
              );
            })}
            <button
              className="qh-ctx-dot qh-ctx-dot-clear"
              title="Clear color"
              onClick={() => {
                const rfq = ctxMenu.quote.state?.rfq_number;
                if (rfq) setRfqColor(rfq, null);
                setCtxMenu(null);
              }}
            >
              ×
            </button>
          </div>
          <div className="qh-ctx-divider" />
          {canDelete && (
            <button
              className="qh-ctx-item qh-ctx-danger"
              onClick={() => {
                // Use handleDelete so the removal persists via costApi.saveAll.
                // The older inline version only mutated local state — quote
                // would reappear on next reload.
                const q = ctxMenu.quote;
                setCtxMenu(null);
                handleDelete(q);
              }}
            >
              <span className="qh-ctx-icon">🗑</span>
              <span>Move to Trash</span>
              <span className="qh-ctx-shortcut">⌘⌫</span>
            </button>
          )}
          <div className="qh-ctx-divider" />
          <button className="qh-ctx-item" onClick={() => setCtxMenu(null)}>
            <span className="qh-ctx-icon">ℹ️</span>
            <span>Get Info</span>
            <span className="qh-ctx-shortcut">⌘I</span>
          </button>
        </div>
      )}
    </div>
  );
}
