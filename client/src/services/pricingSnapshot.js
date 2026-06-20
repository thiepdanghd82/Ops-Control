/**
 * Pricing snapshot foundation — Phase 1 of fixing the calcEngine
 * recompute drift bug.
 *
 * Bug background: quote.state today does NOT embed pricing parameters
 * (material rates, ink coverage, workcenter labor/overhead/machine
 * rates). calcEngine reads master `lib.*` at calc time, so any old
 * quote re-opened after the master library shifts produces a different
 * cost — operationally invisible until an auditor compares the saved
 * `quote.result.s_ttl` against today's recompute and finds a discrepancy.
 * Compliance + audit-trail bug for any quote re-opened post-rate-change.
 *
 * Phase 1 (this file) — pure helpers only, ZERO calcEngine wiring:
 *   - createEmptySnapshot() — canonical shape, used by defaults +
 *     heal-on-read migration
 *   - freezeLib(lib, state) — captures the rows ACTUALLY USED by the
 *     quote (Std + Cpx walks materials + processes cross-subproducts)
 *     so the snapshot stays compact instead of cloning the whole
 *     master library
 *   - snapshotPricingParams(state, lib) — resolver: persisted snapshot
 *     wins; otherwise synthesizes from lib (legacy quote path) marking
 *     `_synthesized: true` so Phase 2 calcEngine can flag the audit
 *     gap; finally falls back to empty
 *   - getMatFromSnapshot / getRateFromSnapshot / getCoverageFromSnapshot
 *     / getSnapshotSite — accessor parity with calcEngine.getMatByCode
 *     / getRateByWC pattern so Phase 2 wiring is a 1-line swap
 *
 * Architecture notes (per 2026-06-10 site-aware audit):
 *   - `lib.rate` arriving here is ALREADY pre-filtered by activeSite at
 *     [CostLibContext.jsx] — we DO NOT need multi-site lookup logic.
 *     freezeLib just reads `lib.rate` direct, same as calcEngine does.
 *   - `state.site` is captured as `_site` audit metadata so Phase 2 can
 *     detect "snapshot was VN-frozen, operator later flipped to India"
 *     mismatches.
 *
 * Pattern reference: Sprint S-D21-LEADTIME `safeLeadTime()` heal-on-read.
 * For additive-only fields we DO NOT bump `_schema_version` — heal in
 * the existing migration walk + defaults in createStdState /
 * createCplxState is sufficient (PR #110 precedent).
 */

/**
 * Canonical pricing-snapshot shape. Used by:
 *   - createStdState / createEmptyStdState / createCplxState defaults
 *   - migration heal-on-read (upgradeStdState / upgradeCplxState)
 *   - snapshotPricingParams empty fallback
 *
 * @returns {object}
 */
export function createEmptySnapshot() {
  return {
    _captured_at: null,
    _captured_by: null,
    _synthesized: false,
    _lib_version: null,
    _site: null,
    materials: {},
    coverage: [],
    rates: {},
    // PR-A (2026-06-20): tool_life + click_charges clusters added.
    // Legacy snapshots without these fields fall back to live lib and
    // get tagged _partial_legacy=true + _warnings entry.
    tool_life: {},
    click_charges: {},
  };
}

// Phase 3 wired: buildQuoteData (StandardCalc / ComplexCalc) pulls the
// user from `useAuth()` and hands the id down via
// `freezeLib(lib, state, { userId })`. AuthContext is a React hook so
// this pure module cannot reach it directly — the explicit-option
// pattern keeps pricingSnapshot.js React-free + node:test friendly.
// Falls back to null when caller doesn't supply userId (legacy callers
// + tests that don't care about attribution).
function resolveCapturedBy(options) {
  if (options && typeof options.userId !== 'undefined' && options.userId !== null) {
    return options.userId;
  }
  return null;
}

function collectUsedMatCodes(state) {
  const used = new Set();
  if (Array.isArray(state?.materials)) {
    for (const m of state.materials) {
      if (m && typeof m.code === 'string' && m.code.length > 0) used.add(m.code);
    }
  }
  if (Array.isArray(state?.subproducts)) {
    for (const sp of state.subproducts) {
      if (!Array.isArray(sp?.materials)) continue;
      for (const m of sp.materials) {
        if (m && typeof m.code === 'string' && m.code.length > 0) used.add(m.code);
      }
    }
  }
  return used;
}

function collectUsedWorkcenters(state) {
  const used = new Set();
  if (Array.isArray(state?.processes)) {
    for (const p of state.processes) {
      if (p && typeof p.workcenter === 'string' && p.workcenter.length > 0) {
        used.add(p.workcenter);
      }
    }
  }
  if (Array.isArray(state?.subproducts)) {
    for (const sp of state.subproducts) {
      if (!Array.isArray(sp?.processes)) continue;
      for (const p of sp.processes) {
        if (p && typeof p.workcenter === 'string' && p.workcenter.length > 0) {
          used.add(p.workcenter);
        }
      }
    }
  }
  return used;
}

