/**
 * MachineTechnicalTab — equipment capability database (Sprint S-MTECH).
 *
 * Lives under LIBRARIES > Machine Technical in the sidebar. Two sub-tabs:
 *   🖨 Printing Machine  — screen, flexo, HP, offset, digital presses
 *   ✂ Cutting Machine    — flatbed, rotary, RDC, power-press, CNC
 *
 * Surfaces:
 *   - Table of all machines (one row per machine, one column per key attribute)
 *   - Click a row → detail drawer with FULL attribute list (editable if admin)
 *   - + Add Machine (admin only)
 *   - 📥 Export to Excel — downloads a transposed xlsx matching the
 *     original CCL Hanoi Equipment Capability template shape
 *   - 📤 Import from Excel / CSV — upserts by id (or brand-model slug),
 *     supports the transposed template shape or flat rows-are-machines
 *
 * Write ops are admin-gated at the server; client also hides edit UI
 * for non-admins. Audit events: MT_CREATE / MT_UPDATE / MT_DELETE / MT_IMPORT.
 */
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { sharedApi } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import { showToast } from '../../../utils/toast';
import SkeletonTable from '../../../components/Shared/SkeletonTable';
import EmptyState from '../../../components/Shared/EmptyState';
import Modal from '../../../components/Shared/Modal';
import useEscapeToClose from '../../../hooks/useEscapeToClose';
import './MachineTechnicalTab.css';

// Human-friendly labels for the raw field keys. Missing entries show
// the key as-is with underscores replaced by spaces.
const FIELD_LABELS = {
  brand: 'Brand',
  model: 'Model',
  starting_date: 'Starting date',
  availability: 'Availability',
  working_voltage: 'Working voltage',
  equipment_power: 'Equipment power',
  printing_type: 'Printing type',
  cutting_type: 'Cutting type',
  cutting_mode: 'Cutting mode',
  equipment_structure: 'Equipment structure',
  num_print_stations: '# Print stations',
  num_die_stations: '# Die stations',
  die_cut_mode: 'Die cut mode',
  p2p_tolerance: 'P2P tolerance',
  p2c_tolerance: 'P2C tolerance',
  max_design_run_speed: 'Max design run speed',
  feasible_max_run_speed: 'Feasible max run speed',
  max_run_speed: 'Max run speed',
  total_web_path_m: 'Total web path (m)',
  max_web_width_mm: 'Max web width (mm)',
  max_usable_web_width_mm: 'Max usable web width (mm)',
  max_sheet_size_td_mm: 'Max sheet size TD (mm)',
  max_sheet_size_md_mm: 'Max sheet size MD (mm)',
  min_repeat_length_mm: 'Min repeat length (mm)',
  max_repeat_length_vp_mm: 'Max repeat length VP (mm)',
  max_repeat_length_mm: 'Max repeat length (mm)',
  max_material_roll_diameter_mm: 'Max roll diameter (mm)',
  magnetic_tooth_max: 'Magnetic tooth max',
  max_cutting_force_tonnes: 'Max cutting force (t)',
  material_thickness_min_mm: 'Material thickness min (mm)',
  material_thickness_max_mm: 'Material thickness max (mm)',
  registration_tolerance_mm: 'Registration tolerance (mm)',
  working_area_td_mm: 'Working area TD (mm)',
  working_area_md_mm: 'Working area MD (mm)',
  axis_count: 'Axis count',
  max_travel_speed_mm_min: 'Max travel speed (mm/min)',
  spindle_rpm_max: 'Spindle RPM max',
  tool_changer_count: 'Tool changer slots',
  supported_file_formats: 'Supported file formats',
  accuracy_mm: 'Accuracy (mm)',
  typical_use: 'Typical use',
  curing_system_ink_types: 'Curing system / ink types',
  has_turn_bar: 'Turn bar',
  has_rotary_screen: 'Rotary screen',
  has_adhesive_deadener: 'Adhesive deadener',
  has_rotary_cold_foil: 'Rotary cold foil',
  has_corona_treatment: 'Corona treatment',
  has_web_cleaner: 'Web cleaner',
  has_curing_screen_unit: 'Curing screen unit',
  has_stripping: 'Stripping',
  has_foil_capability: 'Foil capability',
  has_emboss_capability: 'Emboss capability',
  has_perf_capability: 'Perf capability',
  notes: 'Notes',
  id: 'ID',
};

