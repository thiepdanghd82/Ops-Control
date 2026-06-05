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
