/**
 * DesignSyncPicker — modal that pulls a saved Design Tools record
 * back into the active StandardCalc / ComplexCalc quote. Sprint 14e.
 *
 * Two entry points (same component, different `side` prop):
 *   side="print" → opens "Print Design sync" — pushes the Print-side
 *                  field subset (L, Pw, W, plate_tooth, n_down,
 *                  n_across, gap MD/TD, edges, color_count …)
 *   side="cut"   → opens "Cut Design sync"  — pushes the Cut-side
 *                  field subset (magnetic_tooth, cutter_cavity, plus
 *                  the geometry common to both sides so the die
 *                  matches the print step).
 *
 * UX:
 *   - Top: bilingual title + close.
 *   - Toolbar:
 *       · search input (End CU PN / project / designer note)
 *       · press-type checkboxes (Gallus, Letter Press, Brotech,
 *         HP Indigo, Silkscreen) — multi-select; default ALL ticked.
 *   - Body: result table sorted newest-first.
 *   - Click row → confirmation toast + apply + close.
 *
 * Algorithm:
 *   1. Fetch all designs from /api/shared/design-tools (no press
 *      filter at server — the client filter handles it so users can
 *      mix presses and reuse a Brotech design draft on a Gallus quote
 *      without round-tripping the server).
 *   2. Apply text + checkbox filters in-memory.
 *   3. On Apply, walk the field map for the chosen side and call
 *      `setField(key, value)` once per mapped field.
 */
import { useEffect, useMemo, useState } from 'react';
import Modal from '../../../../components/Shared/Modal';
import { sharedApi } from '../../../../services/api';
import { showToast } from '../../../../utils/toast';

// Press registry — mirrors the Design Tools sub-tab list. `impl: false`
// flags presses whose calculator isn't built yet — their checkboxes
// render disabled with a "soon" hint, since there will never be saved
// records for them. When a new press calculator ships, flip its `impl`
// here AND add the data files in DesignTools/presses/.
const PRESSES = [
  { id: 'gallus',       label: 'Gallus',       impl: true  },
  { id: 'letter_press', label: 'Letter Press', impl: false },
  { id: 'brotech',      label: 'Brotech',      impl: false },
  { id: 'hp_indigo',    label: 'HP Indigo',    impl: false },
  { id: 'silkscreen',   label: 'Silkscreen',   impl: false },
];

// ── Field mappers ──────────────────────────────────────────────────
//
// These translate a saved Design Tools record into the {key: value}
// payload that gets dispatched into stdState. A field map is the
// single source of truth for "what does Print sync push?" — keeps
// the rest of the UI free of business knowledge about the StandardCalc
// schema.
//
// Note: both maps include the SHARED geometry (L, Pw, W, gaps) because
// either sync needs them set correctly for downstream calcs to be
// coherent. The only difference is which CYLINDER fields each pushes:
//   Print → plate_tooth, plate_pitch_mm
//   Cut   → magnetic_tooth, cutter_cavity
//
// Empty / zero values are skipped so a sync doesn't blank an already-
// filled field with a missing one.
function mapFields(rec, side) {
  const i = rec.inputs || {};
  const r = rec.result || {};
  // Sheet Length MD reconstruction (Sprint 14m fix):
  //   Pricing's calcPitch = sheet_length + min_gap_md.
  //   Design Tools result has the FULL cylinder pitch + the per-
  //   product actual_gap. To make calcPitch round-trip back to the
  //   original cylinder circumference, set:
  //     sheet_length = pitch − min_gap_md
  //   This way the Std/Cpx layout reproduces the same per-revolution
  //   MD geometry the operator picked in Design Tools.
  const _gap   = num(r.actual_gap) || num(i.G) || 0;
  const _pitch = num(r.pitch) || 0;
  const _sheet = _pitch > 0 ? _pitch - _gap : undefined;
  const common = {
    end_cu_pn:           str(i.end_cu_pn),
    project:             str(i.project),
    part_length_md:      num(i.L),
    part_width:          num(i.Pw),
    web_width_td:        num(i.W),
    edge_margin_td:      num(i.E),
    parts_in_md:         num(r.n_down) || undefined,
    parts_web_across:    num(r.n_across) || undefined,
    // Sheet Length MD: cylinder circumference minus the per-product
    // gap, so calcPitch on the receiving side recovers the same
    // pitch Design Tools chose.
    sheet_length:        _sheet,
    min_gap_md:          num(r.actual_gap) || num(i.G),
    min_gap_td:          num(i.Lg),
  };
  if (side === 'print') {
    return clean({
      ...common,
      print_part_width:      num(i.Pw),
      print_part_length_md:  num(i.L),
      plate_tooth:           num(r.cylinder_z),
      plate_pitch_mm:        num(r.pitch),
      color_count:           num(i.n_colors),
    });
  }
  // side === 'cut'
  return clean({
    ...common,
    magnetic_tooth:  num(i.Z_die) || num(r.cylinder_z),
    cutter_cavity:   (num(r.n_down) || 1) * (num(r.n_across) || 1),
  });
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
function str(v) { return typeof v === 'string' && v.trim() ? v : undefined; }
function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '' || v === 0) continue;
    out[k] = v;
  }
  return out;
}

