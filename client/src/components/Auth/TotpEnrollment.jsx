/**
 * TotpEnrollment — First-time 2FA setup flow.
 *
 * Rendered when server returns `totp_enrollment_required: true` (Sprint 41:
 * sys/admin logging in with no existing TOTP secret). Shows a QR code
 * (scannable by Google Authenticator / Authy / 1Password / Microsoft
 * Authenticator) plus the base32 secret + otpauth:// URI as fallbacks
 * for manual entry and password-manager paste.
 *
 * The `qrcode` lib is loaded via dynamic import so the ~20KB payload
 * only hits users who actually land on this screen (first-time sys/admin).
 *
 * Flow:
 *   1. Component mounts → generates a random 160-bit base32 secret
 *      (stays in React state; no API call until user confirms).
 *   2. User scans QR / manually types secret into their authenticator.
 *   3. User enters the live 6-digit OTP.
 *   4. On submit: POST /api/totp/secret (save) → POST /api/totp/verify
 *      (finalize). Only if BOTH succeed does the session upgrade to
 *      `totpVerified=true` and the parent navigates into the app.
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { authApi } from '../../services/api';

// Generate a cryptographically-strong 160-bit base32 secret (matches
// RFC 4226 minimum for HMAC-SHA1 TOTP). 160 bits = 20 bytes = 32 base32
// characters. Server-side totpVerify accepts any valid base32 length.
function generateBase32Secret() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += alphabet[parseInt(bits.substring(i, i + 5), 2)];
  }
  return out;
}

export default function TotpEnrollment({ username, onComplete, onCancel }) {
  // Lazy init — secret generated exactly once per component mount, so
  // a React re-render doesn't orphan the secret the user just scanned.
  const [secret] = useState(generateBase32Secret);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrSvg, setQrSvg] = useState('');

  const otpauthUri = useMemo(() => {
    const issuer = 'Ops Control';
    const label = `${issuer}:${username}`;
    const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
    return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
  }, [secret, username]);

  useEffect(() => {
    let cancelled = false;
    import('qrcode').then(({ default: QRCode }) =>
      QRCode.toString(otpauthUri, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 200 })
    ).then(svg => { if (!cancelled) setQrSvg(svg); })
     .catch(() => { /* fall back to URI + secret */ });
    return () => { cancelled = true; };
  }, [otpauthUri]);

  const copyUri = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(otpauthUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard may not be available */ }
  }, [otpauthUri]);

  const handleSubmit = useCallback(async (e) => {
    e?.preventDefault?.();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError('');
    try {
      // Atomic: server verifies the code against the proposed secret BEFORE
      // persisting. A bad code is a no-op — no stale secret left on disk,
      // so the user can retry on the same page (and the same QR/secret)
      // without an admin CLI reset. Replaces the legacy save-then-verify
      // flow that could leave enrollment half-committed.
      const result = await authApi.enrollTotp(username, secret, code);
      if (!result?.ok) {
        throw new Error(result?.msg || 'The 6-digit code did not match. Try the NEXT code in your authenticator app (they rotate every 30 seconds).');
      }
      onComplete?.();
    } catch (err) {
      setError(err?.message || 'Enrollment failed — try again.');
    } finally {
      setBusy(false);
    }
  }, [code, busy, secret, username, onComplete]);

  const handleCodeChange = useCallback((e) => {
    // Digits only, auto-strip spaces / dashes so pastes from authenticator
    // apps (which sometimes include a space mid-code) still work.
    const cleaned = String(e.target.value).replace(/\D/g, '').slice(0, 6);
    setCode(cleaned);
    setError('');
  }, []);

  return (
    <form className="totp-enroll" onSubmit={handleSubmit}>
      <h2 className="totp-enroll-title">Set up 2-Step Verification</h2>
      <p className="totp-enroll-sub">
        Your account role requires 2FA. Add this account to your authenticator
        app (Google Authenticator, Authy, 1Password, Microsoft Authenticator)
        using the secret below, then enter the 6-digit code to finish.
      </p>

      <div className="totp-enroll-section">
        <div className="totp-enroll-label">Account</div>
        <div className="totp-enroll-value">{username}</div>
      </div>

      <div className="totp-enroll-section">
        <div className="totp-enroll-label">Scan with your authenticator app</div>
        <div
          className="totp-enroll-qr"
          aria-label="QR code for TOTP enrollment"
          dangerouslySetInnerHTML={qrSvg ? { __html: qrSvg } : undefined}
        >
          {qrSvg ? undefined : <span className="totp-enroll-qr-loading">Generating QR…</span>}
        </div>
      </div>

      <div className="totp-enroll-section">
        <div className="totp-enroll-label">Can&rsquo;t scan? Enter this secret manually</div>
        <div className="totp-enroll-secret" title="Paste this into the authenticator's manual-entry field">
          {secret.match(/.{1,4}/g).join(' ')}
        </div>
      </div>

      <div className="totp-enroll-section">
        <div className="totp-enroll-label">Or copy the otpauth URI (for password managers)</div>
        <button type="button" className="totp-enroll-uri" onClick={copyUri}>
          <span className="totp-enroll-uri-text">{otpauthUri}</span>
          <span className="totp-enroll-uri-copy">{copied ? '✓ Copied' : 'Copy'}</span>
        </button>
      </div>

      <div className="totp-enroll-section">
        <label className="totp-enroll-label" htmlFor="totp-enroll-code">
          6-digit code from your authenticator
        </label>
        <input
          id="totp-enroll-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={handleCodeChange}
          className="totp-enroll-code"
          placeholder="000000"
          disabled={busy}
          autoFocus
        />
      </div>

      {error && <div className="totp-enroll-error" role="alert">{error}</div>}

      <div className="totp-enroll-actions">
        {onCancel && (
          <button type="button" className="totp-enroll-btn-cancel" onClick={onCancel} disabled={busy}>
            Back to login
          </button>
        )}
        <button type="submit" className="totp-enroll-btn-submit" disabled={code.length !== 6 || busy}>
          {busy ? 'Activating…' : 'Activate 2FA'}
        </button>
      </div>

      <p className="totp-enroll-help">
        Save this secret in your password manager as a backup — if you lose
        your authenticator device, IT can re-enroll you but your existing codes
        will stop working.
      </p>
    </form>
  );
}
