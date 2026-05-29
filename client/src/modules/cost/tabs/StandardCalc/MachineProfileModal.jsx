/**
 * MachineProfileModal — CRUD surface for the Press Library.
 *
 * Reusable by StandardCalc + ComplexCalc: opens as a modal over the
 * Layout card. Inside: a table of all profiles + an inline edit form
 * that toggles between "Add new" and "Edit <id>" modes.
 *
 * Profile fields managed here match the server schema:
 *   id, name, press_type (rotary|flat), tooth_count_max,
 *   tooth_pitch_mm, web_width_min_mm, web_width_max_mm, max_pitch_mm,
 *   speed_max_m_min, num_stations, common_dies[], notes
 *
 * After any mutation, calls `onChanged(profiles)` so the parent can
 * refresh its dropdown without a second fetch.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { sharedApi } from '../../../../services/api';
import { showToast } from '../../../../utils/toast';
import Modal from '../../../../components/Shared/Modal';

const EMPTY = {
  id: '',
  name: '',
  press_type: 'rotary',
  tooth_count_max: 0,
  tooth_pitch_mm: 3.175,
  web_width_min_mm: 0,
  web_width_max_mm: 0,
  max_pitch_mm: 0,
  speed_max_m_min: 0,
  num_print_stations: 0,
  num_diecut_stations: 0,
  // v3 schema: plate + magnetic cylinders as arrays of { tooth, qty }.
  // Each is edited through the row-based CylinderList below (add /
  // increment / delete per row), not free-form text.
  plate_dies: [],
  magnetic_dies: [],
  notes: '',
};

function formatDieList(list) {
  if (!Array.isArray(list)) return '';
  return list
    .map((d) => {
      if (typeof d === 'number') return String(d);
      return d.qty > 1 ? `${d.tooth}x${d.qty}` : String(d.tooth);
    })
    .join(', ');
}

function normalizeDieList(list) {
  // Coerce whatever came from the server (plain numbers, {tooth,qty},
  // or partials) into the canonical [{tooth, qty}] sorted asc by tooth.
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    let tooth, qty;
    if (typeof item === 'number') {
      tooth = item;
      qty = 1;
    } else if (item && typeof item === 'object') {
      tooth = Number(item.tooth) || 0;
      qty = Number(item.qty) || 1;
    } else continue;
    if (!tooth || tooth <= 0) continue;
    if (seen.has(tooth)) continue;
    seen.add(tooth);
    out.push({ tooth, qty: Math.max(1, qty) });
  }
  return out.sort((a, b) => a.tooth - b.tooth);
}

function toForm(p) {
  return {
    ...EMPTY,
    ...p,
    plate_dies: normalizeDieList(p?.plate_dies || []),
    magnetic_dies: normalizeDieList(p?.magnetic_dies || []),
  };
}

function toPayload(form) {
  return {
    id: String(form.id || '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase(),
    name: String(form.name || '').trim(),
    press_type: form.press_type === 'flat' ? 'flat' : 'rotary',
    tooth_count_max: Number(form.tooth_count_max) || 0,
    tooth_pitch_mm: Number(form.tooth_pitch_mm) || 3.175,
    web_width_min_mm: Number(form.web_width_min_mm) || 0,
    web_width_max_mm: Number(form.web_width_max_mm) || 0,
    max_pitch_mm: Number(form.max_pitch_mm) || 0,
    speed_max_m_min: Number(form.speed_max_m_min) || 0,
    num_print_stations: Number(form.num_print_stations) || 0,
    num_diecut_stations: Number(form.num_diecut_stations) || 0,
    plate_dies: normalizeDieList(form.plate_dies),
    magnetic_dies: normalizeDieList(form.magnetic_dies),
    notes: String(form.notes || ''),
  };
}

/**
 * CylinderList — row-based editor for a die inventory.
 *
 * - Each existing cylinder is a row with tooth + qty + delete.
 * - Bottom has "+ Add" with tooth/qty inputs.
 * - Adding a tooth that already exists: INCREMENTS qty (so "bought 2
 *   more 90T cylinders" → just add 90T qty=2, result is old+2).
 * - Rows re-sort by tooth ascending after every mutation.
 *
 * Accepts:
 *   items     — current array [{tooth, qty}]
 *   onChange  — called with the next array
 *   disabled  — hide the Add form (e.g. for flat-press profiles)
 */
