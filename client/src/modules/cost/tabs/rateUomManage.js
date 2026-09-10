// @ts-check
/**
 * rateUomManage — pure helpers for the Rate Table UOM (speed_uom) list:
 * legacy-label migration + add/rename/delete over the custom-UOM list and
 * the loaded rows. Framework-free so node:test drives it directly.
 *
 * MONEY-PATH note: renaming a UOM here is LABEL-ONLY. calcEngine keys the
 * Machine-UPH formula off the (normalized) string and keeps the old tokens
 * as aliases, so a legacy 'Stamp/min' and the new 'Shot/min' compute the
 * SAME uph. These helpers never touch numbers — only the label string.
 */

// The selectable built-in options (CHANGE 1). Mtr/Hr was dropped from the
// list but still computes via a calcEngine alias for legacy rows.
export const DEFAULT_SPEED_UOMS = ['', 'M/min', 'Sheets/Hrs', 'Shot/min', 'Pcs/hrs', 'Hrs'];

// Legacy label → new display label. Identity for anything not renamed
// (incl. 'Mtr/Hr', which has no new equivalent and is preserved as-is).
const LEGACY_LABEL_MAP = {
  'Stamp/min': 'Shot/min',
  'Pcs/H': 'Pcs/hrs',
  'Sheets/H': 'Sheets/Hrs',
  'Sheet/H': 'Sheets/Hrs',
};

/** Map a saved speed_uom to its current display label (label-only). */
export function migrateSpeedUom(uom) {
  if (uom == null) return uom;
  return Object.hasOwn(LEGACY_LABEL_MAP, uom) ? LEGACY_LABEL_MAP[uom] : uom;
}

/** Apply the display migration to every row's speed_uom (returns new rows). */
export function migrateRowsUom(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => {
    const next = migrateSpeedUom(r?.speed_uom);
    return next === r?.speed_uom ? r : { ...r, speed_uom: next };
  });
}

const norm = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase();

/**
 * Custom UOMs to expose in the dropdown: the persisted customs minus any
 * that collide (case-insensitively) with a built-in.
 */
export function visibleCustomUoms(customUoms, builtins = DEFAULT_SPEED_UOMS) {
  const builtinSet = new Set(builtins.map(norm));
  const seen = new Set();
  const out = [];
  for (const u of Array.isArray(customUoms) ? customUoms : []) {
    const k = norm(u);
    if (!k || builtinSet.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(u);
  }
  return out;
}

/**
 * Add a custom UOM. Trims; rejects empty, a built-in collision, or a
 * case-insensitive duplicate of an existing custom.
 * @returns {{ ok: boolean, list: string[], error?: string }}
 */
export function addCustomUom(customUoms, value, builtins = DEFAULT_SPEED_UOMS) {
  const list = Array.isArray(customUoms) ? customUoms : [];
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return { ok: false, list, error: 'empty' };
  const k = norm(trimmed);
  if (builtins.some((b) => norm(b) === k)) return { ok: false, list, error: 'builtin_collision' };
  if (list.some((u) => norm(u) === k)) return { ok: false, list, error: 'duplicate' };
  return { ok: true, list: [...list, trimmed] };
}

/**
 * Rename a custom UOM. Rejects if the target collides with a built-in or
 * another existing custom (case-insensitive), or if `oldValue` isn't a
 * custom. A rename that only changes case of itself is allowed.
 * @returns {{ ok: boolean, list: string[], error?: string }}
 */
export function renameCustomUom(customUoms, oldValue, newValue, builtins = DEFAULT_SPEED_UOMS) {
  const list = Array.isArray(customUoms) ? customUoms : [];
  const trimmed = String(newValue ?? '').trim();
  if (!trimmed) return { ok: false, list, error: 'empty' };
  const idx = list.findIndex((u) => u === oldValue);
  if (idx === -1) return { ok: false, list, error: 'not_found' };
  const k = norm(trimmed);
  if (builtins.some((b) => norm(b) === k)) return { ok: false, list, error: 'builtin_collision' };
  if (list.some((u, i) => i !== idx && norm(u) === k)) {
    return { ok: false, list, error: 'duplicate' };
  }
  const next = list.slice();
  next[idx] = trimmed;
  return { ok: true, list: next };
}

/** Remove a custom UOM (no row-usage check — caller gates on rowsUseUom). */
export function deleteCustomUom(customUoms, value) {
  const list = Array.isArray(customUoms) ? customUoms : [];
  return list.filter((u) => u !== value);
}

/** True when any loaded row uses this exact speed_uom. */
export function rowsUseUom(rows, value) {
  return (Array.isArray(rows) ? rows : []).some((r) => r?.speed_uom === value);
}

/** Replace every row's speed_uom === oldValue with newValue (rename cascade). */
export function cascadeRowsUom(rows, oldValue, newValue) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((r) => (r?.speed_uom === oldValue ? { ...r, speed_uom: newValue } : r));
}
