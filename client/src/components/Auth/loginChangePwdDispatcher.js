/**
 * Pure decision logic for the change-password-on-login flow.
 *
 * Hotfix MES-3-FIX-54 (2026-06-17) — pre-fix bug: handleLogin POSTed
 * /auth/change-pwd immediately after login() regardless of whether
 * the user still needed TOTP verification. For TOTP users the session
 * token returned by login() is PRE-TOTP (server's getSessionUser
 * returns null until totp_verified) so the change-pwd POST 401'd
 * silently — the UI had already swapped to the TOTP screen which
 * renders totpError, NOT the login form's error, so the failure was
 * invisible and the password silently stayed unchanged.
 *
 * Pulled out of LoginPage.jsx so node:test can validate the
 * security-sensitive ordering vanilla (no React infra needed).
 *
 * Contract — returns one of three actions:
 *   - 'noop'              — don't dispatch (changeMode off, or login
 *                            failed/returned unexpected shape)
 *   - 'change-now'        — login succeeded WITHOUT TOTP, safe to
 *                            dispatch /auth/change-pwd immediately
 *   - 'defer-until-totp'  — login returned totp_required, MUST wait
 *                            until verifyTOTP() resolves before
 *                            dispatching (else the POST 401s on a
 *                            pre-TOTP session)
 *
 * On 'change-now' / 'defer-until-totp' the result carries `pending`
 * with the snake_case payload the server expects ({old_pwd, new_pwd}).
 */
export function decideChangePwdDispatch(input, loginResult) {
  const { changeMode, oldPwd, newPwd } = input || {};
  if (!changeMode) return { action: 'noop' };
  // Defensive: if both totp_required AND success are truthy (shouldn't
  // happen with current AuthContext shape but contract may drift), the
  // SAFER path is to defer — a deferred POST is recoverable; a POST
  // against a pre-TOTP session 401s silently and the bug returns.
  if (loginResult && loginResult.totp_required === true) {
    return {
      action: 'defer-until-totp',
      pending: { old_pwd: oldPwd, new_pwd: newPwd },
    };
  }
  if (loginResult && loginResult.success === true) {
    return {
      action: 'change-now',
      pending: { old_pwd: oldPwd, new_pwd: newPwd },
    };
  }
  // login() failed (threw before reaching here) or returned an
  // unexpected shape (e.g. {conflict: ...} single-session takeover).
  // Don't speculate a password change against a non-existent session.
  return { action: 'noop' };
}

/**
 * Post-TOTP gate — after verifyTOTP() resolves, decide whether to
 * dispatch a deferred change-pwd. False if no pending, or if TOTP
 * verify itself failed (verifyTOTP throws on failure, so the caller
 * shouldn't reach this normally — defensive check).
 */
export function shouldDispatchAfterTotp(pending, verifyResult) {
  if (!pending) return false;
  if (!verifyResult || verifyResult.success !== true) return false;
  return true;
}
