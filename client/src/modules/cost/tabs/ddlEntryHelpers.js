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

// ── Card title overrides (rename any table) ─────────────────────────
// A display-name override lives in _custom_names[key]; the section KEY never
// changes (code + calc reference the key, not the label). The label resolve
// prefers _custom_names[key] over the built-in SECTION_LABELS default, so a
// rename works for BOTH built-in and custom cards. Renaming a built-in back
// to its default drops the override so it falls back cleanly.

/**
 * Apply/clear a title override. Trims the title; an empty title OR one equal
 * to the built-in default removes the override key (clean fallback). Returns
 * a NEW _custom_names object.
 * @param {Record<string,string>} customNames
 * @param {string} key
 * @param {string} newTitle
 * @param {string} [defaultLabel]  built-in SECTION_LABELS[key], if any
 */
export function applyTitleOverride(customNames, key, newTitle, defaultLabel) {
  const src = customNames && typeof customNames === 'object' ? customNames : {};
  const title = String(newTitle ?? '').trim();
  const next = { ...src };
  if (!title || title === String(defaultLabel ?? '')) {
    delete next[key];
  } else {
    next[key] = title;
  }
  return next;
}

// ── Cutter Cost row exclusion (per-row delete that sticks) ──────────
// Cutter Cost rows are governed by the tool_type list (one per tool type),
// but the user can delete a row. Deleted tool types are recorded in
// cutter_cost_excluded[] so the reconcile never re-adds them, while a
// genuinely NEW tool type still appears automatically. Applies to
// cutter_cost ONLY — Tool Life stays fully governed (no per-row delete).

/** Add a tool type to the exclusion list (trim + dedupe). Returns new array. */
export function addExcludedType(excluded, tt) {
  const list = Array.isArray(excluded) ? excluded : [];
  const t = String(tt ?? '').trim();
  if (!t || list.some((x) => String(x).trim() === t)) return list.slice();
  return [...list, t];
}

/** Remove a tool type from the exclusion list (tool_type delete cleanup). */
export function dropExcludedType(excluded, tt) {
  const t = String(tt ?? '').trim();
  return (Array.isArray(excluded) ? excluded : []).filter((x) => String(x).trim() !== t);
}

/** Move an excluded entry across a tool_type rename (no-op if not excluded). */
export function renameExcludedType(excluded, oldName, newName) {
  const o = String(oldName ?? '').trim();
  const n = String(newName ?? '').trim();
  const list = Array.isArray(excluded) ? excluded : [];
  if (!list.some((x) => String(x).trim() === o)) return list.slice();
  return list.map((x) => (String(x).trim() === o ? n : x)).filter((x) => String(x).trim() !== '');
}

/**
 * Reconcile cutter_cost against the tool_type list MINUS the excluded set —
 * seeds a cost key for every non-excluded tool type (carry existing via
 * exact+normalized match, blank for new), drops excluded/removed types. Reuses
 * the generic reconcileToolLife on the filtered list.
 * @returns {{toolLife: Record<string, any>, changed: boolean}}
 */
export function reconcileCutterCost(toolTypes, cutterCost, excluded) {
  const ex = new Set((Array.isArray(excluded) ? excluded : []).map((x) => String(x).trim()));
  const included = (Array.isArray(toolTypes) ? toolTypes : []).filter(
    (tt) => !ex.has(String(tt).trim())
  );
  return reconcileToolLife(included, cutterCost || {});
}

// ── Custom pair-tables (Coverage-shaped user tables) ────────────────
// A custom table is an array of {k, v} pairs stored under a `custom_<slug>`
// key, with the display name in _custom_names[key] and the key tracked in
// _custom_sections[]. They are STORED + editable but NOT consumed by
// calcEngine / dropdowns / exporter — free-form reference lists only. The
// Coverage Table shares the same 2-column pair renderer but keeps its own
// {pt, cov} shape (money-path — calcEngine reads it verbatim).

// Meta keys that hold custom-table bookkeeping, never a data section.
const CUSTOM_META_KEYS = ['_custom_sections', '_custom_names'];

/**
 * Field mapping + placeholders + new-row shape for the shared pair renderer.
 * Coverage keeps its EXACT {pt, cov} shape; every other (custom) table uses
 * a generic {k, v} text pair.
 * @param {string} key  section key ('coverage' → coverage shape, else custom)
 */
