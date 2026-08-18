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
  pairTableConfig,
  createCustomTable,
  deleteCustomTable,
  isCustomSection,
  orderSectionKeys,
  applyTitleOverride,
  addExcludedType,
  dropExcludedType,
  renameExcludedType,
  reconcileCutterCost,
} from './ddlEntryHelpers.js';
import { DEFAULT_PLATE_BASE } from '../../../services/plateCost.js';
import {
  isTiered,
  toTiered,
  toFlat,
  setTierField,
  addTier,
  removeTier,
  DEFAULT_MAGNETIC_ROTARY,
} from '../../../services/cutterBaseCost.js';
import './LibDDL.css';

// Standard section display names
const SECTION_LABELS = {
  trade_mode: 'Trade Mode',
  coverage: 'Coverage Table',
  click_charges: 'Click Charges',
  tool_life: 'Tool Life',
  cutter_cost: 'Cutter Cost $',
  plate_base_cost: 'Plate Base Cost $',
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
const OBJECT_KEYS = new Set([
  'click_charges',
  'tool_life',
  'cutter_cost',
  'plate_base_cost',
  'coverage',
]);
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
  'cutter_cost_excluded',
  'npi_design_owner',
  'print',
]);

// Built-in card labels — a new custom table's name is deduped against these
// (case-insensitive) so it can't shadow a system table like "Coverage Table".
const RESERVED_LABELS = Object.values(SECTION_LABELS);

// Shared card head — every DDL card uses this so the ✎ Rename pencil shows
// consistently. `onRename` opens the rename modal (built-in + custom cards);
// `onDeleteTable` (custom pair-tables only) shows the "Delete table" action.
function DdlCardHead({ label, onRename, onDeleteTable }) {
  return (
    <div className="ddl-card-head ddl-card-head--row">
      <span className="ddl-card-head-label">{label}</span>
      {onRename && (
        <button
          type="button"
          className="ddl-title-edit"
          title="Rename this table"
          aria-label="Rename table"
          onClick={onRename}
        >
          ✎
        </button>
      )}
      {onDeleteTable && (
        <button
          type="button"
          className="ddl-table-del"
          title="Delete this custom table"
          onClick={onDeleteTable}
        >
          Delete table
        </button>
      )}
    </div>
  );
}

// Shared 2-column pair renderer (a label input + a value input per row, with
// per-row delete + "+ Add"). Drives BOTH the Coverage Table ({pt, cov}, value
// is a DecimalInput) and custom tables ({k, v}, value is free text) via the
// `config` field-mapping from pairTableConfig(). `onRowsChange` receives the
// full next array; `onDeleteTable` (custom only) renders a card-head "Delete
// table" affordance. Module-scope so a keystroke re-renders (not remounts) —
// inputs keep focus.
function PairTableCard({ label, rows, config, onRowsChange, onRename, onDeleteTable }) {
  const { labelField, valueField, labelPlaceholder, valuePlaceholder, valueDecimal, newRow } =
    config;
  const list = Array.isArray(rows) ? rows : [];
  const patchRow = (i, patch) =>
    onRowsChange(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="ddl-card">
      <DdlCardHead label={label} onRename={onRename} onDeleteTable={onDeleteTable} />
      <div className="ddl-card-body">
        {list.map((item, i) => (
          <div key={i} className="ddl-cov-row">
            <input
              type="text"
              value={item?.[labelField] || ''}
              placeholder={labelPlaceholder}
              onChange={(e) => patchRow(i, { [labelField]: e.target.value })}
            />
            {valueDecimal ? (
              <DecimalInput
                className="ddl-cov-val"
                value={item?.[valueField]}
                placeholder={valuePlaceholder}
                onChange={(v) => patchRow(i, { [valueField]: v })}
              />
            ) : (
              <input
                type="text"
                value={item?.[valueField] ?? ''}
                placeholder={valuePlaceholder}
                onChange={(e) => patchRow(i, { [valueField]: e.target.value })}
              />
            )}
            <button
              className="ddl-del"
              title="Delete row"
              aria-label="Delete row"
              onClick={() => onRowsChange(deleteArrayIndex(list, i))}
            >
              &times;
            </button>
          </div>
        ))}
        <button className="ddl-add" onClick={() => onRowsChange([...list, { ...newRow }])}>
          + Add
        </button>
      </div>
    </div>
  );
}

