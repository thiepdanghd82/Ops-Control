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
