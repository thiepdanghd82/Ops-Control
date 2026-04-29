/**
 * LibRate — Work Center Rate Table Editor
 * Matches COST V1.0 M10: renderLibRate
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useCostLib } from '../../../context/CostLibContext';
import { costApi, importApi } from '../../../services/api';
import EmptyState from '../../../components/Shared/EmptyState';
import { SITES } from '../../../utils/sites';
import DecimalInput from '../../../utils/DecimalInput';
import './LibRate.css';
const DEFAULT_SPEED_UOMS = ['', 'M/min', 'Mtr/Hr', 'Stamp/min', 'Pcs/H', 'Sheets/H', 'Sheet/H'];
const ADD_NEW_SENTINEL = '__add_new__';

// Custom UOMs persist to localStorage so they survive page reloads.
function loadCustomUoms() {
  try {
    const raw = localStorage.getItem('ops.rate.customUoms');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveCustomUoms(list) {
  try { localStorage.setItem('ops.rate.customUoms', JSON.stringify(list)); } catch { /* quota */ }
}

export default function LibRate() {
  const { rawRates, refreshLib } = useCostLib();
  const [site, setSite] = useState('VN');
  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [backups, setBackups] = useState([]);
  const [showBackups, setShowBackups] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);
  const [customUoms, setCustomUoms] = useState(loadCustomUoms);
  const allUoms = [...DEFAULT_SPEED_UOMS, ...customUoms.filter(u => !DEFAULT_SPEED_UOMS.includes(u))];

  useEffect(() => {
    const siteData = rawRates.rateSites?.[site];
    if (siteData && Array.isArray(siteData)) {
      setRows(siteData.map(r => ({ ...r })));
    } else {
      setRows([]);
    }
    setDirty(false);
  }, [site, rawRates]);

  const updateRow = useCallback((idx, field, value) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    setDirty(true);
  }, []);

  const addRow = useCallback(() => {
    setRows(prev => [...prev, { workcenter: '', crew: 1, machine_rate: 0, labor_rate: 0, speed_uom: '', oh_cost: 0, mc_cost: '' }]);
    setDirty(true);
  }, []);

  const deleteRow = useCallback((idx) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMsg('');
    try {
      const rateSites = { ...(rawRates.rateSites || {}) };
      rateSites[site] = rows;
      // Server /save-all expects key `rateSitesDB`, not `rateSites`.
      await costApi.saveAll({ rateSitesDB: rateSites });
      setDirty(false);
      setMsg('Saved');
      refreshLib();
      setTimeout(() => setMsg(''), 2000);
    } catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [rows, site, rawRates, refreshLib]);

  const handleBackup = useCallback(async () => {
    try {
      await costApi.backupRate(site, rows);
      setMsg('Backup created');
      setTimeout(() => setMsg(''), 2000);
    } catch (err) {
      setMsg('Backup failed: ' + err.message);
    }
  }, [site, rows]);

  const loadBackups = useCallback(async () => {
    try {
      const list = await costApi.getRateBackups(site);
      setBackups(Array.isArray(list) ? list : list.backups || []);
      setShowBackups(true);
    } catch (err) {
      setMsg('Failed to load backups: ' + err.message);
    }
  }, [site]);

  const handleRestore = useCallback(async (filename) => {
    if (!confirm(`Restore rate from ${filename}?`)) return;
    try {
      await costApi.restoreRate(filename, site);
      setShowBackups(false);
      setMsg('Restored');
      refreshLib();
      setTimeout(() => setMsg(''), 2000);
    } catch (err) {
      setMsg('Restore failed: ' + err.message);
    }
  }, [site, refreshLib]);

  const handleExportCsv = useCallback(async () => {
    try {
      await costApi.exportRateCsv(site, rows);
      setMsg('CSV exported');
      setTimeout(() => setMsg(''), 2000);
    } catch (err) {
      setMsg('Export failed: ' + err.message);
    }
  }, [site, rows]);

  // CSV/XLSX import → POST /api/import/rate?site=<site>. Server auto-maps
  // headers (Workcenter, Crew, Machine USD/H, Labor USD/H, UOM, OH Cost),
  // filters blank rows, backs up rate_sites.json, writes the target site,
  // and clears the server cache. We then refreshLib() so the context pulls
  // the new rows in and the useEffect on `rawRates` repopulates the table.
  const handleImport = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (dirty && !confirm('You have unsaved changes. Import will discard them. Continue?')) return;
    setImporting(true);
    setMsg('Importing…');
    try {
      const res = await importApi.uploadRate(file, site);
      const stats = res?.stats || {};
      setMsg(`Imported ${stats.rows ?? '?'} rows into ${stats.site || site}`);
      await refreshLib();
      setDirty(false);
      setTimeout(() => setMsg(''), 3500);
    } catch (err) {
      console.error('Rate import failed:', err);
      setMsg('Import failed: ' + (err.message || 'Unknown'));
      setTimeout(() => setMsg(''), 5000);
    } finally {
      setImporting(false);
    }
  }, [site, dirty, refreshLib]);

  return (
    <div className="lib-rate">
      <div className="lr-toolbar">
        <div className="lr-title">Work Center Rate Table</div>
        <div className="lr-sites">
          {SITES.map(s => (
            <button key={s} className={`lr-site-btn ${site === s ? 'active' : ''}`} onClick={() => setSite(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="lr-actions">
          {msg && <span className="lr-msg">{msg}</span>}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <button
            className="lr-btn lr-btn-import"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            title="Import rates from CSV or XLSX (auto-maps columns, filters blank rows, syncs to server)"
          >
            {importing ? 'Importing…' : '⭡ Import'}
          </button>
          <button className="lr-btn lr-btn-csv" onClick={handleExportCsv}>Export CSV</button>
          <button className="lr-btn lr-btn-backup" onClick={handleBackup}>Backup</button>
          <button className="lr-btn lr-btn-restore" onClick={loadBackups}>Restore</button>
          <button className="lr-btn lr-btn-save" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {showBackups && (
        <div className="lr-backup-panel">
          <div className="lr-backup-head">
            <span>Backups for {site}</span>
            <button onClick={() => setShowBackups(false)}>Close</button>
          </div>
          {backups.length === 0 ? <p className="lr-backup-empty">No backups found</p> : (
            <ul className="lr-backup-list">
              {backups.map((b, i) => (
                <li key={(typeof b === 'string' ? b : b.name || b.filename) || `b-${i}`}>
                  <span>{typeof b === 'string' ? b : b.name || b.filename}</span>
                  <button onClick={() => handleRestore(typeof b === 'string' ? b : b.name || b.filename)}>Restore</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="lr-table-wrap">
        <table className="lr-table">
          <thead>
            <tr>
              <th className="lr-th-idx">#</th>
              <th>Workcenter Name</th>
              <th>Crew</th>
              <th>Machine USD/H</th>
              <th>Labor USD/H</th>
              <th>UOM</th>
              <th style={{ color: '#0d9488' }}>OH Cost</th>
              <th style={{ color: '#7c3aed' }}>W/C</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.workcenter ? `wc-${r.workcenter}-${i}` : `wc-${i}`}>
                <td className="lr-td-idx">{i + 1}</td>
                <td><input type="text" value={r.workcenter || ''} onChange={e => updateRow(i, 'workcenter', e.target.value)} /></td>
                <td><DecimalInput value={r.crew} onChange={v => updateRow(i, 'crew', v)} /></td>
                <td><DecimalInput value={r.machine_rate} onChange={v => updateRow(i, 'machine_rate', v)} /></td>
                <td><DecimalInput value={r.labor_rate} onChange={v => updateRow(i, 'labor_rate', v)} /></td>
                <td>
                  <select value={r.speed_uom || ''} onChange={e => {
                    const v = e.target.value;
                    if (v === ADD_NEW_SENTINEL) {
                      const newUom = prompt('Enter new UOM (e.g. RPM, Cuts/min):');
                      if (newUom && newUom.trim()) {
                        const trimmed = newUom.trim();
                        if (!allUoms.includes(trimmed)) {
                          const next = [...customUoms, trimmed];
                          setCustomUoms(next);
                          saveCustomUoms(next);
                        }
                        updateRow(i, 'speed_uom', trimmed);
                      }
                      // Reset select back to current value if cancelled
                      e.target.value = r.speed_uom || '';
                    } else {
                      updateRow(i, 'speed_uom', v);
                    }
                  }}>
                    {allUoms.map(u => <option key={u} value={u}>{u || '—'}</option>)}
                    <option value={ADD_NEW_SENTINEL}>+ Add new...</option>
                  </select>
                </td>
                <td><DecimalInput value={r.oh_cost} onChange={v => updateRow(i, 'oh_cost', v)} style={{ color: '#0d9488' }} /></td>
                <td><input type="text" value={r.mc_cost ?? ''} onChange={e => updateRow(i, 'mc_cost', e.target.value)} style={{ color: '#7c3aed' }} /></td>
                <td><button className="lr-del" onClick={() => deleteRow(i)} title="Delete">&times;</button></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 0 }}>
                <EmptyState icon="⏱" title={`No rate data for ${site}`} hint="Click 'Add row' above to define work-center rates for this site." />
              </td></tr>
            )}
          </tbody>
        </table>
        {/* Add Row lives under the table so it follows the data — easier
            to reach after scrolling a long list than hunting for it in
            the sticky toolbar. */}
        <div className="lr-add-row-wrap">
          <button className="lr-add-row-btn" onClick={addRow} title="Add a new workcenter row">
            + Add Row
          </button>
        </div>
      </div>
    </div>
  );
}
