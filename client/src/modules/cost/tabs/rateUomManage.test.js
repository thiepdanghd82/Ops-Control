// @ts-check
/**
 * rateUomManage — pure helper regression (legacy migration + custom-UOM
 * add/rename/delete + row cascade). Runner:
 *   node --test src/modules/cost/tabs/rateUomManage.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SPEED_UOMS,
  migrateSpeedUom,
  migrateRowsUom,
  visibleCustomUoms,
  addCustomUom,
  renameCustomUom,
  deleteCustomUom,
  rowsUseUom,
  cascadeRowsUom,
} from './rateUomManage.js';

test('DEFAULT_SPEED_UOMS is the new list (no Mtr/Hr, single Sheets/Hrs)', () => {
  assert.deepEqual(DEFAULT_SPEED_UOMS, ['', 'M/min', 'Sheets/Hrs', 'Shot/min', 'Pcs/hrs', 'Hrs']);
});

test('migrateSpeedUom maps legacy labels, identity otherwise', () => {
  assert.equal(migrateSpeedUom('Stamp/min'), 'Shot/min');
  assert.equal(migrateSpeedUom('Pcs/H'), 'Pcs/hrs');
  assert.equal(migrateSpeedUom('Sheets/H'), 'Sheets/Hrs');
  assert.equal(migrateSpeedUom('Sheet/H'), 'Sheets/Hrs');
  assert.equal(migrateSpeedUom('M/min'), 'M/min', 'unchanged');
  assert.equal(migrateSpeedUom('Mtr/Hr'), 'Mtr/Hr', 'preserved (no new equivalent)');
  assert.equal(migrateSpeedUom(''), '');
  assert.equal(migrateSpeedUom('Custom'), 'Custom');
});

test('migrateRowsUom rewrites only affected rows (ref-stable otherwise)', () => {
  const rows = [
    { workcenter: 'A', speed_uom: 'Stamp/min' },
    { workcenter: 'B', speed_uom: 'm/min' },
    { workcenter: 'C', speed_uom: 'Mtr/Hr' },
  ];
  const out = migrateRowsUom(rows);
  assert.equal(out[0].speed_uom, 'Shot/min');
  assert.equal(out[1], rows[1], 'unchanged row keeps identity');
  assert.equal(out[2].speed_uom, 'Mtr/Hr', 'legacy Mtr/Hr preserved');
});

test('visibleCustomUoms drops built-in collisions + case dupes + empties', () => {
  const out = visibleCustomUoms(['RPM', 'rpm', 'M/min', '', '  ', 'Cuts/min']);
  assert.deepEqual(out, ['RPM', 'Cuts/min']);
});

test('addCustomUom: trims, rejects empty / builtin / duplicate', () => {
  assert.deepEqual(addCustomUom([], '  RPM  '), { ok: true, list: ['RPM'] });
  assert.equal(addCustomUom([], '').ok, false);
  assert.equal(addCustomUom([], 'M/min').error, 'builtin_collision');
  assert.equal(
    addCustomUom([], 'sheets/hrs').error,
    'builtin_collision',
    'case-insensitive builtin'
  );
  assert.equal(addCustomUom(['RPM'], 'rpm').error, 'duplicate');
});

test('renameCustomUom: rejects builtin/dupe/not-found, else replaces', () => {
  assert.deepEqual(renameCustomUom(['RPM'], 'RPM', 'Cuts/min'), { ok: true, list: ['Cuts/min'] });
  assert.equal(renameCustomUom(['RPM'], 'RPM', 'Hrs').error, 'builtin_collision');
  assert.equal(renameCustomUom(['RPM', 'CPS'], 'RPM', 'cps').error, 'duplicate');
  assert.equal(renameCustomUom(['RPM'], 'NOPE', 'X').error, 'not_found');
  assert.equal(renameCustomUom(['RPM'], 'RPM', '  ').error, 'empty');
});

test('deleteCustomUom removes the value', () => {
  assert.deepEqual(deleteCustomUom(['RPM', 'CPS'], 'RPM'), ['CPS']);
});

test('rowsUseUom + cascadeRowsUom', () => {
  const rows = [{ speed_uom: 'RPM' }, { speed_uom: 'M/min' }];
  assert.equal(rowsUseUom(rows, 'RPM'), true);
  assert.equal(rowsUseUom(rows, 'Nope'), false);
  const out = cascadeRowsUom(rows, 'RPM', 'Cuts/min');
  assert.equal(out[0].speed_uom, 'Cuts/min');
  assert.equal(out[1], rows[1], 'non-matching row keeps identity');
});
