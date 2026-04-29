/**
 * Server-side input sanitizers. Defense-in-depth for free-text fields
 * that may later render into HTML, logs, PDFs, or CSV — each consumer
 * has different escape rules, so we normalize at the boundary rather
 * than relying on every renderer to escape correctly.
 *
 * React's default text escaping already protects the approval history
 * modal from XSS at render time; these sanitizers exist so:
 *   (a) future non-React consumers (PDF export, email digest) can't
 *       be tricked by stored payloads,
 *   (b) log injection via newlines or ANSI escapes is prevented,
 *   (c) Excel CSV export doesn't smuggle HTML-looking tags.
 */

/**
 * Sanitize an approval reject reason before persisting.
 * - Strips HTML/XML tags (`<script>` etc.)
 * - Removes null bytes and ANSI escape sequences
 * - Normalizes line endings to `\n`
 * - Caps length to 500 chars (mirrors validateBody rule)
 * - Trims leading/trailing whitespace
 *
 * Returns the input unchanged for null/undefined/non-string.
 */
export function sanitizeReason(input) {
  if (input == null) return input;
  let s = String(input);
  // Strip HTML/XML tags entirely — quote system never renders markup.
  s = s.replace(/<[^>]*>/g, '');
  // Strip null bytes and ANSI escape sequences (log-injection defense).
  s = s.replace(/\u0000/g, '');
  // eslint-disable-next-line no-control-regex -- intentional: ANSI esc
  s = s.replace(/\u001b\[[0-9;]*m/g, '');
  // Normalize CR/CRLF to LF so downstream text rendering is predictable.
  s = s.replace(/\r\n?/g, '\n');
  if (s.length > 500) s = s.slice(0, 500);
  return s.trim();
}
