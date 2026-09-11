// @ts-check
/**
 * License Manager — fleet router (v1.6, ships AFTER go-live).
 *
 * "Ký offline, phân phối online". The SERVER NEVER signs a license and never
 * holds a private key — it only:
 *   - B1  POST /heartbeat   : record a machine's self-reported license status.
 *                             Any role, but ONLY for the machine the caller's
 *                             own session was opened from (requireOwnMachine).
 *                             The status itself is self-reported and cannot be
 *                             verified server-side — the fleet table must say
 *                             so rather than present it as fact.
 *   - B2  GET  /            : fleet table (sys-only).
 *   - B2  POST /upload      : accept an already-signed license, VERIFY its
 *                             signature + installation_id, queue for delivery
 *                             (sys-only).
 *   - B3  (heartbeat reply) : deliver a queued license to its target machine.
 *   - B2  DELETE /:id       : forget a machine + any licence queued for it
 *                             (sys-only — administration of OTHER machines).
 *   - B3  POST /distributed : client confirms it applied → mark delivered
 *                             (own machine only — it deletes from the queue).
 *
 * Audit: LICENSE_UPLOAD (accept/reject) + LICENSE_DISTRIBUTED.
 */
import express from 'express';
import { authMiddleware as defaultAuth } from '../../../middleware/auth.js';
import { audit as defaultAudit } from '../../../services/authService.js';
import { verifyLicenseObject } from '../../../services/licenseService.js';
import {
  recordHeartbeat,
  listFleet,
  queuePendingLicense,
  getPendingForInstall,
  markDistributed,
  forgetMachine,
} from '../../../services/fleetStore.js';

/**
 * @param {object} deps
 * @param {string} deps.dataDir - resolved DATA_DIR (server/index.js owns this).
 * @param {import('express').RequestHandler} [deps.auth] - injectable for tests.
 * @param {() => Date} [deps.now] - injectable clock for tests.
 * @param {typeof defaultAudit} [deps.audit] - injectable audit sink for tests.
 */
