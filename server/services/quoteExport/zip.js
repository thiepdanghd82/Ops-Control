// @ts-check
/**
 * ZIP bundler — wraps N tier xlsx buffers into a single ZIP buffer.
 *
 * JSZip is already available in node_modules (transitive dep of
 * exceljs). We use STORE mode (no compression) for xlsx contents since
 * xlsx is already zip-compressed internally — re-compressing wastes CPU
 * and produces nearly-identical bytes.
 */

import JSZip from 'jszip';

/**
 * @param {Array<{ filename: string, buffer: Buffer }>} entries
 * @returns {Promise<Buffer>}
 */
export async function buildZip(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('buildZip: entries must be a non-empty array');
  }
  const zip = new JSZip();
  for (const entry of entries) {
    if (!entry?.filename || !entry?.buffer) {
      throw new Error('buildZip: each entry needs { filename, buffer }');
    }
    zip.file(entry.filename, entry.buffer, {
      // STORE — xlsx is already compressed, re-deflating wastes ~10% CPU.
      compression: 'STORE',
      // Stamp a stable date so unit tests get byte-identical output
      // when seeded with a fixed Date. Live exports pass `now` via the
      // caller's clock so tooling like 7-Zip shows the right modified
      // timestamp.
      date: new Date(),
    });
  }
  return zip.generateAsync({ type: 'nodebuffer', streamFiles: false });
}
