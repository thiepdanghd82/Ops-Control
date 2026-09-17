// @ts-check
/**
 * Pure gating rules for per-message actions in the Messages tab.
 *
 * Extracted rather than inlined in JSX so the rules can carry tests:
 * this repo runs vanilla `node:test` with no React testing infra, so
 * anything worth asserting has to live outside a component. Same
 * pattern as `CalcLeadTimeNotice.helpers.js` and
 * `loginChangePwdDispatcher.js`.
 *
 * These rules MIRROR the server — `chatStore.deleteMessage` checks
 * authorship, rejects an already-tombstoned row, and enforces
 * `EDIT_WINDOW_MS`. The button is a courtesy, NOT the gate: the server
 * refuses regardless of what the UI renders. They are duplicated here
 * only so the operator doesn't get offered an action that will answer
 * 403 or 409. If the server window moves, move this constant with it.
 */

/** Must equal `EDIT_WINDOW_MS` in `server/repositories/chatStore.js`. */
export const DELETE_WINDOW_MS = 15 * 60 * 1000;

/**
 * May the viewer soft-delete (recall) this message right now?
 *
 * @param {{author_id?: unknown, created_at?: unknown, deleted_at?: unknown}|null|undefined} msg
 * @param {unknown} meId    viewing user's id
 * @param {number} [nowMs]  injectable clock so tests don't depend on wall time
 * @returns {boolean}
 */
export function canDeleteMessage(msg, meId, nowMs = Date.now()) {
  if (!msg) return false;
  // A tombstone is already deleted — offering it again would earn a 410.
  if (msg.deleted_at) return false;
  // Explicit null/undefined guard BEFORE Number(): `Number(null)` is 0,
  // so a message with no author and a viewer with no id would otherwise
  // compare equal and hand a delete button to a stranger.
  if (msg.author_id == null || meId == null) return false;
  if (Number(msg.author_id) !== Number(meId)) return false;
  const created = Date.parse(String(msg.created_at ?? ''));
  if (!Number.isFinite(created)) return false;
  return nowMs - created < DELETE_WINDOW_MS;
}