export default function DesignSyncPicker({ open, side, onClose, onApply }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  // Default: all presses ticked. The filter is OR-of-selected;
  // unticking ALL = no records (UI shows "no match").
  // Default: only IMPLEMENTED presses ticked — disabled ones can never
  // have saved records so adding them does nothing useful.
  const [pressFilter, setPressFilter] = useState(
    () => new Set(PRESSES.filter(p => p.impl).map(p => p.id))
  );

  useEffect(() => {
    if (!open) return;
    // Standard "open dialog → flip loading flag → fetch" pattern. The
    // setState pair is the loading-spinner contract, not a cascade —
    // the only re-render before fetch lands is the one that shows the
    // spinner.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErr('');
    sharedApi.listDesigns()
      .then(rows => setList(Array.isArray(rows) ? rows : []))
      .catch(e => setErr(e.message || 'Failed to load history'))
      .finally(() => setLoading(false));
  }, [open]);

  const togglePress = (id) => {
    setPressFilter(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  // "All" only counts IMPLEMENTED presses — disabled ones are never
  // toggled so they don't pollute the all-on / all-off state.
  const implIds = PRESSES.filter(p => p.impl).map(p => p.id);
  const allOn = implIds.every(id => pressFilter.has(id));
  const toggleAll = () => {
    setPressFilter(allOn ? new Set() : new Set(implIds));
  };

  const filtered = useMemo(() => {
    let rows = list.filter(r => pressFilter.has((r.press || '').toLowerCase()));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r =>
        (r.end_cu_pn || '').toLowerCase().includes(q) ||
        (r.project || '').toLowerCase().includes(q) ||
        (r.designer_note || '').toLowerCase().includes(q) ||
        (r.saved_by || '').toLowerCase().includes(q),
      );
    }
    rows.sort((a, b) => String(b.saved_at || '').localeCompare(String(a.saved_at || '')));
    return rows;
  }, [list, pressFilter, search]);

  const apply = (rec) => {
    const fields = mapFields(rec, side);
    const count = Object.keys(fields).length;
    if (count === 0) {
      showToast('Nothing to apply — saved record has no usable fields', 'err');
      return;
    }
    onApply(fields, rec);
    showToast(`Applied · Đã apply ${count} fields from ${rec.end_cu_pn || '#'+rec.id}`);
    onClose();
  };

  const titleEN = side === 'print' ? 'Print Design sync' : 'Cut Design sync';
  const titleVI = side === 'print' ? 'Đồng bộ thiết kế in' : 'Đồng bộ thiết kế cắt';
  const fieldsHint = side === 'print'
    ? 'Pushes: L, Pw, W, plate tooth, gaps, edges, color count'
    : 'Pushes: L, Pw, W, magnetic tooth, cutter cavity, gaps';

  return (
    <Modal open={open} onClose={onClose} size="xl" severity="info" ariaLabelledBy="dsp-title">
      <Modal.Header
        id="dsp-title"
        title={titleEN}
        subtitle={`${titleVI} · ${fieldsHint}`}
        severity="info"
      />
      <Modal.Body className="flush">
        <div className="dsp-toolbar">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search End CU PN / project / note · Tìm theo mã / dự án / ghi chú"
            className="dsp-search"
            autoFocus
          />
          <div className="dsp-presses" role="group" aria-label="Filter by press">
            <button type="button" className="dsp-press-all" onClick={toggleAll}>
              {allOn ? 'Clear all' : 'Select all'}
            </button>
            {PRESSES.map(p => (
              <label
                key={p.id}
                className={`dsp-press ${pressFilter.has(p.id) ? 'on' : ''} ${p.impl ? '' : 'dsp-press-soon'}`}
                title={p.impl ? p.label : `${p.label} — calculator not built yet · Chưa có máy tính cho press này`}
              >
                <input
                  type="checkbox"
                  checked={pressFilter.has(p.id)}
                  onChange={() => togglePress(p.id)}
                  disabled={!p.impl}
                />
                <span>{p.label}{p.impl ? '' : ' (soon)'}</span>
              </label>
            ))}
          </div>
        </div>

        {loading && <div className="dsp-empty">Loading… · Đang tải</div>}
        {err && <div className="dsp-empty dsp-err">{err}</div>}
        {!loading && !err && filtered.length === 0 && (
          <div className="dsp-empty">
            No matches · Không có kết quả.
            {list.length === 0
              ? ' Save designs from Design Tools first.'
              : ' Try a different search or untick fewer presses.'}
          </div>
        )}
        {!loading && !err && filtered.length > 0 && (
          <table className="dsp-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Press</th>
                <th>End CU PN</th>
                <th>Project</th>
                <th>Saved by</th>
                <th>L × Pw</th>
                <th>Cylinder</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td className="dsp-num">{(r.saved_at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td>{r.press || '—'}</td>
                  <td><b>{r.end_cu_pn || '—'}</b></td>
                  <td>{r.project || '—'}</td>
                  <td>{r.saved_by || '—'}</td>
                  <td className="dsp-num">{r.inputs ? `${r.inputs.L} × ${r.inputs.Pw}` : '—'}</td>
                  <td className="dsp-num">{r.result?.cylinder_z ? `${r.result.cylinder_z}T` : '—'}</td>
                  <td>{r.designer_note || ''}</td>
                  <td>
                    <button type="button" className="dsp-apply-btn" onClick={() => apply(r)}>
                      Apply
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="op-btn op-btn-ghost" onClick={onClose}>Close</button>
      </Modal.Footer>
    </Modal>
  );
}
