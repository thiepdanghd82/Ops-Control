// @ts-check
/**
 * drawingFiles — pure list+active model for multi-drawing attachments.
 *
 * Each drawing "kind" (layout / customer_drw) is stored on the calc state
 * (Std cover) or a subproduct (Cpx) as:
 *     [kind]_files:  [{ name, type, dataUrl }, ...]
 *     [kind]_active: <index into files>
 * with the LEGACY singular field mirrored to the active element:
 *     [kind]_file:   files[active] ?? null
 *
 * The mirror is the whole point of this module: exporter, QuoteHistory's
 * "layout attached" icon, and FileUploadZone's active-file preview all read
 * the singular field and keep working unchanged — the list is additive.
 *
 * Everything here is pure + framework-free so it unit-tests under vanilla
 * node:test (the repo has no React test harness).
 */

/** @typedef {{ name?: string, type?: string, dataUrl?: string }} DrawFile */

export const DRAWING_KINDS = {
  layout: { list: 'layout_files', active: 'layout_active', singular: 'layout_file' },
  customer_drw: {
    list: 'customer_drw_files',
    active: 'customer_drw_active',
    singular: 'customer_drw_file',
  },
};

function isFileObj(f) {
  return !!f && typeof f === 'object' && !Array.isArray(f);
}

/** Clamp an active index into [0, len-1]; 0 when the list is empty/invalid. */
export function clampActive(files, active) {
  const n = Array.isArray(files) ? files.length : 0;
  if (n === 0) return 0;
  const i = Math.floor(Number(active));
  if (!Number.isFinite(i) || i < 0) return 0;
  if (i >= n) return n - 1;
  return i;
}

/** The active file object (mirror), or null for an empty list. */
export function mirrorActive(files, active) {
  if (!Array.isArray(files) || files.length === 0) return null;
  return files[clampActive(files, active)] ?? null;
}

/** Append a file to the list (never replaces). Ignores non-object input. */
export function appendDrawing(files, file) {
  const list = Array.isArray(files) ? files : [];
  if (!isFileObj(file)) return list;
  return [...list, file];
}

/**
 * Remove the file at `idx` and re-point active:
 *   - removing the active file → first remaining (index 0);
 *   - removing a file before the active → active shifts left by one;
 *   - removing a file after the active → active unchanged.
 * Returns { files, active } with active clamped to the new length.
 */
export function removeDrawingAt(files, active, idx) {
  const list = Array.isArray(files) ? files : [];
  if (idx < 0 || idx >= list.length) {
    return { files: list, active: clampActive(list, active) };
  }
  const next = list.filter((_, i) => i !== idx);
  let a = clampActive(list, active);
  if (idx < a) a -= 1;
  else if (idx === a) a = 0;
  return { files: next, active: clampActive(next, a) };
}

/** The target file at `idx` (null when out of range) — used so per-thumbnail
 *  actions operate on THAT file, never the active one. */
export function targetFileAt(files, idx) {
  if (!Array.isArray(files) || idx < 0 || idx >= files.length) return null;
  return files[idx] ?? null;
}

/**
 * Build the reducer patch for one kind: list + active + singular mirror,
 * all consistent. Merge this into stdState or a subproduct.
 */
export function buildDrawingPatch(kind, files, active) {
  const meta = DRAWING_KINDS[kind];
  if (!meta) return {};
  const list = Array.isArray(files) ? files : [];
  const a = clampActive(list, active);
  return {
    [meta.list]: list,
    [meta.active]: a,
    [meta.singular]: mirrorActive(list, a),
  };
}

/**
 * Idempotent heal-on-read for ONE kind on a plain object (state or SP):
 *   - a legacy single [kind]_file with an empty list → wrap into [file], 0;
 *   - an existing list → re-mirror singular = files[active];
 *   - neither → empty list, active 0, singular null.
 * Returns the SAME reference when already consistent so the React-memo
 * short-circuit in the migrators stays intact.
 */
export function healDrawingKind(obj, kind) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const meta = DRAWING_KINDS[kind];
  const rawList = obj[meta.list];
  const hasList = Array.isArray(rawList) && rawList.length > 0;
  const singular = obj[meta.singular];

  let files;
  if (hasList) files = rawList;
  else if (isFileObj(singular)) files = [singular];
  else files = Array.isArray(rawList) ? rawList : [];

  const active = clampActive(files, obj[meta.active]);
  const mirror = mirrorActive(files, active);

  if (obj[meta.list] === files && obj[meta.active] === active && obj[meta.singular] === mirror) {
    return obj;
  }
  return { ...obj, [meta.list]: files, [meta.active]: active, [meta.singular]: mirror };
}

/** Heal both drawing kinds on one object. Idempotent. */
export function healDrawings(obj) {
  let out = healDrawingKind(obj, 'layout');
  out = healDrawingKind(out, 'customer_drw');
  return out;
}

/**
 * Decide how to open a target file in a new window. PURE — the caller
 * executes the returned action, so both branches are unit-testable:
 *   { mode: 'bridge', b64, ext } → window.ops.shell.openExternalFile(b64, ext)
 *   { mode: 'window' }           → build a blob URL from the bytes + window.open
 *   { mode: 'none' }             → nothing openable
 */
export function resolveOpenAction(file, hasBridge) {
  if (!isFileObj(file) || typeof file.dataUrl !== 'string') return { mode: 'none' };
  const m = /^data:([^;]+);base64,(.+)$/.exec(file.dataUrl);
  if (!m) return { mode: 'none' };
  const mime = m[1];
  if (hasBridge) {
    const ext =
      mime === 'application/pdf'
        ? '.pdf'
        : mime.startsWith('image/')
          ? '.' + mime.slice(6).split('+')[0]
          : '.bin';
    return { mode: 'bridge', b64: m[2], ext };
  }
  return { mode: 'window' };
}
