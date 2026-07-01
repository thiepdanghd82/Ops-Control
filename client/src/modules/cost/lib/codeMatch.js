/**
 * Tolerant code ↔ library matching (CLAUDE.md Lesson 32 — code↔library layer).
 *
 * Shared by the Lead time & Notice Materials MOQ table (NPI by `name`, IFS by
 * `part_no`) and the Materials auto-fill handlers (Std + Cpx, lib.mat by `code`).
 *
 * Bare `String(a).trim().toLowerCase() === …` only collapses whitespace RUNS at
 * the ENDS. An INTERNAL space (or en/em-dash vs hyphen, or a trailing `*`)
 * present in one string but not the other still breaks the join silently —
 * e.g. row code "JKD PSC701-10B-NT" vs NPI name "JKD PSC 701-10B-NT", or quote
 * code "3M 9183" vs library "3m9183", or "PET SB50(A)PA-T111LLY*" vs the non-`*`
 * library row. `normCode` removes ALL whitespace + folds dashes/case/trailing-`*`.
 *
 * Keep this module React-free so vanilla node:test can import it directly.
 */

/**
 * Normalize a material/part code for tolerant equality.
 * NFKC → en/em/figure-dash + minus → hyphen → remove ALL whitespace →
 * lowercase → strip trailing `*` markers.
 */
export function normCode(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[‐-―−]/g, '-') // en/em/figure dashes + minus → hyphen
    .replace(/\s+/g, '') // remove ALL whitespace (PSC 701 → PSC701)
    .toLowerCase()
    .replace(/\*+$/, ''); // strip trailing '*' markers (NPI names use them)
}

/**
 * Resolve a library row for `key` from `rows` keyed by `field`, EXACT-first then
 * a normalized fallback. Returns { row, fuzzy, ambiguous }:
 *  - exact trim+lowercase equality always wins (zero false-positive risk);
 *  - else normCode() equality — one distinct match → { fuzzy:true };
 *  - MORE THAN ONE distinct library row normalizing to the key → do NOT guess:
 *    { ambiguous:true, row:null } so the caller keeps "—" + flags the row.
 */
export function resolveLibRow(rows, field, key) {
  if (!Array.isArray(rows)) return { row: null, fuzzy: false, ambiguous: false };
  const keyLc = String(key).trim().toLowerCase();
  const exact = rows.find(
    (r) =>
      r &&
      String(r[field] ?? '')
        .trim()
        .toLowerCase() === keyLc
  );
  if (exact) return { row: exact, fuzzy: false, ambiguous: false };
  const nkey = normCode(key);
  if (!nkey) return { row: null, fuzzy: false, ambiguous: false };
  const hits = rows.filter((r) => r && normCode(r[field]) === nkey);
  if (hits.length === 0) return { row: null, fuzzy: false, ambiguous: false };
  // Distinct = different original field values (true dupes are not ambiguous).
  const distinct = new Set(
    hits.map((r) =>
      String(r[field] ?? '')
        .trim()
        .toLowerCase()
    )
  );
  if (distinct.size > 1) return { row: null, fuzzy: false, ambiguous: true };
  return { row: hits[0], fuzzy: true, ambiguous: false };
}
