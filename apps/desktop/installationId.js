/**
 * Installation-ID resolver — stable hardware fingerprint with cache.
 *
 * Sprint S-LICENSE-IDSTABLE (2026-06-22): fixes the "same machine reports two
 * different Installation IDs" bug. Root cause was in the old
 * `getHardwareFingerprint()`: it tried `node-machine-id` (which shells out to
 * `REG.exe QUERY …\MachineGuid` on Windows) and, on ANY failure, silently fell
 * back to a host-attribute string (`hostname|platform|arch|cpu`). The two
 * sources hash to two different IDs, so an intermittent REG.exe failure (AV/EDR
 * blocking the child spawn, localized/empty REG output, env/timeout) flipped the
 * machine's identity → spurious `installation-mismatch` on a license that was
 * issued for the OTHER fingerprint.
 *
 * Two fixes, both here so they're unit-testable without booting Electron:
 *   1. Cache the resolved ID once to `userData/installation-id`. A cache hit is
 *      authoritative — once written, the underlying source can never change the
 *      machine's identity again.
 *   2. NEVER cache a fallback-sourced ID. The canonical fingerprint is the
 *      MachineGuid hash (what licenses are issued against). When machine-id is
 *      unavailable this boot we still return the fallback live (so the app keeps
 *      working) but we do NOT lock it in — a later successful machine-id read
 *      establishes the authoritative cached ID instead.
 *
 * Hash inputs are byte-identical to the pre-fix code so previously-issued
 * licenses keep verifying: `sha256(machineId)` and
 * `sha256(hostname|platform|arch|cpuModel)`.
 *
 * Pure module (no electron / fs / node-machine-id) — the Electron wiring in
 * license.js injects the real cache + machine-id + fallback readers.
 */

'use strict';

const crypto = require('node:crypto');

const HEX64 = /^[0-9a-f]{64}$/;

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function safe(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * Derive the raw fingerprint, preferring the machine-id source.
 * @param {{ machineId: string|null, fallbackParts: string[] }} args
 * @returns {{ id: string, source: 'machine-id' | 'fallback' }}
 */
function computeFingerprint({ machineId, fallbackParts }) {
  if (typeof machineId === 'string' && machineId.trim()) {
    return { id: sha256Hex(machineId.trim()), source: 'machine-id' };
  }
  const fb = (Array.isArray(fallbackParts) ? fallbackParts : []).join('|');
  return { id: sha256Hex(fb), source: 'fallback' };
}

/**
 * Cache-first installation-ID resolver.
 *
 * @param {object} deps
 * @param {() => (string|null)} deps.readCache  Raw cache contents or null.
 * @param {(id: string) => void} deps.writeCache  Persist the authoritative ID.
 * @param {() => (string|null)} deps.getMachineId  node-machine-id raw value, or
 *   null when unavailable (the wiring catches throws and returns null).
 * @param {() => string[]} deps.getFallbackParts  [hostname, platform, arch, cpu].
 * @param {(msg: string) => void} [deps.log]
 * @returns {string} 64-char lowercase hex installation ID.
 */
function resolveInstallationId(deps) {
  const log = typeof deps.log === 'function' ? deps.log : () => {};

  // 1. Cache hit is authoritative — identity can never flip once established.
  const cached = safe(() => deps.readCache());
  if (typeof cached === 'string') {
    const trimmed = cached.trim().toLowerCase();
    if (HEX64.test(trimmed)) {
      log('[license] installation-id: cache hit (stable)');
      return trimmed;
    }
    if (trimmed) log('[license] installation-id: cache corrupt — recomputing');
  }

  // 2. Compute fresh, preferring the canonical machine-id source.
  const machineId = safe(() => deps.getMachineId());
  const fallbackParts = safe(() => deps.getFallbackParts()) || [];
  const { id, source } = computeFingerprint({ machineId, fallbackParts });

  if (source === 'machine-id') {
    log('[license] installation-id: computed via machine-id — caching as authoritative');
    safe(() => deps.writeCache(id));
  } else {
    // machine-id (REG.exe / MachineGuid) unavailable this boot. Return the
    // fallback live but DO NOT cache it — caching would lock in a different
    // identity than the canonical MachineGuid hash that licenses are bound to.
    log(
      '[license] installation-id: machine-id UNAVAILABLE this boot — using fallback (not cached)'
    );
  }
  return id;
}

module.exports = { HEX64, sha256Hex, computeFingerprint, resolveInstallationId };
