// @ts-check
/**
 * validationIgnore — pure helpers for the per-quote "ignore a validation
 * error" feature (WarningBar).
 *
 * The ignore-list is an array of validation-warning IDs stored on the
 * calc state as `state.ignored_validations`. The ID is the STABLE key
 * minted by calcValidation (e.g. `mat-price-0-sp2` = ruleCode + started-
 * row index + sub-product index) — it is NEVER the message text, so
 * re-wording a message keeps the ignore. Trade-off (accepted by design):
 * the same ID with a changed message — because the underlying data
 * changed — stays ignored.
 *
 * These helpers ONLY partition / mutate the display list + the ID array.
 * They never touch calcEngine, the validation engine, or the saved
 * numbers — ignoring is purely a presentation concern.
 */

/**
 * Split warnings into the ones to show vs the ones the user ignored.
 * @param {Array<{id:string, severity:string}>} warnings
 * @param {string[]} ignoreList  IDs the user chose to ignore
 * @returns {{ active: any[], ignored: any[] }}
 */
export function partitionWarnings(warnings, ignoreList) {
  const ignoreSet = new Set(ignoreList || []);
  const active = [];
  const ignored = [];
  for (const w of warnings || []) {
    if (w && ignoreSet.has(w.id)) ignored.push(w);
    else if (w) active.push(w);
  }
  return { active, ignored };
}

/**
 * Return a NEW ignore-list with `id` added (deduped, order-stable).
 * @param {string[]} ignoreList
 * @param {string} id
 * @returns {string[]}
 */
export function addIgnore(ignoreList, id) {
  const list = Array.isArray(ignoreList) ? ignoreList : [];
  if (id == null || list.includes(id)) return list.slice();
  return [...list, id];
}

/**
 * Return a NEW ignore-list with `id` removed.
 * @param {string[]} ignoreList
 * @param {string} id
 * @returns {string[]}
 */
export function removeIgnore(ignoreList, id) {
  return (Array.isArray(ignoreList) ? ignoreList : []).filter((x) => x !== id);
}

/**
 * Prune ignore IDs that no longer match any current warning. Optional
 * housekeeping so a stale ignore (its error got fixed and will never
 * recur) doesn't linger forever. NOT auto-applied — callers opt in.
 * @param {string[]} ignoreList
 * @param {Array<{id:string}>} warnings
 * @returns {string[]}
 */
export function pruneIgnore(ignoreList, warnings) {
  const live = new Set((warnings || []).map((w) => w && w.id));
  return (Array.isArray(ignoreList) ? ignoreList : []).filter((id) => live.has(id));
}

/**
 * Human badge text for the collapsed bar. Counts ACTIVE issues only,
 * and always discloses the ignored count so the bar can never pretend
 * the quote is clean when issues were merely hidden.
 *   3 active errors, 10 ignored -> "3 errors (10 ignored)"
 *   2 warns, 0 errors, 1 ignored -> "2 warnings (1 ignored)"
 *   0 active, 5 ignored          -> "No active issues (5 ignored)"
 *   1 error + 2 warns, 0 ignored -> "1 error + 2 warnings"
 * @param {{errors:number, warns:number}} activeCounts
 * @param {number} ignoredCount
 * @returns {string}
 */
export function summarizeBadge(activeCounts, ignoredCount) {
  const e = Math.max(0, activeCounts?.errors || 0);
  const w = Math.max(0, activeCounts?.warns || 0);
  const ig = Math.max(0, ignoredCount || 0);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  let head;
  if (e > 0 && w > 0) head = `${plural(e, 'error')} + ${plural(w, 'warning')}`;
  else if (e > 0) head = plural(e, 'error');
  else if (w > 0) head = plural(w, 'warning');
  else head = 'No active issues';
  return ig > 0 ? `${head} (${ig} ignored)` : head;
}
