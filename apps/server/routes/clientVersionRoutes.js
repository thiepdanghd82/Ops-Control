/**
 * Client version + client-originated audit emission.
 *
 * Two routes wired into server/index.js:
 *   GET  /api/version            — version probe used by <ClientUpdateIndicator>
 *   POST /api/audit/client-event — allowlisted audit emission from client
 *
 * Why these aren't inline in index.js: both have small surface, allow-list
 * logic, and need unit tests. Factory pattern (createXxxHandler) takes
 * collaborators so tests can mock audit/session without spinning a server.
 *
 * P0 — visibility only. No `downloads` field, no /downloads/ static serve,
 * no IPC openExternal. Banner instructs operator to contact Lead via Zalo.
 * P0.1 will add download self-serve once path-traversal review is done.
 */

/**
 * Hard-coded allowlist for client-originated audit events. ANY event
 * name outside this set is rejected with 400. Keep small — every entry
 * is a security decision (we're letting a logged-in client write to the
 * audit log, which is otherwise server-only).
 */
export const CLIENT_EVENT_ALLOWLIST = Object.freeze([
  'CLIENT_UPGRADE_NUDGE_SHOWN',
  'CLIENT_VERSION_MATCH_AFTER_UPGRADE',
]);

/**
 * GET /api/version
 *
 * Response shape:
 *   { version, min_supported_client, released_at }
 *
 * `min_supported_client` is informational at P0 (no enforcement). Field
 * is present so P1 can flip a flag without changing the API contract.
 *
 * `released_at` is the server boot time. Within a single version, a
 * restart will change it, but that's irrelevant to the banner — client
 * compares `version` only. Field is for operator-side diagnostics.
 *
 * @param {{ version: string, minSupportedClient: string, releasedAt: string }} opts
 */
export function createVersionHandler(opts) {
  const body = {
    version: opts.version,
    min_supported_client: opts.minSupportedClient,
    released_at: opts.releasedAt,
  };
  return (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(body);
  };
}

/**
 * POST /api/audit/client-event
 *
 * Body: { event: string, detail: object }
 *
 * Validates:
 *   - event ∈ CLIENT_EVENT_ALLOWLIST (else 400)
 *   - session is valid (else 401)
 *   - detail is a plain object (else 400)
 *
 * Emits via server-side `audit(event, user, ip, JSON.stringify(detail))`.
 * Detail JSON.stringify per Lesson FIX-3 (audit detail must be valid JSON
 * for json_extract filters in the audit-timeline reader).
 *
 * @param {{
 *   audit: (event: string, user: string, ip: string, detail: string) => void,
 *   getSessionUser: (token: string|null) => { username?: string }|null,
 *   getTokenFromHeader: (req: object) => string|null,
 * }} deps
 */
export function createClientEventHandler(deps) {
  const { audit, getSessionUser, getTokenFromHeader } = deps;
  return (req, res) => {
    const body = req.body || {};
    const event = body.event;
    const detail = body.detail;

    if (!CLIENT_EVENT_ALLOWLIST.includes(event)) {
      return res.status(400).json({ error: 'invalid_event' });
    }
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
      return res.status(400).json({ error: 'invalid_detail' });
    }

    const token = getTokenFromHeader(req);
    const user = token ? getSessionUser(token) : null;
    if (!user || !user.username) {
      return res.status(401).json({ error: 'unauthenticated' });
    }

    const ip = req.ip || '-';
    audit(event, user.username, ip, JSON.stringify(detail));
    res.status(204).end();
  };
}
