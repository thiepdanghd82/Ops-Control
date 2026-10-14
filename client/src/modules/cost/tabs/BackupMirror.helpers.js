/**
 * Pure helpers for the Mirror card in Settings → Backup (BackupMirrorCard).
 * Kept out of the component so they can be tested without a renderer.
 */

const KNOWN_ERRORS = new Set([
  'not_absolute',
  'missing',
  'not_directory',
  'inside_data',
  'not_writable',
  'not_configured',
  'running',
]);

/** "512 MB" / "60.4 GB" — 1024-based, one decimal for GB. */
export function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—';
  const mb = n / 1024 / 1024;
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** The i18n key for a server error code from the mirror routes. */
export function mirrorErrorKey(code) {
  return KNOWN_ERRORS.has(code) ? `set.mirror.err.${code}` : 'set.mirror.err.generic';
}

/**
 * The volumes to offer, with the saved destination selected. A saved folder
 * that is not one of the volumes (a folder on the Mac's own disk) is reported
 * as `customSelected` so the card can show it in the folder field.
 */
export function buildTargetOptions(targets, savedDest) {
  const options = (targets || []).map((t) => ({
    ...t,
    selected: savedDest === t.path,
    disabled: !t.writable,
  }));
  return { options, customSelected: !!savedDest && !options.some((o) => o.selected) };
}

/**
 * The folder dialog opens on the machine running the window. The mirror runs
 * on the server, so the picker only makes sense when this window IS the
 * server: inside the desktop app, talking to a loopback address.
 */
export function canBrowseFolder({ isElectron, hostname }) {
  return !!isElectron && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname);
}