function labelFor(key) {
  return FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function isBoolField(key) {
  return key.startsWith('has_');
}
function isNumberField(key) {
  return (
    key.endsWith('_mm') ||
    key.endsWith('_m') ||
    key.endsWith('_count') ||
    key.endsWith('_max') ||
    key.endsWith('_min') ||
    key.endsWith('_tonnes') ||
    key.endsWith('_rpm_max') ||
    key.endsWith('_mm_min')
  );
}

// ── Main component ────────────────────────────────────────────

export default function MachineTechnicalTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'sys';
  const [kind, setKind] = useState('printing');
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  // Tracks whether the initial load has completed (success OR error).
  // Gates the skeleton render — stale-while-revalidate keeps the
  // existing table visible on subsequent refreshes instead of flashing
  // through the skeleton state. Lesson 29.
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const [editing, setEditing] = useState(null); // null | record (new or existing)
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [metaResp, listResp] = await Promise.all([
        sharedApi.getMachineTechnicalMeta(),
        sharedApi.getMachineTechnical(kind),
      ]);
      setMeta(metaResp || {});
      setItems(Array.isArray(listResp?.items) ? listResp.items : []);
    } catch (e) {
      showToast('Failed to load machines: ' + (e.message || 'Unknown'), 'err');
    } finally {
      setLoading(false);
      setFirstLoadDone(true);
    }
  }, [kind]);

  useEffect(() => {
    reload();
  }, [reload]);

  const fields = useMemo(
    () => (meta[`_${kind}_fields`] || []).filter((f) => f !== 'notes' && f !== 'id'),
    [meta, kind]
  );
  const cuttingTypes = meta._cutting_types || [];

  // Columns shown in the summary table (1 row per machine). Keep it
  // small — 5-6 cols max so the table is scannable at a glance.
  const tableCols = useMemo(() => {
    if (kind === 'printing') {
      return [
        'brand',
        'model',
        'printing_type',
        'num_print_stations',
        'max_usable_web_width_mm',
        'max_repeat_length_mm',
        'feasible_max_run_speed',
        'availability',
      ];
    }
    return [
      'brand',
      'model',
      'cutting_type',
      'cutting_mode',
      'num_die_stations',
      'max_web_width_mm',
      'max_run_speed',
      'availability',
    ];
  }, [kind]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((m) =>
      [m.brand, m.model, m.availability, m.printing_type, m.cutting_type, m.notes].some((v) =>
        (v || '').toString().toLowerCase().includes(q)
      )
    );
  }, [items, search]);

  const handleDelete = useCallback(
    async (id) => {
      if (!confirm(`Delete machine "${id}"?`)) return;
      try {
        await sharedApi.deleteMachineTechnical(kind, id);
        showToast('Machine deleted');
        reload();
      } catch (e) {
        showToast('Delete failed: ' + (e.message || 'Unknown'), 'err');
      }
    },
    [kind, reload]
  );

  const handleExport = useCallback(() => {
    window.open(sharedApi.machineTechnicalExportUrl(kind), '_blank');
  }, [kind]);

  const handleImport = useCallback(
    async (file) => {
      if (!file) return;
      setImporting(true);
      try {
        const result = await sharedApi.importMachineTechnical(kind, file);
        showToast(`Import OK — created ${result.created}, updated ${result.updated}`);
        reload();
      } catch (e) {
        showToast('Import failed: ' + (e.message || 'Unknown'), 'err');
      } finally {
        setImporting(false);
      }
    },
    [kind, reload]
  );

  if (loading && !firstLoadDone)
    return (
      <div style={{ padding: 24 }}>
        <SkeletonTable rows={8} cols={7} />
      </div>
    );

  return (
    <div className="mt-tab">
      {/* Card header */}
      <div className="mt-header">
        <div className="mt-header-title">
          <span className="mt-header-icon">⚒</span>
          <div>
            <h3>Machine Technical Library</h3>
            <p>
              Equipment capability database — {items.length} {kind} machine(s) on record
            </p>
          </div>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div className="mt-sub-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={kind === 'printing'}
          className={`mt-sub-tab ${kind === 'printing' ? 'active' : ''}`}
          onClick={() => setKind('printing')}
        >
          🖨 Printing Machine
        </button>
        <button
          role="tab"
          aria-selected={kind === 'cutting'}
          className={`mt-sub-tab ${kind === 'cutting' ? 'active' : ''}`}
          onClick={() => setKind('cutting')}
        >
          ✂ Cutting Machine
        </button>
      </div>

      {/* Toolbar */}
      <div className="mt-toolbar">
        <input
          type="search"
          className="mt-search"
          placeholder="Search brand, model, availability..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="mt-btn" onClick={handleExport}>
          📥 Export Excel
        </button>
        {isAdmin && (
          <>
            <button
              className="mt-btn"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? 'Importing…' : '📤 Import Excel / CSV'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleImport(e.target.files[0]);
                e.target.value = '';
              }}
            />
            <button
              className="mt-btn mt-btn-primary"
              onClick={() => setEditing({ id: '', _new: true })}
            >
              + Add Machine
            </button>
          </>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="🏭"
          title="No machines yet"
          hint={
            isAdmin
              ? 'Click "+ Add Machine" or import an Excel file.'
              : 'Ask an admin to add equipment records.'
          }
        />
      ) : (
        <div className="mt-table-wrap">
          <table className="mt-table">
            <thead>
              <tr>
                {tableCols.map((c) => (
                  <th key={c}>{labelFor(c)}</th>
                ))}
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} onClick={() => setEditing(m)} style={{ cursor: 'pointer' }}>
                  {tableCols.map((c) => {
                    // max_repeat_length_mm auto-reads from VP if the
                    // plain field is unset (mirror-on-read for legacy
                    // printing records from the original CCL xlsx).
                    let v = m[c];
                    if (c === 'max_repeat_length_mm' && (v == null || v === '')) {
                      v = m.max_repeat_length_vp_mm;
                    }
                    return (
                      <td key={c} className="mt-cell">
                        {renderCellValue(v)}
                      </td>
                    );
                  })}
                  <td onClick={(e) => e.stopPropagation()} className="mt-row-actions">
                    <button onClick={() => setEditing(m)} title="View / Edit">
                      ✎
                    </button>
                    {isAdmin && (
                      <button onClick={() => handleDelete(m.id)} title="Delete" className="mt-del">
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <MachineDetailDrawer
          kind={kind}
          record={editing}
          fields={fields}
          cuttingTypes={cuttingTypes}
          isAdmin={isAdmin}
          isNew={!!editing._new}
          existingIds={items.map((m) => m.id)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
          onReloadMeta={reload}
        />
      )}
    </div>
  );
}

