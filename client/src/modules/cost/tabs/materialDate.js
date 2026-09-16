/**
 * Date helpers for the Material Cost libraries.
 *
 * Two problems live in this one field, and they are related.
 *
 * 1. `Update Date` (NPI) and `Req. Date` (Sourcing) opened BLANK on a new row
 *    — the add modal is mounted with `row={{}}` — so every entry was typed by
 *    hand, in whatever shape the typist felt like. The library shows it: of
 *    3059 NPI rows, 2115 are `YYYY-MM-DD`, 754 say literally "Old", 91 say
 *    "DAP", and the rest are a scatter of other shapes.
 *
 * 2. The "All years" filter never worked. The dropdown was built from the LAST
 *    four characters (`String(r.date).slice(-4)`) while the filter matched the
 *    FIRST (`startsWith`). On the dominant `YYYY-MM-DD` that yields "9-16" as
 *    a "year", which then matches nothing: 289 options in the NPI dropdown and
 *    67 in Sourcing, every single one of them filtering to zero rows.
 *
 * Auto-filling without fixing (2) would just have added one more junk option.
 */

/** Pad to two digits — `String.padStart` on a number needs the cast anyway. */
function p2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Today as `YYYY-MM-DD`, in the operator's LOCAL timezone.
 *
 * Deliberately not `toISOString().slice(0,10)`: that is UTC, and this box runs
 * at UTC+7, so any save before 07:00 local would stamp yesterday. The fleet
 * table shipped exactly that bug once already (PR #296) — a date is what the
 * person in the room would write, not what Greenwich would.
 */
export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Today as `YYYY-MM` — the shape 1928 of 2234 Sourcing rows already use. */
export function todayMonthISO(d = new Date()) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
}

/**
 * The year inside a free-text date cell, or '' when there is none.
 *
 * Has to cope with what is actually in the library rather than one format:
 * `2026-09-16`, `2026.09.16`, `16.09.2026` and `9.2026` all mean 2026, while
 * "Old", "DAP" and "Old info" mean no year at all and must NOT become options.
 *
 * Anchored on a plausible century (19/20/21) so a stray `0916` cannot pass as
 * a year, and it finds the run wherever it sits — leading in ISO, trailing in
 * the European shapes.
 */
export function yearOf(value) {
  const m = /(?:19|20|21)\d{2}/.exec(String(value ?? ''));
  return m ? m[0] : '';
}

/** Descending list of the real years present — dropdown options. */
export function yearOptions(rows, field) {
  const set = new Set();
  for (const r of rows || []) {
    const y = yearOf(r?.[field]);
    if (y) set.add(y);
  }
  return [...set].sort().reverse();
}

/**
 * A sortable key for a free-text date cell: `YYYYMMDD` as a number, or `null`
 * when the cell does not START with a date.
 *
 * Anchored at the start on purpose. Measured on the live NPI library (3061
 * rows): 2116 are `YYYY-MM-DD`, 754 say "Old", 91 say "DAP", 15 are `7.2023`
 * (month.year, no day), and a handful are `26.05.2025 (add 20% on 1.4.2026)` —
 * a real update date followed by a pricing note. Two rows are ONLY the note,
 * `(add 15% on 1.4.2026)`.
 *
 * A "first date anywhere in the string" rule reads those two as 2026-04-01 and
 * files them among the newest rows, which is exactly wrong: they carry no
 * update date at all. Anchoring gets both cases right for free — the update
 * date is what the cell begins with, anything after it is commentary.
 *
 * Missing parts sort low within their year (`7.2023` -> 20230700, `2023` ->
 * 20230000), so a month-only row lands before any dated row in that month
 * rather than pretending to be the 1st.
 */
export function dateSortKey(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const Y = '(?:19|20|21)\\d{2}';
  let m;
  // YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
  if ((m = new RegExp(`^(${Y})[./-](\\d{1,2})[./-](\\d{1,2})`).exec(s)))
    return +m[1] * 10000 + +m[2] * 100 + +m[3];
  // DD.MM.YYYY / DD/MM/YYYY — European, day first
  if ((m = new RegExp(`^(\\d{1,2})[./-](\\d{1,2})[./-](${Y})`).exec(s)))
    return +m[3] * 10000 + +m[2] * 100 + +m[1];
  // YYYY-MM
  if ((m = new RegExp(`^(${Y})[./-](\\d{1,2})(?![\\d./-])`).exec(s)))
    return +m[1] * 10000 + +m[2] * 100;
  // M.YYYY — two numbers, the second a year (e.g. `7.2023`)
  if ((m = new RegExp(`^(\\d{1,2})[./-](${Y})(?![\\d./-])`).exec(s)))
    return +m[2] * 10000 + +m[1] * 100;
  // A bare year
  if ((m = new RegExp(`^(${Y})(?![\\d./-])`).exec(s))) return +m[1] * 10000;
  return null;
}

/**
 * Sort rows by a free-text date field. Returns a NEW array; the input is left
 * alone so React sees a changed reference.
 *
 * Rows with no readable date ("Old", "DAP", blank — 850 of them) stay together
 * at the BOTTOM in BOTH directions, keeping their existing relative order.
 * Floating them to the top on an ascending sort would bury the genuinely
 * oldest entries under 850 rows of "Old", which is the opposite of what
 * sorting by date is for.
 */
export function sortByDate(rows, dir, field = 'date') {
  const list = Array.isArray(rows) ? rows : [];
  const sign = dir === 'asc' ? 1 : -1;
  // `sort` is stable, so equal keys — and the whole undated block — keep the
  // order they arrived in.
  return [...list].sort((a, b) => {
    const ka = dateSortKey(a?.[field]);
    const kb = dateSortKey(b?.[field]);
    if (ka == null && kb == null) return 0;
    if (ka == null) return 1; // undated always last
    if (kb == null) return -1;
    return (ka - kb) * sign;
  });
}
