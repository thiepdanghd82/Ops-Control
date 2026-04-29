/**
 * LibDDL — Drop-Down List Editor
 * Matches COST V1.0 M12: renderLibDDL
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useCostLib } from '../../../context/CostLibContext';
import { costApi } from '../../../services/api';
import EmptyState from '../../../components/Shared/EmptyState';
import { SITES } from '../../../utils/sites';
import DecimalInput from '../../../utils/DecimalInput';
import './LibDDL.css';

// Standard section display names
const SECTION_LABELS = {
  trade_mode: 'Trade Mode',
  coverage: 'Coverage Table',
  click_charges: 'Click Charges',
  tool_life: 'Tool Life',
  pre_cut: 'Pre Cut',
  die_cut: 'Die Cut',
  print_type_list: 'Print Type',
  assembly: 'Assembly',
  special_cut: 'Special Cut',
  inspection: 'Inspection',
  manual_work: 'Manual Work',
  others: 'Others',
  colors: 'Colors',
};

// Keys that are objects (not simple arrays)
const OBJECT_KEYS = new Set(['click_charges', 'tool_life', 'coverage']);
// Internal keys to skip
const SKIP_KEYS = new Set(['_custom_sections', '_custom_names', '_custom_colors', 'npi_design_owner']);

export default function LibDDL() {
  const { rawDDL, setRawDDL } = useCostLib();
  const [site, setSite] = useState('VN');
  const [sections, setSections] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  // Track which site we've already seeded and whether we've done the
  // initial load. Prevents server refreshes from clobbering unsaved edits.
  const seededSiteRef = useRef(null);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  useEffect(() => {
    // Only seed from engine data when the site changes, or the first time
    // engine data becomes available for the current site. After that, the
    // local `sections` state is authoritative until the user saves.
    if (seededSiteRef.current === site && Object.keys(sections).length > 0) return;
    if (dirtyRef.current) return;
    const siteData = rawDDL.ddlSites?.[site];
    if (siteData && typeof siteData === 'object') {
      const clone = {};
      for (const [k, v] of Object.entries(siteData)) {
        if (SKIP_KEYS.has(k)) { clone[k] = v; continue; }
        if (Array.isArray(v)) clone[k] = [...v];
        else if (typeof v === 'object' && v !== null) clone[k] = { ...v };
        else clone[k] = v;
      }
      setSections(clone);
      seededSiteRef.current = site;
    } else if (seededSiteRef.current !== site) {
      setSections({});
      seededSiteRef.current = site;
    }
    setDirty(false);
  }, [site, rawDDL, sections]);

  const updateItem = useCallback((key, idx, value) => {
    setSections(prev => {
      const arr = [...(prev[key] || [])];
      arr[idx] = value;
      return { ...prev, [key]: arr };
    });
    setDirty(true);
  }, []);

  const addItem = useCallback((key) => {
    setSections(prev => {
      const arr = [...(prev[key] || []), ''];
      return { ...prev, [key]: arr };
    });
    setDirty(true);
  }, []);

  const deleteItem = useCallback((key, idx) => {
    setSections(prev => {
      const arr = (prev[key] || []).filter((_, i) => i !== idx);
      return { ...prev, [key]: arr };
    });
    setDirty(true);
  }, []);

  const updateObjectEntry = useCallback((key, entryKey, value) => {
    setSections(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [entryKey]: value }
    }));
    setDirty(true);
  }, []);

  const addObjectEntry = useCallback((key) => {
    const newKey = prompt('Enter key name:');
    if (!newKey) return;
    setSections(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [newKey]: '' }
    }));
    setDirty(true);
  }, []);

  const deleteObjectEntry = useCallback((key, entryKey) => {
    setSections(prev => {
      const obj = { ...(prev[key] || {}) };
      delete obj[entryKey];
      return { ...prev, [key]: obj };
    });
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMsg('');
    try {
      const ddlSites = { ...(rawDDL.ddlSites || {}), [site]: sections };
      // Commit to the engine data immediately so every consumer of
      // CostLibContext (calculators, other tabs) sees the new values
      // without waiting for — or being overwritten by — a server refetch.
      setRawDDL({ ...rawDDL, ddlSites });
      seededSiteRef.current = site;
      setDirty(false);
      // Persist to disk in the background. If it fails, surface the error
      // but keep the local edit in place.
      // NOTE: server /save-all expects key `ddlSitesDB`, not `ddlSites`.
      // Previously this sent `ddlSites` which the server silently ignored,
      // so Save flashed "OK" but the file on disk was never written.
      await costApi.saveAll({ ddlSitesDB: ddlSites });
      setMsg('Saved');
      setTimeout(() => setMsg(''), 2000);
    } catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }, [sections, site, rawDDL, setRawDDL]);

  const handleBackup = useCallback(async () => {
    try {
      await costApi.backupDdl(site, sections);
      setMsg('Backup created');
      setTimeout(() => setMsg(''), 2000);
    } catch (err) {
      setMsg('Backup failed: ' + err.message);
    }
  }, [site, sections]);

  // Determine section order: known sections first, then custom
  const sectionKeys = Object.keys(sections).filter(k => !SKIP_KEYS.has(k));

  return (
    <div className="lib-ddl">
      <div className="ddl-toolbar">
        <div className="ddl-title">Drop-Down Lists</div>
        <div className="ddl-sites">
          {SITES.map(s => (
            <button key={s} className={`ddl-site-btn ${site === s ? 'active' : ''}`} onClick={() => setSite(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="ddl-actions">
          {msg && <span className="ddl-msg">{msg}</span>}
          <button className="ddl-btn" onClick={handleBackup}>Backup</button>
          <button className="ddl-btn ddl-btn-save" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="ddl-content">
        {sectionKeys.length === 0 && (
          <EmptyState icon="⏷" title={`No DDL data for ${site}`} hint="Add a section above to define drop-down options for this site." />
        )}
        <div className="ddl-grid">
          {sectionKeys.map(key => {
            const label = SECTION_LABELS[key] || (sections._custom_names?.[key]) || key;
            const value = sections[key];

            // Coverage is an array of objects {pt, cov}
            if (key === 'coverage' && Array.isArray(value)) {
              return (
                <div key={key} className="ddl-card">
                  <div className="ddl-card-head">{label}</div>
                  <div className="ddl-card-body">
                    {value.map((item, i) => (
                      <div key={i} className="ddl-cov-row">
                        <input type="text" value={item.pt || ''} placeholder="Print Type"
                          onChange={e => {
                            const arr = [...value];
                            arr[i] = { ...arr[i], pt: e.target.value };
                            setSections(prev => ({ ...prev, [key]: arr }));
                            setDirty(true);
                          }} />
                        <DecimalInput value={item.cov} placeholder="Coverage"
                          onChange={v => {
                            const arr = [...value];
                            arr[i] = { ...arr[i], cov: v };
                            setSections(prev => ({ ...prev, [key]: arr }));
                            setDirty(true);
                          }} />
                        <button className="ddl-del" onClick={() => {
                          setSections(prev => ({ ...prev, [key]: value.filter((_, j) => j !== i) }));
                          setDirty(true);
                        }}>&times;</button>
                      </div>
                    ))}
                    <button className="ddl-add" onClick={() => {
                      setSections(prev => ({ ...prev, [key]: [...value, { pt: '', cov: 0 }] }));
                      setDirty(true);
                    }}>+ Add</button>
                  </div>
                </div>
              );
            }

            // Object sections (click_charges, tool_life)
            if (OBJECT_KEYS.has(key) && typeof value === 'object' && !Array.isArray(value)) {
              return (
                <div key={key} className="ddl-card">
                  <div className="ddl-card-head">{label}</div>
                  <div className="ddl-card-body">
                    {Object.entries(value).map(([ek, ev]) => (
                      <div key={ek} className="ddl-kv-row">
                        <span className="ddl-kv-key">{ek}</span>
                        <input type="text" value={ev ?? ''} onChange={e => updateObjectEntry(key, ek, e.target.value)} />
                        <button className="ddl-del" onClick={() => deleteObjectEntry(key, ek)}>&times;</button>
                      </div>
                    ))}
                    <button className="ddl-add" onClick={() => addObjectEntry(key)}>+ Add</button>
                  </div>
                </div>
              );
            }

            // Array sections (most common)
            if (Array.isArray(value)) {
              return (
                <div key={key} className="ddl-card">
                  <div className="ddl-card-head">{label}</div>
                  <div className="ddl-card-body">
                    {value.map((item, i) => (
                      <div key={i} className="ddl-item-row">
                        <input type="text" value={typeof item === 'string' ? item : JSON.stringify(item)}
                          onChange={e => updateItem(key, i, e.target.value)} />
                        <button className="ddl-del" onClick={() => deleteItem(key, i)}>&times;</button>
                      </div>
                    ))}
                    <button className="ddl-add" onClick={() => addItem(key)}>+ Add</button>
                  </div>
                </div>
              );
            }

            return null;
          })}
        </div>
      </div>
    </div>
  );
}
