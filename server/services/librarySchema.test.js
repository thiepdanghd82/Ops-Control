/**
 * librarySchema tests — cover row-level validation, coercion, strict
 * mode, and the canonical schemas (permissionGroup, machineProfile,
 * rateRow). Kept close to the source file so regressions show up in
 * the same change that broke them.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRows,
  permissionGroupSchema,
  machineProfileSchema,
  rateRowSchema,
  safeParseJson,
} from './librarySchema.js';

describe('validateRows — basic behavior', () => {
  test('keeps valid rows unchanged in passthrough mode', () => {
    const schema = { id: { type: 'string', required: true }, price: { type: 'number' } };
    const input = [{ id: 'a', price: 10, extra: 'keep-me' }];
    const { rows, dropped, errors } = validateRows(input, schema, { silent: true });
    assert.equal(dropped, 0);
    assert.equal(errors.length, 0);
    assert.deepEqual(rows, [{ id: 'a', price: 10, extra: 'keep-me' }]);
  });

  test('strips unknown keys in strict mode', () => {
    const schema = { id: { type: 'string', required: true } };
    const input = [{ id: 'a', hostile: '<script>', __proto__: 'bad' }];
    const { rows } = validateRows(input, schema, { strict: true, silent: true });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'a');
    assert.equal(rows[0].hostile, undefined);
  });

  test('drops rows with missing required fields', () => {
    const schema = { id: { type: 'string', required: true } };
    const input = [{ id: 'ok' }, { notId: 'bad' }];
    const { rows, dropped } = validateRows(input, schema, { silent: true });
    assert.equal(rows.length, 1);
    assert.equal(dropped, 1);
  });

  test('coerces numeric strings to numbers', () => {
    const schema = { price: { type: 'number' } };
    const input = [{ price: '3.14' }];
    const { rows } = validateRows(input, schema, { silent: true });
    assert.equal(rows[0].price, 3.14);
  });

  test('rejects values outside min/max', () => {
    const schema = { pct: { type: 'number', min: 0, max: 1 } };
    const { rows, errors } = validateRows([{ pct: 1.5 }], schema, { silent: true });
    assert.equal(rows.length, 1); // row kept but field stripped
    assert.equal(rows[0].pct, undefined);
    assert.ok(errors.some(e => e.includes('above max')));
  });

  test('rejects values outside enum', () => {
    const schema = { role: { type: 'string', enum: ['admin', 'user'] } };
    const { errors } = validateRows([{ role: 'hacker' }], schema, { silent: true });
    assert.ok(errors.some(e => e.includes('must be one of')));
  });

  test('non-array top-level input returns empty + logs error', () => {
    const { rows, errors } = validateRows('not-an-array', {}, { silent: true });
    assert.deepEqual(rows, []);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes('expected top-level array'));
  });

  test('non-object row is dropped', () => {
    const schema = { id: { type: 'string', required: true } };
    const { rows, dropped } = validateRows([null, 'string-row', { id: 'ok' }], schema, { silent: true });
    assert.equal(rows.length, 1);
    assert.equal(dropped, 2);
  });
});

describe('permissionGroupSchema — auth-critical', () => {
  test('accepts a well-formed group', () => {
    const g = {
      id: 'sales_default',
      name: 'Sales Default',
      default_department: 'sales',
      is_system: false,
      tab_permissions: { pricing: 'edit', rfq: 'read' },
    };
    const { rows, dropped } = validateRows([g], permissionGroupSchema, { strict: true, silent: true });
    assert.equal(dropped, 0);
    assert.equal(rows[0].id, 'sales_default');
    assert.deepEqual(rows[0].tab_permissions, { pricing: 'edit', rfq: 'read' });
  });

  test('drops group missing required id', () => {
    const { dropped } = validateRows([{ name: 'no-id' }], permissionGroupSchema, { strict: true, silent: true });
    assert.equal(dropped, 1);
  });

  test('strict mode strips hostile keys but keeps group', () => {
    const g = {
      id: 'x',
      name: 'X',
      __proto__: { isAdmin: true },
      injected_grant: 'sys',
    };
    const { rows } = validateRows([g], permissionGroupSchema, { strict: true, silent: true });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].injected_grant, undefined);
  });
});

describe('machineProfileSchema — pricing-critical', () => {
  test('accepts a rotary press', () => {
    const p = {
      id: 'gallus-ecs340',
      name: 'Gallus ECS 340',
      press_type: 'rotary',
      tooth_count_max: 96,
      tooth_pitch_mm: 3.175,
      web_width_max_mm: 340,
      plate_dies: [{ tooth: 96, qty: 2 }],
      magnetic_dies: [],
    };
    const { rows, dropped } = validateRows([p], machineProfileSchema, { silent: true });
    assert.equal(dropped, 0);
    assert.equal(rows[0].tooth_count_max, 96);
  });

  test('rejects invalid press_type', () => {
    const p = { id: 'bad', name: 'Bad', press_type: 'vacuum' };
    const { rows } = validateRows([p], machineProfileSchema, { silent: true });
    assert.equal(rows[0].press_type, undefined); // stripped (not required)
  });

  test('drops row with missing name (required)', () => {
    const { dropped } = validateRows([{ id: 'x' }], machineProfileSchema, { silent: true });
    assert.equal(dropped, 1);
  });
});

describe('rateRowSchema — pricing-critical', () => {
  test('accepts a well-formed rate row', () => {
    const r = { workcenter: 'Flexo 1', rate: 120.5, currency: 'USD' };
    const { rows, dropped } = validateRows([r], rateRowSchema, { silent: true });
    assert.equal(dropped, 0);
    assert.equal(rows[0].rate, 120.5);
  });

  test('drops row with negative rate (required + min:0)', () => {
    const { rows, dropped } = validateRows(
      [{ workcenter: 'X', rate: -5 }],
      rateRowSchema,
      { silent: true },
    );
    assert.equal(rows.length, 0);
    assert.equal(dropped, 1);
  });

  test('drops row missing workcenter', () => {
    const { dropped } = validateRows([{ rate: 100 }], rateRowSchema, { silent: true });
    assert.equal(dropped, 1);
  });
});

describe('safeParseJson', () => {
  test('returns parsed JSON on success', () => {
    const r = safeParseJson('{"a":1}', 'unit');
    assert.deepEqual(r, { a: 1 });
  });

  test('returns null on parse failure', () => {
    const originalError = console.error;
    let logged = '';
    console.error = (...args) => { logged = args.join(' '); };
    try {
      const r = safeParseJson('not json', 'unit');
      assert.equal(r, null);
      assert.ok(logged.includes('JSON.parse failed'));
    } finally {
      console.error = originalError;
    }
  });
});
