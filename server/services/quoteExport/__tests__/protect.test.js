// @ts-check
/**
 * MVP-2 Item D — per-sheet password protection.
 *
 * ExcelJS doesn't support workbook-level OPEN-password encryption (the
 * Microsoft compound document format). Our "password" = per-sheet
 * protection across all sheets including hidden _Audit + _Schema. This
 * is XOR cipher — speed-bump only — but combined with HMAC in _Schema
 * it's enough that a casual editor can't tamper without detection.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { exportQuote } from '../index.js';
import { generateWorkbookPassword, _internal as _protectInternal } from '../protect.js';

const HMAC_KEY = 'c'.repeat(64);

function makeQuote() {
  return {
    id: 1,
    label: 'PROT-1',
    _version: 1,
    type: 'standard',
    state: {
      rfq_number: 'PROT-1',
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
  };
}

async function loadWb(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

test('protect: every visible sheet has protection enabled after export', async () => {
  const out = await exportQuote(makeQuote(), {
    variant: 'internal',
    lang: 'en',
    hmacKey: HMAC_KEY,
  });
  const wb = await loadWb(out.buffer);
  const visible = wb.worksheets.filter((s) => s.state !== 'hidden' && s.state !== 'veryHidden');
  assert.ok(visible.length >= 10, 'expected ≥10 visible sheets (MVP-1 baseline)');
  for (const sheet of visible) {
    // ExcelJS surfaces protection via sheet.sheetProtection (raw XLSX
    // model) — checking the presence + flag is sufficient.
    const proto = sheet.sheetProtection;
    assert.ok(proto, `sheet ${sheet.name} should have protection block`);
    assert.equal(proto.sheet, true, `sheet ${sheet.name} should be protected`);
  }
});

test('protect: hidden _Audit + _Schema sheets are also protected', async () => {
  const out = await exportQuote(makeQuote(), {
    variant: 'internal',
    lang: 'en',
    hmacKey: HMAC_KEY,
  });
  const wb = await loadWb(out.buffer);
  for (const name of ['_Audit', '_Schema']) {
    const sheet = wb.getWorksheet(name);
    assert.ok(sheet, `${name} sheet must exist`);
    assert.equal(sheet.state, 'hidden');
    const proto = sheet.sheetProtection;
    assert.ok(proto && proto.sheet, `${name} must be protection-locked`);
  }
});

test('protect: workbook opens for read without password (sheet protection ≠ encryption)', async () => {
  // ExcelJS sheet protection allows reading without a password; only
  // edit operations require it. This test verifies a fresh load() never
  // prompts/throws — operator can view the workbook even though edits
  // are locked.
  const out = await exportQuote(makeQuote(), {
    variant: 'customer',
    lang: 'en',
    hmacKey: HMAC_KEY,
  });
  const wb = new ExcelJS.Workbook();
  await assert.doesNotReject(
    () => wb.xlsx.load(out.buffer),
    'workbook should load without password'
  );
  // And every visible sheet should be readable (i.e. cells return values).
  const cover = wb.getWorksheet('00 Cover');
  assert.ok(cover, 'Cover sheet present');
  assert.ok(cover.getCell('A1').value, 'banner cell readable');
});

test('protect: generateWorkbookPassword produces 32-char hex', () => {
  const p1 = generateWorkbookPassword();
  const p2 = generateWorkbookPassword();
  assert.match(p1, /^[0-9a-f]{32}$/);
  assert.match(p2, /^[0-9a-f]{32}$/);
  assert.notEqual(p1, p2, 'passwords must be random per call');
});

test('protect: PROTECT_OPTIONS locks edit but allows sort + autoFilter (read UX)', () => {
  const opts = _protectInternal.PROTECT_OPTIONS;
  assert.equal(opts.formatCells, false, 'formatCells locked');
  assert.equal(opts.insertRows, false);
  assert.equal(opts.deleteRows, false);
  assert.equal(opts.sort, true, 'sort allowed for read UX');
  assert.equal(opts.autoFilter, true);
});

test('protect: every workbook export gets a NEW random password (audit hash differs)', async () => {
  const a = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en', hmacKey: HMAC_KEY });
  const b = await exportQuote(makeQuote(), { variant: 'internal', lang: 'en', hmacKey: HMAC_KEY });
  assert.notEqual(a.auditMeta[0].wbPasswordHash, b.auditMeta[0].wbPasswordHash);
});
