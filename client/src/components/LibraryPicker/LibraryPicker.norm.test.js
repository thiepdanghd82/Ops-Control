// @ts-check
/**
 * LibraryPicker normalizers — pure row-shape contract.
 *
 * Guards the shared picker row shape { code, ifs_code, desc, g_price,
 * supplier, extra, date }. The `date` field (new) surfaces the library's
 * date so the picker table can show a DATE column ahead of CODE:
 *   - NPI       → row.date  ("Update Date")
 *   - Sourcing  → row.month (Req.Date)
 *   - IFS       → '' (no date → renders as —)
 *
 * Backward-compat: existing consumers reading code/desc/g_price/supplier
 * are unaffected — those fields keep their prior values.
 *
 * Runner: node --test src/components/LibraryPicker/LibraryPicker.norm.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normNPI,
  normSourcing,
  normIfsMaterial,
  PICKER_COLUMNS,
  clampColWidth,
  colWidthPercents,
  visibleColumns,
  NARROW_PX,
  VERY_NARROW_PX,
} from './LibraryPicker.norm.js';

test('normNPI: surfaces date from row.date + keeps core fields', () => {
  const r = normNPI({
    name: 'PET SB50',
    type: 'Gloss PET',
    thick: '0.05',
    color: 'Silver',
    price: 3.35,
    supplier: 'LINTEC',
    note: 'from 26/5',
    date: '2026-05-26',
  });
  assert.equal(r.date, '2026-05-26');
  assert.equal(r.code, 'PET SB50');
  assert.equal(r.g_price, 3.35);
  assert.equal(r.supplier, 'LINTEC');
  assert.equal(r.desc, 'Gloss PET · 0.05 · Silver');
  assert.equal(r.extra, 'from 26/5');
});

test('normNPI: missing date → empty string (not undefined)', () => {
  const r = normNPI({ name: 'X', price: 1 });
  assert.equal(r.date, '');
});

test('normSourcing: surfaces date from row.month', () => {
  const r = normSourcing({
    material: 'TPE5015',
    size: '1200mm',
    dap: 0.2175,
    supplier: 'TAILUN',
    status: 'active',
    month: '2026-04',
  });
  assert.equal(r.date, '2026-04');
  assert.equal(r.code, 'TPE5015');
  assert.equal(r.g_price, 0.2175);
});

test('normSourcing: missing month → empty string', () => {
  const r = normSourcing({ material: 'Y', exw: 2 });
  assert.equal(r.date, '');
  assert.equal(r.g_price, 2, 'exw fallback intact');
});

test('normIfsMaterial: date is always empty (IFS has no date)', () => {
  const r = normIfsMaterial({ part_no: 'PN-1', desc: 'Part', price: 9, supplier: 'S' });
  assert.equal(r.date, '');
  assert.equal(r.code, 'PN-1');
  assert.equal(r.ifs_code, 'PN-1', 'Part No is the IFS code');
  assert.equal(r.g_price, 9);
});

test('every norm exposes the shared pick-shape (what onPick writes)', () => {
  // Libraries carry different display columns, so the key sets are NOT
  // identical any more — but the pick-shape below is what reaches the
  // quote and must exist on all three, with the same types.
  const PICK_SHAPE = ['code', 'date', 'desc', 'extra', 'g_price', 'ifs_code', 'supplier'];
  for (const [name, row] of [
    ['normNPI', normNPI({ name: 'a' })],
    ['normSourcing', normSourcing({ material: 'a' })],
    ['normIfsMaterial', normIfsMaterial({ part_no: 'a' })],
  ]) {
    for (const k of PICK_SHAPE) {
      assert.ok(k in row, `${name} lost pick-shape key ${k}`);
      assert.equal(typeof row[k], k === 'g_price' ? 'number' : 'string', `${name}.${k} type`);
    }
  }
});

// ── Full column sets (2026-09-14) ─────────────────────────────────────
// The picker showed 5 columns while the NPI library carries 12, so an
// operator picking a material could not see thickness, surface, adhesive,
// MOQ or lead time — the very fields they choose between.

test('every library declares columns, and every column key is on its rows', () => {
  const sample = {
    npi: normNPI({
      date: '2024-09-27',
      name: 'CAP391',
      type: 'Silicon Protective Film',
      thick: 0.05,
      color: 'Blue',
      surface: 'Gloss',
      adhesive: 'nil',
      moq: 1000,
      lt: 30,
      price: 0.8624,
      supplier: 'caprock việt nam',
      note: 'Have liner, 40-60gf/in',
    }),
    sourcing: normSourcing({
      month: '2024-10',
      material: 'PET',
      size: '50µm',
      exw: 1,
      dap: 2,
      moq: 500,
      lt: 21,
      supplier: 'ACME',
      status: 'Quoted',
      req: 'NPI',
      cust: 'Foxconn',
    }),
    ifs: normIfsMaterial({ part_no: 'T900', desc: 'Liner', price: 3, supplier: 'X', uom: 'M2' }),
  };
  for (const [libKey, cols] of Object.entries(PICKER_COLUMNS)) {
    assert.ok(Array.isArray(cols) && cols.length > 0, `${libKey} has no columns`);
    for (const c of cols) {
      assert.ok(c.key, `${libKey}: column without key`);
      assert.ok(c.labelKey, `${libKey}.${c.key}: column without labelKey`);
      assert.ok(Number.isFinite(c.w) && c.w > 0, `${libKey}.${c.key}: bad default width`);
      assert.ok(c.key in sample[libKey], `${libKey}.${c.key} is not produced by the normalizer`);
    }
  }
});

test('NPI exposes the fields an operator picks between', () => {
  const cols = PICKER_COLUMNS.npi.map((c) => c.key);
  for (const k of ['thick', 'color', 'surface', 'adhesive', 'moq', 'lt', 'note']) {
    assert.ok(cols.includes(k), `NPI picker is missing the ${k} column`);
  }
});

test('normNPI keeps the pick-shape untouched while adding display fields', () => {
  // What onPick writes into the quote must not move.
  const r = normNPI({
    date: '2024-09-27',
    name: 'CAP391',
    type: 'Silicon Protective Film',
    thick: 0.05,
    color: 'Blue',
    price: 0.8624,
    supplier: 'caprock',
    note: 'Have liner',
  });
  assert.equal(r.code, 'CAP391');
  assert.equal(r.desc, 'Silicon Protective Film · 0.05 · Blue');
  assert.equal(r.g_price, 0.8624);
  assert.equal(r.supplier, 'caprock');
  // …and the new display-only fields ride alongside.
  assert.equal(r.thick, 0.05);
  assert.equal(r.color, 'Blue');
  assert.equal(r.note, 'Have liner');
  assert.equal(r.price, 0.8624);
});

test('missing display fields render as empty, never undefined', () => {
  const r = normNPI({ name: 'X' });
  for (const k of ['type', 'thick', 'color', 'surface', 'adhesive', 'moq', 'lt', 'note']) {
    assert.equal(r[k], '', `${k} should be '' when absent`);
  }
});

test('clampColWidth keeps a dragged column usable', () => {
  assert.equal(clampColWidth(200), 200);
  assert.equal(clampColWidth(10), 60, 'floor stops a column being dragged to nothing');
  assert.equal(clampColWidth(5000), 600, 'ceiling stops one column eating the table');
  for (const bad of [NaN, undefined, null, 'x']) {
    assert.equal(clampColWidth(bad, 123), 123, 'unusable input falls back to the default');
  }
});

// ── Column widths as proportions (2026-09-14) ─────────────────────────
// The first cut sized columns in px on a `width: max-content` table, so
// twelve NPI columns produced a long horizontal scroll and the operator
// could not see a whole row at once. Widths are proportions of the card
// now: the table always fits, and dragging a column redistributes space
// instead of growing the table.

const cols3 = [
  { key: 'a', w: 100 },
  { key: 'b', w: 200 },
  { key: 'c', w: 100 },
];

test('colWidthPercents spreads the defaults across the full width', () => {
  const pct = colWidthPercents(cols3, {});
  assert.deepEqual(Object.keys(pct), ['a', 'b', 'c']);
  assert.equal(pct.a, '25%');
  assert.equal(pct.b, '50%');
  assert.equal(pct.c, '25%');
});

test('colWidthPercents always totals 100% — the table never overflows', () => {
  for (const widths of [{}, { b: 600 }, { a: 60, b: 60, c: 60 }, { a: 600, b: 600, c: 600 }]) {
    const pct = colWidthPercents(cols3, widths);
    const total = Object.values(pct).reduce((n, v) => n + parseFloat(v), 0);
    assert.ok(Math.abs(total - 100) < 0.05, `total was ${total} for ${JSON.stringify(widths)}`);
  }
});

test('dragging one column wider takes space from the others', () => {
  const before = colWidthPercents(cols3, {});
  const after = colWidthPercents(cols3, { a: 300 });
  assert.ok(parseFloat(after.a) > parseFloat(before.a), 'dragged column should grow');
  assert.ok(parseFloat(after.b) < parseFloat(before.b), 'the others should yield space');
});

test('colWidthPercents ignores stored widths for columns that no longer exist', () => {
  // A library's column set can change between releases; a stale key must
  // not steal width from the columns that are actually rendered.
  const pct = colWidthPercents(cols3, { gone: 5000 });
  assert.deepEqual(Object.keys(pct), ['a', 'b', 'c']);
  assert.equal(pct.a, '25%');
});

test('colWidthPercents survives an empty column list', () => {
  assert.deepEqual(colWidthPercents([], {}), {});
  assert.deepEqual(colWidthPercents(undefined, {}), {});
});

// ── Which columns actually render (2026-09-14) ────────────────────────
// Twelve columns wrap into unreadable slivers on a narrow card, so the
// optional ones drop out by priority; and the operator can hide any
// column by hand. One function decides, so the header, the body and the
// colgroup can never disagree about the column set.

const npi = () => PICKER_COLUMNS.npi;
const keys = (cols) => cols.map((c) => c.key);

test('a wide card shows every column', () => {
  assert.deepEqual(keys(visibleColumns(npi(), { width: 1400 })), keys(npi()));
  assert.deepEqual(keys(visibleColumns(npi())), keys(npi()), 'no width known → show all');
});

test('a narrow card drops the nice-to-have columns first', () => {
  const mid = keys(visibleColumns(npi(), { width: NARROW_PX - 1 }));
  const tight = keys(visibleColumns(npi(), { width: VERY_NARROW_PX - 1 }));
  assert.ok(mid.length < npi().length, 'nothing dropped at the narrow breakpoint');
  assert.ok(tight.length < mid.length, 'the tighter breakpoint must drop more');
  // The fields the choice turns on survive every breakpoint.
  for (const k of ['code', 'price']) {
    assert.ok(tight.includes(k), `${k} must survive the tightest layout`);
  }
});

test('hidden columns are removed at any width', () => {
  const shown = keys(visibleColumns(npi(), { width: 1400, hidden: ['color', 'surface'] }));
  assert.ok(!shown.includes('color') && !shown.includes('surface'));
  assert.ok(shown.includes('code'));
});

test('hiding everything still renders one column rather than an empty table', () => {
  const all = keys(npi());
  const shown = visibleColumns(npi(), { width: 1400, hidden: all });
  assert.equal(shown.length, 1, 'must not collapse to zero columns');
});

test('visibleColumns tolerates junk input', () => {
  assert.deepEqual(visibleColumns(undefined, {}), []);
  assert.deepEqual(visibleColumns([], { width: 100 }), []);
  assert.deepEqual(keys(visibleColumns(npi(), { hidden: null, width: NaN })), keys(npi()));
});

test('every library keeps at least one column at the tightest width', () => {
  for (const [lib, cols] of Object.entries(PICKER_COLUMNS)) {
    const shown = visibleColumns(cols, { width: 320 });
    assert.ok(shown.length >= 1, `${lib} collapsed to nothing`);
  }
});

test('widths still total 100% after columns drop out', () => {
  const shown = visibleColumns(npi(), { width: VERY_NARROW_PX - 1 });
  const pct = colWidthPercents(shown, {});
  const total = Object.values(pct).reduce((n, v) => n + parseFloat(v), 0);
  assert.ok(Math.abs(total - 100) < 0.05, `total was ${total}`);
});