function CylinderList({ label, helpText, items, onChange, disabled }) {
  const [newTooth, setNewTooth] = useState('');
  const [newQty, setNewQty] = useState('1');

  function addCylinder() {
    const tooth = Number(String(newTooth).trim());
    const qty = Math.max(1, Number(String(newQty).trim()) || 1);
    if (!tooth || tooth <= 0) return;
    const existing = items.find((d) => d.tooth === tooth);
    let next;
    if (existing) {
      // Increment existing row's qty — "bought 2 more 90T" semantics.
      next = items.map((d) => (d.tooth === tooth ? { ...d, qty: d.qty + qty } : d));
    } else {
      next = [...items, { tooth, qty }];
    }
    next.sort((a, b) => a.tooth - b.tooth);
    onChange(next);
    setNewTooth('');
    setNewQty('1');
  }

  function removeCylinder(tooth) {
    onChange(items.filter((d) => d.tooth !== tooth));
  }

  function setQty(tooth, qty) {
    const q = Math.max(1, Number(qty) || 1);
    onChange(items.map((d) => (d.tooth === tooth ? { ...d, qty: q } : d)));
  }

  const totalCyl = items.reduce((s, d) => s + (d.qty || 1), 0);

  return (
    <div className="mp-wide mp-cyl-list">
      <div className="mp-cyl-head">
        <span>{label}</span>
        <span className="mp-cyl-count">
          {items.length} sizes · {totalCyl} cyl.
        </span>
      </div>
      {helpText && <div className="mp-cyl-help">{helpText}</div>}
      {items.length > 0 && (
        <table className="mp-cyl-table">
          <thead>
            <tr>
              <th>Tooth (T)</th>
              <th>Qty</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.tooth}>
                <td className="mp-mono">{d.tooth}T</td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={d.qty}
                    onChange={(e) => setQty(d.tooth, e.target.value)}
                    disabled={disabled}
                    className="mp-cyl-qty"
                  />
                </td>
                <td>
                  <button
                    onClick={() => removeCylinder(d.tooth)}
                    className="mp-del"
                    disabled={disabled}
                    title="Remove"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!disabled && (
        <div className="mp-cyl-add">
          <input
            type="number"
            min={1}
            value={newTooth}
            placeholder="Tooth"
            onChange={(e) => setNewTooth(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addCylinder();
            }}
            className="mp-cyl-tooth"
          />
          <span className="mp-cyl-x">×</span>
          <input
            type="number"
            min={1}
            value={newQty}
            placeholder="Qty"
            onChange={(e) => setNewQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addCylinder();
            }}
            className="mp-cyl-qty"
          />
          <button onClick={addCylinder} className="mp-btn mp-btn-primary mp-cyl-add-btn">
            + Add
          </button>
        </div>
      )}
    </div>
  );
}

