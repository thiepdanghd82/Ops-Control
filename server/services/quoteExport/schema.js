// @ts-check
/**
 * `_Schema` hidden payload sheet (MVP-2 Item B).
 *
 * Persists the full `quote.state` as a chunked, gzip-compressed, base64
 * payload so MVP-3 re-importer can reconstruct the exact state at export
 * time without ambiguity. Layout (per cell, all in row 1):
 *
 *   _Schema!A0   HMAC-SHA256 of decoded payload bytes (hex)
 *                Stamped by hmac.js AFTER this sheet is built.
 *   _Schema!A1   Manifest JSON: {"chunks":N,"sha256":"...","alg":"gzip+b64"}
 *                Where sha256 = hex(SHA-256(decoded payload bytes)).
 *   _Schema!B1   Chunk 1 of base64-encoded gzip payload
 *   _Schema!C1   Chunk 2
 *   …
 *
 * Chunk size cap: 30000 chars per cell. ExcelJS's hard cap is 32767;
 * 30000 leaves ~2.7K headroom for XML escaping (`<`, `>`, `&`) in the
 * underlying SharedStrings table.
 *
 * Note: ExcelJS doesn't expose a `row 0` — row indexing is 1-based. We
 * call the HMAC cell "A0" by convention (it's actually `_Schema!A2` for
 * row layout reasons): A1 holds the manifest, A2 holds the HMAC, then
 * B1..Z1 hold the chunks. The "A0" name in this comment + tests is the
 * forensic-paper name; the actual cell ref is A2. Documented this way
 * so MVP-3 importer doesn't get confused.
 *
 * Sheet visibility = 'hidden' (same protection model as _Audit).
 */

import crypto from 'node:crypto';
import zlib from 'node:zlib';

const SCHEMA_SHEET_NAME = '_Schema';
export const CHUNK_SIZE = 30000;
const MANIFEST_CELL = 'A1';
const HMAC_CELL = 'A2';
const FIRST_CHUNK_COL = 2; // col B = idx 2

/**
 * Canonicalize an object's JSON representation: stable key order at
 * every nesting level. Used so that two structurally-identical state
 * objects produce byte-identical hashes regardless of save-order
 * variance.
 *
 * @param {unknown} obj
 * @returns {string}
 */
export function canonicalStringify(obj) {
  return JSON.stringify(obj, replacer());
}

function replacer() {
  return function (key, value) {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) return value;
    const sorted = {};
    for (const k of Object.keys(value).sort()) sorted[k] = value[k];
    return sorted;
  };
}

/**
 * Encode the state into the wire format:
 *   payload  = gzip(canonicalStringify(state))   // Buffer
 *   b64      = base64(payload)
 *   chunks   = b64 split into CHUNK_SIZE-char strings
 *   sha256   = hex(SHA-256(payload))
 *
 * @param {object} state — quote.state (any JSON-serializable object)
 * @returns {{ payload: Buffer, chunks: string[], sha256: string, manifest: {chunks:number,sha256:string,alg:string} }}
 */
export function encodeSchemaPayload(state) {
  const json = canonicalStringify(state ?? {});
  const payload = zlib.gzipSync(Buffer.from(json, 'utf8'));
  const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
  const b64 = payload.toString('base64');
  const chunks = [];
  for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
    chunks.push(b64.slice(i, i + CHUNK_SIZE));
  }
  const manifest = { chunks: chunks.length, sha256, alg: 'gzip+b64' };
  return { payload, chunks, sha256, manifest };
}

/**
 * Build the _Schema sheet from encoded payload. HMAC cell (A2) stays
 * empty here — caller fills it after via hmac.js#stampHmac.
 *
 * @param {import('exceljs').Workbook} wb
 * @param {ReturnType<typeof encodeSchemaPayload>} encoded
 */
export function buildSchemaSheet(wb, encoded) {
  const sheet = wb.addWorksheet(SCHEMA_SHEET_NAME, { state: 'hidden' });
  sheet.getCell(MANIFEST_CELL).value = JSON.stringify(encoded.manifest);
  // HMAC stamped later by hmac.js — placeholder ensures the cell exists.
  sheet.getCell(HMAC_CELL).value = '';
  encoded.chunks.forEach((chunk, idx) => {
    const cell = sheet.getRow(1).getCell(FIRST_CHUNK_COL + idx);
    cell.value = chunk;
    if (chunk.length > 32767) {
      throw new Error(
        `_Schema chunk ${idx} exceeds Excel cell limit (${chunk.length} > 32767). ` +
          `Bug — chunker should have split smaller.`
      );
    }
  });
  return sheet;
}

/**
 * Read manifest + reassemble chunks → decoded payload Buffer. Verifies
 * the manifest's sha256 against the recomputed hash; throws on mismatch.
 *
 * @param {import('exceljs').Workbook} wb
 * @returns {{ payload: Buffer, manifest: {chunks:number,sha256:string,alg:string}, hmac: string }}
 */
export function readSchemaSheet(wb) {
  const sheet = wb.getWorksheet(SCHEMA_SHEET_NAME);
  if (!sheet) throw new Error('_Schema sheet not found');
  const manifestRaw = sheet.getCell(MANIFEST_CELL).value;
  if (!manifestRaw) throw new Error('_Schema manifest cell empty');
  const manifest = JSON.parse(String(manifestRaw));
  if (!manifest || !manifest.chunks || !manifest.sha256) {
    throw new Error('_Schema manifest malformed');
  }
  const hmac = String(sheet.getCell(HMAC_CELL).value || '');
  const parts = [];
  for (let i = 0; i < manifest.chunks; i++) {
    const cell = sheet.getRow(1).getCell(FIRST_CHUNK_COL + i);
    const v = cell.value;
    if (v == null || v === '') {
      throw new Error(`_Schema chunk ${i} empty (expected ${manifest.chunks} chunks)`);
    }
    parts.push(String(v));
  }
  const b64 = parts.join('');
  const payload = Buffer.from(b64, 'base64');
  const actualSha = crypto.createHash('sha256').update(payload).digest('hex');
  if (actualSha !== manifest.sha256) {
    throw new Error(
      `_Schema integrity mismatch: manifest sha256=${manifest.sha256} ` +
        `but recomputed sha256=${actualSha}`
    );
  }
  return { payload, manifest, hmac };
}

/**
 * Decode payload buffer → original state object. Caller should pair
 * this with readSchemaSheet's integrity-checked payload.
 *
 * @param {Buffer} payload
 * @returns {object}
 */
export function decodePayload(payload) {
  const json = zlib.gunzipSync(payload).toString('utf8');
  return JSON.parse(json);
}

export const _internal = { SCHEMA_SHEET_NAME, MANIFEST_CELL, HMAC_CELL, FIRST_CHUNK_COL };
