import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../context/AuthContext';
import PwdAgeBar from './PwdAgeBar';
import TotpEnrollment from './TotpEnrollment';
import { showToast } from '../../utils/toast';
import './LoginPage.css';

// Phase 10J redesign — icons are SVG, not emoji.
// Shield with check = "authenticated & secure"; matches the IBM Carbon
// security icon vocabulary. Sized 24px inside the 48px accent tile.
function ShieldCheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2L4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 12l2.5 2.5L16 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
// Key glyph for the TOTP screen — clear "authenticator code" affordance.
function AuthKeyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="8" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M11.5 12H20M17 12v3M20 12v2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Lightweight particle network canvas. Carbon-toned (cool blue/white
// only — NOT the rainbow original). Drawn on top of the static grid
// + diagonal accents so the backdrop reads as "alive but disciplined"
// rather than "screensaver". Capped count + paused on tab-hidden to
// keep CPU at zero when the user walks away.
// Constellation particle network — matches the v1.0 login background.
// Random-velocity dots with thin network lines connecting nearby pairs.
// No mouse interaction (that was the source of the "blinking" feel as
// the cursor moved across particles).
function ParticleCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    let W = 0,
      H = 0,
      particles = [];
    let raf = null;
    let running = true;

    function resize() {
      // Size to parent box with DPR awareness so the canvas is crisp on
      // Retina without overflowing the hero pane.
      const rect = cvs.parentElement?.getBoundingClientRect() || {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      const dpr = window.devicePixelRatio || 1;
      cvs.width = Math.max(1, Math.floor(rect.width * dpr));
      cvs.height = Math.max(1, Math.floor(rect.height * dpr));
      cvs.style.width = rect.width + 'px';
      cvs.style.height = rect.height + 'px';
      W = cvs.width;
      H = cvs.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function createParticles() {
      particles = [];
      // Density modeled on the v1.0 look — sparse enough to read as
      // "constellation", dense enough that lines actually form.
      const cssW = W / (window.devicePixelRatio || 1);
      const cssH = H / (window.devicePixelRatio || 1);
      const count = Math.min(70, Math.max(28, Math.floor((cssW * cssH) / 12000)));
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * cssW,
          y: Math.random() * cssH,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: Math.random() * 1.4 + 0.8,
          o: Math.random() * 0.45 + 0.35,
        });
      }
    }

    function draw() {
      if (!running) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      const cssW = W / dpr;
      const cssH = H / dpr;
      ctx.clearRect(0, 0, cssW, cssH);
      const LINK = 130; // px

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        // Wrap so particles never feel like they "die" off-screen.
        if (p.x < 0) p.x = cssW;
        else if (p.x > cssW) p.x = 0;
        if (p.y < 0) p.y = cssH;
        else if (p.y > cssH) p.y = 0;
        // Network lines — only forward pairs (j > i) to avoid double-draw.
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x,
            dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(140, 175, 230, ${0.18 * (1 - dist / LINK)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
        // Particle dot.
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(170, 200, 240, ${p.o})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    }

    const onResize = () => {
      resize();
      createParticles();
    };
    const onVisible = () => {
      running = !document.hidden;
    };

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisible);

    resize();
    createParticles();
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return <canvas ref={canvasRef} className="cb-hero-canvas" aria-hidden />;
}

// (LoginBackground was a leftover from the v1.1 design that layered a
// dotted grid + diagonal lines + brand stamp + particles. It was never
// rendered in the current Carbon shell — the cb-hero owns the backdrop
// now via ParticleCanvas only. Removed to avoid confusion.)

