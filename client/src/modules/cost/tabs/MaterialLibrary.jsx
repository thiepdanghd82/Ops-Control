import { useState, useEffect, useMemo, useRef } from 'react';
import { sharedApi, costApi } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import EmptyState from '../../../components/Shared/EmptyState';
import SkeletonTable from '../../../components/Shared/SkeletonTable';
import Modal from '../../../components/Shared/Modal';
import ImportWizard from '../../../components/Shared/ImportWizard';
import DecimalInput from '../../../utils/DecimalInput';
import './MaterialLibrary.css';

const PER_PAGE = 200;

function fmtPrice(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toFixed(3).replace(/\.?0+$/, '');
}

export default function MaterialLibrary() {
  const { hasRole } = useAuth();
  const isViewOnly = !hasRole('user');
  const canImport = hasRole('admin');
  const [npiDB, setNpiDB] = useState([]);
  const [sourcingDB, setSourcingDB] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('npi');
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const data = await sharedApi.getMaterials();
      setNpiDB(data.npiDB || []);
      setSourcingDB(data.sourcingDB || []);
    } catch (err) {
      console.error('Failed to load materials:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      await costApi.saveAll({ npiDB, sourcingDB });
      setIsDirty(false);
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
  }

  function markDirty() {
    setIsDirty(true);
  }

  if (loading)
    return (
      <div style={{ padding: 24 }}>
        <SkeletonTable rows={10} cols={8} />
      </div>
    );

  const TABS = [
    { id: 'npi', label: 'NPI Materials', count: npiDB.length, col: '#0369a1', brd: '#0ea5e9' },
    {
      id: 'sourcing',
      label: 'Sourcing DB',
      count: sourcingDB.length,
      col: '#0f766e',
      brd: '#14b8a6',
    },
  ];

  return (
    <div className="ml-root">
      {/* Tab Bar */}
      <div className="ml-tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`ml-tab ${subTab === t.id ? 'active' : ''}`}
            style={{ '--tab-col': t.col, '--tab-brd': t.brd }}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
            <span className="ml-tab-count" style={{ '--tab-brd': t.brd }}>
              {t.count}
            </span>
          </button>
        ))}
        {isDirty && (
          <button className="ml-save-indicator" onClick={handleSave}>
            💾 Save Changes
          </button>
        )}
      </div>
      <div className="ml-body">
        {subTab === 'npi' && (
          <NPITab
            data={npiDB}
            setData={setNpiDB}
            markDirty={markDirty}
            isViewOnly={isViewOnly}
            canImport={canImport}
            reload={loadData}
          />
        )}
        {subTab === 'sourcing' && (
          <SourcingTab
            data={sourcingDB}
            setData={setSourcingDB}
            markDirty={markDirty}
            isViewOnly={isViewOnly}
            canImport={canImport}
            reload={loadData}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// NPI MATERIALS TAB
// ═══════════════════════════════════════════════════════════

// ── Shared Import button used by both NPI and Sourcing tabs ──
// Opens the ImportWizard (preview → diff → commit) bound to the dataset key.
function ImportFileButton({ datasetKey, label, onDone, disabled, inline }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleCommitted(stats) {
    setMsg(`Imported ${stats?.rowsImported ?? '?'} rows → ${stats?.totalAfter ?? '?'} total`);
    await sharedApi.refreshCache().catch(() => {});
    await onDone?.();
    setTimeout(() => setMsg(''), 4500);
  }

  // `inline` = render with the smaller .ml-hb-* classes for the unified
  // headerbar; default = legacy .ml-btn-import for back-compat callers.
  const btnCls = inline ? 'ml-hb-btn-import' : 'ml-btn-import';
  const msgCls = inline ? 'ml-hb-import-msg' : 'ml-import-msg';
  return (
    <>
      <button
        className={btnCls}
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={`Import ${label} from CSV or XLSX (preview before commit)`}
      >
        <svg
          viewBox="0 0 24 24"
          width="11"
          height="11"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
        {inline ? 'Import' : 'Import CSV/XLSX'}
      </button>
      {msg && <span className={msgCls}>{msg}</span>}
      <ImportWizard
        open={open}
        onClose={() => setOpen(false)}
        datasetKey={datasetKey}
        datasetLabel={label}
        onCommitted={handleCommitted}
      />
    </>
  );
}

function NPITab({ data, setData, markDirty, isViewOnly, canImport, reload }) {
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [page, setPage] = useState(0);
  const [editIdx, setEditIdx] = useState(null);
  const [addMode, setAddMode] = useState(false);
  const searchRef = useRef(null);

  const filtered = useMemo(() => {
    let result = data;
    if (yearFilter) result = result.filter((r) => String(r.date || '').startsWith(yearFilter));
    if (search) {
      const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter((r) => {
        const text = [r.name, r.type, r.supplier, r.note].filter(Boolean).join(' ').toLowerCase();
        return terms.every((t) => text.includes(t));
      });
    }
    return result;
  }, [data, search, yearFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  // Clamp page into range instead of resetting in an effect — avoids the
  // React 19 "setState in effect" warning and handles shrinking data
  // (e.g. rows deleted) more gracefully than a hard reset.
  const effectivePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(effectivePage * PER_PAGE, (effectivePage + 1) * PER_PAGE);

  function handleAdd(row) {
    setData((prev) => [...prev, row]);
    markDirty();
    setAddMode(false);
  }

  function handleEditSave(idx, row) {
    setData((prev) => {
      const n = [...prev];
      n[idx] = row;
      return n;
    });
    markDirty();
    setEditIdx(null);
  }

  function handleDelete(idx) {
    if (!confirm('Delete this NPI material?')) return;
    setData((prev) => prev.filter((_, i) => i !== idx));
    markDirty();
  }

  const years = useMemo(() => {
    const s = new Set();
    data.forEach((r) => {
      if (r.date) {
        const ds = String(r.date);
        if (ds.length >= 4) s.add(ds.slice(-4));
      }
    });
    return [...s].sort().reverse();
  }, [data]);

  return (
    <>
      {/* Unified Header Bar — title + search + buttons in one row */}
      <div className="ml-headerbar ml-headerbar-npi">
        <div className="ml-hb-icon">
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
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <line x1="9" y1="12" x2="15" y2="12" />
            <line x1="9" y1="16" x2="13" y2="16" />
          </svg>
        </div>
        <div className="ml-hb-titleblock">
          <div className="ml-hb-title">NPI Materials</div>
          <div className="ml-hb-meta">
            <span className="ml-hb-badge">{data.length}</span>
            <span className="ml-hb-sub">
              {paged.length} of {filtered.length}
            </span>
          </div>
        </div>
        <div className="ml-hb-search-wrap">
          <svg
            className="ml-search-icon"
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
            ref={searchRef}
            type="text"
            className="ml-hb-search"
            placeholder="Search by material name, type, supplier…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          {search && filtered.length < data.length && (
            <span className="ml-hb-search-badge">
              {filtered.length} / {data.length}
            </span>
          )}
        </div>
        <select
          className="ml-hb-year-filter"
          value={yearFilter}
          onChange={(e) => {
            setYearFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        {!isViewOnly && (
          <button className="ml-hb-btn-add" onClick={() => setAddMode(true)}>
            <svg
              viewBox="0 0 24 24"
              width="11"
              height="11"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Row
          </button>
        )}
        {canImport && (
          <ImportFileButton
            datasetKey="npi-materials"
            label="NPI Materials"
            onDone={reload}
            inline
          />
        )}
      </div>

      {/* Full-screen table flush with header bar */}
      <div className="ml-table-full">
        <div className="ml-table-flush">
          <table className="ml-table">
            <thead>
              <tr>
                <th className="th-d" style={{ width: 42, textAlign: 'center' }}>
                  #
                </th>
                <th className="th-d" style={{ width: 88 }}>
                  Update Date
                </th>
                <th className="th-d" style={{ minWidth: 190 }}>
                  Material Name
                </th>
                <th className="th-b" style={{ width: 96 }}>
                  <span className="th-sub">USD / m²</span>Price
                </th>
                <th className="th-d" style={{ minWidth: 150 }}>
                  Type / Description
                </th>
                <th className="th-g" style={{ width: 80 }}>
                  <span className="th-sub-g">mm</span>Thickness
                </th>
                <th className="th-d" style={{ width: 80 }}>
                  Color
                </th>
                <th className="th-d" style={{ width: 78 }}>
                  Surface
                </th>
                <th className="th-d" style={{ width: 88 }}>
                  Adhesive
                </th>
                <th className="th-y" style={{ width: 85 }}>
                  <span className="th-sub-y">m²</span>MOQ
                </th>
                <th className="th-y" style={{ width: 85 }}>
                  <span className="th-sub-y">days</span>Lead Time
                </th>
                <th className="th-d" style={{ width: 125 }}>
                  Supplier
                </th>
                <th className="th-d" style={{ minWidth: 200 }}>
                  Notes / Remarks
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ padding: 0 }}>
                    <EmptyState
                      icon="📋"
                      title="No materials found"
                      hint="Try clearing the search or import a fresh NPI materials CSV."
                    />
                  </td>
                </tr>
              ) : (
                paged.map((r, i) => {
                  const realIdx = data.indexOf(r);
                  return (
                    <tr
                      key={realIdx}
                      className="ml-row"
                      onClick={() => !isViewOnly && setEditIdx(realIdx)}
                    >
                      <td className="td-num">{page * PER_PAGE + i + 1}</td>
                      <td className="td-date">{r.date || '—'}</td>
                      <td className="td-name">{r.name || '—'}</td>
                      <td className="td-price">{fmtPrice(r.price)}</td>
                      <td className="td-type">{r.type || '—'}</td>
                      <td className="td-dim">{r.thick != null ? r.thick : '—'}</td>
                      <td className="td-text">{r.color || '—'}</td>
                      <td className="td-text">{r.surface || '—'}</td>
                      <td className="td-text">{r.adhesive || '—'}</td>
                      <td className="td-moq">{r.moq || '—'}</td>
                      <td className="td-moq">{r.lt || '—'}</td>
                      <td className="td-text">{r.supplier || '—'}</td>
                      <td className="td-note">{r.note || '—'}</td>
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
        <div className="ml-pagination">
          <button className="ml-pg-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </button>
          <span className="ml-pg-info">
            {page + 1} / {totalPages}
          </span>
          <button
            className="ml-pg-btn"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}

      {/* Edit Modal */}
      {editIdx !== null && (
        <NPIEditModal
          row={data[editIdx]}
          idx={editIdx}
          onSave={(row) => handleEditSave(editIdx, row)}
          onDelete={() => {
            handleDelete(editIdx);
            setEditIdx(null);
          }}
          onClose={() => setEditIdx(null)}
          isViewOnly={isViewOnly}
        />
      )}

      {/* Add Modal */}
      {addMode && (
        <NPIEditModal
          row={{}}
          idx={-1}
          onSave={handleAdd}
          onClose={() => setAddMode(false)}
          isNew
          isViewOnly={false}
        />
      )}
    </>
  );
}

function NPIEditModal({ row, idx, onSave, onDelete, onClose, isNew, isViewOnly }) {
  const [form, setForm] = useState({ ...row });
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <Modal open onClose={onClose} size="lg" ariaLabelledBy="ml-npi-title">
      <Modal.Header
        id="ml-npi-title"
        title={isNew ? 'New NPI Material' : 'Edit NPI Material'}
        subtitle={isNew ? undefined : `#${idx + 1} — ${row.name || 'Untitled'}`}
        severity="info"
      />
      <Modal.Body>
        <Section color="#1e40af" icon="📅" title="Identification">
          <Field
            label="Update Date"
            value={form.date}
            onChange={(v) => set('date', v)}
            disabled={isViewOnly}
          />
          <Field
            label="Supplier"
            value={form.supplier}
            onChange={(v) => set('supplier', v)}
            disabled={isViewOnly}
          />
          <Field
            label="Material Name"
            value={form.name}
            onChange={(v) => set('name', v)}
            wide
            disabled={isViewOnly}
          />
        </Section>
        <Section color="#0369a1" icon="🔬" title="Specifications">
          <Field
            label="Type / Description"
            value={form.type}
            onChange={(v) => set('type', v)}
            wide
            disabled={isViewOnly}
          />
          <Field
            label="Thickness (mm)"
            value={form.thick}
            onChange={(v) => set('thick', v)}
            type="number"
            disabled={isViewOnly}
          />
          <Field
            label="Color"
            value={form.color}
            onChange={(v) => set('color', v)}
            disabled={isViewOnly}
          />
          <Field
            label="Surface"
            value={form.surface}
            onChange={(v) => set('surface', v)}
            disabled={isViewOnly}
          />
          <Field
            label="Adhesive"
            value={form.adhesive}
            onChange={(v) => set('adhesive', v)}
            disabled={isViewOnly}
          />
        </Section>
        <Section color="#047857" icon="💰" title="Pricing">
          <Field
            label="EXW Price (USD/m²)"
            value={form.exw}
            onChange={(v) => set('exw', v)}
            disabled={isViewOnly}
          />
          <Field
            label="DAP Price (USD/m²)"
            value={form.price}
            onChange={(v) => set('price', v)}
            disabled={isViewOnly}
          />
        </Section>
        <Section color="#92400e" icon="📦" title="Logistics">
          <Field
            label="MOQ (m²)"
            value={form.moq}
            onChange={(v) => set('moq', v)}
            disabled={isViewOnly}
          />
          <Field
            label="Lead Time (days)"
            value={form.lt}
            onChange={(v) => set('lt', v)}
            disabled={isViewOnly}
          />
        </Section>
        <Section color="#7c3aed" icon="📝" title="Notes / Remarks" single>
          <div className="op-form-field op-form-field--wide">
            <textarea
              className="op-form-input"
              value={form.note || ''}
              disabled={isViewOnly}
              onChange={(e) => set('note', e.target.value)}
              placeholder="Additional notes…"
              rows={3}
            />
          </div>
        </Section>
      </Modal.Body>
      <Modal.Footer align="between">
        {!isNew && onDelete && !isViewOnly ? (
          <button type="button" className="op-btn op-btn-danger" onClick={onDelete}>
            Delete
          </button>
        ) : (
          <span />
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="op-btn op-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          {!isViewOnly && (
            <button type="button" className="op-btn op-btn-primary" onClick={() => onSave(form)}>
              Save Changes
            </button>
          )}
        </div>
      </Modal.Footer>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
// SOURCING DATABASE TAB
// ═══════════════════════════════════════════════════════════

function SourcingTab({ data, setData, markDirty, isViewOnly, canImport, reload }) {
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [page, setPage] = useState(0);
  const [editIdx, setEditIdx] = useState(null);
  const [addMode, setAddMode] = useState(false);

  const filtered = useMemo(() => {
    let result = data;
    if (yearFilter) result = result.filter((r) => String(r.month || '').startsWith(yearFilter));
    if (search) {
      const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter((r) => {
        const text = [r.material, r.supplier, r.cust, r.req, r.size, r.status]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return terms.every((t) => text.includes(t));
      });
    }
    return result;
  }, [data, search, yearFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paged = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  function handleAdd(row) {
    setData((prev) => [...prev, row]);
    markDirty();
    setAddMode(false);
  }
  function handleEditSave(idx, row) {
    setData((prev) => {
      const n = [...prev];
      n[idx] = row;
      return n;
    });
    markDirty();
    setEditIdx(null);
  }
  function handleDelete(idx) {
    if (!confirm('Delete this sourcing record?')) return;
    setData((prev) => prev.filter((_, i) => i !== idx));
    markDirty();
  }

  const years = useMemo(() => {
    const s = new Set();
    data.forEach((r) => {
      if (r.month) {
        const ds = String(r.month);
        if (ds.length >= 4) s.add(ds.slice(0, 4));
      }
    });
    return [...s].sort().reverse();
  }, [data]);

  return (
    <>
      {/* Unified Header Bar */}
      <div className="ml-headerbar ml-headerbar-src">
        <div className="ml-hb-icon">
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
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </div>
        <div className="ml-hb-titleblock">
          <div className="ml-hb-title">Sourcing Database</div>
          <div className="ml-hb-meta">
            <span className="ml-hb-badge">{data.length}</span>
            <span className="ml-hb-sub">
              {paged.length} of {filtered.length}
            </span>
          </div>
        </div>
        <div className="ml-hb-search-wrap">
          <svg
            className="ml-search-icon"
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
            type="text"
            className="ml-hb-search"
            placeholder="Search by material, supplier, customer…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          {search && filtered.length < data.length && (
            <span className="ml-hb-search-badge">
              {filtered.length} / {data.length}
            </span>
          )}
        </div>
        <select
          className="ml-hb-year-filter"
          value={yearFilter}
          onChange={(e) => {
            setYearFilter(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        {!isViewOnly && (
          <button className="ml-hb-btn-add" onClick={() => setAddMode(true)}>
            <svg
              viewBox="0 0 24 24"
              width="11"
              height="11"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Row
          </button>
        )}
        {canImport && (
          <ImportFileButton datasetKey="sourcing-db" label="Sourcing DB" onDone={reload} inline />
        )}
      </div>

      {/* Full-screen table flush with header bar */}
      <div className="ml-table-full">
        <div className="ml-table-flush">
          <table className="ml-table">
            <thead>
              <tr>
                <th className="th-d" style={{ width: 38, textAlign: 'center' }}>
                  #
                </th>
                <th className="th-d" style={{ width: 82 }}>
                  Req. Date
                </th>
                <th className="th-d" style={{ width: 80 }}>
                  Requester
                </th>
                <th className="th-g" style={{ width: 100 }}>
                  Customer / Project
                </th>
                <th className="th-d" style={{ minWidth: 210 }}>
                  Material Inquiry
                </th>
                <th className="th-d" style={{ minWidth: 155 }}>
                  Size / Spec
                </th>
                <th className="th-b" style={{ width: 105 }}>
                  <span className="th-sub">USD / m²</span>EXW Price
                </th>
                <th className="th-b" style={{ width: 115 }}>
                  <span className="th-sub">USD / m²</span>DAP Price
                </th>
                <th className="th-y" style={{ width: 110 }}>
                  <span className="th-sub-y">min qty</span>Supplier MOQ
                </th>
                <th className="th-y" style={{ width: 100 }}>
                  <span className="th-sub-y">days/weeks</span>Lead Time
                </th>
                <th className="th-d" style={{ width: 130 }}>
                  Supplier
                </th>
                <th className="th-d" style={{ minWidth: 160 }}>
                  Status / Remark
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: 0 }}>
                    <EmptyState
                      icon="📦"
                      title="No sourcing records"
                      hint="Import sourcing quotes or add a new record to get started."
                    />
                  </td>
                </tr>
              ) : (
                paged.map((r, i) => {
                  const realIdx = data.indexOf(r);
                  return (
                    <tr
                      key={realIdx}
                      className="ml-row"
                      onClick={() => !isViewOnly && setEditIdx(realIdx)}
                    >
                      <td className="td-num">{page * PER_PAGE + i + 1}</td>
                      <td className="td-date">{r.month || '—'}</td>
                      <td className="td-text">{r.req || '—'}</td>
                      <td className="td-customer">{r.cust || '—'}</td>
                      <td className="td-name">{r.material || '—'}</td>
                      <td className="td-text">{r.size || '—'}</td>
                      <td className="td-exw">{fmtPrice(r.exw)}</td>
                      <td className="td-price">{fmtPrice(r.dap)}</td>
                      <td className="td-moq">{r.moq || '—'}</td>
                      <td className="td-moq">{r.lt || '—'}</td>
                      <td className="td-text">{r.supplier || '—'}</td>
                      <td className="td-note">{r.status || '—'}</td>
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
        <div className="ml-pagination">
          <button className="ml-pg-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </button>
          <span className="ml-pg-info">
            {page + 1} / {totalPages}
          </span>
          <button
            className="ml-pg-btn"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}

      {/* Edit Modal */}
      {editIdx !== null && (
        <SrcEditModal
          row={data[editIdx]}
          idx={editIdx}
          onSave={(row) => handleEditSave(editIdx, row)}
          onDelete={() => {
            handleDelete(editIdx);
            setEditIdx(null);
          }}
          onClose={() => setEditIdx(null)}
          isViewOnly={isViewOnly}
        />
      )}
      {addMode && (
        <SrcEditModal
          row={{}}
          idx={-1}
          onSave={handleAdd}
          onClose={() => setAddMode(false)}
          isNew
          isViewOnly={false}
        />
      )}
    </>
  );
}

function SrcEditModal({ row, idx, onSave, onDelete, onClose, isNew, isViewOnly }) {
  const [form, setForm] = useState({ ...row });
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <Modal open onClose={onClose} size="lg" ariaLabelledBy="ml-src-title">
      <Modal.Header
        id="ml-src-title"
        title={isNew ? 'New Sourcing Record' : 'Edit Sourcing Record'}
        subtitle={isNew ? undefined : `#${idx + 1} — ${row.material || 'Untitled'}`}
        severity="info"
      />
      <Modal.Body>
        <Section color="#0f766e" icon="📅" title="Request Info">
          <Field
            label="Req. Date"
            value={form.month}
            onChange={(v) => set('month', v)}
            disabled={isViewOnly}
          />
          <Field
            label="Requester"
            value={form.req}
            onChange={(v) => set('req', v)}
            disabled={isViewOnly}
          />
          <Field
            label="Customer / Project"
            value={form.cust}
            onChange={(v) => set('cust', v)}
            disabled={isViewOnly}
          />
        </Section>
        <Section color="#1e40af" icon="🔍" title="Material Inquiry">
          <Field
            label="Material Inquiry"
            value={form.material}
            onChange={(v) => set('material', v)}
            wide
            disabled={isViewOnly}
          />
          <Field
            label="Size / Spec"
            value={form.size}
            onChange={(v) => set('size', v)}
            wide
            disabled={isViewOnly}
          />
        </Section>
        <Section color="#047857" icon="💰" title="Pricing">
          <Field
            label="EXW Price (USD/m²)"
            value={form.exw}
            onChange={(v) => set('exw', v)}
            disabled={isViewOnly}
          />
          <Field
            label="DAP Price (USD/m²)"
            value={form.dap}
            onChange={(v) => set('dap', v)}
            disabled={isViewOnly}
          />
        </Section>
        <Section color="#92400e" icon="📦" title="Logistics">
          <Field
            label="Supplier MOQ"
            value={form.moq}
            onChange={(v) => set('moq', v)}
            disabled={isViewOnly}
          />
          <Field
            label="Lead Time"
            value={form.lt}
            onChange={(v) => set('lt', v)}
            disabled={isViewOnly}
          />
          <Field
            label="Supplier"
            value={form.supplier}
            onChange={(v) => set('supplier', v)}
            disabled={isViewOnly}
          />
        </Section>
        <Section color="#7c3aed" icon="📝" title="Status / Remark" single>
          <div className="op-form-field op-form-field--wide">
            <textarea
              className="op-form-input"
              value={form.status || ''}
              disabled={isViewOnly}
              onChange={(e) => set('status', e.target.value)}
              placeholder="Status or remarks…"
              rows={3}
            />
          </div>
        </Section>
      </Modal.Body>
      <Modal.Footer align="between">
        {!isNew && onDelete && !isViewOnly ? (
          <button type="button" className="op-btn op-btn-danger" onClick={onDelete}>
            Delete
          </button>
        ) : (
          <span />
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="op-btn op-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          {!isViewOnly && (
            <button type="button" className="op-btn op-btn-primary" onClick={() => onSave(form)}>
              Save Changes
            </button>
          )}
        </div>
      </Modal.Footer>
    </Modal>
  );
}

// Coloured-banner section wrapper used by both NPI + Sourcing editors.
// `single=true` skips the form grid (caller provides its own layout).
function Section({ color, icon, title, single, children }) {
  return (
    <div className="op-form-section" style={{ '--sec-color': color }}>
      <div className="op-form-section-header">
        {icon && <span aria-hidden>{icon}</span>}
        <span>{title}</span>
      </div>
      <div className="op-form-section-body">
        {single ? children : <div className="op-form-grid">{children}</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARED FIELD COMPONENT
// ═══════════════════════════════════════════════════════════

function Field({ label, value, onChange, type = 'text', wide, disabled }) {
  // Sprint AG — numeric fields route through DecimalInput so partial
  // decimals like "0.1" don't get clobbered by the native-number +
  // parent re-render loop. The value-fallback below (text path) is
  // safe because text fields don't have a "0 is falsy" trap.
  return (
    <div className={`op-form-field ${wide ? 'op-form-field--wide' : ''}`}>
      <label>{label}</label>
      {type === 'number' ? (
        <DecimalInput
          className="op-form-input"
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      ) : (
        <input
          type={type}
          className="op-form-input"
          value={value || ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
