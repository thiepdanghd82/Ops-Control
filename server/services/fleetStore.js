/**
 * fleetStore — License Manager fleet state, JSON-file backed.
 *
 * "Ký offline, phân phối online": this store NEVER signs or holds a private
 * key. It only tracks (a) per-machine heartbeats (self-reported license
 * status), (b) a queue of already-signed-and-verified licenses pending
 * delivery, and (c) a distribution log.
 *
 * Storage: plain JSON files under <DATA_DIR>/Library/Fleet/ via atomicWrite —
 * NO database schema / migration (raw-json pattern, same spirit as quotes on
 * the file backend). Each call reads + rewrites the small JSON map.
 *
 *   heartbeats.json        { [installation_id]: { ...machine, last_seen } }
 *   pending-licenses.json  { [installation_id]: { license, queued_at } }
 *   distributed-log.json   [ { installation_id, distributed_at, ... } ]
 */
import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from './atomicWrite.js';

const HEX64 = /^[0-9a-f]{64}$/i;
const STATUS_TYPES = ['real', 'trial', 'unlicensed', 'invalid', 'none', 'unknown'];

function fleetDir(dataDir) {
  return path.join(dataDir, 'Library', 'Fleet');
}
function hbPath(dataDir) {
  return path.join(fleetDir(dataDir), 'heartbeats.json');
}
function pendingPath(dataDir) {
  return path.join(fleetDir(dataDir), 'pending-licenses.json');
}
function distributedPath(dataDir) {
  return path.join(fleetDir(dataDir), 'distributed-log.json');
}

function readJson(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const v = JSON.parse(fs.readFileSync(p, 'utf8'));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(dataDir, p, obj) {
  fs.mkdirSync(fleetDir(dataDir), { recursive: true });
  atomicWriteFileSync(p, JSON.stringify(obj, null, 2));
}

function sanitizeStatus(s) {
  const o = s && typeof s === 'object' ? s : {};
  return {
    type: STATUS_TYPES.includes(o.type) ? o.type : 'unknown',
    tier: ['S', 'M', 'L'].includes(o.tier) ? o.tier : null,
    expires_at: typeof o.expires_at === 'string' ? o.expires_at : null,
    isTrial: !!o.isTrial,
  };
}

/**
 * Record a machine heartbeat. Stores ONLY status metadata — never the license
 * payload or signature. Throws on a malformed installation_id so the caller
 * can return 400.
 */
export function recordHeartbeat(dataDir, { installation_id, hostname, status } = {}, nowIso) {
  const id = String(installation_id || '');
  if (!HEX64.test(id)) throw new Error('bad-installation-id');
  const ts = nowIso || new Date().toISOString();
  const p = hbPath(dataDir);
  const all = readJson(p, {});
  const prev = all[id] || {};
  all[id] = {
    installation_id: id,
    hostname: String(hostname || prev.hostname || '').slice(0, 120),
    status: sanitizeStatus(status),
    first_seen: prev.first_seen || ts,
    last_seen: ts,
  };
  writeJson(dataDir, p, all);
  return all[id];
}

/**
 * List the fleet for the admin table: every machine seen, enriched with
 * days_left (computed from self-reported expires_at) + whether a license is
 * pending delivery. Sorted by last_seen desc.
 */
export function listFleet(dataDir, nowMs) {
  const hb = readJson(hbPath(dataDir), {});
  const pending = readJson(pendingPath(dataDir), {});
  const now = nowMs ?? Date.now();
  return Object.values(hb)
    .map((m) => {
      const expMs = m.status?.expires_at ? new Date(m.status.expires_at).getTime() : null;
      const days_left = Number.isFinite(expMs) ? Math.floor((expMs - now) / 86400000) : null;
      return { ...m, days_left, pending_license: !!pending[m.installation_id] };
    })
    .sort((a, b) => (String(a.last_seen) < String(b.last_seen) ? 1 : -1));
}

/**
 * Queue an already-VERIFIED signed license for delivery to its target machine.
 * The caller MUST have run verifyLicenseObject() first — this store does not
 * verify (and must never need a key to do so).
 */
export function queuePendingLicense(dataDir, license, nowIso) {
  const id = String(license?.installation_id || '');
  if (!HEX64.test(id)) throw new Error('bad-installation-id');
  const p = pendingPath(dataDir);
  const all = readJson(p, {});
  all[id] = { license, queued_at: nowIso || new Date().toISOString() };
  writeJson(dataDir, p, all);
  return all[id];
}

/** Return the pending signed license for a machine, or null. */
export function getPendingForInstall(dataDir, installation_id) {
  const all = readJson(pendingPath(dataDir), {});
  return all[String(installation_id || '')]?.license || null;
}

/**
 * Mark a machine's pending license as delivered: removes it from the queue and
 * appends to the distribution log. Returns false if nothing was pending.
 */
export function markDistributed(dataDir, installation_id, nowIso) {
  const id = String(installation_id || '');
  const p = pendingPath(dataDir);
  const all = readJson(p, {});
  const entry = all[id];
  if (!entry) return false;
  delete all[id];
  writeJson(dataDir, p, all);
  const dp = distributedPath(dataDir);
  const log = readJson(dp, []);
  log.push({
    installation_id: id,
    distributed_at: nowIso || new Date().toISOString(),
    tier: entry.license?.tier ?? null,
    expires_at: entry.license?.expires_at ?? null,
  });
  writeJson(dataDir, dp, log);
  return true;
}
