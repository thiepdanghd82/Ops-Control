/**
 * Quote approval workflow — 3-stage chain state machine.
 *
 * Pipeline (Cost → Sales → Finance) matches the CCL Design / Brady
 * corporate costing sign-off process. A quote authored by a cost
 * engineer is SUBMITted, reviewed by a sales manager, then by a
 * finance director. Either reviewer can REJECT, after which the cost
 * engineer re-submits with fixes.
 *
 *    draft
 *      │ SUBMIT (any writer: user+)
 *      ▼
 *    pending_sales
 *      │ APPROVE_SALES   (approval_role = sales_mgr OR admin+)
 *      ▼
 *    pending_finance
 *      │ APPROVE_FINANCE (approval_role = finance_dir OR admin+)
 *      ▼
 *    approved
 *
 *    pending_sales | pending_finance
 *      │ REJECT (any reviewer / admin+, non-empty reason)
 *      ▼
 *    rejected
 *      │ SUBMIT (re-submits to pending_sales)
 *      ▼
 *    pending_sales ...
 *
 *    approved
 *      │ REVOKE (sys only, escape hatch)
 *      ▼
 *    draft
 *
 * Back-compat: quotes saved with the v1 2-gate workflow stored
 * `status: 'submitted'`. That value is aliased to `pending_sales` on
 * read so the history table + inbox keep working. The legacy `APPROVE`
 * action still resolves — it advances the quote one step (pending_sales
 * → pending_finance, or pending_finance → approved) so scripts that
 * never migrated to the new action names keep functioning.
 *
 * Auth model:
 *   - Hierarchical role (viewonly < user < cost < admin < sys) — used
 *     for SUBMIT and REVOKE.
 *   - `approval_roles: string[]` on the user record — used for
 *     APPROVE_SALES / APPROVE_FINANCE / REJECT. Holding `'sales_mgr'`
 *     authorizes the Sales gate; `'finance_dir'` authorizes the
 *     Finance gate. Anyone with role ≥ admin can approve or reject at
 *     any gate as a safety override.
 *
 * Data model: each quote's `state.approval` object:
 *   {
 *     status,                              // 'draft' | 'pending_sales' | 'pending_finance' | 'approved' | 'rejected'
 *     submitted_at, submitted_by,
 *     sales_approved_at, sales_approved_by,
 *     finance_approved_at, finance_approved_by,
 *     approved_at, approved_by,            // = finance_approved_* (convenience mirror)
 *     rejected_at, rejected_by, rejected_stage, reason,
 *     history: [{ ts, from, to, action, actor, reason? }]
 *   }
 *
 * Implementation: pure function `transition()`. Caller is responsible
 * for persisting. The atomic-transition HTTP endpoint in Sprint 6.2
 * reads the quote, calls transition(), then writes back in a single
 * round trip to eliminate the read-modify-write race.
 */

export const APPROVAL_STATES = [
  'draft',
  'pending_sales',
  'pending_finance',
  'approved',
  'rejected',
];

// v1 → v2 read-time aliases. Old quotes with `submitted` are treated
// as `pending_sales`; writes always use the new status values.
const LEGACY_STATUS_ALIASES = {
  submitted: 'pending_sales',
};

const TRANSITIONS = {
  draft: {
    SUBMIT: 'pending_sales',
  },
  pending_sales: {
    APPROVE_SALES: 'pending_finance',
    APPROVE: 'pending_finance', // legacy alias — advance one gate
    REJECT: 'rejected',
  },
  pending_finance: {
    APPROVE_FINANCE: 'approved',
    APPROVE: 'approved', // legacy alias — advance one gate
    REJECT: 'rejected',
  },
  approved: {
    REVOKE: 'draft',
  },
  rejected: {
    SUBMIT: 'pending_sales',
  },
};

const ROLE_LEVELS = { viewonly: 1, user: 2, cost: 3, admin: 4, sys: 5 };

// Hierarchical role requirement. Present = use this gate only; absent
// = fall through to APPROVAL_AUTH (approval_roles-based).
const REQUIRED_ROLE_FOR_ACTION = {
  SUBMIT: 'user',
  REVOKE: 'sys',
};

