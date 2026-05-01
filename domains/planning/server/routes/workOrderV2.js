/**
 * Work Order REST routes (v2) — Sprint MES-1.4.
 *
 * 7 endpoints under `/api/planning/v2/work-orders/*` per PRD §7.
 * Auth: existing `requireRole(2)` numeric for writes (CHỐT 1 / R7-B —
 * defer string `planner` role to Sprint SU); `requireModule('planning')`
 * for reads. Tab-access enforcement (PRD §9 `requireTabAccess`) is
 * deferred to Sprint SU; the catalog entry lands now.
 *
 * All error responses use `application/problem+json` (RFC-7807).
 *
 * 401 from the global `authMiddleware` mounted at app.use level still
 * uses the legacy `{error}` envelope; aligning that to RFC-7807 is a
 * cross-cutting infrastructure change, deferred. See PR notes.
 */
import { Router } from 'express';
import { BmesError } from '../errors.js';
import {
  validateCreate,
  validatePatch,
  validateRelease,
  validateCancel,
  validateAddOperation,
  parseListQuery,
} from '../../shared/schema/workOrderSchema.js';

// Note (MES-2.3): a refactor to route through lib/rfc7807.js → respondError()
// was attempted and ROLLED BACK (Patch N2 fallback). The wo-terminal-edit
// payload carries `status: <wo.status>` which collides with RFC-7807's
// reserved `status` member (HTTP code). The old emitter let body.status be
// overwritten to e.g. 'CANCELLED' while res.status(409) kept the HTTP
// code correct; routing through respondError destructures `status` from
// the merged object, so the WO status leaks back into HTTP.status. Fixing
// this is a shape change requiring its own ticket; for now keep emitting
// inline. The kiosks router (MES-2.3) uses respondError directly.
function problemJson(res, status, type, payload = {}) {
  return res
    .status(status)
    .type('application/problem+json')
    .json({ type, status, ...payload });
}

// RFC-7807 versions of the role + module gates. The project-wide
// requireRole / requireModule (server/middleware/auth.js) emit a legacy
// {error} envelope — we duplicate the ~10 LOC of guard logic here so
// AC-1.4.9 (every error is application/problem+json) holds end-to-end.
// Sprint SU is expected to align the shared middleware to RFC-7807; at
// that point these wrappers can be replaced with direct imports.
const ROLE_LEVELS = { viewonly: 1, user: 2, cost: 3, admin: 4, sys: 5 };

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

function requireModule(name) {
  return (req, res, next) => {
    const modules = req.user?.user?.modules || req.user?.modules || {};
    if (!modules[name]) {
      return problemJson(res, 403, 'urn:ops:no-module', { module: name });
    }
    next();
  };
}

const STATUS_BY_TYPE = {
  'urn:ops:wo-not-found': 404,
  'urn:ops:wo-no-operations': 422,
  'urn:ops:wo-invalid-transition': 409,
  'urn:ops:wo-terminal-edit': 409,
  'urn:ops:wo-code-collision': 409,
  'urn:ops:wo-no-change': 409,
  'urn:ops:wo-forbidden-fields': 400,
  'urn:ops:wo-reason-required': 400,
  'urn:ops:wo-unknown-state': 400,
};

// State-mutating endpoints (release, cancel) translate the state-machine's
// internal wo-no-change self-loop signal into the canonical wo-invalid-
// transition shape — clients always see {from, to, allowed_from} for any
// rejected transition. Hardcoded allowed_from mirrors INVERSE_TRANSITIONS
// for the two target statuses these endpoints attempt; if the state-
// machine's edge set ever changes, MES-1.2 unit tests catch the drift
// first and these constants need a parallel update.
const ALLOWED_FROM_RELEASE = Object.freeze(['CREATED']);
const ALLOWED_FROM_CANCEL = Object.freeze([
  'CREATED',
  'RELEASED',
  'SCHEDULED',
  'IN_PROGRESS',
  'ON_HOLD',
]);

