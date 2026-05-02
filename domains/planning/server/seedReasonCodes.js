/**
 * MES-2.1 — reason_code default seeds + integrity probe.
 *
 * The 8 default reason codes are also INSERT OR IGNORE'd by schema.sql
 * at boot, so this module is normally idempotent and unnecessary on a
 * healthy DB. It exists for two reasons:
 *
 *   1. `validateReasonCodeIntegrity(db)` is called from mountPlanning at
 *      boot to surface drift (someone deleted rows, label_vn left blank,
 *      bogus category landed via direct SQL, etc.). Returns the list of
 *      issue strings; mount logs them as warnings but does NOT throw —
 *      the kiosk surface just won't be able to pause-with-reason until
 *      ops fixes the data.
 *
 *   2. `seedReasonCodes(db)` is the programmatic re-seed entry point
 *      for recovery (KIOSK-002 admin-tool re-seed) and tests that build
 *      a DB without execing schema.sql wholesale.
 *
 * Both functions are pure-of-IO except for the SQL they run; no console
 * output here, leave that to the caller.
 */

export const DEFAULT_REASON_CODES = Object.freeze([
  {
    code: 'MACHINE_DOWN',
    label_en: 'Machine down',
    label_vn: 'Máy hỏng',
    category: 'downtime',
    sort_order: 10,
  },
  {
    code: 'MATERIAL_SHORT',
    label_en: 'Material shortage',
    label_vn: 'Thiếu vật tư',
    category: 'downtime',
    sort_order: 20,
  },
  {
    code: 'OPERATOR_BREAK',
    label_en: 'Operator break',
    label_vn: 'Nghỉ giải lao',
    category: 'planned',
    sort_order: 30,
  },
  {
    code: 'QUALITY_HOLD',
    label_en: 'Quality hold',
    label_vn: 'Giữ kiểm tra CL',
    category: 'quality',
    sort_order: 40,
  },
  {
    code: 'SETUP_CHANGEOVER',
    label_en: 'Setup / changeover',
    label_vn: 'Setup / chuyển job',
    category: 'planned',
    sort_order: 50,
  },
  {
    code: 'SHIFT_END',
    label_en: 'Shift end',
    label_vn: 'Hết ca',
    category: 'planned',
    sort_order: 60,
  },
  {
    code: 'MAINTENANCE_PLANNED',
    label_en: 'Planned maintenance',
    label_vn: 'Bảo trì có kế hoạch',
    category: 'planned',
    sort_order: 70,
  },
  {
    code: 'OTHER',
    label_en: 'Other (note required)',
    label_vn: 'Khác (cần ghi chú)',
    category: 'other',
    sort_order: 99,
  },
]);

const VALID_CATEGORIES = new Set(['downtime', 'quality', 'planned', 'other']);

export function seedReasonCodes(db, codes = DEFAULT_REASON_CODES) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO reason_code (code, label_en, label_vn, category, sort_order)
     VALUES (?, ?, ?, ?, ?)`
  );
  let inserted = 0;
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      const result = stmt.run(r.code, r.label_en, r.label_vn, r.category, r.sort_order);
      if (result.changes > 0) inserted += 1;
    }
  });
  tx(codes);
  return { inserted, total: codes.length };
}

/**
 * Returns an array of human-readable issue strings. Empty array = healthy.
 * Caller decides log level (mountPlanning logs as warn).
 */
export function validateReasonCodeIntegrity(db) {
  const issues = [];
  const rows = db
    .prepare('SELECT code, label_en, label_vn, category, active FROM reason_code')
    .all();

  if (rows.length < DEFAULT_REASON_CODES.length) {
    issues.push(`expected ≥${DEFAULT_REASON_CODES.length} reason_code rows, found ${rows.length}`);
  }
  const seenCodes = new Set();
  for (const r of rows) {
    if (seenCodes.has(r.code)) issues.push(`duplicate reason_code: ${r.code}`);
    seenCodes.add(r.code);
    if (!r.label_en || !r.label_en.trim()) issues.push(`reason_code ${r.code} missing label_en`);
    if (!r.label_vn || !r.label_vn.trim()) issues.push(`reason_code ${r.code} missing label_vn`);
    if (!VALID_CATEGORIES.has(r.category))
      issues.push(`reason_code ${r.code} has invalid category "${r.category}"`);
  }
  for (const def of DEFAULT_REASON_CODES) {
    if (!seenCodes.has(def.code)) issues.push(`default reason_code "${def.code}" missing`);
  }
  return issues;
}
