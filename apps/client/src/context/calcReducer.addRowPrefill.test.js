// @ts-check
/**
 * Reducer regression — ADD_MATERIAL_ROW / ADD_INK_ROW prefill-from-above.
 *
 * The "+ Add Material Row" / "+ Add Ink Row" buttons now seed the new row
 * from the row above instead of a blank template, so operators don't
 * re-key shared fields.
 *
 *   - ADD_MATERIAL_ROW copies the LAST active-set row verbatim with a
 *     fresh _mid. Empty set → blank template (row_type Main.Mat).
 *   - ADD_MATERIAL_ROW is alt-materials aware (copies the last ALT row
 *     when active='alt').
 *   - ADD_INK_ROW copies the last ink EXCEPT setup_kg (always 0.2, the
 *     editable default operators asked for), a sequential label, and a
 *     fresh _mid. Empty list → blank template but still setup_kg 0.2.
 *   - 20-row / 10-row caps unchanged.
 *   - Standard only — Complex (SubProductRow) untouched by these actions.
 *
 * Runner: node --test src/context/calcReducer.addRowPrefill.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CALC_ACTIONS as A, calcReducer, createInitialState } from './calcReducer.js';

const std = (s) => s.stdState;

// Fill the last active material row with distinctive values so a copy
// is provable field-by-field.
function seedFirstMaterial(s) {
  const patch = {
    code: 'M-COPY',
    ifs_code: 'IFS-9',
    desc: 'Copied Desc',
    drw_material: 'DRW-9',
    usage: 3,
    setup_lm: 55,
    cavities: 4,
    width: 98,
    pitch_ovr: 25,
    offcut_yn: 'Y',
    slitting_yn: 'Y',
    df_yn: 'N',
    offcut_pct: 5,
    s_price: 1.23,
    g_price: 4.56,
    row_type: 'Main.Mat',
  };
  let out = s;
  for (const [field, value] of Object.entries(patch)) {
    out = calcReducer(out, { type: A.SET_MATERIAL_FIELD, payload: { idx: 0, field, value } });
  }
  return out;
}

test('ADD_MATERIAL_ROW: populated set copies the last row verbatim except _mid', () => {
  let s = createInitialState();
  s = seedFirstMaterial(s);
  // Trim down to exactly one material so "last" is the row we seeded.
  while (std(s).materials.length > 1) {
    s = calcReducer(s, { type: A.REMOVE_MATERIAL_ROW, payload: { idx: 1 } });
  }
  const before = std(s).materials;
  const prev = before[before.length - 1];

  const after = calcReducer(s, { type: A.ADD_MATERIAL_ROW, payload: {} });
  const mats = std(after).materials;
  assert.equal(mats.length, before.length + 1, 'count grows by 1');

  const added = mats[mats.length - 1];
  assert.ok(added._mid, 'new row has a _mid');
  assert.notEqual(added._mid, prev._mid, 'fresh _mid, not copied');

  // Every field except _mid deep-equals the prior last row.
  const { _mid: _a, ...addedRest } = added;
  const { _mid: _b, ...prevRest } = prev;
  assert.deepEqual(addedRest, prevRest, 'all non-_mid fields copied verbatim');
  assert.equal(added.code, 'M-COPY');
  assert.equal(added.setup_lm, 55);
  assert.equal(added.row_type, 'Main.Mat');
});

test('ADD_MATERIAL_ROW: empty set falls back to blank template (row_type Main.Mat)', () => {
  let s = createInitialState();
  // Remove every seeded material.
  while (std(s).materials.length > 0) {
    s = calcReducer(s, { type: A.REMOVE_MATERIAL_ROW, payload: { idx: 0 } });
  }
  assert.equal(std(s).materials.length, 0, 'active set emptied');

  const after = calcReducer(s, { type: A.ADD_MATERIAL_ROW, payload: {} });
  const mats = std(after).materials;
  assert.equal(mats.length, 1);
  const row = mats[0];
  assert.equal(row.row_type, 'Main.Mat');
  assert.equal(row.code, '', 'blank template');
  assert.equal(row.setup_lm, 0, 'blank template setup_lm 0');
  assert.ok(row._mid, 'has _mid');
});

test('ADD_MATERIAL_ROW: alt-materials aware — copies the last ALT row + mirrors', () => {
  let s = createInitialState();
  s = calcReducer(s, { type: A.SET_MATERIALS_ACTIVE, payload: { value: 'alt' } });
  // Alt starts empty → first add is the blank template.
  s = calcReducer(s, { type: A.ADD_MATERIAL_ROW, payload: {} });
  s = calcReducer(s, {
    type: A.SET_MATERIAL_FIELD,
    payload: { idx: 0, field: 'code', value: 'ALT-1' },
  });
  const mainLenBefore = std(s).materials_main.length;

  const after = calcReducer(s, { type: A.ADD_MATERIAL_ROW, payload: {} });
  assert.equal(std(after).materials_main.length, mainLenBefore, 'main untouched');
  const alt = std(after).materials_alt;
  assert.equal(alt.length, 2, 'alt grew by 1');
  assert.equal(alt[1].code, 'ALT-1', 'copied the last alt row');
  assert.notEqual(alt[1]._mid, alt[0]._mid, 'fresh _mid');
  assert.equal(std(after).materials.length, alt.length, 'mirror tracks alt');
  assert.equal(std(after).materials[1].code, 'ALT-1', 'mirror carries copied value');
});

test('ADD_MATERIAL_ROW: 20-row cap holds (no growth beyond 20)', () => {
  let s = createInitialState();
  while (std(s).materials.length < 20) {
    s = calcReducer(s, { type: A.ADD_MATERIAL_ROW, payload: {} });
  }
  assert.equal(std(s).materials.length, 20);
  const after = calcReducer(s, { type: A.ADD_MATERIAL_ROW, payload: {} });
  assert.equal(std(after).materials.length, 20, 'capped at 20');
});

// ── Inks ──────────────────────────────────────────────────────────────

function seedFirstInk(s) {
  const patch = {
    ifs_code: 'INK-9',
    color: 'Cyan',
    print_type: 'SS',
    mesh_spec: '120',
    pitch_mm: 25,
    base_mat: 'BM-9',
    width: 98,
    coverage: 30,
    area_pct: 40,
    clicks: 2,
    s_price: 7.7,
    g_price: 8.8,
    setup_kg: 9.9,
  };
  let out = s;
  for (const [field, value] of Object.entries(patch)) {
    out = calcReducer(out, { type: A.SET_INK_FIELD, payload: { idx: 0, field, value } });
  }
  return out;
}

test('ADD_INK_ROW: populated list copies prior fields but setup_kg 0.2 + label + fresh _mid', () => {
  let s = createInitialState();
  // Ensure exactly one ink to seed.
  while (std(s).inks.length > 1) {
    s = calcReducer(s, { type: A.REMOVE_INK_ROW, payload: { idx: 1 } });
  }
  if (std(s).inks.length === 0) {
    s = calcReducer(s, { type: A.ADD_INK_ROW, payload: {} });
  }
  s = seedFirstInk(s);
  const prev = std(s).inks[std(s).inks.length - 1];
  const lenBefore = std(s).inks.length;

  const after = calcReducer(s, { type: A.ADD_INK_ROW, payload: {} });
  const inks = std(after).inks;
  assert.equal(inks.length, lenBefore + 1, 'grows by 1');
  const added = inks[inks.length - 1];

  assert.equal(added.setup_kg, 0.2, 'setup_kg forced to editable default 0.2');
  assert.equal(added.label, `Ink ${lenBefore + 1}`, 'sequential label');
  assert.ok(added._mid, 'has _mid');
  assert.notEqual(added._mid, prev._mid, 'fresh _mid');

  // Everything else copied verbatim.
  assert.equal(added.ifs_code, 'INK-9');
  assert.equal(added.color, 'Cyan');
  assert.equal(added.print_type, 'SS');
  assert.equal(added.coverage, 30);
  assert.equal(added.area_pct, 40);
  assert.equal(added.s_price, 7.7);
  assert.equal(added.g_price, 8.8);
  assert.notEqual(added.setup_kg, prev.setup_kg, 'prior setup_kg (9.9) NOT copied');
});

test('ADD_INK_ROW: empty list falls back to blank template with setup_kg 0.2', () => {
  let s = createInitialState();
  while (std(s).inks.length > 0) {
    s = calcReducer(s, { type: A.REMOVE_INK_ROW, payload: { idx: 0 } });
  }
  assert.equal(std(s).inks.length, 0);

  const after = calcReducer(s, { type: A.ADD_INK_ROW, payload: {} });
  const inks = std(after).inks;
  assert.equal(inks.length, 1);
  assert.equal(inks[0].setup_kg, 0.2, 'blank template still seeds 0.2');
  assert.equal(inks[0].label, 'Ink 1');
  assert.equal(inks[0].print_type, '', 'blank template');
  assert.ok(inks[0]._mid);
});

test('ADD_INK_ROW: 10-row cap holds', () => {
  let s = createInitialState();
  while (std(s).inks.length < 10) {
    s = calcReducer(s, { type: A.ADD_INK_ROW, payload: {} });
  }
  assert.equal(std(s).inks.length, 10);
  const after = calcReducer(s, { type: A.ADD_INK_ROW, payload: {} });
  assert.equal(std(after).inks.length, 10, 'capped at 10');
});
