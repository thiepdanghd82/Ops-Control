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
 * These rules MIRROR the server — `chatStore.deleteMessage` allows the
 * author, or an admin who is a member of the room, with no time limit.
 * The button is a courtesy, NOT the gate: the server refuses regardless
 * of what the UI renders.
 *
 * The membership half has no client equivalent on purpose. Reading a
 * room is already gated (`GET /rooms/:id/messages` answers 403 to a
 * non-member), so any message on screen is in a room this viewer
 * belongs to — membership is implied by the message being renderable,
 * and re-deriving it here would only be able to get it wrong.
 */

/**
 * May the viewer recall (soft-delete) this message?
 *
 * There is deliberately no time limit — see the note in
 * `chatStore.deleteMessage`. `editMessage` and `purgeMessage` keep
 * their 15-minute windows; neither is reachable from this tab.
 *
 * @param {{author_id?: unknown, deleted_at?: unknown}|null|undefined} msg
 * @param {unknown} meId              viewing user's id
 * @param {{isAdmin?: boolean}} [opts] isAdmin: viewer is admin or sys
 * @returns {boolean}
 */
export function canDeleteMessage(msg, meId, opts = {}) {
  if (!msg) return false;
  // A tombstone is already deleted — offering it again would earn a 410.
  if (msg.deleted_at) return false;
  if (meId == null) return false;
  // Explicit null guard BEFORE Number(): `Number(null)` is 0, so a
  // message with no author and a viewer with no id would otherwise
  // compare equal and hand a delete button to a stranger.
  if (msg.author_id == null) return false;
  if (Number(msg.author_id) === Number(meId)) return true;
  return opts.isAdmin === true;
}

/**
 * Is this recall an admin acting on someone else's message? Drives the
 * confirm wording — "unsend yours" and "remove another person's" are
 * different enough acts that one sentence cannot honestly cover both.
 *
 * @param {{author_id?: unknown}|null|undefined} msg
 * @param {unknown} meId
 * @returns {boolean}
 */
export function isAdminOverride(msg, meId) {
  if (!msg || msg.author_id == null || meId == null) return false;
  return Number(msg.author_id) !== Number(meId);
}
