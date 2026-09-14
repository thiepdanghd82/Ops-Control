// @ts-check
/**
 * Pieces the eager provider and the lazy PickerCard both need.
 *
 * Deliberately imports NOTHING from LibraryPicker.norm.js: the provider
 * wraps the whole app, so anything reachable from here lands in the app
 * shell. The right-click menu only needs each library's name, so the
 * normalizers and the column tables stay in the lazy card's chunk.
 */

export const WIDTH_KEY = 'ops_picker_colw';

export const HIDDEN_KEY = 'ops_picker_colhide';

/** What the right-click menu needs: which libraries exist, and their names. */
export const LIBRARIES = [
  { key: 'npi', labelKey: 'picker.lib.npi', source: 'npi' },
  { key: 'sourcing', labelKey: 'picker.lib.sourcing', source: 'sourcing' },
  { key: 'ifs', labelKey: 'picker.lib.ifs', source: 'ifs' },
];

export function matches(row, q) {
  if (!q) return true;
  const hay = (row.code + ' ' + row.desc + ' ' + row.supplier + ' ' + row.extra).toLowerCase();
  return hay.includes(q);
}

export function fmtPrice(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  if (v === 0) return '';
  return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}
