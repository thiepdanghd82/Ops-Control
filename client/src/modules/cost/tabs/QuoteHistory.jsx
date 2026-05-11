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
import './QuoteHistory.css';

const PAGE_SIZE = 100;

// Ordinal used by sorting — matches workflow progression so ASC goes
// draft → pending_sales → pending_finance → approved, and rejected
// sorts to the end so reviewers see actionable items near the top.
const STATUS_ORDER = {
  draft: 0,
  pending_sales: 1,
  pending_finance: 2,
  approved: 3,
  rejected: 4,
};

const SORT_KEYS = {
  date: (q) => new Date(q.saved_at || 0).getTime(),
  rfq: (q) => (q.state?.rfq_number || '').toLowerCase(),
  npi: (q) => (q.state?.npi_owner || q.npi_owner || '').toLowerCase(),
  direct_cu: (q) => (q.state?.direct_cu || '').toLowerCase(),
  // Sprint S-PROJFIX (2026-04-29) — Standard's RfqInfoCard aliases the
  // End Customer input to state.project (CalcHeader.jsx aliasMap), so
  // s.project actually holds End Customer text for Standard quotes
  // and s.end_cu stays empty. Complex has no alias (writes directly
  // to state.end_cu). The fallback s.end_cu || s.project covers both.
  // Project column reads state.project_name — the canonical field
  // written by RfqInfoCard's "Project" input (line 121) for both
  // calculator types.
  end_cu: (q) => (q.state?.end_cu || q.state?.project || '').toLowerCase(),
  project: (q) => (q.state?.project_name || '').toLowerCase(),
  ifs: (q) => (q.state?.ccl_pn || '').toLowerCase(),
  dcu_pn: (q) => (q.state?.direct_cu_pn || '').toLowerCase(),
  moq: (q) => Number(q.state?.moq) || 0,
  sell: (q) => Number(q.state?.selling_price) || 0,
  // Sprint 1.7g — PRICE VND column. Auto-synced from RFQ & MOQ Pricing
  // info via the bi-directional setPriceUsd/setPriceVnd handlers in
  // CalcHeader, so the field always lives at state.selling_price_vnd.
  // Fallback: derive USD × usd_rate when only USD was entered (legacy
  // quotes without the explicit VND mirror).
  price_vnd: (q) => {
    const s = q.state || {};
    if (Number.isFinite(+s.selling_price_vnd)) return Number(s.selling_price_vnd);
    if (Number.isFinite(+s.selling_price) && Number.isFinite(+s.usd_rate)) {
      return Number(s.selling_price) * Number(s.usd_rate);
    }
    return 0;
  },
  gm: (q) => Number(q.result?.gm) || 0,
  va: (q) => Number(q.result?.va) || 0,
  // Sprint 1.7f — Contribution% column. calcAll exposes `contribution`
  // as a fraction (0.25 = 25%), same shape as gm/va. Some legacy quotes
  // use `contr_pct` (already-100x percentage) — coerce that path back to
  // a fraction so the sort comparison stays apples-to-apples.
  contr: (q) => {
    const r = q.result || {};
    if (Number.isFinite(+r.contribution)) return Number(r.contribution);
    if (Number.isFinite(+r.contr_pct)) return Number(r.contr_pct) / 100;
    return 0;
  },
  status: (q) => STATUS_ORDER[getApprovalStatus(q.state?.approval)] ?? 99,
};

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
    error: loadError,
    refresh,
  } = useAbortableFetch((signal) => sharedApi.getQuotes({ signal }), [], {
    onError: (err) => err?.name !== 'AbortError' && logErr('Failed to load quotes:', err),
  });
  const quotes = useMemo(() => (Array.isArray(rawQuotes) ? rawQuotes : []), [rawQuotes]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, quote }
  const [historyModal, setHistoryModal] = useState(null); // { approval, label }
  // Sprint 13 UI — Trash modal. Lazy-loads on open: `null` = closed,
  // `{ loading: true }` while fetching, `{ items: [...] }` once loaded.
  const [trashModal, setTrashModal] = useState(null);
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
    if (search) {
      const t = search.toLowerCase();
      r = r.filter((q) => {
        const s = q.state || {};
        // s.project covers Standard's aliased End Customer (see SORT_KEYS.end_cu).
        return [
          s.ccl_pn,
          s.direct_cu,
          s.project_name,
          s.end_cu || s.project,
          q.label,
          s.rfq_number,
          s.npi_owner,
          q.npi_owner,
          s.sale_owner,
          s.direct_cu_pn,
          s.end_cu_pn,
        ].some((v) => (v || '').toLowerCase().includes(t));
      });
    }
    const getter = SORT_KEYS[sortKey] || SORT_KEYS.date;
    return [...r].sort((a, b) => {
      const va = getter(a),
        vb = getter(b);
      return va < vb ? (sortDir === 'asc' ? -1 : 1) : va > vb ? (sortDir === 'asc' ? 1 : -1) : 0;
    });
  }, [quotes, search, filterType, sortKey, sortDir]);

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
    costApi
      .trashQuote(q.id)
      .then(() => {
        // Optimistic: drop from list immediately. The next list refresh
        // will exclude trashed quotes by default (server-side filter).
        setQuotes(quotes.filter((x) => x.id !== q.id));
      })
      .catch((err) => {
        console.error('Failed to trash quote:', err);
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

  if (loading)
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
      {/* ══ Unified Header Bar — title + search + filter pills in one row ══ */}
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
        <div className="qh-hb-search-wrap">
          <svg
            className="qh-si"
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="qh-hb-search"
            placeholder="Search CCL PN / RFQ / Customer / Project / NPI Owner / Sale Owner…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          {search && (
            <button
              className="qh-hb-sclear"
              onClick={() => {
                setSearch('');
                setPage(0);
              }}
            >
              ×
            </button>
          )}
        </div>
        <div className="qh-hb-filters">
          {[
            { id: 'all', label: 'All' },
            { id: 'standard', label: '◇ Standard' },
            { id: 'complex', label: '◈ Complex' },
          ].map((f) => (
            <button
              key={f.id}
              className={`qh-hb-fbtn ${filterType === f.id ? 'active' : ''}`}
              onClick={() => {
                setFilterType(f.id);
                setPage(0);
              }}
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
      </div>

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
                <th className="qh-col qh-c-num" style={{ width: 28 }}>
                  #
                </th>
                <SortTh {...sortProps} id="date" style={{ width: 88 }}>
                  {t('qh.date')}
                </SortTh>
                <SortTh {...sortProps} id="rfq" style={{ width: 120 }}>
                  {t('qh.rfq_number')}
                </SortTh>
                <th className="qh-col qh-c-ctr" style={{ width: 90 }}>
                  {t('qh.ver')}
                </th>
                <th className="qh-col qh-c-ctr" style={{ width: 32 }}>
                  {t('qh.ul')}
                </th>
                <SortTh {...sortProps} id="npi" style={{ width: 100 }}>
                  {t('qh.owner')}
                </SortTh>
                <SortTh {...sortProps} id="direct_cu" style={{ width: 100 }}>
                  {t('qh.direct_cu')}
                </SortTh>
                <SortTh {...sortProps} id="end_cu" style={{ width: 90 }}>
                  {t('qh.end_cu')}
                </SortTh>
                <SortTh {...sortProps} id="project" style={{ width: 90 }}>
                  {t('qh.project')}
                </SortTh>
                <SortTh {...sortProps} id="ifs" className="qh-c-ifs" style={{ width: 130 }}>
                  {t('qh.ifs_code')}
                </SortTh>
                <SortTh {...sortProps} id="dcu_pn" style={{ width: 110 }}>
                  {t('qh.direct_cu_pn')}
                </SortTh>
                <th className="qh-col" style={{ width: 90 }}>
                  {t('qh.end_cu_pn')}
                </th>
                <th className="qh-col" style={{ width: 85 }}>
                  {t('qh.size')}
                </th>
                <th className="qh-col" style={{ width: 110 }}>
                  {t('qh.materials')}
                </th>
                <th className="qh-col" style={{ width: 80 }}>
                  {t('qh.trade_mode')}
                </th>
                <th className="qh-col" style={{ width: 75 }}>
                  {t('qh.design')}
                </th>
                <SortTh {...sortProps} id="moq" className="qh-c-r" style={{ width: 75 }}>
                  {t('qh.moq')}
                </SortTh>
                <SortTh {...sortProps} id="sell" className="qh-c-r" style={{ width: 80 }}>
                  {t('qh.sell_price')}
                </SortTh>
                <SortTh {...sortProps} id="price_vnd" className="qh-c-r" style={{ width: 100 }}>
                  {t('qh.price_vnd')}
                </SortTh>
                <th className="qh-col qh-c-r" style={{ width: 65 }}>
                  {t('qh.target')}
                </th>
                <SortTh {...sortProps} id="va" className="qh-c-r" style={{ width: 50 }}>
                  {t('qh.va_pct')}
                </SortTh>
                <SortTh {...sortProps} id="contr" className="qh-c-r" style={{ width: 60 }}>
                  {t('qh.contr_pct')}
                </SortTh>
                <SortTh {...sortProps} id="gm" className="qh-c-ctr" style={{ width: 55 }}>
                  {t('qh.gm_pct')}
                </SortTh>
                <SortTh {...sortProps} id="status" style={{ width: 120 }}>
                  {t('qh.status')}
                </SortTh>
                <th className="qh-col qh-c-ctr" style={{ width: 170 }}>
                  {t('qh.approve_reject')}
                </th>
                <th className="qh-col qh-c-ctr" style={{ width: 90 }}>
                  {t('qh.layout')}
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={26} style={{ padding: 0 }}>
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
                  const verN = Number(q.version) || 0;
                  const verCls = verN === 0 ? 'v-grn' : verN === 1 ? 'v-blu' : 'v-pur';
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
                  return (
                    <tr
                      key={q.id || idx}
                      data-status={rowStatus}
                      className={`qh-row ${ctxMenu?.quote?.id === q.id ? 'qh-row-ctx' : ''}`}
                      onContextMenu={(e) => handleContextMenu(e, q)}
                    >
                      <td className="qh-d qh-d-num">{idx + 1}</td>
                      <td className="qh-d qh-d-date">
                        <div>{fmtDate(q.saved_at)}</div>
                        <div className="qh-d-time">{fmtTime(q.saved_at)}</div>
                      </td>
                      <td
                        className="qh-d qh-d-rfq"
                        style={{ color: rfqColors[s.rfq_number] || undefined }}
                      >
                        {s.rfq_number || '—'}
                      </td>
                      <td className="qh-d qh-d-ver">
                        <span className={`qh-vb ${verCls}`}>
                          {verN > 1 ? `${verN} tiers` : `ver.${verN}`}
                        </span>
                        <span className={`qh-tb ${q.type === 'complex' ? 'tb-cpx' : 'tb-std'}`}>
                          {q.type === 'complex' ? 'CPX' : 'STD'}
                        </span>
                        {altMaterialsEnabled && (
                          <MaterialActiveBadge summary={summariseMaterialActive(s, q.type)} t={t} />
                        )}
                      </td>
                      <td className="qh-d qh-d-ul">{s.underwriter ? 'N' : ''}</td>
                      <td className="qh-d qh-d-owner">{s.npi_owner || q.npi_owner || '—'}</td>
                      <td className="qh-d qh-d-dcu">{s.direct_cu || '—'}</td>
                      <td className="qh-d qh-d-ecu">{s.end_cu || s.project || '—'}</td>
                      <td className="qh-d qh-d-proj">{s.project_name || '—'}</td>
                      <td className="qh-d qh-d-ifs">{s.ccl_pn || '—'}</td>
                      <td className="qh-d qh-d-dcupn">{s.direct_cu_pn || '—'}</td>
                      <td className="qh-d qh-d-ecupn">{s.end_cu_pn || '—'}</td>
                      <td className="qh-d qh-d-size">{fmtSize(sizeW, sizeH)}</td>
                      <td className="qh-d qh-d-mats" title={matStr}>
                        {matStr || '—'}
                      </td>
                      <td className="qh-d qh-d-trade">
                        {s.trade_mode ? <span className="qh-trade">{s.trade_mode}</span> : '—'}
                      </td>
                      <td className="qh-d qh-d-design">{design || '—'}</td>
                      <td className="qh-d qh-d-moq">{fmtNum(s.moq)}</td>
                      <td className="qh-d qh-d-sell">{fmtPrice(s.selling_price)}</td>
                      {/* Sprint 1.7g — PRICE VND auto-synced from RFQ & MOQ
                        Pricing info via the bi-directional setPriceVnd
                        handler. Same shape for Standard + Complex (both
                        store at state.selling_price_vnd). Falls back to
                        USD × usd_rate when the explicit VND mirror is
                        absent (legacy pre-1.7g quotes). */}
                      <td className="qh-d qh-d-price-vnd">
                        {s.selling_price_vnd != null && s.selling_price_vnd !== ''
                          ? fmtNum(s.selling_price_vnd)
                          : Number.isFinite(+s.selling_price) && Number.isFinite(+s.usd_rate)
                            ? fmtNum(Number(s.selling_price) * Number(s.usd_rate))
                            : '—'}
                      </td>
                      <td className="qh-d qh-d-target">{target ? fmtPrice(target) : '—'}</td>
                      <td className="qh-d qh-d-va">{vaVal != null ? fmtPct(vaVal) : '—'}</td>
                      <td className="qh-d qh-d-contr">
                        {contrVal != null ? fmtPct(contrVal) : '—'}
                      </td>
                      <td className="qh-d qh-d-gm">
                        {gmVal != null ? (
                          <span className={`qh-gm ${gmClass(gmVal)}`}>{fmtPct(gmVal)}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      {/* ── STATUS + APPROVAL ACTIONS (Sprint 6.3) ── */}
                      <td className="qh-d qh-d-status" style={{ textAlign: 'left' }}>
                        <ApprovalStatusBadge
                          approval={s.approval}
                          onOpenHistory={() =>
                            setHistoryModal({
                              approval: s.approval || null,
                              label: s.ccl_pn || s.rfq_number || `#${q.id}`,
                            })
                          }
                        />
                      </td>
                      <td className="qh-d qh-d-approve" style={{ textAlign: 'center' }}>
                        <ApprovalActionsCell
                          quote={q}
                          user={user}
                          onAfterTransition={reloadAfterTransition}
                        />
                      </td>
                      <td className="qh-d qh-d-acts">
                        {/* Layout badge only — Open/Copy/Delete moved to
                          the right-click context menu (see Context Menu
                          block below). */}
                        {q.has_layout || s.layout_file?.name ? (
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
                      </td>
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
