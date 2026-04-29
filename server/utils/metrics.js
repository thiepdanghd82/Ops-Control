/**
 * metrics — lightweight Prometheus-compatible counter + histogram
 * store. Zero-deps (no prom-client needed yet); sufficient for Phase
 * 9M.2 deprecation counters + 9N.3 request-latency histograms.
 *
 * Why not prom-client: (a) another dep to pin/patch, (b) the code
 * surface we need fits in ~100 lines, (c) Prometheus exposition
 * format is stable and well-specified. When observability grows past
 * 5-6 metric series, swap this for prom-client and change the two
 * call sites in server/index.js + this file's re-exports.
 *
 * Exported API:
 *   inc(name, labels?, delta=1)     — bump counter
 *   observeLatency(name, ms, labels?) — record in histogram buckets
 *   renderPrometheus()              — text/plain exposition format
 *   _resetMetrics()                 — test hook
 */

const COUNTERS = new Map();   // key: `name|labelKey` → number
const HISTOGRAMS = new Map(); // key: `name|labelKey` → { buckets: number[], sum: number, count: number, labels }

const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

function escapeLabelValue(v) {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

// Map-key encoding uses unit-separator (\x1f) between fields so raw
// label values can contain commas, '=', or quotes without colliding
// with the encoding — and importantly, are NOT pre-escaped. Escaping
// happens once at render time in formatLabels(). A previous version
// escaped here too, leaking `\"` double-escapes into Prometheus output.
function labelKey(labels) {
  if (!labels) return '';
  const pairs = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return pairs.map(([k, v]) => `${k}\x1e${String(v)}`).join('\x1f');
}

function formatLabels(labels) {
  if (!labels || Object.keys(labels).length === 0) return '';
  const pairs = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  return '{' + pairs.map(([k, v]) => `${k}="${escapeLabelValue(String(v))}"`).join(',') + '}';
}

export function inc(name, labels = {}, delta = 1) {
  const key = `${name}|${labelKey(labels)}`;
  COUNTERS.set(key, (COUNTERS.get(key) || 0) + delta);
}

export function observeLatency(name, ms, labels = {}) {
  const key = `${name}|${labelKey(labels)}`;
  let h = HISTOGRAMS.get(key);
  if (!h) {
    h = {
      buckets: new Array(LATENCY_BUCKETS_MS.length + 1).fill(0),
      sum: 0, count: 0, labels,
    };
    HISTOGRAMS.set(key, h);
  }
  // Cumulative bucket fill (Prometheus spec): a sample at 40ms goes
  // into le=50, 100, 250, …, +Inf — not just the first matching bucket.
  for (let i = 0; i < LATENCY_BUCKETS_MS.length; i++) {
    if (ms <= LATENCY_BUCKETS_MS[i]) h.buckets[i]++;
  }
  h.buckets[LATENCY_BUCKETS_MS.length]++; // +Inf always increments
  h.sum += ms;
  h.count++;
}

function parseLabelKey(lk) {
  const out = {};
  if (!lk) return out;
  for (const part of lk.split('\x1f')) {
    const eq = part.indexOf('\x1e');
    if (eq > 0) out[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return out;
}

export function renderPrometheus() {
  const lines = [`# Ops Control metrics (generated ${new Date().toISOString()})`];

  const counterNames = new Set();
  for (const key of COUNTERS.keys()) counterNames.add(key.split('|', 1)[0]);
  for (const name of counterNames) {
    lines.push(`# TYPE ${name} counter`);
    for (const [key, val] of COUNTERS) {
      const [nm, lk] = key.split('|', 2);
      if (nm !== name) continue;
      const labels = lk ? parseLabelKey(lk) : {};
      lines.push(`${name}${formatLabels(labels)} ${val}`);
    }
  }

  const histNames = new Set();
  for (const key of HISTOGRAMS.keys()) histNames.add(key.split('|', 1)[0]);
  for (const name of histNames) {
    lines.push(`# TYPE ${name} histogram`);
    for (const [, h] of HISTOGRAMS) {
      for (let i = 0; i < LATENCY_BUCKETS_MS.length; i++) {
        const lbl = { ...h.labels, le: String(LATENCY_BUCKETS_MS[i]) };
        lines.push(`${name}_bucket${formatLabels(lbl)} ${h.buckets[i]}`);
      }
      const lblInf = { ...h.labels, le: '+Inf' };
      lines.push(`${name}_bucket${formatLabels(lblInf)} ${h.buckets[LATENCY_BUCKETS_MS.length]}`);
      lines.push(`${name}_sum${formatLabels(h.labels)} ${h.sum}`);
      lines.push(`${name}_count${formatLabels(h.labels)} ${h.count}`);
    }
  }

  return lines.join('\n') + '\n';
}

export function _resetMetrics() {
  COUNTERS.clear();
  HISTOGRAMS.clear();
}
