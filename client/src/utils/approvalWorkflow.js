/**
 * Client-side mirror of the quote-progress state machine. Kept in sync
 * with `server/repositories/approvalWorkflow.js`. Server remains the
 * authority (the atomic /transition endpoint mutates state); this file
 * exists so the dropdown can grey out options the user can't pick
 * without round-tripping to the server.
 *
 * Sprint S-QUOTE-PROGRESS-V2 (2026-06-15) — rewrite for the simpler
 * Henry-confirmed 5-state model. The v1 5-state 2-gate workflow
 * (draft → pending_sales → pending_finance → approved | rejected)
 * is gone. The new model is a flat set of statuses, user picks any
 * via dropdown:
 *
 *   • draft           — initial state, work-in-progress
 *   • quote_to_sale   — sent to Sales for review
 *   • price_approved  — Sales / Cost Engineer signed off
 *   • cancelled       — explicit cancel by operator (requires reason)
 *   • rejected        — explicit reject by operator (requires reason)
 *
 * Legacy v1 states (`pending_sales`, `pending_finance`, `submitted`,
 * `approved`) are heal-on-read mapped on getStatus so existing quote
 * data renders correctly under the new badges + dropdown.
 *
 * Authorization (Henry's spec):
 *   - Cost Engineer / Admin / Sys: can set any of the 5 statuses
 *   - Sales Team (approval_roles: 'sales' OR legacy 'sales_mgr'):
 *     additionally can set price_approved / cancelled / rejected
 *   - Anyone else: cannot change status
 *
 * `rates_snapshot` (v1 Finance-SGA freeze at APPROVE_FINANCE) was
 * dropped — Phase 5 Pricing Snapshot already freezes the whole
 * pricing basis on every Save (much broader coverage).
 */

export const APPROVAL_STATES = [
  'draft',
  'quote_to_sale',
  'price_approved',
  'cancelled',
  'rejected',
];

// v1 → v2 read-time aliases. Old quotes carrying these statuses get
// silently mapped to the new model so the UI renders correctly. Writes
// always use the new status values.
const LEGACY_STATUS_ALIASES = {
  submitted: 'quote_to_sale',
  pending_sales: 'quote_to_sale',
  pending_finance: 'quote_to_sale',
  approved: 'price_approved',
};

const ROLE_LEVELS = { viewonly: 1, user: 2, cost: 3, admin: 4, sys: 5 };

// Per-target-state auth. Every transition is "set status to X"; whether
// the user is allowed depends on the target. `min_role` = hierarchical
// floor (cost+). `sales_ok` = users with the Sales approval role can
// also reach this state. `requires_reason` = the cancel/reject reason
// modal must be filled.
const TARGET_AUTH = {
  draft: { min_role: 'cost' },
  quote_to_sale: { min_role: 'cost' },
  price_approved: { min_role: 'cost', sales_ok: true },
  cancelled: { min_role: 'cost', sales_ok: true, requires_reason: true },
  rejected: { min_role: 'cost', sales_ok: true, requires_reason: true },
};

const SALES_APPROVAL_ROLES = new Set(['sales', 'sales_mgr']);

export function getStatus(approval) {
  if (!approval || !approval.status) return 'draft';
  const s = approval.status;
  if (LEGACY_STATUS_ALIASES[s]) return LEGACY_STATUS_ALIASES[s];
  return APPROVAL_STATES.includes(s) ? s : 'draft';
}

export function statusRequiresReason(status) {
  return Boolean(TARGET_AUTH[status]?.requires_reason);
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
 * Which target statuses can `user` legally choose right now?
 * Returns the canonical 5 in dropdown-order (draft → … → rejected),
 * filtered by per-status auth. Excludes the current status (no-op
 * transitions are pointless).
 */
export function availableTargetStatuses(approval, user) {
  const current = getStatus(approval);
  return APPROVAL_STATES.filter((s) => s !== current && canUserSetStatus(user, s));
}

// ── Presentation helpers ──────────────────────────────────────────────

/**
 * Status → { label, tone } for use with <StatusBadge>. Tones map to
 * the existing Carbon palette in StatusBadge.jsx.
 */
export function statusDisplay(status) {
  const s = LEGACY_STATUS_ALIASES[status] || status || 'draft';
  switch (s) {
    case 'draft':
      return { label: 'Draft', tone: 'neutral' };
    case 'quote_to_sale':
      return { label: 'Quote to sale', tone: 'info' };
    case 'price_approved':
      return { label: 'Price Approved', tone: 'success' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'warning' };
    case 'rejected':
      return { label: 'Rejected', tone: 'danger' };
    default:
      return { label: s, tone: 'neutral' };
  }
}
