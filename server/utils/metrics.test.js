/**
 * metrics — tests for Phase 9M.2 + 9N.3.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { inc, observeLatency, renderPrometheus, _resetMetrics } from './metrics.js';

test('inc increments counter', () => {
  _resetMetrics();
  inc('foo_total');
  inc('foo_total');
  inc('foo_total', {}, 3);
  const out = renderPrometheus();
  assert.ok(out.includes('foo_total 5'));
  assert.ok(out.includes('# TYPE foo_total counter'));
});

test('inc with labels distinguishes series', () => {
  _resetMetrics();
  inc('http_requests_total', { method: 'GET', status: '200' });
  inc('http_requests_total', { method: 'GET', status: '200' });
  inc('http_requests_total', { method: 'POST', status: '400' });
  const out = renderPrometheus();
  assert.ok(out.includes('http_requests_total{method="GET",status="200"} 2'));
  assert.ok(out.includes('http_requests_total{method="POST",status="400"} 1'));
});

test('observeLatency fills buckets cumulatively in Prometheus output', () => {
  _resetMetrics();
  observeLatency('req_latency_ms', 3);
  observeLatency('req_latency_ms', 40);
  observeLatency('req_latency_ms', 800);
  observeLatency('req_latency_ms', 20000);
  const out = renderPrometheus();
  assert.ok(out.includes('req_latency_ms_bucket{le="5"} 1'));
  assert.ok(out.includes('req_latency_ms_bucket{le="50"} 2'));
  assert.ok(out.includes('req_latency_ms_bucket{le="1000"} 3'));
  assert.ok(out.includes('req_latency_ms_bucket{le="+Inf"} 4'));
  assert.ok(out.includes('req_latency_ms_sum 20843'));
  assert.ok(out.includes('req_latency_ms_count 4'));
});

test('empty state renders a valid header with no series', () => {
  _resetMetrics();
  const out = renderPrometheus();
  assert.ok(out.startsWith('# Ops Control metrics'));
  assert.ok(out.endsWith('\n'));
});

test('label values with double-quotes are escaped', () => {
  _resetMetrics();
  inc('events_total', { reason: 'bad "quoted" input' });
  const out = renderPrometheus();
  assert.ok(out.includes('reason="bad \\"quoted\\" input"'));
});

test('deprecated_calls_total use-case (9M.2)', () => {
  _resetMetrics();
  inc('deprecated_calls_total', { endpoint: '/api/shared/approval/transition' });
  inc('deprecated_calls_total', { endpoint: '/api/shared/approval/transition' });
  inc('deprecated_calls_total', { endpoint: '/api/shared/approval/transition' });
  const out = renderPrometheus();
  assert.ok(out.includes('deprecated_calls_total{endpoint="/api/shared/approval/transition"} 3'));
});
