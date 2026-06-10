/**
 * Pure helpers for ColumnsToggle component. Lives in `.js` so node:test
 * can import without JSX loader infra. Same extraction pattern as
 * DesignSyncPicker.fields + CalcLeadTimeNotice.helpers.
 *
 * Column-visibility contract:
 *   - hidden set is keyed by column.key (string) — bền với reorder
 *     hoặc insert of new columns. Stale keys (column removed from
 *     config) are silently filtered out on read.
 *   - Required columns (`column.required === true`) ignore hiddenKeys
 *     entirely — checkbox sẽ disabled trong UI và pure filter luôn
 *     trả về required columns.
 *   - Persisted shape: localStorage[storageKey] = JSON.stringify(Array<string>)
 *     so future ops scripts can read/write the same blob without
 *     parser surprise.
 */

const STORAGE_VERSION = 1; // bump nếu shape thay đổi

/**
 * Filter columns array against a hiddenKeys Set. Required columns always
 * survive regardless of hiddenKeys membership.
 *
 * @param {Array<{key:string,label?:string,required?:boolean}>} columns
 * @param {Set<string>|null|undefined} hiddenKeys
 * @returns {Array} visible subset (preserves source order)
 */
export function applyColumnVisibility(columns, hiddenKeys) {
  if (!Array.isArray(columns)) return [];
  if (!hiddenKeys || hiddenKeys.size === 0) return columns;
  return columns.filter((c) => c && (c.required || !hiddenKeys.has(c.key)));
}

/**
 * Load persisted hidden keys from localStorage. Filters out stale keys
 * (column removed from current config), returns defaultHiddenKeys when
 * storage empty/missing/corrupt. Pure (no side effects) other than the
 * read.
 *
 * @param {string} storageKey
 * @param {Array<string>} validKeys - keys present in current columns config
 * @param {Array<string>} defaultHiddenKeys
 * @param {Storage} [storage] - localStorage-like, defaults to globalThis.localStorage
 * @returns {Set<string>}
 */
export function loadHiddenKeys(storageKey, validKeys, defaultHiddenKeys = [], storage) {
  const store = storage || (typeof globalThis !== 'undefined' && globalThis.localStorage) || null;
  const validSet = new Set(validKeys || []);
  const defaultSet = new Set((defaultHiddenKeys || []).filter((k) => validSet.has(k)));

  if (!store) return defaultSet;

  let raw;
  try {
    raw = store.getItem(storageKey);
  } catch {
    return defaultSet;
  }
  if (!raw) return defaultSet;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultSet; // corrupt JSON — fall back to default
  }
  if (!Array.isArray(parsed)) return defaultSet;

  // Filter stale keys (column removed from config); silently drop.
  const out = new Set();
  for (const k of parsed) {
    if (typeof k === 'string' && validSet.has(k)) out.add(k);
  }
  return out;
}

/**
 * Compose loader: read storage + apply visibility filter in one shot.
 * Convenience for parent components that need initial visibleColumns
 * value at useState init without separate hiddenKeys state.
 *
 * @param {Array} columns
 * @param {string} storageKey
 * @param {Array<string>} [defaultHiddenKeys]
 * @param {Storage} [storage]
 * @returns {Array} visible columns
 */
export function loadVisibleColumns(columns, storageKey, defaultHiddenKeys = [], storage) {
  const validKeys = (columns || []).map((c) => c && c.key).filter(Boolean);
  const hidden = loadHiddenKeys(storageKey, validKeys, defaultHiddenKeys, storage);
  return applyColumnVisibility(columns, hidden);
}

/**
 * Persist hiddenKeys to localStorage. Stores JSON.stringify of sorted
 * array for stable diffs. Silently no-ops on storage failures (quota,
 * disabled, SSR).
 *
 * @param {string} storageKey
 * @param {Set<string>} hiddenKeys
 * @param {Storage} [storage]
 */
export function saveHiddenKeys(storageKey, hiddenKeys, storage) {
  const store = storage || (typeof globalThis !== 'undefined' && globalThis.localStorage) || null;
  if (!store) return;
  try {
    const arr = [...(hiddenKeys || [])].sort();
    store.setItem(storageKey, JSON.stringify(arr));
  } catch {
    /* quota / disabled — operator can re-toggle next session */
  }
}

export const COLUMNS_TOGGLE_STORAGE_VERSION = STORAGE_VERSION;
