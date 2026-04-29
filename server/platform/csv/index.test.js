// @ts-check
/**
 * platform/csv unit tests.
 *
 * Pure-function CSV row formatters lifted from costApi.js in J1.
 * Run: node --test server/platform/csv/index.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rateRows, ddlToCsvRows } from './index.js';

describe('rateRows', () => {
  test('empty input → headers + empty body', () => {
    const [h, rows] = rateRows([]);
    assert.deepEqual(h, [
      'workcenter',
      'crew',
      'machine_rate',
      'labor_rate',
      'speed_uom',
      'oh_cost',
      'W/C',
    ]);
    assert.deepEqual(rows, []);
  });

  test('null/undefined input safe → empty body', () => {
    const [, rows1] = rateRows(null);
    const [, rows2] = rateRows(undefined);
    assert.deepEqual(rows1, []);
    assert.deepEqual(rows2, []);
  });

  test('happy path: 1 row maps each field 1:1', () => {
    const [, rows] = rateRows([
      {
        workcenter: 'WC1',
        crew: 2,
        machine_rate: 12.5,
        labor_rate: 8,
        speed_uom: 'm/min',
        oh_cost: 1.2,
        mc_cost: 'A1',
      },
    ]);
    assert.deepEqual(rows, [['WC1', 2, 12.5, 8, 'm/min', 1.2, 'A1']]);
  });

  test('missing fields → empty strings (not undefined)', () => {
    const [, rows] = rateRows([{ workcenter: 'WC2' }]);
    assert.deepEqual(rows[0], ['WC2', '', '', '', '', '', '']);
  });

  test('header order is FIXED — operators have spreadsheet templates', () => {
    // Regression guard. If someone reorders columns the operator's
    // CSV imports break silently.
    const [h] = rateRows([]);
    assert.equal(h[0], 'workcenter');
    assert.equal(h[6], 'W/C');
    assert.equal(h.length, 7);
  });
});

describe('ddlToCsvRows', () => {
  test('empty / null input → headers + empty body', () => {
    const [h1, rows1] = ddlToCsvRows({});
    assert.deepEqual(h1, ['section', 'index', 'value']);
    assert.deepEqual(rows1, []);
    const [, rows2] = ddlToCsvRows(null);
    assert.deepEqual(rows2, []);
  });

  test('flattens object-of-arrays into (section, index, value) rows', () => {
    const [, rows] = ddlToCsvRows({
      colors: ['red', 'blue', 'green'],
      sizes: ['S', 'M', 'L'],
    });
    assert.equal(rows.length, 6);
    assert.deepEqual(rows[0], ['colors', 0, 'red']);
    assert.deepEqual(rows[3], ['sizes', 0, 'S']);
  });

  test('_custom_sections key is excluded from output', () => {
    const [, rows] = ddlToCsvRows({
      colors: ['red'],
      _custom_sections: { meta: 'should be ignored' },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0][0], 'colors');
  });

  test('non-array values silently skipped (not crashed)', () => {
    const [, rows] = ddlToCsvRows({
      colors: ['red', 'blue'],
      bad_string: 'not an array',
      bad_number: 42,
      bad_object: { nested: 'bad' },
    });
    assert.equal(rows.length, 2); // only colors[]
  });

  test('non-string values stringified via JSON.stringify', () => {
    const [, rows] = ddlToCsvRows({
      mixed: ['plain', { nested: 'object' }, 42],
    });
    assert.equal(rows[0][2], 'plain');
    assert.equal(rows[1][2], '{"nested":"object"}');
    assert.equal(rows[2][2], '42');
  });
});
