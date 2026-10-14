/**
 * saveFile — put a binary Blob on disk where the operator chooses.
 *
 * The quote export used a bare `<a download>`, which drops the file into the
 * browser's download folder with no say in it. Worse on the thin CLIENT: it
 * loads `http://<remote-ip>:3100`, which is NOT a secure context, and that
 * renderer's `<a download>` was already diagnosed as unreliable once — the
 * report was "CSV export did nothing on CLIENT" (see csvExport.js). The same
 * anchor was the export's ONLY path.
 *
 * SIBLING, AND THEY MUST BE CHANGED TOGETHER: `saveCsv` in `csvExport.js` runs
 * the same three-tier cascade for TEXT. It is not folded into this one because
 * it hands the bridge a string and its tests assert on that string; routing it
 * through a Blob would change what `ops:fs.writeFile` receives on a working,
 * operator-facing path for no behaviour gain. The shape that can drift is the
 * ORDER of the three tiers and the cancel semantics, so `saveFile.lint.test.js`
 * pins both files to the same order.
 *
 * Cancel returns `null` and writes NOTHING. It must never fall through to the
 * legacy download — a user who cancels a Save dialog and then finds the file in
 * Downloads anyway has been ignored, not helped.
 */

/** Filters for the native dialog, derived from the filename's extension. */
function filtersFor(name) {
  const ext = String(name || '')
    .split('.')
    .pop()
    .toLowerCase();
  const known = {
    xlsx: { name: 'Excel', extensions: ['xlsx'] },
    zip: { name: 'ZIP', extensions: ['zip'] },
    csv: { name: 'CSV', extensions: ['csv'] },
    pdf: { name: 'PDF', extensions: ['pdf'] },
  };
  const first = known[ext];
  return first
    ? [first, { name: 'Tất cả', extensions: ['*'] }]
    : [{ name: 'Tất cả', extensions: ['*'] }];
}

/**
 * @param {Blob} blob
 * @param {string} suggestedName
 * @param {{win?: object, doc?: object}} [deps] injection seam for tests
 * @returns {Promise<string|null>} the path/name written, or null if cancelled
 */
export async function saveBlob(blob, suggestedName, deps = {}) {
  const win = deps.win ?? (typeof window !== 'undefined' ? window : undefined);
  const doc = deps.doc ?? (typeof document !== 'undefined' ? document : undefined);

  // 1. Electron bridge — works on the embedded SERVER *and* the insecure thin
  // CLIENT, because the preload exposes window.ops whatever origin is loaded.
  // `ops:fs.writeFile` accepts a Uint8Array and only writes to a path the
  // dialog just returned (path whitelist in desktop/native/fs.js).
  const fsBridge = win && win.ops && win.ops.fs;
  if (
    fsBridge &&
    typeof fsBridge.showSaveDialog === 'function' &&
    typeof fsBridge.writeFile === 'function'
  ) {
    const res = await fsBridge.showSaveDialog({
      defaultPath: suggestedName,
      filters: filtersFor(suggestedName),
    });
    if (!res || res.canceled || !res.filePath) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await fsBridge.writeFile(res.filePath, bytes);
    return res.filePath;
  }

  // 2. Web secure context (https, or the loopback origin the embedded SERVER
  // serves). Undefined on the thin CLIENT, which is why tier 1 exists.
  if (win && typeof win.showSaveFilePicker === 'function') {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: suggestedName,
            accept: { [blob.type || '*/*']: ['.' + String(suggestedName).split('.').pop()] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return handle.name || suggestedName;
    } catch (err) {
      // Cancel is not an error and must not fall through to tier 3.
      if (err && (err.name === 'AbortError' || err.code === 20)) return null;
      throw err;
    }
  }

  // 3. Legacy fallback — browser download folder, no picker. Kept so a plain
  // browser with neither API still gets the file.
  if (!doc) return null;
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = suggestedName;
  doc.body.appendChild(a);
  a.click();
  doc.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return suggestedName;
}