export default function MachineProfileModal({ onClose, onChanged }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editForm, setEditForm] = useState(null); // null = table view; {id, ...} = editing
  const [saving, setSaving] = useState(false);
  const isEditingExisting = editForm && profiles.some((p) => p.id === editForm.id);

  // When the edit form is open, ESC drops back to the list view instead
  // of closing the whole modal. The shared Modal primitive's own ESC
  // handling covers the outer close case.
  const handleModalClose = useCallback(() => {
    if (editForm) setEditForm(null);
    else onClose();
  }, [editForm, onClose]);

  // Hold `onChanged` in a ref so that reload() can invoke the latest
  // callback without having onChanged in its useCallback dep array —
  // parents usually pass an inline lambda (`(arr) => setProfiles(arr)`)
  // which creates a NEW reference every render. If we depended on
  // onChanged, the useCallback would be re-created → the useEffect
  // below would re-fire → reload → parent setProfiles → re-render →
  // new inline lambda → infinite loop (= tab "blinks").
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await sharedApi.getMachineProfiles();
      const arr = Array.isArray(list) ? list : [];
      setProfiles(arr);
      onChangedRef.current?.(arr);
    } catch (e) {
      showToast('Failed to load: ' + (e.message || 'Unknown'), 'err');
    } finally {
      setLoading(false);
    }
  }, []);

  // Mount-only load. Callers invoke reload() explicitly after mutations.

  useEffect(() => {
    reload();
  }, []);

  const handleSave = useCallback(async () => {
    if (!editForm) return;
    const payload = toPayload(editForm);
    if (!payload.id) {
      showToast('ID is required', 'err');
      return;
    }
    if (!payload.name) {
      showToast('Name is required', 'err');
      return;
    }
    setSaving(true);
    try {
      if (isEditingExisting) {
        await sharedApi.updateMachineProfile(payload.id, payload);
        showToast(`Updated "${payload.name}"`);
      } else {
        await sharedApi.createMachineProfile(payload);
        showToast(`Added "${payload.name}"`);
      }
      setEditForm(null);
      await reload();
    } catch (e) {
      if (String(e.message).includes('duplicate_id')) {
        showToast('ID already exists — pick a different ID', 'err');
      } else {
        showToast('Save failed: ' + (e.message || 'Unknown'), 'err');
      }
    } finally {
      setSaving(false);
    }
  }, [editForm, isEditingExisting, reload]);

  const handleDelete = useCallback(
    async (id, name) => {
      if (!confirm(`Delete profile "${name}"?\nQuotes referencing it will fall back to defaults.`))
        return;
      try {
        await sharedApi.deleteMachineProfile(id);
        await reload();
      } catch (e) {
        showToast('Delete failed: ' + (e.message || 'Unknown'), 'err');
      }
    },
    [reload]
  );

  const handleDuplicate = useCallback((p) => {
    setEditForm(toForm({ ...p, id: p.id + '-copy', name: p.name + ' (copy)' }));
  }, []);

  function field(key) {
    return (
      <input
        type="text"
        value={editForm[key] ?? ''}
        onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    );
  }
  function numField(key) {
    return (
      <input
        type="number"
        value={editForm[key] ?? 0}
        onChange={(e) => setEditForm((f) => ({ ...f, [key]: Number(e.target.value) || 0 }))}
      />
    );
  }

  const headerSubtitle = editForm
    ? isEditingExisting
      ? `Editing profile · ${editForm.id}`
      : 'Adding a new press profile'
    : `${profiles.length} profile${profiles.length === 1 ? '' : 's'} · configure rotary + flat presses`;

  return (
    <Modal open onClose={handleModalClose} size="xl" severity="info" ariaLabelledBy="mp-title">
      <Modal.Header id="mp-title" title="Press Library" subtitle={headerSubtitle} severity="info" />
      <Modal.Body className="flush">
        {!editForm && (
          <div className="mp-list-wrap">
            {loading ? (
              <div className="mp-empty">Loading…</div>
            ) : profiles.length === 0 ? (
              <div className="mp-empty">No profiles yet.</div>
            ) : (
              <table className="mp-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Tooth Max</th>
                    <th>Web Range</th>
                    <th>Stations P/C</th>
                    <th>Plate Dies</th>
                    <th>Magnetic Dies</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={p.id}>
                      <td className="mp-mono">{p.id}</td>
                      <td>
                        <b>{p.name}</b>
                      </td>
                      <td>
                        <span className={'mp-type mp-type-' + p.press_type}>{p.press_type}</span>
                      </td>
                      <td>{p.press_type === 'flat' ? '—' : `${p.tooth_count_max}T`}</td>
                      <td>
                        {p.web_width_min_mm}–{p.web_width_max_mm}mm
                      </td>
                      <td>
                        {p.num_print_stations ? `${p.num_print_stations}P` : ''}
                        {p.num_diecut_stations
                          ? `${p.num_print_stations ? '/' : ''}${p.num_diecut_stations}C`
                          : ''}
                        {!p.num_print_stations && !p.num_diecut_stations && '—'}
                      </td>
                      <td className="mp-dies" title={formatDieList(p.plate_dies)}>
                        {p.plate_dies?.length
                          ? `${p.plate_dies.length} sizes (${p.plate_dies.reduce((s, d) => s + (d.qty || 1), 0)} cyl.)`
                          : '—'}
                      </td>
                      <td className="mp-dies" title={formatDieList(p.magnetic_dies)}>
                        {p.magnetic_dies?.length
                          ? `${p.magnetic_dies.length} sizes (${p.magnetic_dies.reduce((s, d) => s + (d.qty || 1), 0)} cyl.)`
                          : '—'}
                      </td>
                      <td className="mp-actions">
                        <button onClick={() => setEditForm(toForm(p))} title="Edit">
                          ✎
                        </button>
                        <button onClick={() => handleDuplicate(p)} title="Duplicate">
                          ⧉
                        </button>
                        <button
                          onClick={() => handleDelete(p.id, p.name)}
                          title="Delete"
                          className="mp-del"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mp-add-bar">
              <button className="mp-btn mp-btn-primary" onClick={() => setEditForm(toForm({}))}>
                + Add Press
              </button>
            </div>
          </div>
        )}

        {editForm && (
          <div className="mp-form">
            <div className="mp-grid">
              <label>
                <span>ID (slug)</span>
                {isEditingExisting ? (
                  <input type="text" value={editForm.id} disabled />
                ) : (
                  field('id')
                )}
              </label>
              <label>
                <span>Name</span>
                {field('name')}
              </label>
              <label>
                <span>Press Type</span>
                <select
                  value={editForm.press_type}
                  onChange={(e) => setEditForm((f) => ({ ...f, press_type: e.target.value }))}
                >
                  <option value="rotary">Rotary</option>
                  <option value="flat">Flat (digital / offset)</option>
                </select>
              </label>
              {editForm.press_type === 'rotary' ? (
                <>
                  <label>
                    <span>Tooth Count Max (T)</span>
                    {numField('tooth_count_max')}
                  </label>
                  <label>
                    <span>Tooth Pitch (mm)</span>
                    {numField('tooth_pitch_mm')}
                  </label>
                </>
              ) : (
                <>
                  <label>
                    <span>Max Pitch (mm)</span>
                    {numField('max_pitch_mm')}
                  </label>
                  <div />
                </>
              )}
              <label>
                <span>Web Width Min (mm)</span>
                {numField('web_width_min_mm')}
              </label>
              <label>
                <span>Web Width Max (mm)</span>
                {numField('web_width_max_mm')}
              </label>
              <label>
                <span>Speed Max (m/min)</span>
                {numField('speed_max_m_min')}
              </label>
              <label>
                <span># Print Stations</span>
                {numField('num_print_stations')}
              </label>
              <label>
                <span># Die-cut Stations</span>
                {numField('num_diecut_stations')}
              </label>
            </div>
            {editForm.press_type === 'rotary' && (
              <>
                <CylinderList
                  label="Plate Mounting Cylinders (for printing plate)"
                  helpText="Enter tooth + qty, press Add (or Enter). Adding an existing tooth increments its qty. Delete individual rows with ×."
                  items={editForm.plate_dies}
                  onChange={(next) => setEditForm((f) => ({ ...f, plate_dies: next }))}
                />
                <CylinderList
                  label="Magnetic Die-Cut Cylinders (for die-cut)"
                  helpText="Separate inventory from plate cylinders. Same tooth count on BOTH lists = ✓ full reuse."
                  items={editForm.magnetic_dies}
                  onChange={(next) => setEditForm((f) => ({ ...f, magnetic_dies: next }))}
                />
              </>
            )}
            <label className="mp-wide">
              <span>Notes</span>
              <textarea
                rows={2}
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
            <div className="mp-form-actions">
              <button className="mp-btn" onClick={() => setEditForm(null)} disabled={saving}>
                Cancel
              </button>
              <button className="mp-btn mp-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : isEditingExisting ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
}
