/**
 * Smoke test for the perf-budget CLI. Proves the failure gate actually
 * fails — if someone "optimizes" the script and breaks the non-zero
 * exit on over-budget chunks, `npm run verify` would silently pass
 * while budgets drift. This test spawns the real CLI with a tmp dist
 * directory so the contract is end-to-end verified.
 *
 * Separate from check-perf-budget.test.js which covers the pure
 * decision logic; this one locks the CLI exit-code + stdout contract.
 *
 * Runner: node --test scripts/check-perf-budget.smoke.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, 'check-perf-budget.js');

/** Create a tmp dir with faked dist/assets/ containing the given files. */
function setupTmpDist(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-perf-smoke-'));
  const assets = path.join(dir, 'assets');
  fs.mkdirSync(assets, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) {
    fs.writeFileSync(path.join(assets, name), 'x'.repeat(bytes));
  }
  return assets;
}

function runCli(distDir, extraArgs = []) {
  return spawnSync('node', [SCRIPT, ...extraArgs], {
    env: { ...process.env, OPS_DIST_DIR: distDir },
    encoding: 'utf-8',
  });
}

test('perf-budget CLI: all chunks under budget → exit 0', () => {
  // Small fake index.js well under the 290kB budget.
  const dist = setupTmpDist({ 'index-AbCd1234.js': 50_000 });
  const r = runCli(dist);
  assert.equal(
    r.status,
    0,
    `expected exit 0, got ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
  );
  assert.match(r.stdout, /within budget/);
});

test('perf-budget CLI: chunk over budget → exit 1 with failure line', () => {
  // 400kB index.js — exceeds the 290kB shell budget.
  const dist = setupTmpDist({ 'index-XyZ00001.js': 400_000 });
  const r = runCli(dist);
  assert.equal(r.status, 1, 'over-budget must exit non-zero');
  assert.match(r.stdout, /FAILED/);
  assert.match(r.stdout, /index-XyZ00001\.js/);
  // Report carries the over_by math — catches formatting regressions.
  assert.match(r.stdout, /\+\d+\.\d+ kB/);
});

test('perf-budget CLI: warn threshold triggers ⚠️ but still exits 0', () => {
  // 95% of the 100kB ComplexCalc budget → near threshold (warn only).
  const dist = setupTmpDist({ 'ComplexCalc-XyZ12345.js': 95_000 });
  const r = runCli(dist);
  assert.equal(r.status, 0, 'near-budget must still pass');
  assert.match(r.stdout, /Near budget/);
  assert.match(r.stdout, /ComplexCalc/);
});

test('perf-budget CLI: --json flag emits valid JSON report', () => {
  const dist = setupTmpDist({
    'index-AbCd1234.js': 50_000,
    'ComplexCalc-XyZ12345.js': 50_000,
  });
  const r = runCli(dist, ['--json']);
  assert.equal(r.status, 0);
  // Report is valid JSON with the expected structure.
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.chunk_count, 2);
  assert.equal(parsed.total_bytes, 100_000);
  assert.ok(Array.isArray(parsed.failures));
  assert.ok(Array.isArray(parsed.warnings));
  assert.ok(Array.isArray(parsed.ok));
});

test('perf-budget CLI: missing dist dir → exit 1 with guidance', () => {
  // Point at a path that definitely doesn't exist.
  const r = runCli(path.join(os.tmpdir(), 'ops-perf-missing-' + Date.now()));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Run `npm run build` first/);
});

test('perf-budget CLI: chunk without explicit budget uses global cap', () => {
  // 210kB chunk for a prefix with no rule — fails the 200kB global cap.
  const dist = setupTmpDist({ 'RandomTab-XyZ12345.js': 210_000 });
  const r = runCli(dist);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /global cap/);
  assert.match(r.stdout, /RandomTab/);
});