export function createLicenseFleetRouter({
  dataDir,
  auth = defaultAuth,
  now = () => new Date(),
  audit = defaultAudit,
}) {
  const router = express.Router();

  const roleOf = (req) => req.user?.user?.role || req.user?.role;
  const userOf = (req) => req.user?.user?.username || req.user?.username || '-';
  const ipOf = (req) => req.ip || req.headers['x-forwarded-for'] || '-';

  const HEX64 = /^[0-9a-f]{64}$/i;
  const boundInstallOf = (req) => req.user?.installation_id || req.user?.user?.installation_id;

  // Machine-identity gate. AUDIT 2026-09-11: /heartbeat and /distributed took
  // installation_id straight from the request body with nothing tying it to
  // the caller, so any authenticated session — `viewonly` included — could
  // overwrite another machine's fleet row, read the signed license queued for
  // it, or delete that license from the queue while writing a
  // LICENSE_DISTRIBUTED row the target never earned.
  //
  // The binding already existed and was simply not consulted: the desktop app
  // sends its installation_id at login and authService stores it on the
  // session (authService.js:766).
  //
  // This is about identity, not privilege, so `sys` is NOT exempt — a sys
  // admin's laptop is still only its own machine. Managing OTHER machines is
  // what the sys-only /upload route is for.
  //
  // Fails closed: a session with no real machine id (web clients report 'web',
  // sessions opened before this change report 'unknown') is refused. Those
  // clients never call these routes — fleetHeartbeat.js no-ops without
  // window.ops — and a desktop user on a stale session recovers by logging in
  // again, which rebinds the session. Heartbeat failures never block login.
  const requireOwnMachine = (req, res, next) => {
    const bound = String(boundInstallOf(req) || '');
    if (!HEX64.test(bound)) {
      return res
        .status(403)
        .json({ ok: false, error: 'Forbidden', reason: 'session-not-machine-bound' });
    }
    const claimed = String(req.body?.installation_id || '');
    if (bound.toLowerCase() !== claimed.toLowerCase()) {
      return res
        .status(403)
        .json({ ok: false, error: 'Forbidden', reason: 'installation-mismatch' });
    }
    next();
  };

  // sys-only gate, applied AFTER the existing auth middleware.
  const requireSys = (req, res, next) => {
    if (roleOf(req) !== 'sys') return res.status(403).json({ ok: false, error: 'Forbidden' });
    next();
  };

  // ── B1 — heartbeat (any authenticated session) ──────────────────────────
  // Machine-auth is the existing user session: the desktop app only reaches
  // here after the operator has logged in, so the session cookie authenticates
  // the request and `installation_id` (HW fingerprint) identifies the machine.
  // NO new secret/env is introduced. We never receive license content here.
  router.post('/heartbeat', auth, requireOwnMachine, (req, res) => {
    const { installation_id, hostname, status } = req.body || {};
    try {
      recordHeartbeat(dataDir, { installation_id, hostname, status }, now().toISOString());
    } catch (e) {
      return res.status(400).json({ ok: false, error: String(e.message || e) });
    }
    // ── B3 — deliver a queued license to this machine, if any ──
    const pending = getPendingForInstall(dataDir, installation_id);
    return res.json({ ok: true, recorded: true, pending_license: pending || null });
  });

  // ── B2 — fleet table (sys-only) ─────────────────────────────────────────
  router.get('/', auth, requireSys, (req, res) => {
    res.json({ ok: true, fleet: listFleet(dataDir) });
  });

  // ── B2 — upload an already-signed license (sys-only) ────────────────────
  // Server VERIFIES the signature + installation_id match BEFORE queuing. It
  // CANNOT and DOES NOT sign anything; a malformed/forged/expired/trial
  // license is rejected with 422.
  router.post('/upload', auth, requireSys, (req, res) => {
    const license = req.body?.license;
    const expectedId = req.body?.installation_id;
    const v = verifyLicenseObject(license);
    if (!v.ok) {
      audit(
        'LICENSE_UPLOAD',
        userOf(req),
        ipOf(req),
        JSON.stringify({ ok: false, reason: v.reason, expected: expectedId || null })
      );
      return res.status(422).json({ ok: false, error: 'verify_failed', reason: v.reason });
    }
    if (expectedId && v.license.installation_id !== expectedId) {
      audit(
        'LICENSE_UPLOAD',
        userOf(req),
        ipOf(req),
        JSON.stringify({ ok: false, reason: 'installation-mismatch', expected: expectedId })
      );
      return res
        .status(422)
        .json({ ok: false, error: 'verify_failed', reason: 'installation-mismatch' });
    }
    queuePendingLicense(dataDir, license, now().toISOString());
    audit(
      'LICENSE_UPLOAD',
      userOf(req),
      ipOf(req),
      JSON.stringify({
        ok: true,
        installation_id: v.license.installation_id,
        tier: v.license.tier,
        expires_at: v.license.expires_at,
      })
    );
    res.json({ ok: true, queued: true, installation_id: v.license.installation_id });
  });

  // ── B2 — forget a machine (sys-only) ────────────────────────────────────
  // The fleet table only ever grew: decommissioned and re-imaged machines
  // stayed forever and diluted the one question it exists to answer.
  //
  // sys-only, NOT requireOwnMachine — this is administration of OTHER
  // machines, the same boundary /upload sits behind. Gating it on the caller's
  // own machine would be exactly backwards: you never delete your own row.
  router.delete('/:installation_id', auth, requireSys, (req, res) => {
    const id = String(req.params.installation_id || '');
    if (!HEX64.test(id)) {
      return res.status(400).json({ ok: false, error: 'bad-installation-id' });
    }
    const r = forgetMachine(dataDir, id);
    // Nothing happened → nothing to record. An audit row for a no-op is noise
    // that makes the real ones harder to find.
    if (r.removed || r.had_pending) {
      audit(
        'LICENSE_FLEET_FORGET',
        userOf(req),
        ipOf(req),
        JSON.stringify({ installation_id: id, ...r })
      );
    }
    res.json({ ok: true, ...r });
  });

  // ── B3 — client confirms it applied the delivered license ───────────────
  router.post('/distributed', auth, requireOwnMachine, (req, res) => {
    const { installation_id } = req.body || {};
    const done = markDistributed(dataDir, installation_id, now().toISOString());
    if (done) {
      audit('LICENSE_DISTRIBUTED', userOf(req), ipOf(req), JSON.stringify({ installation_id }));
    }
    res.json({ ok: done, distributed: done });
  });

  return router;
}

export default createLicenseFleetRouter;