// Cutter Base Cost row — read-only tool-type label + a mode-aware value:
//   FLAT   (number/string): single input + "⇄ Tiered" toggle.
//   TIERED ({tiers}): per-tier "up to (m)" + "cost $" rows (catch-all shows
//   "above", upto disabled) with add/remove tier + "⇄ Flat" toggle.
// All edits flow through onSetEntry(nextEntry) → updateObjectEntry(setDirty).
// Governed by tool_type + row delete/exclusion just like the flat version.
// Module-scope so a keystroke re-renders (not remounts) — inputs keep focus.
function CutterCostRow({ label, entry, onSetEntry, onDeleteRow }) {
  const tiered = isTiered(entry);
  const tiers = tiered && Array.isArray(entry.tiers) ? entry.tiers : [];
  return (
    <div className="ddl-cc-row">
      <div className="ddl-kv-row">
        <span className="ddl-kv-key ddl-kv-key-wide" title={label}>
          {label || '—'}
        </span>
        {!tiered && (
          <input
            className="ddl-cc-flat"
            type="text"
            value={entry ?? ''}
            placeholder="cost $"
            onChange={(e) => onSetEntry(e.target.value)}
          />
        )}
        <button
          type="button"
          className="ddl-cc-toggle"
          title={tiered ? 'Chuyển về giá phẳng' : 'Chuyển sang giá theo chu vi (m)'}
          onClick={() => onSetEntry(tiered ? toFlat(entry) : toTiered(entry))}
        >
          {tiered ? '⇄ Flat' : '⇄ Tiered'}
        </button>
        <button
          className="ddl-del"
          title="Delete row"
          aria-label="Delete row"
          onClick={onDeleteRow}
        >
          &times;
        </button>
      </div>
      {tiered && (
        <div className="ddl-cc-tiers">
          {tiers.map((t, i) => {
            const isCatch = t && t.upto_m == null;
            return (
              <div key={i} className="ddl-cc-tier">
                <input
                  className="ddl-cc-upto"
                  type="text"
                  disabled={isCatch}
                  value={isCatch ? '' : (t?.upto_m ?? '')}
                  placeholder={isCatch ? '∞ (above)' : 'up to (m)'}
                  onChange={(e) =>
                    onSetEntry({ tiers: setTierField(tiers, i, 'upto_m', e.target.value) })
                  }
                />
                <input
                  className="ddl-cc-cost"
                  type="text"
                  value={t?.cost ?? ''}
                  placeholder="cost $"
                  onChange={(e) =>
                    onSetEntry({ tiers: setTierField(tiers, i, 'cost', e.target.value) })
                  }
                />
                {isCatch ? (
                  <span className="ddl-cc-catch" title="Catch-all: mọi chu vi ≥ mốc cuối">
                    above
                  </span>
                ) : (
                  <button
                    className="ddl-del"
                    title="Remove tier"
                    aria-label="Remove tier"
                    onClick={() => onSetEntry({ tiers: removeTier(tiers, i) })}
                  >
                    &times;
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            className="ddl-add ddl-cc-addtier"
            onClick={() => onSetEntry({ tiers: addTier(tiers) })}
          >
            + tier
          </button>
        </div>
      )}
    </div>
  );
}

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
  // "+ New Table" modal — creates a custom Coverage-shaped pair table.
  const [newTableOpen, setNewTableOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableError, setNewTableError] = useState('');
  // Confirm modal for deleting a whole custom table. { key, label } when open.
  const [deleteTableModal, setDeleteTableModal] = useState(null);
  // Rename-title modal (all cards). { key } when open; input holds the title.
  const [renameModal, setRenameModal] = useState(null);
  const [renameInput, setRenameInput] = useState('');
  const [renameError, setRenameError] = useState('');
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
        // Cutter Cost $ is governed by the same tool_type list (rows synced
        // one-per-tool-type) MINUS any user-excluded types. Reuse the generic
        // reconcile on the filtered list so every non-excluded tool type has a
        // cost key (carry existing via exact+normalized match, blank for new),
        // and excluded types are never re-added. Values are Henry-filled later.
        const recCc = reconcileCutterCost(
          clone.tool_type,
          clone.cutter_cost || {},
          clone.cutter_cost_excluded
        );
        clone.cutter_cost = recCc.toolLife;
        healed = healed || recCc.changed;
        // Seed Magnetic Rotary with the 4-band tiered default ONLY when its
        // value is currently blank (don't clobber existing flat/tiered data).
        // Editable afterwards; still governed by tool_type sync + row delete.
        const mrKey = Object.keys(clone.cutter_cost).find(
          (k) => String(k).trim().toLowerCase() === 'magnetic rotary'
        );
        if (mrKey && (clone.cutter_cost[mrKey] === '' || clone.cutter_cost[mrKey] == null)) {
          clone.cutter_cost[mrKey] = {
            tiers: DEFAULT_MAGNETIC_ROTARY.tiers.map((t) => ({ ...t })),
          };
          healed = true;
        }
      }
      // Seed the Plate Base Cost $ section if absent so the card renders +
      // the Print-Design "Plate cost $" formula has a lookup source. Editable
      // + savable afterwards; the plate cost is display-only (no calc feed).
      if (!clone.plate_base_cost || typeof clone.plate_base_cost !== 'object') {
        clone.plate_base_cost = { ...DEFAULT_PLATE_BASE };
        healed = true;
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
      // Cascade a tool_type rename onto tool_life AND cutter_cost so the
      // value follows the name (both stay keyed exactly by tool_type).
      // Other array sections are unaffected.
      if (key === 'tool_type') {
        next.tool_life = renameToolLifeKey(prev.tool_life, oldVal, value);
        next.cutter_cost = renameToolLifeKey(prev.cutter_cost, oldVal, value);
        // Keep an excluded (deleted-from-Cutter-Cost) entry attached to the
        // renamed tool type so it stays hidden under the new name.
        next.cutter_cost_excluded = renameExcludedType(prev.cutter_cost_excluded, oldVal, value);
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
      // Cascade a tool_type delete: drop its tool_life AND cutter_cost key.
      if (key === 'tool_type') {
        const rk = String(removed ?? '').trim();
        next.tool_life = deleteObjectKey(prev.tool_life, rk);
        next.cutter_cost = deleteObjectKey(prev.cutter_cost, rk);
        // Housekeeping: a deleted tool type can't be excluded anymore.
        next.cutter_cost_excluded = dropExcludedType(prev.cutter_cost_excluded, rk);
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

  // Replace the whole rows array for a pair table (coverage or custom).
  const setRowsFor = useCallback((key, rows) => {
    setSections((prev) => ({ ...prev, [key]: rows }));
    setDirty(true);
  }, []);

  const openNewTable = useCallback(() => {
    setNewTableName('');
    setNewTableError('');
    setNewTableOpen(true);
  }, []);

  const confirmNewTable = useCallback(() => {
    const res = createCustomTable(sections, newTableName, { reservedLabels: RESERVED_LABELS });
    if (!res.ok) {
      setNewTableError(
        res.error === 'duplicate' ? 'A table with that name already exists.' : 'Enter a table name.'
      );
      return;
    }
    setSections(res.sections);
    setDirty(true);
    setNewTableOpen(false);
  }, [sections, newTableName]);

  const confirmDeleteTable = useCallback(() => {
    if (!deleteTableModal) return;
    const res = deleteCustomTable(sections, deleteTableModal.key);
    if (res.ok) {
      setSections(res.sections);
      setDirty(true);
    }
    setDeleteTableModal(null);
  }, [sections, deleteTableModal]);

  // Rename a card title (built-in or custom). The section KEY never changes —
  // only the display-name override in _custom_names[key].
  const openRename = useCallback((key, currentLabel) => {
    setRenameModal({ key });
    setRenameInput(currentLabel || '');
    setRenameError('');
  }, []);

  const confirmRename = useCallback(() => {
    if (!renameModal) return;
    if (!renameInput.trim()) {
      setRenameError('Enter a table name.');
      return;
    }
    setSections((prev) => ({
      ...prev,
      _custom_names: applyTitleOverride(
        prev._custom_names,
        renameModal.key,
        renameInput,
        SECTION_LABELS[renameModal.key]
      ),
    }));
    setDirty(true);
    setRenameModal(null);
  }, [renameModal, renameInput]);

  // Cutter Cost per-row delete — record the tool type in cutter_cost_excluded
  // (so the reconcile never re-adds it) AND drop its value. Sticks across
  // reloads; a genuinely NEW tool type still appears automatically.
  const deleteCutterCostRow = useCallback((tt) => {
    setSections((prev) => ({
      ...prev,
      cutter_cost: deleteObjectKey(prev.cutter_cost, tt),
      cutter_cost_excluded: addExcludedType(prev.cutter_cost_excluded, tt),
    }));
    setDirty(true);
  }, []);

  // Restore all hidden Cutter Cost rows (clear the exclusion set). Re-seeding
  // of blank cost keys happens on the next load reconcile.
  const restoreCutterCost = useCallback(() => {
    setSections((prev) => ({ ...prev, cutter_cost_excluded: [] }));
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

  // Determine section order: built-in sections first, then custom tables.
  const customKeys = Array.isArray(sections._custom_sections) ? sections._custom_sections : [];
  const sectionKeys = orderSectionKeys(
    Object.keys(sections).filter((k) => !SKIP_KEYS.has(k)),
    customKeys
  );

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
          <button className="ddl-btn" onClick={openNewTable}>
            + New Table
          </button>
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
            // Prefer the display-name override (rename) over the built-in
            // default; the section KEY is unchanged (code/calc key off it).
            const label = sections._custom_names?.[key] || SECTION_LABELS[key] || key;
            const value = sections[key];

            // Coverage — array of {pt, cov}. Renders via the shared pair
            // renderer; keeps its EXACT shape (money-path). Not deletable as
            // a table (built-in).
            if (key === 'coverage' && Array.isArray(value)) {
              return (
                <PairTableCard
                  key={key}
                  label={label}
                  rows={value}
                  config={pairTableConfig('coverage')}
                  onRowsChange={(rows) => setRowsFor(key, rows)}
                  onRename={() => openRename(key, label)}
                />
              );
            }

            // Custom tables — array of {k, v}. Same pair renderer + a
            // card-head "Delete table" affordance (custom only). The delete
            // affordance only shows while there are UNSAVED changes (dirty) —
            // once saved, a custom table is committed and the button hides,
            // keeping the title bar clean. Editing any field brings it back
            // (you're inherently editing when you want to delete one).
            if (isCustomSection(sections, key) && Array.isArray(value)) {
              return (
                <PairTableCard
                  key={key}
                  label={label}
                  rows={value}
                  config={pairTableConfig(key)}
                  onRowsChange={(rows) => setRowsFor(key, rows)}
                  onRename={() => openRename(key, label)}
                  onDeleteTable={dirty ? () => setDeleteTableModal({ key, label }) : undefined}
                />
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
                  <DdlCardHead label={label} onRename={() => openRename(key, label)} />
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

            // Cutter Cost $ — GOVERNED by the tool_type list exactly like
            // Tool Life (one read-only-label row per tool type; no own add /
            // rename / delete). Values default '' — Henry fills them later;
            // nothing consumes cutter_cost yet (a future getCutterCost helper
            // would mirror getToolLife). cutter_cost stays keyed exactly by
            // tool_type via the same reconcile + rename/delete cascades.
            if (key === 'cutter_cost' && typeof value === 'object' && !Array.isArray(value)) {
              const allTypes = Array.isArray(sections.tool_type)
                ? sections.tool_type
                : Object.keys(value);
              const excluded = new Set(
                Array.isArray(sections.cutter_cost_excluded) ? sections.cutter_cost_excluded : []
              );
              const toolTypes = allTypes.filter((tt) => !excluded.has(tt));
              const hiddenCount = excluded.size;
              return (
                <div key={key} className="ddl-card">
                  <DdlCardHead label={label} onRename={() => openRename(key, label)} />
                  <div className="ddl-card-body">
                    {toolTypes.length === 0 && (
                      <div className="ddl-tl-empty">Add tool types in the Tool Type card.</div>
                    )}
                    {toolTypes.map((tt, i) => (
                      <CutterCostRow
                        key={`${tt}-${i}`}
                        label={tt}
                        entry={value[tt]}
                        onSetEntry={(next) => updateObjectEntry('cutter_cost', tt, next)}
                        onDeleteRow={() => deleteCutterCostRow(tt)}
                      />
                    ))}
                    {hiddenCount > 0 && (
                      <button className="ddl-restore" onClick={restoreCutterCost}>
                        ↺ Sync from Tool Life ({hiddenCount} hidden)
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            // Object sections (click_charges)
            if (OBJECT_KEYS.has(key) && typeof value === 'object' && !Array.isArray(value)) {
              return (
                <div key={key} className="ddl-card">
                  <DdlCardHead label={label} onRename={() => openRename(key, label)} />
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
                  <DdlCardHead label={label} onRename={() => openRename(key, label)} />
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

      {/* "+ New Table" — create a custom Coverage-shaped pair table. */}
      <Modal
        open={newTableOpen}
        onClose={() => setNewTableOpen(false)}
        size="sm"
        ariaLabelledBy="ddl-newtable-title"
      >
        <Modal.Header id="ddl-newtable-title" title="New custom table" />
        <Modal.Body>
          <div className="ddl-add-field">
            <label className="ddl-add-label" htmlFor="ddl-newtable-name">
              Table name
            </label>
            <input
              id="ddl-newtable-name"
              type="text"
              className="ddl-add-input"
              data-modal-autofocus
              placeholder="e.g. Freight Rates"
              value={newTableName}
              onChange={(e) => {
                setNewTableName(e.target.value);
                if (newTableError) setNewTableError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmNewTable();
              }}
            />
          </div>
          <div className="ddl-newtable-hint">
            Creates a 2-column table (Name / Value). It is stored + editable but not read by
            pricing/calc — a free-form reference list.
          </div>
          {newTableError && <div className="ddl-add-err">{newTableError}</div>}
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="op-btn op-btn-ghost"
            onClick={() => setNewTableOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="op-btn op-btn-primary"
            onClick={confirmNewTable}
            disabled={!newTableName.trim()}
          >
            Create
          </button>
        </Modal.Footer>
      </Modal>

      {/* Delete-whole-table confirm — custom tables only. */}
      <Modal
        open={!!deleteTableModal}
        onClose={() => setDeleteTableModal(null)}
        size="sm"
        severity="danger"
        ariaLabelledBy="ddl-deltable-title"
      >
        <Modal.Header id="ddl-deltable-title" title="Delete table" />
        <Modal.Body>
          <p className="ddl-deltable-msg">
            Delete the custom table <b>{deleteTableModal?.label}</b> and all its rows? This cannot
            be undone (until you reload without saving).
          </p>
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="op-btn op-btn-ghost"
            onClick={() => setDeleteTableModal(null)}
          >
            Cancel
          </button>
          <button type="button" className="op-btn op-btn-danger" onClick={confirmDeleteTable}>
            Delete table
          </button>
        </Modal.Footer>
      </Modal>

      {/* Rename table title — writes _custom_names[key]; the section KEY
          never changes. Works for built-in + custom cards. */}
      <Modal
        open={!!renameModal}
        onClose={() => setRenameModal(null)}
        size="sm"
        ariaLabelledBy="ddl-rename-title"
      >
        <Modal.Header id="ddl-rename-title" title="Rename table" />
        <Modal.Body>
          <div className="ddl-add-field">
            <label className="ddl-add-label" htmlFor="ddl-rename-input">
              Table title
            </label>
            <input
              id="ddl-rename-input"
              type="text"
              className="ddl-add-input"
              data-modal-autofocus
              value={renameInput}
              onChange={(e) => {
                setRenameInput(e.target.value);
                if (renameError) setRenameError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename();
              }}
            />
          </div>
          <div className="ddl-newtable-hint">
            Only the display title changes — the underlying data key stays the same, so pricing/calc
            references are unaffected.
          </div>
          {renameError && <div className="ddl-add-err">{renameError}</div>}
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            className="op-btn op-btn-ghost"
            onClick={() => setRenameModal(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="op-btn op-btn-primary"
            onClick={confirmRename}
            disabled={!renameInput.trim()}
          >
            Save
          </button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
