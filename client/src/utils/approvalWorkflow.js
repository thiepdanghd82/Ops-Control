/**
 * Client-side mirror of the approval state machine. Kept in sync with
 * `server/repositories/approvalWorkflow.js`. Both files share:
 *   - the list of states + legacy `submitted` alias
 *   - the transition table
 *   - the role authorization rules
 *
 * Rationale: the server remains the authority (the atomic transition
 * endpoint is what actually mutates state). Client-side logic is only
 * used to decide which buttons to show — so the user doesn't click a
 * button they can't use, and doesn't get a server-side 400 shown as a
 * toast. If this file drifts from the server the worst case is an
 * extra round-trip + a rejected button click; the state machine on
 * the server is still the source of truth.
 *
 * Sprint 6.3.
 */

export const APPROVAL_STATES = [
  'draft',
  'pending_sales',
  'pending_finance',
  'approved',
  'rejected',
];

const LEGACY_STATUS_ALIASES = { submitted: 'pending_sales' };

const TRANSITIONS = {
  draft: { SUBMIT: 'pending_sales' },
  pending_sales: { APPROVE_SALES: 'pending_finance', REJECT: 'rejected' },
  pending_finance: { APPROVE_FINANCE: 'approved', REJECT: 'rejected' },
  approved: { REVOKE: 'draft' },
  rejected: { SUBMIT: 'pending_sales' },
};

const ROLE_LEVELS = { viewonly: 1, user: 2, cost: 3, admin: 4, sys: 5 };

const REQUIRED_ROLE_FOR_ACTION = { SUBMIT: 'user', REVOKE: 'sys' };

const APPROVAL_AUTH = {
  APPROVE_SALES: { approval_role: 'sales_mgr', fallback_role: 'admin' },
  APPROVE_FINANCE: { approval_role: 'finance_dir', fallback_role: 'admin' },
  REJECT: { approval_role: ['sales_mgr', 'finance_dir'], fallback_role: 'admin' },
};

export function getStatus(approval) {
  if (!approval || !approval.status) return 'draft';
  const s = approval.status;
  if (LEGACY_STATUS_ALIASES[s]) return LEGACY_STATUS_ALIASES[s];
  return APPROVAL_STATES.includes(s) ? s : 'draft';
}

function canUserTakeAction(user, action) {
  if (!user) return false;
  const role = user.role || 'viewonly';
  const userLevel = ROLE_LEVELS[role] || 0;
  const approvalRoles = Array.isArray(user.approval_roles) ? user.approval_roles : [];

  const hier = REQUIRED_ROLE_FOR_ACTION[action];
  if (hier) return userLevel >= (ROLE_LEVELS[hier] || 999);

  const auth = APPROVAL_AUTH[action];
  if (!auth) return false;
  const fallbackLevel = ROLE_LEVELS[auth.fallback_role] || 999;
  if (userLevel >= fallbackLevel) return true;
  const needed = Array.isArray(auth.approval_role) ? auth.approval_role : [auth.approval_role];
  return needed.some((r) => approvalRoles.includes(r));
}

/**
 * Which actions can `user` legally invoke on `approval` right now?
 * Returns actions in workflow-progression order so buttons render
 * primary-first (SUBMIT/APPROVE) then destructive (REJECT).
 */
export function availableActions(approval, user) {
  const status = getStatus(approval);
  const possible = Object.keys(TRANSITIONS[status] || {});
  return possible.filter((a) => canUserTakeAction(user, a));
}

// ── Presentation helpers ──────────────────────────────────────────────

/**
 * Status → { label, tone } for use with <StatusBadge>. Tones map to
 * the existing Carbon palette already in StatusBadge.jsx.
 */
export function statusDisplay(status) {
  const s = LEGACY_STATUS_ALIASES[status] || status || 'draft';
  switch (s) {
    case 'draft':
      return { label: 'Draft', tone: 'neutral' };
    case 'pending_sales':
      return { label: 'Pending Sales', tone: 'warning' };
    case 'pending_finance':
      return { label: 'Pending Finance', tone: 'info' };
    case 'approved':
      return { label: 'Approved', tone: 'success' };
    case 'rejected':
      return { label: 'Rejected', tone: 'danger' };
    default:
      return { label: s, tone: 'neutral' };
  }
}

/**
 * Action → { label, tone } for button rendering. 'primary' means
 * forward-progress (advance the chain), 'danger' = REJECT, 'ghost' =
 * REVOKE (sys escape hatch).
 */
export function actionDisplay(action) {
  switch (action) {
    case 'SUBMIT':
      return { label: 'Submit', tone: 'primary' };
    case 'APPROVE_SALES':
      return { label: 'Approve (Sales)', tone: 'primary' };
    case 'APPROVE_FINANCE':
      return { label: 'Approve (Finance)', tone: 'primary' };
    case 'REJECT':
      return { label: 'Reject', tone: 'danger' };
    case 'REVOKE':
      return { label: 'Revoke', tone: 'ghost' };
    default:
      return { label: action, tone: 'ghost' };
  }
}
