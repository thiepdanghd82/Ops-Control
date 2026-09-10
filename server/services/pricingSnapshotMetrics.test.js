// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSnapshotSource, recordSnapshotSave } from './pricingSnapshotMetrics.js';
import { renderPrometheus, _resetMetrics } from '../utils/metrics.js';

test('resolveSnapshotSource — empty when null / non-object', () => {
  assert.equal(resolveSnapshotSource(null), 'empty');
  assert.equal(resolveSnapshotSource(undefined), 'empty');
  assert.equal(resolveSnapshotSource('string'), 'empty');
  assert.equal(resolveSnapshotSource({}), 'empty');
});

test('resolveSnapshotSource — synthesized when _synthesized=true', () => {
  assert.equal(resolveSnapshotSource({ _synthesized: true }), 'synthesized');
  assert.equal(
    resolveSnapshotSource({ _synthesized: true, _captured_at: '2026-06-10T00:00:00Z' }),
    'synthesized'
  );
});

test('resolveSnapshotSource — persisted when _captured_at is non-empty string', () => {
  assert.equal(resolveSnapshotSource({ _captured_at: '2026-06-10T00:00:00.000Z' }), 'persisted');
});

test('resolveSnapshotSource — empty when _captured_at empty / missing', () => {
  assert.equal(resolveSnapshotSource({ _captured_at: '' }), 'empty');
  assert.equal(resolveSnapshotSource({ _captured_at: null }), 'empty');
});

test('recordSnapshotSave — counter for persisted std save', () => {
  _resetMetrics();
  recordSnapshotSave({
    type: 'standard',
    state: {
      pricing_snapshot: {
        _captured_at: '2026-06-10T10:00:00.000Z',
        _captured_by: 'henry',
        _site: 'VN',
        _synthesized: false,
      },
    },
    result: {},
  });
  const out = renderPrometheus();
  assert.match(
    out,
    /pricing_snapshot_save_total\{site="VN",source="persisted",type="standard"\} 1/
  );
});

test('recordSnapshotSave — synthesized bumps both save_total + synth_save_total', () => {
  _resetMetrics();
  recordSnapshotSave({
    type: 'complex',
    state: {
      pricing_snapshot: {
        _synthesized: true,
        _site: 'VN',
      },
    },
    result: {},
  });
  const out = renderPrometheus();
  assert.match(
    out,
    /pricing_snapshot_save_total\{site="VN",source="synthesized",type="complex"\} 1/
  );
  assert.match(out, /pricing_snapshot_synth_save_total\{site="VN",type="complex"\} 1/);
});

test('recordSnapshotSave — null snapshot bumps source=empty, site=unknown', () => {
  _resetMetrics();
  recordSnapshotSave({ type: 'standard', state: {}, result: {} });
  const out = renderPrometheus();
  assert.match(
    out,
    /pricing_snapshot_save_total\{site="unknown",source="empty",type="standard"\} 1/
  );
});

test('recordSnapshotSave — warnings counter per warning type', () => {
  _resetMetrics();
  recordSnapshotSave({
    type: 'standard',
    state: {
      pricing_snapshot: {
        _captured_at: '2026-06-10T10:00:00.000Z',
        _site: 'VN',
        _synthesized: false,
      },
    },
    result: {
      _warnings: [
        { type: 'site_mismatch', message: 'snapshot under VN, state under India' },
        { type: 'site_mismatch', message: 'second instance' },
        { type: 'lib_drift', message: 'lib v3.1 vs snapshot v3.0' },
      ],
    },
  });
  const out = renderPrometheus();
  assert.match(out, /pricing_snapshot_warning_total\{type="standard",warning="site_mismatch"\} 2/);
  assert.match(out, /pricing_snapshot_warning_total\{type="standard",warning="lib_drift"\} 1/);
});

test('recordSnapshotSave — malformed warning entry counted as "unknown"', () => {
  _resetMetrics();
  recordSnapshotSave({
    type: 'standard',
    state: { pricing_snapshot: { _captured_at: '2026-06-10T00:00:00Z' } },
    result: {
      _warnings: ['not an object', null, { type: 42 }, { message: 'no type' }],
    },
  });
  const out = renderPrometheus();
  assert.match(out, /pricing_snapshot_warning_total\{type="standard",warning="unknown"\} 4/);
});

test('recordSnapshotSave — never throws even on garbage input', () => {
  _resetMetrics();
  assert.doesNotThrow(() => recordSnapshotSave(null));
  assert.doesNotThrow(() => recordSnapshotSave(undefined));
  assert.doesNotThrow(() => recordSnapshotSave({}));
  assert.doesNotThrow(() =>
    recordSnapshotSave({ type: 'standard', state: 'oops', result: 'oops' })
  );
});
