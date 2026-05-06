// Reason-code reference + admin endpoint — Sprint MES-2.6b (GET) +
// Sprint MES-3-V2 KIOSK-002 (POST/PATCH/disable/enable).
//
// GET '/' — public, unauthenticated reference data; cache 5 min. Kiosk
//           caches in localStorage so a paused-with-reason flow works
//           offline. ?include_disabled=1 for the admin tab list.
// POST '/' — create (admin role, requires explicit user session).
// PATCH '/:code' — update label/category/sort_order (NOT code itself).
// POST '/:code/disable' — soft-delete (active=0).
// POST '/:code/enable' — restore (active=1).
//
// Mutation routes are guarded by:
//   - the parent app-level auth middleware (mountPlanning wires this
//     in front of /api/planning/v2/reason-codes);
//   - role gate: requireRole('admin'); the kiosk JWT has no role so
//     kiosk session JTIs fall through to 403.
//
// All error responses are application/problem+json (RFC-7807).
import { Router } from 'express';
import { BmesError } from '../errors.js';
import { createReasonCodeService } from '../services/reasonCodeService.js';

const STATUS_BY_TYPE = {
  'urn:ops:validation': 400,
  'urn:ops:reason-code-not-found': 404,
  'urn:ops:reason-code-collision': 409,
  'urn:ops:reason-code-already-disabled': 409,
  'urn:ops:reason-code-already-enabled': 409,
  'urn:ops:reason-code-forbidden-fields': 400,
  'urn:ops:insufficient-role': 403,
};

const ROLE_LEVELS = { viewonly: 1, user: 2, cost: 3, admin: 4, sys: 5 };

function problemJson(res, status, type, payload = {}) {
  return res
    .status(status)
    .type('application/problem+json')
    .json({ type, status, ...payload });
}

function handleError(res, e) {
  if (e instanceof BmesError) {
    return problemJson(res, STATUS_BY_TYPE[e.type] || 500, e.type, e.payload);
  }
  return problemJson(res, 500, 'urn:ops:internal-error', { detail: 'internal_error' });
}

function requireRole(level) {
  return (req, res, next) => {
    const role = req.user?.user?.role || req.user?.role;
    if ((ROLE_LEVELS[role] || 0) < level) {
      return problemJson(res, 403, 'urn:ops:insufficient-role', {
        required_level: level,
        current_role: role || null,
      });
    }
    next();
  };
}

const actorOf = (req) => req.user?.user?.username || req.user?.user || 'unknown';

/**
 * Build the reason-codes router.
 *
 * @param {object} args
 * @param {object} args.db
 * @param {(row: { ts, event, user, ip?, detail }) => void} [args.audit]
 *   Required for mutation routes. If absent, mutation routes are not
 *   mounted (GET-only mode preserves MES-2.6b backward compat for any
 *   legacy boot path that didn't pass audit).
 * @param {import('express').RequestHandler} [args.authMiddleware]
 *   Per-route auth gate for mutation endpoints. The MES-2.6b GET path
 *   stays auth-free.
 */
export function createReasonCodesV2Router({ db, audit, authMiddleware }) {
  const router = Router();

  // ── Public GET (unchanged contract from MES-2.6b) ───────────────
  // Default returns active=1 only (kiosk picker expectation). Pass
  // ?include_disabled=1 from the admin UI to surface every row.
  router.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    const includeDisabled = req.query?.include_disabled === '1';
    const rows = includeDisabled
      ? db
          .prepare(
            `SELECT code, label_en, label_vn, category, sort_order, active
             FROM reason_code ORDER BY active DESC, sort_order ASC, code ASC`
          )
          .all()
      : db
          .prepare(
            `SELECT code, label_en, label_vn, category, sort_order
             FROM reason_code WHERE active = 1 ORDER BY sort_order ASC, code ASC`
          )
          .all();
    res.json({ items: rows });
  });

  // Mutation routes — only mounted when audit closure was provided.
  if (audit) {
    const service = createReasonCodeService({ db, audit });
    const adminGate = [];
    if (authMiddleware) adminGate.push(authMiddleware);
    adminGate.push(requireRole(ROLE_LEVELS.admin));

    router.post('/', ...adminGate, (req, res) => {
      try {
        const row = service.create(req.body, actorOf(req));
        res.status(201).json(row);
      } catch (e) {
        handleError(res, e);
      }
    });

    router.patch('/:code', ...adminGate, (req, res) => {
      try {
        const row = service.update(req.params.code, req.body || {}, actorOf(req));
        res.json(row);
      } catch (e) {
        handleError(res, e);
      }
    });

    router.post('/:code/disable', ...adminGate, (req, res) => {
      try {
        const row = service.disable(req.params.code, actorOf(req));
        res.json(row);
      } catch (e) {
        handleError(res, e);
      }
    });

    router.post('/:code/enable', ...adminGate, (req, res) => {
      try {
        const row = service.enable(req.params.code, actorOf(req));
        res.json(row);
      } catch (e) {
        handleError(res, e);
      }
    });
  }

  return router;
}
