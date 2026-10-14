// @ts-check
/**
 * singleSession — client helpers for SAP-style single-session takeover.
 *
 * Desktop sends its License Manager installation_id + hostname on login so the
 * server can detect "same account, another machine". On a web client there's no
 * IPC → we report a per-browser id minted by webClientId(). When this machine is kicked by a
 * takeover, the global 401 handler saves any in-progress quote draft locally
 * (so the operator doesn't lose work) before bouncing to the login screen.
 *
 * Pure helpers here (storage injected) are unit-tested; the JSX wiring lives in
 * AuthContext + the Login component.
 */

const DRAFT_KEY = 'ops_session_revoked_draft';

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function hostFallback() {
  try {
    return (typeof location !== 'undefined' && location.hostname) || 'web';
  } catch {
    return 'web';
  }
}

const WEB_ID_KEY = 'ops_web_client_id';

/**
 * 32 hex characters of randomness.
 *
 * crypto.getRandomValues is used rather than crypto.randomUUID because
 * randomUUID is gated on a SECURE CONTEXT and this app is served to the LAN
 * over plain http (http://10.102.3.252:3100), where it is undefined.
 * getRandomValues is available in insecure contexts; Math.random is the last
 * resort. This id only distinguishes browsers for takeover detection — it is
 * not a credential — so the weaker fallback is acceptable.
 */
function randomHex32() {
  try {
    const c = typeof crypto !== 'undefined' ? crypto : null;
    if (c && typeof c.getRandomValues === 'function') {
      const b = new Uint8Array(16);
      c.getRandomValues(b);
      return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    /* fall through */
  }
  let out = '';
  while (out.length < 32) out += Math.floor(Math.random() * 16).toString(16);
  return out.slice(0, 32);
}

/**
 * A stable identity for THIS browser, so single-session takeover works between
 * web clients.
 *
 * Every web client used to report the constant 'web'. findUserSessionConflict
 * skips any session whose installation_id matches the caller's — same machine
 * is never a conflict — so every browser in the company was the same machine
 * and the takeover prompt could never fire between two web users.
 *
 * The `web-` prefix is load-bearing: desktop fingerprints are 64-hex and
 * licenseFleet's requireOwnMachine gates on exactly that shape. A 64-hex web
 * id would let any browser act as a fleet machine and undo PR #105's fix.
 *
 * When storage is unavailable (private browsing, blocked site data) this falls
 * back to the old constant rather than to a fresh random id. A new id per page
 * load would be worse than today: every reload would look like a new machine
 * and prompt a takeover nobody can explain.
 *
 * @param {{getItem:Function,setItem:Function}|null} [storage]
 */
export function webClientId(storage = defaultStorage()) {
  if (!storage) return 'web';
  try {
    const existing = storage.getItem(WEB_ID_KEY);
    if (typeof existing === 'string' && /^web-[0-9a-f]{32}$/.test(existing)) return existing;
    const minted = `web-${randomHex32()}`;
    storage.setItem(WEB_ID_KEY, minted);
    return minted;
  } catch {
    return 'web';
  }
}

/**
 * Normalize the Electron `ops:license.status` payload into the login fields.
 * Without a valid 64-hex desktop id it reports `webId` — see webClientId().
 * Stays pure: the caller resolves the browser id and passes it in.
 * @param {any} ipcStatus
 * @param {string} [fallbackHost]
 * @param {string} [webId]
 */
export function deriveInstallInfo(ipcStatus, fallbackHost = 'web', webId = 'web') {
  const s = ipcStatus && typeof ipcStatus === 'object' ? ipcStatus : null;
  const id =
    s && typeof s.installationId === 'string' && /^[0-9a-f]{64}$/i.test(s.installationId)
      ? s.installationId
      : webId || 'web';
  const host = (s && typeof s.hostname === 'string' && s.hostname) || fallbackHost || 'web';
  return { installation_id: id, hostname: String(host).slice(0, 120) };
}

/** Resolve this machine's login identity (desktop IPC or 'web'). Async. */
export async function getInstallationInfo() {
  try {
    const ops = typeof window !== 'undefined' ? window.ops : null;
    if (ops?.license?.status) {
      const st = await ops.license.status();
      return deriveInstallInfo(st, hostFallback(), webClientId());
    }
  } catch {
    /* fall through to web identity */
  }
  return deriveInstallInfo(null, hostFallback(), webClientId());
}

/**
 * Human "N phút trước" for the takeover dialog. Pure.
 * @param {string} iso
 * @param {number} [nowMs]
 */
export function formatLastActivity(iso, nowMs = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (sec < 60) return 'vừa xong';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const d = Math.floor(hr / 24);
  return `${d} ngày trước`;
}

// ── In-progress draft capture (so a kicked operator doesn't lose work) ──────
let _draftProvider = null;

/**
 * The active calc tab registers a function returning its current quote draft
 * (or null if nothing worth saving). Returns an unregister fn.
 * @param {() => any} fn
 */
export function registerDraftProvider(fn) {
  _draftProvider = typeof fn === 'function' ? fn : null;
  return () => {
    if (_draftProvider === fn) _draftProvider = null;
  };
}

/** Pull the current draft from the registered provider (safe). */
export function captureDraft() {
  try {
    return _draftProvider ? _draftProvider() : null;
  } catch {
    return null;
  }
}

/** Persist a draft snapshot locally. Returns true on success. */
export function saveRevokedDraft(draft, storage = defaultStorage()) {
  if (draft == null || !storage) return false;
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify({ saved_at: new Date().toISOString(), draft }));
    return true;
  } catch {
    return false;
  }
}

/** Read back the saved draft snapshot, or null. */
export function loadRevokedDraft(storage = defaultStorage()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Clear the saved draft (after the operator restores or dismisses it). */
export function clearRevokedDraft(storage = defaultStorage()) {
  try {
    storage?.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Capture + persist the current draft in one call — used by the session-revoked
 * handler right before bouncing to login. Returns true if something was saved.
 */
export function snapshotDraftOnRevoke(storage = defaultStorage()) {
  const draft = captureDraft();
  if (draft == null) return false;
  return saveRevokedDraft(draft, storage);
}
