// @ts-check
/**
 * MVP-2 Item C — HMAC sign/verify integrity.
 *
 * Tamper paths use ExcelJS round-trip (load → mutate cell → save). Do
 * NOT use `dd` byte-edit — xlsx is a ZIP; raw byte mutation corrupts
 * the ZIP CRC before HMAC verification runs, so the test wouldn't
 * exercise the HMAC path at all.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportQuote } from '../index.js';
import { verifyExport } from '../verify.js';
import { computeHmac, assertHmacKey, verifyHmac } from '../hmac.js';
import { _internal as _schemaInternal } from '../schema.js';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

function makeQuote() {
  return {
    id: 1,
    label: 'HMAC-1',
    _version: 1,
    type: 'standard',
    state: {
      rfq_number: 'HMAC-1',
      end_cu: 'X',
      moq: 1000,
      annual_qty: 10000,
      selling_price: 0.5,
      active_moq_idx: 0,
      sheet_length: 480,
      min_gap_md: 2,
      num_webs: 1,
      parts_web_across: 1,
      parts_in_md: 1,
      web_width_td: 100,
      materials_main: [{ _mid: 'm1', code: 'M1', usage: 1, setup_lm: 50, latest: 3.5 }],
      materials_alt: [],
      materials_active: 'main',
      inks: [],
      processes: [],
      extra_moqs: [],
    },
    result: {
      sp: 0.5,
      s_ttl: 0.35,
      gm: 0.3,
      rows: {
        materials_main: [{ setup_cost: 0.05, run_cost: 0.1, total: 0.15 }],
        materials_alt: [],
        inks: [],
        processes: [],
      },
    },
  };
}

async function loadWb(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

async function exportThenMutate(mutator) {
  const out = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en', hmacKey: KEY_A });
  const wb = await loadWb(out.buffer);
  mutator(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('hmac: HMAC of payload matches _Schema!A2 stamped value', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en', hmacKey: KEY_A });
  const wb = await loadWb(out.buffer);
  const sheet = wb.getWorksheet(_schemaInternal.SCHEMA_SHEET_NAME);
  const stamped = String(sheet.getCell(_schemaInternal.HMAC_CELL).value);
  // auditMeta exposes the same hmac
  assert.equal(out.auditMeta[0].hmac, stamped);
  assert.match(stamped, /^[0-9a-f]{64}$/);
});

test('hmac: verifyExport passes on untouched workbook', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en', hmacKey: KEY_A });
  const v = await verifyExport(out.buffer, KEY_A);
  assert.ok(v.state, 'decoded state returned');
  assert.equal(v.state.rfq_number, 'HMAC-1');
});

test('hmac: verifyExport FAILS when payload chunk tampered (round-trip via exceljs)', async () => {
  const tampered = await exportThenMutate((wb) => {
    const sheet = wb.getWorksheet(_schemaInternal.SCHEMA_SHEET_NAME);
    // B1 = first chunk of the payload. Flip a char inside it; manifest
    // sha256 will now mismatch reassembled payload.
    const cell = sheet.getCell('B1');
    const v = String(cell.value || '');
    cell.value = v.slice(0, 5) + 'X' + v.slice(6);
  });
  await assert.rejects(
    () => verifyExport(tampered, KEY_A),
    /integrity mismatch|HMAC verification failed/
  );
});

test('hmac: verifyExport FAILS when HMAC cell itself tampered', async () => {
  const tampered = await exportThenMutate((wb) => {
    const sheet = wb.getWorksheet(_schemaInternal.SCHEMA_SHEET_NAME);
    // Mutate the HMAC stamp to a valid-looking-but-wrong digest.
    sheet.getCell(_schemaInternal.HMAC_CELL).value = '0'.repeat(64);
  });
  await assert.rejects(() => verifyExport(tampered, KEY_A), /HMAC verification failed/);
});

test('hmac: verifyExport FAILS when key differs from export-time key', async () => {
  const out = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en', hmacKey: KEY_A });
  await assert.rejects(() => verifyExport(out.buffer, KEY_B), /HMAC verification failed/);
});

test('hmac: assertHmacKey rejects missing / short keys', () => {
  assert.throws(() => assertHmacKey(undefined), /missing/i);
  assert.throws(() => assertHmacKey(''), /missing/i);
  assert.throws(() => assertHmacKey('a'.repeat(63)), /64 hex/);
  assert.throws(() => assertHmacKey('Z'.repeat(64)), /64 hex/);
  // valid hex passes
  const ok = 'deadbeef'.repeat(8);
  assert.equal(assertHmacKey(ok), ok);
});

test('hmac: computeHmac is deterministic for same payload+key', () => {
  const p = Buffer.from('hello world');
  const a = computeHmac(p, KEY_A);
  const b = computeHmac(p, KEY_A);
  assert.equal(a, b);
  // Different key → different digest
  assert.notEqual(a, computeHmac(p, KEY_B));
});

test('hmac: verifyHmac uses timing-safe comparison (defense-in-depth)', () => {
  const p = Buffer.from('payload');
  const correct = computeHmac(p, KEY_A);
  // Off-by-one digest should fail
  const corrupt = correct.slice(0, -1) + (correct.endsWith('a') ? 'b' : 'a');
  assert.throws(() => verifyHmac(p, corrupt, KEY_A), /verification failed/);
});