// approval_roles-based auth. `approval_role` is the required entry in
// the user's `approval_roles` array; `fallback_role` is the
// hierarchical role that also grants the action (admin-as-safety-net).
// Array = any of the listed approval_roles authorizes.
const APPROVAL_AUTH = {
  APPROVE_SALES: { approval_role: 'sales_mgr', fallback_role: 'admin' },
  APPROVE_FINANCE: { approval_role: 'finance_dir', fallback_role: 'admin' },
  APPROVE: { approval_role: ['sales_mgr', 'finance_dir'], fallback_role: 'admin' },
  REJECT: { approval_role: ['sales_mgr', 'finance_dir'], fallback_role: 'admin' },
};

function currentStatus(approval) {
  if (!approval || !approval.status) return 'draft';
  const raw = approval.status;
  if (LEGACY_STATUS_ALIASES[raw]) return LEGACY_STATUS_ALIASES[raw];
  return APPROVAL_STATES.includes(raw) ? raw : 'draft';
}

function describeRequirement(action) {
  if (REQUIRED_ROLE_FOR_ACTION[action]) {
    return `role ${REQUIRED_ROLE_FOR_ACTION[action]}+`;
  }
  const auth = APPROVAL_AUTH[action];
  if (!auth) return 'no one';
  const approval = Array.isArray(auth.approval_role)
    ? auth.approval_role.join('|')
    : auth.approval_role;
  return `approval_role=${approval} OR role=${auth.fallback_role}+`;
}

function canUserTakeAction(user, action) {
  const role = user?.role || 'viewonly';
  const userLevel = ROLE_LEVELS[role] || 0;
  const approvalRoles = Array.isArray(user?.approval_roles) ? user.approval_roles : [];

  const hier = REQUIRED_ROLE_FOR_ACTION[action];
  if (hier) {
    return userLevel >= (ROLE_LEVELS[hier] || 999);
  }

  const auth = APPROVAL_AUTH[action];
  if (!auth) return false;
  const fallbackLevel = ROLE_LEVELS[auth.fallback_role] || 999;
  if (userLevel >= fallbackLevel) return true;
  if (auth.approval_role == null) return false;
  const needed = Array.isArray(auth.approval_role) ? auth.approval_role : [auth.approval_role];
  return needed.some((r) => approvalRoles.includes(r));
}

/**
 * Pure state-machine tick. Returns `{ ok, approval }` on success or
 * `{ ok: false, error }` on invalid action / insufficient role /
 * missing reject reason. Never mutates input.
 *
 * Phase 9E.4 — `snapshot` (optional): when the caller passes
 * `{ site, sga_rate_pct }`, the object is frozen into
 * `approval.rates_snapshot` at the APPROVE_FINANCE transition. Clients
 * that read an approved quote should prefer the snapshot over the
 * live Finance config so retroactive SGA edits can't silently shift
 * the margin of a sealed quote.
 */
