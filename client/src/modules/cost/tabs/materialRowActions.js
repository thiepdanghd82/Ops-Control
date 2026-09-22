/**
 * Seed for the Add modal when the operator copies an existing material row.
 *
 * Two decisions live here rather than at the three call sites.
 *
 * 1. THE NAME GETS A SUFFIX, and it is not decoration. Material names are a
 *    JOIN KEY: `resolveLibRow` matches a quote's material code against the
 *    library by name, and when more than one row normalises to the same key
 *    its ambiguity guard refuses to pick either and blanks the row's library
 *    columns (Lesson 32). Seeding the name verbatim is the one input that
 *    would produce that collision, and it would surface later, on someone
 *    else's quote, as missing data rather than as a duplicate row.
 *
 * 2. THE SUFFIX IS NOT TRANSLATED. It ends up inside a material name, which
 *    is data — it reaches quotes, the xlsx export and that same join. A
 *    localised suffix would make the same copy produce a different name
 *    depending on who was logged in, so two operators duplicating one row
 *    would create two rows that no longer match each other.
 *
 * `fresh` is the SAME object the tab already uses for a blank Add, passed in
 * rather than reconstructed: each tab means something different by "new"
 * (NPI stamps today's date and a currency, Sourcing stamps the month, IFS has
 * neither), and a copy is a new row. Inheriting the source's Update Date
 * would date a row created today as 2024 — the shape that put three 2029
 * dates in the live library.
 *
 * @param {object} row        the row being copied
 * @param {string} nameField  'name' (NPI) | 'part_no' (IFS) | 'material' (Sourcing)
 * @param {object} fresh      the tab's own blank-row seed
 * @returns {object} seed for the Add modal — NOT yet saved
 */
export function copySeed(row, nameField, fresh = {}) {
  const src = row && typeof row === 'object' ? row : {};
  const name = String(src[nameField] ?? '').trim();
  return {
    ...src,
    ...fresh,
    [nameField]: name ? `${name} (copy)` : '',
  };
}