/**
 * Collect tool_type strings actually referenced by die-cut processes
 * on the quote. Pre-Sprint-S-PRICING-COMBINED-P2 we'd walk the whole
 * lib.ddl.tool_life dict; per snapshot-gọn principle we only freeze
 * the types this quote uses — keeps snapshot bytes proportional to
 * quote size, not library size.
 */
function collectUsedToolTypes(state) {
  const used = new Set();
  const walk = (procs) => {
    if (!Array.isArray(procs)) return;
    for (const p of procs) {
      if (p && typeof p.tool_type === 'string' && p.tool_type.length > 0) {
        used.add(p.tool_type);
      }
    }
  };
  walk(state?.processes);
  if (Array.isArray(state?.subproducts)) {
    for (const sp of state.subproducts) walk(sp?.processes);
  }
  return used;
}

/**
 * Detect whether the quote needs click_charges frozen. Indigo-printed
 * inks (per isIndigoPrintType in calcEngine — startsWith('Indigo'))
 * read lib.ddl.click_charges at run-cost computation. Quote with no
 * Indigo inks → empty click_charges snapshot (no bytes wasted).
 */
function quoteUsesClickCharges(state) {
  const walk = (inks) => {
    if (!Array.isArray(inks)) return false;
    for (const i of inks) {
      if (i && typeof i.print_type === 'string' && i.print_type.startsWith('Indigo')) {
        return true;
      }
    }
    return false;
  };
  if (walk(state?.inks)) return true;
  if (Array.isArray(state?.subproducts)) {
    for (const sp of state.subproducts) if (walk(sp?.inks)) return true;
  }
  return false;
}

/**
 * Capture a USED-rows-only snapshot of the live master library. Walks
 * Std + Cpx materials and processes so a quote with 3 subproducts and
 * 9 workcenters snapshots 9 rate rows + 5 material rows — not the
 * entire library.
 *
 * @param {object|null|undefined} lib - Live master library (post-
 *   activeSite filter from CostLibContext). null → empty snapshot.
 * @param {object|null|undefined} state - Persisted quote state.
 * @param {object} [options]
 * @param {string|null} [options.userId] - operator id for the
 *   `_captured_by` audit field. Phase 3 buildQuoteData pulls this from
 *   `useAuth().user.id`. Omit for legacy / test callers — falls back
 *   to null and the field remains a safe sentinel for audit queries.
 * @returns {object} pricing_snapshot shape (see createEmptySnapshot)
 */
export function freezeLib(lib, state, options) {
  if (!lib) return createEmptySnapshot();

  const usedMatCodes = collectUsedMatCodes(state);
  const usedWorkcenters = collectUsedWorkcenters(state);

  const materials = {};
  for (const code of usedMatCodes) {
    const row = Array.isArray(lib.mat) ? lib.mat.find((m) => m && m.code === code) : null;
    materials[code] = row ? { ...row } : null;
  }

  const rates = {};
  for (const wc of usedWorkcenters) {
    // lib.rate pre-filtered by activeSite at CostLibContext — read
    // direct, same shape as calcEngine.getRateByWC. Full row spread
    // (machine_rate + labor_rate + oh_cost + crew + speed_uom + …)
    // so future fields the LibRate UI may add survive the snapshot
    // without code change here.
    const row = Array.isArray(lib.rate) ? lib.rate.find((r) => r && r.workcenter === wc) : null;
    rates[wc] = row ? { ...row } : null;
  }

  // PR-A (2026-06-20): freeze tool_life only for tool_types this quote
  // actually uses. Empty dict for quotes with no die-cut processes —
  // resolver falls through cleanly (returns 0, matching pre-snapshot
  // getToolLife behavior for unknown types).
  const tool_life = {};
  const libToolLife = (lib.ddl && lib.ddl.tool_life) || {};
  for (const toolType of collectUsedToolTypes(state)) {
    if (Object.prototype.hasOwnProperty.call(libToolLife, toolType)) {
      tool_life[toolType] = libToolLife[toolType];
    }
  }

  // PR-A (2026-06-20): freeze click_charges only when quote actually
  // has Indigo inks. Captures the full charge table because clicks-per-
  // tier lookup walks all keys to find the largest key ≤ clicks
  // (calcEngine.js:529-536 — sorted-key climb). Snapshotting only the
  // "needed" tier would require knowing the quote's clicks ahead of
  // time; full-table is small (~10 entries) so cost is negligible.
  const click_charges = quoteUsesClickCharges(state)
    ? { ...((lib.ddl && lib.ddl.click_charges) || {}) }
    : {};

  return {
    _captured_at: new Date().toISOString(),
    _captured_by: resolveCapturedBy(options),
    _synthesized: false,
    _lib_version: (lib && lib._version) || null,
    _site: (state && state.site) || null,
    materials,
    coverage: structuredClone((lib.ddl && lib.ddl.coverage) || []),
    rates,
    tool_life,
    click_charges,
  };
}

