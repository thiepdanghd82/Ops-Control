// @ts-check
/**
 * HMAC-SHA256 signing for `_Schema` payload (MVP-2 Item C).
 *
 * Symmetric HMAC with `OPS_EXPORT_HMAC_KEY` (32-byte server secret).
 * Why symmetric, not Ed25519 / asymmetric:
 *   - We need to verify "this xlsx came from THIS server install",
 *     NOT "this xlsx came from a particular signer in a chain of trust".
 *   - HMAC is faster, simpler to deploy, and no key-distribution
 *     problem (the same box that signs also verifies).
 *
 * Threat model:
 *   - SHA-256 alone (already in _Schema manifest) is an accidental-edit
 *     guard. An attacker can recompute the manifest hash after tampering
 *     so manifest+content stay consistent, defeating that gate.
 *   - HMAC requires the server's secret key. An attacker without the
 *     key cannot forge a valid signature, even with full file access.
 *
 * Sign HMAC over the DECODED payload Buffer (not the base64 string)
 * so the signature is invariant under base64 alphabet drift between
 * tools / OSes (theoretical risk; in practice Node + Excel produce
 * identical b64 but the contract is cleaner this way).
 *
 * Caller flow:
 *   1. encodeSchemaPayload(state) → {payload, ...}
 *   2. buildSchemaSheet(wb, encoded)
 *   3. stampHmac(wb, payload, key)        // fills _Schema!A2
 *   4. workbook.xlsx.writeBuffer()
 *
 * Verify flow (test + MVP-3 importer):
 *   1. readSchemaSheet(wb) → {payload, manifest, hmac}
 *   2. verifyHmac(payload, hmac, key) → true | throws
 */

import crypto from 'node:crypto';
import { _internal as _schemaInternal } from './schema.js';

const { SCHEMA_SHEET_NAME, HMAC_CELL } = _schemaInternal;

/**
 * Validate the configured HMAC key shape. Throws with a fix-it message
 * if missing / too short. Called once at module init from index.js.
 *
 * @param {string|undefined} key
 * @returns {string}  the key (returned for fluent use)
 */
export function assertHmacKey(key) {
  if (!key || typeof key !== 'string') {
    throw new Error(
      'OPS_EXPORT_HMAC_KEY is missing. Generate with: ' +
        `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      `OPS_EXPORT_HMAC_KEY must be 64 hex chars (32 bytes); got length=${key.length}.`
    );
  }
  return key;
}

/**
 * Compute HMAC-SHA256 of payload bytes under hexKey.
 *
 * @param {Buffer} payload
 * @param {string} hexKey  64-char hex string
 * @returns {string}  64-char hex digest
 */
export function computeHmac(payload, hexKey) {
  assertHmacKey(hexKey);
  return crypto.createHmac('sha256', Buffer.from(hexKey, 'hex')).update(payload).digest('hex');
}

/**
 * Stamp HMAC onto `_Schema!A2`. Caller must have already built the
 * schema sheet via buildSchemaSheet().
 *
 * @param {import('exceljs').Workbook} wb
 * @param {Buffer} payload
 * @param {string} hexKey
 */
export function stampHmac(wb, payload, hexKey) {
  const hmac = computeHmac(payload, hexKey);
  const sheet = wb.getWorksheet(SCHEMA_SHEET_NAME);
  if (!sheet) throw new Error('_Schema sheet must exist before stampHmac');
  sheet.getCell(HMAC_CELL).value = hmac;
  return hmac;
}

/**
 * Verify HMAC. Uses timing-safe comparison so a verifier exposed at a
 * network boundary (MVP-3 importer) can't be brute-forced char-by-char.
 *
 * @param {Buffer} payload
 * @param {string} stampedHmac  hex value pulled from _Schema!A2
 * @param {string} hexKey       server's current key
 * @returns {true}              on success; throws otherwise
 */
export function verifyHmac(payload, stampedHmac, hexKey) {
  assertHmacKey(hexKey);
  if (!stampedHmac || typeof stampedHmac !== 'string') {
    throw new Error('HMAC missing from _Schema!A2 (xlsx is pre-MVP-2 or tampered)');
  }
  const expected = computeHmac(payload, hexKey);
  // Buffer.from(hex, 'hex') is silently lenient on bad chars; compare
  // as Buffers of equal length for timing-safe semantics.
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(stampedHmac, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error(
      'HMAC verification failed — xlsx was tampered after export, ' +
        'OR the server key differs from the one that signed this xlsx.'
    );
  }
  return true;
}