export function pairTableConfig(key) {
  if (key === 'coverage') {
    return {
      labelField: 'pt',
      valueField: 'cov',
      labelPlaceholder: 'Print Type',
      valuePlaceholder: 'Coverage',
      valueDecimal: true,
      newRow: { pt: '', cov: 0 },
    };
  }
  return {
    labelField: 'k',
    valueField: 'v',
    labelPlaceholder: 'Name',
    valuePlaceholder: 'Value',
    valueDecimal: false,
    newRow: { k: '', v: '' },
  };
}

/**
 * Slug for a custom-table key: NFKD-strip diacritics, non-alnum → '_',
 * trim underscores, lowercase. Empty (e.g. an all-non-latin name) → 'table'
 * so the key is always well-formed (the human-readable name lives in
 * _custom_names, so key ugliness never reaches the operator).
 */
export function slugifyTableKey(name) {
  const base = String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'table';
}

/**
 * A unique `custom_<slug>` key that collides with no taken key. The
 * `custom_` prefix guarantees separation from every built-in key (none of
 * which start with it), so collisions only ever happen custom-vs-custom.
 */
export function makeUniqueCustomKey(name, takenKeys) {
  const taken = new Set(takenKeys || []);
  const base = `custom_${slugifyTableKey(name)}`;
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/** True iff key is a tracked custom section (built-ins are never custom). */
export function isCustomSection(sections, key) {
  const src = sections && typeof sections === 'object' ? sections : {};
  const list = Array.isArray(src._custom_sections) ? src._custom_sections : [];
  return list.includes(key);
}

/**
 * Create a custom pair-table. Trims the name; rejects empty; dedupes the
 * name (case-insensitive) against caller-supplied reservedLabels (built-in
 * card labels), existing custom names, and raw section keys. On success
 * returns a NEW sections object with:
 *   sections[key]        = []                (empty {k,v} rows)
 *   _custom_names[key]   = name
 *   _custom_sections     = [...prev, key]
 * @param {Record<string, any>} sections
 * @param {string} rawName
 * @param {{reservedLabels?: string[], reservedKeys?: string[]}} [opts]
 * @returns {{ok:true, sections:Record<string,any>, key:string, name:string} | {ok:false, error:'empty'|'duplicate'}}
 */
export function createCustomTable(sections, rawName, opts = {}) {
  const src = sections && typeof sections === 'object' ? sections : {};
  const name = String(rawName ?? '').trim();
  if (!name) return { ok: false, error: 'empty' };

  const names = src._custom_names && typeof src._custom_names === 'object' ? src._custom_names : {};
  const customList = Array.isArray(src._custom_sections) ? src._custom_sections : [];
  const reservedLabels = Array.isArray(opts.reservedLabels) ? opts.reservedLabels : [];

  // Dedupe name (case-insensitive) vs built-in labels + existing custom
  // names + raw section keys.
  const lower = name.toLowerCase();
  const takenLabels = new Set(
    [
      ...reservedLabels,
      ...Object.values(names),
      ...Object.keys(src).filter((k) => !CUSTOM_META_KEYS.includes(k)),
    ].map((s) => String(s).trim().toLowerCase())
  );
  if (takenLabels.has(lower)) return { ok: false, error: 'duplicate' };

  const takenKeys = new Set([...Object.keys(src), ...(opts.reservedKeys || [])]);
  const key = makeUniqueCustomKey(name, takenKeys);

  return {
    ok: true,
    key,
    name,
    sections: {
      ...src,
      [key]: [],
      _custom_names: { ...names, [key]: name },
      _custom_sections: [...customList, key],
    },
  };
}

/**
 * Delete a custom pair-table — its data section, its _custom_names entry,
 * and its _custom_sections tracking entry. Refuses to touch a non-custom
 * (built-in) key so Coverage / Tool Life / Click Charges / etc. can never
 * be deleted as tables. Returns a NEW sections object.
 * @returns {{ok:true, sections:Record<string,any>} | {ok:false, error:'not_custom'}}
 */
export function deleteCustomTable(sections, key) {
  const src = sections && typeof sections === 'object' ? sections : {};
  if (!isCustomSection(src, key)) return { ok: false, error: 'not_custom' };
  const next = { ...src };
  delete next[key];
  const names = { ...(src._custom_names || {}) };
  delete names[key];
  next._custom_names = names;
  next._custom_sections = (src._custom_sections || []).filter((k) => k !== key);
  return { ok: true, sections: next };
}

/**
 * Order section keys built-ins first, custom last, preserving each group's
 * relative order — so custom tables always list after the built-in cards.
 */
export function orderSectionKeys(keys, customKeys) {
  const custom = new Set(customKeys || []);
  const list = Array.isArray(keys) ? keys : [];
  return [...list.filter((k) => !custom.has(k)), ...list.filter((k) => custom.has(k))];
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
