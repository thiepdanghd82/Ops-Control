/* eslint-disable react-refresh/only-export-components --
   This file co-locates AuthProvider with the `useAuth` hook. Splitting
   would require updating 10+ import sites for a dev-only Fast Refresh
   improvement; not worth the churn. */
/* eslint-disable react-hooks/set-state-in-effect --
   The mount effect hydrates React state from localStorage; the initial
   "no token → not loading" sync is intentional. React 19's stricter
   rule flags it but rewriting via subscribe would add complexity. */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { authApi, setToken, clearToken } from '../services/api';
import { getInstallationInfo, snapshotDraftOnRevoke } from '../services/singleSession';

const AuthContext = createContext(null);

const ROLE_LEVELS = { viewonly: 1, user: 2, cost: 3, admin: 4, sys: 5 };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [totpPending, setTotpPending] = useState(false);
  // Sprint 41 — distinct flag for first-time setup (scan QR + verify)
  // vs normal OTP entry. Server sets it when user role requires TOTP
  // but no secret exists yet (e.g. sys/admin after secrets file reset).
  const [totpEnrollmentRequired, setTotpEnrollmentRequired] = useState(false);
  // totpToken state was removed: the API helper already persists it via
  // setToken()/clearToken(); duplicating it here was write-only dead state.
  const [totpUsername, setTotpUsername] = useState('');
  // Sprint V — surface the password-age info returned by /auth/me so a
  // shell-level banner can nudge users before the policy enforces a
  // forced change. Shape matches the server's `pwd_age` response
  // ({ days_remaining, max_age_days }). Null when rotation policy is off.
  const [pwdAge, setPwdAge] = useState(null);
  // Phase 9L.3 — when api.js sees a 401 mid-session it dispatches
  // 'ops:session-expired'. We surface a banner + pre-filled re-login
  // dialog instead of blanking the whole tab; the user keeps their
  // place and doesn't have to retype their username.
  const [sessionExpired, setSessionExpired] = useState(false);
  // Single-session: distinct from a plain expiry — this machine was kicked by
  // a login takeover on another machine. We save the in-progress draft first.
  const [sessionRevoked, setSessionRevoked] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  // Module-scope-ish const — hoisted outside render so useCallback deps
  // don't need to list it (ESLint exhaustive-deps flagged it previously).
  // Shape matches the server's role hierarchy.

  // Heartbeat: mark the user as online on the server every 25s while
  // authenticated. Server TTL is typically 60s — pinging twice per TTL
  // avoids false-offline gaps. Pings stop after logout / session expiry.
  useEffect(() => {
    if (!user) return undefined;
    // AbortController per-ping — the ref tracks only the current
    // in-flight heartbeat so a new tick cancels the previous one
    // (shouldn't really happen at 25s cadence, but defensive), and
    // the cleanup cancels whatever is pending on logout/unmount.
    let currentCtrl = null;
    async function ping() {
      currentCtrl?.abort();
      const ctrl = new AbortController();
      currentCtrl = ctrl;
      try {
        await authApi.heartbeat({ signal: ctrl.signal });
      } catch (e) {
        if (e?.name !== 'AbortError') {
          /* silent — heartbeat failures are not user-facing */
        }
      }
    }
    ping(); // immediate first ping
    const t = setInterval(ping, 25000);
    return () => {
      clearInterval(t);
      currentCtrl?.abort();
    };
  }, [user]);

  // Phase 9L.3 — listen for mid-session 401s from the API helper.
  // Setting sessionExpired=true lets any consumer render a re-login
  // banner/modal without needing to route-away from the current tab.
  useEffect(() => {
    function onExpired() {
      setUser(null);
      setSessionExpired(true);
    }
    window.addEventListener('ops:session-expired', onExpired);
    return () => window.removeEventListener('ops:session-expired', onExpired);
  }, []);

  // Single-session — this machine was kicked by a takeover elsewhere. Save any
  // in-progress quote draft locally BEFORE bouncing to login so work isn't lost.
  useEffect(() => {
    function onRevoked() {
      const saved = snapshotDraftOnRevoke();
      setDraftSaved(saved);
      setUser(null);
      setSessionRevoked(true);
    }
    window.addEventListener('ops:session-revoked', onRevoked);
    return () => window.removeEventListener('ops:session-revoked', onRevoked);
  }, []);

  // Check existing session on mount — initial hydration from localStorage.
  // AbortController aborts the hydration /auth/me on Strict-Mode double
  // mount OR app shell unmount, so a slow backend doesn't setState on a
  // stale provider instance.
  useEffect(() => {
    const token = localStorage.getItem('ops_token');
    if (!token) {
      setLoading(false);
      return undefined;
    }
    const ctrl = new AbortController();
    authApi
      .me({ signal: ctrl.signal })
      .then((data) => {
        if (ctrl.signal.aborted) return;
        const userData = data.user || data;
        if (data.totp_pending) {
          setTotpPending(true);
          setTotpEnrollmentRequired(!!data.totp_enrollment_required);
          setTotpUsername(userData?.username || '');
          setUser(null);
        } else {
          setUser(userData);
          setPwdAge(data?.pwd_age || null);
          setTotpPending(false);
          setTotpEnrollmentRequired(false);
          setTotpUsername('');
        }
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return;
        clearToken();
        setUser(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  const login = useCallback(async (username, password, remember = false, { force = false } = {}) => {
    // Sprint 1.6 — pass `remember` through so the server issues a 30-day
    // session/cookie instead of the 8h default. Token is also stored in
    // sessionStorage (not localStorage) when remember=false so closing
    // the browser actually logs the user out.
    // Single-session: attach this machine's identity. A live session on another
    // machine → server replies 409; we surface { conflict } so the caller can
    // show the takeover dialog and re-call login with { force: true }.
    const machine = await getInstallationInfo();
    let result;
    try {
      result = await authApi.login(username, password, remember, {
        installation_id: machine.installation_id,
        hostname: machine.hostname,
        force,
      });
    } catch (err) {
      if (err?.status === 409 && err.body?.conflict) {
        return { success: false, conflict: err.body.conflict };
      }
      throw err;
    }

    if (!result.ok && result.msg) {
      throw new Error(result.msg);
    }

    if (result.token) {
      setToken(result.token, { persistent: !!remember });

      // Check if TOTP is pending. Server returns two flags:
      //   - totp_pending: session is not fully verified yet (always true
      //     when TOTP is in play)
      //   - totp_enrollment_required (Sprint 41): first-time setup —
      //     user role requires 2FA but no secret enrolled yet.
      //     Client renders QR-setup UI instead of OTP-entry UI.
      const meData = await authApi.me();
      if (meData.totp_pending) {
        setTotpPending(true);
        setTotpEnrollmentRequired(
          !!meData.totp_enrollment_required || !!result?.totp_enrollment_required
        );
        setTotpUsername(meData.user?.username || username);
        setUser(null);
        return {
          success: false,
          totp_required: true,
          enrollment_required: !!meData.totp_enrollment_required,
        };
      }

      const userData = meData.user || meData;
      setUser(userData);
      setPwdAge(meData?.pwd_age || result?.pwd_age || null);
      setTotpPending(false);
      setTotpEnrollmentRequired(false);
      setTotpUsername('');
      // Đợt 4 — surface anomaly hint to the user. Caller can pull
      // `login_anomaly` off the result and show a one-line toast like
      // "⚠ Login từ IP mới — đổi password nếu không phải bạn".
      return {
        success: true,
        user: userData,
        login_anomaly: result?.login_anomaly || null,
      };
    }

    throw new Error(result.error || result.msg || 'Login failed');
  }, []);

  const verifyTOTP = useCallback(async (username, code) => {
    const data = await authApi.verifyTotp(username, code);

    if (data.ok) {
      // TOTP verified — fetch full user
      const meData = await authApi.me();
      const userData = meData.user || meData;
      setUser(userData);
      setPwdAge(meData?.pwd_age || null);
      setTotpPending(false);
      setTotpEnrollmentRequired(false);
      setTotpUsername('');
      return { success: true };
    }

    throw new Error('Invalid TOTP code');
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* logout is best-effort */
    }
    clearToken();
    setUser(null);
    setPwdAge(null);
    setTotpPending(false);
    setTotpEnrollmentRequired(false);
    setTotpUsername('');
  }, []);

  // Sprint 41 — called by TotpEnrollment after it succeeds (saved
  // secret + verified OTP in one user action). Fetch fresh /auth/me
  // so the session reflects `totp_verified=true` and we can drop into
  // the normal authed shell.
  const completeTotpEnrollment = useCallback(async () => {
    const meData = await authApi.me();
    const userData = meData.user || meData;
    setUser(userData);
    setPwdAge(meData?.pwd_age || null);
    setTotpPending(false);
    setTotpEnrollmentRequired(false);
    setTotpUsername('');
  }, []);

  const hasRole = useCallback(
    (minRole) => {
      if (!user) return false;
      return (ROLE_LEVELS[user.role] || 0) >= (ROLE_LEVELS[minRole] || 0);
    },
    [user]
  );

  const hasModule = useCallback(
    (moduleName) => {
      if (!user) return false;
      const modules = user.modules || { cost: true, planning: true };
      return modules[moduleName] !== false;
    },
    [user]
  );

  // Phase 9L.3 — exposes re-login state. After a successful re-login
  // we clear `sessionExpired` so consumers can hide the banner.
  const dismissSessionExpired = useCallback(() => setSessionExpired(false), []);
  // Single-session: clear the "kicked" banner once the user re-logs in / dismisses.
  const dismissSessionRevoked = useCallback(() => {
    setSessionRevoked(false);
    setDraftSaved(false);
  }, []);
  // User chose Hủy on the takeover dialog → audit-only, no session granted.
  const cancelSessionConflict = useCallback(async (username) => {
    try {
      await authApi.cancelSessionConflict(username);
    } catch {
      /* audit-only; ignore failures */
    }
  }, []);
  const loginAndDismissBanner = useCallback(
    async (username, password) => {
      const r = await login(username, password);
      if (r && (r.success || r.totp_required)) setSessionExpired(false);
      return r;
    },
    [login]
  );

  // Stable reference for cancelTotp — previously an inline arrow in the
  // Provider value which allocated a new function on every render and
  // cascaded re-renders to all useAuth() consumers.
  const cancelTotp = useCallback(() => {
    clearToken();
    setTotpPending(false);
    setTotpEnrollmentRequired(false);
    setTotpUsername('');
    setUser(null);
    setPwdAge(null);
  }, []);

  // Memoize the Provider value so its reference only changes when the
  // inputs actually change. Without this, every setState in this
  // component (heartbeat, session-expired event, etc.) allocated a new
  // value object and re-rendered every consumer regardless of which
  // field they read.
  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      verifyTOTP,
      hasRole,
      hasModule,
      totpPending,
      totpUsername,
      totpEnrollmentRequired,
      completeTotpEnrollment,
      cancelTotp,
      isAuthenticated: !!user && !totpPending,
      sessionExpired,
      dismissSessionExpired,
      reLogin: loginAndDismissBanner,
      pwdAge,
      sessionRevoked,
      draftSaved,
      dismissSessionRevoked,
      cancelSessionConflict,
    }),
    [
      user,
      loading,
      login,
      logout,
      verifyTOTP,
      hasRole,
      hasModule,
      totpPending,
      totpUsername,
      totpEnrollmentRequired,
      completeTotpEnrollment,
      cancelTotp,
      sessionExpired,
      dismissSessionExpired,
      loginAndDismissBanner,
      pwdAge,
      sessionRevoked,
      draftSaved,
      dismissSessionRevoked,
      cancelSessionConflict,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