export function transition({ approval, action, actorUser, reason, snapshot }) {
  const fromStatus = currentStatus(approval);
  const target = TRANSITIONS[fromStatus]?.[action];
  if (!target) {
    return {
      ok: false,
      error: `Cannot ${action} from status ${fromStatus}`,
    };
  }
  if (!canUserTakeAction(actorUser, action)) {
    return {
      ok: false,
      error: `User '${actorUser?.username || 'unknown'}' (role=${actorUser?.role || 'viewonly'}) cannot perform ${action} — requires ${describeRequirement(action)}`,
    };
  }
  if (action === 'REJECT' && (!reason || !String(reason).trim())) {
    return { ok: false, error: 'REJECT requires a non-empty reason' };
  }

  const nowISO = new Date().toISOString();
  const actor = actorUser?.username || 'unknown';
  const next = { ...(approval || {}), status: target };

  if (action === 'SUBMIT') {
    next.submitted_at = nowISO;
    next.submitted_by = actor;
    // A re-submission after REJECT clears the rejection fields so the
    // quote enters the review queue clean. History still records it.
    delete next.rejected_at;
    delete next.rejected_by;
    delete next.rejected_stage;
    delete next.reason;
  } else if (
    action === 'APPROVE_SALES' ||
    (action === 'APPROVE' && fromStatus === 'pending_sales')
  ) {
    next.sales_approved_at = nowISO;
    next.sales_approved_by = actor;
  } else if (
    action === 'APPROVE_FINANCE' ||
    (action === 'APPROVE' && fromStatus === 'pending_finance')
  ) {
    next.finance_approved_at = nowISO;
    next.finance_approved_by = actor;
    // Convenience mirror kept for UIs that read the v1 approved_at field.
    next.approved_at = nowISO;
    next.approved_by = actor;
    // Phase 9E.4 — freeze the pricing basis at the moment of final
    // approval. Later Finance edits (SGA rate bump, site rename) don't
    // alter what this approved quote reports as its margin. Only set
    // when the caller supplies a snapshot; tests & legacy callers that
    // omit it still work, just without snapshot protection.
    if (snapshot && typeof snapshot === 'object') {
      next.rates_snapshot = {
        site: snapshot.site ?? null,
        sga_rate_pct: Number.isFinite(Number(snapshot.sga_rate_pct))
          ? Number(snapshot.sga_rate_pct)
          : 0,
        frozen_at: nowISO,
        frozen_by: actor,
      };
    }
  } else if (action === 'REJECT') {
    next.rejected_at = nowISO;
    next.rejected_by = actor;
    next.rejected_stage = fromStatus; // 'pending_sales' or 'pending_finance'
    next.reason = reason;
  } else if (action === 'REVOKE') {
    delete next.approved_at;
    delete next.approved_by;
    delete next.finance_approved_at;
    delete next.finance_approved_by;
    // REVOKE unfreezes the rate snapshot — if the quote re-enters the
    // approval chain, a fresh snapshot will be captured at the next
    // APPROVE_FINANCE using whatever the live Finance config says then.
    delete next.rates_snapshot;
  }

  next.history = Array.isArray(approval?.history) ? approval.history.slice() : [];
  next.history.push({
    ts: nowISO,
    from: fromStatus,
    to: target,
    action,
    actor,
    ...(reason ? { reason } : {}),
  });
  if (next.history.length > 50) next.history = next.history.slice(-50);

  return { ok: true, approval: next };
}

export function getStatus(approval) {
  return currentStatus(approval);
}

/**
 * List of actions the given user can legitimately invoke against the
 * given approval object, in order of workflow progression. Used by the
 * UI to render exactly the buttons a user is allowed to click.
 */
export function availableActions(approval, user) {
  const fromStatus = currentStatus(approval);
  const possible = Object.keys(TRANSITIONS[fromStatus] || {});
  return possible.filter((a) => canUserTakeAction(user, a));
}

const PENDING_STATES = new Set(['pending_sales', 'pending_finance']);

/**
 * Count how many quotes the given user can act on right now. Used by
 * the sidebar badge (Sprint 6.5) to surface a reviewer's queue without
 * needing to load the full inbox.
 *
 * Pure: no IO. Caller supplies the quote list already loaded.
 * `approval` may be missing (treated as 'draft', which yields 0 actions
 * for most roles) so legacy quotes never inflate the count.
 */
export function countActionable(quotes, user) {
  if (!Array.isArray(quotes) || !user) return 0;
  let n = 0;
  for (const q of quotes) {
    // Sprint 1.7e — exclude soft-deleted quotes. Sprint 13 added the
    // soft-delete flag (`deleted_at`); the inbox page already hides
    // those rows but this counter was scanning the raw `loadQuotes()`
    // list, so a deleted-but-not-purged quote in PENDING_SALES kept
    // the sidebar badge stuck on "1" forever. Same kind of fix as the
    // Dashboard collectMetrics scan (Sprint 1.7).
    if (q?.deleted_at) continue;
    const approval = q?.state?.approval;
    if (!PENDING_STATES.has(currentStatus(approval))) continue;
    if (availableActions(approval, user).length > 0) n++;
  }
  return n;
}
