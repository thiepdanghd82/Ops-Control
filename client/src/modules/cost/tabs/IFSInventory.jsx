import { useState, useEffect, useMemo, useCallback } from 'react';
import { sharedApi, importApi } from '../../../services/api';
import { useCachedFetch, invalidateCache } from '../../../hooks/useCachedFetch';
import EmptyState from '../../../components/Shared/EmptyState';
import SkeletonTable from '../../../components/Shared/SkeletonTable';
import ImportWizard from '../../../components/Shared/ImportWizard';
import './IFSInventory.css';

// Per sub-tab clear wiring. Imports go through the unified Import Wizard
// (preview → diff → commit) so a wrong dataset can no longer silently
// overwrite the wrong file.
const IMPORT_CFG = {
  inventory: {
    wizardKey: 'inventory',
    clear: () => importApi.clearInventory(),
    label: 'Full Inventory',
  },
  finishedGoods: {
    wizardKey: 'finished-goods',
    clear: () => importApi.clearFinishedGoods(),
    label: 'Finished Goods',
  },
  rawMaterials: {
    wizardKey: 'raw-materials',
    clear: () => importApi.clearRawMaterials(),
    label: 'Raw Materials',
  },
};

const PER_PAGE = 100;
const LS_KEY = 'ifs-inv-visible-cols';

const TAB_CONFIG = [
  {
    id: 'inventory',
    label: 'Full Inventory',
    col: '#0369a1',
    brd: '#0ea5e9',
    headerBg: '#f1f5f9',
    hover: '#f0f9ff',
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="white"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    id: 'finishedGoods',
    label: 'Finished Goods',
    col: '#0f766e',
    brd: '#14b8a6',
    headerBg: '#f0fdf4',
    hover: '#f0fdf4',
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="white"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
  {
    id: 'rawMaterials',
    label: 'Raw Materials',
    col: '#7c3aed',
    brd: '#a855f7',
    headerBg: '#faf5ff',
    hover: '#faf5ff',
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="white"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
    ),
  },
];

function isNumeric(val) {
  if (val == null || val === '') return false;
  if (typeof val === 'string' && /[^0-9eE+\-.,]/.test(val)) return false;
  return !isNaN(parseFloat(val)) && isFinite(val);
}

// Columns whose header name makes them IDs/codes — never numeric even if the
// values happen to parse as numbers. Keeps Part No, Site, Association No,
// Accounting Group, Agreement Id, Customer No, etc. left-aligned and unformatted.
const ID_COL_RE =
  /\b(no|number|code|id|sku|pn|part|ref|site|group|planner|class|alt|alternative|rev|revision|sequence|line|item|type)\b/i;
// Columns whose name indicates a date — keep as raw strings, left-aligned.
const DATE_COL_RE = /\b(date|created|changed|phase|valid|effectivity|expir|activity|until|from)\b/i;
// Columns whose values should be displayed with 2 decimal places + thousand
// separator (money / rates / factors / scrap / percentage).
const MONEY_COL_RE =
  /\b(value|price|cost|amount|total|deal|usd|vnd|rate|ratio|factor|percent|scrap|efficiency)\b/i;

function formatNumber(val, opts = {}) {
  const n = parseFloat(val);
  if (!isFinite(n)) return '\u2014';
  const { money = false } = opts;
  if (money) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // Integer → thousand separator. Decimal → keep up to 6 significant decimals.
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  const abs = Math.abs(n);
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 3 : 6;
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function formatCell(val, colType) {
  if (val == null || val === '') return '\u2014';
  if (colType === 'numeric' || colType === 'money') {
    return formatNumber(val, { money: colType === 'money' });
  }
  return String(val);
}

// Currency code columns get a small Carbon-style chip with per-currency tint.
const CURRENCY_COL_RE = /\b(currency|ccy)\b/i;
function renderCellContent(val, colType, colName) {
  if (val == null || val === '') return '\u2014';
  if (CURRENCY_COL_RE.test(colName)) {
    const code = String(val).trim().toUpperCase();
    const tint = code === 'USD' ? 'usd' : code === 'VND' ? 'vnd' : code === 'EUR' ? 'eur' : '';
    return <span className={`inv-pill ${tint}`}>{code}</span>;
  }
  return formatCell(val, colType);
}

function loadVisibleCols(tabId) {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return stored[tabId] || null;
  } catch {
    return null;
  }
}

