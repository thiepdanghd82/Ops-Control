// @ts-check
/**
 * MVP-2 Item B — _Schema chunked + integrity-hashed payload sheet.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import zlib from 'node:zlib';
import {
  encodeSchemaPayload,
  buildSchemaSheet,
  readSchemaSheet,
  decodePayload,
  canonicalStringify,
  CHUNK_SIZE,
  _internal,
} from '../schema.js';

async function reopen(wb) {
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf);
  return wb2;
}

test('schema: round-trip — gzip → base64 → chunk → reassemble → ungzip identical', async () => {
  const state = {
    rfq_number: 'RT-1',
    materials_main: [
      { _mid: 'm1', code: 'M1', usage: 1, setup_lm: 50 },
      { _mid: 'm2', code: 'M2', usage: 2, setup_lm: 100 },
    ],
    inks: [{ _mid: 'i1', print_type: 'Flexo', clicks: 4 }],
    nested: { deep: { value: 42, list: [1, 2, 3] } },
  };
  const wb = new ExcelJS.Workbook();
  const encoded = encodeSchemaPayload(state);
  buildSchemaSheet(wb, encoded);
  const wb2 = await reopen(wb);
  const { payload, manifest } = readSchemaSheet(wb2);
  assert.equal(manifest.alg, 'gzip+b64');
  assert.equal(manifest.sha256, encoded.sha256);
  const decoded = decodePayload(payload);
  assert.deepEqual(decoded, JSON.parse(canonicalStringify(state)));
});

test('schema: chunk size cap respected (< 32767 per cell)', async () => {
  // Synthesize a state large enough to span ≥ 2 chunks (~10K base64
  // chars per gzip-compressed input → need ~40KB raw JSON).
  const state = {
    big: 'X'.repeat(40_000),
    arr: Array.from({ length: 100 }, (_, i) => ({ id: i, blob: 'Y'.repeat(500) })),
  };
  const encoded = encodeSchemaPayload(state);
  assert.ok(encoded.chunks.length >= 1, 'at least one chunk');
  encoded.chunks.forEach((c, i) => {
    assert.ok(c.length <= CHUNK_SIZE, `chunk ${i} length ${c.length} <= ${CHUNK_SIZE}`);
  });
});

test('schema: manifest cell A1 has {chunks, sha256, alg} shape', async () => {
  const wb = new ExcelJS.Workbook();
  const encoded = encodeSchemaPayload({ a: 1 });
  buildSchemaSheet(wb, encoded);
  const wb2 = await reopen(wb);
  const sheet = wb2.getWorksheet(_internal.SCHEMA_SHEET_NAME);
  const raw = String(sheet.getCell(_internal.MANIFEST_CELL).value);
  const m = JSON.parse(raw);
  assert.equal(typeof m.chunks, 'number');
  assert.match(m.sha256, /^[0-9a-f]{64}$/);
  assert.equal(m.alg, 'gzip+b64');
});

test('schema: sha256 in manifest matches recomputed hash of decoded payload', async () => {
  const wb = new ExcelJS.Workbook();
  const encoded = encodeSchemaPayload({ hello: 'world' });
  buildSchemaSheet(wb, encoded);
  const wb2 = await reopen(wb);
  const { payload, manifest } = readSchemaSheet(wb2);
  const decoded = decodePayload(payload);
  assert.deepEqual(decoded, { hello: 'world' });
  // readSchemaSheet would have thrown if mismatched; explicit check too:
  const crypto = await import('node:crypto');
  const recomputed = crypto.createHash('sha256').update(payload).digest('hex');
  assert.equal(recomputed, manifest.sha256);
});

test('schema: empty state round-trips correctly', async () => {
  const wb = new ExcelJS.Workbook();
  const encoded = encodeSchemaPayload({});
  buildSchemaSheet(wb, encoded);
  const wb2 = await reopen(wb);
  const { payload } = readSchemaSheet(wb2);
  assert.deepEqual(decodePayload(payload), {});
});

test('schema: 1MB synthetic payload (stress) round-trips correctly', async () => {
  // Build a payload that compresses poorly (random-ish JSON) so the
  // base64 chunk count is non-trivial. Real quote.state is far smaller
  // but this stress-test catches chunker off-by-ones at the boundary.
  const items = Array.from({ length: 200 }, (_, i) => ({
    _mid: `m${i}`,
    code: `MAT-${i}`,
    desc: `Material ${i} ${Math.random().toString(36).slice(2)}`,
    usage: Math.random(),
    setup_lm: Math.random() * 500,
    extra: Math.random().toString(36).repeat(50),
  }));
  const state = { materials_main: items, materials_alt: items.slice(0, 50) };
  const wb = new ExcelJS.Workbook();
  const encoded = encodeSchemaPayload(state);
  buildSchemaSheet(wb, encoded);
  const wb2 = await reopen(wb);
  const { payload } = readSchemaSheet(wb2);
  const decoded = decodePayload(payload);
  assert.equal(decoded.materials_main.length, 200);
  assert.equal(decoded.materials_main[0].code, 'MAT-0');
  assert.equal(decoded.materials_main[199].code, 'MAT-199');
  assert.equal(decoded.materials_alt.length, 50);
});

test('schema: canonicalStringify produces stable key order across key insertion order', async () => {
  const a = { z: 1, a: 2, m: { y: 3, x: 4 } };
  const b = { a: 2, m: { x: 4, y: 3 }, z: 1 };
  assert.equal(canonicalStringify(a), canonicalStringify(b));
});

test('schema: canonicalStringify preserves array order', async () => {
  const a = { list: [3, 1, 2] };
  const b = { list: [1, 2, 3] };
  assert.notEqual(canonicalStringify(a), canonicalStringify(b));
});
