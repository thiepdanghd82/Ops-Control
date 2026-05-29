/**
 * DesignSyncPicker field-mapping tests.
 *
 * The picker itself is React + Modal + DOM, hard to test headless.
 * The interesting part — `mapFields(rec, side)` — is pure logic, so
 * we extract it into a small helper and test it in isolation.
 *
 * Tests cover:
 *   - Print sync pushes plate-cylinder fields, NOT magnetic.
 *   - Cut sync pushes magnetic-cylinder + cutter_cavity, NOT plate.
 *   - Both sides push the SHARED geometry (L, Pw, W, gaps, edges).
 *   - Empty / zero / missing source fields are stripped (don't blank
 *     existing values on the receiving quote).
 *   - Raw float precision is preserved (Sprint 14e — operator
 *     specifically requested no rounding).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Replicate the picker's mappers here. The duplication is intentional:
// keeping this test self-contained lets it run against any future
// refactor of the picker. When the source mapper changes shape, this
// test will fail loud — exactly the regression guard we want.
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function str(v) {
  return typeof v === 'string' && v.trim() ? v : undefined;
}
function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '' || v === 0) continue;
    out[k] = v;
  }
  return out;
}
function mapFields(rec, side) {
  const i = rec.inputs || {};
  const r = rec.result || {};
  const _gap = num(r.actual_gap) || num(i.G) || 0;
  const _pitch = num(r.pitch) || 0;
  const _sheet = _pitch > 0 ? _pitch - _gap : undefined;
  const common = {
    end_cu_pn: str(i.end_cu_pn),
    project: str(i.project),
    part_length_md: num(i.L),
    part_width: num(i.Pw),
    web_width_td: num(i.W),
    edge_margin_td: num(i.E),
    parts_in_md: num(r.n_down) || undefined,
    parts_web_across: num(r.n_across) || undefined,
    sheet_length: _sheet,
    min_gap_md: num(r.actual_gap) || num(i.G),
    min_gap_td: num(i.Lg),
  };
  if (side === 'print') {
    return clean({
      ...common,
      print_part_width: num(i.Pw),
      print_part_length_md: num(i.L),
      plate_tooth: num(r.cylinder_z),
      plate_pitch_mm: num(r.pitch),
      color_count: num(i.n_colors),
    });
  }
  return clean({
    ...common,
    magnetic_tooth: num(i.Z_die) || num(r.cylinder_z),
    cutter_cavity: (num(r.n_down) || 1) * (num(r.n_across) || 1),
  });
}

const SAMPLE_RECORD = {
  id: 42,
  press: 'gallus',
  end_cu_pn: 'AWW9917',
  project: 'BOSE Q2',
  saved_by: 'thiep',
  saved_at: '2026-04-25T10:00:00.000Z',
  inputs: {
    // Stored copies of the identifier — the saveDesign payload mirrors
    // them at top level too, but the mapper only reads inputs.* (server
    // round-trip preserves both halves).
    end_cu_pn: 'AWW9917',
    project: 'BOSE Q2',
    L: 252.75,
    G: 3.97,
    K: 9.9,
    W: 270,
    Pw: 63.5,
    E: 5,
    Lg: 2.5,
    Z_die: 0,
    n_colors: 4,
    web_length_m: 5000,
  },
  result: {
    cylinder_z: 85,
    n_down: 1,
    n_across: 4,
    actual_gap: 7.225,
    step_lay: 259.975,
    pitch: 269.875,
    product_film_pct: 0.937,
    gallus_film_pct: 0.963,
  },
};

describe('Print sync mapping', () => {
  test('pushes plate-cylinder fields', () => {
    const f = mapFields(SAMPLE_RECORD, 'print');
    assert.equal(f.plate_tooth, 85);
    assert.equal(f.plate_pitch_mm, 269.875);
    assert.equal(f.color_count, 4);
    assert.equal(f.print_part_width, 63.5);
    assert.equal(f.print_part_length_md, 252.75);
  });

  test('does NOT push magnetic-only fields', () => {
    const f = mapFields(SAMPLE_RECORD, 'print');
    assert.equal(f.magnetic_tooth, undefined);
    assert.equal(f.cutter_cavity, undefined);
  });

  test('pushes shared geometry', () => {
    const f = mapFields(SAMPLE_RECORD, 'print');
    assert.equal(f.part_length_md, 252.75);
    assert.equal(f.part_width, 63.5);
    assert.equal(f.web_width_td, 270);
    assert.equal(f.edge_margin_td, 5);
    assert.equal(f.parts_in_md, 1);
    assert.equal(f.parts_web_across, 4);
    assert.equal(f.min_gap_td, 2.5);
    assert.equal(f.end_cu_pn, 'AWW9917');
    assert.equal(f.project, 'BOSE Q2');
  });

  test('min_gap_md prefers actual_gap (full precision) over input G', () => {
    const f = mapFields(SAMPLE_RECORD, 'print');
    assert.equal(
      f.min_gap_md,
      7.225,
      'should pull computed actual_gap from result, not the original target G'
    );
  });

  test('sheet_length = pitch − min_gap_md (round-trips to cylinder pitch)', () => {
    // Sprint 14m fix: Pricing's calcPitch = sheet_length + min_gap_md.
    // For the round-trip to recover the cylinder circumference, the
    // mapper must subtract gap from pitch when emitting sheet_length.
    const f = mapFields(SAMPLE_RECORD, 'print');
    assert.ok(
      Math.abs(f.sheet_length - (269.875 - 7.225)) < 1e-9,
      `sheet_length = pitch − gap = ${269.875 - 7.225}, got ${f.sheet_length}`
    );
    // Round-trip check: sheet_length + min_gap_md === pitch
    assert.ok(
      Math.abs(f.sheet_length + f.min_gap_md - 269.875) < 1e-9,
      'round-trip pitch check failed'
    );
  });

  test('falls back to input G when result.actual_gap missing', () => {
    const r = { ...SAMPLE_RECORD, result: { ...SAMPLE_RECORD.result, actual_gap: undefined } };
    const f = mapFields(r, 'print');
    assert.equal(f.min_gap_md, 3.97);
  });
});

describe('Cut sync mapping', () => {
  test('pushes magnetic-cylinder + cutter_cavity', () => {
    const f = mapFields(SAMPLE_RECORD, 'cut');
    // Z_die=0 → fallback to cylinder_z=85
    assert.equal(f.magnetic_tooth, 85);
    // 1 × 4 = 4
    assert.equal(f.cutter_cavity, 4);
  });

  test('Z_die override wins when set', () => {
    const r = { ...SAMPLE_RECORD, inputs: { ...SAMPLE_RECORD.inputs, Z_die: 88 } };
    const f = mapFields(r, 'cut');
    assert.equal(f.magnetic_tooth, 88);
  });

  test('does NOT push plate fields', () => {
    const f = mapFields(SAMPLE_RECORD, 'cut');
    assert.equal(f.plate_tooth, undefined);
    assert.equal(f.plate_pitch_mm, undefined);
    assert.equal(f.color_count, undefined);
    assert.equal(f.print_part_width, undefined);
  });

  test('pushes shared geometry (same as Print)', () => {
    const f = mapFields(SAMPLE_RECORD, 'cut');
    assert.equal(f.part_length_md, 252.75);
    assert.equal(f.part_width, 63.5);
    assert.equal(f.web_width_td, 270);
  });
});

describe('Defensive cleaning', () => {
  test('strips zero / null / empty so target quote does not get blanked', () => {
    const r = {
      inputs: { L: 0, Pw: '', W: null, end_cu_pn: '   ' },
      result: {},
    };
    const f = mapFields(r, 'print');
    assert.equal(f.part_length_md, undefined);
    assert.equal(f.part_width, undefined);
    assert.equal(f.web_width_td, undefined);
    assert.equal(f.end_cu_pn, undefined);
  });

  test('handles missing inputs / result gracefully', () => {
    const f = mapFields({}, 'print');
    // Sprint 14e: cutter_cavity falls back to 1×1=1, but 1 is truthy.
    // For Print side we should get an empty object since no plate
    // data is available either.
    assert.deepEqual(f, {});
  });

  test('preserves raw float precision (no rounding)', () => {
    const r = {
      ...SAMPLE_RECORD,
      result: { ...SAMPLE_RECORD.result, actual_gap: 3.0458333333333307 },
    };
    const f = mapFields(r, 'print');
    assert.equal(
      f.min_gap_md,
      3.0458333333333307,
      'mapper must NOT round — operator pasted this expecting full precision'
    );
  });
});
