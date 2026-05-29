/**
 * AdminMetrics — parser tests. Locks in the shape of each helper so
 * a future Prometheus format tweak can't silently break the admin
 * metrics dashboard.
 *
 * Covers:
 *   - parseMetricLine: counter, labeled counter, histogram bucket,
 *     comments, empty, garbage, quoted label values, scientific
 *     notation, negative values.
 *   - parsePrometheus: real /metrics text → row[] with correct count.
 *   - sumByLabel: aggregation by a specific label, sorted desc,
 *     unlabeled fallback.
 *   - histogramSummary: p50/p95 derivation from cumulative buckets,
 *     multiple routes, zero-count route fallback.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMetricLine,
  parsePrometheus,
  sumByLabel,
  histogramSummary,
  computeHealth,
  P95_ALERT_MS,
  ERROR_RATE_ALERT_PCT,
  ERROR_RATE_WARN_PCT,
} from './AdminMetrics.helpers.js';

// ── parseMetricLine ──

test('parseMetricLine: ignores # HELP / # TYPE / blank lines', () => {
  assert.equal(parseMetricLine(''), null);
  assert.equal(parseMetricLine('# HELP http_requests_total Count of HTTP requests'), null);
  assert.equal(parseMetricLine('# TYPE http_requests_total counter'), null);
});

test('parseMetricLine: unlabeled counter', () => {
  const r = parseMetricLine('uptime_seconds 3600');
  assert.deepEqual(r, { name: 'uptime_seconds', labels: {}, value: 3600 });
});

test('parseMetricLine: single-label counter', () => {
  const r = parseMetricLine('http_requests_total{status="2xx"} 42');
  assert.equal(r.name, 'http_requests_total');
  assert.deepEqual(r.labels, { status: '2xx' });
  assert.equal(r.value, 42);
});

test('parseMetricLine: multi-label counter', () => {
  const r = parseMetricLine('http_requests_total{method="GET",route="/api/foo",status="2xx"} 100');
  assert.deepEqual(r.labels, { method: 'GET', route: '/api/foo', status: '2xx' });
  assert.equal(r.value, 100);
});

test('parseMetricLine: negative and float values', () => {
  assert.equal(parseMetricLine('gauge_temp -3.14')?.value, -3.14);
  assert.equal(parseMetricLine('ratio 0.5')?.value, 0.5);
});

test('parseMetricLine: scientific notation value', () => {
  assert.equal(parseMetricLine('big_total 1.5e+10')?.value, 1.5e10);
  assert.equal(parseMetricLine('tiny 2e-3')?.value, 0.002);
});

test('parseMetricLine: histogram bucket with le label', () => {
  const r = parseMetricLine('http_request_duration_ms_bucket{route="/api/foo",le="100"} 50');
  assert.equal(r.name, 'http_request_duration_ms_bucket');
  assert.equal(r.labels.le, '100');
  assert.equal(r.labels.route, '/api/foo');
  assert.equal(r.value, 50);
});

test('parseMetricLine: strips quotes from label values', () => {
  const r = parseMetricLine('x{boundary="Cost → standard"} 1');
  assert.equal(r.labels.boundary, 'Cost → standard');
});

test('parseMetricLine: garbage input returns null', () => {
  assert.equal(parseMetricLine('not a metric'), null);
  assert.equal(parseMetricLine('no_value'), null);
  assert.equal(parseMetricLine('{labels_only="yes"} 1'), null);
});

test('parseMetricLine: name must start with letter or underscore', () => {
  // Prometheus spec: metric name regex is [a-zA-Z_][a-zA-Z0-9_]*
  assert.equal(parseMetricLine('1_starts_with_digit 1'), null);
});

// ── parsePrometheus ──

test('parsePrometheus: parses a realistic /metrics payload', () => {
  const text = [
    '# HELP http_requests_total Count',
    '# TYPE http_requests_total counter',
    'http_requests_total{method="GET",route="/health",status="2xx"} 120',
    'http_requests_total{method="POST",route="/api/save",status="5xx"} 3',
    '',
    '# TYPE client_errors_total counter',
    'client_errors_total{boundary="Cost → standard"} 5',
    'client_errors_total{boundary="Chat"} 1',
  ].join('\n');
  const rows = parsePrometheus(text);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].name, 'http_requests_total');
  assert.equal(rows[2].labels.boundary, 'Cost → standard');
});

test('parsePrometheus: empty / null / undefined text → []', () => {
  assert.deepEqual(parsePrometheus(''), []);
  assert.deepEqual(parsePrometheus(null), []);
  assert.deepEqual(parsePrometheus(undefined), []);
});

test('parsePrometheus: tolerates CRLF line endings', () => {
  const text = 'a 1\r\nb 2\r\n';
  const rows = parsePrometheus(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'a');
});

// ── sumByLabel ──

test('sumByLabel: aggregates by label, sorts desc by count', () => {
  const rows = [
    { name: 'http_requests_total', labels: { status: '2xx' }, value: 100 },
    { name: 'http_requests_total', labels: { status: '2xx' }, value: 50 },
    { name: 'http_requests_total', labels: { status: '5xx' }, value: 10 },
    { name: 'other_metric', labels: { status: '2xx' }, value: 999 }, // ignored
  ];
  const result = sumByLabel(rows, 'http_requests_total', 'status');
  assert.deepEqual(result, [
    ['2xx', 150],
    ['5xx', 10],
  ]);
});

test('sumByLabel: missing label key falls back to "(unlabeled)"', () => {
  const rows = [
    { name: 'x', labels: { other_key: 'a' }, value: 5 },
    { name: 'x', labels: {}, value: 3 },
  ];
  const result = sumByLabel(rows, 'x', 'missing_label');
  assert.deepEqual(result, [['(unlabeled)', 8]]);
});

test('sumByLabel: empty input → empty array', () => {
  assert.deepEqual(sumByLabel([], 'http_requests_total', 'status'), []);
});

// ── histogramSummary ──

test('histogramSummary: derives p50/p95 from cumulative buckets', () => {
  // Route "GET /api/foo" has 100 total requests. Cumulative buckets:
  // le=10 → 20, le=50 → 60, le=100 → 95, le=1000 → 100.
  // p50 (target 50): first bucket whose cumulative >= 50 → le=50.
  // p95 (target 95): first bucket whose cumulative >= 95 → le=100.
  const rows = [
    {
      name: 'http_request_duration_ms_count',
      labels: { method: 'GET', route: '/api/foo' },
      value: 100,
    },
    {
      name: 'http_request_duration_ms_sum',
      labels: { method: 'GET', route: '/api/foo' },
      value: 5000,
    },
    {
      name: 'http_request_duration_ms_bucket',
      labels: { method: 'GET', route: '/api/foo', le: '10' },
      value: 20,
    },
    {
      name: 'http_request_duration_ms_bucket',
      labels: { method: 'GET', route: '/api/foo', le: '50' },
      value: 60,
    },
    {
      name: 'http_request_duration_ms_bucket',
      labels: { method: 'GET', route: '/api/foo', le: '100' },
      value: 95,
    },
    {
      name: 'http_request_duration_ms_bucket',
      labels: { method: 'GET', route: '/api/foo', le: '1000' },
      value: 100,
    },
  ];
  const summary = histogramSummary(rows, 'http_request_duration_ms');
  assert.equal(summary.length, 1);
  assert.equal(summary[0].route, 'GET /api/foo');
  assert.equal(summary[0].count, 100);
  assert.equal(summary[0].sum, 5000);
  assert.equal(summary[0].p50, 50);
  assert.equal(summary[0].p95, 100);
});

test('histogramSummary: multiple routes, sorted by count desc', () => {
  const rows = [
    { name: 'lat_count', labels: { method: 'GET', route: '/a' }, value: 10 },
    { name: 'lat_sum', labels: { method: 'GET', route: '/a' }, value: 100 },
    { name: 'lat_bucket', labels: { method: 'GET', route: '/a', le: '50' }, value: 10 },
    { name: 'lat_count', labels: { method: 'POST', route: '/b' }, value: 200 },
    { name: 'lat_sum', labels: { method: 'POST', route: '/b' }, value: 8000 },
    { name: 'lat_bucket', labels: { method: 'POST', route: '/b', le: '100' }, value: 200 },
  ];
  const summary = histogramSummary(rows, 'lat');
  assert.equal(summary.length, 2);
  assert.equal(summary[0].route, 'POST /b', 'higher count should sort first');
  assert.equal(summary[0].count, 200);
  assert.equal(summary[1].route, 'GET /a');
});

test('histogramSummary: zero-count route yields null p50/p95 (no divide by 0)', () => {
  const rows = [
    { name: 'lat_count', labels: { method: 'GET', route: '/empty' }, value: 0 },
    { name: 'lat_bucket', labels: { method: 'GET', route: '/empty', le: '10' }, value: 0 },
  ];
  const summary = histogramSummary(rows, 'lat');
  assert.equal(summary.length, 1);
  assert.equal(summary[0].count, 0);
  assert.equal(summary[0].p50, null);
  assert.equal(summary[0].p95, null);
});

test('histogramSummary: missing histogram name returns empty', () => {
  const rows = [{ name: 'unrelated_counter', labels: {}, value: 42 }];
  assert.deepEqual(histogramSummary(rows, 'no_such_metric'), []);
});

// ── computeHealth: verdict priority + thresholds ──

test('computeHealth: idle when no traffic', () => {
  assert.equal(
    computeHealth({
      totalRequests: 0,
      errorRate: 0,
      slowRoutes: 0,
      totalClientErrors: 0,
      cspViolations: 0,
    }),
    'idle'
  );
});

test('computeHealth: ok when traffic exists and all thresholds clean', () => {
  assert.equal(
    computeHealth({
      totalRequests: 1000,
      errorRate: 0.1,
      slowRoutes: 0,
      totalClientErrors: 0,
      cspViolations: 0,
    }),
    'ok'
  );
});

test('computeHealth: warn when error rate crosses warn threshold', () => {
  // Exactly at the warn boundary → warn (inclusive on `>=`).
  assert.equal(
    computeHealth({
      totalRequests: 1000,
      errorRate: ERROR_RATE_WARN_PCT,
      slowRoutes: 0,
      totalClientErrors: 0,
      cspViolations: 0,
    }),
    'warn'
  );
  // Just below the alert boundary → still warn.
  assert.equal(
    computeHealth({
      totalRequests: 1000,
      errorRate: ERROR_RATE_ALERT_PCT - 0.01,
      slowRoutes: 0,
      totalClientErrors: 0,
      cspViolations: 0,
    }),
    'warn'
  );
});

test('computeHealth: alert when error rate crosses alert threshold', () => {
  assert.equal(
    computeHealth({
      totalRequests: 1000,
      errorRate: ERROR_RATE_ALERT_PCT,
      slowRoutes: 0,
      totalClientErrors: 0,
      cspViolations: 0,
    }),
    'alert'
  );
});

test('computeHealth: alert when any route is slow (p95 ≥ alert)', () => {
  // Low error rate but 1 slow route → alert. The slowRoutes count
  // is pre-computed by the caller (filters latency rows with p95 >=
  // P95_ALERT_MS), so the helper just sees the rollup count.
  assert.equal(
    computeHealth({
      totalRequests: 1000,
      errorRate: 0,
      slowRoutes: 1,
      totalClientErrors: 0,
      cspViolations: 0,
    }),
    'alert'
  );
});

test('computeHealth: alert when any client crash reported', () => {
  assert.equal(
    computeHealth({
      totalRequests: 1000,
      errorRate: 0,
      slowRoutes: 0,
      totalClientErrors: 1,
      cspViolations: 0,
    }),
    'alert'
  );
});

test('computeHealth: warn when only CSP violations present', () => {
  // CSP on its own is warn (misconfigured inline handler) — but error
  // rate and client crashes always escalate to alert first.
  assert.equal(
    computeHealth({
      totalRequests: 1000,
      errorRate: 0,
      slowRoutes: 0,
      totalClientErrors: 0,
      cspViolations: 3,
    }),
    'warn'
  );
});

test('computeHealth: alert priority over warn when both signals present', () => {
  // Client crash + CSP violation + high error rate: alert wins.
  // This locks the priority ordering — regressing it would downgrade
  // a real incident to a warn banner.
  assert.equal(
    computeHealth({
      totalRequests: 1000,
      errorRate: ERROR_RATE_ALERT_PCT,
      slowRoutes: 2,
      totalClientErrors: 5,
      cspViolations: 10,
    }),
    'alert'
  );
});

test('computeHealth: garbage input defaults to idle, does not throw', () => {
  // null / undefined / {} must not crash the banner. We treat missing
  // numbers as 0 so the banner resolves to idle rather than exploding.
  assert.equal(computeHealth(null), 'idle');
  assert.equal(computeHealth(undefined), 'idle');
  assert.equal(computeHealth({}), 'idle');
});

test('computeHealth: ignores non-numeric fields', () => {
  // Defensive against a caller passing the wrong shape — coerces
  // strings to numbers via Number() || 0.
  assert.equal(
    computeHealth({
      totalRequests: 'not a number',
      errorRate: null,
      slowRoutes: undefined,
      totalClientErrors: 'bad',
      cspViolations: {},
    }),
    'idle'
  );
});

test('P95_ALERT_MS is exported and sane (> warn)', () => {
  // Spot-check the exported constant so a typo doesn't flip the
  // threshold relationship silently.
  assert.ok(P95_ALERT_MS > 500, 'alert threshold must exceed 500 ms');
});
