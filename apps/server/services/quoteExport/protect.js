// @ts-check
/**
 * Per-sheet password protection (MVP-2 Item D).
 *
 * Speed-bump only — ExcelJS uses Microsoft's XOR cipher which is
 * trivially breakable. The REAL tamper-detection is HMAC over _Schema
 * (see hmac.js). What this gives us:
 *   - Customer can OPEN + READ the workbook without entering anything.
 *   - Customer cannot edit cells without the password.
 *   - Hidden _Audit + _Schema sheets stay protected once unhidden,
 *     so a power-user who unhides them via right-click still can't
 *     edit the metadata to forge a tampered xlsx that passes naive
 *     "compare audit-cell to expected" gates.
 *
 * NB: ExcelJS does NOT support workbook-level OPEN-password encryption
 * (the Microsoft Compound Document format). "Password protection" in
 * this module = per-sheet protection. Document this explicitly so
 * future auditors don't confuse "password to open" with "password to
 * edit".
 */

import crypto from 'node:crypto';

// Protection options — locked: customer can navigate + read + select
// + auto-filter + sort, but cannot edit, format, insert, delete, or
// alter the sheet structure.
const PROTECT_OPTIONS = Object.freeze({
  selectLockedCells: true,
  selectUnlockedCells: true,
  formatCells: false,
  formatColumns: false,
  formatRows: false,
  insertRows: false,
  insertColumns: false,
  insertHyperlinks: false,
  deleteRows: false,
  deleteColumns: false,
  sort: true,
  autoFilter: true,
  pivotTables: false,
});

/**
 * Generate a fresh 16-byte hex password. NOT logged anywhere; only
 * sha256(password) goes to the audit trail (forensic-trace only).
 *
 * @returns {string}  32-char hex string
 */
export function generateWorkbookPassword() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Apply per-sheet protection to every worksheet in the workbook. Must
 * run AFTER all sheets are built — sheet.protect() finalizes the sheet
 * state, and subsequent style/value mutations may be silently rejected.
 *
 * @param {import('exceljs').Workbook} wb
 * @param {string} password
 * @returns {Promise<{password: string, passwordHash: string, protectedCount: number}>}
 */
export async function protectAllSheets(wb, password) {
  if (!password || typeof password !== 'string') {
    throw new Error('protectAllSheets requires a non-empty password string');
  }
  let count = 0;
  // worksheets array iteration covers hidden sheets too.
  for (const sheet of wb.worksheets) {
    // sheet.protect is async in exceljs; awaits the XOR cipher hash.
    await sheet.protect(password, PROTECT_OPTIONS);
    count += 1;
  }
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  return { password, passwordHash, protectedCount: count };
}

export const _internal = { PROTECT_OPTIONS };