function translateNoChange(e, allowedFrom) {
  if (e instanceof BmesError && e.type === 'urn:ops:wo-no-change') {
    return new BmesError('urn:ops:wo-invalid-transition', {
      ...e.payload,
      allowed_from: [...allowedFrom],
    });
  }
  return e;
}

function handleError(res, e) {
  if (e instanceof BmesError) {
    return problemJson(res, STATUS_BY_TYPE[e.type] || 500, e.type, e.payload);
  }
  // Internal/unexpected — never echo `e.message` (may leak SQLite shape).
  return problemJson(res, 500, 'urn:ops:internal-error', { detail: 'internal_error' });
}

function sendValidationErrors(res, errors) {
  // PATCH forbidden-fields collapses into a single root-level object so
  // the response carries the canonical `forbidden_fields` extension that
  // the client renders as field-level inline errors.
  if (errors.length === 1 && errors[0].field === '_root' && errors[0].code === 'forbidden_fields') {
    return problemJson(res, 400, 'urn:ops:wo-forbidden-fields', {
      forbidden_fields: errors[0].forbidden_fields,
    });
  }
  return problemJson(res, 400, 'urn:ops:validation', { errors });
}

const actorOf = (req) => req.user?.user?.username || req.user?.user || 'unknown';

export function createWorkOrderV2Router({ service }) {
  const router = Router();

  // GET /work-orders/:id (read)
  router.get('/work-orders/:id', requireModule('planning'), (req, res) => {
    try {
      res.json(service.getDetail(Number(req.params.id)));
    } catch (e) {
      handleError(res, e);
    }
  });

  // GET /work-orders (list)
  router.get('/work-orders', requireModule('planning'), (req, res) => {
    try {
      res.json(service.listWorkOrders(parseListQuery(req.query)));
    } catch (e) {
      handleError(res, e);
    }
  });

  // POST /work-orders (create)
  router.post('/work-orders', requireRole(2), (req, res) => {
    const errors = validateCreate(req.body);
    if (errors.length) return sendValidationErrors(res, errors);
    try {
      res.status(201).json(service.createWorkOrder(req.body, actorOf(req)));
    } catch (e) {
      handleError(res, e);
    }
  });

  // PATCH /work-orders/:id (edit header)
  router.patch('/work-orders/:id', requireRole(2), (req, res) => {
    const errors = validatePatch(req.body);
    if (errors.length) return sendValidationErrors(res, errors);
    try {
      res.json(service.updateHeader(Number(req.params.id), req.body, actorOf(req)));
    } catch (e) {
      handleError(res, e);
    }
  });

  // POST /work-orders/:id/release
  router.post('/work-orders/:id/release', requireRole(2), (req, res) => {
    const errors = validateRelease(req.body || {});
    if (errors.length) return sendValidationErrors(res, errors);
    try {
      const wo = service.releaseWorkOrder(Number(req.params.id), actorOf(req), req.body?.notes);
      res.json(wo);
    } catch (e) {
      handleError(res, translateNoChange(e, ALLOWED_FROM_RELEASE));
    }
  });

  // POST /work-orders/:id/cancel
  router.post('/work-orders/:id/cancel', requireRole(2), (req, res) => {
    const errors = validateCancel(req.body || {});
    if (errors.length) return sendValidationErrors(res, errors);
    try {
      res.json(service.cancelWorkOrder(Number(req.params.id), req.body.reason, actorOf(req)));
    } catch (e) {
      handleError(res, translateNoChange(e, ALLOWED_FROM_CANCEL));
    }
  });

  // POST /work-orders/:id/operations
  router.post('/work-orders/:id/operations', requireRole(2), (req, res) => {
    const errors = validateAddOperation(req.body || {});
    if (errors.length) return sendValidationErrors(res, errors);
    try {
      res.status(201).json(service.attachOperation(Number(req.params.id), req.body, actorOf(req)));
    } catch (e) {
      handleError(res, e);
    }
  });

  return router;
}
