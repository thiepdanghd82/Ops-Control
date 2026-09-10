// @ts-check
/**
 * Custom pair-tables in the Drop-Down Lists editor — pure helpers.
 * Coverage-shaped user tables ({k, v} pairs) that are STORED + editable
 * but NOT consumed by calcEngine / dropdowns / exporter. Runner:
 *   node --test src/modules/cost/tabs/ddlCustomTables.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pairTableConfig,
  slugifyTableKey,
  makeUniqueCustomKey,
  isCustomSection,
  createCustomTable,
  deleteCustomTable,
  orderSectionKeys,
} from './ddlEntryHelpers.js';

const BUILTIN_LABELS = ['Coverage Table', 'Tool Life', 'Click Charges'];

test('pairTableConfig maps coverage → {pt, cov} (decimal) and custom → {k, v} (text)', () => {
  const cov = pairTableConfig('coverage');
  assert.equal(cov.labelField, 'pt');
  assert.equal(cov.valueField, 'cov');
  assert.equal(cov.labelPlaceholder, 'Print Type');
  assert.equal(cov.valuePlaceholder, 'Coverage');
  assert.equal(cov.valueDecimal, true);
  assert.deepEqual(cov.newRow, { pt: '', cov: 0 });

  const custom = pairTableConfig('custom_freight');
  assert.equal(custom.labelField, 'k');
  assert.equal(custom.valueField, 'v');
  assert.equal(custom.labelPlaceholder, 'Name');
  assert.equal(custom.valuePlaceholder, 'Value');
  assert.equal(custom.valueDecimal, false);
  assert.deepEqual(custom.newRow, { k: '', v: '' });
});

test('slugifyTableKey slugs latin + strips diacritics; non-latin → "table"', () => {
  assert.equal(slugifyTableKey('Freight Rates'), 'freight_rates');
  assert.equal(slugifyTableKey('  Bảng giá  '), 'bang_gia');
  assert.equal(slugifyTableKey('!!!'), 'table');
  assert.equal(slugifyTableKey(''), 'table');
});

test('makeUniqueCustomKey prefixes custom_ and disambiguates collisions', () => {
  assert.equal(makeUniqueCustomKey('Freight', []), 'custom_freight');
  assert.equal(makeUniqueCustomKey('Freight', ['custom_freight']), 'custom_freight_2');
  assert.equal(
    makeUniqueCustomKey('Freight', ['custom_freight', 'custom_freight_2']),
    'custom_freight_3'
  );
});

test('createCustomTable adds a unique key + name + empty rows + tracking', () => {
  const sections = { coverage: [{ pt: 'SS', cov: 30 }], site: ['VN'] };
  const res = createCustomTable(sections, '  Freight Rates ', { reservedLabels: BUILTIN_LABELS });
  assert.equal(res.ok, true);
  assert.equal(res.key, 'custom_freight_rates');
  assert.equal(res.name, 'Freight Rates'); // trimmed
  assert.deepEqual(res.sections[res.key], []); // empty rows
  assert.equal(res.sections._custom_names[res.key], 'Freight Rates');
  assert.deepEqual(res.sections._custom_sections, ['custom_freight_rates']);
  // Original untouched (pure).
  assert.equal(sections._custom_sections, undefined);
  assert.deepEqual(res.sections.coverage, [{ pt: 'SS', cov: 30 }]);
});

test('createCustomTable rejects an empty / whitespace name', () => {
  assert.deepEqual(createCustomTable({}, '   '), { ok: false, error: 'empty' });
  assert.deepEqual(createCustomTable({}, ''), { ok: false, error: 'empty' });
});

test('createCustomTable rejects a duplicate name (vs built-in label, case-insensitive)', () => {
  const r = createCustomTable({ coverage: [] }, 'coverage table', {
    reservedLabels: BUILTIN_LABELS,
  });
  assert.deepEqual(r, { ok: false, error: 'duplicate' });
});

test('createCustomTable rejects a duplicate custom name + disambiguates the key on a distinct name', () => {
  let s = { _custom_names: {}, _custom_sections: [] };
  s = createCustomTable(s, 'Freight', { reservedLabels: BUILTIN_LABELS }).sections;
  // Same name again → rejected as duplicate.
  assert.deepEqual(createCustomTable(s, 'Freight', { reservedLabels: BUILTIN_LABELS }), {
    ok: false,
    error: 'duplicate',
  });
  // A different name that slugs to the same base gets a unique key.
  const r2 = createCustomTable(s, 'Freight!', { reservedLabels: BUILTIN_LABELS });
  assert.equal(r2.ok, true);
  assert.equal(r2.key, 'custom_freight_2');
  assert.deepEqual(r2.sections._custom_sections, ['custom_freight', 'custom_freight_2']);
});

test('deleteCustomTable removes the data section + name + tracking entry', () => {
  const created = createCustomTable({ coverage: [] }, 'Freight', {
    reservedLabels: BUILTIN_LABELS,
  }).sections;
  const key = 'custom_freight';
  const res = deleteCustomTable(created, key);
  assert.equal(res.ok, true);
  assert.equal(Object.hasOwn(res.sections, key), false);
  assert.equal(res.sections._custom_names[key], undefined);
  assert.deepEqual(res.sections._custom_sections, []);
  // Built-in section survives.
  assert.deepEqual(res.sections.coverage, []);
});

test('deleteCustomTable refuses to delete a built-in section', () => {
  const sections = { coverage: [{ pt: 'SS', cov: 30 }], _custom_sections: ['custom_x'] };
  for (const builtin of ['coverage', 'tool_life', 'click_charges', 'tool_type', 'site']) {
    const res = deleteCustomTable(sections, builtin);
    assert.deepEqual(res, { ok: false, error: 'not_custom' }, `${builtin} not deletable`);
  }
  // Coverage untouched.
  assert.deepEqual(sections.coverage, [{ pt: 'SS', cov: 30 }]);
});

test('isCustomSection is true only for tracked custom keys', () => {
  const sections = { _custom_sections: ['custom_a'] };
  assert.equal(isCustomSection(sections, 'custom_a'), true);
  assert.equal(isCustomSection(sections, 'coverage'), false);
  assert.equal(isCustomSection({}, 'anything'), false);
});

test('orderSectionKeys lists built-ins first, custom last (order preserved)', () => {
  const keys = ['custom_a', 'coverage', 'custom_b', 'site'];
  assert.deepEqual(orderSectionKeys(keys, ['custom_a', 'custom_b']), [
    'coverage',
    'site',
    'custom_a',
    'custom_b',
  ]);
});
