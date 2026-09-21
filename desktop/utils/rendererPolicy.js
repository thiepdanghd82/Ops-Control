/**
 * What a renderer is allowed to reach out to — two decisions, kept pure so
 * they can be asserted without booting Electron.
 *
 * Both defaults in Electron are permissive, and both bite hardest in the
 * windows that still run with nodeIntegration (the setup wizard and the
 * first-run dialog), which is why the policy lives in one place instead of
 * being spelled out at each call site.
 */

/**
 * `shell.openExternal` hands a URL to the OS, which launches whatever app
 * claims the scheme — so `file:`, `smb:` or any registered custom scheme
 * becomes an app launch rather than a browser tab. A quoting app only ever
 * needs to open the web.
 *
 * `mailto:` is deliberately NOT allowed: the client has no mailto link today
 * (checked, 2026-09-20), and an allowlist that lists things nobody uses stops
 * describing the app.
 *
 * @param {unknown} url
 * @returns {boolean} true when it is safe to hand to shell.openExternal
 */
function isExternalUrlAllowed(url) {
  if (typeof url !== 'string' || url === '') return false;
  let protocol;
  try {
    ({ protocol } = new URL(url));
  } catch {
    return false;
  }
  return protocol === 'http:' || protocol === 'https:';
}

/**
 * Electron GRANTS a permission request by default. This app asks for exactly
 * one thing — writing to the clipboard (Provisioning Card, TOTP enrolment,
 * Installation ID; 8 call sites) — and never reads it back, so `clipboard-read`
 * is NOT on the list either.
 *
 * Camera, microphone, geolocation, notifications, HID, serial and midi have no
 * caller in `client/src`, so the honest allowlist is one entry. Add to it only
 * with a call site to point at.
 */
const ALLOWED_PERMISSIONS = Object.freeze(['clipboard-sanitized-write']);

/**
 * @param {unknown} permission Electron's permission name
 * @returns {boolean}
 */
function isPermissionAllowed(permission) {
  return ALLOWED_PERMISSIONS.includes(permission);
}

module.exports = { isExternalUrlAllowed, isPermissionAllowed, ALLOWED_PERMISSIONS };
