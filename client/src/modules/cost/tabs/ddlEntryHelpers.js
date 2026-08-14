// @ts-check
/**
 * ddlEntryHelpers — pure add/delete logic for the Drop-Down Lists editor's
 * object-keyed tables (tool_life keyed by name, click_charges keyed by a
 * numeric string) + the coverage array. Framework-free so node:test drives
 * it directly.
 */

/**
 * Add a new key to an object-keyed section. Trims the key; rejects empty;
 * DEDUPES — an existing key is never overwritten (returns error instead).
 * @param {Record<string, any>} obj  current section object
 * @param {string} rawKey            proposed key (e.g. "Knife" or "3")
 * @param {any} [value]              optional initial value (default '')
 * @returns {{ ok: boolean, obj?: Record<string, any>, error?: 'empty' | 'duplicate' }}
 */
export function addObjectKey(obj, rawKey, value = '') {
  const base = obj && typeof obj === 'object' ? obj : {};
  const key = String(rawKey ?? '').trim();
  if (!key) return { ok: false, error: 'empty' };
  if (Object.hasOwn(base, key)) return { ok: false, error: 'duplicate' };
  return { ok: true, obj: { ...base, [key]: value ?? '' } };
}

/** Remove a key from an object-keyed section (returns a new object). */
export function deleteObjectKey(obj, key) {
  const base = obj && typeof obj === 'object' ? obj : {};
  if (!Object.hasOwn(base, key)) return { ...base };
  const next = { ...base };
  delete next[key];
  return next;
}

/** Remove one row from an array section by index (returns a new array). */
export function deleteArrayIndex(arr, idx) {
  return (Array.isArray(arr) ? arr : []).filter((_, i) => i !== idx);
}

// ── Tool Life ↔ Tool Type keying (money-path seed for getToolLife) ──
// getToolLife(lib, toolType) = lib.ddl.tool_life[toolType] || 0 — an EXACT
// key match. tool_life must therefore be keyed exactly by the tool_type
// entries or a selectable tool type resolves to 0. These helpers keep the
// seed table aligned with the tool_type list.

/**
 * Normalized tool key for a tolerant carry-over match: trim, lowercase,
 * collapse whitespace, and take the part before the first '/' — so a
 * legacy "Etching" = 20000 carries onto a renamed "Etching/ Pinnacle Die".
 */
export function normToolKey(s) {
  const str = String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return str.split('/')[0].trim();
}

/**
 * One-time reconcile: return a tool_life object keyed EXACTLY by the
 * current tool_type entries. Each value is resolved as:
 *   exact key hit → keep · else normalized carry-over from an existing
 *   key → carry that value · else '' (blank, operator fills).
 * Money-safe: never drops a value without first attempting the carry-over.
 * @returns {{ toolLife: Record<string, any>, changed: boolean }}
 */
export function reconcileToolLife(toolTypes, toolLife) {
  const types = Array.isArray(toolTypes) ? toolTypes : [];
  const src = toolLife && typeof toolLife === 'object' ? toolLife : {};
  // Normalized index of existing keys (first-wins) for the carry-over.
  const normIndex = new Map();
  for (const k of Object.keys(src)) {
    const nk = normToolKey(k);
    if (!normIndex.has(nk)) normIndex.set(nk, k);
  }
  const out = {};
  for (const tt of types) {
    const key = String(tt ?? '').trim();
    if (!key || Object.hasOwn(out, key)) continue;
    if (Object.hasOwn(src, key)) {
      out[key] = src[key];
    } else {
      const match = normIndex.get(normToolKey(key));
      out[key] = match != null ? src[match] : '';
    }
  }
  // changed iff key set or any value differs from the source.
  const srcKeys = Object.keys(src);
  const outKeys = Object.keys(out);
  let changed = srcKeys.length !== outKeys.length;
  if (!changed) {
    for (const k of outKeys) {
      if (!Object.hasOwn(src, k) || src[k] !== out[k]) {
        changed = true;
        break;
      }
    }
  }
  return { toolLife: out, changed };
}

/**
 * Cascade a tool_type rename onto tool_life: move oldName's value to
 * newName (value follows the rename, no data loss). Empty newName just
 * drops the old key; empty oldName (a fresh "+ Add" entry being named)
 * seeds newName with the old blank value (''). Returns a new object.
 */
export function renameToolLifeKey(toolLife, oldName, newName) {
  const src = toolLife && typeof toolLife === 'object' ? toolLife : {};
  const oldKey = String(oldName ?? '').trim();
  const newKey = String(newName ?? '').trim();
  if (oldKey === newKey) return { ...src };
  const carried = Object.hasOwn(src, oldKey) ? src[oldKey] : '';
  const next = { ...src };
  if (oldKey) delete next[oldKey];
  if (newKey) next[newKey] = carried;
  return next;
}
