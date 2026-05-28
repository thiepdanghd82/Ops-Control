/**
 * chatMentions — Phase 10A.3 @mention parsing + body sanitization.
 *
 * Extracted so the logic is unit-testable without the router. Two
 * concerns:
 *
 *   1. parseMentions(body, users)
 *        Finds `@username` tokens, maps to user ids. Returns:
 *        { cleaned, mentionIds }. `cleaned` is the body with
 *        unresolvable mentions left intact (client renders as plain
 *        text); resolvable ones pass through too since the client
 *        renders them styled based on mentionIds.
 *
 *        Case-insensitive username match. Stops at whitespace,
 *        punctuation (except `-_`), or string end.
 *
 *   2. sanitizeChatBody(raw)
 *        - Strips HTML tags (React escapes too but defense-in-depth)
 *        - Strips null bytes + ANSI escapes (log injection)
 *        - Normalizes CRLF → LF
 *        - Collapses > 1000 chars to 1000 (cap — anything longer is
 *          pasted garbage, not a real message)
 *        - Trims leading/trailing whitespace
 */

// @username = starts with @, then [A-Za-z0-9._-] until a non-match char.
// The capture group isolates the username part so we can look it up.
const MENTION_RE = /@([A-Za-z0-9._-]+)/g;
const MAX_BODY_LEN = 1000;

export function parseMentions(body, users) {
  if (!body || typeof body !== 'string') return { cleaned: '', mentionIds: [] };
  const byName = new Map();
  for (const u of users || []) {
    if (u && u.username) byName.set(String(u.username).toLowerCase(), u.id);
  }
  const ids = new Set();
  // Use replace to iterate matches; we don't actually rewrite the body
  // (the client renders mentions from the separate ids array).
  body.replace(MENTION_RE, (_m, name) => {
    const uid = byName.get(String(name).toLowerCase());
    if (uid != null) ids.add(uid);
    return '';
  });
  return { cleaned: body, mentionIds: [...ids] };
}

export function sanitizeChatBody(raw) {
  if (raw == null) return '';
  let s = String(raw);
  s = s.replace(/<[^>]*>/g, '');
  // eslint-disable-next-line no-control-regex -- intentional null-byte strip for security
  s = s.replace(/\u0000/g, '');
  // eslint-disable-next-line no-control-regex -- intentional: strip ANSI esc
  s = s.replace(/\u001b\[[0-9;]*m/g, '');
  s = s.replace(/\r\n?/g, '\n');
  if (s.length > MAX_BODY_LEN) s = s.slice(0, MAX_BODY_LEN);
  return s.trim();
}
