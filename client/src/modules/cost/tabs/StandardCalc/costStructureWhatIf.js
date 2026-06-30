/**
 * costStructureWhatIf — DISPLAY-ONLY what-if for the Cost Breakdown tab.
 *
 * Lets an operator toggle cost buckets off and see VA% / Contr% / GM% recompute
 * live, WITHOUT touching quote state / reducer / server / snapshot / exporter.
 * Shared by Standard (CalcCostBreakdown) and Complex (CplxCostBreakdown).
 *
 * Per-metric membership (decision A — faithful): a bucket is removed only from
 * the metrics whose canonical formula includes it. VA excludes labor; Contr
 * uses RUN-only labor; GM uses full labor + overhead + VAT loss.
 *   - Overhead → GM only           (VA/Contr unaffected)
 *   - Labor    → Contr (run) + GM (full)   (VA unaffected)
 *   - VAT Loss → GM only
 *   - Material / Ink / Tooling / Packing → all three
 *
 * EXACTNESS: recompute is anchored to the canonical cost numerators of `r`
 * (va: s_mat_cost+tooling+packing_ship; contr: +run labor; gm: s_ttl) and only
 * SUBTRACTS inactive buckets. So with all buckets active the result equals the
 * stored r.va / r.contribution / r.gm EXACTLY — including proc_extra, which
 * lives in s_ttl but has no toggleable row (summing visible buckets would miss
 * it). Unchecking a bucket subtracts precisely its metric amount.
 */
import { matCostExcludingInk, inkCostTotal } from '../../../../services/calcEngine.js';

// Order matches the Cost Structure rows. SGA is intentionally NOT here — it
// only affects gm_after_sga (out of scope) and stays non-toggleable.
export const TOGGLEABLE_KEYS = [
  'material',
  'ink',
  'overhead',
  'labor',
  'tooling',
  'packing',
  'vat',
];

/**
 * Per-bucket cost amount contributed to each metric + the display value shown
 * in the Cost Structure row. Labor differs per metric (see module docstring).
 * @param {object} r calcAll result for one tier
 */
export function buildBuckets(r) {
  const material = matCostExcludingInk(r);
  const ink = inkCostTotal(r);
  const overheadFull = (r.overhead || 0) + (r.bd_setup_mach || 0);
  const laborFull = (r.labor_cost || 0) + (r.bd_setup_labor || 0);
  const runLabor = r.labor_cost || 0; // calcAll already returns run-only labor
  const tooling = r.tooling || 0;
  const packing = r.packing_ship || 0;
  const vat = r.vat_loss || 0;
  return {
    material: { va: material, contr: material, gm: material, value: material },
    ink: { va: ink, contr: ink, gm: ink, value: ink },
    overhead: { va: 0, contr: 0, gm: overheadFull, value: overheadFull },
    labor: { va: 0, contr: runLabor, gm: laborFull, value: laborFull },
    tooling: { va: tooling, contr: tooling, gm: tooling, value: tooling },
    packing: { va: packing, contr: packing, gm: packing, value: packing },
    vat: { va: 0, contr: 0, gm: vat, value: vat },
  };
}

// Canonical cost numerators of r (the all-active cost side of each metric).
function canonicalCost(r) {
  const mats = r.s_mat_cost || 0;
  const tool = r.tooling || 0;
  const ps = r.packing_ship || 0;
  const runLabor = r.labor_cost || 0;
  return { va: mats + tool + ps, contr: mats + tool + ps + runLabor, gm: r.s_ttl || 0 };
}

/** A bucket is active unless the mask explicitly turns it off (default true). */
export function isBucketActive(mask, key) {
  return !mask || mask[key] !== false;
}

/**
 * Recompute VA / Contribution / GM at `price` from the active mask. Subtracts
 * the inactive buckets' per-metric amounts from the canonical numerator, so
 * all-active === canonical exactly. Returns nulls when price is non-positive.
 * @param {object} r      calcAll result for the tier
 * @param {object} mask   { [key]: false } for inactive buckets; missing = active
 * @param {number} price  selling or target price for this tier
 */
export function recomputeKpi(r, mask, price) {
  if (!r || !price || price <= 0) return { va: null, contribution: null, gm: null };
  const base = canonicalCost(r);
  const buckets = buildBuckets(r);
  let va = base.va;
  let contr = base.contr;
  let gm = base.gm;
  for (const k of TOGGLEABLE_KEYS) {
    if (isBucketActive(mask, k)) continue;
    va -= buckets[k].va;
    contr -= buckets[k].contr;
    gm -= buckets[k].gm;
  }
  return { va: 1 - va / price, contribution: 1 - contr / price, gm: 1 - gm / price };
}

// ── sessionStorage mask (per-quote; NEVER the quote state / reducer / server) ──
const MASK_STORE = 'ops-cb-whatif-mask-v1';

function readStore() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(MASK_STORE) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

/** Read the active-mask for a quote ({} = all active). Falsy id → 'draft'. */
export function readMask(quoteId) {
  const key = quoteId != null ? String(quoteId) : 'draft';
  const m = readStore()[key];
  return m && typeof m === 'object' ? m : {};
}

/** Persist the mask for a quote into sessionStorage only. */
export function writeMask(quoteId, mask) {
  const key = quoteId != null ? String(quoteId) : 'draft';
  try {
    sessionStorage.setItem(MASK_STORE, JSON.stringify({ ...readStore(), [key]: mask || {} }));
  } catch {
    /* sessionStorage unavailable (private mode / quota) — what-if is ephemeral */
  }
}