function saveVisibleCols(tabId, cols) {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    stored[tabId] = cols;
    localStorage.setItem(LS_KEY, JSON.stringify(stored));
  } catch {
    /* ignore */
  }
}

const IFS_TAB_KEY = 'ops-ifs-active-tab';
const ALLOWED_IFS_TABS = ['inventory', 'finishedGoods', 'rawMaterials'];

export default function IFSInventory() {
  // Sprint AR — hook-managed fetch. Multi-MB inventory response is
  // auto-aborted on tab-switch so a slow response can't setState on
  // a dead instance. `refresh()` re-pulls after import uploads.
  // Sprint 1.7h Phase 2 — wrapped with useCachedFetch SWR layer so
  // tab switch back returns the parsed 2.8 MB tree from in-memory
  // cache instantly + revalidates in background (304 via Phase 1 ETag).
  const {
    data: rawInv,
    loading,
    refresh,
  } = useCachedFetch('ifs-inventory', (signal) => sharedApi.getInventory({ signal }));
  const data = useMemo(
    () => ({
      inventory: rawInv?.inventory || [],
      finishedGoods: rawInv?.finishedGoods || [],
      rawMaterials: rawInv?.rawMaterials || [],
    }),
    [rawInv]
  );
  // Restore last-selected IFS sub-tab so reloads don't dump the user back
  // to Inventory when they were reviewing Raw Materials.
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const s = localStorage.getItem(IFS_TAB_KEY);
      return ALLOWED_IFS_TABS.includes(s) ? s : 'inventory';
    } catch {
      return 'inventory';
    }
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(IFS_TAB_KEY, activeTab);
    } catch {
      /* private mode */
    }
  }, [activeTab]);

  // Load flow handled by useAbortableFetch above. `refresh` re-pulls
  // the list after a successful import / clear action below.

  const flash = useCallback((text, ms = 3500) => {
    setMsg(text);
    setTimeout(() => setMsg(''), ms);
  }, []);

  const handleWizardCommitted = useCallback(
    async (stats) => {
      const cfg = IMPORT_CFG[activeTab];
      flash(`Imported ${stats?.rowsImported ?? '?'} rows into ${cfg?.label || 'inventory'}`);
      await sharedApi.refreshCache().catch(() => {});
      invalidateCache('ifs-inventory');
      refresh();
    },
    [activeTab, flash, refresh]
  );

  const handleClear = useCallback(async () => {
    const cfg = IMPORT_CFG[activeTab];
    if (!cfg) return;
    if (!window.confirm(`Clear all ${cfg.label} data? The current file will be backed up first.`))
      return;
    setBusy(true);
    setMsg('Clearing…');
    try {
      await cfg.clear();
      await sharedApi.refreshCache().catch(() => {});
      invalidateCache('ifs-inventory');
      refresh();
      flash(`${cfg.label} cleared`);
    } catch (err) {
      console.error('Clear failed:', err);
      flash('Clear failed: ' + (err.message || 'Unknown error'), 5500);
    } finally {
      setBusy(false);
    }
  }, [activeTab, flash, refresh]);

  if (loading)
    return (
      <div style={{ padding: 24 }}>
        <SkeletonTable rows={12} cols={8} />
      </div>
    );

  const tabCfg = TAB_CONFIG.find((t) => t.id === activeTab) || TAB_CONFIG[0];

  const headerNav = (
    <>
      <div className="inv-header-tabs">
        {TAB_CONFIG.map((t) => (
          <button
            key={t.id}
            className={`inv-header-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
            <span className="inv-header-tab-count">
              {(data[t.id] || []).length.toLocaleString()}
            </span>
          </button>
        ))}
      </div>
      <div className="inv-header-actions">
        {msg && <span className="inv-header-msg">{msg}</span>}
        <button
          className="inv-header-btn primary"
          disabled={busy}
          onClick={() => setWizardOpen(true)}
          title={`Import ${tabCfg.label} from CSV or XLSX (preview before commit)`}
        >
          {'\u2B06 Import\u2026'}
        </button>
        <button
          className="inv-header-btn danger"
          disabled={busy}
          onClick={handleClear}
          title={`Clear all ${tabCfg.label} data (backup kept)`}
        >
          {'\uD83D\uDDD1 Clear Data'}
        </button>
      </div>
    </>
  );

  const wizardCfg = IMPORT_CFG[activeTab];
  return (
    <div className="inv-root">
      <div className="inv-body">
        <InventoryPanel
          key={activeTab}
          rows={data[activeTab] || []}
          tabCfg={tabCfg}
          headerNav={headerNav}
        />
      </div>
      {wizardCfg && (
        <ImportWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          datasetKey={wizardCfg.wizardKey}
          datasetLabel={wizardCfg.label}
          onCommitted={handleWizardCommitted}
        />
      )}
    </div>
  );
}

function InventoryPanel({ rows, tabCfg, headerNav }) {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [showColPanel, setShowColPanel] = useState(false);

  // Detect all columns from data, limit to 15
  const allColumns = useMemo(() => {
    if (rows.length === 0) return [];
    const keys = Object.keys(rows[0]);
    return keys.slice(0, 15);
  }, [rows]);

  // Column visibility state, persisted per tab
  const [visibleCols, setVisibleCols] = useState(() => {
    const stored = loadVisibleCols(tabCfg.id);
    if (stored && Array.isArray(stored)) return stored;
    return allColumns;
  });

  // Sync visible columns when allColumns changes (new data load)
  useEffect(() => {
    if (allColumns.length === 0) return;
    const stored = loadVisibleCols(tabCfg.id);
    if (stored && Array.isArray(stored)) {
      // Keep only columns that still exist in data
      const valid = stored.filter((c) => allColumns.includes(c));
      setVisibleCols(valid.length > 0 ? valid : allColumns);
    } else {
      setVisibleCols(allColumns);
    }
  }, [allColumns, tabCfg.id]);

  const toggleCol = useCallback(
    (col) => {
      setVisibleCols((prev) => {
        const next = prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col];
        // Don't allow hiding all columns
        if (next.length === 0) return prev;
        saveVisibleCols(tabCfg.id, next);
        return next;
      });
    },
    [tabCfg.id]
  );

  // Classify each column as 'id' (left, raw), 'date' (left, raw),
  // 'money' (right, 2-dec), 'numeric' (right, smart format), or 'text' (left).
  const colTypes = useMemo(() => {
    const m = {};
    const sample = rows.slice(0, 80);
    allColumns.forEach((col) => {
      if (ID_COL_RE.test(col)) {
        m[col] = 'id';
        return;
      }
      if (DATE_COL_RE.test(col)) {
        m[col] = 'date';
        return;
      }
      let numCount = 0,
        total = 0;
      sample.forEach((r) => {
        const v = r[col];
        if (v != null && v !== '') {
          total++;
          if (isNumeric(v)) numCount++;
        }
      });
      if (total > 0 && numCount / total > 0.6) {
        m[col] = MONEY_COL_RE.test(col) ? 'money' : 'numeric';
      } else {
        m[col] = 'text';
      }
    });
    return m;
  }, [rows, allColumns]);

  const numericCols = useMemo(() => {
    const s = new Set();
    Object.entries(colTypes).forEach(([col, t]) => {
      if (t === 'numeric' || t === 'money') s.add(col);
    });
    return s;
  }, [colTypes]);

  // Filter
  const filtered = useMemo(() => {
    if (!search) return rows;
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((row) => {
      const text = Object.values(row).filter(Boolean).join(' ').toLowerCase();
      return terms.every((t) => text.includes(t));
    });
  }, [rows, search]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a[sortCol] ?? '';
      const vb = b[sortCol] ?? '';
      const na = parseFloat(va);
      const nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) return sortAsc ? na - nb : nb - na;
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [filtered, sortCol, sortAsc]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const paged = sorted.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const startRow = sorted.length === 0 ? 0 : page * PER_PAGE + 1;
  const endRow = Math.min((page + 1) * PER_PAGE, sorted.length);

  useEffect(() => {
    setPage(0);
  }, [search]);

  function handleSort(col) {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  }

  const displayCols = allColumns.filter((c) => visibleCols.includes(c));

  // Focus ring color for search
  const focusVar = { '--inv-focus': tabCfg.brd };

  return (
    <>
      {/* Gradient Header */}
      <div className="inv-header">
        <div className="inv-header-icon">{tabCfg.icon}</div>
        {headerNav}
      </div>
      <div className="inv-subhead">
        <span className="inv-subhead-title">{tabCfg.label}</span>
        <span className="inv-subhead-badge">{rows.length.toLocaleString()} records</span>
        <span className="inv-subhead-dot">&middot;</span>
        <span className="inv-subhead-sub">
          Showing {paged.length} of {filtered.length.toLocaleString()}
        </span>
      </div>

      {/* Toolbar */}
      <div className="inv-toolbar">
        <div className="inv-search-wrap" style={focusVar}>
          <svg
            className="inv-search-icon"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="inv-search"
            placeholder="Search any field..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && filtered.length < rows.length && (
            <span className="inv-search-badge">
              {filtered.length.toLocaleString()} / {rows.length.toLocaleString()}
            </span>
          )}
        </div>
        <button
          className={`inv-col-btn ${showColPanel ? 'active' : ''}`}
          style={{ '--tab-col': tabCfg.col }}
          onClick={() => setShowColPanel((p) => !p)}
        >
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          Columns
          <span className="inv-col-btn-count">
            {displayCols.length}/{allColumns.length}
          </span>
        </button>
      </div>

      {/* Column Visibility Panel */}
      {showColPanel && (
        <div className="inv-col-panel">
          <div className="inv-col-panel-header">
            <span className="inv-col-panel-title">Toggle Columns</span>
            <button className="inv-col-panel-close" onClick={() => setShowColPanel(false)}>
              Done
            </button>
          </div>
          <div className="inv-col-grid">
            {allColumns.map((col) => (
              <label key={col} className="inv-col-check">
                <input
                  type="checkbox"
                  checked={visibleCols.includes(col)}
                  onChange={() => toggleCol(col)}
                />
                <span className="inv-col-check-label">{col}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="inv-table-area">
        <div
          className="inv-table-wrap"
          style={{
            '--inv-header-bg': tabCfg.headerBg,
            '--inv-hover': tabCfg.hover,
            '--inv-brd': tabCfg.brd,
            '--inv-col': tabCfg.col,
          }}
        >
          <table className="inv-table">
            <thead>
              <tr>
                <th className="inv-th inv-th-num">#</th>
                {displayCols.map((col) => (
                  <th
                    key={col}
                    className={`inv-th ${numericCols.has(col) ? 'inv-th-right' : ''} ${sortCol === col ? 'inv-th-sorted' : ''}`}
                    onClick={() => handleSort(col)}
                  >
                    <span className="inv-th-text">{col}</span>
                    {sortCol === col && (
                      <span className="inv-sort-arrow">{sortAsc ? '\u2191' : '\u2193'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={displayCols.length + 1} style={{ padding: 0 }}>
                    <EmptyState
                      icon="📦"
                      title="No inventory data"
                      hint="Import an IFS inventory export (CSV/XLSX) to get started."
                    />
                  </td>
                </tr>
              ) : (
                paged.map((row, i) => {
                  return (
                    <tr key={i} className="inv-row">
                      <td className="inv-td-num">{page * PER_PAGE + i + 1}</td>
                      {displayCols.map((col) => {
                        const val = row[col];
                        const t = colTypes[col];
                        const isNum = t === 'numeric' || t === 'money';
                        const isId = t === 'id';
                        const isDate = t === 'date';
                        const cls = isNum
                          ? 'inv-td-num-val'
                          : isId
                            ? 'inv-td-id'
                            : isDate
                              ? 'inv-td-date'
                              : '';
                        return (
                          <td key={col} className={`inv-td ${cls}`}>
                            {renderCellContent(val, t, col)}
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
      <div className="inv-pagination">
        <div className="inv-pg-left">
          <span className="inv-pg-range">
            {sorted.length === 0
              ? '0'
              : `${startRow.toLocaleString()}\u2013${endRow.toLocaleString()}`}{' '}
            / {sorted.length.toLocaleString()}
          </span>
        </div>
        <div className="inv-pg-center">
          <button
            className="inv-pg-btn"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            &larr;
          </button>
          <span className="inv-pg-info">
            Pg {page + 1}/{totalPages}
          </span>
          <button
            className="inv-pg-btn"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            &rarr;
          </button>
        </div>
        <div className="inv-pg-right" />
      </div>
    </>
  );
}