// Sprint S-P0-FIX-3 — localise the auth error string to the user's locale.
// Server returns English ("Invalid credentials") as the stable wire
// contract per OWASP ASVS V4.0 §6.2.4 unification. The 3 legacy strings
// below cover the kiosk-PWA stale-cache window: a 5-min-old client
// receiving the new server response while still on its prior bundle
// would otherwise see one of the pre-fix English messages — we map all
// of them to the same unified i18n key so the user UX is consistent
// from the moment Bước 2 lands.
function localizeAuthError(raw, t) {
  if (!raw) return t('login.error.fallback');
  const s = String(raw).trim();
  // Stable post-fix server message
  if (s === 'Invalid credentials') return t('login.error.invalid_credentials');
  // Legacy pre-fix server messages (cached PWA window)
  if (s === '❌ Username not found') return t('login.error.invalid_credentials');
  if (s === '❌ Incorrect password') return t('login.error.invalid_credentials');
  if (/^❌ Too many failed attempts/.test(s)) return t('login.error.invalid_credentials');
  // Generic non-auth errors (e.g. network failure) — pass through.
  return s;
}

export default function LoginPage({ compact = false, reason = null } = {}) {
  const {
    login,
    verifyTOTP,
    totpPending,
    totpUsername,
    cancelTotp,
    totpEnrollmentRequired,
    completeTotpEnrollment,
  } = useAuth();
  const { t } = useI18n();
  // Phase 9L.3 — pre-fill username from the last successful session
  // when this is a re-login (compact=true). Token is gone but we can
  // safely read the username from localStorage (non-sensitive). Avoids
  // making the user retype it just because their session TTL expired.
  const [username, setUsername] = useState(() => {
    if (!compact) return '';
    try {
      return localStorage.getItem('ops_last_username') || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  // Sprint 1.6 — remember-me preference is itself remembered: read the
  // user's last choice from localStorage so the checkbox doesn't reset
  // on every visit. Defaults to true (legacy default) for first visit.
  const [remember, setRemember] = useState(() => {
    try {
      const v = localStorage.getItem('ops_remember');
      if (v === '0' || v === 'false') return false;
      if (v === '1' || v === 'true') return true;
    } catch {
      /* private mode */
    }
    return true;
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // TOTP state
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  // Sprint-6 UX: after N failed verifies in a row, show a stale-entry
  // advisory. Most "Invalid TOTP code" repeats come from the user's
  // authenticator holding a secret from an earlier enrollment attempt;
  // without this hint they keep mashing codes until they (or IT) give
  // up. Counter resets on success, Back-to-login, or a fresh code entry.
  const [totpFailCount, setTotpFailCount] = useState(0);

  // Phase 10L — change-password from login + password-age bar.
  const [changeMode, setChangeMode] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [newPwdConfirm, setNewPwdConfirm] = useState('');
  const [pwdAge, setPwdAge] = useState(null);
  // Sprint 1.5 — SAP/IFS-style forced password change. When the server
  // marks the account `must_change_password` (after admin create or
  // reset), the change-pwd flow is locked on; the user can't dismiss it.
  const [mustChangePwd, setMustChangePwd] = useState(false);

  // Debounced fetch: when the username changes, look up the password
  // age so the colored bar can reflect that user's rotation status.
  // 400ms debounce avoids a round-trip per keystroke. Null response
  // (unknown user) hides the bar — no existence confirmation.
  useEffect(() => {
    const name = String(username || '').trim();
    if (!name) {
      setPwdAge(null);
      setMustChangePwd(false);
      return;
    }
    const controller = new AbortController();
    const handle = setTimeout(() => {
      fetch(`/api/auth/pwd-age/${encodeURIComponent(name)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          setPwdAge(j?.pwd_age || null);
          // Sprint 1.5 — pre-flip into change-pwd mode the moment we know
          // the account requires it. If the toggle is already off and the
          // server says yes, force it on; if the server clears the flag
          // (eg. user just rotated in another tab), drop the lock.
          const force = j?.must_change_password === true;
          setMustChangePwd(force);
          if (force) setChangeMode(true);
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') {
            setPwdAge(null);
            setMustChangePwd(false);
          }
        });
    }, 400);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [username]);

  const handleLogin = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    setError('');
    // Client-side guard for change-mode: new + confirm must match and
    // be at least 6 chars. The server re-validates length for defense
    // in depth. We show the error inline before even hitting /login.
    if (changeMode) {
      if (!newPwd || newPwd.length < 6) {
        setError(t('login.change.too_short'));
        return;
      }
      if (newPwd !== newPwdConfirm) {
        setError(t('login.change.mismatch'));
        return;
      }
      if (newPwd === password) {
        setError(t('login.change.same'));
        return;
      }
    }
    setLoading(true);
    try {
      // Sprint 1.6 — persist the checkbox preference BEFORE the network
      // call so a flaky login doesn't lose the user's intent.
      try {
        localStorage.setItem('ops_remember', remember ? '1' : '0');
      } catch {
        /* private mode / quota — non-critical, the preference
                resets to true on next visit which is the legacy default */
      }
      const loginRes = await login(username, password, remember);
      try {
        localStorage.setItem('ops_last_username', username);
      } catch {
        /* quota */
      }
      // Đợt 4 — anomaly hint: cảnh báo user nếu login từ IP mới /
      // có session khác đang mở concurrent / login giờ bất thường.
      // Toast 8s, severity warn để user kịp đọc + đổi pwd nếu không phải họ.
      const a = loginRes?.login_anomaly;
      if (a?.reasons?.length) {
        const labels = {
          concurrent_multi_ip: `Có session khác đang mở từ IP: ${(a.concurrent_ips || []).join(', ')}`,
          new_ip: 'Login từ IP mới (chưa thấy lần nào trong 30 ngày qua)',
          unusual_hour: 'Login ngoài giờ hành chính',
        };
        const msg = a.reasons.map((r) => labels[r] || r).join(' • ');
        showToast(`⚠ ${msg}. Nếu không phải bạn, đổi mật khẩu ngay.`, 'warn');
      }
      // Phase 10L — if the user opted in to change-password on login,
      // swap the password with the freshly issued session. Same
      // /auth/change-pwd endpoint the Settings page uses; it's
      // session-authenticated so the token we just received works.
      if (changeMode) {
        const tok = localStorage.getItem('ops_token');
        const csrf =
          document.cookie
            .split(';')
            .map((s) => s.trim())
            .find((s) => s.startsWith('ops_csrf='))
            ?.split('=')[1] || '';
        const r = await fetch('/api/auth/change-pwd', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Authorization: tok ? `Bearer ${tok}` : '',
            'X-CSRF-Token': csrf,
          },
          body: JSON.stringify({ old_pwd: password, new_pwd: newPwd }),
        });
        const body = await r.json().catch(() => ({}));
        if (!body.ok) throw new Error(body.msg || 'Change password failed');
        // Clear change-mode fields + collapse UI; user is now in.
        setChangeMode(false);
        setNewPwd('');
        setNewPwdConfirm('');
      }
    } catch (err) {
      setError(localizeAuthError(err.message, t));
    } finally {
      setLoading(false);
    }
  };

  // Use username from context if available (covers page reload into TOTP screen),
  // fall back to local state (fresh login flow).
  const effectiveUsername = totpUsername || username;

  // Extracted verify flow so the auto-fire path (onChange detects 6
  // digits) and the manual path (form submit / button click) share
  // the same code. Guarded against reentry via totpLoading.
  const runVerifyTOTP = async (code) => {
    if (code.length !== 6 || totpLoading) return;
    setTotpError('');
    setTotpLoading(true);
    try {
      await verifyTOTP(effectiveUsername, code);
      setTotpFailCount(0);
    } catch (err) {
      setTotpError(err.message || 'Invalid code');
      setTotpCode('');
      setTotpFailCount((c) => c + 1);
    } finally {
      setTotpLoading(false);
    }
  };
  const handleTOTP = (e) => {
    e.preventDefault();
    runVerifyTOTP(totpCode);
  };

  // ─── Server info: dynamic version + actual server URL ────────────
  // Fetch desktop config once at mount. window.location.host alone shows
  // 127.0.0.1:PORT in embedded mode — operators want the REAL server
  // identity (LAN IP in thin mode, "EMBEDDED" in embedded, hostname only
  // when public). Build label is from app metadata, not hardcoded.
  const [serverInfo, setServerInfo] = useState(() => ({
    version: 'loading…',
    buildLabel: '',
    mode: '',
    label: '',
    host: typeof window !== 'undefined' ? window.location.host : '',
  }));
  useEffect(() => {
    const isElectron = typeof window !== 'undefined' && window.opsRuntime?.isElectron;
    const loadHost = typeof window !== 'undefined' ? window.location.host : '';

    const classify = (mode, host) => {
      // LAN private ranges (RFC1918) → THIN PROD on LAN
      // localhost / 127.x → DEV
      // public IP / domain → PROD
      const h = (host || '').split(':')[0];
      const isLocal = /^(localhost|127\.|::1)/.test(h);
      const isLan = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
      if (mode === 'embedded') return 'EMBEDDED';
      if (mode === 'smart') return isLocal ? 'SMART (DEV)' : 'SMART';
      // mode === 'thin' or web
      if (isLocal) return 'DEV';
      if (isLan) return 'LAN';
      return 'PROD';
    };

    if (isElectron && window.ops?.app?.getConfig) {
      window.ops.app
        .getConfig()
        .then((cfg) => {
          const mode = cfg?.mode || 'embedded';
          // In smart mode the renderer is loaded from the LOCAL embedded
          // mirror (so window.location is 127.0.0.1:port), but the operator
          // cares about the REMOTE server they're syncing to — show that.
          // Thin: same — prefer cfg.remoteUrl since it's the explicit config.
          // Embedded: hint that we're hosting locally on this machine.
          const remoteHost = (cfg.remoteUrl || '').replace(/^https?:\/\//, '');
          const displayHost =
            mode === 'embedded'
              ? `localhost:${cfg.embeddedPort || ''} (this machine)`
              : remoteHost || loadHost;
          setServerInfo({
            version: cfg?.version || '1.5.10',
            buildLabel: 'build 2026.05',
            mode,
            label: classify(mode, displayHost),
            host: displayHost,
          });
        })
        .catch(() => {
          setServerInfo({
            version: '1.5.10',
            buildLabel: 'build 2026.05',
            mode: 'embedded',
            label: classify('embedded', loadHost),
            host: loadHost,
          });
        });
    } else {
      setServerInfo({
        version: '1.5.10',
        buildLabel: 'build 2026.05',
        mode: 'web',
        label: classify('web', loadHost),
        host: loadHost,
      });
    }
  }, []);

  // Carbon hero — shared shell for all 3 screens (login / TOTP / enrollment).
  // Hidden when compact (re-login modal) — wrapper applies .cb-compact class.
  const CarbonHero = () => (
    <aside className="cb-hero" aria-hidden="true">
      <ParticleCanvas />
      <div className="cb-hero-brand">
        <div className="cb-hero-brand-mark">⌬</div>
        <span>CCL Design Vietnam</span>
      </div>
      <div className="cb-hero-body">
        <div className="cb-hero-tag">Manufacturing Operations</div>
        {/* Sprint S-P0-FIX-4 (a11y F3-4) — was <h2>; demoted to <p> so the
            page heading hierarchy starts cleanly at <h1>. The aside is
            already aria-hidden so this never reached screen readers, but
            tooling (Lighthouse, axe-core) flagged the DOM-order h2-before-h1.
            Visual treatment is fully CSS-driven via .cb-hero-title. */}
        <p className="cb-hero-title">
          Pricing &amp; planning, <strong>online or off.</strong>
        </p>
        <p className="cb-hero-desc">
          Quote, track, and approve from the floor. Local-first writes, automatic sync, single
          source of truth across the plant.
        </p>
        <span className="cb-hero-arrow">→</span>
      </div>
      <div className="cb-hero-bottom">
        <div className="cb-hero-foot">
          <span>
            <strong>v{serverInfo.version}</strong> · {serverInfo.buildLabel}
          </span>
          <span>
            {serverInfo.label} · {serverInfo.host}
          </span>
        </div>
        <div className="cb-hero-credit">DEVELOPED BY HENRY DANG · NPI MANAGER</div>
      </div>
    </aside>
  );

  // ── Enrollment screen (Sprint 41) — first-time setup for users whose
  //    role requires 2FA but who have no secret yet. Shows QR / secret
  //    / otpauth URI + OTP verify in one component. Takes priority over
  //    the normal TOTP-verify screen (both render when totpPending=true). ──
  if (totpPending && totpEnrollmentRequired) {
    const enrollUsername = totpUsername || username;
    return (
      <div className={`cb-shell${compact ? ' cb-compact' : ''}`}>
        <CarbonHero />
        <div className="cb-form-pane">
          <div className="cb-card" style={{ maxWidth: 560 }}>
            <TotpEnrollment
              username={enrollUsername}
              onComplete={completeTotpEnrollment}
              onCancel={cancelTotp}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── TOTP screen ──
  if (totpPending) {
    return (
      <div className={`cb-shell${compact ? ' cb-compact' : ''}`}>
        <CarbonHero />

        <div className="cb-form-pane">
          <div className="cb-card">
            <div className="cb-otp-icon">
              <AuthKeyIcon />
            </div>
            <h1>2-Step Verification</h1>
            <p className="cb-card-sub">Authenticator · 6-digit code</p>
            <p className="cb-card-hint">
              Open <b>Google Authenticator</b> and enter the 6-digit code for account{' '}
              <b className="cb-otp-user">{effectiveUsername}</b>
            </p>

            <form onSubmit={handleTOTP} className="login-form">
              <div className={`cb-field ${totpError ? 'totp-shake' : ''}`}>
                <label className="cb-field-label" htmlFor="login-totp-code">
                  Authenticator Code
                </label>
                <input
                  id="login-totp-code"
                  className="cb-field-input cb-otp-input"
                  type="tel"
                  inputMode="numeric"
                  value={totpCode.split('').join(' ')}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setTotpCode(next);
                    // Clear any previous error as soon as the user starts
                    // typing again — avoids the stale "Invalid code"
                    // sticking while they re-enter.
                    if (totpError) setTotpError('');
                    // Auto-verify the moment the 6th digit lands. No
                    // button click needed; the button stays as a11y
                    // fallback. Defer to next tick so React has applied
                    // the state before runVerifyTOTP reads the closure.
                    if (next.length === 6 && !totpLoading) {
                      setTimeout(() => runVerifyTOTP(next), 0);
                    }
                  }}
                  placeholder="●  ●  ●  ●  ●  ●"
                  autoFocus
                  maxLength={11}
                  autoComplete="one-time-code"
                  aria-invalid={!!totpError}
                />
              </div>

              {totpError && (
                <div className="cb-err" role="alert" aria-live="assertive">
                  {totpError}
                </div>
              )}

              {totpFailCount >= 3 && (
                <div className="cb-totp-advisory" role="status" aria-live="polite">
                  <b>Stuck?</b> After 3 wrong codes, this usually means your authenticator app has a
                  stale entry from a previous enrollment. Delete any "Ops Control" entry in Google
                  Authenticator and ask IT to run <code>npm run reset-totp</code> so you can
                  re-enroll with a fresh QR.
                </div>
              )}

              <button
                type="submit"
                disabled={totpLoading || totpCode.length !== 6}
                className="cb-btn"
              >
                {totpLoading ? 'Verifying...' : 'Verify Code'}
              </button>

              <button
                type="button"
                className="cb-link-btn"
                onClick={() => {
                  setTotpCode('');
                  setTotpError('');
                  setTotpFailCount(0);
                  cancelTotp();
                }}
              >
                ← Back to login
              </button>
            </form>

            <div className="cb-card-foot">
              <span>2FA · {serverInfo.label}</span>
              <span>{serverInfo.host}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Login screen ──
  return (
    <div className={`cb-shell${compact ? ' cb-compact' : ''}`}>
      <CarbonHero />

      <div className="cb-form-pane">
        <form className="cb-card" onSubmit={handleLogin} autoComplete="on">
          <h1>
            {compact
              ? t('login.expired_title')
              : mustChangePwd
                ? t('login.must_change.title')
                : changeMode
                  ? t('login.change.toggle')
                  : t('login.heading.signin')}
          </h1>
          <p className="cb-card-sub">Ops Control · {serverInfo.version}</p>

          {compact && (
            <p className="cb-card-hint">
              {t('login.expired_hint')}
              {reason === 'expired' && (
                <>
                  <br />
                  {t('login.expired_keep_place')}
                </>
              )}
            </p>
          )}

          {/* Sprint 1.5 — SAP/IFS-style provisioning hint. Shown when the
              server flag forces the change-pwd flow. The user can still
              type any temp pwd in the password field; both the temp + new
              pwd are submitted together via the existing handleLogin path. */}
          {mustChangePwd && !compact && (
            <div className="cb-card-hint cb-must-change-banner" role="status">
              {t('login.must_change.body')}
            </div>
          )}

          {error && (
            <div className="cb-err" role="alert">
              {error}
            </div>
          )}

          <div className="cb-field">
            <label className="cb-field-label" htmlFor="login-username">
              {t('login.username')}
            </label>
            <input
              id="login-username"
              className="cb-field-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('login.username_placeholder')}
              autoFocus={!compact}
              autoComplete="username"
              required
              readOnly={compact && username.length > 0}
            />
          </div>

          <div className="cb-field">
            <label className="cb-field-label" htmlFor="login-password">
              {t('login.password')}
            </label>
            <input
              id="login-password"
              className="cb-field-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('login.password_placeholder')}
              autoComplete="current-password"
              required
              autoFocus={compact}
            />
          </div>

          {/* Phase 10L — days-remaining bar */}
          {pwdAge && (
            <PwdAgeBar
              daysRemaining={pwdAge.days_remaining}
              maxAgeDays={pwdAge.max_age_days}
              label={t('login.pwd_age_label')}
            />
          )}

          {/* Change-password-on-login — expands inline */}
          {changeMode && (
            <>
              <div className="cb-field">
                <label className="cb-field-label" htmlFor="login-new-pwd">
                  {t('login.change.new')}
                </label>
                <input
                  id="login-new-pwd"
                  className="cb-field-input"
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder={t('login.change.new_placeholder')}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div className="cb-field">
                <label className="cb-field-label" htmlFor="login-confirm-pwd">
                  {t('login.change.confirm')}
                </label>
                <input
                  id="login-confirm-pwd"
                  className="cb-field-input"
                  type="password"
                  value={newPwdConfirm}
                  onChange={(e) => setNewPwdConfirm(e.target.value)}
                  placeholder={t('login.change.confirm_placeholder')}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
            </>
          )}

          <label className="cb-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            {t('login.remember')}
          </label>

          <button type="submit" disabled={loading} className="cb-btn">
            {loading
              ? t('login.submitting')
              : changeMode
                ? t('login.change.submit')
                : t('login.submit')}
          </button>

          {/* Sprint 1.5 — toggle is hidden when the server forces change-pwd.
              Users in that state can't dismiss the new-password fields. */}
          {!mustChangePwd && (
            <button
              type="button"
              className="cb-link-btn"
              onClick={() => {
                setChangeMode((m) => !m);
                setError('');
                if (changeMode) {
                  setNewPwd('');
                  setNewPwdConfirm('');
                }
              }}
            >
              {changeMode ? t('login.change.cancel') : t('login.change.toggle')}
            </button>
          )}

          <div className="cb-card-foot">
            <span>{serverInfo.label}</span>
            <span>{serverInfo.host}</span>
          </div>
        </form>
      </div>
    </div>
  );
}
