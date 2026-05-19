// @ts-check
/**
 * Round-trip verifier for MVP-2 exports (test-only; precursor to MVP-3
 * importer).
 *
 * Scope:
 *   - Reads `_Audit` + `_Schema` from a workbook buffer.
 *   - Verifies _Schema integrity (manifest sha256 against recomputed).
 *   - Verifies HMAC against the configured server key.
 *   - Decodes payload → returns reconstructed `quote.state`.
 *
 * NOT in scope:
 *   - Re-import / diff / apply: that's MVP-3. This helper exists so
 *     MVP-2 tests can prove the export round-trips, AND so the MVP-3
 *     author has a stable starting point.
 *
 * IMPORTANT — what HMAC catches vs misses:
 *   ✅ Catches: any mutation to _Schema chunk cells or HMAC cell.
 *   ❌ Misses: mutations to VISIBLE sheets (Materials!E5, etc.) that
 *      don't touch _Schema. MVP-3's re-import step will detect this
 *      class of tampering by comparing visible-cell-derived state vs
 *      _Schema-decoded state. Do not interpret HMAC-pass as
 *      "workbook is fully unmodified".
 */

import ExcelJS from 'exceljs';
import { readSchemaSheet, decodePayload } from './schema.js';
import { verifyHmac } from './hmac.js';
import { readAuditSheet } from './audit.js';

/**
 * @typedef {object} VerifyResult
 * @property {object} state            decoded quote.state
 * @property {object} audit            10-key audit metadata (raw strings)
 * @property {string} hmac             HMAC stamped on _Schema!A2
 * @property {{chunks:number,sha256:string,alg:string}} manifest
 */

/**
 * @param {Buffer} xlsxBuffer
 * @param {string} hexKey  64-char hex (server's OPS_EXPORT_HMAC_KEY)
 * @returns {Promise<VerifyResult>}
 */
export async function verifyExport(xlsxBuffer, hexKey) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsxBuffer);

  const audit = readAuditSheet(wb);
  if (!audit) {
    throw new Error(
      'Workbook has no _Audit sheet — pre-MVP-2 export OR _Audit was removed. ' +
        'Cannot verify integrity.'
    );
  }

  const { payload, manifest, hmac } = readSchemaSheet(wb);
  verifyHmac(payload, hmac, hexKey); // throws on mismatch
  const state = decodePayload(payload);

  return { state, audit, hmac, manifest };
}
