/**
 * Tests for scripts/import-fallback-xlsx.js — Rollback Runbook B
 * re-import flow. Covers: empty file, dry-run, commit with mock fetch,
 * mixed valid+invalid rows, planning-disabled WO skip.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import XLSX from 'xlsx';
import { runImport } from './import-fallback-xlsx.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-fallback-test-'));

// ── xlsx fixture helpers ──────────────────────────────────────────

const QUOTE_HEADERS = ['RFQ-ID', 'Customer', 'CCL_PN', 'MOQ', 'Quote Date', 'Sales-Rep', 'Notes'];
const WO_HEADERS = [
  'WO-ID',
  'RFQ-ID',
  'Customer',
  'CCL_PN',
  'Qty Planned',
  'UOM',
  'Priority',
  'Due Date',
  'Status',
  'Notes',
];

function writeXlsx(filename, headers, rows) {
  const sheet = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(sheet);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fallback');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const file = path.join(tmpDir, filename);
  fs.writeFileSync(file, buf);
  return file;
}

function validQuoteRow(rfq) {
  // Order matches QUOTE_HEADERS exactly
  return [rfq, 'CCL Hai Phong', 'CCL-12345', 1000, '2026-06-09', 'Hana', `notes for ${rfq}`];
}

function validWoRow(woId) {
  return [
    woId,
    'RFQ-2026-S0001',
    'CCL Hai Phong',
    'CCL-12345',
    5000,
    'pcs',
    5,
    '2026-06-20',
    'CREATED',
    `notes ${woId}`,
  ];
}

// ── stdout/stderr capture + fetch mock ────────────────────────────

function capture(fn) {
  const stdout = [];
  const stderr = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args) => stdout.push(args.map(String).join(' '));
  console.error = (...args) => stderr.push(args.map(String).join(' '));
  const restore = () => {
    console.log = origLog;
    console.error = origErr;
  };
  return { stdout, stderr, restore, run: fn };
}

function mockFetch(responder) {
  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return responder(url, opts);
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = origFetch;
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────

test('empty xlsx → no rows to import, exit 0', async () => {
  const file = writeXlsx('empty.xlsx', QUOTE_HEADERS, []);
  const cap = capture();
  let code;
  try {
    code = await runImport(['--dry-run', `--quotes=${file}`], {});
  } finally {
    cap.restore();
  }
  assert.equal(code, 0, 'exit code should be 0');
  const all = cap.stdout.join('\n');
  assert.match(all, /no rows to import/i);
});

test('5 valid quote rows + --dry-run → 5 "would POST" log lines, no fetch calls', async () => {
  const rows = [1, 2, 3, 4, 5].map((n) => validQuoteRow(`RFQ-2026-S000${n}`));
  const file = writeXlsx('valid5.xlsx', QUOTE_HEADERS, rows);
  const fetchSpy = mockFetch(() => {
    throw new Error('fetch should NOT be called in dry-run mode');
  });
  const cap = capture();
  let code;
  try {
    code = await runImport(['--dry-run', `--quotes=${file}`], {});
  } finally {
    cap.restore();
    fetchSpy.restore();
  }
  assert.equal(code, 0);
  assert.equal(fetchSpy.calls.length, 0, 'dry-run must not call fetch');
  const dryRunLines = cap.stdout.filter((l) => l.includes('[dry-run]'));
  assert.equal(dryRunLines.length, 5, `expected 5 dry-run lines, got ${dryRunLines.length}`);
  // Summary line check
  const summary = cap.stdout.join('\n');
  assert.match(summary, /Imported:\s*5/);
  assert.match(summary, /Failed:\s*0/);
});

test('5 valid quote rows + --commit + mock 200 OK → 5 POSTs to /api/quotes', async () => {
  const rows = [1, 2, 3, 4, 5].map((n) => validQuoteRow(`RFQ-2026-S010${n}`));
  const file = writeXlsx('commit5.xlsx', QUOTE_HEADERS, rows);
  const fetchSpy = mockFetch(async () => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({ ok: true }),
  }));
  const cap = capture();
  let code;
  try {
    code = await runImport(
      ['--commit', `--quotes=${file}`, '--api=http://mock', '--token=fake-token'],
      {}
    );
  } finally {
    cap.restore();
    fetchSpy.restore();
  }
  assert.equal(code, 0);
  assert.equal(fetchSpy.calls.length, 5, `expected 5 POSTs, got ${fetchSpy.calls.length}`);
  // All to /api/quotes
  for (const call of fetchSpy.calls) {
    assert.ok(call.url.endsWith('/api/quotes'), `url ${call.url} should end with /api/quotes`);
    assert.equal(call.opts.method, 'POST');
    assert.equal(call.opts.headers['Authorization'], 'Bearer fake-token');
    assert.match(call.opts.headers['Idempotency-Key'], /^fallback-import-commit5\.xlsx-\d+$/);
    const body = JSON.parse(call.opts.body);
    assert.equal(body.type, 'standard');
    assert.match(body.label, /RFQ-2026-S010\d/);
  }
});

test('mixed valid + invalid quote rows → only valid imported, invalid logged with reject reasons', async () => {
  // 3 valid + 2 invalid (missing required fields)
  const rows = [
    validQuoteRow('RFQ-2026-S0201'),
    ['', 'CCL', 'PN', 100, '2026-06-09', 'Sales', 'missing RFQ-ID'], // invalid
    validQuoteRow('RFQ-2026-S0202'),
    ['RFQ-2026-S0203', '', '', '', '', '', 'missing 5 fields'], // invalid
    validQuoteRow('RFQ-2026-S0204'),
  ];
  const file = writeXlsx('mixed.xlsx', QUOTE_HEADERS, rows);
  const cap = capture();
  let code;
  try {
    code = await runImport(['--dry-run', `--quotes=${file}`], {});
  } finally {
    cap.restore();
  }
  assert.equal(code, 0);
  const out = cap.stdout.join('\n');
  const err = cap.stderr.join('\n');
  assert.match(out, /Imported:\s*3/, `expected 3 imported, got: ${out}`);
  assert.match(out, /Failed:\s*2/);
  assert.match(err, /mixed\.xlsx:3 quote missing: RFQ-ID/);
  assert.match(err, /mixed\.xlsx:5 quote missing:/);
});

test('--workorders with OPS_FEATURE_PLANNING=0 → skipped with note', async () => {
  const woFile = writeXlsx('wos.xlsx', WO_HEADERS, [
    validWoRow('WO-2026-001'),
    validWoRow('WO-2026-002'),
  ]);
  const fetchSpy = mockFetch(() => {
    throw new Error('fetch should NOT be called when planning disabled');
  });
  const cap = capture();
  let code;
  try {
    code = await runImport(
      ['--dry-run', `--workorders=${woFile}`],
      { OPS_FEATURE_PLANNING: '0' } // explicit disable
    );
  } finally {
    cap.restore();
    fetchSpy.restore();
  }
  assert.equal(code, 0);
  assert.equal(fetchSpy.calls.length, 0, 'must not fetch when planning disabled');
  const out = cap.stdout.join('\n');
  assert.match(out, /OPS_FEATURE_PLANNING=0.*work orders skipped/);
  // Imported should be 0 since WO file was skipped entirely
  assert.match(out, /Imported:\s*0/);
});
