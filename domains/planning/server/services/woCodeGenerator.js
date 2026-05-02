/**
 * Work Order code generator — Sprint MES-1.3.
 *
 * Mints monotonic per-month WO codes of the form `WO-YYYY-MM-NNNNN`.
 * Counter resets at month boundary (UTC). Persistence: a single row per
 * year-month in `wo_code_seq` (PK on year_month). Read+update happen in
 * the same `db.transaction()` so two concurrent generates can't collide
 * on the same NNNNN.
 *
 * Factory: `createWoCodeGenerator(db)` so tests can drive an in-memory
 * SQLite without going through connection.js's singleton.
 */

export function createWoCodeGenerator(db) {
  const ensureRow = db.prepare('INSERT OR IGNORE INTO wo_code_seq (year_month) VALUES (?)');
  const bump = db.prepare(
    'UPDATE wo_code_seq SET last_n = last_n + 1, updated_at = CURRENT_TIMESTAMP WHERE year_month = ?'
  );
  const read = db.prepare('SELECT last_n FROM wo_code_seq WHERE year_month = ?');

  const tx = db.transaction((ym) => {
    ensureRow.run(ym);
    bump.run(ym);
    return read.get(ym).last_n;
  });

  /**
   * @param {Date} [now] — defaults to new Date(); injectable for month-rollover tests
   * @returns {string} `WO-YYYY-MM-NNNNN`
   */
  function generateCode(now = new Date()) {
    const year = String(now.getUTCFullYear()).padStart(4, '0');
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const ym = `${year}-${month}`;
    const n = tx(ym);
    return `WO-${ym}-${String(n).padStart(5, '0')}`;
  }

  return { generateCode };
}
