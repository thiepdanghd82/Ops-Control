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
  // JSZip keys its files by path, so calling .file() twice with one name
  // REPLACES the first — an entry disappears with nothing thrown. That is
  // reachable: build1TierName puts the MOQ VALUE in the name, not the tier
  // index, so a quote whose tiers share a MOQ (quote #27 has two at 250000)
  // produced one workbook for two tiers. De-duplicate here rather than in
  // filenames.js: this is the choke point every export passes through, and
  // the CSV path reuses the same per-tier name as its prefix.
  const used = new Set();
  for (const entry of entries) {
    if (!entry?.filename || !entry?.buffer) {
      throw new Error('buildZip: each entry needs { filename, buffer }');
    }
    const name = uniqueName(entry.filename, used);
    zip.file(name, entry.buffer, {
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

/**
 * First occurrence keeps the name it was given, so the ordinary one-name-per
 * tier case is byte-identical to before. Later collisions get " (2)", " (3)"
 * inserted before the LAST extension, which is what a file manager would do
 * and what Excel will still open.
 *
 * @param {string} filename
 * @param {Set<string>} used  mutated — names already placed in this zip
 * @returns {string}
 */
function uniqueName(filename, used) {
  if (!used.has(filename)) {
    used.add(filename);
    return filename;
  }
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  for (let n = 2; ; n += 1) {
    const candidate = `${stem} (${n})${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}
