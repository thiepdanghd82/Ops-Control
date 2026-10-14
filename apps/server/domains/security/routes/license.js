// @ts-check
/**
 * License status router — admin/sys-only diagnostic endpoint.
 *
 * v1.3 P3.1 / P5.1. Extracted from costApi.js as the second domain
 * router (following audit.js POC). Surfaces tier, seat usage, and
 * expiry to the admin UI's License panel.
 *
 *   GET /api/license/status
 *     → 200 { ok, customer, tier, max_users, active_users,
 *             seats_remaining, expires_at, features, isTrial, isUnlicensed }
 *     → 402 if license invalid (renderable as "license-invalid" banner)
 *     → 403 if requester not admin/sys
 *
 * `countActiveUsers` is injected so the route stays decoupled from the
 * users.json file location (server/index.js owns DATA_DIR resolution).
 */

import express from 'express';
import { authMiddleware as defaultAuth } from '../../../middleware/auth.js';
import { getLicense } from '../../../services/licenseService.js';

/**
 * @param {object} deps
 * @param {() => number} deps.countActiveUsers
 * @param {import('express').RequestHandler} [deps.auth] - injectable so
 *   integration tests can stub authentication. Defaults to the real
 *   session-cookie validating middleware.
 */
export function createLicenseRouter({ countActiveUsers, auth = defaultAuth }) {
  const router = express.Router();

  router.get('/status', auth, (req, res) => {
    const role = req.user?.user?.role || req.user?.role;
    if (role !== 'admin' && role !== 'sys') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const lic = getLicense();
    if (!lic.ok) {
      return res.status(402).json({ ok: false, error: lic.reason, detail: lic.detail });
    }
    const active = typeof countActiveUsers === 'function' ? Number(countActiveUsers()) : 0;
    res.json({
      ok: true,
      customer: lic.license.customer,
      tier: lic.license.tier,
      max_users: lic.license.max_users,
      active_users: active,
      seats_remaining: Math.max(0, lic.license.max_users - active),
      expires_at: lic.license.expires_at,
      features: lic.license.features,
      isTrial: !!lic.license.isTrial,
      isUnlicensed: !!lic.license.isUnlicensed,
    });
  });

  return router;
}

export default createLicenseRouter;