/**
 * Resolver — three branches:
 *   1. `persisted`: state already carries a real snapshot (captured at
 *      save). Return as-is; Phase 2 calcEngine reads from this.
 *   2. `synthesized`: legacy quote (no snapshot block) + lib present.
 *      Synthesize from lib so the calc still works; tag
 *      `_synthesized: true` so audit UI / Phase 2 can warn "this is a
 *      derived value, not the original quote-time price".
 *   3. `empty`: no snapshot + no lib — return empty shell. Phase 2
 *      calcEngine will treat this as a hard error (refuse to calc).
 *
 * @param {object|null|undefined} state
 * @param {object|null|undefined} lib
 * @returns {{source: 'persisted'|'synthesized'|'empty', snapshot: object}}
 */
export function snapshotPricingParams(state, lib) {
  const snap = state && state.pricing_snapshot;
  if (snap && snap._captured_at && !snap._synthesized) {
    return { source: 'persisted', snapshot: snap };
  }
  if (lib) {
    return {
      source: 'synthesized',
      snapshot: { ...freezeLib(lib, state), _synthesized: true },
    };
  }
  return { source: 'empty', snapshot: createEmptySnapshot() };
}

/* ─── Accessor helpers — parity with calcEngine getMatByCode / getRateByWC */

/**
 * @param {object|null|undefined} snapshot
 * @param {string} code
 * @returns {object|null} material row from snapshot, null if missing
 */
export function getMatFromSnapshot(snapshot, code) {
  if (!snapshot || !snapshot.materials) return null;
  const row = snapshot.materials[code];
  return row || null;
}

/**
 * Full workcenter rate row (machine_rate + labor_rate + oh_cost + crew
 * + speed_uom + any forward-compat fields). Match calcEngine.getRateByWC
 * signature so Phase 2 wiring is mechanical.
 *
 * @param {object|null|undefined} snapshot
 * @param {string} workcenter
 * @returns {object|null}
 */
export function getRateFromSnapshot(snapshot, workcenter) {
  if (!snapshot || !snapshot.rates) return null;
  const row = snapshot.rates[workcenter];
  return row || null;
}

/**
 * @param {object|null|undefined} snapshot
 * @returns {Array} coverage rows (empty array if snapshot missing)
 */
export function getCoverageFromSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.coverage)) return [];
  return snapshot.coverage;
}

/**
 * Audit metadata — Phase 2 will use this to flag a "snapshot frozen
 * under site X, operator now editing under site Y" mismatch.
 *
 * @param {object|null|undefined} snapshot
 * @returns {string|null}
 */
export function getSnapshotSite(snapshot) {
  if (!snapshot) return null;
  return snapshot._site || null;
}

/**
 * Tool lifespan for a die type as frozen at save time. Returns 0 when
 * the snapshot doesn't carry tool_life (pre-PR-A snapshot) OR when the
 * specific tool_type wasn't in the lib at save time. Caller (calcEngine
 * resolver) treats 0 the same as the pre-snapshot getToolLife return
 * shape — falls through to proc.tool_life || 1 in the tooling formula.
 *
 * @param {object|null|undefined} snapshot
 * @param {string} toolType
 * @returns {number}
 */
export function getToolLifeFromSnapshot(snapshot, toolType) {
  if (!snapshot || !snapshot.tool_life) return 0;
  const v = snapshot.tool_life[toolType];
  return Number.isFinite(v) ? v : 0;
}

/**
 * Indigo click charges table as frozen at save time. Returns empty
 * object when snapshot lacks click_charges (pre-PR-A) so caller can
 * fall back to live lib.ddl.click_charges (with _warnings emit per
 * legacy-partial pattern).
 *
 * @param {object|null|undefined} snapshot
 * @returns {Record<string, number>}
 */
export function getClickChargesFromSnapshot(snapshot) {
  if (!snapshot || !snapshot.click_charges || typeof snapshot.click_charges !== 'object') {
    return {};
  }
  return snapshot.click_charges;
}

/**
 * Returns the list of new-cluster fields (tool_life + click_charges)
 * that are MISSING from a snapshot — used by the resolver to attach
 * _warnings + set pricing_snapshot._partial_legacy=true so consumers
 * (UI, audit log) can flag the quote as "partially-pinned".
 *
 * A snapshot is considered to LACK a field if the key is absent
 * entirely. An EMPTY dict ({}) is considered PRESENT (it means the
 * quote at save time had no die-cut / no Indigo, so freeze was a
 * no-op — distinct from "we didn't have the freeze capability yet").
 *
 * @param {object|null|undefined} snapshot
 * @returns {string[]} ['tool_life', 'click_charges'] subset
 */
export function detectLegacyPartialFields(snapshot) {
  if (!snapshot) return [];
  const missing = [];
  if (!Object.prototype.hasOwnProperty.call(snapshot, 'tool_life')) missing.push('tool_life');
  if (!Object.prototype.hasOwnProperty.call(snapshot, 'click_charges')) {
    missing.push('click_charges');
  }
  return missing;
}
