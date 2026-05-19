// @ts-check
/**
 * MVP-2 Item A — _Audit hidden metadata sheet.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportQuote } from '../index.js';
import { readAuditSheet, _internal } from '../audit.js';

const HMAC_KEY = 'a'.repeat(64);

function makeQuote(overrides = {}) {
  return {
    id: 42,
    label: 'AUDIT-1',
    _version: 7,
    saved_at: '2026-05-18T10:00:00Z',
    saved_by: 'thiepdt',
    type: 'standard',
    state: {
      rfq_number: 'AUDIT-1',
      end_cu: 'Audit Customer',
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
      materials_main: [],
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
      rows: { materials_main: [], materials_alt: [], inks: [], processes: [] },
    },
    ...overrides,
  };
}

async function parse(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

test('audit: _Audit sheet exists and is marked hidden', async () => {
  const out = await exportQuote(makeQuote(), {
    variant: 'internal',
    lang: 'en',
    hmacKey: HMAC_KEY,
  });
  const wb = await parse(out.buffer);
  const sheet = wb.getWorksheet(_internal.AUDIT_SHEET_NAME);
  assert.ok(sheet, '_Audit sheet must exist');
  // ExcelJS represents hidden state via sheet.state === 'hidden'
  assert.equal(sheet.state, 'hidden', '_Audit sheet must be hidden');
});

test('audit: all 10 metadata cells populated', async () => {
  const out = await exportQuote(makeQuote(), {
    variant: 'customer',
    lang: 'en',
    exportedBy: 'auditor1',
    engineSha: 'abcd1234ef',
    hmacKey: HMAC_KEY,
  });
  const wb = await parse(out.buffer);
  const audit = readAuditSheet(wb);
  assert.ok(audit);
  assert.equal(audit.quote_id, '42');
  assert.equal(audit.version, '7');
  assert.equal(audit.saved_at, '2026-05-18T10:00:00Z');
  assert.equal(audit.saved_by, 'thiepdt');
  assert.equal(audit.variant, 'customer');
  assert.equal(audit.exported_by, 'auditor1');
  // 8-char engine sha
  assert.equal(audit.engine_sha, 'abcd1234');
  // payload sha256 hex digest (64 chars)
  assert.match(audit.payload_sha256, /^[0-9a-f]{64}$/);
});

test('audit: engine_sha + library_fingerprint stamped when ctx provides', async () => {
  const out = await exportQuote(makeQuote(), {
    variant: 'internal',
    lang: 'en',
    engineSha: 'deadbeef99',
    lib: { foo: 'bar', rate: [{ workcenter: 'WC1' }] },
    hmacKey: HMAC_KEY,
  });
  const audit = readAuditSheet(await parse(out.buffer));
  assert.equal(audit.engine_sha, 'deadbeef');
  // 16-char short fingerprint hex
  assert.match(audit.library_fingerprint, /^[0-9a-f]{16}$/);
});

test('audit: exported_at is ISO-8601 UTC', async () => {
  const out = await exportQuote(makeQuote(), {
    variant: 'internal',
    lang: 'en',
    hmacKey: HMAC_KEY,
  });
  const audit = readAuditSheet(await parse(out.buffer));
  assert.match(audit.exported_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.ok(audit.exported_at.endsWith('Z'), 'must be UTC (Z-suffix)');
});

test('audit: variant string matches request', async () => {
  for (const variant of ['customer', 'internal']) {
    const out = await exportQuote(makeQuote(), { variant, lang: 'en', hmacKey: HMAC_KEY });
    const audit = readAuditSheet(await parse(out.buffer));
    assert.equal(audit.variant, variant);
  }
});
