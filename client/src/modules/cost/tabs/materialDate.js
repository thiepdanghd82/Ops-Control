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
