// @ts-check
/**
 * Pure helpers for <ClientUpdateIndicator />.
 *
 * Kept JSX-free so node:test can import without a JSX loader. Same
 * pattern as `csvExport.js` / `materialActiveBadgeSummary.js`.
 *
 * Three concerns:
 *   - Platform mapping (`process.platform` → 'mac'/'win'/'unknown')
 *   - State decision (mismatch / banner / chip) from version + localStorage
 *   - LocalStorage key constants (shared with the component + tests)
 */

export const LS_COLLAPSED_KEY = 'update-indicator:collapsed-for-version';
export const LS_LAST_MISMATCH_KEY = 'update-indicator:last-mismatch-server-version';

/**
 * Map Node's `process.platform` value (exposed via window.opsRuntime) to
 * the friendly form the audit payload uses. We keep the original
 * 'darwin'/'win32' value if it doesn't fall into the two operator
 * surfaces — better to log truthful info than to lie via 'unknown'.
 *
 * @param {string|undefined|null} rawPlatform — e.g. 'darwin', 'win32', 'linux'
 * @returns {'mac'|'win'|'linux'|'unknown'}
 */
export function mapPlatform(rawPlatform) {
  if (rawPlatform === 'darwin') return 'mac';
  if (rawPlatform === 'win32') return 'win';
  if (rawPlatform === 'linux') return 'linux';
  return 'unknown';
}

/**
 * Decide which UI mode to render given version data + collapse state.
 *
 *  - clientVersion === serverVersion → hidden
 *  - mismatch + collapsedFor === serverVersion → chip
 *  - mismatch + collapsedFor !== serverVersion (or missing) → banner
 *
 * The "collapsed for version" check means: if server bumps to a NEW
 * version, the chip auto-re-expands into a banner (operator gets a
 * fresh nag per version, not a permanently-collapsed indicator).
 *
 * @param {{
 *   clientVersion: string|undefined|null,
 *   serverVersion: string|undefined|null,
 *   collapsedForVersion: string|null,
 * }} input
 * @returns {{
 *   mismatch: boolean,
 *   mode: 'hidden'|'banner'|'chip',
 * }}
 */
export function decideIndicatorMode({ clientVersion, serverVersion, collapsedForVersion }) {
  // Until we know both versions, render nothing. (Server unreachable on
  // first probe, or build without VITE define → don't spam the operator.)
  if (!clientVersion || !serverVersion) {
    return { mismatch: false, mode: 'hidden' };
  }
  if (clientVersion === serverVersion) {
    return { mismatch: false, mode: 'hidden' };
  }
  if (collapsedForVersion === serverVersion) {
    return { mismatch: true, mode: 'chip' };
  }
  return { mismatch: true, mode: 'banner' };
}

/**
 * Detect a successful upgrade (boot-time only) — used to emit the
 * CLIENT_VERSION_MATCH_AFTER_UPGRADE audit event exactly once.
 *
 * Fires when: this session sees client === server AND a prior session
 * persisted any non-empty `last-mismatch-server-version` value. The
 * caller is expected to `removeItem` the LS key right after emitting,
 * so the event fires exactly once per upgrade transition (next boot,
 * the key is absent → no fire).
 *
 * The prompt's literal text had a `!== clientVersion` guard against the
 * stored value. With the documented storage rule ("write serverVersion
 * to LS on mismatch"), that guard would defeat the audit: post-upgrade
 * the stored serverVersion is exactly equal to the new clientVersion,
 * so the guard would block the fire in the most common case. We
 * implement to the documented INTENT (any non-empty record + match
 * → fire) rather than the literal guard, and persist the
 * server-version snapshot so reviewers can spot a rare rollback
 * scenario (server downgraded to match an old client without an
 * actual client upgrade) from the audit detail payload.
 *
 * @param {{
 *   clientVersion: string|undefined|null,
 *   serverVersion: string|undefined|null,
 *   lastMismatchServerVersion: string|null,
 * }} input
 */
export function detectUpgradeTransition({
  clientVersion,
  serverVersion,
  lastMismatchServerVersion,
}) {
  if (!clientVersion || !serverVersion) return false;
  if (clientVersion !== serverVersion) return false;
  return Boolean(lastMismatchServerVersion);
}
