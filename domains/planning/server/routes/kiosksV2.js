/**
 * Kiosk pairing REST routes (v2) — Sprint MES-2.3.
 *
 * 4 endpoints under `/api/planning/v2/kiosks/*`:
 *   POST   /pairings        — planner issues a one-shot pairing card
 *   GET    /pairings        — planner lists; ?active=1 for non-revoked + non-expired
 *   DELETE /pairings/:id    — sys role revokes
 *   POST   /redeem          — kiosk redeems token (NO auth — token-bearing)
 *
 * Auth (finalised in MES-2.7):
 *   - Mounted OUTSIDE the parent /v2 auth middleware so /redeem can be
 *     reached without a user session. Per-route guards apply auth +
 *     role on the planner/sys endpoints.
 *   - POST /pairings + GET /pairings: requireRole(2) AND tab-access
 *     gate on 'kiosk-admin' (layered defense). Both must pass.
 *     viewonly hits the role gate; users in groups that hide
 *     'kiosk-admin' (sales/cs/npi/purchasing/production/quality
 *     defaults) hit the tab gate. Both rejections emit the same
 *     `urn:ops:insufficient-role` envelope so contract tests see no
 *     shape change.
 *   - DELETE /pairings/:id: requireRole(5) (sys-only — pulls a kiosk's session).
 *
 * All errors via respondError() (RFC-7807 application/problem+json).
 */
import { Router } from 'express';
import { respondError } from '../lib/rfc7807.js';
import { resolveTabAccess } from '../../../../server/services/permissionService.js';

const ROLE_LEVELS = { viewonly: 1, user: 2, cost: 3, admin: 4, sys: 5 };

const actorOf = (req) => req.user?.user?.username || req.user?.username || 'unknown';
const actorIdOf = (req) => req.user?.user?.id ?? req.user?.id ?? 0;

function requireRole(level) {
  return (req, res, next) => {
    const role = req.user?.user?.role || req.user?.role;
    if ((ROLE_LEVELS[role] || 0) < level) {
      return respondError(res, {
        status: 403,
        type: 'urn:ops:insufficient-role',
        required_level: level,
        current_role: role || null,
      });
    }
    next();
  };
}

// MES-2.7 — local tab-access shim. resolveTabAccess() is the same
// authoritative resolver the project-wide requireTabAccess uses; we read
// `req.user.user` (set by the harness / cookie middleware) instead of
// going through the session store so the existing kiosk contract test
// fixtures keep working unchanged. Same envelope shape as requireRole
// so 15/15 contract tests stay green.
function requireTabAccess(tabId) {
  return (req, res, next) => {
    const u = req.user?.user || req.user;
    const access = resolveTabAccess(u, tabId);
    if (access !== 'edit') {
      return respondError(res, {
        status: 403,
        type: 'urn:ops:insufficient-role',
        required_tab: tabId,
        current_access: access,
      });
    }
    next();
  };
}

// Reason → status mapping for redeem failures. 410 Gone for stale/used
// tokens (kiosk should display "ask planner to re-issue"); 400 for the
// malformed shape (likely a typo in QR scan).
const REDEEM_STATUS = {
  malformed: 400,
  unknown: 410,
  expired: 410,
  'already-redeemed': 410,
  revoked: 410,
};

/**
 * @param {{
 *   db: import('better-sqlite3').Database,
 *   service: ReturnType<import('../services/kioskTokenService.js').createKioskTokenService>,
 *   validateMachineCode: (code: string) => boolean,
 *   authMiddleware: import('express').RequestHandler,
 * }} deps
 */
export function createKioskV2Router({ db, service, validateMachineCode, authMiddleware }) {
  const router = Router();
  const auth = authMiddleware;

  // POST /pairings — issue (planner role + kiosk-admin tab access)
  router.post('/pairings', auth, requireRole(2), requireTabAccess('kiosk-admin'), (req, res) => {
    const machineCode =
      typeof req.body?.machine_code === 'string' ? req.body.machine_code.trim() : '';
    if (!machineCode) {
      return respondError(res, {
        status: 400,
        type: 'urn:ops:validation',
        errors: [{ field: 'machine_code', code: 'required' }],
      });
    }
    if (!validateMachineCode(machineCode)) {
      return respondError(res, {
        status: 422,
        type: 'urn:ops:kiosk-machine-unknown',
        machine_code: machineCode,
      });
    }
    const issuerId = actorIdOf(req) || actorOf(req);
    const result = service.issuePairing(machineCode, issuerId, db);
    res.status(201).json(result);
  });

  // GET /pairings — list (?active=1 filters out revoked + expired)
  router.get('/pairings', auth, requireRole(2), requireTabAccess('kiosk-admin'), (req, res) => {
    const activeOnly = req.query.active === '1' || req.query.active === 'true';
    const where = activeOnly
      ? `WHERE revoked_at_utc IS NULL
           AND expires_at_utc > strftime('%Y-%m-%dT%H:%M:%fZ','now')`
      : '';
    const rows = db
      .prepare(
        `SELECT id, machine_code, issued_by_user_id, issued_at_utc, expires_at_utc,
                redeemed_at_utc, revoked_at_utc, session_jti, last_seen_at_utc
         FROM kiosk_pairing
         ${where}
         ORDER BY id DESC LIMIT 200`
      )
      .all();
    res.json({ rows });
  });

  // DELETE /pairings/:id — revoke (sys-only; pulls a kiosk session)
  router.delete('/pairings/:id', auth, requireRole(5), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return respondError(res, {
        status: 400,
        type: 'urn:ops:validation',
        errors: [{ field: 'id', code: 'integer' }],
      });
    }
    const result = service.revoke(id, db, actorIdOf(req) || actorOf(req));
    if (!result.ok && result.reason === 'not-found') {
      return respondError(res, {
        status: 404,
        type: 'urn:ops:kiosk-pairing-not-found',
        pairing_id: id,
      });
    }
    res.status(204).end();
  });

  // POST /redeem — kiosk swaps the one-shot pairing token for a session JWT.
  // No auth: the token IS the credential. Failure modes flatten to a single
  // urn:ops:kiosk-token-invalid type with a `reason` extension so the kiosk
  // UI can render "expired" vs "already paired" messaging.
  router.post('/redeem', (req, res) => {
    const token = req.body?.token;
    if (typeof token !== 'string' || !token) {
      return respondError(res, {
        status: 400,
        type: 'urn:ops:validation',
        errors: [{ field: 'token', code: 'required' }],
      });
    }
    const result = service.redeem(token, db);
    if (!result.ok) {
      return respondError(res, {
        status: REDEEM_STATUS[result.reason] || 410,
        type: 'urn:ops:kiosk-token-invalid',
        reason: result.reason,
      });
    }
    res.json({
      session_jwt: result.session_jwt,
      machine_code: result.machine_code,
      expires_at: result.expires_at,
      jti: result.jti,
    });
  });

  return router;
}
