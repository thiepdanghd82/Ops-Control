// Pure decision helpers for ConfirmClearModal (split out so they unit-test
// without React). See ConfirmClearModal.jsx.

/** The "Clear data" button is enabled only with a non-blank password + not busy. */
export function canSubmitClear({ password, busy }) {
  return !!(password && String(password).trim() && !busy);
}

/**
 * Interpret the clear API response. The server returns HTTP 200
 * { ok:false, code:'bad_password' } on a wrong/missing password (never a 401,
 * which the client treats as session-expiry) → keep the modal open + show the
 * inline error. Any other resolved payload means the wipe succeeded.
 * @returns {'bad_password' | 'ok'}
 */
export function interpretClearResponse(r) {
  if (r && r.ok === false) return 'bad_password';
  return 'ok';
}
