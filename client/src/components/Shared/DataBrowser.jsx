/**
 * DataBrowser — reusable large-dataset browser for LibMfg and LibRop.
 * Features: search, sort, pagination, column toggle/reorder.
 */
import { memo, useState, useMemo, useCallback } from 'react';
import './DataBrowser.css';

const PER_PAGE = 500;

function isNumeric(val) {
  if (val == null || val === '') return false;
  if (typeof val === 'string' && /[^0-9eE+\-.,]/.test(val)) return false;
  return !isNaN(parseFloat(val)) && isFinite(val);
}

const ID_COL_RE =
  /\b(no|number|code|id|sku|pn|part|ref|site|group|planner|class|alt|alternative|rev|revision|sequence|line|item|type)\b/i;
const DATE_COL_RE = /\b(date|created|changed|phase|valid|effectivity|expir|activity|until|from)\b/i;
const MONEY_COL_RE =
  /\b(value|price|cost|amount|total|deal|usd|vnd|rate|ratio|factor|percent|scrap|efficiency)\b/i;

function formatNumber(val, money) {
  const n = parseFloat(val);
  if (!isFinite(n)) return '\u2014';
  if (money)
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  const abs = Math.abs(n);
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 3 : 6;
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

function fmtCell(val, type) {
  if (val == null || val === '') return '\u2014';
  if (type === 'numeric' || type === 'money') return formatNumber(val, type === 'money');
  return String(val);
}

// Memoized row — re-renders only when `row`/`visibleCols`/`colTypes`
// reference changes. With pagination at 500 rows this cuts cell renders
// on a single keystroke in the unrelated search box from 500 → 0.
const DataRow = memo(function DataRow({ row, visibleCols, colTypes, displayIdx }) {
  return (
    <tr>
      <td className="db-td-idx">{displayIdx}</td>
      {visibleCols.map((col) => {
        const t = colTypes[col.key];
        const isNum = t === 'numeric' || t === 'money';
        return (
          <td key={col.key} className={isNum ? 'db-td-num' : 'db-td'}>
            {col.format ? col.format(row[col.key], row) : fmtCell(row[col.key], t)}
          </td>
        );
      })}
    </tr>
  );
});

// Decide the display type for a column once, based on its label+key and
// a sample of values. Column defs can override via col.type.
function classifyColumn(col, rows) {
  if (col.type) return col.type;
  const name = `${col.label || ''} ${col.key || ''}`;
  if (ID_COL_RE.test(name)) return 'id';
  if (DATE_COL_RE.test(name)) return 'date';
  const sample = rows.slice(0, 80);
  let num = 0,
    total = 0;
  for (const r of sample) {
    const v = r[col.key];
    if (v == null || v === '') continue;
    total++;
    if (isNumeric(v)) num++;
  }
  if (total > 0 && num / total > 0.6) return MONEY_COL_RE.test(name) ? 'money' : 'numeric';
  return 'text';
}

export default function DataBrowser({
  title,
  icon = null,
  data,
  columns,
  lsKey,
  accentColor = '#0369a1',
  toolbarExtras = null,
}) {
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState(-1);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);
  const [hiddenCols, setHiddenCols] = useState(() => {
    try {
      const s = localStorage.getItem(lsKey);
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [colPanelOpen, setColPanelOpen] = useState(false);

  const visibleCols = useMemo(
    () => columns.filter((_, i) => !hiddenCols.has(i)),
    [columns, hiddenCols]
  );

  const colTypes = useMemo(() => {
    const m = {};
    columns.forEach((col) => {
      m[col.key] = classifyColumn(col, data);
    });
    return m;
  }, [columns, data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) =>
        String(row[col.key] ?? '')
          .toLowerCase()
          .includes(q)
      )
    );
  }, [data, search, columns]);

  const sorted = useMemo(() => {
    if (sortCol < 0) return filtered;
    const col = columns[sortCol];
    if (!col) return filtered;
    const key = col.key;
    return [...filtered].sort((a, b) => {
      const va = a[key],
        vb = b[key];
      if (isNumeric(va) && isNumeric(vb)) {
        return sortAsc ? parseFloat(va) - parseFloat(vb) : parseFloat(vb) - parseFloat(va);
      }
      const sa = String(va ?? ''),
        sb = String(vb ?? '');
      return sortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  }, [filtered, sortCol, sortAsc, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const pageData = useMemo(
    () => sorted.slice(page * PER_PAGE, (page + 1) * PER_PAGE),
    [sorted, page]
  );

  const handleSort = useCallback(
    (colIdx) => {
      if (sortCol === colIdx) {
        setSortAsc((p) => !p);
      } else {
        setSortCol(colIdx);
        setSortAsc(true);
      }
      setPage(0);
    },
    [sortCol]
  );

  const toggleCol = useCallback(
    (colIdx) => {
      setHiddenCols((prev) => {
        const next = new Set(prev);
        if (next.has(colIdx)) next.delete(colIdx);
        else next.add(colIdx);
        try {
          localStorage.setItem(lsKey, JSON.stringify([...next]));
        } catch {
          /* localStorage may be unavailable */
        }
        return next;
      });
    },
    [lsKey]
  );

  const resetCols = useCallback(() => {
    setHiddenCols(new Set());
    try {
      localStorage.removeItem(lsKey);
    } catch {
      /* localStorage may be unavailable */
    }
  }, [lsKey]);

  return (
    <div className="data-browser">
      <div className="db-toolbar">
        {icon && (
          <div className="db-header-icon" aria-hidden="true">
            {icon}
          </div>
        )}
        <div className="db-title" style={{ color: accentColor }}>
          {title}
        </div>
        <div className="db-stats">{sorted.length.toLocaleString()} rows</div>
        <input
          className="db-search"
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <button
          className="db-col-btn"
          onClick={() => setColPanelOpen((p) => !p)}
          title="Column visibility"
        >
          Columns
        </button>
        {toolbarExtras}
      </div>

      {colPanelOpen && (
        <div className="db-col-panel">
          <div className="db-col-panel-head">
            <span>Visible Columns</span>
            <button onClick={resetCols}>Reset All</button>
          </div>
          <div className="db-col-list">
            {columns.map((col, i) => (
              <label key={col.key ?? col.label ?? i} className="db-col-item">
                <input type="checkbox" checked={!hiddenCols.has(i)} onChange={() => toggleCol(i)} />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="db-table-wrap">
        <table className="db-table">
          <thead>
            <tr>
              <th className="db-th-idx">#</th>
              {visibleCols.map((col) => {
                const colIdx = columns.indexOf(col);
                return (
                  <th
                    key={col.key}
                    className="db-th"
                    onClick={() => handleSort(colIdx)}
                    style={{ cursor: 'pointer' }}
                  >
                    {col.label}
                    {sortCol === colIdx && (
                      <span className="db-sort-arrow">{sortAsc ? ' \u25B2' : ' \u25BC'}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, ri) => (
              <DataRow
                key={ri}
                row={row}
                visibleCols={visibleCols}
                colTypes={colTypes}
                displayIdx={page * PER_PAGE + ri + 1}
              />
            ))}
            {pageData.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length + 1} className="db-empty">
                  No matching records
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="db-pagination">
        <button disabled={page === 0} onClick={() => setPage(0)}>
          &laquo;
        </button>
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          &lsaquo;
        </button>
        <span>
          {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, sorted.length)} /{' '}
          {sorted.length.toLocaleString()}
        </span>
        <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
          &rsaquo;
        </button>
        <button disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>
          &raquo;
        </button>
      </div>
    </div>
  );
}
