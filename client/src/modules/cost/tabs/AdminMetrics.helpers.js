/**
 * AdminMetrics — pure parsing + scoring helpers. Extracted from
 * AdminMetrics.jsx so node --test can load them without a JSX
 * transform (same pattern as DecimalInput.helpers.js).
 *
 * Contracts:
 *   - parseMetricLine(line) → { name, labels, value } | null
 *   - parsePrometheus(text) → row[]
 *   - sumByLabel(rows, name, labelKey) → [key, sum][] (desc-sorted)
 *   - histogramSummary(rows, name) → per-route {count, sum, p50, p95, buckets}[]
 *   - computeHealth(summary) → 'alert' | 'warn' | 'ok' | 'idle'
 *
 * If the Prometheus exposition format changes (OpenMetrics migration)
 * or the threshold logic regresses, AdminMetrics.test.js catches the
 * breakage before it ships.
 */

// ── Alert thresholds ──
// Tuned for CCL's single-box deployment. If the traffic profile
// changes (e.g. a bulk-import route legitimately exceeds 1 s p95),
// adjust here; the banner + row highlighting in AdminMetrics.jsx both
// read from these constants.
export const P95_WARN_MS = 500;
export const P95_ALERT_MS = 1000;
export const ERROR_RATE_ALERT_PCT = 1;
export const ERROR_RATE_WARN_PCT = 0.5;

/**
 * Roll up a single "health" verdict from the per-metric summaries.
 * Priority is strict: red > yellow > green > idle. The UI uses this
 * as the banner color and label.
 *
 * @param {{ totalRequests:number, errorRate:number, slowRoutes:number,
 *           totalClientErrors:number, cspViolations:number }} s
 * @returns {'alert'|'warn'|'ok'|'idle'}
 */
export function computeHealth(s) {
  const totalRequests = Number(s?.totalRequests) || 0;
  const errorRate = Number(s?.errorRate) || 0;
  const slowRoutes = Number(s?.slowRoutes) || 0;
  const totalClientErrors = Number(s?.totalClientErrors) || 0;
  const cspViolations = Number(s?.cspViolations) || 0;
  if (errorRate >= ERROR_RATE_ALERT_PCT || slowRoutes > 0 || totalClientErrors > 0) return 'alert';
  if (errorRate >= ERROR_RATE_WARN_PCT || cspViolations > 0) return 'warn';
  return totalRequests > 0 ? 'ok' : 'idle';
}

/**
 * Parse one line of Prometheus exposition format.
 * Ignores `# HELP` / `# TYPE` / blank lines — returns null.
 * Shape: `name{k="v",…} 123` or `name 123`.
 */
export function parseMetricLine(line) {
  if (!line || line.startsWith('#')) return null;
  const m = line.match(
    /^([a-zA-Z_][a-zA-Z0-9_]*)(\{[^}]*\})?\s+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*$/
  );
  if (!m) return null;
  const [, name, labelsRaw, valueRaw] = m;
  const labels = {};
  if (labelsRaw) {
    // Strip `{` / `}` then split on top-level commas. Escape-aware
    // enough for our counter labels (no embedded quotes in practice).
    const inner = labelsRaw.slice(1, -1);
    for (const pair of inner.split(',')) {
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const k = pair.slice(0, eq).trim();
      let v = pair.slice(eq + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      labels[k] = v;
    }
  }
  return { name, labels, value: Number(valueRaw) };
}

export function parsePrometheus(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const m = parseMetricLine(line.trim());
    if (m) out.push(m);
  }
  return out;
}

export function sumByLabel(rows, name, labelKey) {
  const agg = new Map();
  for (const r of rows) {
    if (r.name !== name) continue;
    const k = r.labels[labelKey] ?? '(unlabeled)';
    agg.set(k, (agg.get(k) || 0) + r.value);
  }
  return [...agg.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Summarize a Prometheus histogram into per-route rows with
 * count / sum / p50 / p95. p50 and p95 use a linear lookup over the
 * cumulative buckets — adequate for the dashboard's "eyeball" use
 * case; a real Prom server would interpolate.
 */
export function histogramSummary(rows, name) {
  const buckets = rows.filter((r) => r.name === `${name}_bucket`);
  const sums = rows.filter((r) => r.name === `${name}_sum`);
  const counts = rows.filter((r) => r.name === `${name}_count`);
  const byRoute = new Map();
  for (const r of counts) {
    const key = `${r.labels.method || ''} ${r.labels.route || ''}`.trim();
    const agg = byRoute.get(key) || { count: 0, sum: 0, p50: null, p95: null, buckets: [] };
    agg.count += r.value;
    byRoute.set(key, agg);
  }
  for (const r of sums) {
    const key = `${r.labels.method || ''} ${r.labels.route || ''}`.trim();
    const agg = byRoute.get(key);
    if (agg) agg.sum += r.value;
  }
  for (const r of buckets) {
    const key = `${r.labels.method || ''} ${r.labels.route || ''}`.trim();
    const agg = byRoute.get(key);
    if (agg) agg.buckets.push({ le: Number(r.labels.le), v: r.value });
  }
  for (const agg of byRoute.values()) {
    agg.buckets.sort((a, b) => a.le - b.le);
    const pct = (p) => {
      if (!agg.count) return null;
      const target = agg.count * p;
      for (const b of agg.buckets) {
        if (b.v >= target) return b.le;
      }
      return agg.buckets.at(-1)?.le ?? null;
    };
    agg.p50 = pct(0.5);
    agg.p95 = pct(0.95);
  }
  return [...byRoute.entries()]
    .map(([route, agg]) => ({ route, ...agg }))
    .sort((a, b) => b.count - a.count);
}
