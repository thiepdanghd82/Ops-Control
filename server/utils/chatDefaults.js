/**
 * chatDefaults — pure helpers for default chat-room provisioning.
 *
 * Split out of server/routes/chat.js so the role-normalization +
 * cap logic can be unit-tested without mounting Express or touching
 * the chat schema. The route file imports this and runs the returned
 * list through getOrCreateRoom() / addMember().
 */

// Hard cap on how many approval_roles we auto-provision rooms for.
// Defends against a malicious/misconfigured user record with 1000+
// roles bloating the rooms table on every /rooms fetch. Real users
// have at most ~10 roles; 50 is a generous ceiling.
export const MAX_DEFAULT_ROOMS_PER_USER = 50;

/**
 * Normalize a user's approval_roles into the list of roles we'll
 * actually provision rooms for. Rules:
 *   - Non-array inputs → empty list.
 *   - Non-string / empty-string entries removed.
 *   - Duplicates removed (first occurrence wins — insertion order
 *     preserved so related entries land in a predictable order).
 *   - Capped at MAX_DEFAULT_ROOMS_PER_USER.
 *
 * Returns `{ roles, truncated }`. Callers log when truncated so ops
 * can spot config drift.
 *
 * @param {unknown} rawRoles
 * @returns {{ roles: string[], truncated: boolean }}
 */
export function normalizeApprovalRoles(rawRoles) {
  const arr = Array.isArray(rawRoles) ? rawRoles : [];
  const unique = [...new Set(arr.filter((r) => typeof r === 'string' && r.length > 0))];
  const truncated = unique.length > MAX_DEFAULT_ROOMS_PER_USER;
  const roles = truncated ? unique.slice(0, MAX_DEFAULT_ROOMS_PER_USER) : unique;
  return { roles, truncated };
}
