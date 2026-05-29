/**
 * Gallus cylinder inventory + design constants.
 *
 * Extracted from `Cost Ref data/NPI/Gallus_Design_Calculator_RL.xlsx`
 * (Sheet "Design_Calculator", sections 3 + 6b) on 2026-04-25 as part of
 * Sprint 14 Design Tools feature. Authoritative source: the xlsx file
 * — when production cylinders are added/removed at the press, the
 * operator updates the xlsx + this constants file together so the
 * calculator and the spreadsheet stay aligned.
 *
 * Two inventories:
 *   - `PRINT_CYLINDERS`     — plate-mounting cylinders (Z=60..220)
 *                             with availability flag. Drives the Top-5
 *                             ranking on the Print Design tab.
 *   - `MAGNETIC_CYLINDERS`  — magnetic die-cut cylinders (22 distinct
 *                             tooth counts). Used by the Cutting Design
 *                             (Die-cut) tab to find a cylinder whose
 *                             step matches the print step within
 *                             tolerance.
 *
 * Conversion: pitch_mm = teeth × 25.4 / 8 (inch → mm at 8 TPI).
 *
 * `qty > 1` denotes physical inventory at the press — usually 1 of each
 * tooth count, with the occasional duplicate (Z=98 has 2 magnetic dies
 * because two distinct customers ordered the same step).
 */

// Sprint 1.7j — dynamic runtime override. App boot fetches admin
// edits from `/api/admin/master-cylinders` and seeds this slot via
// `setRuntimePrintCylinders()`. Engine + UI read via `getPrintCylinders()`
// so admin toggles + new rows propagate immediately to Top-5 ranking
// and the Master table without a code rebuild.
let _runtimeOverride = null;

export function setRuntimePrintCylinders(list) {
  _runtimeOverride = Array.isArray(list) && list.length > 0 ? list : null;
}

export function getPrintCylinders() {
  return _runtimeOverride || PRINT_CYLINDERS;
}

// Print cylinders Z=60..220 (full range). Only `Y` ones get ranked when
// the operator ticks "Filter: only available". Master table available in
// the Excel section 3 — this list mirrors that EXACTLY.
// Kept exported for backward compat with the engine + tests; admin edits
// flow through getPrintCylinders() above.
export const PRINT_CYLINDERS = [
  // Z=60..79 — none currently in stock at this press
  ...range(60, 79).map((z) => ({ z, available: false })),
  // Z=80..220 with mixed availability
  { z: 80, available: true },
  { z: 81, available: false },
  { z: 82, available: false },
  { z: 83, available: true },
  { z: 84, available: false },
  { z: 85, available: true },
  { z: 86, available: true },
  { z: 87, available: false },
  { z: 88, available: true },
  { z: 89, available: false },
  { z: 90, available: true },
  { z: 91, available: false },
  { z: 92, available: false },
  { z: 93, available: false },
  { z: 94, available: true },
  { z: 95, available: false },
  { z: 96, available: true },
  { z: 97, available: false },
  { z: 98, available: true },
  { z: 99, available: false },
  { z: 100, available: true },
  { z: 101, available: true },
  { z: 102, available: false },
  { z: 103, available: false },
  { z: 104, available: false },
  { z: 105, available: false },
  { z: 106, available: true },
  { z: 107, available: false },
  { z: 108, available: true },
  { z: 109, available: false },
  { z: 110, available: true },
  { z: 111, available: true },
  { z: 112, available: false },
  { z: 113, available: false },
  { z: 114, available: true },
  { z: 115, available: false },
  { z: 116, available: true },
  { z: 117, available: false },
  { z: 118, available: false },
  { z: 119, available: false },
  { z: 120, available: true },
  { z: 121, available: false },
  { z: 122, available: true },
  { z: 123, available: false },
  { z: 124, available: false },
  { z: 125, available: false },
  { z: 126, available: false },
  { z: 127, available: true },
  { z: 128, available: false },
  { z: 129, available: true },
  { z: 130, available: false },
  { z: 131, available: false },
  { z: 132, available: true },
  { z: 133, available: false },
  { z: 134, available: false },
  { z: 135, available: true },
  // Z=136..209 — none in stock currently (large diameter, special order)
  ...range(136, 209).map((z) => ({ z, available: false })),
  { z: 210, available: true },
  // Z=211..220 — placeholder, none in stock
  ...range(211, 220).map((z) => ({ z, available: false })),
];

// Magnetic die cylinder inventory (22 distinct stocks). `qty` matters
// because a 1-of-each constraint sometimes blocks two concurrent jobs
// from sharing the same Z.
export const MAGNETIC_CYLINDERS = [
  { z: 80, qty: 1, note: '' },
  { z: 81, qty: 1, note: '' },
  { z: 83, qty: 1, note: '' },
  { z: 85, qty: 1, note: '' },
  { z: 86, qty: 1, note: '' },
  { z: 88, qty: 1, note: '' },
  { z: 90, qty: 1, note: '' },
  { z: 94, qty: 1, note: '+1 Solid die hang Compal' },
  { z: 96, qty: 1, note: '' },
  { z: 98, qty: 2, note: 'Two stocked due to common spec' },
  { z: 100, qty: 1, note: '' },
  { z: 101, qty: 1, note: '' },
  { z: 102, qty: 1, note: '' },
  { z: 106, qty: 1, note: '' },
  { z: 108, qty: 1, note: '' },
  { z: 110, qty: 1, note: '' },
  { z: 111, qty: 1, note: '' },
  { z: 114, qty: 1, note: '' },
  { z: 116, qty: 1, note: '' },
  { z: 120, qty: 1, note: '' },
  { z: 129, qty: 1, note: '' },
  { z: 132, qty: 1, note: '' },
];

// Press-level constants. K is the print-zone overhead — the slice of
// the cylinder circumference that doesn't carry plate (gap for clamps,
// register marks). K for Gallus ECS340 = 9.9 mm per the operator
// handbook. Other presses override this in their own constants file.
export const GALLUS_DEFAULTS = {
  toothPitchInch: 1 / 8, // 8 TPI standard
  toothPitchMm: 25.4 / 8, // 3.175 mm/tooth
  K_default: 9.9, // print-zone overhead (mm)
  G_min_default: 2, // die-cut minimum gap (mm)
  G_max_default: 8, // operator-acceptable maximum
  E_default: 5, // edge margin per side (mm)
  Lg_default: 2.5, // lane gap target (mm)
  plate_cost_default: 80, // USD/m² flexo digital
};

function range(lo, hi) {
  const out = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}
