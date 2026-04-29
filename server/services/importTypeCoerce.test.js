/**
 * importTypeCoerce — number/date/boolean coercion tests.
 *   node --test server/services/importTypeCoerce.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { coerce, coerceNumber, coerceDate, coerceBoolean, trimCell } from './importTypeCoerce.js';

test('trimCell strips NBSP and zero-width chars', () => {
  assert.equal(trimCell('  hello world  '), 'hello world');
  assert.equal(trimCell('foo​bar'), 'foobar');
  assert.equal(trimCell(null), '');
});

test('coerceNumber: plain integer', () => {
  assert.deepEqual(coerceNumber('42'), { ok: true, value: 42, raw: '42' });
});

test('coerceNumber: VN decimal comma', () => {
  assert.deepEqual(coerceNumber('1,5'), { ok: true, value: 1.5, raw: '1,5' });
  assert.deepEqual(coerceNumber('3,14'), { ok: true, value: 3.14, raw: '3,14' });
});

test('coerceNumber: US thousand separator', () => {
  assert.equal(coerceNumber('1,234.56').value, 1234.56);
  assert.equal(coerceNumber('1,000,000').value, 1000000);
});

test('coerceNumber: EU thousand separator', () => {
  assert.equal(coerceNumber('1.234,56').value, 1234.56);
  assert.equal(coerceNumber('10.000,5').value, 10000.5);
});

test('coerceNumber: heuristic prefers thousand sep when integer part > 3 digits', () => {
  // "1,234" is ambiguous — but 4-digit integer part means thousand sep
  assert.equal(coerceNumber('1,234').value, 1234);
});

test('coerceNumber: currency symbols stripped', () => {
  assert.equal(coerceNumber('$1,000').value, 1000);
  assert.equal(coerceNumber('₫50.000,5').value, 50000.5);
});

test('coerceNumber: percent suffix stripped (raw value)', () => {
  assert.equal(coerceNumber('10%').value, 10);
});

test('coerceNumber: parentheses → negative', () => {
  assert.equal(coerceNumber('(123)').value, -123);
});

test('coerceNumber: empty string → null with empty flag', () => {
  const r = coerceNumber('');
  assert.equal(r.ok, true);
  assert.equal(r.value, null);
  assert.equal(r.empty, true);
});

test('coerceNumber: garbage → ok:false', () => {
  const r = coerceNumber('hello');
  assert.equal(r.ok, false);
  assert.match(r.reason, /not_a_number/);
});

test('coerceDate: ISO passthrough', () => {
  assert.equal(coerceDate('2024-12-31').value, '2024-12-31');
  assert.equal(coerceDate('2024-12-31T10:00:00Z').value, '2024-12-31');
});

test('coerceDate: dd/mm/yyyy', () => {
  assert.equal(coerceDate('31/12/2024').value, '2024-12-31');
  assert.equal(coerceDate('1/1/2024').value, '2024-01-01');
});

test('coerceDate: dd-mm-yyyy', () => {
  assert.equal(coerceDate('31-12-2024').value, '2024-12-31');
});

test('coerceDate: mm/dd/yyyy disambiguated when first part > 12', () => {
  // "13/04/2024" — first part > 12, so dd=13, mm=04
  assert.equal(coerceDate('13/04/2024').value, '2024-04-13');
});

test('coerceDate: mm/dd/yyyy when second part > 12', () => {
  // "04/13/2024" — second part > 12 forces mm/dd
  assert.equal(coerceDate('04/13/2024').value, '2024-04-13');
});

test('coerceDate: 2-digit year normalisation', () => {
  // Years <50 → 20xx
  assert.equal(coerceDate('1/1/24').value, '2024-01-01');
  // Years ≥50 → 19xx
  assert.equal(coerceDate('1/1/99').value, '1999-01-01');
});

test('coerceDate: Excel serial', () => {
  // 45657 = 2024-12-31 (Excel epoch-aware)
  const r = coerceDate('45657');
  assert.equal(r.ok, true);
  assert.equal(r.value, '2024-12-31');
});

test('coerceDate: empty → null with empty flag', () => {
  const r = coerceDate('');
  assert.equal(r.ok, true);
  assert.equal(r.value, null);
  assert.equal(r.empty, true);
});

test('coerceBoolean: Y/N variants', () => {
  assert.equal(coerceBoolean('Y').value, true);
  assert.equal(coerceBoolean('Yes').value, true);
  assert.equal(coerceBoolean('TRUE').value, true);
  assert.equal(coerceBoolean('1').value, true);
  assert.equal(coerceBoolean('Có').value, true);
  assert.equal(coerceBoolean('N').value, false);
  assert.equal(coerceBoolean('No').value, false);
  assert.equal(coerceBoolean('false').value, false);
  assert.equal(coerceBoolean('0').value, false);
  assert.equal(coerceBoolean('Không').value, false);
});

test('coerceBoolean: garbage → ok:false', () => {
  const r = coerceBoolean('maybe');
  assert.equal(r.ok, false);
});

test('coerce dispatches by type name', () => {
  assert.equal(coerce('1,5', 'number').value, 1.5);
  assert.equal(coerce('31/12/2024', 'date').value, '2024-12-31');
  assert.equal(coerce('Yes', 'boolean').value, true);
  assert.equal(coerce('  hello  ', 'string').value, 'hello');
  assert.equal(coerce('3.7', 'integer').value, 3);
});
