// @ts-check
/**
 * licenseFleetView — pure presentation helpers for the License Manager fleet
 * table. Kept framework-free (no JSX) so it unit-tests under node:test.
 */

const EXPIRY_WARN_DAYS = 30;

/**
 * Map the Electron `ops:license.status` IPC payload to the compact status the
 * desktop reports to the server. Pure. (Lives here, not in fleetHeartbeat.js,
 * so node:test can import it without pulling in the api.js Vite module.)
 * @param {object} info
 */
export function deriveStatus(info) {
  const i = info && typeof info === 'object' ? info : {};
  let type = 'none';
  if (i.isUnlicensed) type = 'unlicensed';
  else if (i.isTrial) type = 'trial';
  else if (i.hasLicense && i.valid === false) type = 'invalid';
  else if (i.hasLicense) type = 'real';
  return {
    type,
    tier: ['S', 'M', 'L'].includes(i.tier) ? i.tier : null,
    expires_at: typeof i.expires_at === 'string' ? i.expires_at : null,
    isTrial: !!i.isTrial,
  };
}

/**
 * Build the heartbeat request body from an IPC status payload. Returns null if
 * there's no usable installation_id (caller skips the heartbeat). Pure.
 * @param {object} info
 */
export function buildHeartbeatPayload(info) {
  const id = info?.installationId;
  if (typeof id !== 'string' || !/^[0-9a-f]{64}$/i.test(id)) return null;
  return {
    installation_id: id,
    hostname: typeof info.hostname === 'string' ? info.hostname : '',
    status: deriveStatus(info),
  };
}

/**
 * Compute the status badge for a fleet row.
 * Tone: 'bad' (red) for anything that will brick or is non-prod, 'warn' for
 * expiring soon, 'good' for a healthy real license, 'neutral' otherwise.
 * @param {{status?:{type?:string,isTrial?:boolean}, days_left?:number|null}} m
 * @returns {{label:string, tone:'good'|'warn'|'bad'|'neutral'}}
 */
export function statusBadge(m) {
  const type = m?.status?.type || 'unknown';
  const days = typeof m?.days_left === 'number' ? m.days_left : null;
  if (type === 'unlicensed') return { label: 'UNLICENSED', tone: 'bad' };
  if (type === 'invalid') return { label: 'INVALID', tone: 'bad' };
  if (type === 'none') return { label: 'NO LICENSE', tone: 'bad' };
  if (type === 'trial') return { label: 'TRIAL', tone: 'bad' };
  // real license
  if (days != null && days < 0) return { label: 'EXPIRED', tone: 'bad' };
  if (days != null && days < EXPIRY_WARN_DAYS) return { label: `REAL · ${days}d`, tone: 'warn' };
  if (type === 'real') return { label: days != null ? `REAL · ${days}d` : 'REAL', tone: 'good' };
  return { label: type.toUpperCase(), tone: 'neutral' };
}

/** Human-readable days-left. */
export function formatDaysLeft(days) {
  if (typeof days !== 'number') return '—';
  if (days < 0) return `expired ${-days}d ago`;
  return `${days}d`;
}

/** Shorten a 64-hex installation id for table display. */
export function shortId(id) {
  if (typeof id !== 'string' || id.length < 12) return id || '—';
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

/**
 * Build the "Export request" payload an operator hands back to the license
 * admin so a license can be minted offline for this exact machine.
 * @param {{installation_id:string, hostname?:string}} m
 * @param {string} requestedAtIso
 */
export function buildExportRequest(m, requestedAtIso) {
  return {
    installation_id: m?.installation_id || '',
    hostname: m?.hostname || '',
    requested_at: requestedAtIso,
  };
}

/** Suggested filename for the export-request download. */
export function exportRequestFilename(m) {
  const host = (m?.hostname || 'machine').replace(/[^a-zA-Z0-9_-]/g, '');
  return `license-request-${host}-${shortId(m?.installation_id).replace(/…/g, '_')}.json`;
}

/**
 * Render a stored ISO timestamp in the reader's own clock as `YYYY-MM-DD HH:mm`.
 *
 * The fleet table used to slice the ISO string directly, which shows UTC: a
 * heartbeat recorded at 13:19 Vietnam time read as "06:19". "Last seen" is the
 * column an operator uses to judge whether a machine is still alive, so seven
 * hours of apparent staleness is not cosmetic.
 *
 * `sv-SE` is not a language choice — it is the locale whose date format is
 * already ISO-8601, so the column stays sortable by eye and keeps the same
 * shape as the Hết hạn column beside it.
 *
 * @param {unknown} iso
 * @param {{timeZone?: string}} [opts] - timeZone is injectable so tests do not
 *   depend on where they run; omit it in app code to use the machine's zone.
 * @returns {string} formatted time, or '—' when there is nothing to show
 */
export function formatLastSeen(iso, opts = {}) {
  if (typeof iso !== 'string' || !iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  }).format(d);
}

/** Default gap between heartbeats once a session is up. */
export const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Run a heartbeat on a timer for as long as a session lasts.
 *
 * Before this the heartbeat fired once, from App.jsx's login-transition
 * effect, so "Last seen" in the fleet table really meant "last logged in" — a
 * machine left running for a week never refreshed. The same one shot also
 * gated licence delivery: a licence queued on Monday waited for the operator's
 * next login, which the UI described only as "heartbeat kế tiếp".
 *
 * `send` is required rather than defaulted: this module must stay importable
 * by node:test, and the real sender lives in fleetHeartbeat.js, which imports
 * ./api. fleetHeartbeat.js supplies it — see startFleetHeartbeat there.
 *
 * Errors are swallowed on purpose. A 403 is legitimate here (a web session, or
 * one opened before machine binding landed), and a fleet problem must never
 * surface to someone who was only trying to log in.
 *
 * @param {object} o
 * @param {() => Promise<{applied?:boolean, needsRestart?:boolean}>} o.send
 * @param {number} [o.intervalMs]
 * @param {(fn:Function, ms:number) => any} [o.schedule]
 * @param {(id:any) => void} [o.cancel]
 * @param {() => void} [o.onApplied] - called when a licence was actually applied
 * @returns {() => void} stop
 */
export function createHeartbeatLoop({
  send,
  intervalMs = HEARTBEAT_INTERVAL_MS,
  schedule = setInterval,
  cancel = clearInterval,
  onApplied,
} = {}) {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    // send() is called synchronously, not deferred through a microtask: the
    // first heartbeat should be in flight the moment the session opens, not
    // one turn of the event loop later. The try/catch covers a sender that
    // throws before returning its promise; .catch covers a rejection.
    let p;
    try {
      p = send();
    } catch {
      return;
    }
    Promise.resolve(p)
      .then((r) => {
        if (stopped) return;
        if (r?.applied && r?.needsRestart && typeof onApplied === 'function') onApplied();
      })
      .catch(() => {
        /* never surfaced — see above */
      });
  };
  tick();
  const id = schedule(tick, intervalMs);
  return () => {
    stopped = true;
    cancel(id);
  };
}