function renderCellValue(v) {
  if (v === null || v === undefined || v === '') return <span className="mt-cell-empty">—</span>;
  if (typeof v === 'boolean')
    return v ? <span className="mt-yes">✓</span> : <span className="mt-no">✕</span>;
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

// ── Detail drawer (edit / view single machine) ─────────────────

function MachineDetailDrawer({
  kind,
  record,
  fields,
  cuttingTypes,
  isAdmin,
  isNew,
  existingIds,
  onClose,
  onSaved,
  onReloadMeta,
}) {
  const [form, setForm] = useState(() => {
    const init = { ...record };
    // Backfill mirror — legacy printing records only had
    // max_repeat_length_vp_mm. Mirror it into max_repeat_length_mm
    // on open so the new field has a sensible default. Admin can
    // still override.
    if (
      kind === 'printing' &&
      (init.max_repeat_length_mm == null || init.max_repeat_length_mm === '') &&
      init.max_repeat_length_vp_mm != null
    ) {
      init.max_repeat_length_mm = init.max_repeat_length_vp_mm;
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  useEscapeToClose(onClose);

  function set(key, val) {
    setForm((f) => {
      const next = { ...f, [key]: val };
      // Sync max_repeat_length_mm ← max_repeat_length_vp_mm. Only auto-
      // mirror when the plain field is empty OR was equal to the old VP
      // value (i.e. not yet manually overridden). If the operator has
      // typed a different value for max_repeat_length_mm, they keep it.
      if (key === 'max_repeat_length_vp_mm' && kind === 'printing') {
        const plainUntouched =
          f.max_repeat_length_mm == null ||
          f.max_repeat_length_mm === '' ||
          f.max_repeat_length_mm === f.max_repeat_length_vp_mm;
        if (plainUntouched) next.max_repeat_length_mm = val;
      }
      return next;
    });
  }

  async function handleSave() {
    const rec = { ...form };
    if (!rec.id || !rec.id.trim()) {
      // Synthesize from brand-model if missing
      rec.id =
        String(rec.brand || 'unknown')
          .toLowerCase()
          .replace(/\s+/g, '-') +
        '-' +
        String(rec.model || Date.now())
          .toLowerCase()
          .replace(/\s+/g, '-');
    }
    if (isNew && existingIds.includes(rec.id)) {
      showToast('ID already exists — pick a different brand/model.', 'err');
      return;
    }
    if (!rec.brand || !rec.model) {
      showToast('Brand and Model are required.', 'err');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await sharedApi.createMachineTechnical(kind, rec);
        showToast(`Created ${rec.brand} ${rec.model}`);
      } else {
        await sharedApi.updateMachineTechnical(kind, rec.id, rec);
        showToast(`Updated ${rec.brand} ${rec.model}`);
      }
      onSaved();
    } catch (e) {
      showToast('Save failed: ' + (e.message || 'Unknown'), 'err');
    } finally {
      setSaving(false);
    }
  }

  // Group fields into sections for cleaner form layout.
  const sections =
    kind === 'printing'
      ? [
          { title: 'Identity', keys: ['brand', 'model', 'starting_date', 'availability'] },
          {
            title: 'Power + structure',
            keys: ['working_voltage', 'equipment_power', 'printing_type', 'equipment_structure'],
          },
          {
            title: 'Stations + tolerance',
            keys: [
              'num_print_stations',
              'num_die_stations',
              'die_cut_mode',
              'p2p_tolerance',
              'p2c_tolerance',
            ],
          },
          {
            title: 'Speed + geometry',
            keys: [
              'max_design_run_speed',
              'feasible_max_run_speed',
              'total_web_path_m',
              'max_web_width_mm',
              'max_usable_web_width_mm',
              'min_repeat_length_mm',
              'max_repeat_length_vp_mm',
              'max_repeat_length_mm',
              'max_material_roll_diameter_mm',
            ],
          },
          {
            title: 'Curing + options',
            keys: [
              'curing_system_ink_types',
              'has_turn_bar',
              'has_rotary_screen',
              'has_adhesive_deadener',
              'has_rotary_cold_foil',
              'has_corona_treatment',
              'has_web_cleaner',
              'has_curing_screen_unit',
            ],
          },
        ]
      : [
          { title: 'Identity', keys: ['brand', 'model', 'starting_date', 'availability'] },
          {
            title: 'Power + structure',
            keys: [
              'working_voltage',
              'equipment_power',
              'cutting_type',
              'cutting_mode',
              'equipment_structure',
            ],
          },
          {
            title: 'Capacity (rotary)',
            keys: [
              'num_die_stations',
              'max_web_width_mm',
              'min_repeat_length_mm',
              'max_repeat_length_mm',
              'magnetic_tooth_max',
              'max_run_speed',
            ],
          },
          {
            title: 'Capacity (flatbed / power press)',
            keys: [
              'max_sheet_size_td_mm',
              'max_sheet_size_md_mm',
              'max_cutting_force_tonnes',
              'material_thickness_min_mm',
              'material_thickness_max_mm',
            ],
          },
          {
            title: 'Capacity (CNC)',
            keys: [
              'working_area_td_mm',
              'working_area_md_mm',
              'axis_count',
              'max_travel_speed_mm_min',
              'spindle_rpm_max',
              'tool_changer_count',
              'accuracy_mm',
              'supported_file_formats',
              'typical_use',
            ],
          },
          {
            title: 'Quality + options',
            keys: [
              'registration_tolerance_mm',
              'has_stripping',
              'has_foil_capability',
              'has_emboss_capability',
              'has_perf_capability',
              'has_turn_bar',
              'has_web_cleaner',
              'has_corona_treatment',
            ],
          },
        ];

  return (
    <>
      <div className="mt-drawer-scrim" onClick={onClose} />
      <aside
        className="mt-drawer"
        data-ops-draggable-card
        role="dialog"
        aria-label="Machine detail"
      >
        <header className="mt-drawer-head" data-ops-drag-handle>
          <div>
            <div className="mt-drawer-title">
              {isNew ? 'New machine' : `${form.brand || '—'} · ${form.model || '—'}`}
            </div>
            <div className="mt-drawer-sub">
              {kind === 'printing' ? '🖨 Printing' : '✂ Cutting'} · ID:{' '}
              <code>{form.id || '(auto)'}</code>
            </div>
          </div>
          <button className="mt-drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <fieldset disabled={!isAdmin} className="mt-form">
          {!isAdmin && (
            <div className="mt-ro-banner">👁 Read-only — admin can edit this record.</div>
          )}

          <label className="mt-field mt-field-wide">
            <span>ID (slug)</span>
            <input
              type="text"
              value={form.id || ''}
              disabled={!isNew}
              onChange={(e) => set('id', e.target.value)}
            />
          </label>

          {sections.map((sec) => (
            <div key={sec.title} className="mt-section">
              <h4>{sec.title}</h4>
              <div className="mt-grid">
                {sec.keys
                  .filter((k) => fields.includes(k))
                  .map((k) => (
                    <FieldInput
                      key={k}
                      k={k}
                      value={form[k]}
                      onChange={(v) => set(k, v)}
                      cuttingTypes={cuttingTypes}
                      isAdmin={isAdmin}
                      onReloadMeta={onReloadMeta}
                    />
                  ))}
              </div>
            </div>
          ))}

          <label className="mt-field mt-field-wide">
            <span>Notes</span>
            <textarea
              rows={3}
              value={form.notes || ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </label>
        </fieldset>

        <footer className="mt-drawer-foot">
          <button className="mt-btn" onClick={onClose}>
            {isAdmin ? 'Cancel' : 'Close'}
          </button>
          {isAdmin && (
            <button className="mt-btn mt-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create' : 'Update'}
            </button>
          )}
        </footer>
      </aside>
    </>
  );
}

function FieldInput({ k, value, onChange, cuttingTypes, onReloadMeta, isAdmin }) {
  if (k === 'cutting_type') {
    // Editable enum — same shape as <select> but with a ⚙ Manage
    // button that opens a modal for admin to add / rename / delete
    // the list of cutting types.
    return (
      <EditableEnumSelect
        label={labelFor(k)}
        value={value || ''}
        onChange={onChange}
        options={cuttingTypes || []}
        enumKey="_cutting_types"
        placeholder="(none)"
        isAdmin={isAdmin}
        onReloadMeta={onReloadMeta}
      />
    );
  }
  if (k === 'availability') {
    return (
      <label className="mt-field">
        <span>{labelFor(k)}</span>
        <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">(none)</option>
          <option value="Available">Available</option>
          <option value="Under repair">Under repair</option>
          <option value="Decommissioned">Decommissioned</option>
          <option value="In transit">In transit</option>
        </select>
      </label>
    );
  }
  if (isBoolField(k)) {
    return (
      <label className="mt-field">
        <span>{labelFor(k)}</span>
        <select
          value={value === true ? 'yes' : value === false ? 'no' : ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === 'yes' ? true : v === 'no' ? false : null);
          }}
        >
          <option value="">—</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
    );
  }
  if (isNumberField(k)) {
    return (
      <label className="mt-field">
        <span>{labelFor(k)}</span>
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      </label>
    );
  }
  if (k === 'supported_file_formats') {
    return (
      <label className="mt-field mt-field-wide">
        <span>{labelFor(k)} (comma-separated)</span>
        <input
          type="text"
          value={Array.isArray(value) ? value.join(', ') : value || ''}
          onChange={(e) => onChange(e.target.value.split(/,\s*/).filter(Boolean))}
        />
      </label>
    );
  }
  return (
    <label className="mt-field">
      <span>{labelFor(k)}</span>
      <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// ─── EditableEnumSelect ────────────────────────────────────────────
//
// A dropdown that looks like a plain <select> but pairs with a small
// ⚙ button that opens a "Manage list" modal. Admin-only write —
// non-admins see the button disabled with a tooltip.
//
// Props:
//   label        — field label
//   value        — current selection
//   onChange     — called with new value
//   options      — current enum array (read from server meta)
//   enumKey      — server-side key (e.g. '_cutting_types')
//   placeholder  — text for the empty option ('(none)')
//   isAdmin      — gate the manage button
//   onReloadMeta — called after a successful enum update so the parent
//                  can refresh options + propagate to any siblings

function EditableEnumSelect({
  label,
  value,
  onChange,
  options,
  enumKey,
  placeholder,
  isAdmin,
  onReloadMeta,
}) {
  const [manageOpen, setManageOpen] = useState(false);
  return (
    <label className="mt-field mt-field-enum">
      <span>{label}</span>
      <div className="mt-enum-row">
        <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{placeholder || '(none)'}</option>
          {(options || []).map((ct) => (
            <option key={ct} value={ct}>
              {ct}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="mt-enum-manage"
          onClick={() => setManageOpen(true)}
          disabled={!isAdmin}
          title={
            isAdmin
              ? 'Manage list — add / rename / delete values'
              : 'Admin only — contact an administrator to change this list'
          }
        >
          ⚙
        </button>
      </div>
      {manageOpen && (
        <ManageEnumModal
          label={label}
          options={options || []}
          enumKey={enumKey}
          onClose={() => setManageOpen(false)}
          onSaved={(newOptions) => {
            setManageOpen(false);
            onReloadMeta?.();
            // If the currently-selected value was renamed/removed, clear
            // the selection so the user picks again.
            if (value && !newOptions.includes(value)) onChange('');
          }}
        />
      )}
    </label>
  );
}

function ManageEnumModal({ label, options, enumKey, onClose, onSaved }) {
  const [list, setList] = useState(() => [...options]);
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);

  function addItem() {
    const v = newItem.trim();
    if (!v) return;
    if (list.some((x) => x.toLowerCase() === v.toLowerCase())) {
      showToast(`"${v}" already exists`, 'err');
      return;
    }
    setList([...list, v]);
    setNewItem('');
  }

  function renameItem(idx, next) {
    setList(list.map((x, i) => (i === idx ? next : x)));
  }

  function removeItem(idx) {
    if (
      !confirm(
        `Remove "${list[idx]}" from the list?\n\nMachines already set to this value will keep it but the option will no longer appear in new selections.`
      )
    )
      return;
    setList(list.filter((_, i) => i !== idx));
  }

  function moveItem(idx, delta) {
    const next = [...list];
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= next.length) return;
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    setList(next);
  }

  async function handleSave() {
    const trimmed = list.map((x) => x.trim()).filter(Boolean);
    if (trimmed.length === 0) {
      if (!confirm('List is empty. Save anyway?')) return;
    }
    setSaving(true);
    try {
      const result = await sharedApi.updateMachineTechnicalEnum(enumKey, trimmed);
      showToast(`Saved — ${result.values.length} values`);
      onSaved(result.values);
    } catch (e) {
      showToast('Save failed: ' + (e.message || 'Unknown'), 'err');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="sm" severity="info" ariaLabelledBy="mt-enum-title">
      <Modal.Header
        id="mt-enum-title"
        title={`Manage — ${label}`}
        subtitle="Edit, reorder or add dropdown options"
        severity="info"
      />
      <Modal.Body>
        <div className="mt-enum-body">
          <div className="mt-enum-help">
            Add / rename / reorder the options available in the <b>{label}</b> dropdown. Changes
            take effect immediately for all users after you click <b>Save</b>.
          </div>
          {list.length === 0 && <div className="mt-enum-empty">No values yet — add one below.</div>}
          <ul className="mt-enum-list">
            {list.map((item, idx) => (
              <li key={idx} className="mt-enum-row-item">
                <input
                  type="text"
                  value={item}
                  onChange={(e) => renameItem(idx, e.target.value)}
                  className="mt-enum-input"
                />
                <button
                  onClick={() => moveItem(idx, -1)}
                  disabled={idx === 0}
                  title="Move up"
                  className="mt-enum-move"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveItem(idx, +1)}
                  disabled={idx === list.length - 1}
                  title="Move down"
                  className="mt-enum-move"
                >
                  ▼
                </button>
                <button onClick={() => removeItem(idx)} title="Remove" className="mt-enum-remove">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-enum-add">
            <input
              type="text"
              placeholder="+ Add new value…"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addItem();
                }
              }}
              className="mt-enum-input"
            />
            <button onClick={addItem} className="mt-btn mt-btn-primary">
              + Add
            </button>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button className="op-btn op-btn-ghost" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="op-btn op-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
