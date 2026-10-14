// @ts-check
/**
 * Prometheus-compat counters for pricing-snapshot freeze + warning
 * activity. Inspected from server-side after a quote save lands so the
 * dashboard at /metrics shows real-world adoption (synthesized vs
 * persisted ratio) and surfaces site_mismatch / library-drift warnings
 * without paging on every save.
 *
 * Counters emitted:
 *   pricing_snapshot_save_total{type, source, site}      — every quote save
 *   pricing_snapshot_warning_total{type, warning}        — _warnings on save
 *   pricing_snapshot_synth_save_total{type, site}        — synth subset (alarm signal)
 *
 * Helper is intentionally tolerant — a save with a malformed snapshot
 * still bumps `source=empty` so the counter never silently misses an
 * event. Audit failures must never block save (mirrors costApi.js
 * audit() try/catch pattern).
 */

import { inc } from '../utils/metrics.js';

/**
 * @param {any} snapshot
 * @returns {'persisted'|'synthesized'|'empty'}
 */
export function resolveSnapshotSource(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return 'empty';
  if (snapshot._synthesized === true) return 'synthesized';
  if (typeof snapshot._captured_at === 'string' && snapshot._captured_at.length > 0) {
    return 'persisted';
  }
  return 'empty';
}

/**
 * Inspect the saved quote and emit snapshot counters. Called from POST
 * /quotes + PATCH /quotes/:id after upsertQuote resolves. `type` comes
 * from the route (standard|complex). All inc() calls are wrapped — a
 * label-key encoding bug never blocks the save response.
 *
 * @param {{ type: 'standard'|'complex', state?: any, result?: any }} saved
 */
export function recordSnapshotSave(saved) {
  try {
    const type = saved?.type === 'complex' ? 'complex' : 'standard';
    const snap = saved?.state?.pricing_snapshot || null;
    const source = resolveSnapshotSource(snap);
    const site = (snap && typeof snap._site === 'string' && snap._site) || 'unknown';

    inc('pricing_snapshot_save_total', { type, source, site });
    if (source === 'synthesized') {
      inc('pricing_snapshot_synth_save_total', { type, site });
    }

    const warnings = Array.isArray(saved?.result?._warnings) ? saved.result._warnings : [];
    for (const w of warnings) {
      const wtype =
        (w && typeof w === 'object' && typeof w.type === 'string' && w.type) || 'unknown';
      inc('pricing_snapshot_warning_total', { type, warning: wtype });
    }
  } catch {
    /* metric failures must never block save */
  }
}
