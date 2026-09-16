/**
 * exportCell — what a download writes for a column the row predates.
 *
 * The NPI currency column shipped after 3058 rows were already in the
 * library. Those rows hold no currency and the app shows them as USD, so the
 * export must say USD too; a blank column would contradict the screen and
 * re-import as "unset" forever.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCell, getDataset } from './importDatasets.js';

const NPI = getDataset('npi-materials');

test('NPI declares Currency, positioned right after Price as on screen', () => {
  const i = NPI.canonicalHeaders.indexOf('currency');
  assert.ok(i > 0, 'currency is a canonical column');
  assert.equal(NPI.canonicalHeaders[i - 1], 'price', 'and it follows price');
  assert.equal(NPI.prettyLabels.currency, 'Currency');
});

test('a row that predates the column exports as USD, not blank', () => {
  const legacy = { name: 'PET SB50', price: 3.35 };
  assert.equal(exportCell(NPI, legacy, 'currency'), 'USD');
  assert.equal(exportCell(NPI, { ...legacy, currency: '' }, 'currency'), 'USD');
});

test('a row that carries a currency exports its own value', () => {
  assert.equal(exportCell(NPI, { currency: 'VND' }, 'currency'), 'VND');
});

test('columns with no default are untouched — absent stays blank', () => {
  assert.equal(exportCell(NPI, { name: 'x' }, 'supplier'), '');
  assert.equal(exportCell(NPI, { supplier: 'Huynh De' }, 'supplier'), 'Huynh De');
  assert.equal(exportCell(NPI, { price: 0 }, 'price'), 0, 'a real 0 is not "unset"');
});

test('the import side refuses a currency the dropdown cannot select', () => {
  assert.deepEqual(NPI.columnEnums.currency, ['USD', 'VND']);
  assert.equal(NPI.columnTypes.currency, 'enum');
});
