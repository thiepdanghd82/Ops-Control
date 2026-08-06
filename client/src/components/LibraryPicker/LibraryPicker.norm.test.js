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
import { normNPI, normSourcing, normIfsMaterial } from './LibraryPicker.norm.js';

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

test('all norms expose the same keys (shape stability incl. date)', () => {
  const keys = (o) => Object.keys(o).sort();
  const expected = ['code', 'date', 'desc', 'extra', 'g_price', 'ifs_code', 'supplier'];
  assert.deepEqual(keys(normNPI({ name: 'a' })), expected);
  assert.deepEqual(keys(normSourcing({ material: 'a' })), expected);
  assert.deepEqual(keys(normIfsMaterial({ part_no: 'a' })), expected);
});
