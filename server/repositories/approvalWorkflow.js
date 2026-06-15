/**
 * Quote-progress state machine — server-side authority.
 *
 * Sprint S-QUOTE-PROGRESS-V2 (2026-06-15) — full rewrite. The v1 3-stage
 * pipeline (Cost → Sales → Finance) was collapsed per Henry's spec into
 * a flat 5-status dropdown:
 *
 *   • draft           — initial state, work in progress
 *   • quote_to_sale   — sent to Sales for review
 *   • price_approved  — Sales / Cost Engineer signed off
 *   • cancelled       — explicit cancel (requires reason)
 *   • rejected        — explicit reject (requires reason)
 *
 * Any user with the appropriate role can set the status to any value
 * via the dropdown — there's no state-graph restriction, only role
 * gates on the target.
 *
 * Back-compat: quotes saved with the v1 workflow stored
 *   status ∈ {'submitted', 'pending_sales', 'pending_finance', 'approved'}
 * Those values are heal-on-read mapped to the new statuses so the
 * inbox + history table keep working. Writes always use new names.
 *
 * Auth model (Henry's spec):
 *   - Hierarchical role (viewonly < user < cost < admin < sys) — cost
 *     and above can transition to ANY status.
 *   - approval_roles 'sales' (legacy 'sales_mgr' aliased) — additionally
 *     allows transition to price_approved / cancelled / rejected.
 *
 * Data model: each quote's `state.approval` object:
 *   {
 *     status,         // current state
 *     changed_at, changed_by,
 *     reason,         // present only for cancelled / rejected
 *     history: [{ ts, from, to, actor, reason? }]   // max 50 entries
 *   }
 *
 * Dropped from v1 (Phase 5 Pricing Snapshot covers what
 * `rates_snapshot` did):
 *   - sales_approved_at / sales_approved_by / finance_approved_at /
 *     finance_approved_by / approved_at / approved_by / submitted_at /
 *     submitted_by / rejected_stage / rates_snapshot
 *   The fields are tolerated on input (heal-on-read won't strip them)
 *   but never written by the new transition().
 *
 * Implementation: pure function `transition()` (kept name for callsite
 * compatibility — caller still passes { approval, action, actorUser,
 * reason } but `action` is now the target status string). Caller
 * persists the result.
 */

export const APPROVAL_STATES = [
  'draft',
  'quote_to_sale',
  'price_approved',
  'cancelled',
  'rejected',
];

const LEGACY_STATUS_ALIASES = {
  submitted: 'quote_to_sale',
  pending_sales: 'quote_to_sale',
  pending_finance: 'quote_to_sale',
  approved: 'price_approved',
};

const ROLE_LEVELS = { viewonly: 1, user: 2, cost: 3, admin: 4, sys: 5 };

const TARGET_AUTH = {
  draft: { min_role: 'cost' },
  quote_to_sale: { min_role: 'cost' },
  price_approved: { min_role: 'cost', sales_ok: true },
  cancelled: { min_role: 'cost', sales_ok: true, requires_reason: true },
  rejected: { min_role: 'cost', sales_ok: true, requires_reason: true },
};

const SALES_APPROVAL_ROLES = new Set(['sales', 'sales_mgr']);

function currentStatus(approval) {
  if (!approval || !approval.status) return 'draft';
  const raw = approval.status;
  if (LEGACY_STATUS_ALIASES[raw]) return LEGACY_STATUS_ALIASES[raw];
  return APPROVAL_STATES.includes(raw) ? raw : 'draft';
}

function describeRequirement(targetStatus) {
  const auth = TARGET_AUTH[targetStatus];
  if (!auth) return 'no one';
  const parts = [`role ${auth.min_role}+`];
  if (auth.sales_ok) parts.push(`approval_role=sales`);
  return parts.join(' OR ');
}

export function canUserSetStatus(user, targetStatus) {
  if (!user) return false;
  const auth = TARGET_AUTH[targetStatus];
  if (!auth) return false;
  const role = user.role || 'viewonly';
  const userLevel = ROLE_LEVELS[role] || 0;
  if (userLevel >= (ROLE_LEVELS[auth.min_role] || 999)) return true;
  if (auth.sales_ok) {
    const roles = Array.isArray(user.approval_roles) ? user.approval_roles : [];
    if (roles.some((r) => SALES_APPROVAL_ROLES.has(r))) return true;
  }
  return false;
}

/**
 * Pure state-machine tick. `action` here means "target status to set".
 * (Name kept for backward callsite compat — the route layer + tests
 * passed `action: 'SUBMIT'` etc. previously.) Returns `{ ok, approval }`
 * on success or `{ ok: false, error }` on invalid target / insufficient
 * role / missing reason for cancel|reject. Never mutates input.
 */
export function transition({ approval, action, actorUser, reason }) {
  const fromStatus = currentStatus(approval);
  const targetStatus = action;

  if (!APPROVAL_STATES.includes(targetStatus)) {
    return { ok: false, error: `Unknown target status: ${targetStatus}` };
  }
  if (fromStatus === targetStatus) {
    return { ok: false, error: `Status already ${targetStatus}` };
  }
  if (!canUserSetStatus(actorUser, targetStatus)) {
    return {
      ok: false,
      error: `User '${actorUser?.username || 'unknown'}' (role=${actorUser?.role || 'viewonly'}) cannot set status to ${targetStatus} — requires ${describeRequirement(targetStatus)}`,
    };
  }
  const auth = TARGET_AUTH[targetStatus];
  if (auth.requires_reason && (!reason || !String(reason).trim())) {
    return { ok: false, error: `Setting status to ${targetStatus} requires a non-empty reason` };
  }

  const nowISO = new Date().toISOString();
  const actor = actorUser?.username || 'unknown';
  const next = { ...(approval || {}), status: targetStatus };

  next.changed_at = nowISO;
  next.changed_by = actor;
  if (auth.requires_reason) next.reason = String(reason).trim();
  else delete next.reason;

  next.history = Array.isArray(approval?.history) ? approval.history.slice() : [];
  next.history.push({
    ts: nowISO,
    from: fromStatus,
    to: targetStatus,
    actor,
    ...(auth.requires_reason ? { reason: next.reason } : {}),
  });
  if (next.history.length > 50) next.history = next.history.slice(-50);

  return { ok: true, approval: next };
}

export function getStatus(approval) {
  return currentStatus(approval);
}

/**
 * Statuses the given user can set on the given quote right now.
 * Excludes the current status (no-op). Used by the dropdown UI to
 * decide which options to render or grey out.
 */
export function availableTargetStatuses(approval, user) {
  const current = currentStatus(approval);
  return APPROVAL_STATES.filter((s) => s !== current && canUserSetStatus(user, s));
}

/**
 * Sidebar inbox badge counter. In v1 this counted quotes "waiting for
 * the current user to advance the chain"; in the new flat model the
 * closest analog is "quotes in quote_to_sale that the current user can
 * approve" — i.e. the Sales-Team / Cost-Engineer review queue.
 *
 * Pure: no IO. Caller supplies the quote list already loaded.
 */
const ACTIONABLE_FROM = new Set(['quote_to_sale']);

export function countActionable(quotes, user) {
  if (!Array.isArray(quotes) || !user) return 0;
  let n = 0;
  for (const q of quotes) {
    // Sprint 1.7e — exclude soft-deleted quotes from the badge.
    if (q?.deleted_at) continue;
    const approval = q?.state?.approval;
    if (!ACTIONABLE_FROM.has(currentStatus(approval))) continue;
    if (canUserSetStatus(user, 'price_approved')) n++;
  }
  return n;
}
