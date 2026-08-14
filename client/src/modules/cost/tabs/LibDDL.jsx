/**
 * LibDDL — Drop-Down List Editor
 * Matches COST V1.0 M12: renderLibDDL
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useCostLib } from '../../../context/CostLibContext';
import { costApi } from '../../../services/api';
import EmptyState from '../../../components/Shared/EmptyState';
import Modal from '../../../components/Shared/Modal';
import { SITES } from '../../../utils/sites';
import DecimalInput from '../../../utils/DecimalInput';
import {
  addObjectKey,
  deleteObjectKey,
  deleteArrayIndex,
  reconcileToolLife,
  renameToolLifeKey,
} from './ddlEntryHelpers.js';
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
// Internal keys to skip.
//   `print` (2026-05-11): redundant press-subtype panel — duplicated
//   `print_type_list` semantics with parens/spacing variations (e.g.
//   "Flexo(4C Gallus)" vs "Flexo(Gallus4C)"). No code consumer in
//   client/server; hidden from the operator UI to avoid confusion
//   with `print_type` (coverage-keyed: Indigo / SS / Flexo / LP) and
//   `print_type_list` (process Workcenter list). Data row stays in
//   ddl_sites.json for forensic trail; can be safely deleted later.
const SKIP_KEYS = new Set([
  '_custom_sections',
  '_custom_names',
  '_custom_colors',
  'npi_design_owner',
  'print',
]);

export default function LibDDL() {
  const { rawDDL, setRawDDL, refreshLib } = useCostLib();
  const [site, setSite] = useState('VN');
  const [sections, setSections] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  // Anti-clobber: set when /save-all returns 409 (another admin changed DDL
  // since we loaded). The user must reload before saving so they don't
  // overwrite the other edit.
  const [conflict, setConflict] = useState(false);
  // Add-entry modal for the object-keyed tables (tool_life / click_charges).
  // Replaces window.prompt, which returns null in the packaged Electron app
  // (MES-3-FIX-43) so "+ Add" silently did nothing. { key, label } when open.
  const [addModal, setAddModal] = useState(null);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [newValInput, setNewValInput] = useState('');
  const [addError, setAddError] = useState('');
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
        if (SKIP_KEYS.has(k)) {
          clone[k] = v;
          continue;
        }
        if (Array.isArray(v)) clone[k] = [...v];
        else if (typeof v === 'object' && v !== null) clone[k] = { ...v };
        else clone[k] = v;
      }
      // Money-path heal: ensure tool_life is keyed exactly by tool_type so
      // getToolLife resolves for every selectable tool type (carry legacy
      // values over via a normalized match; never drop without carry-over).
      let healed = false;
      if (Array.isArray(clone.tool_type)) {
        const rec = reconcileToolLife(clone.tool_type, clone.tool_life || {});
        clone.tool_life = rec.toolLife;
        healed = rec.changed;
      }
      setSections(clone);
      seededSiteRef.current = site;
      setDirty(healed); // dirty only if the reconcile actually changed data
      return;
    } else if (seededSiteRef.current !== site) {
      setSections({});
      seededSiteRef.current = site;
    }
    setDirty(false);
  }, [site, rawDDL, sections]);

  const updateItem = useCallback((key, idx, value) => {
    setSections((prev) => {
      const arr = [...(prev[key] || [])];
      const oldVal = arr[idx];
      arr[idx] = value;
      const next = { ...prev, [key]: arr };
      // Cascade a tool_type rename onto tool_life so the value follows the
      // name (tool_life stays keyed exactly by tool_type). Other array
      // sections are unaffected.
      if (key === 'tool_type') {
        next.tool_life = renameToolLifeKey(prev.tool_life, oldVal, value);
      }
      return next;
    });
    setDirty(true);
  }, []);

  const addItem = useCallback((key) => {
    setSections((prev) => {
      const arr = [...(prev[key] || []), ''];
      return { ...prev, [key]: arr };
    });
    setDirty(true);
  }, []);

  const deleteItem = useCallback((key, idx) => {
    setSections((prev) => {
      const removed = (prev[key] || [])[idx];
      const arr = (prev[key] || []).filter((_, i) => i !== idx);
      const next = { ...prev, [key]: arr };
      // Cascade a tool_type delete: drop its tool_life key.
      if (key === 'tool_type') {
        next.tool_life = deleteObjectKey(prev.tool_life, String(removed ?? '').trim());
      }
      return next;
    });
    setDirty(true);
  }, []);

  const updateObjectEntry = useCallback((key, entryKey, value) => {
    setSections((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [entryKey]: value },
    }));
    setDirty(true);
  }, []);

  // Open the add-entry modal for an object-keyed section (no window.prompt).
  const addObjectEntry = useCallback((key, label) => {
    setAddModal({ key, label });
    setNewKeyInput('');
    setNewValInput('');
    setAddError('');
  }, []);

  const confirmAddObjectEntry = useCallback(() => {
    if (!addModal) return;
    const res = addObjectKey(sections[addModal.key], newKeyInput, newValInput);
    if (!res.ok) {
      setAddError(res.error === 'duplicate' ? 'That key already exists.' : 'Enter a key name.');
      return;
    }
    setSections((prev) => ({ ...prev, [addModal.key]: res.obj }));
    setDirty(true);
    setAddModal(null);
  }, [addModal, sections, newKeyInput, newValInput]);

  const deleteObjectEntry = useCallback((key, entryKey) => {
    setSections((prev) => ({ ...prev, [key]: deleteObjectKey(prev[key], entryKey) }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMsg('');
    try {
      const ddlSites = { ...(rawDDL.ddlSites || {}), [site]: sections };
      // Persist FIRST (send the _rev we loaded so the server can reject a stale
      // overwrite with 409). Only commit to CostLibContext on success — that
      // way a 409 doesn't leave local state ahead of the server.
      // NOTE: server /save-all expects key `ddlSitesDB`, not `ddlSites`.
      const resp = await costApi.saveAll({ ddlSitesDB: ddlSites, _ddlRev: rawDDL._rev });
      // Commit locally so calculators/other tabs see the new values immediately,
      // and adopt the new _rev so the NEXT save isn't a false conflict.
      setRawDDL({ ...rawDDL, ddlSites, _rev: resp?.ddl_rev ?? rawDDL._rev });
      seededSiteRef.current = site;
      setDirty(false);
      setMsg('Saved');
      setTimeout(() => setMsg(''), 2000);
    } catch (err) {
      if (err?.status === 409) {
        // Someone else edited DDL since we loaded — don't clobber. Keep the
        // user's local edits visible but require a reload before saving.
        setConflict(true);
        setMsg('');
      } else {
        setMsg('Error: ' + err.message);
      }
    } finally {
      setSaving(false);
    }
  }, [sections, site, rawDDL, setRawDDL]);

  const handleReload = useCallback(async () => {
    setConflict(false);
    setDirty(false);
    seededSiteRef.current = null; // force re-seed from the freshly fetched data
    setMsg('Reloading…');
    try {
      await refreshLib();
      setMsg('Reloaded — review then save again');
      setTimeout(() => setMsg(''), 2500);
    } catch (err) {
      setMsg('Reload failed: ' + err.message);
    }
  }, [refreshLib]);

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
  const sectionKeys = Object.keys(sections).filter((k) => !SKIP_KEYS.has(k));

  return (
    <div className="lib-ddl">
      <div className="ddl-toolbar">
        <div className="ddl-title">Drop-Down Lists</div>
        <div className="ddl-sites">
          {SITES.map((s) => (
            <button
              key={s}
              className={`ddl-site-btn ${site === s ? 'active' : ''}`}
              onClick={() => setSite(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="ddl-actions">
          {msg && <span className="ddl-msg">{msg}</span>}
          <button className="ddl-btn" onClick={handleBackup}>
            Backup
          </button>
          <button className="ddl-btn ddl-btn-save" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {conflict && (
        <div className="ddl-conflict" role="alert">
          <span>
            ⚠ Drop-Down Lists đã được người khác sửa kể từ lúc bạn mở. Tải lại để xem thay đổi mới
            trước khi lưu (chỉnh sửa của bạn vẫn còn cho tới khi bấm Tải lại).
          </span>
          <button className="ddl-btn ddl-btn-save" onClick={handleReload}>
            Tải lại
          </button>
        </div>
      )}

      <div className="ddl-content">
        {sectionKeys.length === 0 && (
          <EmptyState
            icon="⏷"
            title={`No DDL data for ${site}`}
            hint="Add a section above to define drop-down options for this site."
          />
        )}
        <div className="ddl-grid">
          {sectionKeys.map((key) => {
            const label = SECTION_LABELS[key] || sections._custom_names?.[key] || key;
            const value = sections[key];

            // Coverage is an array of objects {pt, cov}
            if (key === 'coverage' && Array.isArray(value)) {
              return (
                <div key={key} className="ddl-card">
                  <div className="ddl-card-head">{label}</div>
                  <div className="ddl-card-body">
                    {value.map((item, i) => (
                      <div key={i} className="ddl-cov-row">
                        <input
                          type="text"
                          value={item.pt || ''}
                          placeholder="Print Type"
                          onChange={(e) => {
                            const arr = [...value];
                            arr[i] = { ...arr[i], pt: e.target.value };
                            setSections((prev) => ({ ...prev, [key]: arr }));
                            setDirty(true);
                          }}
                        />
                        <DecimalInput
                          value={item.cov}
                          placeholder="Coverage"
                          onChange={(v) => {
                            const arr = [...value];
                            arr[i] = { ...arr[i], cov: v };
                            setSections((prev) => ({ ...prev, [key]: arr }));
                            setDirty(true);
                          }}
                        />
                        <button
                          className="ddl-del"
                          title="Delete row"
                          aria-label="Delete row"
                          onClick={() => {
                            setSections((prev) => ({
                              ...prev,
                              [key]: deleteArrayIndex(value, i),
                            }));
                            setDirty(true);
                          }}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                    <button
                      className="ddl-add"
                      onClick={() => {
                        setSections((prev) => ({ ...prev, [key]: [...value, { pt: '', cov: 0 }] }));
                        setDirty(true);
                      }}
                    >
                      + Add
                    </button>
                  </div>
                </div>
              );
            }

            // Tool Life — rows are GOVERNED by the tool_type list (one row
            // per tool type, in order). The label is read-only (managed in
            // the Tool Type card); only the value is editable. No own add /
            // rename / delete — the set is driven entirely by tool_type, so
            // tool_life stays keyed exactly by tool_type and getToolLife
            // resolves for every selectable tool type (money-path).
            if (key === 'tool_life' && typeof value === 'object' && !Array.isArray(value)) {
              const toolTypes = Array.isArray(sections.tool_type)
                ? sections.tool_type
                : Object.keys(value);
              return (
                <div key={key} className="ddl-card">
                  <div className="ddl-card-head">{label}</div>
                  <div className="ddl-card-body">
                    {toolTypes.length === 0 && (
                      <div className="ddl-tl-empty">Add tool types in the Tool Type card.</div>
                    )}
                    {toolTypes.map((tt, i) => (
                      <div key={`${tt}-${i}`} className="ddl-kv-row">
                        <span className="ddl-kv-key ddl-kv-key-wide" title={tt}>
                          {tt || '—'}
                        </span>
                        <input
                          type="text"
                          value={value[tt] ?? ''}
                          onChange={(e) => updateObjectEntry('tool_life', tt, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            // Object sections (click_charges)
            if (OBJECT_KEYS.has(key) && typeof value === 'object' && !Array.isArray(value)) {
              return (
                <div key={key} className="ddl-card">
                  <div className="ddl-card-head">{label}</div>
                  <div className="ddl-card-body">
                    {Object.entries(value).map(([ek, ev]) => (
                      <div key={ek} className="ddl-kv-row">
                        <span className="ddl-kv-key">{ek}</span>
                        <input
                          type="text"
                          value={ev ?? ''}
                          onChange={(e) => updateObjectEntry(key, ek, e.target.value)}
                        />
                        <button
                          className="ddl-del"
                          title="Delete row"
                          aria-label="Delete row"
                          onClick={() => deleteObjectEntry(key, ek)}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                    <button className="ddl-add" onClick={() => addObjectEntry(key, label)}>
                      + Add
                    </button>
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
                        <input
                          type="text"
                          value={typeof item === 'string' ? item : JSON.stringify(item)}
                          onChange={(e) => updateItem(key, i, e.target.value)}
                        />
                        <button className="ddl-del" onClick={() => deleteItem(key, i)}>
                          &times;
                        </button>
                      </div>
                    ))}
                    <button className="ddl-add" onClick={() => addItem(key)}>
                      + Add
                    </button>
                  </div>
                </div>
              );
            }

            return null;
          })}
        </div>
      </div>

      <Modal
        open={!!addModal}
        onClose={() => setAddModal(null)}
        size="sm"
        ariaLabelledBy="ddl-add-title"
      >
        <Modal.Header id="ddl-add-title" title={`Add ${addModal?.label || 'entry'}`} />
        <Modal.Body>
          <div className="ddl-add-field">
            <label className="ddl-add-label" htmlFor="ddl-add-key">
              Key
            </label>
            <input
              id="ddl-add-key"
              type="text"
              className="ddl-add-input"
              data-modal-autofocus
              placeholder={
                addModal?.key === 'click_charges' ? 'Number, e.g. 1' : 'Name, e.g. Knife'
              }
              value={newKeyInput}
              onChange={(e) => {
                setNewKeyInput(e.target.value);
                if (addError) setAddError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmAddObjectEntry();
              }}
            />
          </div>
          <div className="ddl-add-field">
            <label className="ddl-add-label" htmlFor="ddl-add-val">
              Value <span className="ddl-add-optional">(optional)</span>
            </label>
            <input
              id="ddl-add-val"
              type="text"
              className="ddl-add-input"
              value={newValInput}
              onChange={(e) => setNewValInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmAddObjectEntry();
              }}
            />
          </div>
          {addError && <div className="ddl-add-err">{addError}</div>}
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="op-btn op-btn-ghost" onClick={() => setAddModal(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="op-btn op-btn-primary"
            onClick={confirmAddObjectEntry}
            disabled={!newKeyInput.trim()}
          >
            Add
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
